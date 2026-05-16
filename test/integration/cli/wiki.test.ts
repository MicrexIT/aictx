import { mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";

import { afterEach, describe, expect, it } from "vitest";

import { main, type CliOutputWriter } from "../../../src/cli/main.js";
import { readCanonicalStorage } from "../../../src/storage/read.js";
import { FIXED_TIMESTAMP } from "../../fixtures/time.js";

const tempRoots: string[] = [];

interface WikiRememberEnvelope {
  ok: true;
  data: {
    dry_run: boolean;
    source_id?: string;
    memory_created: string[];
    memory_updated: string[];
    relations_created: string[];
    events_appended: number;
    index_updated: boolean;
  };
}

interface WikiLintEnvelope {
  ok: true;
  data: {
    findings: Array<{
      rule: string;
      memory_id: string;
    }>;
  };
}

interface WikiLogEnvelope {
  ok: true;
  data: {
    entries: Array<{
      event: string;
      actor: string;
      timestamp: string;
      id: string | null;
      relation_id: string | null;
      reason: string | null;
    }>;
  };
}

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true }))
  );
});

describe("aictx wiki CLI", () => {
  it("ingests a source and auto-links new semantic memory in one atomic patch", async () => {
    const projectRoot = await createInitializedProject("aictx-cli-wiki-ingest-");
    const output = await runCli(
      ["node", "aictx", "wiki", "ingest", "--stdin", "--json"],
      projectRoot,
      wikiIngestInput()
    );

    expect(output.exitCode).toBe(0);
    expect(output.stderr).toBe("");
    const envelope = JSON.parse(output.stdout) as WikiRememberEnvelope;

    expect(envelope.ok).toBe(true);
    expect(envelope.data.dry_run).toBe(false);
    expect(envelope.data.source_id).toBe("source.karpathy-llm-wiki");
    expect(envelope.data.memory_created).toEqual([
      "source.karpathy-llm-wiki",
      "synthesis.persistent-wiki-pattern"
    ]);
    expect(envelope.data.relations_created).toHaveLength(1);
    expect(envelope.data.events_appended).toBe(3);
    expect(envelope.data.index_updated).toBe(true);

    const storage = await readCanonicalStorage(projectRoot);
    expect(storage.ok).toBe(true);
    if (!storage.ok) {
      return;
    }

    const source = storage.data.objects.find(
      (object) => object.sidecar.id === "source.karpathy-llm-wiki"
    );
    expect(source?.sidecar.origin).toEqual({
      kind: "url",
      locator: "https://example.com/llm-wiki",
      captured_at: FIXED_TIMESTAMP,
      media_type: "text/markdown"
    });
    expect(storage.data.relations).toContainEqual(
      expect.objectContaining({
        relation: expect.objectContaining({
          from: "synthesis.persistent-wiki-pattern",
          predicate: "derived_from",
          to: "source.karpathy-llm-wiki"
        })
      })
    );
  });

  it("dry-runs wiki ingest without changing canonical files", async () => {
    const projectRoot = await createInitializedProject("aictx-cli-wiki-dry-run-");
    const eventsBefore = await readFile(join(projectRoot, ".aictx", "events.jsonl"), "utf8");

    const output = await runCli(
      ["node", "aictx", "wiki", "ingest", "--stdin", "--dry-run", "--json"],
      projectRoot,
      wikiIngestInput()
    );

    expect(output.exitCode).toBe(0);
    expect(output.stderr).toBe("");
    const envelope = JSON.parse(output.stdout) as WikiRememberEnvelope;

    expect(envelope.data.dry_run).toBe(true);
    expect(envelope.data.memory_created).toEqual([
      "source.karpathy-llm-wiki",
      "synthesis.persistent-wiki-pattern"
    ]);
    expect(envelope.data.index_updated).toBe(false);
    await expect(readFile(join(projectRoot, ".aictx", "events.jsonl"), "utf8")).resolves.toBe(
      eventsBefore
    );
  });

  it("files useful query results through the intent-first remember path", async () => {
    const projectRoot = await createInitializedProject("aictx-cli-wiki-file-");
    const output = await runCli(
      ["node", "aictx", "wiki", "file", "--stdin", "--json"],
      projectRoot,
      {
        task: "File useful query result",
        memories: [
          {
            kind: "synthesis",
            title: "Query result filing",
            body:
              "Useful query results can be filed as durable synthesis memory instead of disappearing into chat history.",
            tags: ["wiki", "query-result"]
          }
        ]
      }
    );

    expect(output.exitCode).toBe(0);
    expect(output.stderr).toBe("");
    const envelope = JSON.parse(output.stdout) as WikiRememberEnvelope;

    expect(envelope.ok).toBe(true);
    expect(envelope.data.memory_created).toEqual(["synthesis.query-result-filing"]);
    expect(envelope.data.events_appended).toBe(1);
  });

  it("lints with audit semantics and does not mutate storage", async () => {
    const projectRoot = await createInitializedProject("aictx-cli-wiki-lint-");
    await runCli(
      ["node", "aictx", "remember", "--stdin", "--json"],
      projectRoot,
      {
        task: "Create source without origin",
        memories: [
          {
            kind: "source",
            id: "source.no-origin",
            title: "Source without origin",
            body: "This source record intentionally lacks origin metadata for wiki lint.",
            tags: ["wiki"],
            evidence: [{ kind: "file", id: "docs/source.md" }]
          }
        ]
      }
    );
    const eventsBefore = await readFile(join(projectRoot, ".aictx", "events.jsonl"), "utf8");

    const output = await runCli(
      ["node", "aictx", "wiki", "lint", "--json"],
      projectRoot
    );

    expect(output.exitCode).toBe(0);
    expect(output.stderr).toBe("");
    const envelope = JSON.parse(output.stdout) as WikiLintEnvelope;

    expect(envelope.ok).toBe(true);
    expect(envelope.data.findings).toContainEqual(
      expect.objectContaining({
        rule: "source_missing_origin",
        memory_id: "source.no-origin"
      })
    );
    await expect(readFile(join(projectRoot, ".aictx", "events.jsonl"), "utf8")).resolves.toBe(
      eventsBefore
    );
  });

  it("renders deterministic event history without mutating storage", async () => {
    const projectRoot = await createInitializedProject("aictx-cli-wiki-log-");
    await runCli(
      ["node", "aictx", "wiki", "file", "--stdin", "--json"],
      projectRoot,
      {
        task: "Record one loggable event",
        memories: [
          {
            kind: "fact",
            title: "Wiki log records events",
            body: "The wiki log command renders canonical event history without writing memory."
          }
        ]
      }
    );
    const eventsBefore = await readFile(join(projectRoot, ".aictx", "events.jsonl"), "utf8");

    const output = await runCli(
      ["node", "aictx", "wiki", "log", "--limit", "1", "--json"],
      projectRoot
    );

    expect(output.exitCode).toBe(0);
    expect(output.stderr).toBe("");
    const envelope = JSON.parse(output.stdout) as WikiLogEnvelope;

    expect(envelope.ok).toBe(true);
    expect(envelope.data.entries).toEqual([
      expect.objectContaining({
        event: "memory.created",
        actor: "agent",
        id: "fact.wiki-log-records-events",
        relation_id: null,
        reason: null
      })
    ]);
    await expect(readFile(join(projectRoot, ".aictx", "events.jsonl"), "utf8")).resolves.toBe(
      eventsBefore
    );
  });
});

