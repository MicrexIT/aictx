import { mkdir, open, readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";

import type { Clock } from "./clock.js";
import { systemClock } from "./clock.js";
import { aictxError, type JsonValue } from "./errors.js";
import { stableJsonStringify } from "./fs.js";
import { err, ok, type Result } from "./result.js";
import type { IsoDateTime } from "./types.js";

const LOCK_FILENAME = ".lock";
const STALE_LOCK_THRESHOLD_MS = 60 * 60 * 1000;

export interface ProjectLockOptions {
  aictxRoot: string;
  operation: string;
  clock?: Clock;
  pid?: number;
  createAictxRoot?: boolean;
}

export interface ProjectLockPayload {
  pid: number;
  created_at: IsoDateTime;
  operation: string;
}

export interface ProjectLock {
  readonly lockPath: string;
  readonly payload: ProjectLockPayload;
  release(): Promise<Result<void>>;
}

export type ProjectLockCallback<T> = (lock: ProjectLock) => Promise<Result<T>> | Result<T>;

export async function acquireProjectLock(options: ProjectLockOptions): Promise<Result<ProjectLock>> {
  const aictxRoot = resolve(options.aictxRoot);
  const lockPath = join(aictxRoot, LOCK_FILENAME);
  const clock = options.clock ?? systemClock;
  const payload: ProjectLockPayload = {
    pid: options.pid ?? process.pid,
    created_at: clock.nowIso(),
    operation: options.operation
  };

  if (options.createAictxRoot === true) {
    try {
      await mkdir(aictxRoot, { recursive: true });
    } catch (error) {
      return err(
        aictxError("AICtxValidationFailed", "Aictx root could not be created before locking.", {
          aictxRoot,
          message: messageFromUnknown(error)
        })
      );
    }
  }

  let created = false;

  try {
    const file = await open(lockPath, "wx", 0o600);
    created = true;

    try {
      await file.writeFile(stableJsonStringify(projectLockPayloadToJson(payload)), "utf8");
      await file.sync();
    } finally {
      await file.close();
    }

    return ok(createProjectLock(lockPath, payload));
  } catch (error) {
    if (created) {
      await rm(lockPath, { force: true });
    }

    if (errorCode(error) === "EEXIST") {
      return lockBusy(lockPath, options.operation, clock);
    }

    return err(
      aictxError("AICtxValidationFailed", "Project lock could not be acquired.", {
        lockPath,
        operation: options.operation,
        message: messageFromUnknown(error)
      })
    );
  }
}

export async function withProjectLock<T>(
  options: ProjectLockOptions,
  callback: ProjectLockCallback<T>
): Promise<Result<T>> {
  const acquired = await acquireProjectLock(options);

  if (!acquired.ok) {
    return acquired;
  }

  let callbackResult: Result<T> | undefined;
  let callbackError: unknown;

  try {
    callbackResult = await callback(acquired.data);
  } catch (error) {
    callbackError = error;
  }

  const releaseResult = await acquired.data.release();

  if (callbackError !== undefined) {
    throw callbackError;
  }

  if (!releaseResult.ok) {
    if (callbackResult?.ok === false) {
      return {
        ...callbackResult,
        warnings: [
          ...callbackResult.warnings,
          ...releaseResult.warnings,
          `Project lock release failed: ${releaseResult.error.message}`
        ]
      };
    }

    return releaseResult;
  }

  if (callbackResult === undefined) {
    return err(
      aictxError("AICtxInternalError", "Project lock callback did not return a result.", {
        lockPath: acquired.data.lockPath
      })
    );
  }

  return callbackResult;
}

function createProjectLock(lockPath: string, payload: ProjectLockPayload): ProjectLock {
  let released = false;

  return {
    lockPath,
    payload,
    async release(): Promise<Result<void>> {
      if (released) {
        return ok(undefined);
      }

      try {
        await rm(lockPath, { force: true });
        released = true;
        return ok(undefined);
      } catch (error) {
        return err(
          aictxError("AICtxValidationFailed", "Project lock could not be released.", {
            lockPath,
            message: messageFromUnknown(error)
          })
        );
      }
    }
  };
}

async function lockBusy(
  lockPath: string,
  operation: string,
  clock: Clock
): Promise<Result<ProjectLock>> {
  const details: Record<string, JsonValue> = {
    lockPath,
    operation
  };
  const warnings: string[] = [];
  const existing = await readExistingLock(lockPath);

  if (existing.ok) {
    details.existingLock = existing.payload;

    const stale = getStaleLockWarning(existing.payload, clock);

    if (stale !== null) {
      details.stale = true;
      details.staleWarning = stale;
      warnings.push(stale);
    }
  } else {
    details.existingLockReadError = existing.message;
  }

  return err(
    aictxError("AICtxLockBusy", "Project lock is already held.", details),
    warnings
  );
}

type ExistingLockRead =
  | {
      ok: true;
      payload: Record<string, JsonValue>;
    }
  | {
      ok: false;
      message: string;
    };

async function readExistingLock(lockPath: string): Promise<ExistingLockRead> {
  try {
    const contents = await readFile(lockPath, "utf8");
    const parsed: unknown = JSON.parse(contents);

    if (!isJsonObject(parsed)) {
      return { ok: false, message: "Existing lock payload is not a JSON object." };
    }

    return { ok: true, payload: parsed };
  } catch (error) {
    return { ok: false, message: messageFromUnknown(error) };
  }
}

function getStaleLockWarning(payload: Record<string, JsonValue>, clock: Clock): string | null {
  const createdAt = payload.created_at;

  if (typeof createdAt !== "string") {
    return null;
  }

  const createdAtMs = Date.parse(createdAt);

  if (Number.isNaN(createdAtMs)) {
    return null;
  }

  const ageMs = clock.now().getTime() - createdAtMs;

  if (ageMs <= STALE_LOCK_THRESHOLD_MS) {
    return null;
  }

  return "Existing project lock appears stale because it is older than 1 hour.";
}

function projectLockPayloadToJson(payload: ProjectLockPayload): JsonValue {
  return {
    pid: payload.pid,
    created_at: payload.created_at,
    operation: payload.operation
  };
}

function isJsonObject(value: unknown): value is Record<string, JsonValue> {
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
