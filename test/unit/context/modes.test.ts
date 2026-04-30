import { describe, expect, it } from "vitest";

import {
  DEFAULT_LOAD_MODE,
  LOAD_MEMORY_MODES,
  normalizeLoadMemoryMode
} from "../../../src/context/modes.js";

describe("load memory mode normalization", () => {
  it("defaults to coding", () => {
    const result = normalizeLoadMemoryMode();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toBe(DEFAULT_LOAD_MODE);
    }
  });

  it("accepts all supported load modes", () => {
    for (const mode of LOAD_MEMORY_MODES) {
      const result = normalizeLoadMemoryMode(mode);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data).toBe(mode);
      }
    }
  });

  it("rejects unsupported load modes", () => {
    const result = normalizeLoadMemoryMode("triage");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("AICtxValidationFailed");
      expect(result.error.details).toMatchObject({
        field: "mode",
        allowed: [...LOAD_MEMORY_MODES],
        actual: "triage"
      });
    }
  });
});
