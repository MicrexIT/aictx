import { lstat } from "node:fs/promises";

import { memoryError, type JsonValue } from "../core/errors.js";
import { err, ok, type Result } from "../core/result.js";
import {
  OBJECT_STATUSES,
  OBJECT_TYPES,
  type ObjectStatus,
  type ObjectType
} from "../core/types.js";
import {
  hintSearchText,
  hintedFiles,
  normalizeRetrievalHints,
  retrievalHintsHaveSignal,
  type NormalizedRetrievalHints,
  type RetrievalHints
} from "../retrieval/hints.js";
import {
  CURRENT_INDEX_SCHEMA_VERSION,
  getIndexSchemaVersion
} from "./migrations.js";
import {
  openIndexDatabase,
  resolveIndexDatabasePath,
  type IndexDatabaseConnection
} from "./sqlite.js";
import type { SqliteDatabase } from "./sqlite-driver.js";

const DEFAULT_LIMIT = 10;
const MIN_LIMIT = 1;
const MAX_LIMIT = 50;
const SNIPPET_LENGTH = 160;
const SNIPPET_CONTEXT = 48;

const SCORE = {
  exactId: 100,
  exactBodyPath: 80,
  hintMatch: 45,
  tagMatch: 40,
  titleFtsMatch: 30,
  bodyFtsMatch: 15,
  recentMemoryBoost: 5
} as const;

const TYPE_MODIFIERS = {
  constraint: 20,
  decision: 18,
  synthesis: 16,
  architecture: 12,
  question: 10,
  fact: 8,
  gotcha: 14,
  workflow: 10,
  source: 5,
  concept: 6,
  project: 8,
  note: 0
} as const satisfies Record<ObjectType, number>;

const STATUS_MODIFIERS = {
  active: 20,
  open: 12,
  stale: -30,
  superseded: -35,
  closed: 0
} as const satisfies Record<ObjectStatus, number>;

const TYPE_PRIORITY = {
  constraint: 0,
  decision: 1,
  synthesis: 2,
  gotcha: 3,
  architecture: 4,
  workflow: 5,
  question: 6,
  fact: 7,
  concept: 8,
  project: 9,
  source: 10,
  note: 11
} as const satisfies Record<ObjectType, number>;

export interface SearchMemoryInput {
  query: string;
  limit?: number;
  hints?: RetrievalHints;
}

export interface SearchIndexOptions extends SearchMemoryInput {
  memoryRoot: string;
}

export interface SearchMemoryData {
  matches: SearchResult[];
}

export interface SearchResult {
  id: string;
  type: ObjectType;
  status: ObjectStatus;
  title: string;
  snippet: string;
  body_path: string;
  score: number;
}

interface RankedSearchResult extends SearchResult {
  updatedAt: string;
}

interface NormalizedSearchInput {
  query: string;
  limit: number;
  terms: string[];
  ftsQuery: string | null;
  hints: NormalizedRetrievalHints;
}

interface ObjectRow {
  id: string;
  type: string;
  status: string;
  title: string;
  body_path: string;
  body: string;
  tags_json: string;
  facets_json: string | null;
  evidence_json: string | null;
  origin_json: string | null;
  updated_at: string;
}

interface IndexedObject {
  id: string;
  type: ObjectType;
  status: ObjectStatus;
  title: string;
  bodyPath: string;
  body: string;
  tags: string[];
  facetsText: string;
  evidenceText: string;
  updatedAt: string;
}

interface SearchCandidate {
  object: IndexedObject;
  sources: Set<ScoreSource>;
}

type ScoreSource =
  | "exactId"
  | "exactBodyPath"
  | "hintMatch"
  | "tagMatch"
  | "titleFtsMatch"
  | "bodyFtsMatch";

export async function searchIndex(options: SearchIndexOptions): Promise<Result<SearchMemoryData>> {
  const normalized = normalizeSearchInput(options);

  if (!normalized.ok) {
    return normalized;
  }

  const databaseAvailable = await requireExistingIndexDatabase(options.memoryRoot);

  if (!databaseAvailable.ok) {
    return databaseAvailable;
  }

  const connection = await openIndexDatabase({
    memoryRoot: options.memoryRoot,
    migrate: false
  });

  if (!connection.ok) {
    return connection;
  }

  const searched = searchDatabase(connection.data, normalized.data);
  const closed = connection.data.close();

  if (!searched.ok) {
    return err(searched.error, [...searched.warnings, ...closed.warnings]);
  }

  if (!closed.ok) {
    return err(closed.error, closed.warnings);
  }

  return searched;
}

