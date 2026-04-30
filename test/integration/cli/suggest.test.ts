import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import fg from "fast-glob";
import { afterEach, describe, expect, it } from "vitest";

import { main, type CliOutputWriter } from "../../../src/cli/main.js";
import { runSubprocess } from "../../../src/core/subprocess.js";
import type {
  ObjectId,
  ObjectStatus,
  ObjectType,
  Predicate,
  RelationConfidence
} from "../../../src/core/types.js";
import {
  computeObjectContentHash,
  computeRelationContentHash
} from "../../../src/storage/hashes.js";
import type { MemoryObjectSidecar } from "../../../src/storage/objects.js";
import { readCanonicalStorage } from "../../../src/storage/read.js";
import type { MemoryRelation } from "../../../src/storage/relations.js";
import { FIXED_TIMESTAMP } from "../../fixtures/time.js";

const tempRoots: string[] = [];

interface CliRunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

interface SuggestSuccessEnvelope {
  ok: true;
  data: {
    mode: "from_diff" | "bootstrap";
    changed_files: string[];
    related_memory_ids: string[];
    possible_stale_ids: string[];
    recommended_memory: string[];
    agent_checklist: string[];
  };
  warnings: string[];
  meta: {
    git: {
      available: boolean;
      dirty: boolean | null;
    };
  };
}

interface SuggestErrorEnvelope {
  ok: false;
  error: {
    code: string;
    message: string;
  };
}

interface MemoryFixture {
  id: ObjectId;
  type: ObjectType;
  status: ObjectStatus;
  title: string;
  body: string;
  tags?: string[];
}

interface RelationFixture {
  id: string;
  from: ObjectId;
  predicate: Predicate;
  to: ObjectId;
  confidence?: RelationConfidence;
  fileEvidence: string;
}

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true }))
  );
});

describe("aictx suggest CLI", () => {
  it("builds from-diff packets from Git project changes without mutating Aictx files", async () => {
    const repo = await createInitializedSuggestGitProject("aictx-cli-suggest-diff-");
    await writeProjectFile(
      repo,
      "src/billing/webhook.ts",
      "export function handleWebhook() { return 'changed'; }\n"
    );
    await writeProjectFile(
      repo,
      "src/billing/worker.ts",
      "export function runWorker() { return 'new'; }\n"
    );
    await writeProjectFile(repo, "dist/generated.ts", "ignored\n");
    const before = await readCanonicalSnapshot(repo);

    const output = await runCli(["node", "aictx", "suggest", "--from-diff", "--json"], repo);

    expect(output.exitCode).toBe(0);
    expect(output.stderr).toBe("");
    const envelope = JSON.parse(output.stdout) as SuggestSuccessEnvelope;
    expect(envelope.ok).toBe(true);
    expect(envelope.warnings).toEqual([]);
    expect(envelope.data.mode).toBe("from_diff");
    expect(envelope.data.changed_files).toEqual([
      "src/billing/webhook.ts",
      "src/billing/worker.ts"
    ]);
    expect(envelope.data.changed_files).not.toContain("dist/generated.ts");
    expect(envelope.data.related_memory_ids).toEqual([
      "constraint.billing-idempotency",
      "decision.webhook-retries",
      "gotcha.old-webhook",
      "note.queue"
    ]);
    expect(envelope.data.possible_stale_ids).toEqual([
      "constraint.billing-idempotency",
      "decision.webhook-retries"
    ]);
    expect(envelope.data.recommended_memory).toEqual([
      "decision",
      "constraint",
      "gotcha",
      "workflow",
      "fact"
    ]);
    expect(envelope.data.agent_checklist).toContain(
      "Create memory only for durable future value."
    );
    expect(envelope.meta.git.available).toBe(true);
    expect(envelope.meta.git.dirty).toBe(false);
    await expect(readCanonicalSnapshot(repo)).resolves.toEqual(before);
  });

  it("returns AICtxGitRequired for from-diff outside Git", async () => {
    const projectRoot = await createInitializedLocalProject("aictx-cli-suggest-local-diff-");
    const before = await readCanonicalSnapshot(projectRoot);

    const output = await runCli(
      ["node", "aictx", "suggest", "--from-diff", "--json"],
      projectRoot
    );

    expect(output.exitCode).toBe(3);
    expect(output.stderr).toBe("");
    const envelope = JSON.parse(output.stdout) as SuggestErrorEnvelope;
    expect(envelope.ok).toBe(false);
    expect(envelope.error.code).toBe("AICtxGitRequired");
    await expect(readCanonicalSnapshot(projectRoot)).resolves.toEqual(before);
  });

  it("builds bootstrap packets outside Git without mutating Aictx files", async () => {
    const projectRoot = await createLocalProjectWithFiles("aictx-cli-suggest-bootstrap-");
    const before = await readCanonicalSnapshot(projectRoot);

    const output = await runCli(
      ["node", "aictx", "suggest", "--bootstrap", "--json"],
      projectRoot
    );

    expect(output.exitCode).toBe(0);
    expect(output.stderr).toBe("");
    const envelope = JSON.parse(output.stdout) as SuggestSuccessEnvelope;
    expect(envelope.ok).toBe(true);
    expect(envelope.data.mode).toBe("bootstrap");
    expect(envelope.data.changed_files).toEqual(
      expect.arrayContaining(["README.md", "package.json", "src/index.ts"])
    );
    expect(envelope.data.changed_files).not.toContain(".aictx/config.json");
    expect(envelope.data.recommended_memory).toEqual([
      "project",
      "architecture",
      "workflow",
      "constraint",
      "gotcha",
      "decision"
    ]);
    expect(envelope.meta.git.available).toBe(false);
    expect(envelope.meta.git.dirty).toBeNull();
    await expect(readCanonicalSnapshot(projectRoot)).resolves.toEqual(before);
  });

  it("returns validation errors when mode selection is invalid", async () => {
    const projectRoot = await createInitializedLocalProject("aictx-cli-suggest-invalid-");

    const missingMode = await runCli(["node", "aictx", "suggest", "--json"], projectRoot);
    const duplicateMode = await runCli(
      ["node", "aictx", "suggest", "--from-diff", "--bootstrap", "--json"],
      projectRoot
    );

    expect(missingMode.exitCode).toBe(1);
    expect(duplicateMode.exitCode).toBe(1);
    expect((JSON.parse(missingMode.stdout) as SuggestErrorEnvelope).error.code).toBe(
      "AICtxValidationFailed"
    );
    expect((JSON.parse(duplicateMode.stdout) as SuggestErrorEnvelope).error.code).toBe(
      "AICtxValidationFailed"
    );
  });
});

