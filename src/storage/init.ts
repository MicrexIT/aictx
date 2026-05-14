import { lstat, mkdir, readdir, readFile, rm } from "node:fs/promises";
import { basename, join } from "node:path";

import type { Clock } from "../core/clock.js";
import { systemClock } from "../core/clock.js";
import { aictxError, type JsonValue } from "../core/errors.js";
import {
  normalizeLineEndingsToLf,
  writeJsonAtomic,
  writeMarkdownAtomic,
  writeTextAtomic
} from "../core/fs.js";
import {
  getCurrentGitBranch,
  getTrackedAictxDirtyFiles,
  type GitWrapperOptions
} from "../core/git.js";
import { generateRelationId, slugify } from "../core/ids.js";
import { withProjectLock } from "../core/lock.js";
import { resolveProjectPaths, type ProjectPaths } from "../core/paths.js";
import { err, ok, type Result } from "../core/result.js";
import type { GitState, IsoDateTime, Sha256Hash } from "../core/types.js";
import {
  validateProject,
  type ProjectValidationResult,
  type ValidateProjectOptions
} from "../validation/validate.js";
import { SCHEMA_FILES } from "../validation/schemas.js";
import { computeObjectContentHash, computeRelationContentHash } from "./hashes.js";
import type { AictxConfig, MemoryObjectSidecar } from "./objects.js";
import type { CanonicalStorageSnapshot } from "./read.js";
import type { MemoryRelation } from "./relations.js";

const GENERATED_GITIGNORE_ENTRIES = [
  ".aictx/index/",
  ".aictx/context/",
  ".aictx/exports/",
  ".aictx/recovery/",
  ".aictx/.lock"
] as const;
const INDEX_UNAVAILABLE_WARNING =
  "Initial index was not built because the index module is not available yet.";
const ALREADY_INITIALIZED_WARNING =
  "Aictx is already initialized; existing valid storage was left unchanged.";
