import { systemClock, type Clock } from "../core/clock.js";
import { aictxError, type AictxError, type JsonValue } from "../core/errors.js";
import { getGitState, type GitWrapperOptions } from "../core/git.js";
import { withProjectLock } from "../core/lock.js";
import { resolveProjectPaths, type ProjectPaths } from "../core/paths.js";
import { err, ok, type Result } from "../core/result.js";
import type { AictxMeta } from "../core/types.js";
import {
  compileContextPack,
  type LoadMemoryData,
  type LoadMemoryInput
} from "../context/compile.js";
import {
  rebuildIndex as rebuildGeneratedIndex,
  type RebuildIndexData
} from "../index/rebuild.js";
import {
  searchIndex,
  type SearchIndexOptions,
  type SearchMemoryData,
  type SearchMemoryInput
} from "../index/search.js";
import {
  initializeStorage,
  type InitStorageData
} from "../storage/init.js";
import { readCanonicalStorage } from "../storage/read.js";

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

export interface LoadMemoryOptions extends GitWrapperOptions, LoadMemoryInput {
  cwd: string;
  clock?: Clock;
}

export interface SearchMemoryOptions extends GitWrapperOptions, SearchMemoryInput {
  cwd: string;
  clock?: Clock;
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

export const applicationOperations = {
  initProject,
  loadMemory,
  rebuildIndex,
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
