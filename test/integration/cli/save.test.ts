import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";

import { afterEach, describe, expect, it, vi } from "vitest";

import { main, type CliOutputWriter } from "../../../src/cli/main.js";
import { dataAccessService } from "../../../src/data-access/index.js";
import { readCanonicalStorage } from "../../../src/storage/read.js";

const tempRoots: string[] = [];

interface SaveEnvelope {
  ok: true;
  data: {
    files_changed: string[];
    memory_created: string[];
    memory_updated: string[];
    memory_deleted: string[];
    relations_created: string[];
    relations_updated: string[];
    relations_deleted: string[];
    recovery_files: unknown[];
    repairs_applied: string[];
    events_appended: number;
    index_updated: boolean;
  };
}

interface SaveErrorEnvelope {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true }))
  );
});

describe("aictx save CLI", () => {
  it("saves equivalent patches from stdin and file through the shared write path", async () => {
    const patch = createNotePatch(
      "Shared save note",
      "Both CLI input sources should reach the same save service."
    );
    const stdinProject = await createInitializedProject("aictx-cli-save-stdin-");
    const fileProject = await createInitializedProject("aictx-cli-save-file-");
    const stdinOutput = createCapturedOutput();
    const fileOutput = createCapturedOutput();
    const applyPatch = vi.spyOn(dataAccessService, "applyPatch");

    const stdinExitCode = await main(["node", "aictx", "save", "--stdin", "--json"], {
      ...stdinOutput.writers,
      cwd: stdinProject,
      stdin: Readable.from([JSON.stringify(patch)])
    });
    const patchFile = join(fileProject, "patch.json");
    await writeFile(patchFile, JSON.stringify(patch), "utf8");
    const fileExitCode = await main(
      ["node", "aictx", "save", "--file", "patch.json", "--json"],
      {
        ...fileOutput.writers,
        cwd: fileProject
      }
    );

    expect(stdinExitCode).toBe(0);
    expect(fileExitCode).toBe(0);
    expect(applyPatch).toHaveBeenCalledTimes(2);
    expect(applyPatch).toHaveBeenNthCalledWith(1, {
      target: {
        kind: "cwd",
        cwd: stdinProject
      },
      patch
    });
    expect(applyPatch).toHaveBeenNthCalledWith(2, {
      target: {
        kind: "cwd",
        cwd: fileProject
      },
      patch
    });
    expect(stdinOutput.stderr()).toBe("");
    expect(fileOutput.stderr()).toBe("");
    const stdinEnvelope = JSON.parse(stdinOutput.stdout()) as SaveEnvelope;
    const fileEnvelope = JSON.parse(fileOutput.stdout()) as SaveEnvelope;
    expect(stdinEnvelope.ok).toBe(true);
    expect(fileEnvelope.ok).toBe(true);
    expect(fileEnvelope.data).toEqual(stdinEnvelope.data);
    expect(stdinEnvelope.data).toEqual({
      files_changed: [
        ".aictx/events.jsonl",
        ".aictx/memory/notes/shared-save-note.json",
        ".aictx/memory/notes/shared-save-note.md"
      ],
      memory_created: ["note.shared-save-note"],
      memory_updated: [],
      memory_deleted: [],
      relations_created: [],
      relations_updated: [],
      relations_deleted: [],
      recovery_files: [],
      repairs_applied: [],
      events_appended: 1,
      index_updated: true
    });
    await expectSavedNote(stdinProject, "note.shared-save-note");
    await expectSavedNote(fileProject, "note.shared-save-note");
  });

  it.each([
    ["stdin", ["node", "aictx", "save", "--stdin", "--json"]] as const,
    ["file", ["node", "aictx", "save", "--file", "patch.json", "--json"]] as const
  ])("exits 1 for invalid JSON from %s", async (source, argv) => {
    const projectRoot = await createInitializedProject(`aictx-cli-save-invalid-${source}-`);
    const output = createCapturedOutput();
    const eventsBefore = await readFile(join(projectRoot, ".aictx", "events.jsonl"), "utf8");

    if (source === "file") {
      await writeFile(join(projectRoot, "patch.json"), "{bad json\n", "utf8");
    }

    const exitCode = await main([...argv], {
      ...output.writers,
      cwd: projectRoot,
      stdin: Readable.from(["{bad json\n"])
    });

    expect(exitCode).toBe(1);
    expect(output.stderr()).toBe("");
    const envelope = JSON.parse(output.stdout()) as SaveErrorEnvelope;
    expect(envelope.ok).toBe(false);
    expect(envelope.error.code).toBe("AICtxInvalidJson");
    await expect(readFile(join(projectRoot, ".aictx", "events.jsonl"), "utf8")).resolves.toBe(
      eventsBefore
    );
  });

  it("exits 2 when no input source is provided", async () => {
    const projectRoot = await createInitializedProject("aictx-cli-save-missing-source-");
    const output = createCapturedOutput();

    const exitCode = await main(["node", "aictx", "save"], {
      ...output.writers,
      cwd: projectRoot
    });

    expect(exitCode).toBe(2);
    expect(output.stdout()).toBe("");
    expect(output.stderr()).toContain("exactly one of --file or --stdin is required");
  });

  it("exits 2 when both input sources are provided", async () => {
    const projectRoot = await createInitializedProject("aictx-cli-save-duplicate-source-");
    const output = createCapturedOutput();

    const exitCode = await main(["node", "aictx", "save", "--stdin", "--file", "patch.json"], {
      ...output.writers,
      cwd: projectRoot,
      stdin: Readable.from([JSON.stringify(createNotePatch("Ignored", "Should not be read."))])
    });

    expect(exitCode).toBe(2);
    expect(output.stdout()).toBe("");
    expect(output.stderr()).toContain("exactly one of --file or --stdin is required");
  });
});

function createNotePatch(title: string, body: string) {
  return {
    source: {
      kind: "agent",
      task: "Save CLI integration test"
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

async function expectSavedNote(projectRoot: string, id: string): Promise<void> {
  const storage = await readCanonicalStorage(projectRoot);

  expect(storage.ok).toBe(true);
  if (!storage.ok) {
    return;
  }

  const saved = storage.data.objects.find((object) => object.sidecar.id === id);
  expect(saved).toBeDefined();
  expect(saved?.body).toContain("Both CLI input sources should reach the same save service.");
}

async function createInitializedProject(prefix: string): Promise<string> {
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

async function createTempRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  const resolvedRoot = await realpath(root);
  tempRoots.push(resolvedRoot);
  return resolvedRoot;
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
