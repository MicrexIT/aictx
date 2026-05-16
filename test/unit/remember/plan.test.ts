import { describe, expect, it } from "vitest";

import type { AictxConfig, MemoryObjectSidecar } from "../../../src/storage/objects.js";
import type { CanonicalStorageSnapshot } from "../../../src/storage/read.js";
import type { StoredMemoryRelation } from "../../../src/storage/relations.js";
import type { ObjectType } from "../../../src/core/types.js";
import { buildRememberMemoryPatch } from "../../../src/remember/plan.js";
import { FIXED_TIMESTAMP } from "../../fixtures/time.js";

const projectId = "project.billing-api";
const config: AictxConfig = {
  version: 4,
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

describe("buildRememberMemoryPatch", () => {
  it("converts intent-first creates, updates, stale markers, supersedes, and relations into a structured patch", () => {
    const result = buildRememberMemoryPatch({
      storage: storageSnapshot([
        memoryObject({
          id: "decision.billing-retries",
          type: "decision",
          facets: {
            category: "decision-rationale",
            applies_to: ["services/billing/src/webhooks/handler.ts"],
            load_modes: ["review"]
          }
        }),
        memoryObject({
          id: "fact.old-retry-location",
          type: "fact"
        })
      ]),
      input: {
        task: "Fix Stripe webhook retries",
        memories: [
          {
            kind: "gotcha",
            title: "Webhook delivery can duplicate retries",
            body: "Stripe may redeliver webhook events after timeout, so retry scheduling must stay idempotent.",
            tags: ["billing", "stripe"],
            applies_to: ["services/billing/src/webhooks/handler.ts"],
            evidence: [
              { kind: "file", id: "services/billing/src/webhooks/handler.ts" }
            ],
            origin: {
              kind: "file",
              locator: "docs/webhook-retries.md",
              media_type: "text/markdown"
            },
            related: [
              {
                predicate: "requires",
                to: "decision.billing-retries",
                confidence: "high"
              }
            ]
          }
        ],
        updates: [
          {
            id: "decision.billing-retries",
            body: "Billing retries now execute in the queue worker.",
            applies_to: ["services/billing/src/workers/retry.ts"],
            origin: {
              kind: "url",
              locator: "https://example.com/retries"
            }
          }
        ],
        stale: [
          {
            id: "fact.old-retry-location",
            reason: "Retries no longer execute inside the HTTP handler."
          }
        ],
        supersede: [
          {
            id: "fact.old-retry-location",
            superseded_by: "decision.billing-retries",
            reason: "The retry location is now captured by the billing retry decision."
          }
        ],
        relations: [
          {
            from: "decision.billing-retries",
            predicate: "affects",
            to: "fact.old-retry-location"
          }
        ]
      }
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.data).toEqual({
      source: {
        kind: "agent",
        task: "Fix Stripe webhook retries"
      },
      changes: [
        {
          op: "create_object",
          id: "gotcha.webhook-delivery-can-duplicate-retries",
          type: "gotcha",
          title: "Webhook delivery can duplicate retries",
          body:
            "Stripe may redeliver webhook events after timeout, so retry scheduling must stay idempotent.",
          tags: ["billing", "stripe"],
          facets: {
            category: "gotcha",
            applies_to: ["services/billing/src/webhooks/handler.ts"]
          },
          evidence: [
            { kind: "file", id: "services/billing/src/webhooks/handler.ts" }
          ],
          origin: {
            kind: "file",
            locator: "docs/webhook-retries.md",
            media_type: "text/markdown"
          }
        },
        {
          op: "create_relation",
          from: "gotcha.webhook-delivery-can-duplicate-retries",
          predicate: "requires",
          to: "decision.billing-retries",
          confidence: "high"
        },
        {
          op: "update_object",
          id: "decision.billing-retries",
          body: "Billing retries now execute in the queue worker.",
          facets: {
            category: "decision-rationale",
            applies_to: ["services/billing/src/workers/retry.ts"],
            load_modes: ["review"]
          },
          origin: {
            kind: "url",
            locator: "https://example.com/retries"
          }
        },
        {
          op: "mark_stale",
          id: "fact.old-retry-location",
          reason: "Retries no longer execute inside the HTTP handler."
        },
        {
          op: "supersede_object",
          id: "fact.old-retry-location",
          superseded_by: "decision.billing-retries",
          reason: "The retry location is now captured by the billing retry decision."
        },
        {
          op: "create_relation",
          from: "decision.billing-retries",
          predicate: "affects",
          to: "fact.old-retry-location"
        }
      ]
    });
  });

  it("rejects empty semantic input before producing a patch", () => {
    const result = buildRememberMemoryPatch({
      storage: storageSnapshot([]),
      input: {
        task: "No durable memory"
      }
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("AICtxValidationFailed");
      expect(result.error.message).toContain("at least one memory action");
    }
  });

  it("defaults workflow memories to the workflow facet category", () => {
    const result = buildRememberMemoryPatch({
      storage: storageSnapshot([]),
      input: {
        task: "Document release smoke test",
        memories: [
          {
            kind: "workflow",
            title: "Release smoke test",
            body: "Before tagging a release, run package verification and inspect the Aictx memory diff.",
            applies_to: ["package.json"]
          }
        ]
      }
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.data.changes).toEqual([
      {
        op: "create_object",
        id: "workflow.release-smoke-test",
        type: "workflow",
        title: "Release smoke test",
        body:
          "Before tagging a release, run package verification and inspect the Aictx memory diff.",
        facets: {
          category: "workflow",
          applies_to: ["package.json"]
        }
      }
    ]);
  });

  it("rejects unsupported memory kinds", () => {
    const result = buildRememberMemoryPatch({
      storage: storageSnapshot([]),
      input: {
        task: "Bad remember input",
        memories: [
          {
            kind: "feature",
            title: "Unsupported feature memory",
            body: "Feature is not a memory kind."
          }
        ]
      }
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("AICtxValidationFailed");
      expect(JSON.stringify(result.error.details)).toContain("memories.0.kind");
    }
  });
});

function storageSnapshot(objects: MemoryObjectFixture[]): CanonicalStorageSnapshot {
  return {
    projectRoot: "/tmp/project",
    aictxRoot: "/tmp/project/.aictx",
    config,
    objects,
    relations: [] satisfies StoredMemoryRelation[],
    events: []
  };
}

interface MemoryObjectFixture {
  path: string;
  bodyPath: string;
  body: string;
  sidecar: MemoryObjectSidecar;
}

function memoryObject(options: {
  id: string;
  type: ObjectType;
  facets?: MemoryObjectSidecar["facets"];
}): MemoryObjectFixture {
  return {
    path: `.aictx/memory/${options.type}s/${options.id}.json`,
    bodyPath: `.aictx/memory/${options.type}s/${options.id}.md`,
    body: `${options.id} body`,
    sidecar: {
      id: options.id,
      type: options.type,
      status: "active",
      title: options.id,
      body_path: `memory/${options.type}s/${options.id}.md`,
      scope: {
        kind: "project",
        project: projectId,
        branch: null,
        task: null
      },
      tags: [],
      ...(options.facets === undefined ? {} : { facets: options.facets }),
      content_hash: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
      created_at: FIXED_TIMESTAMP,
      updated_at: FIXED_TIMESTAMP
    }
  };
}
