import DatabaseConstructor from "better-sqlite3";
import { systemClock, type Clock } from "../core/clock.js";
import { aictxError, type AictxError, type JsonValue } from "../core/errors.js";
import { readUtf8FileInsideRoot } from "../core/fs.js";
import {
  getAictxDiff,
  getAictxDirtyState,
  getGitState,
  showAictxFileAtCommit,
  type GitWrapperOptions
} from "../core/git.js";
import { withProjectLock } from "../core/lock.js";
import { resolveProjectPaths, type ProjectPaths } from "../core/paths.js";
import { err, ok, type Result } from "../core/result.js";
import {
  runSubprocess,
  type SubprocessResult
} from "../core/subprocess.js";
import type {
  AictxMeta,
  IsoDateTime,
  ObjectId,
  ObjectStatus,
  ObjectType,
  Predicate,
  RelationConfidence,
  RelationId,
  RelationStatus,
  Scope,
  Source,
  ValidationIssue
} from "../core/types.js";
import {
  compileContextPack,
  type LoadMemoryData,
  type LoadMemoryInput
} from "../context/compile.js";
import {
  updateIndexAfterCanonicalWrite
} from "../index/incremental.js";
import {
  rebuildIndex as rebuildGeneratedIndex,
  type RebuildIndexData
} from "../index/rebuild.js";
import { CURRENT_INDEX_SCHEMA_VERSION } from "../index/migrations.js";
import {
  searchIndex,
  type SearchIndexOptions,
  type SearchMemoryData,
  type SearchMemoryInput
} from "../index/search.js";
import { resolveIndexDatabasePath } from "../index/sqlite.js";
import {
  initializeStorage,
  type InitStorageData
} from "../storage/init.js";
import type { StoredMemoryObject } from "../storage/objects.js";
import {
  readCanonicalStorage,
  type CanonicalStorageSnapshot
} from "../storage/read.js";
import type { StoredMemoryRelation } from "../storage/relations.js";
import { applyMemoryPatch } from "../storage/write.js";
import {
  conflictMarkerError,
  scanProjectConflictMarkers
} from "../validation/conflicts.js";
import {
  detectSecretsInPatch,
  secretDetectionError
} from "../validation/secrets.js";
import { validateProject } from "../validation/validate.js";

const INITIAL_INDEX_UNAVAILABLE_WARNING =
  "Initial index was not built because the index module is not available yet.";
const AICTX_HISTORY_PATHSPEC = ".aictx";
const HISTORY_FIELD_SEPARATOR = "\u001f";

export interface InitProjectOptions extends GitWrapperOptions {
  cwd: string;
  clock?: Clock;
}

export interface RebuildIndexOptions extends GitWrapperOptions {
  cwd: string;
  clock?: Clock;
}

export interface CheckProjectOptions extends GitWrapperOptions {
  cwd: string;
}

export interface LoadMemoryOptions extends GitWrapperOptions, LoadMemoryInput {
  cwd: string;
  clock?: Clock;
}

export interface SearchMemoryOptions extends GitWrapperOptions, SearchMemoryInput {
  cwd: string;
  clock?: Clock;
}

export interface InspectMemoryOptions extends GitWrapperOptions {
  cwd: string;
  id: ObjectId;
}

export interface ListStaleMemoryOptions extends GitWrapperOptions {
  cwd: string;
}

export interface GraphMemoryOptions extends GitWrapperOptions {
  cwd: string;
  id: ObjectId;
}

export interface DiffMemoryOptions extends GitWrapperOptions {
  cwd: string;
}

export interface ListMemoryHistoryOptions extends GitWrapperOptions {
  cwd: string;
  limit?: number;
}

export interface SaveMemoryPatchOptions extends GitWrapperOptions {
  cwd: string;
  patch?: unknown;
  clock?: Clock;
}

export interface SaveMemoryData {
  files_changed: string[];
  memory_created: ObjectId[];
  memory_updated: ObjectId[];
  memory_deleted: ObjectId[];
  relations_created: RelationId[];
  relations_updated: RelationId[];
  relations_deleted: RelationId[];
  events_appended: number;
  index_updated: boolean;
}

export interface DiffMemoryData {
  diff: string;
  changed_files: string[];
  changed_memory_ids: ObjectId[];
  changed_relation_ids: RelationId[];
}

export interface MemoryHistoryCommit {
  commit: string;
  short_commit: string;
  author: string;
  timestamp: IsoDateTime;
  subject: string;
}

export interface MemoryHistoryData {
  commits: MemoryHistoryCommit[];
}

