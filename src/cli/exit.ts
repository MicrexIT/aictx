import type { MemoryError, MemoryErrorCode } from "../core/errors.js";

export const CLI_EXIT_SUCCESS = 0;
export const CLI_EXIT_ERROR = 1;
export const CLI_EXIT_USAGE = 2;
export const CLI_EXIT_PRECONDITION = 3;

export type CliExitCode =
  | typeof CLI_EXIT_SUCCESS
  | typeof CLI_EXIT_ERROR
  | typeof CLI_EXIT_USAGE
  | typeof CLI_EXIT_PRECONDITION;

const PRECONDITION_ERROR_CODES = new Set<MemoryErrorCode>([
  "MemoryGitRequired",
  "MemoryNotInitialized",
  "MemoryAlreadyInitializedInvalid",
  "MemoryUnsupportedStorageVersion",
  "MemoryConflictDetected",
  "MemoryDirtyMemory",
  "MemoryIndexUnavailable",
  "MemoryLockBusy",
  "MemoryGitOperationFailed"
]);

export function isPreconditionErrorCode(code: MemoryErrorCode): boolean {
  return PRECONDITION_ERROR_CODES.has(code);
}

export function exitCodeForMemoryError(error: Pick<MemoryError, "code">): CliExitCode {
  return isPreconditionErrorCode(error.code) ? CLI_EXIT_PRECONDITION : CLI_EXIT_ERROR;
}
