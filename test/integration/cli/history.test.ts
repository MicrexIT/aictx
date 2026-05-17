import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { main, type CliOutputWriter } from "../../../src/cli/main.js";
import { runSubprocess } from "../../../src/core/subprocess.js";

const tempRoots: string[] = [];

interface HistorySuccessEnvelope {
  ok: true;
  data: {
    commits: Array<{
      commit: string;
      short_commit: string;
      author: string;
      timestamp: string;
      subject: string;
    }>;
  };
  warnings: string[];
  meta: {
    git: {
      available: boolean;
      dirty: boolean | null;
    };
  };
}

interface HistoryErrorEnvelope {
  ok: false;
  error: {
    code: string;
    message: string;
  };
}

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true }))
  );
});

describe("memory history CLI", () => {
  it("returns only commits that changed .memory in the API JSON shape", async () => {
    const repo = await createHistoryRepo("memory-cli-history-json-");
    const output = await runCli(["node", "memory", "history", "--json"], repo);

    expect(output.exitCode).toBe(0);
    expect(output.stderr).toBe("");
    const envelope = JSON.parse(output.stdout) as HistorySuccessEnvelope;

    expect(envelope.ok).toBe(true);
    expect(envelope.warnings).toEqual([]);
    expect(envelope.data.commits.map((commit) => commit.subject)).toEqual([
      "Update memory and code",
      "Update memory only",
      "Initialize memory"
    ]);
    expect(envelope.data.commits.map((commit) => commit.subject)).not.toContain(
      "Update app code only"
    );
    expect(envelope.meta.git.available).toBe(true);
    expect(envelope.meta.git.dirty).toBe(false);

    const newestCommit = envelope.data.commits[0];

    if (newestCommit === undefined) {
      throw new Error("Expected at least one Memory history commit.");
    }

    expect(Object.keys(newestCommit).sort()).toEqual([
      "author",
      "commit",
      "short_commit",
      "subject",
      "timestamp"
    ]);
    expect(newestCommit).toMatchObject({
      author: "Memory Test <test@example.com>",
      timestamp: "2026-04-25T15:00:00+02:00",
      subject: "Update memory and code"
    });
    expect(newestCommit.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(newestCommit.short_commit.length).toBeGreaterThanOrEqual(7);
    expect(newestCommit.commit.startsWith(newestCommit.short_commit)).toBe(true);
  });

  it("limits history to the newest matching .memory commits", async () => {
    const repo = await createHistoryRepo("memory-cli-history-limit-");
    const output = await runCli(
      ["node", "memory", "history", "--limit", "2", "--json"],
      repo
    );

    expect(output.exitCode).toBe(0);
    expect(output.stderr).toBe("");
    const envelope = JSON.parse(output.stdout) as HistorySuccessEnvelope;

    expect(envelope.ok).toBe(true);
    expect(envelope.data.commits.map((commit) => commit.subject)).toEqual([
      "Update memory and code",
      "Update memory only"
    ]);
  });

  it("prints compact human output", async () => {
    const repo = await createHistoryRepo("memory-cli-history-human-");
    const output = await runCli(["node", "memory", "history", "--limit", "1"], repo);

    expect(output.exitCode).toBe(0);
    expect(output.stderr).toBe("");
    expect(output.stdout).toContain("Update memory and code");
    expect(output.stdout).toContain("Memory Test <test@example.com>");
    expect(output.stdout).toContain("2026-04-25T15:00:00+02:00");
    expect(() => JSON.parse(output.stdout) as unknown).toThrow();
  });

  it("returns MemoryGitRequired outside Git", async () => {
    const projectRoot = await createInitializedLocalProject("memory-cli-history-local-");
    const output = await runCli(["node", "memory", "history", "--json"], projectRoot);

    expect(output.exitCode).toBe(3);
    expect(output.stderr).toBe("");
    const envelope = JSON.parse(output.stdout) as HistoryErrorEnvelope;

    expect(envelope.ok).toBe(false);
    expect(envelope.error.code).toBe("MemoryGitRequired");
  });
});

async function createHistoryRepo(prefix: string): Promise<string> {
  const repo = await createInitializedGitProject(prefix);

  await writeFile(join(repo, "src.ts"), "outside change only\n", "utf8");
  await commit(repo, "Update app code only", "2026-04-25T13:00:00+02:00", ["src.ts"]);

  await writeFile(
    join(repo, ".memory", "memory", "project.md"),
    "# Test Project\n\nMemory-only history update.\n",
    "utf8"
  );
  await commit(repo, "Update memory only", "2026-04-25T14:00:00+02:00", [
    ".memory/memory/project.md"
  ]);

  await writeFile(join(repo, "src.ts"), "outside mixed change\n", "utf8");
  await writeFile(
    join(repo, ".memory", "memory", "project.md"),
    "# Test Project\n\nMixed history update.\n",
    "utf8"
  );
  await commit(repo, "Update memory and code", "2026-04-25T15:00:00+02:00", [
    "src.ts",
    ".memory/memory/project.md"
  ]);

  return repo;
}

async function createInitializedGitProject(prefix: string): Promise<string> {
  const repo = await createRepo(prefix);
  const output = await runCli(["node", "memory", "init", "--json"], repo);

  expect(output.exitCode).toBe(0);
  expect(output.stderr).toBe("");

  await commit(repo, "Initialize memory", "2026-04-25T12:00:00+02:00", [
    ".gitignore",
    ".memory"
  ]);

  return repo;
}

async function createInitializedLocalProject(prefix: string): Promise<string> {
  const projectRoot = await createTempRoot(prefix);
  const output = await runCli(["node", "memory", "init", "--json"], projectRoot);

  expect(output.exitCode).toBe(0);
  expect(output.stderr).toBe("");

  return projectRoot;
}

async function createRepo(prefix: string): Promise<string> {
  const repo = await createTempRoot(prefix);
  await git(repo, ["init", "--initial-branch=main"]);
  await git(repo, ["config", "user.email", "test@example.com"]);
  await git(repo, ["config", "user.name", "Memory Test"]);
  await writeFile(join(repo, "README.md"), "# Test\n", "utf8");
  await writeFile(join(repo, "src.ts"), "initial\n", "utf8");
  await commit(repo, "Initial commit", "2026-04-25T11:00:00+02:00", [
    "README.md",
    "src.ts"
  ]);
  return repo;
}

async function createTempRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  const resolvedRoot = await realpath(root);
  tempRoots.push(resolvedRoot);
  return resolvedRoot;
}

async function runCli(
  argv: string[],
  cwd: string
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const output = createCapturedOutput();
  const exitCode = await main(argv, {
    ...output.writers,
    cwd
  });

  return {
    exitCode,
    stdout: output.stdout(),
    stderr: output.stderr()
  };
}

async function commit(
  cwd: string,
  message: string,
  date: string,
  paths: string[]
): Promise<void> {
  await git(cwd, ["add", ...paths]);
  await git(cwd, ["commit", "-m", message], {
    GIT_AUTHOR_DATE: date,
    GIT_COMMITTER_DATE: date
  });
}

async function git(
  cwd: string,
  args: readonly string[],
  env: Record<string, string> = {}
): Promise<string> {
  const result = await runSubprocess("git", args, {
    cwd,
    env: { ...process.env, ...env }
  });

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

function createCapturedOutput(): {
  writers: { stdout: CliOutputWriter; stderr: CliOutputWriter };
  stdout: () => string;
  stderr: () => string;
} {
  let stdout = "";
  let stderr = "";

  return {
    writers: {
      stdout: (text) => {
        stdout += text;
      },
      stderr: (text) => {
        stderr += text;
      }
    },
    stdout: () => stdout,
    stderr: () => stderr
  };
}
