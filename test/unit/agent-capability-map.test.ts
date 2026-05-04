import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const generatedNotice = "<!-- Generated from integrations/templates/agent-guidance.md. Do not edit directly. -->";

const mirroredSpecs = [
  "implementation-roadmap.md",
  "indexing-and-context-compiler-spec.md",
  "local-viewer-spec.md",
  "mcp-and-cli-api-spec.md",
  "prd.md",
  "runtime-and-project-architecture-spec.md",
  "schemas-and-validation-spec.md",
  "storage-format-spec.md"
] as const;

const v1ObjectTypes = [
  "project",
  "architecture",
  "decision",
  "constraint",
  "question",
  "fact",
  "gotcha",
  "workflow",
  "note",
  "concept"
] as const;

const loadModes = [
  "coding",
  "debugging",
  "review",
  "architecture",
  "onboarding"
] as const;

const lifecycleRules = [
  /load narrowly/i,
  /save only durable/i,
  /updat(?:e|ing)[\s\S]*stale[\s\S]*supersed/i,
  /current code[\s\S]*user/i,
  /review[\s\S]*diff/i,
  /save[\s\S]*nothing/i
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
    capability: "Save memory patch",
    mcp: "`save_memory_patch`",
    cli: "`aictx save`",
    notes: "All writes use structured patches."
  },
  {
    capability: "Show memory diff",
    mcp: "`diff_memory`",
    cli: "`aictx diff`",
    notes: "Git-backed; CLI is the default review path."
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
    notes: "Migration remains CLI-only in v2."
  },
  {
    capability: "Show memory history",
    mcp: "none",
    cli: "`aictx history`",
    notes: "Recovery/inspection remains CLI-only in v1."
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
    capability: "Inspect object",
    mcp: "none",
    cli: "`aictx inspect`",
    notes: "Debug inspection remains CLI-only in v1."
  },
  {
    capability: "List stale memory",
    mcp: "none",
    cli: "`aictx stale`",
    notes: "Debug inspection remains CLI-only in v1."
  },
  {
    capability: "Show graph neighborhood",
    mcp: "none",
    cli: "`aictx graph`",
    notes: "Debug inspection remains CLI-only in v1."
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
    notes: "Local read-only viewer remains CLI-only in v1."
  },
  {
    capability: "Suggest memory review packet",
    mcp: "none",
    cli: "`aictx suggest`",
    notes: "Agent assistance remains CLI-only in v1."
  },
  {
    capability: "Audit memory hygiene",
    mcp: "none",
    cli: "`aictx audit`",
    notes: "Deterministic hygiene review remains CLI-only in v1."
  }
] as const;

const exactMcpTools = [
  "`load_memory`",
  "`search_memory`",
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
  "`aictx inspect`",
  "`aictx stale`",
  "`aictx graph`",
  "`aictx export obsidian`",
  "`aictx projects`",
  "`aictx view`",
  "`aictx suggest`",
  "`aictx audit`"
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
  "`aictx inspect`",
  "`aictx stale`",
  "`aictx graph`",
  "`aictx export obsidian`",
  "`aictx projects`",
  "`aictx view`",
  "`aictx suggest`",
  "`aictx audit`"
] as const;

const guidanceTargets = [
  "integrations/templates/agent-guidance.md",
  "integrations/codex/aictx/SKILL.md",
  "integrations/claude/aictx/SKILL.md",
  "integrations/claude/aictx.md",
  "integrations/generic/aictx-agent-instructions.md"
] as const;

