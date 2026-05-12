import { CommanderError, type Command } from "commander";

import {
  checkProject,
  diffMemory,
  getRoleCoverage,
  initProject,
  previewSetupBootstrap,
  saveMemoryPatch,
  suggestMemory,
  type AppResult,
  type CheckProjectData,
  type DiffMemoryData,
  type RoleCoverageResultData,
  type SaveMemoryData
} from "../../app/operations.js";
import type { AictxError } from "../../core/errors.js";
import type { ObjectId, RelationId } from "../../core/types.js";
import type { SuggestBootstrapPatchProposal } from "../../discipline/suggest.js";
import { CLI_EXIT_SUCCESS } from "../exit.js";
import { renderAppResult } from "../render.js";
import {
  detachViewer,
  type DetachedViewer,
  type ViewerDetacher
} from "./view.js";

type CliOutputWriter = (text: string) => void;

export interface RegisterSetupCommandOptions {
  cwd: string;
  stdout: CliOutputWriter;
  stderr: CliOutputWriter;
  detacher?: ViewerDetacher;
}

interface SetupCommandFlags {
  force?: boolean;
  apply?: boolean;
  dryRun?: boolean;
  view?: boolean;
  open?: boolean;
}

interface RunSetupOptions {
  json: boolean;
}

interface SetupPatchSummary {
  operations: string[];
  memory_ids: ObjectId[];
  relation_ids: RelationId[];
}

interface SetupData {
  initialized: boolean;
  would_initialize: boolean;
  force_preview: boolean;
  dry_run: boolean;
  bootstrap_patch_proposed: boolean;
  bootstrap_patch_applied: boolean;
  bootstrap_reason: string | null;
  bootstrap_summary: SetupPatchSummary;
  save: SaveMemoryData | null;
  check: CheckProjectData | null;
  check_skipped_reason: string | null;
  role_coverage: RoleCoverageResultData["role_coverage"];
  diff: DiffMemoryData | null;
  diff_skipped_reason: string | null;
  viewer_url: string | null;
  viewer_log_path: string | null;
  next_step: string | null;
}

export function registerSetupCommand(
  program: Command,
  options: RegisterSetupCommandOptions
): void {
  program
    .command("setup")
    .description("Run the guided first-run Aictx setup workflow.")
    .option("--force", "Discard existing Aictx state before setup.")
    .option("--apply", "Apply the conservative bootstrap memory patch (accepted for compatibility; setup applies by default).")
    .option("--dry-run", "Preview setup role coverage and bootstrap patch without initializing storage or writing repo files.")
    .option("--view", "Start the local viewer after setup (default for human output).")
    .option("--no-view", "Skip local viewer startup after setup.")
    .option("--open", "Open the viewer in the default browser after setup.")
    .action(async (flags: SetupCommandFlags, command: Command) => {
      const json = isJsonMode(command);
      const result = await runSetup(options.cwd, flags, options.detacher, { json });
      const rendered = renderAppResult(result, {
        json,
        renderData: renderSetupData
      });

      options.stdout(rendered.stdout);
      options.stderr(rendered.stderr);

      if (rendered.exitCode !== CLI_EXIT_SUCCESS) {
        throw new CommanderError(
          rendered.exitCode,
          "aictx.command.failed",
          "Aictx command failed."
        );
      }
    });
}

