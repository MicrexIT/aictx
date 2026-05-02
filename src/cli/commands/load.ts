import { CommanderError, type Command } from "commander";

import {
  loadMemory,
  type AppResult,
  type LoadMemoryOptions
} from "../../app/operations.js";
import type { LoadMemoryData, LoadMemorySource } from "../../context/compile.js";
import type { LoadMemoryMode } from "../../context/modes.js";
import type { ObjectId } from "../../core/types.js";
import { CLI_EXIT_SUCCESS } from "../exit.js";
import { renderAppResult } from "../render.js";

type CliOutputWriter = (text: string) => void;

type CliBudgetStatus = "not_requested" | "within_target" | "over_target";

export interface RegisterLoadCommandOptions {
  cwd: string;
  stdout: CliOutputWriter;
  stderr: CliOutputWriter;
}

interface LoadCommandFlags {
  changedFile?: string[];
  file?: string[];
  historyWindow?: string;
  mode?: string;
  subsystem?: string[];
  symbol?: string[];
  tokenBudget?: string;
}

interface CliLoadMemoryData {
  task: string;
  mode: LoadMemoryMode;
  token_budget: number | null;
  context_pack: string;
  token_target: number | null;
  estimated_tokens: number;
  budget_status: CliBudgetStatus;
  truncated: boolean;
  source: LoadMemorySource;
  included_ids: ObjectId[];
  excluded_ids: ObjectId[];
  omitted_ids: ObjectId[];
}

export function registerLoadCommand(
  program: Command,
  options: RegisterLoadCommandOptions
): void {
  program
    .command("load")
    .description("Compile task-specific Aictx memory into a context pack.")
    .argument("<task>", "Task description to compile context for.")
    .option("--mode <mode>", "Context compiler mode.")
    .option("--token-budget <number>", "Advisory token target for context packaging.")
    .option("--file <path>", "File path retrieval hint.", collectRepeated, [])
    .option("--changed-file <path>", "Changed file retrieval hint.", collectRepeated, [])
    .option("--symbol <name>", "Symbol retrieval hint.", collectRepeated, [])
    .option("--subsystem <name>", "Subsystem retrieval hint.", collectRepeated, [])
    .option("--history-window <duration>", "Git history window hint such as 30d, 12w, 6m, or 1y.")
    .action(async (task: string, commandOptions: LoadCommandFlags, command: Command) => {
      const hasExplicitTokenBudget = commandOptions.tokenBudget !== undefined;
      const result = await loadMemory(
        loadMemoryOptions(options, task, commandOptions)
      );
      const rendered = renderAppResult(
        cliLoadResult(result, hasExplicitTokenBudget),
        {
          json: isJsonMode(command),
          renderData: renderLoadData
        }
      );

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

function loadMemoryOptions(
  options: RegisterLoadCommandOptions,
  task: string,
  flags: LoadCommandFlags
): LoadMemoryOptions {
  return {
    cwd: options.cwd,
    task,
    ...(flags.mode === undefined ? {} : { mode: flags.mode }),
    ...(flags.tokenBudget === undefined
      ? {}
      : { token_budget: Number(flags.tokenBudget) }),
    ...hintsFromFlags(flags)
  };
}

function hintsFromFlags(flags: LoadCommandFlags): Pick<LoadMemoryOptions, "hints"> {
  const hints = {
    files: flags.file ?? [],
    changed_files: flags.changedFile ?? [],
    symbols: flags.symbol ?? [],
    subsystems: flags.subsystem ?? [],
    ...(flags.historyWindow === undefined ? {} : { history_window: flags.historyWindow })
  };

  return hints.files.length === 0 &&
    hints.changed_files.length === 0 &&
    hints.symbols.length === 0 &&
    hints.subsystems.length === 0 &&
    hints.history_window === undefined
    ? {}
    : { hints };
}

function collectRepeated(value: string, previous: string[]): string[] {
  return [...previous, value];
}

function cliLoadResult(
  result: AppResult<LoadMemoryData>,
  hasExplicitTokenBudget: boolean
): AppResult<CliLoadMemoryData> {
  if (!result.ok) {
    return result;
  }

  return {
    ok: true,
    data: {
      task: result.data.task,
      mode: result.data.mode,
      token_budget: hasExplicitTokenBudget ? result.data.token_budget : null,
      context_pack: result.data.context_pack,
      token_target: hasExplicitTokenBudget ? result.data.token_target.value : null,
      estimated_tokens: result.data.estimated_tokens,
      budget_status: hasExplicitTokenBudget
        ? result.data.budget_status
        : "not_requested",
      truncated: result.data.truncated,
      source: result.data.source,
      included_ids: result.data.included_ids,
      excluded_ids: result.data.excluded_ids,
      omitted_ids: result.data.omitted_ids
    },
    warnings: result.warnings,
    meta: result.meta
  };
}

function isJsonMode(command: Command): boolean {
  const options = command.optsWithGlobals() as { json?: unknown };
  return options.json === true;
}

function renderLoadData(data: CliLoadMemoryData): string {
  return data.context_pack;
}
