import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  bootstrapCandidateFiles,
  buildSuggestBootstrapPacket,
  buildSuggestFromDiffPacket
} from "../../../src/discipline/suggest.js";
import type { ObjectId, ObjectStatus, ObjectType } from "../../../src/core/types.js";
import type { MemoryObjectSidecar, StoredMemoryObject } from "../../../src/storage/objects.js";
import type { CanonicalStorageSnapshot } from "../../../src/storage/read.js";
import type { MemoryRelation, StoredMemoryRelation } from "../../../src/storage/relations.js";

const tempRoots: string[] = [];
const TIMESTAMP = "2026-04-25T14:00:00+02:00";

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true }))
  );
});

describe("suggest discipline packets", () => {
  it("builds deterministic from-diff packets from changed files and canonical memory", () => {
    const storage = storageSnapshot({
      objects: [
        memoryObject({
          id: "decision.webhook-retries",
          type: "decision",
          status: "active",
          title: "Webhook retries",
          body: "Webhook retries are handled by src/billing/webhook.ts."
        }),
        memoryObject({
          id: "constraint.billing-idempotency",
          type: "constraint",
          status: "active",
          title: "Billing idempotency",
          body: "Billing operations must be idempotent.",
          tags: ["billing"]
        }),
        memoryObject({
          id: "note.queue",
          type: "note",
          status: "active",
          title: "Queue",
          body: "Async jobs use the project queue."
        }),
        memoryObject({
          id: "gotcha.old-webhook",
          type: "gotcha",
          status: "stale",
          title: "Old webhook gotcha",
          body: "Old notes mention src/billing/webhook.ts."
        }),
        memoryObject({
          id: "fact.unrelated",
          type: "fact",
          status: "active",
          title: "Unrelated",
          body: "This memory should not match."
        })
      ],
      relations: [
        relation({
          id: "rel.worker-affects-billing",
          from: "note.queue",
          to: "constraint.billing-idempotency",
          fileEvidence: "src/billing/worker.ts"
        })
      ]
    });

    const packet = buildSuggestFromDiffPacket({
      changedFiles: [
        "src/billing/worker.ts",
        "src/billing/webhook.ts",
        "src/billing/webhook.ts"
      ],
      storage
    });

    expect(packet).toEqual({
      mode: "from_diff",
      changed_files: ["src/billing/webhook.ts", "src/billing/worker.ts"],
      related_memory_ids: [
        "constraint.billing-idempotency",
        "decision.webhook-retries",
        "gotcha.old-webhook",
        "note.queue"
      ],
      possible_stale_ids: [
        "constraint.billing-idempotency",
        "decision.webhook-retries"
      ],
      recommended_memory: ["decision", "constraint", "gotcha", "workflow", "fact"],
      agent_checklist: [
        "Create memory only for durable future value.",
        "Prefer updating, marking stale, or superseding existing memory over creating duplicates.",
        "Use current code, tests, manifests, and user instructions as evidence.",
        "Keep each memory object short, linked, and reviewable.",
        "Save nothing if the work produced no durable future value."
      ]
    });
  });

  it("ranks bootstrap candidate files and ignores generated or hidden Aictx files", async () => {
    const projectRoot = await createTempRoot("aictx-discipline-bootstrap-rank-");
    await writeProjectFile(projectRoot, "README.md", "# Test\n");
    await writeProjectFile(projectRoot, "package.json", "{}\n");
    await writeProjectFile(projectRoot, "docs/guide.md", "# Guide\n");
    await writeProjectFile(projectRoot, "src/z.ts", "export const z = 1;\n");
    await writeProjectFile(projectRoot, "test/a.test.ts", "import { it } from 'vitest';\n");
    await writeProjectFile(projectRoot, "dist/generated.ts", "ignored\n");
    await writeProjectFile(projectRoot, ".aictx/memory/project.md", "ignored\n");
    await writeProjectFile(projectRoot, "node_modules/pkg/index.js", "ignored\n");

    await expect(bootstrapCandidateFiles(projectRoot)).resolves.toEqual([
      "README.md",
      "package.json",
      "docs/guide.md",
      "src/z.ts",
      "test/a.test.ts"
    ]);
  });

  it("builds bootstrap packets with bootstrap recommendations and existing matches", async () => {
    const projectRoot = await createTempRoot("aictx-discipline-bootstrap-packet-");
    await writeProjectFile(projectRoot, "README.md", "# Test\n");
    await writeProjectFile(projectRoot, "docs/guide.md", "# Guide\n");
    const storage = storageSnapshot({
      objects: [
        memoryObject({
          id: "workflow.guide",
          type: "workflow",
          status: "active",
          title: "Guide workflow",
          body: "The bootstrap guide lives in docs/guide.md."
        })
      ],
      relations: []
    });

    const packet = await buildSuggestBootstrapPacket({
      projectRoot,
      storage
    });

    expect(packet.mode).toBe("bootstrap");
    expect(packet.changed_files).toEqual(["README.md", "docs/guide.md"]);
    expect(packet.related_memory_ids).toEqual(["workflow.guide"]);
    expect(packet.possible_stale_ids).toEqual(["workflow.guide"]);
    expect(packet.recommended_memory).toEqual([
      "project",
      "architecture",
      "workflow",
      "constraint",
      "gotcha",
      "decision"
    ]);
    expect(packet.agent_checklist).toHaveLength(5);
  });
});

function storageSnapshot(options: {
  objects: StoredMemoryObject[];
  relations: StoredMemoryRelation[];
}): CanonicalStorageSnapshot {
  return {
    projectRoot: "/repo",
    aictxRoot: "/repo/.aictx",
    config: {
      version: 1,
      project: {
        id: "proj.test",
        name: "Test"
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
    objects: options.objects,
    relations: options.relations,
    events: []
  };
}

function memoryObject(options: {
  id: ObjectId;
  type: ObjectType;
  status: ObjectStatus;
  title: string;
  body: string;
  tags?: string[];
}): StoredMemoryObject {
  const slug = options.id.slice(options.id.indexOf(".") + 1);
  const sidecar: MemoryObjectSidecar = {
    id: options.id,
    type: options.type,
    status: options.status,
    title: options.title,
    body_path: `memory/${slug}.md`,
    scope: {
      kind: "project",
      project: "proj.test",
      branch: null,
      task: null
    },
    tags: options.tags ?? [],
    source: {
      kind: "agent"
    },
    superseded_by: null,
    content_hash: "sha256:test",
    created_at: TIMESTAMP,
    updated_at: TIMESTAMP
  };

  return {
    path: `.aictx/memory/${slug}.json`,
    bodyPath: `.aictx/${sidecar.body_path}`,
    sidecar,
    body: options.body
  };
}

function relation(options: {
  id: string;
  from: ObjectId;
  to: ObjectId;
  fileEvidence: string;
}): StoredMemoryRelation {
  const relationData: MemoryRelation = {
    id: options.id,
    from: options.from,
    predicate: "affects",
    to: options.to,
    status: "active",
    confidence: "medium",
    evidence: [
      {
        kind: "file",
        id: options.fileEvidence
      }
    ],
    content_hash: "sha256:relation",
    created_at: TIMESTAMP,
    updated_at: TIMESTAMP
  };

  return {
    path: `.aictx/relations/${options.id}.json`,
    relation: relationData
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
