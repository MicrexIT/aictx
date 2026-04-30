import { CommanderError, type Command } from "commander";

import {
  suggestMemory,
  type SuggestMemoryData,
  type SuggestMemoryOptions
} from "../../app/operations.js";
import { CLI_EXIT_SUCCESS, type CliExitCode } from "../exit.js";
import { renderAppResult } from "../render.js";

type CliOutputWriter = (text: string) => void;

export interface RegisterSuggestCommandOptions {
  cwd: string;
  stdout: CliOutputWriter;
  stderr: CliOutputWriter;
}

interface SuggestCommandOptions {
  fromDiff?: boolean;
  bootstrap?: boolean;
}

export function registerSuggestCommand(
  program: Command,
  options: RegisterSuggestCommandOptions
): void {
  program
    .command("suggest")
    .description("Build a read-only Aictx memory review packet.")
    .option("--from-diff", "Build a packet from current Git project changes.")
    .option("--bootstrap", "Build a first-run project memory packet.")
    .action(async (commandOptions: SuggestCommandOptions, command: Command) => {
      const result = await suggestMemory(suggestMemoryOptions(options, commandOptions));
      const rendered = renderAppResult(result, {
        json: isJsonMode(command),
        renderData: renderSuggestData
      });

      options.stdout(rendered.stdout);
      options.stderr(rendered.stderr);

      if (rendered.exitCode !== CLI_EXIT_SUCCESS) {
        throwCommandFailed(rendered.exitCode);
      }
    });
}

function suggestMemoryOptions(
  options: RegisterSuggestCommandOptions,
  commandOptions: SuggestCommandOptions
): SuggestMemoryOptions {
  return {
    cwd: options.cwd,
    fromDiff: commandOptions.fromDiff === true,
    bootstrap: commandOptions.bootstrap === true
  };
}

function isJsonMode(command: Command): boolean {
  const options = command.optsWithGlobals() as { json?: unknown };
  return options.json === true;
}

function renderSuggestData(data: SuggestMemoryData): string {
  return [
    `Aictx suggest packet (${data.mode}):`,
    renderList("Changed files", data.changed_files),
    renderList("Related memory", data.related_memory_ids),
    renderList("Possible stale memory", data.possible_stale_ids),
    renderList("Recommended memory", data.recommended_memory),
    renderList("Checklist", data.agent_checklist)
  ].join("\n");
}

function renderList(label: string, values: readonly string[]): string {
  if (values.length === 0) {
    return `${label}:\n- none`;
  }

  return `${label}:\n${values.map((value) => `- ${value}`).join("\n")}`;
}

function throwCommandFailed(exitCode: CliExitCode): never {
  throw new CommanderError(
    exitCode,
    "aictx.command.failed",
    "Aictx command failed."
  );
}
