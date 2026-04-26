export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export const AICTX_ERROR_CODES = [
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
  "AICtxLockBusy",
  "AICtxGitOperationFailed",
  "AICtxInternalError"
] as const;

export type AictxErrorCode = (typeof AICTX_ERROR_CODES)[number];

export interface AictxError {
  code: AictxErrorCode;
  message: string;
  details?: JsonValue;
}

export function aictxError(
  code: AictxErrorCode,
  message: string,
  details?: JsonValue
): AictxError {
  return details === undefined ? { code, message } : { code, message, details };
}
