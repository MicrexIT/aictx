import { describe, expect, it } from "vitest";

import { renderAppResult } from "../../../src/cli/render.js";
import type { AppResult } from "../../../src/app/operations.js";
import { memoryError } from "../../../src/core/errors.js";
import type { MemoryMeta } from "../../../src/core/types.js";

const meta: MemoryMeta = {
  project_root: "/repo",
  memory_root: "/repo/.memory",
  git: {
    available: true,
    branch: "main",
    commit: "abc123",
    dirty: false
  }
};

describe("CLI rendering", () => {
  it("renders success envelopes as JSON stdout only", () => {
    const result: AppResult<{ created: boolean }> = {
      ok: true,
      data: { created: true },
      warnings: ["already initialized"],
      meta
    };

    const rendered = renderAppResult(result, { json: true });

    expect(JSON.parse(rendered.stdout)).toEqual(result);
    expect(rendered.stdout.endsWith("\n")).toBe(true);
    expect(rendered.stderr).toBe("");
    expect(rendered.exitCode).toBe(0);
  });

  it("renders error envelopes as JSON stdout only", () => {
    const result: AppResult<never> = {
      ok: false,
      error: memoryError("MemoryNotInitialized", "Memory is not initialized."),
      warnings: ["looked upward for config"],
      meta
    };

    const rendered = renderAppResult(result, { json: true });

    expect(JSON.parse(rendered.stdout)).toEqual(result);
    expect(rendered.stderr).toBe("");
    expect(rendered.exitCode).toBe(3);
  });

  it("renders human-readable errors and warnings to stderr", () => {
    const result: AppResult<never> = {
      ok: false,
      error: memoryError("MemoryPatchInvalid", "Patch is invalid."),
      warnings: ["deprecated field ignored"],
      meta
    };

    const rendered = renderAppResult(result, { json: false });

    expect(rendered).toEqual({
      stdout: "",
      stderr: "warning: deprecated field ignored\nerror: MemoryPatchInvalid: Patch is invalid.\n",
      exitCode: 1
    });
  });

  it("renders human success with a command-specific renderer", () => {
    const result: AppResult<{ count: number }> = {
      ok: true,
      data: { count: 2 },
      warnings: ["index updated with fallback"],
      meta
    };

    const rendered = renderAppResult(result, {
      json: false,
      renderData: (data) => `Saved ${data.count} files`
    });

    expect(rendered).toEqual({
      stdout: "Saved 2 files\n",
      stderr: "warning: index updated with fallback\n",
      exitCode: 0
    });
  });
});
