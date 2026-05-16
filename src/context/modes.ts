import { memoryError, type JsonValue } from "../core/errors.js";
import { err, ok, type Result } from "../core/result.js";

export const LOAD_MEMORY_MODES = [
  "coding",
  "debugging",
  "review",
  "architecture",
  "onboarding"
] as const;

export type LoadMemoryMode = (typeof LOAD_MEMORY_MODES)[number];

export const DEFAULT_LOAD_MODE: LoadMemoryMode = "coding";

export function normalizeLoadMemoryMode(mode?: string): Result<LoadMemoryMode> {
  const value = mode ?? DEFAULT_LOAD_MODE;

  if (isLoadMemoryMode(value)) {
    return ok(value);
  }

  return err(
    memoryError("MemoryValidationFailed", "Load mode is not supported.", {
      field: "mode",
      allowed: [...LOAD_MEMORY_MODES],
      actual: stringDetail(value)
    })
  );
}

export function isLoadMemoryMode(value: string): value is LoadMemoryMode {
  return LOAD_MEMORY_MODES.includes(value as LoadMemoryMode);
}

function stringDetail(value: string): JsonValue {
  return value;
}
