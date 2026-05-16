import type { GitState, ObjectId, RelationId } from "../core/types.js";
import type { CanonicalStorageSnapshot } from "../storage/read.js";
import type { StoredMemoryObject } from "../storage/objects.js";
import type { StoredMemoryRelation } from "../storage/relations.js";

export const ROLE_KEYS = [
  "product-intent",
  "capability-map",
  "repository-map",
  "architecture-patterns",
  "stack-tooling",
  "conventions-quality",
  "workflows-howtos",
  "verification",
  "gotchas-risks",
  "open-questions",
  "sources-provenance",
  "agent-guidance",
  "branch-handoff"
] as const;

export type MemoryRoleKey = (typeof ROLE_KEYS)[number];

export type RoleCoverageStatus = "populated" | "thin" | "missing" | "stale" | "conflicted";

export interface MemoryRoleDefinition {
  key: MemoryRoleKey;
  label: string;
  description: string;
  optional?: boolean;
}

export interface RoleCoverageItem {
  key: MemoryRoleKey;
  label: string;
  description: string;
  status: RoleCoverageStatus;
  optional: boolean;
  memory_ids: ObjectId[];
  relation_ids: RelationId[];
  gap: string | null;
}

export interface RoleCoverageData {
  roles: RoleCoverageItem[];
  counts: Record<RoleCoverageStatus, number>;
}

export const MEMORY_ROLE_DEFINITIONS: MemoryRoleDefinition[] = [
  {
    key: "product-intent",
    label: "Product Intent",
    description: "What this project is for and what useful output means."
  },
  {
    key: "capability-map",
    label: "Capability Map",
    description: "Features, outputs, commands, APIs, or generation capabilities."
  },
  {
    key: "repository-map",
    label: "Repository Map",
    description: "Where important code, docs, tests, assets, and configs live."
  },
  {
    key: "architecture-patterns",
    label: "Architecture / Patterns",
    description: "How the project is organized and which design patterns matter."
  },
  {
    key: "stack-tooling",
    label: "Stack / Tooling",
    description: "Languages, frameworks, package managers, build tools, and runtime constraints."
  },
  {
    key: "conventions-quality",
    label: "Conventions / Quality Bar",
    description: "Project-specific coding, design, review, and quality expectations."
  },
  {
    key: "workflows-howtos",
    label: "Workflows / How-tos",
    description: "Reusable setup, release, debugging, migration, generation, or maintenance procedures."
  },
  {
    key: "verification",
    label: "Verification",
    description: "Commands and checks agents should run before claiming work is done."
  },
  {
    key: "gotchas-risks",
    label: "Gotchas / Risks",
    description: "Known traps, fragile areas, abandoned approaches, or recurring failure modes."
  },
  {
    key: "open-questions",
    label: "Open Questions",
    description: "Important unknowns agents should not guess."
  },
  {
    key: "sources-provenance",
    label: "Sources / Provenance",
    description: "Source records and provenance relations backing durable memory."
  },
  {
    key: "agent-guidance",
    label: "Agent Guidance",
    description: "Project-specific operating rules for AI coding agents."
  },
  {
    key: "branch-handoff",
    label: "Branch Handoff",
    description: "Current branch continuity for unfinished work.",
    optional: true
  }
];

const ACTIVE_STATUSES = new Set(["active", "open"]);
const INACTIVE_STATUSES = new Set(["stale", "superseded"]);
const PROVENANCE_PREDICATES = new Set(["derived_from", "summarizes", "documents", "supports"]);
const IMPORTANT_RELATION_PREDICATES = new Set([
  "conflicts_with",
  "challenges",
  "supersedes",
  "requires",
  "depends_on",
  "derived_from",
  "supports",
  "summarizes",
  "documents"
]);

export function buildRoleCoverage(
  storage: CanonicalStorageSnapshot,
  git: Pick<GitState, "available" | "branch">
): RoleCoverageData {
  const activeConflictObjectIds = conflictingObjectIds(storage.relations);
  const roles = MEMORY_ROLE_DEFINITIONS.map((definition) =>
    roleCoverageItem(storage, git, activeConflictObjectIds, definition)
  );
  const counts = {
    populated: 0,
    thin: 0,
    missing: 0,
    stale: 0,
    conflicted: 0
  } satisfies Record<RoleCoverageStatus, number>;

  for (const role of roles) {
    counts[role.status] += 1;
  }

  return {
    roles,
    counts
  };
}

