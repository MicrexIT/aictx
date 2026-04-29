import { lstat } from "node:fs/promises";

import type { Clock } from "../core/clock.js";
import { systemClock } from "../core/clock.js";
import { aictxError, type JsonValue } from "../core/errors.js";
import { err, ok, type Result } from "../core/result.js";
import type { GitState, ObjectId, RelationId, ValidationIssue } from "../core/types.js";
import type { StoredMemoryEvent } from "../storage/events.js";
import type { StoredMemoryObject } from "../storage/objects.js";
import { readCanonicalStorage, type CanonicalStorageSnapshot } from "../storage/read.js";
import type { StoredMemoryRelation } from "../storage/relations.js";
import { validateProject } from "../validation/validate.js";
import { CURRENT_INDEX_SCHEMA_VERSION, REQUIRED_META_DEFAULTS } from "./migrations.js";
import { rebuildIndex, type RebuildIndexData } from "./rebuild.js";
import {
  openIndexDatabase,
  resolveIndexDatabasePath,
  type IndexDatabaseConnection
} from "./sqlite.js";
import type { SqliteDatabase } from "./sqlite-driver.js";
type MetaKey = keyof typeof REQUIRED_META_DEFAULTS;

export interface IncrementalIndexTouchedChanges {
  objectIds?: readonly ObjectId[];
  deletedObjectIds?: readonly ObjectId[];
  relationIds?: readonly RelationId[];
  deletedRelationIds?: readonly RelationId[];
  appendedEventCount?: number;
}

export interface IncrementalIndexUpdateOptions {
  projectRoot: string;
  aictxRoot: string;
  touched: IncrementalIndexTouchedChanges;
  clock?: Clock;
  git?: Pick<GitState, "available" | "branch" | "commit">;
}

export interface IncrementalIndexUpdateData {
  index_updated: boolean;
  index_rebuilt: boolean;
  objects_updated: number;
  objects_skipped: number;
  objects_deleted: number;
  relations_updated: number;
  relations_deleted: number;
  events_indexed: number;
}

interface NormalizedTouchedChanges {
  objectIds: Set<ObjectId>;
  deletedObjectIds: Set<ObjectId>;
  relationIds: Set<RelationId>;
  deletedRelationIds: Set<RelationId>;
  appendedEventCount: number;
}

interface ExistingHashRow {
  content_hash: string;
}

export async function updateIndexIncrementally(
  options: IncrementalIndexUpdateOptions
): Promise<Result<IncrementalIndexUpdateData>> {
  const clock = options.clock ?? systemClock;
  const normalizedTouched = normalizeTouchedChanges(options.touched);

  if (!normalizedTouched.ok) {
    return normalizedTouched;
  }

  const validation = await validateProject(options.projectRoot, {
    git: {
      available: options.git?.available === true,
      branch: options.git?.branch ?? null
    }
  });
  const validationWarnings = warningsFromValidation(validation.warnings);

  if (!validation.valid) {
    return err(
      aictxError(
        "AICtxIndexUnavailable",
        "Canonical files are invalid; SQLite index was not updated.",
        validationIssuesDetails(validation.errors)
      ),
      validationWarnings
    );
  }

  const storage = await readCanonicalStorage(options.projectRoot);

  if (!storage.ok) {
    return err(
      aictxError("AICtxIndexUnavailable", "Canonical files could not be read for indexing.", {
        cause: errorToJson(storage.error)
      }),
      [...validationWarnings, ...storage.warnings]
    );
  }

  if (!storage.data.config.memory.autoIndex) {
    return ok(emptyUpdateData(), validationWarnings);
  }

  const databaseExists = await existingDatabaseCanBeUpdated(options.aictxRoot);

  if (!databaseExists.ok) {
    return fallbackToFullRebuild({
      options,
      clock,
      warnings: validationWarnings,
      failure: databaseExists.error
    });
  }

  const connection = await openIndexDatabase({ aictxRoot: options.aictxRoot });

  if (!connection.ok) {
    return fallbackToFullRebuild({
      options,
      clock,
      warnings: validationWarnings,
      failure: connection.error
    });
  }

  const updated = applyIncrementalTransaction(
    connection.data,
    storage.data,
    normalizedTouched.data,
    clock,
    options.git
  );
  const closed = connection.data.close();

  if (!updated.ok) {
    return fallbackToFullRebuild({
      options,
      clock,
      warnings: [...validationWarnings, ...updated.warnings, ...closed.warnings],
      failure: updated.error
    });
  }

  if (!closed.ok) {
    return err(closed.error, [...validationWarnings, ...closed.warnings]);
  }

  return ok(updated.data, validationWarnings);
}

