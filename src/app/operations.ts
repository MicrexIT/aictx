import { systemClock, type Clock } from "../core/clock.js";
import type { AictxError } from "../core/errors.js";
import { getGitState, type GitWrapperOptions } from "../core/git.js";
import { resolveProjectPaths, type ProjectPaths } from "../core/paths.js";
import type { AictxMeta } from "../core/types.js";
import {
  initializeStorage,
  type InitStorageData
} from "../storage/init.js";

export interface InitProjectOptions extends GitWrapperOptions {
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

    return {
      ok: true,
      data: initialized.data.data,
      warnings: initialized.warnings,
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

export const applicationOperations = {
  initProject
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
