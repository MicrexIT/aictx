import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { resolveProjectPaths } from "../../../src/core/paths.js";
import type {
  SubprocessResult,
  SubprocessRunner,
  SubprocessRunnerOptions
} from "../../../src/core/subprocess.js";

interface SubprocessCall {
  command: string;
  args: readonly string[];
  options: SubprocessRunnerOptions;
}

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("project path resolution", () => {
  it("prefers a Git worktree root over nearby non-Git config files", async () => {
    const sandbox = await createTempRoot("memory-paths-git-prefers-");
    const gitRoot = join(sandbox, "repo");
    const cwd = join(gitRoot, "packages", "app");
    await mkdir(cwd, { recursive: true });
    await mkdir(join(cwd, ".memory"), { recursive: true });
    await writeFile(join(cwd, ".memory", "config.json"), "{}\n");
    await mkdir(join(gitRoot, ".memory"), { recursive: true });

    const { calls, runner } = createRunner({
      "rev-parse --show-toplevel": result(["rev-parse", "--show-toplevel"], {
        stdout: `${gitRoot}\n`
      })
    });

    const resolved = await resolveProjectPaths({
      cwd,
      mode: "require-initialized",
      runner
    });

    expect(resolved).toEqual({
      ok: true,
      data: {
        projectRoot: gitRoot,
        memoryRoot: join(gitRoot, ".memory"),
        git: {
          available: true,
          root: gitRoot
        }
      },
      warnings: []
    });
    expect(calls.map((call) => call.args)).toEqual([["rev-parse", "--show-toplevel"]]);
  });

  it("resolves non-Git init to cwd without requiring .memory", async () => {
    const cwd = await createTempRoot("memory-paths-init-");
    const { runner } = createRunner({
      "rev-parse --show-toplevel": result(["rev-parse", "--show-toplevel"], {
        exitCode: 128,
        stderr: "fatal: not a git repository"
      })
    });

    const resolved = await resolveProjectPaths({
      cwd,
      mode: "init",
      runner
    });

    expect(resolved).toEqual({
      ok: true,
      data: {
        projectRoot: cwd,
        memoryRoot: join(cwd, ".memory"),
        git: {
          available: false,
          root: null
        }
      },
      warnings: []
    });
  });

  it("walks upward outside Git to the nearest .memory/config.json", async () => {
    const sandbox = await createTempRoot("memory-paths-walk-");
    const projectRoot = join(sandbox, "project");
    const nested = join(projectRoot, "src", "feature");
    await mkdir(join(projectRoot, ".memory"), { recursive: true });
    await mkdir(nested, { recursive: true });
    await writeFile(join(projectRoot, ".memory", "config.json"), "{}\n");

    const { runner } = createRunner({
      "rev-parse --show-toplevel": result(["rev-parse", "--show-toplevel"], {
        exitCode: 128,
        stderr: "fatal: not a git repository"
      })
    });

    const resolved = await resolveProjectPaths({
      cwd: nested,
      mode: "require-initialized",
      runner
    });

    expect(resolved).toEqual({
      ok: true,
      data: {
        projectRoot,
        memoryRoot: join(projectRoot, ".memory"),
        git: {
          available: false,
          root: null
        }
      },
      warnings: []
    });
  });

  it("migrates legacy .aictx storage to .memory while walking outside Git", async () => {
    const sandbox = await createTempRoot("memory-paths-legacy-");
    const projectRoot = join(sandbox, "project");
    const nested = join(projectRoot, "src", "feature");
    await mkdir(join(projectRoot, ".aictx"), { recursive: true });
    await mkdir(nested, { recursive: true });
    await writeFile(join(projectRoot, ".aictx", "config.json"), "{}\n");
    await writeFile(
      join(projectRoot, ".gitignore"),
      [".aictx/index/", ".aictx/context/", ".aictx/exports/", ".aictx/recovery/", ".aictx/.backup/", ".aictx/.lock", ""].join("\n")
    );

    const { runner } = createRunner({
      "rev-parse --show-toplevel": result(["rev-parse", "--show-toplevel"], {
        exitCode: 128,
        stderr: "fatal: not a git repository"
      })
    });

    const resolved = await resolveProjectPaths({
      cwd: nested,
      mode: "require-initialized",
      runner
    });

    expect(resolved.ok).toBe(true);
    if (resolved.ok) {
      expect(resolved.data.memoryRoot).toBe(join(projectRoot, ".memory"));
    }
    await expect(access(join(projectRoot, ".memory", "config.json"))).resolves.toBeUndefined();
    await expect(access(join(projectRoot, ".aictx"))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(readFile(join(projectRoot, ".gitignore"), "utf8")).resolves.toBe(
      [".memory/index/", ".memory/context/", ".memory/exports/", ".memory/recovery/", ".memory/.backup/", ".memory/.lock", ""].join("\n")
    );
  });

  it("refuses to resolve when legacy and current storage both exist", async () => {
    const projectRoot = await createTempRoot("memory-paths-conflict-");
    await mkdir(join(projectRoot, ".memory"), { recursive: true });
    await mkdir(join(projectRoot, ".aictx"), { recursive: true });
    await writeFile(join(projectRoot, ".memory", "config.json"), "{}\n");
    await writeFile(join(projectRoot, ".aictx", "config.json"), "{}\n");
    const { runner } = createRunner({
      "rev-parse --show-toplevel": result(["rev-parse", "--show-toplevel"], {
        exitCode: 128,
        stderr: "fatal: not a git repository"
      })
    });

    const resolved = await resolveProjectPaths({
      cwd: projectRoot,
      mode: "require-initialized",
      runner
    });

    expect(resolved.ok).toBe(false);
    if (!resolved.ok) {
      expect(resolved.error.code).toBe("MemoryValidationFailed");
      expect(resolved.error.message).toContain("Both .aictx and .memory storage exist");
    }
  });

  it("refuses to migrate locked legacy storage", async () => {
    const projectRoot = await createTempRoot("memory-paths-locked-");
    await mkdir(join(projectRoot, ".aictx"), { recursive: true });
    await writeFile(join(projectRoot, ".aictx", "config.json"), "{}\n");
    await writeFile(join(projectRoot, ".aictx", ".lock"), "");
    const { runner } = createRunner({
      "rev-parse --show-toplevel": result(["rev-parse", "--show-toplevel"], {
        exitCode: 128,
        stderr: "fatal: not a git repository"
      })
    });

    const resolved = await resolveProjectPaths({
      cwd: projectRoot,
      mode: "require-initialized",
      runner
    });

    expect(resolved.ok).toBe(false);
    if (!resolved.ok) {
      expect(resolved.error.code).toBe("MemoryLockBusy");
      expect(resolved.error.message).toContain("Legacy .aictx storage appears locked");
    }
  });

  it("returns not initialized for non-init resolution when .memory is missing", async () => {
    const cwd = await createTempRoot("memory-paths-missing-");
    const { runner } = createRunner({
      "rev-parse --show-toplevel": result(["rev-parse", "--show-toplevel"], {
        exitCode: 128,
        stderr: "fatal: not a git repository"
      })
    });

    const resolved = await resolveProjectPaths({
      cwd,
      mode: "require-initialized",
      runner
    });

    expect(resolved.ok).toBe(false);
    if (!resolved.ok) {
      expect(resolved.error.code).toBe("MemoryNotInitialized");
    }
  });

  it("propagates Git operation failures from the Git wrapper", async () => {
    const cwd = await createTempRoot("memory-paths-git-failure-");

    const resolved = await resolveProjectPaths({
      cwd,
      mode: "init",
      runner: async () => {
        throw new Error("git executable failed");
      }
    });

    expect(resolved.ok).toBe(false);
    if (!resolved.ok) {
      expect(resolved.error.code).toBe("MemoryGitOperationFailed");
    }
  });
});

async function createTempRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  tempRoots.push(root);
  return root;
}

function createRunner(responses: Record<string, SubprocessResult>): {
  calls: SubprocessCall[];
  runner: SubprocessRunner;
} {
  const calls: SubprocessCall[] = [];

  return {
    calls,
    runner: async (command, args, options) => {
      calls.push({ command, args, options });
      const response = responses[args.join(" ")];

      if (response === undefined) {
        throw new Error(`Unexpected subprocess call: ${command} ${args.join(" ")}`);
      }

      return response;
    }
  };
}

function result(
  args: readonly string[],
  overrides: Partial<Omit<SubprocessResult, "command" | "args" | "cwd">> = {}
): SubprocessResult {
  return {
    command: "git",
    args,
    cwd: "/repo",
    exitCode: 0,
    signal: null,
    stdout: "",
    stderr: "",
    ...overrides
  };
}
