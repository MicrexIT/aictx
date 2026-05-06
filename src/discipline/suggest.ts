import { access, readFile } from "node:fs/promises";
import { join } from "node:path";

import fg from "fast-glob";

import { generateObjectId, generateRelationId } from "../core/ids.js";
import type {
  Evidence,
  FacetCategory,
  ObjectFacets,
  ObjectId,
  ObjectStatus,
  ObjectType,
  Predicate,
  RelationConfidence,
  RelationId,
  RelationStatus,
  Source
} from "../core/types.js";
import type { CanonicalStorageSnapshot } from "../storage/read.js";
import type { StoredMemoryObject } from "../storage/objects.js";
import type { StoredMemoryRelation } from "../storage/relations.js";

export type SuggestMode = "from_diff" | "bootstrap" | "after_task";

export interface SuggestReviewPacket {
  mode: SuggestMode;
  changed_files: string[];
  related_memory_ids: ObjectId[];
  possible_stale_ids: ObjectId[];
  recommended_memory: ObjectType[];
  recommended_evidence?: Evidence[];
  recommended_relations?: SuggestedRelation[];
  recommended_facets?: FacetCategory[];
  save_decision_checklist?: string[];
  task?: string;
  agent_checklist: string[];
}

export interface SuggestedRelation {
  from: ObjectId;
  predicate: Predicate;
  to: ObjectId;
  reason: string;
}

export interface BuildSuggestFromDiffPacketOptions {
  changedFiles: readonly string[];
  storage: CanonicalStorageSnapshot;
}

export interface BuildSuggestBootstrapPacketOptions {
  projectRoot: string;
  storage: CanonicalStorageSnapshot;
}

export interface BuildSuggestAfterTaskPacketOptions {
  task: string;
  changedFiles: readonly string[];
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
      facets?: ObjectFacets;
      evidence?: Evidence[];
      source?: Source;
    }
  | {
      op: "create_relation";
      id?: RelationId;
      from: ObjectId;
      predicate: Predicate;
      to: ObjectId;
      status?: RelationStatus;
      confidence?: RelationConfidence;
      evidence?: Evidence[];
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
  "synthesis",
  "decision",
  "constraint",
  "gotcha",
  "workflow",
  "fact"
];
const BOOTSTRAP_RECOMMENDED_MEMORY: ObjectType[] = [
  "project",
  "architecture",
  "source",
  "synthesis",
  "workflow",
  "constraint",
  "gotcha",
  "decision"
];
const AFTER_TASK_RECOMMENDED_MEMORY: ObjectType[] = [
  "synthesis",
  "decision",
  "constraint",
  "gotcha",
  "workflow",
  "fact",
  "question"
];
const RECOMMENDED_FACETS: FacetCategory[] = [
  "decision-rationale",
  "convention",
  "gotcha",
  "workflow",
  "debugging-fact",
  "source",
  "product-intent",
  "feature-map",
  "roadmap",
  "agent-guidance",
  "testing",
  "file-layout",
  "stack",
  "abandoned-attempt",
  "open-question",
  "domain",
  "bounded-context",
  "capability",
  "business-rule"
];
const AGENT_CHECKLIST = [
  "Create memory only for durable future value.",
  "Prefer updating, marking stale, or superseding existing memory over creating duplicates.",
  "Use current code, tests, manifests, and user instructions as evidence.",
  "Right-size memory: atomic for precise claims, source for provenance, synthesis for compact area-level understanding.",
  "Treat failure, confusion, user correction, and memory conflicts as signals to repair durable memory.",
  "Save nothing if the work produced no durable future value."
] as const;
const BOOTSTRAP_PRODUCT_FEATURE_CHECKLIST_ITEM =
  "During setup, capture explicit product features in a maintained feature-map synthesis backed by source records; mark removed or replaced feature memories stale or superseded.";
const AGENT_GUIDANCE_FILES = ["AGENTS.md", "CLAUDE.md"] as const;
const AICTX_MEMORY_START_MARKER = "<!-- aictx-memory:start -->";
const AICTX_MEMORY_END_MARKER = "<!-- aictx-memory:end -->";
const SAVE_DECISION_CHECKLIST = [
  "Save memory only when the task produced durable future value.",
  "Prefer updating, marking stale, or superseding related memory over creating duplicates.",
  "Choose the right layer: atomic memory for precise claims, source records for provenance, synthesis records for compact area-level summaries.",
  "Back durable synthesis memory with source evidence or source provenance relations when possible.",
  "Add facets.category and evidence when creating or updating durable memory.",
  "Use facets.applies_to for relevant files, subsystems, commands, or configs.",
  "Use unresolved-conflict questions when current evidence cannot resolve contradictory active memory.",
  "Record abandoned approaches as active abandoned-attempt memory only when future agents should avoid retrying them."
] as const;
const STALE_CANDIDATE_STATUSES = new Set<ObjectStatus>([
  "active",
  "open",
  "closed"
]);
const BOOTSTRAP_FILE_LIMIT = 40;
const BOOTSTRAP_PRODUCT_FEATURE_LIMIT = 8;
const BOOTSTRAP_DOC_FEATURE_FILE_LIMIT = 8;
const POST_TASK_SCRIPT_PRIORITY = [
  "typecheck",
  "lint",
  "check",
  "test:local",
  "test",
  "test:package",
  "build"
] as const;
const POST_TASK_SCRIPT_NAMES = new Set<string>(POST_TASK_SCRIPT_PRIORITY);
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
  "pages/**/*.{ts,tsx,js,jsx,svelte,md}",
  "routes/**/*.{ts,tsx,js,jsx,svelte,md}",
  "lib/**/*.{ts,tsx,js,jsx,svelte,md}",
  "test/**/*.{ts,tsx,js,jsx,svelte,md}",
  "tests/**/*.{ts,tsx,js,jsx,svelte,md}",
  "docs/**/*.{md,mdx}",
  "specs/**/*.{md,mdx}"
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
const CURRENT_ARCHITECTURE_ID: ObjectId = "architecture.current";
const PROJECT_ARCHITECTURE_PREDICATE: Predicate = "related_to";
const PROJECT_FEATURE_PREDICATE: Predicate = "implements";

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
    recommended_evidence: recommendedFileEvidence(changedFiles),
    recommended_relations: recommendedRelations(options.storage, changedFiles),
    agent_checklist: [...AGENT_CHECKLIST]
  };
}

