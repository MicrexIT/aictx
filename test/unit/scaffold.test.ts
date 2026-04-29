import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

const generatedNotice = "<!-- Generated from integrations/templates/agent-guidance.md. Do not edit directly. -->";

async function readProjectFile(path: string): Promise<string> {
  return readFile(join(root, path), "utf8");
}

describe("package scaffold", () => {
  it("imports CLI and MCP entry modules", async () => {
    await expect(import("../../src/cli/main.js")).resolves.toMatchObject({
      createCliProgram: expect.any(Function),
      main: expect.any(Function)
    });

    await expect(import("../../src/mcp/server.js")).resolves.toMatchObject({
      main: expect.any(Function)
    });
  });

  it("keeps generated agent guidance in sync with the template", async () => {
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

  it("includes all required bundled schema placeholders", async () => {
    const schemaFiles = [
      "config.schema.json",
      "object.schema.json",
      "relation.schema.json",
      "event.schema.json",
      "patch.schema.json"
    ];

    for (const schemaFile of schemaFiles) {
      const schema = JSON.parse(await readProjectFile(`src/schemas/${schemaFile}`)) as { $schema?: string };
      expect(schema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
    }
  });
});
