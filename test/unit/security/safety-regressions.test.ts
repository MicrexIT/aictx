import { mkdir, mkdtemp, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import fg from "fast-glob";
import { afterEach, describe, expect, it } from "vitest";

import {
  restoreMemoryFromCommit,
  showMemoryFileAtCommit
} from "../../../src/core/git.js";
import {
  writeTextAtomic
} from "../../../src/core/fs.js";
import type {
  SubprocessResult,
  SubprocessRunner,
  SubprocessRunnerOptions
} from "../../../src/core/subprocess.js";

const tempRoots: string[] = [];

interface SubprocessCall {
  command: string;
  args: readonly string[];
  options: SubprocessRunnerOptions;
}

const BLOCK_SECRET_PATTERNS = [
  /-----BEGIN (RSA |DSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/,
  /gh[pousr]_[A-Za-z0-9_]{36,255}/,
  /github_pat_[A-Za-z0-9_]{22,255}/,
  /sk-[A-Za-z0-9_-]{20,}/,
  /sk_(live|test)_[A-Za-z0-9]{16,}/,
  /xox[baprs]-[A-Za-z0-9-]{10,}/,
  /AKIA[A-Z0-9]{16}/,
  /AIza[A-Za-z0-9_-]{35}/,
  /(?:password|passwd|secret|api[_-]?key|access[_-]?token|auth[_-]?token)\s*[:=]\s*['"][^'"\s]{12,}['"]/i
] as const;

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true }))
  );
});

describe("unit security regression guardrails", () => {
  it("keeps Git operations argv-only with shell metacharacters preserved as one argument", async () => {
    const { calls, runner } = createRunner();
    const revision = "main;touch-pwn";

    const restored = await restoreMemoryFromCommit("/repo", revision, { runner });

    expect(restored.ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      command: "git",
      args: ["restore", "--source", revision, "--", ".memory"]
    });
    expect(calls[0]?.args).toContain(revision);
  });

  it("rejects unsafe Git revisions and Memory paths before subprocess execution", async () => {
    const { calls, runner } = createRunner();
    const invalidRevisions = ["--force", "main:evil", "main feature", "main\0evil"];
    const invalidPaths = [
      "../outside.md",
      "/tmp/outside.md",
      ".",
      "memory/../../outside.md",
      "..\\outside.md"
    ];

    for (const revision of invalidRevisions) {
      const result = await restoreMemoryFromCommit("/repo", revision, { runner });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("MemoryValidationFailed");
      }
    }

    for (const path of invalidPaths) {
      const result = await showMemoryFileAtCommit("/repo", "abcdef", path, { runner });
      expect(result.ok, path).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("MemoryValidationFailed");
      }
    }

    expect(calls).toEqual([]);
  });

  it("rejects writes outside an allowed root, including symlink parent escapes", async () => {
    const { sandboxRoot, allowedRoot } = await createFilesystemSandbox();
    const outsidePath = join(sandboxRoot, "outside.md");
    const outsideDirectory = join(sandboxRoot, "outside");
    await mkdir(outsideDirectory);
    await symlink(outsideDirectory, join(allowedRoot, "linked"));

    const relativeEscape = await writeTextAtomic(allowedRoot, "../outside.md", "outside");
    const absoluteEscape = await writeTextAtomic(allowedRoot, outsidePath, "outside");
    const symlinkEscape = await writeTextAtomic(
      allowedRoot,
      "linked/nested/escape.md",
      "outside"
    );

    for (const result of [relativeEscape, absoluteEscape, symlinkEscape]) {
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("MemoryValidationFailed");
      }
    }

    await expect(readFile(outsidePath, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    await expect(
      readFile(join(outsideDirectory, "nested", "escape.md"), "utf8")
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("keeps Vitest snapshots free of block-level secret values", async () => {
    const snapshotPaths = (
      await fg(["test/**/*.snap", "test/**/__snapshots__/**/*"], {
        cwd: process.cwd(),
        dot: true,
        onlyFiles: true,
        unique: true
      })
    ).sort();

    for (const path of snapshotPaths) {
      const contents = await readFile(join(process.cwd(), path), "utf8");

      for (const pattern of BLOCK_SECRET_PATTERNS) {
        expect(contents, `${path} contains a block-level secret pattern`).not.toMatch(pattern);
      }
    }
  });
});

function createRunner(): {
  calls: SubprocessCall[];
  runner: SubprocessRunner;
} {
  const calls: SubprocessCall[] = [];

  return {
    calls,
    runner: async (command, args, options) => {
      calls.push({ command, args, options });

      return {
        command,
        args,
        cwd: options.cwd ?? null,
        exitCode: 0,
        signal: null,
        stdout: "",
        stderr: ""
      } satisfies SubprocessResult;
    }
  };
}

async function createFilesystemSandbox(): Promise<{
  sandboxRoot: string;
  allowedRoot: string;
}> {
  const sandboxRoot = await mkdtemp(join(tmpdir(), "memory-security-fs-"));
  const allowedRoot = join(sandboxRoot, ".memory");

  tempRoots.push(sandboxRoot);
  await mkdir(allowedRoot);

  return { sandboxRoot, allowedRoot };
}
