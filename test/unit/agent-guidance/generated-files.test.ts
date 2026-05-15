import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const generatedNotice = "<!-- Generated from integrations/templates/agent-guidance.md. Do not edit directly. -->";
const skillPrefix = `---\nname: aictx-memory\ndescription: Use this skill when working in a project that uses Aictx project memory. It guides the agent to load relevant memory before non-trivial coding work, save durable memory after meaningful changes, and keep memory inspectable through Aictx and Git when available.\n---\n\n${generatedNotice}\n\n`;
const cursorPrefix = `---\ndescription: Use Aictx project memory when working in this repository.\nalwaysApply: true\n---\n\n${generatedNotice}\n\n`;

const skillGuidancePaths = [
  "integrations/codex/aictx/SKILL.md",
  "integrations/codex/skills/aictx-memory/SKILL.md",
  "integrations/codex/plugins/aictx-memory/skills/aictx-memory/SKILL.md",
  "integrations/claude/aictx/SKILL.md",
  "integrations/claude/plugins/aictx-memory/skills/aictx-memory/SKILL.md"
] as const;

async function readProjectFile(path: string): Promise<string> {
  return readFile(join(root, path), "utf8");
}

async function readJsonFile<T>(path: string): Promise<T> {
  return JSON.parse(await readProjectFile(path)) as T;
}

describe("generated agent guidance files", () => {
  it("keeps Codex and Claude skills generated from the shared template", async () => {
    const template = (await readProjectFile("integrations/templates/agent-guidance.md")).trimEnd();

    for (const path of skillGuidancePaths) {
      await expect(readProjectFile(path)).resolves.toBe(`${skillPrefix}${template}\n`);
    }
  });

  it("keeps Claude and generic guidance generated from the shared template", async () => {
    const template = (await readProjectFile("integrations/templates/agent-guidance.md")).trimEnd();
    const expected = `${generatedNotice}\n\n${template}\n`;

    await expect(readProjectFile("integrations/claude/aictx.md")).resolves.toBe(expected);
    await expect(readProjectFile("integrations/generic/aictx-agent-instructions.md")).resolves.toBe(expected);
  });

  it("keeps Cursor and Cline guidance generated from the shared template", async () => {
    const template = (await readProjectFile("integrations/templates/agent-guidance.md")).trimEnd();
    const clineExpected = `${generatedNotice}\n\n${template}\n`;

    await expect(readProjectFile("integrations/cursor/aictx.mdc")).resolves.toBe(
      `${cursorPrefix}${template}\n`
    );
    await expect(readProjectFile("integrations/cline/aictx.md")).resolves.toBe(clineExpected);
  });

  it("keeps plugin manifests aligned with package metadata", async () => {
    const packageJson = await readJsonFile<{
      version: string;
      homepage: string;
      repository: { url: string };
      license: string;
      author: string;
    }>("package.json");
    const repository = packageJson.repository.url.replace(/^git\+/u, "").replace(/\.git$/u, "");
    const codex = await readJsonFile<{
      name: string;
      version: string;
      description: string;
      author: { name: string; url: string };
      homepage: string;
      repository: string;
      license: string;
      skills: string;
      interface: {
        displayName: string;
        shortDescription: string;
        developerName: string;
        category: string;
        websiteURL: string;
        defaultPrompt: string[];
      };
      mcpServers?: string;
    }>("integrations/codex/plugins/aictx-memory/.codex-plugin/plugin.json");
    const claude = await readJsonFile<{
      name: string;
      version: string;
      description: string;
      author: { name: string; url: string };
      homepage: string;
      repository: string;
      license: string;
      mcpServers?: string;
    }>("integrations/claude/plugins/aictx-memory/.claude-plugin/plugin.json");

    expect(codex).toMatchObject({
      name: "aictx-memory",
      version: packageJson.version,
      author: { name: packageJson.author, url: repository },
      homepage: packageJson.homepage,
      repository,
      license: packageJson.license,
      skills: "./skills/",
      interface: {
        displayName: "Aictx Memory",
        developerName: packageJson.author,
        category: "Productivity",
        websiteURL: packageJson.homepage
      }
    });
    expect(codex.description).toMatch(/Aictx local project memory/i);
    expect(codex.interface.shortDescription).toMatch(/local project memory/i);
    expect(codex.interface.defaultPrompt).toHaveLength(3);
    expect(codex.mcpServers).toBeUndefined();

    expect(claude).toMatchObject({
      name: "aictx-memory",
      version: packageJson.version,
      author: { name: packageJson.author, url: repository },
      homepage: packageJson.homepage,
      repository,
      license: packageJson.license
    });
    expect(claude.description).toMatch(/Aictx local project memory/i);
    expect(claude.mcpServers).toBeUndefined();
  });

  it("documents marketplace commands in generated plugin readmes", async () => {
    const codexReadme = await readProjectFile("integrations/codex/plugins/aictx-memory/README.md");
    const claudeReadme = await readProjectFile("integrations/claude/plugins/aictx-memory/README.md");

    expect(codexReadme).toContain("codex plugin marketplace add owner/repo");
    expect(codexReadme).toContain("codex plugin marketplace upgrade");
    expect(codexReadme).toContain("codex plugin marketplace remove marketplace-name");
    expect(codexReadme).toContain("Aictx MCP setup remains an optional client-level configuration");

    expect(claudeReadme).toContain("/plugin marketplace add owner/repo");
    expect(claudeReadme).toContain("/plugin install aictx-memory@marketplace-name");
    expect(claudeReadme).toContain("claude plugin marketplace add owner/repo");
    expect(claudeReadme).toContain("claude plugin marketplace list --json");
    expect(claudeReadme).toContain("claude plugin marketplace remove marketplace-name");
    expect(claudeReadme).toContain("MCP equivalents only when the current Claude Code session already exposes Aictx MCP tools");
  });
});
