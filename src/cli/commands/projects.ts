import { CommanderError, type Command } from "commander";

import {
  addRegisteredProject,
  listRegisteredProjects,
  pruneRegisteredProjects,
  removeRegisteredProject,
  type ProjectRegistryAddData,
  type ProjectRegistryListData,
  type ProjectRegistryPruneData,
  type ProjectRegistryRemoveData,
  type RegisteredProjectSummary
} from "../../app/operations.js";
import { CLI_EXIT_SUCCESS, type CliExitCode } from "../exit.js";
import { renderAppResult } from "../render.js";

type CliOutputWriter = (text: string) => void;

export interface RegisterProjectsCommandOptions {
  cwd: string;
  stdout: CliOutputWriter;
  stderr: CliOutputWriter;
  memoryHome?: string;
}

export function registerProjectsCommand(
  program: Command,
  options: RegisterProjectsCommandOptions
): void {
  const projects = program
    .command("projects")
    .description("Manage the user-level Memory project registry.")
    .action((_commandOptions: unknown, command: Command) => {
      command.outputHelp();
    });

  projects
    .command("list")
    .description("List registered Memory projects.")
    .action(async (command: Command) => {
      const result = await listRegisteredProjects(projectRegistryOptions(options));
      const rendered = renderAppResult(result, {
        json: isJsonMode(command, program),
        renderData: renderListData
      });

      writeAndThrowOnFailure(rendered, options);
    });

  projects
    .command("add")
    .argument("[path]", "Project path to register. Defaults to the current directory.")
    .description("Add or refresh an initialized Memory project in the registry.")
    .action(async (path: string | undefined, command: Command) => {
      const result = await addRegisteredProject({
        ...projectRegistryOptions(options),
        ...(path === undefined ? {} : { path })
      });
      const rendered = renderAppResult(result, {
        json: isJsonMode(command, program),
        renderData: renderAddData
      });

      writeAndThrowOnFailure(rendered, options);
    });

  projects
    .command("remove")
    .argument("<identifier>", "Registry id, project id, or project path to remove.")
    .description("Remove a project from the registry.")
    .action(async (identifier: string, command: Command) => {
      const result = await removeRegisteredProject({
        ...projectRegistryOptions(options),
        identifier
      });
      const rendered = renderAppResult(result, {
        json: isJsonMode(command, program),
        renderData: renderRemoveData
      });

      writeAndThrowOnFailure(rendered, options);
    });

  projects
    .command("prune")
    .description("Remove registry entries whose Memory storage is unavailable.")
    .action(async (command: Command) => {
      const result = await pruneRegisteredProjects(projectRegistryOptions(options));
      const rendered = renderAppResult(result, {
        json: isJsonMode(command, program),
        renderData: renderPruneData
      });

      writeAndThrowOnFailure(rendered, options);
    });
}

function projectRegistryOptions(options: RegisterProjectsCommandOptions): {
  cwd: string;
  memoryHome?: string;
} {
  return {
    cwd: options.cwd,
    ...(options.memoryHome === undefined ? {} : { memoryHome: options.memoryHome })
  };
}

function renderListData(data: ProjectRegistryListData): string {
  return [
    `Memory project registry: ${data.registry_path}`,
    data.projects.length === 0
      ? "No registered projects."
      : `Registered projects: ${data.projects.length}`,
    ...data.projects.map(renderProject)
  ].join("\n");
}

function renderAddData(data: ProjectRegistryAddData): string {
  return [
    "Registered Memory project.",
    `Registry: ${data.registry_path}`,
    renderProject(data.project)
  ].join("\n");
}

function renderRemoveData(data: ProjectRegistryRemoveData): string {
  return [
    "Removed Memory project from registry.",
    `Registry: ${data.registry_path}`,
    renderProject(data.removed)
  ].join("\n");
}

function renderPruneData(data: ProjectRegistryPruneData): string {
  return [
    `Memory project registry: ${data.registry_path}`,
    `Remaining projects: ${data.projects.length}`,
    `Removed projects: ${data.removed.length}`,
    ...data.removed.map(renderProject)
  ].join("\n");
}

function renderProject(project: RegisteredProjectSummary): string {
  return [
    `- ${project.project.name} (${project.project.id})`,
    `  registry_id: ${project.registry_id}`,
    `  project_root: ${project.project_root}`,
    `  source: ${project.source}`,
    `  last_seen_at: ${project.last_seen_at}`
  ].join("\n");
}

function isJsonMode(command: unknown, program: Command): boolean {
  const target = isCommand(command) ? command : program;
  const options = target.optsWithGlobals() as { json?: unknown };
  return options.json === true;
}

function isCommand(value: unknown): value is Command {
  return typeof value === "object" &&
    value !== null &&
    "optsWithGlobals" in value &&
    typeof value.optsWithGlobals === "function";
}

function writeAndThrowOnFailure(
  rendered: { stdout: string; stderr: string; exitCode: CliExitCode },
  options: RegisterProjectsCommandOptions
): void {
  options.stdout(rendered.stdout);
  options.stderr(rendered.stderr);

  if (rendered.exitCode !== CLI_EXIT_SUCCESS) {
    throwCommandFailed(rendered.exitCode);
  }
}

function throwCommandFailed(exitCode: CliExitCode): never {
  throw new CommanderError(
    exitCode,
    "memory.command.failed",
    "Memory command failed."
  );
}
