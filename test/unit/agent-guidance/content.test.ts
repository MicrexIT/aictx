import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

const guideTargets = [
  "integrations/templates/agent-guidance.md",
  "integrations/codex/aictx/SKILL.md",
  "integrations/claude/aictx/SKILL.md",
  "integrations/claude/aictx.md",
  "integrations/cursor/aictx.mdc",
  "integrations/cline/aictx.md",
  "integrations/generic/aictx-agent-instructions.md"
] as const;

const publicMcpContractTargets = [
  "README.md",
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
  "docs/src/content/docs/viewer.md"
] as const;

const localNowCloudLaterTargets = [
  ...publicMcpContractTargets
] as const;

const futureAdapterMappingTargets = [
  "README.md",
  "docs/src/content/docs/index.md",
  "docs/src/content/docs/getting-started.md",
  "docs/src/content/docs/capabilities.md",
  "docs/src/content/docs/cli.md",
  "docs/src/content/docs/mcp.md",
  "docs/src/content/docs/agent-integration.md",
  "docs/src/content/docs/specializing-aictx.md",
  "docs/src/content/docs/reference.md",
  "docs/src/content/docs/troubleshooting.md",
  "docs/src/content/docs/viewer.md"
] as const;

const generatedGuidanceTargets = [
  "integrations/templates/agent-guidance.md",
  "integrations/codex/aictx/SKILL.md",
  "integrations/claude/aictx/SKILL.md",
  "integrations/claude/aictx.md",
  "integrations/cursor/aictx.mdc",
  "integrations/cline/aictx.md",
  "integrations/generic/aictx-agent-instructions.md"
] as const;

const mcpTools = [
  "`load_memory`",
  "`search_memory`",
  "`inspect_memory`",
  "`remember_memory`",
  "`save_memory_patch`",
  "`diff_memory`"
] as const;

