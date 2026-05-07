import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import {
  FACET_CATEGORIES,
  PREDICATES,
  RELATION_CONFIDENCES
} from "../../core/types.js";
import { dataAccessService } from "../../data-access/index.js";
import { REMEMBER_MEMORY_KINDS } from "../../remember/types.js";
import {
  PROJECT_ROOT_ARGUMENT_DESCRIPTION,
  resolveMcpProjectCwd,
  type AictxMcpContext,
  type ProjectScopedMcpArgs
} from "../context.js";
import {
  toMcpToolResult,
  WRITE_TOOL_ANNOTATIONS
} from "./shared.js";
import {
  resolveWriteQueueKey,
  serializeProjectWrite
} from "./write-queue.js";

const OBJECT_ID_SCHEMA = z
  .string()
  .regex(/^[a-z][a-z0-9_]*\.[a-z0-9][a-z0-9-]*$/u);
const UNIQUE_NON_EMPTY_STRINGS_SCHEMA = z.array(z.string().min(1)).refine(hasUniqueItems);
const EVIDENCE_SCHEMA = z.array(
  z
    .object({
      kind: z.enum(["memory", "relation", "file", "commit", "task", "source"]),
      id: z.string().min(1)
    })
    .strict()
);
const RELATED_SCHEMA = z
  .object({
    predicate: z.enum(PREDICATES),
    to: OBJECT_ID_SCHEMA,
    confidence: z.enum(RELATION_CONFIDENCES).optional(),
    evidence: EVIDENCE_SCHEMA.optional()
  })
  .strict();
const MEMORY_SCHEMA = z
  .object({
    id: OBJECT_ID_SCHEMA.optional(),
    kind: z.enum(REMEMBER_MEMORY_KINDS),
    title: z.string().min(1),
    body: z.string().min(1),
    tags: UNIQUE_NON_EMPTY_STRINGS_SCHEMA.optional(),
    applies_to: UNIQUE_NON_EMPTY_STRINGS_SCHEMA.optional(),
    category: z.enum(FACET_CATEGORIES).optional(),
    evidence: EVIDENCE_SCHEMA.optional(),
    related: z.array(RELATED_SCHEMA).optional()
  })
  .strict();
const UPDATE_SCHEMA = z
  .object({
    id: OBJECT_ID_SCHEMA,
    title: z.string().min(1).optional(),
    body: z.string().min(1).optional(),
    tags: UNIQUE_NON_EMPTY_STRINGS_SCHEMA.optional(),
    applies_to: UNIQUE_NON_EMPTY_STRINGS_SCHEMA.optional(),
    category: z.enum(FACET_CATEGORIES).optional(),
    evidence: EVIDENCE_SCHEMA.optional()
  })
  .strict();
const STALE_SCHEMA = z
  .object({
    id: OBJECT_ID_SCHEMA,
    reason: z.string().min(1)
  })
  .strict();
const SUPERSEDE_SCHEMA = z
  .object({
    id: OBJECT_ID_SCHEMA,
    superseded_by: OBJECT_ID_SCHEMA,
    reason: z.string().min(1)
  })
  .strict();
const RELATION_SCHEMA = z
  .object({
    from: OBJECT_ID_SCHEMA,
    predicate: z.enum(PREDICATES),
    to: OBJECT_ID_SCHEMA,
    confidence: z.enum(RELATION_CONFIDENCES).optional(),
    evidence: EVIDENCE_SCHEMA.optional()
  })
  .strict();
const REMEMBER_MEMORY_INPUT_SCHEMA = z
  .object({
    task: z.string().min(1).describe("Task or reason for this durable memory update."),
    memories: z.array(MEMORY_SCHEMA).optional(),
    updates: z.array(UPDATE_SCHEMA).optional(),
    stale: z.array(STALE_SCHEMA).optional(),
    supersede: z.array(SUPERSEDE_SCHEMA).optional(),
    relations: z.array(RELATION_SCHEMA).optional(),
    project_root: z
      .string()
      .optional()
      .describe(PROJECT_ROOT_ARGUMENT_DESCRIPTION)
  })
  .strict();

type RememberMemoryArgs = z.infer<typeof REMEMBER_MEMORY_INPUT_SCHEMA> &
  ProjectScopedMcpArgs;

export const rememberMemoryTool = {
  name: "remember_memory",
  title: "Remember Aictx Memory",
  description:
    "Create or repair Aictx memory from intent-first agent input. Converts to a structured patch internally.",
  inputSchema: REMEMBER_MEMORY_INPUT_SCHEMA,
  annotations: WRITE_TOOL_ANNOTATIONS,
  call: callRememberMemoryTool
};

async function callRememberMemoryTool(
  context: AictxMcpContext,
  args: RememberMemoryArgs
): Promise<CallToolResult> {
  const cwd = resolveMcpProjectCwd(context, args);
  const projectKey = await resolveWriteQueueKey(cwd);

  return serializeProjectWrite(projectKey, async () => {
    const result = await dataAccessService.remember({
      target: {
        kind: "cwd",
        cwd
      },
      input: args
    });

    return toMcpToolResult(result);
  });
}

function hasUniqueItems(items: readonly string[]): boolean {
  return new Set(items).size === items.length;
}
