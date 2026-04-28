import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { main, type CliOutputWriter } from "../../../src/cli/main.js";
import { runSubprocess } from "../../../src/core/subprocess.js";

const tempRoots: string[] = [];

interface RestoreSuccessEnvelope {
  ok: true;
  data: {
    restored_from: string;
    files_changed: string[];
    index_rebuilt: boolean;
  };
  warnings: string[];
  meta: {
    git: {
      available: boolean;
      commit: string | null;
      dirty: boolean | null;
    };
  };
}

interface RestoreErrorEnvelope {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true }))
  );
});

describe("aictx restore and rewind CLI", () => {
  it("requires an explicit restore commit before running the service path", async () => {
    const projectRoot = await createTempRoot("aictx-cli-restore-missing-commit-");
    const output = await runCli(["node", "aictx", "restore"], projectRoot);

    expect(output.exitCode).toBe(2);
    expect(output.stdout).toBe("");
    expect(output.stderr).toContain("missing required argument 'commit'");
  });

  it("restores only .aictx from an explicit commit and reports the JSON envelope", async () => {
    const repo = await createInitializedGitProject("aictx-cli-restore-json-");
    const projectPath = join(repo, ".aictx", "memory", "project.md");
    const targetCommit = (await git(repo, ["rev-parse", "HEAD"])).trim();
    const originalProjectMemory = await readFile(projectPath, "utf8");

    await writeFile(
      projectPath,
      "# Changed Project\n\nThis memory should be restored.\n",
      "utf8"
    );
    await writeFile(join(repo, "src.ts"), "code committed with memory change\n", "utf8");
    await commit(repo, "Update memory and code", "2026-04-25T14:01:00+02:00", [
      ".aictx/memory/project.md",
      "src.ts"
    ]);

    const headBeforeRestore = (await git(repo, ["rev-parse", "HEAD"])).trim();
    const sourceBeforeRestore = await readFile(join(repo, "src.ts"), "utf8");
    const output = await runCli(
      ["node", "aictx", "restore", targetCommit, "--json"],
      repo
    );

    expect(output.exitCode).toBe(0);
    expect(output.stderr).toBe("");
    const envelope = JSON.parse(output.stdout) as RestoreSuccessEnvelope;

    expect(envelope.ok).toBe(true);
    expect(envelope.warnings).toEqual([]);
    expect(envelope.data.restored_from).toBe(targetCommit);
    expect(envelope.data.files_changed).toContain(".aictx/memory/project.md");
    expect(envelope.data.index_rebuilt).toBe(true);
    expect(envelope.meta.git.available).toBe(true);
    expect(envelope.meta.git.commit).toBe(headBeforeRestore);
    expect(envelope.meta.git.dirty).toBe(true);
    expect((await git(repo, ["rev-parse", "HEAD"])).trim()).toBe(headBeforeRestore);
    expect(await readFile(join(repo, "src.ts"), "utf8")).toBe(sourceBeforeRestore);
    expect(await readFile(projectPath, "utf8")).toBe(originalProjectMemory);
  });

  it("rewinds to the previous .aictx commit while skipping code-only commits", async () => {
    const repo = await createInitializedGitProject("aictx-cli-rewind-json-");
    const projectPath = join(repo, ".aictx", "memory", "project.md");
    const previousAictxCommit = (await git(repo, ["rev-parse", "HEAD"])).trim();
    const previousProjectMemory = await readFile(projectPath, "utf8");

    await writeFile(join(repo, "src.ts"), "code-only commit before memory\n", "utf8");
    await commit(repo, "Update app code only before memory", "2026-04-25T14:01:00+02:00", [
      "src.ts"
    ]);
    await writeFile(
      projectPath,
      "# Rewind Project\n\nThis committed memory should be rewound.\n",
      "utf8"
    );
    await commit(repo, "Update memory for rewind", "2026-04-25T14:02:00+02:00", [
      ".aictx/memory/project.md"
    ]);
    await writeFile(join(repo, "src.ts"), "code-only commit after memory\n", "utf8");
    await commit(repo, "Update app code only after memory", "2026-04-25T14:03:00+02:00", [
      "src.ts"
    ]);

    const headBeforeRewind = (await git(repo, ["rev-parse", "HEAD"])).trim();
    const sourceBeforeRewind = await readFile(join(repo, "src.ts"), "utf8");
    const output = await runCli(["node", "aictx", "rewind", "--json"], repo);

    expect(output.exitCode).toBe(0);
    expect(output.stderr).toBe("");
    const envelope = JSON.parse(output.stdout) as RestoreSuccessEnvelope;

    expect(envelope.ok).toBe(true);
    expect(envelope.data.restored_from).toBe(previousAictxCommit);
    expect(envelope.data.files_changed).toContain(".aictx/memory/project.md");
    expect(envelope.data.index_rebuilt).toBe(true);
    expect((await git(repo, ["rev-parse", "HEAD"])).trim()).toBe(headBeforeRewind);
    expect(await readFile(join(repo, "src.ts"), "utf8")).toBe(sourceBeforeRewind);
    expect(await readFile(projectPath, "utf8")).toBe(previousProjectMemory);
  });

  it.each(["restore", "rewind"] as const)(
    "refuses to run %s when canonical .aictx files are dirty",
    async (command) => {
      const repo = await createRepoWithTwoAictxCommits(`aictx-cli-${command}-dirty-`);
      const headBeforeCommand = (await git(repo.root, ["rev-parse", "HEAD"])).trim();
      const projectPath = join(repo.root, ".aictx", "memory", "project.md");
      const dirtyProjectMemory = "# Dirty Project\n\nUncommitted memory edit.\n";

      await writeFile(projectPath, dirtyProjectMemory, "utf8");

      const argv =
        command === "restore"
          ? ["node", "aictx", "restore", repo.initialAictxCommit, "--json"]
          : ["node", "aictx", "rewind", "--json"];
      const output = await runCli(argv, repo.root);

      expect(output.exitCode).toBe(3);
      expect(output.stderr).toBe("");
      const envelope = JSON.parse(output.stdout) as RestoreErrorEnvelope;

      expect(envelope.ok).toBe(false);
      expect(envelope.error.code).toBe("AICtxDirtyMemory");
      expect(await readFile(projectPath, "utf8")).toBe(dirtyProjectMemory);
      expect((await git(repo.root, ["rev-parse", "HEAD"])).trim()).toBe(
        headBeforeCommand
      );
    }
  );
});

