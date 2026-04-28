import type { CallToolResult, ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import {
  searchMemory,
  type SearchMemoryOptions
} from "../../app/operations.js";

interface AictxMcpContext {
  cwd: string;
}

const SEARCH_MEMORY_INPUT_SCHEMA = z
  .object({
    query: z.string().describe("Search query."),
    limit: z
      .number()
      .optional()
      .describe("Optional maximum number of matches to return.")
  })
  .strict();

type SearchMemoryArgs = z.infer<typeof SEARCH_MEMORY_INPUT_SCHEMA>;

const READ_ONLY_TOOL_ANNOTATIONS: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false
};

export const searchMemoryTool = {
  name: "search_memory",
  title: "Search Aictx Memory",
  description: "Search local Aictx memory using the generated SQLite index.",
  inputSchema: SEARCH_MEMORY_INPUT_SCHEMA,
  annotations: READ_ONLY_TOOL_ANNOTATIONS,
  call: callSearchMemoryTool
};

async function callSearchMemoryTool(
  context: AictxMcpContext,
  args: SearchMemoryArgs
): Promise<CallToolResult> {
  const result = await searchMemory(parseSearchMemoryArgs(context, args));

  return toToolResult(result);
}

function parseSearchMemoryArgs(
  context: AictxMcpContext,
  args: SearchMemoryArgs
): SearchMemoryOptions {
  const options: SearchMemoryOptions = {
    cwd: context.cwd,
    query: args.query
  };

  if (args.limit !== undefined) {
    options.limit = args.limit;
  }

  return options;
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
