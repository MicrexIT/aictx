#!/usr/bin/env node

import { Command, CommanderError } from "commander";
import { version } from "../generated/version.js";
import { registerInitCommand } from "./commands/init.js";
import {
  CLI_EXIT_SUCCESS,
  CLI_EXIT_USAGE,
  type CliExitCode
} from "./exit.js";

export type CliOutputWriter = (text: string) => void;

export interface CliMainOptions {
  stdout?: CliOutputWriter;
  stderr?: CliOutputWriter;
  cwd?: string;
}

export function createCliProgram(options: CliMainOptions = {}): Command {
  const program = new Command();
  const writeOut = options.stdout ?? ((text: string) => process.stdout.write(text));
  const writeErr = options.stderr ?? ((text: string) => process.stderr.write(text));

  program
    .name("aictx")
    .description("Aictx project memory CLI")
    .configureOutput({
      writeOut,
      writeErr
    })
    .exitOverride((error) => {
      throw error;
    })
    .version(version)
    .option("--json", "Render output as JSON.")
    .action(() => {
      program.outputHelp();
    });

  registerInitCommand(program, {
    cwd: options.cwd ?? process.cwd(),
    stdout: writeOut,
    stderr: writeErr
  });

  return program;
}

export async function main(
  argv = process.argv,
  options: CliMainOptions = {}
): Promise<CliExitCode> {
  try {
    await createCliProgram(options).parseAsync(argv);
    return CLI_EXIT_SUCCESS;
  } catch (error) {
    if (error instanceof CommanderError) {
      return exitCodeForCommanderError(error);
    }

    throw error;
  }
}

function exitCodeForCommanderError(error: CommanderError): CliExitCode {
  if (error.exitCode === CLI_EXIT_SUCCESS) {
    return CLI_EXIT_SUCCESS;
  }

  if (error.code === "aictx.command.failed" && isCliExitCode(error.exitCode)) {
    return error.exitCode;
  }

  return CLI_EXIT_USAGE;
}

function isCliExitCode(exitCode: number): exitCode is CliExitCode {
  return exitCode === 0 || exitCode === 1 || exitCode === 2 || exitCode === 3;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = await main();
}