async function createRepoWithTwoAictxCommits(
  prefix: string
): Promise<{ root: string; initialAictxCommit: string }> {
  const repo = await createInitializedGitProject(prefix);
  const initialAictxCommit = (await git(repo, ["rev-parse", "HEAD"])).trim();

  await writeFile(
    join(repo, ".aictx", "memory", "project.md"),
    "# Second Aictx Commit\n\nCommitted memory update.\n",
    "utf8"
  );
  await commit(repo, "Update memory", "2026-04-25T14:01:00+02:00", [
    ".aictx/memory/project.md"
  ]);

  return {
    root: repo,
    initialAictxCommit
  };
}

async function createInitializedGitProject(prefix: string): Promise<string> {
  const repo = await createRepo(prefix);
  const output = await runCli(["node", "aictx", "init", "--json"], repo);

  expect(output.exitCode).toBe(0);
  expect(output.stderr).toBe("");

  await commit(repo, "Initialize aictx", "2026-04-25T14:00:00+02:00", [
    ".gitignore",
    ".aictx"
  ]);

  return repo;
}

async function createRepo(prefix: string): Promise<string> {
  const repo = await createTempRoot(prefix);
  await git(repo, ["init", "--initial-branch=main"]);
  await git(repo, ["config", "user.email", "test@example.com"]);
  await git(repo, ["config", "user.name", "Aictx Test"]);
  await writeFile(join(repo, "README.md"), "# Test\n", "utf8");
  await writeFile(join(repo, "src.ts"), "initial\n", "utf8");
  await commit(repo, "Initial commit", "2026-04-25T13:59:00+02:00", [
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
