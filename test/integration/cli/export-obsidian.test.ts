import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
  stat,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { main, type CliOutputWriter } from "../../../src/cli/main.js";
import type {
  ObjectId,
  ObjectStatus,
  ObjectType,
  Predicate,
  RelationStatus
} from "../../../src/core/types.js";
import {
  computeObjectContentHash,
  computeRelationContentHash
} from "../../../src/storage/hashes.js";
import type { MemoryObjectSidecar } from "../../../src/storage/objects.js";
import { readCanonicalStorage } from "../../../src/storage/read.js";
import type { MemoryRelation } from "../../../src/storage/relations.js";
import { FIXED_TIMESTAMP, FIXED_TIMESTAMP_NEXT_MINUTE } from "../../fixtures/time.js";

const tempRoots: string[] = [];

interface CliRunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

interface ExportEnvelope {
  ok: true;
  data: {
    format: "obsidian";
    output_dir: string;
    manifest_path: string;
    objects_exported: number;
    relations_linked: number;
    files_written: string[];
    files_removed: string[];
  };
}

interface ErrorEnvelope {
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
  updatedAt?: string;
}

interface RelationFixture {
  id: string;
  from: ObjectId;
  predicate: Predicate;
  to: ObjectId;
  status?: RelationStatus;
}

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true }))
  );
});

describe("aictx export obsidian CLI", () => {
  it("exports the default generated projection without mutating canonical storage or SQLite", async () => {
    const projectRoot = await createExportFixtureProject("aictx-cli-export-obsidian-");
    const before = await readCanonicalAndIndexFiles(projectRoot);

    const output = await runCli(["node", "aictx", "export", "obsidian", "--json"], projectRoot);

    expect(output.exitCode).toBe(0);
    expect(output.stderr).toBe("");
    const envelope = JSON.parse(output.stdout) as ExportEnvelope;

    expect(envelope.ok).toBe(true);
    expect(envelope.data).toMatchObject({
      format: "obsidian",
      output_dir: ".aictx/exports/obsidian",
      manifest_path: ".aictx/exports/obsidian/.aictx-obsidian-export.json",
      objects_exported: 5,
      relations_linked: 2
    });
    expect(envelope.data.files_written).toContain(
      ".aictx/exports/obsidian/memory/decision.billing-retries.md"
    );
    expect(envelope.data.files_removed).toEqual([]);

    const note = await readFile(
      join(projectRoot, ".aictx/exports/obsidian/memory/decision.billing-retries.md"),
      "utf8"
    );
    const frontmatter = parseJsonFrontmatter(note);

    expect(frontmatter).toMatchObject({
      aictx_id: "decision.billing-retries",
      aictx_title: "Billing retries",
      aliases: ["Billing retries"],
      tags: ["billing", "retries"],
      aictx_rel_requires: ["[[memory/constraint.webhook-idempotency]]"]
    });
    expect(frontmatter).not.toHaveProperty("aictx_rel_mentions");
    expect(note).toContain("# Billing retries\n\nRetries run in the queue worker.\n");
    expect(note).toContain(
      "- requires: [[memory/constraint.webhook-idempotency]]"
    );
    await expect(readCanonicalAndIndexFiles(projectRoot)).resolves.toEqual(before);
  });

  it("supports a custom manifest-owned output directory and preserves unmanifested files", async () => {
    const projectRoot = await createExportFixtureProject("aictx-cli-export-obsidian-custom-");

    const first = await runCli(
      ["node", "aictx", "export", "obsidian", "--out", "aictx-obsidian"],
      projectRoot
    );

    expect(first.exitCode).toBe(0);
    expect(first.stderr).toBe("");
    expect(first.stdout).toContain("Exported Obsidian projection.");
    expect(first.stdout).toContain("Output: aictx-obsidian");

    await writeProjectFile(projectRoot, "aictx-obsidian/user-note.md", "# User note\n");
    await rm(join(projectRoot, ".aictx/memory/notes/worker-details.md"));
    await rm(join(projectRoot, ".aictx/memory/notes/worker-details.json"));

    const second = await runCli(
      [
        "node",
        "aictx",
        "export",
        "obsidian",
        "--out",
        "aictx-obsidian",
        "--json"
      ],
      projectRoot
    );

    expect(second.exitCode).toBe(0);
    expect(second.stderr).toBe("");
    const envelope = JSON.parse(second.stdout) as ExportEnvelope;

    expect(envelope.data.output_dir).toBe("aictx-obsidian");
    expect(envelope.data.files_removed).toEqual([
      "aictx-obsidian/memory/note.worker-details.md"
    ]);
    await expect(
      readFile(join(projectRoot, "aictx-obsidian/user-note.md"), "utf8")
    ).resolves.toBe("# User note\n");
    await expect(
      readFile(join(projectRoot, "aictx-obsidian/memory/note.worker-details.md"), "utf8")
    ).rejects.toThrow();
  });

  it("fails for a non-empty unmanifested output directory", async () => {
    const projectRoot = await createExportFixtureProject("aictx-cli-export-obsidian-invalid-");
    await writeProjectFile(projectRoot, "aictx-obsidian/user-note.md", "# User note\n");

    const output = await runCli(
      [
        "node",
        "aictx",
        "export",
        "obsidian",
        "--out",
        "aictx-obsidian",
        "--json"
      ],
      projectRoot
    );

    expect(output.exitCode).toBe(1);
    expect(output.stderr).toBe("");
    const envelope = JSON.parse(output.stdout) as ErrorEnvelope;

    expect(envelope.ok).toBe(false);
    expect(envelope.error.code).toBe("AICtxExportTargetInvalid");
  });
});

