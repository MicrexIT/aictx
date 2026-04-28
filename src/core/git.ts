import path from "node:path";

import { aictxError } from "./errors.js";
import { err, ok, type Result } from "./result.js";
import {
  runSubprocess,
  type RunSubprocessOptions,
  type SubprocessResult
} from "./subprocess.js";
import type { GitState } from "./types.js";

const AICTX_PATHSPEC = ".aictx";
const IGNORED_DIRTY_PATHS = [
  ".aictx/index/",
  ".aictx/context/",
  ".aictx/exports/"
] as const;
const IGNORED_DIRTY_FILES = [".aictx/.lock"] as const;
const LOG_FIELD_SEPARATOR = "\u001f";

export interface GitWrapperOptions {
  runner?: RunSubprocessOptions["runner"];
}

export interface GitRootStatus {
  available: boolean;
  root: string | null;
}

export interface AictxDirtyState {
  dirty: boolean;
  files: string[];
  unmergedFiles: string[];
}

export interface AictxDiff {
  diff: string;
  changedFiles: string[];
}

export interface AictxLogEntry {
  commit: string;
  shortCommit: string;
  unixTimestamp: number;
  subject: string;
}

export interface AictxFileAtCommit {
  commit: string;
  path: string;
  contents: string;
}

interface GitCommandOptions extends GitWrapperOptions {
  gitUnavailableOk?: boolean;
}

export async function findGitRoot(
  cwd: string,
  options: GitWrapperOptions = {}
): Promise<Result<GitRootStatus>> {
  const result = await runGit(["rev-parse", "--show-toplevel"], cwd, {
    ...options,
    gitUnavailableOk: true
  });

  if (!result.ok) {
    return result;
  }

  if (result.data.exitCode !== 0) {
    return ok({ available: false, root: null });
  }

  return ok({ available: true, root: result.data.stdout.trim() });
}

export async function getGitState(
  cwd: string,
  options: GitWrapperOptions = {}
): Promise<Result<GitState>> {
  const root = await findGitRoot(cwd, options);

  if (!root.ok) {
    return root;
  }

  if (!root.data.available || root.data.root === null) {
    return ok({
      available: false,
      branch: null,
      commit: null,
      dirty: null
    });
  }

  const projectRoot = root.data.root;
  const [branchResult, commitResult, dirtyResult] = await Promise.all([
    getCurrentGitBranch(projectRoot, options),
    getCurrentCommit(projectRoot, options),
    getAictxDirtyState(projectRoot, options)
  ]);

  if (!branchResult.ok) {
    return branchResult;
  }

  if (!commitResult.ok) {
    return commitResult;
  }

  if (!dirtyResult.ok) {
    return dirtyResult;
  }

  return ok({
    available: true,
    branch: branchResult.data,
    commit: commitResult.data,
    dirty: dirtyResult.data.dirty
  });
}

export async function getAictxDirtyState(
  projectRoot: string,
  options: GitWrapperOptions = {}
): Promise<Result<AictxDirtyState>> {
  const result = await runGit(
    ["status", "--porcelain=v1", "--", AICTX_PATHSPEC],
    projectRoot,
    options
  );

  if (!result.ok) {
    return result;
  }

  if (result.data.exitCode !== 0) {
    return gitCommandFailed("Git status failed.", result.data);
  }

  const entries = result.data.stdout
    .split("\n")
    .map(parsePorcelainStatusLine)
    .filter((entry): entry is PorcelainStatusEntry => entry !== null)
    .filter((entry) => !isIgnoredDirtyPath(entry.path));

  const files = uniqueSorted(entries.map((entry) => entry.path));
  const unmergedFiles = uniqueSorted(
    entries.filter((entry) => isUnmergedStatus(entry.status)).map((entry) => entry.path)
  );

  return ok({
    dirty: files.length > 0,
    files,
    unmergedFiles
  });
}

