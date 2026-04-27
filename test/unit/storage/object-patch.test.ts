import { access, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import fg from "fast-glob";
import { afterEach, describe, expect, it } from "vitest";

import type {
  GitState,
  ObjectId,
  ObjectStatus,
  ObjectType,
  Predicate,
  RelationId,
  RelationStatus,
  Source
} from "../../../src/core/types.js";
import {
  computeObjectContentHash,
  computeRelationContentHash
} from "../../../src/storage/hashes.js";
import type { MemoryObjectSidecar } from "../../../src/storage/objects.js";
import type { MemoryRelation } from "../../../src/storage/relations.js";
import { applyMemoryPatch } from "../../../src/storage/write.js";
import { SCHEMA_FILES } from "../../../src/validation/schemas.js";
import { createFixedTestClock, FIXED_TIMESTAMP } from "../../fixtures/time.js";

const repoRoot = process.cwd();
const tempRoots: string[] = [];
const projectId = "project.billing-api";
const originalTimestamp = "2026-04-25T13:00:00+02:00";
const noGit: GitState = {
  available: false,
  branch: null,
  commit: null,
  dirty: null
};
const validConfig = {
  version: 1,
  project: {
    id: projectId,
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
};

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true }))
  );
});

describe("applyMemoryPatch object operations", () => {
  it("creates and updates object bodies, sidecars, hashes, and events", async () => {
    const projectRoot = await createObjectPatchProject();
    const createdBody = "# Billing retries follow up\r\n\r\nCheck retry behavior.\r\n";
    const updatedBody = "# Billing retries run in the worker\n\nRetries now run in the queue worker.\n";

    const result = await applyMemoryPatch({
      projectRoot,
      patch: {
        source: {
          kind: "agent",
          task: "Document retry follow up"
        },
        changes: [
          {
            op: "create_object",
            type: "note",
            title: "Billing retries follow up",
            body: createdBody,
            tags: ["billing", "queue"]
          },
          {
            op: "update_object",
            id: "decision.billing-retries",
            title: "Billing retries run in the worker",
            body: updatedBody,
            tags: ["billing", "queue"],
            source: {
              kind: "user"
            }
          }
        ]
      },
      git: noGit,
      clock: createFixedTestClock(FIXED_TIMESTAMP)
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.data.memory_created).toEqual(["note.billing-retries-follow-up"]);
    expect(result.data.memory_updated).toEqual(["decision.billing-retries"]);
    expect(result.data.events_appended).toBe(2);
    expect(result.data.files_changed).toEqual([
      ".aictx/events.jsonl",
      ".aictx/memory/decisions/billing-retries.json",
      ".aictx/memory/decisions/billing-retries.md",
      ".aictx/memory/notes/billing-retries-follow-up.json",
      ".aictx/memory/notes/billing-retries-follow-up.md"
    ]);

    const createdSidecar = await readJsonProjectFile(
      projectRoot,
      ".aictx/memory/notes/billing-retries-follow-up.json"
    );
    const storedCreatedBody = await readProjectFile(
      projectRoot,
      ".aictx/memory/notes/billing-retries-follow-up.md"
    );

    expect(storedCreatedBody).toBe("# Billing retries follow up\n\nCheck retry behavior.\n");
    expect(createdSidecar).toEqual(
      expect.objectContaining({
        id: "note.billing-retries-follow-up",
        type: "note",
        status: "active",
        title: "Billing retries follow up",
        body_path: "memory/notes/billing-retries-follow-up.md",
        scope: {
          kind: "project",
          project: projectId,
          branch: null,
          task: null
        },
        tags: ["billing", "queue"],
        source: {
          kind: "agent",
          task: "Document retry follow up"
        },
        created_at: FIXED_TIMESTAMP,
        updated_at: FIXED_TIMESTAMP
      })
    );
    expectObjectHash(createdSidecar, storedCreatedBody);

    const updatedSidecar = await readJsonProjectFile(
      projectRoot,
      ".aictx/memory/decisions/billing-retries.json"
    );
    const storedUpdatedBody = await readProjectFile(
      projectRoot,
      ".aictx/memory/decisions/billing-retries.md"
    );

    expect(storedUpdatedBody).toBe(updatedBody);
    expect(updatedSidecar).toEqual(
      expect.objectContaining({
        id: "decision.billing-retries",
        type: "decision",
        status: "active",
        title: "Billing retries run in the worker",
        tags: ["billing", "queue"],
        source: {
          kind: "user"
        },
        created_at: originalTimestamp,
        updated_at: FIXED_TIMESTAMP
      })
    );
    expectObjectHash(updatedSidecar, storedUpdatedBody);

    expect(await readEvents(projectRoot)).toEqual([
      expect.objectContaining({
        event: "memory.created",
        id: "note.billing-retries-follow-up",
        actor: "agent",
        timestamp: FIXED_TIMESTAMP
      }),
      expect.objectContaining({
        event: "memory.updated",
        id: "decision.billing-retries",
        actor: "agent",
        timestamp: FIXED_TIMESTAMP
      })
    ]);
  });

  it("defaults questions to open status", async () => {
    const projectRoot = await createObjectPatchProject();

    const result = await applyMemoryPatch({
      projectRoot,
      patch: {
        source: {
          kind: "agent"
        },
        changes: [
          {
            op: "create_object",
            type: "question",
            title: "Retry backoff",
            body: "# Retry backoff\n\nWhich backoff policy should retries use?\n"
          }
        ]
      },
      git: noGit,
      clock: createFixedTestClock(FIXED_TIMESTAMP)
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const sidecar = await readJsonProjectFile(
      projectRoot,
      ".aictx/memory/questions/retry-backoff.json"
    );
    expect(sidecar.status).toBe("open");
    expectObjectHash(
      sidecar,
      await readProjectFile(projectRoot, ".aictx/memory/questions/retry-backoff.md")
    );
  });

  it.each([
    {
      name: "create",
      change: {
        op: "create_object",
        type: "note",
        title: "Open note",
        body: "# Open note\n\nBody.\n",
        status: "open"
      }
    },
    {
      name: "update",
      change: {
        op: "update_object",
        id: "decision.billing-retries",
        status: "closed"
      }
    }
  ])("rejects non-question $name status before disk mutation", async ({ change }) => {
    const projectRoot = await createObjectPatchProject();
    const before = await readAictxSnapshot(projectRoot);

    const result = await applyMemoryPatch({
      projectRoot,
      patch: {
        source: {
          kind: "agent"
        },
        changes: [change]
      },
      git: noGit,
      clock: createFixedTestClock(FIXED_TIMESTAMP)
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("AICtxPatchInvalid");
      expect(JSON.stringify(result.error.details)).toContain("ObjectStatusInvalid");
    }
    await expect(readAictxSnapshot(projectRoot)).resolves.toEqual(before);
  });

  it("marks objects stale while preserving the Markdown body", async () => {
    const projectRoot = await createObjectPatchProject();
    const beforeBody = await readProjectFile(projectRoot, ".aictx/memory/notes/old.md");

    const result = await applyMemoryPatch({
      projectRoot,
      patch: {
        source: {
          kind: "agent"
        },
        changes: [
          {
            op: "mark_stale",
            id: "note.old",
            reason: "The new note replaced this context."
          }
        ]
      },
      git: noGit,
      clock: createFixedTestClock(FIXED_TIMESTAMP)
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.data.memory_updated).toEqual(["note.old"]);
    expect(result.data.events_appended).toBe(1);
    expect(await readProjectFile(projectRoot, ".aictx/memory/notes/old.md")).toBe(beforeBody);

    const sidecar = await readJsonProjectFile(projectRoot, ".aictx/memory/notes/old.json");
    expect(sidecar).toEqual(
      expect.objectContaining({
        id: "note.old",
        status: "stale",
        created_at: originalTimestamp,
        updated_at: FIXED_TIMESTAMP
      })
    );
    expectObjectHash(sidecar, beforeBody);
    expect(await readEvents(projectRoot)).toEqual([
      expect.objectContaining({
        event: "memory.marked_stale",
        id: "note.old",
        reason: "The new note replaced this context."
      })
    ]);
  });

  it("supersedes objects and creates a replacement-to-old supersedes relation", async () => {
    const projectRoot = await createObjectPatchProject();
    const oldBody = await readProjectFile(projectRoot, ".aictx/memory/notes/old.md");

    const result = await applyMemoryPatch({
      projectRoot,
      patch: {
        source: {
          kind: "agent"
        },
        changes: [
          {
            op: "supersede_object",
            id: "note.old",
            superseded_by: "note.new",
            reason: "New note captures the current behavior."
          }
        ]
      },
      git: noGit,
      clock: createFixedTestClock(FIXED_TIMESTAMP)
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.data.memory_updated).toEqual(["note.old"]);
    expect(result.data.relations_created).toEqual(["rel.note-new-supersedes-note-old"]);
    expect(result.data.events_appended).toBe(1);

    const sidecar = await readJsonProjectFile(projectRoot, ".aictx/memory/notes/old.json");
    expect(sidecar).toEqual(
      expect.objectContaining({
        id: "note.old",
        status: "superseded",
        superseded_by: "note.new",
        updated_at: FIXED_TIMESTAMP
      })
    );
    expectObjectHash(sidecar, oldBody);

    const relation = await readJsonProjectFile(
      projectRoot,
      ".aictx/relations/note-new-supersedes-note-old.json"
    );
    expect(relation).toEqual(
      expect.objectContaining({
        id: "rel.note-new-supersedes-note-old",
        from: "note.new",
        predicate: "supersedes",
        to: "note.old",
        status: "active",
        created_at: FIXED_TIMESTAMP,
        updated_at: FIXED_TIMESTAMP
      })
    );
    expectRelationHash(relation);

    expect(await readEvents(projectRoot)).toEqual([
      expect.objectContaining({
        event: "memory.superseded",
        id: "note.old",
        reason: "New note captures the current behavior."
      })
    ]);
  });

  it("preserves an existing equivalent supersedes relation", async () => {
    const projectRoot = await createObjectPatchProject({ existingSupersedes: true });
    const beforeRelation = await readProjectFile(
      projectRoot,
      ".aictx/relations/new-supersedes-old.json"
    );

    const result = await applyMemoryPatch({
      projectRoot,
      patch: {
        source: {
          kind: "agent"
        },
        changes: [
          {
            op: "supersede_object",
            id: "note.old",
            superseded_by: "note.new",
            reason: "Existing relation already records the replacement."
          }
        ]
      },
      git: noGit,
      clock: createFixedTestClock(FIXED_TIMESTAMP)
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.data.relations_created).toEqual([]);
    expect(await readProjectFile(projectRoot, ".aictx/relations/new-supersedes-old.json")).toBe(
      beforeRelation
    );
  });

  it("deletes unreferenced objects and rejects active relation references", async () => {
    const projectRoot = await createObjectPatchProject();

    const deleted = await applyMemoryPatch({
      projectRoot,
      patch: {
        source: {
          kind: "agent"
        },
        changes: [
          {
            op: "delete_object",
            id: "note.delete-me"
          }
        ]
      },
      git: noGit,
      clock: createFixedTestClock(FIXED_TIMESTAMP)
    });

    expect(deleted.ok).toBe(true);
    if (!deleted.ok) {
      return;
    }

    expect(deleted.data.memory_deleted).toEqual(["note.delete-me"]);
    expect(deleted.data.events_appended).toBe(1);
    await expectPathMissing(projectRoot, ".aictx/memory/notes/delete-me.md");
    await expectPathMissing(projectRoot, ".aictx/memory/notes/delete-me.json");

    const blockedProjectRoot = await createObjectPatchProject();
    const before = await readAictxSnapshot(blockedProjectRoot);
    const blocked = await applyMemoryPatch({
      projectRoot: blockedProjectRoot,
      patch: {
        source: {
          kind: "agent"
        },
        changes: [
          {
            op: "delete_object",
            id: "note.blocked"
          }
        ]
      },
      git: noGit,
      clock: createFixedTestClock(FIXED_TIMESTAMP)
    });

    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.error.code).toBe("AICtxInvalidRelation");
      expect(JSON.stringify(blocked.error.details)).toContain("rel.blocked-mentions-decision");
    }
    await expect(readAictxSnapshot(blockedProjectRoot)).resolves.toEqual(before);
  });

  it("treats object updates without mutable fields as no-ops", async () => {
    const projectRoot = await createObjectPatchProject();
    const before = await readAictxSnapshot(projectRoot);

    const result = await applyMemoryPatch({
      projectRoot,
      patch: {
        source: {
          kind: "agent"
        },
        changes: [
          {
            op: "update_object",
            id: "decision.billing-retries"
          }
        ]
      },
      git: noGit,
      clock: createFixedTestClock(FIXED_TIMESTAMP)
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.data.memory_updated).toEqual([]);
    expect(result.data.events_appended).toBe(0);
    expect(result.data.files_changed).toEqual([]);
    await expect(readAictxSnapshot(projectRoot)).resolves.toEqual(before);
  });
});

async function createObjectPatchProject(
  options: { existingSupersedes?: boolean } = {}
): Promise<string> {
  const projectRoot = await mkdtemp(join(tmpdir(), "aictx-object-patch-"));
  tempRoots.push(projectRoot);
  await mkdir(join(projectRoot, ".aictx", "schema"), { recursive: true });

  for (const schemaFile of Object.values(SCHEMA_FILES)) {
    await copyFile(
      join(repoRoot, "src", "schemas", schemaFile),
      join(projectRoot, ".aictx", "schema", schemaFile)
    );
  }

  await writeJsonProjectFile(projectRoot, ".aictx/config.json", validConfig);
  await writeMemoryObject(projectRoot, {
    id: "decision.billing-retries",
    type: "decision",
    status: "active",
    title: "Billing retries moved to queue worker",
    bodyPath: "memory/decisions/billing-retries.md",
    body: "# Billing retries moved to queue worker\n\nRetries run in the queue worker.\n",
    tags: ["billing"]
  });
  await writeMemoryObject(projectRoot, {
    id: "constraint.webhook-idempotency",
    type: "constraint",
    status: "active",
    title: "Webhook processing must be idempotent",
    bodyPath: "memory/constraints/webhook-idempotency.md",
    body: "# Webhook processing must be idempotent\n\nDuplicate webhooks are expected.\n"
  });
  await writeMemoryObject(projectRoot, {
    id: "note.old",
    type: "note",
    status: "active",
    title: "Old note",
    bodyPath: "memory/notes/old.md",
    body: "# Old note\n\nOld behavior.\n"
  });
  await writeMemoryObject(projectRoot, {
    id: "note.new",
    type: "note",
    status: "active",
    title: "New note",
    bodyPath: "memory/notes/new.md",
    body: "# New note\n\nCurrent behavior.\n"
  });
  await writeMemoryObject(projectRoot, {
    id: "note.delete-me",
    type: "note",
    status: "active",
    title: "Delete me",
    bodyPath: "memory/notes/delete-me.md",
    body: "# Delete me\n\nThis import was accidental.\n"
  });
  await writeMemoryObject(projectRoot, {
    id: "note.blocked",
    type: "note",
    status: "active",
    title: "Blocked note",
    bodyPath: "memory/notes/blocked.md",
    body: "# Blocked note\n\nA relation still points here.\n"
  });
  await writeRelation(projectRoot, {
    id: "rel.blocked-mentions-decision",
    from: "note.blocked",
    predicate: "mentions",
    to: "decision.billing-retries",
    status: "active"
  });

  if (options.existingSupersedes === true) {
    await writeRelation(projectRoot, {
      id: "rel.new-supersedes-old",
      from: "note.new",
      predicate: "supersedes",
      to: "note.old",
      status: "stale"
    });
  }

  await writeProjectFile(projectRoot, ".aictx/events.jsonl", "");

  return projectRoot;
}

async function writeMemoryObject(
  projectRoot: string,
  fixture: {
    id: ObjectId;
    type: ObjectType;
    status: ObjectStatus;
    title: string;
    bodyPath: string;
    body: string;
    tags?: string[];
    source?: Source;
    supersededBy?: ObjectId | null;
  }
): Promise<void> {
  const sidecarWithoutHash: Omit<MemoryObjectSidecar, "content_hash"> = {
    id: fixture.id,
    type: fixture.type,
    status: fixture.status,
    title: fixture.title,
    body_path: fixture.bodyPath,
    scope: {
      kind: "project",
      project: projectId,
      branch: null,
      task: null
    },
    tags: fixture.tags ?? [],
    created_at: originalTimestamp,
    updated_at: originalTimestamp
  };

  if (fixture.source !== undefined) {
    sidecarWithoutHash.source = fixture.source;
  }

  if (fixture.supersededBy !== undefined) {
    sidecarWithoutHash.superseded_by = fixture.supersededBy;
  }

  const sidecar = {
    ...sidecarWithoutHash,
    content_hash: computeObjectContentHash(sidecarWithoutHash, fixture.body)
  } satisfies MemoryObjectSidecar;

  await writeJsonProjectFile(
    projectRoot,
    `.aictx/${fixture.bodyPath.replace(/\.md$/, ".json")}`,
    sidecar
  );
  await writeProjectFile(projectRoot, `.aictx/${fixture.bodyPath}`, fixture.body);
}

async function writeRelation(
  projectRoot: string,
  fixture: {
    id: RelationId;
    from: ObjectId;
    predicate: Predicate;
    to: ObjectId;
    status: RelationStatus;
  }
): Promise<void> {
  const relationWithoutHash = {
    id: fixture.id,
    from: fixture.from,
    predicate: fixture.predicate,
    to: fixture.to,
    status: fixture.status,
    created_at: originalTimestamp,
    updated_at: originalTimestamp
  } satisfies Omit<MemoryRelation, "content_hash">;
  const relation = {
    ...relationWithoutHash,
    content_hash: computeRelationContentHash(relationWithoutHash)
  } satisfies MemoryRelation;

  await writeJsonProjectFile(
    projectRoot,
    `.aictx/relations/${fixture.id.slice("rel.".length)}.json`,
    relation
  );
}

async function readJsonProjectFile(
  projectRoot: string,
  path: string
): Promise<Record<string, unknown>> {
  return JSON.parse(await readProjectFile(projectRoot, path)) as Record<string, unknown>;
}

async function readProjectFile(projectRoot: string, path: string): Promise<string> {
  return readFile(join(projectRoot, path), "utf8");
}

async function readEvents(projectRoot: string): Promise<Record<string, unknown>[]> {
  const contents = await readProjectFile(projectRoot, ".aictx/events.jsonl");

  return contents
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

async function readAictxSnapshot(projectRoot: string): Promise<Record<string, string>> {
  const paths = (
    await fg(".aictx/**", {
      cwd: projectRoot,
      dot: true,
      onlyFiles: true,
      unique: true
    })
  ).sort();
  const snapshot: Record<string, string> = {};

  for (const path of paths) {
    snapshot[path] = await readFile(join(projectRoot, path), "utf8");
  }

  return snapshot;
}

async function expectPathMissing(projectRoot: string, path: string): Promise<void> {
  await expect(access(join(projectRoot, path))).rejects.toMatchObject({
    code: "ENOENT"
  });
}

function expectObjectHash(sidecar: Record<string, unknown>, body: string): void {
  const { content_hash: contentHash, ...withoutHash } = sidecar;

  expect(contentHash).toBe(computeObjectContentHash(withoutHash, body));
}

function expectRelationHash(relation: Record<string, unknown>): void {
  const { content_hash: contentHash, ...withoutHash } = relation;

  expect(contentHash).toBe(computeRelationContentHash(withoutHash));
}

async function writeJsonProjectFile(
  projectRoot: string,
  path: string,
  value: Record<string, unknown>
): Promise<void> {
  await writeProjectFile(projectRoot, path, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeProjectFile(
  projectRoot: string,
  path: string,
  contents: string
): Promise<void> {
  const absolutePath = join(projectRoot, path);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, contents, "utf8");
}
