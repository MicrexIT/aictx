import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import { dataAccessService } from "../../data-access/index.js";
import {
  PROJECT_ROOT_ARGUMENT_DESCRIPTION,
  resolveMcpProjectCwd,
  type MemoryMcpContext,
  type ProjectScopedMcpArgs
} from "../context.js";
import {
  READ_ONLY_TOOL_ANNOTATIONS,
  toMcpToolResult
} from "./shared.js";

const INSPECT_MEMORY_INPUT_SCHEMA = z
  .object({
    id: z.string().describe("Memory object ID to inspect."),
    project_root: z
      .string()
      .optional()
      .describe(PROJECT_ROOT_ARGUMENT_DESCRIPTION)
  })
  .strict();

type InspectMemoryArgs = z.infer<typeof INSPECT_MEMORY_INPUT_SCHEMA> & ProjectScopedMcpArgs;

export const inspectMemoryTool = {
  name: "inspect_memory",
  title: "Inspect Memory",
  description: "Inspect one Memory object and its direct relations.",
  inputSchema: INSPECT_MEMORY_INPUT_SCHEMA,
  annotations: READ_ONLY_TOOL_ANNOTATIONS,
  call: callInspectMemoryTool
};

async function callInspectMemoryTool(
  context: MemoryMcpContext,
  args: InspectMemoryArgs
): Promise<CallToolResult> {
  const result = await dataAccessService.inspect({
    target: {
      kind: "cwd",
      cwd: resolveMcpProjectCwd(context, args)
    },
    id: args.id
  });

  return toMcpToolResult(result);
}
