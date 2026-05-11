import { describe, expect, it } from "vitest";

import {
  buildRoleCoverage,
  type MemoryRoleKey
} from "../../../src/roles/coverage.js";
import type { ObjectStatus, ObjectType } from "../../../src/core/types.js";
import type { CanonicalStorageSnapshot } from "../../../src/storage/read.js";
import type { StoredMemoryObject } from "../../../src/storage/objects.js";
import type { StoredMemoryRelation } from "../../../src/storage/relations.js";

describe("memory role coverage", () => {
  it("detects populated, thin, missing, stale, and conflicted roles", () => {
    const storage = snapshot({
      objects: [
        object("synthesis.feature-map", "synthesis", "active", "Feature map", "# Feature map\n\nThis capability map is long enough to count as populated because it describes durable user-facing functions and command surfaces in concrete detail.\n", "feature-map"),
        object("synthesis.repository-map", "synthesis", "stale", "Repository map", "# Repository map\n\nOld layout.\n", "file-layout"),
        object("architecture.current", "architecture", "active", "Architecture", "# Architecture\n\nShort.\n", "architecture"),
        object("decision.current-architecture", "decision", "active", "Decision", "# Decision\n\nThe current architecture conflicts with the short architecture summary.\n", "decision-rationale")
      ],
      relations: [
        relation(
          "rel.architecture-conflict",
          "architecture.current",
          "conflicts_with",
          "decision.current-architecture"
        )
      ]
    });

    const coverage = buildRoleCoverage(storage, {
      available: true,
      branch: "main"
    });

    expect(role(coverage, "capability-map")).toEqual(
      expect.objectContaining({
        status: "populated",
        memory_ids: ["synthesis.feature-map"]
      })
    );
    expect(role(coverage, "repository-map")).toEqual(
      expect.objectContaining({
        status: "stale",
        memory_ids: ["synthesis.repository-map"]
      })
    );
    expect(role(coverage, "architecture-patterns").status).toBe("conflicted");
    expect(role(coverage, "agent-guidance").status).toBe("missing");
    expect(coverage.counts.populated).toBeGreaterThanOrEqual(1);
    expect(coverage.counts.missing).toBeGreaterThanOrEqual(1);
    expect(role(coverage, "agent-guidance").gap).toContain("Agent Guidance is missing");
  });

  it("matches branch handoff only on the current branch", () => {
    const storage = snapshot({
      objects: [
        object(
          "synthesis.branch-handoff-feature-a",
          "synthesis",
          "active",
          "Branch handoff",
          "# Branch handoff\n\nThe branch has enough details about current work, verification, open questions, and the next useful action for another agent to continue safely.\n",
          "roadmap",
          "feature/a"
        )
      ],
      relations: []
    });

    expect(
      role(
        buildRoleCoverage(storage, {
          available: true,
          branch: "feature/a"
        }),
        "branch-handoff"
      ).status
    ).toBe("populated");
    expect(
      role(
        buildRoleCoverage(storage, {
          available: true,
          branch: "main"
        }),
        "branch-handoff"
      ).status
    ).toBe("missing");
    expect(
      role(
        buildRoleCoverage(storage, {
          available: true,
          branch: "main"
        }),
        "branch-handoff"
      ).gap
    ).toBeNull();
  });

  it("uses handoff-specific gaps for thin and stale branch handoffs", () => {
    const thinStorage = snapshot({
      objects: [
        object(
          "synthesis.branch-handoff-feature-a",
          "synthesis",
          "active",
          "Branch handoff",
          "# Branch handoff\n\nNext action pending.\n",
          "roadmap",
          "feature/a"
        )
      ],
      relations: []
    });
    const staleStorage = snapshot({
      objects: [
        object(
          "synthesis.branch-handoff-feature-a",
          "synthesis",
          "stale",
          "Branch handoff",
          "# Branch handoff\n\nClosed work.\n",
          "roadmap",
          "feature/a"
        )
      ],
      relations: []
    });

    expect(
      role(
        buildRoleCoverage(thinStorage, {
          available: true,
          branch: "feature/a"
        }),
        "branch-handoff"
      ).gap
    ).toContain("aictx handoff update --stdin");
    expect(
      role(
        buildRoleCoverage(staleStorage, {
          available: true,
          branch: "feature/a"
        }),
        "branch-handoff"
      ).gap
    ).toContain("closed or stale");
  });
});

function role(
  coverage: ReturnType<typeof buildRoleCoverage>,
  key: MemoryRoleKey
): ReturnType<typeof buildRoleCoverage>["roles"][number] {
  const item = coverage.roles.find((candidate) => candidate.key === key);

  if (item === undefined) {
    throw new Error(`Missing role ${key}`);
  }

  return item;
}

function snapshot(input: {
  objects: StoredMemoryObject[];
  relations: StoredMemoryRelation[];
}): CanonicalStorageSnapshot {
  return {
    projectRoot: "/tmp/project",
    aictxRoot: "/tmp/project/.aictx",
    config: {
      version: 3,
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
    path: `.aictx/memory/${id}.json`,
    bodyPath: `.aictx/memory/${id}.md`,
    body,
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
    path: `.aictx/relations/${id}.json`,
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
