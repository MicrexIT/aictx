import { CommanderError, type Command } from "commander";

import {
  upgradeStorage,
  type UpgradeStorageData,
  type UpgradeStorageOptions
} from "../../app/operations.js";
import { CLI_EXIT_SUCCESS, type CliExitCode } from "../exit.js";
import { renderAppResult } from "../render.js";

type CliOutputWriter = (text: string) => void;

export interface RegisterUpgradeCommandOptions {
  cwd: string;
  stdout: CliOutputWriter;
  stderr: CliOutputWriter;
}

export function registerUpgradeCommand(
  program: Command,
  options: RegisterUpgradeCommandOptions
): void {
  program
    .command("upgrade")
    .description("Upgrade Aictx storage to the latest supported schema.")
    .action(async (_commandOptions: unknown, command: Command) => {
      const result = await upgradeStorage(upgradeStorageOptions(options));
      const rendered = renderAppResult(result, {
        json: isJsonMode(command),
        renderData: renderUpgradeData
      });

      options.stdout(rendered.stdout);
      options.stderr(rendered.stderr);

      if (rendered.exitCode !== CLI_EXIT_SUCCESS) {
        throwCommandFailed(rendered.exitCode);
      }
    });
}

function upgradeStorageOptions(
  options: RegisterUpgradeCommandOptions
): UpgradeStorageOptions {
  return {
    cwd: options.cwd
  };
}

function isJsonMode(command: Command): boolean {
  const options = command.optsWithGlobals() as { json?: unknown };
  return options.json === true;
}

function renderUpgradeData(data: UpgradeStorageData): string {
  return [
    data.upgraded ? "Upgraded Aictx storage." : "Aictx storage is already up to date.",
    `Storage version: ${data.from_version} -> ${data.to_version}`,
    renderList("Files changed", data.files_changed),
    renderList("Objects upgraded", data.objects_upgraded)
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
