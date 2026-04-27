import { lstat } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

import { aictxError } from "./errors.js";
import { findGitRoot, type GitWrapperOptions } from "./git.js";
import { err, ok, type Result } from "./result.js";

export type ProjectRootResolutionMode = "init" | "require-initialized";

export interface ProjectPaths {
  projectRoot: string;
  aictxRoot: string;
  git: {
    available: boolean;
    root: string | null;
  };
}

export interface ResolveProjectPathsOptions extends GitWrapperOptions {
  cwd: string;
  mode: ProjectRootResolutionMode;
}

export async function resolveProjectPaths(
  options: ResolveProjectPathsOptions
): Promise<Result<ProjectPaths>> {
  const cwd = resolve(options.cwd);
  const gitRoot = await findGitRoot(cwd, options);

  if (!gitRoot.ok) {
    return gitRoot;
  }

  if (gitRoot.data.available && gitRoot.data.root !== null) {
    return resolveFromProjectRoot(resolve(gitRoot.data.root), options.mode, {
      available: true,
      root: resolve(gitRoot.data.root)
    });
  }

  if (options.mode === "init") {
    return resolveFromProjectRoot(cwd, options.mode, {
      available: false,
      root: null
    });
  }

  const projectRoot = await findNearestAictxProjectRoot(cwd);

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
  const aictxRoot = resolve(resolvedProjectRoot, ".aictx");

  if (!isInsideOrEqual(resolvedProjectRoot, aictxRoot)) {
    return err(
      aictxError("AICtxValidationFailed", "Aictx root is outside the project root.", {
        projectRoot: resolvedProjectRoot,
        aictxRoot
      })
    );
  }

  if (mode === "require-initialized") {
    const initialized = await isDirectory(aictxRoot);

    if (!initialized) {
      return notInitialized(resolvedProjectRoot, aictxRoot);
    }
  }

  return ok({
    projectRoot: resolvedProjectRoot,
    aictxRoot,
    git
  });
}

async function findNearestAictxProjectRoot(cwd: string): Promise<Result<string>> {
  let current = resolve(cwd);

  while (true) {
    if (await isFile(join(current, ".aictx", "config.json"))) {
      return ok(current);
    }

    const parent = dirname(current);

    if (parent === current) {
      return notInitialized(resolve(cwd), join(resolve(cwd), ".aictx"));
    }

    current = parent;
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

function isInsideOrEqual(root: string, target: string): boolean {
  const relativePath = relative(root, target);
  return relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath));
}

function notInitialized<T>(projectRoot: string, aictxRoot: string): Result<T> {
  return err(
    aictxError("AICtxNotInitialized", "Aictx is not initialized in this project.", {
      projectRoot,
      aictxRoot
    })
  );
}