export async function updateIndexAfterCanonicalWrite(
  options: IncrementalIndexUpdateOptions
): Promise<Result<IncrementalIndexUpdateData>> {
  const updated = await updateIndexIncrementally(options);

  if (updated.ok) {
    return updated;
  }

  return ok(emptyUpdateData(), [
    ...updated.warnings,
    `Index warning: ${updated.error.message}`
  ]);
}

async function existingDatabaseCanBeUpdated(aictxRoot: string): Promise<Result<void>> {
  const databasePath = await resolveIndexDatabasePath(aictxRoot);

  if (!databasePath.ok) {
    return indexUnavailable("SQLite index database path could not be resolved.", {
      cause: errorToJson(databasePath.error)
    });
  }

  try {
    const stat = await lstat(databasePath.data);

    if (!stat.isFile() || stat.size === 0) {
      return indexUnavailable("SQLite index database is missing or empty.", {
        path: databasePath.data
      });
    }

    return ok(undefined);
  } catch (error) {
    if (errorCode(error) === "ENOENT") {
      return indexUnavailable("SQLite index database is missing.", {
        path: databasePath.data
      });
    }

    return indexUnavailable("SQLite index database could not be checked.", {
      path: databasePath.data,
      message: messageFromUnknown(error)
    });
  }
}

function applyIncrementalTransaction(
  connection: IndexDatabaseConnection,
  storage: CanonicalStorageSnapshot,
  touched: NormalizedTouchedChanges,
  clock: Clock,
  git: Pick<GitState, "available" | "branch" | "commit"> | undefined
): Result<IncrementalIndexUpdateData> {
  return connection.transaction((db) => {
    const objects = indexObjectsById(storage.objects);
    const relations = indexRelationsById(storage.relations);
    const data = emptyUpdateData();

    data.index_updated = true;

    deleteObjects(db, touched.deletedObjectIds, data);
    upsertTouchedObjects(db, objects, touched, data);
    deleteRelations(db, touched.deletedRelationIds, data);
    upsertTouchedRelations(db, relations, touched, data);
    data.events_indexed = insertAppendedEvents(db, storage.events, touched.appendedEventCount);
    upsertMeta(db, storage, clock, git);

    return data;
  });
}

function deleteObjects(
  db: SqliteDatabase,
  objectIds: ReadonlySet<ObjectId>,
  data: IncrementalIndexUpdateData
): void {
  const deleteObject = db.prepare<[ObjectId]>("DELETE FROM objects WHERE id = ?");
  const deleteFts = db.prepare<[ObjectId]>("DELETE FROM objects_fts WHERE object_id = ?");

  for (const objectId of objectIds) {
    deleteFts.run(objectId);
    deleteObject.run(objectId);
    data.objects_deleted += 1;
  }
}

