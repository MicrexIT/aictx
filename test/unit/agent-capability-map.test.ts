import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const generatedNotice = "<!-- Generated from integrations/templates/agent-guidance.md. Do not edit directly. -->";

const mirroredSpecs = [
  "aictx-data-access-spec.md",
  "implementation-roadmap.md",
  "indexing-and-context-compiler-spec.md",
  "local-viewer-spec.md",
  "mcp-and-cli-api-spec.md",
  "prd.md",
  "runtime-and-project-architecture-spec.md",
  "schemas-and-validation-spec.md",
  "storage-format-spec.md"
] as const;

const objectTypes = [
  "project",
  "architecture",
  "decision",
  "constraint",
  "question",
  "fact",
  "gotcha",
  "workflow",
  "note",
  "concept",
  "source",
  "synthesis"
] as const;

const loadModes = [
  "coding",
  "debugging",
  "review",
  "architecture",
  "onboarding"
] as const;

const lifecycleRules = [
  /load(?:s)?(?: stay)? narrow|load narrowly|load durable project context/i,
  /save only durable|only durable knowledge is saved|save durable memory/i,
  /updat(?:e|ed|ing)[\s\S]*stale[\s\S]*supersed/i,
  /current code[\s\S]*user/i,
  /memory changed|async inspection/i,
  /save[-\s]*nothing/i
] as const;

const mcpAndCliCapabilities = [
  {
    capability: "Load task context",
    mcp: "`load_memory`",
    cli: "`aictx load`",
    notes: "Default routine agent path is CLI; MCP equivalent is supported when configured."
  },
  {
    capability: "Search memory",
    mcp: "`search_memory`",
    cli: "`aictx search`",
    notes: "Default routine agent path is CLI; MCP equivalent is supported when configured."
  },
  {
    capability: "Inspect object",
    mcp: "`inspect_memory`",
    cli: "`aictx inspect`",
    notes: "Full-object local-agent read path with direct relation summaries."
  },
  {
    capability: "Remember memory",
    mcp: "`remember_memory`",
    cli: "`aictx remember`",
    notes: "Intent-first routine write path compiles to a structured patch."
  },
  {
    capability: "Save structured patch",
    mcp: "`save_memory_patch`",
    cli: "`aictx save`",
    notes: "Advanced structured patch write path."
  },
  {
    capability: "Show memory diff",
    mcp: "`diff_memory`",
    cli: "`aictx diff`",
    notes: "Git-backed async inspection and recovery path."
  }
] as const;

