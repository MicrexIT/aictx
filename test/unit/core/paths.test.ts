import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
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
    const sandbox = await createTempRoot("aictx-paths-git-prefers-");
    const gitRoot = join(sandbox, "repo");
    const cwd = join(gitRoot, "packages", "app");
    await mkdir(cwd, { recursive: true });
    await mkdir(join(cwd, ".aictx"), { recursive: true });
    await writeFile(join(cwd, ".aictx", "config.json"), "{}\n");
    await mkdir(join(gitRoot, ".aictx"), { recursive: true });

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
        aictxRoot: join(gitRoot, ".aictx"),
        git: {
          available: true,
          root: gitRoot
        }
      },
      warnings: []
    });
    expect(calls.map((call) => call.args)).toEqual([["rev-parse", "--show-toplevel"]]);
  });

  it("resolves non-Git init to cwd without requiring .aictx", async () => {
    const cwd = await createTempRoot("aictx-paths-init-");
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
        aictxRoot: join(cwd, ".aictx"),
        git: {
          available: false,
          root: null
        }
      },
      warnings: []
    });
  });

  it("walks upward outside Git to the nearest .aictx/config.json", async () => {
    const sandbox = await createTempRoot("aictx-paths-walk-");
    const projectRoot = join(sandbox, "project");
    const nested = join(projectRoot, "src", "feature");
    await mkdir(join(projectRoot, ".aictx"), { recursive: true });
    await mkdir(nested, { recursive: true });
    await writeFile(join(projectRoot, ".aictx", "config.json"), "{}\n");

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
        aictxRoot: join(projectRoot, ".aictx"),
        git: {
          available: false,
          root: null
        }
      },
      warnings: []
    });
  });

  it("returns not initialized for non-init resolution when .aictx is missing", async () => {
    const cwd = await createTempRoot("aictx-paths-missing-");
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
      expect(resolved.error.code).toBe("AICtxNotInitialized");
    }
  });

  it("propagates Git operation failures from the Git wrapper", async () => {
    const cwd = await createTempRoot("aictx-paths-git-failure-");

    const resolved = await resolveProjectPaths({
      cwd,
      mode: "init",
      runner: async () => {
        throw new Error("git executable failed");
      }
    });

    expect(resolved.ok).toBe(false);
    if (!resolved.ok) {
      expect(resolved.error.code).toBe("AICtxGitOperationFailed");
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
