import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import fg from "fast-glob";
import { afterEach, describe, expect, it } from "vitest";

import { main, type CliOutputWriter } from "../../../src/cli/main.js";
import { runSubprocess } from "../../../src/core/subprocess.js";
import type {
  Evidence,
  ObjectId,
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
import { FIXED_TIMESTAMP } from "../../fixtures/time.js";

const tempRoots: string[] = [];

interface CliRunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

interface AuditSuccessEnvelope {
  ok: true;
  data: {
    findings: Array<{
      severity: "warning" | "info";
      rule: string;
      memory_id: string;
      message: string;
      evidence: Evidence[];
    }>;
  };
  warnings: string[];
  meta: {
    git: {
      available: boolean;
      dirty: boolean | null;
    };
  };
}

interface AuditErrorEnvelope {
  ok: false;
  error: {
    code: string;
    message: string;
  };
}

interface MemoryFixture {
  id: ObjectId;
  type?: ObjectType;
  status?: ObjectStatus;
  title: string;
  body: string;
  tags?: string[];
  supersededBy?: ObjectId | null;
}

interface RelationFixture {
  id: string;
  from: ObjectId;
  predicate?: Predicate;
  to: ObjectId;
  status?: RelationStatus;
  confidence?: RelationConfidence;
  evidence?: Evidence[];
}

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true }))
  );
});

describe("aictx audit CLI", () => {
  it("reports deterministic findings without mutating Aictx files or Git state", async () => {
    const repo = await createAuditGitProject("aictx-cli-audit-");
    const beforeTree = await readAictxTreeSnapshot(repo);
    const beforeGitStatus = await git(repo, ["status", "--short"]);

    const output = await runCli(["node", "aictx", "audit", "--json"], repo);
    const repeatOutput = await runCli(["node", "aictx", "audit", "--json"], repo);
    const humanOutput = await runCli(["node", "aictx", "audit"], repo);

    expect(output.exitCode).toBe(0);
    expect(output.stderr).toBe("");
    expect(repeatOutput.stdout).toBe(output.stdout);
    expect(humanOutput.exitCode).toBe(0);
    expect(humanOutput.stderr).toBe("");
    expect(humanOutput.stdout).toContain("Aictx audit findings:");
    expect(humanOutput.stdout).toContain("[warning] duplicate_like_title_or_tags");

    const envelope = JSON.parse(output.stdout) as AuditSuccessEnvelope;
    expect(envelope.ok).toBe(true);
    expect(envelope.warnings).toEqual([]);
    expect(envelope.meta.git.available).toBe(true);
    expect(envelope.meta.git.dirty).toBe(false);
    expect(new Set(envelope.data.findings.map((finding) => finding.rule))).toEqual(
      new Set([
        "vague_memory",
        "duplicate_like_title_or_tags",
        "stale_or_superseded_cleanup",
        "referenced_file_missing",
        "missing_tags",
        "missing_evidence",
        "missing_facets",
        "missing_object_evidence",
        "manifest_version_contradiction",
        "weakly_connected_memory"
      ])
    );
    expect(envelope.data.findings).toContainEqual(
      expect.objectContaining({
        severity: "warning",
        rule: "referenced_file_missing",
        memory_id: "gotcha.missing-body-file",
        evidence: [
          { kind: "file", id: "src/relation-missing.ts" },
          { kind: "relation", id: "rel.missing-file" }
        ]
      })
    );
    await expect(readAictxTreeSnapshot(repo)).resolves.toEqual(beforeTree);
    await expect(git(repo, ["status", "--short"])).resolves.toBe(beforeGitStatus);
  });

  it("returns AICtxNotInitialized for uninitialized projects", async () => {
    const projectRoot = await createTempRoot("aictx-cli-audit-uninitialized-");

    const output = await runCli(["node", "aictx", "audit", "--json"], projectRoot);

    expect(output.exitCode).toBe(3);
    expect(output.stderr).toBe("");
    const envelope = JSON.parse(output.stdout) as AuditErrorEnvelope;
    expect(envelope.ok).toBe(false);
    expect(envelope.error.code).toBe("AICtxNotInitialized");
  });
});

