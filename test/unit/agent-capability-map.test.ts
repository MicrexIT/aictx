import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const generatedNotice = "<!-- Generated from integrations/templates/agent-guidance.md. Do not edit directly. -->";

const mirroredSpecs = [
  "local-viewer-spec.md",
  "mcp-and-cli-api-spec.md",
  "prd.md",
  "runtime-and-project-architecture-spec.md"
] as const;

const mcpAndCliCapabilities = [
  {
    capability: "Load task context",
    mcp: "`load_memory`",
    cli: "`aictx load`",
    notes: "Preferred routine agent path is MCP."
  },
  {
    capability: "Search memory",
    mcp: "`search_memory`",
    cli: "`aictx search`",
    notes: "Preferred routine agent path is MCP."
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
    notes: "Git-backed; CLI fallback is supported."
  }
] as const;

const cliOnlyCapabilities = [
  {
    capability: "Initialize storage",
    mcp: "none",
    cli: "`aictx init`",
    notes: "Setup remains CLI-only in v1."
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
    capability: "View local memory",
    mcp: "none",
    cli: "`aictx view`",
    notes: "Local read-only viewer remains CLI-only in v1."
  }
] as const;

const exactMcpTools = [
  "`load_memory`",
  "`search_memory`",
  "`save_memory_patch`",
  "`diff_memory`"
] as const;

const exactCliOnlyCommands = [
  "`aictx init`",
  "`aictx check`",
  "`aictx rebuild`",
  "`aictx history`",
  "`aictx restore`",
  "`aictx rewind`",
  "`aictx inspect`",
  "`aictx stale`",
  "`aictx graph`",
  "`aictx export obsidian`",
  "`aictx view`"
] as const;

const guidanceTargets = [
  "integrations/templates/agent-guidance.md",
  "integrations/codex/aictx/SKILL.md",
  "integrations/claude/aictx/SKILL.md",
  "integrations/claude/aictx.md",
  "integrations/generic/aictx-agent-instructions.md"
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

  it("keeps guidance MCP-first while allowing CLI fallback and advanced use", async () => {
    for (const path of guidanceTargets) {
      const guidance = await readProjectFile(path);

      expect(guidance.indexOf("Use MCP first for routine memory work")).toBeLessThan(
        guidance.indexOf("Use CLI for v1 setup, maintenance, recovery, export, inspection, and local viewing capabilities")
      );
      expect(guidance.indexOf("load_memory({ task: \"<task summary>\" })")).toBeLessThan(
        guidance.indexOf("aictx load \"<task summary>\"")
      );
      expect(guidance).toContain("autonomously save a structured patch");
      expect(guidance).toContain("save_memory_patch({ patch: { source, changes } })");
      expect(guidance).toContain("Use CLI fallback when MCP is unavailable:");
      expect(guidance).toContain("CLI-only capabilities are not MCP parity gaps.");
      expect(guidance).toContain(
        "Do not edit `.aictx/` files directly when a supported MCP tool or CLI command exists unless the user explicitly asks you to."
      );

      for (const tool of exactMcpTools) {
        expect(guidance).toContain(tool);
      }

      for (const command of exactCliOnlyCommands) {
        expect(guidance).toContain(command);
      }
    }
  });

  it("keeps docs explicit about MCP parity and direct-edit guardrails", async () => {
    const docsAndGuidance = [
      ...mirroredSpecs,
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

  it("documents local viewing as CLI-only with JSON startup output", async () => {
    const localViewerSpec = await readProjectFile("local-viewer-spec.md");
    const prd = await readProjectFile("prd.md");
    const apiSpec = await readProjectFile("mcp-and-cli-api-spec.md");

    for (const content of [localViewerSpec, prd, apiSpec]) {
      expect(content).toContain("aictx view [--port <number>] [--open] [--json]");
    }

    expect(prd).toContain(
      "Setup, maintenance, recovery, export, inspection, and local viewing capabilities remain CLI-only in v1"
    );
    expect(apiSpec).toContain("Do not expose an MCP tool for local viewing.");
    expect(localViewerSpec).toContain("Do not add `aictx view` to MCP.");
  });
});
