import type { Clock } from "../core/clock.js";
import { aictxError, type JsonValue } from "../core/errors.js";
import type { ProjectFileChange } from "../core/git.js";
import { writeMarkdownAtomic } from "../core/fs.js";
import { slugify } from "../core/ids.js";
import type { ProjectPaths } from "../core/paths.js";
import { err, ok, type Result } from "../core/result.js";
import type { GitState, ObjectId, ObjectStatus, ProjectId } from "../core/types.js";
import { searchIndex, type SearchResult } from "../index/search.js";
import { openIndexDatabase, type IndexDatabaseConnection } from "../index/sqlite.js";
import type { StoredMemoryObject } from "../storage/objects.js";
import { readCanonicalStorage, type CanonicalStorageSnapshot } from "../storage/read.js";
import type { MemoryRelation } from "../storage/relations.js";
import {
  rankMemoryCandidates,
  type RankedMemoryCandidates,
  type RankMemoryCandidate
} from "./rank.js";
import {
  normalizeLoadMemoryMode,
  type LoadMemoryMode
} from "./modes.js";
import { renderContextPack } from "./render.js";
import { MAX_TOKEN_BUDGET, normalizeTokenBudget } from "./tokens.js";
import {
  hintedFiles,
  hintSearchText,
  normalizeRetrievalHints,
  type NormalizedRetrievalHints,
  type RetrievalHints
} from "../retrieval/hints.js";

const SEARCH_SEED_LIMIT = 50;
const RECENT_CANDIDATE_LIMIT = 5;
const FALLBACK_TOKEN_TARGET = 6000;

export type { LoadMemoryMode } from "./modes.js";
export type TokenTargetSource = "explicit" | "config_default" | "fallback_default";
export type BudgetStatus = "within_target" | "over_target";

export interface LoadMemoryInput {
  task: string;
  token_budget?: number;
  mode?: string;
  hints?: RetrievalHints;
}

export interface CompileContextPackOptions extends LoadMemoryInput {
  paths: ProjectPaths;
  git: GitState;
  clock: Clock;
  gitFileChanges?: readonly ProjectFileChange[];
}

export interface LoadMemorySource {
  project: ProjectId;
  git_available: boolean;
  branch: string | null;
  commit: string | null;
}

export interface TokenTarget {
  value: number;
  source: TokenTargetSource;
  enforced: boolean;
  was_capped: boolean;
}

export interface LoadMemoryData {
  task: string;
  token_budget: number;
  mode: LoadMemoryMode;
  context_pack: string;
  source: LoadMemorySource;
  token_target: TokenTarget;
  estimated_tokens: number;
  budget_status: BudgetStatus;
  truncated: boolean;
  included_ids: ObjectId[];
  excluded_ids: ObjectId[];
  omitted_ids: ObjectId[];
}

export interface LinkedHistoryEntry {
  file: string;
  commit: string;
  short_commit: string;
  timestamp: string;
  subject: string;
}

export interface RationaleGap {
  file: string;
  change_count: number;
  latest_commit: string;
  latest_subject: string;
}

interface TokenTargetInput {
  requestedBudget?: number;
  configuredDefaultBudget: number;
}

interface ObjectHashRow {
  id: string;
  content_hash: string;
}

interface RelationHashRow {
  id: string;
  content_hash: string | null;
}

interface CountRow {
  count: number;
}

interface MetaRow {
  key: string;
  value: string;
}

interface IndexedCounts {
  objectCount: number;
  relationCount: number;
  eventCount: number;
}

interface CandidateSelectionInput {
  storage: CanonicalStorageSnapshot;
  task: string;
  hints: NormalizedRetrievalHints;
  searchResults: readonly SearchResult[];
}

