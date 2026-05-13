import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const repoRoot = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const scriptPath = join(repoRoot, "scripts", "build-viewer-demo-data.mjs");
const committedSeedPath = join(repoRoot, "src", "viewer", "demo-data.generated.json");
const tempRoots: string[] = [];
const expectedMemoryIds = [
  "architecture.current",
  "constraint.node-engine",
  "constraint.package-manager",
  "project.aictx",
  "source.docs-src-content-docs-agent-integration",
  "source.package-json",
  "source.readme",
  "synthesis.agent-guidance",
  "synthesis.conventions-quality",
  "synthesis.feature-map",
  "synthesis.product-intent",
  "synthesis.repository-map",
  "synthesis.stack-and-tooling",
  "workflow.package-scripts",
  "workflow.post-task-verification"
];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("viewer demo data seed", () => {
  it("generates deterministic sanitized data from the curated memory allowlist", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "aictx-demo-data-"));
    tempRoots.push(tempRoot);
    const outFile = join(tempRoot, "demo-data.json");

    await execFileAsync(process.execPath, [scriptPath, "--out", outFile], {
      cwd: repoRoot
    });

    const first = await readFile(outFile, "utf8");
    const committed = await readFile(committedSeedPath, "utf8");

    await execFileAsync(process.execPath, [scriptPath, "--out", outFile], {
      cwd: repoRoot
    });

    const second = await readFile(outFile, "utf8");
    const data = JSON.parse(second) as {
      meta: { project_root: string; aictx_root: string };
      seed: { memory_ids: string[] };
      projects: { projects: Array<{ registry_id: string; project_root: string }> };
      bootstrap: {
        objects: Array<{ id: string }>;
        relations: Array<{ from: string; to: string }>;
      };
    };
    const serialized = JSON.stringify(data);
    const objectIds = data.bootstrap.objects.map((object) => object.id).sort();
    const relationEndpointIds = new Set(
      data.bootstrap.relations.flatMap((relation) => [relation.from, relation.to])
    );

    expect(second).toBe(first);
    expect(second).toBe(committed);
    expect([...data.seed.memory_ids].sort()).toEqual(expectedMemoryIds);
    expect(objectIds).toEqual(expectedMemoryIds);
    expect(data.meta.project_root).toBe("demo://aictx");
    expect(data.meta.aictx_root).toBe("demo://aictx/.aictx");
    expect(data.projects.projects).toHaveLength(1);
    expect(data.projects.projects[0]).toMatchObject({
      registry_id: "demo",
      project_root: "demo://aictx"
    });
    expect(data.bootstrap.relations.length).toBeGreaterThan(0);
    for (const id of relationEndpointIds) {
      expect(objectIds).toContain(id);
    }

    expect(serialized).not.toContain(repoRoot);
    expect(serialized).not.toMatch(/\/Users\//);
    expect(serialized).not.toMatch(/\/home\//);
    expect(serialized).not.toMatch(/\.aictx\/(?:index|context|\.backup|\.lock|exports|recovery)\b/);
    expect(serialized).not.toMatch(/sk_(?:live|test)_[A-Za-z0-9]{16,}/);
    expect(serialized).not.toMatch(/ghp_[A-Za-z0-9_]{20,}/);
    expect(serialized).not.toMatch(
      /(?:password|passwd|secret|api[_-]?key|access[_-]?token|auth[_-]?token)\s*[:=]\s*["'][^"'\s]{12,}["']/i
    );
  });
});
