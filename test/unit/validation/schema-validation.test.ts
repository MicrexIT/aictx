import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  symlink,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  compileProjectSchemas,
  loadProjectSchemas,
  SCHEMA_FILES,
  type CompiledSchemaValidators
} from "../../../src/validation/schemas.js";
import {
  schemaValidationError,
  validateConfig,
  validateEvent,
  validateObject,
  validatePatch,
  validateRelation,
  type SchemaValidationResult
} from "../../../src/validation/validate.js";

const root = process.cwd();
const tempRoots: string[] = [];
const hash = `sha256:${"0".repeat(64)}`;

const validConfig = {
  version: 4,
  project: {
    id: "project.billing-api",
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
  facets: {
    category: "decision-rationale",
    applies_to: ["src/billing/webhook.ts"],
    load_modes: ["coding", "review"]
  },
  evidence: [
    {
      kind: "file",
      id: "src/billing/webhook.ts"
    },
    {
      kind: "task",
      id: "Fix Stripe webhook retries"
    }
  ],
  source: {
    kind: "agent",
    task: "Fix Stripe webhook retries",
    commit: "abc123"
  },
  origin: {
    kind: "file",
    locator: "docs/billing-retries.md",
    captured_at: "2026-04-25T14:00:00+02:00",
    digest: hash,
    media_type: "text/markdown"
  },
  superseded_by: null,
  content_hash: hash,
  created_at: "2026-04-25T14:00:00+02:00",
  updated_at: "2026-04-25T14:00:00+02:00"
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
  content_hash: hash,
  created_at: "2026-04-25T14:00:00+02:00",
  updated_at: "2026-04-25T14:00:00+02:00"
};

const validMemoryEvent = {
  event: "memory.created",
  id: "decision.billing-retries",
  actor: "agent",
  timestamp: "2026-04-25T14:00:00+02:00",
  payload: {
    title: "Billing retries moved to queue worker"
  }
};

const validRelationEvent = {
  event: "relation.created",
  relation_id: "rel.billing-retries-requires-idempotency",
  actor: "agent",
  timestamp: "2026-04-25T14:01:00+02:00",
  payload: {
    from: "decision.billing-retries",
    predicate: "requires",
    to: "constraint.webhook-idempotency"
  }
};

const minimalPatch = {
  source: {
    kind: "agent",
    task: "Document billing retry behavior"
  },
  changes: [
    {
      op: "create_object",
      type: "note",
      title: "Billing retries run in the worker",
      body: "Billing retry execution happens in the queue worker, not inside the HTTP webhook handler."
    }
  ]
};

const createObjectPatch = {
  source: {
    kind: "agent",
    task: "Fix Stripe webhook retries",
    commit: "abc123"
  },
  changes: [
    {
      op: "create_object",
      id: "decision.billing-retries",
      type: "decision",
      status: "active",
      title: "Billing retries moved to queue worker",
      body: "Stripe webhook retries now happen in the queue worker.",
      scope: {
        kind: "project",
        project: "project.billing-api",
        branch: null,
        task: null
      },
      tags: ["billing", "stripe"],
      facets: {
        category: "decision-rationale",
        applies_to: ["src/billing/webhook.ts"]
      },
      evidence: [
        {
          kind: "file",
          id: "src/billing/webhook.ts"
        }
      ]
    }
  ]
};

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("project schema loading", () => {
  it("loads and compiles project-local schemas", async () => {
    const projectRoot = await createProjectWithSchemas();

    const loaded = await loadProjectSchemas(projectRoot);
    const compiled = await compileProjectSchemas(projectRoot);

    expect(loaded.ok).toBe(true);
    expect(compiled.ok).toBe(true);
    if (compiled.ok) {
      expect(Object.keys(compiled.data.validators).sort()).toEqual(
        ["config", "event", "object", "patch", "relation"]
      );
    }
  });

  it("reports missing schema files through AICtxSchemaValidationFailed", async () => {
    const projectRoot = await createProjectWithSchemas();
    await rm(schemaPath(projectRoot, "patch.schema.json"));

    const loaded = await loadProjectSchemas(projectRoot);

    expect(loaded.ok).toBe(false);
    if (!loaded.ok) {
      expect(loaded.error.code).toBe("AICtxSchemaValidationFailed");
      expect(JSON.stringify(loaded.error.details)).toContain("SchemaFileMissing");
    }
  });

  it("reports malformed schema JSON through AICtxSchemaValidationFailed", async () => {
    const projectRoot = await createProjectWithSchemas();
    await writeFile(schemaPath(projectRoot, "object.schema.json"), "{bad json", "utf8");

    const loaded = await loadProjectSchemas(projectRoot);

    expect(loaded.ok).toBe(false);
    if (!loaded.ok) {
      expect(loaded.error.code).toBe("AICtxSchemaValidationFailed");
      expect(JSON.stringify(loaded.error.details)).toContain("SchemaInvalidJson");
    }
  });

  it("rejects symlinked project-local schema files", async () => {
    const projectRoot = await createProjectWithSchemas();
    const schemaFile = schemaPath(projectRoot, "config.schema.json");
    const outsideSchema = join(projectRoot, "outside.schema.json");
    await writeFile(outsideSchema, JSON.stringify(validConfig), "utf8");
    await rm(schemaFile);
    await symlink(outsideSchema, schemaFile);

    const loaded = await loadProjectSchemas(projectRoot);

    expect(loaded.ok).toBe(false);
    if (!loaded.ok) {
      expect(loaded.error.code).toBe("AICtxSchemaValidationFailed");
      expect(JSON.stringify(loaded.error.details)).toContain("SchemaFileUnreadable");
    }
  });

  it("reports schemas that Ajv cannot compile", async () => {
    const projectRoot = await createProjectWithSchemas();
    await writeFile(
      schemaPath(projectRoot, "config.schema.json"),
      JSON.stringify({
        $schema: "https://json-schema.org/draft/2020-12/schema",
        $id: "https://aictx.dev/schemas/v1/config.schema.json",
        type: "not-a-json-schema-type"
      }),
      "utf8"
    );

    const compiled = await compileProjectSchemas(projectRoot);

    expect(compiled.ok).toBe(false);
    if (!compiled.ok) {
      expect(compiled.error.code).toBe("AICtxSchemaValidationFailed");
      expect(JSON.stringify(compiled.error.details)).toContain("SchemaCompileFailed");
    }
  });
});

describe("schema validators", () => {
  it("accepts valid spec examples", async () => {
    const validators = await compileFixtureProject();

    expect(validateConfig(validators, validConfig).valid).toBe(true);
    expect(validateObject(validators, validObject, ".aictx/memory/decisions/billing-retries.json").valid).toBe(true);
    expect(validateRelation(validators, validRelation, ".aictx/relations/billing-retries-requires-idempotency.json").valid).toBe(true);
    expect(validateEvent(validators, validMemoryEvent, ".aictx/events.jsonl", 1).valid).toBe(true);
    expect(validateEvent(validators, validRelationEvent, ".aictx/events.jsonl", 2).valid).toBe(true);
    expect(validatePatch(validators, minimalPatch).valid).toBe(true);
    expect(validatePatch(validators, createObjectPatch).valid).toBe(true);
  });

  it("accepts legacy config while supporting storage v4 object facets, evidence, and origin", async () => {
    const validators = await compileFixtureProject();

    expect(validateConfig(validators, { ...validConfig, version: 1 }).valid).toBe(true);
    expect(
      validateObject(
        validators,
        {
          ...validObject,
          facets: {
            category: "abandoned-attempt",
            applies_to: ["src/old.ts"],
            load_modes: ["debugging"]
          },
          evidence: [{ kind: "task", id: "Tried worker-local cache" }]
        },
        ".aictx/memory/decisions/billing-retries.json"
      ).valid
    ).toBe(true);
  });

  it("accepts v4 relation predicates and rejects malformed origin", async () => {
    const validators = await compileFixtureProject();

    expect(
      validateRelation(
        validators,
        { ...validRelation, predicate: "supports" },
        ".aictx/relations/supports.json"
      ).valid
    ).toBe(true);
    expect(
      validateRelation(
        validators,
        { ...validRelation, predicate: "challenges" },
        ".aictx/relations/challenges.json"
      ).valid
    ).toBe(true);
    expect(
      issueCodes(
        validateObject(
          validators,
          {
            ...validObject,
            origin: {
              kind: "file",
              digest: "not-a-digest"
            }
          },
          ".aictx/memory/decisions/billing-retries.json"
        )
      )
    ).toContain("SchemaRequired");
  });

  it("rejects invalid object facets and evidence", async () => {
    const validators = await compileFixtureProject();

    expect(
      issueCodes(
        validateObject(
          validators,
          {
            ...validObject,
            facets: {
              category: "random-category"
            }
          },
          ".aictx/memory/decisions/billing-retries.json"
        )
      )
    ).toContain("SchemaEnum");
    expect(
      issueCodes(
        validatePatch(validators, {
          source: { kind: "agent" },
          changes: [
            {
              op: "create_object",
              type: "fact",
              title: "Fact",
              body: "Fact body.",
              evidence: [{ kind: "url", id: "https://example.com" }]
            }
          ]
        })
      )
    ).toContain("SchemaOneOf");
  });

  it("accepts gotcha and workflow objects and create patches", async () => {
    const validators = await compileFixtureProject();

    const gotchaObject = {
      ...validObject,
      id: "gotcha.webhook-duplicates",
      type: "gotcha",
      title: "Webhook duplicates",
      body_path: "memory/gotchas/webhook-duplicates.md"
    };
    const workflowObject = {
      ...validObject,
      id: "workflow.release-checklist",
      type: "workflow",
      title: "Release checklist",
      body_path: "memory/workflows/release-checklist.md"
    };
    const patch = {
      source: {
        kind: "agent"
      },
      changes: [
        {
          op: "create_object",
          type: "gotcha",
          title: "Webhook duplicates",
          body: "Never assume webhook delivery is unique."
        },
        {
          op: "create_object",
          id: "workflow.release-checklist",
          type: "workflow",
          status: "active",
          title: "Release checklist",
          body: "Run the release checklist before publishing."
        }
      ]
    };

    expect(validateObject(validators, gotchaObject, ".aictx/memory/gotchas/webhook-duplicates.json").valid).toBe(true);
    expect(validateObject(validators, workflowObject, ".aictx/memory/workflows/release-checklist.json").valid).toBe(true);
    expect(validatePatch(validators, patch).valid).toBe(true);
  });

  it("accepts product-feature as a facet for concept memory", async () => {
    const validators = await compileFixtureProject();
    const productFeatureObject = {
      ...validObject,
      id: "concept.customer-dashboard",
      type: "concept",
      title: "Feature: Customer dashboard",
      body_path: "memory/concepts/customer-dashboard.md",
      tags: ["feature", "product", "dashboard"],
      facets: {
        category: "product-feature",
        applies_to: ["app/dashboard/page.tsx"],
        load_modes: ["coding", "onboarding"]
      }
    };
    const patch = {
      source: {
        kind: "agent"
      },
      changes: [
        {
          op: "create_object",
          id: "concept.customer-dashboard",
          type: "concept",
          title: "Feature: Customer dashboard",
          body: "The app includes a customer dashboard feature.",
          tags: ["feature", "product", "dashboard"],
          facets: {
            category: "product-feature",
            applies_to: ["app/dashboard/page.tsx"],
            load_modes: ["coding", "onboarding"]
          },
          evidence: [{ kind: "file", id: "app/dashboard/page.tsx" }]
        }
      ]
    };

    expect(
      validateObject(
        validators,
        productFeatureObject,
        ".aictx/memory/concepts/customer-dashboard.json"
      ).valid
    ).toBe(true);
    expect(validatePatch(validators, patch).valid).toBe(true);
  });

  it("accepts memory organization facets and source evidence", async () => {
    const validators = await compileFixtureProject();

    for (const category of [
      "domain",
      "bounded-context",
      "capability",
      "business-rule",
      "unresolved-conflict"
    ]) {
      expect(
        validateObject(
          validators,
          {
            ...validObject,
            id: `question.${category}`,
            type: "question",
            status: "open",
            title: `Question for ${category}`,
            body_path: `memory/questions/${category}.md`,
            facets: {
              category
            }
          },
          `.aictx/memory/questions/${category}.json`
        ).valid
      ).toBe(true);
    }

    expect(
      validatePatch(validators, {
        source: { kind: "agent" },
        changes: [
          {
            op: "create_object",
            type: "synthesis",
            title: "Source-backed synthesis",
            body: "This synthesis is backed by source memory.",
            facets: { category: "domain" },
            evidence: [{ kind: "source", id: "source.readme" }]
          }
        ]
      }).valid
    ).toBe(true);
  });

  it("keeps history, task-note, and feature invalid object types", async () => {
    const validators = await compileFixtureProject();

    for (const invalidType of ["history", "task-note", "feature"]) {
      expect(
        issueCodes(
          validateObject(
            validators,
            {
              ...validObject,
              id: `${invalidType}.example`,
              type: invalidType,
              body_path: `memory/notes/${invalidType}.md`
            },
            `.aictx/memory/notes/${invalidType}.json`
          )
        )
      ).toContain("SchemaEnum");

      expect(
        issueCodes(
          validatePatch(validators, {
            source: { kind: "agent" },
            changes: [
              {
                op: "create_object",
                type: invalidType,
                title: "Invalid type",
                body: "Invalid type body."
              }
            ]
          })
        )
      ).toContain("SchemaOneOf");
    }
  });

  it("returns stable issue codes for invalid examples", async () => {
    const validators = await compileFixtureProject();

    expect(issueCodes(validateConfig(validators, withoutProperty(validConfig, "git")))).toContain("SchemaRequired");
    expect(
      issueCodes(
        validateObject(
          validators,
          { ...validObject, status: "closed" },
          ".aictx/memory/decisions/billing-retries.json"
        )
      )
    ).toContain("SchemaEnum");
    expect(
      issueCodes(
        validateObject(
          validators,
          { ...validObject, extra: true },
          ".aictx/memory/decisions/billing-retries.json"
        )
      )
    ).toContain("SchemaAdditionalProperty");
    expect(
      issueCodes(
        validateRelation(
          validators,
          { ...validRelation, predicate: "unknown" },
          ".aictx/relations/billing-retries-requires-idempotency.json"
        )
      )
    ).toContain("SchemaEnum");
    expect(
      issueCodes(validateEvent(validators, withoutProperty(validMemoryEvent, "id"), ".aictx/events.jsonl", 7))
    ).toContain("SchemaRequired");
    expect(issueCodes(validatePatch(validators, { source: { kind: "agent" }, changes: [] }))).toContain(
      "SchemaMinItems"
    );
    expect(
      issueCodes(
        validatePatch(validators, {
          source: { kind: "agent" },
          changes: [{ op: "unknown_operation" }]
        })
      )
    ).toContain("SchemaOneOf");
  });

  it("reports JSON pointer fields and event line paths", async () => {
    const validators = await compileFixtureProject();

    const result = validateEvent(
      validators,
      withoutProperty(validMemoryEvent, "id"),
      ".aictx/events.jsonl",
      12
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        code: "SchemaRequired",
        path: ".aictx/events.jsonl:12",
        field: "/id"
      })
    );
  });

  it("wraps validation issues in AICtxSchemaValidationFailed errors", async () => {
    const validators = await compileFixtureProject();
    const result = validateConfig(validators, withoutProperty(validConfig, "git"));

    const error = schemaValidationError(result.errors);

    expect(error.code).toBe("AICtxSchemaValidationFailed");
    expect(JSON.stringify(error.details)).toContain("SchemaRequired");
  });

  it("does not mutate schema files while loading, compiling, or validating", async () => {
    const projectRoot = await createProjectWithSchemas();
    const before = await readSchemaSnapshots(projectRoot);
    const beforeStat = await stat(schemaPath(projectRoot, "config.schema.json"));
    const compiled = await compileProjectSchemas(projectRoot);

    expect(compiled.ok).toBe(true);
    if (!compiled.ok) {
      return;
    }

    validateConfig(compiled.data, validConfig);
    validateObject(compiled.data, validObject, ".aictx/memory/decisions/billing-retries.json");
    validateRelation(compiled.data, validRelation, ".aictx/relations/billing-retries-requires-idempotency.json");
    validateEvent(compiled.data, validMemoryEvent);
    validatePatch(compiled.data, minimalPatch);

    const after = await readSchemaSnapshots(projectRoot);
    const afterStat = await stat(schemaPath(projectRoot, "config.schema.json"));

    expect(after).toEqual(before);
    expect(afterStat.mtimeMs).toBe(beforeStat.mtimeMs);
  });
});