export async function compileContextPack(
  options: CompileContextPackOptions
): Promise<Result<LoadMemoryData>> {
  const task = normalizeTask(options.task);
  const mode = normalizeLoadMemoryMode(options.mode);
  const hints = normalizeRetrievalHints(options.hints);

  if (!task.ok) {
    return task;
  }

  if (!mode.ok) {
    return mode;
  }

  if (!hints.ok) {
    return hints;
  }

  const storage = await readCanonicalStorage(options.paths.projectRoot);

  if (!storage.ok) {
    return storage;
  }

  const tokenTarget = resolveTokenTarget({
    ...(options.token_budget === undefined ? {} : { requestedBudget: options.token_budget }),
    configuredDefaultBudget: storage.data.config.memory.defaultTokenBudget
  });

  if (!tokenTarget.ok) {
    return err(tokenTarget.error, storage.warnings);
  }

  const searched = await searchIndex({
    aictxRoot: options.paths.aictxRoot,
    query: task.data,
    limit: SEARCH_SEED_LIMIT,
    ...(options.hints === undefined ? {} : { hints: options.hints })
  });

  if (!searched.ok) {
    return err(searched.error, [...storage.warnings, ...searched.warnings]);
  }

  const fresh = await requireFreshIndex(options.paths.aictxRoot, storage.data);

  if (!fresh.ok) {
    return err(fresh.error, [...storage.warnings, ...searched.warnings, ...fresh.warnings]);
  }

  const candidates = selectCandidateObjects({
    storage: storage.data,
    task: task.data,
    hints: hints.data,
    searchResults: searched.data.matches
  });
  const ranked = rankMemoryCandidates({
    task: task.data,
    hints: hints.data,
    mode: mode.data,
    projectId: storage.data.config.project.id,
    git: options.git,
    candidates,
    relations: storage.data.relations.map((relation) => relation.relation)
  });
  const rendered = renderContextPack({
    task: task.data,
    ...(tokenTarget.data.enforced ? { tokenTarget: tokenTarget.data.value } : {}),
    projectId: storage.data.config.project.id,
    git: options.git,
    mode: mode.data,
    ranked,
    linkedHistory: linkedHistoryEntries(options.gitFileChanges ?? [], hints.data),
    rationaleGaps: rationaleGaps({
      storage: storage.data,
      hints: hints.data,
      gitFileChanges: options.gitFileChanges ?? []
    })
  });
  const contextPack = rendered.markdown;
  const estimatedTokens = rendered.estimatedTokens;
  const rankExcludedIds = collectRankExcludedIds(ranked);
  const warnings = [...storage.warnings, ...searched.warnings, ...fresh.warnings];

  if (storage.data.config.memory.saveContextPacks) {
    const saved = await saveGeneratedContextPack({
      projectRoot: options.paths.projectRoot,
      task: task.data,
      clock: options.clock,
      markdown: contextPack
    });

    if (!saved.ok) {
      warnings.push(
        ...saved.warnings,
        `Generated context pack was not saved: ${saved.error.message}`
      );
    }
  }

  return ok(
    {
      task: task.data,
      token_budget: tokenTarget.data.value,
      mode: mode.data,
      context_pack: contextPack,
      source: {
        project: storage.data.config.project.id,
        git_available: options.git.available,
        branch: options.git.branch,
        commit: options.git.commit
      },
      token_target: tokenTarget.data,
      estimated_tokens: estimatedTokens,
      budget_status:
        estimatedTokens <= tokenTarget.data.value ? "within_target" : "over_target",
      truncated: rendered.truncated,
      included_ids: rendered.includedIds,
      excluded_ids: [...rankExcludedIds],
      omitted_ids: rendered.omittedIds
    },
    warnings
  );
}

function normalizeTask(task: string): Result<string> {
  const normalized = task.trim();

  if (normalized === "") {
    return err(
      aictxError("AICtxValidationFailed", "Task must be non-empty after trimming whitespace.", {
        field: "task"
      })
    );
  }

  return ok(normalized);
}

function resolveTokenTarget(input: TokenTargetInput): Result<TokenTarget> {
  if (input.requestedBudget !== undefined) {
    const normalized = normalizeTokenBudget({ requestedBudget: input.requestedBudget });

    if (!normalized.ok) {
      return normalized;
    }

    if (normalized.data.tokenTarget === null) {
      return err(
        aictxError("AICtxInternalError", "Explicit token budget did not produce a token target.")
      );
    }

    return ok({
      value: normalized.data.tokenTarget,
      source: "explicit",
      enforced: true,
      was_capped: normalized.data.wasCapped
    });
  }

  const configuredDefaultValid = isValidConfiguredDefaultBudget(input.configuredDefaultBudget);
  const selectedTarget = configuredDefaultValid
    ? input.configuredDefaultBudget
    : FALLBACK_TOKEN_TARGET;
  const value = Math.min(selectedTarget, MAX_TOKEN_BUDGET);

  return ok({
    value,
    source: configuredDefaultValid ? "config_default" : "fallback_default",
    enforced: false,
    was_capped: value !== selectedTarget
  });
}

