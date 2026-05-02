import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";

import { afterEach, describe, expect, it } from "vitest";

import { main, type CliOutputWriter } from "../../../src/cli/main.js";
import { runSubprocess } from "../../../src/core/subprocess.js";

const tempRoots: string[] = [];

interface DiffSuccessEnvelope {
  ok: true;
  data: {
    diff: string;
    changed_files: string[];
    untracked_files: string[];
    changed_memory_ids: string[];
    changed_relation_ids: string[];
  };
  warnings: string[];
  meta: {
    git: {
      available: boolean;
      dirty: boolean | null;
    };
  };
}

interface DiffErrorEnvelope {
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

describe("aictx diff CLI", () => {
  it("includes untracked first-run Aictx files after init", async () => {
    const repo = await createRepo("aictx-cli-diff-init-untracked-");
    const initOutput = createCapturedOutput();
    const initExitCode = await main(["node", "aictx", "init", "--json"], {
      ...initOutput.writers,
      cwd: repo
    });

    expect(initExitCode).toBe(0);
    expect(initOutput.stderr()).toBe("");
    const projectId = await readJsonId(join(repo, ".aictx", "memory", "project.json"));
    const output = createCapturedOutput();

    const exitCode = await main(["node", "aictx", "diff", "--json"], {
      ...output.writers,
      cwd: repo
    });

    expect(exitCode).toBe(0);
    expect(output.stderr()).toBe("");
    const envelope = JSON.parse(output.stdout()) as DiffSuccessEnvelope;
    expect(envelope.ok).toBe(true);
    expect(envelope.data.diff).toContain("new file mode 100644");
    expect(envelope.data.diff).toContain(".aictx/config.json");
    expect(envelope.data.changed_files).toContain(".aictx/config.json");
    expect(envelope.data.untracked_files).toContain(".aictx/config.json");
    expect(envelope.data.changed_memory_ids).toContain(projectId);
    expect(envelope.meta.git.dirty).toBe(true);
  });

  it("shows only .aictx changes and reports detectable memory IDs", async () => {
    const repo = await createInitializedGitProject("aictx-cli-diff-memory-");
    const projectId = await readJsonId(join(repo, ".aictx", "memory", "project.json"));
    await writeFile(
      join(repo, ".aictx", "memory", "project.md"),
      "# Updated Project\n\nChanged Aictx memory.\n",
      "utf8"
    );
    await writeFile(join(repo, "src.ts"), "changed outside aictx\n", "utf8");
    const output = createCapturedOutput();

    const exitCode = await main(["node", "aictx", "diff", "--json"], {
      ...output.writers,
      cwd: repo
    });

    expect(exitCode).toBe(0);
    expect(output.stderr()).toBe("");
    const envelope = JSON.parse(output.stdout()) as DiffSuccessEnvelope;
    expect(envelope.ok).toBe(true);
    expect(envelope.warnings).toEqual([]);
    expect(envelope.data.diff).toContain(".aictx/memory/project.md");
    expect(envelope.data.diff).not.toContain("src.ts");
    expect(envelope.data.changed_files).toEqual([".aictx/memory/project.md"]);
    expect(envelope.data.untracked_files).toEqual([]);
    expect(envelope.data.changed_memory_ids).toEqual([projectId]);
    expect(envelope.data.changed_relation_ids).toEqual([]);
    expect(envelope.meta.git.available).toBe(true);
    expect(envelope.meta.git.dirty).toBe(true);
  });

  it("includes untracked memory files created by save", async () => {
    const repo = await createInitializedGitProject("aictx-cli-diff-save-untracked-");
    const saveOutput = createCapturedOutput();
    const saveExitCode = await main(["node", "aictx", "save", "--stdin", "--json"], {
      ...saveOutput.writers,
      cwd: repo,
      stdin: Readable.from([
        JSON.stringify(
          createNotePatch("Diff New Note", "New memory should appear before staging.")
        )
      ])
    });

    expect(saveExitCode).toBe(0);
    expect(saveOutput.stderr()).toBe("");
    const output = createCapturedOutput();

    const exitCode = await main(["node", "aictx", "diff", "--json"], {
      ...output.writers,
      cwd: repo
    });

    expect(exitCode).toBe(0);
    expect(output.stderr()).toBe("");
    const envelope = JSON.parse(output.stdout()) as DiffSuccessEnvelope;
    expect(envelope.ok).toBe(true);
    expect(envelope.data.diff).toContain(".aictx/memory/notes/diff-new-note.json");
    expect(envelope.data.diff).toContain(".aictx/memory/notes/diff-new-note.md");
    expect(envelope.data.diff).toContain("New memory should appear before staging.");
    expect(envelope.data.changed_files).toEqual([
      ".aictx/events.jsonl",
      ".aictx/memory/notes/diff-new-note.json",
      ".aictx/memory/notes/diff-new-note.md"
    ]);
    expect(envelope.data.untracked_files).toEqual([
      ".aictx/memory/notes/diff-new-note.json",
      ".aictx/memory/notes/diff-new-note.md"
    ]);
    expect(envelope.data.changed_memory_ids).toEqual(["note.diff-new-note"]);
    expect(envelope.data.changed_relation_ids).toEqual([]);
  });

  it("reports detectable relation IDs", async () => {
    const repo = await createInitializedGitProject("aictx-cli-diff-relation-");
    const relationPath = join(
      repo,
      ".aictx",
      "relations",
      "project-mentions-architecture.json"
    );
    const relation = {
      id: "rel.project-mentions-architecture",
      from: await readJsonId(join(repo, ".aictx", "memory", "project.json")),
      predicate: "mentions",
      to: "architecture.current",
      status: "active",
      created_at: "2026-04-25T14:00:00+02:00",
      updated_at: "2026-04-25T14:00:00+02:00"
    };
    await mkdir(join(repo, ".aictx", "relations"), { recursive: true });
    await writeJsonFile(relationPath, relation);
    await git(repo, ["add", ".aictx/relations/project-mentions-architecture.json"]);
    await git(repo, ["commit", "-m", "Add relation"]);
    await writeJsonFile(relationPath, {
      ...relation,
      status: "stale",
      updated_at: "2026-04-25T14:01:00+02:00"
    });
    const output = createCapturedOutput();

    const exitCode = await main(["node", "aictx", "diff", "--json"], {
      ...output.writers,
      cwd: repo
    });

    expect(exitCode).toBe(0);
    expect(output.stderr()).toBe("");
    const envelope = JSON.parse(output.stdout()) as DiffSuccessEnvelope;
    expect(envelope.ok).toBe(true);
    expect(envelope.data.changed_files).toEqual([
      ".aictx/relations/project-mentions-architecture.json"
    ]);
    expect(envelope.data.untracked_files).toEqual([]);
    expect(envelope.data.changed_memory_ids).toEqual([]);
    expect(envelope.data.changed_relation_ids).toEqual(["rel.project-mentions-architecture"]);
  });

  it("returns AICtxGitRequired outside Git", async () => {
    const projectRoot = await createInitializedLocalProject("aictx-cli-diff-local-");
    const output = createCapturedOutput();

    const exitCode = await main(["node", "aictx", "diff", "--json"], {
      ...output.writers,
      cwd: projectRoot
    });

    expect(exitCode).toBe(3);
    expect(output.stderr()).toBe("");
    const envelope = JSON.parse(output.stdout()) as DiffErrorEnvelope;
    expect(envelope.ok).toBe(false);
    expect(envelope.error.code).toBe("AICtxGitRequired");
  });
});

async function createInitializedGitProject(prefix: string): Promise<string> {
  const repo = await createRepo(prefix);
  const output = createCapturedOutput();
  const exitCode = await main(["node", "aictx", "init", "--json"], {
    ...output.writers,
    cwd: repo
  });

  expect(exitCode).toBe(0);
  expect(output.stderr()).toBe("");

  await git(repo, ["add", ".gitignore", ".aictx"]);
  await git(repo, ["commit", "-m", "Initialize aictx"]);

  return repo;
}

async function createInitializedLocalProject(prefix: string): Promise<string> {
  const projectRoot = await createTempRoot(prefix);
  const output = createCapturedOutput();
  const exitCode = await main(["node", "aictx", "init", "--json"], {
    ...output.writers,
    cwd: projectRoot
  });

  expect(exitCode).toBe(0);
  expect(output.stderr()).toBe("");

  return projectRoot;
}

async function createRepo(prefix: string): Promise<string> {
  const repo = await createTempRoot(prefix);
  await git(repo, ["init", "--initial-branch=main"]);
  await git(repo, ["config", "user.email", "test@example.com"]);
  await git(repo, ["config", "user.name", "Aictx Test"]);
  await writeFile(join(repo, "README.md"), "# Test\n", "utf8");
  await writeFile(join(repo, "src.ts"), "initial\n", "utf8");
  await git(repo, ["add", "README.md", "src.ts"]);
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
        result.data.stderr
      ].join("\n")
    );
  }

  return result.data.stdout;
}

async function readJsonId(path: string): Promise<string> {
  const parsed = JSON.parse(await readFile(path, "utf8")) as unknown;

  if (!isRecord(parsed) || typeof parsed.id !== "string") {
    throw new Error(`Expected ${path} to contain a string id.`);
  }

  return parsed.id;
}

async function writeJsonFile(path: string, value: Record<string, unknown>): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function createNotePatch(title: string, body: string) {
  return {
    source: {
      kind: "agent",
      task: "Diff CLI untracked save test"
    },
    changes: [
      {
        op: "create_object",
        type: "note",
        title,
        body: `# ${title}\n\n${body}\n`
      }
    ]
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
