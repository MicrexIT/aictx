import type {
  IsoDateTime,
  ObjectFacets,
  ObjectId,
  ObjectStatus,
  ObjectType,
  Evidence,
  Scope,
  Sha256Hash,
  Source
} from "../core/types.js";

export interface AictxConfig {
  version: 1 | 2 | 3;
  project: {
    id: string;
    name: string;
  };
  memory: {
    defaultTokenBudget: number;
    autoIndex: boolean;
    saveContextPacks: boolean;
  };
  git: {
    trackContextPacks: boolean;
  };
}

export interface MemoryObjectSidecar {
  id: ObjectId;
  type: ObjectType;
  status: ObjectStatus;
  title: string;
  body_path: string;
  scope: Scope;
  tags?: string[];
  facets?: ObjectFacets;
  evidence?: Evidence[];
  source?: Source;
  superseded_by?: ObjectId | null;
  content_hash: Sha256Hash;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
}

export interface StoredMemoryObject {
  path: string;
  bodyPath: string;
  sidecar: MemoryObjectSidecar;
  body: string;
}

export function isAictxConfig(value: unknown): value is AictxConfig {
  if (!isRecord(value)) {
    return false;
  }

  const project = value.project;
  const memory = value.memory;
  const git = value.git;

  return (
    (value.version === 1 || value.version === 2 || value.version === 3) &&
    isRecord(project) &&
    typeof project.id === "string" &&
    typeof project.name === "string" &&
    isRecord(memory) &&
    typeof memory.defaultTokenBudget === "number" &&
    typeof memory.autoIndex === "boolean" &&
    typeof memory.saveContextPacks === "boolean" &&
    isRecord(git) &&
    typeof git.trackContextPacks === "boolean"
  );
}

export function isMemoryObjectSidecar(value: unknown): value is MemoryObjectSidecar {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.type === "string" &&
    typeof value.status === "string" &&
    typeof value.title === "string" &&
    typeof value.body_path === "string" &&
    isRecord(value.scope) &&
    typeof value.content_hash === "string" &&
    typeof value.created_at === "string" &&
    typeof value.updated_at === "string"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
