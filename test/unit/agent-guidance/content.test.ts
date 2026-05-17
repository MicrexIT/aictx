import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

const generatedGuidanceTargets = [
  "integrations/templates/agent-guidance.md",
  "integrations/codex/memory/SKILL.md",
  "integrations/codex/skills/memory/SKILL.md",
  "integrations/codex/plugins/memory/skills/memory/SKILL.md",
  "integrations/claude/memory/SKILL.md",
  "integrations/claude/plugins/memory/skills/memory/SKILL.md",
  "integrations/claude/memory.md",
  "integrations/cursor/memory.mdc",
  "integrations/cline/memory.md",
  "integrations/generic/memory-agent-instructions.md"
] as const;

const publicDocsTargets = [
  "docs/src/content/docs/index.md",
  "docs/src/content/docs/getting-started.md",
  "docs/src/content/docs/capabilities.md",
  "docs/src/content/docs/cli.md",
  "docs/src/content/docs/mcp.md",
  "docs/src/content/docs/agent-integration.md",
  "docs/src/content/docs/agent-recipes.md",
  "docs/src/content/docs/specializing-memory.md",
  "docs/src/content/docs/reference.md",
  "docs/src/content/docs/troubleshooting.md",
  "docs/src/content/docs/viewer.md",
  "docs/src/content/docs/wiki-workflow.md"
] as const;

const forbiddenMcpToolNames = [
  "init_memory",
  "check_memory",
  "rebuild_memory",
  "restore_memory",
  "export_memory",
  "view_memory",
  "suggest_memory",
  "audit_memory",
  "stale_memory",
  "graph_memory"
] as const;

async function readProjectFile(path: string): Promise<string> {
  return readFile(join(root, path), "utf8");
}

describe("agent guidance content", () => {
  it("keeps generated guidance focused on the routine Memory loop", async () => {
    for (const path of generatedGuidanceTargets) {
      const content = await readProjectFile(path);

      expect(content).toContain('memory load "<task summary>"');
      expect(content).toContain("memory remember --stdin");
      expect(content).toContain("memory diff");
      expect(content).toContain("remember_memory({ task, memories, updates, stale, supersede, relations })");
      expect(content).toContain("Save nothing when the task produced no durable future value.");
      expect(content).toContain("Do not save secrets, tokens, private keys");
      expect(content).toMatch(/editing\s+`\.memory\/` (?:files directly|manually)/i);
    }
  });

  it("keeps generated guidance installable through package-manager fallbacks", async () => {
    for (const path of generatedGuidanceTargets) {
      const content = await readProjectFile(path);

      expect(content).toContain("pnpm exec memory");
      expect(content).toContain("npm exec memory");
      expect(content).toContain("npx --package @aictx/memory -- memory");
      expect(content).toContain("./node_modules/.bin/memory");
    }
  });

  it("does not advertise unsupported local MCP tool names", async () => {
    for (const path of [...publicDocsTargets, ...generatedGuidanceTargets]) {
      const content = await readProjectFile(path);

      for (const forbiddenName of forbiddenMcpToolNames) {
        expect(content).not.toContain(forbiddenName);
      }
    }
  });
});