function isValidConfiguredDefaultBudget(value: number): boolean {
  return Number.isSafeInteger(value) && value > 500;
}

async function requireFreshIndex(
  aictxRoot: string,
  storage: CanonicalStorageSnapshot
): Promise<Result<void>> {
  const opened = await openIndexDatabase({
    aictxRoot,
    migrate: false
  });

  if (!opened.ok) {
    return opened;
  }

  const checked = checkIndexFresh(opened.data, storage);
  const closed = opened.data.close();

  if (!checked.ok) {
    return checked;
  }

  if (!closed.ok) {
    return closed;
  }

  return ok(undefined, closed.warnings);
}

function checkIndexFresh(
  connection: IndexDatabaseConnection,
  storage: CanonicalStorageSnapshot
): Result<void> {
  try {
    const counts = readIndexedCounts(connection);
    const expectedCounts = {
      objectCount: storage.objects.length,
      relationCount: storage.relations.length,
      eventCount: storage.events.length
    } satisfies IndexedCounts;

    if (!countsMatch(counts, expectedCounts)) {
      return staleIndex({
        reason: "count_mismatch",
        expected: countsToJson(expectedCounts),
        actual: countsToJson(counts)
      });
    }

    const ftsObjectCount = countRows(connection, "objects_fts");

    if (ftsObjectCount !== expectedCounts.objectCount) {
      return staleIndex({
        reason: "fts_count_mismatch",
        expected: expectedCounts.objectCount,
        actual: ftsObjectCount
      });
    }

    const metaCounts = readMetaCounts(connection);

    if (metaCounts === null || !countsMatch(metaCounts, expectedCounts)) {
      return staleIndex({
        reason: "meta_count_mismatch",
        expected: countsToJson(expectedCounts),
        actual: metaCounts === null ? null : countsToJson(metaCounts)
      });
    }

    const objectHashes = new Map(
      connection.db
        .prepare<[], ObjectHashRow>("SELECT id, content_hash FROM objects")
        .all()
        .map((row) => [row.id, row.content_hash] as const)
    );
    const relationHashes = new Map(
      connection.db
        .prepare<[], RelationHashRow>("SELECT id, content_hash FROM relations")
        .all()
        .map((row) => [row.id, row.content_hash] as const)
    );

    for (const object of storage.objects) {
      const indexedHash = objectHashes.get(object.sidecar.id);

      if (indexedHash !== object.sidecar.content_hash) {
        return staleIndex({
          reason: "object_hash_mismatch",
          id: object.sidecar.id,
          expected: object.sidecar.content_hash,
          actual: indexedHash ?? null
        });
      }
    }

    for (const relation of storage.relations) {
      const indexedHash = relationHashes.get(relation.relation.id) ?? null;
      const expectedHash = relation.relation.content_hash ?? null;

      if (indexedHash !== expectedHash) {
        return staleIndex({
          reason: "relation_hash_mismatch",
          id: relation.relation.id,
          expected: expectedHash,
          actual: indexedHash
        });
      }
    }

    return ok(undefined);
  } catch (error) {
    return err(
      aictxError("AICtxIndexUnavailable", "SQLite index freshness could not be checked.", {
        message: messageFromUnknown(error)
      })
    );
  }
}

function readIndexedCounts(connection: IndexDatabaseConnection): IndexedCounts {
  return {
    objectCount: countRows(connection, "objects"),
    relationCount: countRows(connection, "relations"),
    eventCount: countRows(connection, "events")
  };
}