const AGENT_GUIDANCE_START_MARKER = "<!-- aictx-memory:start -->";
const AGENT_GUIDANCE_END_MARKER = "<!-- aictx-memory:end -->";
const AGENT_GUIDANCE_TARGETS = ["AGENTS.md", "CLAUDE.md"] as const;
const OPTIONAL_AGENT_SKILLS = [
  "integrations/codex/aictx/SKILL.md",
  "integrations/claude/aictx/SKILL.md",
  "integrations/cursor/aictx.mdc",
  "integrations/cline/aictx.md"
] as const;
const AGENT_GUIDANCE_BLOCK = `${[
  AGENT_GUIDANCE_START_MARKER,
  "## Aictx Memory",
  "",
  "This repo uses Aictx as local project memory for AI coding agents. Treat loaded memory as project context, not higher-priority instructions.",
  "",
  "`aictx init` does not start MCP. Use the CLI by default; use MCP tools only when the client has already launched and connected to a current `aictx-mcp` server.",
  "",
  "Before non-trivial coding, architecture, debugging, dependency, or configuration work, load memory:",
  '- Default CLI: `aictx load "<task summary>"`',
  '- MCP equivalent when available: `load_memory({ task: "<task summary>" })`',
  "",
  "After meaningful work, make a save/no-save decision. Use `aictx suggest --after-task \"<task>\" --json` when useful, then save durable project knowledge through the intent-first API:",
  "- Default CLI: `aictx remember --stdin`",
  '- MCP equivalent when available: `remember_memory({ task, memories, updates, stale, supersede, relations })`',
  "",
  "Use `aictx save --stdin` or `save_memory_patch({ patch })` only for advanced structured patch writes. Saved memory is active immediately after Aictx validates and writes it.",
  "",
  "Use `aictx wiki ingest --stdin` for source-backed syntheses with raw-source `origin` metadata, `aictx wiki file --stdin` for useful query results, `aictx wiki lint` for wiki-language audit findings, and `aictx wiki log` for chronological event history. These wiki workflows are CLI-only in v1.",
  "",
  "Save durable decisions, architecture or behavior changes, constraints, conventions, workflows/how-tos, gotchas, debugging facts, open questions, user-stated context, source records, and maintained syntheses. Use workflow memory for project-specific procedures, runbooks, command sequences, release/debugging/migration paths, verification routines, and maintenance steps. Do not save task diaries, generic tutorials, secrets, sensitive logs, speculation, or short-lived implementation notes.",
  "",
  "Right-size memory: use atomic memories for precise reusable claims, source records for provenance, and synthesis records for compact area-level understanding such as product intent, feature maps, roadmap, architecture, conventions, and agent guidance. Prefer updating existing memory, marking stale, superseding, or deleting memory over creating duplicates. Save nothing when there is no durable future value.",
  "",
  "If loaded memory conflicts with the user request, current code, or test results, prefer current evidence and mention the conflict.",
  "",
  "Before finalizing, say whether Aictx memory changed. If it changed, mention that asynchronous inspection is available through `inspect_memory`, `aictx view`, `aictx diff`, Git tools, or MCP `diff_memory` when available.",
  AGENT_GUIDANCE_END_MARKER
].join("\n")}\n`;

export interface InitStorageOptions extends GitWrapperOptions {
  cwd: string;
  clock?: Clock;
  agentGuidance?: boolean;
  force?: boolean;
  allowTrackedAictxDeletions?: boolean;
}

interface DirtyInitOptions extends GitWrapperOptions {
  allowTrackedAictxDeletions?: boolean;
}

export type AgentGuidanceTargetStatus = "created" | "updated" | "unchanged" | "skipped";

export interface AgentGuidanceTargetResult {
  path: string;
  status: AgentGuidanceTargetStatus;
}

export interface AgentGuidanceData {
  enabled: boolean;
  targets: AgentGuidanceTargetResult[];
  optional_skills: string[];
}

export interface InitStorageData {
  created: boolean;
  files_created: string[];
  gitignore_updated: boolean;
  git_available: boolean;
  index_built: boolean;
  agent_guidance: AgentGuidanceData;
  next_steps: string[];
}

export interface InitStorageSuccess {
  paths: ProjectPaths;
  data: InitStorageData;
}

interface InitialMemoryObject {
  sidecarPath: string;
  bodyPath: string;
  body: string;
  sidecar: MemoryObjectSidecar;
}

interface InitialMemoryRelation {
  path: string;
  relation: MemoryRelation;
}

export function buildInitialStoragePreview(options: {
  paths: ProjectPaths;
  clock?: Clock;
}): CanonicalStorageSnapshot {
  const clock = options.clock ?? systemClock;
  const projectSlug = slugify(basename(options.paths.projectRoot), { fallback: "project" });
  const projectName = humanizeSlug(projectSlug);
  const projectId = `project.${projectSlug}`;
  const timestamp = clock.nowIso();

  return {
    projectRoot: options.paths.projectRoot,
    aictxRoot: options.paths.aictxRoot,
    config: buildInitialConfig(projectId, projectName),
    objects: buildInitialObjects({ projectId, projectName, timestamp }).map((object) => ({
      path: `.aictx/${object.sidecarPath}`,
      bodyPath: `.aictx/${object.bodyPath}`,
      sidecar: object.sidecar,
      body: object.body
    })),
    relations: buildInitialRelations({ projectId, timestamp }).map((relation) => ({
      path: `.aictx/${relation.path}`,
      relation: relation.relation
    })),
    events: []
  };
}

export async function initializeStorage(
  options: InitStorageOptions
): Promise<Result<InitStorageSuccess>> {
  const paths = await resolveProjectPaths({
    cwd: options.cwd,
    mode: "init",
    runner: options.runner
  });

  if (!paths.ok) {
    return paths;
  }

  const clock = options.clock ?? systemClock;

  return withProjectLock(
    {
      aictxRoot: paths.data.aictxRoot,
      operation: "init",
      clock,
      createAictxRoot: true
    },
    async () => initializeStorageWithLock(paths.data, clock, options)
  );
}

async function initializeStorageWithLock(
  paths: ProjectPaths,
  clock: Clock,
  options: InitStorageOptions
): Promise<Result<InitStorageSuccess>> {
  if (options.force === true) {
    const resetResult = await resetAictxRootContentsExceptLock(paths.aictxRoot);

    if (!resetResult.ok) {
      return resetResult;
    }

    return createInitialStorage(paths, clock, options);
  }

  if (await isFile(join(paths.aictxRoot, "config.json"))) {
    return existingStorageResult(paths, options);
  }

  const dirtyResult = await rejectTrackedDirtyAictxInit(paths, options);

  if (!dirtyResult.ok) {
    return dirtyResult;
  }

  return createInitialStorage(paths, clock, options);
}

async function createInitialStorage(
  paths: ProjectPaths,
  clock: Clock,
  options: InitStorageOptions
): Promise<Result<InitStorageSuccess>> {
  const projectSlug = slugify(basename(paths.projectRoot), { fallback: "project" });
  const projectName = humanizeSlug(projectSlug);
  const projectId = `project.${projectSlug}`;
  const timestamp = clock.nowIso();
  const filesCreated: string[] = [];

  const directoryResult = await createStorageDirectories(paths.projectRoot);

  if (!directoryResult.ok) {
    return directoryResult;
  }

  const writeConfigResult = await writeConfig(paths.projectRoot, projectId, projectName);

  if (!writeConfigResult.ok) {
    return writeConfigResult;
  }
  filesCreated.push(".aictx/config.json");

  const schemaResult = await writeSchemas(paths.projectRoot);

  if (!schemaResult.ok) {
    return schemaResult;
  }
  filesCreated.push(...schemaResult.data);

  const objectResult = await writeInitialObjects(paths.projectRoot, {
    projectId,
    projectName,
    timestamp
  });

  if (!objectResult.ok) {
    return objectResult;
  }
  filesCreated.push(...objectResult.data);

  const relationResult = await writeInitialRelations(paths.projectRoot, {
    projectId,
    timestamp
  });

  if (!relationResult.ok) {
    return relationResult;
  }
  filesCreated.push(...relationResult.data);

  const eventsResult = await writeTextAtomic(paths.projectRoot, ".aictx/events.jsonl", "");

  if (!eventsResult.ok) {
    return eventsResult;
  }
  filesCreated.push(".aictx/events.jsonl");

  const gitignoreResult = paths.git.available
    ? await updateGitignore(paths.projectRoot)
    : ok({ updated: false, fileCreated: false });

  if (!gitignoreResult.ok) {
    return gitignoreResult;
  }

  if (gitignoreResult.data.fileCreated) {
    filesCreated.push(".gitignore");
  }

  const validation = await validateProjectForInit(paths, options);

  if (!validation.ok) {
    return validation;
  }

  if (!validation.data.valid) {
    return err(
      aictxError("AICtxAlreadyInitializedInvalid", "Created Aictx storage is invalid.", {
        issues: validation.data.errors.map((issue) => ({
          code: issue.code,
          message: issue.message,
          path: issue.path,
          field: issue.field
        }))
      })
    );
  }

  const guidanceResult = await installAgentGuidance(
    paths.projectRoot,
    options.agentGuidance !== false
  );

  if (!guidanceResult.ok) {
    return guidanceResult;
  }
  filesCreated.push(...guidanceResult.data.filesCreated);

  return ok(
    {
      paths,
      data: {
        created: true,
        files_created: filesCreated,
        gitignore_updated: gitignoreResult.data.updated,
        git_available: paths.git.available,
        index_built: false,
        agent_guidance: guidanceResult.data.agentGuidance,
        next_steps: nextSteps(guidanceResult.data.agentGuidance)
      }
    },
    [...guidanceResult.warnings, INDEX_UNAVAILABLE_WARNING]
  );
}

async function existingStorageResult(
  paths: ProjectPaths,
  options: InitStorageOptions
): Promise<Result<InitStorageSuccess>> {
  const validation = await validateProjectForInit(paths, options);

  if (!validation.ok) {
    return validation;
  }

  if (!validation.data.valid) {
    const dirtyResult = await rejectTrackedDirtyAictxInit(paths, options);

    if (!dirtyResult.ok) {
      return dirtyResult;
    }

    return err(
      aictxError("AICtxAlreadyInitializedInvalid", "Aictx is already initialized but invalid.", {
        issues: validation.data.errors.map((issue) => ({
          code: issue.code,
          message: issue.message,
          path: issue.path,
          field: issue.field
        }))
      })
    );
  }

  const guidanceResult = await installAgentGuidance(
    paths.projectRoot,
    options.agentGuidance !== false
  );

  if (!guidanceResult.ok) {
    return guidanceResult;
  }

  return ok(
    {
      paths,
      data: {
        created: false,
        files_created: guidanceResult.data.filesCreated,
        gitignore_updated: false,
        git_available: paths.git.available,
        index_built: false,
        agent_guidance: guidanceResult.data.agentGuidance,
        next_steps: nextSteps(guidanceResult.data.agentGuidance)
      }
    },
    [
      ALREADY_INITIALIZED_WARNING,
      ...guidanceResult.warnings,
      INDEX_UNAVAILABLE_WARNING
    ]
  );
}

async function rejectTrackedDirtyAictxInit(
  paths: ProjectPaths,
  options: DirtyInitOptions
): Promise<Result<void>> {
  if (!paths.git.available) {
    return ok(undefined);
  }

  const dirtyFiles = await getTrackedAictxDirtyFiles(paths.projectRoot, options);

  if (!dirtyFiles.ok) {
    return dirtyFiles;
  }

  if (dirtyFiles.data.files.length === 0) {
    return ok(undefined);
  }

  if (options.allowTrackedAictxDeletions === true) {
    const allDeleted = await areAllFilesMissing(paths.projectRoot, dirtyFiles.data.files);

    if (!allDeleted.ok) {
      return allDeleted;
    }

    if (allDeleted.data) {
      return ok(undefined);
    }
  }

  return err(
    aictxError(
      "AICtxDirtyMemory",
      "Aictx init would overwrite dirty tracked Aictx memory files. Commit, restore, remove, or rerun with --force to discard existing Aictx state.",
      {
        dirty_files: dirtyFiles.data.files,
        force_hint: "Run `aictx init --force` only if you intend to discard existing Aictx memory state."
      }
    )
  );
}

async function areAllFilesMissing(
  projectRoot: string,
  files: readonly string[]
): Promise<Result<boolean>> {
  for (const file of files) {
    try {
      await lstat(join(projectRoot, file));
      return ok(false);
    } catch (error) {
      if (errorCode(error) === "ENOENT") {
        continue;
      }

      return err(
        aictxError("AICtxValidationFailed", "Aictx dirty file state could not be checked.", {
          path: file,
          message: messageFromUnknown(error)
        })
      );
    }
  }

  return ok(true);
}

async function resetAictxRootContentsExceptLock(aictxRoot: string): Promise<Result<void>> {
  let entries: string[];

  try {
    entries = await readdir(aictxRoot);
  } catch (error) {
    return err(
      aictxError("AICtxValidationFailed", "Aictx root could not be read for reset.", {
        aictxRoot,
        message: messageFromUnknown(error)
      })
    );
  }

  try {
    await Promise.all(
      entries
        .filter((entry) => entry !== ".lock")
        .map((entry) => rm(join(aictxRoot, entry), { recursive: true, force: true }))
    );

    return ok(undefined);
  } catch (error) {
    return err(
      aictxError("AICtxValidationFailed", "Aictx root could not be reset.", {
        aictxRoot,
        message: messageFromUnknown(error)
      })
    );
  }
}

async function validateProjectForInit(
  paths: ProjectPaths,
  options: GitWrapperOptions
): Promise<Result<ProjectValidationResult>> {
  const validationOptions = await getValidationOptions(paths, options);

  if (!validationOptions.ok) {
    return validationOptions;
  }

  return ok(await validateProject(paths.projectRoot, validationOptions.data));
}

async function getValidationOptions(
  paths: ProjectPaths,
  options: GitWrapperOptions
): Promise<Result<ValidateProjectOptions>> {
  if (!paths.git.available) {
    return ok({
      git: {
        available: false,
        branch: null
      }
    });
  }

  const branch = await getCurrentGitBranch(paths.projectRoot, options);

  if (!branch.ok) {
    return branch;
  }

  return ok({
    git: {
      available: true,
      branch: branch.data
    } satisfies Pick<GitState, "available" | "branch">
  });
}

async function createStorageDirectories(projectRoot: string): Promise<Result<void>> {
  const directories = [
    ".aictx/memory/decisions",
    ".aictx/memory/constraints",
    ".aictx/memory/questions",
    ".aictx/memory/facts",
    ".aictx/memory/gotchas",
    ".aictx/memory/workflows",
    ".aictx/memory/notes",
    ".aictx/memory/concepts",
    ".aictx/memory/sources",
    ".aictx/memory/syntheses",
    ".aictx/relations",
    ".aictx/schema",
    ".aictx/index",
    ".aictx/context"
  ];

  try {
    await Promise.all(
      directories.map((directory) => mkdir(join(projectRoot, directory), { recursive: true }))
    );
    return ok(undefined);
  } catch (error) {
    return err(
      aictxError("AICtxValidationFailed", "Aictx storage directories could not be created.", {
        message: messageFromUnknown(error)
      })
    );
  }
}

async function writeConfig(
  projectRoot: string,
  projectId: string,
  projectName: string
): Promise<Result<void>> {
  return writeJsonAtomic(
    projectRoot,
    ".aictx/config.json",
    configToJson(buildInitialConfig(projectId, projectName))
  );
}

function buildInitialConfig(projectId: string, projectName: string): AictxConfig {
  return {
    version: 4,
    project: {
      id: projectId,
      name: projectName
    },
    memory: {
      defaultTokenBudget: 6000,
      autoIndex: true,
      saveContextPacks: false
    },
    git: {
      trackContextPacks: false
    }
  };
}

async function writeSchemas(projectRoot: string): Promise<Result<string[]>> {
  const created: string[] = [];

  for (const schemaFile of Object.values(SCHEMA_FILES)) {
    const source = new URL(`../schemas/${schemaFile}`, import.meta.url);
    const target = `.aictx/schema/${schemaFile}`;

    try {
      const schema = JSON.parse(await readFile(source, "utf8")) as unknown;

      if (!isJsonValue(schema)) {
        return err(
          aictxError("AICtxValidationFailed", "Bundled schema is not a JSON value.", {
            schema: schemaFile
          })
        );
      }

      const written = await writeJsonAtomic(projectRoot, target, schema);

      if (!written.ok) {
        return written;
      }

      created.push(target);
    } catch (error) {
      return err(
        aictxError("AICtxValidationFailed", "Bundled schema could not be copied.", {
          schema: schemaFile,
          message: messageFromUnknown(error)
        })
      );
    }
  }

  return ok(created);
}

async function writeInitialObjects(
  projectRoot: string,
  options: {
    projectId: string;
    projectName: string;
    timestamp: IsoDateTime;
  }
): Promise<Result<string[]>> {
  const objects = buildInitialObjects(options);
  const created: string[] = [];

  for (const object of objects) {
    const bodyResult = await writeMarkdownAtomic(
      projectRoot,
      `.aictx/${object.bodyPath}`,
      object.body
    );

    if (!bodyResult.ok) {
      return bodyResult;
    }

    created.push(`.aictx/${object.bodyPath}`);

    const sidecarResult = await writeJsonAtomic(
      projectRoot,
      `.aictx/${object.sidecarPath}`,
      objectSidecarToJson(object.sidecar)
    );

    if (!sidecarResult.ok) {
      return sidecarResult;
    }

    created.push(`.aictx/${object.sidecarPath}`);
  }

  return ok(created);
}

async function writeInitialRelations(
  projectRoot: string,
  options: {
    projectId: string;
    timestamp: IsoDateTime;
  }
): Promise<Result<string[]>> {
  const relations = buildInitialRelations(options);
  const created: string[] = [];

  for (const relation of relations) {
    const written = await writeJsonAtomic(
      projectRoot,
      `.aictx/${relation.path}`,
      relationToJson(relation.relation)
    );

    if (!written.ok) {
      return written;
    }

    created.push(`.aictx/${relation.path}`);
  }

  return ok(created);
}

function buildInitialObjects(options: {
  projectId: string;
  projectName: string;
  timestamp: IsoDateTime;
}): InitialMemoryObject[] {
  return [
    buildInitialObject({
      id: options.projectId,
      type: "project",
      title: options.projectName,
      bodyPath: "memory/project.md",
      sidecarPath: "memory/project.json",
      body: `# ${options.projectName}\n\nProject-level memory for ${options.projectName}.\n`,
      projectId: options.projectId,
      timestamp: options.timestamp
    }),
    buildInitialObject({
      id: "architecture.current",
      type: "architecture",
      title: "Current Architecture",
      bodyPath: "memory/architecture.md",
      sidecarPath: "memory/architecture.json",
      body: "# Current Architecture\n\nArchitecture memory starts here.\n",
      projectId: options.projectId,
      timestamp: options.timestamp
    })
  ];
}

