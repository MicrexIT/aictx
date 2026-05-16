import fg from "fast-glob";

import { memoryError, type MemoryError, type JsonValue } from "../core/errors.js";
import { readUtf8FileInsideRoot } from "../core/fs.js";
import type { ValidationIssue } from "../core/types.js";

export const CONFLICT_MARKER_PATTERNS = [
  /^<<<<<<< .+$/,
  /^=======$/,
  /^>>>>>>> .+$/,
  /^\|\|\|\|\|\|\| .+$/
] as const;

export interface ConflictMarkerValidationResult {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: [];
}

export function detectConflictMarkersInText(
  contents: string,
  path: string
): ConflictMarkerValidationResult {
  const errors: ValidationIssue[] = [];
  const lines = contents.split(/\r\n|\n|\r/);

  for (const [index, line] of lines.entries()) {
    if (isConflictMarker(line)) {
      errors.push(conflictMarkerIssue(path, index + 1));
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings: []
  };
}

export async function scanProjectConflictMarkers(
  projectRoot: string
): Promise<ConflictMarkerValidationResult> {
  const paths = (
    await fg(".memory/**/*.{json,jsonl,md}", {
      cwd: projectRoot,
      dot: true,
      ignore: [".memory/index/**", ".memory/context/**"],
      onlyFiles: true,
      unique: true
    })
  ).sort();

  const errors: ValidationIssue[] = [];

  for (const path of paths) {
    const contents = await readUtf8FileInsideRoot(projectRoot, path);

    if (!contents.ok) {
      errors.push(canonicalReadIssue(path, contents.error));
      continue;
    }

    errors.push(...detectConflictMarkersInText(contents.data, path).errors);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings: []
  };
}

export function conflictMarkerError(issues: readonly ValidationIssue[]): MemoryError {
  return memoryError(
    "MemoryConflictDetected",
    "Conflict markers detected.",
    validationIssuesDetails(issues)
  );
}

function isConflictMarker(line: string): boolean {
  return CONFLICT_MARKER_PATTERNS.some((pattern) => pattern.test(line));
}

function conflictMarkerIssue(path: string, line: number): ValidationIssue {
  return {
    code: "MemoryConflictDetected",
    message: "Unresolved conflict marker detected.",
    path: `${path}:${line}`,
    field: null
  };
}

function canonicalReadIssue(path: string, error: MemoryError): ValidationIssue {
  return {
    code: "CanonicalFileUnsafe",
    message: `Canonical file could not be read safely: ${error.message}`,
    path,
    field: null
  };
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
