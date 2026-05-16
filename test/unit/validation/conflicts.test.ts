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
      ".memory/config.json"
    );

    expect(result.valid).toBe(false);
    expect(result.warnings).toEqual([]);
    expect(result.errors).toContainEqual({
      code: "MemoryConflictDetected",
      message: "Unresolved conflict marker detected.",
      path: ".memory/config.json:3",
      field: null
    });
  });

  it("reports conflict markers in JSONL and Markdown with line numbers", () => {
    const jsonl = detectConflictMarkersInText(
      ['{"event":"memory.created"}', "=======", '{"event":"memory.updated"}'].join("\n"),
      ".memory/events.jsonl"
    );
    const markdown = detectConflictMarkersInText(
      ["# Example", "Existing body.", ">>>>>>> feature-branch"].join("\n"),
      ".memory/memory/notes/example.md"
    );

    expect(jsonl.valid).toBe(false);
    expect(jsonl.errors).toContainEqual(expect.objectContaining({ path: ".memory/events.jsonl:2" }));
    expect(markdown.valid).toBe(false);
    expect(markdown.errors).toContainEqual(
      expect.objectContaining({ path: ".memory/memory/notes/example.md:3" })
    );
  });

  it("detects every configured conflict marker form", () => {
    const result = detectConflictMarkersInText(
      ["<<<<<<< HEAD", "=======", ">>>>>>> main", "||||||| base"].join("\n"),
      ".memory/memory/notes/example.md"
    );

    expect(result.valid).toBe(false);
    expect(result.errors.map((issue) => issue.path)).toEqual([
      ".memory/memory/notes/example.md:1",
      ".memory/memory/notes/example.md:2",
      ".memory/memory/notes/example.md:3",
      ".memory/memory/notes/example.md:4"
    ]);
  });

  it("accepts clean canonical text", () => {
    const result = detectConflictMarkersInText(
      ["# Example", "", "This memory body has no conflict markers."].join("\n"),
      ".memory/memory/notes/example.md"
    );

    expect(result).toEqual({
      valid: true,
      errors: [],
      warnings: []
    });
  });

  it("wraps findings in MemoryConflictDetected", () => {
    const result = detectConflictMarkersInText("<<<<<<< HEAD", ".memory/config.json");

    const error = conflictMarkerError(result.errors);

    expect(error.code).toBe("MemoryConflictDetected");
    expect(JSON.stringify(error.details)).toContain(".memory/config.json:1");
  });
});

describe("project conflict marker scanning", () => {
  it("scans canonical JSON, JSONL, and Markdown files", async () => {
    const projectRoot = await createProjectRoot();
    await writeProjectFile(projectRoot, ".memory/config.json", '{\n<<<<<<< HEAD\n}\n');
    await writeProjectFile(projectRoot, ".memory/events.jsonl", '{"event":"memory.created"}\n=======\n');
    await writeProjectFile(projectRoot, ".memory/memory/notes/example.md", "# Example\n>>>>>>> main\n");

    const result = await scanProjectConflictMarkers(projectRoot);

    expect(result.valid).toBe(false);
    expect(result.errors.map((issue) => issue.path).sort()).toEqual([
      ".memory/config.json:2",
      ".memory/events.jsonl:2",
      ".memory/memory/notes/example.md:2"
    ]);
  });

  it("ignores generated files and non-canonical extensions", async () => {
    const projectRoot = await createProjectRoot();
    await writeProjectFile(projectRoot, ".memory/config.json", '{ "version": 1 }\n');
    await writeProjectFile(projectRoot, ".memory/index/generated.json", "<<<<<<< HEAD\n");
    await writeProjectFile(projectRoot, ".memory/context/context-pack.md", "=======\n");
    await writeProjectFile(projectRoot, ".memory/.lock", ">>>>>>> main\n");
    await writeProjectFile(projectRoot, ".memory/memory/notes/example.txt", "||||||| base\n");

    const result = await scanProjectConflictMarkers(projectRoot);

    expect(result).toEqual({
      valid: true,
      errors: [],
      warnings: []
    });
  });

  it("does not mutate files while scanning", async () => {
    const projectRoot = await createProjectRoot();
    const path = ".memory/memory/notes/example.md";
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
  const projectRoot = await mkdtemp(join(tmpdir(), "memory-conflicts-"));
  tempRoots.push(projectRoot);
  return projectRoot;
}

async function writeProjectFile(projectRoot: string, path: string, contents: string): Promise<void> {
  const absolutePath = join(projectRoot, path);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, contents, "utf8");
}
