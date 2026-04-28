import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  DEFAULT_OBSIDIAN_EXPORT_DIR,
  OBSIDIAN_EXPORT_MANIFEST_FILENAME,
  exportObsidianProjection
} from "../../../src/export/obsidian.js";
import type { ObjectStatus, ObjectType } from "../../../src/core/types.js";
import type { StoredMemoryObject } from "../../../src/storage/objects.js";
import type { CanonicalStorageSnapshot } from "../../../src/storage/read.js";
import type { MemoryRelation, StoredMemoryRelation } from "../../../src/storage/relations.js";
import { FIXED_TIMESTAMP, FIXED_TIMESTAMP_NEXT_MINUTE } from "../../fixtures/time.js";

const tempRoots: string[] = [];
const hash = `sha256:${"0".repeat(64)}`;

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true }))
  );
});

describe("exportObsidianProjection", () => {
  it("writes notes with JSON frontmatter, aliases, tags, body, and active relation links", async () => {
    const projectRoot = await createTempRoot("aictx-export-obsidian-unit-");
    const storage = fixtureStorage(projectRoot);

    const result = await exportObsidianProjection({ projectRoot, storage });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.data).toMatchObject({
      format: "obsidian",
      output_dir: DEFAULT_OBSIDIAN_EXPORT_DIR,
      manifest_path: `${DEFAULT_OBSIDIAN_EXPORT_DIR}/${OBSIDIAN_EXPORT_MANIFEST_FILENAME}`,
      objects_exported: 2,
      relations_linked: 1
    });
    expect(result.data.files_written).toEqual([
      ".aictx/exports/obsidian/index.md",
      ".aictx/exports/obsidian/memory/constraint.webhook-idempotency.md",
      ".aictx/exports/obsidian/memory/decision.billing-retries.md",
      ".aictx/exports/obsidian/.aictx-obsidian-export.json"
    ]);
    expect(result.data.files_removed).toEqual([]);

    const decisionNote = await readProjectFile(
      projectRoot,
      ".aictx/exports/obsidian/memory/decision.billing-retries.md"
    );
    const frontmatter = parseJsonFrontmatter(decisionNote);

    expect(frontmatter).toMatchObject({
      aictx_id: "decision.billing-retries",
      aictx_title: "Billing retries",
      aictx_type: "decision",
      aictx_status: "active",
      aictx_scope_kind: "project",
      aictx_scope_project: "project.billing-api",
      aictx_created_at: FIXED_TIMESTAMP,
      aictx_updated_at: FIXED_TIMESTAMP_NEXT_MINUTE,
      aliases: ["Billing retries"],
      tags: ["billing", "retries"],
      aictx_rel_requires: ["[[memory/constraint.webhook-idempotency]]"]
    });
    expect(frontmatter).not.toHaveProperty("aictx_rel_mentions");
    expect(decisionNote).toContain("# Billing retries\n\nRetries run in the queue worker.\n");
    expect(decisionNote).toContain(
      "- requires: [[memory/constraint.webhook-idempotency]]"
    );
  });

  it("rejects unsafe output targets", async () => {
    const projectRoot = await createTempRoot("aictx-export-obsidian-unsafe-");
    const storage = fixtureStorage(projectRoot);

    for (const outDir of [".", "../outside", ".aictx", ".aictx/memory", ".aictx/exports"]) {
      const result = await exportObsidianProjection({ projectRoot, storage, outDir });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("AICtxExportTargetInvalid");
      }
    }
  });

  it("rejects non-empty unmanifested output directories and invalid manifests", async () => {
    const projectRoot = await createTempRoot("aictx-export-obsidian-target-");
    const storage = fixtureStorage(projectRoot);
    await writeProjectFile(projectRoot, "vault/user.md", "# User\n");

    const unmanifested = await exportObsidianProjection({
      projectRoot,
      storage,
      outDir: "vault"
    });

    expect(unmanifested.ok).toBe(false);
    if (!unmanifested.ok) {
      expect(unmanifested.error.code).toBe("AICtxExportTargetInvalid");
    }

    await rm(join(projectRoot, "vault"), { recursive: true, force: true });
    await writeProjectFile(
      projectRoot,
      `vault/${OBSIDIAN_EXPORT_MANIFEST_FILENAME}`,
      "{bad json"
    );

    const invalidManifest = await exportObsidianProjection({
      projectRoot,
      storage,
      outDir: "vault"
    });

    expect(invalidManifest.ok).toBe(false);
    if (!invalidManifest.ok) {
      expect(invalidManifest.error.code).toBe("AICtxExportTargetInvalid");
    }
  });

  it("removes stale manifest-owned files while preserving unmanifested files", async () => {
    const projectRoot = await createTempRoot("aictx-export-obsidian-stale-");
    const storage = fixtureStorage(projectRoot);

    const first = await exportObsidianProjection({ projectRoot, storage, outDir: "vault" });
    expect(first.ok).toBe(true);
    await writeProjectFile(projectRoot, "vault/unmanifested.md", "# Keep me\n");

    const nextStorage = {
      ...storage,
      objects: storage.objects.filter(
        (object) => object.sidecar.id !== "decision.billing-retries"
      ),
      relations: []
    };
    const second = await exportObsidianProjection({
      projectRoot,
      storage: nextStorage,
      outDir: "vault"
    });

    expect(second.ok).toBe(true);
    if (!second.ok) {
      return;
    }

    expect(second.data.files_removed).toEqual([
      "vault/memory/decision.billing-retries.md"
    ]);
    await expect(readProjectFile(projectRoot, "vault/unmanifested.md")).resolves.toBe(
      "# Keep me\n"
    );
    await expect(
      readProjectFile(projectRoot, "vault/memory/decision.billing-retries.md")
    ).rejects.toThrow();
  });

  it("rejects symlink targets and unmanifested generated-file conflicts", async () => {
    const projectRoot = await createTempRoot("aictx-export-obsidian-symlink-");
    const storage = fixtureStorage(projectRoot);
    await mkdir(join(projectRoot, "real-vault"), { recursive: true });
    await symlink(join(projectRoot, "real-vault"), join(projectRoot, "vault-link"));

    const symlinkResult = await exportObsidianProjection({
      projectRoot,
      storage,
      outDir: "vault-link"
    });

    expect(symlinkResult.ok).toBe(false);
    if (!symlinkResult.ok) {
      expect(symlinkResult.error.code).toBe("AICtxExportTargetInvalid");
    }

    await writeProjectFile(
      projectRoot,
      `vault/${OBSIDIAN_EXPORT_MANIFEST_FILENAME}`,
      `${JSON.stringify({ format: "obsidian", version: 1, files: [] }, null, 2)}\n`
    );
    await writeProjectFile(
      projectRoot,
      "vault/memory/decision.billing-retries.md",
      "# User-owned collision\n"
    );

    const conflict = await exportObsidianProjection({
      projectRoot,
      storage,
      outDir: "vault"
    });

    expect(conflict.ok).toBe(false);
    if (!conflict.ok) {
      expect(conflict.error.code).toBe("AICtxExportTargetInvalid");
    }
  });
});

