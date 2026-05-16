import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { resolveProjectPaths } from "../../../src/core/paths.js";
import { runSubprocess } from "../../../src/core/subprocess.js";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("project path resolution integration", () => {
  it("resolves nested cwd inside a Git repo to the worktree root", async () => {
    const repo = await createRepo();
    const nested = join(repo, "packages", "app");
    await mkdir(nested, { recursive: true });

    const resolved = await resolveProjectPaths({
      cwd: nested,
      mode: "require-initialized"
    });

    expect(resolved).toEqual({
      ok: true,
      data: {
        projectRoot: repo,
        memoryRoot: join(repo, ".memory"),
        git: {
          available: true,
          root: repo
        }
      },
      warnings: []
    });
  });

  it("resolves nested cwd outside Git by walking to the nearest .memory/config.json", async () => {
    const sandbox = await createTempRoot("memory-paths-nongit-");
    const outer = join(sandbox, "outer");
    const inner = join(outer, "inner");
    const nested = join(inner, "src", "feature");
    await mkdir(join(outer, ".memory"), { recursive: true });
    await mkdir(join(inner, ".memory"), { recursive: true });
    await mkdir(nested, { recursive: true });
    await writeFile(join(outer, ".memory", "config.json"), "{}\n");
    await writeFile(join(inner, ".memory", "config.json"), "{}\n");

    const resolved = await resolveProjectPaths({
      cwd: nested,
      mode: "require-initialized"
    });

    expect(resolved).toEqual({
      ok: true,
      data: {
        projectRoot: inner,
        memoryRoot: join(inner, ".memory"),
        git: {
          available: false,
          root: null
        }
      },
      warnings: []
    });
  });

  it("resolves non-Git init from a nested cwd to that cwd", async () => {
    const sandbox = await createTempRoot("memory-paths-init-");
    const nested = join(sandbox, "new-project", "nested");
    await mkdir(nested, { recursive: true });

    const resolved = await resolveProjectPaths({
      cwd: nested,
      mode: "init"
    });

    expect(resolved).toEqual({
      ok: true,
      data: {
        projectRoot: nested,
        memoryRoot: join(nested, ".memory"),
        git: {
          available: false,
          root: null
        }
      },
      warnings: []
    });
  });

  it("fails non-init outside Git when no .memory/config.json is present", async () => {
    const cwd = await createTempRoot("memory-paths-missing-");

    const resolved = await resolveProjectPaths({
      cwd,
      mode: "require-initialized"
    });

    expect(resolved.ok).toBe(false);
    if (!resolved.ok) {
      expect(resolved.error.code).toBe("MemoryNotInitialized");
    }
  });
});

async function createRepo(): Promise<string> {
  const repo = await createTempRoot("memory-paths-repo-");
  await git(repo, ["init", "--initial-branch=main"]);
  await git(repo, ["config", "user.email", "test@example.com"]);
  await git(repo, ["config", "user.name", "Memory Test"]);
  await mkdir(join(repo, ".memory"), { recursive: true });
  await writeFile(join(repo, ".memory", "config.json"), "{}\n");
  await writeFile(join(repo, "README.md"), "# Test\n");
  await git(repo, ["add", "."]);
  await git(repo, ["commit", "-m", "Initial commit"]);
  return repo;
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
