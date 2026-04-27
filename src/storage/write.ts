import { rm } from "node:fs/promises";
import { resolve } from "node:path";

import { aictxError, type JsonValue } from "../core/errors.js";
import {
  resolveInsideRoot,
  writeJsonAtomic
} from "../core/fs.js";
import { err, ok, type Result } from "../core/result.js";
import type {
  Evidence,
  IsoDateTime,
  MemoryEvent,
  PatchOperation,
  RelationConfidence,
  RelationId
} from "../core/types.js";
import {
  appendEvents,
  buildWriteEvent,
  validateBuiltEvent
} from "./events.js";
import { computeRelationContentHash } from "./hashes.js";
import {
  planMemoryPatch,
  type NormalizedCreateRelationChange,
  type NormalizedDeleteRelationChange,
  type NormalizedPatchChange,
  type NormalizedUpdateRelationChange,
  type PatchPlan,
  type PatchPlannedEventAppend,
  type PlanMemoryPatchOptions
} from "./patch.js";
import { readCanonicalStorage } from "./read.js";
import type { MemoryRelation } from "./relations.js";
import {
  compileProjectSchemas,
  type CompiledSchemaValidators
} from "../validation/schemas.js";
import {
  schemaValidationError,
  validateRelation
} from "../validation/validate.js";

type RelationPatchOperation = Extract<
  PatchOperation,
  "create_relation" | "update_relation" | "delete_relation"
>;

type RelationPatchChange =
  | NormalizedCreateRelationChange
  | NormalizedUpdateRelationChange
  | NormalizedDeleteRelationChange;

type RelationWriteAction =
  | {
      kind: "write";
      path: string;
      json: Record<string, JsonValue>;
    }
  | {
      kind: "delete";
      path: string;
    };

interface RelationWriteState {
  relationsById: Map<RelationId, MemoryRelation>;
}

interface RelationJsonInput {
  id: RelationId;
  from: string;
  predicate: string;
  to: string;
  status: string;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
  confidence?: RelationConfidence;
  evidence?: Evidence[];
  content_hash?: string;
}

export async function applyMemoryPatch(
  options: PlanMemoryPatchOptions
): Promise<Result<PatchPlan>> {
  const projectRoot = resolve(options.projectRoot);
  const validators = await getValidators(projectRoot, options.validators);

  if (!validators.ok) {
    return validators;
  }

  const planned = await planMemoryPatch({
    ...options,
    projectRoot,
    validators: validators.data
  });

  if (!planned.ok) {
    return planned;
  }

  const unsupportedChange = planned.data.changes.find((change) => !isRelationChange(change));

  if (unsupportedChange !== undefined) {
    return err(
      aictxError("AICtxPatchInvalid", "Object patch operations are not implemented yet.", {
        op: unsupportedChange.op
      }),
      planned.warnings
    );
  }

  const storage = await readCanonicalStorage(projectRoot, {
    validators: validators.data
  });

  if (!storage.ok) {
    return storage;
  }

  const relationState = createRelationWriteState(
    storage.data.relations.map((item) => item.relation)
  );
  const actions = buildRelationWriteActions(planned.data, relationState, validators.data);

  if (!actions.ok) {
    return err(actions.error, planned.warnings);
  }

  const events = buildPlannedEvents(planned.data.eventAppends, validators.data);

  if (!events.ok) {
    return err(events.error, planned.warnings);
  }

  for (const action of actions.data) {
    const applied = await applyRelationWriteAction(projectRoot, action);

    if (!applied.ok) {
      return err(applied.error, planned.warnings);
    }
  }

  const appendedEvents = await appendEvents(projectRoot, validators.data, events.data);

  if (!appendedEvents.ok) {
    return err(appendedEvents.error, planned.warnings);
  }

  return ok(planned.data, planned.warnings);
}

async function getValidators(
  projectRoot: string,
  validators: CompiledSchemaValidators | undefined
): Promise<Result<CompiledSchemaValidators>> {
  if (validators !== undefined) {
    return ok(validators);
  }

  return compileProjectSchemas(projectRoot);
}

