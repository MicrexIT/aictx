import fg from "fast-glob";

import type { ObjectId, ObjectStatus, ObjectType } from "../core/types.js";
import type { CanonicalStorageSnapshot } from "../storage/read.js";
import type { StoredMemoryObject } from "../storage/objects.js";
import type { StoredMemoryRelation } from "../storage/relations.js";

export type SuggestMode = "from_diff" | "bootstrap";

export interface SuggestReviewPacket {
  mode: SuggestMode;
  changed_files: string[];
  related_memory_ids: ObjectId[];
  possible_stale_ids: ObjectId[];
  recommended_memory: ObjectType[];
  agent_checklist: string[];
}

export interface BuildSuggestFromDiffPacketOptions {
  changedFiles: readonly string[];
  storage: CanonicalStorageSnapshot;
}

export interface BuildSuggestBootstrapPacketOptions {
  projectRoot: string;
  storage: CanonicalStorageSnapshot;
}

const FROM_DIFF_RECOMMENDED_MEMORY: ObjectType[] = [
  "decision",
  "constraint",
  "gotcha",
  "workflow",
  "fact"
];
const BOOTSTRAP_RECOMMENDED_MEMORY: ObjectType[] = [
  "project",
  "architecture",
  "workflow",
  "constraint",
  "gotcha",
  "decision"
];
const AGENT_CHECKLIST = [
  "Create memory only for durable future value.",
  "Prefer updating, marking stale, or superseding existing memory over creating duplicates.",
  "Use current code, tests, manifests, and user instructions as evidence.",
  "Keep each memory object short, linked, and reviewable.",
  "Save nothing if the work produced no durable future value."
] as const;
const STALE_CANDIDATE_STATUSES = new Set<ObjectStatus>([
  "active",
  "draft",
  "open",
  "closed"
]);
const BOOTSTRAP_FILE_LIMIT = 40;
const BOOTSTRAP_IGNORE = [
  ".aictx/**",
  ".git/**",
  ".cache/**",
  ".next/**",
  ".svelte-kit/**",
  ".turbo/**",
  ".vite/**",
  "build/**",
  "coverage/**",
  "dist/**",
  "dist-types/**",
  "node_modules/**",
  "out/**",
  "target/**",
  "temp/**",
  "tmp/**"
] as const;
const BOOTSTRAP_PATTERNS = [
  "README.md",
  "AGENTS.md",
  "CLAUDE.md",
  "package.json",
  "pnpm-workspace.yaml",
  "tsconfig*.json",
  "vite.config.*",
  "vitest.config.*",
  "next.config.*",
  "svelte.config.*",
  "eslint.config.*",
  "src/**/*.{ts,tsx,js,jsx,svelte,md}",
  "app/**/*.{ts,tsx,js,jsx,svelte,md}",
  "lib/**/*.{ts,tsx,js,jsx,svelte,md}",
  "test/**/*.{ts,tsx,js,jsx,svelte,md}",
  "tests/**/*.{ts,tsx,js,jsx,svelte,md}",
  "docs/**/*.{md,mdx}"
] as const;
const TOKEN_STOP_WORDS = new Set([
  "aictx",
  "app",
  "cli",
  "cmd",
  "command",
  "config",
  "dist",
  "doc",
  "docs",
  "index",
  "json",
  "lib",
  "lock",
  "main",
  "memory",
  "node",
  "package",
  "readme",
  "src",
  "test",
  "tests",
  "tsx",
  "types"
]);

export function buildSuggestFromDiffPacket(
  options: BuildSuggestFromDiffPacketOptions
): SuggestReviewPacket {
  const changedFiles = uniqueSorted(options.changedFiles);
  const related = relatedMemoryIds(options.storage, changedFiles);
  const possibleStale = possibleStaleIds(options.storage, changedFiles);

  return {
    mode: "from_diff",
    changed_files: changedFiles,
    related_memory_ids: related,
    possible_stale_ids: possibleStale,
    recommended_memory: [...FROM_DIFF_RECOMMENDED_MEMORY],
    agent_checklist: [...AGENT_CHECKLIST]
  };
}

export async function buildSuggestBootstrapPacket(
  options: BuildSuggestBootstrapPacketOptions
): Promise<SuggestReviewPacket> {
  const changedFiles = await bootstrapCandidateFiles(options.projectRoot);

  return {
    mode: "bootstrap",
    changed_files: changedFiles,
    related_memory_ids: relatedMemoryIds(options.storage, changedFiles),
    possible_stale_ids: possibleStaleIds(options.storage, changedFiles),
    recommended_memory: [...BOOTSTRAP_RECOMMENDED_MEMORY],
    agent_checklist: [...AGENT_CHECKLIST]
  };
}

