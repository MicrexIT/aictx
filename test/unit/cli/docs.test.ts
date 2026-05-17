import { readdir } from "node:fs/promises";
import { basename } from "node:path";

import { describe, expect, it } from "vitest";

import { main, type CliOutputWriter } from "../../../src/cli/main.js";

describe("memory docs", () => {
  it("lists bundled public docs topics", async () => {
    const output = createCapturedOutput();

    const exitCode = await main(["node", "memory", "docs"], output.writers);

    expect(exitCode).toBe(0);
    expect(output.stderr()).toBe("");
    expect(output.stdout()).toContain("Memory docs: https://docs.aictx.dev/");
    expect(output.stdout()).toContain("- getting-started:");
    expect(output.stdout()).toContain("- capabilities:");
    expect(output.stdout()).toContain("- specializing-memory:");
    expect(output.stdout()).toContain("- demand-driven-memory:");
    expect(output.stdout()).toContain("- wiki-workflow:");
    expect(output.stdout()).toContain("- agent-integration:");
    expect(output.stdout()).toContain("- agent-recipes:");
    expect(output.stdout()).toContain("- plugin-publishing:");
  });

  it("keeps the topic list aligned with bundled docs pages", async () => {
    const output = createCapturedOutput();

    const exitCode = await main(["node", "memory", "--json", "docs"], output.writers);

    expect(exitCode).toBe(0);
    expect(output.stderr()).toBe("");

    const envelope = JSON.parse(output.stdout()) as {
      ok: true;
      data: {
        kind: "list";
        topics: { topic: string }[];
      };
    };
    const bundledDocs = await readdir(
      new URL("../../../docs/src/content/docs/", import.meta.url)
    );
    const docTopics = bundledDocs
      .filter((file) => file.endsWith(".md") && file !== "index.md")
      .map((file) => basename(file, ".md"))
      .sort();
    const listedTopics = envelope.data.topics.map((topic) => topic.topic).sort();

    expect(envelope.ok).toBe(true);
    expect(envelope.data.kind).toBe("list");
    expect(listedTopics).toEqual(docTopics);
  });

  it("prints a bundled topic without Starlight frontmatter", async () => {
    const output = createCapturedOutput();

    const exitCode = await main(["node", "memory", "docs", "quickstart"], output.writers);

    expect(exitCode).toBe(0);
    expect(output.stderr()).toBe("");
    expect(output.stdout()).toContain("# Getting started");
    expect(output.stdout()).toContain("memory setup");
    expect(output.stdout()).not.toMatch(/^---\n/u);
  });

  it("returns JSON envelopes for topic output", async () => {
    const output = createCapturedOutput();

    const exitCode = await main(
      ["node", "memory", "--json", "docs", "agents"],
      output.writers
    );

    expect(exitCode).toBe(0);
    expect(output.stderr()).toBe("");
    const envelope = JSON.parse(output.stdout()) as {
      ok: true;
      data: {
        kind: "topic";
        topic: string;
        url: string;
        content: string;
      };
    };

    expect(envelope.ok).toBe(true);
    expect(envelope.data.kind).toBe("topic");
    expect(envelope.data.topic).toBe("agent-integration");
    expect(envelope.data.url).toBe("https://docs.aictx.dev/agent-integration/");
    expect(envelope.data.content).toContain("# Agent integration");
  });

  it("prints the bundled demand-driven memory topic", async () => {
    const output = createCapturedOutput();

    const exitCode = await main(["node", "memory", "docs", "memory-quality"], output.writers);

    expect(exitCode).toBe(0);
    expect(output.stderr()).toBe("");
    expect(output.stdout()).toContain("# Demand-driven memory");
    expect(output.stdout()).toContain("load -> work/fail/correction");
  });

  it("prints the bundled capabilities topic", async () => {
    const output = createCapturedOutput();

    const exitCode = await main(["node", "memory", "docs", "features"], output.writers);

    expect(exitCode).toBe(0);
    expect(output.stderr()).toBe("");
    expect(output.stdout()).toContain("# Capabilities");
    expect(output.stdout()).toContain("Routine memory work");
  });

  it("prints the bundled wiki workflow topic", async () => {
    const output = createCapturedOutput();

    const exitCode = await main(["node", "memory", "docs", "wiki"], output.writers);

    expect(exitCode).toBe(0);
    expect(output.stderr()).toBe("");
    expect(output.stdout()).toContain("# Wiki workflow");
    expect(output.stdout()).toContain("memory wiki ingest");
    expect(output.stdout()).toContain("source records");
  });

  it("prints the bundled agent recipes topic", async () => {
    const output = createCapturedOutput();

    const exitCode = await main(["node", "memory", "docs", "agent-recipes"], output.writers);

    expect(exitCode).toBe(0);
    expect(output.stderr()).toBe("");
    expect(output.stdout()).toContain("# Agent recipes");
    expect(output.stdout()).toContain("Codex");
    expect(output.stdout()).toContain("Cursor");
    expect(output.stdout()).toContain("memory setup");
    expect(output.stdout()).toContain("memory diff");
  });

  it("prints the bundled plugin publishing topic", async () => {
    const output = createCapturedOutput();

    const exitCode = await main(["node", "memory", "docs", "plugin-publishing"], output.writers);

    expect(exitCode).toBe(0);
    expect(output.stderr()).toBe("");
    expect(output.stdout()).toContain("# Publishing Plugins");
    expect(output.stdout()).toContain("codex plugin marketplace add aictx/memory");
    expect(output.stdout()).toContain("claude plugin validate");
  });

  it("opens the hosted docs URL through the injected opener", async () => {
    const output = createCapturedOutput();
    const openedUrls: string[] = [];

    const exitCode = await main(["node", "memory", "docs", "reference", "--open"], {
      ...output.writers,
      docs: {
        opener: (url) => {
          openedUrls.push(url);
        }
      }
    });

    expect(exitCode).toBe(0);
    expect(output.stderr()).toBe("");
    expect(openedUrls).toEqual(["https://docs.aictx.dev/reference/"]);
    expect(output.stdout()).toContain("# Reference");
  });

  it("fails clearly for an unknown topic", async () => {
    const output = createCapturedOutput();

    const exitCode = await main(["node", "memory", "docs", "does-not-exist"], output.writers);

    expect(exitCode).toBe(1);
    expect(output.stdout()).toBe("");
    expect(output.stderr()).toContain("Unknown docs topic: does-not-exist");
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
