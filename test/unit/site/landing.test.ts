import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repoRoot = resolve(fileURLToPath(new URL("../../..", import.meta.url)));

describe("site landing page", () => {
  it("states the sharpened value proposition and primary actions", async () => {
    const landing = await readFile(resolve(repoRoot, "site/src/pages/index.astro"), "utf8");

    expect(landing).toContain("Stop re-explaining your<br />repo to AI agents.");
    expect(landing).toContain(
      "Aictx gives agents durable project memory they can load before work and update after"
    );
    expect(landing).toContain("Not a chat transcript archive or always-on capture server.");
    expect(landing).toContain("project knowledge as reviewable repo memory.");
    expect(landing).toContain("Install Aictx");
    expect(landing).toContain("Browse demo");
    expect(landing).not.toContain("Join discussions");
    expect(landing).toContain("npm install -g @aictx/memory");
    expect(landing).toContain("Project memory for Codex.");
    expect(landing).toContain("Not capture-everything memory");
    expect(landing).toContain("Keep decisions, constraints, workflows, and gotchas");
    expect(landing).not.toContain("Token-efficient context");
    expect(landing).toContain("Context");
    expect(landing).toContain("Codex starts with the missing context.");
    expect(landing).toContain("Worked for 7m 18s");
    expect(landing).toContain("AI Context Pack");
    expect(landing).toContain("Remind me: are we still avoiding dashboard-style UI here?");
    expect(landing).toContain("aictx load \"improve viewer search UI\"");
    expect(landing).toContain("Loaded 6 relevant memories before editing");
    expect(landing).toContain("Viewer memory page follows a document-style handbook layout.");
    expect(landing).toContain("Viewer");
    expect(landing).toContain("Inspect the memory agents will use.");
    expect(landing).toContain("AGENTS.md");
    expect(landing).toContain("only source of context");
    expect(landing).toContain("Searchable decisions, workflows, gotchas, and sources");
    expect(landing).toContain("Review");
    expect(landing).toContain("Let agents learn under review.");
    expect(landing).toContain("Useful knowledge. No durable review.");
    expect(landing).toContain("aictx diff");
    expect(landing).toContain("Review, commit, or roll back.");
  });

  it("keeps community navigation in the header instead of the hero", async () => {
    const layout = await readFile(resolve(repoRoot, "site/src/layouts/BaseLayout.astro"), "utf8");

    expect(layout).toContain("Discussions");
    expect(layout).toContain("https://github.com/MicrexIT/aictx/discussions");
  });

  it("frames the demo as human inspection of future agent memory", async () => {
    const landing = await readFile(resolve(repoRoot, "site/src/pages/index.astro"), "utf8");

    expect(landing).toContain("See the memory future agents will use.");
    expect(landing).toContain("Inspect the local project memory your agents load before work.");
    expect(landing).not.toContain("Browse the local handbook");
  });
});
