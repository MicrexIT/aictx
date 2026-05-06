import { createHash } from "node:crypto";
import { constants, realpathSync } from "node:fs";
import { lstat, mkdir, open, readFile, realpath, rename, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

import { systemClock, type Clock } from "../core/clock.js";
import { aictxError, type JsonValue } from "../core/errors.js";
import { stableJsonStringify, writeJsonAtomic } from "../core/fs.js";
import { resolveProjectPaths, type ProjectPaths } from "../core/paths.js";
import { err, ok, type Result } from "../core/result.js";
import type { GitWrapperOptions } from "../core/git.js";
import type { IsoDateTime } from "../core/types.js";
import { readCanonicalStorage } from "../storage/read.js";

export const PROJECT_REGISTRY_VERSION = 1;
export const PROJECT_REGISTRY_FILENAME = "projects.json";
const PROJECT_REGISTRY_LOCK_FILENAME = "projects.lock";

export type ProjectRegistrySource = "auto" | "manual";

export interface ProjectRegistryProject {
  id: string;
  name: string;
}

export interface ProjectRegistryEntry {
  registry_id: string;
  project: ProjectRegistryProject;
  project_root: string;
  aictx_root: string;
  source: ProjectRegistrySource;
  registered_at: IsoDateTime;
  last_seen_at: IsoDateTime;
}

export type ResolvedProjectRegistryEntry = Omit<
  ProjectRegistryEntry,
  "source" | "registered_at" | "last_seen_at"
>;

export interface ProjectRegistry {
  version: typeof PROJECT_REGISTRY_VERSION;
  projects: ProjectRegistryEntry[];
}

export interface ProjectRegistryLocation {
  aictxHome: string;
  registryPath: string;
  lockPath: string;
}

export interface ProjectRegistryOptions extends GitWrapperOptions {
  aictxHome?: string;
  clock?: Clock;
}

export interface ProjectRegistryCwdOptions extends ProjectRegistryOptions {
  cwd: string;
}

export interface ProjectRegistryRemoveOptions extends ProjectRegistryOptions {
  cwd: string;
  identifier: string;
}

export interface ProjectRegistryPruneData {
  projects: ProjectRegistryEntry[];
  removed: ProjectRegistryEntry[];
}

interface RegistryRead {
  registry: ProjectRegistry;
  recovery: RegistryRecovery | null;
}

interface RegistryRecovery {
  reason: string;
  recoveryPath: string;
}

type RegistryMutation<T> = (registry: ProjectRegistry) => Promise<Result<T>> | Result<T>;

export function resolveProjectRegistryLocation(
  options: Pick<ProjectRegistryOptions, "aictxHome"> = {}
): ProjectRegistryLocation {
  const aictxHome = resolve(options.aictxHome ?? process.env.AICTX_HOME ?? join(homedir(), ".aictx"));

  return {
    aictxHome,
    registryPath: join(aictxHome, PROJECT_REGISTRY_FILENAME),
    lockPath: join(aictxHome, PROJECT_REGISTRY_LOCK_FILENAME)
  };
}

export function registryIdForProjectRoot(projectRoot: string): string {
  return `prj_${createHash("sha256").update(canonicalProjectRootSync(projectRoot)).digest("hex").slice(0, 16)}`;
}

export async function readProjectRegistry(
  options: ProjectRegistryOptions = {}
): Promise<Result<{ location: ProjectRegistryLocation; registry: ProjectRegistry }>> {
  const location = resolveProjectRegistryLocation(options);
  const read = await readProjectRegistryFile(location, options.clock ?? systemClock);

  if (!read.ok) {
    return read;
  }

  return ok(
    {
      location,
      registry: read.data.registry
    },
    read.warnings
  );
}

export async function upsertCurrentProjectInRegistry(
  options: ProjectRegistryCwdOptions & { source: ProjectRegistrySource }
): Promise<Result<ProjectRegistryEntry>> {
  const clock = options.clock ?? systemClock;
  const project = await resolveInitializedProject(options);

  if (!project.ok) {
    return project;
  }

  return mutateProjectRegistry(options, async (registry) => {
    const now = clock.nowIso();
    const existingIndex = registry.projects.findIndex(
      (entry) => entry.registry_id === project.data.entry.registry_id
    );

    if (existingIndex === -1) {
      const entry: ProjectRegistryEntry = {
        ...project.data.entry,
        source: options.source,
        registered_at: now,
        last_seen_at: now
      };

      registry.projects.push(entry);
      registry.projects.sort(compareRegistryEntries);
      return ok(entry);
    }

    const existing = registry.projects[existingIndex] as ProjectRegistryEntry;
    const updated: ProjectRegistryEntry = {
      ...existing,
      project: project.data.entry.project,
      project_root: project.data.entry.project_root,
      aictx_root: project.data.entry.aictx_root,
      source: existing.source === "manual" ? "manual" : options.source,
      last_seen_at: now
    };

    registry.projects[existingIndex] = updated;
    registry.projects.sort(compareRegistryEntries);
    return ok(updated);
  });
}

export async function removeProjectFromRegistry(
  options: ProjectRegistryRemoveOptions
): Promise<Result<ProjectRegistryEntry>> {
  return mutateProjectRegistry(options, async (registry) => {
    const matched = await findMatchingEntries(registry.projects, options.identifier, options.cwd);

    if (!matched.ok) {
      return matched;
    }

    if (matched.data.length === 0) {
      return err(
        aictxError("AICtxValidationFailed", "No registered Aictx project matched the identifier.", {
          identifier: options.identifier
        })
      );
    }

    if (matched.data.length > 1) {
      return err(
        aictxError("AICtxValidationFailed", "Multiple registered projects matched the identifier.", {
          identifier: options.identifier,
          matches: matched.data.map((entry) => ({
            registry_id: entry.registry_id,
            project_id: entry.project.id,
            project_root: entry.project_root
          }))
        })
      );
    }

    const removed = matched.data[0];

    if (removed === undefined) {
      return err(
        aictxError("AICtxInternalError", "Project registry match disappeared before removal.")
      );
    }

    registry.projects = registry.projects.filter(
      (entry) => entry.registry_id !== removed.registry_id
    );

    return ok(removed);
  });
}

export async function removeProjectRootFromRegistry(
  options: ProjectRegistryOptions & { projectRoot: string }
): Promise<Result<ProjectRegistryEntry | null>> {
  const projectRoot = await canonicalProjectRoot(options.projectRoot);

  return mutateProjectRegistry(options, (registry) => {
    const removed =
      registry.projects.find((entry) => resolve(entry.project_root) === projectRoot) ?? null;

    if (removed === null) {
      return ok(null);
    }

    registry.projects = registry.projects.filter(
      (entry) => entry.registry_id !== removed.registry_id
    );

    return ok(removed);
  });
}

export async function removeProjectRootsFromRegistry(
  options: ProjectRegistryOptions & { projectRoots: readonly string[] }
): Promise<Result<ProjectRegistryEntry[]>> {
  const projectRoots = new Set(
    await Promise.all(options.projectRoots.map((projectRoot) => canonicalProjectRoot(projectRoot)))
  );

  return mutateProjectRegistry(options, async (registry) => {
    const kept: ProjectRegistryEntry[] = [];
    const removed: ProjectRegistryEntry[] = [];

    for (const entry of registry.projects) {
      const entryProjectRoot = await canonicalProjectRoot(entry.project_root);

      if (projectRoots.has(entryProjectRoot)) {
        removed.push(entry);
      } else {
        kept.push(entry);
      }
    }

    registry.projects = kept;
    return ok(removed);
  });
}

export async function pruneProjectRegistry(
  options: ProjectRegistryOptions = {}
): Promise<Result<ProjectRegistryPruneData>> {
  return mutateProjectRegistry(options, async (registry) => {
    const kept: ProjectRegistryEntry[] = [];
    const removed: ProjectRegistryEntry[] = [];

    for (const entry of registry.projects) {
      const available = await isRegisteredProjectAvailable(entry);

      if (available) {
        kept.push(entry);
      } else {
        removed.push(entry);
      }
    }

    registry.projects = kept;
    return ok({ projects: kept, removed });
  });
}

export async function findRegisteredProject(
  options: ProjectRegistryOptions & { registryId: string }
): Promise<Result<ProjectRegistryEntry | null>> {
  const loaded = await readProjectRegistry(options);

  if (!loaded.ok) {
    return loaded;
  }

  return ok(
    loaded.data.registry.projects.find((entry) => entry.registry_id === options.registryId) ?? null,
    loaded.warnings
  );
}

export async function currentProjectRegistryEntry(
  options: ProjectRegistryCwdOptions
): Promise<Result<ResolvedProjectRegistryEntry | null>> {
  const project = await resolveInitializedProject(options);

  if (!project.ok) {
    if (project.error.code === "AICtxNotInitialized") {
      return ok(null, project.warnings);
    }

    return project;
  }

  return ok(project.data.entry, project.warnings);
}

async function mutateProjectRegistry<T>(
  options: ProjectRegistryOptions,
  mutation: RegistryMutation<T>
): Promise<Result<T>> {
  const location = resolveProjectRegistryLocation(options);
  const clock = options.clock ?? systemClock;

  return withRegistryLock(location, clock, async () => {
    const read = await readProjectRegistryFile(location, clock);

    if (!read.ok) {
      return read;
    }

    const recoveryWarnings = read.data.recovery === null
      ? []
      : await recoverInvalidRegistry(location, read.data.recovery);

    const mutableRegistry: ProjectRegistry = {
      version: PROJECT_REGISTRY_VERSION,
      projects: [...read.data.registry.projects]
    };
    const mutated = await mutation(mutableRegistry);

    if (!mutated.ok) {
      return {
        ...mutated,
        warnings: [...read.warnings, ...recoveryWarnings, ...mutated.warnings]
      };
    }

    const written = await writeProjectRegistryFile(location, {
      version: PROJECT_REGISTRY_VERSION,
      projects: [...mutableRegistry.projects].sort(compareRegistryEntries)
    });

    if (!written.ok) {
      return {
        ...written,
        warnings: [...read.warnings, ...recoveryWarnings, ...written.warnings]
      };
    }

    return ok(mutated.data, [
      ...read.warnings,
      ...recoveryWarnings,
      ...mutated.warnings,
      ...written.warnings
    ]);
  });
}

async function resolveInitializedProject(
  options: ProjectRegistryCwdOptions
): Promise<Result<{ paths: ProjectPaths; entry: ResolvedProjectRegistryEntry }>> {
  const paths = await resolveProjectPaths({
    cwd: options.cwd,
    mode: "require-initialized",
    runner: options.runner
  });

  if (!paths.ok) {
    return paths;
  }

  const storage = await readCanonicalStorage(paths.data.projectRoot);

  if (!storage.ok) {
    return storage;
  }

  const projectRoot = await canonicalProjectRoot(paths.data.projectRoot);
  const aictxRoot = join(projectRoot, ".aictx");

  return ok(
    {
      paths: paths.data,
      entry: {
        registry_id: registryIdForProjectRoot(projectRoot),
        project: {
          id: storage.data.config.project.id,
          name: storage.data.config.project.name
        },
        project_root: projectRoot,
        aictx_root: aictxRoot
      }
    },
    [...paths.warnings, ...storage.warnings]
  );
}

async function readProjectRegistryFile(
  location: ProjectRegistryLocation,
  clock: Clock
): Promise<Result<RegistryRead>> {
  const empty = emptyRegistry();

  try {
    const contents = await readFile(location.registryPath, "utf8");
    const parsed = JSON.parse(contents) as unknown;
    const registry = parseProjectRegistry(parsed);

    if (!registry.ok) {
      return ok(
        {
          registry: empty,
          recovery: {
            reason: registry.error.message,
            recoveryPath: recoveryPathFor(location, clock)
          }
        },
        [`Project registry was invalid and will be recovered on the next write: ${registry.error.message}`]
      );
    }

    return ok({ registry: registry.data, recovery: null });
  } catch (error) {
    if (errorCode(error) === "ENOENT") {
      return ok({ registry: empty, recovery: null });
    }

    if (error instanceof SyntaxError) {
      return ok(
        {
          registry: empty,
          recovery: {
            reason: error.message,
            recoveryPath: recoveryPathFor(location, clock)
          }
        },
        [`Project registry contained invalid JSON and will be recovered on the next write: ${error.message}`]
      );
    }

    return err(
      aictxError("AICtxValidationFailed", "Project registry could not be read.", {
        path: location.registryPath,
        message: messageFromUnknown(error)
      })
    );
  }
}

async function writeProjectRegistryFile(
  location: ProjectRegistryLocation,
  registry: ProjectRegistry
): Promise<Result<void>> {
  return writeJsonAtomic(location.aictxHome, PROJECT_REGISTRY_FILENAME, registryToJson(registry));
}

async function recoverInvalidRegistry(
  location: ProjectRegistryLocation,
  recovery: RegistryRecovery
): Promise<string[]> {
  try {
    await rename(location.registryPath, recovery.recoveryPath);
    return [`Recovered invalid project registry to ${recovery.recoveryPath}: ${recovery.reason}`];
  } catch (error) {
    if (errorCode(error) === "ENOENT") {
      return [];
    }

    return [`Project registry recovery failed before rewrite: ${messageFromUnknown(error)}`];
  }
}

async function withRegistryLock<T>(
  location: ProjectRegistryLocation,
  clock: Clock,
  callback: () => Promise<Result<T>>
): Promise<Result<T>> {
  try {
    await mkdir(location.aictxHome, { recursive: true });
  } catch (error) {
    return err(
      aictxError("AICtxValidationFailed", "Aictx home could not be created for the project registry.", {
        aictxHome: location.aictxHome,
        message: messageFromUnknown(error)
      })
    );
  }

  let locked = false;

  try {
    const file = await open(location.lockPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
    locked = true;

    try {
      await file.writeFile(stableJsonStringify({
        operation: "project-registry",
        pid: process.pid,
        created_at: clock.nowIso()
      }), "utf8");
      await file.sync();
    } finally {
      await file.close();
    }
  } catch (error) {
    if (locked) {
      await rm(location.lockPath, { force: true });
    }

    if (errorCode(error) === "EEXIST") {
      return err(
        aictxError("AICtxLockBusy", "Project registry lock is already held.", {
          lockPath: location.lockPath
        })
      );
    }

    return err(
      aictxError("AICtxValidationFailed", "Project registry lock could not be acquired.", {
        lockPath: location.lockPath,
        message: messageFromUnknown(error)
      })
    );
  }

  let result: Result<T> | undefined;
  let thrown: unknown;

  try {
    result = await callback();
  } catch (error) {
    thrown = error;
  }

  await rm(location.lockPath, { force: true }).catch(() => undefined);

  if (thrown !== undefined) {
    throw thrown;
  }

  return result ?? err(aictxError("AICtxInternalError", "Project registry callback returned no result."));
}

function emptyRegistry(): ProjectRegistry {
  return {
    version: PROJECT_REGISTRY_VERSION,
    projects: []
  };
}

function parseProjectRegistry(value: unknown): Result<ProjectRegistry> {
  if (!isRecord(value)) {
    return invalidRegistry("Project registry must be a JSON object.");
  }

  if (value.version !== PROJECT_REGISTRY_VERSION) {
    return invalidRegistry("Project registry version is unsupported.");
  }

  if (!Array.isArray(value.projects)) {
    return invalidRegistry("Project registry projects must be an array.");
  }

  const projects: ProjectRegistryEntry[] = [];

  for (const [index, project] of value.projects.entries()) {
    const parsed = parseProjectRegistryEntry(project, index);

    if (!parsed.ok) {
      return parsed;
    }

    projects.push(parsed.data);
  }

  return ok({
    version: PROJECT_REGISTRY_VERSION,
    projects: projects.sort(compareRegistryEntries)
  });
}

function parseProjectRegistryEntry(value: unknown, index: number): Result<ProjectRegistryEntry> {
  if (!isRecord(value)) {
    return invalidRegistry(`Project registry entry ${index} must be a JSON object.`);
  }

  if (!isRecord(value.project)) {
    return invalidRegistry(`Project registry entry ${index} project must be a JSON object.`);
  }

  const registryId = value.registry_id;
  const projectId = value.project.id;
  const projectName = value.project.name;
  const projectRoot = value.project_root;
  const aictxRoot = value.aictx_root;
  const sourceValue = value.source;
  const registeredAt = value.registered_at;
  const lastSeenAt = value.last_seen_at;
  if (typeof registryId !== "string" || registryId.trim() === "") {
    return invalidRegistry(`Project registry entry ${index} field registry_id must be a non-empty string.`);
  }

  if (typeof projectId !== "string" || projectId.trim() === "") {
    return invalidRegistry(`Project registry entry ${index} field project_id must be a non-empty string.`);
  }

  if (typeof projectName !== "string" || projectName.trim() === "") {
    return invalidRegistry(`Project registry entry ${index} field project_name must be a non-empty string.`);
  }

  if (typeof projectRoot !== "string" || projectRoot.trim() === "") {
    return invalidRegistry(`Project registry entry ${index} field project_root must be a non-empty string.`);
  }

  if (typeof aictxRoot !== "string" || aictxRoot.trim() === "") {
    return invalidRegistry(`Project registry entry ${index} field aictx_root must be a non-empty string.`);
  }

  if (typeof registeredAt !== "string" || registeredAt.trim() === "") {
    return invalidRegistry(`Project registry entry ${index} field registered_at must be a non-empty string.`);
  }

  if (typeof lastSeenAt !== "string" || lastSeenAt.trim() === "") {
    return invalidRegistry(`Project registry entry ${index} field last_seen_at must be a non-empty string.`);
  }

  if (sourceValue !== "auto" && sourceValue !== "manual") {
    return invalidRegistry(`Project registry entry ${index} source is unsupported.`);
  }
  const source = sourceValue;

  return ok({
    registry_id: registryId,
    project: {
      id: projectId,
      name: projectName
    },
    project_root: resolve(projectRoot),
    aictx_root: resolve(aictxRoot),
    source,
    registered_at: registeredAt,
    last_seen_at: lastSeenAt
  });
}

function registryToJson(registry: ProjectRegistry): JsonValue {
  return {
    version: registry.version,
    projects: registry.projects.map((entry) => ({
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
    }))
  };
}

async function findMatchingEntries(
  entries: readonly ProjectRegistryEntry[],
  identifier: string,
  cwd: string
): Promise<Result<ProjectRegistryEntry[]>> {
  const pathCandidate = await identifierPathCandidate(identifier, cwd);
  const matches = entries.filter((entry) =>
    entry.registry_id === identifier ||
    entry.project.id === identifier ||
    (pathCandidate !== null && resolve(entry.project_root) === pathCandidate)
  );

  return ok(matches);
}

async function identifierPathCandidate(identifier: string, cwd: string): Promise<string | null> {
  const shouldTreatAsPath =
    isAbsolute(identifier) ||
    identifier.startsWith(".") ||
    identifier.includes("/") ||
    identifier.includes("\\");

  if (!shouldTreatAsPath) {
    return null;
  }

  return canonicalProjectRoot(resolve(cwd, identifier));
}

async function isRegisteredProjectAvailable(entry: ProjectRegistryEntry): Promise<boolean> {
  const configPath = join(entry.project_root, ".aictx", "config.json");

  try {
    const stat = await lstat(configPath);

    if (!stat.isFile()) {
      return false;
    }
  } catch {
    return false;
  }

  const storage = await readCanonicalStorage(entry.project_root);
  return storage.ok;
}

async function canonicalProjectRoot(projectRoot: string): Promise<string> {
  const resolved = resolve(projectRoot);

  try {
    return await realpath(resolved);
  } catch {
    return resolved;
  }
}

function canonicalProjectRootSync(projectRoot: string): string {
  const resolved = resolve(projectRoot);

  try {
    return realpathSync(resolved);
  } catch {
    return resolved;
  }
}

function recoveryPathFor(location: ProjectRegistryLocation, clock: Clock): string {
  const timestamp = clock.nowIso().replace(/[^0-9A-Za-z-]/g, "-");
  return join(location.aictxHome, `projects.invalid-${timestamp}-${process.pid}.json`);
}

function compareRegistryEntries(left: ProjectRegistryEntry, right: ProjectRegistryEntry): number {
  return left.project.name.localeCompare(right.project.name) ||
    left.project.id.localeCompare(right.project.id) ||
    left.project_root.localeCompare(right.project_root);
}

function invalidRegistry<T>(message: string): Result<T> {
  return err(aictxError("AICtxInvalidJson", message));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
