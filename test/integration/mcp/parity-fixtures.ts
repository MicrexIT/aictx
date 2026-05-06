import { cp, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath, pathToFileURL } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import fg from "fast-glob";
import { expect } from "vitest";

import { main, type CliOutputWriter } from "../../../src/cli/main.js";
import { runSubprocess } from "../../../src/core/subprocess.js";
import type {
  Evidence,
  ObjectFacets,
  ObjectStatus,
  ObjectType,
  Predicate,
  RelationConfidence,
  RelationStatus
} from "../../../src/core/types.js";
import {
  computeObjectContentHash,
  computeRelationContentHash
} from "../../../src/storage/hashes.js";
import type { MemoryObjectSidecar } from "../../../src/storage/objects.js";
import { readCanonicalStorage } from "../../../src/storage/read.js";
import type { MemoryRelation } from "../../../src/storage/relations.js";
import {
  FIXED_TIMESTAMP,
  FIXED_TIMESTAMP_NEXT_MINUTE
} from "../../fixtures/time.js";

const require = createRequire(import.meta.url);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const serverEntry = join(repoRoot, "src/mcp/server.ts");
const tsxLoader = pathToFileURL(require.resolve("tsx")).href;
const parityTempRoots: string[] = [];

export interface StartedParityMcpClient {
  client: Client;
  close: () => Promise<void>;
  stderr: () => string;
}

export interface ParityCliRunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

interface TextContent {
  type: "text";
  text: string;
}

interface MemoryFixture {
  id: string;
  type: ObjectType;
  status: ObjectStatus;
  title: string;
  bodyPath: string;
  body: string;
  tags: string[];
  facets?: ObjectFacets;
  evidence?: Evidence[];
  updatedAt?: string;
}

interface RelationFixture {
  id: string;
  from: string;
  predicate: Predicate;
  to: string;
  status?: RelationStatus;
  confidence?: RelationConfidence;
}

export async function cleanupParityTempRoots(): Promise<void> {
  await Promise.all(
    parityTempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true }))
  );
}

export async function createParityTempRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  const resolvedRoot = await realpath(root);

  parityTempRoots.push(resolvedRoot);

  return resolvedRoot;
}

