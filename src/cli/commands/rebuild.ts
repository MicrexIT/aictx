import { CommanderError, type Command } from "commander";

import {
  rebuildIndex,
  type RebuildIndexOptions
} from "../../app/operations.js";
import type { RebuildIndexData } from "../../index/rebuild.js";
import { CLI_EXIT_SUCCESS } from "../exit.js";
import { renderAppResult } from "../render.js";

type CliOutputWriter = (text: string) => void;

export interface RegisterRebuildCommandOptions {
  cwd: string;
  stdout: CliOutputWriter;
  stderr: CliOutputWriter;
}

export function registerRebuildCommand(
  program: Command,
  options: RegisterRebuildCommandOptions
): void {
  program
    .command("rebuild")
    .description("Rebuild generated Aictx indexes from canonical storage.")
    .action(async (_commandOptions: unknown, command: Command) => {
      const result = await rebuildIndex(rebuildIndexOptions(options));
      const rendered = renderAppResult(result, {
        json: isJsonMode(command),
        renderData: renderRebuildData
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

function rebuildIndexOptions(options: RegisterRebuildCommandOptions): RebuildIndexOptions {
  return {
    cwd: options.cwd
  };
}

function isJsonMode(command: Command): boolean {
  const options = command.optsWithGlobals() as { json?: unknown };
  return options.json === true;
}

function renderRebuildData(data: RebuildIndexData): string {
  return [
    "Rebuilt Aictx index.",
    `Objects indexed: ${data.objects_indexed}`,
    `Relations indexed: ${data.relations_indexed}`,
    `Events indexed: ${data.events_indexed}`,
    `Event appended: ${String(data.event_appended)}`
  ].join("\n");
}