async function createProjectWithSchemas(): Promise<string> {
  const projectRoot = await mkdirTempRoot();
  await mkdir(join(projectRoot, ".aictx", "schema"), { recursive: true });

  for (const file of Object.values(SCHEMA_FILES)) {
    await copyFile(join(root, "src", "schemas", file), schemaPath(projectRoot, file));
  }

  return projectRoot;
}

async function compileFixtureProject(): Promise<CompiledSchemaValidators> {
  const projectRoot = await createProjectWithSchemas();
  const compiled = await compileProjectSchemas(projectRoot);

  if (!compiled.ok) {
    throw new Error(JSON.stringify(compiled.error));
  }

  return compiled.data;
}

async function mkdirTempRoot(): Promise<string> {
  const projectRoot = await mkdtemp(join(tmpdir(), "aictx-validation-"));
  tempRoots.push(projectRoot);
  return projectRoot;
}

function schemaPath(projectRoot: string, file: string): string {
  return join(projectRoot, ".aictx", "schema", file);
}

async function readSchemaSnapshots(projectRoot: string): Promise<Record<string, string>> {
  const snapshots: Record<string, string> = {};

  for (const file of Object.values(SCHEMA_FILES)) {
    snapshots[file] = await readFile(schemaPath(projectRoot, file), "utf8");
  }

  return snapshots;
}

function withoutProperty<T extends Record<string, unknown>>(value: T, property: keyof T): Record<string, unknown> {
  const clone = { ...value };
  delete clone[property];
  return clone;
}

function issueCodes(result: SchemaValidationResult): string[] {
  return result.errors.map((issue) => issue.code);
}
