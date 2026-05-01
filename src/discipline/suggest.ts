import { access, readFile } from "node:fs/promises";
import { join } from "node:path";

import fg from "fast-glob";

import type { ObjectId, ObjectStatus, ObjectType, Source } from "../core/types.js";
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

export type BootstrapPatchChange =
  | {
      op: "update_object";
      id: ObjectId;
      body?: string;
      tags?: string[];
      source?: Source;
    }
  | {
      op: "create_object";
      id: ObjectId;
      type: ObjectType;
      title: string;
      body: string;
      tags?: string[];
      source?: Source;
    };

export interface BootstrapMemoryPatch {
  source: Source;
  changes: BootstrapPatchChange[];
}

export interface SuggestBootstrapPatchProposal {
  proposed: boolean;
  patch: BootstrapMemoryPatch | null;
  packet: SuggestReviewPacket;
  reason: string | null;
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
const BOOTSTRAP_PATCH_SOURCE: Source = {
  kind: "cli",
  task: "Proposed bootstrap memory patch from deterministic repository analysis"
};
const BOOTSTRAP_NO_PATCH_REASON =
  "No high-confidence bootstrap memory patch could be generated from deterministic repository evidence.";
const LOCK_FILE_MANAGERS = [
  { file: "pnpm-lock.yaml", manager: "pnpm" },
  { file: "package-lock.json", manager: "npm" },
  { file: "yarn.lock", manager: "yarn" },
  { file: "bun.lock", manager: "bun" },
  { file: "bun.lockb", manager: "bun" }
] as const;
const PACKAGE_MANAGERS = new Set(["npm", "pnpm", "yarn", "bun"]);

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

export async function buildSuggestBootstrapPatchProposal(
  options: BuildSuggestBootstrapPacketOptions
): Promise<SuggestBootstrapPatchProposal> {
  const packet = await buildSuggestBootstrapPacket(options);
  const analysis = await analyzeBootstrapRepository(options.projectRoot, packet.changed_files);
  const changes = buildBootstrapPatchChanges(options.storage, analysis);

  if (changes.length === 0) {
    return {
      proposed: false,
      patch: null,
      packet,
      reason: BOOTSTRAP_NO_PATCH_REASON
    };
  }

  return {
    proposed: true,
    patch: {
      source: BOOTSTRAP_PATCH_SOURCE,
      changes
    },
    packet,
    reason: null
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

interface BootstrapAnalysis {
  files: Set<string>;
  readme: ReadmeInfo | null;
  packageJson: PackageJsonInfo | null;
  packageManager: PackageManagerInfo | null;
}

interface ReadmeInfo {
  title: string | null;
  summary: string | null;
}

interface PackageJsonInfo {
  name: string | null;
  description: string | null;
  type: string | null;
  packageManager: string | null;
  nodeEngine: string | null;
  scripts: Record<string, string>;
  devDependencies: Set<string>;
  dependencies: Set<string>;
}

interface PackageManagerInfo {
  manager: string;
  source: string;
  spec: string | null;
}

async function analyzeBootstrapRepository(
  projectRoot: string,
  changedFiles: readonly string[]
): Promise<BootstrapAnalysis> {
  const packageJson = await readPackageJson(projectRoot);

  return {
    files: new Set(changedFiles),
    readme: await readReadme(projectRoot),
    packageJson,
    packageManager: await detectPackageManager(projectRoot, packageJson)
  };
}

function buildBootstrapPatchChanges(
  storage: CanonicalStorageSnapshot,
  analysis: BootstrapAnalysis
): BootstrapPatchChange[] {
  const changes: BootstrapPatchChange[] = [];
  const projectObject = objectById(storage, storage.config.project.id);
  const architectureObject = objectById(storage, "architecture.current");

  if (projectObject !== null && isInitialProjectPlaceholder(projectObject)) {
    const body = projectBootstrapBody(projectObject, analysis);

    if (body !== null) {
      changes.push({
        op: "update_object",
        id: projectObject.sidecar.id,
        body,
        tags: mergeTags(projectObject.sidecar.tags, ["project"]),
        source: BOOTSTRAP_PATCH_SOURCE
      });
    }
  }

  if (architectureObject !== null && isInitialArchitecturePlaceholder(architectureObject)) {
    const body = architectureBootstrapBody(architectureObject, analysis);

    if (body !== null) {
      changes.push({
        op: "update_object",
        id: architectureObject.sidecar.id,
        body,
        tags: mergeTags(architectureObject.sidecar.tags, ["architecture"]),
        source: BOOTSTRAP_PATCH_SOURCE
      });
    }
  }

  const workflow = packageScriptsWorkflow(storage, analysis);

  if (workflow !== null) {
    changes.push(workflow);
  }

  const nodeConstraint = nodeEngineConstraint(storage, analysis);

  if (nodeConstraint !== null) {
    changes.push(nodeConstraint);
  }

  const packageManagerChange = packageManagerConstraint(storage, analysis);

  if (packageManagerChange !== null) {
    changes.push(packageManagerChange);
  }

  return changes;
}

function projectBootstrapBody(
  object: StoredMemoryObject,
  analysis: BootstrapAnalysis
): string | null {
  const purpose = analysis.packageJson?.description ?? analysis.readme?.summary;

  if (purpose === undefined || purpose === null || purpose === "") {
    return null;
  }

  const lines = [`# ${object.sidecar.title}`, "", purpose];

  if (analysis.packageJson?.name !== null && analysis.packageJson?.name !== undefined) {
    lines.push("", `Package: \`${analysis.packageJson.name}\`.`);
  }

  return `${lines.join("\n")}\n`;
}

function architectureBootstrapBody(
  object: StoredMemoryObject,
  analysis: BootstrapAnalysis
): string | null {
  const signals = architectureSignals(analysis);

  if (signals.length < 2) {
    return null;
  }

  return [`# ${object.sidecar.title}`, "", ...signals.map((signal) => `- ${signal}`), ""].join(
    "\n"
  );
}

function architectureSignals(analysis: BootstrapAnalysis): string[] {
  const signals: string[] = [];
  const files = analysis.files;
  const packageJson = analysis.packageJson;

  if (hasAnyPrefix(files, ["src/"])) {
    signals.push("Primary source files are under `src/`.");
  }

  if (hasAnyPrefix(files, ["app/"])) {
    signals.push("Application entrypoints are under `app/`.");
  }

  if (hasAnyPrefix(files, ["lib/"])) {
    signals.push("Reusable library code is under `lib/`.");
  }

  if (hasTypeScriptSignal(files)) {
    signals.push("The codebase uses TypeScript.");
  }

  if (packageJson?.type === "module") {
    signals.push("The package is configured as an ESM package with `type: module`.");
  }

  if (hasConfig(files, "next")) {
    signals.push("Next.js configuration is present.");
  }

  if (hasConfig(files, "vite")) {
    signals.push("Vite configuration is present.");
  }

  if (hasConfig(files, "svelte")) {
    signals.push("Svelte configuration is present.");
  }

  if (hasVitestSignal(files, packageJson)) {
    signals.push("Vitest is the configured test runner.");
  } else if (hasAnyPrefix(files, ["test/", "tests/"])) {
    signals.push("Tests are kept under `test/` or `tests/`.");
  }

  return signals;
}

function packageScriptsWorkflow(
  storage: CanonicalStorageSnapshot,
  analysis: BootstrapAnalysis
): BootstrapPatchChange | null {
  const scripts = analysis.packageJson?.scripts ?? {};
  const entries = Object.entries(scripts)
    .filter(([, value]) => value.trim() !== "")
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(0, 8);

  if (
    entries.length === 0 ||
    hasSimilarObject(storage, "workflow", "workflow.package-scripts", "Package scripts")
  ) {
    return null;
  }

  return {
    op: "create_object",
    id: "workflow.package-scripts",
    type: "workflow",
    title: "Package scripts",
    body: [
      "# Package scripts",
      "",
      "Use the package scripts in `package.json` for repeated project workflows:",
      ...entries.map(([name, value]) => `- \`${name}\`: \`${value}\``),
      ""
    ].join("\n"),
    tags: ["package", "workflow"]
  };
}

function nodeEngineConstraint(
  storage: CanonicalStorageSnapshot,
  analysis: BootstrapAnalysis
): BootstrapPatchChange | null {
  const nodeEngine = analysis.packageJson?.nodeEngine;

  if (
    nodeEngine === undefined ||
    nodeEngine === null ||
    nodeEngine === "" ||
    hasSimilarObject(storage, "constraint", "constraint.node-engine", "Node engine requirement")
  ) {
    return null;
  }

  return {
    op: "create_object",
    id: "constraint.node-engine",
    type: "constraint",
    title: "Node engine requirement",
    body: [
      "# Node engine requirement",
      "",
      `The package declares Node.js \`${nodeEngine}\` in \`package.json\` engines.`,
      ""
    ].join("\n"),
    tags: ["node", "runtime"]
  };
}

function packageManagerConstraint(
  storage: CanonicalStorageSnapshot,
  analysis: BootstrapAnalysis
): BootstrapPatchChange | null {
  const packageManager = analysis.packageManager;

  if (
    packageManager === null ||
    hasSimilarObject(storage, "constraint", "constraint.package-manager", "Package manager")
  ) {
    return null;
  }

  return {
    op: "create_object",
    id: "constraint.package-manager",
    type: "constraint",
    title: "Package manager",
    body: [
      "# Package manager",
      "",
      packageManager.spec === null
        ? `Use ${packageManager.manager} for dependency workflows; this is inferred from \`${packageManager.source}\`.`
        : `Use \`${packageManager.spec}\` for dependency workflows; this is declared in \`${packageManager.source}\`.`,
      ""
    ].join("\n"),
    tags: [packageManager.manager, "dependencies"]
  };
}

async function readReadme(projectRoot: string): Promise<ReadmeInfo | null> {
  const contents = await readUtf8IfExists(projectRoot, "README.md");

  if (contents === null) {
    return null;
  }

  const lines = contents.split(/\r\n|\n|\r/u);
  const title = lines
    .map((line) => /^#\s+(.+?)\s*$/u.exec(line)?.[1]?.trim() ?? null)
    .find((value): value is string => value !== null && value !== "");
  const summary = firstReadmeParagraph(lines);

  return {
    title: title ?? null,
    summary
  };
}

async function readPackageJson(projectRoot: string): Promise<PackageJsonInfo | null> {
  const contents = await readUtf8IfExists(projectRoot, "package.json");

  if (contents === null) {
    return null;
  }

  try {
    return packageJsonInfo(JSON.parse(contents) as unknown);
  } catch {
    return null;
  }
}

function packageJsonInfo(value: unknown): PackageJsonInfo | null {
  if (!isRecord(value)) {
    return null;
  }

  return {
    name: stringProperty(value, "name"),
    description: stringProperty(value, "description"),
    type: stringProperty(value, "type"),
    packageManager: stringProperty(value, "packageManager"),
    nodeEngine: engineValue(value, "node"),
    scripts: stringRecordProperty(value, "scripts"),
    dependencies: dependencySet(value, "dependencies"),
    devDependencies: dependencySet(value, "devDependencies")
  };
}

async function detectPackageManager(
  projectRoot: string,
  packageJson: PackageJsonInfo | null
): Promise<PackageManagerInfo | null> {
  if (packageJson?.packageManager !== null && packageJson?.packageManager !== undefined) {
    const manager = packageJson.packageManager.split("@")[0]?.trim();

    if (manager !== undefined && PACKAGE_MANAGERS.has(manager)) {
      return {
        manager,
        source: "package.json",
        spec: packageJson.packageManager
      };
    }
  }

  const presentLocks = [];

  for (const lock of LOCK_FILE_MANAGERS) {
    if (await fileExists(projectRoot, lock.file)) {
      presentLocks.push(lock);
    }
  }

  const lockManagers = new Set(presentLocks.map((lock) => lock.manager));

  if (lockManagers.size === 1 && presentLocks[0] !== undefined) {
    return {
      manager: presentLocks[0].manager,
      source: presentLocks[0].file,
      spec: null
    };
  }

  if (presentLocks.length === 0 && (await fileExists(projectRoot, "pnpm-workspace.yaml"))) {
    return {
      manager: "pnpm",
      source: "pnpm-workspace.yaml",
      spec: null
    };
  }

  return null;
}

function firstReadmeParagraph(lines: readonly string[]): string | null {
  let inFence = false;
  let afterTitle = false;
  const paragraph: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith("```") || trimmed.startsWith("~~~")) {
      inFence = !inFence;
      continue;
    }

    if (inFence) {
      continue;
    }

    if (/^#\s+/u.test(trimmed)) {
      afterTitle = true;
      continue;
    }

    if (!afterTitle || trimmed === "") {
      if (paragraph.length > 0) {
        break;
      }
      continue;
    }

    if (/^(#{2,6}\s+|[-*]\s+|\d+\.\s+|>|!\[)/u.test(trimmed)) {
      if (paragraph.length > 0) {
        break;
      }
      continue;
    }

    paragraph.push(trimmed);
  }

  const summary = cleanMarkdownText(paragraph.join(" "));
  return summary === "" ? null : truncateSentence(summary, 240);
}

function cleanMarkdownText(value: string): string {
  return value
    .replace(/\[([^\]]+)\]\([^)]+\)/gu, "$1")
    .replace(/[`*_]/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

function truncateSentence(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1).trimEnd()}.`;
}

async function readUtf8IfExists(projectRoot: string, relativePath: string): Promise<string | null> {
  try {
    return await readFile(join(projectRoot, relativePath), "utf8");
  } catch {
    return null;
  }
}

async function fileExists(projectRoot: string, relativePath: string): Promise<boolean> {
  try {
    await access(join(projectRoot, relativePath));
    return true;
  } catch {
    return false;
  }
}

function objectById(storage: CanonicalStorageSnapshot, id: ObjectId): StoredMemoryObject | null {
  return storage.objects.find((object) => object.sidecar.id === id) ?? null;
}

function isInitialProjectPlaceholder(object: StoredMemoryObject): boolean {
  return (
    object.sidecar.type === "project" &&
    object.sidecar.source?.kind === "system" &&
    /^# .+\n\nProject-level memory for .+\.\n?$/u.test(object.body)
  );
}

function isInitialArchitecturePlaceholder(object: StoredMemoryObject): boolean {
  return (
    object.sidecar.type === "architecture" &&
    object.sidecar.source?.kind === "system" &&
    object.body === "# Current Architecture\n\nArchitecture memory starts here.\n"
  );
}

function hasSimilarObject(
  storage: CanonicalStorageSnapshot,
  type: ObjectType,
  id: ObjectId,
  title: string
): boolean {
  const normalizedTitle = title.toLowerCase();

  return storage.objects.some(
    (object) =>
      object.sidecar.type === type &&
      (object.sidecar.id === id || object.sidecar.title.toLowerCase() === normalizedTitle)
  );
}

function mergeTags(existing: readonly string[] | undefined, additions: readonly string[]): string[] {
  return uniqueSorted([...(existing ?? []), ...additions]);
}

function hasAnyPrefix(files: Set<string>, prefixes: readonly string[]): boolean {
  for (const file of files) {
    if (prefixes.some((prefix) => file.startsWith(prefix))) {
      return true;
    }
  }

  return false;
}

function hasTypeScriptSignal(files: Set<string>): boolean {
  for (const file of files) {
    if (/^tsconfig.*\.json$/u.test(file)) {
      return true;
    }
  }

  return false;
}

function hasConfig(files: Set<string>, name: "next" | "svelte" | "vite"): boolean {
  for (const file of files) {
    if (new RegExp(`^${name}\\.config\\.`, "u").test(file)) {
      return true;
    }
  }

  return false;
}

function hasVitestSignal(
  files: Set<string>,
  packageJson: PackageJsonInfo | null
): boolean {
  for (const file of files) {
    if (/^vitest\.config\./u.test(file)) {
      return true;
    }
  }

  return (
    packageJson?.dependencies.has("vitest") === true ||
    packageJson?.devDependencies.has("vitest") === true ||
    Object.values(packageJson?.scripts ?? {}).some((script) => /\bvitest\b/u.test(script))
  );
}

function stringProperty(value: Record<string, unknown>, key: string): string | null {
  const property = value[key];
  return typeof property === "string" && property.trim() !== "" ? property.trim() : null;
}

function engineValue(value: Record<string, unknown>, key: string): string | null {
  const engines = value.engines;

  if (!isRecord(engines)) {
    return null;
  }

  return stringProperty(engines, key);
}

function stringRecordProperty(value: Record<string, unknown>, key: string): Record<string, string> {
  const property = value[key];

  if (!isRecord(property)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(property).filter(
      (entry): entry is [string, string] =>
        typeof entry[0] === "string" && typeof entry[1] === "string"
    )
  );
}

function dependencySet(value: Record<string, unknown>, key: string): Set<string> {
  const property = value[key];

  if (!isRecord(property)) {
    return new Set();
  }

  return new Set(Object.keys(property));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
