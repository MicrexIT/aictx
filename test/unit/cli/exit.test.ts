import { describe, expect, it } from "vitest";

import {
  CLI_EXIT_ERROR,
  CLI_EXIT_PRECONDITION,
  CLI_EXIT_SUCCESS,
  CLI_EXIT_USAGE,
  exitCodeForAictxError
} from "../../../src/cli/exit.js";
import { aictxError, type AictxErrorCode } from "../../../src/core/errors.js";

describe("CLI exit codes", () => {
  it("exports the API-specified numeric codes", () => {
    expect(CLI_EXIT_SUCCESS).toBe(0);
    expect(CLI_EXIT_ERROR).toBe(1);
    expect(CLI_EXIT_USAGE).toBe(2);
    expect(CLI_EXIT_PRECONDITION).toBe(3);
  });

  it("maps Git and storage precondition errors to exit 3", () => {
    const codes: AictxErrorCode[] = [
      "AICtxGitRequired",
      "AICtxNotInitialized",
      "AICtxAlreadyInitializedInvalid",
      "AICtxUnsupportedStorageVersion",
      "AICtxConflictDetected",
      "AICtxDirtyMemory",
      "AICtxIndexUnavailable",
      "AICtxLockBusy",
      "AICtxGitOperationFailed"
    ];

    for (const code of codes) {
      expect(exitCodeForAictxError(aictxError(code, "precondition failed"))).toBe(
        CLI_EXIT_PRECONDITION
      );
    }
  });

  it("maps validation and patch errors to exit 1", () => {
    const codes: AictxErrorCode[] = [
      "AICtxInvalidJson",
      "AICtxInvalidJsonl",
      "AICtxSchemaValidationFailed",
      "AICtxValidationFailed",
      "AICtxPatchRequired",
      "AICtxPatchInvalid",
      "AICtxUnknownPatchOperation"
    ];

    for (const code of codes) {
      expect(exitCodeForAictxError(aictxError(code, "user-correctable error"))).toBe(
        CLI_EXIT_ERROR
      );
    }
  });

  it("maps config, object, relation, secret, and internal errors to exit 1", () => {
    const codes: AictxErrorCode[] = [
      "AICtxInvalidConfig",
      "AICtxObjectNotFound",
      "AICtxRelationNotFound",
      "AICtxDuplicateId",
      "AICtxInvalidRelation",
      "AICtxSecretDetected",
      "AICtxInternalError"
    ];

    for (const code of codes) {
      expect(exitCodeForAictxError(aictxError(code, "operation failed"))).toBe(
        CLI_EXIT_ERROR
      );
    }
  });
});
