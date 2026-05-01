import { CommanderError, type Command } from "commander";

import { initProject, type InitProjectOptions } from "../../app/operations.js";
import { CLI_EXIT_SUCCESS } from "../exit.js";
import { renderAppResult } from "../render.js";

type CliOutputWriter = (text: string) => void;

export interface RegisterInitCommandOptions {
  cwd: string;
  stdout: CliOutputWriter;
  stderr: CliOutputWriter;
}

export function registerInitCommand(
  program: Command,
  options: RegisterInitCommandOptions
): void {
  program
    .command("init")
    .description("Initialize Aictx memory storage in this project.")
    .option("--no-agent-guidance", "Skip AGENTS.md and CLAUDE.md setup.")
    .option("--force", "Discard existing Aictx storage and initialize from scratch.")
    .action(async (commandOptions: InitCommandOptions, command: Command) => {
      const result = await initProject(initProjectOptions(options, commandOptions));
      const rendered = renderAppResult(result, {
        json: isJsonMode(command),
        renderData: renderInitData
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
    });
}

interface InitCommandOptions {
  agentGuidance?: boolean;
  force?: boolean;
}

function initProjectOptions(
  options: RegisterInitCommandOptions,
  commandOptions: InitCommandOptions
): InitProjectOptions {
  return {
    cwd: options.cwd,
    agentGuidance: commandOptions.agentGuidance !== false,
    force: commandOptions.force === true
  };
}

function isJsonMode(command: Command): boolean {
  const options = command.optsWithGlobals() as { json?: unknown };
  return options.json === true;
}

function renderInitData(data: {
  created: boolean;
  files_created: string[];
  gitignore_updated: boolean;
  index_built: boolean;
  agent_guidance: {
    enabled: boolean;
    targets: Array<{ path: string; status: string }>;
    optional_skills: string[];
  };
  next_steps: string[];
}): string {
  const lines = [
    data.created ? "Initialized Aictx." : "Aictx is already initialized.",
    ...renderCreatedFiles(data.files_created),
    `Gitignore ${data.gitignore_updated ? "updated" : "unchanged"}.`,
    `Index ${data.index_built ? "built" : "not built"}.`,
    ...renderAgentGuidance(data.agent_guidance),
    ...renderNextSteps(data.next_steps)
  ];

  return lines.join("\n");
}

function renderCreatedFiles(filesCreated: readonly string[]): string[] {
  if (filesCreated.length === 0) {
    return [];
  }

  return ["Created files:", ...filesCreated.map((file) => `- ${file}`)];
}

function renderAgentGuidance(agentGuidance: {
  enabled: boolean;
  targets: Array<{ path: string; status: string }>;
  optional_skills: string[];
}): string[] {
  if (!agentGuidance.enabled) {
    return ["Agent guidance skipped."];
  }

  return [
    "Agent guidance installed:",
    ...agentGuidance.targets.map((target) => `- ${target.path}: ${target.status}`),
    `Optional bundled skills: ${agentGuidance.optional_skills.join(", ")}`
  ];
}

function renderNextSteps(nextSteps: readonly string[]): string[] {
  if (nextSteps.length === 0) {
    return [];
  }

  return ["Next steps:", ...nextSteps.map((step) => `- ${step}`)];
}
