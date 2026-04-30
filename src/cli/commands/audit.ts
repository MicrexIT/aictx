import { CommanderError, type Command } from "commander";

import {
  auditMemory,
  type AuditFinding,
  type AuditMemoryData,
  type AuditMemoryOptions
} from "../../app/operations.js";
import { CLI_EXIT_SUCCESS, type CliExitCode } from "../exit.js";
import { renderAppResult } from "../render.js";

type CliOutputWriter = (text: string) => void;

export interface RegisterAuditCommandOptions {
  cwd: string;
  stdout: CliOutputWriter;
  stderr: CliOutputWriter;
}

export function registerAuditCommand(
  program: Command,
  options: RegisterAuditCommandOptions
): void {
  program
    .command("audit")
    .description("Report deterministic Aictx memory hygiene findings.")
    .action(async (_commandOptions: unknown, command: Command) => {
      const result = await auditMemory(auditMemoryOptions(options));
      const rendered = renderAppResult(result, {
        json: isJsonMode(command),
        renderData: renderAuditData
      });

      options.stdout(rendered.stdout);
      options.stderr(rendered.stderr);

      if (rendered.exitCode !== CLI_EXIT_SUCCESS) {
        throwCommandFailed(rendered.exitCode);
      }
    });
}

function auditMemoryOptions(
  options: RegisterAuditCommandOptions
): AuditMemoryOptions {
  return {
    cwd: options.cwd
  };
}

function isJsonMode(command: Command): boolean {
  const options = command.optsWithGlobals() as { json?: unknown };
  return options.json === true;
}

function renderAuditData(data: AuditMemoryData): string {
  if (data.findings.length === 0) {
    return "No Aictx audit findings.";
  }

  return ["Aictx audit findings:", ...data.findings.map(renderFinding)].join("\n");
}

function renderFinding(finding: AuditFinding): string {
  return [
    `- [${finding.severity}] ${finding.rule} ${finding.memory_id}: ${finding.message}`,
    `  evidence: ${renderEvidence(finding)}`
  ].join("\n");
}

function renderEvidence(finding: AuditFinding): string {
  if (finding.evidence.length === 0) {
    return "none";
  }

  return finding.evidence
    .map((evidence) => `${evidence.kind}:${evidence.id}`)
    .join(", ");
}

function throwCommandFailed(exitCode: CliExitCode): never {
  throw new CommanderError(
    exitCode,
    "aictx.command.failed",
    "Aictx command failed."
  );
}
