import { CommanderError, type Command } from "commander";

import {
  listStaleMemory,
  type ListStaleMemoryData,
  type ListStaleMemoryOptions,
  type MemoryObjectSummary
} from "../../app/operations.js";
import { CLI_EXIT_SUCCESS, type CliExitCode } from "../exit.js";
import { renderAppResult } from "../render.js";

type CliOutputWriter = (text: string) => void;

export interface RegisterStaleCommandOptions {
  cwd: string;
  stdout: CliOutputWriter;
  stderr: CliOutputWriter;
}

export function registerStaleCommand(
  program: Command,
  options: RegisterStaleCommandOptions
): void {
  program
    .command("stale")
    .description("List stale and superseded Aictx memory.")
    .action(async (_commandOptions: unknown, command: Command) => {
      const result = await listStaleMemory(listStaleMemoryOptions(options));
      const rendered = renderAppResult(result, {
        json: isJsonMode(command),
        renderData: renderStaleData
      });

      options.stdout(rendered.stdout);
      options.stderr(rendered.stderr);

      if (rendered.exitCode !== CLI_EXIT_SUCCESS) {
        throwCommandFailed(rendered.exitCode);
      }
    });
}

function listStaleMemoryOptions(
  options: RegisterStaleCommandOptions
): ListStaleMemoryOptions {
  return {
    cwd: options.cwd
  };
}

function isJsonMode(command: Command): boolean {
  const options = command.optsWithGlobals() as { json?: unknown };
  return options.json === true;
}

function renderStaleData(data: ListStaleMemoryData): string {
  if (data.objects.length === 0) {
    return "No stale or superseded Aictx memory.";
  }

  return ["Stale and superseded memory:", ...data.objects.map(renderObject)].join(
    "\n"
  );
}

function renderObject(object: MemoryObjectSummary): string {
  return `- ${object.id} (${object.type}, ${object.status}) ${object.title}`;
}

function throwCommandFailed(exitCode: CliExitCode): never {
  throw new CommanderError(
    exitCode,
    "aictx.command.failed",
    "Aictx command failed."
  );
}