function normalizeSearchInput(input: SearchMemoryInput): Result<NormalizedSearchInput> {
  if (typeof input.query !== "string") {
    return invalidInput("Search query is required.", {
      field: "query"
    });
  }

  const query = input.query.trim();

  if (query === "") {
    return invalidInput("Search query must be non-empty after trimming whitespace.", {
      field: "query"
    });
  }

  const limit = input.limit ?? DEFAULT_LIMIT;

  if (!Number.isSafeInteger(limit) || limit < MIN_LIMIT || limit > MAX_LIMIT) {
    return invalidInput("Search limit must be an integer between 1 and 50.", {
      field: "limit",
      minimum: MIN_LIMIT,
      maximum: MAX_LIMIT,
      actual: numberDetail(limit)
    });
  }

  const hints = normalizeRetrievalHints(input.hints);

  if (!hints.ok) {
    return hints;
  }

  const terms = extractSearchTerms([query, hintSearchText(hints.data)].join(" "));

  return ok({
    query,
    limit,
    terms,
    ftsQuery: buildFtsQuery(terms),
    hints: hints.data
  });
}

async function requireExistingIndexDatabase(memoryRoot: string): Promise<Result<void>> {
  const databasePath = await resolveIndexDatabasePath(memoryRoot);

  if (!databasePath.ok) {
    return indexUnavailable("SQLite index database path could not be resolved.", {
      cause: errorToJson(databasePath.error)
    });
  }

  try {
    const stat = await lstat(databasePath.data);

    if (!stat.isFile() || stat.size === 0) {
      return indexUnavailable("SQLite index database is missing or empty.", {
        path: databasePath.data
      });
    }

    return ok(undefined);
  } catch (error) {
    if (errorCode(error) === "ENOENT") {
      return indexUnavailable("SQLite index database is missing.", {
        path: databasePath.data
      });
    }

    return indexUnavailable("SQLite index database could not be checked.", {
      path: databasePath.data,
      message: messageFromUnknown(error)
    });
  }
}

function searchDatabase(
  connection: IndexDatabaseConnection,
  input: NormalizedSearchInput
): Result<SearchMemoryData> {
  try {
    const schemaVersion = getIndexSchemaVersion(connection.db);

    if (!schemaVersion.ok) {
      return schemaVersion;
    }

    if (schemaVersion.data !== CURRENT_INDEX_SCHEMA_VERSION) {
      return indexUnavailable("SQLite index schema version is not supported.", {
        expected: CURRENT_INDEX_SCHEMA_VERSION,
        actual: schemaVersion.data
      });
    }

    const candidates = new Map<string, SearchCandidate>();
    const exactId = selectObjectById(connection.db, input.query);

    if (exactId !== undefined) {
      addCandidate(candidates, exactId, ["exactId"]);
    }

    const exactBodyPath = selectObjectByBodyPath(connection.db, input.query);

    if (exactBodyPath !== undefined) {
      addCandidate(candidates, exactBodyPath, ["exactBodyPath"]);
    }

    if (input.ftsQuery !== null) {
      for (const row of selectObjectsByFts(connection.db, input.ftsQuery)) {
        addCandidate(candidates, row, sourcesForTerms(row, input.terms));
      }
    }

    if (retrievalHintsHaveSignal(input.hints)) {
      for (const row of selectObjectsByHints(connection.db, input.hints)) {
        addCandidate(candidates, row, ["hintMatch"]);
      }
    }

    const recentBoostIds = newestBoostableCandidateIds(candidates);
    const matches = [...candidates.values()]
      .map((candidate) => resultFromCandidate(candidate, input.terms, recentBoostIds))
      .sort(compareRankedSearchResults)
      .slice(0, input.limit)
      .map(({ updatedAt: _updatedAt, ...result }) => result);

    return ok({ matches });
  } catch (error) {
    return indexUnavailable("SQLite index search failed.", {
      path: connection.path,
      message: messageFromUnknown(error)
    });
  }
}