function upsertTouchedObjects(
  db: SqliteDatabase,
  objects: ReadonlyMap<ObjectId, StoredMemoryObject>,
  touched: NormalizedTouchedChanges,
  data: IncrementalIndexUpdateData
): void {
  const selectHash = db.prepare<[ObjectId], ExistingHashRow>(
    "SELECT content_hash FROM objects WHERE id = ?"
  );
  const upsertObject = db.prepare<Record<string, string | null>>(`
    INSERT INTO objects (
      id,
      type,
      status,
      title,
      body_path,
      json_path,
      body,
      content_hash,
      scope_json,
      scope_kind,
      scope_project,
      scope_branch,
      scope_task,
      tags_json,
      source_json,
      superseded_by,
      created_at,
      updated_at
    ) VALUES (
      @id,
      @type,
      @status,
      @title,
      @body_path,
      @json_path,
      @body,
      @content_hash,
      @scope_json,
      @scope_kind,
      @scope_project,
      @scope_branch,
      @scope_task,
      @tags_json,
      @source_json,
      @superseded_by,
      @created_at,
      @updated_at
    )
    ON CONFLICT(id) DO UPDATE SET
      type = excluded.type,
      status = excluded.status,
      title = excluded.title,
      body_path = excluded.body_path,
      json_path = excluded.json_path,
      body = excluded.body,
      content_hash = excluded.content_hash,
      scope_json = excluded.scope_json,
      scope_kind = excluded.scope_kind,
      scope_project = excluded.scope_project,
      scope_branch = excluded.scope_branch,
      scope_task = excluded.scope_task,
      tags_json = excluded.tags_json,
      source_json = excluded.source_json,
      superseded_by = excluded.superseded_by,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at
  `);
  const deleteFts = db.prepare<[ObjectId]>("DELETE FROM objects_fts WHERE object_id = ?");
  const insertFts = db.prepare<Record<string, string>>(`
    INSERT INTO objects_fts (object_id, title, body, tags)
    VALUES (@object_id, @title, @body, @tags)
  `);
  const deleteObject = db.prepare<[ObjectId]>("DELETE FROM objects WHERE id = ?");

  for (const objectId of touched.objectIds) {
    if (touched.deletedObjectIds.has(objectId)) {
      continue;
    }

    const object = objects.get(objectId);

    if (object === undefined) {
      deleteFts.run(objectId);
      deleteObject.run(objectId);
      data.objects_deleted += 1;
      continue;
    }

    const indexed = selectHash.get(objectId);

    if (indexed?.content_hash === object.sidecar.content_hash) {
      data.objects_skipped += 1;
      continue;
    }

    const tags = object.sidecar.tags ?? [];

    upsertObject.run({
      id: object.sidecar.id,
      type: object.sidecar.type,
      status: object.sidecar.status,
      title: object.sidecar.title,
      body_path: object.bodyPath,
      json_path: object.path,
      body: object.body,
      content_hash: object.sidecar.content_hash,
      scope_json: JSON.stringify(object.sidecar.scope),
      scope_kind: object.sidecar.scope.kind,
      scope_project: object.sidecar.scope.project,
      scope_branch: object.sidecar.scope.branch,
      scope_task: object.sidecar.scope.task,
      tags_json: JSON.stringify(tags),
      source_json: jsonOrNull(object.sidecar.source),
      superseded_by: object.sidecar.superseded_by ?? null,
      created_at: object.sidecar.created_at,
      updated_at: object.sidecar.updated_at
    });
    deleteFts.run(object.sidecar.id);
    insertFts.run({
      object_id: object.sidecar.id,
      title: object.sidecar.title,
      body: object.body,
      tags: tags.join(" ")
    });
    data.objects_updated += 1;
  }
}

function deleteRelations(
  db: SqliteDatabase,
  relationIds: ReadonlySet<RelationId>,
  data: IncrementalIndexUpdateData
): void {
  const deleteRelation = db.prepare<[RelationId]>("DELETE FROM relations WHERE id = ?");

  for (const relationId of relationIds) {
    deleteRelation.run(relationId);
    data.relations_deleted += 1;
  }
}

