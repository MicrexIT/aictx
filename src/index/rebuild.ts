import DatabaseConstructor from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { lstat, mkdir, realpath, rename, rm } from "node:fs/promises";
import { dirname, isAbsolute, join, relative } from "node:path";

import type { Clock } from "../core/clock.js";
import { systemClock } from "../core/clock.js";
import { aictxError, type JsonValue } from "../core/errors.js";
import { err, ok, type Result } from "../core/result.js";
import type { GitState, ValidationIssue } from "../core/types.js";
import { readCanonicalStorage, type CanonicalStorageSnapshot } from "../storage/read.js";
import { validateProject } from "../validation/validate.js";
import {
  CURRENT_INDEX_SCHEMA_VERSION,
  migrateIndexDatabase,
  REQUIRED_META_DEFAULTS
} from "./migrations.js";
import { resolveIndexDatabasePath } from "./sqlite.js";

type SqliteDatabase = DatabaseConstructor.Database;

export interface RebuildIndexOptions {
  projectRoot: string;
  aictxRoot: string;
  clock?: Clock;
  git?: Pick<GitState, "available" | "branch" | "commit">;
}

export interface RebuildIndexData {
  index_rebuilt: true;
  objects_indexed: number;
  relations_indexed: number;
  events_indexed: number;
  event_appended: false;
}

type MetaKey = keyof typeof REQUIRED_META_DEFAULTS;

export async function rebuildIndex(
  options: RebuildIndexOptions
): Promise<Result<RebuildIndexData>> {
  const clock = options.clock ?? systemClock;
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
        "Canonical files are invalid; SQLite index was not replaced.",
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

  const databasePath = await resolveIndexDatabasePath(options.aictxRoot);

  if (!databasePath.ok) {
    return databasePath;
  }

  const indexDirectory = dirname(databasePath.data);
  const temporaryPath = join(indexDirectory, `.aictx-rebuild-${randomUUID()}.sqlite`);

  try {
    await mkdir(indexDirectory, { recursive: true });
  } catch (error) {
    return indexUnavailable("SQLite index directory could not be prepared.", {
      path: indexDirectory,
      message: messageFromUnknown(error)
    });
  }

  const validIndexDirectory = await validateIndexDirectory(options.aictxRoot, indexDirectory);

  if (!validIndexDirectory.ok) {
    return validIndexDirectory;
  }

  const built = await buildTemporaryDatabase({
    path: temporaryPath,
    storage: storage.data,
    clock,
    git: options.git
  });

  if (!built.ok) {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    return built;
  }

  try {
    await rename(temporaryPath, databasePath.data);
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    return indexUnavailable("SQLite index database could not be replaced.", {
      path: databasePath.data,
      message: messageFromUnknown(error)
    });
  }

  return ok(built.data, validationWarnings);
}

async function validateIndexDirectory(
  aictxRoot: string,
  indexDirectory: string
): Promise<Result<void>> {
  try {
    const directoryStat = await lstat(indexDirectory);

    if (directoryStat.isSymbolicLink()) {
      return indexUnavailable("Refusing to rebuild SQLite index through a symbolic link.", {
        path: indexDirectory
      });
    }

    if (!directoryStat.isDirectory()) {
      return indexUnavailable("SQLite index path is not a directory.", {
        path: indexDirectory
      });
    }

    const [realAictxRoot, realIndexDirectory] = await Promise.all([
      realpath(aictxRoot),
      realpath(indexDirectory)
    ]);

    if (!isInsideOrEqual(realAictxRoot, realIndexDirectory)) {
      return indexUnavailable("SQLite index directory resolves outside the Aictx root.", {
        aictxRoot: realAictxRoot,
        indexDirectory: realIndexDirectory
      });
    }

    return ok(undefined);
  } catch (error) {
    return indexUnavailable("SQLite index directory could not be validated.", {
      path: indexDirectory,
      message: messageFromUnknown(error)
    });
  }
}

interface BuildTemporaryDatabaseOptions {
  path: string;
  storage: CanonicalStorageSnapshot;
  clock: Clock;
  git: Pick<GitState, "available" | "branch" | "commit"> | undefined;
}

