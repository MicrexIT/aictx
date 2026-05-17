export const mainSiteUrl = "https://memory.aictx.dev";
export const docsSiteUrl = "https://docs.aictx.dev";
export const siteName = "Memory by Aictx";
export const socialImagePath = "/assets/readme-value-header.png";
export const staticSitePaths = ["/", "/blog/", "/use-cases/"] as const;

export const robotsTxt = `User-agent: *
Content-Signal: search=yes, ai-input=yes, ai-train=yes
Allow: /

Sitemap: ${mainSiteUrl}/sitemap.xml
`;

export const llmsTxt = `# Memory by Aictx

Memory by Aictx provides local, reviewable, auto-maintained project memory for AI coding agents.
It is the open source npm package @aictx/memory and runs through the memory CLI and optional memory-mcp server.
Use it as persistent memory and long-term project context for AI coding assistants including Codex, Claude Code, Cursor, Cline, OpenCode, and MCP-capable agents.

Canonical public surfaces:
- Website: ${mainSiteUrl}
- Documentation: ${docsSiteUrl}
- Repository: https://github.com/aictx/memory
- Package: https://www.npmjs.com/package/@aictx/memory
- CLI: memory
- MCP server: memory-mcp
- Persistent memory guide: ${mainSiteUrl}/persistent-memory-ai-coding-agents/
- MCP memory server guide: ${mainSiteUrl}/mcp-memory-server/
- Claude Code memory guide: ${mainSiteUrl}/claude-code-memory/
- Codex memory guide: ${mainSiteUrl}/codex-memory/
- Cursor memory guide: ${mainSiteUrl}/cursor-memory/

Positioning:
- local-first project memory for AI coding agents
- local, reviewable, auto-maintained project memory for AI coding agents
- persistent memory for AI coding assistants
- MCP memory server for project context
- reviewable files under .memory/
- agent-maintained memory updates after meaningful work
- task-focused memory loading before work
- durable save discipline after meaningful work
- visual local viewer for memory objects, schema, relations, provenance, and graph context
`;

export function socialImageUrl(siteUrl: URL): string {
  return new URL(socialImagePath, siteUrl).toString();
}

export function buildStructuredData(siteUrl: URL): object {
  const organizationId = new URL("/#organization", siteUrl).toString();
  const softwareId = new URL("/#software", siteUrl).toString();

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": organizationId,
        name: "Aictx",
        url: new URL("/", siteUrl).toString(),
        logo: new URL("/favicon.ico", siteUrl).toString(),
        sameAs: ["https://github.com/aictx/memory", "https://www.npmjs.com/package/@aictx/memory"]
      },
      {
        "@type": "WebSite",
        name: siteName,
        alternateName: "Memory",
        url: new URL("/", siteUrl).toString(),
        publisher: {
          "@id": organizationId
        }
      },
      {
        "@type": "SoftwareApplication",
        "@id": softwareId,
        name: siteName,
        alternateName: ["Memory", "@aictx/memory"],
        keywords:
          "persistent memory for AI coding agents, auto-maintained project memory, project memory, MCP memory server, Codex memory, Claude Code memory, Cursor memory, local-first developer tools",
        applicationCategory: "DeveloperApplication",
        operatingSystem: "macOS, Linux, Windows",
        description:
          "Memory by Aictx is local-first, reviewable, auto-maintained project memory for AI coding agents.",
        url: new URL("/", siteUrl).toString(),
        codeRepository: "https://github.com/aictx/memory",
        downloadUrl: "https://www.npmjs.com/package/@aictx/memory",
        publisher: {
          "@id": organizationId
        }
      }
    ]
  };
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function buildSitemapXml(paths: readonly string[]): string {
  const urls = paths.map((path) => new URL(path, mainSiteUrl).toString()).sort();

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((url) => `  <url><loc>${escapeXml(url)}</loc></url>`).join("\n")}
</urlset>
`;
}
