import { CommanderError, type Command } from "commander";

import {
  checkProject,
  type CheckProjectData,
  type CheckProjectOptions
} from "../../app/operations.js";
import type { ValidationIssue } from "../../core/types.js";
import {
  CLI_EXIT_ERROR,
  CLI_EXIT_SUCCESS,
  type CliExitCode
} from "../exit.js";
import { renderAppResult } from "../render.js";

type CliOutputWriter = (text: string) => void;

export interface RegisterCheckCommandOptions {
  cwd: string;
  stdout: CliOutputWriter;
  stderr: CliOutputWriter;
}

export function registerCheckCommand(
  program: Command,
  options: RegisterCheckCommandOptions
): void {
  program
    .command("check")
    .description("Validate Memory canonical storage and generated index health.")
    .action(async (_commandOptions: unknown, command: Command) => {
      const result = await checkProject(checkProjectOptions(options));
      const rendered = renderAppResult(result, {
        json: isJsonMode(command),
        renderData: renderCheckData
      });
      const exitCode = checkExitCode(result, rendered.exitCode);

      options.stdout(rendered.stdout);
      options.stderr(rendered.stderr);

      if (exitCode !== CLI_EXIT_SUCCESS) {
        throw new CommanderError(
          exitCode,
          "memory.command.failed",
          "Memory command failed."
        );
      }
    });
}

function checkProjectOptions(options: RegisterCheckCommandOptions): CheckProjectOptions {
  return {
    cwd: options.cwd
  };
}

function checkExitCode(
  result: Awaited<ReturnType<typeof checkProject>>,
  renderedExitCode: CliExitCode
): CliExitCode {
  if (result.ok && !result.data.valid) {
    return CLI_EXIT_ERROR;
  }

  return renderedExitCode;
}

function isJsonMode(command: Command): boolean {
  const options = command.optsWithGlobals() as { json?: unknown };
  return options.json === true;
}

function renderCheckData(data: CheckProjectData): string {
  const lines = [
    data.valid ? "Memory check passed." : "Memory check failed.",
    ...renderIssues("Errors", data.errors),
    ...renderIssues("Warnings", data.warnings)
  ];

  return lines.join("\n");
}

function renderIssues(label: string, issues: readonly ValidationIssue[]): string[] {
  if (issues.length === 0) {
    return [];
  }

  return [label, ...issues.map(renderIssue)];
}

function renderIssue(issue: ValidationIssue): string {
  const field = issue.field === null ? "" : ` ${issue.field}`;
  return `- [${issue.code}] ${issue.path}${field}: ${issue.message}`;
}
