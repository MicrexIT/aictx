import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  findGitRoot,
  getAictxDiff,
  getAictxDirtyState,
  getGitState
} from "../../../src/core/git.js";
import { runSubprocess } from "../../../src/core/subprocess.js";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("native Git wrapper integration", () => {
  it("reports unavailable outside Git without failing", async () => {
    const root = await createTempRoot("aictx-git-outside-");

    const gitRoot = await findGitRoot(root);
    const gitState = await getGitState(root);

    expect(gitRoot).toEqual({
      ok: true,
      data: { available: false, root: null },
      warnings: []
    });
    expect(gitState).toEqual({
      ok: true,
      data: {
        available: false,
        branch: null,
        commit: null,
        dirty: null
      },
      warnings: []
    });
  });

  it("reports branch and commit metadata in a Git worktree", async () => {
    const repo = await createRepo();

    const state = await getGitState(repo);

    expect(state.ok).toBe(true);
    if (state.ok) {
      expect(state.data.available).toBe(true);
      expect(state.data.branch).toBe("main");
      expect(state.data.commit).toMatch(/^[0-9a-f]{40}$/);
      expect(state.data.dirty).toBe(false);
    }
  });

  it("reports detached HEAD with a null branch", async () => {
    const repo = await createRepo();
    const commit = await git(repo, ["rev-parse", "HEAD"]);
    await git(repo, ["checkout", "--detach", commit.trim()]);

    const state = await getGitState(repo);

    expect(state.ok).toBe(true);
    if (state.ok) {
      expect(state.data.available).toBe(true);
      expect(state.data.branch).toBeNull();
      expect(state.data.commit).toBe(commit.trim());
    }
  });

  it("ignores generated/local .aictx dirty paths", async () => {
    const repo = await createRepo();
    await mkdir(join(repo, ".aictx", "index"), { recursive: true });
    await mkdir(join(repo, ".aictx", "context"), { recursive: true });
    await writeFile(join(repo, ".aictx", "index", "cache.sqlite"), "cache");
    await writeFile(join(repo, ".aictx", "context", "pack.md"), "pack");
    await writeFile(join(repo, ".aictx", ".lock"), "lock");

    const generatedOnly = await getAictxDirtyState(repo);
    await writeFile(join(repo, ".aictx", "events.jsonl"), "{}\n");
    const canonicalDirty = await getAictxDirtyState(repo);

    expect(generatedOnly).toEqual({
      ok: true,
      data: {
        dirty: false,
        files: [],
        unmergedFiles: []
      },
      warnings: []
    });
    expect(canonicalDirty.ok).toBe(true);
    if (canonicalDirty.ok) {
      expect(canonicalDirty.data.dirty).toBe(true);
      expect(canonicalDirty.data.files).toEqual([".aictx/events.jsonl"]);
    }
  });

  it("returns diffs scoped only to .aictx", async () => {
    const repo = await createRepo();
    await writeFile(join(repo, ".aictx", "config.json"), "{\"changed\":true}\n");
    await writeFile(join(repo, "src.ts"), "changed\n");

    const diff = await getAictxDiff(repo);

    expect(diff.ok).toBe(true);
    if (diff.ok) {
      expect(diff.data.diff).toContain(".aictx/config.json");
      expect(diff.data.diff).not.toContain("src.ts");
      expect(diff.data.changedFiles).toEqual([".aictx/config.json"]);
    }
  });
});

async function createRepo(): Promise<string> {
  const repo = await createTempRoot("aictx-git-repo-");
  await git(repo, ["init", "--initial-branch=main"]);
  await git(repo, ["config", "user.email", "test@example.com"]);
  await git(repo, ["config", "user.name", "Aictx Test"]);
  await mkdir(join(repo, ".aictx"), { recursive: true });
  await writeFile(join(repo, ".aictx", "config.json"), "{}\n");
  await writeFile(join(repo, "src.ts"), "initial\n");
  await git(repo, ["add", "."]);
  await git(repo, ["commit", "-m", "Initial commit"]);
  return repo;
}

async function createTempRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  tempRoots.push(root);
  return root;
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
        result.data.stderr,
        await readFileFallback(cwd)
      ].join("\n")
    );
  }

  return result.data.stdout;
}

async function readFileFallback(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return "";
  }
}