const cliOnlyCommands = [
  "`aictx init`",
  "`aictx setup`",
  "`aictx check`",
  "`aictx rebuild`",
  "`aictx reset`",
  "`aictx upgrade`",
  "`aictx history`",
  "`aictx restore`",
  "`aictx rewind`",
  "`aictx stale`",
  "`aictx graph`",
  "`aictx export obsidian`",
  "`aictx projects`",
  "`aictx view`",
  "`aictx docs`",
  "`aictx suggest`",
  "`aictx patch review`",
  "`aictx audit`",
  "`aictx wiki`"
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

const cliOnlyCategoryBoundary =
  /setup,\s+lenses,\s+(?:branch\s+)?handoff,\s+maintenance,\s+recovery,\s+export,\s+registry,\s+viewer,\s+docs,\s+suggest,\s+audit,\s+wiki,\s+and stale/i;

const objectTypes = [
  "`project`",
  "`architecture`",
  "`decision`",
  "`constraint`",
  "`question`",
  "`fact`",
  "`gotcha`",
  "`workflow`",
  "`note`",
  "`concept`",
  "`source`",
  "`synthesis`"
] as const;

const loadModes = [
  "`coding`",
  "`debugging`",
  "`review`",
  "`architecture`",
  "`onboarding`"
] as const;

const lifecycleRules = [
  /load durable project context/i,
  /Do not save secrets/i,
  /Prefer updating[\s\S]{0,80}superseding[\s\S]{0,80}deleting existing memory/i,
  /current user[\s\S]{0,80}code[\s\S]{0,80}tests/i,
  /whether Aictx memory changed|memory changed/i,
  /save nothing/i
] as const;

const nonBlockingDirtySaveGuidance =
  "Dirty or untracked `.aictx/` files are not by themselves a";

const packageManagerFallbacks = [
  "pnpm exec aictx",
  "npm exec aictx",
  "npx --package @aictx/memory -- aictx",
  "./node_modules/.bin/aictx"
] as const;

const memoryPatchOperations = [
  "`update_object`",
  "`mark_stale`",
  "`supersede_object`",
  "`delete_object`",
  "`create_relation`"
] as const;

const organizationFacets = [
  "`domain`",
  "`bounded-context`",
  "`capability`",
  "`business-rule`",
  "`unresolved-conflict`"
] as const;

async function readProjectFile(path: string): Promise<string> {
  return readFile(join(root, path), "utf8");
}

describe("agent guidance content", () => {
  it("locks the public local MCP contract and CLI-only boundary", async () => {
    for (const path of publicMcpContractTargets) {
      const content = await readProjectFile(path);

      expect(content).toMatch(/MCP\s+exposes\s+exactly/i);
      expect(content).toMatch(cliOnlyCategoryBoundary);

      for (const tool of mcpTools) {
        expect(content).toContain(tool);
      }

      for (const forbiddenName of forbiddenMcpToolNames) {
        expect(content).not.toContain(forbiddenName);
      }

      expect(content).not.toContain(
        "exactly `load_memory`, `search_memory`, `save_memory_patch`, and `diff_memory`"
      );
    }
  });

  it("documents the local-now/cloud-later integration story", async () => {
    for (const path of localNowCloudLaterTargets) {
      const content = await readProjectFile(path);

      expect(content).toMatch(/local MCP[\s\S]{0,80}near-term|near-term[\s\S]{0,80}local MCP/i);
      expect(content).toMatch(
        /remote(?:\s+MCP|\/cloud)?[\s\S]{0,160}(?:future|deferred)|(?:future|deferred)[\s\S]{0,160}remote(?:\s+MCP|\/cloud)?/i
      );
      expect(content).toMatch(
        /ChatGPT App SDK[\s\S]{0,160}(?:future|deferred)|(?:future|deferred)[\s\S]{0,160}ChatGPT App SDK/i
      );
    }
  });

  it("documents search/fetch as future adapter aliases, not local MCP tools", async () => {
    for (const path of futureAdapterMappingTargets) {
      const content = await readProjectFile(path);

      expect(content).toMatch(/`search`\/`fetch`|`search`[\s\S]{0,80}`fetch`/);
      expect(content).toMatch(/adapter/i);
      expect(content).toMatch(/not\s+local MCP tool\s+names|must not register[\s\S]{0,40}`search`[\s\S]{0,40}`fetch`/i);
    }
  });

  it("keeps the guide within local-first safety boundaries", async () => {
    for (const path of guideTargets) {
      const content = await readProjectFile(path);

      expect(content).not.toMatch(/\bembeddings?\b/i);
      expect(content).toMatch(/Aictx does not infer durable project meaning from diffs/i);
      expect(content).toMatch(/Non-MCP\s+capabilities are not\s+MCP parity gaps/i);
      expect(content).toMatch(/`aictx init` does not start MCP/i);
      expect(content).toMatch(/edit(?:ing)?\s+`\.aictx\/` (?:files directly|manually)/i);
      expect(content).toContain(nonBlockingDirtySaveGuidance);
      expect(content).toContain(".aictx/recovery/");
      expect(content).not.toContain(
        "If a memory update is rejected because of validation, dirty state"
      );
    }
  });

  it("tells agents when to load and save memory", async () => {
    for (const path of generatedGuidanceTargets) {
      const content = await readProjectFile(path);

      expect(content).toMatch(
        /Before non-trivial coding, architecture, debugging, dependency, or configuration\s+work:/
      );
      expect(content).toContain('aictx load "<task summary>"');
      expect(content).toContain("`load_memory`");
      expect(content).toContain(
        "After meaningful work, save durable memory with the intent-first primitive:"
      );
      expect(content).toContain("aictx remember --stdin");
      expect(content).toContain(
        "remember_memory({ task, memories, updates, stale, supersede, relations })"
      );
      expect(content).toContain("Use `aictx save --stdin` only when you need");
      expect(content.indexOf("aictx remember --stdin")).toBeLessThan(
        content.indexOf("remember_memory({ task, memories")
      );
      expect(content).toContain(nonBlockingDirtySaveGuidance);
    }
  });

  it("keeps CLI use allowed for intentionally CLI-only capabilities", async () => {
    for (const path of generatedGuidanceTargets) {
      const content = await readProjectFile(path);

      expect(content).toContain(
        "Setup, lenses, branch handoff, maintenance, recovery, export, registry, viewer,"
      );
      expect(content).toMatch(cliOnlyCategoryBoundary);
      expect(content).toContain("`aictx init` does not start MCP");
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
      for (const forbiddenName of forbiddenMcpToolNames) {
        expect(content).not.toContain(forbiddenName);
      }
      expect(content).not.toContain(
        "exactly `load_memory`, `search_memory`, `save_memory_patch`, and `diff_memory`"
      );
      expect(content).not.toContain("MCP + CLI capabilities: load, search, save, diff.");
    }
  });

  it("keeps generated guidance optional, copyable, and safe to install", async () => {
    for (const path of generatedGuidanceTargets) {
      const content = await readProjectFile(path);

      expect(content).toContain(
        "If Aictx rejects a save, report the reason and do not work around it by editing"
      );
      expect(content).toContain("Do not save secrets, tokens, private keys");
      expect(content).toContain("ignore current code, tests, user requests, or safety rules");
      expect(content).toContain("Save nothing when the task produced no durable future value.");
      expect(content).toContain("`gotcha`");
    }
  });

  it("teaches the memory discipline lifecycle", async () => {
    for (const path of guideTargets) {
      const content = await readProjectFile(path);

      for (const rule of lifecycleRules) {
        expect(content).toMatch(rule);
      }
    }
  });

  it("teaches right-size memory, update-before-create, stale/supersede, deletion, and no-op saves", async () => {
    for (const path of guideTargets) {
      const content = await readProjectFile(path);

      expect(content).toMatch(/Right-size memory/i);
      expect(content).toContain("`synthesis` maintains compact area-level summaries");
      expect(content).toContain("`source` preserves where context came from");
      expect(content).toMatch(/Prefer updating, marking stale, superseding, or deleting existing memory/i);
      expect(content).toContain("Save nothing when the task produced no durable future value.");
      expect(content).toContain("recommended_actions");
      expect(content).toContain("remember_template");
    }
  });

  it("includes a concrete intent-first memory example", async () => {
    for (const path of guideTargets) {
      const content = await readProjectFile(path);

      expect(content).toContain('"task": "Fix Stripe webhook retries"');
      expect(content).toContain('"kind": "decision"');
      expect(content).toContain('"title": "Billing retries run in the worker"');
      expect(content).toContain('"body": "Stripe webhook retries execute');
      expect(content).toContain('"evidence"');
      expect(content).toContain("recording a task diary usually should not create");
    }
  });

  it("documents suggestion and package-manager fallback workflows", async () => {
    for (const path of guideTargets) {
      const content = await readProjectFile(path);

      expect(content).toContain('aictx suggest --after-task "<task>" --json');
      expect(content).toMatch(/source[- ](?:backed|records?)/i);
      expect(content).toMatch(/synthes/i);
      expect(content).toContain("recommended_actions");
      expect(content).toContain("remember_template");

      for (const fallback of packageManagerFallbacks) {
        expect(content).toContain(fallback);
      }
    }
  });

  it("locks the intent-first remember taxonomy in guidance", async () => {
    for (const path of guideTargets) {
      const content = await readProjectFile(path);

      expect(content).toContain("--mode debugging");
      for (const kind of [
        "`source`",
        "`synthesis`",
        "`decision`",
        "`constraint`",
        "`fact`",
        "`gotcha`",
        "`workflow`",
        "`question`",
        "`concept`",
        "`note`"
      ] as const) {
        expect(content).toContain(kind);
      }

      expect(content).toContain("durable project-specific how-tos");
      expect(content).toContain("Do not save generic tutorials");
      expect(content).toContain("semantic title/body/reason");
    }
  });
});
