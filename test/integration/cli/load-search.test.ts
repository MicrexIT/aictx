import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { main, type CliOutputWriter } from "../../../src/cli/main.js";
import type { ObjectStatus, ObjectType } from "../../../src/core/types.js";
import { computeObjectContentHash } from "../../../src/storage/hashes.js";
import type { MemoryObjectSidecar } from "../../../src/storage/objects.js";
import { readCanonicalStorage } from "../../../src/storage/read.js";
import {
  FIXED_TIMESTAMP,
  FIXED_TIMESTAMP_NEXT_MINUTE
} from "../../fixtures/time.js";

const tempRoots: string[] = [];

interface CliRunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

interface LoadEnvelope {
  ok: true;
  data: {
    task: string;
    token_budget: number | null;
    context_pack: string;
    token_target: number | null;
    estimated_tokens: number;
    budget_status: "not_requested" | "within_target" | "over_target";
    truncated: boolean;
    source: {
      project: string;
      git_available: boolean;
      branch: string | null;
      commit: string | null;
    };
    included_ids: string[];
    excluded_ids: string[];
    omitted_ids: string[];
  };
}

interface SearchEnvelope {
  ok: true;
  data: {
    matches: Array<{
      id: string;
      type: string;
      status: string;
      title: string;
      snippet: string;
      body_path: string;
      score: number;
    }>;
  };
}

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

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true }))
  );
});

describe("aictx load and search CLI", () => {
  it("prints a Markdown context pack by default", async () => {
    const projectRoot = await createInitializedProject("aictx-cli-load-markdown-");
    await writeLoadSearchFixtures(projectRoot);
    await rebuildProject(projectRoot);

    const output = await runCli(
      ["node", "aictx", "load", "Stripe webhook idempotency"],
      projectRoot
    );

    expect(output.exitCode).toBe(0);
    expect(output.stderr).toBe("");
    expect(output.stdout.startsWith("# AI Context Pack\n")).toBe(true);
    expect(output.stdout).toContain("Stripe may deliver duplicate webhook events");
    expect(output.stdout).toContain("constraint.webhook-idempotency");
    expect(output.stdout).not.toContain("token_target");
    expect(output.stdout).not.toContain("budget_status");
    expect(() => JSON.parse(output.stdout) as unknown).toThrow();
  });

  it("prints a JSON envelope with public token metadata fields", async () => {
    const projectRoot = await createInitializedProject("aictx-cli-load-json-");
    await writeLoadSearchFixtures(projectRoot);
    await rebuildProject(projectRoot);

    const output = await runCli(
      ["node", "aictx", "load", "Stripe webhook idempotency", "--json"],
      projectRoot
    );

    expect(output.exitCode).toBe(0);
    expect(output.stderr).toBe("");
    const envelope = JSON.parse(output.stdout) as LoadEnvelope;

    expect(envelope.ok).toBe(true);
    expect(envelope.data).toMatchObject({
      task: "Stripe webhook idempotency",
      token_budget: null,
      token_target: null,
      budget_status: "not_requested",
      truncated: false
    });
    expect(envelope.data.context_pack).toContain("# AI Context Pack");
    expect(envelope.data.context_pack).toContain("constraint.webhook-idempotency");
    expect(envelope.data.estimated_tokens).toBeGreaterThan(0);
    expect(envelope.data.source.git_available).toBe(false);
    expect(envelope.data.included_ids).toContain("constraint.webhook-idempotency");
    expect(envelope.data.excluded_ids).toContain("note.rejected-webhook");
    expect(envelope.data.omitted_ids).toEqual([]);
    expect(envelope.data.omitted_ids).not.toContain("note.rejected-webhook");
  });

  it("reports explicit token target and omitted IDs when packaging truncates", async () => {
    const projectRoot = await createInitializedProject("aictx-cli-load-budget-");
    await writeManyBudgetFixtures(projectRoot, 18);
    await rebuildProject(projectRoot);

    const output = await runCli(
      [
        "node",
        "aictx",
        "load",
        "budget compiler context",
        "--token-budget",
        "501",
        "--json"
      ],
      projectRoot
    );

    expect(output.exitCode).toBe(0);
    expect(output.stderr).toBe("");
    const envelope = JSON.parse(output.stdout) as LoadEnvelope;

    expect(envelope.ok).toBe(true);
    expect(envelope.data.token_budget).toBe(501);
    expect(envelope.data.token_target).toBe(501);
    expect(["within_target", "over_target"]).toContain(envelope.data.budget_status);
    expect(envelope.data.truncated).toBe(true);
    expect(envelope.data.omitted_ids.length).toBeGreaterThan(0);
  });

  it("returns SQLite FTS search results in JSON mode", async () => {
    const projectRoot = await createInitializedProject("aictx-cli-search-json-");
    await writeLoadSearchFixtures(projectRoot);
    await rebuildProject(projectRoot);

    const output = await runCli(
      [
        "node",
        "aictx",
        "search",
        "Stripe webhook idempotency",
        "--limit",
        "10",
        "--json"
      ],
      projectRoot
    );

    expect(output.exitCode).toBe(0);
    expect(output.stderr).toBe("");
    const envelope = JSON.parse(output.stdout) as SearchEnvelope;
    const ids = envelope.data.matches.map((match) => match.id);
    const webhook = envelope.data.matches.find(
      (match) => match.id === "constraint.webhook-idempotency"
    );

    expect(envelope.ok).toBe(true);
    expect(ids).toContain("constraint.webhook-idempotency");
    expect(ids).toContain("decision.old-webhook-queue");
    expect(ids).not.toContain("note.rejected-webhook");
    expect(webhook).toMatchObject({
      id: "constraint.webhook-idempotency",
      type: "constraint",
      status: "active",
      title: "Webhook idempotency",
      body_path: ".aictx/memory/constraints/webhook-idempotency.md"
    });
    expect(webhook?.snippet).toContain("Stripe may deliver duplicate webhook events");
    expect(typeof webhook?.score).toBe("number");
  });

  it("prints compact human search results", async () => {
    const projectRoot = await createInitializedProject("aictx-cli-search-human-");
    await writeLoadSearchFixtures(projectRoot);
    await rebuildProject(projectRoot);

    const output = await runCli(
      ["node", "aictx", "search", "Stripe webhook idempotency"],
      projectRoot
    );

    expect(output.exitCode).toBe(0);
    expect(output.stderr).toBe("");
    expect(output.stdout).toContain("constraint.webhook-idempotency");
    expect(output.stdout).toContain("Title: Webhook idempotency");
    expect(output.stdout).toContain("Path: .aictx/memory/constraints/webhook-idempotency.md");
    expect(output.stdout).toContain("Snippet:");
    expect(() => JSON.parse(output.stdout) as unknown).toThrow();
  });
});

