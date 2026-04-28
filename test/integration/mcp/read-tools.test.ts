import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath, pathToFileURL } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterEach, describe, expect, it } from "vitest";

import { main, type CliOutputWriter } from "../../../src/cli/main.js";
import { runSubprocess } from "../../../src/core/subprocess.js";
import type { ObjectStatus, ObjectType } from "../../../src/core/types.js";
import { computeObjectContentHash } from "../../../src/storage/hashes.js";
import type { MemoryObjectSidecar } from "../../../src/storage/objects.js";
import { readCanonicalStorage } from "../../../src/storage/read.js";
import {
  FIXED_TIMESTAMP,
  FIXED_TIMESTAMP_NEXT_MINUTE
} from "../../fixtures/time.js";

const require = createRequire(import.meta.url);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const serverEntry = join(repoRoot, "src/mcp/server.ts");
const tsxLoader = pathToFileURL(require.resolve("tsx")).href;
const tempRoots: string[] = [];

interface StartedMcpClient {
  client: Client;
  close: () => Promise<void>;
  stderr: () => string;
}

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

interface DiffEnvelope {
  ok: true;
  data: {
    diff: string;
    changed_files: string[];
    changed_memory_ids: string[];
    changed_relation_ids: string[];
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

interface TextContent {
  type: "text";
  text: string;
}

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true }))
  );
});

describe("aictx MCP read tools", () => {
  it("exposes only the normalized v1 MCP tool set", async () => {
    const projectRoot = await createTempRoot("aictx-mcp-read-tools-");
    const started = await startMcpClient(projectRoot);

    try {
      const result = await started.client.listTools();
      const toolNames = result.tools.map((tool) => tool.name).sort();

      expect(toolNames).toEqual([
        "diff_memory",
        "load_memory",
        "save_memory_patch",
        "search_memory"
      ]);
      expect(toolNames).not.toEqual(
        expect.arrayContaining([
          "init",
          "check",
          "rebuild",
          "history",
          "restore",
          "rewind",
          "inspect",
          "stale",
          "graph",
          "export",
          "shell",
          "run_shell",
          "execute_command",
          "read_file",
          "write_file",
          "filesystem"
        ])
      );
    } finally {
      await started.close();
    }

    expect(started.stderr()).toBe("");
  });

  it("returns load_memory data matching CLI load JSON without an explicit token budget", async () => {
    const projectRoot = await createInitializedProject("aictx-mcp-load-default-");
    await writeLoadSearchFixtures(projectRoot);
    await rebuildProject(projectRoot);
    const started = await startMcpClient(projectRoot);

    try {
      const cli = await runCli(
        ["node", "aictx", "load", "Stripe webhook idempotency", "--json"],
        projectRoot
      );
      const mcp = await started.client.callTool({
        name: "load_memory",
        arguments: {
          task: "Stripe webhook idempotency"
        }
      });
      const cliEnvelope = parseCliEnvelope<LoadEnvelope>(cli);
      const mcpEnvelope = parseToolEnvelope<LoadEnvelope>(mcp);

      expect(mcpEnvelope).toEqual(cliEnvelope);
      expect(mcpEnvelope.data).toMatchObject({
        token_budget: null,
        token_target: null,
        budget_status: "not_requested",
        truncated: false
      });
      expect(mcpEnvelope.data.included_ids).toContain("constraint.webhook-idempotency");
      expect(mcpEnvelope.data.excluded_ids).toContain("note.rejected-webhook");
      expect(mcpEnvelope.data.omitted_ids).toEqual([]);
    } finally {
      await started.close();
    }

    expect(started.stderr()).toBe("");
  });

  it("preserves load_memory token metadata and omitted IDs when packaging truncates", async () => {
    const projectRoot = await createInitializedProject("aictx-mcp-load-budget-");
    await writeManyBudgetFixtures(projectRoot, 18);
    await rebuildProject(projectRoot);
    const started = await startMcpClient(projectRoot);

    try {
      const cli = await runCli(
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
      const mcp = await started.client.callTool({
        name: "load_memory",
        arguments: {
          task: "budget compiler context",
          token_budget: 501
        }
      });
      const cliEnvelope = parseCliEnvelope<LoadEnvelope>(cli);
      const mcpEnvelope = parseToolEnvelope<LoadEnvelope>(mcp);

      expect(mcpEnvelope).toEqual(cliEnvelope);
      expect(mcpEnvelope.data.token_budget).toBe(501);
      expect(mcpEnvelope.data.token_target).toBe(501);
      expect(["within_target", "over_target"]).toContain(
        mcpEnvelope.data.budget_status
      );
      expect(mcpEnvelope.data.truncated).toBe(true);
      expect(mcpEnvelope.data.omitted_ids.length).toBeGreaterThan(0);
    } finally {
      await started.close();
    }

    expect(started.stderr()).toBe("");
  });

  it("returns search_memory data matching CLI search JSON", async () => {
    const projectRoot = await createInitializedProject("aictx-mcp-search-");
    await writeLoadSearchFixtures(projectRoot);
    await rebuildProject(projectRoot);
    const started = await startMcpClient(projectRoot);

    try {
      const cli = await runCli(
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
      const mcp = await started.client.callTool({
        name: "search_memory",
        arguments: {
          query: "Stripe webhook idempotency",
          limit: 10
        }
      });
      const cliEnvelope = parseCliEnvelope<SearchEnvelope>(cli);
      const mcpEnvelope = parseToolEnvelope<SearchEnvelope>(mcp);

      expect(mcpEnvelope).toEqual(cliEnvelope);
      expect(mcpEnvelope.data.matches.map((match) => match.id)).toContain(
        "constraint.webhook-idempotency"
      );
      expect(mcpEnvelope.data.matches.map((match) => match.id)).not.toContain(
        "note.rejected-webhook"
      );
    } finally {
      await started.close();
    }

    expect(started.stderr()).toBe("");
  });

  it("returns diff_memory data matching CLI diff JSON", async () => {
    const repo = await createInitializedGitProject("aictx-mcp-diff-");
    const projectId = await readJsonId(join(repo, ".aictx", "memory", "project.json"));
    await writeFile(
      join(repo, ".aictx", "memory", "project.md"),
      "# Updated Project\n\nChanged Aictx memory.\n",
      "utf8"
    );
    await writeFile(join(repo, "src.ts"), "changed outside aictx\n", "utf8");
    const started = await startMcpClient(repo);

    try {
      const cli = await runCli(["node", "aictx", "diff", "--json"], repo);
      const mcp = await started.client.callTool({
        name: "diff_memory",
        arguments: {}
      });
      const cliEnvelope = parseCliEnvelope<DiffEnvelope>(cli);
      const mcpEnvelope = parseToolEnvelope<DiffEnvelope>(mcp);

      expect(mcpEnvelope).toEqual(cliEnvelope);
      expect(mcpEnvelope.data.diff).toContain(".aictx/memory/project.md");
      expect(mcpEnvelope.data.diff).not.toContain("src.ts");
      expect(mcpEnvelope.data.changed_files).toEqual([".aictx/memory/project.md"]);
      expect(mcpEnvelope.data.changed_memory_ids).toEqual([projectId]);
      expect(mcpEnvelope.data.changed_relation_ids).toEqual([]);
    } finally {
      await started.close();
    }

    expect(started.stderr()).toBe("");
  });
});

async function startMcpClient(cwd: string): Promise<StartedMcpClient> {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["--import", tsxLoader, serverEntry],
    cwd,
    stderr: "pipe"
  });
  const stderrChunks: string[] = [];
  const stderr = transport.stderr;

  if (stderr instanceof Readable) {
    stderr.setEncoding("utf8");
    stderr.on("data", (chunk: string) => {
      stderrChunks.push(chunk);
    });
  }

  const client = new Client({
    name: "aictx-mcp-read-tools-test-client",
    version: "0.0.0"
  });

  await client.connect(transport);

  return {
    client,
    close: async () => {
      await client.close();
    },
    stderr: () => stderrChunks.join("")
  };
}

