import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { runSubprocess } from "../../../src/core/subprocess.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true }))
  );
});

describe("repo maintenance scripts", () => {
  it("pins the README setup prompt install command to the current package version", async () => {
    const root = await createTempRoot("aictx-script-readme-");
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
        "aictx setup --apply",
        "```",
        ""
      ].join("\n")
    );

    const result = await runScript("sync-readme-install-version.mjs", ["--root", root]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("@aictx/memory@9.8.7");
    await expect(readFile(join(root, "README.md"), "utf8")).resolves.toContain(
      "npm install -g @aictx/memory@9.8.7"
    );
    await expect(readFile(join(root, "README.md"), "utf8")).resolves.toContain(
      "npm install -g @aictx/memory\n"
    );
    await expect(readFile(join(root, "README.md"), "utf8")).resolves.toContain("aictx reset");
    await expect(readFile(join(root, "README.md"), "utf8")).resolves.toContain(
      "aictx setup --apply"
    );
  });

  it("updates an already pinned README setup prompt on later version bumps", async () => {
    const root = await createTempRoot("aictx-script-readme-existing-pin-");
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

    const result = await runScript("sync-readme-install-version.mjs", ["--root", root]);

    expect(result.exitCode).toBe(0);
    await expect(readFile(join(root, "README.md"), "utf8")).resolves.toContain(
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
