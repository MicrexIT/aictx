import type { Readable } from "node:stream";

import { CommanderError, type Command } from "commander";

import {
  type AppResult,
  dataAccessService,
  type DataAccessRememberInput,
  type RememberMemoryData
} from "../../data-access/index.js";
import { aictxError, type AictxError } from "../../core/errors.js";
import type { AictxMeta } from "../../core/types.js";
import { err, ok, type Result } from "../../core/result.js";
import {
  CLI_EXIT_SUCCESS,
  type CliExitCode
} from "../exit.js";
import { renderAppResult } from "../render.js";

type CliOutputWriter = (text: string) => void;

export interface RegisterRememberCommandOptions {
  cwd: string;
  stdin: Readable;
  stdout: CliOutputWriter;
  stderr: CliOutputWriter;
}

interface RememberCommandFlags {
  stdin?: boolean;
  dryRun?: boolean;
}

export function registerRememberCommand(
  program: Command,
  options: RegisterRememberCommandOptions
): void {
  program
    .command("remember")
    .description("Create Aictx memory, including durable workflows/how-tos, from intent-first agent input.")
    .option("--stdin", "Read the remember input from stdin.")
    .option("--dry-run", "Validate and plan the generated patch without writing memory.")
    .action(async (commandOptions: RememberCommandFlags, command: Command) => {
      if (commandOptions.stdin !== true) {
        command.error("error: --stdin is required", {
          code: "commander.invalidArgument",
          exitCode: 2
        });
      }

      const input = await readRememberInput(options.stdin);

      if (!input.ok) {
        renderAndThrowOnFailure(inputErrorResult(input.error, options.cwd), options, command);
        return;
      }

      const parsed = parseRememberJson(input.data);

      if (!parsed.ok) {
        renderAndThrowOnFailure(inputErrorResult(parsed.error, options.cwd), options, command);
        return;
      }

      const result = await dataAccessService.remember(
        rememberMemoryOptions(options, parsed.data, commandOptions)
      );

      renderAndThrowOnFailure(result, options, command);
    });
}

function rememberMemoryOptions(
  options: RegisterRememberCommandOptions,
  input: unknown,
  flags: RememberCommandFlags
): DataAccessRememberInput {
  return {
    target: {
      kind: "cwd",
      cwd: options.cwd
    },
    input,
    dryRun: flags.dryRun === true
  };
}

async function readRememberInput(stdin: Readable): Promise<Result<string>> {
  let contents = "";

  try {
    for await (const chunk of stdin) {
      contents += chunkToString(chunk);
    }
  } catch (error) {
    return err(
      aictxError("AICtxValidationFailed", "Remember input could not be read from stdin.", {
        message: messageFromUnknown(error)
      })
    );
  }

  return ok(contents);
}

function parseRememberJson(contents: string): Result<unknown> {
  try {
    return ok(JSON.parse(contents) as unknown);
  } catch (error) {
    return err(
      aictxError("AICtxInvalidJson", "Remember input contains invalid JSON.", {
        source: "stdin",
        message: messageFromUnknown(error)
      })
    );
  }
}

function renderAndThrowOnFailure(
  result: AppResult<RememberMemoryData>,
  options: RegisterRememberCommandOptions,
  command: Command
): void {
  const rendered = renderAppResult(result, {
    json: isJsonMode(command),
    renderData: renderRememberData
  });

  options.stdout(rendered.stdout);
  options.stderr(rendered.stderr);

  if (rendered.exitCode !== CLI_EXIT_SUCCESS) {
    throwCommandFailed(rendered.exitCode);
  }
}

function inputErrorResult(error: AictxError, cwd: string): AppResult<RememberMemoryData> {
  return {
    ok: false,
    error,
    warnings: [],
    meta: fallbackMeta(cwd)
  };
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

function renderRememberData(data: RememberMemoryData): string {
  return [
    data.dry_run ? "Planned Aictx remember input." : "Saved Aictx remember input.",
    ...renderList("Files changed", data.files_changed),
    ...renderList("Memory created", data.memory_created),
    ...renderList("Memory updated", data.memory_updated),
    ...renderList("Memory deleted", data.memory_deleted),
    ...renderList("Relations created", data.relations_created),
    ...renderList("Relations updated", data.relations_updated),
    ...renderList("Relations deleted", data.relations_deleted),
    `Events appended: ${data.events_appended}`,
    `Index ${data.index_updated ? "updated" : "not updated"}.`
  ].join("\n");
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
    "aictx.command.failed",
    "Aictx command failed."
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