export interface CheckProjectData {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

export interface MemoryObjectSummary {
  id: ObjectId;
  type: ObjectType;
  status: ObjectStatus;
  title: string;
  body_path: string;
  json_path: string;
  scope: Scope;
  tags: string[];
  source: Source | null;
  superseded_by: ObjectId | null;
  created_at: string;
  updated_at: string;
  body: string;
}

export interface MemoryRelationSummary {
  id: RelationId;
  from: ObjectId;
  predicate: Predicate;
  to: ObjectId;
  status: RelationStatus;
  confidence: RelationConfidence | null;
  evidence: Array<{ kind: "memory" | "relation" | "file" | "commit"; id: string }>;
  content_hash: string | null;
  created_at: string;
  updated_at: string;
  json_path: string;
}

export interface InspectMemoryData {
  object: MemoryObjectSummary;
  relations: {
    outgoing: MemoryRelationSummary[];
    incoming: MemoryRelationSummary[];
  };
}

export interface ListStaleMemoryData {
  objects: MemoryObjectSummary[];
}

export interface GraphMemoryData {
  root_id: ObjectId;
  objects: MemoryObjectSummary[];
  relations: MemoryRelationSummary[];
}

export type AppResult<T> =
  | {
      ok: true;
      data: T;
      warnings: string[];
      meta: AictxMeta;
    }
  | {
      ok: false;
      error: AictxError;
      warnings: string[];
      meta: AictxMeta;
    };

export async function initProject(
  options: InitProjectOptions
): Promise<AppResult<InitStorageData>> {
  const clock = options.clock ?? systemClock;
  const initialized = await initializeStorage({
    cwd: options.cwd,
    clock,
    runner: options.runner
  });

  if (initialized.ok) {
    const meta = await buildMeta(initialized.data.paths, options);

    if (!meta.ok) {
      return meta;
    }

    const rebuilt = await rebuildIndexForResolvedProject({
      paths: initialized.data.paths,
      meta: meta.meta,
      clock
    });
    const initWarnings = initialized.warnings.filter(
      (warning) => warning !== INITIAL_INDEX_UNAVAILABLE_WARNING
    );

    if (rebuilt.ok) {
      return {
        ok: true,
        data: {
          ...initialized.data.data,
          index_built: true
        },
        warnings: [...initWarnings, ...rebuilt.warnings],
        meta: meta.meta
      };
    }

    return {
      ok: true,
      data: {
        ...initialized.data.data,
        index_built: false
      },
      warnings: [
        ...initWarnings,
        ...rebuilt.warnings,
        `Initial index rebuild failed: ${rebuilt.error.message}`
      ],
      meta: meta.meta
    };
  }

  const meta = await buildBestEffortMeta(options);

  return {
    ok: false,
    error: initialized.error,
    warnings: initialized.warnings,
    meta
  };
}

export async function rebuildIndex(
  options: RebuildIndexOptions
): Promise<AppResult<RebuildIndexData>> {
  const clock = options.clock ?? systemClock;
  const paths = await resolveProjectPaths({
    cwd: options.cwd,
    mode: "require-initialized",
    runner: options.runner
  });

  if (!paths.ok) {
    return {
      ok: false,
      error: paths.error,
      warnings: paths.warnings,
      meta: await buildBestEffortMeta(options)
    };
  }

  const meta = await buildMeta(paths.data, options);

  if (!meta.ok) {
    return meta;
  }

  const rebuilt = await rebuildIndexForResolvedProject({
    paths: paths.data,
    meta: meta.meta,
    clock
  });

  if (!rebuilt.ok) {
    return {
      ok: false,
      error: rebuilt.error,
      warnings: rebuilt.warnings,
      meta: meta.meta
    };
  }

  return {
    ok: true,
    data: rebuilt.data,
    warnings: rebuilt.warnings,
    meta: meta.meta
  };
}

export async function checkProject(
  options: CheckProjectOptions
): Promise<AppResult<CheckProjectData>> {
  const paths = await resolveProjectPaths({
    cwd: options.cwd,
    mode: "require-initialized",
    runner: options.runner
  });

  if (!paths.ok) {
    return {
      ok: false,
      error: paths.error,
      warnings: paths.warnings,
      meta: await buildBestEffortMeta(options)
    };
  }

  const meta = await buildMeta(paths.data, options);

  if (!meta.ok) {
    return meta;
  }

  const validation = await validateProject(paths.data.projectRoot, {
    git: {
      available: meta.meta.git.available,
      branch: meta.meta.git.branch
    }
  });
  const gitConflictIssues = await unresolvedGitConflictIssues(
    paths.data,
    meta.meta,
    options
  );

  if (!gitConflictIssues.ok) {
    return {
      ok: false,
      error: gitConflictIssues.error,
      warnings: gitConflictIssues.warnings,
      meta: meta.meta
    };
  }

  const errors = [...validation.errors, ...gitConflictIssues.data];
  const warnings =
    errors.length === 0
      ? [...validation.warnings, ...(await generatedIndexWarnings(paths.data))]
      : validation.warnings;

  return {
    ok: true,
    data: {
      valid: errors.length === 0,
      errors,
      warnings
    },
    warnings: [],
    meta: meta.meta
  };
}

export async function loadMemory(
  options: LoadMemoryOptions
): Promise<AppResult<LoadMemoryData>> {
  const clock = options.clock ?? systemClock;
  const paths = await resolveProjectPaths({
    cwd: options.cwd,
    mode: "require-initialized",
    runner: options.runner
  });

  if (!paths.ok) {
    return {
      ok: false,
      error: paths.error,
      warnings: paths.warnings,
      meta: await buildBestEffortMeta(options)
    };
  }

  const meta = await buildMeta(paths.data, options);

  if (!meta.ok) {
    return meta;
  }

  const compiled = await compileContextPack({
    paths: paths.data,
    git: meta.meta.git,
    task: options.task,
    ...(options.token_budget === undefined ? {} : { token_budget: options.token_budget }),
    ...(options.mode === undefined ? {} : { mode: options.mode }),
    clock
  });

  if (compiled.ok) {
    return {
      ok: true,
      data: compiled.data,
      warnings: compiled.warnings,
      meta: meta.meta
    };
  }

  if (compiled.error.code !== "AICtxIndexUnavailable") {
    return {
      ok: false,
      error: compiled.error,
      warnings: compiled.warnings,
      meta: meta.meta
    };
  }

  const autoIndex = await readAutoIndexSetting(paths.data);

  if (!autoIndex.ok) {
    return {
      ok: false,
      error: autoIndex.error,
      warnings: [...compiled.warnings, ...autoIndex.warnings],
      meta: meta.meta
    };
  }

  if (!autoIndex.data) {
    return {
      ok: false,
      error: compiled.error,
      warnings: [...compiled.warnings, ...autoIndex.warnings],
      meta: meta.meta
    };
  }

  const rebuilt = await rebuildIndexForResolvedProject({
    paths: paths.data,
    meta: meta.meta,
    clock
  });

  if (!rebuilt.ok) {
    return {
      ok: false,
      error: rebuilt.error,
      warnings: [...compiled.warnings, ...autoIndex.warnings, ...rebuilt.warnings],
      meta: meta.meta
    };
  }

  const retried = await compileContextPack({
    paths: paths.data,
    git: meta.meta.git,
    task: options.task,
    ...(options.token_budget === undefined ? {} : { token_budget: options.token_budget }),
    ...(options.mode === undefined ? {} : { mode: options.mode }),
    clock
  });

  if (!retried.ok) {
    return {
      ok: false,
      error: retried.error,
      warnings: [
        ...compiled.warnings,
        ...autoIndex.warnings,
        ...rebuilt.warnings,
        ...retried.warnings
      ],
      meta: meta.meta
    };
  }

  return {
    ok: true,
    data: retried.data,
    warnings: [...autoIndex.warnings, ...rebuilt.warnings, ...retried.warnings],
    meta: meta.meta
  };
}

export async function searchMemory(
  options: SearchMemoryOptions
): Promise<AppResult<SearchMemoryData>> {
  const clock = options.clock ?? systemClock;
  const paths = await resolveProjectPaths({
    cwd: options.cwd,
    mode: "require-initialized",
    runner: options.runner
  });

  if (!paths.ok) {
    return {
      ok: false,
      error: paths.error,
      warnings: paths.warnings,
      meta: await buildBestEffortMeta(options)
    };
  }

  const meta = await buildMeta(paths.data, options);

  if (!meta.ok) {
    return meta;
  }

  const searched = await searchIndex(searchIndexOptions(paths.data.aictxRoot, options));

  if (searched.ok) {
    return {
      ok: true,
      data: searched.data,
      warnings: searched.warnings,
      meta: meta.meta
    };
  }

  if (searched.error.code !== "AICtxIndexUnavailable") {
    return {
      ok: false,
      error: searched.error,
      warnings: searched.warnings,
      meta: meta.meta
    };
  }

  const autoIndex = await readAutoIndexSetting(paths.data);

  if (!autoIndex.ok) {
    return {
      ok: false,
      error: autoIndex.error,
      warnings: [...searched.warnings, ...autoIndex.warnings],
      meta: meta.meta
    };
  }

  if (!autoIndex.data) {
    return {
      ok: false,
      error: searched.error,
      warnings: [...searched.warnings, ...autoIndex.warnings],
      meta: meta.meta
    };
  }

  const rebuilt = await rebuildIndexForResolvedProject({
    paths: paths.data,
    meta: meta.meta,
    clock
  });

  if (!rebuilt.ok) {
    return {
      ok: false,
      error: rebuilt.error,
      warnings: [...searched.warnings, ...autoIndex.warnings, ...rebuilt.warnings],
      meta: meta.meta
    };
  }

  const retried = await searchIndex(searchIndexOptions(paths.data.aictxRoot, options));

  if (!retried.ok) {
    return {
      ok: false,
      error: retried.error,
      warnings: [
        ...searched.warnings,
        ...autoIndex.warnings,
        ...rebuilt.warnings,
        ...retried.warnings
      ],
      meta: meta.meta
    };
  }

  return {
    ok: true,
    data: retried.data,
    warnings: [...autoIndex.warnings, ...rebuilt.warnings, ...retried.warnings],
    meta: meta.meta
  };
}

export async function inspectMemory(
  options: InspectMemoryOptions
): Promise<AppResult<InspectMemoryData>> {
  const prepared = await readOnlyCanonicalStorage(options);

  if (!prepared.ok) {
    return prepared;
  }

  const object = findStoredObject(prepared.storage.objects, options.id);

  if (object === undefined) {
    return {
      ok: false,
      error: objectNotFound(options.id),
      warnings: prepared.storageWarnings,
      meta: prepared.meta
    };
  }

  return {
    ok: true,
    data: {
      object: summarizeObject(object),
      relations: {
        outgoing: summarizeRelations(outgoingRelations(prepared.storage.relations, options.id)),
        incoming: summarizeRelations(incomingRelations(prepared.storage.relations, options.id))
      }
    },
    warnings: prepared.storageWarnings,
    meta: prepared.meta
  };
}

export async function listStaleMemory(
  options: ListStaleMemoryOptions
): Promise<AppResult<ListStaleMemoryData>> {
  const prepared = await readOnlyCanonicalStorage(options);

  if (!prepared.ok) {
    return prepared;
  }

  return {
    ok: true,
    data: {
      objects: prepared.storage.objects
        .filter((object) => STALE_MEMORY_STATUSES.has(object.sidecar.status))
        .sort(compareStaleMemoryObjects)
        .map(summarizeObject)
    },
    warnings: prepared.storageWarnings,
    meta: prepared.meta
  };
}

export async function graphMemory(
  options: GraphMemoryOptions
): Promise<AppResult<GraphMemoryData>> {
  const prepared = await readOnlyCanonicalStorage(options);

  if (!prepared.ok) {
    return prepared;
  }

  const root = findStoredObject(prepared.storage.objects, options.id);

  if (root === undefined) {
    return {
      ok: false,
      error: objectNotFound(options.id),
      warnings: prepared.storageWarnings,
      meta: prepared.meta
    };
  }

  const directRelations = relationsForObject(prepared.storage.relations, options.id);
  const objectIds = new Set<ObjectId>([options.id]);

  for (const relation of directRelations) {
    objectIds.add(relation.relation.from);
    objectIds.add(relation.relation.to);
  }

  return {
    ok: true,
    data: {
      root_id: options.id,
      objects: prepared.storage.objects
        .filter((object) => objectIds.has(object.sidecar.id))
        .sort(compareStoredObjectsById)
        .map(summarizeObject),
      relations: summarizeRelations(directRelations)
    },
    warnings: prepared.storageWarnings,
    meta: prepared.meta
  };
}

export async function diffMemory(
  options: DiffMemoryOptions
): Promise<AppResult<DiffMemoryData>> {
  const paths = await resolveProjectPaths({
    cwd: options.cwd,
    mode: "require-initialized",
    runner: options.runner
  });

  if (!paths.ok) {
    return {
      ok: false,
      error: paths.error,
      warnings: paths.warnings,
      meta: await buildBestEffortMeta(options)
    };
  }

  const meta = await buildMeta(paths.data, options);

  if (!meta.ok) {
    return meta;
  }

  if (!meta.meta.git.available) {
    return {
      ok: false,
      error: aictxError("AICtxGitRequired", "Git is required for this operation."),
      warnings: [],
      meta: meta.meta
    };
  }

  const diff = await getAictxDiff(paths.data.projectRoot, options);

  if (!diff.ok) {
    return {
      ok: false,
      error: diff.error,
      warnings: diff.warnings,
      meta: meta.meta
    };
  }

  const changedIds = await detectChangedIds(
    paths.data.projectRoot,
    diff.data.changedFiles,
    options
  );

  return {
    ok: true,
    data: {
      diff: diff.data.diff,
      changed_files: diff.data.changedFiles,
      changed_memory_ids: changedIds.memoryIds,
      changed_relation_ids: changedIds.relationIds
    },
    warnings: diff.warnings,
    meta: meta.meta
  };
}

export async function listMemoryHistory(
  options: ListMemoryHistoryOptions
): Promise<AppResult<MemoryHistoryData>> {
  const paths = await resolveProjectPaths({
    cwd: options.cwd,
    mode: "require-initialized",
    runner: options.runner
  });

  if (!paths.ok) {
    return {
      ok: false,
      error: paths.error,
      warnings: paths.warnings,
      meta: await buildBestEffortMeta(options)
    };
  }

  const meta = await buildMeta(paths.data, options);

  if (!meta.ok) {
    return meta;
  }

  if (!meta.meta.git.available) {
    return {
      ok: false,
      error: aictxError("AICtxGitRequired", "Git is required for this operation."),
      warnings: [],
      meta: meta.meta
    };
  }

  if (
    options.limit !== undefined &&
    (!Number.isInteger(options.limit) || options.limit < 1)
  ) {
    return {
      ok: false,
      error: aictxError("AICtxValidationFailed", "History limit must be a positive integer.", {
        limit: options.limit
      }),
      warnings: [],
      meta: meta.meta
    };
  }

  const history = await getAictxHistory(paths.data.projectRoot, options);

  if (!history.ok) {
    return {
      ok: false,
      error: history.error,
      warnings: history.warnings,
      meta: meta.meta
    };
  }

  return {
    ok: true,
    data: {
      commits: history.data
    },
    warnings: history.warnings,
    meta: meta.meta
  };
}

export async function saveMemoryPatch(
  options: SaveMemoryPatchOptions
): Promise<AppResult<SaveMemoryData>> {
  const clock = options.clock ?? systemClock;
  const paths = await resolveProjectPaths({
    cwd: options.cwd,
    mode: "require-initialized",
    runner: options.runner
  });

  if (!paths.ok) {
    return {
      ok: false,
      error: paths.error,
      warnings: paths.warnings,
      meta: await buildBestEffortMeta(options)
    };
  }

  const meta = await buildMeta(paths.data, options);

  if (!meta.ok) {
    return meta;
  }

  if (options.patch === undefined) {
    return {
      ok: false,
      error: aictxError("AICtxPatchRequired", "Structured memory patch is required."),
      warnings: [],
      meta: meta.meta
    };
  }

  const saved = await withProjectLock(
    {
      aictxRoot: paths.data.aictxRoot,
      operation: "save",
      clock
    },
    async () => {
      const conflicts = await rejectConflictsBeforeSave(paths.data, meta.meta, options);

      if (!conflicts.ok) {
        return conflicts;
      }

      const secrets = rejectPatchSecrets(options.patch);

      if (!secrets.ok) {
        return secrets;
      }

      const applied = await applyMemoryPatch({
        projectRoot: paths.data.projectRoot,
        patch: options.patch,
        git: meta.meta.git,
        clock,
        runner: options.runner
      });

      if (!applied.ok) {
        return err(applied.error, [...secrets.warnings, ...applied.warnings]);
      }

      const indexed = await updateIndexAfterCanonicalWrite({
        projectRoot: paths.data.projectRoot,
        aictxRoot: paths.data.aictxRoot,
        clock,
        git: meta.meta.git,
        touched: {
          objectIds: [...applied.data.memory_created, ...applied.data.memory_updated],
          deletedObjectIds: applied.data.memory_deleted,
          relationIds: [
            ...applied.data.relations_created,
            ...applied.data.relations_updated
          ],
          deletedRelationIds: applied.data.relations_deleted,
          appendedEventCount: applied.data.events_appended
        }
      });

      return ok(
        {
          files_changed: applied.data.files_changed,
          memory_created: applied.data.memory_created,
          memory_updated: applied.data.memory_updated,
          memory_deleted: applied.data.memory_deleted,
          relations_created: applied.data.relations_created,
          relations_updated: applied.data.relations_updated,
          relations_deleted: applied.data.relations_deleted,
          events_appended: applied.data.events_appended,
          index_updated: indexed.ok ? indexed.data.index_updated : false
        },
        [
          ...secrets.warnings,
          ...applied.warnings,
          ...indexed.warnings,
          ...(indexed.ok ? [] : [`Index warning: ${indexed.error.message}`])
        ]
      );
    }
  );

  if (!saved.ok) {
    return {
      ok: false,
      error: saved.error,
      warnings: saved.warnings,
      meta: meta.meta
    };
  }

  const refreshedMeta = await buildMeta(paths.data, options);

  if (!refreshedMeta.ok) {
    return {
      ok: true,
      data: saved.data,
      warnings: [
        ...saved.warnings,
        ...refreshedMeta.warnings,
        `Git metadata refresh failed after save: ${refreshedMeta.error.message}`
      ],
      meta: refreshedMeta.meta
    };
  }

  return {
    ok: true,
    data: saved.data,
    warnings: saved.warnings,
    meta: refreshedMeta.meta
  };
}

export const applicationOperations = {
  checkProject,
  diffMemory,
  graphMemory,
  initProject,
  inspectMemory,
  listMemoryHistory,
  listStaleMemory,
  loadMemory,
  rebuildIndex,
  saveMemoryPatch,
  searchMemory
};

const STALE_MEMORY_STATUSES = new Set<ObjectStatus>([
  "stale",
  "superseded",
  "rejected"
]);

const STALE_MEMORY_STATUS_ORDER = new Map<ObjectStatus, number>([
  ["stale", 0],
  ["superseded", 1],
  ["rejected", 2]
]);

type ReadOnlyCanonicalStorageResult =
  | {
      ok: true;
      storage: CanonicalStorageSnapshot;
      storageWarnings: string[];
      meta: AictxMeta;
    }
  | {
      ok: false;
      error: AictxError;
      warnings: string[];
      meta: AictxMeta;
    };

async function readOnlyCanonicalStorage(
  options: GitWrapperOptions & { cwd: string }
): Promise<ReadOnlyCanonicalStorageResult> {
  const paths = await resolveProjectPaths({
    cwd: options.cwd,
    mode: "require-initialized",
    runner: options.runner
  });

  if (!paths.ok) {
    return {
      ok: false,
      error: paths.error,
      warnings: paths.warnings,
      meta: await buildBestEffortMeta(options)
    };
  }

  const meta = await buildMeta(paths.data, options);

  if (!meta.ok) {
    return meta;
  }

  const storage = await readCanonicalStorage(paths.data.projectRoot);

  if (!storage.ok) {
    return {
      ok: false,
      error: storage.error,
      warnings: storage.warnings,
      meta: meta.meta
    };
  }

  return {
    ok: true,
    storage: storage.data,
    storageWarnings: storage.warnings,
    meta: meta.meta
  };
}

function findStoredObject(
  objects: readonly StoredMemoryObject[],
  id: ObjectId
): StoredMemoryObject | undefined {
  return objects.find((object) => object.sidecar.id === id);
}

function relationsForObject(
  relations: readonly StoredMemoryRelation[],
  id: ObjectId
): StoredMemoryRelation[] {
  return relations
    .filter((relation) => relation.relation.from === id || relation.relation.to === id)
    .sort(compareStoredRelationsById);
}

function outgoingRelations(
  relations: readonly StoredMemoryRelation[],
  id: ObjectId
): StoredMemoryRelation[] {
  return relations
    .filter((relation) => relation.relation.from === id)
    .sort(compareStoredRelationsById);
}

function incomingRelations(
  relations: readonly StoredMemoryRelation[],
  id: ObjectId
): StoredMemoryRelation[] {
  return relations
    .filter((relation) => relation.relation.to === id)
    .sort(compareStoredRelationsById);
}

function summarizeObject(object: StoredMemoryObject): MemoryObjectSummary {
  const sidecar = object.sidecar;

  return {
    id: sidecar.id,
    type: sidecar.type,
    status: sidecar.status,
    title: sidecar.title,
    body_path: object.bodyPath,
    json_path: object.path,
    scope: sidecar.scope,
    tags: [...(sidecar.tags ?? [])],
    source: sidecar.source ?? null,
    superseded_by: sidecar.superseded_by ?? null,
    created_at: sidecar.created_at,
    updated_at: sidecar.updated_at,
    body: object.body
  };
}

function summarizeRelations(
  relations: readonly StoredMemoryRelation[]
): MemoryRelationSummary[] {
  return relations.map(summarizeRelation);
}

function summarizeRelation(relation: StoredMemoryRelation): MemoryRelationSummary {
  const data = relation.relation;

  return {
    id: data.id,
    from: data.from,
    predicate: data.predicate,
    to: data.to,
    status: data.status,
    confidence: data.confidence ?? null,
    evidence: [...(data.evidence ?? [])],
    content_hash: data.content_hash ?? null,
    created_at: data.created_at,
    updated_at: data.updated_at,
    json_path: relation.path
  };
}

function compareStaleMemoryObjects(
  left: StoredMemoryObject,
  right: StoredMemoryObject
): number {
  const statusComparison =
    staleStatusOrder(left.sidecar.status) - staleStatusOrder(right.sidecar.status);

  if (statusComparison !== 0) {
    return statusComparison;
  }

  return left.sidecar.id.localeCompare(right.sidecar.id);
}

function staleStatusOrder(status: ObjectStatus): number {
  return STALE_MEMORY_STATUS_ORDER.get(status) ?? Number.MAX_SAFE_INTEGER;
}

function compareStoredObjectsById(
  left: StoredMemoryObject,
  right: StoredMemoryObject
): number {
  return left.sidecar.id.localeCompare(right.sidecar.id);
}

function compareStoredRelationsById(
  left: StoredMemoryRelation,
  right: StoredMemoryRelation
): number {
  return left.relation.id.localeCompare(right.relation.id);
}

function objectNotFound(id: ObjectId): AictxError {
  return aictxError("AICtxObjectNotFound", "Memory object was not found.", {
    id
  });
}

type MetaBuildResult =
  | {
      ok: true;
      meta: AictxMeta;
    }
  | {
      ok: false;
      error: AictxError;
      warnings: string[];
      meta: AictxMeta;
    };

async function buildMeta(
  paths: ProjectPaths,
  options: GitWrapperOptions
): Promise<MetaBuildResult> {
  const git = await getGitState(paths.projectRoot, options);

  if (!git.ok) {
    return {
      ok: false,
      error: git.error,
      warnings: git.warnings,
      meta: fallbackMeta(paths)
    };
  }

  return {
    ok: true,
    meta: {
      project_root: paths.projectRoot,
      aictx_root: paths.aictxRoot,
      git: git.data
    }
  };
}

async function buildBestEffortMeta(options: InitProjectOptions): Promise<AictxMeta> {
  const paths = await resolveProjectPaths({
    cwd: options.cwd,
    mode: "init",
    runner: options.runner
  });

  if (!paths.ok) {
    return {
      project_root: options.cwd,
      aictx_root: `${options.cwd}/.aictx`,
      git: {
        available: false,
        branch: null,
        commit: null,
        dirty: null
      }
    };
  }

  const meta = await buildMeta(paths.data, options);

  return meta.meta;
}

async function rebuildIndexForResolvedProject(options: {
  paths: ProjectPaths;
  meta: AictxMeta;
  clock: Clock;
}) {
  return withProjectLock(
    {
      aictxRoot: options.paths.aictxRoot,
      operation: "rebuild",
      clock: options.clock
    },
    () =>
      rebuildGeneratedIndex({
        projectRoot: options.paths.projectRoot,
        aictxRoot: options.paths.aictxRoot,
        clock: options.clock,
        git: options.meta.git
      })
  );
}

function searchIndexOptions(aictxRoot: string, input: SearchMemoryInput): SearchIndexOptions {
  return {
    aictxRoot,
    query: input.query,
    ...(input.limit === undefined ? {} : { limit: input.limit })
  };
}

async function getAictxHistory(
  projectRoot: string,
  options: GitWrapperOptions & { limit?: number }
): Promise<Result<MemoryHistoryCommit[]>> {
  const format = ["%H", "%h", "%an <%ae>", "%aI", "%s"].join(
    HISTORY_FIELD_SEPARATOR
  );
  const args = [
    "log",
    `--format=${format}`,
    ...(options.limit === undefined ? [] : [`--max-count=${options.limit}`]),
    "--",
    AICTX_HISTORY_PATHSPEC
  ];
  const subprocessOptions =
    options.runner === undefined
      ? { cwd: projectRoot }
      : { cwd: projectRoot, runner: options.runner };
  const result = await runSubprocess("git", args, subprocessOptions);

  if (!result.ok) {
    return err(
      aictxError("AICtxGitOperationFailed", "Git operation failed.", {
        message: result.error.message
      })
    );
  }

  if (result.data.exitCode !== 0) {
    return gitHistoryCommandFailed("Git history failed.", result.data);
  }

  return ok(parseAictxHistory(result.data.stdout));
}

function parseAictxHistory(stdout: string): MemoryHistoryCommit[] {
  return stdout
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => {
      const fields = line.split(HISTORY_FIELD_SEPARATOR);

      return {
        commit: fields[0] ?? "",
        short_commit: fields[1] ?? "",
        author: fields[2] ?? "",
        timestamp: fields[3] ?? "",
        subject: fields.slice(4).join(HISTORY_FIELD_SEPARATOR)
      };
    });
}

