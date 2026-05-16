import type { Readable } from "node:stream";

import { CommanderError, type Command } from "commander";

import {
  type AppResult,
  type AuditFinding,
  type AuditMemoryData,
  type RememberMemoryData,
  type RoleCoverageGapData,
  wikiFileMemory,
  type WikiFileData,
  wikiIngestMemory,
  type WikiIngestData,
  wikiLintMemory,
  wikiLogMemory,
  type WikiLogData
} from "../../app/operations.js";
import { memoryError, type MemoryError } from "../../core/errors.js";
import type { MemoryMeta } from "../../core/types.js";
import { err, ok, type Result } from "../../core/result.js";
import {
  CLI_EXIT_SUCCESS,
  type CliExitCode
} from "../exit.js";
import { renderAppResult } from "../render.js";

type CliOutputWriter = (text: string) => void;

export interface RegisterWikiCommandOptions {
  cwd: string;
  stdin: Readable;
  stdout: CliOutputWriter;
  stderr: CliOutputWriter;
}

interface StdinFlags {
  stdin?: boolean;
  dryRun?: boolean;
}

interface WikiLogFlags {
  limit?: string;
}

export function registerWikiCommand(
  program: Command,
  options: RegisterWikiCommandOptions
): void {
  const wiki = program
    .command("wiki")
    .description("Maintain source-backed wiki-style Memory from agent-supplied synthesis.");

  wiki
    .command("ingest")
    .description("Create or update a source record and source-backed memory in one patch.")
    .option("--stdin", "Read the wiki ingest input from stdin.")
    .option("--dry-run", "Validate and plan the generated patch without writing memory.")
    .action(async (commandOptions: StdinFlags, command: Command) => {
      if (commandOptions.stdin !== true) {
        command.error("error: --stdin is required", {
          code: "commander.invalidArgument",
          exitCode: 2
        });
      }

      const input = await readStdinJson(options.stdin, "Wiki ingest input");

      if (!input.ok) {
        renderAndThrowOnFailure(inputErrorResult(input.error, options.cwd), options, command);
        return;
      }

      const result = await wikiIngestMemory({
        cwd: options.cwd,
        input: input.data,
        dryRun: commandOptions.dryRun === true
      });

      renderAndThrowOnFailure(result, options, command, renderWikiIngestData);
    });

  wiki
    .command("file")
    .description("File a useful query result or synthesis back into Memory.")
    .option("--stdin", "Read the wiki file input from stdin.")
    .option("--dry-run", "Validate and plan the generated patch without writing memory.")
    .action(async (commandOptions: StdinFlags, command: Command) => {
      if (commandOptions.stdin !== true) {
        command.error("error: --stdin is required", {
          code: "commander.invalidArgument",
          exitCode: 2
        });
      }

      const input = await readStdinJson(options.stdin, "Wiki file input");

      if (!input.ok) {
        renderAndThrowOnFailure(inputErrorResult(input.error, options.cwd), options, command);
        return;
      }

      const result = await wikiFileMemory({
        cwd: options.cwd,
        input: input.data,
        dryRun: commandOptions.dryRun === true
      });

      renderAndThrowOnFailure(result, options, command, renderWikiFileData);
    });

  wiki
    .command("lint")
    .description("Report wiki-style memory maintenance findings without mutating storage.")
    .action(async (_commandOptions: unknown, command: Command) => {
      const result = await wikiLintMemory({
        cwd: options.cwd
      });

      renderAndThrowOnFailure(result, options, command, renderWikiLintData);
    });

  wiki
    .command("log")
    .description("Render a chronological wiki log from canonical Memory events.")
    .option("--limit <n>", "Number of event entries to show.", "20")
    .action(async (commandOptions: WikiLogFlags, command: Command) => {
      const limit = parseLimit(commandOptions.limit);

      if (!limit.ok) {
        renderAndThrowOnFailure(inputErrorResult(limit.error, options.cwd), options, command);
        return;
      }

      const result = await wikiLogMemory({
        cwd: options.cwd,
        limit: limit.data
      });

      renderAndThrowOnFailure(result, options, command, renderWikiLogData);
    });
}

async function readStdinJson(stdin: Readable, label: string): Promise<Result<unknown>> {
  let contents = "";

  try {
    for await (const chunk of stdin) {
      contents += chunkToString(chunk);
    }
  } catch (error) {
    return err(
      memoryError("MemoryValidationFailed", `${label} could not be read from stdin.`, {
        message: messageFromUnknown(error)
      })
    );
  }

  try {
    return ok(JSON.parse(contents) as unknown);
  } catch (error) {
    return err(
      memoryError("MemoryInvalidJson", `${label} contains invalid JSON.`, {
        source: "stdin",
        message: messageFromUnknown(error)
      })
    );
  }
}