const packageManagerFallbacks = [
  "pnpm exec aictx",
  "npm exec aictx",
  "npx --package @aictx/memory -- aictx",
  "./node_modules/.bin/aictx",
  "pnpm exec aictx-mcp",
  "npm exec aictx-mcp",
  "npx --package @aictx/memory -- aictx-mcp",
  "./node_modules/.bin/aictx-mcp"
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
  it("keeps root spec mirrors in sync with docs copies", async () => {
    for (const spec of mirroredSpecs) {
      await expect(readProjectFile(spec)).resolves.toBe(
        await readProjectFile(`docs/${spec}`)
      );
    }
  });

  it("locks the T061 object taxonomy and exclusions in specs and agent docs", async () => {
    const taxonomyDocs = [
      "prd.md",
      "storage-format-spec.md",
      "schemas-and-validation-spec.md",
      "README.md",
      "docs/agent-integration.md",
      "integrations/templates/agent-guidance.md"
    ] as const;

    for (const path of taxonomyDocs) {
      const content = await readProjectFile(path);

      for (const objectType of v1ObjectTypes) {
        expectMentioned(content, objectType);
      }

      expect(content).toMatch(/gotcha/i);
      expect(content).toMatch(/workflow/i);
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
      "docs/agent-integration.md",
      "integrations/templates/agent-guidance.md"
    ] as const;

    for (const path of lifecycleDocs) {
      const content = await readProjectFile(path);

      for (const rule of lifecycleRules) {
        expect(content).toMatch(rule);
      }
    }
  });

  it("keeps setup docs explicit about package-manager fallback commands", async () => {
    const fallbackDocs = [
      "README.md",
      "docs/agent-integration.md",
      "integrations/templates/agent-guidance.md"
    ] as const;

    for (const path of fallbackDocs) {
      const content = await readProjectFile(path);

      expect(content).toContain("If `aictx` is not on `PATH`");

      for (const fallback of packageManagerFallbacks) {
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
      "docs/agent-integration.md",
      "integrations/templates/agent-guidance.md"
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
    expect(rows.filter((row) => row.mcp === "none").map((row) => row.cli)).toEqual([
      ...exactCliOnlyCommands
    ]);
  });

  it("keeps generated guidance template-derived", async () => {
    const template = (await readProjectFile("integrations/templates/agent-guidance.md")).trimEnd();
    const codex = await readProjectFile("integrations/codex/aictx/SKILL.md");
    const claudeSkill = await readProjectFile("integrations/claude/aictx/SKILL.md");
    const claude = await readProjectFile("integrations/claude/aictx.md");
    const generic = await readProjectFile("integrations/generic/aictx-agent-instructions.md");

    expect(codex).toBe(`---\nname: aictx-memory\ndescription: Use this skill when working in a project that uses Aictx project memory. It guides the agent to load relevant memory before non-trivial coding work, save durable memory patches after meaningful changes, and keep all memory updates reviewable through Aictx and Git when available.\n---\n\n${generatedNotice}\n\n${template}\n`);
    expect(claudeSkill).toBe(`---\nname: aictx-memory\ndescription: Use this skill when working in a project that uses Aictx project memory. It guides the agent to load relevant memory before non-trivial coding work, save durable memory patches after meaningful changes, and keep all memory updates reviewable through Aictx and Git when available.\n---\n\n${generatedNotice}\n\n${template}\n`);
    expect(claude).toBe(`${generatedNotice}\n\n${template}\n`);
    expect(generic).toBe(`${generatedNotice}\n\n${template}\n`);
  });

  it("keeps guidance CLI-first while allowing configured MCP equivalents and advanced use", async () => {
    for (const path of guidanceTargets) {
      const guidance = await readProjectFile(path);

      expect(guidance.indexOf("Use CLI first for routine memory work")).toBeLessThan(
        guidance.indexOf("Use CLI for v1 setup, maintenance, recovery, export, inspection, registry management, local viewing, suggestion, and audit capabilities")
      );
      expect(guidance.indexOf("aictx load \"<task summary>\"")).toBeLessThan(
        guidance.indexOf("load_memory({ task: \"<task summary>\"")
      );
      expect(guidance).toContain("autonomously save a structured patch");
      expect(guidance).toContain("save_memory_patch({ patch: { source, changes } })");
      expect(guidance).toContain("Use MCP only when the client already exposes Aictx MCP tools:");
      expect(guidance).toContain("CLI-only capabilities are not MCP parity gaps.");
      expect(guidance).toContain(
        "Do not edit `.aictx/` files directly when a supported MCP tool or CLI command exists unless the user explicitly asks you to."
      );

      for (const tool of exactMcpTools) {
        expect(guidance).toContain(tool);
      }

      for (const command of exactCliOnlyGuidanceCommands) {
        expect(guidance).toContain(command);
      }
    }
  });

  it("keeps docs explicit about MCP parity and direct-edit guardrails", async () => {
    const docsAndGuidance = [
      "local-viewer-spec.md",
      "mcp-and-cli-api-spec.md",
      "prd.md",
      "runtime-and-project-architecture-spec.md",
      "README.md",
      "docs/agent-integration.md",
      "integrations/templates/agent-guidance.md"
    ] as const;

    for (const path of docsAndGuidance) {
      const content = await readProjectFile(path);

      expect(content).toMatch(/CLI-only capabilities .*not MCP parity gaps/);
      expect(content).toMatch(
        /do not add .* to MCP|not (?:be )?added to MCP|do not add or ask for MCP tools solely to mirror these CLI commands/i
      );
      expect(content).toMatch(/editing `\.aictx\/` files directly/);
    }
  });

  it("keeps README and agent docs explicit that local viewing is CLI-only", async () => {
    for (const path of ["README.md", "docs/agent-integration.md"] as const) {
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
      "Setup, maintenance, recovery, export, inspection, registry management, local viewing, suggestion, and audit capabilities remain CLI-only in v1"
    );
    expect(apiSpec).toContain("Do not expose an MCP tool for local viewing.");
    expect(localViewerSpec).toContain("Do not add `aictx view` to MCP.");
  });
});
