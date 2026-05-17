import { describe, expect, it } from "vitest";

import {
  findGitRoot,
  getMemoryDiff,
  getMemoryDirtyState,
  getMemoryLog,
  getGitState,
  restoreMemoryFromCommit,
  showMemoryFileAtCommit
} from "../../../src/core/git.js";
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

describe("core git wrapper", () => {
  it("returns unavailable root outside Git without failing", async () => {
    const { calls, runner } = createRunner({
      "rev-parse --show-toplevel": result(["rev-parse", "--show-toplevel"], {
        exitCode: 128,
        stderr: "fatal: not a git repository"
      })
    });

    const root = await findGitRoot("/tmp/outside", { runner });
    const state = await getGitState("/tmp/outside", { runner });

    expect(root).toEqual({
      ok: true,
      data: { available: false, root: null },
      warnings: []
    });
    expect(state).toEqual({
      ok: true,
      data: {
        available: false,
        branch: null,
        commit: null,
        dirty: null
      },
      warnings: []
    });
    expect(calls.every((call) => call.command === "git")).toBe(true);
    expect(calls.every((call) => Array.isArray(call.args))).toBe(true);
    expect(calls.map((call) => call.args)).toEqual([
      ["rev-parse", "--show-toplevel"],
      ["rev-parse", "--show-toplevel"]
    ]);
  });

  it("maps detached HEAD to a null branch while keeping commit metadata", async () => {
    const { runner } = createRunner({
      "rev-parse --show-toplevel": result(["rev-parse", "--show-toplevel"], {
        stdout: "/repo\n"
      }),
      "symbolic-ref --short -q HEAD": result(["symbolic-ref", "--short", "-q", "HEAD"], {
        exitCode: 1
      }),
      "rev-parse HEAD": result(["rev-parse", "HEAD"], {
        stdout: "abc123\n"
      }),
      "status --porcelain=v1 -- .memory": result(["status", "--porcelain=v1", "--", ".memory"])
    });

    const state = await getGitState("/repo", { runner });

    expect(state).toEqual({
      ok: true,
      data: {
        available: true,
        branch: null,
        commit: "abc123",
        dirty: false
      },
      warnings: []
    });
  });

  it("parses dirty .memory files and ignores generated/local files", async () => {
    const { runner } = createRunner({
      "status --porcelain=v1 -- .memory": result(["status", "--porcelain=v1", "--", ".memory"], {
        stdout: [
          " M .memory/memory/changed.md",
          "A  .memory/memory/new.md",
          "D  .memory/memory/deleted.md",
          "R  .memory/memory/old.md -> .memory/memory/renamed.md",
          "UU .memory/memory/conflict.md",
          "?? .memory/index/cache.sqlite",
          "?? .memory/context/pack.md",
          "?? .memory/.lock",
          " M src/outside.ts",
          ""
        ].join("\n")
      })
    });

    const dirtyState = await getMemoryDirtyState("/repo", { runner });

    expect(dirtyState).toEqual({
      ok: true,
      data: {
        dirty: true,
        files: [
          ".memory/memory/changed.md",
          ".memory/memory/conflict.md",
          ".memory/memory/deleted.md",
          ".memory/memory/new.md",
          ".memory/memory/renamed.md"
        ],
        unmergedFiles: [".memory/memory/conflict.md"]
      },
      warnings: []
    });
  });

  it("scopes diff, log, and restore helpers to .memory argv pathspecs", async () => {
    const { calls, runner } = createRunner({
      "diff -- .memory": result(["diff", "--", ".memory"], {
        stdout: [
          "diff --git a/.memory/events.jsonl b/.memory/events.jsonl",
          "index 1111111..2222222 100644",
          "--- a/.memory/events.jsonl",
          "+++ b/.memory/events.jsonl",
          ""
        ].join("\n")
      }),
      "status --porcelain=v1 --untracked-files=all -- .memory": result(
        ["status", "--porcelain=v1", "--untracked-files=all", "--", ".memory"]
      ),
      "log --format=%H\u001f%h\u001f%ct\u001f%s -- .memory": result(
        ["log", "--format=%H\u001f%h\u001f%ct\u001f%s", "--", ".memory"],
        {
          stdout: "abcdef\u001fabcdef\u001f1770000000\u001fUpdate memory\n"
        }
      ),
      "restore --source abcdef -- .memory": result(["restore", "--source", "abcdef", "--", ".memory"])
    });

    const diff = await getMemoryDiff("/repo", { runner });
    const log = await getMemoryLog("/repo", { runner });
    const restore = await restoreMemoryFromCommit("/repo", "abcdef", { runner });

    expect(diff.ok).toBe(true);
    if (diff.ok) {
      expect(diff.data.changedFiles).toEqual([".memory/events.jsonl"]);
      expect(diff.data.untrackedFiles).toEqual([]);
    }
    expect(log).toEqual({
      ok: true,
      data: [
        {
          commit: "abcdef",
          shortCommit: "abcdef",
          unixTimestamp: 1770000000,
          subject: "Update memory"
        }
      ],
      warnings: []
    });
    expect(restore.ok).toBe(true);
    expect(calls.map((call) => call.args)).toEqual([
      ["diff", "--", ".memory"],
      ["status", "--porcelain=v1", "--untracked-files=all", "--", ".memory"],
      ["log", "--format=%H\u001f%h\u001f%ct\u001f%s", "--", ".memory"],
      ["restore", "--source", "abcdef", "--", ".memory"]
    ]);
  });

  it("shows only files validated inside .memory", async () => {
    const { calls, runner } = createRunner({
      "show abcdef:.memory/memory/example.md": result(["show", "abcdef:.memory/memory/example.md"], {
        stdout: "# Example\n"
      })
    });

    const shown = await showMemoryFileAtCommit("/repo", "abcdef", "memory/example.md", { runner });
    const rejected = await showMemoryFileAtCommit("/repo", "abcdef", "../outside.md", { runner });

    expect(shown).toEqual({
      ok: true,
      data: {
        commit: "abcdef",
        path: ".memory/memory/example.md",
        contents: "# Example\n"
      },
      warnings: []
    });
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) {
      expect(rejected.error.code).toBe("MemoryValidationFailed");
    }
    expect(calls.map((call) => call.args)).toEqual([["show", "abcdef:.memory/memory/example.md"]]);
  });
});

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
