import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { CommanderError, type Command } from "commander";

import { systemClock } from "../../core/clock.js";
import { memoryError } from "../../core/errors.js";
import { getGitState } from "../../core/git.js";
import { resolveProjectPaths } from "../../core/paths.js";
import type { MemoryMeta, ObjectId, RelationId } from "../../core/types.js";
import { planMemoryPatch } from "../../storage/patch.js";
import { detectSecretsInPatch } from "../../validation/secrets.js";
import {
  CLI_EXIT_SUCCESS,
  CLI_EXIT_USAGE,
  type CliExitCode
} from "../exit.js";
import { renderAppResult } from "../render.js";

type CliOutputWriter = (text: string) => void;

export interface RegisterPatchCommandOptions {
  cwd: string;
  stdout: CliOutputWriter;
  stderr: CliOutputWriter;
}

interface PatchReviewData {
  proposed: boolean;
  reason: string | null;
  operations: string[];
  memory_ids: ObjectId[];
  relation_ids: RelationId[];
  touched_files: string[];
  likely_dirty_overwrites: string[];
  recovery_files: string[];
  validation_findings: string[];
  secret_findings: string[];
}

export function registerPatchCommand(
  program: Command,
  options: RegisterPatchCommandOptions
): void {
  const patch = program.command("patch").description("Review structured Memory patch files.");

  patch
    .command("review <file>")
    .description("Review a structured memory patch without writing it.")
    .action(async (file: string, _flags: unknown, command: Command) => {
      const result = await reviewPatchFile(options.cwd, file);
      const rendered = renderAppResult(result, {
        json: isJsonMode(command),
        renderData: renderPatchReviewData
      });

      options.stdout(rendered.stdout);
      options.stderr(rendered.stderr);

      if (rendered.exitCode !== CLI_EXIT_SUCCESS) {
        throw new CommanderError(
          rendered.exitCode,
          "memory.command.failed",
          "Memory command failed."
        );
      }
    });
}

async function reviewPatchFile(cwd: string, file: string) {
  const patch = await readPatchFile(cwd, file);

  if (!patch.ok) {
    return patch;
  }

  if (isNoPatchProposal(patch.data)) {
    return {
      ok: true as const,
      data: emptyReview(false, patch.data.reason),
      warnings: [],
      meta: fallbackMeta(cwd)
    };
  }

  const paths = await resolveProjectPaths({
    cwd,
    mode: "require-initialized"
  });

  if (!paths.ok) {
    return {
      ok: false as const,
      error: paths.error,
      warnings: paths.warnings,
      meta: fallbackMeta(cwd)
    };
  }

  const git = await getGitState(paths.data.projectRoot);

  if (!git.ok) {
    return {
      ok: false as const,
      error: git.error,
      warnings: git.warnings,
      meta: fallbackMeta(cwd)
    };
  }

  const meta: MemoryMeta = {
    project_root: paths.data.projectRoot,
    memory_root: paths.data.memoryRoot,
    git: git.data
  };
  const secrets = detectSecretsInPatch(patch.data);
  const planned = await planMemoryPatch({
    projectRoot: paths.data.projectRoot,
    patch: patch.data,
    git: git.data,
    clock: systemClock
  });

  if (!planned.ok) {
    return {
      ok: true as const,
      data: {
        ...patchShapeSummary(patch.data),
        proposed: true,
        reason: null,
        touched_files: [],
        likely_dirty_overwrites: [],
        recovery_files: [],
        validation_findings: [planned.error.message],
        secret_findings: secretFindings(secrets)
      },
      warnings: planned.warnings,
      meta
    };
  }

  return {
    ok: true as const,
    data: {
      proposed: true,
      reason: null,
      operations: [...new Set(planned.data.changes.map((change) => change.op))].sort(),
      memory_ids: [
        ...planned.data.memory_created,
        ...planned.data.memory_updated,
        ...planned.data.memory_deleted
      ].sort(),
      relation_ids: [
        ...planned.data.relations_created,
        ...planned.data.relations_updated,
        ...planned.data.relations_deleted
      ].sort(),
      touched_files: planned.data.touchedFiles,
      likely_dirty_overwrites: planned.data.recovery_files.map((file) => file.path),
      recovery_files: planned.data.recovery_files.map(
        (file) => `${file.path} -> ${file.recovery_path}`
      ),
      validation_findings: [],
      secret_findings: secretFindings(secrets)
    },
    warnings: planned.warnings,
    meta
  };
}

