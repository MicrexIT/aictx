import type {
  GitState,
  Evidence,
  ObjectFacets,
  ObjectId,
  ObjectStatus,
  ObjectType,
  Predicate,
  Scope
} from "../core/types.js";
import type { MemoryRelation } from "../storage/relations.js";
import { DEFAULT_LOAD_MODE, type LoadMemoryMode } from "./modes.js";
import {
  hintSearchText,
  type NormalizedRetrievalHints
} from "../retrieval/hints.js";

const SCORE = {
  exactId: 100,
  exactBodyPath: 80,
  tagMatch: 40,
  appliesToMatch: 35,
  facetMatch: 25,
  titleFtsMatch: 30,
  bodyFtsMatch: 15,
  evidenceMatch: 18,
  oneHopRelation: 12,
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

const PREDICATE_MODIFIERS = {
  requires: 12,
  depends_on: 10,
  conflicts_with: 10,
  derived_from: 8,
  summarizes: 8,
  supersedes: 8,
  affects: 8,
  documents: 6,
  implements: 6,
  mentions: 4,
  related_to: 1
} as const satisfies Record<Predicate, number>;

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

const MODE_TYPE_MODIFIERS = {
  coding: {
    constraint: 4,
    decision: 3,
    synthesis: 3,
    architecture: 2,
    gotcha: 2,
    workflow: 1,
    question: 1,
    fact: 1,
    source: 1,
    project: 0,
    concept: 0,
    note: 0
  },
  debugging: {
    gotcha: 18,
    constraint: 10,
    fact: 8,
    synthesis: 4,
    decision: 6,
    architecture: 0,
    workflow: 0,
    question: 0,
    source: 0,
    project: 0,
    concept: 0,
    note: 0
  },
  review: {
    constraint: 16,
    decision: 14,
    synthesis: 8,
    gotcha: 12,
    architecture: 0,
    workflow: 0,
    question: 0,
    fact: 0,
    source: 0,
    project: 0,
    concept: 0,
    note: 0
  },
  architecture: {
    architecture: 20,
    synthesis: 18,
    decision: 14,
    constraint: 10,
    concept: 10,
    question: 6,
    project: 4,
    gotcha: 0,
    workflow: 0,
    fact: 0,
    source: 0,
    note: 0
  },
  onboarding: {
    synthesis: 22,
    project: 20,
    architecture: 16,
    source: 12,
    concept: 14,
    workflow: 12,
    constraint: 6,
    decision: 0,
    gotcha: 0,
    question: 0,
    fact: 0,
    note: 0
  }
} as const satisfies Record<LoadMemoryMode, Record<ObjectType, number>>;

const MODE_STATUS_MODIFIERS = {
  coding: 0,
  debugging: 25,
  review: 20,
  architecture: 0,
  onboarding: 0
} as const satisfies Record<LoadMemoryMode, number>;

const REVIEW_FILE_REFERENCE_BOOST = 25;
const FACET_LOAD_MODE_BOOST = 10;

const MODE_TYPE_PRIORITIES = {
  coding: TYPE_PRIORITY,
  debugging: priorityMap([
    "gotcha",
    "constraint",
    "fact",
    "synthesis",
    "decision",
    "architecture",
    "workflow",
    "question",
    "concept",
    "project",
    "source",
    "note"
  ]),
  review: priorityMap([
    "constraint",
    "decision",
    "synthesis",
    "gotcha",
    "architecture",
    "workflow",
    "question",
    "fact",
    "concept",
    "project",
    "source",
    "note"
  ]),
  architecture: priorityMap([
    "architecture",
    "synthesis",
    "decision",
    "constraint",
    "concept",
    "question",
    "project",
    "source",
    "workflow",
    "gotcha",
    "fact",
    "note"
  ]),
  onboarding: priorityMap([
    "synthesis",
    "project",
    "architecture",
    "concept",
    "source",
    "workflow",
    "constraint",
    "decision",
    "gotcha",
    "question",
    "fact",
    "note"
  ])
} as const satisfies Record<LoadMemoryMode, Record<ObjectType, number>>;

const TASK_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "in",
  "into",
  "is",
  "it",
  "of",
  "on",
  "or",
  "the",
  "to",
  "with",
  "add",
  "fix",
  "implement",
  "plan",
  "roadmap",
  "task",
  "update"
]);

