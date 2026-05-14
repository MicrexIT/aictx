import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repoRoot = resolve(fileURLToPath(new URL("../../..", import.meta.url)));

describe("site landing page", () => {
  it("states the sharpened value proposition and primary actions", async () => {
    const landing = await readFile(resolve(repoRoot, "site/src/pages/index.astro"), "utf8");

    expect(landing).toContain("Project memory<br />for AI Agents");
    expect(landing).toContain(
      "Aictx stores your repo’s intent, architecture, conventions, setup, and known traps"
    );
    expect(landing).toContain("Stop re-explaining your repo to AI agents.");
    expect(landing).toContain("as reviewable repo memory.");
    expect(landing).toContain("Install Aictx");
    expect(landing).toContain("Browse demo");
    expect(landing).not.toContain("Join discussions");
    expect(landing).toContain("npm install -g @aictx/memory");
    expect(landing).toContain("Works with Codex, Claude Code, Cursor, and MCP-capable agents.");
    expect(landing).toContain("Aictx is not another chat UI or hosted memory service.");
    expect(landing).toContain("Not capture-everything memory");
    expect(landing).toContain("Keep decisions, constraints, workflows, and gotchas future agents should trust.");
    expect(landing).not.toContain("Token-efficient context");
    expect(landing).not.toContain("No hosted dependency");
    expect(landing).not.toContain(
      "Core memory works without a cloud account, embeddings, hosted sync, or external model API."
    );
    expect(landing).toContain("Project memory for Codex.");
    expect(landing).toContain("Context");
    expect(landing).not.toContain("Codex starts with the missing context.");
    expect(landing).toContain("Worked for 7m 18s");
    expect(landing).toContain("AI Context Pack");
    expect(landing).toContain("Remind me: are we still avoiding dashboard-style UI here?");
    expect(landing).toContain("aictx load \"improve viewer search UI\"");
    expect(landing).toContain("Loaded 6 relevant memories before editing");
    expect(landing).toContain("Viewer memory page shows canonical types, facets, scopes, and relations first.");
    expect(landing).not.toContain("Inspect the memory agents will use.");
    expect(landing).toContain("How it works");
    expect(landing).toContain("Aictx keeps the everyday loop small");
    expect(landing).toContain("load relevant memory");
    expect(landing).toContain("save what should last");
    expect(landing).toContain("Load the right project context.");
    expect(landing).toContain("Aictx compiles a focused context pack");
    expect(landing).toContain("Do the work with that context.");
    expect(landing).toContain("known traps, and the verification path already in view");
    expect(landing).toContain("Save what future sessions should remember.");
    expect(landing).toContain("humans can inspect, diff, commit, or roll back");
    expect(landing).not.toContain("The agent loads the project context it needs.");
    expect(landing).not.toContain("The agent does the work with that context.");
    expect(landing).not.toContain("The agent saves what future agents should remember.");
    expect(landing).not.toContain("Load context. Save memory. Review the diff.");
    expect(landing).not.toContain("aictx load \"change auth routes\"");
    expect(landing).not.toContain("aictx save --stdin");
    expect(landing).not.toContain("aictx diff");
    expect(landing).not.toContain("Let agents learn under review.");
    expect(landing).not.toContain("Useful knowledge. No durable review.");
    expect(landing).not.toContain("Review, commit, or roll back.");
  });

  it("keeps header and footer navigation focused", async () => {
    const layout = await readFile(resolve(repoRoot, "site/src/layouts/BaseLayout.astro"), "utf8");

    expect(layout).toContain("Open navigation menu");
    expect(layout).toContain('href="/#demo">Demo</a>');
    expect(layout).not.toContain(">Viewer</a>");
    expect(layout).not.toContain("Discussions");
    expect(layout).not.toContain("https://github.com/MicrexIT/aictx/discussions");
    expect(layout).toContain('<strong data-star-count="compact"></strong>');
    expect(layout).toContain("Footer navigation");
    expect(layout).toContain("Local, reviewable project memory for AI coding tools.");
  });

  it("frames the demo as a generic Todo App memory inspection surface", async () => {
    const landing = await readFile(resolve(repoRoot, "site/src/pages/index.astro"), "utf8");

    expect(landing).toContain("Inspect a real Todo App memory seed.");
    expect(landing).toContain("Browse a generic Todo App project with canonical object types");
    expect(landing).toContain("Todo App memory schema");
    expect(landing).not.toContain("Browse the local handbook");
  });
});