export function buildSuggestAfterTaskPacket(
  options: BuildSuggestAfterTaskPacketOptions
): SuggestReviewPacket {
  const changedFiles = uniqueSorted(options.changedFiles);

  return {
    mode: "after_task",
    task: options.task,
    changed_files: changedFiles,
    related_memory_ids: relatedMemoryIds(options.storage, changedFiles),
    possible_stale_ids: possibleStaleIds(options.storage, changedFiles),
    recommended_memory: recommendedMemoryForTask(options.task, changedFiles),
    recommended_evidence: recommendedFileEvidence(changedFiles),
    recommended_relations: recommendedRelations(options.storage, changedFiles),
    recommended_facets: recommendedFacetsForTask(options.task, changedFiles, options.storage),
    save_decision_checklist: [...SAVE_DECISION_CHECKLIST],
    agent_checklist: [...AGENT_CHECKLIST]
  };
}

export async function buildSuggestBootstrapPacket(
  options: BuildSuggestBootstrapPacketOptions
): Promise<SuggestReviewPacket> {
  const changedFiles = await bootstrapCandidateFiles(options.projectRoot);
  const analysis = await analyzeBootstrapRepository(options.projectRoot, changedFiles);

  return buildBootstrapPacketFromAnalysis(options.storage, changedFiles, analysis);
}

function buildBootstrapPacketFromAnalysis(
  storage: CanonicalStorageSnapshot,
  changedFiles: readonly string[],
  analysis: BootstrapAnalysis
): SuggestReviewPacket {
  const hasProductFeatures = hasProductFeatureBootstrapSignal(analysis);
  const recommendedFacets = bootstrapRecommendedFacets(analysis);

  return {
    mode: "bootstrap",
    changed_files: [...changedFiles],
    related_memory_ids: relatedMemoryIds(storage, changedFiles),
    possible_stale_ids: possibleStaleIds(storage, changedFiles),
    recommended_memory: recommendedBootstrapMemory(hasProductFeatures),
    ...(recommendedFacets.length === 0 ? {} : { recommended_facets: recommendedFacets }),
    agent_checklist: [...AGENT_CHECKLIST, BOOTSTRAP_PRODUCT_FEATURE_CHECKLIST_ITEM]
  };
}

export async function buildSuggestBootstrapPatchProposal(
  options: BuildSuggestBootstrapPacketOptions
): Promise<SuggestBootstrapPatchProposal> {
  const changedFiles = await bootstrapCandidateFiles(options.projectRoot);
  const analysis = await analyzeBootstrapRepository(options.projectRoot, changedFiles);
  const packet = buildBootstrapPacketFromAnalysis(options.storage, changedFiles, analysis);
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
  agentGuidance: AgentGuidanceInfo[];
  packageJson: PackageJsonInfo | null;
  packageManager: PackageManagerInfo | null;
  productFeatures: ProductFeatureInfo[];
}

interface ReadmeInfo {
  title: string | null;
  summary: string | null;
  features: ProductFeatureInfo[];
}

interface AgentGuidanceInfo {
  path: string;
  conventionStatements: string[];
  verificationCommands: VerificationCommandInfo[];
}

interface VerificationCommandInfo {
  command: string;
  description: string;
  evidence: Evidence[];
}

interface ProductFeatureInfo {
  title: string;
  description: string;
  evidence: Evidence[];
  appliesTo: string[];
  tags: string[];
}

interface PackageJsonInfo {
  name: string | null;
  description: string | null;
  type: string | null;
  packageManager: string | null;
  nodeEngine: string | null;
  scripts: Record<string, string>;
  bin: Record<string, string>;
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
  const readme = await readReadme(projectRoot);
  const agentGuidance = await readAgentGuidance(projectRoot);
  const packageManager = await detectPackageManager(projectRoot, packageJson);
  const codeFeatures = await codeProductFeatures(projectRoot, changedFiles, packageJson);
  const documentedFeatures = await documentedProductFeatures(projectRoot, changedFiles);

