import type { GitState, ObjectId, RelationId } from "../core/types.js";
import type { CanonicalStorageSnapshot } from "../storage/read.js";
import type { StoredMemoryObject } from "../storage/objects.js";
import type { StoredMemoryRelation } from "../storage/relations.js";
import {
  activeObjectsForRole,
  buildRoleCoverage,
  importantRelationSummaries,
  type MemoryRoleKey,
  type RoleCoverageData,
  type RoleCoverageItem
} from "../roles/coverage.js";

export const MEMORY_LENS_NAMES = [
  "project-map",
  "current-work",
  "review-risk",
  "provenance",
  "maintenance"
] as const;

export type MemoryLensName = (typeof MEMORY_LENS_NAMES)[number];

export interface BuiltMemoryLens {
  name: MemoryLensName;
  title: string;
  markdown: string;
  role_coverage: RoleCoverageData;
  included_memory_ids: ObjectId[];
  relation_ids: RelationId[];
  relations: StoredMemoryRelation[];
  generated_gaps: string[];
}

interface LensDefinition {
  name: MemoryLensName;
  title: string;
  description: string;
  roles: MemoryRoleKey[];
  includeBranchScoped: boolean;
  includeStaleMaintenance?: boolean;
}

const PROJECT_MAP_ROLES: MemoryRoleKey[] = [
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
  "agent-guidance"
];

const LENS_DEFINITIONS: LensDefinition[] = [
  {
    name: "project-map",
    title: "Project Map",
    description: "Default overview for understanding purpose, capabilities, layout, stack, and operating norms.",
    roles: PROJECT_MAP_ROLES,
    includeBranchScoped: false
  },
  {
    name: "current-work",
    title: "Current Work",
    description: "Branch-scoped continuity, active open questions, and the next useful handoff context.",
    roles: ["branch-handoff", "open-questions", "verification", "gotchas-risks"],
    includeBranchScoped: true
  },
  {
    name: "review-risk",
    title: "Review / Risk",
    description: "Quality expectations, verification, risks, conflicts, and unresolved questions.",
    roles: ["conventions-quality", "verification", "gotchas-risks", "open-questions"],
    includeBranchScoped: false
  },
  {
    name: "provenance",
    title: "Provenance",
    description: "Source records and relation chains that explain where durable memory came from.",
    roles: ["sources-provenance", "product-intent", "capability-map", "architecture-patterns"],
    includeBranchScoped: false
  },
  {
    name: "maintenance",
    title: "Maintenance",
    description: "Coverage gaps, stale memory, supersessions, and conflicts that need cleanup.",
    roles: [...PROJECT_MAP_ROLES, "sources-provenance", "branch-handoff"],
    includeBranchScoped: true,
    includeStaleMaintenance: true
  }
];

export function isMemoryLensName(value: string): value is MemoryLensName {
  return (MEMORY_LENS_NAMES as readonly string[]).includes(value);
}

export function buildMemoryLens(
  storage: CanonicalStorageSnapshot,
  git: Pick<GitState, "available" | "branch">,
  name: MemoryLensName
): BuiltMemoryLens {
  const definition = lensDefinition(name);
  const roleCoverage = buildRoleCoverage(storage, git);
  const includedObjects = includedObjectsForLens(storage, git, definition);
  const includedIds = uniqueSorted(includedObjects.map((object) => object.sidecar.id));
  const relations = importantRelationSummaries(storage, includedIds);
  const relationIds = uniqueSorted(relations.map((relation) => relation.relation.id));
  const roleItems = definition.roles
    .map((roleKey) => roleCoverage.roles.find((role) => role.key === roleKey))
    .filter((role): role is RoleCoverageItem => role !== undefined);
  const generatedGaps = roleItems.flatMap((role) => (role.gap === null ? [] : [role.gap]));

  return {
    name,
    title: definition.title,
    markdown: renderLensMarkdown({
      storage,
      git,
      definition,
      roles: roleItems,
      includedObjects,
      relations,
      generatedGaps
    }),
    role_coverage: roleCoverage,
    included_memory_ids: includedIds,
    relation_ids: relationIds,
    relations,
    generated_gaps: generatedGaps
  };
}

export function buildAllMemoryLenses(
  storage: CanonicalStorageSnapshot,
  git: Pick<GitState, "available" | "branch">
): BuiltMemoryLens[] {
  return MEMORY_LENS_NAMES.map((name) => buildMemoryLens(storage, git, name));
}

function lensDefinition(name: MemoryLensName): LensDefinition {
  const definition = LENS_DEFINITIONS.find((lens) => lens.name === name);

  if (definition === undefined) {
    throw new Error(`Unknown Memory lens: ${name}`);
  }

  return definition;
}

