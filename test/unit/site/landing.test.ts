import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  buildSitemapXml,
  buildStructuredData,
  llmsTxt,
  mainSiteUrl,
  robotsTxt,
  siteName,
  staticSitePaths
} from "../../../site/src/seo.js";

const repoRoot = resolve(fileURLToPath(new URL("../../..", import.meta.url)));

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ");
}

describe("site landing page", () => {
  it("states the sharpened value proposition and primary actions", async () => {
    const landing = await readFile(resolve(repoRoot, "site/src/pages/index.astro"), "utf8");
    const normalizedLanding = normalizeWhitespace(landing);
    const heroIdentityStart = landing.indexOf('class="hero-identity"');
    const heroIdentityEnd = landing.indexOf("</p>", heroIdentityStart);
    const heroIdentity = normalizeWhitespace(landing.slice(heroIdentityStart, heroIdentityEnd));

    expect(landing).toContain("Open source by Aictx");
    expect(landing).toContain("Stop re&#8209;explaining your");
    expect(landing).toContain("repo to AI agents.");
    expect(heroIdentity).toContain(
      "Memory by Aictx provides local, reviewable, and auto-maintained project memory for AI coding agents."
    );
    expect(heroIdentity).not.toContain("Memory by Aictx is the open source npm package");
    expect(heroIdentity).not.toContain("independent and not affiliated");
    expect(landing).toMatch(/class="value-section context-section"\s+id="context"/);
    expect(landing).not.toContain('class="value-grid"');
    expect(landing).toContain("Why Memory?");
    expect(landing).toContain("Durable project memory for AI agents");
    expect(landing).toContain("load only");
    expect(landing).toContain("inspect what agents remember.");
    expect(landing).toContain('class="comparison comparison-why" aria-label="Why use Memory"');
    expect(landing).toContain("<strong>Set it up once.</strong>");
    expect(normalizedLanding).toContain(
      "Give your repo durable memory for the product intent, decisions, workflows, conventions, and gotchas agents usually need you to repeat."
    );
    expect(landing).toContain("<strong>Load what matters.</strong>");
    expect(landing).toContain("Agents pull focused context before work &mdash; no long briefing");
    expect(landing).toContain("giant prompt, vector database, or retrieval stack to maintain.");
    expect(landing).toContain("<strong>See what agents remember.</strong>");
    expect(normalizedLanding).toContain(
      "Inspect the same typed memory agents use, including objects, schema, relations, provenance, and graph context, in a local visual viewer."
    );
    expect(landing).not.toContain("<strong>Review it like code.</strong>");
    expect(landing).toContain("Get started");
    expect(landing).toContain('aria-label="Get started with Memory"');
    expect(landing).toContain('aria-label="Install commands"');
    expect(landing).not.toContain("Install Memory");
    expect(landing).toContain("Open viewer");
    expect(landing).not.toContain("Join discussions");
    expect(landing).toContain("Homebrew");
    expect(landing).toContain("brew install aictx/tap/memory");
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
    expect(normalizedLanding).toContain(
      "Viewer memory page shows canonical types, facets, scopes, and relations first."
    );
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
    expect(layout).toContain("Memory by Aictx - Persistent Memory for AI Coding Agents");
    expect(layout).toContain("Memory by Aictx gives AI coding agents local, reviewable, auto-maintained project memory");
    expect(siteName).toBe("Memory by Aictx");
    expect(layout).toContain('<link rel="canonical" href={canonicalUrl} />');
    expect(layout).toContain('<meta property="og:site_name" content={siteName} />');
    expect(layout).toContain('<meta property="og:url" content={canonicalUrl} />');
    expect(layout).toContain('<meta property="og:image" content={socialImage} />');
    expect(layout).toContain('<meta property="og:image:alt" content="Memory by Aictx project memory overview" />');
    expect(layout).toContain('<meta name="twitter:card" content="summary_large_image" />');
    expect(layout).toContain('<meta name="twitter:image" content={socialImage} />');
    expect(layout).toContain("const websiteJsonLd = buildStructuredData(siteUrl);");
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
    expect(layout).toContain("<strong>Memory by Aictx</strong>");
    expect(layout).toContain(
      "Local, reviewable, auto-maintained project memory for AI coding agents."
    );
    expect(layout).toContain('<a href="mailto:michele@remics.tech">Contact us</a>');
    await expect(stat(resolve(repoRoot, "site/public/favicon.ico"))).resolves.toMatchObject({
      size: expect.any(Number)
    });
  });

  it("publishes parseable structured data for the product entity", () => {
    const structuredData = buildStructuredData(new URL(mainSiteUrl));
    const parsed = JSON.parse(JSON.stringify(structuredData)) as {
      "@context": string;
      "@graph": Array<Record<string, unknown>>;
    };
    const graphTypes = parsed["@graph"].map((item) => item["@type"]);

    expect(parsed["@context"]).toBe("https://schema.org");
    expect(graphTypes).toEqual(expect.arrayContaining(["Organization", "WebSite", "SoftwareApplication"]));
    expect(parsed["@graph"]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          "@type": "SoftwareApplication",
          name: "Memory by Aictx",
          alternateName: ["Memory", "@aictx/memory"],
          codeRepository: "https://github.com/aictx/memory",
          downloadUrl: [
            "https://www.npmjs.com/package/@aictx/memory",
            "https://github.com/aictx/homebrew-tap"
          ]
        })
      ])
    );
  });

  it("uses memory.aictx.dev as the canonical site host", async () => {
    const siteConfig = await readFile(resolve(repoRoot, "site/astro.config.mjs"), "utf8");
    const wranglerConfig = await readFile(resolve(repoRoot, "wrangler.jsonc"), "utf8");
    const readme = await readFile(resolve(repoRoot, "README.md"), "utf8");

    expect(siteConfig).toContain('site: "https://memory.aictx.dev"');
    expect(wranglerConfig).toContain('"pattern": "memory.aictx.dev"');
    expect(wranglerConfig).toContain('"custom_domain": true');
    expect(readme).toContain('href="https://memory.aictx.dev"');
    expect(readme).toContain("website-memory.aictx.dev");
  });

  it("publishes crawler and agent-readable source surfaces", async () => {
    const robotsEndpoint = await readFile(resolve(repoRoot, "site/src/pages/robots.txt.ts"), "utf8");
    const sitemapEndpoint = await readFile(resolve(repoRoot, "site/src/pages/sitemap.xml.ts"), "utf8");
    const llmsEndpoint = await readFile(resolve(repoRoot, "site/src/pages/llms.txt.ts"), "utf8");
    const docsRobots = await readFile(resolve(repoRoot, "docs/public/robots.txt"), "utf8");
    const sitemap = buildSitemapXml([...staticSitePaths, "/blog/example-post/"]);

    expect(robotsEndpoint).toContain("robotsTxt");
    expect(sitemapEndpoint).toContain('getCollection("blog")');
    expect(sitemapEndpoint).toContain("buildSitemapXml(paths)");
    expect(llmsEndpoint).toContain("llmsTxt");
    expect(robotsTxt).toContain("User-agent: *");
    expect(robotsTxt).toContain("Allow: /");
    expect(robotsTxt).toContain("Sitemap: https://memory.aictx.dev/sitemap.xml");
    expect(docsRobots).toContain("Sitemap: https://docs.aictx.dev/sitemap-index.xml");
    expect(llmsTxt).toContain("# Memory by Aictx");
    expect(llmsTxt).toContain("Package: https://www.npmjs.com/package/@aictx/memory");
    expect(llmsTxt).toContain("Homebrew: brew install aictx/tap/memory");
    expect(llmsTxt).toContain("CLI: memory");
    expect(llmsTxt).toContain("MCP server: memory-mcp");
    expect(llmsTxt).toContain(
      "Memory by Aictx provides local, reviewable, auto-maintained project memory for AI coding agents."
    );
    expect(llmsTxt).toContain("auto-maintained project memory");
    expect(llmsTxt).not.toContain("not affiliated");
    expect(llmsTxt).not.toContain("sponsored by");
    expect(llmsTxt).not.toContain("endorsed by");
    expect(sitemap).toContain("<loc>https://memory.aictx.dev/</loc>");
    expect(sitemap).toContain("<loc>https://memory.aictx.dev/blog/</loc>");
    expect(sitemap).toContain("<loc>https://memory.aictx.dev/use-cases/</loc>");
    expect(sitemap).toContain("<loc>https://memory.aictx.dev/blog/example-post/</loc>");
  });

  it("keeps public identity copy calm and factual", async () => {
    const files = await Promise.all(
      [
        "README.md",
        "site/src/pages/index.astro",
        "site/src/seo.ts",
        "docs/src/content/docs/index.md"
      ].map(async (path) => readFile(resolve(repoRoot, path), "utf8"))
    );
    const publicCopy = files.join("\n").toLowerCase();

    expect(publicCopy).toContain("memory by aictx");
    expect(publicCopy).toContain("@aictx/memory");
    expect(publicCopy).toContain("auto-maintained");
    expect(publicCopy).not.toContain("not affiliated");
    expect(publicCopy).not.toContain("sponsored by");
    expect(publicCopy).not.toContain("endorsed by");
    expect(publicCopy).not.toMatch(/\bscam\w*\b/);
    expect(publicCopy).not.toMatch(/\bcopying\b|\bcopied\b/);
    expect(publicCopy).not.toMatch(/\boriginal\b/);
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
