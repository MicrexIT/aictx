import { rm } from "node:fs/promises";
import { resolve } from "node:path";

import { aictxError, type JsonValue } from "../core/errors.js";
import {
  resolveInsideRoot,
  writeJsonAtomic,
  writeMarkdownAtomic
} from "../core/fs.js";
import {
  getAictxDirtyState,
  restoreAictxFromCommit,
  type GitWrapperOptions
} from "../core/git.js";
import { err, ok, type Result } from "../core/result.js";
import type {
  Evidence,
  IsoDateTime,
  MemoryEvent,
  ObjectId,
  ObjectStatus,
  ObjectType,
  PatchOperation,
  RelationConfidence,
  RelationId,
  Scope,
  Source
} from "../core/types.js";
import {
  compileProjectSchemas,
  type CompiledSchemaValidators
} from "../validation/schemas.js";
import {
  schemaValidationError,
  validateObject,
  validateRelation
} from "../validation/validate.js";
import {
  appendEvents,
  buildWriteEvent,
  validateBuiltEvent
} from "./events.js";
import {
  computeObjectContentHash,
  computeRelationContentHash
} from "./hashes.js";
import { validateMarkdownBody } from "./markdown.js";
import type {
  MemoryObjectSidecar,
  StoredMemoryObject
} from "./objects.js";
import {
  planMemoryPatch,
  type NormalizedCreateObjectChange,
  type NormalizedCreateRelationChange,
  type NormalizedDeleteObjectChange,
  type NormalizedDeleteRelationChange,
  type NormalizedMarkStaleChange,
  type NormalizedPatchChange,
  type NormalizedSupersedeObjectChange,
  type NormalizedUpdateObjectChange,
  type NormalizedUpdateRelationChange,
  type PatchPlan,
  type PatchPlannedEventAppend,
  type PlanMemoryPatchOptions
} from "./patch.js";
import { readCanonicalStorage } from "./read.js";
import type { MemoryRelation } from "./relations.js";

type MemoryPatchOperation = Extract<
  PatchOperation,
  "create_object" | "update_object" | "mark_stale" | "supersede_object" | "delete_object"
>;

type RelationPatchOperation = Extract<
  PatchOperation,
  "create_relation" | "update_relation" | "delete_relation"
>;

type ObjectPatchChange =
  | NormalizedCreateObjectChange
  | NormalizedUpdateObjectChange
  | NormalizedMarkStaleChange
  | NormalizedSupersedeObjectChange
  | NormalizedDeleteObjectChange;

type RelationPatchChange =
  | NormalizedCreateRelationChange
  | NormalizedUpdateRelationChange
  | NormalizedDeleteRelationChange;

type PatchWriteAction =
  | {
      kind: "write_json";
      path: string;
      json: Record<string, JsonValue>;
    }
  | {
      kind: "write_markdown";
      path: string;
      markdown: string;
    }
  | {
      kind: "delete";
      path: string;
    };

interface WriteState {
  objectsById: Map<ObjectId, StoredMemoryObject>;
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

interface ObjectSidecarInput {
  id: ObjectId;
  type: ObjectType;
  status: ObjectStatus;
  title: string;
  bodyPath: string;
  scope: Scope;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
  tags?: string[] | undefined;
  source?: Source | undefined;
  supersededBy?: ObjectId | null | undefined;
}

export interface RestoreCanonicalStorageFromCommitOptions extends GitWrapperOptions {
  projectRoot: string;
  commit: string;
}

export interface RestoreCanonicalStorageFromCommitData {
  restored_from: string;
  files_changed: string[];
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

  const storage = await readCanonicalStorage(projectRoot, {
    validators: validators.data
  });

  if (!storage.ok) {
    return storage;
  }

  const state = createWriteState(storage.data.objects, storage.data.relations);
  const actions = buildWriteActions(planned.data, state, validators.data);

