import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, readFile, realpath, rename, rm } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { TextDecoder } from "node:util";

import { aictxError, type JsonValue } from "./errors.js";
import { err, ok, type Result } from "./result.js";

const UTF8_DECODER = new TextDecoder("utf-8", { fatal: true });
const O_NOFOLLOW = typeof constants.O_NOFOLLOW === "number" ? constants.O_NOFOLLOW : 0;

export function normalizeLineEndingsToLf(contents: string): string {
  return contents.replace(/\r\n?/g, "\n");
}

export function stableJsonStringify(value: JsonValue): string {
  return `${JSON.stringify(sortJsonValue(value), null, 2)}\n`;
}

export function resolveInsideRoot(root: string, target: string): Result<string> {
  const rootPath = resolve(root);
  const targetPath = isAbsolute(target) ? resolve(target) : resolve(rootPath, target);

  if (!isInsideOrEqual(rootPath, targetPath)) {
    return err(
      aictxError("AICtxValidationFailed", "Resolved path is outside the allowed root.", {
        root: rootPath,
        target
      })
    );
  }

  return ok(targetPath);
}

export async function readUtf8File(path: string): Promise<Result<string>> {
  try {
    const buffer = await readFile(path);
    return ok(UTF8_DECODER.decode(buffer));
  } catch (error) {
    return err(
      aictxError("AICtxValidationFailed", "File could not be read as valid UTF-8.", {
        path,
        message: messageFromUnknown(error)
      })
    );
  }
}

export async function writeTextAtomic(
  root: string,
  target: string,
  contents: string
): Promise<Result<void>> {
  const prepared = await prepareWritePath(root, target);

  if (!prepared.ok) {
    return prepared;
  }

  const tempPath = join(prepared.data.parentPath, `.aictx-tmp-${randomUUID()}`);
  let tempFileCreated = false;

  try {
    const file = await open(
      tempPath,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
      0o600
    );
    tempFileCreated = true;

    try {
      await file.writeFile(contents, "utf8");
      await file.sync();
    } finally {
      await file.close();
    }

    await rename(tempPath, prepared.data.targetPath);
    tempFileCreated = false;
    await fsyncDirectory(prepared.data.parentPath);
    return ok(undefined);
  } catch (error) {
    if (tempFileCreated) {
      await rm(tempPath, { force: true });
    }

    return err(
      aictxError("AICtxValidationFailed", "File could not be written atomically.", {
        path: target,
        message: messageFromUnknown(error)
      })
    );
  }
}

export function writeMarkdownAtomic(
  root: string,
  target: string,
  contents: string
): Promise<Result<void>> {
  return writeTextAtomic(root, target, normalizeLineEndingsToLf(contents));
}

export function writeJsonAtomic(
  root: string,
  target: string,
  value: JsonValue
): Promise<Result<void>> {
  return writeTextAtomic(root, target, stableJsonStringify(value));
}

export async function appendJsonl(
  root: string,
  target: string,
  value: Record<string, JsonValue>
): Promise<Result<void>> {
  const prepared = await prepareWritePath(root, target);

  if (!prepared.ok) {
    return prepared;
  }

  try {
    const existingTarget = await lstat(prepared.data.targetPath).catch((error: unknown) => {
      if (errorCode(error) === "ENOENT") {
        return null;
      }

      throw error;
    });

    if (existingTarget?.isSymbolicLink() === true) {
      return err(
        aictxError("AICtxValidationFailed", "Refusing to append through a symbolic link.", {
          path: target
        })
      );
    }

    const line = `${JSON.stringify(sortJsonValue(value))}\n`;
    const file = await open(
      prepared.data.targetPath,
      constants.O_APPEND | constants.O_CREAT | constants.O_WRONLY | O_NOFOLLOW,
      0o600
    );

    try {
      await file.writeFile(line, "utf8");
      await file.sync();
    } finally {
      await file.close();
    }

    await fsyncDirectory(prepared.data.parentPath);
    return ok(undefined);
  } catch (error) {
    return err(
      aictxError("AICtxValidationFailed", "JSONL object could not be appended.", {
        path: target,
        message: messageFromUnknown(error)
      })
    );
  }
}