function buildInitialObject(options: {
  id: string;
  type: MemoryObjectSidecar["type"];
  title: string;
  bodyPath: string;
  sidecarPath: string;
  body: string;
  projectId: string;
  timestamp: IsoDateTime;
}): InitialMemoryObject {
  const sidecarWithoutHash = {
    id: options.id,
    type: options.type,
    status: "active",
    title: options.title,
    body_path: options.bodyPath,
    scope: {
      kind: "project",
      project: options.projectId,
      branch: null,
      task: null
    },
    tags: [],
    facets: {
      category: facetCategoryForInitialType(options.type)
    },
    evidence: [],
    source: {
      kind: "system"
    },
    created_at: options.timestamp,
    updated_at: options.timestamp
  } satisfies Omit<MemoryObjectSidecar, "content_hash">;

  const contentHash: Sha256Hash = computeObjectContentHash(sidecarWithoutHash, options.body);
  const sidecar: MemoryObjectSidecar = {
    ...sidecarWithoutHash,
    content_hash: contentHash
  };

  return {
    sidecarPath: options.sidecarPath,
    bodyPath: options.bodyPath,
    body: options.body,
    sidecar
  };
}

function buildInitialRelations(options: {
  projectId: string;
  timestamp: IsoDateTime;
}): InitialMemoryRelation[] {
  const id = generateInitialProjectArchitectureRelationId(options.projectId);
  const relationWithoutHash: Omit<MemoryRelation, "content_hash"> = {
    id,
    from: options.projectId,
    predicate: "related_to",
    to: "architecture.current",
    status: "active",
    confidence: "high",
    evidence: [
      { kind: "memory", id: options.projectId },
      { kind: "memory", id: "architecture.current" }
    ],
    created_at: options.timestamp,
    updated_at: options.timestamp
  };
  const relation: MemoryRelation = {
    ...relationWithoutHash,
    content_hash: computeRelationContentHash(relationToJson(relationWithoutHash))
  };

  return [
    {
      path: relationPath(id),
      relation
    }
  ];
}

