import type {
  Evidence,
  FacetCategory,
  ObjectId,
  Predicate,
  RelationConfidence,
  SourceOrigin
} from "../core/types.js";

export const REMEMBER_MEMORY_KINDS = [
  "source",
  "synthesis",
  "decision",
  "constraint",
  "fact",
  "gotcha",
  "workflow",
  "question",
  "concept",
  "note"
] as const;

export type RememberMemoryKind = (typeof REMEMBER_MEMORY_KINDS)[number];

export interface RememberRelatedInput {
  predicate: Predicate;
  to: ObjectId;
  confidence?: RelationConfidence;
  evidence?: Evidence[];
}

export interface RememberMemoryInputItem {
  id?: ObjectId;
  kind: RememberMemoryKind;
  title: string;
  body: string;
  tags?: string[];
  applies_to?: string[];
  category?: FacetCategory;
  evidence?: Evidence[];
  origin?: SourceOrigin;
  related?: RememberRelatedInput[];
}

export interface RememberUpdateInputItem {
  id: ObjectId;
  title?: string;
  body?: string;
  tags?: string[];
  applies_to?: string[];
  category?: FacetCategory;
  evidence?: Evidence[];
  origin?: SourceOrigin;
}

export interface RememberStaleInputItem {
  id: ObjectId;
  reason: string;
}

export interface RememberSupersedeInputItem {
  id: ObjectId;
  superseded_by: ObjectId;
  reason: string;
}

export interface RememberRelationInputItem {
  from: ObjectId;
  predicate: Predicate;
  to: ObjectId;
  confidence?: RelationConfidence;
  evidence?: Evidence[];
}

export interface RememberMemoryInput {
  task: string;
  memories?: RememberMemoryInputItem[];
  updates?: RememberUpdateInputItem[];
  stale?: RememberStaleInputItem[];
  supersede?: RememberSupersedeInputItem[];
  relations?: RememberRelationInputItem[];
}
