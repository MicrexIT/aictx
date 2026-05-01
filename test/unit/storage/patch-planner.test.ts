import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import fg from "fast-glob";
import { afterEach, describe, expect, it } from "vitest";

import type {
  GitState,
  ObjectId,
  ObjectStatus,
  ObjectType,
  Predicate,
  RelationId
} from "../../../src/core/types.js";
import type {
  SubprocessResult,
  SubprocessRunner,
  SubprocessRunnerOptions
} from "../../../src/core/subprocess.js";
import {
  computeObjectContentHash,
  computeRelationContentHash
} from "../../../src/storage/hashes.js";
import type { MemoryObjectSidecar } from "../../../src/storage/objects.js";
import type { MemoryRelation } from "../../../src/storage/relations.js";
import { planMemoryPatch } from "../../../src/storage/patch.js";
import { SCHEMA_FILES } from "../../../src/validation/schemas.js";
import { createFixedTestClock, FIXED_TIMESTAMP } from "../../fixtures/time.js";

const repoRoot = process.cwd();
const tempRoots: string[] = [];
const projectId = "project.billing-api";
const noGit: GitState = {
  available: false,
  branch: null,
  commit: null,
  dirty: null
};
const dirtyGit: GitState = {
  available: true,
  branch: "main",
  commit: "abc123",
  dirty: true
};
const validConfig = {
  version: 1,
  project: {
    id: projectId,
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

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("planMemoryPatch", () => {
  it("normalizes valid changes, resolves paths, and does not mutate disk", async () => {
    const projectRoot = await createPatchProject();
    const before = await readAictxSnapshot(projectRoot);

    const result = await planMemoryPatch({
      projectRoot,
      patch: {
        source: {
          kind: "agent",
          task: "Document retry follow up"
        },
        changes: [
          {
            op: "create_object",
            type: "note",
            title: "Billing retries follow up",
            body: "Check retry behavior after the worker change."
          },
          {
            op: "update_object",
            id: "decision.billing-retries",
            body: "Retries now run in the queue worker.",
            tags: ["billing", "queue"]
          }
        ]
      },
      git: noGit,
      clock: createFixedTestClock()
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.data.memory_created).toEqual(["note.billing-retries-follow-up"]);
    expect(result.data.memory_updated).toEqual(["decision.billing-retries"]);
    expect(result.data.events_appended).toBe(2);
    expect(result.data.changes[0]).toEqual(
      expect.objectContaining({
        op: "create_object",
        id: "note.billing-retries-follow-up",
        status: "active",
        scope: {
          kind: "project",
          project: projectId,
          branch: null,
          task: null
        },
        path: ".aictx/memory/notes/billing-retries-follow-up.json",
        bodyPath: ".aictx/memory/notes/billing-retries-follow-up.md"
      })
    );
    expect(result.data.touchedFiles).toEqual([
      ".aictx/events.jsonl",
      ".aictx/memory/decisions/billing-retries.json",
      ".aictx/memory/decisions/billing-retries.md",
      ".aictx/memory/notes/billing-retries-follow-up.json",
      ".aictx/memory/notes/billing-retries-follow-up.md"
    ]);
    expect(result.data.fileWrites).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: ".aictx/memory/notes/billing-retries-follow-up.md",
          kind: "object_body",
          operation: "create_object"
        }),
        expect.objectContaining({
          path: ".aictx/memory/decisions/billing-retries.json",
          kind: "object_sidecar",
          operation: "update_object"
        })
      ])
    );
    await expect(readAictxSnapshot(projectRoot)).resolves.toEqual(before);
  });

  it("fails schema-invalid patches before disk writes", async () => {
    const projectRoot = await createPatchProject();
    const before = await readAictxSnapshot(projectRoot);

    const result = await planMemoryPatch({
      projectRoot,
      patch: {
        source: {
          kind: "agent"
        },
        changes: [
          {
            op: "create_object",
            type: "note",
            title: "Missing body"
          }
        ]
      },
      git: noGit,
      clock: createFixedTestClock()
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("AICtxSchemaValidationFailed");
    }
    await expect(readAictxSnapshot(projectRoot)).resolves.toEqual(before);
  });

  it("fails empty changes", async () => {
    const projectRoot = await createPatchProject();

    const result = await planMemoryPatch({
      projectRoot,
      patch: {
        source: {
          kind: "agent"
        },
        changes: []
      },
      git: noGit,
      clock: createFixedTestClock()
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("AICtxSchemaValidationFailed");
      expect(JSON.stringify(result.error.details)).toContain("SchemaMinItems");
    }
  });

  it("fails unknown operations with AICtxUnknownPatchOperation", async () => {
    const projectRoot = await createPatchProject();

    const result = await planMemoryPatch({
      projectRoot,
      patch: {
        source: {
          kind: "agent"
        },
        changes: [
          {
            op: "rename_object",
            id: "decision.billing-retries"
          }
        ]
      },
      git: noGit,
      clock: createFixedTestClock()
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("AICtxUnknownPatchOperation");
      expect(result.error.details).toEqual(
        expect.objectContaining({
          op: "rename_object",
          field: "/changes/0/op"
        })
      );
    }
  });

  it("fails with AICtxDirtyMemory when dirty files overlap touched files", async () => {
    const projectRoot = await createPatchProject();

    const result = await planMemoryPatch({
      projectRoot,
      patch: {
        source: {
          kind: "agent"
        },
        changes: [
          {
            op: "update_object",
            id: "decision.billing-retries",
            title: "Billing retries run in the worker"
          }
        ]
      },
      git: dirtyGit,
      clock: createFixedTestClock(),
      runner: createGitStatusRunner(
        [
          " M .aictx/memory/decisions/billing-retries.json",
          " M .aictx/memory/facts/unrelated.json",
          ""
        ].join("\n"),
        new Set([".aictx/memory/decisions/billing-retries.json"])
      )
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("AICtxDirtyMemory");
      expect(JSON.stringify(result.error.details)).toContain(
        ".aictx/memory/decisions/billing-retries.json"
      );
      expect(JSON.stringify(result.error.details)).not.toContain(
        ".aictx/memory/facts/unrelated.json"
      );
    }
  });

  it("allows dirty tracked events history because saves append to it", async () => {
    const projectRoot = await createPatchProject();

    const result = await planMemoryPatch({
      projectRoot,
      patch: {
        source: {
          kind: "agent"
        },
        changes: [
          {
            op: "update_object",
            id: "decision.billing-retries",
            title: "Billing retries run in the worker"
          }
        ]
      },
      git: dirtyGit,
      clock: createFixedTestClock(),
      runner: createGitStatusRunner(
        [" M .aictx/events.jsonl", ""].join("\n"),
        new Set([".aictx/events.jsonl"])
      )
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.touchedFiles).toContain(".aictx/events.jsonl");
      expect(result.data.events_appended).toBe(1);
    }
  });

  it("allows untracked first-run Aictx files to be updated before the initial memory commit", async () => {
    const projectRoot = await createPatchProject();

    const result = await planMemoryPatch({
      projectRoot,
      patch: {
        source: {
          kind: "agent"
        },
        changes: [
          {
            op: "update_object",
            id: "decision.billing-retries",
            title: "Billing retries run in the worker"
          }
        ]
      },
      git: dirtyGit,
      clock: createFixedTestClock(),
      runner: createGitStatusRunner(
        ["?? .aictx/memory/decisions/billing-retries.json", ""].join("\n"),
        new Set()
      )
    });

    expect(result.ok).toBe(true);
  });
});

async function createPatchProject(): Promise<string> {
  const projectRoot = await mkdtemp(join(tmpdir(), "aictx-patch-plan-"));
  tempRoots.push(projectRoot);
  await mkdir(join(projectRoot, ".aictx", "schema"), { recursive: true });

  for (const schemaFile of Object.values(SCHEMA_FILES)) {
    await copyFile(
      join(repoRoot, "src", "schemas", schemaFile),
      join(projectRoot, ".aictx", "schema", schemaFile)
    );
  }

  await writeJsonProjectFile(projectRoot, ".aictx/config.json", validConfig);
  await writeMemoryObject(projectRoot, {
    id: "decision.billing-retries",
    type: "decision",
    status: "active",
    title: "Billing retries moved to queue worker",
    bodyPath: "memory/decisions/billing-retries.md",
    body: "# Billing retries moved to queue worker\n\nRetries run in the queue worker.\n"
  });
  await writeMemoryObject(projectRoot, {
    id: "constraint.webhook-idempotency",
    type: "constraint",
    status: "active",
    title: "Webhook processing must be idempotent",
    bodyPath: "memory/constraints/webhook-idempotency.md",
    body: "# Webhook processing must be idempotent\n\nDuplicate webhooks are expected.\n"
  });
  await writeRelation(projectRoot, {
    id: "rel.billing-retries-requires-idempotency",
    from: "decision.billing-retries",
    predicate: "requires",
    to: "constraint.webhook-idempotency",
    status: "active"
  });
  await writeProjectFile(projectRoot, ".aictx/events.jsonl", "");

  return projectRoot;
}

async function writeMemoryObject(
  projectRoot: string,
  fixture: {
    id: ObjectId;
    type: ObjectType;
    status: ObjectStatus;
    title: string;
    bodyPath: string;
    body: string;
  }
): Promise<void> {
  const sidecarWithoutHash = {
    id: fixture.id,
    type: fixture.type,
    status: fixture.status,
    title: fixture.title,
    body_path: fixture.bodyPath,
    scope: {
      kind: "project",
      project: projectId,
      branch: null,
      task: null
    },
    tags: [],
    created_at: FIXED_TIMESTAMP,
    updated_at: FIXED_TIMESTAMP
  } satisfies Omit<MemoryObjectSidecar, "content_hash">;
  const sidecar = {
    ...sidecarWithoutHash,
    content_hash: computeObjectContentHash(sidecarWithoutHash, fixture.body)
  } satisfies MemoryObjectSidecar;

  await writeJsonProjectFile(
    projectRoot,
    `.aictx/${fixture.bodyPath.replace(/\.md$/, ".json")}`,
    sidecar
  );
  await writeProjectFile(projectRoot, `.aictx/${fixture.bodyPath}`, fixture.body);
}

async function writeRelation(
  projectRoot: string,
  fixture: {
    id: RelationId;
    from: ObjectId;
    predicate: Predicate;
    to: ObjectId;
    status: "active" | "stale" | "rejected";
  }
): Promise<void> {
  const relationWithoutHash = {
    id: fixture.id,
    from: fixture.from,
    predicate: fixture.predicate,
    to: fixture.to,
    status: fixture.status,
    created_at: FIXED_TIMESTAMP,
    updated_at: FIXED_TIMESTAMP
  } satisfies Omit<MemoryRelation, "content_hash">;
  const relation = {
    ...relationWithoutHash,
    content_hash: computeRelationContentHash(relationWithoutHash)
  } satisfies MemoryRelation;

  await writeJsonProjectFile(
    projectRoot,
    `.aictx/relations/${fixture.id.slice("rel.".length)}.json`,
    relation
  );
}

async function readAictxSnapshot(projectRoot: string): Promise<Record<string, string>> {
  const paths = (
    await fg(".aictx/**", {
      cwd: projectRoot,
      dot: true,
      onlyFiles: true,
      unique: true
    })
  ).sort();
  const snapshot: Record<string, string> = {};

  for (const path of paths) {
    snapshot[path] = await readFile(join(projectRoot, path), "utf8");
  }

  return snapshot;
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

function createGitStatusRunner(stdout: string, trackedFiles = new Set<string>()): SubprocessRunner {
  return async (command, args, options) => {
    expect(command).toBe("git");

    if (args[0] === "status") {
      expect(args).toEqual(["status", "--porcelain=v1", "--", ".aictx"]);
      return subprocessResult(command, args, options, stdout, 0);
    }

    if (args[0] === "ls-files") {
      const file = args.at(-1) ?? "";
      return subprocessResult(command, args, options, "", trackedFiles.has(file) ? 0 : 1);
    }

    throw new Error(`Unexpected git command: ${args.join(" ")}`);
  };
}

function subprocessResult(
  command: string,
  args: readonly string[],
  options: SubprocessRunnerOptions,
  stdout: string,
  exitCode: number
): SubprocessResult {
  return {
    command,
    args,
    cwd: options.cwd ?? null,
    exitCode,
    signal: null,
    stdout,
    stderr: ""
  };
}
