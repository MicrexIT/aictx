import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { MemoryEvent, PatchOperation } from "../../../src/core/types.js";
import {
  appendEvent,
  appendEvents,
  buildWriteEvent,
  EVENTS_PATH,
  validateBuiltEvent,
  WRITE_OPERATION_EVENT_TYPES
} from "../../../src/storage/events.js";
import {
  compileProjectSchemas,
  SCHEMA_FILES,
  type CompiledSchemaValidators
} from "../../../src/validation/schemas.js";
import { validateEvent } from "../../../src/validation/validate.js";

const repoRoot = process.cwd();
const tempRoots: string[] = [];
const timestamp = "2026-04-25T14:00:00+02:00";

const expectedOperationEvents = [
  ["create_object", "memory.created"],
  ["update_object", "memory.updated"],
  ["mark_stale", "memory.marked_stale"],
  ["supersede_object", "memory.superseded"],
  ["delete_object", "memory.deleted"],
  ["create_relation", "relation.created"],
  ["update_relation", "relation.updated"],
  ["delete_relation", "relation.deleted"]
] as const satisfies readonly (readonly [PatchOperation, MemoryEvent["event"]])[];

const expectedMemoryOperationEvents = [
  ["create_object", "memory.created"],
  ["update_object", "memory.updated"],
  ["mark_stale", "memory.marked_stale"],
  ["supersede_object", "memory.superseded"],
  ["delete_object", "memory.deleted"]
] as const;

const expectedRelationOperationEvents = [
  ["create_relation", "relation.created"],
  ["update_relation", "relation.updated"],
  ["delete_relation", "relation.deleted"]
] as const;

const specEventExamples: MemoryEvent[] = [
  {
    event: "memory.created",
    id: "decision.billing-retries",
    actor: "agent",
    timestamp: "2026-04-25T14:00:00+02:00",
    payload: {
      title: "Billing retries moved to queue worker"
    }
  },
  {
    event: "relation.created",
    relation_id: "rel.decision-billing-retries-requires-constraint-webhook-idempotency",
    actor: "agent",
    timestamp: "2026-04-25T14:01:00+02:00",
    payload: {
      from: "decision.billing-retries",
      predicate: "requires",
      to: "constraint.webhook-idempotency"
    }
  },
  {
    event: "memory.marked_stale",
    id: "decision.old-webhook-retries",
    actor: "agent",
    reason: "Retries moved to worker",
    timestamp: "2026-04-25T14:02:00+02:00"
  }
];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("event builders", () => {
  it("maps every write operation to the correct event type", () => {
    expect(WRITE_OPERATION_EVENT_TYPES).toEqual(Object.fromEntries(expectedOperationEvents));

    for (const [operation, eventType] of expectedMemoryOperationEvents) {
      const event = buildWriteEvent({
        operation,
        id: "decision.billing-retries",
        actor: "agent",
        timestamp
      });

      expect(event.event).toBe(eventType);
    }

    for (const [operation, eventType] of expectedRelationOperationEvents) {
      const event = buildWriteEvent({
        operation,
        relationId: "rel.billing-retries-requires-idempotency",
        actor: "agent",
        timestamp
      });

      expect(event.event).toBe(eventType);
    }
  });

  it("builds memory events with ids and optional fields", () => {
    const event = buildWriteEvent({
      operation: "mark_stale",
      id: "decision.billing-retries",
      actor: "agent",
      timestamp,
      reason: "Retries moved to worker",
      payload: {
        title: "Billing retries moved to queue worker"
      }
    });

    expect(event).toEqual({
      event: "memory.marked_stale",
      id: "decision.billing-retries",
      actor: "agent",
      timestamp,
      reason: "Retries moved to worker",
      payload: {
        title: "Billing retries moved to queue worker"
      }
    });
  });

  it("builds relation events with relation_id", () => {
    const event = buildWriteEvent({
      operation: "create_relation",
      relationId: "rel.billing-retries-requires-idempotency",
      actor: "mcp",
      timestamp,
      payload: {
        from: "decision.billing-retries",
        predicate: "requires",
        to: "constraint.webhook-idempotency"
      }
    });

    expect(event).toEqual({
      event: "relation.created",
      relation_id: "rel.billing-retries-requires-idempotency",
      actor: "mcp",
      timestamp,
      payload: {
        from: "decision.billing-retries",
        predicate: "requires",
        to: "constraint.webhook-idempotency"
      }
    });
  });
});

