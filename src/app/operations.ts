import DatabaseConstructor from "better-sqlite3";
import { systemClock, type Clock } from "../core/clock.js";
import { aictxError, type AictxError, type JsonValue } from "../core/errors.js";
import {
  getAictxDirtyState,
  getGitState,
  type GitWrapperOptions
} from "../core/git.js";
import { withProjectLock } from "../core/lock.js";
import { resolveProjectPaths, type ProjectPaths } from "../core/paths.js";
import { err, ok, type Result } from "../core/result.js";
import type {
  AictxMeta,
  ObjectId,
  RelationId,
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
import { readCanonicalStorage } from "../storage/read.js";
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

export interface CheckProjectData {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
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
  initProject,
  loadMemory,
  rebuildIndex,
  saveMemoryPatch,
  searchMemory
};

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
