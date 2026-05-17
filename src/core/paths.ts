import { lstat, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

import { memoryError } from "./errors.js";
import { findGitRoot, type GitWrapperOptions } from "./git.js";
import { err, ok, type Result } from "./result.js";

export type ProjectRootResolutionMode = "init" | "require-initialized";

export interface ProjectPaths {
  projectRoot: string;
  memoryRoot: string;
  git: {
    available: boolean;
    root: string | null;
  };
}

export interface ResolveProjectPathsOptions extends GitWrapperOptions {
  cwd: string;
  mode: ProjectRootResolutionMode;
}

const STORAGE_DIR = ".memory";
const LEGACY_STORAGE_DIR = ".aictx";
const CONFIG_FILENAME = "config.json";
const LOCK_FILENAME = ".lock";
const LEGACY_GENERATED_GITIGNORE_ENTRIES = [
  ".aictx/index/",
  ".aictx/context/",
  ".aictx/exports/",
  ".aictx/recovery/",
  ".aictx/.backup/",
  ".aictx/.lock"
] as const;
const GENERATED_GITIGNORE_ENTRIES = [
  ".memory/index/",
  ".memory/context/",
  ".memory/exports/",
  ".memory/recovery/",
  ".memory/.backup/",
  ".memory/.lock"
] as const;

export async function resolveProjectPaths(
  options: ResolveProjectPathsOptions
): Promise<Result<ProjectPaths>> {
  const cwd = resolve(options.cwd);
  const gitRoot = await findGitRoot(cwd, options);

  if (!gitRoot.ok) {
    return gitRoot;
  }

  if (gitRoot.data.available && gitRoot.data.root !== null) {
    const projectRoot = resolve(gitRoot.data.root);
    const migrated = await migrateLegacyStorageIfNeeded(projectRoot);

    if (!migrated.ok) {
      return err(migrated.error, migrated.warnings);
    }

    return resolveFromProjectRoot(projectRoot, options.mode, {
      available: true,
      root: projectRoot
    });
  }

  if (options.mode === "init") {
    const migrated = await migrateLegacyStorageIfNeeded(cwd);

    if (!migrated.ok) {
      return err(migrated.error, migrated.warnings);
    }

    return resolveFromProjectRoot(cwd, options.mode, {
      available: false,
      root: null
    });
  }

  const projectRoot = await findNearestMemoryProjectRoot(cwd);

  if (!projectRoot.ok) {
    return projectRoot;
  }

  return resolveFromProjectRoot(projectRoot.data, options.mode, {
    available: false,
    root: null
  });
}

async function resolveFromProjectRoot(
  projectRoot: string,
  mode: ProjectRootResolutionMode,
  git: ProjectPaths["git"]
): Promise<Result<ProjectPaths>> {
  const resolvedProjectRoot = resolve(projectRoot);
  const memoryRoot = resolve(resolvedProjectRoot, STORAGE_DIR);

  if (!isInsideOrEqual(resolvedProjectRoot, memoryRoot)) {
    return err(
      memoryError("MemoryValidationFailed", "Memory root is outside the project root.", {
        projectRoot: resolvedProjectRoot,
        memoryRoot
      })
    );
  }

  if (mode === "require-initialized") {
    const initialized = await isDirectory(memoryRoot);

    if (!initialized) {
      return notInitialized(resolvedProjectRoot, memoryRoot);
    }
  }

  return ok({
    projectRoot: resolvedProjectRoot,
    memoryRoot,
    git
  });
}

async function findNearestMemoryProjectRoot(cwd: string): Promise<Result<string>> {
  let current = resolve(cwd);

  while (true) {
    if (await pathExists(join(current, LEGACY_STORAGE_DIR))) {
      const migrated = await migrateLegacyStorageIfNeeded(current);

      if (!migrated.ok) {
        return err(migrated.error, migrated.warnings);
      }
    }

    if (await isFile(join(current, STORAGE_DIR, CONFIG_FILENAME))) {
      return ok(current);
    }

    const parent = dirname(current);

    if (parent === current) {
      return notInitialized(resolve(cwd), join(resolve(cwd), STORAGE_DIR));
    }

    current = parent;
  }
}

async function migrateLegacyStorageIfNeeded(projectRoot: string): Promise<Result<void>> {
  const legacyRoot = join(projectRoot, LEGACY_STORAGE_DIR);
  const legacyConfig = join(legacyRoot, CONFIG_FILENAME);
  const memoryRoot = join(projectRoot, STORAGE_DIR);

  if ((await pathExists(legacyRoot)) && (await pathExists(memoryRoot))) {
    return err(
      memoryError(
        "MemoryValidationFailed",
        "Both .aictx and .memory storage exist. Resolve the duplicate memory roots before running memory.",
        {
          legacyRoot,
          memoryRoot
        }
      )
    );
  }

  if (!(await isFile(legacyConfig))) {
    return ok(undefined);
  }

  if (await isFile(join(legacyRoot, LOCK_FILENAME))) {
    return err(
      memoryError(
        "MemoryLockBusy",
        "Legacy .aictx storage appears locked. Stop the running memory process or remove a stale .aictx/.lock before migration.",
        {
          legacyRoot,
          lockPath: join(legacyRoot, LOCK_FILENAME)
        }
      )
    );
  }

  try {
    await rename(legacyRoot, memoryRoot);
  } catch (error) {
    return err(
      memoryError("MemoryValidationFailed", "Legacy .aictx storage could not be migrated to .memory.", {
        legacyRoot,
        memoryRoot,
        message: error instanceof Error ? error.message : String(error)
      })
    );
  }

  return updateLegacyGitignore(projectRoot);
}

async function updateLegacyGitignore(projectRoot: string): Promise<Result<void>> {
  const gitignorePath = join(projectRoot, ".gitignore");
  let contents: string;

  try {
    contents = await readFile(gitignorePath, "utf8");
  } catch (error) {
    if (errorCode(error) === "ENOENT") {
      return ok(undefined);
    }

    return err(
      memoryError("MemoryValidationFailed", "Gitignore could not be read during memory migration.", {
        path: ".gitignore",
        message: error instanceof Error ? error.message : String(error)
      })
    );
  }

  const replacements = new Map<string, string>(
    LEGACY_GENERATED_GITIGNORE_ENTRIES.map((entry, index) => [
      entry,
      GENERATED_GITIGNORE_ENTRIES[index] ?? entry
    ])
  );
  const lines = contents.split(/\r\n|\n|\r/);
  const updated = lines.map((line) => replacements.get(line.trim()) ?? line);
  const currentEntries = new Set(updated.map((line) => line.trim()));
  let changed = updated.join("\n") !== contents.replace(/\r\n|\r/g, "\n");

  for (const entry of GENERATED_GITIGNORE_ENTRIES) {
    if (!currentEntries.has(entry)) {
      updated.push(entry);
      changed = true;
    }
  }

  if (!changed) {
    return ok(undefined);
  }

  try {
    await writeFile(gitignorePath, `${updated.join("\n").replace(/\n*$/, "")}\n`, "utf8");
    return ok(undefined);
  } catch (error) {
    return err(
      memoryError("MemoryValidationFailed", "Gitignore could not be updated during memory migration.", {
        path: ".gitignore",
        message: error instanceof Error ? error.message : String(error)
      })
    );
  }
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await lstat(path)).isFile();
  } catch {
    return false;
  }
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await lstat(path)).isDirectory();
  } catch {
    return false;
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch {
    return false;
  }
}

function errorCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return null;
  }

  const code = error.code;
  return typeof code === "string" ? code : null;
}

function isInsideOrEqual(root: string, target: string): boolean {
  const relativePath = relative(root, target);
  return relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath));
}

function notInitialized<T>(projectRoot: string, memoryRoot: string): Result<T> {
  return err(
    memoryError("MemoryNotInitialized", "Memory is not initialized in this project.", {
      projectRoot,
      memoryRoot
    })
  );
}
