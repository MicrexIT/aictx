import {
  ErrorCode,
  McpError,
  type CallToolResult,
  type ToolAnnotations
} from "@modelcontextprotocol/sdk/types.js";

import { saveMemoryPatch } from "../../app/operations.js";

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

const SAVE_MEMORY_PATCH_INPUT_SCHEMA: JsonObjectSchema = {
  type: "object",
  properties: {
    patch: {
      type: "object",
      description: "Structured Aictx memory patch to validate and apply."
    }
  },
  required: ["patch"],
  additionalProperties: false
};

const WRITE_TOOL_ANNOTATIONS: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: false
};

const writeQueues = new Map<string, Promise<void>>();

export const saveMemoryPatchTool = {
  name: "save_memory_patch",
  title: "Save Aictx Memory Patch",
  description: "Validate and apply a structured Aictx memory patch.",
  inputSchema: SAVE_MEMORY_PATCH_INPUT_SCHEMA,
  annotations: WRITE_TOOL_ANNOTATIONS,
  call: callSaveMemoryPatchTool
};

async function callSaveMemoryPatchTool(
  context: AictxMcpContext,
  args: Record<string, unknown>
): Promise<CallToolResult> {
  const patch = parseSaveMemoryPatchArgs(args);

  return serializeProjectWrite(context.cwd, async () => {
    const result = await saveMemoryPatch({
      cwd: context.cwd,
      patch
    });

    return toToolResult(result);
  });
}

function parseSaveMemoryPatchArgs(args: Record<string, unknown>): Record<string, unknown> {
  assertKnownArguments(args, ["patch"], "save_memory_patch");

  if (!isJsonObject(args.patch)) {
    throw invalidParams("save_memory_patch requires an object `patch` argument.");
  }

  return args.patch;
}

async function serializeProjectWrite<T>(
  projectKey: string,
  operation: () => Promise<T>
): Promise<T> {
  const previous = writeQueues.get(projectKey) ?? Promise.resolve();
  let releaseCurrent!: () => void;
  const current = new Promise<void>((resolve) => {
    releaseCurrent = resolve;
  });
  const queued = previous.catch(() => undefined).then(() => current);

  writeQueues.set(projectKey, queued);
  await previous.catch(() => undefined);

  try {
    return await operation();
  } finally {
    releaseCurrent();

    if (writeQueues.get(projectKey) === queued) {
      writeQueues.delete(projectKey);
    }
  }
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

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
