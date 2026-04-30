import type { CallToolResult, ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import { saveMemoryPatch } from "../../app/operations.js";
import { resolveProjectPaths } from "../../core/paths.js";
import {
  PROJECT_ROOT_ARGUMENT_DESCRIPTION,
  resolveMcpProjectCwd,
  type AictxMcpContext,
  type ProjectScopedMcpArgs
} from "../context.js";

const SAVE_MEMORY_PATCH_INPUT_SCHEMA = z
  .object({
    patch: z
      .object({})
      .passthrough()
      .describe("Structured Aictx memory patch to validate and apply."),
    project_root: z
      .string()
      .optional()
      .describe(PROJECT_ROOT_ARGUMENT_DESCRIPTION)
  })
  .strict();

type SaveMemoryPatchArgs = z.infer<typeof SAVE_MEMORY_PATCH_INPUT_SCHEMA> &
  ProjectScopedMcpArgs;

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
  args: SaveMemoryPatchArgs
): Promise<CallToolResult> {
  const cwd = resolveMcpProjectCwd(context, args);
  const projectKey = await resolveWriteQueueKey(cwd);

  return serializeProjectWrite(projectKey, async () => {
    const result = await saveMemoryPatch({
      cwd,
      patch: args.patch
    });

    return toToolResult(result);
  });
}

async function resolveWriteQueueKey(cwd: string): Promise<string> {
  const paths = await resolveProjectPaths({
    cwd,
    mode: "require-initialized"
  });

  return paths.ok ? paths.data.projectRoot : cwd;
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
