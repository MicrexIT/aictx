import { describe, expect, it } from "vitest";

import {
  findGitRoot,
  getAictxDiff,
  getAictxDirtyState,
  getAictxLog,
  getGitState,
  restoreAictxFromCommit,
  showAictxFileAtCommit
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
      "status --porcelain=v1 -- .aictx": result(["status", "--porcelain=v1", "--", ".aictx"])
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

  it("parses dirty .aictx files and ignores generated/local files", async () => {
    const { runner } = createRunner({
      "status --porcelain=v1 -- .aictx": result(["status", "--porcelain=v1", "--", ".aictx"], {
        stdout: [
          " M .aictx/memory/changed.md",
          "A  .aictx/memory/new.md",
          "D  .aictx/memory/deleted.md",
          "R  .aictx/memory/old.md -> .aictx/memory/renamed.md",
          "UU .aictx/memory/conflict.md",
          "?? .aictx/index/cache.sqlite",
          "?? .aictx/context/pack.md",
          "?? .aictx/.lock",
          " M src/outside.ts",
          ""
        ].join("\n")
      })
    });

    const dirtyState = await getAictxDirtyState("/repo", { runner });

    expect(dirtyState).toEqual({
      ok: true,
      data: {
        dirty: true,
        files: [
          ".aictx/memory/changed.md",
          ".aictx/memory/conflict.md",
          ".aictx/memory/deleted.md",
          ".aictx/memory/new.md",
          ".aictx/memory/renamed.md"
        ],
        unmergedFiles: [".aictx/memory/conflict.md"]
      },
      warnings: []
    });
  });

  it("scopes diff, log, and restore helpers to .aictx argv pathspecs", async () => {
    const { calls, runner } = createRunner({
      "diff -- .aictx": result(["diff", "--", ".aictx"], {
        stdout: [
          "diff --git a/.aictx/events.jsonl b/.aictx/events.jsonl",
          "index 1111111..2222222 100644",
          "--- a/.aictx/events.jsonl",
          "+++ b/.aictx/events.jsonl",
          ""
        ].join("\n")
      }),
      "log --format=%H\u001f%h\u001f%ct\u001f%s -- .aictx": result(
        ["log", "--format=%H\u001f%h\u001f%ct\u001f%s", "--", ".aictx"],
        {
          stdout: "abcdef\u001fabcdef\u001f1770000000\u001fUpdate memory\n"
        }
      ),
      "restore --source abcdef -- .aictx": result(["restore", "--source", "abcdef", "--", ".aictx"])
    });

    const diff = await getAictxDiff("/repo", { runner });
    const log = await getAictxLog("/repo", { runner });
    const restore = await restoreAictxFromCommit("/repo", "abcdef", { runner });

    expect(diff.ok).toBe(true);
    if (diff.ok) {
      expect(diff.data.changedFiles).toEqual([".aictx/events.jsonl"]);
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
      ["diff", "--", ".aictx"],
      ["log", "--format=%H\u001f%h\u001f%ct\u001f%s", "--", ".aictx"],
      ["restore", "--source", "abcdef", "--", ".aictx"]
    ]);
  });

  it("shows only files validated inside .aictx", async () => {
    const { calls, runner } = createRunner({
      "show abcdef:.aictx/memory/example.md": result(["show", "abcdef:.aictx/memory/example.md"], {
        stdout: "# Example\n"
      })
    });

    const shown = await showAictxFileAtCommit("/repo", "abcdef", "memory/example.md", { runner });
    const rejected = await showAictxFileAtCommit("/repo", "abcdef", "../outside.md", { runner });

    expect(shown).toEqual({
      ok: true,
      data: {
        commit: "abcdef",
        path: ".aictx/memory/example.md",
        contents: "# Example\n"
      },
      warnings: []
    });
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) {
      expect(rejected.error.code).toBe("AICtxValidationFailed");
    }
    expect(calls.map((call) => call.args)).toEqual([["show", "abcdef:.aictx/memory/example.md"]]);
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
