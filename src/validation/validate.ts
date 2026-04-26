import type { ErrorObject } from "ajv/dist/2020.js";

import { aictxError, type AictxError, type JsonValue } from "../core/errors.js";
import type { ValidationIssue } from "../core/types.js";
import type { CompiledSchemaValidators, SchemaKind } from "./schemas.js";

export interface SchemaValidationResult {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

export function validateConfig(
  validators: CompiledSchemaValidators,
  value: unknown,
  path = ".aictx/config.json"
): SchemaValidationResult {
  return validateWithSchema(validators, "config", value, path);
}

export function validateObject(
  validators: CompiledSchemaValidators,
  value: unknown,
  path: string
): SchemaValidationResult {
  return validateWithSchema(validators, "object", value, path);
}

export function validateRelation(
  validators: CompiledSchemaValidators,
  value: unknown,
  path: string
): SchemaValidationResult {
  return validateWithSchema(validators, "relation", value, path);
}

export function validateEvent(
  validators: CompiledSchemaValidators,
  value: unknown,
  path = ".aictx/events.jsonl",
  line?: number
): SchemaValidationResult {
  const issuePath = line === undefined ? path : `${path}:${line}`;
  return validateWithSchema(validators, "event", value, issuePath);
}

export function validatePatch(
  validators: CompiledSchemaValidators,
  value: unknown,
  path = "<patch>"
): SchemaValidationResult {
  return validateWithSchema(validators, "patch", value, path);
}

export function schemaValidationError(issues: readonly ValidationIssue[]): AictxError {
  return aictxError(
    "AICtxSchemaValidationFailed",
    "Schema validation failed.",
    validationIssuesDetails(issues)
  );
}

function validateWithSchema(
  validators: CompiledSchemaValidators,
  kind: SchemaKind,
  value: unknown,
  path: string
): SchemaValidationResult {
  const validate = validators.validators[kind];

  if (validate(value)) {
    return {
      valid: true,
      errors: [],
      warnings: []
    };
  }

  const errors = validate.errors ?? [];

  return {
    valid: false,
    errors:
      errors.length > 0
        ? ajvErrorsToIssues(errors, path)
        : [
            {
              code: "SchemaValidationFailed",
              message: "Schema validation failed.",
              path,
              field: null
            }
          ],
    warnings: []
  };
}

function ajvErrorsToIssues(errors: readonly ErrorObject[], path: string): ValidationIssue[] {
  return errors.map((error) => ({
    code: issueCodeForKeyword(error.keyword),
    message: issueMessage(error),
    path,
    field: issueField(error)
  }));
}

function issueCodeForKeyword(keyword: string): string {
  switch (keyword) {
    case "required":
      return "SchemaRequired";
    case "type":
      return "SchemaType";
    case "enum":
      return "SchemaEnum";
    case "const":
      return "SchemaConst";
    case "additionalProperties":
      return "SchemaAdditionalProperty";
    case "pattern":
      return "SchemaPattern";
    case "minLength":
      return "SchemaMinLength";
    case "minimum":
      return "SchemaMinimum";
    case "maximum":
      return "SchemaMaximum";
    case "minItems":
      return "SchemaMinItems";
    case "uniqueItems":
      return "SchemaUniqueItems";
    case "oneOf":
      return "SchemaOneOf";
    default:
      return "SchemaValidationFailed";
  }
}

function issueField(error: ErrorObject): string | null {
  if (error.keyword === "required") {
    const missingProperty = stringParam(error, "missingProperty");
    return missingProperty === null
      ? normalizedInstancePath(error.instancePath)
      : appendJsonPointer(error.instancePath, missingProperty);
  }

  if (error.keyword === "additionalProperties") {
    const additionalProperty = stringParam(error, "additionalProperty");
    return additionalProperty === null
      ? normalizedInstancePath(error.instancePath)
      : appendJsonPointer(error.instancePath, additionalProperty);
  }

  return normalizedInstancePath(error.instancePath);
}

function issueMessage(error: ErrorObject): string {
  if (error.keyword === "required") {
    const missingProperty = stringParam(error, "missingProperty");
    return missingProperty === null
      ? "Required field is missing."
      : `Required field is missing: ${missingProperty}.`;
  }

  if (error.keyword === "additionalProperties") {
    const additionalProperty = stringParam(error, "additionalProperty");
    return additionalProperty === null
      ? "Unknown field is not allowed."
      : `Unknown field is not allowed: ${additionalProperty}.`;
  }

  return error.message ?? "Schema validation failed.";
}

function normalizedInstancePath(instancePath: string): string | null {
  return instancePath === "" ? null : instancePath;
}

function appendJsonPointer(instancePath: string, token: string): string {
  return `${instancePath}/${escapeJsonPointerToken(token)}`;
}

function escapeJsonPointerToken(token: string): string {
  return token.replaceAll("~", "~0").replaceAll("/", "~1");
}

function stringParam(error: ErrorObject, name: string): string | null {
  const params = error.params as Record<string, unknown>;
  const value = params[name];

  return typeof value === "string" ? value : null;
}

function validationIssuesDetails(issues: readonly ValidationIssue[]): JsonValue {
  return {
    issues: issues.map((issue) => ({
      code: issue.code,
      message: issue.message,
      path: issue.path,
      field: issue.field
    }))
  };
}
