import { CommanderError, type Command } from "commander";

import {
  exportObsidianProjection,
  type ExportObsidianProjectionData,
  type ExportObsidianProjectionOptions
} from "../../app/operations.js";
import { CLI_EXIT_SUCCESS, type CliExitCode } from "../exit.js";
import { renderAppResult } from "../render.js";

type CliOutputWriter = (text: string) => void;

export interface RegisterExportCommandOptions {
  cwd: string;
  stdout: CliOutputWriter;
  stderr: CliOutputWriter;
}

interface ExportObsidianFlags {
  out?: string;
}

export function registerExportCommand(
  program: Command,
  options: RegisterExportCommandOptions
): void {
  const exportCommand = program
    .command("export")
    .description("Export generated Aictx projections.")
    .action((_commandOptions: unknown, command: Command) => {
      command.outputHelp();
    });

  exportCommand
    .command("obsidian")
    .description("Export a generated Obsidian-compatible projection.")
    .option("--out <dir>", "Output directory inside the project root.")
    .action(async (flags: ExportObsidianFlags, command: Command) => {
      const result = await exportObsidianProjection(
        exportObsidianProjectionOptions(options, flags)
      );
      const rendered = renderAppResult(result, {
        json: isJsonMode(command),
        renderData: renderExportObsidianData
      });

      options.stdout(rendered.stdout);
      options.stderr(rendered.stderr);

      if (rendered.exitCode !== CLI_EXIT_SUCCESS) {
        throwCommandFailed(rendered.exitCode);
      }
    });
}

function exportObsidianProjectionOptions(
  options: RegisterExportCommandOptions,
  flags: ExportObsidianFlags
): ExportObsidianProjectionOptions {
  return {
    cwd: options.cwd,
    ...(flags.out === undefined ? {} : { outDir: flags.out })
  };
}

function isJsonMode(command: Command): boolean {
  const options = command.optsWithGlobals() as { json?: unknown };
  return options.json === true;
}

function renderExportObsidianData(data: ExportObsidianProjectionData): string {
  return [
    "Exported Obsidian projection.",
    `Output: ${data.output_dir}`,
    `Manifest: ${data.manifest_path}`,
    `Objects exported: ${data.objects_exported}`,
    `Relations linked: ${data.relations_linked}`,
    ...renderFiles("Files written", data.files_written),
    ...renderFiles("Files removed", data.files_removed)
  ].join("\n");
}

function renderFiles(label: string, files: readonly string[]): string[] {
  if (files.length === 0) {
    return [`${label}: 0`];
  }

  return [`${label}: ${files.length}`, ...files.map((file) => `- ${file}`)];
}

function throwCommandFailed(exitCode: CliExitCode): never {
  throw new CommanderError(
    exitCode,
    "aictx.command.failed",
    "Aictx command failed."
  );
}