async function readPatchFile(cwd: string, file: string) {
  try {
    return {
      ok: true as const,
      data: JSON.parse(await readFile(resolve(cwd, file), "utf8")) as unknown,
      warnings: []
    };
  } catch (error) {
    return {
      ok: false as const,
      error: memoryError("MemoryInvalidJson", "Patch review file could not be read as JSON.", {
        path: file,
        message: error instanceof Error ? error.message : String(error)
      }),
      warnings: [],
      meta: fallbackMeta(cwd)
    };
  }
}

function patchShapeSummary(value: unknown): Pick<
  PatchReviewData,
  "operations" | "memory_ids" | "relation_ids"
> {
  const changes = isRecord(value) && Array.isArray(value.changes) ? value.changes : [];
  const memoryIds: ObjectId[] = [];
  const relationIds: RelationId[] = [];
  const operations: string[] = [];

  for (const change of changes) {
    if (!isRecord(change)) {
      continue;
    }

    if (typeof change.op === "string") {
      operations.push(change.op);
    }

    if (typeof change.id === "string") {
      if (typeof change.op === "string" && change.op.includes("relation")) {
        relationIds.push(change.id as RelationId);
      } else {
        memoryIds.push(change.id as ObjectId);
      }
    }
  }

  return {
    operations: [...new Set(operations)].sort(),
    memory_ids: [...new Set(memoryIds)].sort(),
    relation_ids: [...new Set(relationIds)].sort()
  };
}

function secretFindings(result: ReturnType<typeof detectSecretsInPatch>): string[] {
  return [...result.errors, ...result.warnings].map(
    (issue) => `${issue.path}: ${issue.message}`
  );
}

function emptyReview(proposed: boolean, reason: string | null): PatchReviewData {
  return {
    proposed,
    reason,
    operations: [],
    memory_ids: [],
    relation_ids: [],
    touched_files: [],
    likely_dirty_overwrites: [],
    recovery_files: [],
    validation_findings: [],
    secret_findings: []
  };
}

function renderPatchReviewData(data: PatchReviewData): string {
  return [
    data.proposed ? "Memory patch review:" : "No patch to apply.",
    ...(data.reason === null ? [] : [`Reason: ${data.reason}`]),
    ...renderList("Operations", data.operations),
    ...renderList("Memory IDs", data.memory_ids),
    ...renderList("Relation IDs", data.relation_ids),
    ...renderList("Touched files", data.touched_files),
    ...renderList("Likely dirty overwrites", data.likely_dirty_overwrites),
    ...renderList("Recovery backups", data.recovery_files),
    ...renderList("Validation findings", data.validation_findings),
    ...renderList("Secret findings", data.secret_findings)
  ].join("\n");
}

function renderList(label: string, values: readonly string[]): string[] {
  return values.length === 0 ? [] : [`${label}:`, ...values.map((value) => `- ${value}`)];
}

function isNoPatchProposal(value: unknown): value is { proposed: false; reason: string | null } {
  return isRecord(value) && value.proposed === false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fallbackMeta(cwd: string): MemoryMeta {
  const projectRoot = resolve(cwd);

  return {
    project_root: projectRoot,
    memory_root: resolve(projectRoot, ".memory"),
    git: {
      available: false,
      branch: null,
      commit: null,
      dirty: null
    }
  };
}

function isJsonMode(command: Command): boolean {
  const options = command.optsWithGlobals() as { json?: unknown };
  return options.json === true;
}
