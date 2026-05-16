import { describe, expect, it } from "vitest";

import { memoryError } from "../../../src/core/errors.js";
import { err, ok } from "../../../src/core/result.js";

describe("core result helpers", () => {
  it("constructs success results with default warnings", () => {
    expect(ok({ created: true })).toEqual({
      ok: true,
      data: { created: true },
      warnings: []
    });
  });

  it("constructs success results with explicit warnings", () => {
    expect(ok("done", ["Already initialized."])).toEqual({
      ok: true,
      data: "done",
      warnings: ["Already initialized."]
    });
  });

  it("constructs error results with default warnings", () => {
    const error = memoryError("MemoryGitRequired", "Git is required.");

    expect(err(error)).toEqual({
      ok: false,
      error,
      warnings: []
    });
  });
});
