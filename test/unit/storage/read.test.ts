import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { readCanonicalStorage } from "../../../src/storage/read.js";
import { SCHEMA_FILES } from "../../../src/validation/schemas.js";

const repoRoot = process.cwd();
const tempRoots: string[] = [];
const hash = `sha256:${"0".repeat(64)}`;
const timestamp = "2026-04-25T14:00:00+02:00";

const validConfig = {
  version: 1,
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
  tags: ["billing", "stripe"],
  content_hash: hash,
  created_at: timestamp,
  updated_at: timestamp
};

const validRelation = {
  id: "rel.billing-retries-requires-idempotency",
  from: "decision.billing-retries",
  predicate: "requires",
  to: "constraint.webhook-idempotency",
  status: "active",
  confidence: "high",
  content_hash: hash,
  created_at: timestamp,
  updated_at: timestamp
};

const createdEvent = {
  event: "memory.created",
  id: "decision.billing-retries",
  actor: "agent",
  timestamp,
  payload: {
    title: "Billing retries moved to queue worker"
  }
};

const relationEvent = {
  event: "relation.created",
  relation_id: "rel.billing-retries-requires-idempotency",
  actor: "agent",
  timestamp,
  payload: {
    from: "decision.billing-retries",
    predicate: "requires",
    to: "constraint.webhook-idempotency"
  }
};

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("readCanonicalStorage", () => {
  it("loads config, objects with Markdown bodies, relations, and events", async () => {
    const projectRoot = await createReadableProject();

    const result = await readCanonicalStorage(projectRoot);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.data.config).toEqual(validConfig);
    expect(result.data.objects).toHaveLength(1);
    expect(result.data.objects[0]).toEqual({
      path: ".aictx/memory/decisions/billing-retries.json",
      bodyPath: ".aictx/memory/decisions/billing-retries.md",
      sidecar: validObject,
      body: "# Billing retries moved to queue worker\n\nRetries run in the queue worker."
    });
    expect(result.data.relations).toEqual([
      {
        path: ".aictx/relations/billing-retries-requires-idempotency.json",
        relation: validRelation
      }
    ]);
    expect(result.data.events.map((event) => event.line)).toEqual([1, 2]);
    expect(result.data.events.map((event) => event.event)).toEqual([
      "memory.created",
      "relation.created"
    ]);
  });

  it("reports invalid config JSON", async () => {
    const projectRoot = await createReadableProject();
    await writeProjectFile(projectRoot, ".aictx/config.json", "{bad json");

    const result = await readCanonicalStorage(projectRoot);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("AICtxInvalidJson");
      expect(JSON.stringify(result.error.details)).toContain(".aictx/config.json");
    }
  });

  it("reports invalid object JSON", async () => {
    const projectRoot = await createReadableProject();
    await writeProjectFile(projectRoot, ".aictx/memory/decisions/billing-retries.json", "{bad json");

    const result = await readCanonicalStorage(projectRoot);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("AICtxInvalidJson");
      expect(JSON.stringify(result.error.details)).toContain(
        ".aictx/memory/decisions/billing-retries.json"
      );
    }
  });

  it("reports invalid relation JSON", async () => {
    const projectRoot = await createReadableProject();
    await writeProjectFile(
      projectRoot,
      ".aictx/relations/billing-retries-requires-idempotency.json",
      "{bad json"
    );

    const result = await readCanonicalStorage(projectRoot);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("AICtxInvalidJson");
      expect(JSON.stringify(result.error.details)).toContain(
        ".aictx/relations/billing-retries-requires-idempotency.json"
      );
    }
  });

  it("reports invalid JSONL syntax with the event line path", async () => {
    const projectRoot = await createReadableProject();
    await writeProjectFile(projectRoot, ".aictx/events.jsonl", `${JSON.stringify(createdEvent)}\n{bad json\n`);

    const result = await readCanonicalStorage(projectRoot);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("AICtxInvalidJsonl");
      expect(JSON.stringify(result.error.details)).toContain(".aictx/events.jsonl:2");
    }
  });

  it("reports blank JSONL lines as errors", async () => {
    const projectRoot = await createReadableProject();
    await writeProjectFile(
      projectRoot,
      ".aictx/events.jsonl",
      `${JSON.stringify(createdEvent)}\n\n${JSON.stringify(relationEvent)}\n`
    );

    const result = await readCanonicalStorage(projectRoot);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("AICtxInvalidJsonl");
      expect(JSON.stringify(result.error.details)).toContain(".aictx/events.jsonl:2");
    }
  });

  it("reports non-object JSONL lines as errors", async () => {
    const projectRoot = await createReadableProject();
    await writeProjectFile(projectRoot, ".aictx/events.jsonl", `"not an event object"\n`);

    const result = await readCanonicalStorage(projectRoot);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("AICtxInvalidJsonl");
      expect(JSON.stringify(result.error.details)).toContain(".aictx/events.jsonl:1");
    }
  });

  it("accepts an empty events file", async () => {
    const projectRoot = await createReadableProject();
    await writeProjectFile(projectRoot, ".aictx/events.jsonl", "");

    const result = await readCanonicalStorage(projectRoot);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.events).toEqual([]);
    }
  });

  it("accepts a trailing newline after the last JSONL event", async () => {
    const projectRoot = await createReadableProject();
    await writeProjectFile(projectRoot, ".aictx/events.jsonl", `${JSON.stringify(createdEvent)}\n`);

    const result = await readCanonicalStorage(projectRoot);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.events.map((event) => event.line)).toEqual([1]);
    }
  });

  it("reports schema-invalid events with a line-qualified path", async () => {
    const projectRoot = await createReadableProject();
    await writeProjectFile(
      projectRoot,
      ".aictx/events.jsonl",
      `${JSON.stringify({ event: "memory.created", actor: "agent", timestamp })}\n`
    );

    const result = await readCanonicalStorage(projectRoot);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("AICtxSchemaValidationFailed");
      expect(JSON.stringify(result.error.details)).toContain(".aictx/events.jsonl:1");
    }
  });

  it("ignores generated directories", async () => {
    const projectRoot = await createReadableProject();
    await writeProjectFile(projectRoot, ".aictx/index/generated.json", "{bad json");
    await writeProjectFile(projectRoot, ".aictx/context/generated.json", "{bad json");

    const result = await readCanonicalStorage(projectRoot);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.objects).toHaveLength(1);
      expect(result.data.relations).toHaveLength(1);
    }
  });
});

