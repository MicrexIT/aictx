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
    expect(landing).not.toContain("Join discussions");
    expect(landing).toContain("npm install -g @aictx/memory");
    expect(landing).toContain("Aictx is not another chat UI or hosted memory service.");
    expect(landing).toContain("No hosted dependency");
    expect(landing).toContain(
      "Core memory works without a cloud account, embeddings, hosted sync, or external model API."
    );
    expect(landing).toContain("Project memory for Codex.");
    expect(landing).toContain("Context");
    expect(landing).not.toContain("Codex starts with the missing context.");
    expect(landing).toContain("Worked for 7m 18s");
    expect(landing).toContain("AI Context Pack");
    expect(landing).toContain("Remind me: are we still avoiding dashboard-style UI here?");
    expect(landing).toContain("aictx load \"improve viewer search UI\"");
    expect(landing).toContain("Loaded 6 relevant memories before editing");
    expect(landing).toContain("Viewer memory page follows a document-style handbook layout.");
    expect(landing).not.toContain("Inspect the memory agents will use.");
    expect(landing).toContain("How it works");
    expect(landing).toContain("Aictx keeps memory local, explicit, and reviewable.");
    expect(landing).toContain("The agent loads the project context it needs.");
    expect(landing).toContain("The agent does the work with that context.");
    expect(landing).toContain("The agent saves what future agents should remember.");
    expect(landing).not.toContain("Load context. Save memory. Review the diff.");
    expect(landing).not.toContain("aictx load \"change auth routes\"");
    expect(landing).not.toContain("aictx save --stdin");
    expect(landing).not.toContain("aictx diff");
    expect(landing).not.toContain("Let agents learn under review.");
    expect(landing).not.toContain("Useful knowledge. No durable review.");
    expect(landing).not.toContain("Review, commit, or roll back.");
  });

  it("keeps community navigation in the header instead of the hero", async () => {
    const layout = await readFile(resolve(repoRoot, "site/src/layouts/BaseLayout.astro"), "utf8");

    expect(layout).toContain("Discussions");
    expect(layout).toContain("https://github.com/MicrexIT/aictx/discussions");
  });

  it("frames the demo as human inspection of future agent memory", async () => {
    const landing = await readFile(resolve(repoRoot, "site/src/pages/index.astro"), "utf8");

    expect(landing).toContain("See the memory future agents will use.");
    expect(landing).toContain("Inspect the local project memory your agents load before work.");
    expect(landing).not.toContain("Browse the local handbook");
  });
});
