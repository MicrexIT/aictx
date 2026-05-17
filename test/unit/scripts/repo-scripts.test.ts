import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { runSubprocess } from "../../../src/core/subprocess.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

interface PackageJson {
  scripts?: Record<string, string>;
}

describe("repo maintenance scripts", () => {
  it("keeps version:patch building generated public docs", async () => {
    const packageJson = JSON.parse(
      await readFile(join(repoRoot, "package.json"), "utf8")
    ) as PackageJson;
    const expectedScript = [
      "npm version patch --no-git-tag-version",
      "pnpm build",
      "pnpm build:docs"
    ].join(" && ");

    expect(packageJson.scripts?.["version:patch"]).toBe(expectedScript);
  });

  it("keeps setup prompt install commands unpinned", async () => {
    const readme = await readFile(join(repoRoot, "README.md"), "utf8");
    const docsIndex = await readFile(join(repoRoot, "docs/src/content/docs/index.md"), "utf8");

    for (const content of [readme, docsIndex]) {
      expect(content).toMatch(/^brew install aictx\/tap\/memory$/m);
      expect(content).toMatch(/^npm install -g @aictx\/memory$/m);
      expect(content).not.toMatch(/^npm install -g @aictx\/memory@/m);
    }
  });

  it("renders the Homebrew formula from package metadata", async () => {
    const sha256 = "a".repeat(64);
    const result = await runSubprocess(
      "node",
      ["scripts/render-homebrew-formula.mjs", "--", "--version", "1.2.3", "--sha256", sha256],
      { cwd: repoRoot }
    );

    expect(result.ok).toBe(true);

    if (!result.ok) {
      return;
    }

    expect(result.data.exitCode).toBe(0);
    expect(result.data.stderr).toBe("");
    expect(result.data.stdout).toContain("class Memory < Formula");
    expect(result.data.stdout).toContain("url \"https://registry.npmjs.org/@aictx/memory/-/memory-1.2.3.tgz\"");
    expect(result.data.stdout).toContain(`sha256 "${sha256}"`);
    expect(result.data.stdout).toContain("depends_on \"node\"");
    expect(result.data.stdout).toContain(
      "(bin/\"memory\").write_env_script libexec/\"bin/memory\", PATH: \"#{node_path}:$PATH\""
    );
    expect(result.data.stdout).toContain("assert_match version.to_s");
  });
});
