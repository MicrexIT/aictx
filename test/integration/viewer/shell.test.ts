import { mkdir, mkdtemp, realpath, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium, type Browser, type ConsoleMessage, type Page } from "playwright";
import { afterEach, describe, expect, it } from "vitest";

import { main, type CliOutputWriter } from "../../../src/cli/main.js";
import type {
  Evidence,
  ObjectFacets,
  ObjectStatus,
  ObjectType,
  Predicate,
  RelationStatus
} from "../../../src/core/types.js";
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
const GRAPH_WIDTH = 960;
const GRAPH_HEIGHT = 420;
const tempRoots: string[] = [];

interface MemoryFixture {
  id: string;
  type: ObjectType;
  status: ObjectStatus;
  title: string;
  bodyPath: string;
  body: string;
  tags: string[];
  facets?: ObjectFacets;
  evidence?: Evidence[];
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
    const aictxHome = await createTempRoot("aictx-viewer-shell-home-");
    const started = await startViewerServer({
      cwd: projectRoot,
      assetsDir: viewerAssetsDir,
      aictxHome,
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

      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(started.data.url, { waitUntil: "domcontentloaded" });
      await page.locator('[data-testid="projects-view"]').waitFor();
      await expectText(page, '[data-testid="project-list"]', "Aictx Viewer Shell Project");
      await page.locator('[data-testid^="project-open-"]').first().click();
      await page.locator('[data-testid="viewer-search"]').waitFor();
      await expectText(page, '[data-testid="memory-list-view"]', "Memories");
      await expectCount(page, '[data-testid="selected-object"]', 0);
      await expectText(page, '[aria-label="Project memory counts"]', "Memories");
      await expectText(page, '[aria-label="Project memory counts"]', "12");
      await expectText(page, '[aria-label="Project memory counts"]', "Connections");
      await expectText(page, '[aria-label="Project memory counts"]', "4");
      await expectText(page, '[aria-label="Project memory counts"]', "Syntheses");
      await expectText(page, '[aria-label="Project memory counts"]', "Sources");

      await page.selectOption('[data-testid="viewer-type-filter"]', "decision");
      await expectCount(page, '[data-testid="object-row-decision.viewer-shell"]', 1);
      await expectCount(page, '[data-testid="object-row-constraint.viewer-markdown"]', 0);

      await page.selectOption('[data-testid="viewer-type-filter"]', "gotcha");
      await expectCount(page, '[data-testid="object-row-gotcha.webhook-duplicates"]', 1);
      await page.selectOption('[data-testid="viewer-type-filter"]', "workflow");
      await expectCount(page, '[data-testid="object-row-workflow.release-checklist"]', 1);

      await page.selectOption('[data-testid="viewer-type-filter"]', "all");
      await page.selectOption('[data-testid="viewer-status-filter"]', "stale");
      await expectCount(page, '[data-testid="object-row-fact.billing-context"]', 1);
      await expectCount(page, '[data-testid="object-row-decision.viewer-shell"]', 0);

      await page.selectOption('[data-testid="viewer-status-filter"]', "all");

      await page.locator('[data-testid="viewer-layer-sources"]').click();
      await expectCount(page, '[data-testid="object-row-source.agent-integration"]', 1);
      await expectCount(page, '[data-testid="object-row-decision.viewer-shell"]', 0);

      await page.locator('[data-testid="viewer-layer-syntheses"]').click();
      await expectCount(page, '[data-testid="object-row-synthesis.agent-guidance"]', 1);
      await expectCount(page, '[data-testid="object-row-source.agent-integration"]', 0);

      await page.locator('[data-testid="viewer-layer-all"]').click();
      await page.fill('[data-testid="viewer-search"]', "agent guidance provenance");
      await page.locator('[data-testid="object-row-synthesis.agent-guidance"]').click();
      await assertSelectedObject(page, "Agent Guidance Synthesis", "synthesis.agent-guidance");
      await expectText(page, '[data-testid="provenance-links"]', "Source: docs/agent-integration.md");
      await expectText(page, '[data-testid="provenance-links"]', "derived_from");
      await page.getByRole("button", { name: "Source: docs/agent-integration.md" }).first().click();
      await assertSelectedObject(page, "Source: docs/agent-integration.md", "source.agent-integration");
      await page.locator('[data-testid="selected-object-back"]').click();

      await page.fill('[data-testid="viewer-search"]', "markdown safety");
      await page.locator('[data-testid="object-row-constraint.viewer-markdown"]').click();
      await assertSelectedObject(page, "Viewer Markdown Safety", "constraint.viewer-markdown");
      await assertMarkdownIsSafe(page);
      await expectCount(page, '[data-testid="memory-list-view"]', 0);

      await page.locator('[data-testid="selected-object-back"]').click();
      await page.selectOption('[data-testid="viewer-tag-filter"]', "security");
      await expectText(page, '[data-testid="memory-list-view"]', "Viewer Markdown Safety");
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
      await assertGraphNodeWithinViewBox(page, "decision.viewer-shell");
      await assertGraphNodeWithinViewBox(page, "constraint.viewer-markdown");
      await assertGraphEdgeWithinViewBox(page, "rel.viewer-shell-requires-markdown");

      await page.getByRole("button", { name: "Viewer Markdown Safety" }).click();
      await assertSelectedObject(page, "Viewer Markdown Safety", "constraint.viewer-markdown");
      await assertGraphSurfaceNonblank(page);
      await assertSelectedGraphNode(page, "constraint.viewer-markdown");
      await expectText(page, '[data-testid="relation-graph"]', "Viewer Shell Layout");
      await expectText(page, '[data-testid="relation-graph"]', "requires");
      await expectNoText(page, '[data-testid="relation-graph"]', "Unrelated Source");

      await page.locator('[data-testid="technical-details"] summary').click();
      await expectText(page, '[data-testid="json-view"]', '"id": "constraint.viewer-markdown"');
      await expectText(page, '[data-testid="json-view"]', '"body_path": ".aictx/memory/constraints/viewer-markdown.md"');
      await expectText(page, '[data-testid="incoming-relations"]', "Viewer Shell Layout");

      await page.locator('[data-testid="selected-object-back"]').click();
      await expectText(page, '[data-testid="memory-list-view"]', "Viewer Shell Layout");
      await expectCount(page, '[data-testid="object-row-constraint.viewer-markdown"]', 0);

      await page.fill('[data-testid="viewer-search"]', "empty neighborhood");
      await page.locator('[data-testid="object-row-note.viewer-empty"]').click();
      await assertSelectedObject(page, "Viewer Empty Neighborhood", "note.viewer-empty");
      await assertSelectedGraphNode(page, "note.viewer-empty");
      await expectText(page, '[data-testid="relation-graph"]', "Viewer Empty Neighborhood");
      await expectText(page, '[data-testid="relation-graph-empty"]', "No direct relations for this object.");
      await expectCount(page, '[data-testid="relation-graph-svg"] [data-testid^="relation-graph-edge-"]', 0);

      await page.locator('[data-testid="nav-projects"]').click();
      await expectText(page, '[data-testid="projects-view"]', "Projects");
      await expectCount(page, '[data-testid="selected-object"]', 0);

      expect(await page.evaluate("window.__AICTX_HTML_EXECUTED")).toBeUndefined();
      expect(consoleErrors()).toEqual([]);
    } finally {
      await browser?.close();
      await started.data.close();
    }
  });

  it("explains the bootstrap workflow when only starter memory exists", async () => {
    const assets = await stat(join(viewerAssetsDir, "index.html"));

    expect(assets.isFile()).toBe(true);

    const projectRoot = await createInitializedProject("aictx-viewer-starter-project-");
    const aictxHome = await createTempRoot("aictx-viewer-starter-home-");
    const started = await startViewerServer({
      cwd: projectRoot,
      assetsDir: viewerAssetsDir,
      aictxHome,
      token: "viewer-starter-token"
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

      await page.setViewportSize({ width: 390, height: 780 });
      await page.goto(started.data.url, { waitUntil: "domcontentloaded" });
      await page.locator('[data-testid="projects-view"]').waitFor();
      await page.locator('[data-testid^="project-open-"]').first().click();
      await page.locator('[data-testid="viewer-search"]').waitFor();

      await expectText(page, '[data-testid="starter-memory-notice"]', "Starter memory only.");
      await expectText(page, '[data-testid="starter-memory-notice"]', "aictx suggest --bootstrap --patch > bootstrap-memory.json");
      await expectText(page, '[data-testid="starter-memory-notice"]', "aictx save --file bootstrap-memory.json");
      await expectCount(page, '[data-testid="selected-object"]', 0);
      await expectText(page, '[aria-label="Project memory counts"]', "Memories");
      await expectText(page, '[aria-label="Project memory counts"]', "2");
      await expectText(page, '[aria-label="Project memory counts"]', "Connections");
      await expectText(page, '[aria-label="Project memory counts"]', "1");
      await page.locator('[data-testid="object-row-architecture.current"]').click();
      await assertSelectedGraphNode(page, "architecture.current");
      await expectText(page, '[data-testid="relation-graph"]', "related_to");
      await expectCount(page, '[data-testid="relation-graph-svg"] [data-testid^="relation-graph-edge-"]', 1);

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

async function assertGraphNodeWithinViewBox(page: Page, id: string): Promise<void> {
  const circle = page.locator(`[data-testid="relation-graph-node-${id}"] circle`);
  const cx = await numberAttribute(circle, "cx");
  const cy = await numberAttribute(circle, "cy");
  const radius = await numberAttribute(circle, "r");

  expect(cx - radius).toBeGreaterThanOrEqual(0);
  expect(cy - radius).toBeGreaterThanOrEqual(0);
  expect(cx + radius).toBeLessThanOrEqual(GRAPH_WIDTH);
  expect(cy + radius).toBeLessThanOrEqual(GRAPH_HEIGHT);
}

async function assertGraphEdgeWithinViewBox(page: Page, id: string): Promise<void> {
  const line = page.locator(`[data-testid="relation-graph-edge-${id}"] line`);

  for (const attribute of ["x1", "y1", "x2", "y2"] as const) {
    const value = await numberAttribute(line, attribute);
    const upperBound = attribute.startsWith("x") ? GRAPH_WIDTH : GRAPH_HEIGHT;

    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThanOrEqual(upperBound);
  }
}

async function numberAttribute(
  locator: ReturnType<Page["locator"]>,
  attribute: string
): Promise<number> {
  const rawValue = await locator.getAttribute(attribute);
  const value = Number(rawValue);

  if (rawValue === null || !Number.isFinite(value)) {
    throw new Error(`Expected numeric ${attribute} attribute, got ${String(rawValue)}.`);
  }

  return value;
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
    id: "gotcha.webhook-duplicates",
    type: "gotcha",
    status: "active",
    title: "Webhook Duplicates",
    bodyPath: "memory/gotchas/webhook-duplicates.md",
    body: "# Webhook Duplicates\n\nNever assume webhook delivery is unique.\n",
    tags: ["viewer", "webhook"],
    updatedAt: FIXED_TIMESTAMP
  });
  await writeMemoryObject(projectRoot, {
    id: "workflow.release-checklist",
    type: "workflow",
    status: "active",
    title: "Release Checklist",
    bodyPath: "memory/workflows/release-checklist.md",
    body: "# Release Checklist\n\nRun the release checklist before publishing.\n",
    tags: ["viewer", "release"],
    updatedAt: FIXED_TIMESTAMP
  });
  await writeMemoryObject(projectRoot, {
    id: "source.agent-integration",
    type: "source",
    status: "active",
    title: "Source: docs/agent-integration.md",
    bodyPath: "memory/sources/agent-integration.md",
    body: "# Source: docs/agent-integration.md\n\nViewer source fixture for agent guidance provenance.\n",
    tags: ["viewer", "source", "guidance"],
    facets: {
      category: "source",
      applies_to: ["docs/agent-integration.md"],
      load_modes: ["onboarding"]
    },
    evidence: [{ kind: "file", id: "docs/agent-integration.md" }],
    updatedAt: FIXED_TIMESTAMP
  });
  await writeMemoryObject(projectRoot, {
    id: "synthesis.agent-guidance",
    type: "synthesis",
    status: "active",
    title: "Agent Guidance Synthesis",
    bodyPath: "memory/syntheses/agent-guidance.md",
    body:
      "# Agent Guidance Synthesis\n\nThis synthesis explains agent guidance provenance for source-backed viewer tests.\n",
    tags: ["viewer", "synthesis", "guidance"],
    facets: {
      category: "agent-guidance",
      applies_to: ["docs/agent-integration.md"],
      load_modes: ["coding", "onboarding"]
    },
    evidence: [{ kind: "source", id: "source.agent-integration" }],
    updatedAt: FIXED_TIMESTAMP_NEXT_MINUTE
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
  await writeRelation(projectRoot, {
    id: "rel.synthesis-agent-guidance-derived-from-source-agent-integration",
    from: "synthesis.agent-guidance",
    predicate: "derived_from",
    to: "source.agent-integration",
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
    ...(fixture.facets === undefined ? {} : { facets: fixture.facets }),
    ...(fixture.evidence === undefined ? {} : { evidence: fixture.evidence }),
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