function gitHistoryCommandFailed<T>(
  message: string,
  result: SubprocessResult
): Result<T> {
  return err(
    aictxError("AICtxGitOperationFailed", message, {
      command: result.command,
      args: [...result.args],
      exitCode: result.exitCode,
      stderr: result.stderr.trim()
    })
  );
}

async function detectChangedIds(
  projectRoot: string,
  changedFiles: readonly string[],
  options: GitWrapperOptions
): Promise<{ memoryIds: ObjectId[]; relationIds: RelationId[] }> {
  const memoryIds = new Set<ObjectId>();
  const relationIds = new Set<RelationId>();

  for (const file of changedFiles) {
    const memorySidecarPath = memorySidecarPathForChangedFile(file);

    if (memorySidecarPath !== null) {
      const id = await readObjectIdFromCurrentOrHead(projectRoot, memorySidecarPath, options);

      if (id !== null) {
        memoryIds.add(id);
      }
    }

    if (isRelationSidecarPath(file)) {
      const id = await readRelationIdFromCurrentOrHead(projectRoot, file, options);

      if (id !== null) {
        relationIds.add(id);
      }
    }
  }

  return {
    memoryIds: [...memoryIds].sort(),
    relationIds: [...relationIds].sort()
  };
}

function memorySidecarPathForChangedFile(file: string): string | null {
  if (!file.startsWith(".aictx/memory/")) {
    return null;
  }

  if (file.endsWith(".json")) {
    return file;
  }

  if (file.endsWith(".md")) {
    return `${file.slice(0, -".md".length)}.json`;
  }

  return null;
}

