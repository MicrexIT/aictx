import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { searchIndex } from "../../../src/index/search.js";
import { openIndexDatabase, type IndexDatabaseConnection } from "../../../src/index/sqlite.js";
import type { ObjectStatus, ObjectType } from "../../../src/core/types.js";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("search index", () => {
  it("rejects empty queries before opening SQLite", async () => {
    const result = await searchIndex({
      aictxRoot: "/does/not/matter",
      query: " \n\t "
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("AICtxValidationFailed");
      expect(result.error.details).toMatchObject({
        field: "query"
      });
    }
  });

  it("validates limits before opening SQLite", async () => {
    for (const limit of [0, 51, 1.5, Number.NaN, Infinity]) {
      const result = await searchIndex({
        aictxRoot: "/does/not/matter",
        query: "webhook",
        limit
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("AICtxValidationFailed");
        expect(result.error.details).toMatchObject({
          field: "limit",
          minimum: 1,
          maximum: 50
        });
      }
    }
  });

  it("defaults to ten matches", async () => {
    const connection = await openMigratedConnection();

    try {
      for (let index = 0; index < 12; index += 1) {
        insertObject(connection, {
          id: `note.shared-${String(index).padStart(2, "0")}`,
          title: `Shared search ${index}`,
          body: "Shared search body.",
          updatedAt: `2026-04-27T12:${String(index).padStart(2, "0")}:00+02:00`
        });
      }

      const result = await searchIndex({
        aictxRoot: connection.aictxRoot,
        query: "shared"
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.matches).toHaveLength(10);
      }
    } finally {
      connection.close();
    }
  });

  it("matches exact IDs and indexed body paths", async () => {
    const connection = await openMigratedConnection();

    try {
      insertObject(connection, {
        id: "constraint.webhook-idempotency",
        type: "constraint",
        title: "Webhook idempotency",
        bodyPath: ".aictx/memory/constraints/webhook-idempotency.md",
        body: "Stripe may deliver duplicate webhook events.",
        tags: ["stripe", "webhooks"]
      });

      const byId = await searchIndex({
        aictxRoot: connection.aictxRoot,
        query: " constraint.webhook-idempotency "
      });
      const byPath = await searchIndex({
        aictxRoot: connection.aictxRoot,
        query: ".aictx/memory/constraints/webhook-idempotency.md"
      });

      expect(byId.ok).toBe(true);
      expect(byPath.ok).toBe(true);

      if (byId.ok && byPath.ok) {
        expect(byId.data.matches[0]).toMatchObject({
          id: "constraint.webhook-idempotency",
          status: "active"
        });
        expect(byPath.data.matches[0]).toMatchObject({
          id: "constraint.webhook-idempotency",
          body_path: ".aictx/memory/constraints/webhook-idempotency.md"
        });
      }
    } finally {
      connection.close();
    }
  });

  it("uses punctuation-safe FTS, excludes rejected memory, and exposes included statuses", async () => {
    const connection = await openMigratedConnection();

    try {
      insertObject(connection, {
        id: "constraint.active-webhook",
        type: "constraint",
        status: "active",
        title: "Active webhook",
        body: "Webhook delivery must be idempotent.",
        tags: ["stripe"]
      });
      insertObject(connection, {
        id: "decision.stale-webhook",
        type: "decision",
        status: "stale",
        title: "Stale webhook",
        body: "Webhook delivery used an old queue.",
        tags: ["stripe"]
      });
      insertObject(connection, {
        id: "note.superseded-webhook",
        status: "superseded",
        title: "Superseded webhook",
        body: "Webhook behavior was replaced.",
        tags: ["stripe"]
      });
      insertObject(connection, {
        id: "note.closed-webhook",
        status: "closed",
        title: "Closed webhook",
        body: "Webhook question was closed.",
        tags: ["stripe"]
      });
      insertObject(connection, {
        id: "note.rejected-webhook",
        status: "rejected",
        title: "Rejected webhook",
        body: "Webhook text should not be returned.",
        tags: ["stripe"]
      });

      const result = await searchIndex({
        aictxRoot: connection.aictxRoot,
        query: "webhook!!!"
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        const ids = result.data.matches.map((match) => match.id);
        const statuses = result.data.matches.map((match) => match.status);

        expect(ids).not.toContain("note.rejected-webhook");
        expect(statuses).toEqual(expect.arrayContaining(["active", "stale", "superseded", "closed"]));
      }
    } finally {
      connection.close();
    }
  });

  it("ranks deterministic ties by recency and then lexicographic ID", async () => {
    const connection = await openMigratedConnection();

    try {
      insertObject(connection, {
        id: "note.beta",
        title: "Ranking tie",
        body: "Ranking tie body.",
        updatedAt: "2026-04-27T12:00:00+02:00"
      });
      insertObject(connection, {
        id: "note.alpha",
        title: "Ranking tie",
        body: "Ranking tie body.",
        updatedAt: "2026-04-27T12:00:00+02:00"
      });
      insertObject(connection, {
        id: "note.newer",
        title: "Ranking tie",
        body: "Ranking tie body.",
        updatedAt: "2026-04-27T12:01:00+02:00"
      });

      const first = await searchIndex({
        aictxRoot: connection.aictxRoot,
        query: "ranking"
      });
      const second = await searchIndex({
        aictxRoot: connection.aictxRoot,
        query: "ranking"
      });

      expect(first.ok).toBe(true);
      expect(second.ok).toBe(true);

      if (first.ok && second.ok) {
        expect(first.data.matches.map((match) => match.id)).toEqual([
          "note.newer",
          "note.alpha",
          "note.beta"
        ]);
        expect(second.data.matches.map((match) => match.id)).toEqual(
          first.data.matches.map((match) => match.id)
        );
      }
    } finally {
      connection.close();
    }
  });

  it("builds deterministic snippets from matched terms or body fallback", async () => {
    const connection = await openMigratedConnection();

    try {
      insertObject(connection, {
        id: "note.needle",
        title: "Needle",
        body: `${"prefix ".repeat(20)}needle appears in the middle of this memory body.${" suffix".repeat(20)}`
      });
      insertObject(connection, {
        id: "note.fallback-snippet",
        title: "Fallback snippet title",
        body: "First sentence of the body is used when no query term appears in the body."
      });

      const matched = await searchIndex({
        aictxRoot: connection.aictxRoot,
        query: "needle"
      });
      const fallback = await searchIndex({
        aictxRoot: connection.aictxRoot,
        query: "note.fallback-snippet"
      });

      expect(matched.ok).toBe(true);
      expect(fallback.ok).toBe(true);

      if (matched.ok && fallback.ok) {
        expect(matched.data.matches[0]?.snippet).toContain("needle appears");
        expect(matched.data.matches[0]?.snippet.length).toBeLessThanOrEqual(166);
        expect(fallback.data.matches[0]?.snippet).toBe(
          "First sentence of the body is used when no query term appears in the body."
        );
      }
    } finally {
      connection.close();
    }
  });
});

interface TestConnection extends IndexDatabaseConnection {
  aictxRoot: string;
}

interface ObjectFixture {
  id: string;
  type?: ObjectType;
  status?: ObjectStatus;
  title: string;
  bodyPath?: string;
  body: string;
  tags?: string[];
  updatedAt?: string;
}

async function openMigratedConnection(): Promise<TestConnection> {
  const aictxRoot = await createAictxRoot();
  const opened = await openIndexDatabase({ aictxRoot });

  expect(opened.ok).toBe(true);
  if (!opened.ok) {
    throw new Error(opened.error.message);
  }

  return {
    ...opened.data,
    aictxRoot
  };
}

async function createAictxRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "aictx-search-unit-"));
  tempRoots.push(root);

  const aictxRoot = join(root, ".aictx");
  await mkdir(aictxRoot);

  return aictxRoot;
}