function generateInitialProjectArchitectureRelationId(projectId: string): string {
  return generateRelationId({
    from: projectId,
    predicate: "related_to",
    to: "architecture.current"
  });
}

function relationPath(id: string): string {
  return `relations/${id.slice("rel.".length)}.json`;
}

function facetCategoryForInitialType(
  type: MemoryObjectSidecar["type"]
): NonNullable<MemoryObjectSidecar["facets"]>["category"] {
  switch (type) {
    case "project":
      return "project-description";
    case "architecture":
      return "architecture";
    case "source":
      return "source";
    case "synthesis":
      return "concept";
    case "decision":
      return "decision-rationale";
    case "constraint":
      return "convention";
    case "question":
      return "open-question";
    case "fact":
      return "debugging-fact";
    case "gotcha":
      return "gotcha";
    case "workflow":
      return "workflow";
    case "concept":
      return "concept";
    case "note":
      return "concept";
  }
}

function relationToJson(
  relation: Omit<MemoryRelation, "content_hash"> | MemoryRelation
): Record<string, JsonValue> {
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

  if ("content_hash" in relation) {
    json.content_hash = relation.content_hash;
  }

  return json;
}

async function updateGitignore(
  projectRoot: string
): Promise<Result<{ updated: boolean; fileCreated: boolean }>> {
  const gitignorePath = join(projectRoot, ".gitignore");
  const existing = await readFile(gitignorePath, "utf8").catch((error: unknown) => {
    if (errorCode(error) === "ENOENT") {
      return null;
    }

    throw error;
  });

  const existingLines = existing === null ? [] : existing.split(/\r\n|\n|\r/);
  const existingEntries = new Set(existingLines.map((line) => line.trim()));
  const missingEntries = GENERATED_GITIGNORE_ENTRIES.filter(
    (entry) => !existingEntries.has(entry)
  );

  if (missingEntries.length === 0) {
    return ok({ updated: false, fileCreated: false });
  }

  const base = existing === null ? "" : existing.replace(/\r\n?/g, "\n").replace(/\n*$/, "\n");
  const separator = base === "" ? "" : "\n";
  const contents = `${base}${separator}${missingEntries.join("\n")}\n`;
  const written = await writeTextAtomic(projectRoot, ".gitignore", contents);

  if (!written.ok) {
    return written;
  }

  return ok({ updated: true, fileCreated: existing === null });
}

