import { resolve } from "node:path";

import {
  diffMemory,
  inspectMemory,
  loadMemory,
  saveMemoryPatch,
  searchMemory,
  type AppResult,
  type DiffMemoryData,
  type InspectMemoryData,
  type InspectMemoryOptions,
  type LoadMemoryOptions,
  type SaveMemoryData,
  type SaveMemoryPatchOptions,
  type SearchMemoryOptions
} from "../app/operations.js";
import type { Clock } from "../core/clock.js";
import { getGitState, type GitWrapperOptions } from "../core/git.js";
import { resolveProjectPaths, type ProjectPaths } from "../core/paths.js";
import type { Result } from "../core/result.js";
import type { AictxMeta, ObjectId } from "../core/types.js";
import type { LoadMemoryData, LoadMemoryInput } from "../context/compile.js";
import type { SearchMemoryData, SearchMemoryInput } from "../index/search.js";

export type DataAccessProjectTarget =
  | {
      kind: "cwd";
      cwd: string;
    }
  | {
      kind: "project-root";
      projectRoot: string;
    };

export interface DataAccessBaseInput extends GitWrapperOptions {
  target: DataAccessProjectTarget;
  clock?: Clock;
}

export interface DataAccessLoadInput extends DataAccessBaseInput, LoadMemoryInput {}

export interface DataAccessSearchInput extends DataAccessBaseInput, SearchMemoryInput {}

export interface DataAccessInspectInput extends DataAccessBaseInput {
  id: ObjectId;
}

export type DataAccessDiffInput = DataAccessBaseInput;

export interface DataAccessApplyPatchInput extends DataAccessBaseInput {
  patch?: unknown;
}

export interface DataAccessService {
  load(input: DataAccessLoadInput): Promise<AppResult<LoadMemoryData>>;
  search(input: DataAccessSearchInput): Promise<AppResult<SearchMemoryData>>;
  inspect(input: DataAccessInspectInput): Promise<AppResult<InspectMemoryData>>;
  diff(input: DataAccessDiffInput): Promise<AppResult<DiffMemoryData>>;
  applyPatch(input: DataAccessApplyPatchInput): Promise<AppResult<SaveMemoryData>>;
}

export function createDataAccessService(): DataAccessService {
  return {
    load: async (input) =>
      withResolvedProject(input, async (paths) => loadMemory(toLoadMemoryOptions(input, paths))),
    search: async (input) =>
      withResolvedProject(input, async (paths) =>
        searchMemory(toSearchMemoryOptions(input, paths))
      ),
    inspect: async (input) =>
      withResolvedProject(input, async (paths) =>
        inspectMemory(toInspectMemoryOptions(input, paths))
      ),
    diff: async (input) =>
      withResolvedProject(input, async (paths) =>
        diffMemory({
          cwd: paths.projectRoot,
          ...gitWrapperOptions(input)
        })
      ),
    applyPatch: async (input) =>
      withResolvedProject(input, async (paths) =>
        saveMemoryPatch(toSaveMemoryPatchOptions(input, paths))
      )
  };
}

export const dataAccessService = createDataAccessService();

async function withResolvedProject<T>(
  input: DataAccessBaseInput,
  operation: (paths: ProjectPaths) => Promise<AppResult<T>>
): Promise<AppResult<T>> {
  const paths = await resolveDataAccessProject(input);

  if (!paths.ok) {
    return {
      ok: false,
      error: paths.error,
      warnings: paths.warnings,
      meta: await buildBestEffortMeta(input)
    };
  }

  return operation(paths.data);
}

async function resolveDataAccessProject(
  input: DataAccessBaseInput
): Promise<Result<ProjectPaths>> {
  return resolveProjectPaths({
    cwd: targetCwd(input.target),
    mode: "require-initialized",
    ...gitWrapperOptions(input)
  });
}

function toLoadMemoryOptions(
  input: DataAccessLoadInput,
  paths: ProjectPaths
): LoadMemoryOptions {
  return {
    cwd: paths.projectRoot,
    task: input.task,
    ...gitWrapperOptions(input),
    ...clockOption(input),
    ...(input.token_budget === undefined ? {} : { token_budget: input.token_budget }),
    ...(input.mode === undefined ? {} : { mode: input.mode }),
    ...(input.hints === undefined ? {} : { hints: input.hints })
  };
}

function toSearchMemoryOptions(
  input: DataAccessSearchInput,
  paths: ProjectPaths
): SearchMemoryOptions {
  return {
    cwd: paths.projectRoot,
    query: input.query,
    ...gitWrapperOptions(input),
    ...clockOption(input),
    ...(input.limit === undefined ? {} : { limit: input.limit }),
    ...(input.hints === undefined ? {} : { hints: input.hints })
  };
}

function toInspectMemoryOptions(
  input: DataAccessInspectInput,
  paths: ProjectPaths
): InspectMemoryOptions {
  return {
    cwd: paths.projectRoot,
    id: input.id,
    ...gitWrapperOptions(input)
  };
}

function toSaveMemoryPatchOptions(
  input: DataAccessApplyPatchInput,
  paths: ProjectPaths
): SaveMemoryPatchOptions {
  return {
    cwd: paths.projectRoot,
    ...gitWrapperOptions(input),
    ...clockOption(input),
    ...(input.patch === undefined ? {} : { patch: input.patch })
  };
}

function gitWrapperOptions(input: GitWrapperOptions): GitWrapperOptions {
  return input.runner === undefined ? {} : { runner: input.runner };
}

function clockOption(input: { clock?: Clock }): { clock?: Clock } {
  return input.clock === undefined ? {} : { clock: input.clock };
}

async function buildBestEffortMeta(input: DataAccessBaseInput): Promise<AictxMeta> {
  const cwd = resolve(targetCwd(input.target));
  const paths = await resolveProjectPaths({
    cwd,
    mode: "init",
    ...gitWrapperOptions(input)
  });

  if (!paths.ok) {
    return {
      project_root: cwd,
      aictx_root: resolve(cwd, ".aictx"),
      git: {
        available: false,
        branch: null,
        commit: null,
        dirty: null
      }
    };
  }

  const git = await getGitState(paths.data.projectRoot, gitWrapperOptions(input));

  if (!git.ok) {
    return fallbackMeta(paths.data);
  }

  return {
    project_root: paths.data.projectRoot,
    aictx_root: paths.data.aictxRoot,
    git: git.data
  };
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

function targetCwd(target: DataAccessProjectTarget): string {
  switch (target.kind) {
    case "cwd":
      return target.cwd;
    case "project-root":
      return target.projectRoot;
  }
}
