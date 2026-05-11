import type { Readable } from "node:stream";

import { CommanderError, type Command } from "commander";

import {
  closeBranchHandoff,
  showBranchHandoff,
  updateBranchHandoff,
  type AppResult,
  type BranchHandoffCloseData,
  type BranchHandoffShowData,
  type BranchHandoffUpdateData,
  type SaveMemoryData
} from "../../app/operations.js";
import { aictxError, type AictxError } from "../../core/errors.js";
import type { AictxMeta } from "../../core/types.js";
import { err, ok, type Result } from "../../core/result.js";
import { CLI_EXIT_SUCCESS } from "../exit.js";
import { renderAppResult } from "../render.js";

type CliOutputWriter = (text: string) => void;

export interface RegisterHandoffCommandOptions {
  cwd: string;
  stdin: Readable;
  stdout: CliOutputWriter;
  stderr: CliOutputWriter;
}

interface StdinFlags {
  stdin?: boolean;
}

export function registerHandoffCommand(
  program: Command,
  options: RegisterHandoffCommandOptions
): void {
  const handoff = program
    .command("handoff")
    .description("Manage current-branch Aictx handoff memory.");

  handoff
    .command("show")
    .description("Show the current branch handoff.")
    .action(async (_flags: Record<string, never>, command: Command) => {
      const result = await showBranchHandoff({ cwd: options.cwd });
      renderAndThrow(result, options, command, renderHandoffShowData);
    });

  handoff
    .command("update")
    .description("Create or update the current branch handoff from JSON stdin.")
    .option("--stdin", "Read handoff JSON from stdin.")
    .action(async (flags: StdinFlags, command: Command) => {
      const input = await readJsonInput(options, flags);

      if (!input.ok) {
        renderAndThrow(
          inputErrorResult<BranchHandoffUpdateData>(input.error, options.cwd),
          options,
          command,
          renderHandoffUpdateData
        );
        return;
      }

      const result = await updateBranchHandoff({
        cwd: options.cwd,
        input: input.data
      });

      renderAndThrow(result, options, command, renderHandoffUpdateData);
    });

  handoff
    .command("close")
    .description("Close the current branch handoff and optionally promote durable memory from JSON stdin.")
    .option("--stdin", "Read handoff close JSON from stdin.")
    .action(async (flags: StdinFlags, command: Command) => {
      const input = await readJsonInput(options, flags);

      if (!input.ok) {
        renderAndThrow(
          inputErrorResult<BranchHandoffCloseData>(input.error, options.cwd),
          options,
          command,
          renderHandoffCloseData
        );
        return;
      }

      const result = await closeBranchHandoff({
        cwd: options.cwd,
        input: input.data
      });

      renderAndThrow(result, options, command, renderHandoffCloseData);
    });
}

async function readJsonInput(
  options: RegisterHandoffCommandOptions,
  flags: StdinFlags
): Promise<Result<unknown>> {
  if (flags.stdin !== true) {
    return err(
      aictxError("AICtxValidationFailed", "--stdin is required for handoff update and close.", {
        field: "stdin"
      })
    );
  }

  let contents = "";

  try {
    for await (const chunk of options.stdin) {
      contents += chunkToString(chunk);
    }
  } catch (error) {
    return err(
      aictxError("AICtxValidationFailed", "Handoff input could not be read from stdin.", {
        message: messageFromUnknown(error)
      })
    );
  }

  try {
    return ok(JSON.parse(contents) as unknown);
  } catch (error) {
    return err(
      aictxError("AICtxInvalidJson", "Handoff input contains invalid JSON.", {
        source: "stdin",
        message: messageFromUnknown(error)
      })
    );
  }
}

function renderAndThrow<T>(
  result: AppResult<T>,
  options: RegisterHandoffCommandOptions,
  command: Command,
  renderData: (data: T) => string
): void {
  const rendered = renderAppResult(result, {
    json: isJsonMode(command),
    renderData
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
}

function inputErrorResult<T>(error: AictxError, cwd: string): AppResult<T> {
  return {
    ok: false,
    error,
    warnings: [],
    meta: fallbackMeta(cwd)
  };
}

function renderHandoffShowData(data: BranchHandoffShowData): string {
  if (data.handoff === null) {
    return `No branch handoff found for ${data.branch}.\nHandoff ID: ${data.id}`;
  }

  return [`Branch handoff for ${data.branch}.`, `Handoff ID: ${data.id}`, "", data.handoff.body].join("\n");
}

function renderHandoffUpdateData(data: BranchHandoffUpdateData): string {
  return [
    `Saved branch handoff for ${data.branch}.`,
    `Handoff ID: ${data.id}`,
    ...renderSaveSummary(data.save)
  ].join("\n");
}

function renderHandoffCloseData(data: BranchHandoffCloseData): string {
  return [
    `Closed branch handoff for ${data.branch}.`,
    `Handoff ID: ${data.id}`,
    `Reason: ${data.input.reason}`,
    ...renderSaveSummary(data.save)
  ].join("\n");
}

function renderSaveSummary(data: SaveMemoryData): string[] {
  return [
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

function renderList(label: string, values: readonly string[]): string[] {
  return values.length === 0 ? [] : [`${label}:`, ...values.map((value) => `- ${value}`)];
}

function fallbackMeta(cwd: string): AictxMeta {
  return {
    project_root: cwd,
    aictx_root: `${cwd}/.aictx`,
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
