import { lstat, mkdir, readFile } from "node:fs/promises";
import { basename, join } from "node:path";

import type { Clock } from "../core/clock.js";
import { systemClock } from "../core/clock.js";
import { aictxError, type JsonValue } from "../core/errors.js";
import { writeJsonAtomic, writeMarkdownAtomic, writeTextAtomic } from "../core/fs.js";
import { getCurrentGitBranch, type GitWrapperOptions } from "../core/git.js";
import { slugify } from "../core/ids.js";
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
import { computeObjectContentHash } from "./hashes.js";
import type { AictxConfig, MemoryObjectSidecar } from "./objects.js";

const GENERATED_GITIGNORE_ENTRIES = [".aictx/index/", ".aictx/context/", ".aictx/.lock"] as const;
const INDEX_UNAVAILABLE_WARNING =
  "Initial index was not built because the index module is not available yet.";
const ALREADY_INITIALIZED_WARNING =
  "Aictx is already initialized; existing valid storage was left unchanged.";

export interface InitStorageOptions extends GitWrapperOptions {
  cwd: string;
  clock?: Clock;
}

export interface InitStorageData {
  created: boolean;
  files_created: string[];
  gitignore_updated: boolean;
  git_available: boolean;
  index_built: boolean;
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
  options: GitWrapperOptions
): Promise<Result<InitStorageSuccess>> {
  if (await isFile(join(paths.aictxRoot, "config.json"))) {
    return existingStorageResult(paths, options);
  }

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

  return ok(
    {
      paths,
      data: {
        created: true,
        files_created: filesCreated,
        gitignore_updated: gitignoreResult.data.updated,
        git_available: paths.git.available,
        index_built: false,
        next_steps: nextSteps()
      }
    },
    [INDEX_UNAVAILABLE_WARNING]
  );
}

async function existingStorageResult(
  paths: ProjectPaths,
  options: GitWrapperOptions
): Promise<Result<InitStorageSuccess>> {
  const validation = await validateProjectForInit(paths, options);

  if (!validation.ok) {
    return validation;
  }

  if (!validation.data.valid) {
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

  return ok(
    {
      paths,
      data: {
        created: false,
        files_created: [],
        gitignore_updated: false,
        git_available: paths.git.available,
        index_built: false,
        next_steps: nextSteps()
      }
    },
    [ALREADY_INITIALIZED_WARNING, INDEX_UNAVAILABLE_WARNING]
  );
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
    ".aictx/memory/notes",
    ".aictx/memory/concepts",
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
  const config: AictxConfig = {
    version: 1,
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

  return writeJsonAtomic(projectRoot, ".aictx/config.json", configToJson(config));
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

function nextSteps(): string[] {
  return [
    "Run `aictx load \"your task\"` before a coding task.",
    "Use MCP `save_memory_patch` or `aictx save --stdin` with a structured patch after meaningful work.",
    "Review memory changes in `.aictx/`; in Git projects, use `aictx diff` before committing."
  ];
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
  return {
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