  if (!actions.ok) {
    return err(actions.error, planned.warnings);
  }

  const events = buildPlannedEvents(planned.data.eventAppends, validators.data);

  if (!events.ok) {
    return err(events.error, planned.warnings);
  }

  for (const action of actions.data) {
    const applied = await applyWriteAction(projectRoot, action);

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

export async function restoreCanonicalStorageFromCommit(
  options: RestoreCanonicalStorageFromCommitOptions
): Promise<Result<RestoreCanonicalStorageFromCommitData>> {
  const projectRoot = resolve(options.projectRoot);
  const restored = await restoreAictxFromCommit(projectRoot, options.commit, options);

  if (!restored.ok) {
    return restored;
  }

  const changed = await getAictxDirtyState(projectRoot, options);

  if (!changed.ok) {
    return changed;
  }

  return ok({
    restored_from: options.commit,
    files_changed: changed.data.files
  });
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

function createWriteState(
  objects: readonly StoredMemoryObject[],
  relations: readonly { relation: MemoryRelation }[]
): WriteState {
  return {
    objectsById: new Map(objects.map((object) => [object.sidecar.id, object])),
    relationsById: new Map(relations.map((item) => [item.relation.id, item.relation]))
  };
}

function buildWriteActions(
  plan: PatchPlan,
  state: WriteState,
  validators: CompiledSchemaValidators
): Result<PatchWriteAction[]> {
  const actions: PatchWriteAction[] = [];

  for (const change of plan.changes) {
    const nextActions = buildWriteActionsForChange(
      change,
      state,
      plan.eventAppends,
      validators
    );

    if (!nextActions.ok) {
      return nextActions;
    }

    actions.push(...nextActions.data);
  }

  return ok(actions);
}

function buildWriteActionsForChange(
  change: NormalizedPatchChange,
  state: WriteState,
  eventAppends: readonly PatchPlannedEventAppend[],
  validators: CompiledSchemaValidators
): Result<PatchWriteAction[]> {
  if (isObjectChange(change)) {
    return buildObjectWriteActions(change, state, eventAppends, validators);
  }

  return buildRelationWriteActions(change, state, eventAppends, validators);
}

function buildObjectWriteActions(
  change: ObjectPatchChange,
  state: WriteState,
  eventAppends: readonly PatchPlannedEventAppend[],
  validators: CompiledSchemaValidators
): Result<PatchWriteAction[]> {
  switch (change.op) {
    case "create_object":
      return buildCreateObjectActions(change, state, eventAppends, validators);
    case "update_object":
      return buildUpdateObjectActions(change, state, eventAppends, validators);
    case "mark_stale":
      return buildMarkStaleActions(change, state, eventAppends, validators);
    case "supersede_object":
      return buildSupersedeObjectActions(change, state, eventAppends, validators);
    case "delete_object":
      return buildDeleteObjectActions(change, state);
  }
}

function buildCreateObjectActions(
  change: NormalizedCreateObjectChange,
  state: WriteState,
  eventAppends: readonly PatchPlannedEventAppend[],
  validators: CompiledSchemaValidators
): Result<PatchWriteAction[]> {
  const timestamp = objectEventTimestamp(eventAppends, change.id, "create_object");

  if (!timestamp.ok) {
    return timestamp;
  }

  const bodyPath = toAictxRelativePath(change.bodyPath);

  if (!bodyPath.ok) {
    return bodyPath;
  }

  const sidecarWithoutHash = buildObjectSidecarWithoutHash({
    id: change.id,
    type: change.type,
    status: change.status,
    title: change.title,
    bodyPath: bodyPath.data,
    scope: change.scope,
    tags: change.tags,
    source: change.source,
    createdAt: timestamp.data,
    updatedAt: timestamp.data
  });
  const sidecar = withObjectHash(sidecarWithoutHash, change.body);
  const json = validateObjectSidecar(
    sidecar,
    change.body,
    change.path,
    change.bodyPath,
    validators
  );

  if (!json.ok) {
    return json;
  }

  state.objectsById.set(change.id, {
    path: change.path,
    bodyPath: change.bodyPath,
    sidecar,
    body: change.body
  });

  return ok([
    {
      kind: "write_markdown",
      path: change.bodyPath,
      markdown: change.body
    },
    {
      kind: "write_json",
      path: change.path,
      json: json.data
    }
  ]);
}

function buildUpdateObjectActions(
  change: NormalizedUpdateObjectChange,
  state: WriteState,
  eventAppends: readonly PatchPlannedEventAppend[],
  validators: CompiledSchemaValidators
): Result<PatchWriteAction[]> {
  if (!objectUpdateTouchesMutableField(change)) {
    return ok([]);
  }

  const existing = state.objectsById.get(change.id);

  if (existing === undefined) {
    return internalError(`Planned object update has no loaded object: ${change.id}.`);
  }

  const timestamp = objectEventTimestamp(eventAppends, change.id, "update_object");

  if (!timestamp.ok) {
    return timestamp;
  }

  const body = change.body ?? existing.body;
  const sidecarWithoutHash = buildObjectSidecarWithoutHash({
    id: existing.sidecar.id,
    type: existing.sidecar.type,
    status: change.status ?? existing.sidecar.status,
    title: change.title ?? existing.sidecar.title,
    bodyPath: existing.sidecar.body_path,
    scope: change.scope ?? existing.sidecar.scope,
    tags: change.tags ?? existing.sidecar.tags,
    source: change.source ?? existing.sidecar.source,
    supersededBy:
      change.superseded_by === undefined
        ? existing.sidecar.superseded_by
        : change.superseded_by,
    createdAt: existing.sidecar.created_at,
    updatedAt: timestamp.data
  });
  const sidecar = withObjectHash(sidecarWithoutHash, body);
  const json = validateObjectSidecar(
    sidecar,
    body,
    existing.path,
    existing.bodyPath,
    validators
  );

  if (!json.ok) {
    return json;
  }

  state.objectsById.set(change.id, {
    ...existing,
    sidecar,
    body
  });

  return ok([
    ...(change.body === undefined
      ? []
      : [
          {
            kind: "write_markdown" as const,
            path: existing.bodyPath,
            markdown: body
          }
        ]),
    {
      kind: "write_json",
      path: existing.path,
      json: json.data
    }
  ]);
}

function buildMarkStaleActions(
  change: NormalizedMarkStaleChange,
  state: WriteState,
  eventAppends: readonly PatchPlannedEventAppend[],
  validators: CompiledSchemaValidators
): Result<PatchWriteAction[]> {
  const existing = state.objectsById.get(change.id);

  if (existing === undefined) {
    return internalError(`Planned stale marker has no loaded object: ${change.id}.`);
  }

  const timestamp = objectEventTimestamp(eventAppends, change.id, "mark_stale");

  if (!timestamp.ok) {
    return timestamp;
  }

  return buildObjectStatusActions(
    existing,
    {
      status: "stale",
      updatedAt: timestamp.data
    },
    state,
    validators
  );
}

function buildSupersedeObjectActions(
  change: NormalizedSupersedeObjectChange,
  state: WriteState,
  eventAppends: readonly PatchPlannedEventAppend[],
  validators: CompiledSchemaValidators
): Result<PatchWriteAction[]> {
  const existing = state.objectsById.get(change.id);

  if (existing === undefined) {
    return internalError(`Planned supersede has no loaded object: ${change.id}.`);
  }

  const timestamp = objectEventTimestamp(eventAppends, change.id, "supersede_object");

  if (!timestamp.ok) {
    return timestamp;
  }

  return buildObjectStatusActions(
    existing,
    {
      status: "superseded",
      supersededBy: change.superseded_by,
      updatedAt: timestamp.data
    },
    state,
    validators
  );
}

function buildObjectStatusActions(
  existing: StoredMemoryObject,
  update: {
    status: ObjectStatus;
    updatedAt: IsoDateTime;
    supersededBy?: ObjectId | null;
  },
  state: WriteState,
  validators: CompiledSchemaValidators
): Result<PatchWriteAction[]> {
  const sidecarWithoutHash = buildObjectSidecarWithoutHash({
    id: existing.sidecar.id,
    type: existing.sidecar.type,
    status: update.status,
    title: existing.sidecar.title,
    bodyPath: existing.sidecar.body_path,
    scope: existing.sidecar.scope,
    tags: existing.sidecar.tags,
    source: existing.sidecar.source,
    supersededBy:
      update.supersededBy === undefined
        ? existing.sidecar.superseded_by
        : update.supersededBy,
    createdAt: existing.sidecar.created_at,
    updatedAt: update.updatedAt
  });
  const sidecar = withObjectHash(sidecarWithoutHash, existing.body);
  const json = validateObjectSidecar(
    sidecar,
    existing.body,
    existing.path,
    existing.bodyPath,
    validators
  );

  if (!json.ok) {
    return json;
  }

  state.objectsById.set(existing.sidecar.id, {
    ...existing,
    sidecar
  });

  return ok([
    {
      kind: "write_json",
      path: existing.path,
      json: json.data
    }
  ]);
}

function buildDeleteObjectActions(
  change: NormalizedDeleteObjectChange,
  state: WriteState
): Result<PatchWriteAction[]> {
  if (!state.objectsById.has(change.id)) {
    return internalError(`Planned object delete has no loaded object: ${change.id}.`);
  }

  state.objectsById.delete(change.id);

  return ok([
    {
      kind: "delete",
      path: change.bodyPath
    },
    {
      kind: "delete",
      path: change.path
    }
  ]);
}

function buildRelationWriteActions(
  change: RelationPatchChange,
  state: WriteState,
  eventAppends: readonly PatchPlannedEventAppend[],
  validators: CompiledSchemaValidators
): Result<PatchWriteAction[]> {
  switch (change.op) {
    case "create_relation":
      return buildCreateRelationActions(change, state, validators);
    case "update_relation":
      return buildUpdateRelationActions(change, state, eventAppends, validators);
    case "delete_relation":
      return buildDeleteRelationActions(change, state);
  }
}

function buildCreateRelationActions(
  change: NormalizedCreateRelationChange,
  state: WriteState,
  validators: CompiledSchemaValidators
): Result<PatchWriteAction[]> {
  const relation = withRelationHash({
    id: change.id,
    from: change.from,
    predicate: change.predicate,
    to: change.to,
    status: change.status,
    ...(change.confidence === undefined ? {} : { confidence: change.confidence }),
    ...(change.evidence === undefined ? {} : { evidence: change.evidence }),
    created_at: change.createdAt,
    updated_at: change.createdAt
  });
  const json = relationToJson(relation);
  const validation = validateRelation(validators, json, change.path);

  if (!validation.valid) {
    return err(schemaValidationError(validation.errors));
  }

  state.relationsById.set(change.id, relation);

  return ok([
    {
      kind: "write_json",
      path: change.path,
      json
    }
  ]);
}

function buildUpdateRelationActions(
  change: NormalizedUpdateRelationChange,
  state: WriteState,
  eventAppends: readonly PatchPlannedEventAppend[],
  validators: CompiledSchemaValidators
): Result<PatchWriteAction[]> {
  if (!relationUpdateTouchesMutableField(change)) {
    return ok([]);
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

  return ok([
    {
      kind: "write_json",
      path: change.path,
      json
    }
  ]);
}

function buildDeleteRelationActions(
  change: NormalizedDeleteRelationChange,
  state: WriteState
): Result<PatchWriteAction[]> {
  if (!state.relationsById.has(change.id)) {
    return internalError(`Planned relation delete has no loaded relation: ${change.id}.`);
  }

  state.relationsById.delete(change.id);

  return ok([
    {
      kind: "delete",
      path: change.path
    }
  ]);
}

function buildObjectSidecarWithoutHash(
  input: ObjectSidecarInput
): Omit<MemoryObjectSidecar, "content_hash"> {
  const sidecar: Omit<MemoryObjectSidecar, "content_hash"> = {
    id: input.id,
    type: input.type,
    status: input.status,
    title: input.title,
    body_path: input.bodyPath,
    scope: cloneScope(input.scope),
    created_at: input.createdAt,
    updated_at: input.updatedAt
  };

  if (input.tags !== undefined) {
    sidecar.tags = [...input.tags];
  }

  if (input.source !== undefined) {
    sidecar.source = cloneSource(input.source);
  }

  if (input.supersededBy !== undefined) {
    sidecar.superseded_by = input.supersededBy;
  }

  return sidecar;
}

function withObjectHash(
  sidecar: Omit<MemoryObjectSidecar, "content_hash">,
  body: string
): MemoryObjectSidecar {
  const sidecarJson = objectSidecarToJson(sidecar);

  return {
    ...sidecar,
    content_hash: computeObjectContentHash(sidecarJson, body)
  };
}

function validateObjectSidecar(
  sidecar: MemoryObjectSidecar,
  body: string,
  sidecarPath: string,
  bodyPath: string,
  validators: CompiledSchemaValidators
): Result<Record<string, JsonValue>> {
  const markdownValidation = validateMarkdownBody(body, bodyPath);

  if (!markdownValidation.valid) {
    return err(schemaValidationError(markdownValidation.errors));
  }

  const json = objectSidecarToJson(sidecar);
  const validation = validateObject(validators, json, sidecarPath);

  if (!validation.valid) {
    return err(schemaValidationError(validation.errors));
  }

  return ok(json);
}

function objectSidecarToJson(
  sidecar: Omit<MemoryObjectSidecar, "content_hash"> | MemoryObjectSidecar
): Record<string, JsonValue> {
  const json: Record<string, JsonValue> = {
    id: sidecar.id,
    type: sidecar.type,
    status: sidecar.status,
    title: sidecar.title,
    body_path: sidecar.body_path,
    scope: {
      kind: sidecar.scope.kind,
      project: sidecar.scope.project,
      branch: sidecar.scope.branch,
      task: sidecar.scope.task
    },
    created_at: sidecar.created_at,
    updated_at: sidecar.updated_at
  };

  if (sidecar.tags !== undefined) {
    json.tags = [...sidecar.tags];
  }

  if (sidecar.source !== undefined) {
    json.source = sourceToJson(sidecar.source);
  }

  if (sidecar.superseded_by !== undefined) {
    json.superseded_by = sidecar.superseded_by;
  }

  if ("content_hash" in sidecar) {
    json.content_hash = sidecar.content_hash;
  }

  return json;
}

function sourceToJson(source: Source): Record<string, JsonValue> {
  const json: Record<string, JsonValue> = {
    kind: source.kind
  };

  if (source.task !== undefined) {
    json.task = source.task;
  }

  if (source.commit !== undefined) {
    json.commit = source.commit;
  }

  return json;
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

function withRelationHash(relation: Omit<MemoryRelation, "content_hash">): MemoryRelation {
  return {
    ...relation,
    content_hash: computeRelationContentHash(relationToJson(relation))
  };
}

function buildPlannedEvents(
  eventAppends: readonly PatchPlannedEventAppend[],
  validators: CompiledSchemaValidators
): Result<MemoryEvent[]> {
  const events: MemoryEvent[] = [];

  for (const append of eventAppends) {
    const eventInput = plannedEventInput(append);

    if (!eventInput.ok) {
      return eventInput;
    }

    const event = buildWriteEvent(eventInput.data);
    const validation = validateBuiltEvent(validators, event);

    if (!validation.ok) {
      return validation;
    }

    events.push(validation.data);
  }

  return ok(events);
}

function plannedEventInput(
  append: PatchPlannedEventAppend
): Result<Parameters<typeof buildWriteEvent>[0]> {
  if (isMemoryOperation(append.operation)) {
    if (append.id === undefined) {
      return internalError(`Planned memory event is missing an object id: ${append.operation}.`);
    }

    return ok({
      operation: append.operation,
      id: append.id,
      actor: append.actor,
      timestamp: append.timestamp,
      ...(append.reason === undefined ? {} : { reason: append.reason })
    });
  }

  if (append.relationId === undefined) {
    return internalError(`Planned relation event is missing a relation id: ${append.operation}.`);
  }

  return ok({
    operation: append.operation,
    relationId: append.relationId,
    actor: append.actor,
    timestamp: append.timestamp,
    ...(append.reason === undefined ? {} : { reason: append.reason })
  });
}

async function applyWriteAction(
  projectRoot: string,
  action: PatchWriteAction
): Promise<Result<void>> {
  if (action.kind === "write_json") {
    return writeJsonAtomic(projectRoot, action.path, action.json);
  }

  if (action.kind === "write_markdown") {
    return writeMarkdownAtomic(projectRoot, action.path, action.markdown);
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
      aictxError("AICtxValidationFailed", "Canonical file could not be deleted.", {
        path: action.path,
        message: error instanceof Error ? error.message : String(error)
      })
    );
  }
}

function objectUpdateTouchesMutableField(change: NormalizedUpdateObjectChange): boolean {
  return (
    change.status !== undefined ||
    change.title !== undefined ||
    change.body !== undefined ||
    change.scope !== undefined ||
    change.tags !== undefined ||
    change.source !== undefined ||
    change.superseded_by !== undefined
  );
}

function relationUpdateTouchesMutableField(change: NormalizedUpdateRelationChange): boolean {
  return (
    change.status !== undefined ||
    change.confidence !== undefined ||
    change.evidence !== undefined
  );
}

function objectEventTimestamp(
  eventAppends: readonly PatchPlannedEventAppend[],
  id: ObjectId,
  operation: MemoryPatchOperation
): Result<IsoDateTime> {
  const event = eventAppends.find(
    (append) => append.operation === operation && append.id === id
  );

  if (event === undefined) {
    return internalError(`Missing planned memory event timestamp for ${operation}:${id}.`);
  }

  return ok(event.timestamp);
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

function toAictxRelativePath(path: string): Result<string> {
  const prefix = ".aictx/";

  if (!path.startsWith(prefix)) {
    return internalError(`Planned object body path is not under .aictx/: ${path}.`);
  }

  return ok(path.slice(prefix.length));
}

function optionalConfidence(relation: MemoryRelation): { confidence: RelationConfidence } | {} {
  return relation.confidence === undefined ? {} : { confidence: relation.confidence };
}

function optionalEvidence(relation: MemoryRelation): { evidence: Evidence[] } | {} {
  return relation.evidence === undefined ? {} : { evidence: relation.evidence };
}

function cloneScope(scope: Scope): Scope {
  return {
    kind: scope.kind,
    project: scope.project,
    branch: scope.branch,
    task: scope.task
  };
}

function cloneSource(source: Source): Source {
  return {
    kind: source.kind,
    ...(source.task === undefined ? {} : { task: source.task }),
    ...(source.commit === undefined ? {} : { commit: source.commit })
  };
}

function isObjectChange(change: NormalizedPatchChange): change is ObjectPatchChange {
  switch (change.op) {
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

function isMemoryOperation(operation: PatchOperation): operation is MemoryPatchOperation {
  switch (operation) {
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

function internalError<T>(message: string): Result<T> {
  return err(aictxError("AICtxInternalError", message));
}
