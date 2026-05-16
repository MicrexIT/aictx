import { memoryError, type JsonValue } from "../core/errors.js";
import { slugify } from "../core/ids.js";
import { err, ok, type Result } from "../core/result.js";
import type {
  Evidence,
  ObjectFacets,
  ObjectId,
  PatchOperation,
  Scope,
  Source
} from "../core/types.js";
import type { RememberMemoryInput } from "../remember/types.js";
import type { RememberMemoryPatch } from "../remember/plan.js";
import type { CanonicalStorageSnapshot } from "../storage/read.js";

export interface BranchHandoffInput {
  goal: string;
  current_state: string[];
  touched_files: string[];
  temporary_assumptions: string[];
  open_questions: string[];
  verification: string[];
  next_action: string;
}

export interface BranchHandoffCloseInput {
  reason: string;
  promote: BranchHandoffPromotionInput;
}

export type BranchHandoffPromotionInput = Omit<RememberMemoryInput, "task">;

export interface BranchHandoffPatch {
  source: Source;
  changes: BranchHandoffPatchChange[];
}

type BranchHandoffPatchChange =
  | BranchHandoffCreateObjectChange
  | BranchHandoffUpdateObjectChange
  | BranchHandoffMarkStaleChange
  | RememberMemoryPatch["changes"][number];

interface BranchHandoffCreateObjectChange {
  op: "create_object";
  id: ObjectId;
  type: "synthesis";
  status: "active";
  title: string;
  body: string;
  scope: Scope;
  tags: string[];
  facets: ObjectFacets;
  evidence: Evidence[];
}

interface BranchHandoffUpdateObjectChange {
  op: "update_object";
  id: ObjectId;
  status: "active";
  title: string;
  body: string;
  scope: Scope;
  tags: string[];
  facets: ObjectFacets;
  evidence: Evidence[];
}

interface BranchHandoffMarkStaleChange {
  op: "mark_stale";
  id: ObjectId;
  reason: string;
}

export function branchHandoffId(branch: string): ObjectId {
  return `synthesis.branch-handoff-${slugify(branch, { fallback: "branch" })}` as ObjectId;
}

export function parseBranchHandoffInput(input: unknown): Result<BranchHandoffInput> {
  if (!isRecord(input)) {
    return invalidHandoffInput("Handoff update input must be a JSON object.", "input");
  }

  const goal = readRequiredString(input, "goal");
  const nextAction = readRequiredString(input, "next_action");

  if (!goal.ok) {
    return goal;
  }

  if (!nextAction.ok) {
    return nextAction;
  }

  return ok({
    goal: goal.data,
    current_state: readStringArray(input, "current_state"),
    touched_files: uniqueSorted(readStringArray(input, "touched_files")),
    temporary_assumptions: readStringArray(input, "temporary_assumptions"),
    open_questions: readStringArray(input, "open_questions"),
    verification: readStringArray(input, "verification"),
    next_action: nextAction.data
  });
}

export function parseBranchHandoffCloseInput(input: unknown): Result<BranchHandoffCloseInput> {
  if (!isRecord(input)) {
    return invalidHandoffInput("Handoff close input must be a JSON object.", "input");
  }

  const reason = readRequiredString(input, "reason");

  if (!reason.ok) {
    return reason;
  }

  const promote = input.promote;

  if (promote !== undefined && !isRecord(promote)) {
    return invalidHandoffInput("Handoff close promote must be a JSON object when provided.", "promote");
  }

  return ok({
    reason: reason.data,
    promote: normalizePromotion(promote)
  });
}

export function hasBranchHandoffPromotions(input: BranchHandoffCloseInput): boolean {
  return (
    (input.promote.memories?.length ?? 0) > 0 ||
    (input.promote.updates?.length ?? 0) > 0 ||
    (input.promote.relations?.length ?? 0) > 0 ||
    (input.promote.stale?.length ?? 0) > 0 ||
    (input.promote.supersede?.length ?? 0) > 0
  );
}

export function buildBranchHandoffUpdatePatch(options: {
  input: BranchHandoffInput;
  storage: CanonicalStorageSnapshot;
  branch: string;
}): BranchHandoffPatch {
  const id = branchHandoffId(options.branch);
  const existing = options.storage.objects.some((object) => object.sidecar.id === id);
  const body = renderBranchHandoffBody(options.input, options.branch);
  const scope = branchScope(options.storage, options.branch);
  const facets = handoffFacets(options.input.touched_files);
  const evidence = handoffEvidence(options.input.touched_files);
  const change = existing
    ? {
        op: "update_object" as const,
        id,
        status: "active" as const,
        title: branchHandoffTitle(options.branch),
        body,
        scope,
        tags: handoffTags(options.branch),
        facets,
        evidence
      }
    : {
        op: "create_object" as const,
        id,
        type: "synthesis" as const,
        status: "active" as const,
        title: branchHandoffTitle(options.branch),
        body,
        scope,
        tags: handoffTags(options.branch),
        facets,
        evidence
      };

  return {
    source: {
      kind: "agent",
      task: `Update branch handoff for ${options.branch}`
    },
    changes: [change]
  };
}

