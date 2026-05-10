import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repoRoot = resolve(fileURLToPath(new URL("../../..", import.meta.url)));

describe("site landing page", () => {
  it("states the sharpened value proposition and primary actions", async () => {
    const landing = await readFile(resolve(repoRoot, "site/src/pages/index.astro"), "utf8");

    expect(landing).toContain("Stop re-explaining your repo to AI agents.");
    expect(landing).toContain(
      "Aictx gives agents durable project memory they can load before work and update after"
    );
    expect(landing).toContain("Install Aictx");
    expect(landing).toContain("Browse demo");
    expect(landing).toContain("npm install -g @aictx/memory");
    expect(landing).toContain("Token efficiency");
    expect(landing).toContain("Spend the context window on the task.");
  });

  it("frames the demo as human inspection of future agent memory", async () => {
    const landing = await readFile(resolve(repoRoot, "site/src/pages/index.astro"), "utf8");

    expect(landing).toContain("See the memory future agents will use.");
    expect(landing).toContain("Inspect the local project memory your agents load before work.");
    expect(landing).not.toContain("Browse the local handbook");
  });
});