  return {
    files: new Set(changedFiles),
    readme,
    agentGuidance,
    packageJson,
    packageManager,
    productFeatures: uniqueProductFeatures([
      ...(readme?.features ?? []),
      ...codeFeatures,
      ...documentedFeatures
    ])
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

  const projectArchitectureRelation = projectArchitectureRelationChange(storage);

  if (projectArchitectureRelation !== null) {
    changes.push(projectArchitectureRelation);
  }

  const bootstrapSources = sourceRecordChanges(storage, analysis);
  changes.push(...bootstrapSources.changes);
  changes.push(...synthesisRecordChanges(storage, analysis, bootstrapSources.byPath));

  const workflow = packageScriptsWorkflow(storage, analysis);

  if (workflow !== null) {
    changes.push(workflow);
  }

  const verificationWorkflow = postTaskVerificationWorkflow(storage, analysis);

  if (verificationWorkflow !== null) {
    changes.push(verificationWorkflow);
  }

  const conventions = codeConventionsConstraint(storage, analysis);

  if (conventions !== null) {
    changes.push(conventions);
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

function recommendedBootstrapMemory(hasProductFeatures: boolean): ObjectType[] {
  return hasProductFeatures
    ? uniqueObjectTypes([...BOOTSTRAP_RECOMMENDED_MEMORY, "synthesis"])
    : [...BOOTSTRAP_RECOMMENDED_MEMORY];
}

function recommendedMemoryForTask(task: string, changedFiles: readonly string[]): ObjectType[] {
  return isProductFeatureTask(task, changedFiles)
    ? uniqueObjectTypes([...AFTER_TASK_RECOMMENDED_MEMORY, "synthesis"])
    : [...AFTER_TASK_RECOMMENDED_MEMORY];
}

function recommendedFacetsForTask(
  task: string,
  changedFiles: readonly string[],
  storage: CanonicalStorageSnapshot
): FacetCategory[] {
  const recommended = new Set<FacetCategory>();
  const taskText = task.toLowerCase();

  if (/\b(test|spec|vitest|coverage)\b/u.test(taskText) || changedFiles.some(isTestPath)) {
    recommended.add("testing");
  }

  if (changedFiles.some(isConfigOrManifestPath)) {
    recommended.add("stack");
    recommended.add("convention");
  }

  if (changedFiles.some(isDocsOrArchitecturePath) || /\b(architecture|design|schema)\b/u.test(taskText)) {
    recommended.add("architecture");
    recommended.add("decision-rationale");
  }

  if (isProductFeatureTask(task, changedFiles)) {
    recommended.add("product-feature");
    recommended.add("capability");
  }

  if (/\b(domain|bounded context|subsystem|product area|business rule)\b/u.test(taskText)) {
    recommended.add("domain");
    recommended.add("bounded-context");
    recommended.add("business-rule");
  }

  for (const facet of RECOMMENDED_FACETS) {
    recommended.add(facet);
  }

  if (hasConflictSignal(taskText) || activeConflictsTouchRelatedMemory(storage, changedFiles)) {
    recommended.add("unresolved-conflict");
  }

  return [...recommended];
}

function hasConflictSignal(taskText: string): boolean {
  return /\b(conflicts?|contradictions?|contradictory|stale|corrections?|corrected|wrong assumptions?|ambiguous|ambiguity)\b/u.test(
    taskText
  );
}

function activeConflictsTouchRelatedMemory(
  storage: CanonicalStorageSnapshot,
  changedFiles: readonly string[]
): boolean {
  const related = new Set(relatedMemoryIds(storage, changedFiles));

  if (related.size === 0) {
    return false;
  }

  return storage.relations.some(
    (relation) =>
      relation.relation.status === "active" &&
      relation.relation.predicate === "conflicts_with" &&
      (related.has(relation.relation.from) || related.has(relation.relation.to))
  );
}

function isTestPath(path: string): boolean {
  return /(?:^|\/)(test|tests|__tests__)\/|\.test\.|\.spec\./u.test(path);
}

function isConfigOrManifestPath(path: string): boolean {
  return /(?:^|\/)(package\.json|pnpm-lock\.yaml|tsconfig[^/]*\.json|vite\.config\.|vitest\.config\.|next\.config\.|svelte\.config\.)/u.test(
    path
  );
}

function isDocsOrArchitecturePath(path: string): boolean {
  return path.startsWith("docs/") || /\.mdx?$/u.test(path);
}

function isProductFeatureTask(task: string, changedFiles: readonly string[]): boolean {
  const taskText = task.toLowerCase();

  return (
    /\b(features?|capabilit(?:y|ies)|product|user-facing|ux|ui|routes?|pages?|screens?)\b/u.test(
      taskText
    ) ||
    changedFiles.some((file) =>
      /(?:^|\/)(app|pages|routes)\/|(?:^|\/)(components|viewer)\/|(?:^|\/)README\.md$/u.test(
        file
      )
    )
  );
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

function projectArchitectureRelationChange(
  storage: CanonicalStorageSnapshot
): BootstrapPatchChange | null {
  const projectObject = objectById(storage, storage.config.project.id);
  const architectureObject = objectById(storage, CURRENT_ARCHITECTURE_ID);

  if (projectObject === null || architectureObject === null) {
    return null;
  }

  if (
    hasEquivalentRelation(
      storage,
      projectObject.sidecar.id,
      PROJECT_ARCHITECTURE_PREDICATE,
      architectureObject.sidecar.id
    )
  ) {
    return null;
  }

  return {
    op: "create_relation",
    id: generateRelationId({
      from: projectObject.sidecar.id,
      predicate: PROJECT_ARCHITECTURE_PREDICATE,
      to: architectureObject.sidecar.id,
      existingIds: storage.relations.map((relation) => relation.relation.id)
    }),
    from: projectObject.sidecar.id,
    predicate: PROJECT_ARCHITECTURE_PREDICATE,
    to: architectureObject.sidecar.id,
    status: "active",
    confidence: "high"
  };
}

function hasEquivalentRelation(
  storage: CanonicalStorageSnapshot,
  from: ObjectId,
  predicate: Predicate,
  to: ObjectId
): boolean {
  return storage.relations.some(
    (relation) =>
      relation.relation.from === from &&
      relation.relation.predicate === predicate &&
      relation.relation.to === to
  );
}

interface BootstrapSourceRecords {
  changes: BootstrapPatchChange[];
  byPath: Map<string, ObjectId>;
}

function sourceRecordChanges(
  storage: CanonicalStorageSnapshot,
  analysis: BootstrapAnalysis
): BootstrapSourceRecords {
  const changes: BootstrapPatchChange[] = [];
  const byPath = new Map<string, ObjectId>();

  for (const path of bootstrapSourcePaths(analysis)) {
    const title = `Source: ${path}`;
    const id = sourceIdForPath(path);
    const existing = similarObject(storage, "source", id, title);
    const sourceId = existing?.sidecar.id ?? id;

    byPath.set(path, sourceId);

    if (existing !== undefined) {
      continue;
    }

    changes.push({
      op: "create_object",
      id,
      type: "source",
      title,
      body: sourceBody(path, analysis),
      tags: ["source"],
      facets: {
        category: "source",
        applies_to: [path],
        load_modes: ["onboarding", "architecture"]
      },
      evidence: [{ kind: "file", id: path }]
    });
  }

  return { changes, byPath };
}

function synthesisRecordChanges(
  storage: CanonicalStorageSnapshot,
  analysis: BootstrapAnalysis,
  sourcesByPath: ReadonlyMap<string, ObjectId>
): BootstrapPatchChange[] {
  const changes: BootstrapPatchChange[] = [];
  const existingRelationIds = new Set(storage.relations.map((relation) => relation.relation.id));

  for (const synthesis of bootstrapSyntheses(analysis, sourcesByPath)) {
    const existing = similarObject(storage, "synthesis", synthesis.id, synthesis.title);
    const synthesisId = existing?.sidecar.id ?? synthesis.id;

    if (existing === undefined) {
      changes.push({
        op: "create_object",
        id: synthesis.id,
        type: "synthesis",
        title: synthesis.title,
        body: synthesis.body,
        tags: synthesis.tags,
        facets: synthesis.facets,
        evidence: synthesis.evidence
      });
    }

    for (const sourceId of synthesis.sourceIds) {
      if (hasEquivalentRelation(storage, synthesisId, "derived_from", sourceId)) {
        continue;
      }

      const relationId = generateRelationId({
        from: synthesisId,
        predicate: "derived_from",
        to: sourceId,
        existingIds: existingRelationIds
      });
      existingRelationIds.add(relationId);
      changes.push({
        op: "create_relation",
        id: relationId,
        from: synthesisId,
        predicate: "derived_from",
        to: sourceId,
        status: "active",
        confidence: "high",
        evidence: [{ kind: "source", id: sourceId }]
      });
    }
  }

  return changes;
}

interface BootstrapSynthesis {
  id: ObjectId;
  title: string;
  body: string;
  tags: string[];
  facets: ObjectFacets;
  evidence: Evidence[];
  sourceIds: ObjectId[];
}

function bootstrapSyntheses(
  analysis: BootstrapAnalysis,
  sourcesByPath: ReadonlyMap<string, ObjectId>
): BootstrapSynthesis[] {
  return [
    productIntentSynthesis(analysis, sourcesByPath),
    featureMapSynthesis(analysis, sourcesByPath),
    agentGuidanceSynthesis(analysis, sourcesByPath)
  ].filter((synthesis): synthesis is BootstrapSynthesis => synthesis !== null);
}

function productIntentSynthesis(
  analysis: BootstrapAnalysis,
  sourcesByPath: ReadonlyMap<string, ObjectId>
): BootstrapSynthesis | null {
  const purpose = analysis.packageJson?.description ?? analysis.readme?.summary;

  if (purpose === undefined || purpose === null || purpose === "") {
    return null;
  }

  const sourceIds = sourceIdsForPaths(sourcesByPath, ["README.md", "package.json"]);

  return {
    id: "synthesis.product-intent",
    title: "Product intent",
    body: [
      "# Product intent",
      "",
      purpose,
      "",
      "Maintain this synthesis when the project's purpose, user promise, or product direction changes.",
      ""
    ].join("\n"),
    tags: ["synthesis", "product-intent"],
    facets: {
      category: "product-intent",
      load_modes: ["coding", "architecture", "onboarding"]
    },
    evidence: sourceEvidence(sourceIds),
    sourceIds
  };
}

function featureMapSynthesis(
  analysis: BootstrapAnalysis,
  sourcesByPath: ReadonlyMap<string, ObjectId>
): BootstrapSynthesis | null {
  const features = analysis.productFeatures.slice(0, BOOTSTRAP_PRODUCT_FEATURE_LIMIT);

  if (features.length === 0) {
    return null;
  }

  const sourceIds = sourceIdsForEvidence(sourcesByPath, features.flatMap((feature) => feature.evidence));

  return {
    id: "synthesis.feature-map",
    title: "Feature map",
    body: [
      "# Feature map",
      "",
      "Current product capabilities inferred from durable repository evidence:",
      ...features.map((feature) => `- ${feature.title}: ${feature.description}`),
      "",
      "Update this synthesis when features are added, removed, renamed, or replaced.",
      ""
    ].join("\n"),
    tags: ["synthesis", "features"],
    facets: {
      category: "feature-map",
      applies_to: uniqueSorted(features.flatMap((feature) => feature.appliesTo)),
      load_modes: ["coding", "onboarding"]
    },
    evidence: sourceEvidence(sourceIds),
    sourceIds
  };
}

function agentGuidanceSynthesis(
  analysis: BootstrapAnalysis,
  sourcesByPath: ReadonlyMap<string, ObjectId>
): BootstrapSynthesis | null {
  const statements = uniqueSorted(
    analysis.agentGuidance.flatMap((guidance) => guidance.conventionStatements)
  ).slice(0, 8);
  const commands = postTaskVerificationCommands(analysis).slice(0, 6);

  if (statements.length === 0 && commands.length === 0) {
    return null;
  }

  const paths = analysis.agentGuidance.map((guidance) => guidance.path);
  const sourceIds = sourceIdsForPaths(sourcesByPath, paths);

  return {
    id: "synthesis.agent-guidance",
    title: "Agent guidance",
    body: [
      "# Agent guidance",
      "",
      ...statements.map((statement) => `- ${statement}`),
      ...(commands.length === 0
        ? []
        : [
            "",
            "Verification workflows:",
            ...commands.map((command) => `- ${command.command}: ${command.description}`)
          ]),
      "",
      "Update this synthesis when agent instructions, conventions, or verification workflows change.",
      ""
    ].join("\n"),
    tags: ["synthesis", "agents", "guidance"],
    facets: {
      category: "agent-guidance",
      applies_to: paths,
      load_modes: ["coding", "review", "onboarding"]
    },
    evidence: sourceEvidence(sourceIds),
    sourceIds
  };
}

function bootstrapSourcePaths(analysis: BootstrapAnalysis): string[] {
  return uniqueSorted([
    ...(analysis.readme === null ? [] : ["README.md"]),
    ...(analysis.packageJson === null ? [] : ["package.json"]),
    ...(analysis.packageManager === null ? [] : [analysis.packageManager.source]),
    ...analysis.agentGuidance.map((guidance) => guidance.path),
    ...[
      "specs/prd.md",
      "docs/src/content/docs/agent-integration.md",
      "integrations/templates/agent-guidance.md"
    ].filter((path) => analysis.files.has(path))
  ]).slice(0, 10);
}

function sourceBody(path: string, analysis: BootstrapAnalysis): string {
  const details = sourceDetails(path, analysis);

  return [
    `# Source: ${path}`,
    "",
    `This source records that durable Aictx memory can be derived from \`${path}\`.`,
    ...(details.length === 0 ? [] : ["", "Captured signals:", ...details.map((detail) => `- ${detail}`)]),
    ""
  ].join("\n");
}

function sourceDetails(path: string, analysis: BootstrapAnalysis): string[] {
  if (path === "README.md") {
    return [
      ...(analysis.readme?.title === null || analysis.readme?.title === undefined
        ? []
        : [`README title: ${analysis.readme.title}`]),
      ...(analysis.readme?.summary === null || analysis.readme?.summary === undefined
        ? []
        : [`README summary: ${analysis.readme.summary}`])
    ];
  }

  if (path === "package.json") {
    return [
      ...(analysis.packageJson?.name === null || analysis.packageJson?.name === undefined
        ? []
        : [`Package name: ${analysis.packageJson.name}`]),
      ...(analysis.packageJson?.description === null || analysis.packageJson?.description === undefined
        ? []
        : [`Package description: ${analysis.packageJson.description}`])
    ];
  }

  if (analysis.agentGuidance.some((guidance) => guidance.path === path)) {
    return ["Agent guidance file with conventions or verification workflows."];
  }

  return [];
}

function sourceIdForPath(path: string): ObjectId {
  const slug = path
    .toLowerCase()
    .replace(/\.(?:md|mdx)$/u, "")
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");

  return `source.${slug === "" ? "record" : slug}` as ObjectId;
}

function sourceIdsForPaths(
  sourcesByPath: ReadonlyMap<string, ObjectId>,
  paths: readonly string[]
): ObjectId[] {
  return uniqueSorted(paths.map((path) => sourcesByPath.get(path)).filter(isString));
}

function sourceIdsForEvidence(
  sourcesByPath: ReadonlyMap<string, ObjectId>,
  evidence: readonly Evidence[]
): ObjectId[] {
  const paths = evidence
    .filter((item) => item.kind === "file")
    .map((item) => item.id)
    .filter((path) => sourcesByPath.has(path));

  return sourceIdsForPaths(sourcesByPath, paths);
}

function sourceEvidence(sourceIds: readonly ObjectId[]): Evidence[] {
  return sourceIds.map((id) => ({ kind: "source", id }));
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

function postTaskVerificationWorkflow(
  storage: CanonicalStorageSnapshot,
  analysis: BootstrapAnalysis
): BootstrapPatchChange | null {
  if (
    hasSimilarObject(
      storage,
      "workflow",
      "workflow.post-task-verification",
      "Post-task verification"
    )
  ) {
    return null;
  }

  const commands = postTaskVerificationCommands(analysis).slice(0, 8);

  if (commands.length === 0) {
    return null;
  }

  const appliesTo = uniqueSorted(
    commands.flatMap((command) => command.evidence.map((evidence) => evidence.id))
  );

  return {
    op: "create_object",
    id: "workflow.post-task-verification",
    type: "workflow",
    title: "Post-task verification",
    body: [
      "# Post-task verification",
      "",
      "After meaningful code changes, prefer these repo verification commands when relevant:",
      ...commands.map((command) => `- \`${command.command}\`: ${command.description}`),
      ""
    ].join("\n"),
    tags: ["verification", "testing", "workflow"],
    facets: {
      category: "testing",
      applies_to: appliesTo,
      load_modes: ["coding", "debugging", "review"]
    },
    evidence: appliesTo.map((path) => ({ kind: "file", id: path }))
  };
}

function postTaskVerificationCommands(analysis: BootstrapAnalysis): VerificationCommandInfo[] {
  const commands: VerificationCommandInfo[] = [];
  const scripts = analysis.packageJson?.scripts ?? {};
  const manager = analysis.packageManager?.manager ?? "npm";
  const scriptNames = Object.keys(scripts)
    .filter((name) => isPostTaskScriptName(name))
    .sort(comparePostTaskScriptNames);

  for (const name of scriptNames) {
    const script = scripts[name];

    if (script === undefined) {
      continue;
    }

    commands.push({
      command: packageScriptCommand(manager, name),
      description: `package.json script \`${name}\`: \`${script}\``,
      evidence: [{ kind: "file", id: "package.json" }]
    });
  }

  for (const guidance of analysis.agentGuidance) {
    commands.push(...guidance.verificationCommands);
  }

  return uniqueVerificationCommands(commands);
}

function isPostTaskScriptName(name: string): boolean {
  return POST_TASK_SCRIPT_NAMES.has(name) || /^(?:test|lint|typecheck|check)(?::|$)/u.test(name);
}

function comparePostTaskScriptNames(left: string, right: string): number {
  const leftPriority = postTaskScriptPriority(left);
  const rightPriority = postTaskScriptPriority(right);

  if (leftPriority !== rightPriority) {
    return leftPriority - rightPriority;
  }

  return left.localeCompare(right);
}

function postTaskScriptPriority(name: string): number {
  const directIndex = POST_TASK_SCRIPT_PRIORITY.indexOf(
    name as (typeof POST_TASK_SCRIPT_PRIORITY)[number]
  );

  if (directIndex !== -1) {
    return directIndex;
  }

  if (name.startsWith("typecheck")) {
    return 0;
  }

  if (name.startsWith("lint")) {
    return 1;
  }

  if (name.startsWith("check")) {
    return 2;
  }

  if (name.startsWith("test")) {
    return 3;
  }

  return POST_TASK_SCRIPT_PRIORITY.length;
}

function packageScriptCommand(manager: string, name: string): string {
  return `${manager} run ${name}`;
}

function uniqueVerificationCommands(
  commands: readonly VerificationCommandInfo[]
): VerificationCommandInfo[] {
  const seen = new Set<string>();
  const unique: VerificationCommandInfo[] = [];

  for (const command of commands) {
    const normalized = command.command.toLowerCase();

    if (seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    unique.push(command);
  }

  return unique;
}

function codeConventionsConstraint(
  storage: CanonicalStorageSnapshot,
  analysis: BootstrapAnalysis
): BootstrapPatchChange | null {
  if (
    hasSimilarObject(storage, "constraint", "constraint.code-conventions", "Code conventions")
  ) {
    return null;
  }

  const statements = uniqueSorted(
    analysis.agentGuidance.flatMap((guidance) => guidance.conventionStatements)
  ).slice(0, 8);

  if (statements.length === 0) {
    return null;
  }

  const appliesTo = analysis.agentGuidance
    .filter((guidance) => guidance.conventionStatements.length > 0)
    .map((guidance) => guidance.path)
    .sort();

  return {
    op: "create_object",
    id: "constraint.code-conventions",
    type: "constraint",
    title: "Code conventions",
    body: [
      "# Code conventions",
      "",
      "Follow these explicit repo instructions from agent guidance files:",
      ...statements.map((statement) => `- ${statement}`),
      ""
    ].join("\n"),
    tags: ["convention", "code-style", "agents"],
    facets: {
      category: "convention",
      applies_to: appliesTo,
      load_modes: ["coding", "review"]
    },
    evidence: appliesTo.map((path) => ({ kind: "file", id: path }))
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

function productFeatureConcepts(
  storage: CanonicalStorageSnapshot,
  analysis: BootstrapAnalysis
): BootstrapPatchChange[] {
  const features = analysis.productFeatures;

  if (features.length === 0) {
    return [];
  }

  const existingIds = new Set(storage.objects.map((object) => object.sidecar.id));
  const existingRelationIds = new Set(storage.relations.map((relation) => relation.relation.id));
  const projectObject = objectById(storage, storage.config.project.id);
  const changes: BootstrapPatchChange[] = [];

  for (const feature of features.slice(0, BOOTSTRAP_PRODUCT_FEATURE_LIMIT)) {
    const title = `Feature: ${feature.title}`;
    const baseId = generateObjectId({
      type: "concept",
      title
    });
    const existingFeature = similarObject(storage, "concept", baseId, title);
    const featureId =
      existingFeature?.sidecar.id ??
      generateObjectId({
        type: "concept",
        title,
        existingIds
      });

    if (existingFeature === undefined) {
      existingIds.add(featureId);

      changes.push({
        op: "create_object",
        id: featureId,
        type: "concept",
        title,
        body: [`# ${title}`, "", feature.description, ""].join("\n"),
        tags: feature.tags,
        facets: {
          category: "product-feature",
          applies_to: feature.appliesTo,
          load_modes: ["coding", "onboarding"]
        },
        evidence: feature.evidence
      });
    }

    if (
      projectObject === null ||
      hasEquivalentRelation(
        storage,
        projectObject.sidecar.id,
        PROJECT_FEATURE_PREDICATE,
        featureId
      )
    ) {
      continue;
    }

    const relationId = generateRelationId({
      from: projectObject.sidecar.id,
      predicate: PROJECT_FEATURE_PREDICATE,
      to: featureId,
      existingIds: existingRelationIds
    });
    existingRelationIds.add(relationId);

    changes.push({
      op: "create_relation",
      id: relationId,
      from: projectObject.sidecar.id,
      predicate: PROJECT_FEATURE_PREDICATE,
      to: featureId,
      status: "active",
      confidence: "high",
      evidence: feature.evidence
    });
  }

  return changes;
}

function hasProductFeatureBootstrapSignal(analysis: BootstrapAnalysis): boolean {
  return (
    analysis.productFeatures.length > 0 ||
    [...analysis.files].some((file) =>
      routeProductFeature(file) !== null ||
      /(?:^src\/cli\/commands\/.*\.ts$|^src\/cli\/main\.ts$)/u.test(file)
    )
  );
}

function bootstrapRecommendedFacets(analysis: BootstrapAnalysis): FacetCategory[] {
  const facets: FacetCategory[] = [];

  if (hasProductFeatureBootstrapSignal(analysis)) {
    facets.push("product-feature");
  }

  if (postTaskVerificationCommands(analysis).length > 0) {
    facets.push("testing");
  }

  if (analysis.agentGuidance.some((guidance) => guidance.conventionStatements.length > 0)) {
    facets.push("convention");
  }

  return facets;
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
    summary,
    features: markdownProductFeatures(lines, "README.md")
  };
}

async function readAgentGuidance(projectRoot: string): Promise<AgentGuidanceInfo[]> {
  const guidance: AgentGuidanceInfo[] = [];

  for (const path of AGENT_GUIDANCE_FILES) {
    const raw = await readUtf8IfExists(projectRoot, path);

    if (raw === null) {
      continue;
    }

    const contents = stripAictxMemoryBlocks(raw);
    const conventionStatements = extractConventionStatements(contents);
    const verificationCommands = extractVerificationCommands(contents, path);

    if (conventionStatements.length === 0 && verificationCommands.length === 0) {
      continue;
    }

    guidance.push({
      path,
      conventionStatements,
      verificationCommands
    });
  }

  return guidance;
}

function stripAictxMemoryBlocks(contents: string): string {
  let remaining = contents;

  for (;;) {
    const start = remaining.indexOf(AICTX_MEMORY_START_MARKER);

    if (start === -1) {
      return remaining;
    }

    const end = remaining.indexOf(AICTX_MEMORY_END_MARKER, start);

    if (end === -1) {
      return remaining.slice(0, start);
    }

    remaining = `${remaining.slice(0, start)}${remaining.slice(
      end + AICTX_MEMORY_END_MARKER.length
    )}`;
  }
}

function extractConventionStatements(contents: string): string[] {
  const statements: string[] = [];
  let inFence = false;
  let inConventionSection = false;

  for (const line of contents.split(/\r\n|\n|\r/u)) {
    const trimmed = line.trim();

    if (trimmed.startsWith("```") || trimmed.startsWith("~~~")) {
      inFence = !inFence;
      continue;
    }

    if (inFence || trimmed === "") {
      continue;
    }

    const heading = /^#{1,6}\s+(.+?)\s*$/u.exec(trimmed);

    if (heading !== null) {
      inConventionSection = isConventionHeading(heading[1] ?? "");
      continue;
    }

    const bullet = /^(?:[-*+]\s+|\d+\.\s+)(.+?)\s*$/u.exec(trimmed);
    const candidate = cleanMarkdownText((bullet?.[1] ?? trimmed).replace(/^\[[ xX]\]\s+/u, ""));

    if (
      candidate === "" ||
      containsVerificationCommand(candidate) ||
      (!inConventionSection && !isStrongConventionStatement(candidate))
    ) {
      continue;
    }

    statements.push(truncateSentence(candidate, 180));

    if (statements.length >= 12) {
      break;
    }
  }

  return uniqueSorted(statements);
}

function isConventionHeading(value: string): boolean {
  return /\b(?:code\s+)?(?:conventions?|style|standards?|guidelines?|instructions?)\b/iu.test(
    cleanMarkdownText(value)
  );
}

function isStrongConventionStatement(value: string): boolean {
  return (
    /\b(?:prefer|use|avoid|do not|don't|never|must|should|keep|write|default to)\b/iu.test(
      value
    ) &&
    /\b(?:code|TypeScript|JavaScript|tests?|lint|format|style|components?|files?|imports?|errors?|comments?|ASCII|schema|API)\b/iu.test(
      value
    )
  );
}

function extractVerificationCommands(
  contents: string,
  path: string
): VerificationCommandInfo[] {
  const commands: VerificationCommandInfo[] = [];
  let inFence = false;

  for (const line of contents.split(/\r\n|\n|\r/u)) {
    const trimmed = line.trim();

    if (trimmed.startsWith("```") || trimmed.startsWith("~~~")) {
      inFence = !inFence;
      continue;
    }

    const candidates = [
      ...[...trimmed.matchAll(/`([^`]+)`/gu)].map((match) => match[1] ?? ""),
      ...(inFence ? [trimmed] : [])
    ];

    for (const candidate of candidates.flatMap(splitShellCommands)) {
      const command = cleanCommand(candidate);

      if (command === "" || !isVerificationCommand(command)) {
        continue;
      }

      commands.push({
        command,
        description: `explicitly documented in \`${path}\``,
        evidence: [{ kind: "file", id: path }]
      });
    }
  }

  return uniqueVerificationCommands(commands);
}

function splitShellCommands(value: string): string[] {
  return value
    .split(/\s+(?:&&|\|\|)\s+/u)
    .map((command) => command.trim())
    .filter((command) => command !== "");
}

function cleanCommand(value: string): string {
  return value
    .replace(/^\$\s*/u, "")
    .replace(/^[#>-]\s*/u, "")
    .replace(/[.;,]\s*$/u, "")
    .replace(/\s+/gu, " ")
    .trim();
}

function isVerificationCommand(value: string): boolean {
  return /^(?:(?:pnpm|npm|yarn|bun)\s+(?:run\s+)?(?:typecheck|lint|test|check|build)(?::[a-z0-9:_-]+)?\b|(?:tsc|svelte-check|vitest|eslint|biome|prettier)\b)/iu.test(
    value
  );
}

function containsVerificationCommand(value: string): boolean {
  return /(?:^|\b)(?:(?:pnpm|npm|yarn|bun)\s+(?:run\s+)?(?:typecheck|lint|test|check|build)(?::[a-z0-9:_-]+)?\b|(?:tsc|svelte-check|vitest|eslint|biome|prettier)\b)/iu.test(
    value
  );
}

function markdownProductFeatures(
  lines: readonly string[],
  relativePath: string
): ProductFeatureInfo[] {
  const features: ProductFeatureInfo[] = [];
  let inFence = false;
  let inFeatureSection = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith("```") || trimmed.startsWith("~~~")) {
      inFence = !inFence;
      continue;
    }

    if (inFence) {
      continue;
    }

    const heading = /^#{1,6}\s+(.+?)\s*$/u.exec(trimmed);

    if (heading !== null) {
      inFeatureSection = isProductFeatureHeading(heading[1] ?? "");
      continue;
    }

    if (!inFeatureSection) {
      continue;
    }

    const bullet = /^(?:[-*+]\s+|\d+\.\s+)(.+?)\s*$/u.exec(trimmed);

    if (bullet === null) {
      continue;
    }

    const description = cleanMarkdownText((bullet[1] ?? "").replace(/^\[[ xX]\]\s+/u, ""));

    if (description === "") {
      continue;
    }

    const title = featureTitle(description);
    features.push({
      title,
      description,
      evidence: [{ kind: "file", id: relativePath }],
      appliesTo: [relativePath],
      tags: productFeatureTags(title)
    });

    if (features.length >= BOOTSTRAP_PRODUCT_FEATURE_LIMIT) {
      return features;
    }
  }

  return features;
}

function isProductFeatureHeading(value: string): boolean {
  return /\b(features?|capabilit(?:y|ies)|functionality|what it does)\b/iu.test(
    cleanMarkdownText(value)
  );
}

function featureTitle(description: string): string {
  const splitTitle = /^(.{1,80}?)(?::\s+| - | -- )/u.exec(description)?.[1]?.trim();
  const title = splitTitle === undefined ? truncateSentence(description, 80) : splitTitle;

  return title.replace(/[.:;,\s]+$/u, "");
}

function productFeatureTags(title: string): string[] {
  return uniqueSorted(["feature", "product", ...[...tokenize(title)].slice(0, 4)]);
}

async function documentedProductFeatures(
  projectRoot: string,
  changedFiles: readonly string[]
): Promise<ProductFeatureInfo[]> {
  const features: ProductFeatureInfo[] = [];
  const docs = changedFiles
    .filter((file) => file.startsWith("docs/") && /\.mdx?$/u.test(file))
    .slice(0, BOOTSTRAP_DOC_FEATURE_FILE_LIMIT);

  for (const file of docs) {
    const contents = await readUtf8IfExists(projectRoot, file);

    if (contents === null) {
      continue;
    }

    features.push(...markdownProductFeatures(contents.split(/\r\n|\n|\r/u), file));

    if (features.length >= BOOTSTRAP_PRODUCT_FEATURE_LIMIT) {
      return features.slice(0, BOOTSTRAP_PRODUCT_FEATURE_LIMIT);
    }
  }

  return features;
}

async function codeProductFeatures(
  projectRoot: string,
  changedFiles: readonly string[],
  packageJson: PackageJsonInfo | null
): Promise<ProductFeatureInfo[]> {
  const features: ProductFeatureInfo[] = [
    ...packageBinProductFeatures(packageJson),
    ...(await cliCommandProductFeatures(projectRoot, changedFiles)),
    ...routeProductFeatures(changedFiles)
  ];

  return features.slice(0, BOOTSTRAP_PRODUCT_FEATURE_LIMIT);
}

function packageBinProductFeatures(packageJson: PackageJsonInfo | null): ProductFeatureInfo[] {
  if (packageJson === null) {
    return [];
  }

  return Object.entries(packageJson.bin)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, target]) => ({
      title: `CLI binary ${name}`,
      description: `The \`${name}\` executable is published by \`package.json\` and points to \`${target}\`.`,
      evidence: [{ kind: "file", id: "package.json" }],
      appliesTo: ["package.json"],
      tags: productFeatureTags(`CLI binary ${name}`)
    }));
}

async function cliCommandProductFeatures(
  projectRoot: string,
  changedFiles: readonly string[]
): Promise<ProductFeatureInfo[]> {
  const features: ProductFeatureInfo[] = [];
  const commandFiles = changedFiles.filter((file) =>
    /(?:^src\/cli\/commands\/.*\.ts$|^src\/cli\/main\.ts$)/u.test(file)
  );

  for (const file of commandFiles) {
    const contents = await readUtf8IfExists(projectRoot, file);

    if (contents === null) {
      continue;
    }

    for (const command of extractCliCommandDescriptions(contents)) {
      features.push({
        title: `CLI command ${command.name}`,
        description: `The \`${command.name}\` CLI command ${lowercaseFirst(
          ensureTerminalPeriod(command.description)
        )}`,
        evidence: [{ kind: "file", id: file }],
        appliesTo: [file],
        tags: productFeatureTags(`CLI command ${command.name}`)
      });

      if (features.length >= BOOTSTRAP_PRODUCT_FEATURE_LIMIT) {
        return features;
      }
    }
  }

  return features;
}

function extractCliCommandDescriptions(
  contents: string
): Array<{ name: string; description: string }> {
  const descriptions: Array<{ name: string; description: string }> = [];
  const commandPattern =
    /\.command\(\s*["`]([^"`]+?)["`]\s*\)[\s\S]{0,320}?\.description\(\s*["`]([^"`]+?)["`]\s*\)/gu;

  for (const match of contents.matchAll(commandPattern)) {
    const rawName = match[1]?.trim() ?? "";
    const description = cleanMarkdownText(match[2] ?? "");
    const name = rawName.split(/\s+/u)[0]?.trim();

    if (name === undefined || name === "" || description === "") {
      continue;
    }

    descriptions.push({ name, description });
  }

  return descriptions;
}

function routeProductFeatures(changedFiles: readonly string[]): ProductFeatureInfo[] {
  return changedFiles
    .map(routeProductFeature)
    .filter((feature): feature is ProductFeatureInfo => feature !== null);
}

function routeProductFeature(file: string): ProductFeatureInfo | null {
  const route = routePath(file);

  if (route === null) {
    return null;
  }

  return {
    title: `Route ${route}`,
    description: `The \`${route}\` route surface is implemented by \`${file}\`.`,
    evidence: [{ kind: "file", id: file }],
    appliesTo: [file],
    tags: productFeatureTags(`Route ${route}`)
  };
}

function routePath(file: string): string | null {
  const appMatch = /^app\/(.+?)\/page\.(?:tsx?|jsx?|svelte)$/u.exec(file);

  if (appMatch !== null) {
    return normalizeRoutePath(appMatch[1] ?? "");
  }

  if (/^app\/page\.(?:tsx?|jsx?|svelte)$/u.test(file)) {
    return "/";
  }

  const pagesMatch = /^pages\/(.+?)\.(?:tsx?|jsx?|svelte)$/u.exec(file);

  if (pagesMatch !== null) {
    return normalizeRoutePath(pagesMatch[1] ?? "");
  }

  const svelteKitMatch = /^src\/routes\/(.+?)\/\+page\.svelte$/u.exec(file);

  if (svelteKitMatch !== null) {
    return normalizeRoutePath(svelteKitMatch[1] ?? "");
  }

  if (file === "src/routes/+page.svelte" || file === "routes/+page.svelte") {
    return "/";
  }

  const topLevelSvelteKitMatch = /^routes\/(.+?)\/\+page\.svelte$/u.exec(file);

  if (topLevelSvelteKitMatch !== null) {
    return normalizeRoutePath(topLevelSvelteKitMatch[1] ?? "");
  }

  const routesMatch = /^routes\/(.+?)\.(?:tsx?|jsx?|svelte)$/u.exec(file);

  if (routesMatch !== null) {
    return normalizeRoutePath(routesMatch[1] ?? "");
  }

  return null;
}

function normalizeRoutePath(value: string): string {
  const withoutIndex = value.replace(/(?:^|\/)index$/u, "");
  const segments = withoutIndex
    .split("/")
    .filter((segment) => segment !== "" && !/^\(.+\)$/u.test(segment));

  return segments.length === 0 ? "/" : `/${segments.join("/")}`;
}

function uniqueProductFeatures(features: readonly ProductFeatureInfo[]): ProductFeatureInfo[] {
  const seen = new Set<string>();
  const unique: ProductFeatureInfo[] = [];

  for (const feature of features) {
    const key = feature.title.toLowerCase();

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(feature);

    if (unique.length >= BOOTSTRAP_PRODUCT_FEATURE_LIMIT) {
      return unique;
    }
  }

  return unique;
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
    bin: binRecordProperty(value),
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

function ensureTerminalPeriod(value: string): string {
  return /[.!?]$/u.test(value) ? value : `${value}.`;
}

function lowercaseFirst(value: string): string {
  const first = value[0];

  if (first === undefined) {
    return value;
  }

  return `${first.toLowerCase()}${value.slice(1)}`;
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
  return similarObject(storage, type, id, title) !== undefined;
}

function similarObject(
  storage: CanonicalStorageSnapshot,
  type: ObjectType,
  id: ObjectId,
  title: string
): StoredMemoryObject | undefined {
  const normalizedTitle = title.toLowerCase();

  return storage.objects.find(
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

function binRecordProperty(value: Record<string, unknown>): Record<string, string> {
  const property = value.bin;

  if (typeof property === "string") {
    const name = stringProperty(value, "name");
    return name === null ? {} : { [name]: property };
  }

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

function isString(value: unknown): value is string {
  return typeof value === "string";
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

function recommendedFileEvidence(changedFiles: readonly string[]): Evidence[] {
  return uniqueSorted(changedFiles)
    .filter((file) => !file.startsWith(".aictx/"))
    .slice(0, 12)
    .map((file) => ({ kind: "file", id: file }));
}

function recommendedRelations(
  storage: CanonicalStorageSnapshot,
  changedFiles: readonly string[]
): SuggestedRelation[] {
  const related = storage.objects
    .filter((object) => ["active", "open"].includes(object.sidecar.status))
    .filter((object) => objectMatchesFiles(object, changedFiles))
    .sort(compareObjectsById);
  const suggestions: SuggestedRelation[] = [];

  for (const [index, left] of related.entries()) {
    for (const right of related.slice(index + 1)) {
      if (hasAnyRelation(storage, left.sidecar.id, right.sidecar.id)) {
        continue;
      }

      const suggested = relationSuggestion(left, right);

      if (suggested !== null) {
        suggestions.push(suggested);
      }

      if (suggestions.length >= 8) {
        return suggestions;
      }
    }
  }

  return suggestions;
}

function relationSuggestion(
  left: StoredMemoryObject,
  right: StoredMemoryObject
): SuggestedRelation | null {
  const ordered = orderRelationEndpoints(left, right);

  if (ordered === null) {
    return null;
  }

  return {
    from: ordered.from.sidecar.id,
    predicate: ordered.predicate,
    to: ordered.to.sidecar.id,
    reason: "Related memory overlaps changed files but has no direct relation."
  };
}

function orderRelationEndpoints(
  left: StoredMemoryObject,
  right: StoredMemoryObject
): { from: StoredMemoryObject; predicate: Predicate; to: StoredMemoryObject } | null {
  if (left.sidecar.type === "decision" && right.sidecar.type === "constraint") {
    return { from: left, predicate: "requires", to: right };
  }

  if (right.sidecar.type === "decision" && left.sidecar.type === "constraint") {
    return { from: right, predicate: "requires", to: left };
  }

  if (left.sidecar.type === "gotcha") {
    return { from: left, predicate: "affects", to: right };
  }

  if (right.sidecar.type === "gotcha") {
    return { from: right, predicate: "affects", to: left };
  }

  if (left.sidecar.type === "architecture") {
    return { from: left, predicate: "mentions", to: right };
  }

  if (right.sidecar.type === "architecture") {
    return { from: right, predicate: "mentions", to: left };
  }

  return { from: left, predicate: "mentions", to: right };
}

function hasAnyRelation(
  storage: CanonicalStorageSnapshot,
  left: ObjectId,
  right: ObjectId
): boolean {
  return storage.relations.some(
    (relation) =>
      relation.relation.status === "active" &&
      ((relation.relation.from === left && relation.relation.to === right) ||
        (relation.relation.from === right && relation.relation.to === left))
  );
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
  const facets = object.sidecar.facets;

  return normalizeForSearch(
    [
      object.path,
      object.bodyPath,
      object.sidecar.id,
      object.sidecar.title,
      ...(object.sidecar.tags ?? []),
      facets?.category ?? "",
      ...(facets?.applies_to ?? []),
      ...(facets?.load_modes ?? []),
      ...(object.sidecar.evidence ?? []).map((item) => item.id),
      object.body
    ].join("\n")
  );
}

function compareObjectsById(
  left: StoredMemoryObject,
  right: StoredMemoryObject
): number {
  return left.sidecar.id.localeCompare(right.sidecar.id);
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

  if (
    file.startsWith("src/") ||
    file.startsWith("app/") ||
    file.startsWith("pages/") ||
    file.startsWith("routes/") ||
    file.startsWith("lib/")
  ) {
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

function uniqueObjectTypes(values: readonly ObjectType[]): ObjectType[] {
  return [...new Set(values)];
}
