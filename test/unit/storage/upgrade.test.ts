import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createFixedTestClock } from "../../fixtures/time.js";
import { computeObjectContentHash } from "../../../src/storage/hashes.js";
import { upgradeStorageToV2 } from "../../../src/storage/upgrade.js";
import { readCanonicalStorage } from "../../../src/storage/read.js";
import { SCHEMA_FILES } from "../../../src/validation/schemas.js";

const root = process.cwd();
const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("storage upgrade", () => {
  it("backfills v1 objects with conservative facets and empty object evidence", async () => {
    const projectRoot = await createV1Project();
    const upgraded = await upgradeStorageToV2({
      projectRoot,
      clock: createFixedTestClock("2026-04-25T14:00:00+02:00")
    });

    expect(upgraded.ok).toBe(true);
    if (!upgraded.ok) {
      return;
    }

    expect(upgraded.data).toMatchObject({
      upgraded: true,
      from_version: 1,
      to_version: 2,
      objects_upgraded: ["decision.billing-retries"]
    });

    const config = JSON.parse(await readFile(join(projectRoot, ".aictx/config.json"), "utf8")) as {
      version: number;
    };
    const sidecar = JSON.parse(
      await readFile(join(projectRoot, ".aictx/memory/decisions/billing-retries.json"), "utf8")
    ) as {
      facets?: { category?: string };
      evidence?: unknown[];
      content_hash?: string;
    };
    const storage = await readCanonicalStorage(projectRoot);

    expect(config.version).toBe(2);
    expect(sidecar.facets).toEqual({ category: "decision-rationale" });
    expect(sidecar.evidence).toEqual([]);
    expect(sidecar.content_hash).toMatch(/^sha256:/);
    expect(storage.ok).toBe(true);
  });

  it("is a no-op when storage is already v2 and objects have facets and evidence", async () => {
    const projectRoot = await createV1Project();
    const first = await upgradeStorageToV2({
      projectRoot,
      clock: createFixedTestClock("2026-04-25T14:00:00+02:00")
    });

    expect(first.ok).toBe(true);
    if (!first.ok) {
      return;
    }

    const second = await upgradeStorageToV2({
      projectRoot,
      clock: createFixedTestClock("2026-04-25T15:00:00+02:00")
    });

    expect(second).toEqual({
      ok: true,
      data: {
        upgraded: false,
        from_version: 2,
        to_version: 2,
        files_changed: [],
        objects_upgraded: []
      },
      warnings: []
    });
  });

  it("repairs outdated bundled schema files even when config is already v2", async () => {
    const projectRoot = await createV1Project();
    const first = await upgradeStorageToV2({
      projectRoot,
      clock: createFixedTestClock("2026-04-25T14:00:00+02:00")
    });

    expect(first.ok).toBe(true);
    if (!first.ok) {
      return;
    }

    await writeFile(
      join(projectRoot, ".aictx/schema/object.schema.json"),
      `${JSON.stringify({ $id: "https://aictx.dev/schemas/v1/object.schema.json" }, null, 2)}\n`,
      "utf8"
    );

    const repaired = await upgradeStorageToV2({
      projectRoot,
      clock: createFixedTestClock("2026-04-25T15:00:00+02:00")
    });

    expect(repaired.ok).toBe(true);
    if (!repaired.ok) {
      return;
    }

    expect(repaired.data).toMatchObject({
      upgraded: true,
      from_version: 2,
      to_version: 2,
      files_changed: [".aictx/schema/object.schema.json"],
      objects_upgraded: []
    });
  });
});

async function createV1Project(): Promise<string> {
  const projectRoot = await mkdtemp(join(tmpdir(), "aictx-upgrade-"));
  tempRoots.push(projectRoot);
  await mkdir(join(projectRoot, ".aictx/memory/decisions"), { recursive: true });
  await mkdir(join(projectRoot, ".aictx/relations"), { recursive: true });
  await mkdir(join(projectRoot, ".aictx/schema"), { recursive: true });

  for (const file of Object.values(SCHEMA_FILES)) {
    await copyFile(join(root, "src/schemas", file), join(projectRoot, ".aictx/schema", file));
  }

  await writeFile(
    join(projectRoot, ".aictx/config.json"),
    `${JSON.stringify({
      version: 1,
      project: { id: "project.billing-api", name: "Billing API" },
      memory: { defaultTokenBudget: 6000, autoIndex: true, saveContextPacks: false },
      git: { trackContextPacks: false }
    }, null, 2)}\n`,
    "utf8"
  );
  await writeFile(join(projectRoot, ".aictx/events.jsonl"), "", "utf8");

  const body = "# Billing retries\n\nRetries run in the worker.\n";
  const sidecarWithoutHash = {
    id: "decision.billing-retries",
    type: "decision",
    status: "active",
    title: "Billing retries",
    body_path: "memory/decisions/billing-retries.md",
    scope: {
      kind: "project",
      project: "project.billing-api",
      branch: null,
      task: null
    },
    tags: ["billing"],
    source: { kind: "agent" },
    created_at: "2026-04-25T13:00:00+02:00",
    updated_at: "2026-04-25T13:00:00+02:00"
  };
  const sidecar = {
    ...sidecarWithoutHash,
    content_hash: computeObjectContentHash(sidecarWithoutHash, body)
  };

  await writeFile(join(projectRoot, ".aictx/memory/decisions/billing-retries.md"), body, "utf8");
  await writeFile(
    join(projectRoot, ".aictx/memory/decisions/billing-retries.json"),
    `${JSON.stringify(sidecar, null, 2)}\n`,
    "utf8"
  );

  return projectRoot;
}
