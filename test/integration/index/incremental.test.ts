import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { initProject, rebuildIndex } from "../../../src/app/operations.js";
import {
  updateIndexAfterCanonicalWrite,
  updateIndexIncrementally
} from "../../../src/index/incremental.js";
import { openIndexDatabase, type IndexDatabaseConnection } from "../../../src/index/sqlite.js";
import {
  computeObjectContentHash,
  computeRelationContentHash
} from "../../../src/storage/hashes.js";
import type { MemoryObjectSidecar } from "../../../src/storage/objects.js";
import { readCanonicalStorage } from "../../../src/storage/read.js";
import type { MemoryRelation } from "../../../src/storage/relations.js";
import { createFixedTestClock, FIXED_TIMESTAMP, FIXED_TIMESTAMP_NEXT_MINUTE } from "../../fixtures/time.js";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true }))
  );
});

describe("incremental index integration", () => {
  it("matches a full rebuild after touched object, relation, and event changes", async () => {
    const projectRoot = await createInitializedProject("aictx-incremental-match-rebuild-");
    const touched = await writeTouchedCanonicalChanges(projectRoot);

    const incremental = await updateIndexIncrementally({
      projectRoot,
      aictxRoot: join(projectRoot, ".aictx"),
      clock: createFixedTestClock(FIXED_TIMESTAMP_NEXT_MINUTE),
      touched
    });

    expect(incremental.ok).toBe(true);
    if (!incremental.ok) {
      return;
    }
    expect(incremental.data).toMatchObject({
      index_updated: true,
      index_rebuilt: false,
      objects_updated: 2,
      relations_updated: 1,
      events_indexed: 2
    });

    const incrementalSnapshot = await snapshotIndex(projectRoot);
    const rebuilt = await rebuildIndex({
      cwd: projectRoot,
      clock: createFixedTestClock(FIXED_TIMESTAMP_NEXT_MINUTE)
    });

    expect(rebuilt.ok).toBe(true);
    const rebuiltSnapshot = await snapshotIndex(projectRoot);

    expect(incrementalSnapshot).toEqual(rebuiltSnapshot);
  });

  it("returns an index warning instead of a failed save result after canonical writes", async () => {
    const projectRoot = await createInitializedProject("aictx-incremental-warning-after-write-");
    const storageBefore = await readCanonicalStorage(projectRoot);
    expect(storageBefore.ok).toBe(true);

    await rm(join(projectRoot, ".aictx", "index", "aictx.sqlite"), { force: true });
    await mkdir(join(projectRoot, ".aictx", "index", "aictx.sqlite"));

    const result = await updateIndexAfterCanonicalWrite({
      projectRoot,
      aictxRoot: join(projectRoot, ".aictx"),
      clock: createFixedTestClock(FIXED_TIMESTAMP_NEXT_MINUTE),
      touched: {
        objectIds: ["architecture.current"]
      }
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({
        index_updated: false,
        index_rebuilt: false,
        objects_updated: 0,
        objects_skipped: 0,
        objects_deleted: 0,
        relations_updated: 0,
        relations_deleted: 0,
        events_indexed: 0
      });
      expect(result.warnings).toEqual(
        expect.arrayContaining([
          expect.stringContaining("Index warning:")
        ])
      );
    }

    const storageAfter = await readCanonicalStorage(projectRoot);
    expect(storageAfter.ok).toBe(true);
    if (storageBefore.ok && storageAfter.ok) {
      expect(storageAfter.data.objects.map((object) => object.sidecar.id).sort()).toEqual(
        storageBefore.data.objects.map((object) => object.sidecar.id).sort()
      );
    }
  });
});

type TouchedChanges = Parameters<typeof updateIndexIncrementally>[0]["touched"];

interface ObjectRow {
  id: string;
  type: string;
  status: string;
  title: string;
  body_path: string;
  json_path: string;
  body: string;
  content_hash: string;
  scope_json: string;
  scope_kind: string;
  scope_project: string;
  scope_branch: string | null;
  scope_task: string | null;
  tags_json: string;
  source_json: string | null;
  superseded_by: string | null;
  created_at: string;
  updated_at: string;
}

interface FtsRow {
  object_id: string;
  title: string;
  body: string;
  tags: string;
}

interface RelationRow {
  id: string;
  from_id: string;
  predicate: string;
  to_id: string;
  status: string;
  confidence: string | null;
  evidence_json: string | null;
  content_hash: string | null;
  created_at: string;
  updated_at: string;
}

interface EventRow {
  line_number: number;
  event: string;
  memory_id: string | null;
  relation_id: string | null;
  actor: string;
  timestamp: string;
  reason: string | null;
  payload_json: string | null;
}

interface MetaRow {
  key: string;
  value: string;
}

async function createInitializedProject(prefix: string): Promise<string> {
  const projectRoot = await createTempRoot(prefix);
  const initialized = await initProject({
    cwd: projectRoot,
    clock: createFixedTestClock()
  });

  expect(initialized.ok).toBe(true);
  if (!initialized.ok) {
    throw new Error(initialized.error.message);
  }

  return projectRoot;
}

async function createTempRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  const resolvedRoot = await realpath(root);
  tempRoots.push(resolvedRoot);
  return resolvedRoot;
}

