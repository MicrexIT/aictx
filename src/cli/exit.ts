import type { AictxError, AictxErrorCode } from "../core/errors.js";

export const CLI_EXIT_SUCCESS = 0;
export const CLI_EXIT_ERROR = 1;
export const CLI_EXIT_USAGE = 2;
export const CLI_EXIT_PRECONDITION = 3;

export type CliExitCode =
  | typeof CLI_EXIT_SUCCESS
  | typeof CLI_EXIT_ERROR
  | typeof CLI_EXIT_USAGE
  | typeof CLI_EXIT_PRECONDITION;

const PRECONDITION_ERROR_CODES = new Set<AictxErrorCode>([
  "AICtxGitRequired",
  "AICtxNotInitialized",
  "AICtxAlreadyInitializedInvalid",
  "AICtxUnsupportedStorageVersion",
  "AICtxConflictDetected",
  "AICtxDirtyMemory",
  "AICtxIndexUnavailable",
  "AICtxLockBusy",
  "AICtxGitOperationFailed"
]);

export function isPreconditionErrorCode(code: AictxErrorCode): boolean {
  return PRECONDITION_ERROR_CODES.has(code);
}

export function exitCodeForAictxError(error: Pick<AictxError, "code">): CliExitCode {
  return isPreconditionErrorCode(error.code) ? CLI_EXIT_PRECONDITION : CLI_EXIT_ERROR;
}