async function createExportFixtureProject(prefix: string): Promise<string> {
  const projectRoot = await createInitializedProject(prefix);

  await writeMemoryObject(projectRoot, {
    id: "decision.billing-retries",
    type: "decision",
    status: "active",
    title: "Billing retries",
    body: "# Billing retries\n\nRetries run in the queue worker.\n",
    tags: ["billing", "retries"],
    updatedAt: FIXED_TIMESTAMP_NEXT_MINUTE
  });
  await writeMemoryObject(projectRoot, {
    id: "constraint.webhook-idempotency",
    type: "constraint",
    status: "active",
    title: "Webhook idempotency",
    body: "# Webhook idempotency\n\nWebhook delivery IDs must be deduplicated.\n",
    tags: ["webhooks"]
  });
  await writeMemoryObject(projectRoot, {
    id: "note.worker-details",
    type: "note",
    status: "active",
    title: "Worker details",
    body: "# Worker details\n\nThe queue worker owns retry execution.\n",
    tags: ["worker"]
  });
  await writeRelation(projectRoot, {
    id: "rel.decision-requires-idempotency",
    from: "decision.billing-retries",
    predicate: "requires",
    to: "constraint.webhook-idempotency",
    status: "active"
  });
  await writeRelation(projectRoot, {
    id: "rel.decision-mentions-worker",
    from: "decision.billing-retries",
    predicate: "mentions",
    to: "note.worker-details",
    status: "stale"
  });

  return projectRoot;
}

async function createInitializedProject(prefix: string): Promise<string> {
  const projectRoot = await createTempRoot(prefix);
  const output = await runCli(["node", "aictx", "init", "--json"], projectRoot);

  expect(output.exitCode).toBe(0);
  expect(output.stderr).toBe("");

  return projectRoot;
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
    created_at: FIXED_TIMESTAMP,
    updated_at: fixture.updatedAt ?? FIXED_TIMESTAMP
  } satisfies Omit<MemoryObjectSidecar, "content_hash">;
  const sidecar: MemoryObjectSidecar = {
    ...sidecarWithoutHash,
    content_hash: computeObjectContentHash(sidecarWithoutHash, fixture.body)
  };

  await writeProjectFile(projectRoot, `.aictx/${bodyPath}`, fixture.body);
  await writeJsonProjectFile(
    projectRoot,
    `.aictx/${bodyPath.replace(/\.md$/, ".json")}`,
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
    case "source":
      return "sources";
    case "synthesis":
      return "syntheses";
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

async function readCanonicalAndIndexFiles(projectRoot: string): Promise<Record<string, string>> {
  const files: Record<string, string> = {};

  for (const root of [
    ".aictx/config.json",
    ".aictx/events.jsonl",
    ".aictx/memory",
    ".aictx/relations",
    ".aictx/schema",
    ".aictx/index"
  ]) {
    const absoluteRoot = join(projectRoot, root);
    Object.assign(files, await readFilesRecursively(projectRoot, absoluteRoot));
  }

  return files;
}

async function readFilesRecursively(
  projectRoot: string,
  absolutePath: string
): Promise<Record<string, string>> {
  const pathStat = await stat(absolutePath);

  if (pathStat.isFile()) {
    return {
      [relative(projectRoot, absolutePath)]: (await readFile(absolutePath)).toString("base64")
    };
  }

  const entries = await readdir(absolutePath, { withFileTypes: true });
  const files: Record<string, string> = {};

  for (const entry of entries) {
    const child = join(absolutePath, entry.name);

    if (entry.isDirectory()) {
      Object.assign(files, await readFilesRecursively(projectRoot, child));
      continue;
    }

    if (entry.isFile()) {
      files[relative(projectRoot, child)] = (await readFile(child)).toString("base64");
    }
  }

  return files;
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

async function createTempRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  const resolvedRoot = await realpath(root);
  tempRoots.push(resolvedRoot);
  return resolvedRoot;
}

function parseJsonFrontmatter(markdown: string): Record<string, unknown> {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(markdown);
  expect(match?.[1]).toBeDefined();
  return JSON.parse(match?.[1] ?? "{}") as Record<string, unknown>;
}
