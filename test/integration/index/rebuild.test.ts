import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { initProject, rebuildIndex } from "../../../src/app/operations.js";
import { rebuildIndex as rebuildGeneratedIndex } from "../../../src/index/rebuild.js";
import { openIndexDatabase, type IndexDatabaseConnection } from "../../../src/index/sqlite.js";
import {
  computeObjectContentHash,
  computeRelationContentHash
} from "../../../src/storage/hashes.js";
import type { MemoryObjectSidecar } from "../../../src/storage/objects.js";
import type { MemoryRelation } from "../../../src/storage/relations.js";
import { readCanonicalStorage } from "../../../src/storage/read.js";
import { createFixedTestClock, FIXED_TIMESTAMP, FIXED_TIMESTAMP_NEXT_MINUTE } from "../../fixtures/time.js";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true }))
  );
});

describe("full index rebuild", () => {
  it("rebuilds valid canonical storage into SQLite rows without appending events", async () => {
    const projectRoot = await createInitializedProject("memory-rebuild-valid-");
    await writeAdditionalCanonicalMemory(projectRoot);
    const eventsBefore = await readEvents(projectRoot);

    const result = await rebuildIndex({
      cwd: projectRoot,
      clock: createFixedTestClock(FIXED_TIMESTAMP_NEXT_MINUTE)
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.data).toEqual({
      index_rebuilt: true,
      objects_indexed: 3,
      relations_indexed: 2,
      events_indexed: 2,
      event_appended: false
    });
    await expect(readEvents(projectRoot)).resolves.toBe(eventsBefore);

    const connection = await openConnection(projectRoot);
    try {
      expect(countRows(connection.db, "objects")).toBe(3);
      expect(countRows(connection.db, "relations")).toBe(2);
      expect(countRows(connection.db, "events")).toBe(2);
      expect(countRows(connection.db, "objects_fts")).toBe(3);

      expect(readObject(connection.db, "constraint.webhook-idempotency")).toMatchObject({
        id: "constraint.webhook-idempotency",
        type: "constraint",
        status: "active",
        title: "Webhook idempotency",
        body_path: ".memory/memory/constraints/webhook-idempotency.md",
        json_path: ".memory/memory/constraints/webhook-idempotency.json",
        scope_kind: "project",
        tags_json: JSON.stringify(["stripe", "webhooks"])
      });
      expect(readFts(connection.db, "constraint.webhook-idempotency")).toMatchObject({
        object_id: "constraint.webhook-idempotency",
        title: "Webhook idempotency",
        tags: "stripe webhooks"
      });
      expect(readMemoryFileLinks(connection.db, "constraint.webhook-idempotency")).toEqual([
        { file_path: "src/billing/dedupe.ts", link_kind: "body.reference" },
        { file_path: "src/billing/relation.ts", link_kind: "relation.evidence.file" },
        { file_path: "src/billing/webhook.ts", link_kind: "evidence.file" },
        { file_path: "src/billing/webhook.ts", link_kind: "facets.applies_to" }
      ]);
      expect(readMemoryCommitLinks(connection.db, "constraint.webhook-idempotency")).toEqual([
        { commit_hash: "abc123", link_kind: "evidence.commit" },
        { commit_hash: "def456", link_kind: "source.commit" },
        { commit_hash: "feed123", link_kind: "relation.evidence.commit" }
      ]);
      expect(readMemoryFileLinks(connection.db, "architecture.current")).toContainEqual({
        file_path: "src/billing/relation.ts",
        link_kind: "relation.evidence.file"
      });
      expect(readMemoryCommitLinks(connection.db, "architecture.current")).toContainEqual({
        commit_hash: "feed123",
        link_kind: "relation.evidence.commit"
      });
      expect(readMemoryFacetLinks(connection.db, "constraint.webhook-idempotency")).toEqual([
        { facet: "coding", link_kind: "load_mode" },
        { facet: "convention", link_kind: "category" },
        { facet: "stripe", link_kind: "tag" },
        { facet: "webhooks", link_kind: "tag" }
      ]);
      expect(readRelation(connection.db, "rel.architecture-requires-webhook-idempotency")).toMatchObject({
        id: "rel.architecture-requires-webhook-idempotency",
        from_id: "architecture.current",
        predicate: "requires",
        to_id: "constraint.webhook-idempotency",
        status: "active",
        confidence: "high"
      });
      expect(readEventsRows(connection.db)).toEqual([
        {
          line_number: 1,
          event: "memory.created",
          memory_id: "constraint.webhook-idempotency",
          relation_id: null
        },
        {
          line_number: 2,
          event: "relation.created",
          memory_id: null,
          relation_id: "rel.architecture-requires-webhook-idempotency"
        }
      ]);
      expect(readMeta(connection.db)).toMatchObject({
        schema_version: "5",
        built_at: FIXED_TIMESTAMP_NEXT_MINUTE,
        source_git_commit: "",
        git_available: "false",
        storage_version: "4",
        object_count: "3",
        relation_count: "2",
        event_count: "2"
      });
    } finally {
      connection.close();
    }
  });

  it("rebuilds after deleting the generated index without losing canonical memory", async () => {
    const projectRoot = await createInitializedProject("memory-rebuild-deleted-index-");
    await writeAdditionalCanonicalMemory(projectRoot);
    await rm(join(projectRoot, ".memory", "index"), { recursive: true, force: true });

    const storageBefore = await readCanonicalStorage(projectRoot);
    expect(storageBefore.ok).toBe(true);
    if (!storageBefore.ok) {
      return;
    }

    const result = await rebuildIndex({
      cwd: projectRoot,
      clock: createFixedTestClock(FIXED_TIMESTAMP_NEXT_MINUTE)
    });

    expect(result.ok).toBe(true);
    const storageAfter = await readCanonicalStorage(projectRoot);

    expect(storageAfter.ok).toBe(true);
    if (storageAfter.ok) {
      expect(storageAfter.data.objects.map((object) => object.sidecar.id).sort()).toEqual(
        storageBefore.data.objects.map((object) => object.sidecar.id).sort()
      );
    }

    const connection = await openConnection(projectRoot);
    try {
      expect(countRows(connection.db, "objects")).toBe(3);
      expect(countRows(connection.db, "relations")).toBe(2);
      expect(countRows(connection.db, "events")).toBe(2);
    } finally {
      connection.close();
    }
  });

  it("does not replace a previous valid index when canonical files are invalid", async () => {
    const projectRoot = await createInitializedProject("memory-rebuild-invalid-");
    await writeAdditionalCanonicalMemory(projectRoot);
    const first = await rebuildIndex({
      cwd: projectRoot,
      clock: createFixedTestClock(FIXED_TIMESTAMP_NEXT_MINUTE)
    });

    expect(first.ok).toBe(true);
    await writeProjectFile(
      projectRoot,
      ".memory/memory/constraints/webhook-idempotency.json",
      "{bad json"
    );

    const second = await rebuildIndex({
      cwd: projectRoot,
      clock: createFixedTestClock(FIXED_TIMESTAMP_NEXT_MINUTE)
    });

    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.error.code).toBe("MemoryIndexUnavailable");
    }

    const connection = await openConnection(projectRoot);
    try {
      expect(countRows(connection.db, "objects")).toBe(3);
      expect(readObject(connection.db, "constraint.webhook-idempotency")?.title).toBe(
        "Webhook idempotency"
      );
    } finally {
      connection.close();
    }
  });

  it("reports index_built true when init builds the initial index", async () => {
    const projectRoot = await createTempRoot("memory-rebuild-init-");

    const result = await initProject({
      cwd: projectRoot,
      clock: createFixedTestClock()
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.data.index_built).toBe(true);

    const connection = await openConnection(projectRoot);
    try {
      expect(countRows(connection.db, "objects")).toBe(2);
      expect(readMeta(connection.db)).toMatchObject({
        built_at: FIXED_TIMESTAMP,
        object_count: "2",
        relation_count: "1",
        event_count: "0"
      });
    } finally {
      connection.close();
    }
  });

  it("indexes supplied Git file-change metadata during rebuild", async () => {
    const projectRoot = await createInitializedProject("memory-rebuild-git-history-");
    await writeAdditionalCanonicalMemory(projectRoot);

    const result = await rebuildGeneratedIndex({
      projectRoot,
      memoryRoot: join(projectRoot, ".memory"),
      clock: createFixedTestClock(FIXED_TIMESTAMP_NEXT_MINUTE),
      git: {
        available: true,
        branch: "main",
        commit: "feedbeef"
      },
      gitFileChanges: [
        {
          file: "src/billing/webhook.ts",
          commit: "1234567890abcdef",
          shortCommit: "1234567",
          timestamp: "2026-04-25T14:00:00+02:00",
          subject: "Refine webhook routing"
        }
      ]
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const connection = await openConnection(projectRoot);
    try {
      expect(readGitFileChanges(connection.db)).toEqual([
        {
          file_path: "src/billing/webhook.ts",
          commit_hash: "1234567890abcdef",
          short_commit: "1234567",
          timestamp: "2026-04-25T14:00:00+02:00",
          subject: "Refine webhook routing"
        }
      ]);
      expect(readMeta(connection.db)).toMatchObject({
        source_git_commit: "feedbeef",
        git_available: "true"
      });
    } finally {
      connection.close();
    }
  });
});

interface CountRow {
  count: number;
}

interface ObjectRow {
  id: string;
  type: string;
  status: string;
  title: string;
  body_path: string;
  json_path: string;
  scope_kind: string;
  tags_json: string;
}

interface FtsRow {
  object_id: string;
  title: string;
  tags: string;
}

interface FileLinkRow {
  file_path: string;
  link_kind: string;
}

interface CommitLinkRow {
  commit_hash: string;
  link_kind: string;
}

interface FacetLinkRow {
  facet: string;
  link_kind: string;
}

interface GitFileChangeRow {
  file_path: string;
  commit_hash: string;
  short_commit: string;
  timestamp: string;
  subject: string;
}

interface RelationRow {
  id: string;
  from_id: string;
  predicate: string;
  to_id: string;
  status: string;
  confidence: string | null;
}

interface EventRow {
  line_number: number;
  event: string;
  memory_id: string | null;
  relation_id: string | null;
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

async function writeAdditionalCanonicalMemory(projectRoot: string): Promise<void> {
  const storage = await readCanonicalStorage(projectRoot);
  expect(storage.ok).toBe(true);
  if (!storage.ok) {
    throw new Error(storage.error.message);
  }

  const projectId = storage.data.config.project.id;
  const body =
    "# Webhook idempotency\n\nWebhook handlers must dedupe delivery IDs in src/billing/dedupe.ts before processing.\n";
  const sidecarWithoutHash = {
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
    facets: {
      category: "convention",
      applies_to: ["src/billing/webhook.ts"],
      load_modes: ["coding"]
    },
    evidence: [
      { kind: "file", id: "src/billing/webhook.ts" },
      { kind: "commit", id: "abc123" }
    ],
    source: {
      kind: "agent",
      commit: "def456"
    },
    created_at: FIXED_TIMESTAMP,
    updated_at: FIXED_TIMESTAMP
  } satisfies Omit<MemoryObjectSidecar, "content_hash">;
  const sidecar: MemoryObjectSidecar = {
    ...sidecarWithoutHash,
    content_hash: computeObjectContentHash(sidecarWithoutHash, body)
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
      },
      {
        kind: "file",
        id: "src/billing/relation.ts"
      },
      {
        kind: "commit",
        id: "feed123"
      }
    ],
    created_at: FIXED_TIMESTAMP,
    updated_at: FIXED_TIMESTAMP
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
      timestamp: FIXED_TIMESTAMP,
      payload: {
        title: "Webhook idempotency"
      }
    },
    {
      event: "relation.created",
      relation_id: "rel.architecture-requires-webhook-idempotency",
      actor: "agent",
      timestamp: FIXED_TIMESTAMP,
      payload: {
        from: "architecture.current",
        predicate: "requires",
        to: "constraint.webhook-idempotency"
      }
    }
  ];

  await writeProjectFile(projectRoot, ".memory/memory/constraints/webhook-idempotency.md", body);
  await writeJsonProjectFile(
    projectRoot,
    ".memory/memory/constraints/webhook-idempotency.json",
    sidecar
  );
  await writeJsonProjectFile(
    projectRoot,
    ".memory/relations/architecture-requires-webhook-idempotency.json",
    relation
  );
  await writeProjectFile(
    projectRoot,
    ".memory/events.jsonl",
    `${events.map((event) => JSON.stringify(event)).join("\n")}\n`
  );
}