function upsertTouchedRelations(
  db: SqliteDatabase,
  relations: ReadonlyMap<RelationId, StoredMemoryRelation>,
  touched: NormalizedTouchedChanges,
  data: IncrementalIndexUpdateData
): void {
  const upsertRelation = db.prepare<Record<string, string | null>>(`
    INSERT INTO relations (
      id,
      from_id,
      predicate,
      to_id,
      status,
      confidence,
      evidence_json,
      content_hash,
      created_at,
      updated_at
    ) VALUES (
      @id,
      @from_id,
      @predicate,
      @to_id,
      @status,
      @confidence,
      @evidence_json,
      @content_hash,
      @created_at,
      @updated_at
    )
    ON CONFLICT(id) DO UPDATE SET
      from_id = excluded.from_id,
      predicate = excluded.predicate,
      to_id = excluded.to_id,
      status = excluded.status,
      confidence = excluded.confidence,
      evidence_json = excluded.evidence_json,
      content_hash = excluded.content_hash,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at
  `);
  const deleteRelation = db.prepare<[RelationId]>("DELETE FROM relations WHERE id = ?");

  for (const relationId of touched.relationIds) {
    if (touched.deletedRelationIds.has(relationId)) {
      continue;
    }

    const storedRelation = relations.get(relationId);

    if (storedRelation === undefined) {
      deleteRelation.run(relationId);
      data.relations_deleted += 1;
      continue;
    }

    const relation = storedRelation.relation;

    upsertRelation.run({
      id: relation.id,
      from_id: relation.from,
      predicate: relation.predicate,
      to_id: relation.to,
      status: relation.status,
      confidence: relation.confidence ?? null,
      evidence_json: jsonOrNull(relation.evidence),
      content_hash: relation.content_hash ?? null,
      created_at: relation.created_at,
      updated_at: relation.updated_at
    });
    data.relations_updated += 1;
  }
}

function insertAppendedEvents(
  db: SqliteDatabase,
  events: readonly StoredMemoryEvent[],
  appendedEventCount: number
): number {
  if (appendedEventCount === 0) {
    return 0;
  }

  if (appendedEventCount > events.length) {
    throw new Error("Appended event count exceeds events in canonical storage.");
  }

  const appendedEvents = events.slice(events.length - appendedEventCount);
  const deleteEvent = db.prepare<[number]>("DELETE FROM events WHERE line_number = ?");
  const insertEvent = db.prepare<Record<string, number | string | null>>(`
    INSERT INTO events (
      line_number,
      event,
      memory_id,
      relation_id,
      actor,
      timestamp,
      reason,
      payload_json
    ) VALUES (
      @line_number,
      @event,
      @memory_id,
      @relation_id,
      @actor,
      @timestamp,
      @reason,
      @payload_json
    )
  `);

  for (const event of appendedEvents) {
    deleteEvent.run(event.line);
    insertEvent.run({
      line_number: event.line,
      event: event.event,
      memory_id: event.id ?? null,
      relation_id: event.relation_id ?? null,
      actor: event.actor,
      timestamp: event.timestamp,
      reason: event.reason ?? null,
      payload_json: jsonOrNull(event.payload)
    });
  }

  return appendedEvents.length;
}

function upsertMeta(
  db: SqliteDatabase,
  storage: CanonicalStorageSnapshot,
  clock: Clock,
  git: Pick<GitState, "available" | "branch" | "commit"> | undefined
): void {
  const upsert = db.prepare<[string, string]>(`
    INSERT INTO meta (key, value)
    VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `);
  const metaRows: Record<MetaKey, string> = {
    schema_version: String(CURRENT_INDEX_SCHEMA_VERSION),
    built_at: clock.nowIso(),
    source_git_commit: git?.available === true && git.commit !== null ? git.commit : "",
    git_available: git?.available === true ? "true" : "false",
    storage_version: String(storage.config.version),
    object_count: String(storage.objects.length),
    relation_count: String(storage.relations.length),
    event_count: String(storage.events.length)
  };

  for (const [key, value] of Object.entries(metaRows)) {
    upsert.run(key, value);
  }
}

