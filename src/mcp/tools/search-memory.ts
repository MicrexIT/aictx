import {
  ErrorCode,
  McpError,
  type CallToolResult,
  type ToolAnnotations
} from "@modelcontextprotocol/sdk/types.js";

import {
  searchMemory,
  type SearchMemoryOptions
} from "../../app/operations.js";

interface AictxMcpContext {
  cwd: string;
}

interface JsonObjectSchema {
  [key: string]: unknown;
  type: "object";
  properties?: Record<string, object>;
  required?: string[];
  additionalProperties?: boolean;
}

const SEARCH_MEMORY_INPUT_SCHEMA: JsonObjectSchema = {
  type: "object",
  properties: {
    query: {
      type: "string",
      description: "Search query."
    },
    limit: {
      type: "number",
      description: "Optional maximum number of matches to return."
    }
  },
  required: ["query"],
  additionalProperties: false
};

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
  args: Record<string, unknown>
): Promise<CallToolResult> {
  const result = await searchMemory(parseSearchMemoryArgs(context, args));

  return toToolResult(result);
}

function parseSearchMemoryArgs(
  context: AictxMcpContext,
  args: Record<string, unknown>
): SearchMemoryOptions {
  assertKnownArguments(args, ["query", "limit"], "search_memory");

  if (typeof args.query !== "string") {
    throw invalidParams("search_memory requires a string `query` argument.");
  }

  const options: SearchMemoryOptions = {
    cwd: context.cwd,
    query: args.query
  };

  if (args.limit !== undefined) {
    if (typeof args.limit !== "number") {
      throw invalidParams("search_memory `limit` must be a number when provided.");
    }

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

function assertKnownArguments(
  args: Record<string, unknown>,
  allowed: readonly string[],
  toolName: string
): void {
  const allowedSet = new Set(allowed);
  const unknownArguments = Object.keys(args).filter((key) => !allowedSet.has(key));

  if (unknownArguments.length > 0) {
    throw invalidParams(
      `${toolName} received unsupported argument(s): ${unknownArguments.join(", ")}.`
    );
  }
}

function invalidParams(message: string): McpError {
  return new McpError(ErrorCode.InvalidParams, message);
}
