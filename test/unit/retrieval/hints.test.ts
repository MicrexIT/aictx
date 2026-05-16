import { describe, expect, it } from "vitest";

import {
  hintedFiles,
  hintSearchText,
  normalizeRetrievalHints,
  retrievalHintsHaveSignal
} from "../../../src/retrieval/hints.js";

describe("retrieval hints", () => {
  it("normalizes path, text, and history-window hints deterministically", () => {
    const result = normalizeRetrievalHints({
      files: [" ./src/context/rank.ts ", ".memory/index/generated.db", "src/context/rank.ts"],
      changed_files: ["src/index/search.ts"],
      symbols: [" rankMemoryCandidates ", ""],
      subsystems: [" retrieval  context "],
      history_window: " 30d "
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.data).toEqual({
      files: ["src/context/rank.ts"],
      changed_files: ["src/index/search.ts"],
      symbols: ["rankMemoryCandidates"],
      subsystems: ["retrieval context"],
      history_window: "30d"
    });
    expect(hintedFiles(result.data)).toEqual([
      "src/context/rank.ts",
      "src/index/search.ts"
    ]);
    expect(hintSearchText(result.data)).toBe(
      "src/context/rank.ts src/index/search.ts rankMemoryCandidates retrieval context"
    );
    expect(retrievalHintsHaveSignal(result.data)).toBe(true);
  });

  it("accepts omitted hints as an empty no-signal object", () => {
    const result = normalizeRetrievalHints(undefined);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({
        files: [],
        changed_files: [],
        symbols: [],
        subsystems: [],
        history_window: null
      });
      expect(retrievalHintsHaveSignal(result.data)).toBe(false);
    }
  });

  it("rejects invalid hint arrays and history windows before retrieval", () => {
    const badArray = normalizeRetrievalHints({
      files: ["src/a.ts", 42] as unknown as string[]
    });
    const badWindow = normalizeRetrievalHints({
      history_window: "last month"
    });

    expect(badArray.ok).toBe(false);
    if (!badArray.ok) {
      expect(badArray.error.code).toBe("MemoryValidationFailed");
      expect(badArray.error.details).toMatchObject({
        field: "hints.files"
      });
    }

    expect(badWindow.ok).toBe(false);
    if (!badWindow.ok) {
      expect(badWindow.error.code).toBe("MemoryValidationFailed");
      expect(badWindow.error.details).toMatchObject({
        field: "hints.history_window",
        actual: "last month"
      });
    }
  });
});