function selectObjectById(db: SqliteDatabase, id: string): IndexedObject | undefined {
  const row = db
    .prepare<[string], ObjectRow>(
      `
        SELECT id, type, status, title, body_path, body, tags_json, facets_json, evidence_json, origin_json, updated_at
        FROM objects
        WHERE id = ? AND status <> 'rejected'
      `
    )
    .get(id);

  return row === undefined ? undefined : indexedObjectFromRow(row);
}

function selectObjectByBodyPath(db: SqliteDatabase, bodyPath: string): IndexedObject | undefined {
  const row = db
    .prepare<[string], ObjectRow>(
      `
        SELECT id, type, status, title, body_path, body, tags_json, facets_json, evidence_json, origin_json, updated_at
        FROM objects
        WHERE body_path = ? AND status <> 'rejected'
      `
    )
    .get(bodyPath);

  return row === undefined ? undefined : indexedObjectFromRow(row);
}

function selectObjectsByFts(db: SqliteDatabase, ftsQuery: string): IndexedObject[] {
  const rows = db
    .prepare<[string], ObjectRow>(
      `
        SELECT
          o.id,
          o.type,
          o.status,
          o.title,
          o.body_path,
          o.body,
          o.tags_json,
          o.facets_json,
          o.evidence_json,
          o.origin_json,
          o.updated_at
        FROM objects_fts
        JOIN objects o ON o.id = objects_fts.object_id
        WHERE objects_fts MATCH ? AND o.status <> 'rejected'
      `
    )
    .all(ftsQuery);

  return rows.map(indexedObjectFromRow);
}

function selectObjectsByHints(
  db: SqliteDatabase,
  hints: NormalizedRetrievalHints
): IndexedObject[] {
  const ids = new Set<string>();

  for (const id of selectObjectIdsByHintedFiles(db, hintedFiles(hints))) {
    ids.add(id);
  }

  for (const id of selectObjectIdsByFacetHints(db, [...hints.subsystems, ...hints.symbols])) {
    ids.add(id);
  }

  for (const id of selectObjectIdsByPathTerms(db, [...hints.subsystems, ...hints.symbols])) {
    ids.add(id);
  }

  if (ids.size === 0) {
    return [];
  }

  const select = db.prepare<[string], ObjectRow>(
    `
      SELECT id, type, status, title, body_path, body, tags_json, facets_json, evidence_json, origin_json, updated_at
      FROM objects
      WHERE id = ? AND status <> 'rejected'
    `
  );

  return [...ids]
    .map((id) => select.get(id))
    .filter((row): row is ObjectRow => row !== undefined)
    .map(indexedObjectFromRow);
}

function selectObjectIdsByHintedFiles(
  db: SqliteDatabase,
  files: readonly string[]
): string[] {
  if (files.length === 0) {
    return [];
  }

  const select = db.prepare<[string], { memory_id: string }>(
    "SELECT memory_id FROM memory_file_links WHERE file_path = ?"
  );

  return files.flatMap((file) => select.all(file).map((row) => row.memory_id));
}

function selectObjectIdsByFacetHints(
  db: SqliteDatabase,
  values: readonly string[]
): string[] {
  const facets = values
    .map((value) => value.toLowerCase().trim())
    .filter((value) => value !== "");

  if (facets.length === 0) {
    return [];
  }

  const select = db.prepare<[string], { memory_id: string }>(
    "SELECT memory_id FROM memory_facet_links WHERE facet = ?"
  );

  return facets.flatMap((facet) => select.all(facet).map((row) => row.memory_id));
}

function selectObjectIdsByPathTerms(
  db: SqliteDatabase,
  values: readonly string[]
): string[] {
  const terms = values
    .flatMap(extractSearchTerms)
    .filter((term) => term.length >= 2);

  if (terms.length === 0) {
    return [];
  }

  const select = db.prepare<[string], { memory_id: string }>(
    "SELECT memory_id FROM memory_file_links WHERE file_path LIKE ? ESCAPE '\\'"
  );

  return terms.flatMap((term) =>
    select.all(`%${escapeLike(term)}%`).map((row) => row.memory_id)
  );
}