async function writeTouchedCanonicalChanges(projectRoot: string): Promise<TouchedChanges> {
  const storage = await readCanonicalStorage(projectRoot);
  expect(storage.ok).toBe(true);
  if (!storage.ok) {
    throw new Error(storage.error.message);
  }

  const projectId = storage.data.config.project.id;
  const architecture = storage.data.objects.find(
    (object) => object.sidecar.id === "architecture.current"
  );

  if (architecture === undefined) {
    throw new Error("Missing architecture.current fixture object.");
  }

  const updatedArchitectureBody =
    "# Current Architecture\n\nArchitecture memory starts here.\n\nIncremental updates keep SQLite current.\n";
  const { content_hash: _oldArchitectureHash, ...architectureWithoutHash } = {
    ...architecture.sidecar,
    updated_at: FIXED_TIMESTAMP_NEXT_MINUTE
  };
  const updatedArchitecture: MemoryObjectSidecar = {
    ...architectureWithoutHash,
    content_hash: computeObjectContentHash(architectureWithoutHash, updatedArchitectureBody)
  };

  await writeProjectFile(
    projectRoot,
    `.aictx/${updatedArchitecture.body_path}`,
    updatedArchitectureBody
  );
  await writeJsonProjectFile(projectRoot, architecture.path, updatedArchitecture);

  const constraintBody = "# Webhook idempotency\n\nWebhook handlers must dedupe delivery IDs.\n";
  const constraintWithoutHash = {
    id: "constraint.webhook-idempotency",
    type: "constraint",
    status: "active",
    title: "Webhook idempotency",
    body_path: "memory/constraints/webhook-idempotency.md",
    scope: {
      kind: "project",
      project: projectId,
      branch: null,
      task: null
    },
    tags: ["stripe", "webhooks"],
    source: {
      kind: "agent"
    },
    created_at: FIXED_TIMESTAMP_NEXT_MINUTE,
    updated_at: FIXED_TIMESTAMP_NEXT_MINUTE
  } satisfies Omit<MemoryObjectSidecar, "content_hash">;
  const constraint: MemoryObjectSidecar = {
    ...constraintWithoutHash,
    content_hash: computeObjectContentHash(constraintWithoutHash, constraintBody)
  };
  const relationWithoutHash = {
    id: "rel.architecture-requires-webhook-idempotency",
    from: "architecture.current",
    predicate: "requires",
    to: "constraint.webhook-idempotency",
    status: "active",
    confidence: "high",
    evidence: [
      {
        kind: "memory",
        id: "architecture.current"
      }
    ],
    created_at: FIXED_TIMESTAMP_NEXT_MINUTE,
    updated_at: FIXED_TIMESTAMP_NEXT_MINUTE
  } satisfies Omit<MemoryRelation, "content_hash">;
  const relation: MemoryRelation = {
    ...relationWithoutHash,
    content_hash: computeRelationContentHash(relationWithoutHash)
  };
  const events = [
    {
      event: "memory.created",
      id: "constraint.webhook-idempotency",
      actor: "agent",
      timestamp: FIXED_TIMESTAMP_NEXT_MINUTE,
      payload: {
        title: "Webhook idempotency"
      }
    },
    {
      event: "relation.created",
      relation_id: "rel.architecture-requires-webhook-idempotency",
      actor: "agent",
      timestamp: FIXED_TIMESTAMP_NEXT_MINUTE,
      payload: {
        from: "architecture.current",
        predicate: "requires",
        to: "constraint.webhook-idempotency"
      }
    }
  ];

  await writeProjectFile(projectRoot, ".aictx/memory/constraints/webhook-idempotency.md", constraintBody);
  await writeJsonProjectFile(
    projectRoot,
    ".aictx/memory/constraints/webhook-idempotency.json",
    constraint
  );
  await writeJsonProjectFile(
    projectRoot,
    ".aictx/relations/architecture-requires-webhook-idempotency.json",
    relation
  );
  await writeProjectFile(
    projectRoot,
    ".aictx/events.jsonl",
    `${events.map((event) => JSON.stringify(event)).join("\n")}\n`
  );

  return {
    objectIds: ["architecture.current", "constraint.webhook-idempotency"],
    relationIds: ["rel.architecture-requires-webhook-idempotency"],
    appendedEventCount: 2
  };
}

async function snapshotIndex(projectRoot: string) {
  const connection = await openConnection(projectRoot);

  try {
    return {
      objects: connection.db
        .prepare<[], ObjectRow>(
          `
            SELECT
              id,
              type,
              status,
              title,
              body_path,
              json_path,
              body,
              content_hash,
              scope_json,
              scope_kind,
              scope_project,
              scope_branch,
              scope_task,
              tags_json,
              source_json,
              superseded_by,
              created_at,
              updated_at
            FROM objects
            ORDER BY id
          `
        )
        .all(),
      fts: connection.db
        .prepare<[], FtsRow>(
          "SELECT object_id, title, body, tags FROM objects_fts ORDER BY object_id"
        )
        .all(),
      relations: connection.db
        .prepare<[], RelationRow>(
          `
            SELECT
              id,
              from_id,
              predicate,
              to_id,
              status,
              confidence,
              evidence_json,
              content_hash,
              created_at,
              updated_at
            FROM relations
            ORDER BY id
          `
        )
        .all(),
      events: connection.db
        .prepare<[], EventRow>(
          `
            SELECT
              line_number,
              event,
              memory_id,
              relation_id,
              actor,
              timestamp,
              reason,
              payload_json
            FROM events
            ORDER BY line_number
          `
        )
        .all(),
      meta: connection.db
        .prepare<[], MetaRow>("SELECT key, value FROM meta ORDER BY key")
        .all()
    };
  } finally {
    connection.close();
  }
}

async function openConnection(projectRoot: string): Promise<IndexDatabaseConnection> {
  const opened = await openIndexDatabase({ aictxRoot: join(projectRoot, ".aictx") });

  expect(opened.ok).toBe(true);
  if (!opened.ok) {
    throw new Error(opened.error.message);
  }

  return opened.data;
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

async function writeJsonProjectFile(
  projectRoot: string,
  path: string,
  value: unknown
): Promise<void> {
  await writeProjectFile(projectRoot, path, `${JSON.stringify(value, null, 2)}\n`);
}