function parseLimit(raw: string | undefined): Result<number> {
  const value = raw ?? "20";
  const parsed = Number.parseInt(value, 10);

  if (!Number.isSafeInteger(parsed) || String(parsed) !== value || parsed < 1 || parsed > 500) {
    return err(
      memoryError("MemoryValidationFailed", "Wiki log limit must be an integer between 1 and 500.", {
        field: "limit",
        minimum: 1,
        maximum: 500,
        actual: value
      })
    );
  }

  return ok(parsed);
}

function renderAndThrowOnFailure<T>(
  result: AppResult<T>,
  options: RegisterWikiCommandOptions,
  command: Command,
  renderData: (data: T) => string = String
): void {
  const rendered = renderAppResult(result, {
    json: isJsonMode(command),
    renderData
  });

  options.stdout(rendered.stdout);
  options.stderr(rendered.stderr);

  if (rendered.exitCode !== CLI_EXIT_SUCCESS) {
    throwCommandFailed(rendered.exitCode);
  }
}

function inputErrorResult(error: MemoryError, cwd: string): AppResult<never> {
  return {
    ok: false,
    error,
    warnings: [],
    meta: fallbackMeta(cwd)
  };
}

function fallbackMeta(cwd: string): MemoryMeta {
  return {
    project_root: cwd,
    memory_root: `${cwd}/.memory`,
    git: {
      available: false,
      branch: null,
      commit: null,
      dirty: null
    }
  };
}

function renderWikiIngestData(data: WikiIngestData): string {
  return [
    data.dry_run ? "Planned Memory wiki ingest." : "Saved Memory wiki ingest.",
    `Source: ${data.source_id}`,
    ...renderSaveSummary(data)
  ].join("\n");
}

function renderWikiFileData(data: WikiFileData): string {
  return [
    data.dry_run ? "Planned Memory wiki file input." : "Filed Memory wiki memory.",
    ...renderSaveSummary(data)
  ].join("\n");
}

function renderSaveSummary(data: RememberMemoryData): string[] {
  return [
    ...renderList("Files changed", data.files_changed),
    ...renderList("Memory created", data.memory_created),
    ...renderList("Memory updated", data.memory_updated),
    ...renderList("Memory deleted", data.memory_deleted),
    ...renderList("Relations created", data.relations_created),
    ...renderList("Relations updated", data.relations_updated),
    ...renderList("Relations deleted", data.relations_deleted),
    `Events appended: ${data.events_appended}`,
    `Index ${data.index_updated ? "updated" : "not updated"}.`
  ];
}

function renderWikiLintData(data: AuditMemoryData): string {
  if (data.findings.length === 0 && data.role_gaps.length === 0) {
    return "No Memory wiki lint findings.";
  }

  return [
    ...(data.findings.length === 0
      ? []
      : ["Memory wiki lint findings:", ...data.findings.map(renderFinding)]),
    ...(data.role_gaps.length === 0
      ? []
      : [
          ...(data.findings.length === 0 ? [] : [""]),
          "Wiki role coverage gaps:",
          ...data.role_gaps.map(renderRoleGap)
        ])
  ].join("\n");
}

function renderWikiLogData(data: WikiLogData): string {
  if (data.entries.length === 0) {
    return "No Memory wiki log entries.";
  }

  return [
    "Memory wiki log:",
    ...data.entries.map((entry) =>
      [
        `- [${entry.timestamp}] ${entry.event}`,
        `actor=${entry.actor}`,
        ...(entry.id === null ? [] : [`id=${entry.id}`]),
        ...(entry.relation_id === null ? [] : [`relation=${entry.relation_id}`]),
        ...(entry.reason === null ? [] : [`reason=${entry.reason}`])
      ].join(" ")
    )
  ].join("\n");
}

function renderFinding(finding: AuditFinding): string {
  return [
    `- [${finding.severity}] ${finding.rule} ${finding.memory_id}: ${finding.message}`,
    `  evidence: ${renderEvidence(finding)}`
  ].join("\n");
}

function renderEvidence(finding: AuditFinding): string {
  if (finding.evidence.length === 0) {
    return "none";
  }

  return finding.evidence
    .map((evidence) => `${evidence.kind}:${evidence.id}`)
    .join(", ");
}

function renderRoleGap(gap: RoleCoverageGapData): string {
  return `- [${gap.status}] ${gap.label}: ${gap.gap}`;
}

function renderList(label: string, values: readonly string[]): string[] {
  if (values.length === 0) {
    return [];
  }

  return [`${label}:`, ...values.map((value) => `- ${value}`)];
}

function isJsonMode(command: Command): boolean {
  const options = command.optsWithGlobals() as { json?: unknown };
  return options.json === true;
}

function throwCommandFailed(exitCode: CliExitCode): never {
  throw new CommanderError(
    exitCode,
    "memory.command.failed",
    "Memory command failed."
  );
}

function chunkToString(chunk: unknown): string {
  if (typeof chunk === "string") {
    return chunk;
  }

  if (Buffer.isBuffer(chunk)) {
    return chunk.toString("utf8");
  }

  return String(chunk);
}

function messageFromUnknown(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
