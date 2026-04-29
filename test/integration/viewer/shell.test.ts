import { mkdir, mkdtemp, realpath, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium, type Browser, type ConsoleMessage, type Page } from "playwright";
import { afterEach, describe, expect, it } from "vitest";

import { main, type CliOutputWriter } from "../../../src/cli/main.js";
import type { ObjectStatus, ObjectType, Predicate, RelationStatus } from "../../../src/core/types.js";
import {
  computeObjectContentHash,
  computeRelationContentHash
} from "../../../src/storage/hashes.js";
import type { MemoryObjectSidecar } from "../../../src/storage/objects.js";
import { readCanonicalStorage } from "../../../src/storage/read.js";
import type { MemoryRelation } from "../../../src/storage/relations.js";
import { startViewerServer } from "../../../src/viewer/server.js";
import {
  FIXED_TIMESTAMP,
  FIXED_TIMESTAMP_NEXT_MINUTE
} from "../../fixtures/time.js";

const repoRoot = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const viewerAssetsDir = join(repoRoot, "dist", "viewer");
const tempRoots: string[] = [];

interface MemoryFixture {
  id: string;
  type: ObjectType;
  status: ObjectStatus;
  title: string;
  bodyPath: string;
  body: string;
  tags: string[];
  updatedAt?: string;
}

interface RelationFixture {
  id: string;
  from: string;
  predicate: Predicate;
  to: string;
  status: RelationStatus;
}

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true }))
  );
});

describe("read-only viewer shell", () => {
  it("loads bootstrap data, searches objects, renders safe Markdown, JSON, and relations", async () => {
    const assets = await stat(join(viewerAssetsDir, "index.html"));

    expect(assets.isFile()).toBe(true);

    const projectRoot = await createInitializedProject("aictx-viewer-shell-project-");
    await writeViewerFixtures(projectRoot);
    const started = await startViewerServer({
      cwd: projectRoot,
      assetsDir: viewerAssetsDir,
      token: "viewer-shell-token"
    });

    expect(started.ok).toBe(true);
    if (!started.ok) {
      throw new Error(started.error.message);
    }

    let browser: Browser | null = null;

    try {
      browser = await chromium.launch();
      const page = await browser.newPage();
      const consoleErrors = collectPageErrors(page);

      await page.goto(started.data.url, { waitUntil: "domcontentloaded" });
      await page.locator('[data-testid="viewer-search"]').waitFor();

      await page.fill('[data-testid="viewer-search"]', "markdown safety");
      await page.locator('[data-testid="object-row-constraint.viewer-markdown"]').click();
      await assertSelectedObject(page, "Viewer Markdown Safety", "constraint.viewer-markdown");
      await assertMarkdownIsSafe(page);

      await page.selectOption('[data-testid="viewer-tag-filter"]', "security");
      await expectText(page, '[data-testid="selected-object"]', "Viewer Markdown Safety");
      await expectCount(page, '[data-testid="object-row-decision.viewer-shell"]', 0);

      await page.selectOption('[data-testid="viewer-tag-filter"]', "all");
      await page.fill('[data-testid="viewer-search"]', "shell layout");
      await page.locator('[data-testid="object-row-decision.viewer-shell"]').click();
      await assertSelectedObject(page, "Viewer Shell Layout", "decision.viewer-shell");
      await expectText(page, '[data-testid="outgoing-relations"]', "requires");
      await expectText(page, '[data-testid="outgoing-relations"]', "Viewer Markdown Safety");
      await assertGraphSurfaceNonblank(page);
      await assertSelectedGraphNode(page, "decision.viewer-shell");
      await expectText(page, '[data-testid="relation-graph"]', "Viewer Shell Layout");
      await expectText(page, '[data-testid="relation-graph"]', "Viewer Markdown Safety");
      await expectText(page, '[data-testid="relation-graph"]', "requires");
      await expectNoText(page, '[data-testid="relation-graph"]', "Unrelated Source");
      await expectNoText(page, '[data-testid="relation-graph"]', "Unrelated Target");
      await expectCount(page, '[data-testid="relation-graph-svg"] [data-testid^="relation-graph-edge-"]', 1);

      await page.getByRole("button", { name: /to Viewer Markdown Safety/ }).click();
      await assertSelectedObject(page, "Viewer Markdown Safety", "constraint.viewer-markdown");
      await assertGraphSurfaceNonblank(page);
      await assertSelectedGraphNode(page, "constraint.viewer-markdown");
      await expectText(page, '[data-testid="relation-graph"]', "Viewer Shell Layout");
      await expectText(page, '[data-testid="relation-graph"]', "requires");
      await expectNoText(page, '[data-testid="relation-graph"]', "Unrelated Source");

      await page.locator('[data-testid="json-tab"]').click();
      await expectText(page, '[data-testid="json-view"]', '"id": "constraint.viewer-markdown"');
      await expectText(page, '[data-testid="json-view"]', '"body_path": ".aictx/memory/constraints/viewer-markdown.md"');
      await expectText(page, '[data-testid="incoming-relations"]', "Viewer Shell Layout");

      await page.fill('[data-testid="viewer-search"]', "empty neighborhood");
      await page.locator('[data-testid="object-row-note.viewer-empty"]').click();
      await assertSelectedObject(page, "Viewer Empty Neighborhood", "note.viewer-empty");
      await assertSelectedGraphNode(page, "note.viewer-empty");
      await expectText(page, '[data-testid="relation-graph"]', "Viewer Empty Neighborhood");
      await expectText(page, '[data-testid="relation-graph-empty"]', "No direct relations for this object.");
      await expectCount(page, '[data-testid="relation-graph-svg"] [data-testid^="relation-graph-edge-"]', 0);

      expect(await page.evaluate("window.__AICTX_HTML_EXECUTED")).toBeUndefined();
      expect(consoleErrors()).toEqual([]);
    } finally {
      await browser?.close();
      await started.data.close();
    }
  });
});

