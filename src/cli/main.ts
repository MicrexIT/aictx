#!/usr/bin/env node

import type { Readable } from "node:stream";
import { Command, CommanderError } from "commander";
import { version } from "../generated/version.js";
import { registerCheckCommand } from "./commands/check.js";
import { registerDiffCommand } from "./commands/diff.js";
import { registerGraphCommand } from "./commands/graph.js";
import { registerInitCommand } from "./commands/init.js";
import { registerInspectCommand } from "./commands/inspect.js";
import { registerLoadCommand } from "./commands/load.js";
import { registerRebuildCommand } from "./commands/rebuild.js";
import { registerSaveCommand } from "./commands/save.js";
import { registerSearchCommand } from "./commands/search.js";
import { registerStaleCommand } from "./commands/stale.js";
import {
  CLI_EXIT_SUCCESS,
  CLI_EXIT_USAGE,
  type CliExitCode
} from "./exit.js";

export type CliOutputWriter = (text: string) => void;

export interface CliMainOptions {
  stdout?: CliOutputWriter;
  stderr?: CliOutputWriter;
  stdin?: Readable;
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
  registerCheckCommand(program, {
    cwd: options.cwd ?? process.cwd(),
    stdout: writeOut,
    stderr: writeErr
  });
  registerRebuildCommand(program, {
    cwd: options.cwd ?? process.cwd(),
    stdout: writeOut,
    stderr: writeErr
  });
  registerLoadCommand(program, {
    cwd: options.cwd ?? process.cwd(),
    stdout: writeOut,
    stderr: writeErr
  });
  registerSearchCommand(program, {
    cwd: options.cwd ?? process.cwd(),
    stdout: writeOut,
    stderr: writeErr
  });
  registerInspectCommand(program, {
    cwd: options.cwd ?? process.cwd(),
    stdout: writeOut,
    stderr: writeErr
  });
  registerStaleCommand(program, {
    cwd: options.cwd ?? process.cwd(),
    stdout: writeOut,
    stderr: writeErr
  });
  registerGraphCommand(program, {
    cwd: options.cwd ?? process.cwd(),
    stdout: writeOut,
    stderr: writeErr
  });
  registerDiffCommand(program, {
    cwd: options.cwd ?? process.cwd(),
    stdout: writeOut,
    stderr: writeErr
  });
  registerSaveCommand(program, {
    cwd: options.cwd ?? process.cwd(),
    stdin: options.stdin ?? process.stdin,
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
