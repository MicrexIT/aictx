import { constants } from "node:fs";
import { access, lstat, readFile } from "node:fs/promises";
import { join } from "node:path";

import { resolveInsideRoot } from "../core/fs.js";
import type { Evidence, ObjectId, ObjectStatus } from "../core/types.js";
import type { StoredMemoryObject } from "../storage/objects.js";
import type { CanonicalStorageSnapshot } from "../storage/read.js";
import type { StoredMemoryRelation } from "../storage/relations.js";

export type AuditSeverity = "warning" | "info";

export type AuditRule =
  | "vague_memory"
  | "duplicate_like_title_or_tags"
  | "stale_or_superseded_cleanup"
  | "referenced_file_missing"
  | "missing_tags"
  | "missing_facets"
  | "missing_object_evidence"
  | "task_diary_like_memory"
  | "oversized_vague_memory"
  | "duplicate_like_facet_category"
  | "missing_evidence"
  | "manifest_version_contradiction";

export interface AuditFinding {
  severity: AuditSeverity;
  rule: AuditRule;
  memory_id: ObjectId;
  message: string;
  evidence: Evidence[];
}

export interface BuildAuditFindingsOptions {
  projectRoot: string;
  storage: CanonicalStorageSnapshot;
}

const VAGUE_STATUSES = new Set<ObjectStatus>(["active", "draft"]);
const CURRENT_STATUSES = new Set<ObjectStatus>(["active", "draft", "open"]);
const TAG_REQUIRED_STATUSES = new Set<ObjectStatus>(["active", "draft"]);
const INACTIVE_STATUSES = new Set<ObjectStatus>([
  "stale",
  "superseded",
  "rejected"
]);
const GENERIC_TITLES = new Set([
  "context",
  "general",
  "important",
  "memory",
  "misc",
  "miscellaneous",
  "note",
  "notes",
  "placeholder",
  "tbd",
  "todo",
  "update",
  "updates",
  "wip",
  "work in progress"
]);
const VERY_SHORT_BODY_WORD_LIMIT = 8;
const OVERSIZED_BODY_WORD_LIMIT = 220;
const MINIMUM_DUPLICATE_TAG_COUNT = 3;
const SEVERITY_ORDER = new Map<AuditSeverity, number>([
  ["warning", 0],
  ["info", 1]
]);
const FILE_REFERENCE_PATTERN =
  /(?:^|[\s([{"'`])((?:\.\/)?(?:[A-Za-z0-9_.-]+\/)+[A-Za-z0-9_.@+-]+\.[A-Za-z0-9]+)(?=$|[\s)\]}",'`:;])/gu;
const EXPLICIT_VERSION_PATTERN =
  /\b(?:package(?:\.json)?\s+)?version\s*(?:is|=|:)?\s*["'`]?([0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?)/giu;

export async function buildAuditFindings(
  options: BuildAuditFindingsOptions
): Promise<AuditFinding[]> {
  const findings: AuditFinding[] = [];

  findings.push(...vagueMemoryFindings(options.storage.objects));
  findings.push(...duplicateLikeFindings(options.storage.objects));
  findings.push(...staleOrSupersededCleanupFindings(options.storage));
  findings.push(...missingTagFindings(options.storage.objects));
  findings.push(...missingFacetFindings(options.storage));
  findings.push(...missingObjectEvidenceFindings(options.storage));
  findings.push(...taskDiaryLikeFindings(options.storage.objects));
  findings.push(...oversizedVagueMemoryFindings(options.storage.objects));
  findings.push(...duplicateFacetCategoryFindings(options.storage.objects));
  findings.push(...missingEvidenceFindings(options.storage.relations));
  findings.push(
    ...(await referencedFileMissingFindings({
      projectRoot: options.projectRoot,
      storage: options.storage
    }))
  );
  findings.push(
    ...(await manifestVersionContradictionFindings({
      projectRoot: options.projectRoot,
      objects: options.storage.objects
    }))
  );

  return findings.map(normalizeFinding).sort(compareFindings);
}

function missingFacetFindings(storage: CanonicalStorageSnapshot): AuditFinding[] {
  if (storage.config.version < 2) {
    return [];
  }

  return currentObjects(storage.objects, TAG_REQUIRED_STATUSES)
    .filter((object) => object.sidecar.facets === undefined)
    .map((object) => ({
      severity: "info",
      rule: "missing_facets",
      memory_id: object.sidecar.id,
      message: "Memory has no schema-backed facets.",
      evidence: [{ kind: "memory", id: object.sidecar.id }]
    }));
}

function missingObjectEvidenceFindings(storage: CanonicalStorageSnapshot): AuditFinding[] {
  if (storage.config.version < 2) {
    return [];
  }

  return currentObjects(storage.objects, TAG_REQUIRED_STATUSES)
    .filter((object) => ["decision", "fact", "gotcha"].includes(object.sidecar.type))
    .filter((object) => (object.sidecar.evidence ?? []).length === 0)
    .map((object) => ({
      severity: "info",
      rule: "missing_object_evidence",
      memory_id: object.sidecar.id,
      message: "Decision, fact, and gotcha memory should include object-level evidence when possible.",
      evidence: [{ kind: "memory", id: object.sidecar.id }]
    }));
}

function taskDiaryLikeFindings(objects: readonly StoredMemoryObject[]): AuditFinding[] {
  return currentObjects(objects, TAG_REQUIRED_STATUSES)
    .filter((object) => isTaskDiaryLike(`${object.sidecar.title}\n${object.body}`))
    .map((object) => ({
      severity: "warning",
      rule: "task_diary_like_memory",
      memory_id: object.sidecar.id,
      message: "Memory looks like a task diary instead of durable project knowledge.",
      evidence: [{ kind: "memory", id: object.sidecar.id }]
    }));
}

function oversizedVagueMemoryFindings(objects: readonly StoredMemoryObject[]): AuditFinding[] {
  return currentObjects(objects, TAG_REQUIRED_STATUSES)
    .filter((object) => wordCount(object.body) > OVERSIZED_BODY_WORD_LIMIT)
    .filter((object) => object.sidecar.facets === undefined || isGenericTitle(object.sidecar.title))
    .map((object) => ({
      severity: "info",
      rule: "oversized_vague_memory",
      memory_id: object.sidecar.id,
      message: "Memory is large and weakly categorized; split or facet it for reliable retrieval.",
      evidence: [{ kind: "memory", id: object.sidecar.id }]
    }));
}

function duplicateFacetCategoryFindings(objects: readonly StoredMemoryObject[]): AuditFinding[] {
  const duplicateEvidence = new Map<ObjectId, Evidence[]>();
  const candidates = currentObjects(objects, CURRENT_STATUSES).filter(
    (object) => object.sidecar.facets !== undefined
  );

  recordDuplicateGroups(
    duplicateEvidence,
    groupObjects(candidates, facetCategoryKey)
  );

  return [...duplicateEvidence.entries()].map(([memoryId, evidence]) => ({
    severity: "info",
    rule: "duplicate_like_facet_category",
    memory_id: memoryId,
    message: "Memory shares a facet category and applicability hints with another current memory entry.",
    evidence
  }));
}

function vagueMemoryFindings(objects: readonly StoredMemoryObject[]): AuditFinding[] {
  return currentObjects(objects, VAGUE_STATUSES)
    .filter((object) => isGenericTitle(object.sidecar.title) || isVeryShortBody(object.body))
    .map((object) => ({
      severity: "info",
      rule: "vague_memory",
      memory_id: object.sidecar.id,
      message: "Memory is too vague for reliable future use.",
      evidence: [{ kind: "memory", id: object.sidecar.id }]
    }));
}

function duplicateLikeFindings(objects: readonly StoredMemoryObject[]): AuditFinding[] {
  const duplicateEvidence = new Map<ObjectId, Evidence[]>();
  const candidates = currentObjects(objects, CURRENT_STATUSES);

  recordDuplicateGroups(
    duplicateEvidence,
    groupObjects(candidates, (object) => normalizeComparableText(object.sidecar.title))
  );
  recordDuplicateGroups(
    duplicateEvidence,
    groupObjects(candidates, duplicateTagKey)
  );

  return [...duplicateEvidence.entries()].map(([memoryId, evidence]) => ({
    severity: "warning",
    rule: "duplicate_like_title_or_tags",
    memory_id: memoryId,
    message: "Memory is duplicate-like with another current memory entry.",
    evidence
  }));
}

function staleOrSupersededCleanupFindings(
  storage: CanonicalStorageSnapshot
): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const activeRelations = storage.relations.filter(
    (relation) => relation.relation.status === "active"
  );

  for (const object of [...storage.objects].sort(compareObjectsById)) {
    if (!INACTIVE_STATUSES.has(object.sidecar.status)) {
      continue;
    }

    const activeNonSupersedesRelations = activeRelations
      .filter(
        (relation) =>
          relation.relation.predicate !== "supersedes" &&
          (relation.relation.from === object.sidecar.id ||
            relation.relation.to === object.sidecar.id)
      )
      .sort(compareRelationsById);

    if (activeNonSupersedesRelations.length > 0) {
      findings.push({
        severity: "warning",
        rule: "stale_or_superseded_cleanup",
        memory_id: object.sidecar.id,
        message: "Inactive memory is still linked by active non-supersedes relations.",
        evidence: activeNonSupersedesRelations.map((relation) => ({
          kind: "relation",
          id: relation.relation.id
        }))
      });
    }

    if (
      object.sidecar.status === "superseded" &&
      object.sidecar.superseded_by == null &&
      !hasActiveSupersedesRelation(activeRelations, object.sidecar.id)
    ) {
      findings.push({
        severity: "warning",
        rule: "stale_or_superseded_cleanup",
        memory_id: object.sidecar.id,
        message: "Superseded memory does not identify replacement memory.",
        evidence: [{ kind: "memory", id: object.sidecar.id }]
      });
    }
  }

  return findings;
}

function missingTagFindings(objects: readonly StoredMemoryObject[]): AuditFinding[] {
  return currentObjects(objects, TAG_REQUIRED_STATUSES)
    .filter(
      (object) =>
        object.sidecar.type !== "project" &&
        object.sidecar.type !== "question" &&
        (object.sidecar.tags ?? []).length === 0
    )
    .map((object) => ({
      severity: "info",
      rule: "missing_tags",
      memory_id: object.sidecar.id,
      message: "Memory has no tags.",
      evidence: [{ kind: "memory", id: object.sidecar.id }]
    }));
}

function missingEvidenceFindings(
  relations: readonly StoredMemoryRelation[]
): AuditFinding[] {
  return [...relations]
    .sort(compareRelationsById)
    .filter(
      (relation) =>
        relation.relation.status === "active" &&
        relation.relation.confidence === "high" &&
        (relation.relation.evidence ?? []).length === 0
    )
    .map((relation) => ({
      severity: "warning",
      rule: "missing_evidence",
      memory_id: relation.relation.from,
      message: "High-confidence relation is missing evidence.",
      evidence: [{ kind: "relation", id: relation.relation.id }]
    }));
}

async function referencedFileMissingFindings(options: {
  projectRoot: string;
  storage: CanonicalStorageSnapshot;
}): Promise<AuditFinding[]> {
  const findings: AuditFinding[] = [];
  const missingBodyPaths = await missingBodyReferenceEvidence(
    options.projectRoot,
    options.storage.objects
  );

  for (const [memoryId, evidence] of [...missingBodyPaths.entries()].sort(compareEntriesByKey)) {
    findings.push({
      severity: "warning",
      rule: "referenced_file_missing",
      memory_id: memoryId,
      message: "Memory references a file that does not exist.",
      evidence
    });
  }

  for (const relation of [...options.storage.relations].sort(compareRelationsById)) {
    const missingEvidence = await missingRelationFileEvidence(
      options.projectRoot,
      relation
    );

    if (missingEvidence.length === 0) {
      continue;
    }

    findings.push({
      severity: "warning",
      rule: "referenced_file_missing",
      memory_id: relation.relation.from,
      message: "Relation references file evidence that does not exist.",
      evidence: [{ kind: "relation", id: relation.relation.id }, ...missingEvidence]
    });
  }

  return findings;
}

async function manifestVersionContradictionFindings(options: {
  projectRoot: string;
  objects: readonly StoredMemoryObject[];
}): Promise<AuditFinding[]> {
  const packageVersion = await readPackageJsonVersion(options.projectRoot);

  if (packageVersion === null) {
    return [];
  }

  return currentObjects(options.objects, TAG_REQUIRED_STATUSES)
    .filter((object) =>
      statedVersions(`${object.sidecar.title}\n${object.body}`).some(
        (version) => version !== packageVersion
      )
    )
    .map((object) => ({
      severity: "warning",
      rule: "manifest_version_contradiction",
      memory_id: object.sidecar.id,
      message: "Memory states a package version that contradicts package.json.",
      evidence: [
        { kind: "file", id: "package.json" },
        { kind: "memory", id: object.sidecar.id }
      ]
    }));
}

function currentObjects(
  objects: readonly StoredMemoryObject[],
  statuses: ReadonlySet<ObjectStatus>
): StoredMemoryObject[] {
  return [...objects]
    .filter((object) => statuses.has(object.sidecar.status))
    .sort(compareObjectsById);
}

function isGenericTitle(title: string): boolean {
  return GENERIC_TITLES.has(normalizeComparableText(title));
}

function isVeryShortBody(body: string): boolean {
  return wordCount(stripMarkdownNoise(body)) < VERY_SHORT_BODY_WORD_LIMIT;
}

function stripMarkdownNoise(body: string): string {
  return body
    .replace(/^```[\s\S]*?```$/gmu, " ")
    .replace(/^#{1,6}\s+.+$/gmu, " ")
    .replace(/[`*_>#-]/gu, " ");
}

function wordCount(text: string): number {
  return text.split(/[^A-Za-z0-9]+/u).filter((word) => word.length > 0).length;
}

function isTaskDiaryLike(text: string): boolean {
  return /\b(i|we|agent)\s+(changed|updated|modified|fixed|implemented|ran)\b/i.test(text) ||
    /\b(tests?|typecheck|build)\s+passed\b/i.test(text) ||
    /\bchanged\s+\d+\s+files?\b/i.test(text);
}

function groupObjects(
  objects: readonly StoredMemoryObject[],
  keyForObject: (object: StoredMemoryObject) => string | null
): Map<string, StoredMemoryObject[]> {
  const groups = new Map<string, StoredMemoryObject[]>();

  for (const object of objects) {
    const key = keyForObject(object);

    if (key === null || key === "") {
      continue;
    }

    groups.set(key, [...(groups.get(key) ?? []), object]);
  }

  return groups;
}

function duplicateTagKey(object: StoredMemoryObject): string | null {
  const tags = [...(object.sidecar.tags ?? [])].sort();

  if (tags.length < MINIMUM_DUPLICATE_TAG_COUNT) {
    return null;
  }

  return `${object.sidecar.type}:${tags.join(",")}`;
}

function facetCategoryKey(object: StoredMemoryObject): string | null {
  const facets = object.sidecar.facets;

  if (facets === undefined) {
    return null;
  }

  const appliesTo = [...(facets.applies_to ?? [])].sort().join(",");

  if (appliesTo === "") {
    return null;
  }

  return `${facets.category}:${appliesTo}`;
}

function recordDuplicateGroups(
  evidenceById: Map<ObjectId, Evidence[]>,
  groups: Map<string, StoredMemoryObject[]>
): void {
  for (const group of groups.values()) {
    if (group.length < 2) {
      continue;
    }

    const sortedGroup = [...group].sort(compareObjectsById);

    for (const object of sortedGroup) {
      const existing = evidenceById.get(object.sidecar.id) ?? [];
      const otherObjects = sortedGroup
        .filter((other) => other.sidecar.id !== object.sidecar.id)
        .map((other) => ({ kind: "memory", id: other.sidecar.id }) satisfies Evidence);

      evidenceById.set(object.sidecar.id, [...existing, ...otherObjects]);
    }
  }
}

function hasActiveSupersedesRelation(
  activeRelations: readonly StoredMemoryRelation[],
  supersededId: ObjectId
): boolean {
  return activeRelations.some(
    (relation) =>
      relation.relation.predicate === "supersedes" && relation.relation.to === supersededId
  );
}

async function missingBodyReferenceEvidence(
  projectRoot: string,
  objects: readonly StoredMemoryObject[]
): Promise<Map<ObjectId, Evidence[]>> {
  const evidenceById = new Map<ObjectId, Evidence[]>();

  for (const object of [...objects].sort(compareObjectsById)) {
    const missingPaths = await missingProjectFilePaths(
      projectRoot,
      extractProjectFileReferences(object.body)
    );

    if (missingPaths.length > 0) {
      evidenceById.set(
        object.sidecar.id,
        missingPaths.map((path) => ({ kind: "file", id: path }))
      );
    }
  }

  return evidenceById;
}

async function missingRelationFileEvidence(
  projectRoot: string,
  relation: StoredMemoryRelation
): Promise<Evidence[]> {
  const fileEvidence = (relation.relation.evidence ?? [])
    .filter((item) => item.kind === "file")
    .map((item) => item.id);
  const missingPaths = await missingProjectFilePaths(projectRoot, fileEvidence);

  return missingPaths.map((path) => ({ kind: "file", id: path }));
}

function extractProjectFileReferences(body: string): string[] {
  return uniqueSorted(
    [...body.matchAll(FILE_REFERENCE_PATTERN)]
      .map((match) => match[1] ?? "")
      .map(normalizeProjectFileReference)
      .filter((path): path is string => path !== null)
  );
}

async function missingProjectFilePaths(
  projectRoot: string,
  rawPaths: readonly string[]
): Promise<string[]> {
  const paths = uniqueSorted(
    rawPaths
      .map(normalizeProjectFileReference)
      .filter((path): path is string => path !== null)
  );
  const missing: string[] = [];

  for (const path of paths) {
    if (!(await projectFileExists(projectRoot, path))) {
      missing.push(path);
    }
  }

  return missing;
}

function normalizeProjectFileReference(value: string): string | null {
  const normalized = value.trim().replace(/\\/gu, "/").replace(/^\.\//u, "");

  if (
    normalized === "" ||
    normalized.startsWith("/") ||
    normalized.startsWith("../") ||
    normalized.includes("/../") ||
    normalized.includes("://") ||
    normalized.startsWith(".aictx/")
  ) {
    return null;
  }

  return normalized;
}

async function projectFileExists(projectRoot: string, path: string): Promise<boolean> {
  const resolved = resolveInsideRoot(projectRoot, path);

  if (!resolved.ok) {
    return false;
  }

  try {
    const stats = await lstat(resolved.data);

    return stats.isFile();
  } catch {
    return false;
  }
}

async function readPackageJsonVersion(projectRoot: string): Promise<string | null> {
  const packageJsonPath = join(projectRoot, "package.json");

  try {
    await access(packageJsonPath, constants.R_OK);
    const parsed = JSON.parse(await readFile(packageJsonPath, "utf8")) as unknown;

    return isRecord(parsed) && typeof parsed.version === "string" ? parsed.version : null;
  } catch {
    return null;
  }
}

function statedVersions(text: string): string[] {
  return uniqueSorted(
    [...text.matchAll(EXPLICIT_VERSION_PATTERN)]
      .map((match) => match[1] ?? "")
      .filter((version) => version.length > 0)
  );
}

function normalizeFinding(finding: AuditFinding): AuditFinding {
  return {
    ...finding,
    evidence: uniqueEvidence(finding.evidence)
  };
}

function uniqueEvidence(evidence: readonly Evidence[]): Evidence[] {
  const byKey = new Map<string, Evidence>();

  for (const item of evidence) {
    byKey.set(evidenceKey(item), item);
  }

  return [...byKey.values()].sort(compareEvidence);
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function normalizeComparableText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, " ")
    .trim()
    .replace(/\s+/gu, " ");
}

function compareFindings(left: AuditFinding, right: AuditFinding): number {
  return (
    severityOrder(left.severity) - severityOrder(right.severity) ||
    left.rule.localeCompare(right.rule) ||
    left.memory_id.localeCompare(right.memory_id) ||
    firstEvidenceKey(left).localeCompare(firstEvidenceKey(right)) ||
    left.message.localeCompare(right.message)
  );
}

function firstEvidenceKey(finding: AuditFinding): string {
  return finding.evidence.map(evidenceKey).join("|");
}

function severityOrder(severity: AuditSeverity): number {
  return SEVERITY_ORDER.get(severity) ?? Number.MAX_SAFE_INTEGER;
}

function compareObjectsById(
  left: StoredMemoryObject,
  right: StoredMemoryObject
): number {
  return left.sidecar.id.localeCompare(right.sidecar.id);
}

function compareRelationsById(
  left: StoredMemoryRelation,
  right: StoredMemoryRelation
): number {
  return left.relation.id.localeCompare(right.relation.id);
}

function compareEvidence(left: Evidence, right: Evidence): number {
  return evidenceKey(left).localeCompare(evidenceKey(right));
}

function evidenceKey(evidence: Evidence): string {
  return `${evidence.kind}:${evidence.id}`;
}

function compareEntriesByKey<T>(left: [string, T], right: [string, T]): number {
  return left[0].localeCompare(right[0]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
