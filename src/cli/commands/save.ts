import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Readable } from "node:stream";

import { CommanderError, type Command } from "commander";

import {
  saveMemoryPatch,
  type AppResult,
  type SaveMemoryData,
  type SaveMemoryPatchOptions
} from "../../app/operations.js";
import { aictxError, type AictxError } from "../../core/errors.js";
import type { AictxMeta } from "../../core/types.js";
import { err, ok, type Result } from "../../core/result.js";
import {
  CLI_EXIT_SUCCESS,
  CLI_EXIT_USAGE,
  type CliExitCode
} from "../exit.js";
import { renderAppResult } from "../render.js";

type CliOutputWriter = (text: string) => void;

export interface RegisterSaveCommandOptions {
  cwd: string;
  stdin: Readable;
  stdout: CliOutputWriter;
  stderr: CliOutputWriter;
}

interface SaveCommandFlags {
  file?: string;
  stdin?: boolean;
}

type SaveInputSource =
  | {
      kind: "stdin";
    }
  | {
      kind: "file";
      inputPath: string;
      resolvedPath: string;
    };

export function registerSaveCommand(
  program: Command,
  options: RegisterSaveCommandOptions
): void {
  program
    .command("save")
    .description("Write Aictx memory updates from a structured patch.")
    .option("--file <path>", "Read the structured memory patch from a JSON file.")
    .option("--stdin", "Read the structured memory patch from stdin.")
    .action(async (commandOptions: SaveCommandFlags, command: Command) => {
      const source = inputSource(commandOptions, options.cwd, command);
      const input = await readPatchInput(source, options.stdin);

      if (!input.ok) {
        renderAndThrowOnFailure(inputErrorResult(input.error, options.cwd), options, command);
        return;
      }

      const patch = parsePatchJson(input.data, source);

      if (!patch.ok) {
        renderAndThrowOnFailure(inputErrorResult(patch.error, options.cwd), options, command);
        return;
      }

      const result = await saveMemoryPatch(saveMemoryPatchOptions(options, patch.data));

      renderAndThrowOnFailure(result, options, command);
    });
}

function saveMemoryPatchOptions(
  options: RegisterSaveCommandOptions,
  patch: unknown
): SaveMemoryPatchOptions {
  return {
    cwd: options.cwd,
    patch
  };
}

function inputSource(
  options: SaveCommandFlags,
  cwd: string,
  command: Command
): SaveInputSource {
  const file = options.file;
  const hasFile = typeof file === "string";
  const hasStdin = options.stdin === true;

  if (hasStdin && !hasFile) {
    return {
      kind: "stdin"
    };
  }

  if (hasFile && !hasStdin) {
    return {
      kind: "file",
      inputPath: file,
      resolvedPath: resolve(cwd, file)
    };
  }

  command.error("error: exactly one of --file or --stdin is required", {
    code: "commander.invalidArgument",
    exitCode: CLI_EXIT_USAGE
  });
}

async function readPatchInput(
  source: SaveInputSource,
  stdin: Readable
): Promise<Result<string>> {
  if (source.kind === "stdin") {
    return readPatchFromStdin(stdin);
  }

  try {
    return ok(await readFile(source.resolvedPath, "utf8"));
  } catch (error) {
    return err(
      aictxError("AICtxValidationFailed", "Structured memory patch file could not be read.", {
        path: source.inputPath,
        message: messageFromUnknown(error)
      })
    );
  }
}

async function readPatchFromStdin(stdin: Readable): Promise<Result<string>> {
  let contents = "";

  try {
    for await (const chunk of stdin) {
      contents += chunkToString(chunk);
    }
  } catch (error) {
    return err(
      aictxError("AICtxValidationFailed", "Structured memory patch could not be read from stdin.", {
        message: messageFromUnknown(error)
      })
    );
  }

  return ok(contents);
}

function parsePatchJson(contents: string, source: SaveInputSource): Result<unknown> {
  try {
    return ok(JSON.parse(contents) as unknown);
  } catch (error) {
    return err(
      aictxError(
        "AICtxInvalidJson",
        "Structured memory patch contains invalid JSON.",
        jsonParseErrorDetails(source, error)
      )
    );
  }
}

function jsonParseErrorDetails(source: SaveInputSource, error: unknown) {
  if (source.kind === "file") {
    return {
      source: "file",
      path: source.inputPath,
      message: messageFromUnknown(error)
    };
  }

  return {
    source: "stdin",
    message: messageFromUnknown(error)
  };
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

function renderAndThrowOnFailure(
  result: AppResult<SaveMemoryData>,
  options: RegisterSaveCommandOptions,
  command: Command
): void {
  const rendered = renderAppResult(result, {
    json: isJsonMode(command),
    renderData: renderSaveData
  });

  options.stdout(rendered.stdout);
  options.stderr(rendered.stderr);

  if (rendered.exitCode !== CLI_EXIT_SUCCESS) {
    throwCommandFailed(rendered.exitCode);
  }
}

function inputErrorResult(
  error: AictxError,
  cwd: string
): AppResult<SaveMemoryData> {
  return {
    ok: false,
    error,
    warnings: [],
    meta: fallbackMeta(cwd)
  };
}

function fallbackMeta(cwd: string): AictxMeta {
  const projectRoot = resolve(cwd);

  return {
    project_root: projectRoot,
    aictx_root: resolve(projectRoot, ".aictx"),
    git: {
      available: false,
      branch: null,
      commit: null,
      dirty: null
    }
  };
}

function throwCommandFailed(exitCode: CliExitCode): never {
  throw new CommanderError(
    exitCode,
    "aictx.command.failed",
    "Aictx command failed."
  );
}

function isJsonMode(command: Command): boolean {
  const options = command.optsWithGlobals() as { json?: unknown };
  return options.json === true;
}

function renderSaveData(data: SaveMemoryData): string {
  return [
    "Saved Aictx memory patch.",
    ...renderList("Files changed", data.files_changed),
    ...renderList(
      "Recovery backups",
      data.recovery_files.map((file) => `${file.path} -> ${file.recovery_path}`)
    ),
    ...renderList("Repairs applied", data.repairs_applied),
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

function messageFromUnknown(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
