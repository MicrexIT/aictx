#!/usr/bin/env node

import { Command } from "commander";
import { version } from "../generated/version.js";

export function createCliProgram(): Command {
  const program = new Command();

  program
    .name("aictx")
    .description("Aictx project memory CLI")
    .version(version)
    .action(() => {
      program.outputHelp();
    });

  return program;
}

export async function main(argv = process.argv): Promise<void> {
  await createCliProgram().parseAsync(argv);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
