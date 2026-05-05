import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createFixedTestClock } from "../../fixtures/time.js";
import {
  computeObjectContentHash,
  computeRelationContentHash
} from "../../../src/storage/hashes.js";
import { upgradeStorageToV3 } from "../../../src/storage/upgrade.js";
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
    const upgraded = await upgradeStorageToV3({
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
      to_version: 3,
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

    expect(config.version).toBe(3);
    expect(sidecar.facets).toEqual({ category: "decision-rationale" });
    expect(sidecar.evidence).toEqual([]);
    expect(sidecar.content_hash).toMatch(/^sha256:/);
    expect(storage.ok).toBe(true);
  });

  it("is a no-op when storage is already v3 and objects have facets and evidence", async () => {
    const projectRoot = await createV1Project();
    const first = await upgradeStorageToV3({
      projectRoot,
      clock: createFixedTestClock("2026-04-25T14:00:00+02:00")
    });

    expect(first.ok).toBe(true);
    if (!first.ok) {
      return;
    }

    const second = await upgradeStorageToV3({
      projectRoot,
      clock: createFixedTestClock("2026-04-25T15:00:00+02:00")
    });

    expect(second).toEqual({
      ok: true,
      data: {
        upgraded: false,
        from_version: 3,
        to_version: 3,
        files_changed: [],
        objects_upgraded: [],
        objects_deleted: [],
        relations_deleted: []
      },
      warnings: []
    });
  });

  it("repairs outdated bundled schema files even when config is already v3", async () => {
    const projectRoot = await createV1Project();
    const first = await upgradeStorageToV3({
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

    const repaired = await upgradeStorageToV3({
      projectRoot,
      clock: createFixedTestClock("2026-04-25T15:00:00+02:00")
    });

    expect(repaired.ok).toBe(true);
    if (!repaired.ok) {
      return;
    }

    expect(repaired.data).toMatchObject({
      upgraded: true,
      from_version: 3,
      to_version: 3,
      files_changed: [".aictx/schema/object.schema.json"],
      objects_upgraded: []
    });
  });

  it("migrates legacy v2 statuses into the v3 lifecycle", async () => {
    const projectRoot = await createLegacyV2LifecycleProject();
    const upgraded = await upgradeStorageToV3({
      projectRoot,
      clock: createFixedTestClock("2026-04-25T16:00:00+02:00")
    });

    expect(upgraded.ok).toBe(true);
    if (!upgraded.ok) {
      return;
    }

    expect(upgraded.data).toMatchObject({
      upgraded: true,
      from_version: 2,
      to_version: 3,
      files_changed: expect.arrayContaining([".aictx/events.jsonl"]),
      objects_upgraded: expect.arrayContaining([
        "decision.legacy-draft",
        "question.legacy-active-question"
      ]),
      objects_deleted: ["note.legacy-rejected"],
      relations_deleted: ["rel.legacy-rejected-reference"]
    });

    await expect(
      readFile(join(projectRoot, ".aictx/memory/notes/legacy-rejected.json"), "utf8")
    ).rejects.toMatchObject({ code: "ENOENT" });

    const storage = await readCanonicalStorage(projectRoot);
    expect(storage.ok).toBe(true);
    if (!storage.ok) {
      return;
    }

    const statuses = new Map(
      storage.data.objects.map((object) => [object.sidecar.id, object.sidecar.status])
    );

    expect(statuses.get("decision.legacy-draft")).toBe("active");
    expect(statuses.get("decision.legacy-active")).toBe("active");
    expect(statuses.get("decision.legacy-stale")).toBe("stale");
    expect(statuses.get("decision.legacy-superseded")).toBe("superseded");
    expect(statuses.get("question.legacy-open")).toBe("open");
    expect(statuses.get("question.legacy-closed")).toBe("closed");
    expect(statuses.get("question.legacy-active-question")).toBe("open");
    expect(statuses.has("note.legacy-rejected")).toBe(false);
    expect(storage.data.relations.some((relation) => relation.relation.id === "rel.legacy-rejected-reference")).toBe(false);
    expect(storage.data.events).toEqual([
      expect.objectContaining({
        event: "memory.deleted",
        id: "note.legacy-rejected",
        reason: "Legacy rejection event"
      })
    ]);
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

async function createLegacyV2LifecycleProject(): Promise<string> {
  const projectRoot = await mkdtemp(join(tmpdir(), "aictx-upgrade-v2-"));
  tempRoots.push(projectRoot);

  await mkdir(join(projectRoot, ".aictx/memory/decisions"), { recursive: true });
  await mkdir(join(projectRoot, ".aictx/memory/questions"), { recursive: true });
  await mkdir(join(projectRoot, ".aictx/memory/notes"), { recursive: true });
  await mkdir(join(projectRoot, ".aictx/relations"), { recursive: true });
  await mkdir(join(projectRoot, ".aictx/schema"), { recursive: true });

  for (const file of Object.values(SCHEMA_FILES)) {
    await copyFile(join(root, "src/schemas", file), join(projectRoot, ".aictx/schema", file));
  }

  await writePermissiveLegacyObjectSchema(projectRoot);
  await writePermissiveLegacyEventSchema(projectRoot);
  await writeFile(
    join(projectRoot, ".aictx/config.json"),
    `${JSON.stringify({
      version: 2,
      project: { id: "project.legacy-api", name: "Legacy API" },
      memory: { defaultTokenBudget: 6000, autoIndex: true, saveContextPacks: false },
      git: { trackContextPacks: false }
    }, null, 2)}\n`,
    "utf8"
  );
  await writeFile(
    join(projectRoot, ".aictx/events.jsonl"),
    `${JSON.stringify({
      event: "memory.rejected",
      id: "note.legacy-rejected",
      actor: "agent",
      timestamp: "2026-04-25T13:00:00+02:00",
      reason: "Legacy rejection event"
    })}\n`,
    "utf8"
  );

  await writeLegacyObject(projectRoot, {
    id: "decision.legacy-draft",
    type: "decision",
    status: "draft",
    title: "Legacy draft",
    directory: "decisions"
  });
  await writeLegacyObject(projectRoot, {
    id: "decision.legacy-active",
    type: "decision",
    status: "active",
    title: "Legacy active",
    directory: "decisions"
  });
  await writeLegacyObject(projectRoot, {
    id: "decision.legacy-stale",
    type: "decision",
    status: "stale",
    title: "Legacy stale",
    directory: "decisions"
  });
  await writeLegacyObject(projectRoot, {
    id: "decision.legacy-superseded",
    type: "decision",
    status: "superseded",
    title: "Legacy superseded",
    directory: "decisions",
    superseded_by: "decision.legacy-active"
  });
  await writeLegacyObject(projectRoot, {
    id: "question.legacy-open",
    type: "question",
    status: "open",
    title: "Legacy open",
    directory: "questions"
  });
  await writeLegacyObject(projectRoot, {
    id: "question.legacy-closed",
    type: "question",
    status: "closed",
    title: "Legacy closed",
    directory: "questions"
  });
  await writeLegacyObject(projectRoot, {
    id: "question.legacy-active-question",
    type: "question",
    status: "active",
    title: "Legacy active question",
    directory: "questions"
  });
  await writeLegacyObject(projectRoot, {
    id: "note.legacy-rejected",
    type: "note",
    status: "rejected",
    title: "Legacy rejected",
    directory: "notes"
  });

  const relationWithoutHash = {
    id: "rel.legacy-rejected-reference",
    from: "decision.legacy-active",
    predicate: "mentions",
    to: "note.legacy-rejected",
    status: "active",
    confidence: "high",
    created_at: "2026-04-25T13:00:00+02:00",
    updated_at: "2026-04-25T13:00:00+02:00"
  };
  await writeFile(
    join(projectRoot, ".aictx/relations/legacy-rejected-reference.json"),
    `${JSON.stringify(
      {
        ...relationWithoutHash,
        content_hash: computeRelationContentHash(relationWithoutHash)
      },
      null,
      2
    )}\n`,
    "utf8"
  );

  return projectRoot;
}

async function writePermissiveLegacyObjectSchema(projectRoot: string): Promise<void> {
  await writeFile(
    join(projectRoot, ".aictx/schema/object.schema.json"),
    `${JSON.stringify(
      {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        $id: "https://aictx.dev/schemas/v2/object.schema.json",
        type: "object"
      },
      null,
      2
    )}\n`,
    "utf8"
  );
}

async function writePermissiveLegacyEventSchema(projectRoot: string): Promise<void> {
  await writeFile(
    join(projectRoot, ".aictx/schema/event.schema.json"),
    `${JSON.stringify(
      {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        $id: "https://aictx.dev/schemas/v2/event.schema.json",
        type: "object"
      },
      null,
      2
    )}\n`,
    "utf8"
  );
}

async function writeLegacyObject(
  projectRoot: string,
  input: {
    id: string;
    type: string;
    status: string;
    title: string;
    directory: string;
    superseded_by?: string;
  }
): Promise<void> {
  const slug = input.id.slice(input.id.indexOf(".") + 1);
  const bodyPath = `memory/${input.directory}/${slug}.md`;
  const body = `# ${input.title}\n\nLegacy ${input.status} memory.\n`;
  const sidecarWithoutHash: Record<string, unknown> = {
    id: input.id,
    type: input.type,
    status: input.status,
    title: input.title,
    body_path: bodyPath,
    scope: {
      kind: "project",
      project: "project.legacy-api",
      branch: null,
      task: null
    },
    tags: ["legacy"],
    source: { kind: "agent" },
    created_at: "2026-04-25T13:00:00+02:00",
    updated_at: "2026-04-25T13:00:00+02:00"
  };

  if (input.superseded_by !== undefined) {
    sidecarWithoutHash.superseded_by = input.superseded_by;
  }

  await writeFile(join(projectRoot, ".aictx", bodyPath), body, "utf8");
  await writeFile(
    join(projectRoot, ".aictx", bodyPath.replace(/\.md$/, ".json")),
    `${JSON.stringify(
      {
        ...sidecarWithoutHash,
        content_hash: computeObjectContentHash(sidecarWithoutHash, body)
      },
      null,
      2
    )}\n`,
    "utf8"
  );
}