export async function getAictxDiff(
  projectRoot: string,
  options: GitWrapperOptions = {}
): Promise<Result<AictxDiff>> {
  const result = await runGit(["diff", "--", AICTX_PATHSPEC], projectRoot, options);

  if (!result.ok) {
    return result;
  }

  if (result.data.exitCode !== 0) {
    return gitCommandFailed("Git diff failed.", result.data);
  }

  return ok({
    diff: result.data.stdout,
    changedFiles: parseDiffChangedFiles(result.data.stdout)
  });
}

export async function getAictxLog(
  projectRoot: string,
  options: GitWrapperOptions = {}
): Promise<Result<AictxLogEntry[]>> {
  const result = await runGit(
    [
      "log",
      `--format=%H${LOG_FIELD_SEPARATOR}%h${LOG_FIELD_SEPARATOR}%ct${LOG_FIELD_SEPARATOR}%s`,
      "--",
      AICTX_PATHSPEC
    ],
    projectRoot,
    options
  );

  if (!result.ok) {
    return result;
  }

  if (result.data.exitCode !== 0) {
    return gitCommandFailed("Git log failed.", result.data);
  }

  return ok(parseLogEntries(result.data.stdout));
}

export async function showAictxFileAtCommit(
  projectRoot: string,
  commit: string,
  filePath: string,
  options: GitWrapperOptions = {}
): Promise<Result<AictxFileAtCommit>> {
  const revision = validateGitRevision(commit);

  if (!revision.ok) {
    return revision;
  }

  const normalizedPath = normalizeAictxFilePath(filePath);

  if (!normalizedPath.ok) {
    return normalizedPath;
  }

  const result = await runGit(
    ["show", `${revision.data}:${normalizedPath.data}`],
    projectRoot,
    options
  );

  if (!result.ok) {
    return result;
  }

  if (result.data.exitCode !== 0) {
    return gitCommandFailed("Git show failed.", result.data);
  }

  return ok({
    commit: revision.data,
    path: normalizedPath.data,
    contents: result.data.stdout
  });
}

export async function restoreAictxFromCommit(
  projectRoot: string,
  commit: string,
  options: GitWrapperOptions = {}
): Promise<Result<void>> {
  const revision = validateGitRevision(commit);

  if (!revision.ok) {
    return revision;
  }

  const result = await runGit(
    ["restore", "--source", revision.data, "--", AICTX_PATHSPEC],
    projectRoot,
    options
  );

  if (!result.ok) {
    return result;
  }

  if (result.data.exitCode !== 0) {
    return gitCommandFailed("Git restore failed.", result.data);
  }

  return ok(undefined);
}

export async function getCurrentGitBranch(
  projectRoot: string,
  options: GitWrapperOptions = {}
): Promise<Result<string | null>> {
  const result = await runGit(["symbolic-ref", "--short", "-q", "HEAD"], projectRoot, options);

  if (!result.ok) {
    return result;
  }

  if (result.data.exitCode === 0) {
    const branch = result.data.stdout.trim();
    return ok(branch === "" ? null : branch);
  }

  if (result.data.exitCode === 1) {
    return ok(null);
  }

  return gitCommandFailed("Git branch detection failed.", result.data);
}

async function getCurrentCommit(
  projectRoot: string,
  options: GitWrapperOptions
): Promise<Result<string>> {
  const result = await runGit(["rev-parse", "HEAD"], projectRoot, options);

  if (!result.ok) {
    return result;
  }

  if (result.data.exitCode !== 0) {
    return gitCommandFailed("Git commit detection failed.", result.data);
  }

  return ok(result.data.stdout.trim());
}

async function runGit(
  args: readonly string[],
  cwd: string,
  options: GitCommandOptions
): Promise<Result<SubprocessResult>> {
  const subprocessOptions: RunSubprocessOptions = { cwd };

  if (options.runner !== undefined) {
    subprocessOptions.runner = options.runner;
  }

  const result = await runSubprocess("git", args, subprocessOptions);

  if (!result.ok) {
    return err(
      aictxError("AICtxGitOperationFailed", "Git operation failed.", {
        message: result.error.message
      })
    );
  }

  if (
    result.data.exitCode !== 0 &&
    options.gitUnavailableOk !== true &&
    isGitUnavailableResult(result.data)
  ) {
    return err(aictxError("AICtxGitRequired", "Git is required for this operation."));
  }

  return result;
}

