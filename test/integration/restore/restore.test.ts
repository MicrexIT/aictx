import { access, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  initProject,
  restoreMemory,
  rewindMemory,
  saveMemoryPatch,
  searchMemory
} from "../../../src/app/operations.js";
import { runSubprocess } from "../../../src/core/subprocess.js";
import {
  createFixedTestClock,
  FIXED_TIMESTAMP,
  FIXED_TIMESTAMP_NEXT_MINUTE
} from "../../fixtures/time.js";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true }))
  );
});

describe("restore and rewind services", () => {
  it("restores only .aictx from a prior commit, rebuilds the index, and leaves HEAD unchanged", async () => {
    const repo = await createInitializedGitProject("aictx-restore-service-");
    const initialAictxCommit = (await git(repo, ["rev-parse", "HEAD"])).trim();
    const saved = await saveRestoreNote(repo);

    await commit(repo, "Add restore note", "2026-04-25T14:02:00+02:00", [".aictx"]);
    await writeFile(join(repo, "src.ts"), "code after memory commit\n", "utf8");
    await commit(repo, "Update app code only", "2026-04-25T14:03:00+02:00", ["src.ts"]);

    const headBeforeRestore = (await git(repo, ["rev-parse", "HEAD"])).trim();
    const sourceBeforeRestore = await readFile(join(repo, "src.ts"), "utf8");
    const result = await restoreMemory({
      cwd: repo,
      commit: initialAictxCommit,
      clock: createFixedTestClock(FIXED_TIMESTAMP_NEXT_MINUTE)
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.data.restored_from).toBe(initialAictxCommit);
    expect(result.data.index_rebuilt).toBe(true);
    expect(result.data.files_changed).toEqual(
      expect.arrayContaining([
        ".aictx/events.jsonl",
        ".aictx/memory/notes/restore-only-memory.json",
        ".aictx/memory/notes/restore-only-memory.md"
      ])
    );
    expect((await git(repo, ["rev-parse", "HEAD"])).trim()).toBe(headBeforeRestore);
    expect(await readFile(join(repo, "src.ts"), "utf8")).toBe(sourceBeforeRestore);
    expect(result.meta.git.available).toBe(true);
    expect(result.meta.git.commit).toBe(headBeforeRestore);
    expect(result.meta.git.dirty).toBe(true);

    await expect(access(join(repo, saved.noteMarkdownPath))).rejects.toMatchObject({
      code: "ENOENT"
    });

    const searched = await searchMemory({
      cwd: repo,
      query: "restore-only-memory",
      limit: 5
    });

    expect(searched.ok).toBe(true);
    if (searched.ok) {
      expect(searched.data.matches.map((match) => match.id)).not.toContain(saved.noteId);
    }
  });

  it("blocks restore when canonical .aictx files are dirty", async () => {
    const repo = await createInitializedGitProject("aictx-restore-dirty-");
    const targetCommit = (await git(repo, ["rev-parse", "HEAD"])).trim();
    const projectPath = join(repo, ".aictx", "memory", "project.md");
    const dirtyContents = "# Dirty Project\n\nUncommitted memory edit.\n";

    await writeFile(projectPath, dirtyContents, "utf8");
    const result = await restoreMemory({
      cwd: repo,
      commit: targetCommit,
      clock: createFixedTestClock(FIXED_TIMESTAMP_NEXT_MINUTE)
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("AICtxDirtyMemory");
    }
    expect(await readFile(projectPath, "utf8")).toBe(dirtyContents);
    expect((await git(repo, ["rev-parse", "HEAD"])).trim()).toBe(targetCommit);
  });

  it("returns AICtxGitRequired outside Git", async () => {
    const projectRoot = await createInitializedLocalProject("aictx-restore-local-");
    const result = await restoreMemory({
      cwd: projectRoot,
      commit: "HEAD",
      clock: createFixedTestClock(FIXED_TIMESTAMP_NEXT_MINUTE)
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("AICtxGitRequired");
    }
  });

  it("rewinds to the previous committed .aictx state without moving HEAD", async () => {
    const repo = await createInitializedGitProject("aictx-rewind-service-");
    const initialAictxCommit = (await git(repo, ["rev-parse", "HEAD"])).trim();
    const saved = await saveRestoreNote(repo);

    await commit(repo, "Add restore note", "2026-04-25T14:02:00+02:00", [".aictx"]);
    const headBeforeRewind = (await git(repo, ["rev-parse", "HEAD"])).trim();
    const result = await rewindMemory({
      cwd: repo,
      clock: createFixedTestClock(FIXED_TIMESTAMP_NEXT_MINUTE)
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.data.restored_from).toBe(initialAictxCommit);
    expect(result.data.index_rebuilt).toBe(true);
    expect((await git(repo, ["rev-parse", "HEAD"])).trim()).toBe(headBeforeRewind);
    await expect(access(join(repo, saved.noteMarkdownPath))).rejects.toMatchObject({
      code: "ENOENT"
    });
  });

  it("fails rewind when no previous committed .aictx state exists", async () => {
    const repo = await createInitializedGitProject("aictx-rewind-no-previous-");
    const headBeforeRewind = (await git(repo, ["rev-parse", "HEAD"])).trim();
    const projectPath = join(repo, ".aictx", "memory", "project.md");
    const projectBeforeRewind = await readFile(projectPath, "utf8");
    const result = await rewindMemory({
      cwd: repo,
      clock: createFixedTestClock(FIXED_TIMESTAMP_NEXT_MINUTE)
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("AICtxValidationFailed");
    }
    expect((await git(repo, ["rev-parse", "HEAD"])).trim()).toBe(headBeforeRewind);
    expect(await readFile(projectPath, "utf8")).toBe(projectBeforeRewind);
  });
});

async function saveRestoreNote(
  repo: string
): Promise<{ noteId: string; noteMarkdownPath: string }> {
  const result = await saveMemoryPatch({
    cwd: repo,
    clock: createFixedTestClock(FIXED_TIMESTAMP_NEXT_MINUTE),
    patch: {
      source: {
        kind: "agent",
        task: "Restore integration test"
      },
      changes: [
        {
          op: "create_object",
          type: "note",
          title: "Restore only memory",
          body: "# Restore only memory\n\nThis note should disappear after restore.\n"
        }
      ]
    }
  });

  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error(result.error.message);
  }

  return {
    noteId: result.data.memory_created[0] ?? "note.restore-only-memory",
    noteMarkdownPath: ".aictx/memory/notes/restore-only-memory.md"
  };
}

async function createInitializedGitProject(prefix: string): Promise<string> {
  const repo = await createRepo(prefix);
  const initialized = await initProject({
    cwd: repo,
    clock: createFixedTestClock(FIXED_TIMESTAMP)
  });

  expect(initialized.ok).toBe(true);
  if (!initialized.ok) {
    throw new Error(initialized.error.message);
  }

  await commit(repo, "Initialize aictx", "2026-04-25T14:00:00+02:00", [
    ".gitignore",
    ".aictx"
  ]);

  return repo;
}

async function createInitializedLocalProject(prefix: string): Promise<string> {
  const projectRoot = await createTempRoot(prefix);
  const initialized = await initProject({
    cwd: projectRoot,
    clock: createFixedTestClock(FIXED_TIMESTAMP)
  });

  expect(initialized.ok).toBe(true);
  if (!initialized.ok) {
    throw new Error(initialized.error.message);
  }

  return projectRoot;
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
