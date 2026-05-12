import { randomUUID } from "node:crypto";
import { lstat, mkdir, readdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";

import { systemClock, type Clock } from "../core/clock.js";
import { aictxError, type AictxError, type JsonValue } from "../core/errors.js";
import { readUtf8FileInsideRoot } from "../core/fs.js";
import {
  getAictxDiff,
  getAictxDirtyState,
  getChangedProjectFiles,
  getGitState,
  getRecentProjectFileChanges,
  showAictxFileAtCommit,
  type GitWrapperOptions,
  type ProjectFileChange
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
  ObjectFacets,
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
  buildSuggestBootstrapPatchProposal,
  buildSuggestBootstrapPacket,
  buildSuggestAfterTaskPacket,
  buildSuggestFromDiffPacket,
  type SuggestBootstrapPatchProposal,
  type SuggestMode,
  type SuggestReviewPacket
} from "../discipline/suggest.js";
import {
  buildAuditFindings,
  type AuditFinding,
  type AuditRule,
  type AuditSeverity
} from "../discipline/audit.js";
import {
  exportObsidianProjection as writeObsidianProjectionExport,
  type ObsidianProjectionExportData
} from "../export/obsidian.js";
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
import {
  buildRememberMemoryPatch,
  type RememberMemoryPatch
} from "../remember/plan.js";
import {
  buildAllMemoryLenses,
  buildMemoryLens,
  isMemoryLensName,
  type BuiltMemoryLens,
  type MemoryLensName
} from "../lenses/render.js";
import {
  buildRoleCoverage,
  type RoleCoverageItem,
  type RoleCoverageData
} from "../roles/coverage.js";
import {
  branchHandoffId,
  buildBranchHandoffClosePatch,
  buildBranchHandoffUpdatePatch,
  hasBranchHandoffPromotions,
  parseBranchHandoffCloseInput,
  parseBranchHandoffInput,
  promotionRememberInput,
  type BranchHandoffCloseInput,
  type BranchHandoffInput
} from "../handoff/service.js";
import {
  hintedFiles,
  normalizeRetrievalHints
} from "../retrieval/hints.js";
import {
  currentProjectRegistryEntry,
  findRegisteredProject,
  pruneProjectRegistry,
  readProjectRegistry,
  removeProjectFromRegistry,
  removeProjectRootFromRegistry,
  removeProjectRootsFromRegistry,
  resolveProjectRegistryLocation,
  upsertCurrentProjectInRegistry,
  type ProjectRegistryEntry,
  type ProjectRegistrySource,
  type ResolvedProjectRegistryEntry
} from "../registry/projects.js";
import { openSqliteDatabase } from "../index/sqlite-driver.js";
import { resolveIndexDatabasePath } from "../index/sqlite.js";
import {
  buildInitialStoragePreview,
  initializeStorage,
  type InitStorageData
} from "../storage/init.js";
import type { StoredMemoryObject } from "../storage/objects.js";
import {
  readCanonicalStorage,
  type CanonicalStorageSnapshot
} from "../storage/read.js";
import type { StoredMemoryRelation } from "../storage/relations.js";
import {
  applyMemoryPatch,
  restoreCanonicalStorageFromCommit
} from "../storage/write.js";
import { planMemoryPatch } from "../storage/patch.js";
import {
  upgradeStorageToV3,
  type UpgradeStorageData
} from "../storage/upgrade.js";
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
  agentGuidance?: boolean;
  force?: boolean;
  allowTrackedAictxDeletions?: boolean;
}

export interface PreviewSetupBootstrapOptions extends GitWrapperOptions {
  cwd: string;
  force?: boolean;
  clock?: Clock;
}

export interface RebuildIndexOptions extends GitWrapperOptions {
  cwd: string;
  clock?: Clock;
}

export interface CheckProjectOptions extends GitWrapperOptions {
  cwd: string;
}

