import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repoRootUrl = new URL("../", import.meta.url);
const packageJsonUrl = new URL("package.json", repoRootUrl);
const licenseUrl = new URL("LICENSE", repoRootUrl);
const templateUrl = new URL("integrations/templates/agent-guidance.md", repoRootUrl);
const generatedNotice = "<!-- Generated from integrations/templates/agent-guidance.md. Do not edit directly. -->";
const publicName = "aictx-memory";
const displayName = "Aictx Memory";
const skillDescription = "Use this skill when working in a project that uses Aictx project memory. It guides the agent to load relevant memory before non-trivial coding work, save durable memory after meaningful changes, and keep memory inspectable through Aictx and Git when available.";
const pluginDescription = "Use Aictx local project memory in AI coding agents.";
const skillPrefix = `---\nname: ${publicName}\ndescription: ${skillDescription}\n---\n\n${generatedNotice}\n\n`;
const cursorPrefix = `---\ndescription: Use Aictx project memory when working in this repository.\nalwaysApply: true\n---\n\n${generatedNotice}\n\n`;

const guidanceTargets = [
  {
    path: "integrations/codex/aictx/SKILL.md",
    prefix: skillPrefix
  },
  {
    path: "integrations/codex/skills/aictx-memory/SKILL.md",
    prefix: skillPrefix
  },
  {
    path: "integrations/codex/plugins/aictx-memory/skills/aictx-memory/SKILL.md",
    prefix: skillPrefix
  },
  {
    path: "integrations/claude/aictx/SKILL.md",
    prefix: skillPrefix
  },
  {
    path: "integrations/claude/plugins/aictx-memory/skills/aictx-memory/SKILL.md",
    prefix: skillPrefix
  },
  {
    path: "integrations/claude/aictx.md",
    prefix: `${generatedNotice}\n\n`
  },
  {
    path: "integrations/cursor/aictx.mdc",
    prefix: cursorPrefix
  },
  {
    path: "integrations/cline/aictx.md",
    prefix: `${generatedNotice}\n\n`
  },
  {
    path: "integrations/generic/aictx-agent-instructions.md",
    prefix: `${generatedNotice}\n\n`
  }
];

const [template, packageJsonRaw, licenseText] = await Promise.all([
  readFile(templateUrl, "utf8"),
  readFile(packageJsonUrl, "utf8"),
  readFile(licenseUrl, "utf8")
]);
const normalizedTemplate = template.trimEnd();
const packageJson = JSON.parse(packageJsonRaw);
const repositoryUrl = normalizeRepositoryUrl(packageJson.repository);
const authorName = typeof packageJson.author === "string" ? packageJson.author : "MicrexIT";

const codexPluginManifest = {
  name: publicName,
  version: packageJson.version,
  description: pluginDescription,
  author: {
    name: authorName,
    url: repositoryUrl
  },
  homepage: packageJson.homepage,
  repository: repositoryUrl,
  license: packageJson.license,
  keywords: ["aictx", "project-memory", "coding-agents", "local-first"],
  skills: "./skills/",
  interface: {
    displayName,
    shortDescription: "Load and save local project memory with Aictx.",
    longDescription:
      "Packages the Aictx memory workflow as a Codex skill. Agents stay CLI-first, load task-relevant project memory before substantial work, and save only durable knowledge after meaningful changes.",
    developerName: authorName,
    category: "Productivity",
    websiteURL: packageJson.homepage,
    defaultPrompt: [
      "Set up Aictx memory for this repo.",
      "Load Aictx memory before this task.",
      "Decide whether this task changed Aictx memory."
    ]
  }
};

const claudePluginManifest = {
  name: publicName,
  description: pluginDescription,
  version: packageJson.version,
  author: {
    name: authorName,
    url: repositoryUrl
  },
  homepage: packageJson.homepage,
  repository: repositoryUrl,
  license: packageJson.license
};

for (const target of guidanceTargets) {
  await writeGeneratedText(target.path, `${target.prefix}${normalizedTemplate}\n`);
}

await Promise.all([
  writeGeneratedJson("integrations/codex/plugins/aictx-memory/.codex-plugin/plugin.json", codexPluginManifest),
  writeGeneratedJson("integrations/claude/plugins/aictx-memory/.claude-plugin/plugin.json", claudePluginManifest),
  writeGeneratedText("integrations/codex/skills/aictx-memory/LICENSE.txt", licenseText),
  writeGeneratedText("integrations/codex/plugins/aictx-memory/LICENSE", licenseText),
  writeGeneratedText("integrations/claude/plugins/aictx-memory/LICENSE", licenseText),
  writeGeneratedText("integrations/codex/plugins/aictx-memory/README.md", buildCodexPluginReadme()),
  writeGeneratedText("integrations/claude/plugins/aictx-memory/README.md", buildClaudePluginReadme())
]);

async function writeGeneratedText(path, contents) {
  const targetUrl = new URL(path, repoRootUrl);

  await mkdir(dirname(fileURLToPath(targetUrl)), { recursive: true });
  await writeFile(targetUrl, contents);
}

async function writeGeneratedJson(path, value) {
  await writeGeneratedText(path, `${JSON.stringify(value, null, 2)}\n`);
}

function normalizeRepositoryUrl(repository) {
  const value = typeof repository === "string" ? repository : repository?.url;

  if (typeof value !== "string" || value.length === 0) {
    return packageJson.homepage;
  }

  return value.replace(/^git\+/u, "").replace(/\.git$/u, "");
}

function buildCodexPluginReadme() {
  return `${generatedNotice}

# ${displayName} for Codex

This plugin packages the \`${publicName}\` skill for Codex.

It keeps Aictx usage CLI-first: load relevant memory with \`aictx load\` before substantial work, save durable knowledge with \`aictx remember --stdin\`, and use MCP equivalents only when the current Codex session already exposes Aictx MCP tools.

## Contents

- \`.codex-plugin/plugin.json\`
- \`skills/aictx-memory/SKILL.md\`

## Distribution

This directory follows the Codex plugin format. It intentionally does not include MCP server configuration; Aictx MCP setup remains an optional client-level configuration.

Codex adds plugins through marketplace sources, not by adding this plugin directory directly. This repo exposes the plugin through its root marketplace catalog:

\`\`\`bash
codex plugin marketplace add MicrexIT/aictx
\`\`\`

Then open Codex Plugins, choose the Aictx marketplace, and install Aictx Memory.
`;
}

function buildClaudePluginReadme() {
  return `${generatedNotice}

# ${displayName} for Claude Code

This plugin packages the \`${publicName}\` skill for Claude Code.

It keeps Aictx usage CLI-first: load relevant memory with \`aictx load\` before substantial work, save durable knowledge with \`aictx remember --stdin\`, and use MCP equivalents only when the current Claude Code session already exposes Aictx MCP tools.

## Contents

- \`.claude-plugin/plugin.json\`
- \`skills/aictx-memory/SKILL.md\`

## Distribution

This directory follows the Claude Code plugin format. Submit it through Anthropic's plugin submission flow when targeting the official Claude plugin directory.

Claude Code adds plugins through marketplace sources, not by adding this plugin directory directly. This repo exposes the plugin through its root marketplace catalog:

\`\`\`text
/plugin marketplace add MicrexIT/aictx
/plugin install aictx-memory@aictx
\`\`\`

For official Claude listing, validate this directory with \`claude plugin validate integrations/claude/plugins/aictx-memory\` and use Anthropic's plugin submission flow.
`;
}