export function roleDefinitionForKey(key: MemoryRoleKey): MemoryRoleDefinition {
  const definition = MEMORY_ROLE_DEFINITIONS.find((role) => role.key === key);

  if (definition === undefined) {
    throw new Error(`Unknown Memory role: ${key}`);
  }

  return definition;
}

export function importantRelationSummaries(
  storage: CanonicalStorageSnapshot,
  memoryIds: readonly ObjectId[]
): StoredMemoryRelation[] {
  const idSet = new Set(memoryIds);

  return storage.relations
    .filter(
      (relation) =>
        relation.relation.status === "active" &&
        IMPORTANT_RELATION_PREDICATES.has(relation.relation.predicate) &&
        (idSet.has(relation.relation.from) || idSet.has(relation.relation.to))
    )
    .sort(compareRelationsById);
}

export function activeObjectsForRole(
  storage: CanonicalStorageSnapshot,
  git: Pick<GitState, "available" | "branch">,
  key: MemoryRoleKey
): StoredMemoryObject[] {
  return objectsForRole(storage, git, key).filter((object) =>
    ACTIVE_STATUSES.has(object.sidecar.status)
  );
}

function roleCoverageItem(
  storage: CanonicalStorageSnapshot,
  git: Pick<GitState, "available" | "branch">,
  activeConflictObjectIds: ReadonlySet<ObjectId>,
  definition: MemoryRoleDefinition
): RoleCoverageItem {
  const objects = objectsForRole(storage, git, definition.key);
  const activeObjects = objects.filter((object) => ACTIVE_STATUSES.has(object.sidecar.status));
  const inactiveObjects = objects.filter((object) => INACTIVE_STATUSES.has(object.sidecar.status));
  const roleRelations = relationIdsForRole(storage, activeObjects, definition.key);
  const hasConflict = activeObjects.some((object) => activeConflictObjectIds.has(object.sidecar.id));
  const status = roleStatus(definition.key, activeObjects, inactiveObjects, hasConflict, roleRelations);

  return {
    key: definition.key,
    label: definition.label,
    description: definition.description,
    status,
    optional: definition.optional === true,
    memory_ids: uniqueSorted(objects.map((object) => object.sidecar.id)),
    relation_ids: roleRelations,
    gap: gapForRole(definition, status)
  };
}

function roleStatus(
  key: MemoryRoleKey,
  activeObjects: readonly StoredMemoryObject[],
  inactiveObjects: readonly StoredMemoryObject[],
  hasConflict: boolean,
  roleRelations: readonly RelationId[]
): RoleCoverageStatus {
  if (hasConflict) {
    return "conflicted";
  }

  if (activeObjects.length === 0) {
    return inactiveObjects.length > 0 ? "stale" : "missing";
  }

  if (key === "sources-provenance" && roleRelations.length > 0) {
    return "populated";
  }

  return activeObjects.every(isThinMemoryObject) ? "thin" : "populated";
}

function gapForRole(
  definition: MemoryRoleDefinition,
  status: RoleCoverageStatus
): string | null {
  if (definition.key === "branch-handoff") {
    switch (status) {
      case "missing":
        return null;
      case "thin":
        return "Branch Handoff exists but is thin. Update it with `memory handoff update --stdin` so the current goal, state, verification, and next action are clear.";
      case "stale":
        return "Branch Handoff is closed or stale. Run `memory handoff update --stdin` if branch work resumes.";
      case "conflicted":
        return "Branch Handoff has active conflicting memory. Prefer current branch evidence and update the handoff before continuing.";
      case "populated":
        return null;
    }
  }

  if (definition.optional === true && status === "missing") {
    return null;
  }

  switch (status) {
    case "missing":
      return `${definition.label} is missing. Add source-backed memory when the project provides enough evidence.`;
    case "thin":
      return `${definition.label} exists but is thin. Expand it when real project evidence is available.`;
    case "stale":
      return `${definition.label} only has stale or superseded memory. Refresh or replace it when current evidence is clear.`;
    case "conflicted":
      return `${definition.label} has active conflicting memory. Prefer current code, tests, and user instructions before repair.`;
    case "populated":
      return null;
  }
}

function objectsForRole(
  storage: CanonicalStorageSnapshot,
  git: Pick<GitState, "available" | "branch">,
  key: MemoryRoleKey
): StoredMemoryObject[] {
  return storage.objects.filter((object) => objectMatchesRole(object, git, key)).sort(compareObjectsById);
}

