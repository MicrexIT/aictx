import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { initProject } from "../../../src/app/operations.js";
import { runSubprocess } from "../../../src/core/subprocess.js";
import { computeObjectContentHash } from "../../../src/storage/hashes.js";
import { readCanonicalStorage } from "../../../src/storage/read.js";
import { validateProject } from "../../../src/validation/validate.js";
import { createFixedTestClock, FIXED_TIMESTAMP } from "../../fixtures/time.js";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true }))
  );
});

describe("initProject", () => {
  it("initializes valid storage at the Git worktree root without committing", async () => {
    const repo = await createRepo("billing-api");
    const nested = join(repo, "packages", "app");
    await mkdir(nested, { recursive: true });
    const commitBefore = await git(repo, ["rev-parse", "HEAD"]);

    const result = await initProject({
      cwd: nested,
      clock: createFixedTestClock()
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.meta.project_root).toBe(repo);
    expect(result.meta.aictx_root).toBe(join(repo, ".aictx"));
    expect(result.meta.git.available).toBe(true);
    expect(result.meta.git.branch).toBe("main");
    expect(result.meta.git.commit).toBe(commitBefore.trim());
    expect(result.meta.git.dirty).toBe(true);
    expect(result.data.created).toBe(true);
    expect(result.data.git_available).toBe(true);
    expect(result.data.gitignore_updated).toBe(true);
    expect(result.data.index_built).toBe(true);
    expect(result.data.files_created).toEqual(
      expect.arrayContaining([
        ".aictx/config.json",
        ".aictx/events.jsonl",
        ".aictx/memory/project.md",
        ".aictx/memory/project.json",
        ".aictx/memory/architecture.md",
        ".aictx/memory/architecture.json",
        ".aictx/schema/config.schema.json"
      ])
    );
    expect(await git(repo, ["rev-parse", "HEAD"])).toBe(commitBefore);
    await expect(readFile(join(repo, ".gitignore"), "utf8")).resolves.toContain(
      ".aictx/index/"
    );
    await expect(readFile(join(repo, ".gitignore"), "utf8")).resolves.toContain(
      ".aictx/context/"
    );
    await expect(readFile(join(repo, ".gitignore"), "utf8")).resolves.toContain(".aictx/.lock");

    const validation = await validateProject(repo);
    expect(validation).toEqual({
      valid: true,
      errors: [],
      warnings: []
    });
  });

  it("initializes valid storage outside Git in local mode", async () => {
    const projectRoot = await createTempRoot("aictx-init-local-project-");

    const result = await initProject({
      cwd: projectRoot,
      clock: createFixedTestClock()
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.meta).toEqual({
      project_root: projectRoot,
      aictx_root: join(projectRoot, ".aictx"),
      git: {
        available: false,
        branch: null,
        commit: null,
        dirty: null
      }
    });
    expect(result.data.created).toBe(true);
    expect(result.data.git_available).toBe(false);
    expect(result.data.gitignore_updated).toBe(false);
    expect(result.data.index_built).toBe(true);
    expect(result.data.next_steps.join("\n")).toContain("aictx load");
    expect(result.data.next_steps.join("\n")).toContain("save_memory_patch");
    expect(result.data.next_steps.join("\n")).toContain("aictx diff");

    const validation = await validateProject(projectRoot);
    expect(validation).toEqual({
      valid: true,
      errors: [],
      warnings: []
    });

    const storage = await readCanonicalStorage(projectRoot);
    expect(storage.ok).toBe(true);
    if (storage.ok) {
      expect(storage.data.config.project.id).toMatch(/^project\.aictx-init-local-project-/);
      expect(storage.data.objects.map((object) => object.sidecar.id).sort()).toEqual([
        "architecture.current",
        storage.data.config.project.id
      ].sort());
      expect(storage.data.events).toEqual([]);
      expect(storage.data.objects[0]?.sidecar.created_at).toBe(FIXED_TIMESTAMP);
    }
  });

  it("returns success with a warning when valid storage already exists", async () => {
    const projectRoot = await createTempRoot("aictx-init-rerun-");
    const first = await initProject({
      cwd: projectRoot,
      clock: createFixedTestClock()
    });

    expect(first.ok).toBe(true);

    const second = await initProject({
      cwd: projectRoot,
      clock: createFixedTestClock()
    });

    expect(second.ok).toBe(true);
    if (second.ok) {
      expect(second.data.created).toBe(false);
      expect(second.data.files_created).toEqual([]);
      expect(second.data.index_built).toBe(true);
      expect(second.warnings).toEqual(
        expect.arrayContaining([
          "Aictx is already initialized; existing valid storage was left unchanged."
        ])
      );
    }
  });

  it("returns success when existing storage has branch-scoped memory for the current branch", async () => {
    const repo = await createRepo("branch-scoped");
    const first = await initProject({
      cwd: repo,
      clock: createFixedTestClock()
    });

    expect(first.ok).toBe(true);
    if (!first.ok) {
      return;
    }

    const storage = await readCanonicalStorage(repo);
    expect(storage.ok).toBe(true);
    if (!storage.ok) {
      return;
    }

    await writeBranchScopedMemory(repo, storage.data.config.project.id, "main");

    const second = await initProject({
      cwd: repo,
      clock: createFixedTestClock()
    });

    expect(second.ok).toBe(true);
    if (second.ok) {
      expect(second.data.created).toBe(false);
      expect(second.data.index_built).toBe(true);
      expect(second.warnings).toEqual(
        expect.arrayContaining([
          "Aictx is already initialized; existing valid storage was left unchanged."
        ])
      );
    }
  });

  it("returns AICtxAlreadyInitializedInvalid for invalid existing storage", async () => {
    const projectRoot = await createTempRoot("aictx-init-invalid-");
    await mkdir(join(projectRoot, ".aictx"), { recursive: true });
    await writeFile(join(projectRoot, ".aictx", "config.json"), "{bad json");

    const result = await initProject({
      cwd: projectRoot,
      clock: createFixedTestClock()
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("AICtxAlreadyInitializedInvalid");
      expect(JSON.stringify(result.error.details)).toContain("issues");
    }
  });
});

async function createRepo(name: string): Promise<string> {
  const repo = await createTempRoot(`aictx-init-${name}-`);
  await git(repo, ["init", "--initial-branch=main"]);
  await git(repo, ["config", "user.email", "test@example.com"]);
  await git(repo, ["config", "user.name", "Aictx Test"]);
  await writeFile(join(repo, "README.md"), "# Test\n");
  await git(repo, ["add", "README.md"]);
  await git(repo, ["commit", "-m", "Initial commit"]);
  return repo;
}

async function writeBranchScopedMemory(
  projectRoot: string,
  projectId: string,
  branch: string
): Promise<void> {
  const body = "# Branch note\n\nOnly applies to the current branch.\n";
  const sidecarWithoutHash = {
    id: "note.branch-note",
    type: "note",
    status: "active",
    title: "Branch note",
    body_path: "memory/notes/branch-note.md",
    scope: {
      kind: "branch",
      project: projectId,
      branch,
      task: null
    },
    tags: [],
    source: {
      kind: "agent"
    },
    created_at: FIXED_TIMESTAMP,
    updated_at: FIXED_TIMESTAMP
  };
  const sidecar = {
    ...sidecarWithoutHash,
    content_hash: computeObjectContentHash(sidecarWithoutHash, body)
  };

  await writeProjectFile(projectRoot, ".aictx/memory/notes/branch-note.md", body);
  await writeProjectFile(
    projectRoot,
    ".aictx/memory/notes/branch-note.json",
    stableJson(sidecar)
  );
}

async function createTempRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  const resolvedRoot = await realpath(root);
  tempRoots.push(resolvedRoot);
  return resolvedRoot;
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