export interface RankMemoryCandidate {
  id: ObjectId;
  type: ObjectType;
  status: ObjectStatus;
  title: string;
  body_path: string;
  body: string;
  scope: Scope;
  tags?: string[];
  facets?: ObjectFacets;
  evidence?: Evidence[];
  updated_at: string;
}

export interface RankMemoryCandidatesInput {
  task: string;
  hints?: NormalizedRetrievalHints;
  mode?: LoadMemoryMode;
  projectId: string;
  git: GitState;
  candidates: readonly RankMemoryCandidate[];
  relations?: readonly MemoryRelation[];
  conflictedIds?: readonly ObjectId[];
}

export interface RankScoreBreakdown {
  exactId: number;
  exactBodyPath: number;
  tagMatch: number;
  titleFtsMatch: number;
  bodyFtsMatch: number;
  facetMatch: number;
  appliesToMatch: number;
  evidenceMatch: number;
  relationNeighborhood: number;
  relationPredicate: number;
  recentMemoryBoost: number;
  typeModifier: number;
  statusModifier: number;
  modeModifier: number;
}

export interface RankedMemoryItem {
  id: ObjectId;
  type: ObjectType;
  status: ObjectStatus;
  title: string;
  body_path: string;
  scope: Scope;
  tags: readonly string[];
  updated_at: string;
  score: number;
  scoreBreakdown: RankScoreBreakdown;
  matched: boolean;
  conflicted: boolean;
  candidate: RankMemoryCandidate;
}

export type RankExclusionReason =
  | "scope_project_mismatch"
  | "scope_branch_unavailable"
  | "scope_branch_mismatch"
  | "scope_task_weak_match"
  | "conflicted_high_priority";

export interface RankExcludedCandidate {
  id: ObjectId;
  reason: RankExclusionReason;
  candidate: RankMemoryCandidate;
}

export interface RankedMemoryCandidates {
  items: RankedMemoryItem[];
  mustKnow: RankedMemoryItem[];
  staleOrSuperseded: RankedMemoryItem[];
  excluded: RankExcludedCandidate[];
}

interface RankableCandidate {
  candidate: RankMemoryCandidate;
  directScores: DirectScoreBreakdown;
}

interface DirectScoreBreakdown {
  exactId: number;
  exactBodyPath: number;
  tagMatch: number;
  titleFtsMatch: number;
  bodyFtsMatch: number;
  facetMatch: number;
  appliesToMatch: number;
  evidenceMatch: number;
}

interface RelationScoreBreakdown {
  relationNeighborhood: number;
  relationPredicate: number;
}

interface ScopeMatch {
  matched: boolean;
  reason?: RankExclusionReason;
}

