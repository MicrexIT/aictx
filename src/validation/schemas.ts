import { Ajv2020, type AnySchema, type ValidateFunction } from "ajv/dist/2020.js";

import { aictxError, type AictxError, type JsonValue } from "../core/errors.js";
import { readUtf8FileInsideRoot } from "../core/fs.js";
import { err, ok, type Result } from "../core/result.js";
import type { ValidationIssue } from "../core/types.js";

export const SCHEMA_KINDS = ["config", "object", "relation", "event", "patch"] as const;

export type SchemaKind = (typeof SCHEMA_KINDS)[number];

export const SCHEMA_FILES = {
  config: "config.schema.json",
  object: "object.schema.json",
  relation: "relation.schema.json",
  event: "event.schema.json",
  patch: "patch.schema.json"
} as const satisfies Record<SchemaKind, string>;

export type JsonSchema = boolean | Record<string, unknown>;

export type LoadedSchemas = {
  readonly [K in SchemaKind]: JsonSchema;
};

export type CompiledSchemaValidatorMap = {
  readonly [K in SchemaKind]: ValidateFunction<unknown>;
};

export interface CompiledSchemaValidators {
  readonly validators: CompiledSchemaValidatorMap;
}

export async function loadProjectSchemas(projectRoot: string): Promise<Result<LoadedSchemas>> {
  const schemas: Partial<Record<SchemaKind, JsonSchema>> = {};
  const issues: ValidationIssue[] = [];

  for (const kind of SCHEMA_KINDS) {
    const path = schemaRelativePath(kind);

    const read = await readUtf8FileInsideRoot(projectRoot, path);

    if (!read.ok) {
      issues.push(readSchemaIssue(path, read.error));
      continue;
    }

    try {
      const contents = read.data;
      const parsed = JSON.parse(contents) as unknown;

      if (isJsonSchema(parsed)) {
        schemas[kind] = parsed;
      } else {
        issues.push({
          code: "SchemaValidationFailed",
          message: "Schema file must contain a JSON Schema object or boolean.",
          path,
          field: null
        });
      }
    } catch (error) {
      issues.push(parseSchemaIssue(path, error));
    }
  }

  if (issues.length > 0) {
    return schemaFailure("Project schema loading failed.", issues);
  }

  const config = schemas.config;
  const object = schemas.object;
  const relation = schemas.relation;
  const event = schemas.event;
  const patch = schemas.patch;

  if (
    config === undefined ||
    object === undefined ||
    relation === undefined ||
    event === undefined ||
    patch === undefined
  ) {
    return schemaFailure("Project schema loading failed.", [
      {
        code: "SchemaValidationFailed",
        message: "One or more schema files were not loaded.",
        path: ".aictx/schema",
        field: null
      }
    ]);
  }

  return ok({ config, object, relation, event, patch });
}

export async function compileProjectSchemas(
  projectRoot: string
): Promise<Result<CompiledSchemaValidators>> {
  const loaded = await loadProjectSchemas(projectRoot);

  if (!loaded.ok) {
    return loaded;
  }

  const ajv = new Ajv2020({
    allErrors: true,
    strict: false
  });
  const validators: Partial<Record<SchemaKind, ValidateFunction<unknown>>> = {};
  const issues: ValidationIssue[] = [];

  for (const kind of SCHEMA_KINDS) {
    try {
      validators[kind] = ajv.compile(loaded.data[kind] as AnySchema);
    } catch (error) {
      issues.push({
        code: "SchemaCompileFailed",
        message: `Schema file could not be compiled: ${messageFromUnknown(error)}`,
        path: schemaRelativePath(kind),
        field: null
      });
    }
  }

  if (issues.length > 0) {
    return schemaFailure("Project schema compilation failed.", issues);
  }

  const config = validators.config;
  const object = validators.object;
  const relation = validators.relation;
  const event = validators.event;
  const patch = validators.patch;

  if (
    config === undefined ||
    object === undefined ||
    relation === undefined ||
    event === undefined ||
    patch === undefined
  ) {
    return schemaFailure("Project schema compilation failed.", [
      {
        code: "SchemaValidationFailed",
        message: "One or more schema validators were not compiled.",
        path: ".aictx/schema",
        field: null
      }
    ]);
  }

  return ok({
    validators: {
      config,
      object,
      relation,
      event,
      patch
    }
  });
}

function schemaRelativePath(kind: SchemaKind): string {
  return `.aictx/schema/${SCHEMA_FILES[kind]}`;
}

function isJsonSchema(value: unknown): value is JsonSchema {
  return (
    typeof value === "boolean" ||
    (typeof value === "object" && value !== null && !Array.isArray(value))
  );
}

function readSchemaIssue(path: string, error: AictxError): ValidationIssue {
  const code = errorDetailsFsCode(error);

  return {
    code: code === "ENOENT" ? "SchemaFileMissing" : "SchemaFileUnreadable",
    message:
      code === "ENOENT"
        ? "Schema file is missing."
        : `Schema file could not be read safely: ${error.message}`,
    path,
    field: null
  };
}

function parseSchemaIssue(path: string, error: unknown): ValidationIssue {
  if (error instanceof SyntaxError) {
    return {
      code: "SchemaInvalidJson",
      message: `Schema file contains invalid JSON: ${error.message}`,
      path,
      field: null
    };
  }

  return {
    code: "SchemaFileUnreadable",
    message: `Schema file could not be parsed: ${messageFromUnknown(error)}`,
    path,
    field: null
  };
}

function schemaFailure<T>(message: string, issues: readonly ValidationIssue[]): Result<T> {
  return err(aictxError("AICtxSchemaValidationFailed", message, validationIssuesDetails(issues)));
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

function errorDetailsFsCode(error: AictxError): string | null {
  const details = error.details;

  if (typeof details !== "object" || details === null || Array.isArray(details)) {
    return null;
  }

  const code = details.fsCode;
  return typeof code === "string" ? code : null;
}

function messageFromUnknown(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
