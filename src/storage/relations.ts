import type {
  Evidence,
  IsoDateTime,
  ObjectId,
  Predicate,
  RelationConfidence,
  RelationId,
  RelationStatus,
  Sha256Hash
} from "../core/types.js";

export interface MemoryRelation {
  id: RelationId;
  from: ObjectId;
  predicate: Predicate;
  to: ObjectId;
  status: RelationStatus;
  confidence?: RelationConfidence;
  evidence?: Evidence[];
  content_hash?: Sha256Hash;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
}

export interface StoredMemoryRelation {
  path: string;
  relation: MemoryRelation;
}

export function isMemoryRelation(value: unknown): value is MemoryRelation {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.from === "string" &&
    typeof value.predicate === "string" &&
    typeof value.to === "string" &&
    typeof value.status === "string" &&
    typeof value.created_at === "string" &&
    typeof value.updated_at === "string"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