async function createAuditGitProject(prefix: string): Promise<string> {
  const repo = await createRepo(prefix);
  const output = await runCli(["node", "aictx", "init", "--json"], repo);

  expect(output.exitCode).toBe(0);
  expect(output.stderr).toBe("");

  await writeMemoryObject(repo, {
    id: "decision.todo",
    title: "TODO",
    tags: [],
    body: "# TODO\n\nTBD.\n"
  });
  await writeMemoryObject(repo, {
    id: "decision.duplicate-a",
    title: "Shared webhook rule",
    tags: ["billing", "stripe", "webhooks"],
    body: longBody("First duplicate memory keeps the same title and tags.")
  });
  await writeMemoryObject(repo, {
    id: "decision.duplicate-b",
    status: "draft",
    title: "Shared webhook rule",
    tags: ["billing", "stripe", "webhooks"],
    body: longBody("Second duplicate memory keeps the same title and tags.")
  });
  await writeMemoryObject(repo, {
    id: "gotcha.missing-body-file",
    type: "gotcha",
    title: "Missing body file",
    tags: ["files"],
    body: longBody("This references src/missing.ts for future cleanup.")
  });
  await writeMemoryObject(repo, {
    id: "fact.package-version",
    type: "fact",
    title: "Release package version",
    tags: ["release"],
    body: longBody("The package version is 9.9.9 for release notes.")
  });
  await writeMemoryObject(repo, {
    id: "gotcha.old-cleanup",
    type: "gotcha",
    status: "stale",
    title: "Old cleanup",
    body: longBody("Old cleanup memory is now stale but still linked.")
  });
  await writeMemoryObject(repo, {
    id: "decision.superseded-cleanup",
    status: "superseded",
    title: "Superseded cleanup",
    body: longBody("Superseded memory should identify its replacement.")
  });
  await writeMemoryObject(repo, {
    id: "decision.current",
    title: "Current replacement",
    tags: ["current"],
    body: longBody("Current replacement memory remains active.")
  });
  await writeRelation(repo, {
    id: "rel.missing-evidence",
    from: "decision.duplicate-a",
    to: "decision.current",
    confidence: "high",
    evidence: []
  });
  await writeRelation(repo, {
    id: "rel.stale-active-link",
    from: "gotcha.old-cleanup",
    to: "decision.current",
    evidence: [{ kind: "memory", id: "gotcha.old-cleanup" }]
  });
  await writeRelation(repo, {
    id: "rel.missing-file",
    from: "gotcha.missing-body-file",
    to: "decision.current",
    evidence: [{ kind: "file", id: "src/relation-missing.ts" }]
  });
  await git(repo, ["add", ".gitignore", "AGENTS.md", "CLAUDE.md", ".aictx"]);
  await git(repo, ["commit", "-m", "Initialize Aictx audit memory"]);

  return repo;
}

async function createRepo(prefix: string): Promise<string> {
  const repo = await createTempRoot(prefix);
  await git(repo, ["init", "--initial-branch=main"]);
  await git(repo, ["config", "user.email", "test@example.com"]);
  await git(repo, ["config", "user.name", "Aictx Test"]);
  await writeProjectFile(repo, "package.json", '{ "version": "1.2.3" }\n');
  await writeProjectFile(repo, "README.md", "# Test\n");
  await writeProjectFile(repo, "src/current.ts", "export const current = true;\n");
  await git(repo, ["add", "package.json", "README.md", "src/current.ts"]);
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
  const type = fixture.type ?? objectTypeFromId(fixture.id);
  const bodyPath = memoryBodyPath(type, fixture.id);
  const sidecarWithoutHash = {
    id: fixture.id,
    type,
    status: fixture.status ?? "active",
    title: fixture.title,
    body_path: bodyPath,
    scope: {
      kind: "project",
      project: storage.config.project.id,
      branch: null,
      task: null
    },
    tags: fixture.tags ?? ["test"],
    source: {
      kind: "agent"
    },
    superseded_by: fixture.supersededBy ?? null,
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
    predicate: fixture.predicate ?? "affects",
    to: fixture.to,
    status: fixture.status ?? "active",
    ...(fixture.confidence === undefined ? {} : { confidence: fixture.confidence }),
    ...(fixture.evidence === undefined ? {} : { evidence: fixture.evidence }),
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

function memoryBodyPath(type: ObjectType, id: ObjectId): string {
  const slug = id.slice(id.indexOf(".") + 1);

  return `memory/${memoryDirectory(type)}/${slug}.md`;
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
      return "projects";
    case "architecture":
      return "architecture";
  }
}

function objectTypeFromId(id: ObjectId): ObjectType {
  return id.slice(0, id.indexOf(".")) as ObjectType;
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

async function readAictxTreeSnapshot(projectRoot: string): Promise<Record<string, string>> {
  const entries = (
    await fg(".aictx/**", {
      cwd: projectRoot,
      dot: true,
      markDirectories: true,
      onlyFiles: false,
      unique: true
    })
  ).sort();
  const snapshotEntries = await Promise.all(
    entries.map(async (entry) => {
      if (entry.endsWith("/")) {
        return [entry, "dir"] as const;
      }

      const contents = await readFile(join(projectRoot, entry));
      return [entry, `file:${sha256(contents)}`] as const;
    })
  );

  return Object.fromEntries(snapshotEntries);
}

function sha256(contents: Buffer): string {
  return createHash("sha256").update(contents).digest("hex");
}

function longBody(sentence: string): string {
  return `# ${sentence}\n\n${sentence} This body includes enough concrete words for deterministic audit tests.\n`;
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
