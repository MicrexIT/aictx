import type { CallToolResult, ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import { diffMemory } from "../../app/operations.js";

interface AictxMcpContext {
  cwd: string;
}

const DIFF_MEMORY_INPUT_SCHEMA = z.object({}).strict();

type DiffMemoryArgs = z.infer<typeof DIFF_MEMORY_INPUT_SCHEMA>;

const READ_ONLY_TOOL_ANNOTATIONS: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false
};

export const diffMemoryTool = {
  name: "diff_memory",
  title: "Diff Aictx Memory",
  description: "Show Git diff output scoped to Aictx memory files.",
  inputSchema: DIFF_MEMORY_INPUT_SCHEMA,
  annotations: READ_ONLY_TOOL_ANNOTATIONS,
  call: callDiffMemoryTool
};

async function callDiffMemoryTool(
  context: AictxMcpContext,
  _args: DiffMemoryArgs
): Promise<CallToolResult> {
  const result = await diffMemory({ cwd: context.cwd });

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
