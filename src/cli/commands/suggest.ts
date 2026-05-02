import { CommanderError, type Command } from "commander";

import {
  type AppResult,
  suggestMemory,
  type SuggestMemoryData,
  type SuggestMemoryOptions
} from "../../app/operations.js";
import type { SuggestBootstrapPatchProposal } from "../../discipline/suggest.js";
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
  afterTask?: string;
  patch?: boolean;
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
    .option("--after-task <task>", "Build an end-of-task save/no-save review packet.")
    .option("--patch", "With --bootstrap, output a proposed structured memory patch.")
    .action(async (commandOptions: SuggestCommandOptions, command: Command) => {
      const result = await suggestMemory(suggestMemoryOptions(options, commandOptions));
      const rendered =
        commandOptions.patch === true && !isJsonMode(command)
          ? renderSuggestPatchResult(result)
          : renderAppResult(result, {
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
    bootstrap: commandOptions.bootstrap === true,
    ...(commandOptions.afterTask === undefined ? {} : { afterTask: commandOptions.afterTask }),
    patch: commandOptions.patch === true
  };
}

function isJsonMode(command: Command): boolean {
  const options = command.optsWithGlobals() as { json?: unknown };
  return options.json === true;
}

function renderSuggestData(data: SuggestMemoryData): string {
  const packet = isBootstrapPatchProposal(data) ? data.packet : data;

  return [
    `Aictx suggest packet (${packet.mode}):`,
    renderList("Changed files", packet.changed_files),
    renderList("Related memory", packet.related_memory_ids),
    renderList("Possible stale memory", packet.possible_stale_ids),
    renderList("Recommended memory", packet.recommended_memory),
    renderList("Recommended facets", packet.recommended_facets ?? []),
    renderList("Save decision checklist", packet.save_decision_checklist ?? []),
    renderList("Checklist", packet.agent_checklist)
  ].join("\n");
}

function renderSuggestPatchResult(result: AppResult<SuggestMemoryData>): {
  stdout: string;
  stderr: string;
  exitCode: CliExitCode;
} {
  if (!result.ok) {
    return renderAppResult(result, {
      json: false,
      renderData: renderSuggestData
    });
  }

  if (!isBootstrapPatchProposal(result.data)) {
    return renderAppResult(result, {
      json: false,
      renderData: renderSuggestData
    });
  }

  const stdout =
    result.data.proposed && result.data.patch !== null
      ? JSON.stringify(result.data.patch, null, 2)
      : JSON.stringify(
          {
            proposed: false,
            reason: result.data.reason,
            packet: result.data.packet
          },
          null,
          2
        );

  return {
    stdout: `${stdout}\n`,
    stderr: renderWarnings(result.warnings),
    exitCode: CLI_EXIT_SUCCESS
  };
}

function isBootstrapPatchProposal(
  data: SuggestMemoryData
): data is SuggestBootstrapPatchProposal {
  return "proposed" in data && "packet" in data;
}

function renderWarnings(warnings: readonly string[]): string {
  if (warnings.length === 0) {
    return "";
  }

  return `${warnings.map((warning) => `warning: ${warning}`).join("\n")}\n`;
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
