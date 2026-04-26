import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const templatePath = "integrations/templates/agent-guidance.md";
const generatedNotice = "<!-- Generated from integrations/templates/agent-guidance.md. Do not edit directly. -->";

const targets = [
  {
    path: "integrations/codex/aictx/SKILL.md",
    prefix: `---\nname: aictx-memory\ndescription: Use this skill when working in a project that uses Aictx project memory. It guides the agent to load relevant memory before non-trivial coding work, save durable memory patches after meaningful changes, and keep all memory updates reviewable through Aictx and Git when available.\n---\n\n${generatedNotice}\n\n`
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

const template = await readFile(templatePath, "utf8");

for (const target of targets) {
  await mkdir(dirname(target.path), { recursive: true });
  await writeFile(join(target.path), `${target.prefix}${template.trimEnd()}\n`);
}