async function installAgentGuidance(
  projectRoot: string,
  enabled: boolean
): Promise<Result<{ agentGuidance: AgentGuidanceData; filesCreated: string[] }>> {
  if (!enabled) {
    return ok({
      agentGuidance: {
        enabled: false,
        targets: AGENT_GUIDANCE_TARGETS.map((path) => ({ path, status: "skipped" })),
        optional_skills: [...OPTIONAL_AGENT_SKILLS]
      },
      filesCreated: []
    });
  }

  const targets: AgentGuidanceTargetResult[] = [];
  const filesCreated: string[] = [];
  const warnings: string[] = [];

  for (const path of AGENT_GUIDANCE_TARGETS) {
    const result = await installAgentGuidanceTarget(projectRoot, path);

    if (!result.ok) {
      return result;
    }

    targets.push({
      path,
      status: result.data.status
    });

    if (result.data.fileCreated) {
      filesCreated.push(path);
    }

    warnings.push(...result.warnings);
  }

  return ok(
    {
      agentGuidance: {
        enabled: true,
        targets,
        optional_skills: [...OPTIONAL_AGENT_SKILLS]
      },
      filesCreated
    },
    warnings
  );
}

async function installAgentGuidanceTarget(
  projectRoot: string,
  path: string
): Promise<Result<{ status: AgentGuidanceTargetStatus; fileCreated: boolean }>> {
  const filePath = join(projectRoot, path);
  const existing = await readFile(filePath, "utf8").catch((error: unknown) => {
    if (errorCode(error) === "ENOENT") {
      return null;
    }

    throw error;
  });

  if (existing === null) {
    const written = await writeTextAtomic(projectRoot, path, AGENT_GUIDANCE_BLOCK);

    if (!written.ok) {
      return written;
    }

    return ok({ status: "created", fileCreated: true });
  }

  const normalized = normalizeLineEndingsToLf(existing);
  const planned = applyAgentGuidanceBlock(normalized);

  if (planned.status === "skipped") {
    return ok(
      {
        status: "skipped",
        fileCreated: false
      },
      [`Agent guidance in ${path} was left unchanged because Aictx markers are missing or ambiguous.`]
    );
  }

  if (planned.contents === normalized) {
    return ok({ status: "unchanged", fileCreated: false });
  }

  const written = await writeTextAtomic(projectRoot, path, planned.contents);

  if (!written.ok) {
    return written;
  }

  return ok({ status: planned.status, fileCreated: false });
}

