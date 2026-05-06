import { resolve } from "node:path";

export interface AictxMcpContext {
  cwd: string;
}

export interface ProjectScopedMcpArgs {
  project_root?: string | undefined;
}

export const PROJECT_ROOT_ARGUMENT_DESCRIPTION =
  "Optional initialized local Aictx project root to select for this tool call. Use this when one globally started MCP server serves multiple projects. This selects a project; it is not arbitrary filesystem access, and reads/writes remain confined to the resolved project's .aictx directory. Relative paths resolve from the MCP server launch directory; absolute paths are recommended.";

export function resolveMcpProjectCwd(
  context: AictxMcpContext,
  args: ProjectScopedMcpArgs
): string {
  return resolve(context.cwd, args.project_root ?? ".");
}