const cliOnlyCapabilities = [
  {
    capability: "Initialize storage",
    mcp: "none",
    cli: "`aictx init`, `aictx setup`",
    notes: "Setup remains CLI-only in v1."
  },
  {
    capability: "Review patch file",
    mcp: "none",
    cli: "`aictx patch review`",
    notes: "Patch review remains CLI-only in v1."
  },
  {
    capability: "Validate storage",
    mcp: "none",
    cli: "`aictx check`",
    notes: "Maintenance remains CLI-only in v1."
  },
  {
    capability: "Rebuild generated index",
    mcp: "none",
    cli: "`aictx rebuild`",
    notes: "Maintenance remains CLI-only in v1."
  },
  {
    capability: "Reset local storage",
    mcp: "none",
    cli: "`aictx reset`",
    notes: "Destructive maintenance remains CLI-only in v1."
  },
  {
    capability: "Upgrade storage schema",
    mcp: "none",
    cli: "`aictx upgrade`",
    notes: "Migration remains CLI-only for storage v4."
  },
  {
    capability: "Show memory history",
    mcp: "none",
    cli: "`aictx history`",
    notes: "Recovery remains CLI-only in v1."
  },
  {
    capability: "Restore memory",
    mcp: "none",
    cli: "`aictx restore`",
    notes: "Recovery remains CLI-only in v1."
  },
  {
    capability: "Rewind memory",
    mcp: "none",
    cli: "`aictx rewind`",
    notes: "Recovery remains CLI-only in v1."
  },
  {
    capability: "List stale memory",
    mcp: "none",
    cli: "`aictx stale`",
    notes: "Debug list remains CLI-only in v1."
  },
  {
    capability: "Show graph neighborhood",
    mcp: "none",
    cli: "`aictx graph`, `aictx view` graph screen",
    notes: "Graph map is available in the CLI and local viewer; it remains outside MCP."
  },
  {
    capability: "Show memory lens",
    mcp: "none",
    cli: "`aictx lens`",
    notes: "Readable project views remain CLI-only in v1."
  },
  {
    capability: "Manage branch handoff",
    mcp: "none",
    cli: "`aictx handoff`",
    notes: "Branch-scoped continuity remains CLI-only in v1."
  },
  {
    capability: "Export Obsidian projection",
    mcp: "none",
    cli: "`aictx export obsidian`",
    notes: "Generated projection remains CLI-only in v1."
  },
  {
    capability: "Manage project registry",
    mcp: "none",
    cli: "`aictx projects`",
    notes: "Registry management remains CLI-only in v1."
  },
  {
    capability: "View local memory",
    mcp: "none",
    cli: "`aictx view`",
    notes: "Local viewer remains CLI-only in v1."
  },
  {
    capability: "Read public docs",
    mcp: "none",
    cli: "`aictx docs`",
    notes: "Bundled public docs remain CLI-only in v1."
  },
  {
    capability: "Suggest memory decision packet",
    mcp: "none",
    cli: "`aictx suggest`",
    notes: "Agent assistance remains CLI-only in v1."
  },
  {
    capability: "Audit memory hygiene",
    mcp: "none",
    cli: "`aictx audit`",
    notes: "Deterministic hygiene audit remains CLI-only in v1."
  },
  {
    capability: "Wiki source workflow",
    mcp: "none",
    cli: "`aictx wiki`",
    notes: "Source-backed ingest, filing, lint, and logs remain CLI-only in v1."
  }
] as const;

const exactMcpTools = [
  "`load_memory`",
  "`search_memory`",
  "`inspect_memory`",
  "`remember_memory`",
  "`save_memory_patch`",
  "`diff_memory`"
] as const;

const exactCliOnlyCommands = [
  "`aictx init`, `aictx setup`",
  "`aictx patch review`",
  "`aictx check`",
  "`aictx rebuild`",
  "`aictx reset`",
  "`aictx upgrade`",
  "`aictx history`",
  "`aictx restore`",
  "`aictx rewind`",
  "`aictx stale`",
  "`aictx graph`, `aictx view` graph screen",
  "`aictx lens`",
  "`aictx handoff`",
  "`aictx export obsidian`",
  "`aictx projects`",
  "`aictx view`",
  "`aictx docs`",
  "`aictx suggest`",
  "`aictx audit`",
  "`aictx wiki`"
] as const;

const exactCliOnlyGuidanceCommands = [
  "`aictx init`",
  "`aictx setup`",
  "`aictx patch review`",
  "`aictx check`",
  "`aictx rebuild`",
  "`aictx reset`",
  "`aictx upgrade`",
  "`aictx history`",
  "`aictx restore`",
  "`aictx rewind`",
  "`aictx stale`",
  "`aictx graph`",
  "`aictx lens`",
  "`aictx handoff`",
  "`aictx export obsidian`",
  "`aictx projects`",
  "`aictx view`",
  "`aictx docs`",
  "`aictx suggest`",
  "`aictx audit`",
  "`aictx wiki`"
] as const;

const guidanceTargets = [
  "integrations/templates/agent-guidance.md",
  "integrations/codex/aictx/SKILL.md",
  "integrations/claude/aictx/SKILL.md",
  "integrations/claude/aictx.md",
  "integrations/cursor/aictx.mdc",
  "integrations/cline/aictx.md",
  "integrations/generic/aictx-agent-instructions.md"
] as const;

const packageManagerFallbacks = [
  "pnpm exec aictx",
  "npm exec aictx",
  "npx --package @aictx/memory -- aictx",
  "./node_modules/.bin/aictx"
] as const;