async function createInitializedSuggestGitProject(prefix: string): Promise<string> {
  const repo = await createRepo(prefix);
  const output = await runCli(["node", "aictx", "init", "--json"], repo);

  expect(output.exitCode).toBe(0);
  expect(output.stderr).toBe("");

  await writeMemoryObject(repo, {
    id: "decision.webhook-retries",
    type: "decision",
    status: "active",
    title: "Webhook retries",
    body: "# Webhook retries\n\nWebhook retries are handled by src/billing/webhook.ts.\n"
  });
  await writeMemoryObject(repo, {
    id: "constraint.billing-idempotency",
    type: "constraint",
    status: "active",
    title: "Billing idempotency",
    body: "# Billing idempotency\n\nBilling operations must be idempotent.\n",
    tags: ["billing"]
  });
  await writeMemoryObject(repo, {
    id: "note.queue",
    type: "note",
    status: "active",
    title: "Queue",
    body: "# Queue\n\nAsync jobs use the project queue.\n"
  });
  await writeMemoryObject(repo, {
    id: "gotcha.old-webhook",
    type: "gotcha",
    status: "stale",
    title: "Old webhook gotcha",
    body: "# Old webhook gotcha\n\nOld notes mention src/billing/webhook.ts.\n"
  });
  await writeRelation(repo, {
    id: "rel.worker-affects-billing",
    from: "note.queue",
    predicate: "affects",
    to: "constraint.billing-idempotency",
    confidence: "medium",
    fileEvidence: "src/billing/worker.ts"
  });
  await git(repo, ["add", ".gitignore", "AGENTS.md", "CLAUDE.md", ".aictx"]);
  await git(repo, ["commit", "-m", "Initialize Aictx memory"]);

  return repo;
}

async function createInitializedLocalProject(prefix: string): Promise<string> {
  const projectRoot = await createTempRoot(prefix);
  const output = await runCli(["node", "aictx", "init", "--json"], projectRoot);

  expect(output.exitCode).toBe(0);
  expect(output.stderr).toBe("");

  return projectRoot;
}

