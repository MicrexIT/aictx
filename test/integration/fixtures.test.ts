import { readFile } from "node:fs/promises";
import { join } from "node:path";

import fg from "fast-glob";
import { describe, expect, it } from "vitest";

import {
  computeObjectContentHash,
  computeRelationContentHash
} from "../../src/storage/hashes.js";
import { readCanonicalStorage } from "../../src/storage/read.js";
import { validateProject } from "../../src/validation/validate.js";

const fixtureRoot = join(process.cwd(), "test", "fixtures", "golden-storage");
const missingBodyHashExclusion = "invalid-missing-body/.memory/memory/project.json";

const validFixtures = [
  {
    name: "minimal-valid",
    counts: {
      objects: 1,
      relations: 0,
      events: 0
    }
  },
  {
    name: "rich-valid",
    counts: {
      objects: 5,
      relations: 3,
      events: 8
    }
  }
] as const;

const invalidFixtures = [
  ["invalid-jsonl", "EventJsonlInvalid"],
  ["invalid-missing-body", "ObjectBodyMissing"],
  ["invalid-bad-relation", "RelationEndpointMissing"],
  ["invalid-conflict-marker", "MemoryConflictDetected"]
] as const;

const expectedHashes = {
  "invalid-bad-relation/.memory/memory/project.json":
    "sha256:2f2cdbcf05fae78f8d4de7ef87a2b996841f3e623973147133068eef6809d867",
  "invalid-bad-relation/.memory/relations/project-mentions-missing-note.json":
    "sha256:9c1e6e96eb27cbac863ac4c000be3c9c0b6e138b33bb68633874f71fae848896",
  "invalid-conflict-marker/.memory/memory/project.json":
    "sha256:05d3f50fff04f3ecbcbb79d56fc625a85234a40f7d353b37fae1eba8ae905014",
  "invalid-jsonl/.memory/memory/project.json":
    "sha256:91969cac20e117f500b27d97c8cbfa49742ed6c627a7c149321bb6865f978ea2",
  "minimal-valid/.memory/memory/project.json":
    "sha256:30153f876a0f023778d256e5056c4aa70860d7c9f845011a4a0959682ec59b2c",
  "rich-valid/.memory/memory/architecture.json":
    "sha256:926082d2792d7d2111fd4a2f09745ef5960307c3553d044ded787dd07c158feb",
  "rich-valid/.memory/memory/constraints/hashes-deterministic.json":
    "sha256:9d92cb730f2eb8693dbe0cd1f7a07618efb9fc3f4548767d1e291ec3df84c04a",
  "rich-valid/.memory/memory/decisions/storage-fixtures.json":
    "sha256:057bc3780887291a5a13a959dbc8fdaab20db1ee1ec2081fc21b906c407c92c0",
  "rich-valid/.memory/memory/project.json":
    "sha256:4ac3c49a8500a447001c309840ac7f37ca3673d8d2ccb40480ab9a753bda943b",
  "rich-valid/.memory/memory/questions/fixture-refresh.json":
    "sha256:a4ca66c8f4d7e1fbd6666328905a86118bc29a16ff74cdf27ed8f4908dd00efb",
  "rich-valid/.memory/relations/architecture-mentions-decision.json":
    "sha256:b3a53094f208c6d4b1dd2bc54e5b134d3b6447fcc46c75da9e9ecadfa603c1b7",
  "rich-valid/.memory/relations/question-related-to-decision.json":
    "sha256:dc1cd26eb708f9ad0ffb2077c54e026729506df6424f5dc571f219fbffefbf96",
  "rich-valid/.memory/relations/storage-fixtures-requires-hashes.json":
    "sha256:2e4d55a556a1efadf038d79fa4f1006bd2ed45726c2c79b3ad2df914d3d59fd5"
} as const satisfies Record<string, string>;

describe("golden storage fixtures", () => {
  it.each(validFixtures)("validates $name cleanly and reads expected counts", async (fixture) => {
    const projectRoot = projectFixtureRoot(fixture.name);
    const validation = await validateProject(projectRoot);

    expect(validation).toEqual({
      valid: true,
      errors: [],
      warnings: []
    });

    const storage = await readCanonicalStorage(projectRoot);

    expect(storage.ok).toBe(true);
    if (!storage.ok) {
      throw new Error(storage.error.message);
    }

    expect(storage.data.objects).toHaveLength(fixture.counts.objects);
    expect(storage.data.relations).toHaveLength(fixture.counts.relations);
    expect(storage.data.events).toHaveLength(fixture.counts.events);
  });

  it.each(invalidFixtures)(
    "reports only %s fixture errors as %s",
    async (fixture, expectedCode) => {
      const validation = await validateProject(projectFixtureRoot(fixture));

      expect(validation.valid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
      expect(validation.errors.every((issue) => issue.code === expectedCode)).toBe(true);
      expect(validation.warnings).toEqual([]);
    }
  );

  it("keeps committed fixture hashes deterministic", async () => {
    await expect(collectFixtureHashes()).resolves.toEqual(expectedHashes);
  });
});

function projectFixtureRoot(name: string): string {
  return join(fixtureRoot, name);
}

async function collectFixtureHashes(): Promise<Record<string, string>> {
  const paths = (
    await fg("**/.memory/{memory,relations}/**/*.json", {
      cwd: fixtureRoot,
      dot: true,
      onlyFiles: true,
      unique: true
    })
  ).sort();
  const hashes: Record<string, string> = {};

  for (const path of paths) {
    if (path === missingBodyHashExclusion) {
      continue;
    }

    const value = await readJsonObject(path);
    const computedHash = path.includes("/.memory/memory/")
      ? await computeFixtureObjectHash(path, value)
      : computeFixtureRelationHash(path, value);

    expect(readStringField(value, "content_hash", path)).toBe(computedHash);
    hashes[path] = computedHash;
  }

  return hashes;
}

async function computeFixtureObjectHash(
  sidecarPath: string,
  sidecar: Record<string, unknown>
): Promise<string> {
  const bodyPath = readStringField(sidecar, "body_path", sidecarPath);
  const fixture = fixtureNameForPath(sidecarPath);
  const body = await readFile(join(fixtureRoot, fixture, ".memory", bodyPath), "utf8");

  return computeObjectContentHash(sidecar, body);
}

function computeFixtureRelationHash(
  relationPath: string,
  relation: Record<string, unknown>
): string {
  readStringField(relation, "content_hash", relationPath);

  return computeRelationContentHash(relation);
}

function fixtureNameForPath(path: string): string {
  const [fixture] = path.split("/.memory/", 1);

  if (fixture === undefined || fixture.length === 0) {
    throw new Error(`Fixture path is not inside a .memory tree: ${path}`);
  }

  return fixture;
}

async function readJsonObject(path: string): Promise<Record<string, unknown>> {
  const parsed = JSON.parse(await readFile(join(fixtureRoot, path), "utf8")) as unknown;

  if (!isRecord(parsed)) {
    throw new Error(`Fixture JSON must contain one object: ${path}`);
  }

  return parsed;
}

function readStringField(
  value: Record<string, unknown>,
  field: string,
  path: string
): string {
  const fieldValue = value[field];

  if (typeof fieldValue !== "string") {
    throw new Error(`Fixture field must be a string at ${path}: ${field}`);
  }

  return fieldValue;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