function readMetaCounts(connection: IndexDatabaseConnection): IndexedCounts | null {
  const rows = connection.db.prepare<[], MetaRow>("SELECT key, value FROM meta").all();
  const meta = new Map(rows.map((row) => [row.key, row.value] as const));
  const objectCount = parseMetaInteger(meta.get("object_count"));
  const relationCount = parseMetaInteger(meta.get("relation_count"));
  const eventCount = parseMetaInteger(meta.get("event_count"));

  if (objectCount === null || relationCount === null || eventCount === null) {
    return null;
  }

  return {
    objectCount,
    relationCount,
    eventCount
  };
}

function countRows(
  connection: IndexDatabaseConnection,
  table: "objects" | "relations" | "events" | "objects_fts"
): number {
  return connection.db.prepare<[], CountRow>(`SELECT count(*) AS count FROM ${table}`).get()
    ?.count ?? 0;
}

function parseMetaInteger(value: string | undefined): number | null {
  if (value === undefined || !/^\d+$/.test(value)) {
    return null;
  }

  return Number(value);
}

function countsMatch(left: IndexedCounts, right: IndexedCounts): boolean {
  return (
    left.objectCount === right.objectCount &&
    left.relationCount === right.relationCount &&
    left.eventCount === right.eventCount
  );
}

function countsToJson(counts: IndexedCounts): JsonValue {
  return {
    object_count: counts.objectCount,
    relation_count: counts.relationCount,
    event_count: counts.eventCount
  };
}

function selectCandidateObjects(input: CandidateSelectionInput): RankMemoryCandidate[] {
  const objectsById = new Map(
    input.storage.objects.map((object) => [object.sidecar.id, object] as const)
  );
  const candidateIds = new Set<ObjectId>();
  const retrievalText = [input.task, hintSearchText(input.hints)].join(" ");
  const taskText = retrievalText.toLowerCase();
  const taskTerms = extractTerms(retrievalText);
  const files = hintedFiles(input.hints);

  for (const result of input.searchResults) {
    candidateIds.add(result.id);
  }

  for (const object of input.storage.objects) {
    if (objectMatchesTask(object, taskText, taskTerms, files)) {
      candidateIds.add(object.sidecar.id);
    }
  }

  addRelationCandidates(
    candidateIds,
    input.storage.relations.map((relation) => relation.relation),
    taskText
  );

  for (const object of newestHighPriorityObjects(input.storage.objects)) {
    candidateIds.add(object.sidecar.id);
  }

  return [...candidateIds]
    .map((id) => objectsById.get(id))
    .filter((object): object is StoredMemoryObject => object !== undefined)
    .map(rankCandidateFromStoredObject)
    .filter((candidate): candidate is RankMemoryCandidate => candidate !== null);
}

function objectMatchesTask(
  object: StoredMemoryObject,
  taskText: string,
  taskTerms: readonly string[],
  hintedFilePaths: readonly string[]
): boolean {
  const sidecar = object.sidecar;

  return (
    taskText.includes(sidecar.id.toLowerCase()) ||
    taskText.includes(object.bodyPath.toLowerCase()) ||
    taskText.includes(sidecar.body_path.toLowerCase()) ||
    hasTagMatch(sidecar.tags ?? [], taskTerms) ||
    hasFacetMatch(sidecar.facets, taskText, taskTerms) ||
    hasEvidenceMatch(sidecar.evidence ?? [], taskText, taskTerms) ||
    hintedFilePaths.some((filePath) => objectReferencesFile(object, filePath))
  );
}

function linkedHistoryEntries(
  changes: readonly ProjectFileChange[],
  hints: NormalizedRetrievalHints
): LinkedHistoryEntry[] {
  const files = new Set(hintedFiles(hints));

  return uniqueGitFileChanges(changes)
    .filter((change) => files.size === 0 || files.has(change.file))
    .slice(0, 10)
    .map((change) => ({
      file: change.file,
      commit: change.commit,
      short_commit: change.shortCommit,
      timestamp: change.timestamp,
      subject: change.subject
    }));
}