const mcpPackageManagerFallbacks = [
  "pnpm exec aictx-mcp",
  "npm exec aictx-mcp",
  "npx --package @aictx/memory -- aictx-mcp",
  "./node_modules/.bin/aictx-mcp"
] as const;

const staleRoadmapDocs = [
  "prd.md",
  "specs/prd.md",
  "mcp-and-cli-api-spec.md",
  "specs/mcp-and-cli-api-spec.md",
  "runtime-and-project-architecture-spec.md",
  "specs/runtime-and-project-architecture-spec.md",
  "aictx-data-access-spec.md",
  "specs/aictx-data-access-spec.md",
  "implementation-roadmap.md",
  "specs/implementation-roadmap.md",
  "README.md",
  "docs/src/content/docs/agent-integration.md",
  "docs/src/content/docs/mcp.md",
  "docs/src/content/docs/reference.md",
  "integrations/templates/agent-guidance.md"
] as const;

const localNowCloudLaterDocs = [
  "prd.md",
  "specs/prd.md",
  "mcp-and-cli-api-spec.md",
  "specs/mcp-and-cli-api-spec.md",
  "aictx-data-access-spec.md",
  "specs/aictx-data-access-spec.md",
  "implementation-roadmap.md",
  "specs/implementation-roadmap.md",
  "README.md",
  "docs/src/content/docs/mcp.md",
  "docs/src/content/docs/agent-integration.md",
  "docs/src/content/docs/reference.md"
] as const;

const futureAdapterMappingDocs = [
  "prd.md",
  "specs/prd.md",
  "mcp-and-cli-api-spec.md",
  "specs/mcp-and-cli-api-spec.md",
  "aictx-data-access-spec.md",
  "specs/aictx-data-access-spec.md",
  "implementation-roadmap.md",
  "specs/implementation-roadmap.md",
  "README.md",
  "docs/src/content/docs/mcp.md",
  "docs/src/content/docs/agent-integration.md",
  "docs/src/content/docs/reference.md"
] as const;

const deprecatedFourToolRoadmapPatterns = [
  /MCP \+ CLI capabilities: load, search, save, diff\./,
  /CLI-only capabilities in v1:.*\binspect\b/,
  /MCP load\/search\/save flows/,
  /No network calls in init, load, search, save, diff, check, rebuild, history, restore, or MCP tools/,
  /exactly `load_memory`, `search_memory`, `save_memory_patch`, and `diff_memory`/
] as const;

interface CapabilityRow {
  capability: string;
  mcp: string;
  cli: string;
  notes: string;
}

