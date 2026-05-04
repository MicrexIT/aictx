import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = parseRepoRoot(process.argv.slice(2));
const packageJsonPath = resolve(repoRoot, "package.json");
const readmePath = resolve(repoRoot, "README.md");

const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));

if (typeof packageJson.version !== "string" || packageJson.version.length === 0) {
  throw new Error("package.json must declare a non-empty version.");
}

const readme = await readFile(readmePath, "utf8");
const updated = syncPromptInstallVersion(readme, packageJson.version);

if (updated !== readme) {
  await writeFile(readmePath, updated);
}

console.log(`Pinned README setup prompt install command to @aictx/memory@${packageJson.version}.`);

function syncPromptInstallVersion(readme, version) {
  const promptHeader = "Copy and paste this prompt into an AI coding agent to set up a repository:";
  const promptHeaderIndex = readme.indexOf(promptHeader);

  if (promptHeaderIndex === -1) {
    throw new Error("Could not find the README AI-agent setup prompt.");
  }

  const fenceStart = readme.indexOf("```text", promptHeaderIndex);

  if (fenceStart === -1) {
    throw new Error("Could not find the README AI-agent setup prompt text fence.");
  }

  const fenceBodyStart = readme.indexOf("\n", fenceStart);

  if (fenceBodyStart === -1) {
    throw new Error("Could not find the README AI-agent setup prompt body.");
  }

  const fenceEnd = readme.indexOf("\n```", fenceBodyStart);

  if (fenceEnd === -1) {
    throw new Error("Could not find the end of the README AI-agent setup prompt.");
  }

  const beforePrompt = readme.slice(0, fenceBodyStart + 1);
  const prompt = readme.slice(fenceBodyStart + 1, fenceEnd);
  const afterPrompt = readme.slice(fenceEnd);
  const installCommandPattern =
    /^npm install -g @aictx\/memory@(latest|[0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?)$/gm;
  const matches = [...prompt.matchAll(installCommandPattern)];

  if (matches.length !== 1) {
    throw new Error("Could not find exactly one pinned README setup prompt install command.");
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