function indexedObjectFromRow(row: ObjectRow): IndexedObject {
  if (!isObjectType(row.type)) {
    throw new Error(`Indexed object has unsupported type: ${row.type}`);
  }

  const status = normalizeIndexedObjectStatus(row.type, row.status);

  if (status === null) {
    throw new Error(`Indexed object has unsupported status: ${row.status}`);
  }

  return {
    id: row.id,
    type: row.type,
    status,
    title: row.title,
    bodyPath: row.body_path,
    body: row.body,
    tags: parseTags(row.tags_json),
    facetsText: jsonSearchText(row.facets_json),
    evidenceText: [jsonSearchText(row.evidence_json), jsonSearchText(row.origin_json)].join(" "),
    updatedAt: row.updated_at
  };
}

function addCandidate(
  candidates: Map<string, SearchCandidate>,
  object: IndexedObject,
  sources: readonly ScoreSource[]
): void {
  const existing = candidates.get(object.id);

  if (existing === undefined) {
    candidates.set(object.id, {
      object,
      sources: new Set(sources)
    });
    return;
  }

  for (const source of sources) {
    existing.sources.add(source);
  }
}

function sourcesForTerms(object: IndexedObject, terms: readonly string[]): ScoreSource[] {
  const sources = new Set<ScoreSource>();
  const normalizedTitle = normalizeForMatch(object.title);
  const normalizedBody = normalizeForMatch(object.body);
  const normalizedTags = object.tags.map(normalizeForMatch);
  const normalizedFacets = normalizeForMatch(object.facetsText);
  const normalizedEvidence = normalizeForMatch(object.evidenceText);

  for (const term of terms) {
    if (normalizedTitle.includes(term)) {
      sources.add("titleFtsMatch");
    }

    if (
      normalizedBody.includes(term) ||
      normalizedFacets.includes(term) ||
      normalizedEvidence.includes(term)
    ) {
      sources.add("bodyFtsMatch");
    }

    if (normalizedTags.some((tag) => tag.includes(term))) {
      sources.add("tagMatch");
    }
  }

  return [...sources];
}

function newestBoostableCandidateIds(candidates: ReadonlyMap<string, SearchCandidate>): Set<string> {
  return new Set(
    [...candidates.values()]
      .filter((candidate) => shouldApplyRecentBoost(candidate.object.status))
      .sort(compareNewestObjects)
      .slice(0, 5)
      .map((candidate) => candidate.object.id)
  );
}

function resultFromCandidate(
  candidate: SearchCandidate,
  terms: readonly string[],
  recentBoostIds: ReadonlySet<string>
): RankedSearchResult {
  const score =
    scoreSources(candidate.sources) +
    TYPE_MODIFIERS[candidate.object.type] +
    STATUS_MODIFIERS[candidate.object.status] +
    (recentBoostIds.has(candidate.object.id) ? SCORE.recentMemoryBoost : 0);

  return {
    id: candidate.object.id,
    type: candidate.object.type,
    status: candidate.object.status,
    title: candidate.object.title,
    snippet: buildSnippet(candidate.object.body, candidate.object.title, terms),
    body_path: candidate.object.bodyPath,
    score,
    updatedAt: candidate.object.updatedAt
  };
}

function scoreSources(sources: ReadonlySet<ScoreSource>): number {
  let score = 0;

  if (sources.has("exactId")) {
    score += SCORE.exactId;
  }

  if (sources.has("exactBodyPath")) {
    score += SCORE.exactBodyPath;
  }

  if (sources.has("hintMatch")) {
    score += SCORE.hintMatch;
  }

  if (sources.has("tagMatch")) {
    score += SCORE.tagMatch;
  }

  if (sources.has("titleFtsMatch")) {
    score += SCORE.titleFtsMatch;
  }

  if (sources.has("bodyFtsMatch")) {
    score += SCORE.bodyFtsMatch;
  }

  return score;
}

function compareRankedSearchResults(left: RankedSearchResult, right: RankedSearchResult): number {
  const scoreDifference = right.score - left.score;

  if (scoreDifference !== 0) {
    return scoreDifference;
  }

  const typeDifference = TYPE_PRIORITY[left.type] - TYPE_PRIORITY[right.type];

  if (typeDifference !== 0) {
    return typeDifference;
  }

  const updatedDifference = compareIsoDesc(left.updatedAt, right.updatedAt);

  if (updatedDifference !== 0) {
    return updatedDifference;
  }

  return left.id.localeCompare(right.id);
}

