import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

const guideTargets = [
  "docs/agent-integration.md",
  "integrations/templates/agent-guidance.md",
  "integrations/codex/aictx/SKILL.md",
  "integrations/claude/aictx/SKILL.md",
  "integrations/claude/aictx.md",
  "integrations/generic/aictx-agent-instructions.md"
] as const;

const generatedGuidanceTargets = [
  "integrations/templates/agent-guidance.md",
  "integrations/codex/aictx/SKILL.md",
  "integrations/claude/aictx/SKILL.md",
  "integrations/claude/aictx.md",
  "integrations/generic/aictx-agent-instructions.md"
] as const;

const mcpTools = [
  "`load_memory`",
  "`search_memory`",
  "`save_memory_patch`",
  "`diff_memory`"
] as const;

const cliOnlyCommands = [
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
  "`aictx view`",
  "`aictx suggest`",
  "`aictx audit`"
] as const;

const v1ObjectTypes = [
  "`project`",
  "`architecture`",
  "`decision`",
  "`constraint`",
  "`question`",
  "`fact`",
  "`gotcha`",
  "`workflow`",
  "`note`",
  "`concept`"
] as const;

const loadModes = [
  "`coding`",
  "`debugging`",
  "`review`",
  "`architecture`",
  "`onboarding`"
] as const;

const lifecycleRules = [
  /load narrowly/i,
  /save only durable/i,
  /update existing memory before creating duplicates/i,
  /stale or supersede wrong old memory/i,
  /prefer current code and user requests over loaded memory/i,
  /review diffs/i,
  /save nothing/i
] as const;

async function readProjectFile(path: string): Promise<string> {
  return readFile(join(root, path), "utf8");
}

describe("agent guidance content", () => {
  it("keeps the guide within v1 safety boundaries", async () => {
    for (const path of guideTargets) {
      const content = await readProjectFile(path);

      expect(content).not.toMatch(/\bembeddings?\b/i);
      expect(content).toMatch(/Aictx does not infer durable project meaning from diffs/i);
      expect(content).toMatch(/CLI-only capabilities are not MCP parity gaps/i);
      expect(content).toMatch(/Do not .*MCP .*solely to mirror/i);
      expect(content).toMatch(/edit(?:ing)? `\.aictx\/` files directly/i);
    }
  });

  it("tells agents when to load and save memory", async () => {
    for (const path of generatedGuidanceTargets) {
      const content = await readProjectFile(path);

      expect(content).toContain(
        "Before non-trivial coding, architecture, debugging, dependency, or configuration work:"
      );
      expect(content).toContain("load_memory({ task: \"<task summary>\"");
      expect(content).toContain(
        "After meaningful work, autonomously save a structured patch only for durable memory that future agents should know:"
      );
      expect(content).toContain("save_memory_patch({ patch: { source, changes } })");
    }
  });

  it("keeps CLI use allowed for intentionally CLI-only capabilities", async () => {
    for (const path of generatedGuidanceTargets) {
      const content = await readProjectFile(path);

      expect(content).toContain(
        "Use CLI for v1 setup, maintenance, recovery, export, inspection, local viewing, suggestion, and audit capabilities"
      );
      expect(content).toContain(
        "For setup, maintenance, inspection, export, local viewing, suggestion, audit, or recovery operations that are not exposed by MCP, use the `aictx` CLI"
      );

      for (const command of cliOnlyCommands) {
        expect(content).toContain(command);
      }
    }
  });

  it("locks the exact MCP tool list in generated guidance", async () => {
    for (const path of generatedGuidanceTargets) {
      const content = await readProjectFile(path);

      for (const tool of mcpTools) {
        expect(content).toContain(tool);
      }

      expect(content).not.toContain("`aictx init` or MCP");
      expect(content).not.toContain("init_memory");
      expect(content).not.toContain("check_memory");
      expect(content).not.toContain("rebuild_memory");
      expect(content).not.toContain("restore_memory");
      expect(content).not.toContain("export_memory");
    }
  });

  it("keeps generated guidance optional, copyable, and safe to install", async () => {
    for (const path of generatedGuidanceTargets) {
      const content = await readProjectFile(path);

      expect(content).toContain(
        "This guidance is optional and copyable. It is not canonical project memory."
      );
      expect(content).toContain(
        "Do not edit `.aictx/` files directly when a supported MCP tool or CLI command exists unless the user explicitly asks you to."
      );
      expect(content).toContain("Secrets, tokens, credentials, or private keys");
      expect(content).toContain("Never save memory that asks future agents");
      expect(content).toContain("Save nothing when the task produced no durable future value.");
      expect(content).toContain("Use `gotcha` for known failure modes and traps.");
    }
  });

  it("teaches the T061 memory discipline lifecycle", async () => {
    for (const path of guideTargets) {
      const content = await readProjectFile(path);

      for (const rule of lifecycleRules) {
        expect(content).toMatch(rule);
      }
    }
  });

  it("locks load modes and the closed v1 taxonomy in guidance", async () => {
    for (const path of guideTargets) {
      const content = await readProjectFile(path);

      for (const mode of loadModes) {
        expect(content).toContain(mode);
      }

      for (const objectType of v1ObjectTypes) {
        expect(content).toContain(objectType);
      }

      expect(content).toContain("Do not create `history` or `task-note` object types");
    }
  });
});