async function runSetup(
  cwd: string,
  flags: SetupCommandFlags,
  viewerDetacher: ViewerDetacher | undefined,
  options: RunSetupOptions
): Promise<AppResult<SetupData>> {
  if (flags.dryRun === true) {
    return runSetupDryRun(cwd, flags);
  }

  const initialized = await initProject({
    cwd,
    force: flags.force === true,
    allowTrackedAictxDeletions: true
  });

  if (!initialized.ok) {
    return initialized;
  }

  const suggested = await suggestMemory({
    cwd,
    bootstrap: true,
    patch: true
  });

  if (!suggested.ok) {
    return suggested;
  }

  const proposal = suggested.data as SuggestBootstrapPatchProposal;
  const summary = patchSummary(proposal);
  let save: SaveMemoryData | null = null;

  if (proposal.proposed && proposal.patch !== null) {
    const saved = await saveMemoryPatch({
      cwd,
      patch: proposal.patch
    });

    if (!saved.ok) {
      return saved;
    }

    save = saved.data;
  }

  const covered = await getRoleCoverage({ cwd });

  if (!covered.ok) {
    return covered;
  }

  const checked = await checkProject({ cwd });

  if (!checked.ok) {
    return checked;
  }

  const diffed = await diffMemory({ cwd });
  const diff = diffed.ok ? diffed.data : null;
  const viewer = await maybeStartViewer(flags, viewerDetacher, options);
  const warnings = [
    ...initialized.warnings,
    ...suggested.warnings,
    ...covered.warnings,
    ...checked.warnings,
    ...(diffed.ok ? diffed.warnings : []),
    ...(viewer.ok ? viewer.warnings : [])
  ];

  if (!viewer.ok) {
    return {
      ok: false,
      error: viewer.error,
      warnings,
      meta: checked.meta
    };
  }

  return {
    ok: true,
    data: {
      initialized: initialized.data.created,
      would_initialize: initialized.data.created,
      force_preview: false,
      dry_run: false,
      bootstrap_patch_proposed: proposal.proposed,
      bootstrap_patch_applied: save !== null,
      bootstrap_reason: proposal.reason,
      bootstrap_summary: summary,
      save,
      check: checked.data,
      check_skipped_reason: null,
      role_coverage: covered.data.role_coverage,
      diff,
      diff_skipped_reason: diffed.ok ? null : diffed.error.message,
      viewer_url: viewer.data?.url ?? null,
      viewer_log_path: viewer.data?.log_path ?? null,
      next_step:
        save !== null
          ? "Run `aictx lens project-map` for a readable project view, or `aictx load \"onboard to this repository\"` for task-focused context."
          : "No bootstrap memory patch to apply."
    },
    warnings,
    meta: checked.meta
  };
}

async function runSetupDryRun(
  cwd: string,
  flags: SetupCommandFlags
): Promise<AppResult<SetupData>> {
  const preview = await previewSetupBootstrap({
    cwd,
    force: flags.force === true
  });

  if (!preview.ok) {
    return preview;
  }

  const proposal = preview.data.proposal;
  const summary = patchSummary(proposal);
  const checkSkippedReason =
    "Dry run did not write storage; run `aictx setup` before checking the result.";
  const diffSkippedReason =
    "Dry run did not write storage; no Aictx diff was produced.";
  const viewerWarning = isViewerExplicitlyRequested(flags)
    ? [
        "Viewer startup skipped because setup --dry-run does not write storage. Run `aictx setup` to start the viewer after applying setup."
      ]
    : [];

  return {
    ok: true,
    data: {
      initialized: preview.data.initialized,
      would_initialize: preview.data.would_initialize,
      force_preview: preview.data.force_preview,
      dry_run: true,
      bootstrap_patch_proposed: proposal.proposed,
      bootstrap_patch_applied: false,
      bootstrap_reason: proposal.reason,
      bootstrap_summary: summary,
      save: null,
      check: null,
      check_skipped_reason: checkSkippedReason,
      role_coverage: preview.data.role_coverage,
      diff: null,
      diff_skipped_reason: diffSkippedReason,
      viewer_url: null,
      viewer_log_path: null,
      next_step: proposal.proposed
        ? "Run `aictx setup` to apply the proposed bootstrap memory patch."
        : "No bootstrap memory patch to apply."
    },
    warnings: [...preview.warnings, ...viewerWarning],
    meta: preview.meta
  };
}

