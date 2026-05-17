import { access, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { main, type CliOutputWriter } from "../../../src/cli/main.js";
import type { ValidationIssue } from "../../../src/core/types.js";

const tempRoots: string[] = [];

interface CheckEnvelope {
  ok: true;
  data: {
    valid: boolean;
    errors: ValidationIssue[];
    warnings: ValidationIssue[];
  };
}

interface RebuildEnvelope {
  ok: true;
  data: {
    index_rebuilt: true;
    objects_indexed: number;
    relations_indexed: number;
    events_indexed: number;
    event_appended: false;
  };
}

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true }))
  );
});

describe("memory check and rebuild CLI", () => {
  it("fails check with diagnostic data when events JSONL is invalid", async () => {
    const projectRoot = await createInitializedProject("memory-cli-check-invalid-jsonl-");
    await writeFile(join(projectRoot, ".memory", "events.jsonl"), "{bad json\n", "utf8");
    const output = createCapturedOutput();

    const exitCode = await main(["node", "memory", "check", "--json"], {
      ...output.writers,
      cwd: projectRoot
    });

    expect(exitCode).toBe(1);
    expect(output.stderr()).toBe("");
    const envelope = JSON.parse(output.stdout()) as CheckEnvelope;
    expect(envelope.ok).toBe(true);
    expect(envelope.data.valid).toBe(false);
    expect(envelope.data.errors).toContainEqual(
      expect.objectContaining({
        code: "EventJsonlInvalid",
        path: expect.stringMatching(/^\.memory\/events\.jsonl:\d+$/)
      })
    );
  });

  it("rebuild recreates missing SQLite", async () => {
    const projectRoot = await createInitializedProject("memory-cli-rebuild-missing-sqlite-");
    await rm(join(projectRoot, ".memory", "index"), { recursive: true, force: true });
    const output = createCapturedOutput();

    const exitCode = await main(["node", "memory", "rebuild", "--json"], {
      ...output.writers,
      cwd: projectRoot
    });

    expect(exitCode).toBe(0);
    expect(output.stderr()).toBe("");
    const envelope = JSON.parse(output.stdout()) as RebuildEnvelope;
    expect(envelope.ok).toBe(true);
    expect(envelope.data.index_rebuilt).toBe(true);
    await expect(
      access(join(projectRoot, ".memory", "index", "memory.sqlite"))
    ).resolves.toBeUndefined();
  });

  it("rebuild does not append events", async () => {
    const projectRoot = await createInitializedProject("memory-cli-rebuild-events-");
    const eventsBefore = await readFile(join(projectRoot, ".memory", "events.jsonl"), "utf8");
    const output = createCapturedOutput();

    const exitCode = await main(["node", "memory", "rebuild", "--json"], {
      ...output.writers,
      cwd: projectRoot
    });

    expect(exitCode).toBe(0);
    const envelope = JSON.parse(output.stdout()) as RebuildEnvelope;
    expect(envelope.data.event_appended).toBe(false);
    await expect(readFile(join(projectRoot, ".memory", "events.jsonl"), "utf8")).resolves.toBe(
      eventsBefore
    );
  });
});

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

async function createInitializedProject(prefix: string): Promise<string> {
  const projectRoot = await createTempRoot(prefix);
  const output = createCapturedOutput();
  const exitCode = await main(["node", "memory", "init", "--json"], {
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