async function fallbackToFullRebuild(options: {
  options: IncrementalIndexUpdateOptions;
  clock: Clock;
  warnings: readonly string[];
  failure: { code: string; message: string; details?: JsonValue };
}): Promise<Result<IncrementalIndexUpdateData>> {
  const rebuilt = await rebuildIndex({
    projectRoot: options.options.projectRoot,
    aictxRoot: options.options.aictxRoot,
    clock: options.clock,
    ...(options.options.git === undefined ? {} : { git: options.options.git })
  });

  const fallbackWarnings = [
    ...options.warnings,
    `Incremental index update failed before full rebuild: ${options.failure.message}`
  ];

  if (!rebuilt.ok) {
    return err(rebuilt.error, [...fallbackWarnings, ...rebuilt.warnings]);
  }

  return ok(incrementalDataFromRebuild(rebuilt.data), [...fallbackWarnings, ...rebuilt.warnings]);
}

function incrementalDataFromRebuild(rebuilt: RebuildIndexData): IncrementalIndexUpdateData {
  return {
    index_updated: true,
    index_rebuilt: true,
    objects_updated: rebuilt.objects_indexed,
    objects_skipped: 0,
    objects_deleted: 0,
    relations_updated: rebuilt.relations_indexed,
    relations_deleted: 0,
    events_indexed: rebuilt.events_indexed
  };
}

function indexObjectsById(
  objects: readonly StoredMemoryObject[]
): Map<ObjectId, StoredMemoryObject> {
  return new Map(objects.map((object) => [object.sidecar.id, object]));
}

function indexRelationsById(
  relations: readonly StoredMemoryRelation[]
): Map<RelationId, StoredMemoryRelation> {
  return new Map(relations.map((relation) => [relation.relation.id, relation]));
}

function normalizeTouchedChanges(
  touched: IncrementalIndexTouchedChanges
): Result<NormalizedTouchedChanges> {
  const appendedEventCount = touched.appendedEventCount ?? 0;

  if (!Number.isSafeInteger(appendedEventCount) || appendedEventCount < 0) {
    return indexUnavailable("Appended event count must be a non-negative safe integer.", {
      appendedEventCount
    });
  }

  return ok({
    objectIds: new Set(touched.objectIds ?? []),
    deletedObjectIds: new Set(touched.deletedObjectIds ?? []),
    relationIds: new Set(touched.relationIds ?? []),
    deletedRelationIds: new Set(touched.deletedRelationIds ?? []),
    appendedEventCount
  });
}

function emptyUpdateData(): IncrementalIndexUpdateData {
  return {
    index_updated: false,
    index_rebuilt: false,
    objects_updated: 0,
    objects_skipped: 0,
    objects_deleted: 0,
    relations_updated: 0,
    relations_deleted: 0,
    events_indexed: 0
  };
}

function jsonOrNull(value: unknown | undefined): string | null {
  return value === undefined ? null : JSON.stringify(value);
}

function validationIssuesDetails(issues: readonly ValidationIssue[]): JsonValue {
  return {
    issues: issues.map((issue) => ({
      code: issue.code,
      message: issue.message,
      path: issue.path,
      field: issue.field
    }))
  };
}

function warningsFromValidation(issues: readonly ValidationIssue[]): string[] {
  return issues.map((issue) => `Validation warning in ${issue.path}: ${issue.message}`);
}

function indexUnavailable<T>(message: string, details: JsonValue): Result<T> {
  return err(aictxError("AICtxIndexUnavailable", message, details));
}

function errorToJson(error: { code: string; message: string; details?: JsonValue }): JsonValue {
  return error.details === undefined
    ? {
        code: error.code,
        message: error.message
      }
    : {
        code: error.code,
        message: error.message,
        details: error.details
      };
}

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code: unknown }).code)
    : undefined;
}

function messageFromUnknown(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
