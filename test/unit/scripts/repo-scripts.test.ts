import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { runSubprocess } from "../../../src/core/subprocess.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const tempRoots: string[] = [];

interface PackageJson {
  scripts?: Record<string, string>;
}

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true }))
  );
});

describe("repo maintenance scripts", () => {
  it("keeps version:patch building generated public docs", async () => {
    const packageJson = JSON.parse(
      await readFile(join(repoRoot, "package.json"), "utf8")
    ) as PackageJson;
    const expectedScript = [
      "npm version patch --no-git-tag-version",
      "node scripts/sync-setup-prompt-install-version.mjs",
      "pnpm build",
      "pnpm build:docs"
    ].join(" && ");

    expect(packageJson.scripts?.["version:patch"]).toBe(expectedScript);
  });

  it("pins setup prompt install commands to the current package version", async () => {
    const root = await createTempRoot("aictx-script-prompts-");
    await writeFile(join(root, "package.json"), JSON.stringify({ version: "9.8.7" }));
    await writeFile(
      join(root, "README.md"),
      [
        "# Example",
        "",
        "```bash",
        "npm install -g @aictx/memory",
        "```",
        "",
        "Copy and paste this prompt into an AI coding agent to set up a repository:",
        "",
        "```text",
        "Set up fresh Aictx memory for this Aictx source repository.",
        "",
        "First reinstall the current Aictx package globally:",
        "npm install -g @aictx/memory@latest",
        "",
        "Then reset the local `.aictx/` state with the Aictx CLI:",
        "aictx reset",
        "",
        "Run the initial onboarding and apply the conservative bootstrap memory patch:",
        "aictx setup",
        "```",
        ""
      ].join("\n")
    );
    await writeDocsIndex(root, [
      "---",
      "title: Aictx documentation",
      "---",
      "",
      "## Install",
      "",
      "```bash",
      "npm install -g @aictx/memory",
      "```",
      "",
      "## First-time setup prompt",
      "",
      "Copy this prompt into [Codex](https://developers.openai.com/codex/cli),",
      "[Claude Code](https://code.claude.com/docs/en/setup),",
      "[Cursor](https://docs.cursor.com/context/rules-for-ai), or another coding",
      "agent from the project root:",
      "",
      "```text",
      "Set up fresh Aictx memory for this repository.",
      "",
      "First install the current Aictx package globally:",
      "npm install -g @aictx/memory@latest",
      "",
      "Run first-run onboarding, apply the conservative bootstrap memory patch, and",
      "start the local viewer for inspection:",
      "aictx setup",
      "",
      "Load the first task-focused memory pack:",
      "aictx load \"onboard to this repository\"",
      "```",
      ""
    ]);

    const result = await runScript("sync-setup-prompt-install-version.mjs", ["--root", root]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("@aictx/memory@9.8.7");
    const readme = await readFile(join(root, "README.md"), "utf8");
    const docsIndex = await readFile(join(root, "docs/src/content/docs/index.md"), "utf8");

    expect(readme).toContain("npm install -g @aictx/memory@9.8.7");
    expect(readme).toContain("npm install -g @aictx/memory\n");
    expect(readme).toContain("aictx reset");
    expect(readme).toContain("aictx setup");
    expect(readme).not.toContain("aictx setup --apply");
    expect(docsIndex).toContain("npm install -g @aictx/memory@9.8.7");
    expect(docsIndex).toContain("npm install -g @aictx/memory\n");
    expect(docsIndex).toContain("aictx setup");
    expect(docsIndex).not.toContain("aictx setup --view");
    expect(docsIndex).not.toContain("aictx setup --apply --view");
    expect(docsIndex).toContain("aictx load \"onboard to this repository\"");
  });

  it("updates already pinned setup prompts on later version bumps", async () => {
    const root = await createTempRoot("aictx-script-prompts-existing-pin-");
    await writeFile(join(root, "package.json"), JSON.stringify({ version: "2.0.1" }));
    await writeFile(
      join(root, "README.md"),
      [
        "Copy and paste this prompt into an AI coding agent to set up a repository:",
        "",
        "```text",
        "If `aictx` is not installed globally, install it first with:",
        "npm install -g @aictx/memory@2.0.0",
        "```",
        ""
      ].join("\n")
    );
    await writeDocsIndex(root, [
      "Copy this prompt into [Codex](https://developers.openai.com/codex/cli),",
      "[Claude Code](https://code.claude.com/docs/en/setup),",
      "[Cursor](https://docs.cursor.com/context/rules-for-ai), or another coding",
      "agent from the project root:",
      "",
      "```text",
      "If `aictx` is not installed globally, install it first with:",
      "npm install -g @aictx/memory@2.0.0",
      "```",
      ""
    ]);

    const result = await runScript("sync-setup-prompt-install-version.mjs", ["--root", root]);

    expect(result.exitCode).toBe(0);
    await expect(readFile(join(root, "README.md"), "utf8")).resolves.toContain(
      "npm install -g @aictx/memory@2.0.1"
    );
    await expect(readFile(join(root, "docs/src/content/docs/index.md"), "utf8")).resolves.toContain(
      "npm install -g @aictx/memory@2.0.1"
    );
  });
});

async function runScript(scriptName: string, args: readonly string[]) {
  const result = await runSubprocess("node", [join(repoRoot, "scripts", scriptName), ...args]);

  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error(result.error.message);
  }

  return result.data;
}

async function createTempRoot(prefix: string): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), prefix));
  tempRoots.push(path);
  return path;
}

async function writeDocsIndex(root: string, lines: readonly string[]): Promise<void> {
  const docsDir = join(root, "docs/src/content/docs");

  await mkdir(docsDir, { recursive: true });
  await writeFile(join(docsDir, "index.md"), lines.join("\n"));
}
