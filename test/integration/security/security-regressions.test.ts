import { mkdir, mkdtemp, readFile, realpath, readdir, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath, pathToFileURL } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterEach, describe, expect, it } from "vitest";

import {
  initProject,
  saveMemoryPatch
} from "../../../src/app/operations.js";
import { main, type CliOutputWriter } from "../../../src/cli/main.js";
import type {
  ObjectId,
  ObjectStatus,
  ObjectType
} from "../../../src/core/types.js";
import { computeObjectContentHash } from "../../../src/storage/hashes.js";
import type { MemoryObjectSidecar } from "../../../src/storage/objects.js";
import { readCanonicalStorage } from "../../../src/storage/read.js";
import {
  createFixedTestClock,
  FIXED_TIMESTAMP,
  FIXED_TIMESTAMP_NEXT_MINUTE
} from "../../fixtures/time.js";

const require = createRequire(import.meta.url);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const serverEntry = join(repoRoot, "src/mcp/server.ts");
const tsxLoader = pathToFileURL(require.resolve("tsx")).href;
const tempRoots: string[] = [];

const REQUIRED_MCP_TOOLS = [
  "diff_memory",
  "load_memory",
  "save_memory_patch",
  "search_memory"
] as const;

const FORBIDDEN_MCP_TOOLS = [
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
  "export_obsidian",
  "shell",
  "run_shell",
  "execute_command",
  "read_file",
  "write_file",
  "filesystem",
  "create_object",
  "update_object",
  "delete_object",
  "create_relation",
  "update_relation",
  "delete_relation"
] as const;

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

interface ErrorEnvelope {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  warnings: unknown[];
  meta: unknown;
}

interface LoadEnvelope {
  ok: true;
  data: {
    context_pack: string;
    included_ids: string[];
    excluded_ids: string[];
  };
}

interface TextContent {
  type: "text";
  text: string;
}

interface MemoryFixture {
  id: ObjectId;
  type: ObjectType;
  status: ObjectStatus;
  title: string;
  bodyPath: string;
  body: string;
  tags: string[];
  supersededBy?: ObjectId;
}

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true }))
  );
});