export interface UpgradeStorageOptions extends GitWrapperOptions {
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

export interface SuggestMemoryOptions extends GitWrapperOptions {
  cwd: string;
  fromDiff?: boolean;
  bootstrap?: boolean;
  afterTask?: string;
  patch?: boolean;
}

export interface AuditMemoryOptions extends GitWrapperOptions {
  cwd: string;
}

export interface ListMemoryHistoryOptions extends GitWrapperOptions {
  cwd: string;
  limit?: number;
}

export interface RestoreMemoryOptions extends GitWrapperOptions {
  cwd: string;
  commit: string;
  clock?: Clock;
}

export interface RewindMemoryOptions extends GitWrapperOptions {
  cwd: string;
  clock?: Clock;
}

export interface ResetAictxOptions extends GitWrapperOptions {
  cwd: string;
  destroy?: boolean;
  aictxHome?: string;
}

export interface ExportObsidianProjectionOptions extends GitWrapperOptions {
  cwd: string;
  outDir?: string;
  clock?: Clock;
}

export interface GetViewerBootstrapOptions extends GitWrapperOptions {
  cwd: string;
}

export interface GetRoleCoverageOptions extends GitWrapperOptions {
  cwd: string;
}

export interface GetMemoryLensOptions extends GitWrapperOptions {
  cwd: string;
  lens: string;
}

export interface ShowBranchHandoffOptions extends GitWrapperOptions {
  cwd: string;
}

export interface UpdateBranchHandoffOptions extends GitWrapperOptions {
  cwd: string;
  input?: unknown;
  clock?: Clock;
}

export interface CloseBranchHandoffOptions extends GitWrapperOptions {
  cwd: string;
  input?: unknown;
  clock?: Clock;
}

export interface ProjectRegistryOperationOptions extends GitWrapperOptions {
  cwd: string;
  aictxHome?: string;
  clock?: Clock;
}

export interface AddRegisteredProjectOptions extends ProjectRegistryOperationOptions {
  path?: string;
}

export interface RemoveRegisteredProjectOptions extends ProjectRegistryOperationOptions {
  identifier: string;
}

export interface GetViewerProjectsOptions extends ProjectRegistryOperationOptions {}

export interface GetViewerProjectBootstrapOptions extends ProjectRegistryOperationOptions {
  registryId: string;
}

export interface ExportViewerProjectObsidianOptions extends ProjectRegistryOperationOptions {
  registryId: string;
  outDir?: string;
}

export interface DeleteViewerProjectOptions extends ProjectRegistryOperationOptions {
  registryId: string;
}

export interface SaveMemoryPatchOptions extends GitWrapperOptions {
  cwd: string;
  patch?: unknown;
  clock?: Clock;
}

export interface RememberMemoryOptions extends GitWrapperOptions {
  cwd: string;
  input?: unknown;
  dryRun?: boolean;
  clock?: Clock;
}

export interface SaveMemoryData {
  files_changed: string[];
  recovery_files: {
    path: string;
    recovery_path: string;
    reason: string;
  }[];
  repairs_applied: string[];
  memory_created: ObjectId[];
  memory_updated: ObjectId[];
  memory_deleted: ObjectId[];
  relations_created: RelationId[];
  relations_updated: RelationId[];
  relations_deleted: RelationId[];
  events_appended: number;
  index_updated: boolean;
}

export interface RememberMemoryData extends SaveMemoryData {
  dry_run: boolean;
  patch: RememberMemoryPatch;
}

export interface DiffMemoryData {
  diff: string;
  changed_files: string[];
  untracked_files: string[];
  changed_memory_ids: ObjectId[];
  changed_relation_ids: RelationId[];
}

export type SuggestMemoryData = SuggestReviewPacket | SuggestBootstrapPatchProposal;

export type { AuditFinding, AuditRule, AuditSeverity };

export interface RoleCoverageGapData {
  key: RoleCoverageItem["key"];
  label: string;
  status: RoleCoverageItem["status"];
  optional: boolean;
  memory_ids: ObjectId[];
  relation_ids: RelationId[];
  gap: string;
}

export interface AuditMemoryData {
  findings: AuditFinding[];
  role_coverage: RoleCoverageData;
  role_gaps: RoleCoverageGapData[];
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

export interface RestoreMemoryData {
  restored_from: string;
  files_changed: string[];
  index_rebuilt: boolean;
}

export interface CheckProjectData {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

export type { UpgradeStorageData };

export interface MemoryObjectSummary {
  id: ObjectId;
  type: ObjectType;
  status: ObjectStatus;
  title: string;
  body_path: string;
  json_path: string;
  scope: Scope;
  tags: string[];
  facets: ObjectFacets | null;
  evidence: Array<{
    kind: "memory" | "relation" | "file" | "commit" | "task" | "source";
    id: string;
  }>;
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
  evidence: Array<{
    kind: "memory" | "relation" | "file" | "commit" | "task" | "source";
    id: string;
  }>;
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

export interface MemoryLensData {
  name: MemoryLensName;
  title: string;
  markdown: string;
  role_coverage: RoleCoverageData;
  included_memory_ids: ObjectId[];
  relation_ids: RelationId[];
  relations: MemoryRelationSummary[];
  generated_gaps: string[];
}

export interface RoleCoverageResultData {
  role_coverage: RoleCoverageData;
}

export interface SetupBootstrapPreviewData {
  initialized: boolean;
  would_initialize: boolean;
  force_preview: boolean;
  proposal: SuggestBootstrapPatchProposal;
  role_coverage: RoleCoverageData;
}

export interface BranchHandoffShowData {
  branch: string;
  id: ObjectId;
  handoff: MemoryObjectSummary | null;
}

export interface BranchHandoffUpdateData {
  branch: string;
  id: ObjectId;
  input: BranchHandoffInput;
  save: SaveMemoryData;
  handoff: MemoryObjectSummary | null;
}

export interface BranchHandoffCloseData {
  branch: string;
  id: ObjectId;
  input: BranchHandoffCloseInput;
  save: SaveMemoryData;
}

export interface ViewerBootstrapData {
  project: {
    id: string;
    name: string;
  };
  objects: MemoryObjectSummary[];
  relations: MemoryRelationSummary[];
  counts: {
    objects: number;
    relations: number;
    stale_objects: number;
    superseded_objects: number;
    source_objects: number;
    synthesis_objects: number;
    active_relations: number;
  };
  role_coverage: RoleCoverageData;
  lenses: MemoryLensData[];
  storage_warnings: string[];
}

export interface RegisteredProjectSummary {
  registry_id: string;
  project: {
    id: string;
    name: string;
  };
  project_root: string;
  aictx_root: string;
  source: ProjectRegistrySource;
  registered_at: string;
  last_seen_at: string;
}

export interface ProjectRegistryListData {
  registry_path: string;
  projects: RegisteredProjectSummary[];
}

export interface ProjectRegistryAddData {
  registry_path: string;
  project: RegisteredProjectSummary;
}

export interface ProjectRegistryRemoveData {
  registry_path: string;
  removed: RegisteredProjectSummary;
}

export interface ProjectRegistryPruneData {
  registry_path: string;
  projects: RegisteredProjectSummary[];
  removed: RegisteredProjectSummary[];
}

export interface ViewerProjectSummary extends RegisteredProjectSummary {
  current: boolean;
  available: boolean;
  counts: ViewerBootstrapData["counts"] | null;
  git: AictxMeta["git"] | null;
  warnings: string[];
}

export interface ViewerProjectsData {
  registry_path: string;
  projects: ViewerProjectSummary[];
  counts: {
    projects: number;
    available: number;
    unavailable: number;
  };
  current_project_registry_id: string | null;
}

export interface ViewerProjectDeleteData {
  registry_path: string;
  project: RegisteredProjectSummary;
  removed: RegisteredProjectSummary | null;
  destroyed: true;
  entries_removed: string[];
}

export interface ResetAictxData {
  destroyed: boolean;
  backup_path: string | null;
  entries_removed: string[];
}

export interface ResetAllAictxProjectReset extends RegisteredProjectSummary {
  destroyed: boolean;
  backup_path: string | null;
  entries_removed: string[];
}

export interface ResetAllAictxProjectSkipped extends RegisteredProjectSummary {
  reason: string;
}

export interface ResetAllAictxProjectFailed extends RegisteredProjectSummary {
  error: AictxError;
  warnings: string[];
}

export interface ResetAllAictxData {
  registry_path: string;
  destroyed: boolean;
  projects_reset: ResetAllAictxProjectReset[];
  projects_skipped: ResetAllAictxProjectSkipped[];
  projects_failed: ResetAllAictxProjectFailed[];
}

export type ExportObsidianProjectionData = ObsidianProjectionExportData;

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
    agentGuidance: options.agentGuidance ?? true,
    force: options.force ?? false,
    allowTrackedAictxDeletions: options.allowTrackedAictxDeletions ?? false,
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
      clock,
      runner: options.runner
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

export async function previewSetupBootstrap(
  options: PreviewSetupBootstrapOptions
): Promise<AppResult<SetupBootstrapPreviewData>> {
  const clock = options.clock ?? systemClock;
  const paths = await resolveProjectPaths({
    cwd: options.cwd,
    mode: "init",
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

  const currentStorage = await aictxRootExists(paths.data.aictxRoot);

  if (!currentStorage.ok) {
    return {
      ok: false,
      error: currentStorage.error,
      warnings: currentStorage.warnings,
      meta: meta.meta
    };
  }

  const forcePreview = options.force === true;
  const useSyntheticStorage = forcePreview || !currentStorage.data;
  const storage = useSyntheticStorage
    ? ok(buildInitialStoragePreview({ paths: paths.data, clock }))
    : await readCanonicalStorage(paths.data.projectRoot);

  if (!storage.ok) {
    return {
      ok: false,
      error: storage.error,
      warnings: storage.warnings,
      meta: meta.meta
    };
  }

  const proposal = await buildSuggestBootstrapPatchProposal({
    projectRoot: paths.data.projectRoot,
    storage: storage.data
  });

  return {
    ok: true,
    data: {
      initialized: currentStorage.data,
      would_initialize: useSyntheticStorage,
      force_preview: forcePreview,
      proposal,
      role_coverage: buildRoleCoverage(storage.data, meta.meta.git)
    },
    warnings: storage.warnings,
    meta: meta.meta
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
    clock,
    runner: options.runner
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

export async function upgradeStorage(
  options: UpgradeStorageOptions
): Promise<AppResult<UpgradeStorageData>> {
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

  const upgraded = await withProjectLock(
    {
      aictxRoot: paths.data.aictxRoot,
      operation: "upgrade",
      clock
    },
    async () => {
      const result = await upgradeStorageToV3({
        projectRoot: paths.data.projectRoot,
        clock
      });

      if (!result.ok) {
        return result;
      }

      const gitFileChanges = await recentGitFileChangesForIndex(
        paths.data.projectRoot,
        meta.meta,
        options
      );
      const rebuilt = await rebuildGeneratedIndex({
        projectRoot: paths.data.projectRoot,
        aictxRoot: paths.data.aictxRoot,
        clock,
        git: meta.meta.git,
        gitFileChanges: gitFileChanges.ok ? gitFileChanges.data : []
      });

      return ok(result.data, [
        ...result.warnings,
        ...gitFileChanges.warnings,
        ...rebuilt.warnings,
        ...(rebuilt.ok ? [] : [`Index warning: ${rebuilt.error.message}`])
      ]);
    }
  );

  if (!upgraded.ok) {
    return {
      ok: false,
      error: upgraded.error,
      warnings: upgraded.warnings,
      meta: meta.meta
    };
  }

  const refreshedMeta = await buildMeta(paths.data, options);

  return {
    ok: true,
    data: upgraded.data,
    warnings:
      refreshedMeta.ok
        ? upgraded.warnings
        : [
            ...upgraded.warnings,
            ...refreshedMeta.warnings,
            `Git metadata refresh failed after upgrade: ${refreshedMeta.error.message}`
          ],
    meta: refreshedMeta.ok ? refreshedMeta.meta : meta.meta
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

  const gitFileChanges = await hintedGitFileChanges(paths.data.projectRoot, meta.meta, options);

  if (!gitFileChanges.ok) {
    return {
      ok: false,
      error: gitFileChanges.error,
      warnings: gitFileChanges.warnings,
      meta: meta.meta
    };
  }

  const compiled = await compileContextPack({
    paths: paths.data,
    git: meta.meta.git,
    task: options.task,
    ...(options.token_budget === undefined ? {} : { token_budget: options.token_budget }),
    ...(options.mode === undefined ? {} : { mode: options.mode }),
    ...(options.hints === undefined ? {} : { hints: options.hints }),
    gitFileChanges: gitFileChanges.data,
    clock
  });

  if (compiled.ok) {
    return {
      ok: true,
      data: compiled.data,
      warnings: [...gitFileChanges.warnings, ...compiled.warnings],
      meta: meta.meta
    };
  }

  if (compiled.error.code !== "AICtxIndexUnavailable") {
    return {
      ok: false,
      error: compiled.error,
      warnings: [...gitFileChanges.warnings, ...compiled.warnings],
      meta: meta.meta
    };
  }

  const autoIndex = await readAutoIndexSetting(paths.data);

  if (!autoIndex.ok) {
    return {
      ok: false,
      error: autoIndex.error,
      warnings: [...gitFileChanges.warnings, ...compiled.warnings, ...autoIndex.warnings],
      meta: meta.meta
    };
  }

  if (!autoIndex.data) {
    return {
      ok: false,
      error: compiled.error,
      warnings: [...gitFileChanges.warnings, ...compiled.warnings, ...autoIndex.warnings],
      meta: meta.meta
    };
  }

  const rebuilt = await rebuildIndexForResolvedProject({
    paths: paths.data,
    meta: meta.meta,
    clock,
    runner: options.runner
  });

  if (!rebuilt.ok) {
    return {
      ok: false,
      error: rebuilt.error,
      warnings: [
        ...gitFileChanges.warnings,
        ...compiled.warnings,
        ...autoIndex.warnings,
        ...rebuilt.warnings
      ],
      meta: meta.meta
    };
  }

  const retried = await compileContextPack({
    paths: paths.data,
    git: meta.meta.git,
    task: options.task,
    ...(options.token_budget === undefined ? {} : { token_budget: options.token_budget }),
    ...(options.mode === undefined ? {} : { mode: options.mode }),
    ...(options.hints === undefined ? {} : { hints: options.hints }),
    gitFileChanges: gitFileChanges.data,
    clock
  });

  if (!retried.ok) {
    return {
      ok: false,
      error: retried.error,
      warnings: [
        ...gitFileChanges.warnings,
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
    warnings: [
      ...gitFileChanges.warnings,
      ...autoIndex.warnings,
      ...rebuilt.warnings,
      ...retried.warnings
    ],
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
    clock,
    runner: options.runner
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

export async function getRoleCoverage(
  options: GetRoleCoverageOptions
): Promise<AppResult<RoleCoverageResultData>> {
  const prepared = await readOnlyCanonicalStorage(options);

  if (!prepared.ok) {
    return prepared;
  }

  return {
    ok: true,
    data: {
      role_coverage: buildRoleCoverage(prepared.storage, prepared.meta.git)
    },
    warnings: prepared.storageWarnings,
    meta: prepared.meta
  };
}

export async function getMemoryLens(
  options: GetMemoryLensOptions
): Promise<AppResult<MemoryLensData>> {
  if (!isMemoryLensName(options.lens)) {
    return {
      ok: false,
      error: aictxError("AICtxValidationFailed", "Unknown memory lens.", {
        lens: options.lens
      }),
      warnings: [],
      meta: await buildBestEffortMeta(options)
    };
  }

  const prepared = await readOnlyCanonicalStorage(options);

  if (!prepared.ok) {
    return prepared;
  }

  return {
    ok: true,
    data: summarizeMemoryLens(buildMemoryLens(prepared.storage, prepared.meta.git, options.lens)),
    warnings: prepared.storageWarnings,
    meta: prepared.meta
  };
}

export async function getViewerBootstrap(
  options: GetViewerBootstrapOptions
): Promise<AppResult<ViewerBootstrapData>> {
  const prepared = await readOnlyCanonicalStorage(options);

  if (!prepared.ok) {
    return prepared;
  }

  const objects = [...prepared.storage.objects].sort(compareStoredObjectsById);
  const relations = [...prepared.storage.relations].sort(compareStoredRelationsById);
  const lenses = buildAllMemoryLenses(prepared.storage, prepared.meta.git);

  return {
    ok: true,
    data: {
      project: {
        id: prepared.storage.config.project.id,
        name: prepared.storage.config.project.name
      },
      objects: objects.map(summarizeObject),
      relations: summarizeRelations(relations),
      counts: {
        objects: objects.length,
        relations: relations.length,
        stale_objects: countObjectsByStatus(objects, "stale"),
        superseded_objects: countObjectsByStatus(objects, "superseded"),
        source_objects: countObjectsByType(objects, "source"),
        synthesis_objects: countObjectsByType(objects, "synthesis"),
        active_relations: relations.filter(
          (relation) => relation.relation.status === "active"
        ).length
      },
      role_coverage: buildRoleCoverage(prepared.storage, prepared.meta.git),
      lenses: lenses.map(summarizeMemoryLens),
      storage_warnings: prepared.storageWarnings
    },
    warnings: prepared.storageWarnings,
    meta: prepared.meta
  };
}

export async function listRegisteredProjects(
  options: ProjectRegistryOperationOptions
): Promise<AppResult<ProjectRegistryListData>> {
  const registry = await readProjectRegistry(options);
  const meta = await buildBestEffortMeta(options);

  if (!registry.ok) {
    return {
      ok: false,
      error: registry.error,
      warnings: registry.warnings,
      meta
    };
  }

  return {
    ok: true,
    data: {
      registry_path: registry.data.location.registryPath,
      projects: registry.data.registry.projects.map(summarizeRegisteredProject)
    },
    warnings: registry.warnings,
    meta
  };
}

export async function addRegisteredProject(
  options: AddRegisteredProjectOptions
): Promise<AppResult<ProjectRegistryAddData>> {
  const cwd = options.path === undefined ? options.cwd : resolve(options.cwd, options.path);
  const registered = await upsertCurrentProjectInRegistry({
    ...options,
    cwd,
    source: "manual"
  });
  const meta = await buildBestEffortMeta({ ...options, cwd });
  const registryPath = resolveProjectRegistryLocation(options).registryPath;

  if (!registered.ok) {
    return {
      ok: false,
      error: registered.error,
      warnings: registered.warnings,
      meta
    };
  }

  return {
    ok: true,
    data: {
      registry_path: registryPath,
      project: summarizeRegisteredProject(registered.data)
    },
    warnings: registered.warnings,
    meta
  };
}

export async function removeRegisteredProject(
  options: RemoveRegisteredProjectOptions
): Promise<AppResult<ProjectRegistryRemoveData>> {
  const removed = await removeProjectFromRegistry(options);
  const meta = await buildBestEffortMeta(options);
  const registryPath = resolveProjectRegistryLocation(options).registryPath;

  if (!removed.ok) {
    return {
      ok: false,
      error: removed.error,
      warnings: removed.warnings,
      meta
    };
  }

  return {
    ok: true,
    data: {
      registry_path: registryPath,
      removed: summarizeRegisteredProject(removed.data)
    },
    warnings: removed.warnings,
    meta
  };
}

export async function pruneRegisteredProjects(
  options: ProjectRegistryOperationOptions
): Promise<AppResult<ProjectRegistryPruneData>> {
  const pruned = await pruneProjectRegistry(options);
  const meta = await buildBestEffortMeta(options);
  const registryPath = resolveProjectRegistryLocation(options).registryPath;

  if (!pruned.ok) {
    return {
      ok: false,
      error: pruned.error,
      warnings: pruned.warnings,
      meta
    };
  }

  return {
    ok: true,
    data: {
      registry_path: registryPath,
      projects: pruned.data.projects.map(summarizeRegisteredProject),
      removed: pruned.data.removed.map(summarizeRegisteredProject)
    },
    warnings: pruned.warnings,
    meta
  };
}

export async function registerCurrentProject(
  options: ProjectRegistryOperationOptions & { source?: ProjectRegistrySource }
): Promise<AppResult<ProjectRegistryAddData>> {
  const registered = await upsertCurrentProjectInRegistry({
    ...options,
    source: options.source ?? "auto"
  });
  const meta = await buildBestEffortMeta(options);
  const registryPath = resolveProjectRegistryLocation(options).registryPath;

  if (!registered.ok) {
    return {
      ok: false,
      error: registered.error,
      warnings: registered.warnings,
      meta
    };
  }

  return {
    ok: true,
    data: {
      registry_path: registryPath,
      project: summarizeRegisteredProject(registered.data)
    },
    warnings: registered.warnings,
    meta
  };
}

export async function unregisterProjectRoot(
  options: ProjectRegistryOperationOptions & { projectRoot: string }
): Promise<AppResult<ProjectRegistryRemoveData | { registry_path: string; removed: null }>> {
  const removed = await removeProjectRootFromRegistry(options);
  const meta = await buildBestEffortMeta(options);
  const registryPath = resolveProjectRegistryLocation(options).registryPath;

  if (!removed.ok) {
    return {
      ok: false,
      error: removed.error,
      warnings: removed.warnings,
      meta
    };
  }

  return {
    ok: true,
    data: removed.data === null
      ? { registry_path: registryPath, removed: null }
      : { registry_path: registryPath, removed: summarizeRegisteredProject(removed.data) },
    warnings: removed.warnings,
    meta
  };
}

export async function getViewerProjects(
  options: GetViewerProjectsOptions
): Promise<AppResult<ViewerProjectsData>> {
  const registry = await readProjectRegistry(options);
  const meta = await buildBestEffortMeta(options);

  if (!registry.ok) {
    return {
      ok: false,
      error: registry.error,
      warnings: registry.warnings,
      meta
    };
  }

  const current = await currentProjectRegistryEntry(options);
  const currentWarnings = current.ok ? current.warnings : [];
  const entries = mergeRegistryEntries(
    registry.data.registry.projects,
    current.ok ? current.data : null,
    options.clock ?? systemClock
  );
  const projects: ViewerProjectSummary[] = [];

  for (const entry of entries) {
    projects.push(await summarizeViewerProject(entry, current.ok ? current.data : null, options));
  }

  const sortedProjects = projects.sort(compareViewerProjects);
  const available = sortedProjects.filter((project) => project.available).length;

  return {
    ok: true,
    data: {
      registry_path: registry.data.location.registryPath,
      projects: sortedProjects,
      counts: {
        projects: sortedProjects.length,
        available,
        unavailable: sortedProjects.length - available
      },
      current_project_registry_id: current.ok ? current.data?.registry_id ?? null : null
    },
    warnings: [...registry.warnings, ...currentWarnings],
    meta
  };
}

export async function getViewerProjectBootstrap(
  options: GetViewerProjectBootstrapOptions
): Promise<AppResult<ViewerBootstrapData>> {
  const resolved = await resolveViewerProjectCwd(options);

  if (!resolved.ok) {
    return {
      ok: false,
      error: resolved.error,
      warnings: resolved.warnings,
      meta: await buildBestEffortMeta(options)
    };
  }

  return getViewerBootstrap({
    cwd: resolved.data.project_root,
    runner: options.runner
  });
}

export async function exportViewerProjectObsidian(
  options: ExportViewerProjectObsidianOptions
): Promise<AppResult<ExportObsidianProjectionData>> {
  const resolved = await resolveViewerProjectCwd(options);

  if (!resolved.ok) {
    return {
      ok: false,
      error: resolved.error,
      warnings: resolved.warnings,
      meta: await buildBestEffortMeta(options)
    };
  }

  return exportObsidianProjection({
    cwd: resolved.data.project_root,
    ...(options.outDir === undefined ? {} : { outDir: options.outDir }),
    ...(options.runner === undefined ? {} : { runner: options.runner }),
    ...(options.clock === undefined ? {} : { clock: options.clock })
  });
}

export async function deleteViewerProject(
  options: DeleteViewerProjectOptions
): Promise<AppResult<ViewerProjectDeleteData>> {
  const resolved = await resolveViewerProjectCwd(options);
  const registryPath = resolveProjectRegistryLocation(options).registryPath;

  if (!resolved.ok) {
    return {
      ok: false,
      error: resolved.error,
      warnings: resolved.warnings,
      meta: await buildBestEffortMeta(options)
    };
  }

  const project = registeredProjectWithDerivedAictxRoot(resolved.data);
  const summary = summarizeRegisteredProject(project);
  const meta = await buildBestEffortMeta({
    ...options,
    cwd: project.project_root
  });
  const missing = await isAictxRootMissing(project.aictx_root);

  if (!missing.ok) {
    return {
      ok: false,
      error: missing.error,
      warnings: [...resolved.warnings, ...missing.warnings],
      meta
    };
  }

  const warnings = [...resolved.warnings, ...missing.warnings];
  const entriesRemoved: string[] = [];

  if (!missing.data) {
    const deleted = await removeAictxRoot(project.aictx_root);

    if (!deleted.ok) {
      return {
        ok: false,
        error: deleted.error,
        warnings: [...warnings, ...deleted.warnings],
        meta
      };
    }

    warnings.push(...deleted.warnings);
    entriesRemoved.push(".aictx");
  }

  const unregistered = await removeProjectRootFromRegistry({
    ...options,
    projectRoot: project.project_root
  });

  if (!unregistered.ok) {
    return {
      ok: false,
      error: unregistered.error,
      warnings: [...warnings, ...unregistered.warnings],
      meta
    };
  }

  warnings.push(...unregistered.warnings);

  return {
    ok: true,
    data: {
      registry_path: registryPath,
      project: summary,
      removed: unregistered.data === null ? null : summarizeRegisteredProject(unregistered.data),
      destroyed: true,
      entries_removed: entriesRemoved
    },
    warnings,
    meta
  };
}

export async function exportObsidianProjection(
  options: ExportObsidianProjectionOptions
): Promise<AppResult<ExportObsidianProjectionData>> {
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

  const exported = await withProjectLock(
    {
      aictxRoot: paths.data.aictxRoot,
      operation: "export",
      clock
    },
    async () => {
      const storage = await readCanonicalStorage(paths.data.projectRoot);

      if (!storage.ok) {
        return storage;
      }

      const projection = await writeObsidianProjectionExport({
        projectRoot: paths.data.projectRoot,
        storage: storage.data,
        ...(options.outDir === undefined ? {} : { outDir: options.outDir })
      });

      if (!projection.ok) {
        return {
          ...projection,
          warnings: [...storage.warnings, ...projection.warnings]
        };
      }

      return ok(projection.data, [...storage.warnings, ...projection.warnings]);
    }
  );

  if (!exported.ok) {
    return {
      ok: false,
      error: exported.error,
      warnings: exported.warnings,
      meta: meta.meta
    };
  }

  return {
    ok: true,
    data: exported.data,
    warnings: exported.warnings,
    meta: meta.meta
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
      untracked_files: diff.data.untrackedFiles,
      changed_memory_ids: changedIds.memoryIds,
      changed_relation_ids: changedIds.relationIds
    },
    warnings: diff.warnings,
    meta: meta.meta
  };
}

export async function suggestMemory(
  options: SuggestMemoryOptions
): Promise<AppResult<SuggestMemoryData>> {
  const mode = suggestMode(options);

  if (!mode.ok) {
    return {
      ok: false,
      error: mode.error,
      warnings: [],
      meta: await buildBestEffortMeta(options)
    };
  }

  if (options.patch === true && mode.data !== "bootstrap") {
    return {
      ok: false,
      error: aictxError(
        "AICtxValidationFailed",
        "Suggest --patch requires --bootstrap."
      ),
      warnings: [],
      meta: await buildBestEffortMeta(options)
    };
  }

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

  if (mode.data === "from_diff" && !meta.meta.git.available) {
    return {
      ok: false,
      error: aictxError("AICtxGitRequired", "Git is required for this operation."),
      warnings: [],
      meta: meta.meta
    };
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

  if (mode.data === "from_diff") {
    const changed = await getChangedProjectFiles(paths.data.projectRoot, options);

    if (!changed.ok) {
      return {
        ok: false,
        error: changed.error,
        warnings: [...storage.warnings, ...changed.warnings],
        meta: meta.meta
      };
    }

    return {
      ok: true,
      data: buildSuggestFromDiffPacket({
        changedFiles: changed.data.changedFiles,
        storage: storage.data
      }),
      warnings: [...storage.warnings, ...changed.warnings],
      meta: meta.meta
    };
  }

  if (mode.data === "after_task") {
    const changed = meta.meta.git.available
      ? await getChangedProjectFiles(paths.data.projectRoot, options)
      : ok({ changedFiles: [] as string[] });

    if (!changed.ok) {
      return {
        ok: false,
        error: changed.error,
        warnings: [...storage.warnings, ...changed.warnings],
        meta: meta.meta
      };
    }

    return {
      ok: true,
      data: buildSuggestAfterTaskPacket({
        task: options.afterTask ?? "",
        changedFiles: changed.data.changedFiles,
        storage: storage.data
      }),
      warnings: [
        ...storage.warnings,
        ...changed.warnings,
        ...(meta.meta.git.available
          ? []
          : ["Git is unavailable; after-task changed_files is empty."])
      ],
      meta: meta.meta
    };
  }

  return {
    ok: true,
    data:
      options.patch === true
        ? await buildSuggestBootstrapPatchProposal({
            projectRoot: paths.data.projectRoot,
            storage: storage.data
          })
        : await buildSuggestBootstrapPacket({
            projectRoot: paths.data.projectRoot,
            storage: storage.data
          }),
    warnings: storage.warnings,
    meta: meta.meta
  };
}

export async function auditMemory(
  options: AuditMemoryOptions
): Promise<AppResult<AuditMemoryData>> {
  const prepared = await readOnlyCanonicalStorage(options);

  if (!prepared.ok) {
    return prepared;
  }

  const gitFileChanges = await recentGitFileChangesForIndex(
    prepared.storage.projectRoot,
    prepared.meta,
    options
  );
  const roleCoverage = buildRoleCoverage(prepared.storage, prepared.meta.git);

  return {
    ok: true,
    data: {
      findings: await buildAuditFindings({
        projectRoot: prepared.storage.projectRoot,
        storage: prepared.storage,
        gitFileChanges: gitFileChanges.ok ? gitFileChanges.data : []
      }),
      role_coverage: roleCoverage,
      role_gaps: roleCoverageGaps(roleCoverage)
    },
    warnings: [
      ...prepared.storageWarnings,
      ...(gitFileChanges.ok ? gitFileChanges.warnings : [])
    ],
    meta: prepared.meta
  };
}

function roleCoverageGaps(coverage: RoleCoverageData): RoleCoverageGapData[] {
  return coverage.roles
    .filter((role): role is RoleCoverageItem & { gap: string } => role.gap !== null)
    .map((role) => ({
      key: role.key,
      label: role.label,
      status: role.status,
      optional: role.optional,
      memory_ids: role.memory_ids,
      relation_ids: role.relation_ids,
      gap: role.gap
    }));
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

export async function restoreMemory(
  options: RestoreMemoryOptions
): Promise<AppResult<RestoreMemoryData>> {
  const prepared = await prepareGitOnlyMemoryOperation(options);

  if (!prepared.ok) {
    return prepared;
  }

  return restoreResolvedMemory({
    paths: prepared.paths,
    meta: prepared.meta,
    commit: options.commit,
    operation: "restore",
    clock: options.clock ?? systemClock,
    runner: options.runner
  });
}

export async function rewindMemory(
  options: RewindMemoryOptions
): Promise<AppResult<RestoreMemoryData>> {
  const prepared = await prepareGitOnlyMemoryOperation(options);

  if (!prepared.ok) {
    return prepared;
  }

  const history = await getAictxHistory(prepared.paths.projectRoot, {
    runner: options.runner,
    limit: 2
  });

  if (!history.ok) {
    return {
      ok: false,
      error: history.error,
      warnings: history.warnings,
      meta: prepared.meta
    };
  }

  const previousCommit = history.data[1];

  if (previousCommit === undefined) {
    return {
      ok: false,
      error: aictxError(
        "AICtxValidationFailed",
        "No previous committed Aictx state is available to rewind to."
      ),
      warnings: history.warnings,
      meta: prepared.meta
    };
  }

  return restoreResolvedMemory({
    paths: prepared.paths,
    meta: prepared.meta,
    commit: previousCommit.commit,
    operation: "rewind",
    clock: options.clock ?? systemClock,
    runner: options.runner
  });
}

export async function resetAictx(options: ResetAictxOptions): Promise<AppResult<ResetAictxData>> {
  const paths = await resolveProjectPaths({
    cwd: options.cwd,
    mode: "init",
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

  if (options.destroy === true) {
    const destroyed = await removeAictxRoot(paths.data.aictxRoot);

    if (!destroyed.ok) {
      return appError(destroyed.error, destroyed.warnings, meta.meta);
    }

    return {
      ok: true,
      data: {
        destroyed: true,
        backup_path: null,
        entries_removed: [".aictx"]
      },
      warnings: destroyed.warnings,
      meta: meta.meta
    };
  }

  const reset = await backupAndClearAictxRoot(paths.data.projectRoot, paths.data.aictxRoot, options);

  if (!reset.ok) {
    return appError(reset.error, reset.warnings, meta.meta);
  }

  return {
    ok: true,
    data: {
      destroyed: false,
      backup_path: reset.data.backupPath,
      entries_removed: reset.data.entriesRemoved
    },
    warnings: reset.warnings,
    meta: meta.meta
  };
}

export async function resetAllAictx(
  options: ResetAictxOptions
): Promise<AppResult<ResetAllAictxData>> {
  const registry = await readProjectRegistry(options);
  const meta = await buildBestEffortMeta(options);
  const registryPath = resolveProjectRegistryLocation(options).registryPath;

  if (!registry.ok) {
    return {
      ok: false,
      error: registry.error,
      warnings: registry.warnings,
      meta
    };
  }

  const warnings = [...registry.warnings];
  const projectsReset: ResetAllAictxProjectReset[] = [];
  const projectsSkipped: ResetAllAictxProjectSkipped[] = [];
  const projectsFailed: ResetAllAictxProjectFailed[] = [];
  const projectRootsToUnregister: string[] = [];

  for (const entry of registry.data.registry.projects) {
    const project = registeredProjectWithDerivedAictxRoot(entry);
    const summary = summarizeRegisteredProject(project);
    const missing = await isAictxRootMissing(project.aictx_root);

    if (!missing.ok) {
      projectsFailed.push({
        ...summary,
        error: missing.error,
        warnings: missing.warnings
      });
      warnings.push(...missing.warnings);
      continue;
    }

    if (missing.data) {
      projectsSkipped.push({
        ...summary,
        reason: ".aictx directory does not exist."
      });
      projectRootsToUnregister.push(project.project_root);
      continue;
    }

    if (options.destroy === true) {
      const reset = await removeAictxRoot(project.aictx_root);

      if (!reset.ok) {
        projectsFailed.push({
          ...summary,
          error: reset.error,
          warnings: reset.warnings
        });
        warnings.push(...reset.warnings);
        continue;
      }

      warnings.push(...reset.warnings);
      projectRootsToUnregister.push(project.project_root);

      projectsReset.push({
        ...summary,
        destroyed: true,
        backup_path: null,
        entries_removed: [".aictx"]
      });
      continue;
    }

    const reset = await backupAndClearAictxRoot(project.project_root, project.aictx_root, options);

    if (!reset.ok) {
      projectsFailed.push({
        ...summary,
        error: reset.error,
        warnings: reset.warnings
      });
      warnings.push(...reset.warnings);
      continue;
    }

    warnings.push(...reset.warnings);
    projectRootsToUnregister.push(project.project_root);

    projectsReset.push({
      ...summary,
      destroyed: false,
      backup_path: reset.data.backupPath,
      entries_removed: reset.data.entriesRemoved
    });
  }

  if (projectRootsToUnregister.length > 0) {
    const unregistered = await removeProjectRootsFromRegistry({
      ...options,
      projectRoots: projectRootsToUnregister
    });

    if (!unregistered.ok) {
      return {
        ok: false,
        error: unregistered.error,
        warnings: [...warnings, ...unregistered.warnings],
        meta
      };
    }

    warnings.push(...unregistered.warnings);
  }

  return {
    ok: true,
    data: {
      registry_path: registryPath,
      destroyed: options.destroy === true,
      projects_reset: projectsReset,
      projects_skipped: projectsSkipped,
      projects_failed: projectsFailed
    },
    warnings,
    meta
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
          recovery_files: applied.data.recovery_files,
          repairs_applied: applied.data.repairs_applied,
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

export async function rememberMemory(
  options: RememberMemoryOptions
): Promise<AppResult<RememberMemoryData>> {
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

  if (options.input === undefined) {
    return {
      ok: false,
      error: aictxError("AICtxPatchRequired", "Remember input is required."),
      warnings: [],
      meta: meta.meta
    };
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

  const patch = buildRememberMemoryPatch({
    input: options.input,
    storage: storage.data
  });

  if (!patch.ok) {
    return {
      ok: false,
      error: patch.error,
      warnings: [...storage.warnings, ...patch.warnings],
      meta: meta.meta
    };
  }

  if (options.dryRun === true) {
    const secrets = rejectPatchSecrets(patch.data);

    if (!secrets.ok) {
      return {
        ok: false,
        error: secrets.error,
        warnings: [...storage.warnings, ...secrets.warnings],
        meta: meta.meta
      };
    }

    const planned = await planMemoryPatch({
      projectRoot: paths.data.projectRoot,
      patch: patch.data,
      git: meta.meta.git,
      clock,
      runner: options.runner
    });

    if (!planned.ok) {
      return {
        ok: false,
        error: planned.error,
        warnings: [...storage.warnings, ...secrets.warnings, ...planned.warnings],
        meta: meta.meta
      };
    }

    return {
      ok: true,
      data: {
        dry_run: true,
        patch: patch.data,
        files_changed: planned.data.files_changed,
        recovery_files: planned.data.recovery_files,
        repairs_applied: planned.data.repairs_applied,
        memory_created: planned.data.memory_created,
        memory_updated: planned.data.memory_updated,
        memory_deleted: planned.data.memory_deleted,
        relations_created: planned.data.relations_created,
        relations_updated: planned.data.relations_updated,
        relations_deleted: planned.data.relations_deleted,
        events_appended: planned.data.events_appended,
        index_updated: false
      },
      warnings: [...storage.warnings, ...secrets.warnings, ...planned.warnings],
      meta: meta.meta
    };
  }

  const saved = await saveMemoryPatch({
    cwd: paths.data.projectRoot,
    patch: patch.data,
    clock,
    runner: options.runner
  });

  if (!saved.ok) {
    return {
      ok: false,
      error: saved.error,
      warnings: [...storage.warnings, ...saved.warnings],
      meta: saved.meta
    };
  }

  return {
    ok: true,
    data: {
      dry_run: false,
      patch: patch.data,
      ...saved.data
    },
    warnings: [...storage.warnings, ...saved.warnings],
    meta: saved.meta
  };
}

export async function showBranchHandoff(
  options: ShowBranchHandoffOptions
): Promise<AppResult<BranchHandoffShowData>> {
  const prepared = await prepareBranchHandoffOperation(options);

  if (!prepared.ok) {
    return prepared;
  }

  const storage = await readCanonicalStorage(prepared.paths.projectRoot);

  if (!storage.ok) {
    return {
      ok: false,
      error: storage.error,
      warnings: storage.warnings,
      meta: prepared.meta
    };
  }

  const id = branchHandoffId(prepared.branch);
  const handoff = findStoredObject(storage.data.objects, id);
  const activeHandoff = handoff?.sidecar.status === "active" ? handoff : undefined;

  return {
    ok: true,
    data: {
      branch: prepared.branch,
      id,
      handoff: activeHandoff === undefined ? null : summarizeObject(activeHandoff)
    },
    warnings: storage.warnings,
    meta: prepared.meta
  };
}

export async function updateBranchHandoff(
  options: UpdateBranchHandoffOptions
): Promise<AppResult<BranchHandoffUpdateData>> {
  const prepared = await prepareBranchHandoffOperation(options);

  if (!prepared.ok) {
    return prepared;
  }

  if (options.input === undefined) {
    return {
      ok: false,
      error: aictxError("AICtxPatchRequired", "Handoff update input is required."),
      warnings: [],
      meta: prepared.meta
    };
  }

  const parsed = parseBranchHandoffInput(options.input);

  if (!parsed.ok) {
    return {
      ok: false,
      error: parsed.error,
      warnings: parsed.warnings,
      meta: prepared.meta
    };
  }

  const storage = await readCanonicalStorage(prepared.paths.projectRoot);

  if (!storage.ok) {
    return {
      ok: false,
      error: storage.error,
      warnings: storage.warnings,
      meta: prepared.meta
    };
  }

  const patch = buildBranchHandoffUpdatePatch({
    input: parsed.data,
    storage: storage.data,
    branch: prepared.branch
  });
  const saved = await saveMemoryPatch({
    cwd: prepared.paths.projectRoot,
    patch,
    ...(options.clock === undefined ? {} : { clock: options.clock }),
    ...(options.runner === undefined ? {} : { runner: options.runner })
  });

  if (!saved.ok) {
    return {
      ok: false,
      error: saved.error,
      warnings: [...storage.warnings, ...saved.warnings],
      meta: saved.meta
    };
  }

  const refreshed = await readCanonicalStorage(prepared.paths.projectRoot);
  const handoff = refreshed.ok
    ? findStoredObject(refreshed.data.objects, branchHandoffId(prepared.branch))
    : undefined;

  return {
    ok: true,
    data: {
      branch: prepared.branch,
      id: branchHandoffId(prepared.branch),
      input: parsed.data,
      save: saved.data,
      handoff: handoff === undefined ? null : summarizeObject(handoff)
    },
    warnings: [
      ...storage.warnings,
      ...saved.warnings,
      ...(refreshed.ok ? refreshed.warnings : [`Handoff refresh warning: ${refreshed.error.message}`])
    ],
    meta: saved.meta
  };
}

export async function closeBranchHandoff(
  options: CloseBranchHandoffOptions
): Promise<AppResult<BranchHandoffCloseData>> {
  const prepared = await prepareBranchHandoffOperation(options);

  if (!prepared.ok) {
    return prepared;
  }

  if (options.input === undefined) {
    return {
      ok: false,
      error: aictxError("AICtxPatchRequired", "Handoff close input is required."),
      warnings: [],
      meta: prepared.meta
    };
  }

  const parsed = parseBranchHandoffCloseInput(options.input);

  if (!parsed.ok) {
    return {
      ok: false,
      error: parsed.error,
      warnings: parsed.warnings,
      meta: prepared.meta
    };
  }

  const storage = await readCanonicalStorage(prepared.paths.projectRoot);

  if (!storage.ok) {
    return {
      ok: false,
      error: storage.error,
      warnings: storage.warnings,
      meta: prepared.meta
    };
  }

  const id = branchHandoffId(prepared.branch);

  if (findStoredObject(storage.data.objects, id) === undefined) {
    return {
      ok: false,
      error: objectNotFound(id),
      warnings: storage.warnings,
      meta: prepared.meta
    };
  }

  const promotePatch = hasBranchHandoffPromotions(parsed.data)
    ? buildRememberMemoryPatch({
        input: promotionRememberInput(parsed.data),
        storage: storage.data
      })
    : ok(null);

  if (!promotePatch.ok) {
    return {
      ok: false,
      error: promotePatch.error,
      warnings: [...storage.warnings, ...promotePatch.warnings],
      meta: prepared.meta
    };
  }

  const saved = await saveMemoryPatch({
    cwd: prepared.paths.projectRoot,
    patch: buildBranchHandoffClosePatch({
      close: parsed.data,
      branch: prepared.branch,
      promotePatch: promotePatch.data
    }),
    ...(options.clock === undefined ? {} : { clock: options.clock }),
    ...(options.runner === undefined ? {} : { runner: options.runner })
  });

  if (!saved.ok) {
    return {
      ok: false,
      error: saved.error,
      warnings: [...storage.warnings, ...promotePatch.warnings, ...saved.warnings],
      meta: saved.meta
    };
  }

  return {
    ok: true,
    data: {
      branch: prepared.branch,
      id,
      input: parsed.data,
      save: saved.data
    },
    warnings: [...storage.warnings, ...promotePatch.warnings, ...saved.warnings],
    meta: saved.meta
  };
}

function summarizeRegisteredProject(entry: ProjectRegistryEntry): RegisteredProjectSummary {
  return {
    registry_id: entry.registry_id,
    project: {
      id: entry.project.id,
      name: entry.project.name
    },
    project_root: entry.project_root,
    aictx_root: entry.aictx_root,
    source: entry.source,
    registered_at: entry.registered_at,
    last_seen_at: entry.last_seen_at
  };
}

function registeredProjectWithDerivedAictxRoot(entry: ProjectRegistryEntry): ProjectRegistryEntry {
  const projectRoot = resolve(entry.project_root);

  return {
    ...entry,
    project_root: projectRoot,
    aictx_root: join(projectRoot, ".aictx")
  };
}

function mergeRegistryEntries(
  registered: readonly ProjectRegistryEntry[],
  current: ResolvedProjectRegistryEntry | null,
  clock: Clock
): ProjectRegistryEntry[] {
  const entries = [...registered];

  if (current === null || entries.some((entry) => entry.registry_id === current.registry_id)) {
    return entries;
  }

  const now = clock.nowIso();

  entries.push({
    ...current,
    source: "auto",
    registered_at: now,
    last_seen_at: now
  });

  return entries;
}

async function summarizeViewerProject(
  entry: ProjectRegistryEntry,
  current: ResolvedProjectRegistryEntry | null,
  options: ProjectRegistryOperationOptions
): Promise<ViewerProjectSummary> {
  const bootstrap = await getViewerBootstrap({
    cwd: entry.project_root,
    runner: options.runner
  });
  const base = summarizeRegisteredProject(entry);

  if (!bootstrap.ok) {
    return {
      ...base,
      current: current?.registry_id === entry.registry_id,
      available: false,
      counts: null,
      git: null,
      warnings: [...bootstrap.warnings, bootstrap.error.message]
    };
  }

  return {
    ...base,
    project: bootstrap.data.project,
    current: current?.registry_id === entry.registry_id,
    available: true,
    counts: bootstrap.data.counts,
    git: bootstrap.meta.git,
    warnings: [...bootstrap.warnings, ...bootstrap.data.storage_warnings]
  };
}

function compareViewerProjects(left: ViewerProjectSummary, right: ViewerProjectSummary): number {
  if (left.current !== right.current) {
    return left.current ? -1 : 1;
  }

  if (left.available !== right.available) {
    return left.available ? -1 : 1;
  }

  return left.project.name.localeCompare(right.project.name) ||
    left.project.id.localeCompare(right.project.id) ||
    left.project_root.localeCompare(right.project_root);
}

async function resolveViewerProjectCwd(
  options: ProjectRegistryOperationOptions & { registryId: string }
): Promise<Result<ProjectRegistryEntry>> {
  const current = await currentProjectRegistryEntry(options);

  if (current.ok && current.data?.registry_id === options.registryId) {
    const now = (options.clock ?? systemClock).nowIso();

    return ok({
      ...current.data,
      source: "auto",
      registered_at: now,
      last_seen_at: now
    });
  }

  const registered = await findRegisteredProject({
    ...options,
    registryId: options.registryId
  });

  if (!registered.ok) {
    return registered;
  }

  if (registered.data === null) {
    return err(
      aictxError("AICtxValidationFailed", "Registered Aictx project was not found.", {
        registry_id: options.registryId
      })
    );
  }

  return ok(registered.data, registered.warnings);
}

export const applicationOperations = {
  addRegisteredProject,
  auditMemory,
  checkProject,
  closeBranchHandoff,
  deleteViewerProject,
  diffMemory,
  exportObsidianProjection,
  exportViewerProjectObsidian,
  getMemoryLens,
  getRoleCoverage,
  getViewerProjectBootstrap,
  getViewerBootstrap,
  getViewerProjects,
  graphMemory,
  initProject,
  inspectMemory,
  listRegisteredProjects,
  listMemoryHistory,
  listStaleMemory,
  loadMemory,
  pruneRegisteredProjects,
  rebuildIndex,
  registerCurrentProject,
  removeRegisteredProject,
  resetAllAictx,
  resetAictx,
  restoreMemory,
  rewindMemory,
  saveMemoryPatch,
  searchMemory,
  showBranchHandoff,
  suggestMemory,
  unregisterProjectRoot,
  updateBranchHandoff,
  upgradeStorage
};

const STALE_MEMORY_STATUSES = new Set<ObjectStatus>([
  "stale",
  "superseded"
]);

const STALE_MEMORY_STATUS_ORDER = new Map<ObjectStatus, number>([
  ["stale", 0],
  ["superseded", 1]
]);

type ResolvedGitOnlyMemoryOperation =
  | {
      ok: true;
      paths: ProjectPaths;
      meta: AictxMeta;
    }
  | {
      ok: false;
      error: AictxError;
      warnings: string[];
      meta: AictxMeta;
    };

interface RestoreResolvedMemoryOptions extends GitWrapperOptions {
  paths: ProjectPaths;
  meta: AictxMeta;
  commit: string;
  operation: "restore" | "rewind";
  clock: Clock;
}

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

type ResolvedBranchHandoffOperation =
  | {
      ok: true;
      paths: ProjectPaths;
      meta: AictxMeta;
      branch: string;
    }
  | {
      ok: false;
      error: AictxError;
      warnings: string[];
      meta: AictxMeta;
    };

async function prepareGitOnlyMemoryOperation(
  options: GitWrapperOptions & { cwd: string }
): Promise<ResolvedGitOnlyMemoryOperation> {
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

  return {
    ok: true,
    paths: paths.data,
    meta: meta.meta
  };
}

async function prepareBranchHandoffOperation(
  options: GitWrapperOptions & { cwd: string }
): Promise<ResolvedBranchHandoffOperation> {
  const prepared = await prepareGitOnlyMemoryOperation(options);

  if (!prepared.ok) {
    return prepared;
  }

  if (prepared.meta.git.branch === null) {
    return {
      ok: false,
      error: aictxError(
        "AICtxGitRequired",
        "A current Git branch is required for branch handoff."
      ),
      warnings: [],
      meta: prepared.meta
    };
  }

  return {
    ok: true,
    paths: prepared.paths,
    meta: prepared.meta,
    branch: prepared.meta.git.branch
  };
}

async function restoreResolvedMemory(
  options: RestoreResolvedMemoryOptions
): Promise<AppResult<RestoreMemoryData>> {
  const restored = await withProjectLock(
    {
      aictxRoot: options.paths.aictxRoot,
      operation: options.operation,
      clock: options.clock
    },
    async () => {
      const clean = await rejectDirtyMemoryBeforeRestore(options.paths, options);

      if (!clean.ok) {
        return clean;
      }

      const canonical = await restoreCanonicalStorageFromCommit({
        projectRoot: options.paths.projectRoot,
        commit: options.commit,
        runner: options.runner
      });

      if (!canonical.ok) {
        return canonical;
      }

      const gitFileChanges = await recentGitFileChangesForIndex(
        options.paths.projectRoot,
        options.meta,
        options
      );
      const rebuilt = await rebuildGeneratedIndex({
        projectRoot: options.paths.projectRoot,
        aictxRoot: options.paths.aictxRoot,
        clock: options.clock,
        git: options.meta.git,
        gitFileChanges: gitFileChanges.ok ? gitFileChanges.data : []
      });

      return ok(
        {
          restored_from: canonical.data.restored_from,
          files_changed: canonical.data.files_changed,
          index_rebuilt: rebuilt.ok
        },
        [
          ...canonical.warnings,
          ...gitFileChanges.warnings,
          ...rebuilt.warnings,
          ...(rebuilt.ok ? [] : [`Index warning: ${rebuilt.error.message}`])
        ]
      );
    }
  );

  if (!restored.ok) {
    return {
      ok: false,
      error: restored.error,
      warnings: restored.warnings,
      meta: options.meta
    };
  }

  const refreshedMeta = await buildMeta(options.paths, options);

  if (!refreshedMeta.ok) {
    return {
      ok: true,
      data: restored.data,
      warnings: [
        ...restored.warnings,
        ...refreshedMeta.warnings,
        `Git metadata refresh failed after ${options.operation}: ${refreshedMeta.error.message}`
      ],
      meta: refreshedMeta.meta
    };
  }

  return {
    ok: true,
    data: restored.data,
    warnings: restored.warnings,
    meta: refreshedMeta.meta
  };
}

async function rejectDirtyMemoryBeforeRestore(
  paths: ProjectPaths,
  options: GitWrapperOptions
): Promise<Result<void>> {
  const dirtyState = await getAictxDirtyState(paths.projectRoot, options);

  if (!dirtyState.ok) {
    return dirtyState;
  }

  if (!dirtyState.data.dirty) {
    return ok(undefined);
  }

  return err(
    aictxError("AICtxDirtyMemory", "Restore requires a clean Aictx working tree.", {
      dirty_files: dirtyState.data.files
    })
  );
}

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
    facets: sidecar.facets ?? null,
    evidence: [...(sidecar.evidence ?? [])],
    source: sidecar.source ?? null,
    superseded_by: sidecar.superseded_by ?? null,
    created_at: sidecar.created_at,
    updated_at: sidecar.updated_at,
    body: object.body
  };
}

function summarizeMemoryLens(lens: BuiltMemoryLens): MemoryLensData {
  return {
    name: lens.name,
    title: lens.title,
    markdown: lens.markdown,
    role_coverage: lens.role_coverage,
    included_memory_ids: lens.included_memory_ids,
    relation_ids: lens.relation_ids,
    relations: summarizeRelations(lens.relations),
    generated_gaps: lens.generated_gaps
  };
}

function summarizeRelations(
  relations: readonly StoredMemoryRelation[]
): MemoryRelationSummary[] {
  return relations.map(summarizeRelation);
}

function countObjectsByStatus(
  objects: readonly StoredMemoryObject[],
  status: ObjectStatus
): number {
  return objects.filter((object) => object.sidecar.status === status).length;
}

function countObjectsByType(
  objects: readonly StoredMemoryObject[],
  type: ObjectType
): number {
  return objects.filter((object) => object.sidecar.type === type).length;
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

function suggestMode(options: SuggestMemoryOptions): Result<SuggestMode> {
  const selected = [
    options.fromDiff === true,
    options.bootstrap === true,
    options.afterTask !== undefined
  ].filter(Boolean);

  if (selected.length !== 1) {
    return err(
      aictxError(
        "AICtxValidationFailed",
        "Suggest requires exactly one of --from-diff, --bootstrap, or --after-task."
      )
    );
  }

  if (options.fromDiff === true) {
    return ok("from_diff");
  }

  if (options.bootstrap === true) {
    return ok("bootstrap");
  }

  return ok("after_task");
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

async function buildBestEffortMeta(
  options: GitWrapperOptions & { cwd: string }
): Promise<AictxMeta> {
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

async function hintedGitFileChanges(
  projectRoot: string,
  meta: AictxMeta,
  options: GitWrapperOptions & { hints?: SearchMemoryInput["hints"] }
): Promise<Result<ProjectFileChange[]>> {
  const hints = normalizeRetrievalHints(options.hints);

  if (!hints.ok) {
    return hints;
  }

  if (!meta.git.available) {
    return ok([]);
  }

  const files = hintedFiles(hints.data);

  if (files.length === 0) {
    return ok([]);
  }

  const changes = await getRecentProjectFileChanges(projectRoot, {
    files,
    historyWindow: hints.data.history_window,
    limit: 50,
    runner: options.runner
  });

  if (!changes.ok) {
    return ok([], [
      ...changes.warnings,
      `Git file history warning: ${changes.error.message}`
    ]);
  }

  return ok(changes.data.changes, changes.warnings);
}

async function recentGitFileChangesForIndex(
  projectRoot: string,
  meta: AictxMeta,
  options: GitWrapperOptions
): Promise<Result<ProjectFileChange[]>> {
  if (!meta.git.available) {
    return ok([]);
  }

  const changes = await getRecentProjectFileChanges(projectRoot, {
    files: ["."],
    limit: 100,
    runner: options.runner
  });

  if (!changes.ok) {
    return ok([], [
      ...changes.warnings,
      `Git file history warning: ${changes.error.message}`
    ]);
  }

  return ok(changes.data.changes, changes.warnings);
}

async function rebuildIndexForResolvedProject(options: {
  paths: ProjectPaths;
  meta: AictxMeta;
  clock: Clock;
  runner?: GitWrapperOptions["runner"];
}) {
  return withProjectLock(
    {
      aictxRoot: options.paths.aictxRoot,
      operation: "rebuild",
      clock: options.clock
    },
    async () => {
      const gitFileChanges = await recentGitFileChangesForIndex(
        options.paths.projectRoot,
        options.meta,
        options
      );

      const rebuilt = await rebuildGeneratedIndex({
        projectRoot: options.paths.projectRoot,
        aictxRoot: options.paths.aictxRoot,
        clock: options.clock,
        git: options.meta.git,
        gitFileChanges: gitFileChanges.ok ? gitFileChanges.data : []
      });

      return rebuilt.ok
        ? ok(rebuilt.data, [...gitFileChanges.warnings, ...rebuilt.warnings])
        : rebuilt;
    }
  );
}

function searchIndexOptions(aictxRoot: string, input: SearchMemoryInput): SearchIndexOptions {
  return {
    aictxRoot,
    query: input.query,
    ...(input.limit === undefined ? {} : { limit: input.limit }),
    ...(input.hints === undefined ? {} : { hints: input.hints })
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

  let db: Awaited<ReturnType<typeof openSqliteDatabase>> | null = null;

  try {
    db = await openSqliteDatabase(databasePath.data, {
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

function appError<T>(error: AictxError, warnings: string[], meta: AictxMeta): AppResult<T> {
  return {
    ok: false,
    error,
    warnings,
    meta
  };
}

async function removeAictxRoot(aictxRoot: string): Promise<Result<void>> {
  try {
    await rm(aictxRoot, { recursive: true, force: true });
    return ok(undefined);
  } catch (error) {
    return err(
      aictxError("AICtxValidationFailed", "Aictx root could not be deleted.", {
        aictxRoot,
        message: messageFromUnknown(error)
      })
    );
  }
}

async function isAictxRootMissing(aictxRoot: string): Promise<Result<boolean>> {
  try {
    await lstat(aictxRoot);
    return ok(false);
  } catch (error) {
    if (errorCode(error) === "ENOENT") {
      return ok(true);
    }

    return err(
      aictxError("AICtxValidationFailed", "Aictx root could not be read.", {
        aictxRoot,
        message: messageFromUnknown(error)
      })
    );
  }
}

async function aictxRootExists(aictxRoot: string): Promise<Result<boolean>> {
  try {
    await lstat(aictxRoot);
    return ok(true);
  } catch (error) {
    if (errorCode(error) === "ENOENT") {
      return ok(false);
    }

    return err(
      aictxError("AICtxValidationFailed", "Aictx root could not be read.", {
        aictxRoot,
        message: messageFromUnknown(error)
      })
    );
  }
}

async function backupAndClearAictxRoot(
  projectRoot: string,
  aictxRoot: string,
  options: GitWrapperOptions
): Promise<Result<{ backupPath: string; entriesRemoved: string[] }>> {
  const existingRoot = await ensureRealDirectory(aictxRoot, ".aictx");

  if (!existingRoot.ok) {
    return existingRoot;
  }

  const backupRoot = join(aictxRoot, ".backup");

  try {
    await mkdir(backupRoot, { recursive: true });
  } catch (error) {
    return err(
      aictxError("AICtxValidationFailed", "Aictx backup directory could not be created.", {
        path: ".aictx/.backup",
        message: messageFromUnknown(error)
      })
    );
  }

  const backupDirectory = await ensureRealDirectory(backupRoot, ".aictx/.backup");

  if (!backupDirectory.ok) {
    return backupDirectory;
  }

  const archiveName = `aictx-${timestampForFilename()}-${randomUUID()}.tar.gz`;
  const archivePath = join(backupRoot, archiveName);
  const archiveRelativePath = toSlash(join(".aictx", ".backup", archiveName));
  const archived = await runSubprocess(
    "tar",
    [
      "-czf",
      archivePath,
      "--exclude",
      "./.backup",
      "--exclude",
      ".backup",
      "-C",
      aictxRoot,
      "."
    ],
    {
      cwd: projectRoot,
      ...(options.runner === undefined ? {} : { runner: options.runner })
    }
  );

  if (!archived.ok) {
    await rm(archivePath, { force: true });
    return archived;
  }

  if (archived.data.exitCode !== 0) {
    await rm(archivePath, { force: true });
    return err(
      aictxError("AICtxInternalError", "Aictx backup archive could not be created.", {
        command: "tar",
        exitCode: archived.data.exitCode,
        signal: archived.data.signal,
        stderr: archived.data.stderr
      })
    );
  }

  try {
    const entries = await readdir(aictxRoot);
    const entriesToRemove = entries.filter((entry) => entry !== ".backup");

    await Promise.all(
      entriesToRemove.map((entry) => rm(join(aictxRoot, entry), { recursive: true, force: true }))
    );

    return ok({
      backupPath: archiveRelativePath,
      entriesRemoved: entriesToRemove.map((entry) => toSlash(join(".aictx", entry))).sort()
    });
  } catch (error) {
    return err(
      aictxError("AICtxValidationFailed", "Aictx root could not be cleared after backup.", {
        aictxRoot,
        backupPath: archiveRelativePath,
        message: messageFromUnknown(error)
      })
    );
  }
}

async function ensureRealDirectory(path: string, label: string): Promise<Result<void>> {
  let stats;

  try {
    stats = await lstat(path);
  } catch (error) {
    const code = errorCode(error);
    const message = code === "ENOENT"
      ? `${label} directory does not exist.`
      : `${label} directory could not be read.`;

    return err(
      aictxError(code === "ENOENT" ? "AICtxNotInitialized" : "AICtxValidationFailed", message, {
        path: label,
        message: messageFromUnknown(error)
      })
    );
  }

  if (stats.isSymbolicLink() || !stats.isDirectory()) {
    return err(
      aictxError("AICtxValidationFailed", `${label} must be a real directory.`, {
        path: label
      })
    );
  }

  return ok(undefined);
}

function timestampForFilename(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function toSlash(path: string): string {
  return path.replace(/\\/gu, "/");
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

function errorCode(error: unknown): string | null {
  if (isJsonObject(error) && typeof error.code === "string") {
    return error.code;
  }

  return null;
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
