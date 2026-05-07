import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = parseRepoRoot(process.argv.slice(2));
const packageJsonPath = resolve(repoRoot, "package.json");
const setupPromptTargets = [
  {
    label: "README",
    path: "README.md",
    promptHeader: "Copy and paste this prompt into an AI coding agent to set up a repository:"
  },
  {
    label: "public docs",
    path: "docs/src/content/docs/index.md",
    promptHeader: "Copy this prompt into [Codex]"
  }
];

const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));

if (typeof packageJson.version !== "string" || packageJson.version.length === 0) {
  throw new Error("package.json must declare a non-empty version.");
}

for (const target of setupPromptTargets) {
  const filePath = resolve(repoRoot, target.path);
  const content = await readFile(filePath, "utf8");
  const updated = syncPromptInstallVersion(content, packageJson.version, target);

  if (updated !== content) {
    await writeFile(filePath, updated);
  }
}

console.log(`Pinned setup prompt install commands to @aictx/memory@${packageJson.version}.`);

function syncPromptInstallVersion(content, version, target) {
  const promptHeaderIndex = content.indexOf(target.promptHeader);

  if (promptHeaderIndex === -1) {
    throw new Error(`Could not find the ${target.label} setup prompt.`);
  }

  const fenceStart = content.indexOf("```text", promptHeaderIndex);

  if (fenceStart === -1) {
    throw new Error(`Could not find the ${target.label} setup prompt text fence.`);
  }

  const fenceBodyStart = content.indexOf("\n", fenceStart);

  if (fenceBodyStart === -1) {
    throw new Error(`Could not find the ${target.label} setup prompt body.`);
  }

  const fenceEnd = content.indexOf("\n```", fenceBodyStart);

  if (fenceEnd === -1) {
    throw new Error(`Could not find the end of the ${target.label} setup prompt.`);
  }

  const beforePrompt = content.slice(0, fenceBodyStart + 1);
  const prompt = content.slice(fenceBodyStart + 1, fenceEnd);
  const afterPrompt = content.slice(fenceEnd);
  const installCommandPattern =
    /^npm install -g @aictx\/memory@(latest|[0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?)$/gm;
  const matches = [...prompt.matchAll(installCommandPattern)];

  if (matches.length !== 1) {
    throw new Error(
      `Could not find exactly one pinned ${target.label} setup prompt install command.`
    );
  }

  const updatedPrompt = prompt.replace(
    installCommandPattern,
    `npm install -g @aictx/memory@${version}`
  );

  return `${beforePrompt}${updatedPrompt}${afterPrompt}`;
}

function parseRepoRoot(args) {
  const defaultRepoRoot = fileURLToPath(new URL("../", import.meta.url));
  let root = defaultRepoRoot;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--root") {
      const value = args[index + 1];

      if (value === undefined) {
        throw new Error("--root requires a path.");
      }

      root = value;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return resolve(root);
}
