import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { JsonValue } from "../../../src/core/errors.js";
import {
  appendJsonl,
  normalizeLineEndingsToLf,
  readUtf8File,
  resolveInsideRoot,
  stableJsonStringify,
  writeJsonAtomic,
  writeMarkdownAtomic,
  writeTextAtomic
} from "../../../src/core/fs.js";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("core filesystem helpers", () => {
  it("resolves paths inside the allowed root", async () => {
    const { allowedRoot } = await createSandbox();

    const result = resolveInsideRoot(allowedRoot, "memory/notes/example.md");

    expect(result).toEqual({
      ok: true,
      data: join(allowedRoot, "memory/notes/example.md"),
      warnings: []
    });
  });

  it("rejects relative writes outside the allowed root", async () => {
    const { sandboxRoot, allowedRoot } = await createSandbox();
    const result = await writeTextAtomic(allowedRoot, "../outside.md", "outside");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("AICtxValidationFailed");
    }
    await expect(readFile(join(sandboxRoot, "outside.md"), "utf8")).rejects.toMatchObject({
      code: "ENOENT"
    });
  });

  it("rejects absolute writes outside the allowed root", async () => {
    const { sandboxRoot, allowedRoot } = await createSandbox();
    const outsidePath = join(sandboxRoot, "outside.md");
    const result = await writeTextAtomic(allowedRoot, outsidePath, "outside");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("AICtxValidationFailed");
    }
    await expect(readFile(outsidePath, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects writes whose parent escapes through a symbolic link", async () => {
    const { sandboxRoot, allowedRoot } = await createSandbox();
    const outsideDirectory = join(sandboxRoot, "outside");
    await mkdir(outsideDirectory);
    await symlink(outsideDirectory, join(allowedRoot, "linked"));

    const result = await writeTextAtomic(allowedRoot, "linked/nested/escape.md", "outside");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("AICtxValidationFailed");
    }
    await expect(
      readFile(join(outsideDirectory, "nested", "escape.md"), "utf8")
    ).rejects.toMatchObject({
      code: "ENOENT"
    });
  });

  it("writes deterministic two-space JSON with a trailing LF", async () => {
    const { allowedRoot } = await createSandbox();
    const value: JsonValue = {
      z: 1,
      a: {
        d: true,
        b: null
      },
      list: [
        {
          y: 2,
          x: 1
        }
      ]
    };

    const result = await writeJsonAtomic(allowedRoot, "config.json", value);

    expect(result.ok).toBe(true);
    expect(await readFile(join(allowedRoot, "config.json"), "utf8")).toBe(
      [
        "{",
        '  "a": {',
        '    "b": null,',
        '    "d": true',
        "  },",
        '  "list": [',
        "    {",
        '      "x": 1,',
        '      "y": 2',
        "    }",
        "  ],",
        '  "z": 1',
        "}",
        ""
      ].join("\n")
    );
  });

  it("serializes objects with different insertion orders identically", () => {
    const first: JsonValue = { b: 2, a: { d: 4, c: 3 } };
    const second: JsonValue = { a: { c: 3, d: 4 }, b: 2 };

    expect(stableJsonStringify(first)).toBe(stableJsonStringify(second));
  });

  it("normalizes Markdown CRLF and CR input to LF on write", async () => {
    const { allowedRoot } = await createSandbox();

    expect(normalizeLineEndingsToLf("a\r\nb\rc\n")).toBe("a\nb\nc\n");
    const result = await writeMarkdownAtomic(allowedRoot, "memory/notes/example.md", "a\r\nb\rc\n");

    expect(result.ok).toBe(true);
    expect(await readFile(join(allowedRoot, "memory/notes/example.md"), "utf8")).toBe("a\nb\nc\n");
  });

  it("appends exactly one LF-terminated compact JSON object per JSONL call", async () => {
    const { allowedRoot } = await createSandbox();

    const first = await appendJsonl(allowedRoot, "events.jsonl", {
      event: "memory.created",
      payload: {
        z: 2,
        a: 1
      }
    });
    const second = await appendJsonl(allowedRoot, "events.jsonl", {
      event: "memory.updated",
      actor: "agent"
    });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(await readFile(join(allowedRoot, "events.jsonl"), "utf8")).toBe(
      [
        '{"event":"memory.created","payload":{"a":1,"z":2}}',
        '{"actor":"agent","event":"memory.updated"}',
        ""
      ].join("\n")
    );
  });

  it("reads only valid UTF-8 text", async () => {
    const { allowedRoot } = await createSandbox();
    const validPath = join(allowedRoot, "valid.md");
    const invalidPath = join(allowedRoot, "invalid.md");
    await writeFile(validPath, "valid\n");
    await writeFile(invalidPath, Buffer.from([0xff]));

    const valid = await readUtf8File(validPath);
    const invalid = await readUtf8File(invalidPath);

    expect(valid).toEqual({ ok: true, data: "valid\n", warnings: [] });
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) {
      expect(invalid.error.code).toBe("AICtxValidationFailed");
    }
  });
});

async function createSandbox(): Promise<{ sandboxRoot: string; allowedRoot: string }> {
  const sandboxRoot = await mkdtemp(join(tmpdir(), "aictx-fs-"));
  tempRoots.push(sandboxRoot);

  const allowedRoot = join(sandboxRoot, ".aictx");
  await mkdir(allowedRoot);

  return { sandboxRoot, allowedRoot };
}