function createRelationWriteState(relations: readonly MemoryRelation[]): RelationWriteState {
  return {
    relationsById: new Map(relations.map((relation) => [relation.id, relation]))
  };
}

function buildRelationWriteActions(
  plan: PatchPlan,
  state: RelationWriteState,
  validators: CompiledSchemaValidators
): Result<RelationWriteAction[]> {
  const actions: RelationWriteAction[] = [];

  for (const change of plan.changes) {
    if (!isRelationChange(change)) {
      return err(
        aictxError("AICtxPatchInvalid", "Object patch operations are not implemented yet.", {
          op: change.op
        })
      );
    }

    const action = buildRelationWriteAction(change, state, plan.eventAppends, validators);

    if (!action.ok) {
      return action;
    }

    if (action.data !== null) {
      actions.push(action.data);
    }
  }

  return ok(actions);
}

function buildRelationWriteAction(
  change: RelationPatchChange,
  state: RelationWriteState,
  eventAppends: readonly PatchPlannedEventAppend[],
  validators: CompiledSchemaValidators
): Result<RelationWriteAction | null> {
  switch (change.op) {
    case "create_relation":
      return buildCreateRelationAction(change, state, eventAppends, validators);
    case "update_relation":
      return buildUpdateRelationAction(change, state, eventAppends, validators);
    case "delete_relation":
      return buildDeleteRelationAction(change, state);
  }
}

function buildCreateRelationAction(
  change: NormalizedCreateRelationChange,
  state: RelationWriteState,
  eventAppends: readonly PatchPlannedEventAppend[],
  validators: CompiledSchemaValidators
): Result<RelationWriteAction> {
  const timestamp = relationEventTimestamp(eventAppends, change.id, "create_relation");

  if (!timestamp.ok) {
    return timestamp;
  }

  const relation = withRelationHash({
    id: change.id,
    from: change.from,
    predicate: change.predicate,
    to: change.to,
    status: change.status,
    ...(change.confidence === undefined ? {} : { confidence: change.confidence }),
    ...(change.evidence === undefined ? {} : { evidence: change.evidence }),
    created_at: timestamp.data,
    updated_at: timestamp.data
  });
  const json = relationToJson(relation);
  const validation = validateRelation(validators, json, change.path);

  if (!validation.valid) {
    return err(schemaValidationError(validation.errors));
  }

  state.relationsById.set(change.id, relation);

  return ok({
    kind: "write",
    path: change.path,
    json
  });
}

function buildUpdateRelationAction(
  change: NormalizedUpdateRelationChange,
  state: RelationWriteState,
  eventAppends: readonly PatchPlannedEventAppend[],
  validators: CompiledSchemaValidators
): Result<RelationWriteAction | null> {
  if (!relationUpdateTouchesMutableField(change)) {
    return ok(null);
  }

  const existing = state.relationsById.get(change.id);

  if (existing === undefined) {
    return internalError(`Planned relation update has no loaded relation: ${change.id}.`);
  }

  const timestamp = relationEventTimestamp(eventAppends, change.id, "update_relation");

  if (!timestamp.ok) {
    return timestamp;
  }

  const relation = withRelationHash({
    id: existing.id,
    from: existing.from,
    predicate: existing.predicate,
    to: existing.to,
    status: change.status ?? existing.status,
    ...(change.confidence === undefined
      ? optionalConfidence(existing)
      : { confidence: change.confidence }),
    ...(change.evidence === undefined
      ? optionalEvidence(existing)
      : { evidence: change.evidence }),
    created_at: existing.created_at,
    updated_at: timestamp.data
  });
  const json = relationToJson(relation);
  const validation = validateRelation(validators, json, change.path);

  if (!validation.valid) {
    return err(schemaValidationError(validation.errors));
  }

  state.relationsById.set(change.id, relation);

  return ok({
    kind: "write",
    path: change.path,
    json
  });
}

function buildDeleteRelationAction(
  change: NormalizedDeleteRelationChange,
  state: RelationWriteState
): Result<RelationWriteAction> {
  if (!state.relationsById.has(change.id)) {
    return internalError(`Planned relation delete has no loaded relation: ${change.id}.`);
  }

  state.relationsById.delete(change.id);

  return ok({
    kind: "delete",
    path: change.path
  });
}

