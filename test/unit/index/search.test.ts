import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { searchIndex } from "../../../src/index/search.js";
import { openIndexDatabase, type IndexDatabaseConnection } from "../../../src/index/sqlite.js";
import type { Evidence, ObjectFacets, ObjectStatus, ObjectType } from "../../../src/core/types.js";

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

  it("returns gotcha and workflow search matches", async () => {
    const connection = await openMigratedConnection();

    try {
      insertObject(connection, {
        id: "gotcha.webhook-duplicates",
        type: "gotcha",
        title: "Webhook duplicates",
        bodyPath: ".aictx/memory/gotchas/webhook-duplicates.md",
        body: "Never assume webhook delivery is unique.",
        tags: ["webhook"]
      });
      insertObject(connection, {
        id: "workflow.release-checklist",
        type: "workflow",
        title: "Release checklist",
        bodyPath: ".aictx/memory/workflows/release-checklist.md",
        body: "Run the release checklist before publishing.",
        tags: ["release"]
      });

      const result = await searchIndex({
        aictxRoot: connection.aictxRoot,
        query: "webhook release",
        limit: 10
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.matches).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              id: "gotcha.webhook-duplicates",
              type: "gotcha",
              body_path: ".aictx/memory/gotchas/webhook-duplicates.md"
            }),
            expect.objectContaining({
              id: "workflow.release-checklist",
              type: "workflow",
              body_path: ".aictx/memory/workflows/release-checklist.md"
            })
          ])
        );
      }
    } finally {
      connection.close();
    }
  });

  it("matches facet and object evidence search material", async () => {
    const connection = await openMigratedConnection();

    try {
      insertObject(connection, {
        id: "decision.sqlite-schema",
        type: "decision",
        title: "SQLite schema",
        body: "The index keeps deterministic search material.",
        facets: {
          category: "decision-rationale",
          applies_to: ["src/index/migrations.ts"],
          load_modes: ["architecture"]
        },
        evidence: [{ kind: "file", id: "src/index/migrations.ts" }]
      });

      const byFacet = await searchIndex({
        aictxRoot: connection.aictxRoot,
        query: "decision-rationale"
      });
      const byEvidence = await searchIndex({
        aictxRoot: connection.aictxRoot,
        query: "migrations"
      });

      expect(byFacet.ok).toBe(true);
      expect(byEvidence.ok).toBe(true);

      if (byFacet.ok && byEvidence.ok) {
        expect(byFacet.data.matches[0]?.id).toBe("decision.sqlite-schema");
        expect(byEvidence.data.matches[0]?.id).toBe("decision.sqlite-schema");
      }
    } finally {
      connection.close();
    }
  });

  it("seeds candidates from file and subsystem hints when query text does not match", async () => {
    const connection = await openMigratedConnection();

    try {
      insertObject(connection, {
        id: "decision.hinted-ranking",
        type: "decision",
        title: "Hinted ranking",
        body: "This memory should be found from deterministic hint links."
      });
      insertFileLink(connection, "decision.hinted-ranking", "src/context/rank.ts");
      insertFacetLink(connection, "decision.hinted-ranking", "retrieval");

      const result = await searchIndex({
        aictxRoot: connection.aictxRoot,
        query: "opaque",
        hints: {
          changed_files: ["src/context/rank.ts"],
          subsystems: ["retrieval"]
        }
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.matches[0]).toMatchObject({
          id: "decision.hinted-ranking",
          status: "active"
        });
      }
    } finally {
      connection.close();
    }
  });

  it("rejects invalid retrieval hint shapes", async () => {
    const connection = await openMigratedConnection();

    try {
      const result = await searchIndex({
        aictxRoot: connection.aictxRoot,
        query: "ranking",
        hints: {
          history_window: "thirty-days"
        }
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("AICtxValidationFailed");
        expect(result.error.details).toMatchObject({
          field: "hints.history_window",
          actual: "thirty-days"
        });
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
  facets?: ObjectFacets;
  evidence?: Evidence[];
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
  const facets = fixture.facets ?? null;
  const evidence = fixture.evidence ?? [];
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
          facets_json,
          facet_category,
          applies_to_json,
          evidence_json,
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
          @facets_json,
          @facet_category,
          @applies_to_json,
          @evidence_json,
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
      facets_json: jsonOrNull(facets),
      facet_category: facets?.category ?? null,
      applies_to_json: jsonOrNull(facets?.applies_to),
      evidence_json: JSON.stringify(evidence),
      source_json: null,
      superseded_by: null,
      created_at: updatedAt,
      updated_at: updatedAt
    });

  connection.db
    .prepare<Record<string, string>>(
      `
        INSERT INTO objects_fts (object_id, title, body, tags, facets, evidence)
        VALUES (@object_id, @title, @body, @tags, @facets, @evidence)
      `
    )
    .run({
      object_id: fixture.id,
      title: fixture.title,
      body: fixture.body,
      tags: tags.join(" "),
      facets: facets === null ? "" : facetSearchText(facets),
      evidence: evidenceSearchText(evidence)
    });
}

function insertFileLink(connection: TestConnection, memoryId: string, filePath: string): void {
  connection.db
    .prepare<Record<string, string>>(
      `
        INSERT INTO memory_file_links (memory_id, file_path, link_kind)
        VALUES (@memory_id, @file_path, @link_kind)
      `
    )
    .run({
      memory_id: memoryId,
      file_path: filePath,
      link_kind: "test"
    });
}

function insertFacetLink(connection: TestConnection, memoryId: string, facet: string): void {
  connection.db
    .prepare<Record<string, string>>(
      `
        INSERT INTO memory_facet_links (memory_id, facet, link_kind)
        VALUES (@memory_id, @facet, @link_kind)
      `
    )
    .run({
      memory_id: memoryId,
      facet,
      link_kind: "test"
    });
}

function jsonOrNull(value: unknown): string | null {
  return value === undefined || value === null ? null : JSON.stringify(value);
}

function facetSearchText(facets: ObjectFacets): string {
  return [
    facets.category,
    ...(facets.applies_to ?? []),
    ...(facets.load_modes ?? [])
  ].join(" ");
}

function evidenceSearchText(evidence: readonly Evidence[]): string {
  return evidence.map((item) => `${item.kind} ${item.id}`).join(" ");
}