export function rankMemoryCandidates(
  input: RankMemoryCandidatesInput
): RankedMemoryCandidates {
  const mode = input.mode ?? DEFAULT_LOAD_MODE;
  const retrievalText = [input.task, input.hints === undefined ? "" : hintSearchText(input.hints)].join(" ");
  const normalizedTaskText = retrievalText.toLowerCase();
  const normalizedTask = normalizePhrase(retrievalText);
  const taskTerms = extractTerms(retrievalText);
  const significantTaskTerms = new Set(extractSignificantTerms(retrievalText));
  const taskFileReferences = extractFileReferences(retrievalText);
  const conflictedIds = new Set(input.conflictedIds ?? []);
  const excluded: RankExcludedCandidate[] = [];
  const rankable: RankableCandidate[] = [];

  for (const candidate of input.candidates) {
    const scope = scopeMatches(candidate.scope, {
      taskPhrase: normalizedTask,
      significantTaskTerms,
      projectId: input.projectId,
      git: input.git
    });

    if (!scope.matched) {
      excluded.push({
        id: candidate.id,
        reason: scope.reason ?? "scope_project_mismatch",
        candidate
      });
      continue;
    }

    rankable.push({
      candidate,
      directScores: scoreDirectMatches(candidate, normalizedTaskText, taskTerms, taskFileReferences)
    });
  }

  const directMatchIds = new Set(
    rankable
      .filter((entry) => directScoreTotal(entry.directScores) > 0)
      .map((entry) => entry.candidate.id)
  );
  const rankableIds = new Set(rankable.map((entry) => entry.candidate.id));
  const relationScores = scoreOneHopRelations(input.relations ?? [], directMatchIds, rankableIds);
  const recentBoostIds = newestBoostableCandidateIds(rankable);

  const items = rankable
    .map((entry) =>
      rankedItemFromCandidate({
        entry,
        relationScores: relationScores.get(entry.candidate.id),
        recentBoosted: recentBoostIds.has(entry.candidate.id),
        conflicted: conflictedIds.has(entry.candidate.id),
        mode,
        taskFileReferences
      })
    )
    .sort((left, right) => compareRankedItems(left, right, mode));

  for (const item of items) {
    if (item.conflicted) {
      excluded.push({
        id: item.id,
        reason: "conflicted_high_priority",
        candidate: item.candidate
      });
    }
  }

  return {
    items,
    mustKnow: items.filter(isMustKnowItem),
    staleOrSuperseded: items.filter(isStaleOrSupersededMatch),
    excluded: excluded.sort(compareExcludedCandidates)
  };
}

function scopeMatches(
  scope: Scope,
  input: {
    taskPhrase: string;
    significantTaskTerms: ReadonlySet<string>;
    projectId: string;
    git: GitState;
  }
): ScopeMatch {
  if (scope.project !== input.projectId) {
    return { matched: false, reason: "scope_project_mismatch" };
  }

  switch (scope.kind) {
    case "project":
      return { matched: true };

    case "branch":
      return branchMatches(scope, input.git);

    case "task":
      if (!taskScopeMatches(scope.task, input.taskPhrase, input.significantTaskTerms)) {
        return { matched: false, reason: "scope_task_weak_match" };
      }

      if (scope.branch !== null) {
        return branchMatches(scope, input.git);
      }

      return { matched: true };
  }
}

function branchMatches(scope: Scope, git: GitState): ScopeMatch {
  if (!git.available || git.branch === null) {
    return { matched: false, reason: "scope_branch_unavailable" };
  }

  if (scope.branch !== git.branch) {
    return { matched: false, reason: "scope_branch_mismatch" };
  }

  return { matched: true };
}

function taskScopeMatches(
  scopedTask: string | null,
  taskPhrase: string,
  significantTaskTerms: ReadonlySet<string>
): boolean {
  if (scopedTask === null) {
    return false;
  }

  const scopedTaskPhrase = normalizePhrase(scopedTask);

  if (containsPhrase(taskPhrase, scopedTaskPhrase)) {
    return true;
  }

  const scopedTerms = extractSignificantTerms(scopedTask);

  return (
    scopedTerms.length >= 2 &&
    scopedTerms.every((term) => significantTaskTerms.has(term))
  );
}

function scoreDirectMatches(
  candidate: RankMemoryCandidate,
  taskText: string,
  taskTerms: readonly string[],
  taskFileReferences: readonly string[]
): DirectScoreBreakdown {
  return {
    exactId: taskText.includes(candidate.id.toLowerCase()) ? SCORE.exactId : 0,
    exactBodyPath: taskText.includes(candidate.body_path.toLowerCase())
      ? SCORE.exactBodyPath
      : 0,
    tagMatch: hasTagMatch(candidate.tags ?? [], taskTerms) ? SCORE.tagMatch : 0,
    facetMatch: hasFacetMatch(candidate.facets, taskTerms) ? SCORE.facetMatch : 0,
    appliesToMatch: hasAppliesToMatch(candidate.facets, taskText, taskFileReferences)
      ? SCORE.appliesToMatch
      : 0,
    titleFtsMatch: hasTermOverlap(candidate.title, taskTerms) ? SCORE.titleFtsMatch : 0,
    bodyFtsMatch: hasTermOverlap(candidate.body, taskTerms) ? SCORE.bodyFtsMatch : 0,
    evidenceMatch: hasEvidenceMatch(candidate.evidence ?? [], taskText, taskTerms)
      ? SCORE.evidenceMatch
      : 0
  };
}

