import { CommanderError, type Command } from "commander";

import {
  getMemoryLens,
  type MemoryLensData
} from "../../app/operations.js";
import { CLI_EXIT_SUCCESS } from "../exit.js";
import { renderAppResult } from "../render.js";

type CliOutputWriter = (text: string) => void;

export interface RegisterLensCommandOptions {
  cwd: string;
  stdout: CliOutputWriter;
  stderr: CliOutputWriter;
}

export function registerLensCommand(
  program: Command,
  options: RegisterLensCommandOptions
): void {
  program
    .command("lens")
    .description("Render a readable Memory lens.")
    .argument("<name>", "Lens name: project-map, current-work, review-risk, provenance, or maintenance.")
    .action(async (name: string, _flags: Record<string, never>, command: Command) => {
      const result = await getMemoryLens({
        cwd: options.cwd,
        lens: name
      });
      const rendered = renderAppResult(result, {
        json: isJsonMode(command),
        renderData: renderLensData
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

function renderLensData(data: MemoryLensData): string {
  return data.markdown;
}

function isJsonMode(command: Command): boolean {
  const options = command.optsWithGlobals() as { json?: unknown };
  return options.json === true;
}