async function openConnection(projectRoot: string): Promise<IndexDatabaseConnection> {
  const opened = await openIndexDatabase({ memoryRoot: join(projectRoot, ".memory") });

  expect(opened.ok).toBe(true);
  if (!opened.ok) {
    throw new Error(opened.error.message);
  }

  return opened.data;
}

function countRows(
  db: IndexDatabaseConnection["db"],
  table: "objects" | "relations" | "events" | "objects_fts"
): number {
  return db.prepare<[], CountRow>(`SELECT count(*) AS count FROM ${table}`).get()?.count ?? 0;
}

function readObject(db: IndexDatabaseConnection["db"], id: string): ObjectRow | undefined {
  return db
    .prepare<[string], ObjectRow>(
      `
        SELECT id, type, status, title, body_path, json_path, scope_kind, tags_json
        FROM objects
        WHERE id = ?
      `
    )
    .get(id);
}

function readFts(db: IndexDatabaseConnection["db"], id: string): FtsRow | undefined {
  return db
    .prepare<[string], FtsRow>(
      "SELECT object_id, title, tags FROM objects_fts WHERE object_id = ?"
    )
    .get(id);
}

function readMemoryFileLinks(db: IndexDatabaseConnection["db"], id: string): FileLinkRow[] {
  return db
    .prepare<[string], FileLinkRow>(
      `
        SELECT file_path, link_kind
        FROM memory_file_links
        WHERE memory_id = ?
        ORDER BY file_path, link_kind
      `
    )
    .all(id);
}