function includedObjectsForLens(
  storage: CanonicalStorageSnapshot,
  git: Pick<GitState, "available" | "branch">,
  definition: LensDefinition
): StoredMemoryObject[] {
  const objects = new Map<ObjectId, StoredMemoryObject>();

  for (const role of definition.roles) {
    for (const object of activeObjectsForRole(storage, git, role)) {
      if (!definition.includeBranchScoped && object.sidecar.scope.kind === "branch") {
        continue;
      }

      objects.set(object.sidecar.id, object);
    }
  }

  if (definition.includeBranchScoped && git.available && git.branch !== null) {
    for (const object of storage.objects) {
      if (
        object.sidecar.scope.kind === "branch" &&
        object.sidecar.scope.branch === git.branch &&
        object.sidecar.status === "active"
      ) {
        objects.set(object.sidecar.id, object);
      }
    }
  }

  if (definition.includeStaleMaintenance === true) {
    for (const object of maintenanceObjects(storage, git)) {
      objects.set(object.sidecar.id, object);
    }
  }

  return [...objects.values()].sort(compareObjectsByRoleThenId(definition.roles, storage, git));
}

function maintenanceObjects(
  storage: CanonicalStorageSnapshot,
  git: Pick<GitState, "available" | "branch">
): StoredMemoryObject[] {
  const conflictedIds = new Set(
    storage.relations
      .filter(
        (relation) =>
          relation.relation.status === "active" &&
          (relation.relation.predicate === "conflicts_with" ||
            relation.relation.predicate === "challenges")
      )
      .flatMap((relation) => [relation.relation.from, relation.relation.to])
  );

  return storage.objects.filter((object) => {
    if (object.sidecar.scope.kind === "branch") {
      return git.available && git.branch === object.sidecar.scope.branch;
    }

    return (
      object.sidecar.status === "stale" ||
      object.sidecar.status === "superseded" ||
      conflictedIds.has(object.sidecar.id)
    );
  });
}

function renderLensMarkdown(input: {
  storage: CanonicalStorageSnapshot;
  git: Pick<GitState, "available" | "branch">;
  definition: LensDefinition;
  roles: RoleCoverageItem[];
  includedObjects: StoredMemoryObject[];
  relations: StoredMemoryRelation[];
  generatedGaps: string[];
}): string {
  const lines = [
    `# ${input.definition.title}`,
    "",
    input.definition.description,
    "",
    ...renderBranchLine(input.git),
    "## Role coverage",
    "",
    ...input.roles.map((role) => `- ${role.label}: ${role.status}${role.optional ? " (optional)" : ""}`),
    ""
  ];

  if (input.generatedGaps.length > 0) {
    lines.push(
      "## Generated gaps",
      "",
      ...input.generatedGaps.map((gap) => `- ${gap}`),
      ""
    );
  }

  for (const role of input.roles) {
    const roleObjects = input.includedObjects.filter((object) =>
      role.memory_ids.includes(object.sidecar.id)
    );

    if (roleObjects.length === 0) {
      continue;
    }

    lines.push(`## ${role.label}`, "");

    for (const object of roleObjects) {
      lines.push(`### ${object.sidecar.title}`);
      lines.push("");
      lines.push(`Memory: \`${object.sidecar.id}\` (${object.sidecar.type}, ${object.sidecar.status})`);
      lines.push("");
      lines.push(excerptBody(object.body));
      lines.push("");
    }
  }

  if (input.relations.length > 0) {
    lines.push(
      "## Relation context",
      "",
      ...input.relations.map(
        (relation) =>
          `- \`${relation.relation.from}\` ${relation.relation.predicate} \`${relation.relation.to}\` (${relation.relation.status})`
      ),
      ""
    );
  }

  if (input.includedObjects.length === 0) {
    lines.push("No matching memory is populated yet.", "");
  }

  return `${trimTrailingBlankLines(lines).join("\n")}\n`;
}

function renderBranchLine(git: Pick<GitState, "available" | "branch">): string[] {
  if (!git.available || git.branch === null) {
    return [];
  }

  return [`Branch: \`${git.branch}\``, ""];
}

function excerptBody(body: string): string {
  const prose = body
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .filter((line) => !line.trim().startsWith("#"))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (prose.length <= 600) {
    return prose === "" ? "_No body summary available._" : prose;
  }

  return `${prose.slice(0, 597).trimEnd()}...`;
}

function compareObjectsByRoleThenId(
  roles: readonly MemoryRoleKey[],
  storage: CanonicalStorageSnapshot,
  git: Pick<GitState, "available" | "branch">
): (left: StoredMemoryObject, right: StoredMemoryObject) => number {
  const roleOrder = new Map<ObjectId, number>();

  for (const [index, role] of roles.entries()) {
    for (const object of activeObjectsForRole(storage, git, role)) {
      if (!roleOrder.has(object.sidecar.id)) {
        roleOrder.set(object.sidecar.id, index);
      }
    }
  }

  return (left, right) => {
    const leftOrder = roleOrder.get(left.sidecar.id) ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = roleOrder.get(right.sidecar.id) ?? Number.MAX_SAFE_INTEGER;

    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }

    return left.sidecar.id.localeCompare(right.sidecar.id);
  };
}

function trimTrailingBlankLines(lines: string[]): string[] {
  const result = [...lines];

  while (result.at(-1) === "") {
    result.pop();
  }

  return result;
}

function uniqueSorted<T extends string>(values: readonly T[]): T[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}
