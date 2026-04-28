import { CommanderError, type Command } from "commander";

import {
  graphMemory,
  type GraphMemoryData,
  type GraphMemoryOptions,
  type MemoryObjectSummary,
  type MemoryRelationSummary
} from "../../app/operations.js";
import { CLI_EXIT_SUCCESS, type CliExitCode } from "../exit.js";
import { renderAppResult } from "../render.js";

type CliOutputWriter = (text: string) => void;

export interface RegisterGraphCommandOptions {
  cwd: string;
  stdout: CliOutputWriter;
  stderr: CliOutputWriter;
}

export function registerGraphCommand(
  program: Command,
  options: RegisterGraphCommandOptions
): void {
  program
    .command("graph")
    .description("Show a one-hop Aictx relation neighborhood for debugging.")
    .argument("<id>", "Memory object ID at the center of the graph.")
    .action(async (id: string, _commandOptions: unknown, command: Command) => {
      const result = await graphMemory(graphMemoryOptions(options, id));
      const rendered = renderAppResult(result, {
        json: isJsonMode(command),
        renderData: renderGraphData
      });

      options.stdout(rendered.stdout);
      options.stderr(rendered.stderr);

      if (rendered.exitCode !== CLI_EXIT_SUCCESS) {
        throwCommandFailed(rendered.exitCode);
      }
    });
}

function graphMemoryOptions(
  options: RegisterGraphCommandOptions,
  id: string
): GraphMemoryOptions {
  return {
    cwd: options.cwd,
    id
  };
}

function isJsonMode(command: Command): boolean {
  const options = command.optsWithGlobals() as { json?: unknown };
  return options.json === true;
}

function renderGraphData(data: GraphMemoryData): string {
  return [
    `Relation neighborhood for ${data.root_id}`,
    ...renderObjects(data.objects),
    ...renderRelations(data.relations)
  ].join("\n");
}

function renderObjects(objects: readonly MemoryObjectSummary[]): string[] {
  if (objects.length === 0) {
    return ["Objects: none"];
  }

  return ["Objects:", ...objects.map((object) => `- ${renderObject(object)}`)];
}

function renderObject(object: MemoryObjectSummary): string {
  return `${object.id} (${object.type}, ${object.status}) ${object.title}`;
}

function renderRelations(relations: readonly MemoryRelationSummary[]): string[] {
  if (relations.length === 0) {
    return ["Relations: none"];
  }

  return ["Relations:", ...relations.map((relation) => `- ${renderRelation(relation)}`)];
}

function renderRelation(relation: MemoryRelationSummary): string {
  return `${relation.id}: ${relation.from} ${relation.predicate} ${relation.to} (${relation.status})`;
}

function throwCommandFailed(exitCode: CliExitCode): never {
  throw new CommanderError(
    exitCode,
    "aictx.command.failed",
    "Aictx command failed."
  );
}