function fixtureStorage(projectRoot: string): CanonicalStorageSnapshot {
  const decision = memoryObject({
    id: "decision.billing-retries",
    type: "decision",
    status: "active",
    title: "Billing retries",
    bodyPath: "memory/decisions/billing-retries.md",
    body: "# Billing retries\n\nRetries run in the queue worker.\n",
    tags: ["billing", "retries"],
    updatedAt: FIXED_TIMESTAMP_NEXT_MINUTE
  });
  const constraint = memoryObject({
    id: "constraint.webhook-idempotency",
    type: "constraint",
    status: "active",
    title: "Webhook idempotency",
    bodyPath: "memory/constraints/webhook-idempotency.md",
    body: "# Webhook idempotency\n\nDeduplicate webhook delivery IDs.\n",
    tags: ["webhooks"]
  });

  return {
    projectRoot,
    aictxRoot: join(projectRoot, ".aictx"),
    config: {
      version: 1,
      project: {
        id: "project.billing-api",
        name: "Billing API"
      },
      memory: {
        defaultTokenBudget: 6000,
        autoIndex: true,
        saveContextPacks: false
      },
      git: {
        trackContextPacks: false
      }
    },
    objects: [decision, constraint],
    relations: [
      relation({
        id: "rel.decision-requires-idempotency",
        from: "decision.billing-retries",
        predicate: "requires",
        to: "constraint.webhook-idempotency",
        status: "active"
      }),
      relation({
        id: "rel.decision-mentions-idempotency",
        from: "decision.billing-retries",
        predicate: "mentions",
        to: "constraint.webhook-idempotency",
        status: "stale"
      })
    ],
    events: []
  };
}

function memoryObject(options: {
  id: string;
  type: ObjectType;
  status: ObjectStatus;
  title: string;
  bodyPath: string;
  body: string;
  tags: string[];
  updatedAt?: string;
}): StoredMemoryObject {
  return {
    path: `.aictx/${options.bodyPath.replace(/\.md$/, ".json")}`,
    bodyPath: `.aictx/${options.bodyPath}`,
    body: options.body,
    sidecar: {
      id: options.id,
      type: options.type,
      status: options.status,
      title: options.title,
      body_path: options.bodyPath,
      scope: {
        kind: "project",
        project: "project.billing-api",
        branch: null,
        task: null
      },
      tags: options.tags,
      source: {
        kind: "agent"
      },
      content_hash: hash,
      created_at: FIXED_TIMESTAMP,
      updated_at: options.updatedAt ?? FIXED_TIMESTAMP
    }
  };
}

function relation(options: {
  id: string;
  from: string;
  predicate: MemoryRelation["predicate"];
  to: string;
  status: MemoryRelation["status"];
}): StoredMemoryRelation {
  return {
    path: `.aictx/relations/${options.id.replace(/^rel\./, "")}.json`,
    relation: {
      id: options.id,
      from: options.from,
      predicate: options.predicate,
      to: options.to,
      status: options.status,
      content_hash: hash,
      created_at: FIXED_TIMESTAMP,
      updated_at: FIXED_TIMESTAMP
    }
  };
}

async function createTempRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  const resolvedRoot = await realpath(root);
  tempRoots.push(resolvedRoot);
  return resolvedRoot;
}

async function writeProjectFile(
  projectRoot: string,
  relativePath: string,
  contents: string
): Promise<void> {
  const target = join(projectRoot, relativePath);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, contents, "utf8");
}

async function readProjectFile(projectRoot: string, relativePath: string): Promise<string> {
  return readFile(join(projectRoot, relativePath), "utf8");
}

function parseJsonFrontmatter(markdown: string): Record<string, unknown> {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(markdown);
  expect(match?.[1]).toBeDefined();
  return JSON.parse(match?.[1] ?? "{}") as Record<string, unknown>;
}