export async function startParityMcpClient(cwd: string): Promise<StartedParityMcpClient> {
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
    name: "aictx-mcp-parity-test-client",
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

export async function runParityCli(
  argv: string[],
  cwd: string,
  options: { stdin?: Readable } = {}
): Promise<ParityCliRunResult> {
  const output = createCapturedOutput();
  const exitCode = await main(argv, {
    ...output.writers,
    cwd,
    ...(options.stdin === undefined ? {} : { stdin: options.stdin })
  });

  return {
    exitCode,
    stdout: output.stdout(),
    stderr: output.stderr()
  };
}

export function parseParityCliEnvelope<T>(output: ParityCliRunResult): T {
  expect(output.exitCode).toBe(0);
  expect(output.stderr).toBe("");
  return JSON.parse(output.stdout) as T;
}

export function parseParityCliErrorEnvelope<T>(output: ParityCliRunResult): T {
  expect(output.exitCode).not.toBe(0);
  expect(output.stderr).toBe("");
  return JSON.parse(output.stdout) as T;
}

export function parseParityToolEnvelope<T>(result: unknown): T {
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
  if (text === undefined || !isRecord(result.structuredContent)) {
    throw new Error("Expected MCP tool result to include text and structured content.");
  }

  expect(JSON.parse(text.text) as unknown).toEqual(result.structuredContent);

  return result.structuredContent as T;
}

export async function createInitializedParityProject(prefix: string): Promise<string> {
  const projectRoot = await createParityTempRoot(prefix);
  const output = await runParityCli(["node", "aictx", "init", "--json"], projectRoot);

  expect(output.exitCode).toBe(0);
  expect(output.stderr).toBe("");

  return projectRoot;
}

export async function createInitializedParityRepo(prefix: string): Promise<string> {
  const repo = await createParityRepo(prefix);
  const output = await runParityCli(["node", "aictx", "init", "--json"], repo);

  expect(output.exitCode).toBe(0);
  expect(output.stderr).toBe("");

  await parityGit(repo, ["add", ".gitignore", ".aictx"]);
  await parityGit(repo, ["commit", "-m", "Initialize aictx"]);

  return repo;
}

export async function rebuildParityProject(projectRoot: string): Promise<void> {
  const output = await runParityCli(["node", "aictx", "rebuild", "--json"], projectRoot);

  expect(output.exitCode).toBe(0);
  expect(output.stderr).toBe("");
}

export async function writeParityReadFixtures(projectRoot: string): Promise<void> {
  await writeMemoryObject(projectRoot, {
    id: "decision.parity-shared-read",
    type: "decision",
    status: "active",
    title: "Parity shared read",
    bodyPath: "memory/decisions/parity-shared-read.md",
    body:
      "# Parity shared read\n\nShared adapter parity keeps CLI JSON and MCP structured content equivalent for load_memory, search_memory, inspect_memory, and diff_memory.\n",
    tags: ["parity", "shared", "mcp"],
    facets: {
      category: "testing",
      applies_to: ["src/data-access/service.ts"],
      load_modes: ["coding", "review"]
    },
    evidence: [{ kind: "file", id: "src/data-access/service.ts" }],
    updatedAt: FIXED_TIMESTAMP_NEXT_MINUTE
  });
  await writeMemoryObject(projectRoot, {
    id: "constraint.parity-global-targeting",
    type: "constraint",
    status: "active",
    title: "Parity global targeting",
    bodyPath: "memory/constraints/parity-global-targeting.md",
    body:
      "# Parity global targeting\n\nGlobal MCP project_root targeting must resolve the same project boundary as CLI cwd targeting.\n",
    tags: ["parity", "targeting"],
    updatedAt: FIXED_TIMESTAMP_NEXT_MINUTE
  });
  await writeMemoryObject(projectRoot, {
    id: "note.parity-adapter-source",
    type: "note",
    status: "active",
    title: "Parity adapter source",
    bodyPath: "memory/notes/parity-adapter-source.md",
    body:
      "# Parity adapter source\n\nThe data-access service is the shared source for adapter behavior tests.\n",
    tags: ["parity", "adapter"],
    updatedAt: FIXED_TIMESTAMP
  });
  await writeRelation(projectRoot, {
    id: "rel.parity-read-requires-targeting",
    from: "decision.parity-shared-read",
    predicate: "requires",
    to: "constraint.parity-global-targeting",
    confidence: "high"
  });
  await writeRelation(projectRoot, {
    id: "rel.parity-source-affects-read",
    from: "note.parity-adapter-source",
    predicate: "affects",
    to: "decision.parity-shared-read",
    confidence: "medium"
  });
}

export async function writeParityDiffChanges(projectRoot: string): Promise<string> {
  const projectId = await readJsonId(join(projectRoot, ".aictx", "memory", "project.json"));

  await writeFile(
    join(projectRoot, ".aictx", "memory", "project.md"),
    "# Updated Project\n\nChanged Aictx memory for shared parity diff.\n",
    "utf8"
  );
  await mkdir(join(projectRoot, ".aictx", "memory", "notes"), { recursive: true });
  await writeFile(
    join(projectRoot, ".aictx", "memory", "notes", "parity-untracked-note.json"),
    `${JSON.stringify({ id: "note.parity-untracked-note" }, null, 2)}\n`,
    "utf8"
  );
  await writeFile(
    join(projectRoot, ".aictx", "memory", "notes", "parity-untracked-note.md"),
    "# Parity Untracked Note\n\nShared parity diff includes untracked Aictx memory only.\n",
    "utf8"
  );
  await writeFile(join(projectRoot, "src.ts"), "outside aictx dirty change\n", "utf8");

  return projectId;
}

export async function backupParityAictxRoot(projectRoot: string): Promise<string> {
  const snapshotRoot = await createParityTempRoot("aictx-parity-snapshot-");
  const snapshotPath = join(snapshotRoot, "aictx");

  await cp(join(projectRoot, ".aictx"), snapshotPath, { recursive: true });

  return snapshotPath;
}

export async function restoreParityAictxRoot(
  projectRoot: string,
  snapshotPath: string
): Promise<void> {
  await rm(join(projectRoot, ".aictx"), { recursive: true, force: true });
  await cp(snapshotPath, join(projectRoot, ".aictx"), { recursive: true });
}

export async function readParityCanonicalSnapshot(
  projectRoot: string
): Promise<Record<string, unknown>> {
  const paths = (
    await fg(".aictx/**/*.{json,jsonl,md}", {
      cwd: projectRoot,
      dot: true,
      ignore: [".aictx/index/**", ".aictx/context/**", ".aictx/exports/**", ".aictx/.lock"],
      onlyFiles: true,
      unique: true
    })
  ).sort();
  const entries = await Promise.all(
    paths.map(async (path) => {
      const contents = await readFile(join(projectRoot, path), "utf8");
      return [path, normalizeCanonicalFile(path, contents)] as const;
    })
  );

  return Object.fromEntries(entries);
}

export function createParityNotePatch(title: string, body: string) {
  return {
    source: {
      kind: "agent",
      task: "Shared CLI MCP parity save"
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

async function createParityRepo(prefix: string): Promise<string> {
  const repo = await createParityTempRoot(prefix);

  await parityGit(repo, ["init", "--initial-branch=main"]);
  await parityGit(repo, ["config", "user.email", "test@example.com"]);
  await parityGit(repo, ["config", "user.name", "Aictx Test"]);
  await writeFile(join(repo, "README.md"), "# Test\n", "utf8");
  await writeFile(join(repo, "src.ts"), "initial\n", "utf8");
  await parityGit(repo, ["add", "README.md", "src.ts"]);
  await parityGit(repo, ["commit", "-m", "Initial commit"]);

  return repo;
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
    ...(fixture.facets === undefined ? {} : { facets: fixture.facets }),
    ...(fixture.evidence === undefined ? {} : { evidence: fixture.evidence }),
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

async function writeRelation(projectRoot: string, fixture: RelationFixture): Promise<void> {
  const relationWithoutHash = {
    id: fixture.id,
    from: fixture.from,
    predicate: fixture.predicate,
    to: fixture.to,
    status: fixture.status ?? "active",
    ...(fixture.confidence === undefined ? {} : { confidence: fixture.confidence }),
    evidence: [
      {
        kind: "memory",
        id: fixture.from
      }
    ],
    created_at: FIXED_TIMESTAMP,
    updated_at: FIXED_TIMESTAMP
  } satisfies Omit<MemoryRelation, "content_hash">;
  const relation: MemoryRelation = {
    ...relationWithoutHash,
    content_hash: computeRelationContentHash(relationWithoutHash)
  };

  await writeJsonProjectFile(
    projectRoot,
    `.aictx/relations/${fixture.id.replace(/^rel\./, "")}.json`,
    relation
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

async function parityGit(cwd: string, args: readonly string[]): Promise<string> {
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

function normalizeCanonicalFile(path: string, contents: string): unknown {
  if (path.endsWith(".json")) {
    return normalizeVolatileFields(JSON.parse(contents) as unknown);
  }

  if (path.endsWith(".jsonl")) {
    return contents
      .split("\n")
      .filter((line) => line.length > 0)
      .map((line) => normalizeVolatileFields(JSON.parse(line) as unknown));
  }

  return contents;
}

function normalizeVolatileFields(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizeVolatileFields);
  }

  if (!isRecord(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => {
      if (
        typeof entry === "string" &&
        (key === "created_at" ||
          key === "updated_at" ||
          key === "timestamp" ||
          key === "content_hash")
      ) {
        return [key, `<${key}>`];
      }

      return [key, normalizeVolatileFields(entry)];
    })
  );
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

function isTextContent(value: unknown): value is TextContent {
  return isRecord(value) && value.type === "text" && typeof value.text === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
