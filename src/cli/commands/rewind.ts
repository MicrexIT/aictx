import { CommanderError, type Command } from "commander";

import {
  rewindMemory,
  type RestoreMemoryData,
  type RewindMemoryOptions
} from "../../app/operations.js";
import { CLI_EXIT_SUCCESS } from "../exit.js";
import { renderAppResult } from "../render.js";

type CliOutputWriter = (text: string) => void;

export interface RegisterRewindCommandOptions {
  cwd: string;
  stdout: CliOutputWriter;
  stderr: CliOutputWriter;
}

export function registerRewindCommand(
  program: Command,
  options: RegisterRewindCommandOptions
): void {
  program
    .command("rewind")
    .description("Restore Memory files to the previous committed state.")
    .action(async (_commandOptions: unknown, command: Command) => {
      const result = await rewindMemory(rewindMemoryOptions(options));
      const rendered = renderAppResult(result, {
        json: isJsonMode(command),
        renderData: renderRewindData
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

function rewindMemoryOptions(options: RegisterRewindCommandOptions): RewindMemoryOptions {
  return {
    cwd: options.cwd
  };
}

function isJsonMode(command: Command): boolean {
  const options = command.optsWithGlobals() as { json?: unknown };
  return options.json === true;
}

function renderRewindData(data: RestoreMemoryData): string {
  return [
    "Rewound Memory.",
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