async function createReadableProject(): Promise<string> {
  const projectRoot = await mkdtemp(join(tmpdir(), "aictx-read-"));
  tempRoots.push(projectRoot);
  await mkdir(join(projectRoot, ".aictx", "schema"), { recursive: true });

  for (const schemaFile of Object.values(SCHEMA_FILES)) {
    await copyFile(
      join(repoRoot, "src", "schemas", schemaFile),
      join(projectRoot, ".aictx", "schema", schemaFile)
    );
  }

  await writeJsonProjectFile(projectRoot, ".aictx/config.json", validConfig);
  await writeJsonProjectFile(projectRoot, ".aictx/memory/decisions/billing-retries.json", validObject);
  await writeProjectFile(
    projectRoot,
    ".aictx/memory/decisions/billing-retries.md",
    "# Billing retries moved to queue worker\r\n\r\nRetries run in the queue worker."
  );
  await writeJsonProjectFile(
    projectRoot,
    ".aictx/relations/billing-retries-requires-idempotency.json",
    validRelation
  );
  await writeProjectFile(
    projectRoot,
    ".aictx/events.jsonl",
    `${JSON.stringify(createdEvent)}\n${JSON.stringify(relationEvent)}\n`
  );

  return projectRoot;
}

async function writeJsonProjectFile(
  projectRoot: string,
  path: string,
  value: Record<string, unknown>
): Promise<void> {
  await writeProjectFile(projectRoot, path, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeProjectFile(projectRoot: string, path: string, contents: string): Promise<void> {
  const absolutePath = join(projectRoot, path);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, contents, "utf8");
}
