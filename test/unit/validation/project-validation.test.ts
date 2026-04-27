import { copyFile, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  computeObjectContentHash,
  computeRelationContentHash
} from "../../../src/storage/hashes.js";
import { SCHEMA_FILES } from "../../../src/validation/schemas.js";
import { validateProject } from "../../../src/validation/validate.js";

const root = process.cwd();
const tempRoots: string[] = [];
const timestamp = "2026-04-25T14:00:00+02:00";

const validConfig = {
  version: 1,
  project: {
    id: "project.billing-api",
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
  await Promise.all(
    tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true }))
  );
});

describe("project validation", () => {
  it("accepts an initialized sample .aictx directory", async () => {
    const projectRoot = await createValidProject();

    const result = await validateProject(projectRoot);

    expect(result).toEqual({
      valid: true,
      errors: [],
      warnings: []
    });
  });

  it("reports missing required canonical files and directories", async () => {
    const projectRoot = await mkdirTempRoot();
    await mkdir(join(projectRoot, ".aictx"), { recursive: true });

    const result = await validateProject(projectRoot);

    expect(issueCodes(result.errors)).toEqual(
      expect.arrayContaining(["CanonicalFileMissing", "CanonicalDirectoryMissing"])
    );
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        code: "CanonicalFileMissing",
        path: ".aictx/config.json",
        field: null
      })
    );
  });

  it("reports invalid JSON and blank or malformed JSONL with line numbers", async () => {
    const projectRoot = await createValidProject();
    await writeProjectFile(projectRoot, ".aictx/memory/decisions/billing-retries.json", "{bad json");
    await writeProjectFile(
      projectRoot,
      ".aictx/events.jsonl",
      [
        '{"event":"memory.created","id":"decision.billing-retries","actor":"agent","timestamp":"2026-04-25T14:00:00+02:00"}',
        "",
        "{bad json"
      ].join("\n")
    );

    const result = await validateProject(projectRoot);

    expect(result.errors).toContainEqual(
      expect.objectContaining({
        code: "JsonInvalid",
        path: ".aictx/memory/decisions/billing-retries.json",
        field: null
      })
    );
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        code: "EventJsonlBlankLine",
        path: ".aictx/events.jsonl:2",
        field: null
      })
    );
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        code: "EventJsonlInvalid",
        path: ".aictx/events.jsonl:3",
        field: null
      })
    );
  });

  it("detects duplicate object and relation identifiers", async () => {
    const projectRoot = await createValidProject();
    await writeMemoryObject(projectRoot, {
      path: "memory/notes/duplicate.md",
      id: "decision.billing-retries",
      type: "decision",
      title: "Duplicate billing retries",
      body: "# Duplicate billing retries\n\nDuplicate.\n"
    });
    await writeRelation(projectRoot, {
      file: "duplicate-id.json",
      id: "rel.billing-retries-requires-idempotency",
      from: "decision.billing-retries",
      predicate: "mentions",
      to: "constraint.webhook-idempotency"
    });

    const result = await validateProject(projectRoot);

    expect(issueCodes(result.errors)).toEqual(
      expect.arrayContaining(["ObjectIdDuplicate", "RelationIdDuplicate"])
    );
  });

  it("detects duplicate equivalent relations and missing endpoints", async () => {
    const projectRoot = await createValidProject();
    await writeRelation(projectRoot, {
      file: "duplicate-equivalent.json",
      id: "rel.duplicate-equivalent",
      from: "decision.billing-retries",
      predicate: "requires",
      to: "constraint.webhook-idempotency"
    });
    await writeRelation(projectRoot, {
      file: "missing-endpoint.json",
      id: "rel.missing-endpoint",
      from: "decision.missing",
      predicate: "mentions",
      to: "constraint.webhook-idempotency"
    });

    const result = await validateProject(projectRoot);

    expect(issueCodes(result.errors)).toEqual(
      expect.arrayContaining(["RelationEquivalentDuplicate", "RelationEndpointMissing"])
    );
  });

  it("detects missing, escaping, and mismatched body paths", async () => {
    const projectRoot = await createValidProject();
    await writeObjectSidecar(projectRoot, ".aictx/memory/decisions/billing-retries.json", {
      ...baseObject(
        "decision.billing-retries",
        "decision",
        "Billing retries moved to queue worker",
        "memory/decisions/missing.md"
      ),
      content_hash: `sha256:${"0".repeat(64)}`
    });
    await writeMemoryObject(projectRoot, {
      path: "memory/notes/escaping.md",
      id: "note.escaping",
      type: "note",
      title: "Escaping",
      bodyPath: "memory/../../outside.md",
      body: "# Escaping\n\nBad path.\n"
    });
    await writeMemoryObject(projectRoot, {
      path: "memory/notes/body.md",
      id: "note.mismatch",
      type: "note",
      title: "Mismatch",
      bodyPath: "memory/notes/not-body.md",
      body: "# Mismatch\n\nDifferent basename.\n"
    });

    const result = await validateProject(projectRoot);

    expect(issueCodes(result.errors)).toEqual(
      expect.arrayContaining([
        "ObjectBodyMissing",
        "ObjectBodyPathEscapesAictx",
        "ObjectBodyPathMismatch"
      ])
    );
  });

  it("warns for title, object hash, relation hash, related_to, and superseded issues", async () => {
    const projectRoot = await createValidProject();
    await writeMemoryObject(projectRoot, {
      path: "memory/notes/mismatched-title.md",
      id: "note.mismatched-title",
      type: "note",
      title: "JSON title",
      body: "# Markdown title\n\nBody.\n"
    });
    await writeMemoryObject(projectRoot, {
      path: "memory/notes/bad-hash.md",
      id: "note.bad-hash",
      type: "note",
      title: "Bad hash",
      body: "# Bad hash\n\nBody.\n",
      contentHash: `sha256:${"1".repeat(64)}`
    });
    await writeMemoryObject(projectRoot, {
      path: "memory/notes/superseded.md",
      id: "note.superseded",
      type: "note",
      title: "Superseded",
      body: "# Superseded\n\nBody.\n",
      status: "superseded"
    });
    await writeRelation(projectRoot, {
      file: "bad-hash.json",
      id: "rel.bad-hash",
      from: "decision.billing-retries",
      predicate: "mentions",
      to: "constraint.webhook-idempotency",
      contentHash: `sha256:${"2".repeat(64)}`
    });
    await writeRelatedToFixtures(projectRoot);

    const result = await validateProject(projectRoot);

    expect(result.errors).toEqual([]);
    expect(issueCodes(result.warnings)).toEqual(
      expect.arrayContaining([
        "ObjectTitleH1Mismatch",
        "ObjectContentHashMismatch",
        "RelationContentHashMismatch",
        "RelationRelatedToExcessive",
        "ObjectSupersededReplacementMissing"
      ])
    );
  });

  it("uses the supersedes relation target as the superseded object replacement", async () => {
    const validDirectionRoot = await createValidProject();
    await writeMemoryObject(validDirectionRoot, {
      path: "memory/notes/old.md",
      id: "note.old",
      type: "note",
      title: "Old note",
      body: "# Old note\n\nOld body.\n",
      status: "superseded"
    });
    await writeMemoryObject(validDirectionRoot, {
      path: "memory/notes/new.md",
      id: "note.new",
      type: "note",
      title: "New note",
      body: "# New note\n\nNew body.\n"
    });
    await writeRelation(validDirectionRoot, {
      file: "new-supersedes-old.json",
      id: "rel.new-supersedes-old",
      from: "note.new",
      predicate: "supersedes",
      to: "note.old"
    });

    const validDirection = await validateProject(validDirectionRoot);

    expect(validDirection.warnings).not.toContainEqual(
      expect.objectContaining({
        code: "ObjectSupersededReplacementMissing",
        path: ".aictx/memory/notes/old.json"
      })
    );

    const reversedDirectionRoot = await createValidProject();
    await writeMemoryObject(reversedDirectionRoot, {
      path: "memory/notes/old.md",
      id: "note.old",
      type: "note",
      title: "Old note",
      body: "# Old note\n\nOld body.\n",
      status: "superseded"
    });
    await writeMemoryObject(reversedDirectionRoot, {
      path: "memory/notes/new.md",
      id: "note.new",
      type: "note",
      title: "New note",
      body: "# New note\n\nNew body.\n"
    });
    await writeRelation(reversedDirectionRoot, {
      file: "old-supersedes-new.json",
      id: "rel.old-supersedes-new",
      from: "note.old",
      predicate: "supersedes",
      to: "note.new"
    });

    const reversedDirection = await validateProject(reversedDirectionRoot);

    expect(reversedDirection.warnings).toContainEqual(
      expect.objectContaining({
        code: "ObjectSupersededReplacementMissing",
        path: ".aictx/memory/notes/old.json"
      })
    );
  });

  it("validates object scope against project and Git state", async () => {
    const projectRoot = await createValidProject();
    await writeMemoryObject(projectRoot, {
      path: "memory/notes/wrong-project.md",
      id: "note.wrong-project",
      type: "note",
      title: "Wrong project",
      body: "# Wrong project\n\nBody.\n",
      scope: {
        kind: "project",
        project: "project.other",
        branch: null,
        task: null
      }
    });
    await writeMemoryObject(projectRoot, {
      path: "memory/notes/branch-scope.md",
      id: "note.branch-scope",
      type: "note",
      title: "Branch scope",
      body: "# Branch scope\n\nBody.\n",
      scope: {
        kind: "branch",
        project: "project.billing-api",
        branch: "feature",
        task: null
      }
    });
    await writeMemoryObject(projectRoot, {
      path: "memory/notes/task-scope.md",
      id: "note.task-scope",
      type: "note",
      title: "Task scope",
      body: "# Task scope\n\nBody.\n",
      scope: {
        kind: "task",
        project: "project.billing-api",
        branch: null,
        task: null
      }
    });

    const result = await validateProject(projectRoot);

    expect(issueCodes(result.errors)).toEqual(
      expect.arrayContaining([
        "ObjectScopeProjectMismatch",
        "ObjectBranchScopeUnavailable",
        "ObjectScopeInvalid"
      ])
    );
  });

  it("surfaces conflict markers and block or warn secret findings", async () => {
    const projectRoot = await createValidProject();
    await writeProjectFile(
      projectRoot,
      ".aictx/memory/notes/conflict.md",
      ["# Conflict", "<<<<<<< HEAD"].join("\n")
    );
    await writeMemoryObject(projectRoot, {
      path: "memory/notes/block-secret.md",
      id: "note.block-secret",
      type: "note",
      title: "Block secret",
      body: `# Block secret\n\nsk-${"a".repeat(20)}\n`
    });
    await writeMemoryObject(projectRoot, {
      path: "memory/notes/warn-secret.md",
      id: "note.warn-secret",
      type: "note",
      title: "Warn secret",
      body: `# Warn secret\n\nAuthorization: Bearer ${"a".repeat(20)}\n`
    });

    const result = await validateProject(projectRoot);

    expect(issueCodes(result.errors)).toEqual(
      expect.arrayContaining(["AICtxConflictDetected", "AICtxSecretDetected"])
    );
    expect(issueCodes(result.warnings)).toContain("AICtxSecretWarning");
  });

  it("rejects symlinked Markdown bodies without reporting them as missing", async () => {
    const projectRoot = await createValidProject();
    const sidecarPath = ".aictx/memory/decisions/billing-retries.json";
    const bodyPath = join(projectRoot, ".aictx/memory/decisions/billing-retries.md");
    const outsidePath = join(projectRoot, "outside.md");
    await writeFile(outsidePath, "# Outside\n\nOutside body.\n", "utf8");
    await rm(bodyPath);
    await symlink(outsidePath, bodyPath);

    const result = await validateProject(projectRoot);

    expect(result.errors).toContainEqual(
      expect.objectContaining({
        code: "ObjectBodyPathUnsafe",
        path: ".aictx/memory/decisions/billing-retries.md"
      })
    );
    expect(result.errors).not.toContainEqual(
      expect.objectContaining({
        code: "ObjectBodyMissing",
        path: sidecarPath
      })
    );
  });
});

