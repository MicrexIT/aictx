import { CommanderError, type Command } from "commander";

import {
  dataAccessService,
  type DataAccessDiffInput,
  type DiffMemoryData,
} from "../../data-access/index.js";
import { CLI_EXIT_SUCCESS } from "../exit.js";
import { renderAppResult } from "../render.js";

type CliOutputWriter = (text: string) => void;

export interface RegisterDiffCommandOptions {
  cwd: string;
  stdout: CliOutputWriter;
  stderr: CliOutputWriter;
}

export function registerDiffCommand(
  program: Command,
  options: RegisterDiffCommandOptions
): void {
  program
    .command("diff")
    .description("Show Memory changes, including untracked memory files.")
    .action(async (_commandOptions: unknown, command: Command) => {
      const result = await dataAccessService.diff(diffMemoryOptions(options));
      const rendered = renderAppResult(result, {
        json: isJsonMode(command),
        renderData: renderDiffData
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

function diffMemoryOptions(options: RegisterDiffCommandOptions): DataAccessDiffInput {
  return {
    target: {
      kind: "cwd",
      cwd: options.cwd
    }
  };
}

function isJsonMode(command: Command): boolean {
  const options = command.optsWithGlobals() as { json?: unknown };
  return options.json === true;
}

function renderDiffData(data: DiffMemoryData): string {
  return data.diff;
}
