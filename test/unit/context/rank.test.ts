import { describe, expect, it } from "vitest";

import {
  rankMemoryCandidates,
  type RankMemoryCandidate
} from "../../../src/context/rank.js";
import type { GitState, Scope } from "../../../src/core/types.js";
import type { MemoryRelation } from "../../../src/storage/relations.js";

const PROJECT_ID = "project.rank-test";
const GIT_MAIN: GitState = {
  available: true,
  branch: "main",
  commit: "abc123",
  dirty: false
};
const GIT_UNAVAILABLE: GitState = {
  available: false,
  branch: null,
  commit: null,
  dirty: null
};
const GIT_DETACHED: GitState = {
  available: true,
  branch: null,
  commit: "abc123",
  dirty: false
};

describe("context memory ranking", () => {
  it("returns the same deterministic order for repeated inputs", () => {
    const candidates = [
      memory({
        id: "note.beta",
        title: "Ranking tie",
        body: "Ranking tie body.",
        updated_at: "2026-04-27T12:00:00+02:00"
      }),
      memory({
        id: "note.alpha",
        title: "Ranking tie",
        body: "Ranking tie body.",
        updated_at: "2026-04-27T12:00:00+02:00"
      }),
      memory({
        id: "note.newer",
        title: "Ranking tie",
        body: "Ranking tie body.",
        updated_at: "2026-04-27T12:01:00+02:00"
      })
    ];

    const first = rankMemoryCandidates({
      task: "ranking",
      projectId: PROJECT_ID,
      git: GIT_MAIN,
      candidates
    });
    const second = rankMemoryCandidates({
      task: "ranking",
      projectId: PROJECT_ID,
      git: GIT_MAIN,
      candidates
    });

    expect(first.items.map((item) => item.id)).toEqual([
      "note.newer",
      "note.alpha",
      "note.beta"
    ]);
    expect(second.items.map((item) => item.id)).toEqual(first.items.map((item) => item.id));
  });

  it("applies exact, tag, title, body, type, status, and recent scoring", () => {
    const candidate = memory({
      id: "constraint.webhook-idempotency",
      type: "constraint",
      title: "Webhook idempotency",
      body_path: ".aictx/memory/constraints/webhook-idempotency.md",
      body: "Webhook handlers must be idempotent.",
      tags: ["stripe"],
      updated_at: "2026-04-27T12:00:00+02:00"
    });

    const result = rankMemoryCandidates({
      task:
        "Read constraint.webhook-idempotency at .aictx/memory/constraints/webhook-idempotency.md for Stripe webhook work.",
      projectId: PROJECT_ID,
      git: GIT_MAIN,
      candidates: [candidate]
    });

    expect(result.items[0]).toMatchObject({
      id: "constraint.webhook-idempotency",
      score: 310,
      scoreBreakdown: {
        exactId: 100,
        exactBodyPath: 80,
        tagMatch: 40,
        titleFtsMatch: 30,
        bodyFtsMatch: 15,
        recentMemoryBoost: 5,
        typeModifier: 20,
        statusModifier: 20
      }
    });
  });

  it("accepts gotcha and workflow candidates with neutral type modifiers", () => {
    const result = rankMemoryCandidates({
      task: "webhook release",
      projectId: PROJECT_ID,
      git: GIT_MAIN,
      candidates: [
        memory({
          id: "gotcha.webhook-duplicates",
          type: "gotcha",
          title: "Webhook duplicates",
          body: "Never assume webhook delivery is unique.",
          body_path: "memory/gotchas/webhook-duplicates.md"
        }),
        memory({
          id: "workflow.release-checklist",
          type: "workflow",
          title: "Release checklist",
          body: "Run the release checklist before publishing.",
          body_path: "memory/workflows/release-checklist.md"
        })
      ]
    });

    expect(result.items.map((item) => item.id)).toEqual([
      "gotcha.webhook-duplicates",
      "workflow.release-checklist"
    ]);
    expect(result.items.map((item) => item.scoreBreakdown.typeModifier)).toEqual([0, 0]);
  });

  it("excludes rejected memory from default output", () => {
    const result = rankMemoryCandidates({
      task: "webhook",
      projectId: PROJECT_ID,
      git: GIT_MAIN,
      candidates: [
        memory({
          id: "constraint.active-webhook",
          type: "constraint",
          title: "Webhook constraint",
          body: "Webhook behavior."
        }),
        memory({
          id: "note.rejected-webhook",
          status: "rejected",
          title: "Rejected webhook",
          body: "Rejected webhook behavior."
        })
      ]
    });

    expect(result.items.map((item) => item.id)).not.toContain("note.rejected-webhook");
    expect(result.mustKnow.map((item) => item.id)).not.toContain("note.rejected-webhook");
    expect(result.staleOrSuperseded.map((item) => item.id)).not.toContain(
      "note.rejected-webhook"
    );
    expect(result.excluded).toContainEqual(
      expect.objectContaining({
        id: "note.rejected-webhook",
        reason: "rejected"
      })
    );
  });

  it("routes stale and superseded memory away from Must know", () => {
    const result = rankMemoryCandidates({
      task: "webhook",
      projectId: PROJECT_ID,
      git: GIT_MAIN,
      candidates: [
        memory({
          id: "constraint.active-webhook",
          type: "constraint",
          status: "active",
          title: "Active webhook",
          body: "Webhook behavior."
        }),
        memory({
          id: "decision.stale-webhook",
          type: "decision",
          status: "stale",
          title: "Stale webhook",
          body: "Webhook behavior used an old queue."
        }),
        memory({
          id: "note.superseded-webhook",
          status: "superseded",
          title: "Superseded webhook",
          body: "Webhook behavior was replaced."
        })
      ]
    });

    expect(result.mustKnow.map((item) => item.id)).toEqual(["constraint.active-webhook"]);
    expect(result.staleOrSuperseded.map((item) => item.id)).toEqual([
      "decision.stale-webhook",
      "note.superseded-webhook"
    ]);
    expect(result.items.map((item) => item.id)).toEqual(
      expect.arrayContaining(["decision.stale-webhook", "note.superseded-webhook"])
    );
  });

  it("includes branch-scoped memory only on exact current branch match", () => {
    const result = rankMemoryCandidates({
      task: "branch",
      projectId: PROJECT_ID,
      git: GIT_MAIN,
      candidates: [
        memory({
          id: "note.branch-main",
          title: "Branch main",
          body: "Branch body.",
          scope: branchScope("main")
        }),
        memory({
          id: "note.branch-feature",
          title: "Branch feature",
          body: "Branch body.",
          scope: branchScope("feature/ranking")
        })
      ]
    });

    expect(result.items.map((item) => item.id)).toEqual(["note.branch-main"]);
    expect(result.excluded).toContainEqual(
      expect.objectContaining({
        id: "note.branch-feature",
        reason: "scope_branch_mismatch"
      })
    );
  });

  it("excludes branch-scoped memory without a current branch", () => {
    for (const git of [GIT_UNAVAILABLE, GIT_DETACHED]) {
      const result = rankMemoryCandidates({
        task: "branch",
        projectId: PROJECT_ID,
        git,
        candidates: [
          memory({
            id: "note.branch-main",
            title: "Branch main",
            body: "Branch body.",
            scope: branchScope("main")
          })
        ]
      });

      expect(result.items).toHaveLength(0);
      expect(result.excluded).toContainEqual(
        expect.objectContaining({
          id: "note.branch-main",
          reason: "scope_branch_unavailable"
        })
      );
    }
  });

  it("includes task-scoped memory only for strong task matches", () => {
    const strong = rankMemoryCandidates({
      task: "Fix Stripe webhook retries in the queue worker",
      projectId: PROJECT_ID,
      git: GIT_MAIN,
      candidates: [
        memory({
          id: "note.strong-task",
          title: "Scoped task",
          body: "Task memory.",
          scope: taskScope("Stripe webhook retries")
        })
      ]
    });
    const strongByTerms = rankMemoryCandidates({
      task: "Webhook delivery for Stripe",
      projectId: PROJECT_ID,
      git: GIT_MAIN,
      candidates: [
        memory({
          id: "note.strong-terms",
          title: "Scoped task",
          body: "Task memory.",
          scope: taskScope("Stripe webhook")
        })
      ]
    });
    const weak = rankMemoryCandidates({
      task: "Fix webhook parser",
      projectId: PROJECT_ID,
      git: GIT_MAIN,
      candidates: [
        memory({
          id: "note.weak-task",
          title: "Scoped task",
          body: "Task memory.",
          scope: taskScope("Stripe webhook retries")
        })
      ]
    });

    expect(strong.items.map((item) => item.id)).toEqual(["note.strong-task"]);
    expect(strongByTerms.items.map((item) => item.id)).toEqual(["note.strong-terms"]);
    expect(weak.items).toHaveLength(0);
    expect(weak.excluded).toContainEqual(
      expect.objectContaining({
        id: "note.weak-task",
        reason: "scope_task_weak_match"
      })
    );
  });

  it("applies one-hop relation boosts and predicate modifiers", () => {
    const matched = memory({
      id: "decision.webhook-retries",
      type: "decision",
      title: "Webhook retries",
      body: "Webhook retries happen in the worker."
    });
    const related = memory({
      id: "constraint.queue-worker",
      type: "constraint",
      title: "Queue worker",
      body: "Use the queue worker."
    });

    const result = rankMemoryCandidates({
      task: "webhook retries",
      projectId: PROJECT_ID,
      git: GIT_MAIN,
      candidates: [matched, related],
      relations: [
        relation({
          from: "decision.webhook-retries",
          predicate: "requires",
          to: "constraint.queue-worker"
        })
      ]
    });
    const relatedItem = result.items.find((item) => item.id === "constraint.queue-worker");

    expect(relatedItem).toMatchObject({
      matched: true,
      scoreBreakdown: {
        relationNeighborhood: 12,
        relationPredicate: 12
      }
    });
  });

  it("applies recent boost to the five newest boostable candidates only", () => {
    const candidates = Array.from({ length: 6 }, (_, index) =>
      memory({
        id: `note.recent-${index}`,
        title: "Shared ranking",
        body: "Shared ranking body.",
        updated_at: `2026-04-27T12:0${index}:00+02:00`
      })
    );

    const result = rankMemoryCandidates({
      task: "shared ranking",
      projectId: PROJECT_ID,
      git: GIT_MAIN,
      candidates
    });

    expect(result.items.map((item) => item.id)).toEqual([
      "note.recent-5",
      "note.recent-4",
      "note.recent-3",
      "note.recent-2",
      "note.recent-1",
      "note.recent-0"
    ]);
    expect(result.items.find((item) => item.id === "note.recent-5")?.scoreBreakdown).toMatchObject({
      recentMemoryBoost: 5
    });
    expect(result.items.find((item) => item.id === "note.recent-0")?.scoreBreakdown).toMatchObject({
      recentMemoryBoost: 0
    });
  });

  it("keeps conflicted memory out of high-priority sections by default", () => {
    const result = rankMemoryCandidates({
      task: "webhook",
      projectId: PROJECT_ID,
      git: GIT_MAIN,
      candidates: [
        memory({
          id: "constraint.webhook-conflict",
          type: "constraint",
          title: "Webhook conflict",
          body: "Webhook behavior."
        })
      ],
      conflictedIds: ["constraint.webhook-conflict"]
    });

    expect(result.items.map((item) => item.id)).toEqual(["constraint.webhook-conflict"]);
    expect(result.mustKnow).toHaveLength(0);
    expect(result.excluded).toContainEqual(
      expect.objectContaining({
        id: "constraint.webhook-conflict",
        reason: "conflicted_high_priority"
      })
    );
  });
});