describe("integration security regression guardrails", () => {
  it("quarantines tampered body_path traversal without writing outside Aictx storage", async () => {
    const projectRoot = await createInitializedProject("aictx-security-path-");
    const sidecarPath = join(projectRoot, ".aictx", "memory", "project.json");
    const sidecar = JSON.parse(await readFile(sidecarPath, "utf8")) as Record<string, unknown>;
    sidecar.body_path = "memory/../../outside.md";
    await writeFile(sidecarPath, `${JSON.stringify(sidecar, null, 2)}\n`, "utf8");

    const result = await saveMemoryPatch({
      cwd: projectRoot,
      clock: createFixedTestClock(FIXED_TIMESTAMP_NEXT_MINUTE),
      patch: createNotePatch("Traversal blocked", "This write must not happen.")
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.memory_created).toContain("note.traversal-blocked");
      expect(result.data.repairs_applied).toContain(
        "Quarantined invalid memory object sidecar: .aictx/memory/project.json"
      );
      expect(result.data.recovery_files).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: ".aictx/memory/project.json",
            reason: "repair_quarantine"
          })
        ])
      );
    }
    await expect(readFile(join(projectRoot, "outside.md"), "utf8")).rejects.toMatchObject({
      code: "ENOENT"
    });
    await expect(
      readFile(join(projectRoot, ".aictx", "memory", "notes", "traversal-blocked.md"), "utf8")
    ).resolves.toContain("This write must not happen.");
    await expect(readFile(sidecarPath, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("redacts detected secret values from CLI and MCP save failures", async () => {
    const secret = syntheticOpenAiKey();
    const cliProject = await createInitializedProject("aictx-security-cli-secret-");
    const cliOutput = await runCli(
      ["node", "aictx", "save", "--stdin", "--json"],
      cliProject,
      Readable.from([JSON.stringify(createNotePatch("CLI secret blocked", `Secret: ${secret}`))])
    );

    expect(cliOutput.exitCode).toBe(1);
    expect(cliOutput.stderr).toBe("");
    expectNoSecret(cliOutput.stdout, secret);
    const cliEnvelope = JSON.parse(cliOutput.stdout) as ErrorEnvelope;
    expect(cliEnvelope.ok).toBe(false);
    expect(cliEnvelope.error.code).toBe("AICtxSecretDetected");
    expectNoSecret(cliEnvelope, secret);
    await expect(
      readFile(join(cliProject, ".aictx", "memory", "notes", "cli-secret-blocked.md"), "utf8")
    ).rejects.toMatchObject({ code: "ENOENT" });

    const mcpProject = await createInitializedProject("aictx-security-mcp-secret-");
    const started = await startMcpClient(mcpProject);

    try {
      const result = await started.client.callTool({
        name: "save_memory_patch",
        arguments: {
          patch: createNotePatch("MCP secret blocked", `Secret: ${secret}`)
        }
      });
      const envelope = parseToolEnvelope<ErrorEnvelope>(result);

      expect(envelope.ok).toBe(false);
      expect(envelope.error.code).toBe("AICtxSecretDetected");
      expectNoSecret(result, secret);
      expectNoSecret(envelope, secret);
      await expect(
        readFile(join(mcpProject, ".aictx", "memory", "notes", "mcp-secret-blocked.md"), "utf8")
      ).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await started.close();
    }

    expect(started.stderr()).toBe("");
  });

  it("quarantines conflict-marked canonical files and still applies independent creates", async () => {
    const projectRoot = await createInitializedProject("aictx-security-conflict-");
    await writeFile(
      join(projectRoot, ".aictx", "memory", "project.md"),
      ["<<<<<<< HEAD", "# Project", "=======", "# Other project", ">>>>>>> branch", ""].join("\n"),
      "utf8"
    );

    const result = await saveMemoryPatch({
      cwd: projectRoot,
      clock: createFixedTestClock(FIXED_TIMESTAMP_NEXT_MINUTE),
      patch: createNotePatch("Conflict blocked", "This write must not happen.")
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.memory_created).toContain("note.conflict-blocked");
      expect(result.data.repairs_applied).toEqual(
        expect.arrayContaining([
          "Quarantined invalid memory object sidecar: .aictx/memory/project.json",
          "Quarantined invalid memory object body: .aictx/memory/project.md"
        ])
      );
      expect(result.data.recovery_files).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: ".aictx/memory/project.json",
            reason: "repair_quarantine"
          }),
          expect.objectContaining({
            path: ".aictx/memory/project.md",
            reason: "repair_quarantine"
          })
        ])
      );
    }
    await expect(
      readFile(join(projectRoot, ".aictx", "memory", "notes", "conflict-blocked.md"), "utf8")
    ).resolves.toContain("This write must not happen.");
    await expect(
      readFile(join(projectRoot, ".aictx", "memory", "project.md"), "utf8")
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("exposes exactly the normalized MCP tool set and keeps CLI-only tools uncallable", async () => {
    const projectRoot = await createTempRoot("aictx-security-mcp-tools-");
    const started = await startMcpClient(projectRoot);

    try {
      const result = await started.client.listTools();
      const toolNames = result.tools.map((tool) => tool.name).sort();

      expect(toolNames).toEqual([...REQUIRED_MCP_TOOLS]);
      expect(toolNames).not.toEqual(expect.arrayContaining([...FORBIDDEN_MCP_TOOLS]));

      for (const toolName of FORBIDDEN_MCP_TOOLS) {
        await expect(
          started.client.callTool({
            name: toolName,
            arguments: {}
          })
        ).resolves.toMatchObject({
          isError: true,
          content: expect.arrayContaining([
            expect.objectContaining({
              type: "text",
              text: expect.stringMatching(/not found/i)
            })
          ])
        });
      }
    } finally {
      await started.close();
    }

    expect(started.stderr()).toBe("");
    await expect(readdir(projectRoot)).resolves.toEqual([]);
  });

  it("keeps stale, superseded, and rejected memory out of Must know by default", async () => {
    const projectRoot = await createInitializedProject("aictx-security-load-");
    await writeMemoryObject(projectRoot, {
      id: "decision.security-active",
      type: "decision",
      status: "active",
      title: "Security active memory",
      bodyPath: "memory/decisions/security-active.md",
      body: "# Security active memory\n\nSecurity regression keyword must stay in Must know.\n",
      tags: ["security", "regression"]
    });
    await writeMemoryObject(projectRoot, {
      id: "decision.security-stale",
      type: "decision",
      status: "stale",
      title: "Security stale memory",
      bodyPath: "memory/decisions/security-stale.md",
      body: "# Security stale memory\n\nSecurity regression keyword stale guidance must not enter Must know.\n",
      tags: ["security", "regression"]
    });
    await writeMemoryObject(projectRoot, {
      id: "decision.security-superseded",
      type: "decision",
      status: "superseded",
      title: "Security superseded memory",
      bodyPath: "memory/decisions/security-superseded.md",
      body:
        "# Security superseded memory\n\nSecurity regression keyword superseded guidance must not enter Must know.\n",
      tags: ["security", "regression"],
      supersededBy: "decision.security-active"
    });
    await writeMemoryObject(projectRoot, {
      id: "note.security-rejected",
      type: "note",
      status: "rejected",
      title: "Security rejected memory",
      bodyPath: "memory/notes/security-rejected.md",
      body: "# Security rejected memory\n\nSecurity regression keyword rejected guidance must never render.\n",
      tags: ["security", "regression"]
    });
    await rebuildProject(projectRoot);

    const output = await runCli(
      ["node", "aictx", "load", "security regression keyword", "--json"],
      projectRoot
    );
    const envelope = parseSuccessfulCliEnvelope<LoadEnvelope>(output);
    const mustKnow = extractMarkdownSection(envelope.data.context_pack, "Must know");
    const staleSection = extractMarkdownSection(
      envelope.data.context_pack,
      "Stale or superseded memory to avoid"
    );

    expect(mustKnow).toContain("decision.security-active");
    expect(mustKnow).not.toContain("decision.security-stale");
    expect(mustKnow).not.toContain("decision.security-superseded");
    expect(mustKnow).not.toContain("note.security-rejected");
    expect(staleSection).toContain("decision.security-stale");
    expect(staleSection).toContain("decision.security-superseded");
    expect(envelope.data.context_pack).not.toContain("note.security-rejected");
    expect(envelope.data.included_ids).toContain("decision.security-active");
    expect(envelope.data.excluded_ids).toContain("note.security-rejected");
  });
});