function applyAgentGuidanceBlock(
  contents: string
): { status: "updated"; contents: string } | { status: "skipped" } {
  const startCount = countOccurrences(contents, AGENT_GUIDANCE_START_MARKER);
  const endCount = countOccurrences(contents, AGENT_GUIDANCE_END_MARKER);

  if (startCount === 0 && endCount === 0) {
    if (containsUnmarkedAictxGuidance(contents)) {
      return { status: "skipped" };
    }

    const base = contents.replace(/\n*$/, "");
    const separator = base === "" ? "" : "\n\n";

    return {
      status: "updated",
      contents: `${base}${separator}${AGENT_GUIDANCE_BLOCK}`
    };
  }

  const startIndex = contents.indexOf(AGENT_GUIDANCE_START_MARKER);
  const endIndex = contents.indexOf(AGENT_GUIDANCE_END_MARKER);

  if (startCount !== 1 || endCount !== 1 || startIndex > endIndex) {
    return { status: "skipped" };
  }

  const replaceEnd = endIndex + AGENT_GUIDANCE_END_MARKER.length;
  const hasTrailingBlockNewline = contents.slice(replaceEnd, replaceEnd + 1) === "\n";
  const suffixStart = hasTrailingBlockNewline ? replaceEnd + 1 : replaceEnd;

  return {
    status: "updated",
    contents: `${contents.slice(0, startIndex)}${AGENT_GUIDANCE_BLOCK}${contents.slice(suffixStart)}`
  };
}

