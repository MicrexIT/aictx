import { mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";

import { afterEach, describe, expect, it } from "vitest";

import { main, type CliOutputWriter } from "../../../src/cli/main.js";
import { loadMemory } from "../../../src/app/operations.js";
import { readCanonicalStorage } from "../../../src/storage/read.js";
import { createFixedTestClock } from "../../fixtures/time.js";

const tempRoots: string[] = [];

interface RememberEnvelope {
  ok: true;
  data: {
    dry_run: boolean;
    patch: unknown;
    files_changed: string[];
    memory_created: string[];
    memory_updated: string[];
    relations_created: string[];
    events_appended: number;
    index_updated: boolean;
  };
}

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true }))
  );
});

describe("memory remember CLI", () => {
  it("saves intent-first memory through the shared write path and makes it immediately loadable", async () => {
    const projectRoot = await createInitializedProject("memory-cli-remember-");
    const output = createCapturedOutput();
    const input = {
      task: "Document billing retry location",
      memories: [
        {
          kind: "decision",
          title: "Billing retries run in the worker",
          body:
            "Billing retry execution happens in the queue worker, not inside the HTTP webhook handler.",
          tags: ["billing", "retries"],
          applies_to: ["services/billing/src/workers/retry.ts"],
          evidence: [{ kind: "file", id: "services/billing/src/workers/retry.ts" }]
        }
      ]
    };

    const exitCode = await main(["node", "memory", "remember", "--stdin", "--json"], {
      ...output.writers,
      cwd: projectRoot,
      stdin: Readable.from([JSON.stringify(input)])
    });

    expect(exitCode).toBe(0);
    expect(output.stderr()).toBe("");
    const envelope = JSON.parse(output.stdout()) as RememberEnvelope;
    expect(envelope.ok).toBe(true);
    expect(envelope.data.dry_run).toBe(false);
    expect(envelope.data.memory_created).toEqual(["decision.billing-retries-run-in-the-worker"]);
    expect(envelope.data.events_appended).toBe(1);
    expect(envelope.data.index_updated).toBe(true);

    const storage = await readCanonicalStorage(projectRoot);
    expect(storage.ok).toBe(true);
    if (storage.ok) {
      const saved = storage.data.objects.find(
        (object) => object.sidecar.id === "decision.billing-retries-run-in-the-worker"
      );
      expect(saved?.sidecar.facets).toEqual({
        category: "decision-rationale",
        applies_to: ["services/billing/src/workers/retry.ts"]
      });
    }

    const loaded = await loadMemory({
      cwd: projectRoot,
      task: "where do billing retries run",
      clock: createFixedTestClock()
    });
    expect(loaded.ok).toBe(true);
    if (loaded.ok) {
      expect(loaded.data.included_ids).toContain(
        "decision.billing-retries-run-in-the-worker"
      );
    }
  });

  it("dry-runs the generated patch without writing canonical memory", async () => {
    const projectRoot = await createInitializedProject("memory-cli-remember-dry-run-");
    const output = createCapturedOutput();
    const eventsBefore = await readFile(join(projectRoot, ".memory", "events.jsonl"), "utf8");
    const input = {
      task: "Preview durable memory",
      memories: [
        {
          kind: "fact",
          title: "Preview fact",
          body: "This fact should only be planned."
        }
      ]
    };

    const exitCode = await main(
      ["node", "memory", "remember", "--stdin", "--dry-run", "--json"],
      {
        ...output.writers,
        cwd: projectRoot,
        stdin: Readable.from([JSON.stringify(input)])
      }
    );

    expect(exitCode).toBe(0);
    const envelope = JSON.parse(output.stdout()) as RememberEnvelope;
    expect(envelope.data.dry_run).toBe(true);
    expect(envelope.data.memory_created).toEqual(["fact.preview-fact"]);
    expect(envelope.data.index_updated).toBe(false);
    await expect(readFile(join(projectRoot, ".memory", "events.jsonl"), "utf8")).resolves.toBe(
      eventsBefore
    );
  });
});

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
