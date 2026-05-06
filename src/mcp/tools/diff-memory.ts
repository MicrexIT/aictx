import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import { dataAccessService } from "../../data-access/index.js";
import {
  PROJECT_ROOT_ARGUMENT_DESCRIPTION,
  resolveMcpProjectCwd,
  type AictxMcpContext,
  type ProjectScopedMcpArgs
} from "../context.js";
import {
  READ_ONLY_TOOL_ANNOTATIONS,
  toMcpToolResult
} from "./shared.js";

const DIFF_MEMORY_INPUT_SCHEMA = z
  .object({
    project_root: z
      .string()
      .optional()
      .describe(PROJECT_ROOT_ARGUMENT_DESCRIPTION)
  })
  .strict();

type DiffMemoryArgs = z.infer<typeof DIFF_MEMORY_INPUT_SCHEMA> & ProjectScopedMcpArgs;

export const diffMemoryTool = {
  name: "diff_memory",
  title: "Diff Aictx Memory",
  description: "Show Aictx memory changes, including untracked memory files.",
  inputSchema: DIFF_MEMORY_INPUT_SCHEMA,
  annotations: READ_ONLY_TOOL_ANNOTATIONS,
  call: callDiffMemoryTool
};

async function callDiffMemoryTool(
  context: AictxMcpContext,
  args: DiffMemoryArgs
): Promise<CallToolResult> {
  const result = await dataAccessService.diff({
    target: {
      kind: "cwd",
      cwd: resolveMcpProjectCwd(context, args)
    }
  });

  return toMcpToolResult(result);
}
