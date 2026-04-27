import {
  normalizeLineEndingsToLf,
  readUtf8File,
  readUtf8FileInsideRoot
} from "../core/fs.js";
import { ok, type Result } from "../core/result.js";
import type { ValidationIssue } from "../core/types.js";

const UTF8_BOM = "\uFEFF";
const FENCE_PATTERN = /^(?: {0,3})(`{3,}|~{3,})/;
const H1_PATTERN = /^ {0,3}#(?!#)[ \t]+(.+?)[ \t]*$/;
const CLOSING_HEADING_MARKER_PATTERN = /[ \t]+#+[ \t]*$/;
const FRONTMATTER_DELIMITER = "---";

export interface MarkdownValidationResult {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: [];
}

export async function readMarkdownBody(path: string): Promise<Result<string>> {
  const result = await readUtf8File(path);

  if (!result.ok) {
    return result;
  }

  return ok(normalizeMarkdownForStorage(result.data));
}

export async function readMarkdownBodyInsideRoot(
  root: string,
  target: string
): Promise<Result<string>> {
  const result = await readUtf8FileInsideRoot(root, target);

  if (!result.ok) {
    return result;
  }

  return ok(normalizeMarkdownForStorage(result.data));
}

export function normalizeMarkdownForStorage(contents: string): string {
  return removeUtf8Bom(normalizeLineEndingsToLf(contents));
}

export function extractFirstH1(contents: string): string | null {
  const normalized = normalizeMarkdownForStorage(contents);
  let activeFence: string | null = null;

  for (const line of normalized.split("\n")) {
    const fence = line.match(FENCE_PATTERN)?.[1] ?? null;

    if (fence !== null) {
      if (activeFence === null) {
        activeFence = fence[0] ?? null;
      } else if (fence.startsWith(activeFence)) {
        activeFence = null;
      }

      continue;
    }

    if (activeFence !== null) {
      continue;
    }

    const h1 = line.match(H1_PATTERN)?.[1] ?? null;

    if (h1 !== null) {
      return h1.replace(CLOSING_HEADING_MARKER_PATTERN, "").trim();
    }
  }

  return null;
}

export function hasYamlFrontmatter(contents: string): boolean {
  const normalized = normalizeMarkdownForStorage(contents);

  if (normalized === FRONTMATTER_DELIMITER || normalized.startsWith(`${FRONTMATTER_DELIMITER}\n`)) {
    const lines = normalized.split("\n");

    for (let index = 1; index < lines.length; index += 1) {
      if (lines[index] === FRONTMATTER_DELIMITER || lines[index] === "...") {
        return true;
      }
    }
  }

  return false;
}

export function validateMarkdownBody(contents: string, path: string): MarkdownValidationResult {
  const errors: ValidationIssue[] = [];

  if (hasYamlFrontmatter(contents)) {
    errors.push({
      code: "AICtxValidationFailed",
      message: "Markdown files must not contain YAML frontmatter.",
      path,
      field: null
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings: []
  };
}

function removeUtf8Bom(contents: string): string {
  return contents.startsWith(UTF8_BOM) ? contents.slice(1) : contents;
}