function scoreOneHopRelations(
  relations: readonly MemoryRelation[],
  directMatchIds: ReadonlySet<ObjectId>,
  rankableIds: ReadonlySet<ObjectId>
): Map<ObjectId, RelationScoreBreakdown> {
  const scores = new Map<ObjectId, RelationScoreBreakdown>();

  for (const relation of relations) {
    if (relation.status !== "active") {
      continue;
    }

    const fromMatched = directMatchIds.has(relation.from);
    const toMatched = directMatchIds.has(relation.to);

    if (fromMatched && rankableIds.has(relation.to) && relation.to !== relation.from) {
      applyRelationScore(scores, relation.to, relation.predicate);
    }

    if (toMatched && rankableIds.has(relation.from) && relation.from !== relation.to) {
      applyRelationScore(scores, relation.from, relation.predicate);
    }
  }

  return scores;
}

function applyRelationScore(
  scores: Map<ObjectId, RelationScoreBreakdown>,
  id: ObjectId,
  predicate: Predicate
): void {
  const current = scores.get(id) ?? {
    relationNeighborhood: 0,
    relationPredicate: 0
  };

  scores.set(id, {
    relationNeighborhood: SCORE.oneHopRelation,
    relationPredicate: Math.max(current.relationPredicate, PREDICATE_MODIFIERS[predicate])
  });
}

function newestBoostableCandidateIds(candidates: readonly RankableCandidate[]): Set<ObjectId> {
  return new Set(
    candidates
      .filter((entry) => shouldApplyRecentBoost(entry.candidate.status))
      .sort(compareNewestRankableCandidates)
      .slice(0, 5)
      .map((entry) => entry.candidate.id)
  );
}

function rankedItemFromCandidate(input: {
  entry: RankableCandidate;
  relationScores: RelationScoreBreakdown | undefined;
  recentBoosted: boolean;
  conflicted: boolean;
  mode: LoadMemoryMode;
  taskFileReferences: readonly string[];
}): RankedMemoryItem {
  const relationScores = input.relationScores ?? {
    relationNeighborhood: 0,
    relationPredicate: 0
  };
  const matched =
    directScoreTotal(input.entry.directScores) +
      relationScores.relationNeighborhood +
      relationScores.relationPredicate >
    0;
  const scoreBreakdown: RankScoreBreakdown = {
    ...input.entry.directScores,
    ...relationScores,
    recentMemoryBoost: input.recentBoosted ? SCORE.recentMemoryBoost : 0,
    typeModifier: TYPE_MODIFIERS[input.entry.candidate.type],
    statusModifier: STATUS_MODIFIERS[input.entry.candidate.status],
    modeModifier: modeModifier({
      candidate: input.entry.candidate,
      mode: input.mode,
      matched,
      taskFileReferences: input.taskFileReferences
    })
  };

  return {
    id: input.entry.candidate.id,
    type: input.entry.candidate.type,
    status: input.entry.candidate.status,
    title: input.entry.candidate.title,
    body_path: input.entry.candidate.body_path,
    scope: input.entry.candidate.scope,
    tags: input.entry.candidate.tags ?? [],
    updated_at: input.entry.candidate.updated_at,
    score: totalScore(scoreBreakdown),
    scoreBreakdown,
    matched,
    conflicted: input.conflicted,
    candidate: input.entry.candidate
  };
}

