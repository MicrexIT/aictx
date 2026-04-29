import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const generatedNotice = "<!-- Generated from integrations/templates/agent-guidance.md. Do not edit directly. -->";
const skillPrefix = `---\nname: aictx-memory\ndescription: Use this skill when working in a project that uses Aictx project memory. It guides the agent to load relevant memory before non-trivial coding work, save durable memory patches after meaningful changes, and keep all memory updates reviewable through Aictx and Git when available.\n---\n\n${generatedNotice}\n\n`;

async function readProjectFile(path: string): Promise<string> {
  return readFile(join(root, path), "utf8");
}

describe("generated agent guidance files", () => {
  it("keeps Codex and Claude skills generated from the shared template", async () => {
    const template = (await readProjectFile("integrations/templates/agent-guidance.md")).trimEnd();
    const codex = await readProjectFile("integrations/codex/aictx/SKILL.md");
    const claudeSkill = await readProjectFile("integrations/claude/aictx/SKILL.md");

    expect(codex).toBe(`${skillPrefix}${template}\n`);
    expect(claudeSkill).toBe(`${skillPrefix}${template}\n`);
  });

  it("keeps Claude and generic guidance generated from the shared template", async () => {
    const template = (await readProjectFile("integrations/templates/agent-guidance.md")).trimEnd();
    const expected = `${generatedNotice}\n\n${template}\n`;

    await expect(readProjectFile("integrations/claude/aictx.md")).resolves.toBe(expected);
    await expect(readProjectFile("integrations/generic/aictx-agent-instructions.md")).resolves.toBe(expected);
  });
});