function isRelationSidecarPath(file: string): boolean {
  return file.startsWith(".aictx/relations/") && file.endsWith(".json");
}

async function readObjectIdFromCurrentOrHead(
  projectRoot: string,
  file: string,
  options: GitWrapperOptions
): Promise<ObjectId | null> {
  return readIdFromCurrentOrHead(projectRoot, file, options, objectIdFromContents);
}

async function readRelationIdFromCurrentOrHead(
  projectRoot: string,
  file: string,
  options: GitWrapperOptions
): Promise<RelationId | null> {
  return readIdFromCurrentOrHead(projectRoot, file, options, relationIdFromContents);
}

async function readIdFromCurrentOrHead<T extends ObjectId | RelationId>(
  projectRoot: string,
  file: string,
  options: GitWrapperOptions,
  parseId: (contents: string) => T | null
): Promise<T | null> {
  const current = await readUtf8FileInsideRoot(projectRoot, file);

  if (current.ok) {
    const id = parseId(current.data);

    if (id !== null) {
      return id;
    }
  }

  const head = await showAictxFileAtCommit(projectRoot, "HEAD", file, options);

  if (!head.ok) {
    return null;
  }

  return parseId(head.data.contents);
}

function objectIdFromContents(contents: string): ObjectId | null {
  const parsed = parseJsonObject(contents);

  if (parsed === null || typeof parsed.id !== "string") {
    return null;
  }

  return parsed.id;
}

