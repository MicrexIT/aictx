import type { JsonValue } from "./errors.js";

export type ObjectId = string;
export type RelationId = string;
export type ProjectId = string;
export type RelativePath = string;
export type IsoDateTime = string;
export type Sha256Hash = string;

export const OBJECT_TYPES = [
  "project",
  "architecture",
  "source",
  "synthesis",
  "decision",
  "constraint",
  "question",
  "fact",
  "gotcha",
  "workflow",
  "note",
  "concept"
] as const;

export type ObjectType = (typeof OBJECT_TYPES)[number];

export const FACET_CATEGORIES = [
  "project-description",
  "architecture",
  "stack",
  "convention",
  "file-layout",
  "product-feature",
  "testing",
  "decision-rationale",
  "abandoned-attempt",
  "workflow",
  "gotcha",
  "debugging-fact",
  "source",
  "product-intent",
  "feature-map",
  "roadmap",
  "agent-guidance",
  "concept",
  "open-question",
  "domain",
  "bounded-context",
  "capability",
  "business-rule",
  "unresolved-conflict"
] as const;

export type FacetCategory = (typeof FACET_CATEGORIES)[number];

export const OBJECT_STATUSES = [
  "active",
  "stale",
  "superseded",
  "open",
  "closed"
] as const;

export type ObjectStatus = (typeof OBJECT_STATUSES)[number];

export const RELATION_STATUSES = ["active", "stale", "rejected"] as const;

export type RelationStatus = (typeof RELATION_STATUSES)[number];

export const PREDICATES = [
  "affects",
  "requires",
  "depends_on",
  "supersedes",
  "conflicts_with",
  "derived_from",
  "summarizes",
  "documents",
  "mentions",
  "implements",
  "related_to"
] as const;

export type Predicate = (typeof PREDICATES)[number];

export const RELATION_CONFIDENCES = ["low", "medium", "high"] as const;

export type RelationConfidence = (typeof RELATION_CONFIDENCES)[number];

export const EVENT_TYPES = [
  "memory.created",
  "memory.updated",
  "memory.marked_stale",
  "memory.superseded",
  "memory.deleted",
  "relation.created",
  "relation.updated",
  "relation.deleted",
  "index.rebuilt",
  "context.generated"
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

export const ACTORS = ["agent", "user", "cli", "mcp", "system"] as const;

export type Actor = (typeof ACTORS)[number];
export type SourceKind = Actor;

export const SCOPE_KINDS = ["project", "branch", "task"] as const;

export type ScopeKind = (typeof SCOPE_KINDS)[number];

export const PATCH_OPERATIONS = [
  "create_object",
  "update_object",
  "mark_stale",
  "supersede_object",
  "delete_object",
  "create_relation",
  "update_relation",
  "delete_relation"
] as const;

export type PatchOperation = (typeof PATCH_OPERATIONS)[number];

export interface ValidationIssue {
  code: string;
  message: string;
  path: RelativePath;
  field: string | null;
}

export interface GitState {
  available: boolean;
  branch: string | null;
  commit: string | null;
  dirty: boolean | null;
}

export interface AictxMeta {
  project_root: string;
  aictx_root: string;
  git: GitState;
}

export interface Scope {
  kind: ScopeKind;
  project: ProjectId;
  branch: string | null;
  task: string | null;
}

export interface Source {
  kind: SourceKind;
  task?: string;
  commit?: string;
}

export interface Evidence {
  kind: "memory" | "relation" | "file" | "commit" | "task" | "source";
  id: string;
}

export interface ObjectFacets {
  category: FacetCategory;
  applies_to?: string[];
  load_modes?: LoadMemoryModeName[];
}

export type LoadMemoryModeName =
  | "coding"
  | "debugging"
  | "review"
  | "architecture"
  | "onboarding";

export interface MemoryEvent {
  event: EventType;
  actor: Actor;
  timestamp: IsoDateTime;
  id?: ObjectId;
  relation_id?: RelationId;
  reason?: string;
  payload?: Record<string, JsonValue>;
}
