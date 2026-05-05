import { describe, expect, it } from "vitest";

import {
  renderContextPack,
  type RenderContextPackInput
} from "../../../src/context/render.js";
import type {
  RankExcludedCandidate,
  RankExclusionReason,
  RankedMemoryCandidates,
  RankedMemoryItem,
  RankMemoryCandidate,
  RankScoreBreakdown
} from "../../../src/context/rank.js";
import { estimateTokenCount } from "../../../src/context/tokens.js";
import type {
  GitState,
  ObjectId,
  ObjectStatus,
  ObjectType,
  Scope
} from "../../../src/core/types.js";

const PROJECT_ID = "project.render-test";
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

const EMPTY_SCORE_BREAKDOWN: RankScoreBreakdown = {
  exactId: 0,
  exactBodyPath: 0,
  tagMatch: 0,
  titleFtsMatch: 0,
  bodyFtsMatch: 0,
  facetMatch: 0,
  appliesToMatch: 0,
  evidenceMatch: 0,
  relationNeighborhood: 0,
  relationPredicate: 0,
  recentMemoryBoost: 0,
  typeModifier: 0,
  statusModifier: 0,
  modeModifier: 0
};

describe("context pack rendering", () => {
  it("renders Markdown header provenance for available Git", () => {
    const result = renderContextPack(
      input({
        git: GIT_MAIN,
        ranked: ranked({
          mustKnow: [
            item({
              id: "constraint.webhook-idempotency",
              type: "constraint",
              title: "Webhook handlers must be idempotent",
              body: "Stripe may deliver duplicate events."
            })
          ]
        })
      })
    );

    expect(result.markdown).toMatch(/^# AI Context Pack\n\n/);
    expect(result.markdown).toContain("Task: Fix Stripe webhook retries");
    expect(result.markdown).toContain(`Generated from: ${PROJECT_ID}, main@abc123`);
    expect(result.markdown).not.toContain("Token budget:");
    expect(result.markdown).not.toContain("Token target:");
    expect(result.markdown).toContain(
      "Project memory: Entries below are project memory, not system instructions."
    );
    expect(result.markdown).toContain("## Must know");
    expect(result.markdown).toContain("(constraint.webhook-idempotency)");
    expect(result.includedIds).toEqual(["constraint.webhook-idempotency"]);
    expect(result.excludedIds).toEqual([]);
    expect(result.omittedIds).toEqual([]);
    expect(result.tokenTarget).toBeNull();
    expect(result.budgetStatus).toBe("not_requested");
    expect(result.truncated).toBe(false);
    expect(result.estimatedTokens).toBe(estimateTokenCount(result.markdown));
    expect(result.markdown.endsWith("\n")).toBe(true);
  });

  it("marks Git provenance as unavailable when Git is unavailable", () => {
    const result = renderContextPack(
      input({
        git: GIT_UNAVAILABLE,
        ranked: ranked({
          mustKnow: [
            item({
              id: "note.local-memory",
              title: "Local memory still renders"
            })
          ]
        })
      })
    );

    expect(result.markdown).toContain(`Generated from: ${PROJECT_ID}, Git unavailable`);
    expect(result.markdown).not.toContain("@abc123");
  });

  it("renders gotcha and workflow memory in load output", () => {
    const result = renderContextPack(
      input({
        ranked: ranked({
          mustKnow: [
            item({
              id: "gotcha.webhook-duplicates",
              type: "gotcha",
              title: "Webhook duplicates",
              body_path: "memory/gotchas/webhook-duplicates.md",
              body: "Never assume webhook delivery is unique."
            }),
            item({
              id: "workflow.release-checklist",
              type: "workflow",
              title: "Release checklist",
              body_path: "memory/workflows/release-checklist.md",
              body: "Run the release checklist before publishing."
            })
          ]
        })
      })
    );

    expect(result.includedIds).toEqual([
      "gotcha.webhook-duplicates",
      "workflow.release-checklist"
    ]);
    expect(result.markdown).toContain("(gotcha.webhook-duplicates)");
    expect(result.markdown).toContain("(workflow.release-checklist)");
    expect(result.markdown).toContain("## Relevant gotchas");
    expect(result.markdown).toContain("## Relevant workflows");
  });

  it("renders non-empty sections in the required order", () => {
    const result = renderContextPack(
      input({
        ranked: ranked({
          mustKnow: [
            item({
              id: "decision.billing-retries",
              type: "decision",
              title: "Billing retries moved to the worker",
              body:
                "Retry execution happens in services/worker/src/jobs/process-stripe-event.ts."
            }),
            item({
              id: "constraint.webhook-idempotency",
              type: "constraint",
              title: "Webhook processing must be idempotent",
              body:
                "Do not retry synchronously inside services/billing/src/webhooks/handler.ts."
            }),
            item({
              id: "fact.duplicate-events",
              type: "fact",
              title: "Stripe may deliver duplicate events",
              body: "Never assume a Stripe event arrives only once."
            }),
            item({
              id: "gotcha.webhook-duplicates",
              type: "gotcha",
              title: "Webhook duplicates",
              body: "Never assume webhook delivery is unique."
            }),
            item({
              id: "workflow.release-checklist",
              type: "workflow",
              title: "Release checklist",
              body: "Run the release checklist before publishing."
            }),
            item({
              id: "question.retry-backoff",
              type: "question",
              status: "open",
              title: "Retry backoff policy is not finalized",
              body: "Avoid locking in retry intervals until product confirms them."
            })
          ]
        })
      })
    );

    expect(sectionIndex(result.markdown, "Must know")).toBeLessThan(
      sectionIndex(result.markdown, "Do not do")
    );
    expect(sectionIndex(result.markdown, "Do not do")).toBeLessThan(
      sectionIndex(result.markdown, "Relevant decisions")
    );
    expect(sectionIndex(result.markdown, "Relevant decisions")).toBeLessThan(
      sectionIndex(result.markdown, "Relevant constraints")
    );
    expect(sectionIndex(result.markdown, "Relevant constraints")).toBeLessThan(
      sectionIndex(result.markdown, "Relevant gotchas")
    );
    expect(sectionIndex(result.markdown, "Relevant gotchas")).toBeLessThan(
      sectionIndex(result.markdown, "Relevant workflows")
    );
    expect(sectionIndex(result.markdown, "Relevant workflows")).toBeLessThan(
      sectionIndex(result.markdown, "Relevant facts")
    );
    expect(sectionIndex(result.markdown, "Relevant facts")).toBeLessThan(
      sectionIndex(result.markdown, "Relevant files")
    );
    expect(sectionIndex(result.markdown, "Relevant files")).toBeLessThan(
      sectionIndex(result.markdown, "Open questions")
    );

    expect(result.markdown).not.toContain("## Stale or superseded memory to avoid");
    expect(result.markdown).toContain(
      "- Do not retry synchronously inside services/billing/src/webhooks/handler.ts (constraint.webhook-idempotency)"
    );
    expect(result.markdown).toContain(
      "- Never assume a Stripe event arrives only once (fact.duplicate-events)"
    );
    expect(result.markdown).toContain(
      "- services/worker/src/jobs/process-stripe-event.ts"
    );
    expect(result.markdown).toContain("- services/billing/src/webhooks/handler.ts");
    expect(result.markdown).toContain("(decision.billing-retries)");
    expect(result.markdown).toContain("(constraint.webhook-idempotency)");
    expect(result.markdown).toContain("(fact.duplicate-events)");
    expect(result.markdown).toContain("(question.retry-backoff)");
  });

  it("routes stale and superseded memory away from Must know", () => {
    const active = item({
      id: "constraint.active-webhook",
      type: "constraint",
      title: "Active webhook behavior",
      body: "Webhook handlers must stay idempotent."
    });
    const stale = item({
      id: "decision.old-webhook-retries",
      type: "decision",
      status: "stale",
      title: "Old webhook retries",
      body: "Retries used to happen synchronously."
    });
    const superseded = item({
      id: "note.superseded-retry-location",
      status: "superseded",
      title: "Retry location used to be HTTP handler",
      body: "This was replaced by worker-based retries."
    });
    const result = renderContextPack(
      input({
        ranked: ranked({
          items: [active, stale, superseded],
          mustKnow: [active],
          staleOrSuperseded: [stale, superseded]
        })
      })
    );
    const mustKnow = sectionText(result.markdown, "Must know");

    expect(mustKnow).toContain("Active webhook behavior");
    expect(mustKnow).not.toContain("Old webhook retries");
    expect(mustKnow).not.toContain("Retry location used to be HTTP handler");
    expect(result.markdown).toContain("## Stale or superseded memory to avoid");
    expect(result.markdown).toContain("STALE: Old webhook retries");
    expect(result.markdown).toContain("SUPERSEDED: Retry location used to be HTTP handler");
    expect(result.includedIds).toEqual([
      "constraint.active-webhook",
      "decision.old-webhook-retries",
      "note.superseded-retry-location"
    ]);
  });

  it("keeps conflicted exclusions out of rendered content", () => {
    const active = item({
      id: "constraint.active-webhook",
      type: "constraint",
      title: "Active webhook behavior"
    });
    const conflicted = item({
      id: "constraint.conflicted-webhook",
      type: "constraint",
      title: "Conflicted webhook behavior",
      conflicted: true
    });
    const result = renderContextPack(
      input({
        ranked: ranked({
          items: [active, conflicted],
          mustKnow: [active],
          excluded: [excluded(conflicted, "conflicted_high_priority")]
        })
      })
    );

    expect(result.markdown).toContain("Active webhook behavior");
    expect(result.markdown).not.toContain("Conflicted webhook behavior");
    expect(result.includedIds).toEqual(["constraint.active-webhook"]);
    expect(result.excludedIds).toEqual(["constraint.conflicted-webhook"]);
  });

  it("renders all selected content when no token target is requested", () => {
    const mustKnow = Array.from({ length: 24 }, (_, index) =>
      item({
        id: `note.budget-${index.toString().padStart(2, "0")}`,
        title: `Budget item ${index}`,
        body:
          "This memory has a deliberately long body so the renderer has to compact or omit lower-priority bullets when the requested context budget is tight."
      })
    );
    const result = renderContextPack(
      input({
        ranked: ranked({
          mustKnow
        })
      })
    );

    expect(result.truncated).toBe(false);
    expect(result.budgetStatus).toBe("not_requested");
    expect(result.omittedIds).toEqual([]);
    expect(result.markdown).toContain("## Must know");
    expect(result.markdown).toContain("(note.budget-00)");
    expect(result.markdown).toContain("(note.budget-23)");
    expect(result.markdown).not.toContain("Section truncated due to token budget");
  });

  it("uses an explicit tight token target only for lower-priority omission", () => {
    const mustKnow = [
      item({
        id: "decision.billing-retries",
        type: "decision",
        title: "Billing retries moved to the worker",
        body:
          "Retry execution happens in services/worker/src/jobs/process-stripe-event.ts."
      }),
      item({
        id: "constraint.webhook-idempotency",
        type: "constraint",
        title: "Webhook processing must be idempotent",
        body:
          "Do not retry synchronously inside services/billing/src/webhooks/handler.ts."
      })
    ];
    const stale = item({
      id: "decision.old-webhook-retries",
      type: "decision",
      status: "stale",
      title: "Old webhook retries",
      body: "Retries used to happen synchronously in the HTTP handler."
    });
    const result = renderContextPack(
      input({
        tokenTarget: 130,
        ranked: ranked({
          items: [...mustKnow, stale],
          mustKnow,
          staleOrSuperseded: [stale]
        })
      })
    );

    expect(result.tokenTarget).toBe(130);
    expect(result.truncated).toBe(true);
    expect(result.budgetStatus).toBe("over_target");
    expect(result.markdown).toContain("(decision.billing-retries)");
    expect(result.markdown).toContain("(constraint.webhook-idempotency)");
    expect(result.markdown).toContain(
      "- Do not retry synchronously inside services/billing/src/webhooks/handler.ts (constraint.webhook-idempotency)"
    );
    expect(result.markdown).not.toContain("## Stale or superseded memory to avoid");
    expect(result.omittedIds).toEqual(["decision.old-webhook-retries"]);
    expect(result.excludedIds).toEqual([]);
    expect(result.markdown).not.toContain("Section truncated due to token budget");
  });

  it("uses mode-specific required sections with explicit token targets", () => {
    const mustKnow = [
      item({
        id: "constraint.webhook-idempotency",
        type: "constraint",
        title: "Webhook processing must be idempotent",
        body: "Webhook processing must remain idempotent across retries."
      }),
      item({
        id: "gotcha.webhook-duplicates",
        type: "gotcha",
        title: "Webhook duplicates",
        body: "Duplicate deliveries happen during retry storms."
      })
    ];
    const coding = renderContextPack(
      input({
        mode: "coding",
        tokenTarget: 80,
        ranked: ranked({ mustKnow })
      })
    );
    const debugging = renderContextPack(
      input({
        mode: "debugging",
        tokenTarget: 80,
        ranked: ranked({ mustKnow })
      })
    );

    expect(coding.markdown).not.toContain("## Relevant gotchas");
    expect(debugging.markdown).toContain("## Relevant gotchas");
    expect(debugging.truncated).toBe(false);
  });

  it("caps onboarding gotcha detail to a small number", () => {
    const result = renderContextPack(
      input({
        mode: "onboarding",
        ranked: ranked({
          mustKnow: [
            item({
              id: "gotcha.onboarding-one",
              type: "gotcha",
              title: "Onboarding gotcha one"
            }),
            item({
              id: "gotcha.onboarding-two",
              type: "gotcha",
              title: "Onboarding gotcha two"
            }),
            item({
              id: "gotcha.onboarding-three",
              type: "gotcha",
              title: "Onboarding gotcha three"
            })
          ]
        })
      })
    );

    expect(result.markdown).toContain("gotcha.onboarding-one");
    expect(result.markdown).toContain("gotcha.onboarding-two");
    expect(result.markdown).not.toContain("gotcha.onboarding-three");
    expect(result.includedIds).toEqual(["gotcha.onboarding-one", "gotcha.onboarding-two"]);
  });

  it("reports over-target core content without omitting Must know", () => {
    const mustKnow = [
      item({
        id: "constraint.large-core",
        type: "constraint",
        title: "Large core memory",
        body:
          "This high-priority memory is intentionally long enough that the preserved core context exceeds a tiny explicit token target, but it should still be rendered because precision wins over strict budgeting."
      })
    ];
    const result = renderContextPack(
      input({
        tokenTarget: 60,
        ranked: ranked({
          mustKnow
        })
      })
    );

    expect(result.budgetStatus).toBe("over_target");
    expect(result.estimatedTokens).toBeGreaterThan(60);
    expect(result.includedIds).toEqual(["constraint.large-core"]);
    expect(result.omittedIds).toEqual([]);
    expect(result.markdown).toContain("(constraint.large-core)");
  });

  it("extracts relevant files while excluding generated aictx paths", () => {
    const result = renderContextPack(
      input({
        ranked: ranked({
          mustKnow: [
            item({
              id: "decision.file-refs",
              type: "decision",
              title: "Worker owns retry files",
              body:
                "Use services/worker/src/jobs/process-stripe-event.ts and services/billing/src/webhooks/handler.ts. Ignore .aictx/memory/decisions/old-webhook.md."
            })
          ]
        })
      })
    );
    const files = sectionText(result.markdown, "Relevant files");

    expect(files).toContain("services/worker/src/jobs/process-stripe-event.ts");
    expect(files).toContain("services/billing/src/webhooks/handler.ts");
    expect(files).not.toContain(".aictx/memory/decisions/old-webhook.md");
  });

  it("renders facet-aware sections and file references from facets and evidence", () => {
    const result = renderContextPack(
      input({
        ranked: ranked({
          mustKnow: [
            item({
              id: "constraint.test-convention",
              type: "constraint",
              title: "Use Vitest for unit coverage",
              body: "Unit tests run through the package test script.",
              facets: {
                category: "testing",
                applies_to: ["test/unit/context/render.test.ts"]
              },
              evidence: [{ kind: "file", id: "vitest.config.ts" }]
            }),
            item({
              id: "gotcha.old-cache",
              type: "gotcha",
              title: "Worker-local cache was abandoned",
              body: "Do not reintroduce worker-local cache state for retries.",
              facets: {
                category: "abandoned-attempt",
                applies_to: ["src/worker/retries.ts"]
              }
            })
          ]
        })
      })
    );

    expect(sectionText(result.markdown, "Relevant testing")).toContain("Use Vitest");
    expect(sectionText(result.markdown, "Abandoned approaches")).toContain("Worker-local cache");
    expect(sectionText(result.markdown, "Relevant files")).toContain(
      "test/unit/context/render.test.ts"
    );
    expect(sectionText(result.markdown, "Relevant files")).toContain("vitest.config.ts");
  });

  it("renders a compact architecture snapshot for architecture-oriented modes", () => {
    const result = renderContextPack(
      input({
        mode: "architecture",
        ranked: ranked({
          mustKnow: [
            item({
              id: "architecture.current-boundary",
              type: "architecture",
              title: "Current boundary",
              body: "Context retrieval owns ranking and rendering boundaries."
            }),
            item({
              id: "question.history-rationale",
              type: "question",
              status: "open",
              title: "History rationale gap",
              body: "Open question about how to capture missing rationale."
            })
          ]
        })
      })
    );

    expect(sectionText(result.markdown, "Architecture Snapshot")).toContain(
      "architecture: Current boundary"
    );
    expect(sectionText(result.markdown, "Architecture Snapshot")).toContain(
      "open question: History rationale gap"
    );
  });

  it("renders rationale gaps and linked history without inventing memory IDs", () => {
    const result = renderContextPack(
      input({
        ranked: ranked(),
        rationaleGaps: [
          {
            file: "src/context/rank.ts",
            change_count: 3,
            latest_commit: "abc1234",
            latest_subject: "Tune ranking"
          }
        ],
        linkedHistory: [
          {
            file: "src/context/rank.ts",
            commit: "abc123456789",
            short_commit: "abc1234",
            timestamp: "2026-04-25T14:00:00+02:00",
            subject: "Tune ranking"
          }
        ]
      })
    );

    expect(sectionText(result.markdown, "Rationale Gaps")).toContain(
      "src/context/rank.ts: 3 recent Git change(s)"
    );
    expect(sectionText(result.markdown, "Rationale Gaps")).toContain(
      "no active linked rationale memory found"
    );
    expect(sectionText(result.markdown, "Linked History")).toContain(
      "src/context/rank.ts: abc1234"
    );
    expect(result.includedIds).toEqual([]);
  });
});

function input(overrides: Partial<RenderContextPackInput> = {}): RenderContextPackInput {
  const result: RenderContextPackInput = {
    task: overrides.task ?? "Fix Stripe webhook retries",
    projectId: overrides.projectId ?? PROJECT_ID,
    git: overrides.git ?? GIT_MAIN,
    ranked: overrides.ranked ?? ranked()
  };

  if (overrides.tokenTarget !== undefined) {
    result.tokenTarget = overrides.tokenTarget;
  }

  if (overrides.mode !== undefined) {
    result.mode = overrides.mode;
  }

  if (overrides.linkedHistory !== undefined) {
    result.linkedHistory = overrides.linkedHistory;
  }

  if (overrides.rationaleGaps !== undefined) {
    result.rationaleGaps = overrides.rationaleGaps;
  }

  return result;
}

function ranked(
  overrides: Partial<RankedMemoryCandidates> = {}
): RankedMemoryCandidates {
  const items = overrides.items ?? [
    ...(overrides.mustKnow ?? []),
    ...(overrides.staleOrSuperseded ?? [])
  ];

  return {
    items,
    mustKnow: overrides.mustKnow ?? [],
    staleOrSuperseded: overrides.staleOrSuperseded ?? [],
    excluded: overrides.excluded ?? []
  };
}

function item(
  overrides: Partial<RankedMemoryItem> &
    Partial<RankMemoryCandidate> & {
      id: ObjectId;
      body?: string;
      title?: string;
      type?: ObjectType;
      status?: ObjectStatus;
    }
): RankedMemoryItem {
  const candidate: RankMemoryCandidate = {
    id: overrides.id,
    type: overrides.type ?? "note",
    status: overrides.status ?? "active",
    title: overrides.title ?? "Memory",
    body_path: overrides.body_path ?? `memory/notes/${overrides.id}.md`,
    body: overrides.body ?? "Memory body.",
    scope: overrides.scope ?? projectScope(),
    tags: overrides.tags ?? [],
    ...(overrides.facets === undefined ? {} : { facets: overrides.facets }),
    ...(overrides.evidence === undefined ? {} : { evidence: overrides.evidence }),
    updated_at: overrides.updated_at ?? "2026-04-27T12:00:00+02:00"
  };

  return {
    id: candidate.id,
    type: candidate.type,
    status: candidate.status,
    title: candidate.title,
    body_path: candidate.body_path,
    scope: candidate.scope,
    tags: candidate.tags ?? [],
    updated_at: candidate.updated_at,
    score: overrides.score ?? 100,
    scoreBreakdown: overrides.scoreBreakdown ?? EMPTY_SCORE_BREAKDOWN,
    matched: overrides.matched ?? true,
    conflicted: overrides.conflicted ?? false,
    candidate
  };
}

function excluded(
  candidate: RankedMemoryItem,
  reason: RankExclusionReason
): RankExcludedCandidate {
  return {
    id: candidate.id,
    reason,
    candidate: candidate.candidate
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

function sectionIndex(markdown: string, title: string): number {
  return markdown.indexOf(`## ${title}`);
}

function sectionText(markdown: string, title: string): string {
  const start = sectionIndex(markdown, title);

  if (start === -1) {
    return "";
  }

  const next = markdown.indexOf("\n## ", start + 1);

  return next === -1 ? markdown.slice(start) : markdown.slice(start, next);
}
