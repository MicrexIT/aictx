import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createFixedClock } from "../../../src/core/clock.js";
import { acquireProjectLock, withProjectLock } from "../../../src/core/lock.js";
import { ok } from "../../../src/core/result.js";
import { FIXED_TIMESTAMP } from "../../fixtures/time.js";

const tempRoots: string[] = [];
const fixedClock = createFixedClock(FIXED_TIMESTAMP);

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("project lock", () => {
  it("writes deterministic lock payload fields", async () => {
    const aictxRoot = await createAictxRoot();

    const acquired = await acquireProjectLock({
      aictxRoot,
      operation: "save",
      clock: fixedClock,
      pid: 1234
    });

    expect(acquired.ok).toBe(true);
    expect(JSON.parse(await readFile(join(aictxRoot, ".lock"), "utf8"))).toEqual({
      created_at: FIXED_TIMESTAMP,
      operation: "save",
      pid: 1234
    });

    if (acquired.ok) {
      await acquired.data.release();
    }
  });

  it("returns lock busy when the lock already exists", async () => {
    const aictxRoot = await createAictxRoot();
    await writeFile(
      join(aictxRoot, ".lock"),
      JSON.stringify({
        pid: 4321,
        created_at: FIXED_TIMESTAMP,
        operation: "save"
      })
    );

    const acquired = await acquireProjectLock({
      aictxRoot,
      operation: "rebuild",
      clock: fixedClock,
      pid: 1234
    });

    expect(acquired.ok).toBe(false);
    if (!acquired.ok) {
      expect(acquired.error.code).toBe("AICtxLockBusy");
      expect(acquired.error.details).toMatchObject({
        lockPath: join(aictxRoot, ".lock"),
        operation: "rebuild",
        existingLock: {
          pid: 4321,
          created_at: FIXED_TIMESTAMP,
          operation: "save"
        }
      });
    }
  });

  it("does not remove an existing lock after failed acquisition", async () => {
    const aictxRoot = await createAictxRoot();
    const lockPath = join(aictxRoot, ".lock");
    const existingContents = "manual lock\n";
    await writeFile(lockPath, existingContents);

    const acquired = await acquireProjectLock({
      aictxRoot,
      operation: "restore",
      clock: fixedClock
    });

    expect(acquired.ok).toBe(false);
    expect(await readFile(lockPath, "utf8")).toBe(existingContents);
  });

  it("includes stale-lock details when an existing lock is older than 1 hour", async () => {
    const aictxRoot = await createAictxRoot();
    await writeFile(
      join(aictxRoot, ".lock"),
      JSON.stringify({
        pid: 4321,
        created_at: "2026-04-25T12:59:59+02:00",
        operation: "save"
      })
    );

    const acquired = await acquireProjectLock({
      aictxRoot,
      operation: "rebuild",
      clock: fixedClock
    });

    expect(acquired.ok).toBe(false);
    if (!acquired.ok) {
      expect(acquired.warnings).toEqual([
        "Existing project lock appears stale because it is older than 1 hour."
      ]);
      expect(acquired.error.details).toMatchObject({
        stale: true,
        staleWarning: "Existing project lock appears stale because it is older than 1 hour."
      });
    }
  });

  it("removes the lock after withProjectLock completes successfully", async () => {
    const aictxRoot = await createAictxRoot();

    const result = await withProjectLock(
      {
        aictxRoot,
        operation: "save",
        clock: fixedClock,
        pid: 1234
      },
      async (lock) => {
        expect(JSON.parse(await readFile(lock.lockPath, "utf8"))).toEqual(lock.payload);
        return ok("saved");
      }
    );

    expect(result).toEqual({ ok: true, data: "saved", warnings: [] });
    await expect(readFile(join(aictxRoot, ".lock"), "utf8")).rejects.toMatchObject({
      code: "ENOENT"
    });
  });

  it("creates the .aictx directory before locking for init", async () => {
    const projectRoot = await createTempRoot("aictx-lock-init-");
    const aictxRoot = join(projectRoot, ".aictx");

    const acquired = await acquireProjectLock({
      aictxRoot,
      operation: "init",
      clock: fixedClock,
      createAictxRoot: true
    });

    expect(acquired.ok).toBe(true);
    expect(await readFile(join(aictxRoot, ".lock"), "utf8")).toContain('"operation": "init"');

    if (acquired.ok) {
      await acquired.data.release();
    }
  });
});

async function createAictxRoot(): Promise<string> {
  const root = await createTempRoot("aictx-lock-");
  const aictxRoot = join(root, ".aictx");
  await mkdir(aictxRoot);
  return aictxRoot;
}

async function createTempRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  tempRoots.push(root);
  return root;
}
