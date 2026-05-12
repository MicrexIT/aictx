import { describe, expect, it } from "vitest";

import { main, type CliOutputWriter } from "../../../src/cli/main.js";

describe("aictx docs", () => {
  it("lists bundled public docs topics", async () => {
    const output = createCapturedOutput();

    const exitCode = await main(["node", "aictx", "docs"], output.writers);

    expect(exitCode).toBe(0);
    expect(output.stderr()).toBe("");
    expect(output.stdout()).toContain("Aictx docs: https://docs.aictx.dev/");
    expect(output.stdout()).toContain("- getting-started:");
    expect(output.stdout()).toContain("- capabilities:");
    expect(output.stdout()).toContain("- specializing-aictx:");
    expect(output.stdout()).toContain("- demand-driven-memory:");
    expect(output.stdout()).toContain("- agent-integration:");
    expect(output.stdout()).toContain("- agent-recipes:");
  });

  it("prints a bundled topic without Starlight frontmatter", async () => {
    const output = createCapturedOutput();

    const exitCode = await main(["node", "aictx", "docs", "quickstart"], output.writers);

    expect(exitCode).toBe(0);
    expect(output.stderr()).toBe("");
    expect(output.stdout()).toContain("# Getting started");
    expect(output.stdout()).toContain("aictx init");
    expect(output.stdout()).not.toMatch(/^---\n/u);
  });

  it("returns JSON envelopes for topic output", async () => {
    const output = createCapturedOutput();

    const exitCode = await main(
      ["node", "aictx", "--json", "docs", "agents"],
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

    const exitCode = await main(["node", "aictx", "docs", "memory-quality"], output.writers);

    expect(exitCode).toBe(0);
    expect(output.stderr()).toBe("");
    expect(output.stdout()).toContain("# Demand-driven memory");
    expect(output.stdout()).toContain("load -> work/fail/correction");
  });

  it("prints the bundled capabilities topic", async () => {
    const output = createCapturedOutput();

    const exitCode = await main(["node", "aictx", "docs", "features"], output.writers);

    expect(exitCode).toBe(0);
    expect(output.stderr()).toBe("");
    expect(output.stdout()).toContain("# Capabilities");
    expect(output.stdout()).toContain("Routine memory work");
  });

  it("prints the bundled agent recipes topic", async () => {
    const output = createCapturedOutput();

    const exitCode = await main(["node", "aictx", "docs", "agent-recipes"], output.writers);

    expect(exitCode).toBe(0);
    expect(output.stderr()).toBe("");
    expect(output.stdout()).toContain("# Agent recipes");
    expect(output.stdout()).toContain("Codex");
    expect(output.stdout()).toContain("Cursor");
    expect(output.stdout()).toContain("aictx setup");
    expect(output.stdout()).toContain("start the local viewer for inspection");
  });

  it("opens the hosted docs URL through the injected opener", async () => {
    const output = createCapturedOutput();
    const openedUrls: string[] = [];

    const exitCode = await main(["node", "aictx", "docs", "reference", "--open"], {
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

    const exitCode = await main(["node", "aictx", "docs", "does-not-exist"], output.writers);

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
