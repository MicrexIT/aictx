import { describe, expect, it } from "vitest";

import { buildMemoryLens } from "../../../src/lenses/render.js";
import type { ObjectStatus, ObjectType } from "../../../src/core/types.js";
import type { CanonicalStorageSnapshot } from "../../../src/storage/read.js";
import type { StoredMemoryObject } from "../../../src/storage/objects.js";
import type { StoredMemoryRelation } from "../../../src/storage/relations.js";

describe("memory lenses", () => {
  it("renders project-map without branch handoff project truth", () => {
    const storage = snapshot({
      objects: [
        object("synthesis.product-intent", "synthesis", "active", "Product intent", "Memory stores durable project memory for AI coding agents and keeps it inspectable through CLI and viewer workflows.", "product-intent"),
        object("synthesis.repository-map", "synthesis", "active", "Repository map", "Source code, tests, docs, schemas, and viewer code are kept in predictable repository areas for quick agent onboarding.", "file-layout"),
        object("synthesis.branch-handoff-feature", "synthesis", "active", "Branch handoff", "Temporary branch work should not be treated as project truth by the project map lens.", "roadmap", "feature")
      ],
      relations: [
        relation("rel.product-derived", "synthesis.product-intent", "derived_from", "source.readme")
      ]
    });

    const lens = buildMemoryLens(storage, { available: true, branch: "feature" }, "project-map");

    expect(lens.title).toBe("Project Map");
    expect(lens.markdown).toContain("# Project Map");
    expect(lens.included_memory_ids).toContain("synthesis.product-intent");
    expect(lens.included_memory_ids).toContain("synthesis.repository-map");
    expect(lens.included_memory_ids).not.toContain("synthesis.branch-handoff-feature");
    expect(lens.generated_gaps).toEqual(
      expect.arrayContaining([expect.stringContaining("Capability Map is missing")])
    );
  });

  it("renders current-work with the matching branch handoff", () => {
    const storage = snapshot({
      objects: [
        object("synthesis.branch-handoff-feature", "synthesis", "active", "Branch handoff", "The current branch has partially completed work, open verification, and a concrete next action for the next agent.", "roadmap", "feature"),
        object("synthesis.branch-handoff-other", "synthesis", "active", "Other handoff", "This handoff belongs to another branch and should be hidden.", "roadmap", "other")
      ],
      relations: []
    });

    const lens = buildMemoryLens(storage, { available: true, branch: "feature" }, "current-work");

    expect(lens.included_memory_ids).toContain("synthesis.branch-handoff-feature");
    expect(lens.included_memory_ids).not.toContain("synthesis.branch-handoff-other");
    expect(lens.markdown).toContain("Branch Handoff");
  });

  it("renders challenged memories in the maintenance lens", () => {
    const storage = snapshot({
      objects: [
        object("architecture.current", "architecture", "active", "Architecture", "Current architecture summary needs review.", "architecture"),
        object("source.new-article", "source", "active", "New article", "New source article challenges the architecture summary.", "source")
      ],
      relations: [
        relation("rel.article-challenges-architecture", "source.new-article", "challenges", "architecture.current")
      ]
    });

    const lens = buildMemoryLens(storage, { available: true, branch: "main" }, "maintenance");

    expect(lens.included_memory_ids).toEqual(
      expect.arrayContaining(["architecture.current", "source.new-article"])
    );
    expect(lens.relation_ids).toContain("rel.article-challenges-architecture");
    expect(lens.markdown).toContain("source.new-article` challenges `architecture.current");
  });
});

function snapshot(input: {
  objects: StoredMemoryObject[];
  relations: StoredMemoryRelation[];
}): CanonicalStorageSnapshot {
  return {
    projectRoot: "/tmp/project",
    memoryRoot: "/tmp/project/.memory",
    config: {
      version: 4,
      project: {
        id: "project.test",
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
    objects: input.objects,
    relations: input.relations,
    events: []
  };
}

function object(
  id: string,
  type: ObjectType,
  status: ObjectStatus,
  title: string,
  body: string,
  category: string,
  branch: string | null = null
): StoredMemoryObject {
  return {
    path: `.memory/memory/${id}.json`,
    bodyPath: `.memory/memory/${id}.md`,
    body: `# ${title}\n\n${body}\n`,
    sidecar: {
      id,
      type,
      status,
      title,
      body_path: `memory/${id}.md`,
      scope: {
        kind: branch === null ? "project" : "branch",
        project: "project.test",
        branch,
        task: null
      },
      tags: id.startsWith("synthesis.branch-handoff-") ? ["branch-handoff"] : [],
      facets: {
        category: category as never
      },
      content_hash: `sha256:${"a".repeat(64)}`,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z"
    }
  };
}

function relation(
  id: string,
  from: string,
  predicate: StoredMemoryRelation["relation"]["predicate"],
  to: string
): StoredMemoryRelation {
  return {
    path: `.memory/relations/${id}.json`,
    relation: {
      id,
      from,
      predicate,
      to,
      status: "active",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z"
    }
  };
}