function rationaleGaps(input: {
  storage: CanonicalStorageSnapshot;
  hints: NormalizedRetrievalHints;
  gitFileChanges: readonly ProjectFileChange[];
}): RationaleGap[] {
  const files = hintedFiles(input.hints);

  if (files.length === 0 || input.gitFileChanges.length === 0) {
    return [];
  }

  const rationaleObjects = input.storage.objects.filter(isActiveRationaleObject);
  const gaps: RationaleGap[] = [];

  for (const file of files) {
    const changes = input.gitFileChanges.filter((change) => change.file === file);

    if (changes.length === 0) {
      continue;
    }

    if (rationaleObjects.some((object) => objectReferencesFile(object, file))) {
      continue;
    }

    const latest = [...changes].sort(compareProjectFileChange)[0];

    if (latest === undefined) {
      continue;
    }

    gaps.push({
      file,
      change_count: changes.length,
      latest_commit: latest.shortCommit,
      latest_subject: latest.subject
    });
  }

  return gaps.sort((left, right) => left.file.localeCompare(right.file)).slice(0, 10);
}

function isActiveRationaleObject(object: StoredMemoryObject): boolean {
  const status = normalizedObjectStatus(object);

  return (
    (status === "active" || status === "open") &&
    ["architecture", "synthesis", "decision", "gotcha", "fact", "constraint"].includes(
      object.sidecar.type
    )
  );
}

function objectReferencesFile(object: StoredMemoryObject, filePath: string): boolean {
  const normalized = normalizeProjectFileReference(filePath);

  if (normalized === null) {
    return false;
  }

  const facets = object.sidecar.facets;

  if (
    (facets?.applies_to ?? []).some(
      (path) => normalizeProjectFileReference(path) === normalized
    )
  ) {
    return true;
  }

  if (
    (object.sidecar.evidence ?? []).some(
      (item) => item.kind === "file" && normalizeProjectFileReference(item.id) === normalized
    )
  ) {
    return true;
  }

  return extractProjectFileReferences(object.body).includes(normalized);
}

function addRelationCandidates(
  candidateIds: Set<ObjectId>,
  relations: readonly MemoryRelation[],
  taskText: string
): void {
  const seedIds = new Set(candidateIds);

  for (const relation of relations) {
    if (relation.status !== "active") {
      continue;
    }

    if (
      seedIds.has(relation.from) ||
      seedIds.has(relation.to) ||
      taskText.includes(relation.id.toLowerCase())
    ) {
      candidateIds.add(relation.from);
      candidateIds.add(relation.to);
    }
  }
}

function newestHighPriorityObjects(
  objects: readonly StoredMemoryObject[]
): StoredMemoryObject[] {
  return [...objects]
    .filter((object) =>
      ["active", "open"].includes(normalizedObjectStatus(object) ?? "")
    )
    .sort(compareStoredObjectsByPriority)
    .slice(0, RECENT_CANDIDATE_LIMIT);
}

function rankCandidateFromStoredObject(object: StoredMemoryObject): RankMemoryCandidate | null {
  const sidecar = object.sidecar;
  const status = normalizedObjectStatus(object);

  if (status === null) {
    return null;
  }

  return {
    id: sidecar.id,
    type: sidecar.type,
    status,
    title: sidecar.title,
    body_path: object.bodyPath,
    body: object.body,
    scope: sidecar.scope,
    tags: sidecar.tags ?? [],
    ...(sidecar.facets === undefined ? {} : { facets: sidecar.facets }),
    ...(sidecar.evidence === undefined ? {} : { evidence: sidecar.evidence }),
    updated_at: sidecar.updated_at
  };
}

function normalizedObjectStatus(object: StoredMemoryObject): ObjectStatus | null {
  const status = object.sidecar.status as string;

  if (status === "rejected") {
    return null;
  }

  if (object.sidecar.type === "question") {
    if (
      status === "stale" ||
      status === "superseded" ||
      status === "open" ||
      status === "closed"
    ) {
      return status;
    }

    return "open";
  }

  if (status === "stale" || status === "superseded") {
    return status;
  }

  return "active";
}

function compareStoredObjectsByPriority(
  left: StoredMemoryObject,
  right: StoredMemoryObject
): number {
  const updatedDifference = compareIsoDesc(left.sidecar.updated_at, right.sidecar.updated_at);

  if (updatedDifference !== 0) {
    return updatedDifference;
  }

  return left.sidecar.id.localeCompare(right.sidecar.id);
}

