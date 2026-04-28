import { describe, expect, it } from "vitest";

import { AICTX_ERROR_CODES, aictxError } from "../../../src/core/errors.js";

describe("core errors", () => {
  it("exports the API spec error code list in order", () => {
    expect(AICTX_ERROR_CODES).toEqual([
      "AICtxGitRequired",
      "AICtxNotInitialized",
      "AICtxAlreadyInitializedInvalid",
      "AICtxUnsupportedStorageVersion",
      "AICtxInvalidConfig",
      "AICtxInvalidJson",
      "AICtxInvalidJsonl",
      "AICtxSchemaValidationFailed",
      "AICtxValidationFailed",
      "AICtxConflictDetected",
      "AICtxDirtyMemory",
      "AICtxPatchRequired",
      "AICtxPatchInvalid",
      "AICtxUnknownPatchOperation",
      "AICtxObjectNotFound",
      "AICtxRelationNotFound",
      "AICtxDuplicateId",
      "AICtxInvalidRelation",
      "AICtxSecretDetected",
      "AICtxIndexUnavailable",
      "AICtxExportTargetInvalid",
      "AICtxLockBusy",
      "AICtxGitOperationFailed",
      "AICtxInternalError"
    ]);
  });

  it("constructs errors without details", () => {
    expect(aictxError("AICtxNotInitialized", "Aictx is not initialized.")).toEqual({
      code: "AICtxNotInitialized",
      message: "Aictx is not initialized."
    });
  });

  it("constructs errors with details", () => {
    expect(
      aictxError("AICtxInvalidJson", "Invalid JSON.", {
        path: ".aictx/config.json",
        line: 1
      })
    ).toEqual({
      code: "AICtxInvalidJson",
      message: "Invalid JSON.",
      details: {
        path: ".aictx/config.json",
        line: 1
      }
    });
  });
});