async function createInitializedProject(prefix: string): Promise<string> {
  const projectRoot = await createTempRoot(prefix);
  const output = await runCli(["node", "aictx", "init", "--json"], projectRoot);

  expect(output.exitCode).toBe(0);
  expect(output.stderr).toBe("");

  return projectRoot;
}

async function createInitializedGitProject(prefix: string): Promise<string> {
  const repo = await createRepo(prefix);
  const output = await runCli(["node", "aictx", "init", "--json"], repo);

  expect(output.exitCode).toBe(0);
  expect(output.stderr).toBe("");

  await git(repo, ["add", ".gitignore", ".aictx"]);
  await git(repo, ["commit", "-m", "Initialize aictx"]);

  return repo;
}

async function createRepo(prefix: string): Promise<string> {
  const repo = await createTempRoot(prefix);
  await git(repo, ["init", "--initial-branch=main"]);
  await git(repo, ["config", "user.email", "test@example.com"]);
  await git(repo, ["config", "user.name", "Aictx Test"]);
  await writeFile(join(repo, "README.md"), "# Test\n", "utf8");
  await writeFile(join(repo, "src.ts"), "initial\n", "utf8");
  await git(repo, ["add", "README.md", "src.ts"]);
  await git(repo, ["commit", "-m", "Initial commit"]);
  return repo;
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

async function git(cwd: string, args: readonly string[]): Promise<string> {
  const result = await runSubprocess("git", args, { cwd });

  if (!result.ok) {
    throw new Error(result.error.message);
  }

  if (result.data.exitCode !== 0) {
    throw new Error(
      [
        `git ${args.join(" ")} failed with exit code ${result.data.exitCode}`,
        result.data.stderr
      ].join("\n")
    );
  }

  return result.data.stdout;
}

async function readJsonId(path: string): Promise<string> {
  const parsed = JSON.parse(await readFile(path, "utf8")) as unknown;

  if (!isRecord(parsed) || typeof parsed.id !== "string") {
    throw new Error(`Expected ${path} to contain a string id.`);
  }

  return parsed.id;
}

function parseCliEnvelope<T>(output: CliRunResult): T {
  expect(output.exitCode).toBe(0);
  expect(output.stderr).toBe("");
  return JSON.parse(output.stdout) as T;
}

function parseToolEnvelope<T>(result: unknown): T {
  expect(isRecord(result)).toBe(true);
  if (!isRecord(result)) {
    throw new Error("Expected MCP tool result to be an object.");
  }

  expect(result.isError).not.toBe(true);
  expect(result.structuredContent).toBeDefined();
  expect(Array.isArray(result.content)).toBe(true);

  if (!Array.isArray(result.content)) {
    throw new Error("Expected MCP tool result content to be an array.");
  }

  const text = result.content.find(isTextContent);

  expect(text).toBeDefined();
  if (
    text === undefined ||
    !isRecord(result.structuredContent)
  ) {
    throw new Error("Expected MCP tool result to include text and structured content.");
  }

  expect(JSON.parse(text.text) as unknown).toEqual(result.structuredContent);

  return result.structuredContent as T;
}

function isTextContent(value: unknown): value is TextContent {
  return isRecord(value) && value.type === "text" && typeof value.text === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
