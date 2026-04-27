import { aictxError, type JsonValue } from "../core/errors.js";
import { err, ok, type Result } from "../core/result.js";

export const DEFAULT_TOKEN_BUDGET = 6000;
export const MIN_TOKEN_BUDGET_EXCLUSIVE = 500;
export const MAX_TOKEN_BUDGET = 50000;
export const TOKEN_CHARS_PER_TOKEN = 4;
export const PROVENANCE_RESERVE_RATIO = 0.1;

export interface NormalizeTokenBudgetInput {
  requestedBudget?: number;
  configuredDefaultBudget?: number;
}

export interface NormalizedTokenBudget {
  budget: number;
  wasCapped: boolean;
}

export function estimateTokenCount(text: string): number {
  if (text.length === 0) {
    return 0;
  }

  return Math.ceil(text.length / TOKEN_CHARS_PER_TOKEN);
}

export function normalizeTokenBudget(
  input: NormalizeTokenBudgetInput = {}
): Result<NormalizedTokenBudget> {
  const selectedBudget =
    input.requestedBudget ??
    (isValidConfiguredDefaultBudget(input.configuredDefaultBudget)
      ? input.configuredDefaultBudget
      : DEFAULT_TOKEN_BUDGET);

  if (!isValidRequestedBudget(selectedBudget)) {
    return invalidTokenBudget(selectedBudget);
  }

  const budget = Math.min(selectedBudget, MAX_TOKEN_BUDGET);

  return ok({
    budget,
    wasCapped: budget !== selectedBudget
  });
}

export function reserveForProvenance(budget: number): number {
  return Math.ceil(budget * PROVENANCE_RESERVE_RATIO);
}

export function contentBudgetAfterReserve(budget: number): number {
  return budget - reserveForProvenance(budget);
}

function isValidConfiguredDefaultBudget(value: number | undefined): value is number {
  return value !== undefined && isSafeIntegerAboveMinimum(value);
}

function isValidRequestedBudget(value: number): boolean {
  return isSafeIntegerAboveMinimum(value);
}

function isSafeIntegerAboveMinimum(value: number): boolean {
  return Number.isSafeInteger(value) && value > MIN_TOKEN_BUDGET_EXCLUSIVE;
}

function invalidTokenBudget<T>(actual: number): Result<T> {
  return err(
    aictxError("AICtxValidationFailed", "Token budget must be an integer greater than 500.", {
      field: "token_budget",
      minimumExclusive: MIN_TOKEN_BUDGET_EXCLUSIVE,
      maximum: MAX_TOKEN_BUDGET,
      actual: numberDetail(actual)
    })
  );
}

function numberDetail(value: number): JsonValue {
  if (Number.isNaN(value)) {
    return "NaN";
  }

  if (value === Infinity) {
    return "Infinity";
  }

  if (value === -Infinity) {
    return "-Infinity";
  }

  return value;
}