function relationIdFromContents(contents: string): RelationId | null {
  const parsed = parseJsonObject(contents);

  if (parsed === null || typeof parsed.id !== "string") {
    return null;
  }

  return parsed.id;
}

function parseJsonObject(contents: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(contents) as unknown;

    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function rejectConflictsBeforeSave(
  paths: ProjectPaths,
  meta: AictxMeta,
  options: GitWrapperOptions
): Promise<Result<void>> {
  const markerScan = await scanProjectConflictMarkers(paths.projectRoot);

  if (!markerScan.valid) {
    return err(conflictMarkerError(markerScan.errors));
  }

  if (!meta.git.available) {
    return ok(undefined);
  }

  const dirtyState = await getAictxDirtyState(paths.projectRoot, options);

  if (!dirtyState.ok) {
    return dirtyState;
  }

  if (dirtyState.data.unmergedFiles.length === 0) {
    return ok(undefined);
  }

  return err(
    aictxError("AICtxConflictDetected", "Unresolved Git conflicts detected in Aictx files.", {
      unmerged_files: dirtyState.data.unmergedFiles
    })
  );
}

function rejectPatchSecrets(patch: unknown): Result<void> {
  const result = detectSecretsInPatch(patch);
  const warnings = validationWarnings(result.warnings);

  if (!result.valid) {
    return err(secretDetectionError(result.errors), warnings);
  }

  return ok(undefined, warnings);
}

function validationWarnings(issues: readonly ValidationIssue[]): string[] {
  return issues.map((issue) => `Validation warning in ${issue.path}: ${issue.message}`);
}

async function unresolvedGitConflictIssues(
  paths: ProjectPaths,
  meta: AictxMeta,
  options: GitWrapperOptions
): Promise<Result<ValidationIssue[]>> {
  if (!meta.git.available) {
    return ok([]);
  }

  const dirtyState = await getAictxDirtyState(paths.projectRoot, options);

  if (!dirtyState.ok) {
    return dirtyState;
  }

  return ok(
    dirtyState.data.unmergedFiles.map((path) => ({
      code: "AICtxConflictDetected",
      message: "Unresolved Git conflict detected in an Aictx file.",
      path,
      field: null
    }))
  );
}

async function generatedIndexWarnings(paths: ProjectPaths): Promise<ValidationIssue[]> {
  const databasePath = await resolveIndexDatabasePath(paths.aictxRoot);

  if (!databasePath.ok) {
    return [generatedIndexWarning(databasePath.error.message)];
  }

  let db: DatabaseConstructor.Database | null = null;

  try {
    db = new DatabaseConstructor(databasePath.data, {
      readonly: true,
      fileMustExist: true
    });
    const row = db
      .prepare<[string], { value: string }>("SELECT value FROM meta WHERE key = ?")
      .get("schema_version");

    if (row === undefined) {
      return [generatedIndexWarning("SQLite index is missing schema metadata.")];
    }

    if (row.value !== String(CURRENT_INDEX_SCHEMA_VERSION)) {
      return [
        generatedIndexWarning(
          `SQLite index schema version ${row.value} does not match expected version ${CURRENT_INDEX_SCHEMA_VERSION}.`
        )
      ];
    }

    return [];
  } catch (error) {
    return [generatedIndexWarning(`SQLite index could not be opened: ${messageFromUnknown(error)}`)];
  } finally {
    if (db?.open === true) {
      try {
        db.close();
      } catch {
        // Health-check warnings above are more useful than a close failure.
      }
    }
  }
}

function generatedIndexWarning(message: string): ValidationIssue {
  return {
    code: "GeneratedIndexUnavailable",
    message,
    path: ".aictx/index/aictx.sqlite",
    field: null
  };
}

async function readAutoIndexSetting(paths: ProjectPaths): Promise<Result<boolean>> {
  const storage = await readCanonicalStorage(paths.projectRoot);

  if (!storage.ok) {
    return err(
      aictxError(
        "AICtxIndexUnavailable",
        "SQLite index is unavailable and canonical config could not be read for auto-indexing.",
        {
          cause: errorToJson(storage.error)
        }
      ),
      storage.warnings
    );
  }

  return ok(storage.data.config.memory.autoIndex, storage.warnings);
}

function fallbackMeta(paths: ProjectPaths): AictxMeta {
  return {
    project_root: paths.projectRoot,
    aictx_root: paths.aictxRoot,
    git: {
      available: paths.git.available,
      branch: null,
      commit: null,
      dirty: paths.git.available ? false : null
    }
  };
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

function messageFromUnknown(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