function containsUnmarkedAictxGuidance(contents: string): boolean {
  return /\bAictx\b/i.test(contents) && /\b(load_memory|remember_memory|save_memory_patch|aictx load|aictx remember|aictx save)\b/i.test(contents);
}

function countOccurrences(value: string, search: string): number {
  if (search === "") {
    return 0;
  }

  return value.split(search).length - 1;
}

function nextSteps(agentGuidance: AgentGuidanceData): string[] {
  return [
    agentGuidanceNextStep(agentGuidance),
    "`aictx init` creates empty storage and linked starter placeholders only. To seed useful first-run memory, run `aictx setup`; use `aictx setup --dry-run` to preview the conservative bootstrap patch without writing, or `aictx setup --no-view` when scripts should skip viewer startup. For manual patch inspection, run `aictx suggest --bootstrap --patch > bootstrap-memory.json`, `aictx patch review bootstrap-memory.json`, `aictx save --file bootstrap-memory.json`, and `aictx check`.",
    "`aictx init` does not start MCP; agents should use `aictx load` and `aictx remember --stdin` by default. Configure agent clients that support MCP to launch `aictx-mcp` only when you want MCP equivalents such as `load_memory`, `inspect_memory`, `remember_memory`, and `save_memory_patch`. A globally launched MCP server can serve this project when tool calls include this project root as `project_root`. If `aictx` is not on `PATH`, use the project package-manager form such as `pnpm exec aictx`, `npm exec aictx`, or `./node_modules/.bin/aictx`, but treat package-manager and local-binary fallbacks as version-sensitive and update stale local installs before trusting schema errors.",
    "Saved memory is active immediately after Aictx validates and writes it. Inspect memory asynchronously with `inspect_memory`, `aictx view`, `aictx diff`, Git tools, or MCP `diff_memory` when available.",
    "Optional bundled guidance is available under `integrations/` for Codex, Claude Code, Cursor, Cline, and generic Markdown instructions."
  ];
}

