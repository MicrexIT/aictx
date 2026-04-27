import { describe, expect, it } from "vitest";

import {
  DEFAULT_TOKEN_BUDGET,
  MAX_TOKEN_BUDGET,
  contentBudgetAfterReserve,
  estimateTokenCount,
  normalizeTokenBudget,
  reserveForProvenance
} from "../../../src/context/tokens.js";

describe("context token estimation", () => {
  it("estimates tokens from character count deterministically", () => {
    expect(estimateTokenCount("")).toBe(0);
    expect(estimateTokenCount("a")).toBe(1);
    expect(estimateTokenCount("abcd")).toBe(1);
    expect(estimateTokenCount("abcde")).toBe(2);
    expect(estimateTokenCount("x".repeat(41))).toBe(11);
  });

  it("returns the same estimate for repeated calls", () => {
    const text = "Deterministic token counting uses approximate character length.";

    expect(estimateTokenCount(text)).toBe(estimateTokenCount(text));
  });
});

describe("context token budget normalization", () => {
  it("rejects explicitly requested budgets that are not valid integers above the minimum", () => {
    for (const requestedBudget of [0, 500, 499, 500.5, Number.NaN, Infinity, -Infinity]) {
      const result = normalizeTokenBudget({ requestedBudget });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("AICtxValidationFailed");
        expect(result.error.details).toMatchObject({
          field: "token_budget",
          minimumExclusive: 500,
          maximum: 50000
        });
      }
    }
  });

  it("preserves requested budgets above the minimum", () => {
    const result = normalizeTokenBudget({ requestedBudget: 501 });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({
        budget: 501,
        wasCapped: false
      });
    }
  });

  it("caps requested budgets above the maximum", () => {
    const result = normalizeTokenBudget({ requestedBudget: 50001 });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({
        budget: MAX_TOKEN_BUDGET,
        wasCapped: true
      });
    }
  });

  it("uses a valid configured default when no request budget is provided", () => {
    const result = normalizeTokenBudget({ configuredDefaultBudget: 7000 });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({
        budget: 7000,
        wasCapped: false
      });
    }
  });

  it("falls back to the default when configured default is missing or invalid", () => {
    const missingResult = normalizeTokenBudget();

    expect(missingResult.ok).toBe(true);
    if (missingResult.ok) {
      expect(missingResult.data).toEqual({
        budget: DEFAULT_TOKEN_BUDGET,
        wasCapped: false
      });
    }

    for (const configuredDefaultBudget of [500, 500.5, Number.NaN, Infinity]) {
      const result = normalizeTokenBudget({ configuredDefaultBudget });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data).toEqual({
          budget: DEFAULT_TOKEN_BUDGET,
          wasCapped: false
        });
      }
    }
  });

  it("caps configured defaults above the maximum", () => {
    const result = normalizeTokenBudget({ configuredDefaultBudget: 50001 });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({
        budget: MAX_TOKEN_BUDGET,
        wasCapped: true
      });
    }
  });
});

describe("context token reserves", () => {
  it("reserves ten percent of the budget for provenance", () => {
    expect(reserveForProvenance(6000)).toBe(600);
  });

  it("returns the content budget after provenance reserve", () => {
    expect(contentBudgetAfterReserve(6000)).toBe(5400);
  });
});