async function createValidProject(): Promise<string> {
  const projectRoot = await mkdirTempRoot();
  await mkdir(join(projectRoot, ".aictx", "schema"), { recursive: true });
  await mkdir(join(projectRoot, ".aictx", "relations"), { recursive: true });

  for (const file of Object.values(SCHEMA_FILES)) {
    await copyFile(
      join(root, "src", "schemas", file),
      join(projectRoot, ".aictx", "schema", file)
    );
  }

  await writeProjectFile(projectRoot, ".aictx/config.json", stableJson(validConfig));
  await writeMemoryObject(projectRoot, {
    path: "memory/decisions/billing-retries.md",
    id: "decision.billing-retries",
    type: "decision",
    title: "Billing retries moved to queue worker",
    body: "# Billing retries moved to queue worker\n\nRetries run in the worker.\n"
  });
  await writeMemoryObject(projectRoot, {
    path: "memory/constraints/webhook-idempotency.md",
    id: "constraint.webhook-idempotency",
    type: "constraint",
    title: "Webhook idempotency",
    body: "# Webhook idempotency\n\nWebhook processing is idempotent.\n"
  });
  await writeRelation(projectRoot, {
    file: "billing-retries-requires-idempotency.json",
    id: "rel.billing-retries-requires-idempotency",
    from: "decision.billing-retries",
    predicate: "requires",
    to: "constraint.webhook-idempotency"
  });
  await writeProjectFile(
    projectRoot,
    ".aictx/events.jsonl",
    `${JSON.stringify({
      event: "memory.created",
      id: "decision.billing-retries",
      actor: "agent",
      timestamp
    })}\n`
  );

  return projectRoot;
}

