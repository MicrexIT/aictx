import { CommanderError, type Command } from "commander";

import {
  dataAccessService,
  type DataAccessInspectInput,
  type InspectMemoryData,
  type MemoryRelationSummary
} from "../../data-access/index.js";
import { CLI_EXIT_SUCCESS, type CliExitCode } from "../exit.js";
import { renderAppResult } from "../render.js";

type CliOutputWriter = (text: string) => void;

export interface RegisterInspectCommandOptions {
  cwd: string;
  stdout: CliOutputWriter;
  stderr: CliOutputWriter;
}

export function registerInspectCommand(
  program: Command,
  options: RegisterInspectCommandOptions
): void {
  program
    .command("inspect")
    .description("Show one Memory object and its direct relations.")
    .argument("<id>", "Memory object ID to inspect.")
    .action(async (id: string, _commandOptions: unknown, command: Command) => {
      const result = await dataAccessService.inspect(inspectMemoryOptions(options, id));
      const rendered = renderAppResult(result, {
        json: isJsonMode(command),
        renderData: renderInspectData
      });

      options.stdout(rendered.stdout);
      options.stderr(rendered.stderr);

      if (rendered.exitCode !== CLI_EXIT_SUCCESS) {
        throwCommandFailed(rendered.exitCode);
      }
    });
}

function inspectMemoryOptions(
  options: RegisterInspectCommandOptions,
  id: string
): DataAccessInspectInput {
  return {
    target: {
      kind: "cwd",
      cwd: options.cwd
    },
    id
  };
}

function isJsonMode(command: Command): boolean {
  const options = command.optsWithGlobals() as { json?: unknown };
  return options.json === true;
}

function renderInspectData(data: InspectMemoryData): string {
  return [
    `${data.object.id} (${data.object.type}, ${data.object.status})`,
    `Title: ${data.object.title}`,
    `Path: ${data.object.body_path}`,
    `JSON: ${data.object.json_path}`,
    ...renderTags(data.object.tags),
    ...renderRelations("Outgoing relations", data.relations.outgoing),
    ...renderRelations("Incoming relations", data.relations.incoming),
    "Body:",
    data.object.body.trimEnd()
  ].join("\n");
}

function renderTags(tags: readonly string[]): string[] {
  if (tags.length === 0) {
    return [];
  }

  return [`Tags: ${tags.join(", ")}`];
}

function renderRelations(
  label: string,
  relations: readonly MemoryRelationSummary[]
): string[] {
  if (relations.length === 0) {
    return [`${label}: none`];
  }

  return [`${label}:`, ...relations.map((relation) => `- ${renderRelation(relation)}`)];
}

function renderRelation(relation: MemoryRelationSummary): string {
  return `${relation.id}: ${relation.from} ${relation.predicate} ${relation.to} (${relation.status})`;
}

function throwCommandFailed(exitCode: CliExitCode): never {
  throw new CommanderError(
    exitCode,
    "memory.command.failed",
    "Memory command failed."
  );
}