async function buildTemporaryDatabase(
  options: BuildTemporaryDatabaseOptions
): Promise<Result<RebuildIndexData>> {
  let db: SqliteDatabase | null = null;

  try {
    db = new DatabaseConstructor(options.path);
    db.pragma("journal_mode = DELETE");

    const migrated = migrateIndexDatabase(db);

    if (!migrated.ok) {
      return migrated;
    }

    const populated = populateDatabase(db, options.storage, options.clock, options.git);

    if (!populated.ok) {
      return populated;
    }

    db.close();
    db = null;

    return populated;
  } catch (error) {
    return indexUnavailable("SQLite index rebuild failed.", {
      path: options.path,
      message: messageFromUnknown(error)
    });
  } finally {
    if (db?.open === true) {
      try {
        db.close();
      } catch {
        // The original rebuild error is more useful than a cleanup close failure.
      }
    }
  }
}

function populateDatabase(
  db: SqliteDatabase,
  storage: CanonicalStorageSnapshot,
  clock: Clock,
  git: Pick<GitState, "available" | "branch" | "commit"> | undefined
): Result<RebuildIndexData> {
  try {
    const run = db.transaction(() => {
      clearGeneratedRows(db);
      insertObjects(db, storage);
      insertRelations(db, storage);
      insertEvents(db, storage);
      insertMeta(db, storage, clock, git);

      return {
        index_rebuilt: true,
        objects_indexed: storage.objects.length,
        relations_indexed: storage.relations.length,
        events_indexed: storage.events.length,
        event_appended: false
      } satisfies RebuildIndexData;
    });

    return ok(run());
  } catch (error) {
    return indexUnavailable("SQLite index rows could not be rebuilt.", {
      message: messageFromUnknown(error)
    });
  }
}

function clearGeneratedRows(db: SqliteDatabase): void {
  db.exec(`
    DELETE FROM objects_fts;
    DELETE FROM events;
    DELETE FROM relations;
    DELETE FROM objects;
    DELETE FROM meta;
  `);
}

function insertObjects(db: SqliteDatabase, storage: CanonicalStorageSnapshot): void {
  const insertObject = db.prepare<Record<string, string | null>>(`
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
  `);
  const insertFts = db.prepare<Record<string, string>>(`
    INSERT INTO objects_fts (object_id, title, body, tags)
    VALUES (@object_id, @title, @body, @tags)
  `);

  for (const object of storage.objects) {
    const sidecar = object.sidecar;
    const tags = sidecar.tags ?? [];

    insertObject.run({
      id: sidecar.id,
      type: sidecar.type,
      status: sidecar.status,
      title: sidecar.title,
      body_path: object.bodyPath,
      json_path: object.path,
      body: object.body,
      content_hash: sidecar.content_hash,
      scope_json: JSON.stringify(sidecar.scope),
      scope_kind: sidecar.scope.kind,
      scope_project: sidecar.scope.project,
      scope_branch: sidecar.scope.branch,
      scope_task: sidecar.scope.task,
      tags_json: JSON.stringify(tags),
      source_json: jsonOrNull(sidecar.source),
      superseded_by: sidecar.superseded_by ?? null,
      created_at: sidecar.created_at,
      updated_at: sidecar.updated_at
    });

    insertFts.run({
      object_id: sidecar.id,
      title: sidecar.title,
      body: object.body,
      tags: tags.join(" ")
    });
  }
}

function insertRelations(db: SqliteDatabase, storage: CanonicalStorageSnapshot): void {
  const insertRelation = db.prepare<Record<string, string | null>>(`
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
  `);

  for (const storedRelation of storage.relations) {
    const relation = storedRelation.relation;

    insertRelation.run({
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
  }
}

function insertEvents(db: SqliteDatabase, storage: CanonicalStorageSnapshot): void {
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

  for (const event of storage.events) {
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
}

function insertMeta(
  db: SqliteDatabase,
  storage: CanonicalStorageSnapshot,
  clock: Clock,
  git: Pick<GitState, "available" | "branch" | "commit"> | undefined
): void {
  const insert = db.prepare<[string, string]>("INSERT INTO meta (key, value) VALUES (?, ?)");
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
    insert.run(key, value);
  }
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

function isInsideOrEqual(root: string, target: string): boolean {
  const relativePath = relative(root, target);

  return relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath));
}

function messageFromUnknown(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
