import type { ObjectId, ObjectType, Predicate, RelationId } from "./types.js";

export const SLUG_PATTERN = "^[a-z0-9][a-z0-9-]*$";
export const OBJECT_ID_PATTERN = "^[a-z][a-z0-9_]*\\.[a-z0-9][a-z0-9-]*$";
export const RELATION_ID_PATTERN = "^rel\\.[a-z0-9][a-z0-9-]*$";

export const SLUG_REGEX = new RegExp(SLUG_PATTERN);
export const OBJECT_ID_REGEX = new RegExp(OBJECT_ID_PATTERN);
export const RELATION_ID_REGEX = new RegExp(RELATION_ID_PATTERN);

export interface SlugifyOptions {
  fallback?: string;
}

export interface GenerateObjectIdOptions {
  type: ObjectType;
  title: string;
  existingIds?: Iterable<string>;
}

export interface GenerateRelationIdOptions {
  from: ObjectId;
  predicate: Predicate;
  to: ObjectId;
  existingIds?: Iterable<string>;
}

interface ObjectIdParts {
  type: string;
  slug: string;
}

export function slugify(input: string, options: SlugifyOptions = {}): string {
  const slug = normalizeToSlug(input);

  if (slug !== "") {
    return slug;
  }

  const fallback = normalizeToSlug(options.fallback ?? "untitled");
  return fallback === "" ? "untitled" : fallback;
}

export function isSlug(value: string): boolean {
  return SLUG_REGEX.test(value);
}

export function isObjectId(value: string): value is ObjectId {
  return OBJECT_ID_REGEX.test(value);
}

export function isRelationId(value: string): value is RelationId {
  return RELATION_ID_REGEX.test(value);
}

export function generateObjectId(options: GenerateObjectIdOptions): ObjectId {
  const slug = slugify(options.title);
  return withDeterministicSuffix(`${options.type}.${slug}`, options.existingIds);
}

export function generateRelationId(options: GenerateRelationIdOptions): RelationId {
  const from = parseObjectId(options.from);
  const to = parseObjectId(options.to);
  const predicate = options.predicate.replaceAll("_", "-");
  const relationSlug = `${from.type}-${from.slug}-${predicate}-${to.type}-${to.slug}`;

  return withDeterministicSuffix(`rel.${relationSlug}`, options.existingIds);
}

function normalizeToSlug(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['"`’‘“”]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function withDeterministicSuffix(base: string, existingIds: Iterable<string> = []): string {
  const existing = new Set(existingIds);

  if (!existing.has(base)) {
    return base;
  }

  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${base}-${suffix}`;

    if (!existing.has(candidate)) {
      return candidate;
    }
  }
}

function parseObjectId(id: ObjectId): ObjectIdParts {
  if (!isObjectId(id)) {
    throw new Error(`Invalid object ID: ${id}`);
  }

  const separatorIndex = id.indexOf(".");

  return {
    type: id.slice(0, separatorIndex),
    slug: id.slice(separatorIndex + 1)
  };
}