function readMemoryCommitLinks(db: IndexDatabaseConnection["db"], id: string): CommitLinkRow[] {
  return db
    .prepare<[string], CommitLinkRow>(
      `
        SELECT commit_hash, link_kind
        FROM memory_commit_links
        WHERE memory_id = ?
        ORDER BY commit_hash, link_kind
      `
    )
    .all(id);
}

function readMemoryFacetLinks(db: IndexDatabaseConnection["db"], id: string): FacetLinkRow[] {
  return db
    .prepare<[string], FacetLinkRow>(
      `
        SELECT facet, link_kind
        FROM memory_facet_links
        WHERE memory_id = ?
        ORDER BY facet, link_kind
      `
    )
    .all(id);
}

function readGitFileChanges(db: IndexDatabaseConnection["db"]): GitFileChangeRow[] {
  return db
    .prepare<[], GitFileChangeRow>(
      `
        SELECT file_path, commit_hash, short_commit, timestamp, subject
        FROM git_file_changes
        ORDER BY file_path, commit_hash
      `
    )
    .all();
}

function readRelation(db: IndexDatabaseConnection["db"], id: string): RelationRow | undefined {
  return db
    .prepare<[string], RelationRow>(
      "SELECT id, from_id, predicate, to_id, status, confidence FROM relations WHERE id = ?"
    )
    .get(id);
}

function readEventsRows(db: IndexDatabaseConnection["db"]): EventRow[] {
  return db
    .prepare<[], EventRow>(
      "SELECT line_number, event, memory_id, relation_id FROM events ORDER BY line_number"
    )
    .all();
}

function readMeta(db: IndexDatabaseConnection["db"]): Record<string, string> {
  const rows = db.prepare<[], MetaRow>("SELECT key, value FROM meta ORDER BY key").all();

  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}

async function readEvents(projectRoot: string): Promise<string> {
  return readFile(join(projectRoot, ".memory", "events.jsonl"), "utf8");
}

async function writeJsonProjectFile(
  projectRoot: string,
  path: string,
  value: unknown
): Promise<void> {
  await writeProjectFile(projectRoot, path, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeProjectFile(projectRoot: string, path: string, contents: string): Promise<void> {
  const absolutePath = join(projectRoot, path);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, contents, "utf8");
}