async function writeRelatedToFixtures(projectRoot: string): Promise<void> {
  const ids = ["one", "two", "three", "four", "five", "six"];

  for (const id of ids) {
    await writeMemoryObject(projectRoot, {
      path: `memory/notes/${id}.md`,
      id: `note.${id}`,
      type: "note",
      title: `Note ${id}`,
      body: `# Note ${id}\n\nBody.\n`
    });
  }

  for (let index = 1; index < ids.length; index += 1) {
    await writeRelation(projectRoot, {
      file: `related-${ids[index]}.json`,
      id: `rel.related-${ids[index]}`,
      from: "note.one",
      predicate: "related_to",
      to: `note.${ids[index]}`
    });
  }
}

async function writeMemoryObject(
  projectRoot: string,
  options: {
    path: string;
    id: string;
    type: string;
    title: string;
    body: string;
    bodyPath?: string;
    status?: string;
    scope?: Record<string, unknown>;
    contentHash?: string;
  }
): Promise<void> {
  const bodyPath = options.bodyPath ?? options.path;
  const sidecar = baseObject(options.id, options.type, options.title, bodyPath);
  sidecar.status = options.status ?? "active";
  sidecar.scope =
    options.scope ??
    {
      kind: "project",
      project: "project.billing-api",
      branch: null,
      task: null
    };

  const sidecarWithHash = {
    ...sidecar,
    content_hash: options.contentHash ?? computeObjectContentHash(sidecar, options.body)
  };

  await writeProjectFile(projectRoot, `.aictx/${options.path}`, options.body);
  await writeObjectSidecar(
    projectRoot,
    `.aictx/${options.path.replace(/\.md$/, ".json")}`,
    sidecarWithHash
  );
}

