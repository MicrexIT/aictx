import {
  ErrorCode,
  McpError,
  type CallToolResult,
  type ToolAnnotations
} from "@modelcontextprotocol/sdk/types.js";

import { diffMemory, type DiffMemoryOptions } from "../../app/operations.js";

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

const DIFF_MEMORY_INPUT_SCHEMA: JsonObjectSchema = {
  type: "object",
  properties: {},
  additionalProperties: false
};

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
  args: Record<string, unknown>
): Promise<CallToolResult> {
  const result = await diffMemory(parseDiffMemoryArgs(context, args));

  return toToolResult(result);
}

function parseDiffMemoryArgs(
  context: AictxMcpContext,
  args: Record<string, unknown>
): DiffMemoryOptions {
  assertKnownArguments(args, [], "diff_memory");

  return {
    cwd: context.cwd
  };
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
