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
    const aictxRoot = await createAictxRoot();

    const results = await Promise.all([
      acquireProjectLock({ aictxRoot, operation: "save", clock: fixedClock, pid: 1111 }),
      acquireProjectLock({ aictxRoot, operation: "save", clock: fixedClock, pid: 2222 })
    ]);

    const successes = results.filter((result) => result.ok);
    const failures = results.filter((result) => !result.ok);

    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect(failures[0]?.ok).toBe(false);
    if (failures[0]?.ok === false) {
      expect(failures[0].error.code).toBe("AICtxLockBusy");
    }

    if (successes[0]?.ok === true) {
      await successes[0].data.release();
    }
  });

  it("removes the lock file after successful completion", async () => {
    const aictxRoot = await createAictxRoot();

    const result = await withProjectLock(
      {
        aictxRoot,
        operation: "rebuild",
        clock: fixedClock
      },
      () => ok(undefined)
    );

    expect(result.ok).toBe(true);
    await expect(readFile(join(aictxRoot, ".lock"), "utf8")).rejects.toMatchObject({
      code: "ENOENT"
    });
  });

  it("does not automatically remove a manually-created existing lock", async () => {
    const aictxRoot = await createAictxRoot();
    const lockPath = join(aictxRoot, ".lock");
    const contents = "manual lock\n";
    await writeFile(lockPath, contents);

    const result = await withProjectLock(
      {
        aictxRoot,
        operation: "restore",
        clock: fixedClock
      },
      () => ok(undefined)
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("AICtxLockBusy");
    }
    expect(await readFile(lockPath, "utf8")).toBe(contents);
  });
});

async function createAictxRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "aictx-lock-integration-"));
  tempRoots.push(root);
  const aictxRoot = join(root, ".aictx");
  await mkdir(aictxRoot);
  return aictxRoot;
}
