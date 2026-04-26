import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  conflictMarkerError,
  detectConflictMarkersInText,
  scanProjectConflictMarkers
} from "../../../src/validation/conflicts.js";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("conflict marker text detection", () => {
  it("reports conflict markers in JSON with line numbers", () => {
    const result = detectConflictMarkersInText(
      [
        "{",
        '  "version": 1,',
        "<<<<<<< HEAD",
        '  "project": { "id": "project.billing-api" }',
        "}"
      ].join("\n"),
      ".aictx/config.json"
    );

    expect(result.valid).toBe(false);
    expect(result.warnings).toEqual([]);
    expect(result.errors).toContainEqual({
      code: "AICtxConflictDetected",
      message: "Unresolved conflict marker detected.",
      path: ".aictx/config.json:3",
      field: null
    });
  });

  it("reports conflict markers in JSONL and Markdown with line numbers", () => {
    const jsonl = detectConflictMarkersInText(
      ['{"event":"memory.created"}', "=======", '{"event":"memory.updated"}'].join("\n"),
      ".aictx/events.jsonl"
    );
    const markdown = detectConflictMarkersInText(
      ["# Example", "Existing body.", ">>>>>>> feature-branch"].join("\n"),
      ".aictx/memory/notes/example.md"
    );

    expect(jsonl.valid).toBe(false);
    expect(jsonl.errors).toContainEqual(expect.objectContaining({ path: ".aictx/events.jsonl:2" }));
    expect(markdown.valid).toBe(false);
    expect(markdown.errors).toContainEqual(
      expect.objectContaining({ path: ".aictx/memory/notes/example.md:3" })
    );
  });

  it("detects every configured conflict marker form", () => {
    const result = detectConflictMarkersInText(
      ["<<<<<<< HEAD", "=======", ">>>>>>> main", "||||||| base"].join("\n"),
      ".aictx/memory/notes/example.md"
    );

    expect(result.valid).toBe(false);
    expect(result.errors.map((issue) => issue.path)).toEqual([
      ".aictx/memory/notes/example.md:1",
      ".aictx/memory/notes/example.md:2",
      ".aictx/memory/notes/example.md:3",
      ".aictx/memory/notes/example.md:4"
    ]);
  });

  it("accepts clean canonical text", () => {
    const result = detectConflictMarkersInText(
      ["# Example", "", "This memory body has no conflict markers."].join("\n"),
      ".aictx/memory/notes/example.md"
    );

    expect(result).toEqual({
      valid: true,
      errors: [],
      warnings: []
    });
  });

  it("wraps findings in AICtxConflictDetected", () => {
    const result = detectConflictMarkersInText("<<<<<<< HEAD", ".aictx/config.json");

    const error = conflictMarkerError(result.errors);

    expect(error.code).toBe("AICtxConflictDetected");
    expect(JSON.stringify(error.details)).toContain(".aictx/config.json:1");
  });
});

describe("project conflict marker scanning", () => {
  it("scans canonical JSON, JSONL, and Markdown files", async () => {
    const projectRoot = await createProjectRoot();
    await writeProjectFile(projectRoot, ".aictx/config.json", '{\n<<<<<<< HEAD\n}\n');
    await writeProjectFile(projectRoot, ".aictx/events.jsonl", '{"event":"memory.created"}\n=======\n');
    await writeProjectFile(projectRoot, ".aictx/memory/notes/example.md", "# Example\n>>>>>>> main\n");

    const result = await scanProjectConflictMarkers(projectRoot);

    expect(result.valid).toBe(false);
    expect(result.errors.map((issue) => issue.path).sort()).toEqual([
      ".aictx/config.json:2",
      ".aictx/events.jsonl:2",
      ".aictx/memory/notes/example.md:2"
    ]);
  });

  it("ignores generated files and non-canonical extensions", async () => {
    const projectRoot = await createProjectRoot();
    await writeProjectFile(projectRoot, ".aictx/config.json", '{ "version": 1 }\n');
    await writeProjectFile(projectRoot, ".aictx/index/generated.json", "<<<<<<< HEAD\n");
    await writeProjectFile(projectRoot, ".aictx/context/context-pack.md", "=======\n");
    await writeProjectFile(projectRoot, ".aictx/.lock", ">>>>>>> main\n");
    await writeProjectFile(projectRoot, ".aictx/memory/notes/example.txt", "||||||| base\n");

    const result = await scanProjectConflictMarkers(projectRoot);

    expect(result).toEqual({
      valid: true,
      errors: [],
      warnings: []
    });
  });

  it("does not mutate files while scanning", async () => {
    const projectRoot = await createProjectRoot();
    const path = ".aictx/memory/notes/example.md";
    await writeProjectFile(projectRoot, path, "# Example\n<<<<<<< HEAD\n");
    const absolutePath = join(projectRoot, path);
    const beforeContents = await readFile(absolutePath, "utf8");
    const beforeStat = await stat(absolutePath);

    await scanProjectConflictMarkers(projectRoot);

    const afterContents = await readFile(absolutePath, "utf8");
    const afterStat = await stat(absolutePath);
    expect(afterContents).toBe(beforeContents);
    expect(afterStat.mtimeMs).toBe(beforeStat.mtimeMs);
  });
});

async function createProjectRoot(): Promise<string> {
  const projectRoot = await mkdtemp(join(tmpdir(), "aictx-conflicts-"));
  tempRoots.push(projectRoot);
  return projectRoot;
}

async function writeProjectFile(projectRoot: string, path: string, contents: string): Promise<void> {
  const absolutePath = join(projectRoot, path);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, contents, "utf8");
}