async function assertSelectedObject(page: Page, title: string, id: string): Promise<void> {
  await expectText(page, '[data-testid="selected-object"]', title);
  await expectText(page, '[data-testid="selected-object"]', id);
}

async function assertMarkdownIsSafe(page: Page): Promise<void> {
  const markdown = page.locator('[data-testid="markdown-view"]');

  await expectText(page, '[data-testid="markdown-view"]', "<script>window.__AICTX_HTML_EXECUTED = true</script>");
  await expectText(page, '[data-testid="markdown-view"]', "<img src=x onerror=\"window.__AICTX_HTML_EXECUTED = true\">");
  await expectCount(page, '[data-testid="markdown-view"] script', 0);
  await expectCount(page, '[data-testid="markdown-view"] img', 0);
  await expect(markdown.textContent()).resolves.toContain("Verify search works");
}

async function assertGraphSurfaceNonblank(page: Page): Promise<void> {
  const graph = page.locator('[data-testid="relation-graph-svg"]');

  await graph.waitFor();
  const box = await graph.boundingBox();

  expect(box).not.toBeNull();
  expect(box?.width ?? 0).toBeGreaterThan(100);
  expect(box?.height ?? 0).toBeGreaterThan(100);
  await expectCount(page, '[data-testid="relation-graph-svg"] [data-testid^="relation-graph-edge-"]', 1);
}

async function assertSelectedGraphNode(page: Page, id: string): Promise<void> {
  const node = page.locator(`[data-testid="relation-graph-node-${id}"]`);

  await node.waitFor();
  await expect(node.getAttribute("class")).resolves.toContain("selected-node");
}

async function expectText(page: Page, selector: string, expected: string): Promise<void> {
  await page.locator(selector).waitFor();
  await expect(page.locator(selector).textContent()).resolves.toContain(expected);
}

async function expectNoText(page: Page, selector: string, expected: string): Promise<void> {
  await page.locator(selector).waitFor();
  await expect(page.locator(selector).textContent()).resolves.not.toContain(expected);
}

async function expectCount(page: Page, selector: string, expected: number): Promise<void> {
  await expect(page.locator(selector).count()).resolves.toBe(expected);
}

function collectPageErrors(page: Page): () => string[] {
  const errors: string[] = [];

  page.on("console", (message: ConsoleMessage) => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    errors.push(error.message);
  });

  return () => errors;
}

async function writeViewerFixtures(projectRoot: string): Promise<void> {
  await writeMemoryObject(projectRoot, {
    id: "constraint.viewer-markdown",
    type: "constraint",
    status: "active",
    title: "Viewer Markdown Safety",
    bodyPath: "memory/constraints/viewer-markdown.md",
    body: [
      "# Viewer Markdown Safety",
      "",
      "Client-side body text includes <script>window.__AICTX_HTML_EXECUTED = true</script> and <img src=x onerror=\"window.__AICTX_HTML_EXECUTED = true\"> as inert text.",
      "",
      "- Verify search works",
      "- Keep raw HTML inert",
      ""
    ].join("\n"),
    tags: ["viewer", "security"],
    updatedAt: FIXED_TIMESTAMP_NEXT_MINUTE
  });
  await writeMemoryObject(projectRoot, {
    id: "decision.viewer-shell",
    type: "decision",
    status: "active",
    title: "Viewer Shell Layout",
    bodyPath: "memory/decisions/viewer-shell.md",
    body: "# Viewer Shell Layout\n\nThe shell shows a searchable object list and direct relation context.\n",
    tags: ["viewer", "ui"],
    updatedAt: FIXED_TIMESTAMP_NEXT_MINUTE
  });
  await writeMemoryObject(projectRoot, {
    id: "fact.billing-context",
    type: "fact",
    status: "stale",
    title: "Billing Context",
    bodyPath: "memory/facts/billing-context.md",
    body: "# Billing Context\n\nThis fixture proves unrelated memory can be filtered away.\n",
    tags: ["billing"],
    updatedAt: FIXED_TIMESTAMP
  });
  await writeMemoryObject(projectRoot, {
    id: "note.viewer-empty",
    type: "note",
    status: "active",
    title: "Viewer Empty Neighborhood",
    bodyPath: "memory/notes/viewer-empty.md",
    body: "# Viewer Empty Neighborhood\n\nThis fixture has no direct relation neighborhood.\n",
    tags: ["viewer", "empty"],
    updatedAt: FIXED_TIMESTAMP
  });
  await writeMemoryObject(projectRoot, {
    id: "fact.viewer-unrelated-source",
    type: "fact",
    status: "active",
    title: "Unrelated Source",
    bodyPath: "memory/facts/viewer-unrelated-source.md",
    body: "# Unrelated Source\n\nThis fixture must not appear in another object's selected graph.\n",
    tags: ["viewer", "unrelated"],
    updatedAt: FIXED_TIMESTAMP
  });
  await writeMemoryObject(projectRoot, {
    id: "fact.viewer-unrelated-target",
    type: "fact",
    status: "active",
    title: "Unrelated Target",
    bodyPath: "memory/facts/viewer-unrelated-target.md",
    body: "# Unrelated Target\n\nThis fixture is linked only to the unrelated source.\n",
    tags: ["viewer", "unrelated"],
    updatedAt: FIXED_TIMESTAMP
  });
  await writeRelation(projectRoot, {
    id: "rel.viewer-shell-requires-markdown",
    from: "decision.viewer-shell",
    predicate: "requires",
    to: "constraint.viewer-markdown",
    status: "active"
  });
  await writeRelation(projectRoot, {
    id: "rel.viewer-unrelated-affects-target",
    from: "fact.viewer-unrelated-source",
    predicate: "affects",
    to: "fact.viewer-unrelated-target",
    status: "active"
  });
}

