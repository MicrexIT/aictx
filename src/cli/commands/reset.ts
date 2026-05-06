import { CommanderError, type Command } from "commander";

import {
  resetAllAictx,
  resetAictx,
  unregisterProjectRoot,
  type ResetAllAictxData,
  type ResetAictxData,
  type ResetAictxOptions
} from "../../app/operations.js";
import { CLI_EXIT_SUCCESS } from "../exit.js";
import { renderAppResult } from "../render.js";

type CliOutputWriter = (text: string) => void;

export interface RegisterResetCommandOptions {
  cwd: string;
  stdout: CliOutputWriter;
  stderr: CliOutputWriter;
  aictxHome?: string;
  registryEnabled?: boolean;
}

export function registerResetCommand(
  program: Command,
  options: RegisterResetCommandOptions
): void {
  program
    .command("reset")
    .description("Back up and clear local Aictx storage.")
    .option("--all", "Reset every project in the user-level Aictx project registry.")
    .option("--destroy", "Delete the entire .aictx directory without creating a backup.")
    .action(async (commandOptions: ResetCommandOptions, command: Command) => {
      if (commandOptions.all === true) {
        const result = await resetAllAictx(resetAictxOptions(options, commandOptions));
        const rendered = renderAppResult(result, {
          json: isJsonMode(command),
          renderData: renderResetAllAictxData
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

        return;
      }

      const result = await resetAictx(resetAictxOptions(options, commandOptions));
      const rendered = renderAppResult(result, {
        json: isJsonMode(command),
        renderData: renderResetAictxData
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

      if (result.ok && options.registryEnabled !== false) {
        const unregistered = await unregisterProjectRoot({
          cwd: options.cwd,
          projectRoot: result.meta.project_root,
          ...(options.aictxHome === undefined ? {} : { aictxHome: options.aictxHome })
        });

        if (!unregistered.ok) {
          options.stderr(`warning: Project registry was not updated: ${unregistered.error.message}\n`);
        }
      }
    });
}

interface ResetCommandOptions {
  all?: boolean;
  destroy?: boolean;
}

function resetAictxOptions(
  options: RegisterResetCommandOptions,
  commandOptions: ResetCommandOptions
): ResetAictxOptions {
  return {
    cwd: options.cwd,
    destroy: commandOptions.destroy === true,
    ...(options.aictxHome === undefined ? {} : { aictxHome: options.aictxHome })
  };
}

function isJsonMode(command: Command): boolean {
  const options = command.optsWithGlobals() as { json?: unknown };
  return options.json === true;
}

function renderResetAictxData(data: ResetAictxData): string {
  if (data.destroyed) {
    return "Deleted .aictx.";
  }

  return [
    "Backed up and cleared .aictx.",
    `Backup: ${data.backup_path ?? "none"}`,
    ...renderList("Removed entries", data.entries_removed)
  ].join("\n");
}

function renderResetAllAictxData(data: ResetAllAictxData): string {
  return [
    data.destroyed
      ? "Deleted .aictx for registered projects."
      : "Backed up and cleared .aictx for registered projects.",
    `Registry: ${data.registry_path}`,
    `Projects reset: ${data.projects_reset.length}`,
    `Projects skipped: ${data.projects_skipped.length}`,
    `Projects failed: ${data.projects_failed.length}`,
    ...data.projects_reset.map((project) => renderResetAllProject(project)),
    ...data.projects_skipped.map((project) => renderSkippedProject(project)),
    ...data.projects_failed.map((project) => renderFailedProject(project))
  ].join("\n");
}

function renderResetAllProject(project: ResetAllAictxData["projects_reset"][number]): string {
  return [
    `- reset: ${project.project.name} (${project.project.id})`,
    `  project_root: ${project.project_root}`,
    `  backup: ${project.backup_path ?? "none"}`,
    ...renderIndentedList("  removed", project.entries_removed)
  ].join("\n");
}

function renderSkippedProject(project: ResetAllAictxData["projects_skipped"][number]): string {
  return [
    `- skipped: ${project.project.name} (${project.project.id})`,
    `  project_root: ${project.project_root}`,
    `  reason: ${project.reason}`
  ].join("\n");
}

function renderFailedProject(project: ResetAllAictxData["projects_failed"][number]): string {
  return [
    `- failed: ${project.project.name} (${project.project.id})`,
    `  project_root: ${project.project_root}`,
    `  error: ${project.error.code}: ${project.error.message}`
  ].join("\n");
}

function renderList(label: string, values: readonly string[]): string[] {
  if (values.length === 0) {
    return [];
  }

  return [`${label}:`, ...values.map((value) => `- ${value}`)];
}

function renderIndentedList(label: string, values: readonly string[]): string[] {
  if (values.length === 0) {
    return [];
  }

  return [`${label}:`, ...values.map((value) => `  - ${value}`)];
}