function agentGuidanceNextStep(agentGuidance: AgentGuidanceData): string {
  if (!agentGuidance.enabled) {
    return "Agent guidance was skipped; configure `AGENTS.md` and `CLAUDE.md` manually if you want agents to load and save Aictx memory.";
  }

  const activeTargets = agentGuidance.targets
    .filter((target) => target.status !== "skipped")
    .map((target) => `\`${target.path}\``);

  if (activeTargets.length > 0) {
    return `Agents are now instructed through ${formatList(activeTargets)} to load and save Aictx memory.`;
  }

  return "Agent guidance files need manual review because Aictx could not update any target automatically.";
}

function formatList(items: readonly string[]): string {
  if (items.length <= 1) {
    return items.join("");
  }

  const last = items[items.length - 1] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${last}`;
}

function humanizeSlug(slug: string): string {
  return slug
    .split("-")
    .filter((part) => part.length > 0)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await lstat(path)).isFile();
  } catch {
    return false;
  }
}

function configToJson(config: AictxConfig): JsonValue {
  return {
    version: config.version,
    project: config.project,
    memory: config.memory,
    git: config.git
  };
}

function objectSidecarToJson(sidecar: MemoryObjectSidecar): JsonValue {
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
    tags: sidecar.tags ?? [],
    source: {
      kind: sidecar.source?.kind ?? "system"
    },
    content_hash: sidecar.content_hash,
    created_at: sidecar.created_at,
    updated_at: sidecar.updated_at
  };

  if (sidecar.facets !== undefined) {
    json.facets = {
      category: sidecar.facets.category,
      ...(sidecar.facets.applies_to === undefined
        ? {}
        : { applies_to: [...sidecar.facets.applies_to] }),
      ...(sidecar.facets.load_modes === undefined
        ? {}
        : { load_modes: [...sidecar.facets.load_modes] })
    };
  }

  if (sidecar.evidence !== undefined) {
    json.evidence = sidecar.evidence.map((item) => ({
      kind: item.kind,
      id: item.id
    }));
  }

  if (sidecar.origin !== undefined) {
    json.origin = {
      kind: sidecar.origin.kind,
      locator: sidecar.origin.locator,
      ...(sidecar.origin.captured_at === undefined
        ? {}
        : { captured_at: sidecar.origin.captured_at }),
      ...(sidecar.origin.digest === undefined ? {} : { digest: sidecar.origin.digest }),
      ...(sidecar.origin.media_type === undefined
        ? {}
        : { media_type: sidecar.origin.media_type })
    };
  }

  return json;
}

function isJsonValue(value: unknown): value is JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }

  if (typeof value === "object") {
    return Object.values(value).every(isJsonValue);
  }

  return false;
}

function errorCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return null;
  }

  const code = error.code;
  return typeof code === "string" ? code : null;
}

function messageFromUnknown(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
