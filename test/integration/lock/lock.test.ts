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

describe("project lock integration", () => {
  it("allows exactly one concurrent acquisition for a project", async () => {
    const memoryRoot = await createMemoryRoot();

    const results = await Promise.all([
      acquireProjectLock({ memoryRoot, operation: "save", clock: fixedClock, pid: 1111 }),
      acquireProjectLock({ memoryRoot, operation: "save", clock: fixedClock, pid: 2222 })
    ]);

    const successes = results.filter((result) => result.ok);
    const failures = results.filter((result) => !result.ok);

    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect(failures[0]?.ok).toBe(false);
    if (failures[0]?.ok === false) {
      expect(failures[0].error.code).toBe("MemoryLockBusy");
    }

    if (successes[0]?.ok === true) {
      await successes[0].data.release();
    }
  });

  it("removes the lock file after successful completion", async () => {
    const memoryRoot = await createMemoryRoot();

    const result = await withProjectLock(
      {
        memoryRoot,
        operation: "rebuild",
        clock: fixedClock
      },
      () => ok(undefined)
    );

    expect(result.ok).toBe(true);
    await expect(readFile(join(memoryRoot, ".lock"), "utf8")).rejects.toMatchObject({
      code: "ENOENT"
    });
  });

  it("does not automatically remove a manually-created existing lock", async () => {
    const memoryRoot = await createMemoryRoot();
    const lockPath = join(memoryRoot, ".lock");
    const contents = "manual lock\n";
    await writeFile(lockPath, contents);

    const result = await withProjectLock(
      {
        memoryRoot,
        operation: "restore",
        clock: fixedClock
      },
      () => ok(undefined)
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("MemoryLockBusy");
    }
    expect(await readFile(lockPath, "utf8")).toBe(contents);
  });
});

async function createMemoryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "memory-lock-integration-"));
  tempRoots.push(root);
  const memoryRoot = join(root, ".memory");
  await mkdir(memoryRoot);
  return memoryRoot;
}
