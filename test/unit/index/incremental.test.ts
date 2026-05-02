import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { initProject } from "../../../src/app/operations.js";
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

describe("incremental index update", () => {
  it("skips unchanged object rows by content hash", async () => {
    const projectRoot = await createInitializedProject("aictx-incremental-skip-");

    const result = await updateIndexIncrementally({
      projectRoot,
      aictxRoot: join(projectRoot, ".aictx"),
      clock: createFixedTestClock(FIXED_TIMESTAMP_NEXT_MINUTE),
      touched: {
        objectIds: ["architecture.current"]
      }
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toMatchObject({
        index_updated: true,
        index_rebuilt: false,
        objects_updated: 0,
        objects_skipped: 1,
        objects_deleted: 0
      });
    }
  });

  it("upserts touched objects and replaces matching FTS rows", async () => {
    const projectRoot = await createInitializedProject("aictx-incremental-object-");
    const storage = await readCanonicalStorage(projectRoot);
    expect(storage.ok).toBe(true);
    if (!storage.ok) {
      return;
    }

    await writeObject(projectRoot, storage.data.config.project.id, {
      id: "note.incremental-search",
      type: "note",
      title: "Incremental search",
      bodyPath: "memory/notes/incremental-search.md",
      sidecarPath: ".aictx/memory/notes/incremental-search.json",
      body: "# Incremental search\n\nSQLite FTS receives the new body.\n",
      tags: ["sqlite", "search"]
    });

    const result = await updateIndexIncrementally({
      projectRoot,
      aictxRoot: join(projectRoot, ".aictx"),
      clock: createFixedTestClock(FIXED_TIMESTAMP_NEXT_MINUTE),
      touched: {
        objectIds: ["note.incremental-search"]
      }
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.objects_updated).toBe(1);
      expect(result.data.objects_skipped).toBe(0);
    }

    const connection = await openConnection(projectRoot);
    try {
      expect(readObject(connection.db, "note.incremental-search")).toMatchObject({
        id: "note.incremental-search",
        title: "Incremental search",
        tags_json: JSON.stringify(["sqlite", "search"])
      });
      expect(readFts(connection.db, "note.incremental-search")).toMatchObject({
        object_id: "note.incremental-search",
        title: "Incremental search",
        body: "# Incremental search\n\nSQLite FTS receives the new body.\n",
        tags: "sqlite search"
      });
    } finally {
      connection.close();
    }
  });

  it("deletes touched objects from objects and FTS", async () => {
    const projectRoot = await createInitializedProject("aictx-incremental-delete-object-");
    const storage = await readCanonicalStorage(projectRoot);
    expect(storage.ok).toBe(true);
    if (!storage.ok) {
      throw new Error(storage.error.message);
    }
    const relation = storage.data.relations.find(
      (item) => item.relation.to === "architecture.current"
    );
    expect(relation).toBeDefined();
    if (relation === undefined) {
      throw new Error("Expected starter relation to architecture.current.");
    }

    await rm(join(projectRoot, ".aictx", "memory", "architecture.md"));
    await rm(join(projectRoot, ".aictx", "memory", "architecture.json"));
    await rm(join(projectRoot, relation.path));

    const result = await updateIndexIncrementally({
      projectRoot,
      aictxRoot: join(projectRoot, ".aictx"),
      clock: createFixedTestClock(FIXED_TIMESTAMP_NEXT_MINUTE),
      touched: {
        deletedObjectIds: ["architecture.current"],
        deletedRelationIds: [relation.relation.id]
      }
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.objects_deleted).toBe(1);
      expect(result.data.relations_deleted).toBe(1);
    }

    const connection = await openConnection(projectRoot);
    try {
      expect(readObject(connection.db, "architecture.current")).toBeUndefined();
      expect(readFts(connection.db, "architecture.current")).toBeUndefined();
    } finally {
      connection.close();
    }
  });

  it("upserts relations, deletes relations, and indexes appended events", async () => {
    const projectRoot = await createInitializedProject("aictx-incremental-relation-event-");
    const storage = await readCanonicalStorage(projectRoot);
    expect(storage.ok).toBe(true);
    if (!storage.ok) {
      return;
    }

    const relation = buildRelation();
    await writeJsonProjectFile(
      projectRoot,
      ".aictx/relations/project-mentions-architecture.json",
      relation
    );
    await writeProjectFile(
      projectRoot,
      ".aictx/events.jsonl",
      `${JSON.stringify({
        event: "relation.created",
        relation_id: relation.id,
        actor: "agent",
        timestamp: FIXED_TIMESTAMP,
        payload: {
          from: storage.data.config.project.id,
          predicate: "mentions",
          to: "architecture.current"
        }
      })}\n`
    );

    const created = await updateIndexIncrementally({
      projectRoot,
      aictxRoot: join(projectRoot, ".aictx"),
      clock: createFixedTestClock(FIXED_TIMESTAMP_NEXT_MINUTE),
      touched: {
        relationIds: [relation.id],
        appendedEventCount: 1
      }
    });

    expect(created.ok).toBe(true);
    if (created.ok) {
      expect(created.data.relations_updated).toBe(1);
      expect(created.data.events_indexed).toBe(1);
    }

    let connection = await openConnection(projectRoot);
    try {
      expect(readRelation(connection.db, relation.id)).toMatchObject({
        id: relation.id,
        predicate: "mentions"
      });
      expect(readEventsRows(connection.db)).toEqual([
        {
          line_number: 1,
          event: "relation.created",
          memory_id: null,
          relation_id: relation.id
        }
      ]);
    } finally {
      connection.close();
    }

    await rm(join(projectRoot, ".aictx", "relations", "project-mentions-architecture.json"));
    const deleted = await updateIndexIncrementally({
      projectRoot,
      aictxRoot: join(projectRoot, ".aictx"),
      clock: createFixedTestClock(FIXED_TIMESTAMP_NEXT_MINUTE),
      touched: {
        deletedRelationIds: [relation.id]
      }
    });

    expect(deleted.ok).toBe(true);
    if (deleted.ok) {
      expect(deleted.data.relations_deleted).toBe(1);
    }

    connection = await openConnection(projectRoot);
    try {
      expect(readRelation(connection.db, relation.id)).toBeUndefined();
    } finally {
      connection.close();
    }
  });

  it("skips cleanly when auto-indexing is disabled", async () => {
    const projectRoot = await createInitializedProject("aictx-incremental-auto-index-off-");
    const configPath = join(projectRoot, ".aictx", "config.json");
    const config = JSON.parse(await readFile(configPath, "utf8")) as {
      memory: { autoIndex: boolean };
    };
    config.memory.autoIndex = false;
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");

    const result = await updateIndexIncrementally({
      projectRoot,
      aictxRoot: join(projectRoot, ".aictx"),
      clock: createFixedTestClock(FIXED_TIMESTAMP_NEXT_MINUTE),
      touched: {
        objectIds: ["architecture.current"]
      }
    });

    expect(result).toEqual({
      ok: true,
      data: {
        index_updated: false,
        index_rebuilt: false,
        objects_updated: 0,
        objects_skipped: 0,
        objects_deleted: 0,
        relations_updated: 0,
        relations_deleted: 0,
        events_indexed: 0
      },
      warnings: []
    });
  });

  it("converts strict index failures to post-write warnings", async () => {
    const projectRoot = await createInitializedProject("aictx-incremental-warning-");

    const result = await updateIndexAfterCanonicalWrite({
      projectRoot,
      aictxRoot: join(projectRoot, ".aictx"),
      clock: createFixedTestClock(FIXED_TIMESTAMP_NEXT_MINUTE),
      touched: {
        appendedEventCount: -1
      }
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.index_updated).toBe(false);
      expect(result.warnings).toEqual(
        expect.arrayContaining([
          expect.stringContaining("Index warning:")
        ])
      );
    }
  });
});

interface ObjectRow {
  id: string;
  title: string;
  tags_json: string;
}

interface FtsRow {
  object_id: string;
  title: string;
  body: string;
  tags: string;
}

interface RelationRow {
  id: string;
  predicate: string;
}

interface EventRow {
  line_number: number;
  event: string;
  memory_id: string | null;
  relation_id: string | null;
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

async function openConnection(projectRoot: string): Promise<IndexDatabaseConnection> {
  const opened = await openIndexDatabase({ aictxRoot: join(projectRoot, ".aictx") });

  expect(opened.ok).toBe(true);
  if (!opened.ok) {
    throw new Error(opened.error.message);
  }

  return opened.data;
}

function readObject(
  db: IndexDatabaseConnection["db"],
  id: string
): ObjectRow | undefined {
  return db
    .prepare<[string], ObjectRow>("SELECT id, title, tags_json FROM objects WHERE id = ?")
    .get(id);
}

function readFts(db: IndexDatabaseConnection["db"], id: string): FtsRow | undefined {
  return db
    .prepare<[string], FtsRow>(
      "SELECT object_id, title, body, tags FROM objects_fts WHERE object_id = ?"
    )
    .get(id);
}

function readRelation(
  db: IndexDatabaseConnection["db"],
  id: string
): RelationRow | undefined {
  return db
    .prepare<[string], RelationRow>("SELECT id, predicate FROM relations WHERE id = ?")
    .get(id);
}

function readEventsRows(db: IndexDatabaseConnection["db"]): EventRow[] {
  return db
    .prepare<[], EventRow>(
      `
        SELECT line_number, event, memory_id, relation_id
        FROM events
        ORDER BY line_number
      `
    )
    .all();
}

async function writeObject(
  projectRoot: string,
  projectId: string,
  options: {
    id: string;
    type: MemoryObjectSidecar["type"];
    title: string;
    bodyPath: string;
    sidecarPath: string;
    body: string;
    tags: string[];
  }
): Promise<void> {
  const sidecarWithoutHash = {
    id: options.id,
    type: options.type,
    status: "active",
    title: options.title,
    body_path: options.bodyPath,
    scope: {
      kind: "project",
      project: projectId,
      branch: null,
      task: null
    },
    tags: options.tags,
    source: {
      kind: "agent"
    },
    created_at: FIXED_TIMESTAMP,
    updated_at: FIXED_TIMESTAMP
  } satisfies Omit<MemoryObjectSidecar, "content_hash">;
  const sidecar: MemoryObjectSidecar = {
    ...sidecarWithoutHash,
    content_hash: computeObjectContentHash(sidecarWithoutHash, options.body)
  };

  await writeProjectFile(projectRoot, `.aictx/${options.bodyPath}`, options.body);
  await writeJsonProjectFile(projectRoot, options.sidecarPath, sidecar);
}

function buildRelation(): MemoryRelation {
  const relationWithoutHash = {
    id: "rel.project-mentions-architecture",
    from: "architecture.current",
    predicate: "mentions",
    to: "architecture.current",
    status: "active",
    confidence: "medium",
    evidence: [
      {
        kind: "memory",
        id: "architecture.current"
      }
    ],
    created_at: FIXED_TIMESTAMP,
    updated_at: FIXED_TIMESTAMP
  } satisfies Omit<MemoryRelation, "content_hash">;

  return {
    ...relationWithoutHash,
    content_hash: computeRelationContentHash(relationWithoutHash)
  };
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