function memory(overrides: Partial<RankMemoryCandidate> & { id: string }): RankMemoryCandidate {
  return {
    id: overrides.id,
    type: overrides.type ?? "note",
    status: overrides.status ?? "active",
    title: overrides.title ?? "Memory",
    body_path: overrides.body_path ?? `memory/notes/${overrides.id.replace(".", "-")}.md`,
    body: overrides.body ?? "Memory body.",
    scope: overrides.scope ?? projectScope(),
    tags: overrides.tags ?? [],
    updated_at: overrides.updated_at ?? "2026-04-27T12:00:00+02:00"
  };
}

function relation(
  overrides: Pick<MemoryRelation, "from" | "predicate" | "to"> & Partial<MemoryRelation>
): MemoryRelation {
  return {
    id: `${overrides.from}-${overrides.predicate}-${overrides.to}`,
    from: overrides.from,
    predicate: overrides.predicate,
    to: overrides.to,
    status: overrides.status ?? "active",
    created_at: overrides.created_at ?? "2026-04-27T12:00:00+02:00",
    updated_at: overrides.updated_at ?? "2026-04-27T12:00:00+02:00"
  };
}

function projectScope(project = PROJECT_ID): Scope {
  return {
    kind: "project",
    project,
    branch: null,
    task: null
  };
}

function branchScope(branch: string): Scope {
  return {
    kind: "branch",
    project: PROJECT_ID,
    branch,
    task: null
  };
}

function taskScope(task: string, branch: string | null = null): Scope {
  return {
    kind: "task",
    project: PROJECT_ID,
    branch,
    task
  };
}