function compareNewestObjects(left: SearchCandidate, right: SearchCandidate): number {
  const updatedDifference = compareIsoDesc(left.object.updatedAt, right.object.updatedAt);

  if (updatedDifference !== 0) {
    return updatedDifference;
  }

  return left.object.id.localeCompare(right.object.id);
}

function compareIsoDesc(left: string, right: string): number {
  const leftMillis = Date.parse(left);
  const rightMillis = Date.parse(right);

  if (Number.isFinite(leftMillis) && Number.isFinite(rightMillis)) {
    return rightMillis - leftMillis;
  }

  return right.localeCompare(left);
}

function buildSnippet(body: string, title: string, terms: readonly string[]): string {
  const text = collapseWhitespace(body) || title;

  if (text.length <= SNIPPET_LENGTH) {
    return text;
  }

  const normalizedText = normalizeForMatch(text);
  const matchIndex = firstTermIndex(normalizedText, terms);

  if (matchIndex === -1) {
    return `${text.slice(0, SNIPPET_LENGTH - 3).trimEnd()}...`;
  }

  const start = Math.max(0, matchIndex - SNIPPET_CONTEXT);
  const end = Math.min(text.length, start + SNIPPET_LENGTH);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < text.length ? "..." : "";

  return `${prefix}${text.slice(start, end).trim()}${suffix}`;
}

function firstTermIndex(text: string, terms: readonly string[]): number {
  let firstIndex = -1;

  for (const term of terms) {
    const index = text.indexOf(term);

    if (index !== -1 && (firstIndex === -1 || index < firstIndex)) {
      firstIndex = index;
    }
  }

  return firstIndex;
}

function extractSearchTerms(query: string): string[] {
  const terms = query
    .match(/[\p{L}\p{N}_]+/gu)
    ?.map((term) => normalizeForMatch(term))
    .filter((term) => term.length > 0) ?? [];

  return [...new Set(terms)];
}

function buildFtsQuery(terms: readonly string[]): string | null {
  if (terms.length === 0) {
    return null;
  }

  return terms.map((term) => `"${term}"`).join(" OR ");
}

function parseTags(tagsJson: string): string[] {
  const parsed = JSON.parse(tagsJson) as unknown;

  if (!Array.isArray(parsed) || !parsed.every((tag) => typeof tag === "string")) {
    throw new Error("Indexed object tags are not a string array.");
  }

  return parsed;
}

function jsonSearchText(value: string | null): string {
  if (value === null) {
    return "";
  }

  try {
    return flattenJsonText(JSON.parse(value) as unknown).join(" ");
  } catch {
    return "";
  }
}

function flattenJsonText(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.flatMap(flattenJsonText);
  }

  if (typeof value === "object" && value !== null) {
    return Object.values(value).flatMap(flattenJsonText);
  }

  return [];
}

function isObjectType(value: string): value is ObjectType {
  return OBJECT_TYPES.includes(value as ObjectType);
}

function isObjectStatus(value: string): value is ObjectStatus {
  return OBJECT_STATUSES.includes(value as ObjectStatus);
}

function normalizeIndexedObjectStatus(
  type: ObjectType,
  status: string
): ObjectStatus | null {
  if (isObjectStatus(status)) {
    return status;
  }

  if (status === "draft") {
    return type === "question" ? "open" : "active";
  }

  return null;
}

function shouldApplyRecentBoost(status: ObjectStatus): boolean {
  return status !== "stale" && status !== "superseded";
}

function normalizeForMatch(value: string): string {
  return value.toLowerCase();
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/gu, (character) => `\\${character}`);
}

function invalidInput<T>(message: string, details: JsonValue): Result<T> {
  return err(memoryError("MemoryValidationFailed", message, details));
}

function indexUnavailable<T>(message: string, details: JsonValue): Result<T> {
  return err(memoryError("MemoryIndexUnavailable", message, details));
}

function errorToJson(error: { code: string; message: string; details?: JsonValue }): JsonValue {
  return error.details === undefined
    ? {
        code: error.code,
        message: error.message
      }
    : {
        code: error.code,
        message: error.message,
        details: error.details
      };
}

function numberDetail(value: number): JsonValue {
  if (Number.isNaN(value)) {
    return "NaN";
  }

  if (value === Infinity) {
    return "Infinity";
  }

  if (value === -Infinity) {
    return "-Infinity";
  }

  return value;
}

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code: unknown }).code)
    : undefined;
}

function messageFromUnknown(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