function insertObject(connection: TestConnection, fixture: ObjectFixture): void {
  const type = fixture.type ?? "note";
  const status = fixture.status ?? "active";
  const bodyPath = fixture.bodyPath ?? `.aictx/memory/notes/${fixture.id.replace(".", "-")}.md`;
  const tags = fixture.tags ?? [];
  const updatedAt = fixture.updatedAt ?? "2026-04-27T12:00:00+02:00";

  connection.db
    .prepare<Record<string, string | null>>(
      `
        INSERT INTO objects (
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
        ) VALUES (
          @id,
          @type,
          @status,
          @title,
          @body_path,
          @json_path,
          @body,
          @content_hash,
          @scope_json,
          @scope_kind,
          @scope_project,
          @scope_branch,
          @scope_task,
          @tags_json,
          @source_json,
          @superseded_by,
          @created_at,
          @updated_at
        )
      `
    )
    .run({
      id: fixture.id,
      type,
      status,
      title: fixture.title,
      body_path: bodyPath,
      json_path: bodyPath.replace(/\.md$/, ".json"),
      body: fixture.body,
      content_hash: `sha256:${fixture.id}`,
      scope_json: JSON.stringify({
        kind: "project",
        project: "project.search-test",
        branch: null,
        task: null
      }),
      scope_kind: "project",
      scope_project: "project.search-test",
      scope_branch: null,
      scope_task: null,
      tags_json: JSON.stringify(tags),
      source_json: null,
      superseded_by: null,
      created_at: updatedAt,
      updated_at: updatedAt
    });

  connection.db
    .prepare<Record<string, string>>(
      `
        INSERT INTO objects_fts (object_id, title, body, tags)
        VALUES (@object_id, @title, @body, @tags)
      `
    )
    .run({
      object_id: fixture.id,
      title: fixture.title,
      body: fixture.body,
      tags: tags.join(" ")
    });
}
