import { describe, expect, it } from "vitest";

import {
  canonicalJson,
  computeObjectContentHash,
  computeRelationContentHash,
  normalizeMarkdownForHash
} from "../../../src/storage/hashes.js";

const validObject = {
  id: "decision.billing-retries",
  type: "decision",
  status: "active",
  title: "Billing retries moved to queue worker",
  body_path: "memory/decisions/billing-retries.md",
  scope: {
    kind: "project",
    project: "project.billing-api",
    branch: null,
    task: null
  },
  tags: ["billing", "stripe", "webhooks"],
  source: {
    kind: "agent",
    task: "Fix Stripe webhook retries",
    commit: "abc123"
  },
  superseded_by: null,
  content_hash: `sha256:${"0".repeat(64)}`,
  created_at: "2026-04-25T14:00:00+02:00",
  updated_at: "2026-04-25T14:00:00+02:00"
};

const reorderedObject = {
  updated_at: "2026-04-25T14:00:00+02:00",
  created_at: "2026-04-25T14:00:00+02:00",
  content_hash: `sha256:${"f".repeat(64)}`,
  superseded_by: null,
  source: {
    commit: "abc123",
    task: "Fix Stripe webhook retries",
    kind: "agent"
  },
  tags: ["billing", "stripe", "webhooks"],
  scope: {
    task: null,
    branch: null,
    project: "project.billing-api",
    kind: "project"
  },
  body_path: "memory/decisions/billing-retries.md",
  title: "Billing retries moved to queue worker",
  status: "active",
  type: "decision",
  id: "decision.billing-retries"
};

const validRelation = {
  id: "rel.billing-retries-requires-idempotency",
  from: "decision.billing-retries",
  predicate: "requires",
  to: "constraint.webhook-idempotency",
  status: "active",
  confidence: "high",
  evidence: [
    {
      kind: "memory",
      id: "decision.billing-retries"
    }
  ],
  content_hash: `sha256:${"1".repeat(64)}`,
  created_at: "2026-04-25T14:00:00+02:00",
  updated_at: "2026-04-25T14:00:00+02:00"
};

const reorderedRelation = {
  updated_at: "2026-04-25T14:00:00+02:00",
  created_at: "2026-04-25T14:00:00+02:00",
  content_hash: `sha256:${"e".repeat(64)}`,
  evidence: [
    {
      id: "decision.billing-retries",
      kind: "memory"
    }
  ],
  confidence: "high",
  status: "active",
  to: "constraint.webhook-idempotency",
  predicate: "requires",
  from: "decision.billing-retries",
  id: "rel.billing-retries-requires-idempotency"
};

describe("canonicalJson", () => {
  it("serializes objects with keys sorted by Unicode code point", () => {
    const privateUseKey = "\uE000";
    const astralKey = "\u{1F600}";

    expect(
      canonicalJson({
        b: 2,
        a: 1,
        [astralKey]: true,
        [privateUseKey]: false
      })
    ).toBe(`{"a":1,"b":2,"${privateUseKey}":false,"${astralKey}":true}`);
  });

  it("sorts nested object keys while preserving array order", () => {
    expect(
      canonicalJson({
        z: [{ b: 2, a: 1 }, ["keep", "this", "order"]],
        a: {
          d: null,
          c: true
        }
      })
    ).toBe('{"a":{"c":true,"d":null},"z":[{"a":1,"b":2},["keep","this","order"]]}');
  });

  it("omits undefined object properties and includes explicit nulls", () => {
    expect(
      canonicalJson({
        keep: null,
        omit: undefined,
        value: "present"
      })
    ).toBe('{"keep":null,"value":"present"}');
  });

  it("rejects unsupported JSON values", () => {
    expect(() => canonicalJson([undefined])).toThrow("undefined array item");
    expect(() => canonicalJson({ value: Number.NaN })).toThrow("non-finite number");
    expect(() => canonicalJson({ value: 1n })).toThrow("bigint");
    expect(() => canonicalJson({ value: () => "nope" })).toThrow("function");
  });
});

describe("normalizeMarkdownForHash", () => {
  it("removes a leading UTF-8 BOM and normalizes CRLF and CR to LF", () => {
    expect(normalizeMarkdownForHash("\uFEFF# Title\r\nBody\rTrailing")).toBe(
      "# Title\nBody\nTrailing"
    );
  });

  it("preserves non-line-ending whitespace", () => {
    expect(normalizeMarkdownForHash("  # Title  \n\nBody\t\n")).toBe("  # Title  \n\nBody\t\n");
  });
});

describe("computeObjectContentHash", () => {
  it("is reproducible across sidecar key order changes", () => {
    const markdown = "# Billing retries\n\nRetries are handled by the worker.\n";

    expect(computeObjectContentHash(validObject, markdown)).toBe(
      computeObjectContentHash(reorderedObject, markdown)
    );
  });

  it("normalizes Markdown line endings before hashing", () => {
    expect(computeObjectContentHash(validObject, "# Title\r\n\r\nBody\r\n")).toBe(
      computeObjectContentHash(validObject, "# Title\n\nBody\n")
    );
  });

  it("does not include an existing content_hash value in recomputation", () => {
    const first = computeObjectContentHash(validObject, "# Title\n\nBody\n");
    const second = computeObjectContentHash(
      {
        ...validObject,
        content_hash: `sha256:${"a".repeat(64)}`
      },
      "# Title\n\nBody\n"
    );

    expect(first).toBe(second);
    expect(first).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("preserves Markdown whitespace other than line ending normalization", () => {
    expect(computeObjectContentHash(validObject, "# Title\n\nBody\n")).not.toBe(
      computeObjectContentHash(validObject, " # Title\n\nBody\n")
    );
  });
});

describe("computeRelationContentHash", () => {
  it("is reproducible across relation key order changes", () => {
    expect(computeRelationContentHash(validRelation)).toBe(
      computeRelationContentHash(reorderedRelation)
    );
  });

  it("does not include an existing optional content_hash value in recomputation", () => {
    const first = computeRelationContentHash(validRelation);
    const second = computeRelationContentHash({
      ...validRelation,
      content_hash: `sha256:${"b".repeat(64)}`
    });

    expect(first).toBe(second);
    expect(first).toMatch(/^sha256:[a-f0-9]{64}$/);
  });
});
