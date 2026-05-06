import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import { LOAD_MEMORY_MODES } from "../../context/modes.js";
import { resolveProjectPaths } from "../../core/paths.js";
import { dataAccessService } from "../../data-access/index.js";
import {
  ACTORS,
  FACET_CATEGORIES,
  OBJECT_STATUSES,
  OBJECT_TYPES,
  PREDICATES,
  RELATION_CONFIDENCES,
  RELATION_STATUSES,
  SCOPE_KINDS
} from "../../core/types.js";
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

const OBJECT_ID_SCHEMA = z
  .string()
  .regex(/^[a-z][a-z0-9_]*\.[a-z0-9][a-z0-9-]*$/u);
const RELATION_ID_SCHEMA = z
  .string()
  .regex(/^rel\.[a-z0-9][a-z0-9-]*$/u);
const PROJECT_ID_SCHEMA = z
  .string()
  .regex(/^project\.[a-z0-9][a-z0-9-]*$/u);
const UNIQUE_NON_EMPTY_STRINGS_SCHEMA = z.array(z.string().min(1)).refine(hasUniqueItems);
const SOURCE_SCHEMA = z
  .object({
    kind: z.enum(ACTORS),
    task: z.string().optional(),
    commit: z.string().min(1).optional()
  })
  .strict();
const SCOPE_SCHEMA = z
  .object({
    kind: z.enum(SCOPE_KINDS),
    project: PROJECT_ID_SCHEMA,
    branch: z.string().nullable(),
    task: z.string().nullable()
  })
  .strict();
const TAGS_SCHEMA = z
  .array(z.string().regex(/^[a-z0-9][a-z0-9-]*$/u))
  .refine(hasUniqueItems);
const EVIDENCE_SCHEMA = z.array(
  z
    .object({
      kind: z.enum(["memory", "relation", "file", "commit", "task", "source"]),
      id: z.string().min(1)
    })
    .strict()
);
const FACETS_SCHEMA = z
  .object({
    category: z.enum(FACET_CATEGORIES),
    applies_to: UNIQUE_NON_EMPTY_STRINGS_SCHEMA.optional(),
    load_modes: z.array(z.enum(LOAD_MEMORY_MODES)).refine(hasUniqueItems).optional()
  })
  .strict();
const CREATE_OBJECT_SCHEMA = z
  .object({
    op: z.literal("create_object"),
    id: OBJECT_ID_SCHEMA.optional(),
    type: z.enum(OBJECT_TYPES),
    status: z.enum(OBJECT_STATUSES).optional(),
    title: z.string().min(1),
    body: z.string().min(1),
    scope: SCOPE_SCHEMA.optional(),
    tags: TAGS_SCHEMA.optional(),
    facets: FACETS_SCHEMA.optional(),
    evidence: EVIDENCE_SCHEMA.optional(),
    source: SOURCE_SCHEMA.optional()
  })
  .strict();
const UPDATE_OBJECT_SCHEMA = z
  .object({
    op: z.literal("update_object"),
    id: OBJECT_ID_SCHEMA,
    status: z.enum(OBJECT_STATUSES).optional(),
    title: z.string().min(1).optional(),
    body: z.string().min(1).optional(),
    scope: SCOPE_SCHEMA.optional(),
    tags: TAGS_SCHEMA.optional(),
    facets: FACETS_SCHEMA.optional(),
    evidence: EVIDENCE_SCHEMA.optional(),
    source: SOURCE_SCHEMA.optional(),
    superseded_by: OBJECT_ID_SCHEMA.optional()
  })
  .strict();
const MARK_STALE_SCHEMA = z
  .object({
    op: z.literal("mark_stale"),
    id: OBJECT_ID_SCHEMA,
    reason: z.string().min(1)
  })
  .strict();
const SUPERSEDE_OBJECT_SCHEMA = z
  .object({
    op: z.literal("supersede_object"),
    id: OBJECT_ID_SCHEMA,
    superseded_by: OBJECT_ID_SCHEMA,
    reason: z.string().min(1)
  })
  .strict();
const DELETE_OBJECT_SCHEMA = z
  .object({
    op: z.literal("delete_object"),
    id: OBJECT_ID_SCHEMA
  })
  .strict();
const CREATE_RELATION_SCHEMA = z
  .object({
    op: z.literal("create_relation"),
    id: RELATION_ID_SCHEMA.optional(),
    from: OBJECT_ID_SCHEMA,
    predicate: z.enum(PREDICATES),
    to: OBJECT_ID_SCHEMA,
    status: z.enum(RELATION_STATUSES).optional(),
    confidence: z.enum(RELATION_CONFIDENCES).optional(),
    evidence: EVIDENCE_SCHEMA.optional()
  })
  .strict();
const UPDATE_RELATION_SCHEMA = z
  .object({
    op: z.literal("update_relation"),
    id: RELATION_ID_SCHEMA,
    status: z.enum(RELATION_STATUSES).optional(),
    confidence: z.enum(RELATION_CONFIDENCES).optional(),
    evidence: EVIDENCE_SCHEMA.optional()
  })
  .strict();
const DELETE_RELATION_SCHEMA = z
  .object({
    op: z.literal("delete_relation"),
    id: RELATION_ID_SCHEMA
  })
  .strict();
const PATCH_CHANGE_SCHEMA = z.discriminatedUnion("op", [
  CREATE_OBJECT_SCHEMA,
  UPDATE_OBJECT_SCHEMA,
  MARK_STALE_SCHEMA,
  SUPERSEDE_OBJECT_SCHEMA,
  DELETE_OBJECT_SCHEMA,
  CREATE_RELATION_SCHEMA,
  UPDATE_RELATION_SCHEMA,
  DELETE_RELATION_SCHEMA
]);
const PATCH_SCHEMA = z
  .object({
    source: SOURCE_SCHEMA,
    changes: z.array(PATCH_CHANGE_SCHEMA).min(1)
  })
  .strict();
const SAVE_MEMORY_PATCH_INPUT_SCHEMA = z
  .object({
    patch: PATCH_SCHEMA.describe("Structured Aictx memory patch to validate and apply."),
    project_root: z
      .string()
      .optional()
      .describe(PROJECT_ROOT_ARGUMENT_DESCRIPTION)
  })
  .strict();

type SaveMemoryPatchArgs = z.infer<typeof SAVE_MEMORY_PATCH_INPUT_SCHEMA> &
  ProjectScopedMcpArgs;

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
    const result = await dataAccessService.applyPatch({
      target: {
        kind: "cwd",
        cwd
      },
      patch: args.patch
    });

    return toMcpToolResult(result);
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

function hasUniqueItems(items: readonly string[]): boolean {
  return new Set(items).size === items.length;
}