async function writeMemoryObject(projectRoot: string, fixture: MemoryFixture): Promise<void> {
  const storage = await readStorageOrThrow(projectRoot);
  const timestamp = fixture.updatedAt ?? FIXED_TIMESTAMP;
  const sidecarWithoutHash = {
    id: fixture.id,
    type: fixture.type,
    status: fixture.status,
    title: fixture.title,
    body_path: fixture.bodyPath,
    scope: {
      kind: "project",
      project: storage.config.project.id,
      branch: null,
      task: null
    },
    tags: fixture.tags,
    source: {
      kind: "agent"
    },
    created_at: timestamp,
    updated_at: timestamp
  } satisfies Omit<MemoryObjectSidecar, "content_hash">;
  const sidecar: MemoryObjectSidecar = {
    ...sidecarWithoutHash,
    content_hash: computeObjectContentHash(sidecarWithoutHash, fixture.body)
  };

  await writeProjectFile(projectRoot, `.aictx/${fixture.bodyPath}`, fixture.body);
  await writeJsonProjectFile(
    projectRoot,
    `.aictx/${fixture.bodyPath.replace(/\.md$/, ".json")}`,
    sidecar
  );
}

async function writeRelation(projectRoot: string, fixture: RelationFixture): Promise<void> {
  const relationWithoutHash = {
    id: fixture.id,
    from: fixture.from,
    predicate: fixture.predicate,
    to: fixture.to,
    status: fixture.status,
    confidence: "high",
    evidence: [
      {
        kind: "memory",
        id: fixture.from
      }
    ],
    created_at: FIXED_TIMESTAMP_NEXT_MINUTE,
    updated_at: FIXED_TIMESTAMP_NEXT_MINUTE
  } satisfies Omit<MemoryRelation, "content_hash">;
  const relation: MemoryRelation = {
    ...relationWithoutHash,
    content_hash: computeRelationContentHash(relationWithoutHash)
  };

  await writeJsonProjectFile(
    projectRoot,
    `.aictx/relations/${fixture.id.replace(/^rel\./, "")}.json`,
    relation
  );
}

async function createInitializedProject(prefix: string): Promise<string> {
  const projectRoot = await createTempRoot(prefix);
  const output = createCapturedOutput();
  const exitCode = await main(["node", "aictx", "init", "--json"], {
    ...output.writers,
    cwd: projectRoot
  });

  expect(exitCode).toBe(0);
  expect(output.stderr()).toBe("");

  return projectRoot;
}

async function readStorageOrThrow(projectRoot: string) {
  const storage = await readCanonicalStorage(projectRoot);

  expect(storage.ok).toBe(true);
  if (!storage.ok) {
    throw new Error(storage.error.message);
  }

  return storage.data;
}

async function writeProjectFile(
  projectRoot: string,
  relativePath: string,
  contents: string
): Promise<void> {
  const target = join(projectRoot, relativePath);

  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, contents, "utf8");
}

async function writeJsonProjectFile(
  projectRoot: string,
  relativePath: string,
  value: unknown
): Promise<void> {
  await writeProjectFile(projectRoot, relativePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function createTempRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  const resolvedRoot = await realpath(root);

  tempRoots.push(resolvedRoot);
  return resolvedRoot;
}

function createCapturedOutput(): {
  writers: { stdout: CliOutputWriter; stderr: CliOutputWriter };
  stdout: () => string;
  stderr: () => string;
} {
  let stdout = "";
  let stderr = "";

  return {
    writers: {
      stdout: (text) => {
        stdout += text;
      },
      stderr: (text) => {
        stderr += text;
      }
    },
    stdout: () => stdout,
    stderr: () => stderr
  };
}