interface PorcelainStatusEntry {
  status: string;
  path: string;
}

function parsePorcelainStatusLine(line: string): PorcelainStatusEntry | null {
  if (line.length < 4) {
    return null;
  }

  const status = line.slice(0, 2);
  const rawPath = line.slice(3);
  const path = unquoteGitPath(
    rawPath.includes(" -> ") ? rawPath.split(" -> ").at(-1) ?? rawPath : rawPath
  );

  if (!path.startsWith(".aictx/") && path !== ".aictx") {
    return null;
  }

  return { status, path };
}

function isUnmergedStatus(status: string): boolean {
  return ["DD", "AU", "UD", "UA", "DU", "AA", "UU"].includes(status);
}

function isIgnoredDirtyPath(filePath: string): boolean {
  return (
    IGNORED_DIRTY_FILES.includes(filePath as (typeof IGNORED_DIRTY_FILES)[number]) ||
    IGNORED_DIRTY_PATHS.some((ignoredPath) => filePath.startsWith(ignoredPath))
  );
}

function parseDiffChangedFiles(diff: string): string[] {
  const files: string[] = [];

  for (const line of diff.split("\n")) {
    if (!line.startsWith("diff --git ")) {
      continue;
    }

    const match = /^diff --git a\/(.+?) b\/(.+)$/.exec(line);

    if (match?.[2] !== undefined && match[2].startsWith(".aictx/")) {
      files.push(unquoteGitPath(match[2]));
    }
  }

  return uniqueSorted(files);
}

function parseLogEntries(stdout: string): AictxLogEntry[] {
  return stdout
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => {
      const [commit = "", shortCommit = "", timestamp = "0", subject = ""] =
        line.split(LOG_FIELD_SEPARATOR);

      return {
        commit,
        shortCommit,
        unixTimestamp: Number.parseInt(timestamp, 10),
        subject
      };
    });
}

function normalizeAictxFilePath(filePath: string): Result<string> {
  const slashPath = filePath.replaceAll("\\", "/");

  if (path.posix.isAbsolute(slashPath)) {
    return invalidAictxPath(filePath);
  }

  const prefixedPath = slashPath.startsWith(".aictx/") ? slashPath : `.aictx/${slashPath}`;
  const normalizedPath = path.posix.normalize(prefixedPath);

  if (
    normalizedPath === ".aictx" ||
    !normalizedPath.startsWith(".aictx/") ||
    normalizedPath.includes("\0")
  ) {
    return invalidAictxPath(filePath);
  }

  return ok(normalizedPath);
}

function validateGitRevision(revision: string): Result<string> {
  if (
    revision.length === 0 ||
    revision.startsWith("-") ||
    revision.includes(":") ||
    revision.includes("\0") ||
    /\s/.test(revision)
  ) {
    return err(
      aictxError("AICtxValidationFailed", "Git revision is not a safe commit or ref.", {
        revision
      })
    );
  }

  return ok(revision);
}

function invalidAictxPath(filePath: string): Result<string> {
  return err(
    aictxError("AICtxValidationFailed", "Git file path must stay inside .aictx/.", {
      path: filePath
    })
  );
}

function gitCommandFailed<T>(message: string, result: SubprocessResult): Result<T> {
  return err(
    aictxError("AICtxGitOperationFailed", message, {
      command: result.command,
      args: [...result.args],
      exitCode: result.exitCode,
      stderr: result.stderr.trim()
    })
  );
}

function isGitUnavailableResult(result: SubprocessResult): boolean {
  const stderr = result.stderr.toLowerCase();
  return (
    stderr.includes("not a git repository") ||
    stderr.includes("not a git worktree") ||
    stderr.includes("outside repository")
  );
}

function unquoteGitPath(filePath: string): string {
  if (filePath.length >= 2 && filePath.startsWith('"') && filePath.endsWith('"')) {
    return filePath.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }

  return filePath;
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}
