import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repoRoot = resolve(fileURLToPath(new URL("../../..", import.meta.url)));

describe("site landing page", () => {
  it("states the sharpened value proposition and primary actions", async () => {
    const landing = await readFile(resolve(repoRoot, "site/src/pages/index.astro"), "utf8");

    expect(landing).toContain("Local-first and open source");
    expect(landing).toContain("Stop re&#8209;explaining your");
    expect(landing).toContain("repo to AI agents.");
    expect(landing).toContain('class="value-section context-section" id="context"');
    expect(landing).not.toContain('class="value-grid"');
    expect(landing).toContain("Why Memory?");
    expect(landing).toContain("Durable project memory for AI agents");
    expect(landing).toContain("load only");
    expect(landing).toContain("inspect what agents remember.");
    expect(landing).toContain('class="comparison comparison-why" aria-label="Why use Memory"');
    expect(landing).toContain("<strong>Set it up once.</strong>");
    expect(landing).toContain("Give your repo durable memory for the product intent, decisions");
    expect(landing).toContain("workflows, conventions, and gotchas agents usually need you to repeat.");
    expect(landing).toContain("<strong>Load what matters.</strong>");
    expect(landing).toContain("Agents pull focused context before work &mdash; no long briefing");
    expect(landing).toContain("giant prompt, vector database, or retrieval stack to maintain.");
    expect(landing).toContain("<strong>See what agents remember.</strong>");
    expect(landing).toContain("Inspect the same typed memory agents use, including objects, schema");
    expect(landing).toContain("relations, provenance, and graph context, in a local visual viewer.");
    expect(landing).not.toContain("<strong>Review it like code.</strong>");
    expect(landing).toContain("Get started");
    expect(landing).toContain('aria-label="Get started with Memory"');
    expect(landing).not.toContain("Install Memory");
    expect(landing).toContain("Open viewer");
    expect(landing).not.toContain("Join discussions");
    expect(landing).toContain("npm install -g @aictx/memory");
    expect(landing).not.toContain('class="why-block"');
    expect(landing).not.toContain("Why not AGENTS.md only?");
    expect(landing).not.toContain("Why not long context?");
    expect(landing).not.toContain("Why not RAG?");
    expect(landing).not.toContain("Why local files?");
    expect(landing).not.toContain("Token-efficient context");
    expect(landing).not.toContain("No hosted dependency");
    expect(landing).not.toContain(
      "Core memory works without a cloud account, embeddings, hosted sync, or external model API."
    );
    expect(landing).not.toContain("Durable memory beats bigger prompts.");
    expect(landing).not.toContain("Memory turns the README promise into a working loop");
    expect(landing).not.toContain("Create starter memory and short repo guidance in one first-run workflow.");
    expect(landing).not.toContain("Task-focused context");
    expect(landing).not.toContain("Reviewable repo memory");
    expect(landing).not.toContain("Keep AGENTS.md small.");
    expect(landing).not.toContain('<section class="split-section" id="context"');
    expect(landing).toContain("Proof in the first five minutes.");
    expect(landing).toContain("Instead of reopening old decisions");
    expect(landing).toContain("task-shaped context pack before the edit begins.");
    expect(landing).toContain("Context");
    expect(landing).not.toContain("Codex starts with the missing context.");
    expect(landing).toContain("Worked for 7m 18s");
    expect(landing).toContain("AI Context Pack");
    expect(landing).toContain("Remind me: are we still avoiding dashboard-style UI here?");
    expect(landing).toContain("memory load \"improve viewer search UI\"");
    expect(landing).toContain("Loaded 6 relevant memories before editing");
    expect(landing).toContain("Viewer memory page shows canonical types, facets, scopes, and relations first.");
    expect(landing).not.toContain("Inspect the memory agents will use.");
    expect(landing).not.toContain("The repo keeps the briefing.");
    expect(landing).not.toContain("become local, reviewable repo memory.");
    expect(landing).not.toContain("would otherwise ask you to repeat.");
    expect(landing).not.toContain('id="workflow"');
    expect(landing).not.toContain("Turn repeated briefings into repo memory.");
    expect(landing).not.toContain('class="setup-value-grid"');
    expect(landing).not.toContain("Less repeated context.");
    expect(landing).not.toContain("Cleaner instruction files.");
    expect(landing).not.toContain("Reviewable by default.");
    expect(landing).not.toContain("Project memory becomes repo state.");
    expect(landing).not.toContain("Typed local memory.");
    expect(landing).not.toContain("Short agent files.");
    expect(landing).not.toContain("Ready next session.");
    expect(landing).not.toContain('class="steps setup-steps"');
    expect(landing).not.toContain("Make project context part of the repo.");
    expect(landing).not.toContain("One activation writes the memory layer and short agent guidance.");
    expect(landing).not.toContain("Memory lives with the code.");
    expect(landing).not.toContain("Instructions stay readable.");
    expect(landing).not.toContain("The repo can brief the agent.");
    expect(landing).not.toContain("Memory keeps the everyday loop small after the first setup");
    expect(landing).not.toContain("set up once</span>");
    expect(landing).not.toContain("load relevant reminders");
    expect(landing).not.toContain("Create the memory layer.");
    expect(landing).not.toContain("Load the right reminders.");
    expect(landing).not.toContain("Save what future sessions should remember.");
    expect(landing).not.toContain("The agent loads the project context it needs.");
    expect(landing).not.toContain("The agent does the work with that context.");
    expect(landing).not.toContain("The agent saves what future agents should remember.");
    expect(landing).not.toContain("Load context. Save memory. Review the diff.");
    expect(landing).not.toContain("memory load \"change auth routes\"");
    expect(landing).not.toContain("memory save --stdin");
    expect(landing).not.toContain("memory diff");
    expect(landing).not.toContain("Let agents learn under review.");
    expect(landing).not.toContain("Useful knowledge. No durable review.");
    expect(landing).not.toContain("Review, commit, or roll back.");
  });

  it("keeps header and footer navigation focused", async () => {
    const layout = await readFile(resolve(repoRoot, "site/src/layouts/BaseLayout.astro"), "utf8");
    const desktopViewerIndex = layout.indexOf('href="/#demo">Demo Viewer</a>');
    const desktopDocsIndex = layout.indexOf('href="https://docs.aictx.dev" rel="noreferrer">Docs</a>');
    const desktopUseCasesIndex = layout.indexOf('href="/use-cases/">Use Cases</a>');
    const mobileMenuStart = layout.indexOf('class="mobile-menu-panel"');
    const mobileMenuEnd = layout.indexOf('class="github-pill"');
    const mobileMenu = layout.slice(mobileMenuStart, mobileMenuEnd);
    const mobileViewerIndex = mobileMenu.indexOf('href="/#demo">Demo Viewer</a>');
    const mobileDocsIndex = mobileMenu.indexOf('href="https://docs.aictx.dev" rel="noreferrer">Docs</a>');
    const mobileUseCasesIndex = mobileMenu.indexOf('href="/use-cases/">Use Cases</a>');

    expect(layout).toContain("Open navigation menu");
    expect(layout).toContain('<link rel="icon" href="/favicon.ico" sizes="any" />');
    expect(layout).toContain(
      '<img class="brand-mark" src="/favicon.ico" width="34" height="34" alt="" aria-hidden="true" />'
    );
    expect(layout).not.toContain('href="/#context">Context</a>');
    expect(layout).not.toContain('href="/favicon.svg"');
    expect(layout).not.toContain('href="/#demo">Demo</a>');
    expect(layout).not.toContain('https://demo.aictx.dev/?token=demo');
    expect(desktopViewerIndex).toBeGreaterThan(-1);
    expect(desktopDocsIndex).toBeGreaterThan(-1);
    expect(desktopUseCasesIndex).toBeGreaterThan(-1);
    expect(desktopViewerIndex).toBeLessThan(desktopDocsIndex);
    expect(desktopDocsIndex).toBeLessThan(desktopUseCasesIndex);
    expect(mobileViewerIndex).toBeGreaterThan(-1);
    expect(mobileDocsIndex).toBeGreaterThan(-1);
    expect(mobileUseCasesIndex).toBeGreaterThan(-1);
    expect(mobileViewerIndex).toBeLessThan(mobileDocsIndex);
    expect(mobileDocsIndex).toBeLessThan(mobileUseCasesIndex);
    expect(layout).not.toContain('href="/#workflow">How it works</a>');
    expect(layout).not.toContain(">Demo</a>");
    expect(layout).not.toContain("Discussions");
    expect(layout).not.toContain("https://github.com/aictx/memory/discussions");
    expect(layout).toContain('<strong data-star-count="compact"></strong>');
    expect(layout).toContain("Footer navigation");
    expect(layout).toContain("Local, reviewable project memory for AI coding tools.");
    expect(layout).toContain('<a href="mailto:michele@remics.tech">Contact us</a>');
    await expect(stat(resolve(repoRoot, "site/public/favicon.ico"))).resolves.toMatchObject({
      size: expect.any(Number)
    });
  });

  it("frames the demo as a schema and graph inspection surface", async () => {
    const landing = await readFile(resolve(repoRoot, "site/src/pages/index.astro"), "utf8");

    expect(landing).toContain("Inspect the memory schema and graph.");
    expect(landing).toContain("Browse a local memory database with canonical object types");
    expect(landing).toContain("relation overviews");
    expect(landing).toContain("memory schema graph with relation overview");
    expect(landing).not.toContain("Browse the local handbook");
  });

  it("places context, focused loading, and viewer proof in that order", async () => {
    const landing = await readFile(resolve(repoRoot, "site/src/pages/index.astro"), "utf8");
    const contextIndex = landing.indexOf('id="context"');
    const beforeAfterIndex = landing.indexOf('id="before-after"');
    const demoIndex = landing.indexOf('id="demo"');

    expect(contextIndex).toBeGreaterThan(-1);
    expect(beforeAfterIndex).toBeGreaterThan(-1);
    expect(demoIndex).toBeGreaterThan(-1);
    expect(contextIndex).toBeLessThan(beforeAfterIndex);
    expect(beforeAfterIndex).toBeLessThan(demoIndex);
  });
});
