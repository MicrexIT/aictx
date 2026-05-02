import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  bootstrapCandidateFiles,
  buildSuggestBootstrapPatchProposal,
  buildSuggestBootstrapPacket,
  buildSuggestAfterTaskPacket,
  buildSuggestFromDiffPacket
} from "../../../src/discipline/suggest.js";
import type { ObjectId, ObjectStatus, ObjectType } from "../../../src/core/types.js";
import type { MemoryObjectSidecar, StoredMemoryObject } from "../../../src/storage/objects.js";
import type { CanonicalStorageSnapshot } from "../../../src/storage/read.js";
import type { MemoryRelation, StoredMemoryRelation } from "../../../src/storage/relations.js";
import { SCHEMA_FILES, compileProjectSchemas } from "../../../src/validation/schemas.js";
import { validatePatch } from "../../../src/validation/validate.js";

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
      recommended_evidence: [
        { kind: "file", id: "src/billing/webhook.ts" },
        { kind: "file", id: "src/billing/worker.ts" }
      ],
      recommended_relations: [
        {
          from: "decision.webhook-retries",
          predicate: "requires",
          to: "constraint.billing-idempotency",
          reason: "Related memory overlaps changed files but has no direct relation."
        }
      ],
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

  it("builds after-task packets with recommended facets and save/no-save checklist", () => {
    const storage = storageSnapshot({
      objects: [
        memoryObject({
          id: "decision.webhook-retries",
          type: "decision",
          status: "active",
          title: "Webhook retries",
          body: "Webhook retry behavior references src/billing/webhook.ts."
        })
      ],
      relations: []
    });

    const packet = buildSuggestAfterTaskPacket({
      task: "Refactor webhook tests",
      changedFiles: ["src/billing/webhook.ts", "test/billing/webhook.test.ts"],
      storage
    });

    expect(packet.mode).toBe("after_task");
    expect(packet.task).toBe("Refactor webhook tests");
    expect(packet.changed_files).toEqual([
      "src/billing/webhook.ts",
      "test/billing/webhook.test.ts"
    ]);
    expect(packet.related_memory_ids).toEqual(["decision.webhook-retries"]);
    expect(packet.recommended_evidence).toEqual([
      { kind: "file", id: "src/billing/webhook.ts" },
      { kind: "file", id: "test/billing/webhook.test.ts" }
    ]);
    expect(packet.recommended_facets).toEqual(
      expect.arrayContaining(["testing", "decision-rationale", "abandoned-attempt"])
    );
    expect(packet.save_decision_checklist).toContain(
      "Save memory only when the task produced durable future value."
    );
  });

  it("builds a conservative schema-valid bootstrap patch from deterministic evidence", async () => {
    const projectRoot = await createTempRoot("aictx-discipline-bootstrap-patch-");
    await writeProjectFile(
      projectRoot,
      "README.md",
      "# Billing API\n\nHandles recurring billing and webhook processing for Stripe.\n"
    );
    await writeJsonProjectFile(projectRoot, "package.json", {
      name: "@example/billing-api",
      description: "Billing API for Stripe webhook processing.",
      type: "module",
      packageManager: "pnpm@10.0.0",
      engines: {
        node: ">=22"
      },
      scripts: {
        build: "tsc --noEmit",
        test: "vitest run"
      },
      devDependencies: {
        vitest: "^4.0.0"
      }
    });
    await writeProjectFile(projectRoot, "tsconfig.json", "{}\n");
    await writeProjectFile(projectRoot, "src/index.ts", "export const value = 1;\n");
    await writeProjectFile(projectRoot, "test/index.test.ts", "import { it } from 'vitest';\n");
    await writeBundledSchemas(projectRoot);
    const storage = storageSnapshot({
      objects: [
        initialProjectObject("project.billing-api", "Billing API"),
        initialArchitectureObject("project.billing-api")
      ],
      relations: [],
      projectId: "project.billing-api",
      projectName: "Billing API"
    });

    const proposal = await buildSuggestBootstrapPatchProposal({
      projectRoot,
      storage
    });

    expect(proposal.proposed).toBe(true);
    expect(proposal.patch).not.toBeNull();
    expect(proposal.reason).toBeNull();
    expect(proposal.packet.mode).toBe("bootstrap");
    expect(proposal.patch?.changes.map((change) => change.op)).toEqual([
      "update_object",
      "update_object",
      "create_relation",
      "create_object",
      "create_object",
      "create_object"
    ]);
    expect(proposal.patch?.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ op: "update_object", id: "project.billing-api" }),
        expect.objectContaining({ op: "update_object", id: "architecture.current" }),
        expect.objectContaining({
          op: "create_relation",
          id: "rel.project-billing-api-related-to-architecture-current",
          from: "project.billing-api",
          predicate: "related_to",
          to: "architecture.current",
          status: "active",
          confidence: "high"
        }),
        expect.objectContaining({ op: "create_object", id: "workflow.package-scripts" }),
        expect.objectContaining({ op: "create_object", id: "constraint.node-engine" }),
        expect.objectContaining({ op: "create_object", id: "constraint.package-manager" })
      ])
    );
    const validators = await compileProjectSchemas(projectRoot);
    expect(validators.ok).toBe(true);
    if (validators.ok && proposal.patch !== null) {
      expect(validatePatch(validators.data, proposal.patch).valid).toBe(true);
    }
  });

  it("avoids duplicate bootstrap memories when deterministic objects already exist", async () => {
    const projectRoot = await createTempRoot("aictx-discipline-bootstrap-duplicates-");
    await writeJsonProjectFile(projectRoot, "package.json", {
      description: "Billing API for Stripe webhook processing.",
      packageManager: "pnpm@10.0.0",
      engines: {
        node: ">=22"
      },
      scripts: {
        build: "tsc --noEmit"
      }
    });
    await writeProjectFile(projectRoot, "src/index.ts", "export const value = 1;\n");
    const storage = storageSnapshot({
      objects: [
        initialProjectObject("project.billing-api", "Billing API"),
        initialArchitectureObject("project.billing-api"),
        memoryObject({
          id: "workflow.package-scripts",
          type: "workflow",
          status: "active",
          title: "Package scripts",
          body: "Existing package script workflow."
        }),
        memoryObject({
          id: "constraint.node-engine",
          type: "constraint",
          status: "active",
          title: "Node engine requirement",
          body: "Existing Node constraint."
        }),
        memoryObject({
          id: "constraint.package-manager",
          type: "constraint",
          status: "active",
          title: "Package manager",
          body: "Existing package manager constraint."
        })
      ],
      relations: [projectArchitectureRelation("project.billing-api")],
      projectId: "project.billing-api",
      projectName: "Billing API"
    });

    const proposal = await buildSuggestBootstrapPatchProposal({
      projectRoot,
      storage
    });

    expect(proposal.patch?.changes).toEqual([
      expect.objectContaining({ op: "update_object", id: "project.billing-api" })
    ]);
  });

  it("proposes the missing starter relation for older initialized projects", async () => {
    const projectRoot = await createTempRoot("aictx-discipline-bootstrap-starter-relation-");
    await writeProjectFile(projectRoot, "README.md", "# Tiny\n");
    const storage = storageSnapshot({
      objects: [
        initialProjectObject("project.tiny", "Tiny"),
        initialArchitectureObject("project.tiny")
      ],
      relations: [],
      projectId: "project.tiny",
      projectName: "Tiny"
    });

    const proposal = await buildSuggestBootstrapPatchProposal({
      projectRoot,
      storage
    });

    expect(proposal.proposed).toBe(true);
    expect(proposal.patch?.changes).toEqual([
      {
        op: "create_relation",
        id: "rel.project-tiny-related-to-architecture-current",
        from: "project.tiny",
        predicate: "related_to",
        to: "architecture.current",
        status: "active",
        confidence: "high"
      }
    ]);
  });

  it("returns a clear no-patch proposal for small repos without confident evidence", async () => {
    const projectRoot = await createTempRoot("aictx-discipline-bootstrap-minimal-");
    await writeProjectFile(projectRoot, "README.md", "# Tiny\n");
    await writeJsonProjectFile(projectRoot, "package.json", {});
    await writeProjectFile(projectRoot, "src/index.ts", "export const value = 1;\n");
    const storage = storageSnapshot({
      objects: [
        initialProjectObject("project.tiny", "Tiny"),
        initialArchitectureObject("project.tiny")
      ],
      relations: [projectArchitectureRelation("project.tiny")],
      projectId: "project.tiny",
      projectName: "Tiny"
    });

    const proposal = await buildSuggestBootstrapPatchProposal({
      projectRoot,
      storage
    });

    expect(proposal).toEqual(
      expect.objectContaining({
        proposed: false,
        patch: null,
        reason:
          "No high-confidence bootstrap memory patch could be generated from deterministic repository evidence."
      })
    );
    expect(proposal.packet.changed_files).toEqual(
      expect.arrayContaining(["README.md", "package.json", "src/index.ts"])
    );
  });
});

