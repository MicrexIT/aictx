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
import type {
  Evidence,
  ObjectFacets,
  ObjectStatus,
  ObjectType,
  SourceOrigin
} from "../../../src/core/types.js";
import {
  computeObjectContentHash,
  computeRelationContentHash
} from "../../../src/storage/hashes.js";
import type { MemoryConfig, MemoryObjectSidecar } from "../../../src/storage/objects.js";
import { readCanonicalStorage } from "../../../src/storage/read.js";
import type { MemoryRelation } from "../../../src/storage/relations.js";
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
    const projectRoot = await createInitializedProject("memory-load-local-");
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
      memory_root: join(projectRoot, ".memory"),
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
    expect(result.data.included_ids).toContain("synthesis.webhook-context");
  });

  it("loads source-backed guidance synthesis for agent memory collection questions", async () => {
    const projectRoot = await createInitializedProject("memory-load-agent-guidance-");
    await writeMemoryObject(projectRoot, {
      id: "source.prd-memory-guidance",
      type: "source",
      status: "active",
      title: "Source: docs/prd.md",
      bodyPath: "memory/sources/prd-memory-guidance.md",
      body:
        "# Source: docs/prd.md\n\nThe PRD documents the hybrid memory model and source-backed syntheses for agent guidance.\n",
      tags: ["source", "prd", "guidance"],
      facets: {
        category: "source",
        applies_to: ["docs/prd.md"],
        load_modes: ["architecture", "onboarding"]
      },
      evidence: [{ kind: "file", id: "docs/prd.md" }],
      updatedAt: FIXED_TIMESTAMP_NEXT_MINUTE
    });
    await writeMemoryObject(projectRoot, {
      id: "source.agent-integration-guidance",
      type: "source",
      status: "active",
      title: "Source: docs/agent-integration.md",
      bodyPath: "memory/sources/agent-integration-guidance.md",
      body:
        "# Source: docs/agent-integration.md\n\nAgent integration guidance explains right-size memory, direct active saves, source records, syntheses, and save-nothing cases.\n",
      tags: ["source", "agents", "guidance"],
      facets: {
        category: "source",
        applies_to: ["docs/agent-integration.md"],
        load_modes: ["coding", "onboarding"]
      },
      evidence: [{ kind: "file", id: "docs/agent-integration.md" }],
      updatedAt: FIXED_TIMESTAMP_NEXT_MINUTE
    });
    await writeMemoryObject(projectRoot, {
      id: "synthesis.agent-memory-guidance",
      type: "synthesis",
      status: "active",
      title: "Agent memory guidance",
      bodyPath: "memory/syntheses/agent-memory-guidance.md",
      body:
        "# Agent memory guidance\n\nMEMORY should guide agents to right-size memory: atomic memories for precise reusable claims, source records for provenance, and syntheses for product intent, feature maps, roadmap, architecture, conventions, agent guidance, and repeated workflows. Agents save useful memory directly as active memory and save nothing when there is no durable future value.\n",
      tags: ["agents", "guidance", "memory", "synthesis"],
      facets: {
        category: "agent-guidance",
        applies_to: ["docs/prd.md", "docs/agent-integration.md"],
        load_modes: ["coding", "architecture", "onboarding"]
      },
      evidence: [
        { kind: "source", id: "source.prd-memory-guidance" },
        { kind: "source", id: "source.agent-integration-guidance" }
      ],
      updatedAt: FIXED_TIMESTAMP_NEXT_MINUTE
    });
    const rebuilt = await rebuildIndex({
      cwd: projectRoot,
      clock: createFixedTestClock(FIXED_TIMESTAMP_NEXT_MINUTE)
    });

    expect(rebuilt.ok).toBe(true);

    const result = await loadMemory({
      cwd: projectRoot,
      task: "how should MEMORY guide agents to collect memory",
      mode: "architecture",
      clock: createFixedTestClock(FIXED_TIMESTAMP_NEXT_MINUTE)
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.data.included_ids).toContain("synthesis.agent-memory-guidance");
    expect(result.data.included_ids).toContain("source.agent-integration-guidance");
    expect(result.data.context_pack).toContain("## Agent guidance");
    expect(result.data.context_pack).toContain("Agent memory guidance");
    expect(result.data.context_pack).toContain("## Relevant sources");
    expect(result.data.context_pack).toContain("Source: docs/agent-integration.md");
  });

  it("loads source memory matched only by origin locator", async () => {
    const projectRoot = await createInitializedProject("memory-load-origin-source-");

    await writeMemoryObject(projectRoot, {
      id: "source.external-origin-only",
      type: "source",
      status: "active",
      title: "External briefing source",
      bodyPath: "memory/sources/external-origin-only.md",
      body:
        "# External briefing source\n\nThis source record body intentionally omits the external locator phrase.\n",
      tags: ["source"],
      facets: {
        category: "source"
      },
      origin: {
        kind: "url",
        locator: "https://example.com/research/origin-only-article",
        media_type: "text/markdown"
      },
      updatedAt: FIXED_TIMESTAMP
    });
    for (let index = 0; index < 6; index += 1) {
      await writeMemoryObject(projectRoot, {
        id: `note.newer-filler-${index}`,
        type: "note",
        status: "active",
        title: `Newer filler ${index}`,
        bodyPath: `memory/notes/newer-filler-${index}.md`,
        body: `# Newer filler ${index}\n\nThis fixture should stay unrelated to the requested source.\n`,
        tags: ["filler"],
        updatedAt: `2026-05-01T12:0${index}:00+02:00`
      });
    }
    const rebuilt = await rebuildIndex({
      cwd: projectRoot,
      clock: createFixedTestClock(FIXED_TIMESTAMP_NEXT_MINUTE)
    });

    expect(rebuilt.ok).toBe(true);

    const result = await loadMemory({
      cwd: projectRoot,
      task: "origin-only-article",
      clock: createFixedTestClock(FIXED_TIMESTAMP_NEXT_MINUTE)
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.data.included_ids).toContain("source.external-origin-only");
    expect(result.data.context_pack).toContain("External briefing source");
  });

  it("surfaces active memory conflicts from conflicts_with relations", async () => {
    const projectRoot = await createInitializedProject("memory-load-conflicts-");
    await writeMemoryObject(projectRoot, {
      id: "decision.webhook-worker-retries",
      type: "decision",
      status: "active",
      title: "Webhook retries run in the worker",
      bodyPath: "memory/decisions/webhook-worker-retries.md",
      body: "# Webhook retries run in the worker\n\nWebhook retry execution happens in the worker.\n",
      tags: ["webhook", "retries"],
      facets: { category: "decision-rationale" },
      updatedAt: FIXED_TIMESTAMP_NEXT_MINUTE
    });
    await writeMemoryObject(projectRoot, {
      id: "decision.webhook-handler-retries",
      type: "decision",
      status: "active",
      title: "Webhook retries run in the handler",
      bodyPath: "memory/decisions/webhook-handler-retries.md",
      body: "# Webhook retries run in the handler\n\nWebhook retry execution happens in the handler.\n",
      tags: ["webhook", "retries"],
      facets: { category: "decision-rationale" },
      updatedAt: FIXED_TIMESTAMP_NEXT_MINUTE
    });
    await writeMemoryRelation(projectRoot, {
      id: "rel.webhook-worker-conflicts-handler",
      from: "decision.webhook-worker-retries",
      predicate: "conflicts_with",
      to: "decision.webhook-handler-retries",
      status: "active",
      confidence: "high",
      created_at: FIXED_TIMESTAMP_NEXT_MINUTE,
      updated_at: FIXED_TIMESTAMP_NEXT_MINUTE
    });
    const rebuilt = await rebuildIndex({
      cwd: projectRoot,
      clock: createFixedTestClock(FIXED_TIMESTAMP_NEXT_MINUTE)
    });

    expect(rebuilt.ok).toBe(true);

    const result = await loadMemory({
      cwd: projectRoot,
      task: "resolve webhook retry conflict",
      clock: createFixedTestClock(FIXED_TIMESTAMP_NEXT_MINUTE)
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.data.context_pack).toContain("## Memory conflicts to resolve");
    expect(result.data.context_pack).toContain("rel.webhook-worker-conflicts-handler");
    expect(result.data.included_ids).toEqual(
      expect.arrayContaining([
        "decision.webhook-worker-retries",
        "decision.webhook-handler-retries"
      ])
    );
    expect(result.data.excluded_ids).toEqual(
      expect.arrayContaining([
        "decision.webhook-worker-retries",
        "decision.webhook-handler-retries"
      ])
    );
    expect(sectionText(result.data.context_pack, "Must know")).not.toContain(
      "Webhook retries run in the worker"
    );
    expect(sectionText(result.data.context_pack, "Must know")).not.toContain(
      "Webhook retries run in the handler"
    );
  });

  it("does not surface conflicts from out-of-scope memory endpoints", async () => {
    const projectRoot = await createInitializedProject("memory-load-conflicts-scope-");
    const storage = await readStorageOrThrow(projectRoot);

    await writeMemoryObject(projectRoot, {
      id: "decision.webhook-project-retries",
      type: "decision",
      status: "active",
      title: "Webhook retries use project policy",
      bodyPath: "memory/decisions/webhook-project-retries.md",
      body:
        "# Webhook retries use project policy\n\nWebhook retry conflict resolution follows the project policy.\n",
      tags: ["webhook", "retries", "conflict"],
      facets: { category: "decision-rationale" },
      updatedAt: FIXED_TIMESTAMP_NEXT_MINUTE
    });
    await writeMemoryObject(projectRoot, {
      id: "decision.webhook-branch-retries",
      type: "decision",
      status: "active",
      title: "Webhook retries use task-only policy",
      bodyPath: "memory/decisions/webhook-branch-retries.md",
      body:
        "# Webhook retries use task-only policy\n\nWebhook retry conflict resolution follows a task-only policy.\n",
      tags: ["webhook", "retries", "conflict"],
      scope: {
        kind: "task",
        project: storage.config.project.id,
        branch: null,
        task: "migrate billing ledger"
      },
      facets: { category: "decision-rationale" },
      updatedAt: FIXED_TIMESTAMP_NEXT_MINUTE
    });
    await writeMemoryRelation(projectRoot, {
      id: "rel.webhook-project-conflicts-branch",
      from: "decision.webhook-project-retries",
      predicate: "conflicts_with",
      to: "decision.webhook-branch-retries",
      status: "active",
      confidence: "high",
      created_at: FIXED_TIMESTAMP_NEXT_MINUTE,
      updated_at: FIXED_TIMESTAMP_NEXT_MINUTE
    });
    const rebuilt = await rebuildIndex({
      cwd: projectRoot,
      clock: createFixedTestClock(FIXED_TIMESTAMP_NEXT_MINUTE)
    });

    expect(rebuilt.ok).toBe(true);

    const result = await loadMemory({
      cwd: projectRoot,
      task: "resolve webhook retry conflict",
      clock: createFixedTestClock(FIXED_TIMESTAMP_NEXT_MINUTE)
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.data.context_pack).not.toContain("## Memory conflicts to resolve");
    expect(sectionText(result.data.context_pack, "Relevant decisions")).toContain(
      "Webhook retries use project policy"
    );
    expect(result.data.included_ids).toContain("decision.webhook-project-retries");
    expect(result.data.excluded_ids).not.toContain("decision.webhook-project-retries");
  });

  it("applies mode-aware ranking and rendering through loadMemory", async () => {
    const projectRoot = await createInitializedProject("memory-load-mode-");
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
    expect(debugging.data.included_ids).toContain("gotcha.mode-service");
    expect(onboarding.data.included_ids).toContain("project.mode-service");
  });

  it("loads task context from file and changed-file retrieval hints", async () => {
    const projectRoot = await createInitializedProject("memory-load-hints-");
    await writeMemoryObject(projectRoot, {
      id: "decision.hinted-retrieval",
      type: "decision",
      status: "active",
      title: "Hinted retrieval",
      bodyPath: "memory/decisions/hinted-retrieval.md",
      body: "# Hinted retrieval\n\nContext ranking depends on explicit file hints.\n",
      tags: ["retrieval"],
      facets: {
        category: "decision-rationale",
        applies_to: ["src/context/rank.ts"],
        load_modes: ["review"]
      },
      evidence: [{ kind: "file", id: "src/index/search.ts" }],
      updatedAt: FIXED_TIMESTAMP_NEXT_MINUTE
    });
    const rebuilt = await rebuildIndex({
      cwd: projectRoot,
      clock: createFixedTestClock(FIXED_TIMESTAMP_NEXT_MINUTE)
    });

    expect(rebuilt.ok).toBe(true);

    const result = await loadMemory({
      cwd: projectRoot,
      task: "Opaque implementation task",
      mode: "review",
      hints: {
        files: ["src/context/rank.ts"],
        changed_files: ["src/index/search.ts"]
      },
      clock: createFixedTestClock(FIXED_TIMESTAMP_NEXT_MINUTE)
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.data.included_ids).toContain("decision.hinted-retrieval");
    expect(result.data.context_pack).toContain("## Relevant decisions");
    expect(result.data.context_pack).toContain("src/context/rank.ts");
    expect(result.data.context_pack).toContain("src/index/search.ts");
  });

  it("rejects invalid modes before index behavior matters", async () => {
    const projectRoot = await createInitializedProject("memory-load-invalid-mode-");
    await rm(join(projectRoot, ".memory", "index"), { recursive: true, force: true });

    const result = await loadMemory({
      cwd: projectRoot,
      task: "Architecture",
      mode: "triage",
      clock: createFixedTestClock(FIXED_TIMESTAMP_NEXT_MINUTE)
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("MemoryValidationFailed");
      expect(result.error.details).toMatchObject({
        field: "mode",
        actual: "triage"
      });
    }
  });

  it("does not truncate to config defaultTokenBudget when token_budget is omitted", async () => {
    const projectRoot = await createInitializedProject("memory-load-relaxed-budget-");
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
    const projectRoot = await createInitializedProject("memory-load-explicit-budget-");
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
    const projectRoot = await createInitializedProject("memory-load-auto-rebuild-");
    await rm(join(projectRoot, ".memory", "index"), { recursive: true, force: true });

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
    const projectRoot = await createInitializedProject("memory-load-stale-rebuild-");
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
    const projectRoot = await createInitializedProject("memory-load-auto-index-off-");
    await updateConfig(projectRoot, (config) => {
      config.memory.autoIndex = false;
    });
    await rm(join(projectRoot, ".memory", "index"), { recursive: true, force: true });

    const result = await loadMemory({
      cwd: projectRoot,
      task: "Architecture",
      clock: createFixedTestClock(FIXED_TIMESTAMP_NEXT_MINUTE)
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("MemoryIndexUnavailable");
    }
  });

  it("saves generated context packs without appending events when enabled", async () => {
    const projectRoot = await createInitializedProject("memory-load-save-pack-");
    await updateConfig(projectRoot, (config) => {
      config.memory.saveContextPacks = true;
    });
    const rebuilt = await rebuildIndex({
      cwd: projectRoot,
      clock: createFixedTestClock(FIXED_TIMESTAMP_NEXT_MINUTE)
    });
    const eventsBefore = await readFile(join(projectRoot, ".memory", "events.jsonl"), "utf8");

    expect(rebuilt.ok).toBe(true);

    const result = await loadMemory({
      cwd: projectRoot,
      task: "Architecture",
      clock: createFixedTestClock(FIXED_TIMESTAMP_NEXT_MINUTE)
    });

    expect(result.ok).toBe(true);
    const files = await readdir(join(projectRoot, ".memory", "context"));
    const markdownFiles = files.filter((file) => file.endsWith(".md"));

    expect(markdownFiles.length).toBe(1);
    await expect(
      readFile(join(projectRoot, ".memory", "context", markdownFiles[0] ?? ""), "utf8")
    ).resolves.toContain("# AI Context Pack");
    await expect(readFile(join(projectRoot, ".memory", "events.jsonl"), "utf8")).resolves.toBe(
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
  scope?: MemoryObjectSidecar["scope"];
  facets?: ObjectFacets;
  evidence?: Evidence[];
  origin?: SourceOrigin;
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
    id: "synthesis.webhook-context",
    type: "synthesis",
    status: "active",
    title: "Webhook context",
    bodyPath: "memory/syntheses/webhook-context.md",
    body: "# Webhook context\n\nStripe webhook implementation context is maintained as synthesis memory.\n",
    tags: ["stripe", "webhooks"],
    facets: {
      category: "feature-map",
      load_modes: ["coding", "onboarding"]
    },
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
    scope: fixture.scope ?? {
      kind: "project",
      project: storage.config.project.id,
      branch: null,
      task: null
    },
    tags: fixture.tags,
    ...(fixture.facets === undefined ? {} : { facets: fixture.facets }),
    ...(fixture.evidence === undefined ? {} : { evidence: fixture.evidence }),
    ...(fixture.origin === undefined ? {} : { origin: fixture.origin }),
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

  await writeProjectFile(projectRoot, `.memory/${fixture.bodyPath}`, fixture.body);
  await writeJsonProjectFile(
    projectRoot,
    `.memory/${fixture.bodyPath.replace(/\.md$/, ".json")}`,
    sidecar
  );
}

async function writeMemoryRelation(
  projectRoot: string,
  relation: Omit<MemoryRelation, "content_hash">
): Promise<void> {
  const withHash: MemoryRelation = {
    ...relation,
    content_hash: computeRelationContentHash(relation)
  };

  await writeJsonProjectFile(
    projectRoot,
    `.memory/relations/${relation.id.replace(/^rel\./u, "")}.json`,
    withHash
  );
}

async function updateConfig(
  projectRoot: string,
  update: (config: MemoryConfig) => void
): Promise<void> {
  const configPath = join(projectRoot, ".memory", "config.json");
  const config = JSON.parse(await readFile(configPath, "utf8")) as MemoryConfig;

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

function sectionText(markdown: string, title: string): string {
  const start = markdown.indexOf(`## ${title}`);

  if (start === -1) {
    return "";
  }

  const next = markdown.indexOf("\n## ", start + 1);

  return next === -1 ? markdown.slice(start) : markdown.slice(start, next);
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
