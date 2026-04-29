import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  stat,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium, type Browser, type ConsoleMessage, type Page } from "playwright";
import { afterEach, describe, expect, it } from "vitest";

import { main, type CliOutputWriter } from "../../../src/cli/main.js";
import type {
  ObjectId,
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
import { FIXED_TIMESTAMP } from "../../fixtures/time.js";

const repoRoot = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const viewerAssetsDir = join(repoRoot, "dist", "viewer");
const tempRoots: string[] = [];

interface MemoryFixture {
  id: ObjectId;
  type: ObjectType;
  status: ObjectStatus;
  title: string;
  bodyPath: string;
  body: string;
  tags: string[];
}

interface RelationFixture {
  id: string;
  from: ObjectId;
  predicate: Predicate;
  to: ObjectId;
  status: RelationStatus;
}

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true }))
  );
});

describe("viewer Obsidian export action", () => {
  it("regenerates the default projection and leaves canonical storage unchanged", async () => {
    const assets = await stat(join(viewerAssetsDir, "index.html"));

    expect(assets.isFile()).toBe(true);

    const projectRoot = await createInitializedProject("aictx-viewer-export-project-");
    await writeViewerExportFixtures(projectRoot);
    await rm(join(projectRoot, ".aictx/exports/obsidian"), { recursive: true, force: true });

    const before = await readCanonicalAndIndexFiles(projectRoot);
    const started = await startViewerServer({
      cwd: projectRoot,
      assetsDir: viewerAssetsDir,
      token: "viewer-export-token"
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
      await page.locator('[data-testid="obsidian-export-submit"]').waitFor();
      await page.locator('[data-testid="obsidian-export-submit"]').click();
      await expectText(page, '[data-testid="obsidian-export-status"]', "Export complete.");
      await expectText(
        page,
        '[data-testid="obsidian-export-manifest-path"]',
        ".aictx/exports/obsidian/.aictx-obsidian-export.json"
      );

      const filesWritten = Number(
        await page.locator('[data-testid="obsidian-export-files-written"]').textContent()
      );

      expect(filesWritten).toBeGreaterThan(0);
      await expect(
        readFile(
          join(projectRoot, ".aictx/exports/obsidian/memory/decision.viewer-export.md"),
          "utf8"
        )
      ).resolves.toContain("# Viewer export");
      await expect(
        readFile(
          join(projectRoot, ".aictx/exports/obsidian/.aictx-obsidian-export.json"),
          "utf8"
        )
      ).resolves.toContain("memory/decision.viewer-export.md");
      await expect(readCanonicalAndIndexFiles(projectRoot)).resolves.toEqual(before);
      expect(consoleErrors()).toEqual([]);
    } finally {
      await browser?.close();
      await started.data.close();
    }
  });

  it("shows the existing export-target error for unsafe output directories", async () => {
    const projectRoot = await createInitializedProject("aictx-viewer-export-invalid-");
    await writeViewerExportFixtures(projectRoot);
    await writeProjectFile(projectRoot, "unsafe-export/user-note.md", "# User note\n");

    const before = await readCanonicalAndIndexFiles(projectRoot);
    const started = await startViewerServer({
      cwd: projectRoot,
      assetsDir: viewerAssetsDir,
      token: "viewer-export-token"
    });

    expect(started.ok).toBe(true);
    if (!started.ok) {
      throw new Error(started.error.message);
    }

    let browser: Browser | null = null;

    try {
      browser = await chromium.launch();
      const page = await browser.newPage();

      await page.goto(started.data.url, { waitUntil: "domcontentloaded" });
      await page.locator('[data-testid="obsidian-export-out-dir"]').fill("unsafe-export");
      await page.locator('[data-testid="obsidian-export-submit"]').click();
      await expectText(page, '[data-testid="obsidian-export-status"]', "AICtxExportTargetInvalid");
      await expectText(
        page,
        '[data-testid="obsidian-export-status"]',
        "non-empty and does not contain an Aictx export manifest"
      );
      await expect(
        readFile(join(projectRoot, "unsafe-export/.aictx-obsidian-export.json"), "utf8")
      ).rejects.toThrow();
      await expect(readCanonicalAndIndexFiles(projectRoot)).resolves.toEqual(before);
    } finally {
      await browser?.close();
      await started.data.close();
    }
  });
});

async function writeViewerExportFixtures(projectRoot: string): Promise<void> {
  await writeMemoryObject(projectRoot, {
    id: "decision.viewer-export",
    type: "decision",
    status: "active",
    title: "Viewer export",
    bodyPath: "memory/decisions/viewer-export.md",
    body: "# Viewer export\n\nThe viewer can regenerate the generated Obsidian projection.\n",
    tags: ["viewer", "obsidian"]
  });
  await writeMemoryObject(projectRoot, {
    id: "constraint.viewer-export-target",
    type: "constraint",
    status: "active",
    title: "Viewer export target",
    bodyPath: "memory/constraints/viewer-export-target.md",
    body: "# Viewer export target\n\nExport output stays in generated directories.\n",
    tags: ["viewer", "safety"]
  });
  await writeRelation(projectRoot, {
    id: "rel.viewer-export-requires-target",
    from: "decision.viewer-export",
    predicate: "requires",
    to: "constraint.viewer-export-target",
    status: "active"
  });
}

async function writeMemoryObject(projectRoot: string, fixture: MemoryFixture): Promise<void> {
  const storage = await readStorageOrThrow(projectRoot);
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
    created_at: FIXED_TIMESTAMP,
    updated_at: FIXED_TIMESTAMP
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
    created_at: FIXED_TIMESTAMP,
    updated_at: FIXED_TIMESTAMP
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

async function readCanonicalAndIndexFiles(projectRoot: string): Promise<Record<string, string>> {
  const files: Record<string, string> = {};

  for (const root of [
    ".aictx/config.json",
    ".aictx/events.jsonl",
    ".aictx/memory",
    ".aictx/relations",
    ".aictx/schema",
    ".aictx/index"
  ]) {
    const absoluteRoot = join(projectRoot, root);
    Object.assign(files, await readFilesRecursivelyIfExists(projectRoot, absoluteRoot));
  }

  return files;
}

async function readFilesRecursivelyIfExists(
  projectRoot: string,
  absolutePath: string
): Promise<Record<string, string>> {
  const pathStat = await lstat(absolutePath).catch((error: unknown) => {
    if (errorCode(error) === "ENOENT") {
      return null;
    }

    throw error;
  });

  if (pathStat === null) {
    return {};
  }

  if (pathStat.isFile()) {
    return {
      [relative(projectRoot, absolutePath)]: (await readFile(absolutePath)).toString("base64")
    };
  }

  const entries = await readdir(absolutePath, { withFileTypes: true });
  const files: Record<string, string> = {};

  for (const entry of entries) {
    const child = join(absolutePath, entry.name);

    if (entry.isDirectory()) {
      Object.assign(files, await readFilesRecursivelyIfExists(projectRoot, child));
      continue;
    }

    if (entry.isFile()) {
      files[relative(projectRoot, child)] = (await readFile(child)).toString("base64");
    }
  }

  return files;
}

async function writeJsonProjectFile(
  projectRoot: string,
  relativePath: string,
  value: unknown
): Promise<void> {
  await writeProjectFile(projectRoot, relativePath, `${JSON.stringify(value, null, 2)}\n`);
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

async function createTempRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  const resolvedRoot = await realpath(root);

  tempRoots.push(resolvedRoot);
  return resolvedRoot;
}

async function expectText(page: Page, selector: string, expected: string): Promise<void> {
  await page.locator(selector).waitFor();
  await page.waitForFunction(
    ({ selector: targetSelector, expected: expectedText }) =>
      document.querySelector(targetSelector)?.textContent?.includes(expectedText) ?? false,
    { selector, expected }
  );
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

function errorCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return null;
  }

  const code = error.code;
  return typeof code === "string" ? code : null;
}
