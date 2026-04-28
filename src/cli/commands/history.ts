import { CommanderError, type Command } from "commander";

import {
  listMemoryHistory,
  type ListMemoryHistoryOptions,
  type MemoryHistoryCommit,
  type MemoryHistoryData
} from "../../app/operations.js";
import { CLI_EXIT_SUCCESS } from "../exit.js";
import { renderAppResult } from "../render.js";

type CliOutputWriter = (text: string) => void;

export interface RegisterHistoryCommandOptions {
  cwd: string;
  stdout: CliOutputWriter;
  stderr: CliOutputWriter;
}

interface HistoryCommandFlags {
  limit?: string;
}

export function registerHistoryCommand(
  program: Command,
  options: RegisterHistoryCommandOptions
): void {
  program
    .command("history")
    .description("Show Git history scoped to Aictx memory files.")
    .option("--limit <number>", "Maximum number of commits to return.")
    .action(async (commandOptions: HistoryCommandFlags, command: Command) => {
      const result = await listMemoryHistory(
        listMemoryHistoryOptions(options, commandOptions)
      );
      const rendered = renderAppResult(result, {
        json: isJsonMode(command),
        renderData: renderHistoryData
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

function listMemoryHistoryOptions(
  options: RegisterHistoryCommandOptions,
  flags: HistoryCommandFlags
): ListMemoryHistoryOptions {
  return {
    cwd: options.cwd,
    ...(flags.limit === undefined ? {} : { limit: Number(flags.limit) })
  };
}

function isJsonMode(command: Command): boolean {
  const options = command.optsWithGlobals() as { json?: unknown };
  return options.json === true;
}

function renderHistoryData(data: MemoryHistoryData): string {
  if (data.commits.length === 0) {
    return "No Aictx history found.";
  }

  return data.commits.map(renderHistoryCommit).join("\n");
}

function renderHistoryCommit(commit: MemoryHistoryCommit): string {
  return `${commit.short_commit}  ${commit.timestamp}  ${commit.author}  ${commit.subject}`;
}
