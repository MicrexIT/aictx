import { CommanderError, type Command } from "commander";

import {
  resetAllMemory,
  resetMemory,
  unregisterProjectRoot,
  type ResetAllMemoryData,
  type ResetMemoryData,
  type ResetMemoryOptions
} from "../../app/operations.js";
import { CLI_EXIT_SUCCESS } from "../exit.js";
import { renderAppResult } from "../render.js";

type CliOutputWriter = (text: string) => void;

export interface RegisterResetCommandOptions {
  cwd: string;
  stdout: CliOutputWriter;
  stderr: CliOutputWriter;
  memoryHome?: string;
  registryEnabled?: boolean;
}

export function registerResetCommand(
  program: Command,
  options: RegisterResetCommandOptions
): void {
  program
    .command("reset")
    .description("Back up and clear local Memory storage.")
    .option("--all", "Reset every project in the user-level Memory project registry.")
    .option("--destroy", "Delete the entire .memory directory without creating a backup.")
    .action(async (commandOptions: ResetCommandOptions, command: Command) => {
      if (commandOptions.all === true) {
        const result = await resetAllMemory(resetMemoryOptions(options, commandOptions));
        const rendered = renderAppResult(result, {
          json: isJsonMode(command),
          renderData: renderResetAllMemoryData
        });

        options.stdout(rendered.stdout);
        options.stderr(rendered.stderr);

        if (rendered.exitCode !== CLI_EXIT_SUCCESS) {
          throw new CommanderError(
            rendered.exitCode,
            "memory.command.failed",
            "Memory command failed."
          );
        }

        return;
      }

      const result = await resetMemory(resetMemoryOptions(options, commandOptions));
      const rendered = renderAppResult(result, {
        json: isJsonMode(command),
        renderData: renderResetMemoryData
      });

      options.stdout(rendered.stdout);
      options.stderr(rendered.stderr);

      if (rendered.exitCode !== CLI_EXIT_SUCCESS) {
        throw new CommanderError(
          rendered.exitCode,
          "memory.command.failed",
          "Memory command failed."
        );
      }

      if (result.ok && options.registryEnabled !== false) {
        const unregistered = await unregisterProjectRoot({
          cwd: options.cwd,
          projectRoot: result.meta.project_root,
          ...(options.memoryHome === undefined ? {} : { memoryHome: options.memoryHome })
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

function resetMemoryOptions(
  options: RegisterResetCommandOptions,
  commandOptions: ResetCommandOptions
): ResetMemoryOptions {
  return {
    cwd: options.cwd,
    destroy: commandOptions.destroy === true,
    ...(options.memoryHome === undefined ? {} : { memoryHome: options.memoryHome })
  };
}

function isJsonMode(command: Command): boolean {
  const options = command.optsWithGlobals() as { json?: unknown };
  return options.json === true;
}

function renderResetMemoryData(data: ResetMemoryData): string {
  if (data.destroyed) {
    return "Deleted .memory.";
  }

  return [
    "Backed up and cleared .memory.",
    `Backup: ${data.backup_path ?? "none"}`,
    ...renderList("Removed entries", data.entries_removed)
  ].join("\n");
}

function renderResetAllMemoryData(data: ResetAllMemoryData): string {
  return [
    data.destroyed
      ? "Deleted .memory for registered projects."
      : "Backed up and cleared .memory for registered projects.",
    `Registry: ${data.registry_path}`,
    `Projects reset: ${data.projects_reset.length}`,
    `Projects skipped: ${data.projects_skipped.length}`,
    `Projects failed: ${data.projects_failed.length}`,
    ...data.projects_reset.map((project) => renderResetAllProject(project)),
    ...data.projects_skipped.map((project) => renderSkippedProject(project)),
    ...data.projects_failed.map((project) => renderFailedProject(project))
  ].join("\n");
}

function renderResetAllProject(project: ResetAllMemoryData["projects_reset"][number]): string {
  return [
    `- reset: ${project.project.name} (${project.project.id})`,
    `  project_root: ${project.project_root}`,
    `  backup: ${project.backup_path ?? "none"}`,
    ...renderIndentedList("  removed", project.entries_removed)
  ].join("\n");
}

function renderSkippedProject(project: ResetAllMemoryData["projects_skipped"][number]): string {
  return [
    `- skipped: ${project.project.name} (${project.project.id})`,
    `  project_root: ${project.project_root}`,
    `  reason: ${project.reason}`
  ].join("\n");
}

function renderFailedProject(project: ResetAllMemoryData["projects_failed"][number]): string {
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