async function createInitializedProject(prefix: string): Promise<string> {
  const projectRoot = await createTempRoot(prefix);
  const output = await runCli(["node", "aictx", "init", "--json"], projectRoot);

  expect(output.exitCode).toBe(0);
  expect(output.stderr).toBe("");

  return projectRoot;
}

async function rebuildProject(projectRoot: string): Promise<void> {
  const output = await runCli(["node", "aictx", "rebuild", "--json"], projectRoot);

  expect(output.exitCode).toBe(0);
  expect(output.stderr).toBe("");
}

async function runCli(argv: string[], cwd: string): Promise<CliRunResult> {
  const output = createCapturedOutput();
  const exitCode = await main(argv, {
    ...output.writers,
    cwd
  });

  return {
    exitCode,
    stdout: output.stdout(),
    stderr: output.stderr()
  };
}

function createCapturedOutput(): {
  writers: { stdout: CliOutputWriter; stderr: CliOutputWriter };
  stdout: () => string;
  stderr: () => string;
} {
  let stdout = "";
  let stderr = "";

  return {
    writers: {
      stdout: (text) => {
        stdout += text;
      },
      stderr: (text) => {
        stderr += text;
      }
    },
    stdout: () => stdout,
    stderr: () => stderr
  };
}

async function createTempRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  const resolvedRoot = await realpath(root);
  tempRoots.push(resolvedRoot);
  return resolvedRoot;
}

async function writeLoadSearchFixtures(projectRoot: string): Promise<void> {
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
    id: "decision.old-webhook-queue",
    type: "decision",
    status: "stale",
    title: "Old webhook queue",
    bodyPath: "memory/decisions/old-webhook-queue.md",
    body: "# Old webhook queue\n\nStripe webhook work previously used an old queue design.\n",
    tags: ["stripe", "webhooks"],
    updatedAt: FIXED_TIMESTAMP
  });
  await writeMemoryObject(projectRoot, {
    id: "note.rejected-webhook",
    type: "note",
    status: "rejected",
    title: "Rejected webhook",
    bodyPath: "memory/notes/rejected-webhook.md",
    body: "# Rejected webhook\n\nStripe webhook details in this memory should be excluded.\n",
    tags: ["stripe", "webhooks", "idempotency"],
    updatedAt: FIXED_TIMESTAMP_NEXT_MINUTE
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
