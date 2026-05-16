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
  "architecture.local-first-todo-app",
  "concept.filtered-views",
  "concept.quick-add",
  "constraint.offline-first",
  "fact.storage-localstorage",
  "gotcha.completed-filter-counts",
  "project.todo-app",
  "question.recurring-tasks",
  "source.agent-guidance",
  "source.package-json",
  "source.product-brief",
  "source.readme",
  "synthesis.agent-guidance",
  "synthesis.conventions-quality",
  "synthesis.feature-map",
  "synthesis.product-intent",
  "synthesis.repository-map",
  "synthesis.stack-and-tooling",
  "workflow.local-development",
  "workflow.post-task-verification"
];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("viewer demo data seed", () => {
  it("generates deterministic sanitized data from the curated memory allowlist", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "memory-demo-data-"));
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
      meta: { project_root: string; memory_root: string };
      seed: { memory_ids: string[]; source: string };
      projects: { projects: Array<{ registry_id: string; project_root: string }> };
      bootstrap: {
        project: { id: string; name: string };
        objects: Array<{
          id: string;
          type: string;
          facets: { category: string } | null;
          origin: {
            kind: string;
            locator: string;
            captured_at?: string;
            digest?: string;
            media_type?: string;
          } | null;
        }>;
        relations: Array<{ from: string; predicate: string; to: string }>;
        role_coverage: { roles: unknown[]; counts: { populated: number } };
        lenses: Array<{ name: string; included_memory_ids: string[] }>;
      };
    };
    const serialized = JSON.stringify(data);
    const objectIds = data.bootstrap.objects.map((object) => object.id).sort();
    const relationEndpointIds = new Set(
      data.bootstrap.relations.flatMap((relation) => [relation.from, relation.to])
    );
    const sourceObjects = data.bootstrap.objects.filter((object) => object.type === "source");
    const packageJsonSource = data.bootstrap.objects.find((object) => object.id === "source.package-json");
    const predicates = new Set(data.bootstrap.relations.map((relation) => relation.predicate));

    expect(second).toBe(first);
    expect(second).toBe(committed);
    expect([...data.seed.memory_ids].sort()).toEqual(expectedMemoryIds);
    expect(data.seed.source).toBe("synthetic-todo-app-memory");
    expect(data.bootstrap.project).toEqual({
      id: "project.todo-app",
      name: "Todo App"
    });
    expect(objectIds).toEqual(expectedMemoryIds);
    expect(data.bootstrap.objects.find((object) => object.id === "project.todo-app")).toMatchObject({
      type: "project",
      facets: { category: "project-description" }
    });
    expect(data.bootstrap.objects.some((object) => object.id === "project.memory")).toBe(false);
    expect(sourceObjects.length).toBeGreaterThan(0);
    for (const source of sourceObjects) {
      expect(source.origin).toMatchObject({
        kind: "file",
        locator: expect.any(String)
      });
    }
    expect(packageJsonSource?.origin).toMatchObject({
      kind: "file",
      locator: "package.json",
      media_type: "application/json"
    });
    expect(predicates).toContain("supports");
    expect(predicates).toContain("challenges");
    expect(data.meta.project_root).toBe("demo://todo-app");
    expect(data.meta.memory_root).toBe("demo://todo-app/.memory");
    expect(data.projects.projects).toHaveLength(1);
    expect(data.projects.projects[0]).toMatchObject({
      registry_id: "demo",
      project_root: "demo://todo-app"
    });
    expect(data.bootstrap.role_coverage.roles.length).toBeGreaterThan(0);
    expect(data.bootstrap.role_coverage.counts.populated).toBeGreaterThan(0);
    expect(data.bootstrap.lenses.map((lens) => lens.name)).toEqual([
      "project-map",
      "current-work",
      "review-risk",
      "provenance",
      "maintenance"
    ]);
    for (const lens of data.bootstrap.lenses) {
      expect(lens.included_memory_ids.length).toBeGreaterThan(0);
    }
    expect(data.bootstrap.relations.length).toBeGreaterThan(0);
    for (const id of relationEndpointIds) {
      expect(objectIds).toContain(id);
    }

    expect(serialized).not.toContain(repoRoot);
    expect(serialized).not.toMatch(/\/Users\//);
    expect(serialized).not.toMatch(/\/home\//);
    expect(serialized).not.toMatch(/\.memory\/(?:index|context|\.backup|\.lock|exports|recovery)\b/);
    expect(serialized).not.toMatch(/sk_(?:live|test)_[A-Za-z0-9]{16,}/);
    expect(serialized).not.toMatch(/ghp_[A-Za-z0-9_]{20,}/);
    expect(serialized).not.toMatch(
      /(?:password|passwd|secret|api[_-]?key|access[_-]?token|auth[_-]?token)\s*[:=]\s*["'][^"'\s]{12,}["']/i
    );
  });
});