describe("event validation and append", () => {
  it("validates the event examples from the storage spec", async () => {
    const validators = await compileFixtureProject();

    for (const [index, event] of specEventExamples.entries()) {
      expect(validateEvent(validators, event, EVENTS_PATH, index + 1).valid).toBe(true);
      expect(validateBuiltEvent(validators, event).ok).toBe(true);
    }
  });

  it("appends one LF-terminated deterministic JSONL event", async () => {
    const projectRoot = await createProjectRoot();
    const validators = await compileProjectSchemasOrThrow(projectRoot);
    const event = buildWriteEvent({
      operation: "create_object",
      id: "decision.billing-retries",
      actor: "agent",
      timestamp,
      payload: {
        z: 2,
        a: 1
      }
    });

    const result = await appendEvent(projectRoot, validators, event);

    expect(result.ok).toBe(true);
    expect(await readFile(join(projectRoot, EVENTS_PATH), "utf8")).toBe(
      '{"actor":"agent","event":"memory.created","id":"decision.billing-retries","payload":{"a":1,"z":2},"timestamp":"2026-04-25T14:00:00+02:00"}\n'
    );
  });

  it("appends multiple prevalidated events and returns the count", async () => {
    const projectRoot = await createProjectRoot();
    const validators = await compileProjectSchemasOrThrow(projectRoot);
    const events = [
      buildWriteEvent({
        operation: "create_object",
        id: "decision.billing-retries",
        actor: "agent",
        timestamp
      }),
      buildWriteEvent({
        operation: "create_relation",
        relationId: "rel.billing-retries-requires-idempotency",
        actor: "agent",
        timestamp
      })
    ];

    const result = await appendEvents(projectRoot, validators, events);

    expect(result).toEqual({ ok: true, data: 2, warnings: [] });
    expect(await readFile(join(projectRoot, EVENTS_PATH), "utf8")).toBe(
      [
        '{"actor":"agent","event":"memory.created","id":"decision.billing-retries","timestamp":"2026-04-25T14:00:00+02:00"}',
        '{"actor":"agent","event":"relation.created","relation_id":"rel.billing-retries-requires-idempotency","timestamp":"2026-04-25T14:00:00+02:00"}',
        ""
      ].join("\n")
    );
  });

  it("rejects schema-invalid events without appending a partial batch", async () => {
    const projectRoot = await createProjectRoot();
    const validators = await compileProjectSchemasOrThrow(projectRoot);
    const events: MemoryEvent[] = [
      buildWriteEvent({
        operation: "create_object",
        id: "decision.billing-retries",
        actor: "agent",
        timestamp
      }),
      {
        event: "memory.created",
        actor: "agent",
        timestamp
      }
    ];

    const result = await appendEvents(projectRoot, validators, events);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("AICtxSchemaValidationFailed");
    }
    expect(await readFile(join(projectRoot, EVENTS_PATH), "utf8")).toBe("");
  });

  it("rejects index.rebuilt events without appending", async () => {
    const projectRoot = await createProjectRoot();
    const validators = await compileProjectSchemasOrThrow(projectRoot);

    const result = await appendEvent(projectRoot, validators, {
      event: "index.rebuilt",
      actor: "system",
      timestamp
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("AICtxValidationFailed");
    }
    expect(await readFile(join(projectRoot, EVENTS_PATH), "utf8")).toBe("");
  });
});

async function createProjectRoot(): Promise<string> {
  const projectRoot = await mkdtemp(join(tmpdir(), "aictx-events-"));
  tempRoots.push(projectRoot);
  await mkdir(join(projectRoot, ".aictx", "schema"), { recursive: true });

  for (const schemaFile of Object.values(SCHEMA_FILES)) {
    await copyFile(
      join(repoRoot, "src", "schemas", schemaFile),
      join(projectRoot, ".aictx", "schema", schemaFile)
    );
  }

  await writeFile(join(projectRoot, EVENTS_PATH), "", "utf8");

  return projectRoot;
}

async function compileFixtureProject(): Promise<CompiledSchemaValidators> {
  const projectRoot = await createProjectRoot();
  return compileProjectSchemasOrThrow(projectRoot);
}

async function compileProjectSchemasOrThrow(
  projectRoot: string
): Promise<CompiledSchemaValidators> {
  const compiled = await compileProjectSchemas(projectRoot);

  if (!compiled.ok) {
    throw new Error(JSON.stringify(compiled.error));
  }

  return compiled.data;
}