export async function bootstrapCandidateFiles(projectRoot: string): Promise<string[]> {
  const files = await fg([...BOOTSTRAP_PATTERNS], {
    cwd: projectRoot,
    dot: true,
    ignore: [...BOOTSTRAP_IGNORE],
    onlyFiles: true,
    unique: true
  });

  return uniqueSorted(files)
    .sort(compareBootstrapCandidates)
    .slice(0, BOOTSTRAP_FILE_LIMIT);
}

function relatedMemoryIds(
  storage: CanonicalStorageSnapshot,
  changedFiles: readonly string[]
): ObjectId[] {
  const ids = new Set<ObjectId>();

  for (const object of storage.objects) {
    if (objectMatchesFiles(object, changedFiles)) {
      ids.add(object.sidecar.id);
    }
  }

  for (const relation of storage.relations) {
    if (relationHasFileEvidence(relation, changedFiles)) {
      ids.add(relation.relation.from);
      ids.add(relation.relation.to);
    }
  }

  return [...ids].sort();
}

function possibleStaleIds(
  storage: CanonicalStorageSnapshot,
  changedFiles: readonly string[]
): ObjectId[] {
  return storage.objects
    .filter((object) => STALE_CANDIDATE_STATUSES.has(object.sidecar.status))
    .filter((object) => objectMatchesFiles(object, changedFiles))
    .map((object) => object.sidecar.id)
    .sort();
}

function objectMatchesFiles(
  object: StoredMemoryObject,
  changedFiles: readonly string[]
): boolean {
  if (changedFiles.length === 0) {
    return false;
  }

  const text = objectSearchText(object);
  const objectTokens = tokenize(text);

  return changedFiles.some((file) => {
    const normalizedFile = normalizeForSearch(file);

    if (
      text.includes(normalizedFile) ||
      normalizePath(object.path) === normalizePath(file) ||
      normalizePath(object.bodyPath) === normalizePath(file)
    ) {
      return true;
    }

    for (const token of tokenize(file)) {
      if (objectTokens.has(token)) {
        return true;
      }
    }

    return false;
  });
}

function relationHasFileEvidence(
  relation: StoredMemoryRelation,
  changedFiles: readonly string[]
): boolean {
  const fileSet = new Set(changedFiles.map(normalizePath));

  return (relation.relation.evidence ?? []).some(
    (evidence) => evidence.kind === "file" && fileSet.has(normalizePath(evidence.id))
  );
}

function objectSearchText(object: StoredMemoryObject): string {
  return normalizeForSearch(
    [
      object.path,
      object.bodyPath,
      object.sidecar.id,
      object.sidecar.title,
      ...(object.sidecar.tags ?? []),
      object.body
    ].join("\n")
  );
}

function tokenize(value: string): Set<string> {
  return new Set(
    normalizeForSearch(value)
      .split(/[^a-z0-9]+/u)
      .filter((token) => token.length >= 3 && !TOKEN_STOP_WORDS.has(token))
  );
}

function compareBootstrapCandidates(left: string, right: string): number {
  const priorityComparison = bootstrapPriority(left) - bootstrapPriority(right);

  if (priorityComparison !== 0) {
    return priorityComparison;
  }

  return left.localeCompare(right);
}

function bootstrapPriority(file: string): number {
  if (file === "README.md") {
    return 0;
  }

  if (file === "AGENTS.md" || file === "CLAUDE.md") {
    return 1;
  }

  if (isManifestOrConfig(file)) {
    return 2;
  }

  if (file.startsWith("docs/")) {
    return 3;
  }

  if (file.startsWith("src/") || file.startsWith("app/") || file.startsWith("lib/")) {
    return 4;
  }

  if (file.startsWith("test/") || file.startsWith("tests/")) {
    return 5;
  }

  return 6;
}

function isManifestOrConfig(file: string): boolean {
  return (
    file === "package.json" ||
    file === "pnpm-workspace.yaml" ||
    /^tsconfig.*\.json$/u.test(file) ||
    /^(vite|vitest|next|svelte|eslint)\.config\./u.test(file)
  );
}

function normalizeForSearch(value: string): string {
  return normalizePath(value).toLowerCase();
}

function normalizePath(value: string): string {
  return value.replaceAll("\\", "/");
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}
