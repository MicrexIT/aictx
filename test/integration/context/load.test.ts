import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { initProject, loadMemory, rebuildIndex } from "../../../src/app/operations.js";
import type { ObjectStatus, ObjectType } from "../../../src/core/types.js";
import { computeObjectContentHash } from "../../../src/storage/hashes.js";
import type { AictxConfig, MemoryObjectSidecar } from "../../../src/storage/objects.js";
import { readCanonicalStorage } from "../../../src/storage/read.js";
import {
  createFixedTestClock,
  FIXED_TIMESTAMP,
  FIXED_TIMESTAMP_NEXT_MINUTE
} from "../../fixtures/time.js";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true }))
  );
});

describe("loadMemory integration", () => {
  it("loads local SQLite-backed context with provenance and token metadata", async () => {
    const projectRoot = await createInitializedProject("aictx-load-local-");
    await writeLoadFixtures(projectRoot);
    const storage = await readStorageOrThrow(projectRoot);
    const rebuilt = await rebuildIndex({
      cwd: projectRoot,
      clock: createFixedTestClock(FIXED_TIMESTAMP_NEXT_MINUTE)
    });

    expect(rebuilt.ok).toBe(true);

    const result = await loadMemory({
      cwd: projectRoot,
      task: "Fix Stripe webhook idempotency",
      clock: createFixedTestClock(FIXED_TIMESTAMP_NEXT_MINUTE)
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.meta).toEqual({
      project_root: projectRoot,
      aictx_root: join(projectRoot, ".aictx"),
      git: {
        available: false,
        branch: null,
        commit: null,
        dirty: null
      }
    });
    expect(result.data).toMatchObject({
      task: "Fix Stripe webhook idempotency",
      token_budget: 6000,
      mode: "coding",
      source: {
        project: storage.config.project.id,
        git_available: false,
        branch: null,
        commit: null
      },
      token_target: {
        value: 6000,
        source: "config_default",
        enforced: false,
        was_capped: false
      },
      budget_status: "within_target",
      truncated: false,
      omitted_ids: []
    });
    expect(result.data.context_pack).toContain("# AI Context Pack");
    expect(result.data.context_pack).toContain("Git unavailable");
    expect(result.data.context_pack).not.toContain("Token budget:");
    expect(result.data.estimated_tokens).toBeGreaterThan(0);
    expect(result.data.included_ids).toContain("constraint.webhook-idempotency");
    expect(result.data.excluded_ids).toContain("note.rejected-webhook");
  });

  it("applies mode-aware ranking and rendering through loadMemory", async () => {
    const projectRoot = await createInitializedProject("aictx-load-mode-");
    await writeModeFixtures(projectRoot);
    const rebuilt = await rebuildIndex({
      cwd: projectRoot,
      clock: createFixedTestClock(FIXED_TIMESTAMP_NEXT_MINUTE)
    });

    expect(rebuilt.ok).toBe(true);

    const debugging = await loadMemory({
      cwd: projectRoot,
      task: "Mode service overview",
      mode: "debugging",
      clock: createFixedTestClock(FIXED_TIMESTAMP_NEXT_MINUTE)
    });
    const onboarding = await loadMemory({
      cwd: projectRoot,
      task: "Mode service overview",
      mode: "onboarding",
      clock: createFixedTestClock(FIXED_TIMESTAMP_NEXT_MINUTE)
    });

    expect(debugging.ok).toBe(true);
    expect(onboarding.ok).toBe(true);
    if (!debugging.ok || !onboarding.ok) {
      return;
    }

    expect(debugging.data.mode).toBe("debugging");
    expect(onboarding.data.mode).toBe("onboarding");
    expect(debugging.data.context_pack).toContain("## Relevant gotchas");
    expect(onboarding.data.context_pack).toContain("## Relevant workflows");
    expect(debugging.data.included_ids[0]).toBe("gotcha.mode-service");
    expect(onboarding.data.included_ids[0]).toBe("project.mode-service");
  });

  it("rejects invalid modes before index behavior matters", async () => {
    const projectRoot = await createInitializedProject("aictx-load-invalid-mode-");
    await rm(join(projectRoot, ".aictx", "index"), { recursive: true, force: true });

    const result = await loadMemory({
      cwd: projectRoot,
      task: "Architecture",
      mode: "triage",
      clock: createFixedTestClock(FIXED_TIMESTAMP_NEXT_MINUTE)
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("AICtxValidationFailed");
      expect(result.error.details).toMatchObject({
        field: "mode",
        actual: "triage"
      });
    }
  });

  it("does not truncate to config defaultTokenBudget when token_budget is omitted", async () => {
    const projectRoot = await createInitializedProject("aictx-load-relaxed-budget-");
    await updateConfig(projectRoot, (config) => {
      config.memory.defaultTokenBudget = 550;
    });
    await writeManyBudgetFixtures(projectRoot, 18);
    const rebuilt = await rebuildIndex({
      cwd: projectRoot,
      clock: createFixedTestClock(FIXED_TIMESTAMP_NEXT_MINUTE)
    });

    expect(rebuilt.ok).toBe(true);

    const result = await loadMemory({
      cwd: projectRoot,
      task: "budget compiler context",
      clock: createFixedTestClock(FIXED_TIMESTAMP_NEXT_MINUTE)
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.data.token_target).toEqual({
      value: 550,
      source: "config_default",
      enforced: false,
      was_capped: false
    });
    expect(result.data.estimated_tokens).toBeGreaterThan(550);
    expect(result.data.budget_status).toBe("over_target");
    expect(result.data.truncated).toBe(false);
    expect(result.data.omitted_ids).toEqual([]);
    expect(result.data.context_pack).toContain("decision.budget-context-18");
  });

  it("enforces explicit token_budget and reports omitted IDs when content is truncated", async () => {
    const projectRoot = await createInitializedProject("aictx-load-explicit-budget-");
    await writeManyBudgetFixtures(projectRoot, 18);
    const rebuilt = await rebuildIndex({
      cwd: projectRoot,
      clock: createFixedTestClock(FIXED_TIMESTAMP_NEXT_MINUTE)
    });

    expect(rebuilt.ok).toBe(true);

    const result = await loadMemory({
      cwd: projectRoot,
      task: "budget compiler context",
      token_budget: 501,
      clock: createFixedTestClock(FIXED_TIMESTAMP_NEXT_MINUTE)
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.data.token_target).toEqual({
      value: 501,
      source: "explicit",
      enforced: true,
      was_capped: false
    });
    expect(result.data.estimated_tokens).toBeGreaterThan(0);
    expect(["within_target", "over_target"]).toContain(result.data.budget_status);
    expect(result.data.truncated).toBe(true);
    expect(result.data.omitted_ids.length).toBeGreaterThan(0);
    expect(result.data.excluded_ids).toEqual([]);
  });

  it("rebuilds and retries once when the index is missing and auto-indexing is enabled", async () => {
    const projectRoot = await createInitializedProject("aictx-load-auto-rebuild-");
    await rm(join(projectRoot, ".aictx", "index"), { recursive: true, force: true });

    const result = await loadMemory({
      cwd: projectRoot,
      task: "Architecture",
      clock: createFixedTestClock(FIXED_TIMESTAMP_NEXT_MINUTE)
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.included_ids).toContain("architecture.current");
      expect(result.data.context_pack).toContain("Architecture");
    }
  });

  it("rebuilds before serving when canonical memory is newer than the index", async () => {
    const projectRoot = await createInitializedProject("aictx-load-stale-rebuild-");
    await writeLoadFixtures(projectRoot);

    const result = await loadMemory({
      cwd: projectRoot,
      task: "Stripe webhook idempotency",
      clock: createFixedTestClock(FIXED_TIMESTAMP_NEXT_MINUTE)
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.included_ids).toContain("constraint.webhook-idempotency");
      expect(result.data.context_pack).toContain("Stripe may deliver duplicate webhook events");
    }
  });

  it("returns index unavailable when the index is missing and auto-indexing is disabled", async () => {
    const projectRoot = await createInitializedProject("aictx-load-auto-index-off-");
    await updateConfig(projectRoot, (config) => {
      config.memory.autoIndex = false;
    });
    await rm(join(projectRoot, ".aictx", "index"), { recursive: true, force: true });

    const result = await loadMemory({
      cwd: projectRoot,
      task: "Architecture",
      clock: createFixedTestClock(FIXED_TIMESTAMP_NEXT_MINUTE)
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("AICtxIndexUnavailable");
    }
  });

  it("saves generated context packs without appending events when enabled", async () => {
    const projectRoot = await createInitializedProject("aictx-load-save-pack-");
    await updateConfig(projectRoot, (config) => {
      config.memory.saveContextPacks = true;
    });
    const rebuilt = await rebuildIndex({
      cwd: projectRoot,
      clock: createFixedTestClock(FIXED_TIMESTAMP_NEXT_MINUTE)
    });
    const eventsBefore = await readFile(join(projectRoot, ".aictx", "events.jsonl"), "utf8");

    expect(rebuilt.ok).toBe(true);

    const result = await loadMemory({
      cwd: projectRoot,
      task: "Architecture",
      clock: createFixedTestClock(FIXED_TIMESTAMP_NEXT_MINUTE)
    });

    expect(result.ok).toBe(true);
    const files = await readdir(join(projectRoot, ".aictx", "context"));
    const markdownFiles = files.filter((file) => file.endsWith(".md"));

    expect(markdownFiles.length).toBe(1);
    await expect(
      readFile(join(projectRoot, ".aictx", "context", markdownFiles[0] ?? ""), "utf8")
    ).resolves.toContain("# AI Context Pack");
    await expect(readFile(join(projectRoot, ".aictx", "events.jsonl"), "utf8")).resolves.toBe(
      eventsBefore
    );
  });
});

interface MemoryFixture {
  id: string;
  type: ObjectType;
  status: ObjectStatus;
  title: string;
  bodyPath: string;
  body: string;
  tags: string[];
  updatedAt?: string;
}

async function createInitializedProject(prefix: string): Promise<string> {
  const projectRoot = await createTempRoot(prefix);
  const initialized = await initProject({
    cwd: projectRoot,
    clock: createFixedTestClock()
  });

  expect(initialized.ok).toBe(true);
  if (!initialized.ok) {
    throw new Error(initialized.error.message);
  }

  return projectRoot;
}

async function createTempRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  const resolvedRoot = await realpath(root);
  tempRoots.push(resolvedRoot);
  return resolvedRoot;
}

async function writeLoadFixtures(projectRoot: string): Promise<void> {
  await writeMemoryObject(projectRoot, {
    id: "constraint.webhook-idempotency",
    type: "constraint",
    status: "active",
    title: "Webhook idempotency",
    bodyPath: "memory/constraints/webhook-idempotency.md",
    body:
      "# Webhook idempotency\n\nStripe may deliver duplicate webhook events, so delivery IDs must be deduplicated.\n",
    tags: ["stripe", "webhooks", "idempotency"],
    updatedAt: FIXED_TIMESTAMP_NEXT_MINUTE
  });
  await writeMemoryObject(projectRoot, {
    id: "note.rejected-webhook",
    type: "note",
    status: "rejected",
    title: "Rejected webhook",
    bodyPath: "memory/notes/rejected-webhook.md",
    body: "# Rejected webhook\n\nStripe webhook details in this memory should be excluded.\n",
    tags: ["stripe", "webhooks"],
    updatedAt: FIXED_TIMESTAMP_NEXT_MINUTE
  });
}

async function writeModeFixtures(projectRoot: string): Promise<void> {
  const shared = {
    status: "active" as const,
    title: "Mode service overview",
    tags: ["mode", "service", "overview"],
    updatedAt: FIXED_TIMESTAMP_NEXT_MINUTE
  };

  await writeMemoryObject(projectRoot, {
    ...shared,
    id: "project.mode-service",
    type: "project",
    bodyPath: "memory/project-mode-service.md",
    body: "# Mode service overview\n\nMode service overview project orientation.\n"
  });
  await writeMemoryObject(projectRoot, {
    ...shared,
    id: "architecture.mode-service",
    type: "architecture",
    bodyPath: "memory/architecture/mode-service.md",
    body: "# Mode service overview\n\nMode service overview architecture boundary.\n"
  });
  await writeMemoryObject(projectRoot, {
    ...shared,
    id: "constraint.mode-service",
    type: "constraint",
    bodyPath: "memory/constraints/mode-service.md",
    body: "# Mode service overview\n\nMode service overview constraint.\n"
  });
  await writeMemoryObject(projectRoot, {
    ...shared,
    id: "gotcha.mode-service",
    type: "gotcha",
    bodyPath: "memory/gotchas/mode-service.md",
    body: "# Mode service overview\n\nMode service overview gotcha for debugging.\n"
  });
  await writeMemoryObject(projectRoot, {
    ...shared,
    id: "workflow.mode-service",
    type: "workflow",
    bodyPath: "memory/workflows/mode-service.md",
    body: "# Mode service overview\n\nMode service overview workflow for onboarding.\n"
  });
}

async function writeManyBudgetFixtures(projectRoot: string, count: number): Promise<void> {
  for (let index = 1; index <= count; index += 1) {
    await writeMemoryObject(projectRoot, {
      id: `decision.budget-context-${index}`,
      type: "decision",
      status: index <= 8 ? "active" : "stale",
      title: `Budget compiler context ${index}`,
      bodyPath: `memory/decisions/budget-context-${index}.md`,
      body: `# Budget compiler context ${index}\n\n${"Budget compiler context behavior should stay visible when token_budget is omitted. ".repeat(18)}\n`,
      tags: ["budget", "compiler", "context"],
      updatedAt: FIXED_TIMESTAMP_NEXT_MINUTE
    });
  }
}

async function writeMemoryObject(projectRoot: string, fixture: MemoryFixture): Promise<void> {
  const storage = await readStorageOrThrow(projectRoot);
  const sidecarWithoutHash = {
    id: fixture.id,
    type: fixture.type,
    status: fixture.status,
    title: fixture.title,
    body_path: fixture.bodyPath,
    scope: {
      kind: "project",
      project: storage.config.project.id,
      branch: null,
      task: null
    },
    tags: fixture.tags,
    source: {
      kind: "agent"
    },
    created_at: fixture.updatedAt ?? FIXED_TIMESTAMP,
    updated_at: fixture.updatedAt ?? FIXED_TIMESTAMP
  } satisfies Omit<MemoryObjectSidecar, "content_hash">;
  const sidecar: MemoryObjectSidecar = {
    ...sidecarWithoutHash,
    content_hash: computeObjectContentHash(sidecarWithoutHash, fixture.body)
  };

  await writeProjectFile(projectRoot, `.aictx/${fixture.bodyPath}`, fixture.body);
  await writeJsonProjectFile(
    projectRoot,
    `.aictx/${fixture.bodyPath.replace(/\.md$/, ".json")}`,
    sidecar
  );
}

async function updateConfig(
  projectRoot: string,
  update: (config: AictxConfig) => void
): Promise<void> {
  const configPath = join(projectRoot, ".aictx", "config.json");
  const config = JSON.parse(await readFile(configPath, "utf8")) as AictxConfig;

  update(config);
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

async function readStorageOrThrow(projectRoot: string) {
  const storage = await readCanonicalStorage(projectRoot);

  expect(storage.ok).toBe(true);
  if (!storage.ok) {
    throw new Error(storage.error.message);
  }

  return storage.data;
}

async function writeProjectFile(
  projectRoot: string,
  relativePath: string,
  contents: string
): Promise<void> {
  const target = join(projectRoot, relativePath);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, contents, "utf8");
}

async function writeJsonProjectFile(
  projectRoot: string,
  relativePath: string,
  value: unknown
): Promise<void> {
  await writeProjectFile(projectRoot, relativePath, `${JSON.stringify(value, null, 2)}\n`);
}