function compareIsoDesc(left: string, right: string): number {
  const leftMillis = Date.parse(left);
  const rightMillis = Date.parse(right);

  if (Number.isFinite(leftMillis) && Number.isFinite(rightMillis)) {
    return rightMillis - leftMillis;
  }

  return right.localeCompare(left);
}

function hasTagMatch(tags: readonly string[], taskTerms: readonly string[]): boolean {
  const terms = new Set(taskTerms);

  return tags.some((tag) => extractTerms(tag).some((term) => terms.has(term)));
}

function hasFacetMatch(
  facets: StoredMemoryObject["sidecar"]["facets"],
  taskText: string,
  taskTerms: readonly string[]
): boolean {
  if (facets === undefined) {
    return false;
  }

  const terms = new Set(taskTerms);
  const facetTerms = extractTerms([
    facets.category,
    ...(facets.applies_to ?? []),
    ...(facets.load_modes ?? [])
  ].join(" "));

  return (
    facetTerms.some((term) => terms.has(term)) ||
    (facets.applies_to ?? []).some((path) => taskText.includes(path.toLowerCase()))
  );
}

function hasEvidenceMatch(
  evidence: readonly NonNullable<StoredMemoryObject["sidecar"]["evidence"]>[number][],
  taskText: string,
  taskTerms: readonly string[]
): boolean {
  const terms = new Set(taskTerms);

  return evidence.some((item) => {
    const id = item.id.toLowerCase();
    return taskText.includes(id) || extractTerms(id).some((term) => terms.has(term));
  });
}

function extractTerms(value: string): string[] {
  const terms =
    value
      .match(/[\p{L}\p{N}_]+/gu)
      ?.map((term) => term.toLowerCase())
      .filter((term) => term.length > 0) ?? [];

  return [...new Set(terms)];
}

function extractProjectFileReferences(body: string): string[] {
  return uniqueSorted(
    [...body.matchAll(/(?:^|[\s([{"'`])((?:\.\/)?(?:[A-Za-z0-9_.-]+\/)+[A-Za-z0-9_.@+-]+\.[A-Za-z0-9]+)(?=$|[\s)\]}",'`:;])/gu)]
      .map((match) => match[1] ?? "")
      .map(normalizeProjectFileReference)
      .filter((path): path is string => path !== null)
  );
}

function normalizeProjectFileReference(value: string): string | null {
  const normalized = value.trim().replace(/\\/gu, "/").replace(/^\.\//u, "");

  if (
    normalized === "" ||
    normalized.startsWith("/") ||
    normalized.startsWith("../") ||
    normalized.includes("/../") ||
    normalized.includes("://") ||
    normalized.includes("\0") ||
    normalized.startsWith(".aictx/")
  ) {
    return null;
  }

  return normalized;
}

function uniqueGitFileChanges(
  changes: readonly ProjectFileChange[]
): ProjectFileChange[] {
  const byKey = new Map<string, ProjectFileChange>();

  for (const change of changes) {
    byKey.set(`${change.file}\0${change.commit}`, change);
  }

  return [...byKey.values()].sort(compareProjectFileChange);
}

function compareProjectFileChange(
  left: ProjectFileChange,
  right: ProjectFileChange
): number {
  return (
    right.timestamp.localeCompare(left.timestamp) ||
    left.file.localeCompare(right.file) ||
    left.commit.localeCompare(right.commit)
  );
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function collectRankExcludedIds(ranked: RankedMemoryCandidates): Set<ObjectId> {
  return new Set(ranked.excluded.map((excluded) => excluded.id));
}

async function saveGeneratedContextPack(options: {
  projectRoot: string;
  task: string;
  clock: Clock;
  markdown: string;
}): Promise<Result<void>> {
  const timestampSlug = slugify(options.clock.nowIso(), { fallback: "generated" });
  const taskSlug = slugify(options.task, { fallback: "context-pack" });

  return writeMarkdownAtomic(
    options.projectRoot,
    `.aictx/context/${timestampSlug}-${taskSlug}.md`,
    options.markdown
  );
}

function staleIndex(details: JsonValue): Result<void> {
  return err(aictxError("AICtxIndexUnavailable", "SQLite index is stale.", details));
}

function messageFromUnknown(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