function wikiIngestInput(): Record<string, unknown> {
  return {
    task: "Ingest Karpathy LLM wiki note",
    source: {
      id: "source.karpathy-llm-wiki",
      title: "Source: Karpathy LLM Wiki",
      body:
        "Karpathy describes a persistent, source-backed wiki maintained by an LLM agent.",
      tags: ["wiki", "llm"],
      origin: {
        kind: "url",
        locator: "https://example.com/llm-wiki",
        captured_at: FIXED_TIMESTAMP,
        media_type: "text/markdown"
      }
    },
    memories: [
      {
        kind: "synthesis",
        id: "synthesis.persistent-wiki-pattern",
        title: "Persistent wiki pattern",
        body:
          "A persistent wiki stores source-backed syntheses, cross-references, and maintenance signals so knowledge compounds across agent sessions.",
        tags: ["wiki", "knowledge-base"],
        category: "concept"
      }
    ]
  };
}

async function createInitializedProject(prefix: string): Promise<string> {
  const projectRoot = await createTempRoot(prefix);
  const output = await runCli(["node", "aictx", "init", "--json"], projectRoot);

  expect(output.exitCode).toBe(0);
  expect(output.stderr).toBe("");

  return projectRoot;
}

async function createTempRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  const resolvedRoot = await realpath(root);
  tempRoots.push(resolvedRoot);
  return resolvedRoot;
}

async function runCli(
  argv: string[],
  cwd: string,
  input?: unknown
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const output = createCapturedOutput();
  const exitCode = await main(argv, {
    ...output.writers,
    cwd,
    ...(input === undefined
      ? {}
      : { stdin: Readable.from([JSON.stringify(input)]) })
  });

  return {
    exitCode,
    stdout: output.stdout(),
    stderr: output.stderr()
  };
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