async function createInitializedProject(prefix: string): Promise<string> {
  const projectRoot = await createTempRoot(prefix);
  const initialized = await initProject({
    cwd: projectRoot,
    clock: createFixedTestClock(FIXED_TIMESTAMP)
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
    name: "aictx-security-test-client",
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

async function runCli(
  argv: string[],
  cwd: string,
  stdin?: Readable
): Promise<CliRunResult> {
  const output = createCapturedOutput();
  const exitCode = await main(argv, {
    ...output.writers,
    cwd,
    ...(stdin === undefined ? {} : { stdin })
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

async function rebuildProject(projectRoot: string): Promise<void> {
  const output = await runCli(["node", "aictx", "rebuild", "--json"], projectRoot);

  expect(output.exitCode).toBe(0);
  expect(output.stderr).toBe("");
}

function createNotePatch(title: string, body: string) {
  return {
    source: {
      kind: "agent",
      task: "Security regression test"
    },
    changes: [
      {
        op: "create_object",
        type: "note",
        title,
        body: `# ${title}\n\n${body}\n`
      }
    ]
  };
}

async function writeMemoryObject(projectRoot: string, fixture: MemoryFixture): Promise<void> {
  const storage = await readStorageOrThrow(projectRoot);
  const sidecarWithoutHash: Omit<MemoryObjectSidecar, "content_hash"> = {
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
    ...(fixture.supersededBy === undefined
      ? {}
      : { superseded_by: fixture.supersededBy }),
    created_at: FIXED_TIMESTAMP_NEXT_MINUTE,
    updated_at: FIXED_TIMESTAMP_NEXT_MINUTE
  };
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

function parseSuccessfulCliEnvelope<T>(output: CliRunResult): T {
  expect(output.exitCode).toBe(0);
  expect(output.stderr).toBe("");

  return JSON.parse(output.stdout) as T;
}

function parseToolEnvelope<T>(result: unknown): T {
  expect(isRecord(result)).toBe(true);
  if (!isRecord(result)) {
    throw new Error("Expected MCP tool result to be an object.");
  }

  expect(result.structuredContent).toBeDefined();
  expect(Array.isArray(result.content)).toBe(true);

  if (!Array.isArray(result.content)) {
    throw new Error("Expected MCP tool result content to be an array.");
  }

  const text = result.content.find(isTextContent);

  expect(text).toBeDefined();
  if (text === undefined || !isRecord(result.structuredContent)) {
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

function syntheticOpenAiKey(): string {
  return ["sk", "A".repeat(20)].join("-");
}

function expectNoSecret(value: unknown, secret: string): void {
  const serialized = typeof value === "string" ? value : JSON.stringify(value);

  expect(serialized).not.toContain(secret);
}

function extractMarkdownSection(markdown: string, title: string): string {
  const heading = `## ${title}`;
  const start = markdown.indexOf(heading);

  if (start === -1) {
    return "";
  }

  const afterHeading = markdown.slice(start + heading.length);
  const nextHeading = afterHeading.search(/\n## /);

  return nextHeading === -1 ? afterHeading : afterHeading.slice(0, nextHeading);
}
