import type {
  GitState,
  ObjectId,
  ObjectStatus,
  ObjectType,
  Predicate,
  Scope
} from "../core/types.js";
import type { MemoryRelation } from "../storage/relations.js";

const SCORE = {
  exactId: 100,
  exactBodyPath: 80,
  tagMatch: 40,
  titleFtsMatch: 30,
  bodyFtsMatch: 15,
  oneHopRelation: 12,
  recentMemoryBoost: 5
} as const;

const TYPE_MODIFIERS = {
  constraint: 20,
  decision: 18,
  architecture: 12,
  question: 10,
  fact: 8,
  gotcha: 0,
  workflow: 0,
  concept: 6,
  project: 8,
  note: 0
} as const satisfies Record<ObjectType, number>;

const STATUS_MODIFIERS = {
  active: 20,
  open: 12,
  draft: -5,
  stale: -30,
  superseded: -35,
  rejected: 0,
  closed: 0
} as const satisfies Record<ObjectStatus, number>;

const PREDICATE_MODIFIERS = {
  requires: 12,
  depends_on: 10,
  conflicts_with: 10,
  supersedes: 8,
  affects: 8,
  implements: 6,
  mentions: 4,
  related_to: 1
} as const satisfies Record<Predicate, number>;

const TYPE_PRIORITY = {
  constraint: 0,
  decision: 1,
  architecture: 2,
  question: 3,
  fact: 4,
  concept: 5,
  project: 6,
  note: 7,
  gotcha: 8,
  workflow: 9
} as const satisfies Record<ObjectType, number>;

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
  updated_at: string;
}

export interface RankMemoryCandidatesInput {
  task: string;
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
  relationNeighborhood: number;
  relationPredicate: number;
  recentMemoryBoost: number;
  typeModifier: number;
  statusModifier: number;
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
  | "rejected"
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
  const normalizedTaskText = input.task.toLowerCase();
  const normalizedTask = normalizePhrase(input.task);
  const taskTerms = extractTerms(input.task);
  const significantTaskTerms = new Set(extractSignificantTerms(input.task));
  const conflictedIds = new Set(input.conflictedIds ?? []);
  const excluded: RankExcludedCandidate[] = [];
  const rankable: RankableCandidate[] = [];

  for (const candidate of input.candidates) {
    if (candidate.status === "rejected") {
      excluded.push({ id: candidate.id, reason: "rejected", candidate });
      continue;
    }

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
      directScores: scoreDirectMatches(candidate, normalizedTaskText, taskTerms)
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
        conflicted: conflictedIds.has(entry.candidate.id)
      })
    )
    .sort(compareRankedItems);

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
  taskTerms: readonly string[]
): DirectScoreBreakdown {
  return {
    exactId: taskText.includes(candidate.id.toLowerCase()) ? SCORE.exactId : 0,
    exactBodyPath: taskText.includes(candidate.body_path.toLowerCase())
      ? SCORE.exactBodyPath
      : 0,
    tagMatch: hasTagMatch(candidate.tags ?? [], taskTerms) ? SCORE.tagMatch : 0,
    titleFtsMatch: hasTermOverlap(candidate.title, taskTerms) ? SCORE.titleFtsMatch : 0,
    bodyFtsMatch: hasTermOverlap(candidate.body, taskTerms) ? SCORE.bodyFtsMatch : 0
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
}): RankedMemoryItem {
  const relationScores = input.relationScores ?? {
    relationNeighborhood: 0,
    relationPredicate: 0
  };
  const scoreBreakdown: RankScoreBreakdown = {
    ...input.entry.directScores,
    ...relationScores,
    recentMemoryBoost: input.recentBoosted ? SCORE.recentMemoryBoost : 0,
    typeModifier: TYPE_MODIFIERS[input.entry.candidate.type],
    statusModifier: STATUS_MODIFIERS[input.entry.candidate.status]
  };
  const matched =
    directScoreTotal(input.entry.directScores) +
      relationScores.relationNeighborhood +
      relationScores.relationPredicate >
    0;

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
    scores.bodyFtsMatch
  );
}

function totalScore(scores: RankScoreBreakdown): number {
  return (
    scores.exactId +
    scores.exactBodyPath +
    scores.tagMatch +
    scores.titleFtsMatch +
    scores.bodyFtsMatch +
    scores.relationNeighborhood +
    scores.relationPredicate +
    scores.recentMemoryBoost +
    scores.typeModifier +
    scores.statusModifier
  );
}

function hasTagMatch(tags: readonly string[], taskTerms: readonly string[]): boolean {
  return tags.some((tag) => hasTermOverlap(tag, taskTerms));
}

function hasTermOverlap(value: string, taskTerms: readonly string[]): boolean {
  if (taskTerms.length === 0) {
    return false;
  }

  const valueTerms = new Set(extractTerms(value));

  return taskTerms.some((term) => valueTerms.has(term));
}

function isMustKnowItem(item: RankedMemoryItem): boolean {
  return (
    !item.conflicted &&
    (item.status === "active" || item.status === "open" || item.status === "draft")
  );
}

function isStaleOrSupersededMatch(item: RankedMemoryItem): boolean {
  return (item.status === "stale" || item.status === "superseded") && item.matched;
}

function shouldApplyRecentBoost(status: ObjectStatus): boolean {
  return status !== "stale" && status !== "superseded" && status !== "rejected";
}

function compareRankedItems(left: RankedMemoryItem, right: RankedMemoryItem): number {
  const scoreDifference = right.score - left.score;

  if (scoreDifference !== 0) {
    return scoreDifference;
  }

  const typeDifference = TYPE_PRIORITY[left.type] - TYPE_PRIORITY[right.type];

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
