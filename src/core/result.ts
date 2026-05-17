import type { MemoryError } from "./errors.js";

export interface SuccessResult<T> {
  ok: true;
  data: T;
  warnings: string[];
}

export interface ErrorResult {
  ok: false;
  error: MemoryError;
  warnings: string[];
}

export type Result<T> = SuccessResult<T> | ErrorResult;

export function ok<T>(data: T, warnings: string[] = []): SuccessResult<T> {
  return { ok: true, data, warnings };
}

export function err(error: MemoryError, warnings: string[] = []): ErrorResult {
  return { ok: false, error, warnings };
}
