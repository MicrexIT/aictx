import { createHash } from "node:crypto";

import type { Sha256Hash } from "../core/types.js";

const CONTENT_HASH_FIELD = "content_hash";

export function canonicalJson(value: unknown): string {
  return serializeCanonicalJson(value, new WeakSet<object>(), "$");
}

export function normalizeMarkdownForHash(markdown: string): string {
  const withoutBom = markdown.startsWith("\uFEFF") ? markdown.slice(1) : markdown;

  return withoutBom.replace(/\r\n?/g, "\n");
}

export function computeObjectContentHash(
  sidecar: Record<string, unknown>,
  markdownBody: string
): Sha256Hash {
  const objectForHash = withoutContentHash(sidecar);
  const input = `${canonicalJson(objectForHash)}\n${normalizeMarkdownForHash(markdownBody)}`;

  return sha256(input);
}

export function computeRelationContentHash(relation: Record<string, unknown>): Sha256Hash {
  return sha256(canonicalJson(withoutContentHash(relation)));
}

function withoutContentHash(record: Record<string, unknown>): Record<string, unknown> {
  const { [CONTENT_HASH_FIELD]: _contentHash, ...rest } = record;

  return rest;
}

function sha256(input: string): Sha256Hash {
  return `sha256:${createHash("sha256").update(input, "utf8").digest("hex")}`;
}

function serializeCanonicalJson(
  value: unknown,
  seenObjects: WeakSet<object>,
  path: string
): string {
  if (value === null) {
    return "null";
  }

  switch (typeof value) {
    case "string":
      return JSON.stringify(value);
    case "number":
      if (!Number.isFinite(value)) {
        throw new TypeError(`Cannot canonicalize non-finite number at ${path}.`);
      }

      return JSON.stringify(value);
    case "boolean":
      return value ? "true" : "false";
    case "undefined":
      throw new TypeError(`Cannot canonicalize undefined at ${path}.`);
    case "bigint":
      throw new TypeError(`Cannot canonicalize bigint at ${path}.`);
    case "function":
      throw new TypeError(`Cannot canonicalize function at ${path}.`);
    case "symbol":
      throw new TypeError(`Cannot canonicalize symbol at ${path}.`);
    case "object":
      return Array.isArray(value)
        ? serializeCanonicalArray(value, seenObjects, path)
        : serializeCanonicalObject(value, seenObjects, path);
  }

  throw new TypeError(`Cannot canonicalize unsupported value: ${String(value)}.`);
}

function serializeCanonicalArray(
  value: unknown[],
  seenObjects: WeakSet<object>,
  path: string
): string {
  if (seenObjects.has(value)) {
    throw new TypeError(`Cannot canonicalize circular reference at ${path}.`);
  }

  seenObjects.add(value);
  const serializedItems = value.map((item, index) => {
    if (item === undefined) {
      throw new TypeError(`Cannot canonicalize undefined array item at ${path}[${index}].`);
    }

    return serializeCanonicalJson(item, seenObjects, `${path}[${index}]`);
  });
  seenObjects.delete(value);

  return `[${serializedItems.join(",")}]`;
}

function serializeCanonicalObject(
  value: object,
  seenObjects: WeakSet<object>,
  path: string
): string {
  if (!isPlainObject(value)) {
    throw new TypeError(`Cannot canonicalize non-plain object at ${path}.`);
  }

  if (Object.getOwnPropertySymbols(value).length > 0) {
    throw new TypeError(`Cannot canonicalize symbol-keyed object at ${path}.`);
  }

  if (seenObjects.has(value)) {
    throw new TypeError(`Cannot canonicalize circular reference at ${path}.`);
  }

  seenObjects.add(value);
  const entries = Object.entries(value)
    .filter(([, entryValue]) => entryValue !== undefined)
    .sort(([leftKey], [rightKey]) => compareByUnicodeCodePoint(leftKey, rightKey))
    .map(([key, entryValue]) => {
      const serializedKey = JSON.stringify(key);
      const serializedValue = serializeCanonicalJson(entryValue, seenObjects, `${path}.${key}`);

      return `${serializedKey}:${serializedValue}`;
    });
  seenObjects.delete(value);

  return `{${entries.join(",")}}`;
}

function isPlainObject(value: object): value is Record<string, unknown> {
  const prototype = Object.getPrototypeOf(value);

  return prototype === Object.prototype || prototype === null;
}

function compareByUnicodeCodePoint(left: string, right: string): number {
  const leftCodePoints = Array.from(left);
  const rightCodePoints = Array.from(right);
  const length = Math.min(leftCodePoints.length, rightCodePoints.length);

  for (let index = 0; index < length; index += 1) {
    const leftCodePoint = leftCodePoints[index]?.codePointAt(0);
    const rightCodePoint = rightCodePoints[index]?.codePointAt(0);

    if (leftCodePoint === undefined || rightCodePoint === undefined) {
      throw new Error("Unexpected empty Unicode code point.");
    }

    if (leftCodePoint !== rightCodePoint) {
      return leftCodePoint - rightCodePoint;
    }
  }

  return leftCodePoints.length - rightCodePoints.length;
}
