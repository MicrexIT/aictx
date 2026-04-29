import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repoRootUrl = new URL("../", import.meta.url);
const templateUrl = new URL("integrations/templates/agent-guidance.md", repoRootUrl);
const generatedNotice = "<!-- Generated from integrations/templates/agent-guidance.md. Do not edit directly. -->";
const skillPrefix = `---\nname: aictx-memory\ndescription: Use this skill when working in a project that uses Aictx project memory. It guides the agent to load relevant memory before non-trivial coding work, save durable memory patches after meaningful changes, and keep all memory updates reviewable through Aictx and Git when available.\n---\n\n${generatedNotice}\n\n`;

const targets = [
  {
    path: "integrations/codex/aictx/SKILL.md",
    prefix: skillPrefix
  },
  {
    path: "integrations/claude/aictx/SKILL.md",
    prefix: skillPrefix
  },
  {
    path: "integrations/claude/aictx.md",
    prefix: `${generatedNotice}\n\n`
  },
  {
    path: "integrations/generic/aictx-agent-instructions.md",
    prefix: `${generatedNotice}\n\n`
  }
];

const template = await readFile(templateUrl, "utf8");
const normalizedTemplate = template.trimEnd();

for (const target of targets) {
  const targetUrl = new URL(target.path, repoRootUrl);

  await mkdir(dirname(fileURLToPath(targetUrl)), { recursive: true });
  await writeFile(targetUrl, `${target.prefix}${normalizedTemplate}\n`);
}
