import type { CallToolResult, ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import { inspectMemory } from "../../app/operations.js";
import {
  PROJECT_ROOT_ARGUMENT_DESCRIPTION,
  resolveMcpProjectCwd,
  type AictxMcpContext,
  type ProjectScopedMcpArgs
} from "../context.js";

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

const READ_ONLY_TOOL_ANNOTATIONS: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false
};

export const inspectMemoryTool = {
  name: "inspect_memory",
  title: "Inspect Aictx Memory",
  description: "Inspect one Aictx memory object and its direct relations.",
  inputSchema: INSPECT_MEMORY_INPUT_SCHEMA,
  annotations: READ_ONLY_TOOL_ANNOTATIONS,
  call: callInspectMemoryTool
};

async function callInspectMemoryTool(
  context: AictxMcpContext,
  args: InspectMemoryArgs
): Promise<CallToolResult> {
  const result = await inspectMemory({
    cwd: resolveMcpProjectCwd(context, args),
    id: args.id
  });

  return toToolResult(result);
}

function toToolResult(envelope: object): CallToolResult {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(envelope)
      }
    ],
    structuredContent: envelope as Record<string, unknown>
  };
}