async function createLocalProjectWithFiles(prefix: string): Promise<string> {
  const projectRoot = await createTempRoot(prefix);
  await writeProjectFile(projectRoot, "README.md", "# Local project\n");
  await writeProjectFile(projectRoot, "package.json", "{}\n");
  await writeProjectFile(projectRoot, "src/index.ts", "export const value = 1;\n");
  await writeProjectFile(projectRoot, "dist/generated.ts", "ignored\n");
  const output = await runCli(["node", "aictx", "init", "--json"], projectRoot);

  expect(output.exitCode).toBe(0);
  expect(output.stderr).toBe("");

  return projectRoot;
}

async function createRepo(prefix: string): Promise<string> {
  const repo = await createTempRoot(prefix);
  await git(repo, ["init", "--initial-branch=main"]);
  await git(repo, ["config", "user.email", "test@example.com"]);
  await git(repo, ["config", "user.name", "Aictx Test"]);
  await writeProjectFile(repo, "README.md", "# Test\n");
  await writeProjectFile(
    repo,
    "src/billing/webhook.ts",
    "export function handleWebhook() { return 'initial'; }\n"
  );
  await git(repo, ["add", "README.md", "src/billing/webhook.ts"]);
  await git(repo, ["commit", "-m", "Initial commit"]);
  return repo;
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

async function writeMemoryObject(projectRoot: string, fixture: MemoryFixture): Promise<void> {
  const storage = await readStorageOrThrow(projectRoot);
  const bodyPath = memoryBodyPath(fixture);
  const sidecarWithoutHash = {
    id: fixture.id,
    type: fixture.type,
    status: fixture.status,
    title: fixture.title,
    body_path: bodyPath,
    scope: {
      kind: "project",
      project: storage.config.project.id,
      branch: null,
      task: null
    },
    tags: fixture.tags ?? [],
    source: {
      kind: "agent"
    },
    superseded_by: null,
    created_at: FIXED_TIMESTAMP,
    updated_at: FIXED_TIMESTAMP
  } satisfies Omit<MemoryObjectSidecar, "content_hash">;
  const sidecar: MemoryObjectSidecar = {
    ...sidecarWithoutHash,
    content_hash: computeObjectContentHash(sidecarWithoutHash, fixture.body)
  };

  await writeProjectFile(projectRoot, `.aictx/${bodyPath}`, fixture.body);
  await writeJsonProjectFile(
    projectRoot,
    `.aictx/${bodyPath.replace(/\.md$/u, ".json")}`,
    sidecar
  );
}

async function writeRelation(projectRoot: string, fixture: RelationFixture): Promise<void> {
  const relationWithoutHash = {
    id: fixture.id,
    from: fixture.from,
    predicate: fixture.predicate,
    to: fixture.to,
    status: "active",
    ...(fixture.confidence === undefined ? {} : { confidence: fixture.confidence }),
    evidence: [
      {
        kind: "file",
        id: fixture.fileEvidence
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
    `.aictx/relations/${fixture.id.replace(/^rel\./u, "")}.json`,
    relation
  );
}

function memoryBodyPath(fixture: MemoryFixture): string {
  const slug = fixture.id.slice(fixture.id.indexOf(".") + 1);

  return `memory/${memoryDirectory(fixture.type)}/${slug}.md`;
}

function memoryDirectory(type: ObjectType): string {
  switch (type) {
    case "decision":
      return "decisions";
    case "constraint":
      return "constraints";
    case "question":
      return "questions";
    case "fact":
      return "facts";
    case "gotcha":
      return "gotchas";
    case "workflow":
      return "workflows";
    case "note":
      return "notes";
    case "concept":
      return "concepts";
    case "project":
    case "architecture":
      throw new Error(`Unsupported fixture type for nested memory path: ${type}`);
  }
}

async function readStorageOrThrow(projectRoot: string) {
  const storage = await readCanonicalStorage(projectRoot);

  expect(storage.ok).toBe(true);
  if (!storage.ok) {
    throw new Error(storage.error.message);
  }

  return storage.data;
}

async function writeJsonProjectFile(
  projectRoot: string,
  relativePath: string,
  value: unknown
): Promise<void> {
  await writeProjectFile(projectRoot, relativePath, `${JSON.stringify(value, null, 2)}\n`);
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

async function readCanonicalSnapshot(projectRoot: string): Promise<Record<string, string>> {
  const paths = (
    await fg(".aictx/**/*.{json,jsonl,md}", {
      cwd: projectRoot,
      dot: true,
      ignore: [".aictx/index/**", ".aictx/context/**"],
      onlyFiles: true,
      unique: true
    })
  ).sort();
  const entries = await Promise.all(
    paths.map(async (path) => [path, await readFile(join(projectRoot, path), "utf8")] as const)
  );

  return Object.fromEntries(entries);
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