function directScoreTotal(scores: DirectScoreBreakdown): number {
  return (
    scores.exactId +
    scores.exactBodyPath +
    scores.tagMatch +
    scores.titleFtsMatch +
    scores.bodyFtsMatch +
    scores.facetMatch +
    scores.appliesToMatch +
    scores.evidenceMatch
  );
}

function totalScore(scores: RankScoreBreakdown): number {
  return (
    scores.exactId +
    scores.exactBodyPath +
    scores.tagMatch +
    scores.titleFtsMatch +
    scores.bodyFtsMatch +
    scores.facetMatch +
    scores.appliesToMatch +
    scores.evidenceMatch +
    scores.relationNeighborhood +
    scores.relationPredicate +
    scores.recentMemoryBoost +
    scores.typeModifier +
    scores.statusModifier +
    scores.modeModifier
  );
}

function modeModifier(input: {
  candidate: RankMemoryCandidate;
  mode: LoadMemoryMode;
  matched: boolean;
  taskFileReferences: readonly string[];
}): number {
  return (
    MODE_TYPE_MODIFIERS[input.mode][input.candidate.type] +
    facetLoadModeModifier(input.candidate.facets, input.mode) +
    staleOrSupersededModeModifier(input.candidate.status, input.mode, input.matched) +
    reviewFileReferenceModifier(input.candidate, input.mode, input.taskFileReferences)
  );
}

function facetLoadModeModifier(
  facets: ObjectFacets | undefined,
  mode: LoadMemoryMode
): number {
  return facets?.load_modes?.includes(mode) === true ? FACET_LOAD_MODE_BOOST : 0;
}

function staleOrSupersededModeModifier(
  status: ObjectStatus,
  mode: LoadMemoryMode,
  matched: boolean
): number {
  if (!matched || (status !== "stale" && status !== "superseded")) {
    return 0;
  }

  return MODE_STATUS_MODIFIERS[mode];
}

function reviewFileReferenceModifier(
  candidate: RankMemoryCandidate,
  mode: LoadMemoryMode,
  taskFileReferences: readonly string[]
): number {
  if (mode !== "review" || taskFileReferences.length === 0) {
    return 0;
  }

  const searchableText = `${candidate.body_path}\n${candidate.body}`.toLowerCase();

  return taskFileReferences.some((reference) =>
    searchableText.includes(reference.toLowerCase())
  )
    ? REVIEW_FILE_REFERENCE_BOOST
    : 0;
}

function hasTagMatch(tags: readonly string[], taskTerms: readonly string[]): boolean {
  return tags.some((tag) => hasTermOverlap(tag, taskTerms));
}

function hasFacetMatch(facets: ObjectFacets | undefined, taskTerms: readonly string[]): boolean {
  if (facets === undefined) {
    return false;
  }

  return hasTermOverlap(
    [facets.category, ...(facets.applies_to ?? []), ...(facets.load_modes ?? [])].join(" "),
    taskTerms
  );
}

function hasAppliesToMatch(
  facets: ObjectFacets | undefined,
  taskText: string,
  taskFileReferences: readonly string[]
): boolean {
  const appliesTo = facets?.applies_to ?? [];

  return appliesTo.some((path) => {
    const normalized = path.toLowerCase();
    return (
      taskText.includes(normalized) ||
      taskFileReferences.some((reference) => normalized.includes(reference.toLowerCase()))
    );
  });
}

function hasEvidenceMatch(
  evidence: readonly Evidence[],
  taskText: string,
  taskTerms: readonly string[]
): boolean {
  return evidence.some((item) => {
    const normalized = item.id.toLowerCase();
    return taskText.includes(normalized) || hasTermOverlap(normalized, taskTerms);
  });
}

function hasTermOverlap(value: string, taskTerms: readonly string[]): boolean {
  if (taskTerms.length === 0) {
    return false;
  }

  const valueTerms = new Set(extractTerms(value));

  return taskTerms.some((term) => valueTerms.has(term));
}

