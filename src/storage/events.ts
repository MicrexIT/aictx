import { memoryError, type JsonValue } from "../core/errors.js";
import { appendJsonl } from "../core/fs.js";
import { err, ok, type Result } from "../core/result.js";
import type {
  Actor,
  EventType,
  IsoDateTime,
  MemoryEvent,
  ObjectId,
  PatchOperation,
  RelationId
} from "../core/types.js";
import type { CompiledSchemaValidators } from "../validation/schemas.js";
import {
  schemaValidationError,
  validateEvent
} from "../validation/validate.js";

export const EVENTS_PATH = ".memory/events.jsonl";

export const WRITE_OPERATION_EVENT_TYPES = {
  create_object: "memory.created",
  update_object: "memory.updated",
  mark_stale: "memory.marked_stale",
  supersede_object: "memory.superseded",
  delete_object: "memory.deleted",
  create_relation: "relation.created",
  update_relation: "relation.updated",
  delete_relation: "relation.deleted"
} as const satisfies Record<PatchOperation, EventType>;

type MemoryWriteOperation = Extract<
  PatchOperation,
  "create_object" | "update_object" | "mark_stale" | "supersede_object" | "delete_object"
>;

type RelationWriteOperation = Extract<
  PatchOperation,
  "create_relation" | "update_relation" | "delete_relation"
>;

interface BaseWriteEventInput {
  actor: Actor;
  timestamp: IsoDateTime;
  reason?: string;
  payload?: Record<string, JsonValue>;
}

export interface MemoryWriteEventInput extends BaseWriteEventInput {
  operation: MemoryWriteOperation;
  id: ObjectId;
}

export interface RelationWriteEventInput extends BaseWriteEventInput {
  operation: RelationWriteOperation;
  relationId: RelationId;
}

export type WriteEventInput = MemoryWriteEventInput | RelationWriteEventInput;

export interface StoredMemoryEvent extends MemoryEvent {
  path: string;
  line: number;
}

export function buildWriteEvent(input: WriteEventInput): MemoryEvent {
  const event: MemoryEvent = {
    event: WRITE_OPERATION_EVENT_TYPES[input.operation],
    actor: input.actor,
    timestamp: input.timestamp
  };

  if (isMemoryWriteEventInput(input)) {
    event.id = input.id;
  } else {
    event.relation_id = input.relationId;
  }

  if (input.reason !== undefined) {
    event.reason = input.reason;
  }

  if (input.payload !== undefined) {
    event.payload = input.payload;
  }

  return event;
}

export function validateBuiltEvent(
  validators: CompiledSchemaValidators,
  event: MemoryEvent
): Result<MemoryEvent> {
  if (event.event === "index.rebuilt") {
    return err(
      memoryError("MemoryValidationFailed", "Refusing to append index.rebuilt events in v1.", {
        path: EVENTS_PATH
      })
    );
  }

  const validation = validateEvent(validators, event, EVENTS_PATH);

  if (!validation.valid) {
    return err(schemaValidationError(validation.errors));
  }

  return ok(event);
}

export async function appendEvent(
  projectRoot: string,
  validators: CompiledSchemaValidators,
  event: MemoryEvent
): Promise<Result<void>> {
  const validation = validateBuiltEvent(validators, event);

  if (!validation.ok) {
    return validation;
  }

  return appendJsonl(projectRoot, EVENTS_PATH, eventToJsonObject(validation.data));
}

export async function appendEvents(
  projectRoot: string,
  validators: CompiledSchemaValidators,
  events: readonly MemoryEvent[]
): Promise<Result<number>> {
  for (const event of events) {
    const validation = validateBuiltEvent(validators, event);

    if (!validation.ok) {
      return validation;
    }
  }

  for (const event of events) {
    const appended = await appendJsonl(projectRoot, EVENTS_PATH, eventToJsonObject(event));

    if (!appended.ok) {
      return appended;
    }
  }

  return ok(events.length);
}

export function isMemoryEvent(value: unknown): value is MemoryEvent {
  return (
    isRecord(value) &&
    typeof value.event === "string" &&
    typeof value.actor === "string" &&
    typeof value.timestamp === "string"
  );
}

export function isJsonObject(value: unknown): value is Record<string, unknown> {
  return isRecord(value);
}

function isMemoryWriteEventInput(input: WriteEventInput): input is MemoryWriteEventInput {
  switch (input.operation) {
    case "create_object":
    case "update_object":
    case "mark_stale":
    case "supersede_object":
    case "delete_object":
      return true;
    case "create_relation":
    case "update_relation":
    case "delete_relation":
      return false;
  }
}

function eventToJsonObject(event: MemoryEvent): Record<string, JsonValue> {
  const value: Record<string, JsonValue> = {
    event: event.event,
    actor: event.actor,
    timestamp: event.timestamp
  };

  if (event.id !== undefined) {
    value.id = event.id;
  }

  if (event.relation_id !== undefined) {
    value.relation_id = event.relation_id;
  }

  if (event.reason !== undefined) {
    value.reason = event.reason;
  }

  if (event.payload !== undefined) {
    value.payload = event.payload;
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