interface PreparedWritePath {
  targetPath: string;
  parentPath: string;
}

async function prepareWritePath(root: string, target: string): Promise<Result<PreparedWritePath>> {
  const resolved = resolveInsideRoot(root, target);

  if (!resolved.ok) {
    return resolved;
  }

  const rootPath = resolve(root);
  const targetPath = resolved.data;
  const parentPath = dirname(targetPath);

  try {
    const directoryResult = await ensureDirectoryInsideRoot(rootPath, parentPath);

    if (!directoryResult.ok) {
      return directoryResult;
    }

    const [realRoot, realParent] = await Promise.all([realpath(rootPath), realpath(parentPath)]);

    if (!isInsideOrEqual(realRoot, realParent)) {
      return err(
        aictxError(
          "AICtxValidationFailed",
          "Resolved parent directory is outside the allowed root.",
          {
            root: realRoot,
            target
          }
        )
      );
    }

    return ok({ targetPath, parentPath });
  } catch (error) {
    return err(
      aictxError("AICtxValidationFailed", "Write path could not be prepared.", {
        path: target,
        message: messageFromUnknown(error)
      })
    );
  }
}

async function ensureDirectoryInsideRoot(
  rootPath: string,
  directoryPath: string
): Promise<Result<void>> {
  const relativeDirectory = relative(rootPath, directoryPath);
  const parts = relativeDirectory === "" ? [] : relativeDirectory.split(/[\\/]/);

  const rootResult = await ensureDirectoryComponent(rootPath);

  if (!rootResult.ok) {
    return rootResult;
  }

  let currentPath = rootPath;

  for (const part of parts) {
    currentPath = join(currentPath, part);

    const componentResult = await ensureDirectoryComponent(currentPath);

    if (!componentResult.ok) {
      return componentResult;
    }
  }

  return ok(undefined);
}

async function ensureDirectoryComponent(path: string): Promise<Result<void>> {
  try {
    await mkdir(path);
  } catch (error) {
    if (errorCode(error) !== "EEXIST") {
      return err(
        aictxError("AICtxValidationFailed", "Directory could not be created.", {
          path,
          message: messageFromUnknown(error)
        })
      );
    }
  }

  try {
    const pathStat = await lstat(path);

    if (pathStat.isSymbolicLink()) {
      return err(
        aictxError("AICtxValidationFailed", "Refusing to write through a symbolic link.", {
          path
        })
      );
    }

    if (!pathStat.isDirectory()) {
      return err(
        aictxError("AICtxValidationFailed", "Write path component is not a directory.", {
          path
        })
      );
    }

    return ok(undefined);
  } catch (error) {
    return err(
      aictxError("AICtxValidationFailed", "Directory could not be inspected.", {
        path,
        message: messageFromUnknown(error)
      })
    );
  }
}

async function fsyncDirectory(path: string): Promise<void> {
  try {
    const directory = await open(path, constants.O_RDONLY);

    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
  } catch {
    // Directory fsync is best-effort because support varies by filesystem.
  }
}

function sortJsonValue(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    return value.map((item) => sortJsonValue(item));
  }

  if (value !== null && typeof value === "object") {
    const sorted: Record<string, JsonValue> = {};

    for (const key of Object.keys(value).sort()) {
      sorted[key] = sortJsonValue(value[key] as JsonValue);
    }

    return sorted;
  }

  return value;
}

function isInsideOrEqual(root: string, target: string): boolean {
  const rootPath = resolve(root);
  const targetPath = resolve(target);
  const relativePath = relative(rootPath, targetPath);

  return relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath));
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