function storageSnapshot(options: {
  objects: StoredMemoryObject[];
  relations: StoredMemoryRelation[];
  projectId?: string;
  projectName?: string;
}): CanonicalStorageSnapshot {
  return {
    projectRoot: "/repo",
    aictxRoot: "/repo/.aictx",
    config: {
      version: 1,
      project: {
        id: options.projectId ?? "project.test",
        name: options.projectName ?? "Test"
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

function initialProjectObject(projectId: ObjectId, title: string): StoredMemoryObject {
  const body = `# ${title}\n\nProject-level memory for ${title}.\n`;

  return {
    path: ".aictx/memory/project.json",
    bodyPath: ".aictx/memory/project.md",
    sidecar: {
      id: projectId,
      type: "project",
      status: "active",
      title,
      body_path: "memory/project.md",
      scope: {
        kind: "project",
        project: projectId,
        branch: null,
        task: null
      },
      tags: [],
      source: {
        kind: "system"
      },
      superseded_by: null,
      content_hash: "sha256:test",
      created_at: TIMESTAMP,
      updated_at: TIMESTAMP
    },
    body
  };
}

function initialArchitectureObject(projectId: ObjectId): StoredMemoryObject {
  return {
    path: ".aictx/memory/architecture.json",
    bodyPath: ".aictx/memory/architecture.md",
    sidecar: {
      id: "architecture.current",
      type: "architecture",
      status: "active",
      title: "Current Architecture",
      body_path: "memory/architecture.md",
      scope: {
        kind: "project",
        project: projectId,
        branch: null,
        task: null
      },
      tags: [],
      source: {
        kind: "system"
      },
      superseded_by: null,
      content_hash: "sha256:test",
      created_at: TIMESTAMP,
      updated_at: TIMESTAMP
    },
    body: "# Current Architecture\n\nArchitecture memory starts here.\n"
  };
}

function projectArchitectureRelation(projectId: ObjectId): StoredMemoryRelation {
  const id = `rel.${projectId.replace(".", "-")}-related-to-architecture-current`;
  const relationData: MemoryRelation = {
    id,
    from: projectId,
    predicate: "related_to",
    to: "architecture.current",
    status: "active",
    confidence: "high",
    content_hash: "sha256:relation",
    created_at: TIMESTAMP,
    updated_at: TIMESTAMP
  };

  return {
    path: `.aictx/relations/${id.slice("rel.".length)}.json`,
    relation: relationData
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

async function writeJsonProjectFile(
  projectRoot: string,
  relativePath: string,
  value: unknown
): Promise<void> {
  await writeProjectFile(projectRoot, relativePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeBundledSchemas(projectRoot: string): Promise<void> {
  for (const schemaFile of Object.values(SCHEMA_FILES)) {
    const schema = await readFile(join(process.cwd(), "src", "schemas", schemaFile), "utf8");
    await writeProjectFile(projectRoot, `.aictx/schema/${schemaFile}`, schema);
  }
}
