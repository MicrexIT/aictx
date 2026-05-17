import { CommanderError, type Command } from "commander";

import {
  restoreMemory,
  type RestoreMemoryData,
  type RestoreMemoryOptions
} from "../../app/operations.js";
import { CLI_EXIT_SUCCESS } from "../exit.js";
import { renderAppResult } from "../render.js";

type CliOutputWriter = (text: string) => void;

export interface RegisterRestoreCommandOptions {
  cwd: string;
  stdout: CliOutputWriter;
  stderr: CliOutputWriter;
}

export function registerRestoreCommand(
  program: Command,
  options: RegisterRestoreCommandOptions
): void {
  program
    .command("restore <commit>")
    .description("Restore Memory files from a Git commit.")
    .action(async (commit: string, _commandOptions: unknown, command: Command) => {
      const result = await restoreMemory(restoreMemoryOptions(options, commit));
      const rendered = renderAppResult(result, {
        json: isJsonMode(command),
        renderData: renderRestoreData
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

function restoreMemoryOptions(
  options: RegisterRestoreCommandOptions,
  commit: string
): RestoreMemoryOptions {
  return {
    cwd: options.cwd,
    commit
  };
}

function isJsonMode(command: Command): boolean {
  const options = command.optsWithGlobals() as { json?: unknown };
  return options.json === true;
}

function renderRestoreData(data: RestoreMemoryData): string {
  return [
    "Restored Memory.",
    `Restored from: ${data.restored_from}`,
    ...renderList("Files changed", data.files_changed),
    data.index_rebuilt ? "Index rebuilt." : "Index not rebuilt."
  ].join("\n");
}

function renderList(label: string, values: readonly string[]): string[] {
  if (values.length === 0) {
    return [];
  }

  return [`${label}:`, ...values.map((value) => `- ${value}`)];
}
