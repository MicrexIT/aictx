import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

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
      expect(content).toMatch(/^npm install -g @aictx\/memory$/m);
      expect(content).not.toMatch(/^npm install -g @aictx\/memory@/m);
    }
  });
});