export function buildBranchHandoffClosePatch(options: {
  close: BranchHandoffCloseInput;
  branch: string;
  promotePatch: RememberMemoryPatch | null;
}): BranchHandoffPatch {
  return {
    source: {
      kind: "agent",
      task: options.close.reason
    },
    changes: [
      ...(options.promotePatch?.changes ?? []),
      {
        op: "mark_stale",
        id: branchHandoffId(options.branch),
        reason: options.close.reason
      }
    ]
  };
}

export function promotionRememberInput(
  close: BranchHandoffCloseInput
): RememberMemoryInput {
  return {
    task: close.reason,
    ...close.promote
  };
}

function renderBranchHandoffBody(input: BranchHandoffInput, branch: string): string {
  return [
    `# Branch handoff: ${branch}`,
    "",
    "## Goal",
    "",
    input.goal,
    "",
    ...renderList("Current state", input.current_state),
    ...renderList("Touched files", input.touched_files.map((path) => `\`${path}\``)),
    ...renderList("Temporary assumptions", input.temporary_assumptions),
    ...renderList("Open questions", input.open_questions),
    ...renderList("Verification", input.verification),
    "## Next action",
    "",
    input.next_action,
    ""
  ].join("\n");
}

function renderList(title: string, values: readonly string[]): string[] {
  if (values.length === 0) {
    return [];
  }

  return [`## ${title}`, "", ...values.map((value) => `- ${value}`), ""];
}

function branchHandoffTitle(branch: string): string {
  return `Branch handoff: ${branch}`;
}

function branchScope(storage: CanonicalStorageSnapshot, branch: string): Scope {
  return {
    kind: "branch",
    project: storage.config.project.id,
    branch,
    task: null
  };
}

function handoffTags(branch: string): string[] {
  return uniqueSorted(["branch-handoff", "handoff", slugify(branch, { fallback: "branch" })]);
}

function handoffFacets(touchedFiles: readonly string[]): ObjectFacets {
  return {
    category: "roadmap",
    ...(touchedFiles.length === 0 ? {} : { applies_to: [...touchedFiles] }),
    load_modes: ["coding", "debugging", "review"]
  };
}

function handoffEvidence(touchedFiles: readonly string[]): Evidence[] {
  return touchedFiles.map((path) => ({ kind: "file", id: path }));
}

function normalizePromotion(input: Record<string, unknown> | undefined): BranchHandoffPromotionInput {
  if (input === undefined) {
    return {};
  }

  const promotion: BranchHandoffPromotionInput = {};

  if (Array.isArray(input.memories)) {
    promotion.memories = input.memories as NonNullable<BranchHandoffPromotionInput["memories"]>;
  }

  if (Array.isArray(input.updates)) {
    promotion.updates = input.updates as NonNullable<BranchHandoffPromotionInput["updates"]>;
  }

  if (Array.isArray(input.relations)) {
    promotion.relations = input.relations as NonNullable<BranchHandoffPromotionInput["relations"]>;
  }

  if (Array.isArray(input.stale)) {
    promotion.stale = input.stale as NonNullable<BranchHandoffPromotionInput["stale"]>;
  }

  if (Array.isArray(input.supersede)) {
    promotion.supersede = input.supersede as NonNullable<BranchHandoffPromotionInput["supersede"]>;
  }

  return promotion;
}

function readRequiredString(
  input: Record<string, unknown>,
  field: keyof BranchHandoffInput | keyof BranchHandoffCloseInput
): Result<string> {
  const value = input[field];

  if (typeof value !== "string" || value.trim() === "") {
    return invalidHandoffInput(`${String(field)} must be a non-empty string.`, String(field));
  }

  return ok(value.trim());
}

function readStringArray(input: Record<string, unknown>, field: keyof BranchHandoffInput): string[] {
  const value = input[field];

  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string" && item.trim() !== "").map((item) => item.trim());
}

function invalidHandoffInput(message: string, field: string): Result<never> {
  return err(
    memoryError("MemoryValidationFailed", message, {
      field
    } satisfies JsonValue)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function uniqueSorted<T extends string>(values: readonly T[]): T[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}
