import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

const generatedGuidanceTargets = [
  "integrations/templates/agent-guidance.md",
  "integrations/codex/aictx/SKILL.md",
  "integrations/codex/skills/aictx-memory/SKILL.md",
  "integrations/codex/plugins/aictx-memory/skills/aictx-memory/SKILL.md",
  "integrations/claude/aictx/SKILL.md",
  "integrations/claude/plugins/aictx-memory/skills/aictx-memory/SKILL.md",
  "integrations/claude/aictx.md",
  "integrations/cursor/aictx.mdc",
  "integrations/cline/aictx.md",
  "integrations/generic/aictx-agent-instructions.md"
] as const;

const publicDocsTargets = [
  "docs/src/content/docs/index.md",
  "docs/src/content/docs/getting-started.md",
  "docs/src/content/docs/capabilities.md",
  "docs/src/content/docs/cli.md",
  "docs/src/content/docs/mcp.md",
  "docs/src/content/docs/agent-integration.md",
  "docs/src/content/docs/agent-recipes.md",
  "docs/src/content/docs/specializing-aictx.md",
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
  it("keeps generated guidance focused on the routine Aictx loop", async () => {
    for (const path of generatedGuidanceTargets) {
      const content = await readProjectFile(path);

      expect(content).toContain('aictx load "<task summary>"');
      expect(content).toContain("aictx remember --stdin");
      expect(content).toContain("aictx diff");
      expect(content).toContain("remember_memory({ task, memories, updates, stale, supersede, relations })");
      expect(content).toContain("Save nothing when the task produced no durable future value.");
      expect(content).toContain("Do not save secrets, tokens, private keys");
      expect(content).toMatch(/editing\s+`\.aictx\/` (?:files directly|manually)/i);
    }
  });

  it("keeps generated guidance installable through package-manager fallbacks", async () => {
    for (const path of generatedGuidanceTargets) {
      const content = await readProjectFile(path);

      expect(content).toContain("pnpm exec aictx");
      expect(content).toContain("npm exec aictx");
      expect(content).toContain("npx --package @aictx/memory -- aictx");
      expect(content).toContain("./node_modules/.bin/aictx");
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