async function writeRelation(
  projectRoot: string,
  options: {
    file: string;
    id: string;
    from: string;
    predicate: string;
    to: string;
    contentHash?: string;
  }
): Promise<void> {
  const relation = {
    id: options.id,
    from: options.from,
    predicate: options.predicate,
    to: options.to,
    status: "active",
    created_at: timestamp,
    updated_at: timestamp
  };
  const relationWithHash = {
    ...relation,
    content_hash: options.contentHash ?? computeRelationContentHash(relation)
  };

  await writeProjectFile(
    projectRoot,
    `.aictx/relations/${options.file}`,
    stableJson(relationWithHash)
  );
}

function baseObject(
  id: string,
  type: string,
  title: string,
  bodyPath: string
): Record<string, unknown> {
  return {
    id,
    type,
    status: "active",
    title,
    body_path: bodyPath,
    scope: {
      kind: "project",
      project: "project.billing-api",
      branch: null,
      task: null
    },
    tags: [],
    source: {
      kind: "agent"
    },
    superseded_by: null,
    created_at: timestamp,
    updated_at: timestamp
  };
}

async function writeObjectSidecar(
  projectRoot: string,
  path: string,
  value: Record<string, unknown>
): Promise<void> {
  await writeProjectFile(projectRoot, path, stableJson(value));
}

async function mkdirTempRoot(): Promise<string> {
  const projectRoot = await mkdtemp(join(tmpdir(), "aictx-project-validation-"));
  tempRoots.push(projectRoot);
  return projectRoot;
}

async function writeProjectFile(
  projectRoot: string,
  path: string,
  contents: string
): Promise<void> {
  const absolutePath = join(projectRoot, path);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, contents, "utf8");
}

function stableJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function issueCodes(issues: readonly { code: string }[]): string[] {
  return issues.map((issue) => issue.code);
}
