import { CommanderError, type Command } from "commander";

import {
  resetAictx,
  type ResetAictxData,
  type ResetAictxOptions
} from "../../app/operations.js";
import { CLI_EXIT_SUCCESS } from "../exit.js";
import { renderAppResult } from "../render.js";

type CliOutputWriter = (text: string) => void;

export interface RegisterResetCommandOptions {
  cwd: string;
  stdout: CliOutputWriter;
  stderr: CliOutputWriter;
}

export function registerResetCommand(
  program: Command,
  options: RegisterResetCommandOptions
): void {
  program
    .command("reset")
    .description("Back up and clear local Aictx storage.")
    .option("--destroy", "Delete the entire .aictx directory without creating a backup.")
    .action(async (commandOptions: ResetCommandOptions, command: Command) => {
      const result = await resetAictx(resetAictxOptions(options, commandOptions));
      const rendered = renderAppResult(result, {
        json: isJsonMode(command),
        renderData: renderResetAictxData
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

interface ResetCommandOptions {
  destroy?: boolean;
}

function resetAictxOptions(
  options: RegisterResetCommandOptions,
  commandOptions: ResetCommandOptions
): ResetAictxOptions {
  return {
    cwd: options.cwd,
    destroy: commandOptions.destroy === true
  };
}

function isJsonMode(command: Command): boolean {
  const options = command.optsWithGlobals() as { json?: unknown };
  return options.json === true;
}

function renderResetAictxData(data: ResetAictxData): string {
  if (data.destroyed) {
    return "Deleted .aictx.";
  }

  return [
    "Backed up and cleared .aictx.",
    `Backup: ${data.backup_path ?? "none"}`,
    ...renderList("Removed entries", data.entries_removed)
  ].join("\n");
}

function renderList(label: string, values: readonly string[]): string[] {
  if (values.length === 0) {
    return [];
  }

  return [`${label}:`, ...values.map((value) => `- ${value}`)];
}