function objectMatchesRole(
  object: StoredMemoryObject,
  git: Pick<GitState, "available" | "branch">,
  key: MemoryRoleKey
): boolean {
  const sidecar = object.sidecar;
  const category = sidecar.facets?.category ?? null;
  const tags = new Set(sidecar.tags ?? []);

  switch (key) {
    case "product-intent":
      return sidecar.id === "synthesis.product-intent" || category === "product-intent";
    case "capability-map":
      return (
        sidecar.id === "synthesis.feature-map" ||
        category === "feature-map" ||
        category === "product-feature" ||
        category === "capability"
      );
    case "repository-map":
      return sidecar.id === "synthesis.repository-map" || category === "file-layout";
    case "architecture-patterns":
      return sidecar.type === "architecture" || category === "architecture";
    case "stack-tooling":
      return (
        sidecar.id === "synthesis.stack-and-tooling" ||
        category === "stack" ||
        sidecar.id === "constraint.node-engine" ||
        sidecar.id === "constraint.package-manager"
      );
    case "conventions-quality":
      return (
        sidecar.id === "synthesis.conventions-quality" ||
        category === "convention" ||
        category === "business-rule"
      );
    case "workflows-howtos":
      return sidecar.type === "workflow" || category === "workflow";
    case "verification":
      return (
        sidecar.id === "workflow.post-task-verification" ||
        category === "testing" ||
        tags.has("verification") ||
        tags.has("testing")
      );
    case "gotchas-risks":
      return sidecar.type === "gotcha" || category === "gotcha" || category === "abandoned-attempt";
    case "open-questions":
      return sidecar.type === "question" || category === "open-question" || category === "unresolved-conflict";
    case "sources-provenance":
      return sidecar.type === "source" || category === "source";
    case "agent-guidance":
      return sidecar.id === "synthesis.agent-guidance" || category === "agent-guidance";
    case "branch-handoff":
      return (
        sidecar.type === "synthesis" &&
        sidecar.scope.kind === "branch" &&
        sidecar.scope.branch !== null &&
        git.available &&
        git.branch === sidecar.scope.branch &&
        (sidecar.id.startsWith("synthesis.branch-handoff-") || tags.has("branch-handoff"))
      );
  }
}

function relationIdsForRole(
  storage: CanonicalStorageSnapshot,
  activeObjects: readonly StoredMemoryObject[],
  key: MemoryRoleKey
): RelationId[] {
  const objectIds = new Set(activeObjects.map((object) => object.sidecar.id));

  if (key === "sources-provenance") {
    return uniqueSorted(
      storage.relations
        .filter(
          (relation) =>
            relation.relation.status === "active" &&
            PROVENANCE_PREDICATES.has(relation.relation.predicate)
        )
        .map((relation) => relation.relation.id)
    );
  }

  return uniqueSorted(
    storage.relations
      .filter(
        (relation) =>
          relation.relation.status === "active" &&
          (objectIds.has(relation.relation.from) || objectIds.has(relation.relation.to))
      )
      .map((relation) => relation.relation.id)
  );
}

function conflictingObjectIds(relations: readonly StoredMemoryRelation[]): Set<ObjectId> {
  const ids = new Set<ObjectId>();

  for (const relation of relations) {
    if (
      relation.relation.status === "active" &&
      (relation.relation.predicate === "conflicts_with" ||
        relation.relation.predicate === "challenges")
    ) {
      ids.add(relation.relation.from);
      ids.add(relation.relation.to);
    }
  }

  return ids;
}

function isThinMemoryObject(object: StoredMemoryObject): boolean {
  const normalizedBody = object.body.replace(/\r\n?/g, "\n").trim();
  const prose = normalizedBody
    .split("\n")
    .filter((line) => !line.startsWith("#"))
    .join(" ")
    .trim();

  return (
    prose.length < 80 ||
    /^Project-level memory for .+\.$/u.test(prose) ||
    prose === "Architecture memory starts here."
  );
}

function compareObjectsById(left: StoredMemoryObject, right: StoredMemoryObject): number {
  return left.sidecar.id.localeCompare(right.sidecar.id);
}

function compareRelationsById(
  left: StoredMemoryRelation,
  right: StoredMemoryRelation
): number {
  return left.relation.id.localeCompare(right.relation.id);
}

function uniqueSorted<T extends string>(values: readonly T[]): T[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}
