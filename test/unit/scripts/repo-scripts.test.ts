import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
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
        "Set up Aictx memory for this repository.",
        "",
        "If `aictx` is not installed globally, install it first with:",
        "npm install -g @aictx/memory@latest",
        "",
        "Then run the initial setup:",
        "aictx setup",
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

  it("backs up .aictx into .aictx/.backup and clears the remaining contents", async () => {
    const root = await createTempRoot("aictx-script-reset-");
    await mkdir(join(root, ".aictx", ".backup"), { recursive: true });
    await mkdir(join(root, ".aictx", "memory"), { recursive: true });
    await writeFile(join(root, ".aictx", ".backup", "old.tar.gz"), "old");
    await writeFile(join(root, ".aictx", "config.json"), "{}\n");
    await writeFile(join(root, ".aictx", "memory", "note.md"), "# Note\n");

    const result = await runScript("reset-aictx.mjs", ["--root", root]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    await expect(readdir(join(root, ".aictx"))).resolves.toEqual([".backup"]);

    const backups = await readdir(join(root, ".aictx", ".backup"));
    const archive = backups.find((file) => file.endsWith(".tar.gz") && file !== "old.tar.gz");
    expect(archive).toBeDefined();

    const tarList = await runSubprocess("tar", ["-tzf", join(root, ".aictx", ".backup", archive ?? "")]);
    expect(tarList.ok).toBe(true);
    if (!tarList.ok) {
      throw new Error(tarList.error.message);
    }

    expect(tarList.data.exitCode).toBe(0);
    expect(tarList.data.stdout).toContain("./config.json");
    expect(tarList.data.stdout).toContain("./memory/note.md");
    expect(tarList.data.stdout).not.toContain(".backup");
  });

  it("deletes .aictx without creating a backup when --destroy is passed", async () => {
    const root = await createTempRoot("aictx-script-reset-destroy-");
    await mkdir(join(root, ".aictx", ".backup"), { recursive: true });
    await writeFile(join(root, ".aictx", "config.json"), "{}\n");

    const result = await runScript("reset-aictx.mjs", ["--root", root, "--destroy"]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    await expect(access(join(root, ".aictx"))).rejects.toMatchObject({ code: "ENOENT" });
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