async function readProjectFile(path: string): Promise<string> {
  return readFile(join(root, path), "utf8");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function expectMentioned(content: string, value: string): void {
  expect(content).toMatch(new RegExp(`(^|[\\s\`"*,])${escapeRegExp(value)}([\\s\`"*,.]|$)`));
}

function parseCapabilityTable(markdown: string): CapabilityRow[] {
  const section = markdown.match(
    /### 2\.1 Agent Capability Map\n(?<body>[\s\S]*?)\n## 3\. Runtime Preconditions/
  )?.groups?.body;

  if (section === undefined) {
    throw new Error("Agent Capability Map section is missing.");
  }

  return section
    .split("\n")
    .filter((line) => line.startsWith("| "))
    .filter((line) => !line.includes("---"))
    .slice(1)
    .map((line) => {
      const cells = line
        .split("|")
        .slice(1, -1)
        .map((cell) => cell.trim());

      if (cells.length !== 4) {
        throw new Error(`Expected four capability table cells, got ${cells.length}.`);
      }

      const [capability, mcp, cli, notes] = cells as [
        string,
        string,
        string,
        string
      ];

      return {
        capability,
        mcp,
        cli,
        notes
      };
    });
}

describe("agent capability map guardrail", () => {
  it("keeps root spec mirrors in sync with internal spec copies", async () => {
    for (const spec of mirroredSpecs) {
      await expect(readProjectFile(spec)).resolves.toBe(
        await readProjectFile(`specs/${spec}`)
      );
    }
  });

  it("locks the object taxonomy and exclusions in specs and agent docs", async () => {
    const taxonomyDocs = [
      "prd.md",
      "storage-format-spec.md",
      "schemas-and-validation-spec.md",
      "README.md",
      "docs/src/content/docs/agent-integration.md"
    ] as const;

    for (const path of taxonomyDocs) {
      const content = await readProjectFile(path);

      for (const objectType of objectTypes) {
        expectMentioned(content, objectType);
      }

      expect(content).toMatch(/gotcha/i);
      expect(content).toMatch(/workflow/i);
      expect(content).toMatch(/how-to/i);
      expect(content).toMatch(/history/i);
      expect(content).toMatch(/task-note/i);
      expect(content).toMatch(/not|invalid|Do not/i);
    }
  });

  it("locks memory discipline lifecycle rules in specs and guidance", async () => {
    const lifecycleDocs = [
      "prd.md",
      "runtime-and-project-architecture-spec.md",
      "README.md",
      "docs/src/content/docs/agent-integration.md"
    ] as const;

    for (const path of lifecycleDocs) {
      const content = await readProjectFile(path);

      for (const rule of lifecycleRules) {
        expect(content).toMatch(rule);
      }
    }
  });

  it("keeps setup docs explicit about package-manager fallback commands", async () => {
    const cliFallbackDocs = [
      "README.md",
      "docs/src/content/docs/agent-integration.md",
      "integrations/templates/agent-guidance.md"
    ] as const;

    for (const path of cliFallbackDocs) {
      const content = await readProjectFile(path);

      expect(content).toMatch(/(?:If|When) `aictx` is not on `PATH`/);

      for (const fallback of packageManagerFallbacks) {
        expect(content).toContain(fallback);
      }
    }

    for (const path of ["README.md", "docs/src/content/docs/agent-integration.md"] as const) {
      const content = await readProjectFile(path);

      for (const fallback of mcpPackageManagerFallbacks) {
        expect(content).toContain(fallback);
      }
    }
  });

  it("locks the load mode contract across specs and guidance", async () => {
    const modeDocs = [
      "indexing-and-context-compiler-spec.md",
      "mcp-and-cli-api-spec.md",
      "runtime-and-project-architecture-spec.md",
      "README.md",
      "docs/src/content/docs/agent-integration.md"
    ] as const;

    for (const path of modeDocs) {
      const content = await readProjectFile(path);

      for (const mode of loadModes) {
        expectMentioned(content, mode);
      }

      expect(content).toMatch(/deterministic[\s\S]*ranking and rendering/i);
    }
  });

  it("locks the exact MCP and CLI-only capability map", async () => {
    const apiSpec = await readProjectFile("mcp-and-cli-api-spec.md");
    const rows = parseCapabilityTable(apiSpec);

    expect(rows).toEqual([
      ...mcpAndCliCapabilities,
      ...cliOnlyCapabilities
    ]);
    expect(rows.filter((row) => row.mcp !== "none").map((row) => row.mcp)).toEqual([
      ...exactMcpTools
    ]);
    const cliOnlyRows = rows.filter((row) => row.mcp === "none");
    expect(cliOnlyRows.map((row) => row.cli)).toEqual([
      ...exactCliOnlyCommands
    ]);

    for (const row of cliOnlyRows) {
      expect(`${row.capability} ${row.cli} ${row.notes}`).not.toMatch(/\binspect\b/i);
    }
  });

  it("rejects deprecated four-tool roadmap wording", async () => {
    for (const path of staleRoadmapDocs) {
      const content = await readProjectFile(path);

      for (const pattern of deprecatedFourToolRoadmapPatterns) {
        expect(content).not.toMatch(pattern);
      }
    }

    for (const path of ["prd.md", "specs/prd.md"] as const) {
      const content = await readProjectFile(path);

      expect(content).toContain(
        "* MCP + CLI capabilities: load, search, inspect object, remember memory, save patch, diff."
      );
      expect(content).toContain(
        "* CLI-only capabilities in v1: init, setup, lens, handoff, patch review, check, rebuild, reset, upgrade, history, restore, rewind, stale, export obsidian, projects, view, docs, suggest, audit, wiki."
      );
      expect(content).toContain(
        "* Graph inspection is available in the CLI and local viewer, but remains outside MCP."
      );
    }
  });

  it("locks the local-now/cloud-later integration story", async () => {
    for (const path of localNowCloudLaterDocs) {
      const content = await readProjectFile(path);

      expect(content).toMatch(/local MCP[\s\S]{0,80}near-term|near-term[\s\S]{0,80}local MCP/i);
      expect(content).toMatch(
        /remote\s+MCP[\s\S]{0,160}(?:future|deferred)|(?:future|deferred)[\s\S]{0,160}remote\s+MCP/i
      );
      expect(content).toMatch(
        /ChatGPT App SDK[\s\S]{0,160}(?:future|deferred)|(?:future|deferred)[\s\S]{0,160}ChatGPT App SDK/i
      );
    }
  });

  it("locks search/fetch as future adapter aliases outside local MCP", async () => {
    for (const path of futureAdapterMappingDocs) {
      const content = await readProjectFile(path);

      expect(content).toMatch(/`search`\/`fetch`|`search`[\s\S]{0,80}`fetch`/);
      expect(content).toMatch(/adapter/i);
      expect(content).toMatch(
        /not (?:the )?local MCP tool\s+(?:contract|names)|must not (?:rename|replace) the local MCP tool(?:s| names)|must not register[\s\S]{0,40}`search`[\s\S]{0,40}`fetch`/i
      );
    }
  });

  it("keeps generated guidance template-derived", async () => {
    const template = (await readProjectFile("integrations/templates/agent-guidance.md")).trimEnd();
    const codex = await readProjectFile("integrations/codex/aictx/SKILL.md");
    const claudeSkill = await readProjectFile("integrations/claude/aictx/SKILL.md");
    const claude = await readProjectFile("integrations/claude/aictx.md");
    const cursor = await readProjectFile("integrations/cursor/aictx.mdc");
    const cline = await readProjectFile("integrations/cline/aictx.md");
    const generic = await readProjectFile("integrations/generic/aictx-agent-instructions.md");

    expect(codex).toBe(`---\nname: aictx-memory\ndescription: Use this skill when working in a project that uses Aictx project memory. It guides the agent to load relevant memory before non-trivial coding work, save durable memory after meaningful changes, and keep memory inspectable through Aictx and Git when available.\n---\n\n${generatedNotice}\n\n${template}\n`);
    expect(claudeSkill).toBe(`---\nname: aictx-memory\ndescription: Use this skill when working in a project that uses Aictx project memory. It guides the agent to load relevant memory before non-trivial coding work, save durable memory after meaningful changes, and keep memory inspectable through Aictx and Git when available.\n---\n\n${generatedNotice}\n\n${template}\n`);
    expect(claude).toBe(`${generatedNotice}\n\n${template}\n`);
    expect(cursor).toBe(`---\ndescription: Use Aictx project memory when working in this repository.\nalwaysApply: true\n---\n\n${generatedNotice}\n\n${template}\n`);
    expect(cline).toBe(`${generatedNotice}\n\n${template}\n`);
    expect(generic).toBe(`${generatedNotice}\n\n${template}\n`);
  });

  it("keeps guidance CLI-first while allowing configured MCP equivalents and advanced use", async () => {
    for (const path of guidanceTargets) {
      const guidance = await readProjectFile(path);

      const cliFirstIndex = guidance.indexOf("Use the CLI by default");
      const cliOnlyIndex = guidance.search(
        /Setup,\s+lenses,\s+(?:branch\s+)?handoff,\s+maintenance,\s+recovery,\s+export,\s+registry,\s+viewer,\s+docs,\s+suggest,\s+audit,\s+wiki/i
      );

      expect(cliFirstIndex).toBeGreaterThanOrEqual(0);
      expect(cliOnlyIndex).toBeGreaterThanOrEqual(0);
      expect(cliFirstIndex).toBeLessThan(cliOnlyIndex);
      expect(guidance.indexOf("aictx load \"<task summary>\"")).toBeGreaterThanOrEqual(0);
      expect(guidance).toContain("`load_memory`");
      expect(guidance).toContain("save durable memory with the intent-first primitive");
      expect(guidance).toContain("aictx remember --stdin");
      expect(guidance).toContain(
        "remember_memory({ task, memories, updates, stale, supersede, relations })"
      );
      expect(guidance).toContain("Use `aictx save --stdin` only when you need");
      expect(guidance).toContain("Use MCP only when the client already exposes Aictx tools.");
      expect(guidance).toMatch(/Non-MCP\s+capabilities are not\s+MCP parity gaps\./);
      expect(guidance).toContain(
        "do not work around it by editing"
      );

      for (const tool of exactMcpTools) {
        expect(guidance).toContain(tool);
      }

      expect(guidance).toContain("`aictx init` does not start MCP");
    }
  });

  it("keeps docs explicit about MCP parity and direct-edit guardrails", async () => {
    const docsAndGuidance = [
      "local-viewer-spec.md",
      "mcp-and-cli-api-spec.md",
      "prd.md",
      "runtime-and-project-architecture-spec.md",
      "README.md",
      "docs/src/content/docs/agent-integration.md",
      "integrations/templates/agent-guidance.md"
    ] as const;

    for (const path of docsAndGuidance) {
      const content = await readProjectFile(path);

      expect(content).toMatch(/(?:CLI-only|Non-MCP)\s+capabilities[\s\S]{0,120}not\s+MCP parity gaps/);
      expect(content).toMatch(
        /do not add[\s\S]{0,200}to MCP|do not add MCP tools|not (?:be )?added to MCP|do not add or ask for MCP tools solely to mirror these CLI\s+commands|has no MCP equivalent|have no MCP equivalents?|part of the v1 integration model rather than MCP parity gaps|(?:CLI-only|Non-MCP)\s+capabilities are not\s+MCP parity gaps|CLI is the supported interface/i
      );
      expect(content).toMatch(/edit(?:ing)?\s+`\.aictx\/` (?:files directly|manually)/);
    }
  });

  it("keeps README and agent docs explicit that local viewing is CLI-only", async () => {
    for (const path of ["README.md", "docs/src/content/docs/agent-integration.md"] as const) {
      const content = await readProjectFile(path);

      expect(content).toContain("| View local memory | none | `aictx view`");
      expect(content).toContain("CLI-only");
      expect(content).toContain("not MCP parity gaps");
      expect(content).toMatch(/aictx view.*CLI-only|CLI-only.*aictx view/s);
    }
  });

  it("documents local viewing as CLI-only with JSON startup output", async () => {
    const localViewerSpec = await readProjectFile("local-viewer-spec.md");
    const prd = await readProjectFile("prd.md");
    const apiSpec = await readProjectFile("mcp-and-cli-api-spec.md");

    for (const content of [localViewerSpec, prd, apiSpec]) {
      expect(content).toContain("aictx view [--port <number>] [--open] [--detach] [--json]");
    }

    expect(prd).toContain(
      "CLI-only capabilities in v1: init, setup, lens, handoff, patch review, check, rebuild, reset, upgrade, history, restore, rewind, stale, export obsidian, projects, view, docs, suggest, audit, wiki."
    );
    expect(prd).toContain(
      "Graph inspection is available in the CLI and local viewer, but remains outside MCP."
    );
    expect(apiSpec).toContain("Do not expose an MCP tool for local viewing.");
    expect(localViewerSpec).toContain("Do not add `aictx view`, `aictx lens`, or `aictx handoff` to MCP.");
  });
});
