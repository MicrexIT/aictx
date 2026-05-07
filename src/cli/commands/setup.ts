import { CommanderError, type Command } from "commander";

import {
  checkProject,
  diffMemory,
  initProject,
  saveMemoryPatch,
  suggestMemory,
  type AppResult,
  type CheckProjectData,
  type DiffMemoryData,
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
  view?: boolean;
  open?: boolean;
}

interface SetupPatchSummary {
  operations: string[];
  memory_ids: ObjectId[];
  relation_ids: RelationId[];
}

interface SetupData {
  initialized: boolean;
  bootstrap_patch_proposed: boolean;
  bootstrap_patch_applied: boolean;
  bootstrap_reason: string | null;
  bootstrap_summary: SetupPatchSummary;
  save: SaveMemoryData | null;
  check: CheckProjectData;
  diff: DiffMemoryData | null;
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
    .option("--apply", "Apply the conservative bootstrap memory patch.")
    .option("--view", "Print the viewer command to run after setup.")
    .option("--open", "Use with --view to open the viewer after setup.")
    .action(async (flags: SetupCommandFlags, command: Command) => {
      const result = await runSetup(options.cwd, flags, options.detacher);
      const rendered = renderAppResult(result, {
        json: isJsonMode(command),
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
  viewerDetacher: ViewerDetacher | undefined
): Promise<AppResult<SetupData>> {
  const initialized = await initProject({
    cwd,
    force: flags.force === true
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

  if (flags.apply === true && proposal.proposed && proposal.patch !== null) {
    const saved = await saveMemoryPatch({
      cwd,
      patch: proposal.patch
    });

    if (!saved.ok) {
      return saved;
    }

    save = saved.data;
  }

  const checked = await checkProject({ cwd });

  if (!checked.ok) {
    return checked;
  }

  const diffed = await diffMemory({ cwd });
  const diff = diffed.ok ? diffed.data : null;
  const viewer = await maybeStartViewer(flags, viewerDetacher);
  const warnings = [
    ...initialized.warnings,
    ...suggested.warnings,
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
      bootstrap_patch_proposed: proposal.proposed,
      bootstrap_patch_applied: save !== null,
      bootstrap_reason: proposal.reason,
      bootstrap_summary: summary,
      save,
      check: checked.data,
      diff,
      viewer_url: viewer.data?.url ?? null,
      viewer_log_path: viewer.data?.log_path ?? null,
      next_step:
        save === null && proposal.proposed
          ? "Run `aictx setup --apply` to apply the proposed bootstrap memory patch."
          : save !== null
            ? 'Run `aictx load "onboard to this repository"` to see the first task-focused memory pack.'
            : "No bootstrap memory patch to apply."
    },
    warnings,
    meta: checked.meta
  };
}

async function maybeStartViewer(
  flags: SetupCommandFlags,
  viewerDetacher: ViewerDetacher | undefined
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
  if (flags.view !== true) {
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
    `Initialized: ${data.initialized ? "yes" : "already initialized"}`,
    data.bootstrap_patch_proposed
      ? "Bootstrap patch: proposed"
      : `Bootstrap patch: not proposed${data.bootstrap_reason === null ? "" : ` (${data.bootstrap_reason})`}`,
    `Bootstrap patch applied: ${data.bootstrap_patch_applied ? "yes" : "no"}`,
    ...renderList("Patch operations", data.bootstrap_summary.operations),
    ...renderList("Patch memory IDs", data.bootstrap_summary.memory_ids),
    `Check: ${data.check.valid ? "passed" : "failed"}`,
    ...(data.diff === null ? [] : [`Aictx diff files changed: ${data.diff.changed_files.length}`]),
    ...(data.viewer_url === null ? [] : [`Aictx viewer: ${data.viewer_url}`]),
    ...(data.viewer_log_path === null ? [] : [`Aictx viewer log: ${data.viewer_log_path}`]),
    ...(data.next_step === null ? [] : [`Next: ${data.next_step}`])
  ].join("\n");
}

function renderList(label: string, values: readonly string[]): string[] {
  return values.length === 0 ? [] : [`${label}:`, ...values.map((value) => `- ${value}`)];
}

function isJsonMode(command: Command): boolean {
  const options = command.optsWithGlobals() as { json?: unknown };
  return options.json === true;
}
