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
    const projectRoot = await createTempRoot("memory-export-obsidian-unit-");
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
      ".memory/exports/obsidian/index.md",
      ".memory/exports/obsidian/memory/constraint.webhook-idempotency.md",
      ".memory/exports/obsidian/memory/decision.billing-retries.md",
      ".memory/exports/obsidian/.memory-obsidian-export.json"
    ]);
    expect(result.data.files_removed).toEqual([]);

    const decisionNote = await readProjectFile(
      projectRoot,
      ".memory/exports/obsidian/memory/decision.billing-retries.md"
    );
    const frontmatter = parseJsonFrontmatter(decisionNote);

    expect(frontmatter).toMatchObject({
      memory_id: "decision.billing-retries",
      memory_title: "Billing retries",
      memory_type: "decision",
      memory_status: "active",
      memory_scope_kind: "project",
      memory_scope_project: "project.billing-api",
      memory_created_at: FIXED_TIMESTAMP,
      memory_updated_at: FIXED_TIMESTAMP_NEXT_MINUTE,
      aliases: ["Billing retries"],
      tags: ["billing", "retries"],
      memory_rel_requires: ["[[memory/constraint.webhook-idempotency]]"]
    });
    expect(frontmatter).not.toHaveProperty("memory_rel_mentions");
    expect(decisionNote).toContain("# Billing retries\n\nRetries run in the queue worker.\n");
    expect(decisionNote).toContain(
      "- requires: [[memory/constraint.webhook-idempotency]]"
    );
  });

  it("exports gotcha and workflow objects", async () => {
    const projectRoot = await createTempRoot("memory-export-obsidian-types-");
    const baseStorage = fixtureStorage(projectRoot);
    const storage = {
      ...baseStorage,
      objects: [
        ...baseStorage.objects,
        memoryObject({
          id: "gotcha.webhook-duplicates",
          type: "gotcha",
          status: "active",
          title: "Webhook duplicates",
          bodyPath: "memory/gotchas/webhook-duplicates.md",
          body: "# Webhook duplicates\n\nNever assume webhook delivery is unique.\n",
          tags: ["webhook"]
        }),
        memoryObject({
          id: "workflow.release-checklist",
          type: "workflow",
          status: "active",
          title: "Release checklist",
          bodyPath: "memory/workflows/release-checklist.md",
          body: "# Release checklist\n\nRun the release checklist before publishing.\n",
          tags: ["release"]
        })
      ]
    };

    const result = await exportObsidianProjection({ projectRoot, storage });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.data.files_written).toEqual(
      expect.arrayContaining([
        ".memory/exports/obsidian/memory/gotcha.webhook-duplicates.md",
        ".memory/exports/obsidian/memory/workflow.release-checklist.md"
      ])
    );

    const gotchaNote = await readProjectFile(
      projectRoot,
      ".memory/exports/obsidian/memory/gotcha.webhook-duplicates.md"
    );
    const workflowNote = await readProjectFile(
      projectRoot,
      ".memory/exports/obsidian/memory/workflow.release-checklist.md"
    );

    expect(parseJsonFrontmatter(gotchaNote)).toMatchObject({
      memory_id: "gotcha.webhook-duplicates",
      memory_type: "gotcha"
    });
    expect(parseJsonFrontmatter(workflowNote)).toMatchObject({
      memory_id: "workflow.release-checklist",
      memory_type: "workflow"
    });
  });

  it("writes source origin frontmatter", async () => {
    const projectRoot = await createTempRoot("memory-export-obsidian-origin-");
    const baseStorage = fixtureStorage(projectRoot);
    const storage = {
      ...baseStorage,
      objects: [
        ...baseStorage.objects,
        memoryObject({
          id: "source.llm-wiki",
          type: "source",
          status: "active",
          title: "LLM Wiki source",
          bodyPath: "memory/sources/llm-wiki.md",
          body: "# LLM Wiki source\n\nSource-backed wiki workflow article.\n",
          tags: ["wiki"],
          origin: {
            kind: "url",
            locator: "https://example.com/llm-wiki",
            captured_at: FIXED_TIMESTAMP,
            digest: `sha256:${"1".repeat(64)}`,
            media_type: "text/markdown"
          }
        })
      ]
    };

    const result = await exportObsidianProjection({ projectRoot, storage });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const sourceNote = await readProjectFile(
      projectRoot,
      ".memory/exports/obsidian/memory/source.llm-wiki.md"
    );

    expect(parseJsonFrontmatter(sourceNote)).toMatchObject({
      memory_id: "source.llm-wiki",
      memory_origin_kind: "url",
      memory_origin_locator: "https://example.com/llm-wiki",
      memory_origin_captured_at: FIXED_TIMESTAMP,
      memory_origin_digest: `sha256:${"1".repeat(64)}`,
      memory_origin_media_type: "text/markdown"
    });
  });

  it("rejects unsafe output targets", async () => {
    const projectRoot = await createTempRoot("memory-export-obsidian-unsafe-");
    const storage = fixtureStorage(projectRoot);

    for (const outDir of [".", "../outside", ".memory", ".memory/memory", ".memory/exports"]) {
      const result = await exportObsidianProjection({ projectRoot, storage, outDir });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("MemoryExportTargetInvalid");
      }
    }
  });

  it("rejects non-empty unmanifested output directories and invalid manifests", async () => {
    const projectRoot = await createTempRoot("memory-export-obsidian-target-");
    const storage = fixtureStorage(projectRoot);
    await writeProjectFile(projectRoot, "vault/user.md", "# User\n");

    const unmanifested = await exportObsidianProjection({
      projectRoot,
      storage,
      outDir: "vault"
    });

    expect(unmanifested.ok).toBe(false);
    if (!unmanifested.ok) {
      expect(unmanifested.error.code).toBe("MemoryExportTargetInvalid");
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
      expect(invalidManifest.error.code).toBe("MemoryExportTargetInvalid");
    }
  });

  it("removes stale manifest-owned files while preserving unmanifested files", async () => {
    const projectRoot = await createTempRoot("memory-export-obsidian-stale-");
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
    const projectRoot = await createTempRoot("memory-export-obsidian-symlink-");
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
      expect(symlinkResult.error.code).toBe("MemoryExportTargetInvalid");
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
      expect(conflict.error.code).toBe("MemoryExportTargetInvalid");
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
    memoryRoot: join(projectRoot, ".memory"),
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
  origin?: StoredMemoryObject["sidecar"]["origin"];
}): StoredMemoryObject {
  return {
    path: `.memory/${options.bodyPath.replace(/\.md$/, ".json")}`,
    bodyPath: `.memory/${options.bodyPath}`,
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
      ...(options.origin === undefined ? {} : { origin: options.origin }),
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
    path: `.memory/relations/${options.id.replace(/^rel\./, "")}.json`,
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
