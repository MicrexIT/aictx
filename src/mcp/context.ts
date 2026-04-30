import { resolve } from "node:path";

export interface AictxMcpContext {
  cwd: string;
}

export interface ProjectScopedMcpArgs {
  project_root?: string | undefined;
}

export const PROJECT_ROOT_ARGUMENT_DESCRIPTION =
  "Optional project root to run this tool against. Use this when one globally started MCP server serves multiple Aictx projects. Relative paths resolve from the MCP server launch directory; absolute paths are recommended.";

export function resolveMcpProjectCwd(
  context: AictxMcpContext,
  args: ProjectScopedMcpArgs
): string {
  return resolve(context.cwd, args.project_root ?? ".");
}