function isMustKnowItem(item: RankedMemoryItem): boolean {
  return !item.conflicted && (item.status === "active" || item.status === "open");
}

function isStaleOrSupersededMatch(item: RankedMemoryItem): boolean {
  return (
    (item.status === "stale" || item.status === "superseded") &&
    item.matched &&
    !isBranchHandoffItem(item)
  );
}

function shouldApplyRecentBoost(status: ObjectStatus): boolean {
  return status !== "stale" && status !== "superseded";
}

function isBranchHandoffItem(item: RankedMemoryItem): boolean {
  return (
    item.scope.kind === "branch" &&
    item.type === "synthesis" &&
    (item.id.startsWith("synthesis.branch-handoff-") ||
      item.tags.includes("branch-handoff"))
  );
}

function compareRankedItems(
  left: RankedMemoryItem,
  right: RankedMemoryItem,
  mode: LoadMemoryMode
): number {
  const scoreDifference = right.score - left.score;

  if (scoreDifference !== 0) {
    return scoreDifference;
  }

  const typePriority = MODE_TYPE_PRIORITIES[mode];
  const typeDifference = typePriority[left.type] - typePriority[right.type];

  if (typeDifference !== 0) {
    return typeDifference;
  }

  const updatedDifference = compareIsoDesc(left.updated_at, right.updated_at);

  if (updatedDifference !== 0) {
    return updatedDifference;
  }

  return left.id.localeCompare(right.id);
}

function compareNewestRankableCandidates(
  left: RankableCandidate,
  right: RankableCandidate
): number {
  const updatedDifference = compareIsoDesc(
    left.candidate.updated_at,
    right.candidate.updated_at
  );

  if (updatedDifference !== 0) {
    return updatedDifference;
  }

  return left.candidate.id.localeCompare(right.candidate.id);
}

function compareExcludedCandidates(
  left: RankExcludedCandidate,
  right: RankExcludedCandidate
): number {
  const idDifference = left.id.localeCompare(right.id);

  if (idDifference !== 0) {
    return idDifference;
  }

  return left.reason.localeCompare(right.reason);
}

function compareIsoDesc(left: string, right: string): number {
  const leftMillis = Date.parse(left);
  const rightMillis = Date.parse(right);

  if (Number.isFinite(leftMillis) && Number.isFinite(rightMillis)) {
    return rightMillis - leftMillis;
  }

  return right.localeCompare(left);
}

function containsPhrase(valuePhrase: string, targetPhrase: string): boolean {
  if (targetPhrase === "") {
    return false;
  }

  return ` ${valuePhrase} `.includes(` ${targetPhrase} `);
}

function normalizePhrase(value: string): string {
  return extractTerms(value).join(" ");
}

function extractSignificantTerms(value: string): string[] {
  return extractTerms(value).filter(
    (term) => term.length > 1 && !TASK_STOP_WORDS.has(term)
  );
}

function extractTerms(value: string): string[] {
  const terms =
    value
      .match(/[\p{L}\p{N}_]+/gu)
      ?.map((term) => term.toLowerCase())
      .filter((term) => term.length > 0) ?? [];

  return [...new Set(terms)];
}

function extractFileReferences(value: string): string[] {
  const matches =
    value.match(
      /(?:\.{1,2}\/)?(?:[A-Za-z0-9_@.-]+\/)+[A-Za-z0-9_@.-]+(?:\.[A-Za-z0-9]+)?/g
    ) ?? [];
  const paths = new Set<string>();

  for (const match of matches) {
    const path = trimPathPunctuation(match);

    if (path !== "") {
      paths.add(path);
    }
  }

  return [...paths];
}

function trimPathPunctuation(value: string): string {
  return value.replace(/[),.;:!?]+$/u, "");
}

function priorityMap(types: readonly ObjectType[]): Record<ObjectType, number> {
  return Object.fromEntries(types.map((type, index) => [type, index])) as Record<
    ObjectType,
    number
  >;
}
