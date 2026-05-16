import { access, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import fg from "fast-glob";
import { afterEach, describe, expect, it } from "vitest";

import {
  initProject,
  saveMemoryPatch,
  searchMemory
} from "../../../src/app/operations.js";
import { runSubprocess } from "../../../src/core/subprocess.js";
import { computeObjectContentHash } from "../../../src/storage/hashes.js";
import { readCanonicalStorage } from "../../../src/storage/read.js";
import { validateProject } from "../../../src/validation/validate.js";
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

describe("saveMemoryPatch", () => {
  it("writes canonical files, appends events, updates hashes, and updates search index", async () => {
    const projectRoot = await createInitializedProject("memory-save-local-");

    const result = await saveMemoryPatch({
      cwd: projectRoot,
      clock: createFixedTestClock(FIXED_TIMESTAMP_NEXT_MINUTE),
      patch: {
        source: {
          kind: "agent",
          task: "Save retry follow up"
        },
        changes: [
          {
            op: "create_object",
            type: "note",
            title: "Retry follow up",
            body: "# Retry follow up\n\nQueue worker retry details are saved for later tasks.\n",
            tags: ["retry", "worker"]
          }
        ]
      }
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.data).toMatchObject({
      files_changed: [
        ".memory/events.jsonl",
        ".memory/memory/notes/retry-follow-up.json",
        ".memory/memory/notes/retry-follow-up.md"
      ],
      memory_created: ["note.retry-follow-up"],
      memory_updated: [],
      memory_deleted: [],
      relations_created: [],
      relations_updated: [],
      relations_deleted: [],
      events_appended: 1,
      index_updated: true
    });

    const storage = await readCanonicalStorage(projectRoot);
    expect(storage.ok).toBe(true);
    if (!storage.ok) {
      return;
    }

    const saved = storage.data.objects.find(
      (object) => object.sidecar.id === "note.retry-follow-up"
    );
    expect(saved).toBeDefined();
    if (saved === undefined) {
      return;
    }

    expect(saved.body).toBe(
      "# Retry follow up\n\nQueue worker retry details are saved for later tasks.\n"
    );
    expect(saved.sidecar).toEqual(
      expect.objectContaining({
        id: "note.retry-follow-up",
        type: "note",
        status: "active",
        title: "Retry follow up",
        tags: ["retry", "worker"],
        source: {
          kind: "agent",
          task: "Save retry follow up"
        },
        created_at: FIXED_TIMESTAMP_NEXT_MINUTE,
        updated_at: FIXED_TIMESTAMP_NEXT_MINUTE
      })
    );

    const { content_hash: _contentHash, ...sidecarWithoutHash } = saved.sidecar;
    expect(saved.sidecar.content_hash).toBe(
      computeObjectContentHash(sidecarWithoutHash, saved.body)
    );

    const validation = await validateProject(projectRoot);
    expect(validation.valid).toBe(true);
    expect(validation.errors).toEqual([]);

    const searched = await searchMemory({
      cwd: projectRoot,
      query: "Queue worker retry",
      limit: 5
    });

    expect(searched.ok).toBe(true);
    if (searched.ok) {
      expect(searched.data.matches.map((match) => match.id)).toContain("note.retry-follow-up");
    }
  });

  it("quarantines canonical conflict markers before applying the patch", async () => {
    const projectRoot = await createInitializedProject("memory-save-conflict-marker-");
    await writeFile(
      join(projectRoot, ".memory", "memory", "project.md"),
      "<<<<<<< HEAD\n# Project\n=======\n# Other project\n>>>>>>> branch\n",
      "utf8"
    );
    const result = await saveMemoryPatch({
      cwd: projectRoot,
      clock: createFixedTestClock(FIXED_TIMESTAMP_NEXT_MINUTE),
      patch: createNotePatch("Saved despite conflict", "This should still be written.")
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.memory_created).toEqual(["note.saved-despite-conflict"]);
      expect(result.data.repairs_applied).toEqual(
        expect.arrayContaining([
          "Quarantined invalid memory object body: .memory/memory/project.md"
        ])
      );
    }
    await expect(
      access(join(projectRoot, ".memory", "memory", "notes", "saved-despite-conflict.md"))
    ).resolves.toBeUndefined();
    await expect(access(join(projectRoot, ".memory", "memory", "project.md")))
      .rejects.toMatchObject({ code: "ENOENT" });
  });

  it("repairs invalid events history before appending new save events", async () => {
    const projectRoot = await createInitializedProject("memory-save-invalid-events-");
    const invalidEvents = "{bad json\n";
    await writeFile(join(projectRoot, ".memory", "events.jsonl"), invalidEvents, "utf8");

    const result = await saveMemoryPatch({
      cwd: projectRoot,
      clock: createFixedTestClock(FIXED_TIMESTAMP_NEXT_MINUTE),
      patch: createNotePatch("Saved after invalid events", "This should still be written.")
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.memory_created).toEqual(["note.saved-after-invalid-events"]);
      expect(result.data.repairs_applied).toEqual([
        "Repaired invalid events history: .memory/events.jsonl"
      ]);
    }
    await expect(
      access(join(projectRoot, ".memory", "memory", "notes", "saved-after-invalid-events.md"))
    ).resolves.toBeUndefined();
    await expect(readFile(join(projectRoot, ".memory", "events.jsonl"), "utf8"))
      .resolves.toContain('"id":"note.saved-after-invalid-events"');
  });

  it("rejects block-level secrets in patches without leaking the secret", async () => {
    const projectRoot = await createInitializedProject("memory-save-secret-");
    const before = await readCanonicalSnapshot(projectRoot);
    const secret = `sk-${"a".repeat(20)}`;

    const result = await saveMemoryPatch({
      cwd: projectRoot,
      clock: createFixedTestClock(FIXED_TIMESTAMP_NEXT_MINUTE),
      patch: createNotePatch("Do not save secret", `The key was ${secret}.`)
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("MemorySecretDetected");
      expect(JSON.stringify(result.error.details)).not.toContain(secret);
    }
    await expect(
      access(join(projectRoot, ".memory", "memory", "notes", "do-not-save-secret.md"))
    ).rejects.toMatchObject({ code: "ENOENT" });
    await expect(readCanonicalSnapshot(projectRoot)).resolves.toEqual(before);
  });

  it("leaves Git changes uncommitted after a successful save", async () => {
    const repo = await createRepo("memory-save-git-");
    const initialized = await initProject({
      cwd: repo,
      clock: createFixedTestClock(FIXED_TIMESTAMP)
    });
    expect(initialized.ok).toBe(true);
    await git(repo, ["add", ".gitignore", ".memory"]);
    await git(repo, ["commit", "-m", "Initialize memory"]);
    const commitBefore = (await git(repo, ["rev-parse", "HEAD"])).trim();

    const result = await saveMemoryPatch({
      cwd: repo,
      clock: createFixedTestClock(FIXED_TIMESTAMP_NEXT_MINUTE),
      patch: createNotePatch("Git save note", "Save should not create a commit.")
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect((await git(repo, ["rev-parse", "HEAD"])).trim()).toBe(commitBefore);
    expect(result.meta.git.available).toBe(true);
    expect(result.meta.git.commit).toBe(commitBefore);
    expect(result.meta.git.dirty).toBe(true);

    const status = await git(repo, ["status", "--porcelain=v1", "-uall", "--", ".memory"]);
    expect(status).toContain(".memory/events.jsonl");
    expect(status).toContain(".memory/memory/notes/git-save-note.md");
    expect(status).toContain(".memory/memory/notes/git-save-note.json");
  });

  it("appends to valid dirty tracked events history during a Git-backed save", async () => {
    const repo = await createRepo("memory-save-dirty-events-");
    const initialized = await initProject({
      cwd: repo,
      clock: createFixedTestClock(FIXED_TIMESTAMP)
    });
    expect(initialized.ok).toBe(true);
    await git(repo, ["add", ".gitignore", ".memory"]);
    await git(repo, ["commit", "-m", "Initialize memory"]);
    const priorEvent =
      '{"actor":"agent","event":"memory.updated","id":"architecture.current","timestamp":"2026-04-25T14:00:00+02:00"}\n';
    await writeFile(join(repo, ".memory", "events.jsonl"), priorEvent, "utf8");

    const result = await saveMemoryPatch({
      cwd: repo,
      clock: createFixedTestClock(FIXED_TIMESTAMP_NEXT_MINUTE),
      patch: createNotePatch("Dirty events save note", "Save should append after prior events.")
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.data).toMatchObject({
      memory_created: ["note.dirty-events-save-note"],
      events_appended: 1
    });
    const events = await readFile(join(repo, ".memory", "events.jsonl"), "utf8");
    expect(events).toContain(priorEvent.trim());
    expect(events).toContain('"id":"note.dirty-events-save-note"');
    expect(events.indexOf(priorEvent.trim())).toBeLessThan(
      events.indexOf('"id":"note.dirty-events-save-note"')
    );
  });

  it("backs up dirty touched canonical files instead of blocking a Git-backed save", async () => {
    const repo = await createRepo("memory-save-dirty-overwrite-");
    const initialized = await initProject({
      cwd: repo,
      clock: createFixedTestClock(FIXED_TIMESTAMP)
    });
    expect(initialized.ok).toBe(true);
    await git(repo, ["add", ".gitignore", ".memory"]);
    await git(repo, ["commit", "-m", "Initialize memory"]);
    const dirtyBody = "# Current Architecture\n\nDirty local edit.\n";
    await writeFile(join(repo, ".memory", "memory", "architecture.md"), dirtyBody, "utf8");

    const result = await saveMemoryPatch({
      cwd: repo,
      clock: createFixedTestClock(FIXED_TIMESTAMP_NEXT_MINUTE),
      patch: {
        source: {
          kind: "agent",
          task: "Update architecture"
        },
        changes: [
          {
            op: "update_object",
            id: "architecture.current",
            body: "# Current Architecture\n\nSaved architecture update.\n"
          }
        ]
      }
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.data.memory_updated).toEqual(["architecture.current"]);
    expect(result.data.recovery_files).toEqual([
      expect.objectContaining({
        path: ".memory/memory/architecture.md",
        reason: "dirty_overwrite"
      })
    ]);
    await expect(
      readFile(join(repo, result.data.recovery_files[0]?.recovery_path ?? ""), "utf8")
    ).resolves.toBe(dirtyBody);
    await expect(readFile(join(repo, ".memory", "memory", "architecture.md"), "utf8"))
      .resolves.toContain("Saved architecture update.");
  });

  it("quarantines unrelated malformed memory and still saves new memory", async () => {
    const projectRoot = await createInitializedProject("memory-save-repair-invalid-");
    await mkdir(join(projectRoot, ".memory", "memory", "notes"), { recursive: true });
    await writeFile(
      join(projectRoot, ".memory", "memory", "notes", "broken.json"),
      "{not json\n",
      "utf8"
    );

    const result = await saveMemoryPatch({
      cwd: projectRoot,
      clock: createFixedTestClock(FIXED_TIMESTAMP_NEXT_MINUTE),
      patch: createNotePatch("Repair keeps saving", "New memory should still be written.")
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.data.memory_created).toEqual(["note.repair-keeps-saving"]);
    expect(result.data.repairs_applied).toEqual(
      expect.arrayContaining([
        "Quarantined invalid memory object sidecar: .memory/memory/notes/broken.json"
      ])
    );
    await expect(
      access(join(projectRoot, ".memory", "memory", "notes", "broken.json"))
    ).rejects.toMatchObject({ code: "ENOENT" });
    await expect(
      readFile(join(projectRoot, result.data.recovery_files[0]?.recovery_path ?? ""), "utf8")
    ).resolves.toBe("{not json\n");
  });
});

function createNotePatch(title: string, body: string) {
  return {
    source: {
      kind: "agent",
      task: "Save integration test"
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

async function createInitializedProject(prefix: string): Promise<string> {
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
  await git(repo, ["config", "user.name", "Memory Test"]);
  await mkdir(join(repo, "src"), { recursive: true });
  await writeFile(join(repo, "README.md"), "# Test\n", "utf8");
  await git(repo, ["add", "README.md"]);
  await git(repo, ["commit", "-m", "Initial commit"]);
  return repo;
}

async function createTempRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  const resolvedRoot = await realpath(root);
  tempRoots.push(resolvedRoot);
  return resolvedRoot;
}

async function readCanonicalSnapshot(projectRoot: string): Promise<Record<string, string>> {
  const paths = (
    await fg(".memory/**/*.{json,jsonl,md}", {
      cwd: projectRoot,
      dot: true,
      ignore: [".memory/index/**", ".memory/context/**"],
      onlyFiles: true,
      unique: true
    })
  ).sort();
  const entries = await Promise.all(
    paths.map(async (path) => [path, await readFile(join(projectRoot, path), "utf8")] as const)
  );

  return Object.fromEntries(entries);
}

async function git(cwd: string, args: string[]): Promise<string> {
  const result = await runSubprocess("git", args, { cwd });

  if (!result.ok) {
    throw new Error(result.error.message);
  }

  if (result.data.exitCode !== 0) {
    throw new Error(result.data.stderr || result.data.stdout || `git ${args.join(" ")} failed`);
  }

  return result.data.stdout;
}