function withRelationHash(relation: Omit<MemoryRelation, "content_hash">): MemoryRelation {
  return {
    ...relation,
    content_hash: computeRelationContentHash(relationToJson(relation))
  };
}

function relationToJson(relation: RelationJsonInput): Record<string, JsonValue> {
  const json: Record<string, JsonValue> = {
    id: relation.id,
    from: relation.from,
    predicate: relation.predicate,
    to: relation.to,
    status: relation.status,
    created_at: relation.created_at,
    updated_at: relation.updated_at
  };

  if (relation.confidence !== undefined) {
    json.confidence = relation.confidence;
  }

  if (relation.evidence !== undefined) {
    json.evidence = relation.evidence.map((item) => ({
      kind: item.kind,
      id: item.id
    }));
  }

  if (relation.content_hash !== undefined) {
    json.content_hash = relation.content_hash;
  }

  return json;
}

function buildPlannedEvents(
  eventAppends: readonly PatchPlannedEventAppend[],
  validators: CompiledSchemaValidators
): Result<MemoryEvent[]> {
  const events: MemoryEvent[] = [];

  for (const append of eventAppends) {
    if (!isRelationOperation(append.operation) || append.relationId === undefined) {
      return internalError(
        `Planned write contains unsupported event operation: ${append.operation}.`
      );
    }

    const event = buildWriteEvent({
      operation: append.operation,
      relationId: append.relationId,
      actor: append.actor,
      timestamp: append.timestamp,
      ...(append.reason === undefined ? {} : { reason: append.reason })
    });
    const validation = validateBuiltEvent(validators, event);

    if (!validation.ok) {
      return validation;
    }

    events.push(validation.data);
  }

  return ok(events);
}

async function applyRelationWriteAction(
  projectRoot: string,
  action: RelationWriteAction
): Promise<Result<void>> {
  if (action.kind === "write") {
    return writeJsonAtomic(projectRoot, action.path, action.json);
  }

  const resolved = resolveInsideRoot(projectRoot, action.path);

  if (!resolved.ok) {
    return resolved;
  }

  try {
    await rm(resolved.data, { force: true });
    return ok(undefined);
  } catch (error) {
    return err(
      aictxError("AICtxValidationFailed", "Relation file could not be deleted.", {
        path: action.path,
        message: error instanceof Error ? error.message : String(error)
      })
    );
  }
}

function isRelationChange(change: NormalizedPatchChange): change is RelationPatchChange {
  switch (change.op) {
    case "create_relation":
    case "update_relation":
    case "delete_relation":
      return true;
    case "create_object":
    case "update_object":
    case "mark_stale":
    case "supersede_object":
    case "delete_object":
      return false;
  }
}

function isRelationOperation(operation: PatchOperation): operation is RelationPatchOperation {
  switch (operation) {
    case "create_relation":
    case "update_relation":
    case "delete_relation":
      return true;
    case "create_object":
    case "update_object":
    case "mark_stale":
    case "supersede_object":
    case "delete_object":
      return false;
  }
}

function relationUpdateTouchesMutableField(change: NormalizedUpdateRelationChange): boolean {
  return (
    change.status !== undefined ||
    change.confidence !== undefined ||
    change.evidence !== undefined
  );
}

function relationEventTimestamp(
  eventAppends: readonly PatchPlannedEventAppend[],
  relationId: RelationId,
  operation: RelationPatchOperation
): Result<IsoDateTime> {
  const event = eventAppends.find(
    (append) => append.operation === operation && append.relationId === relationId
  );

  if (event === undefined) {
    return internalError(
      `Missing planned relation event timestamp for ${operation}:${relationId}.`
    );
  }

  return ok(event.timestamp);
}

function optionalConfidence(relation: MemoryRelation): { confidence: RelationConfidence } | {} {
  return relation.confidence === undefined ? {} : { confidence: relation.confidence };
}

function optionalEvidence(relation: MemoryRelation): { evidence: Evidence[] } | {} {
  return relation.evidence === undefined ? {} : { evidence: relation.evidence };
}

function internalError<T>(message: string): Result<T> {
  return err(aictxError("AICtxInternalError", message));
}