async function maybeStartViewer(
  flags: SetupCommandFlags,
  viewerDetacher: ViewerDetacher | undefined,
  options: RunSetupOptions
): Promise<
  | {
      ok: true;
      data: DetachedViewer | null;
      warnings: string[];
    }
  | {
      ok: false;
      error: AictxError;
      warnings: string[];
    }
> {
  if (!shouldStartViewer(flags, options)) {
    return {
      ok: true,
      data: null,
      warnings: []
    };
  }

  return detachViewer(
    {
      open: flags.open === true
    },
    viewerDetacher
  );
}

function shouldStartViewer(flags: SetupCommandFlags, options: RunSetupOptions): boolean {
  if (flags.view === false) {
    return false;
  }

  return flags.view === true || flags.open === true || !options.json;
}

function isViewerExplicitlyRequested(flags: SetupCommandFlags): boolean {
  return flags.view === true || flags.open === true;
}

function patchSummary(proposal: SuggestBootstrapPatchProposal): SetupPatchSummary {
  const changes = proposal.patch?.changes ?? [];

  return {
    operations: [...new Set(changes.map((change) => change.op))].sort(),
    memory_ids: changes
      .flatMap((change) =>
        change.op === "create_object" || change.op === "update_object" ? [change.id] : []
      )
      .sort() as ObjectId[],
    relation_ids: changes
      .flatMap((change) =>
        change.op === "create_relation" && typeof change.id === "string" ? [change.id] : []
      )
      .sort() as RelationId[]
  };
}

function renderSetupData(data: SetupData): string {
  return [
    "Aictx setup complete.",
    `Initialized: ${renderInitialized(data)}`,
    `Dry run: ${data.dry_run ? "yes" : "no"}`,
    `Would initialize storage: ${data.would_initialize ? "yes" : "no"}`,
    ...(data.force_preview ? ["Force preview: yes"] : []),
    data.bootstrap_patch_proposed
      ? "Bootstrap patch: proposed"
      : `Bootstrap patch: not proposed${data.bootstrap_reason === null ? "" : ` (${data.bootstrap_reason})`}`,
    `Bootstrap patch applied: ${data.bootstrap_patch_applied ? "yes" : "no"}`,
    ...renderList("Patch operations", data.bootstrap_summary.operations),
    ...renderList("Patch memory IDs", data.bootstrap_summary.memory_ids),
    ...renderRoleCoverage(data.role_coverage),
    data.check === null
      ? `Check: skipped${data.check_skipped_reason === null ? "" : ` (${data.check_skipped_reason})`}`
      : `Check: ${data.check.valid ? "passed" : "failed"}`,
    ...(data.diff === null
      ? data.diff_skipped_reason === null
        ? []
        : [`Aictx diff: skipped (${data.diff_skipped_reason})`]
      : [`Aictx diff files changed: ${data.diff.changed_files.length}`]),
    ...(data.viewer_url === null ? [] : [`Aictx viewer: ${data.viewer_url}`]),
    ...(data.viewer_log_path === null ? [] : [`Aictx viewer log: ${data.viewer_log_path}`]),
    ...(data.next_step === null ? [] : [`Next: ${data.next_step}`])
  ].join("\n");
}

function renderInitialized(data: SetupData): string {
  if (data.initialized) {
    return "yes";
  }

  return data.dry_run ? "no" : "already initialized";
}

function renderRoleCoverage(data: SetupData["role_coverage"]): string[] {
  return [
    "Role coverage:",
    ...data.roles.map(
      (role) => `- ${role.label}: ${role.status}${role.optional ? " (optional)" : ""}`
    )
  ];
}

function renderList(label: string, values: readonly string[]): string[] {
  return values.length === 0 ? [] : [`${label}:`, ...values.map((value) => `- ${value}`)];
}

function isJsonMode(command: Command): boolean {
  const options = command.optsWithGlobals() as { json?: unknown };
  return options.json === true;
}
