import { systemClock, type Clock } from "../core/clock.js";
import type { AictxError } from "../core/errors.js";
import { getGitState, type GitWrapperOptions } from "../core/git.js";
import { withProjectLock } from "../core/lock.js";
import { resolveProjectPaths, type ProjectPaths } from "../core/paths.js";
import type { AictxMeta } from "../core/types.js";
import {
  rebuildIndex as rebuildGeneratedIndex,
  type RebuildIndexData
} from "../index/rebuild.js";
import {
  initializeStorage,
  type InitStorageData
} from "../storage/init.js";

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

export const applicationOperations = {
  initProject,
  rebuildIndex
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
