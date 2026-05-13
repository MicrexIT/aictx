#!/usr/bin/env node

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_OUT_FILE = "src/viewer/demo-data.generated.json";
const DEMO_REGISTRY_ID = "demo";
const DEMO_TOKEN = "demo";
const DEMO_PROJECT_ROOT = "demo://aictx";
const DEMO_AICTX_ROOT = "demo://aictx/.aictx";
const DEFAULT_TOKEN_BUDGET = 6000;

const DEMO_MEMORY_IDS = [
  "project.aictx",
  "architecture.current",
  "constraint.node-engine",
  "constraint.package-manager",
  "source.docs-src-content-docs-agent-integration",
  "source.package-json",
  "source.readme",
  "synthesis.agent-guidance",
  "synthesis.conventions-quality",
  "synthesis.feature-map",
  "synthesis.product-intent",
  "synthesis.repository-map",
  "synthesis.stack-and-tooling",
  "workflow.package-scripts",
  "workflow.post-task-verification"
];

const SECRET_PATTERNS = [
  /sk_(?:live|test)_[A-Za-z0-9]{16,}/,
  /sk-[A-Za-z0-9]{20,}/,
  /ghp_[A-Za-z0-9_]{20,}/,
  /(?:password|passwd|secret|api[_-]?key|access[_-]?token|auth[_-]?token)\s*[:=]\s*["'][^"'\s]{12,}["']/i,
  /Authorization:\s*Bearer\s+[A-Za-z0-9._~+/=-]{20,}/i
];

const LOCAL_STATE_PATTERNS = [
  /\.aictx\/(?:index|context|\.backup|\.lock|exports|recovery)\b/,
  /\/Users\/[^"'\s`)]+/,
  /\/home\/[^"'\s`)]+/
];

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const projectRoot = resolve(args.projectRoot ?? process.cwd());
  const outFile = resolve(projectRoot, args.out ?? DEFAULT_OUT_FILE);
  const data = await buildDemoData({ projectRoot });

  await assertDemoDataIsSafe(data, projectRoot);
  await mkdir(dirname(outFile), { recursive: true });
  await writeFile(outFile, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function buildDemoData({ projectRoot }) {
  const aictxRoot = resolve(projectRoot, ".aictx");
  const config = await readJson(resolve(aictxRoot, "config.json"));
  const allowlist = new Set(DEMO_MEMORY_IDS);
  const objectSidecarPaths = await collectJsonFiles(resolve(aictxRoot, "memory"));
  const objects = [];

  for (const sidecarPath of objectSidecarPaths) {
    const sidecar = await readJson(sidecarPath);

    if (!allowlist.has(sidecar.id)) {
      continue;
    }

    const bodyPath = normalizeProjectPath(`.aictx/${sidecar.body_path}`);
    const markdownPath = resolve(aictxRoot, sidecar.body_path);
    const body = await readFile(markdownPath, "utf8");
    const jsonPath = normalizeProjectPath(relative(projectRoot, sidecarPath));

    objects.push(summarizeObject(sidecar, {
      body: sanitizeText(body, projectRoot),
      bodyPath,
      jsonPath,
      projectId: config.project.id
    }));
  }

  const missingIds = DEMO_MEMORY_IDS.filter((id) => !objects.some((object) => object.id === id));

  if (missingIds.length > 0) {
    throw new Error(`Demo memory allowlist contains missing object ids: ${missingIds.join(", ")}`);
  }

  objects.sort(compareById);

  const objectIds = new Set(objects.map((object) => object.id));
  const relationSidecarPaths = await collectJsonFiles(resolve(aictxRoot, "relations"));
  const relations = [];

  for (const relationPath of relationSidecarPaths) {
    const relation = await readJson(relationPath);

    if (!objectIds.has(relation.from) || !objectIds.has(relation.to)) {
      continue;
    }

    relations.push(summarizeRelation(relation, normalizeProjectPath(relative(projectRoot, relationPath))));
  }

  relations.sort(compareById);

  const bootstrap = {
    project: {
      id: config.project.id,
      name: config.project.name
    },
    objects,
    relations,
    counts: {
      objects: objects.length,
      relations: relations.length,
      stale_objects: objects.filter((object) => object.status === "stale").length,
      superseded_objects: objects.filter((object) => object.status === "superseded").length,
      source_objects: objects.filter((object) => object.type === "source").length,
      synthesis_objects: objects.filter((object) => object.type === "synthesis").length,
      active_relations: relations.filter((relation) => relation.status === "active").length
    },
    role_coverage: emptyRoleCoverage(),
    lenses: [],
    storage_warnings: []
  };
  const meta = {
    project_root: DEMO_PROJECT_ROOT,
    aictx_root: DEMO_AICTX_ROOT,
    git: {
      available: true,
      branch: "main",
      commit: "demo-seed",
      dirty: false
    }
  };
  const projects = {
    registry_path: "demo://aictx/projects.json",
    projects: [
      {
        registry_id: DEMO_REGISTRY_ID,
        project: bootstrap.project,
        project_root: DEMO_PROJECT_ROOT,
        aictx_root: DEMO_AICTX_ROOT,
        source: "manual",
        registered_at: earliestTimestamp(objects),
        last_seen_at: latestTimestamp(objects),
        current: true,
        available: true,
        counts: bootstrap.counts,
        git: meta.git,
        warnings: []
      }
    ],
    counts: {
      projects: 1,
      available: 1,
      unavailable: 0
    },
    current_project_registry_id: DEMO_REGISTRY_ID
  };

  return {
    version: 1,
    token: DEMO_TOKEN,
    registry_id: DEMO_REGISTRY_ID,
    seed: {
      memory_ids: DEMO_MEMORY_IDS,
      source: "curated-aictx-project-memory"
    },
    defaults: {
      token_budget: DEFAULT_TOKEN_BUDGET,
      mode: "coding"
    },
    meta,
    projects,
    bootstrap
  };
}

function summarizeObject(sidecar, { body, bodyPath, jsonPath, projectId }) {
  return {
    id: sidecar.id,
    type: sidecar.type,
    status: sidecar.status,
    title: sanitizeText(sidecar.title, ""),
    body_path: bodyPath,
    json_path: jsonPath,
    scope: sanitizeScope(sidecar.scope, projectId),
    tags: Array.isArray(sidecar.tags) ? [...sidecar.tags].sort() : [],
    facets: sanitizeJson(sidecar.facets ?? null),
    evidence: sanitizeEvidence(sidecar.evidence ?? []),
    source: {
      kind: "system",
      task: "Curated public demo seed"
    },
    superseded_by: sidecar.superseded_by ?? null,
    created_at: sidecar.created_at,
    updated_at: sidecar.updated_at,
    body
  };
}

function summarizeRelation(relation, jsonPath) {
  return {
    id: relation.id,
    from: relation.from,
    predicate: relation.predicate,
    to: relation.to,
    status: relation.status,
    confidence: relation.confidence ?? null,
    evidence: sanitizeEvidence(relation.evidence ?? []),
    content_hash: relation.content_hash ?? null,
    created_at: relation.created_at,
    updated_at: relation.updated_at,
    json_path: jsonPath
  };
}

function sanitizeScope(scope, projectId) {
  return {
    kind: scope?.kind === "branch" || scope?.kind === "task" ? scope.kind : "project",
    project: projectId,
    branch: null,
    task: null
  };
}

function sanitizeEvidence(evidence) {
  if (!Array.isArray(evidence)) {
    return [];
  }

  return evidence
    .filter((item) => item !== null && typeof item === "object")
    .map((item) => ({
      kind: String(item.kind),
      id: sanitizeText(String(item.id), "")
    }))
    .sort((left, right) => `${left.kind}:${left.id}`.localeCompare(`${right.kind}:${right.id}`));
}

function sanitizeJson(value) {
  if (value === null || value === undefined) {
    return null;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeJson(item));
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, sanitizeJson(item)])
    );
  }

  if (typeof value === "string") {
    return sanitizeText(value, "");
  }

  return value;
}

function sanitizeText(value, projectRoot) {
  let sanitized = value;

  if (projectRoot !== "") {
    sanitized = sanitized.split(projectRoot).join("<project-root>");
  }

  return sanitized
    .replace(/\/Users\/[^"'\s`)]+/g, "<local-path>")
    .replace(/\/home\/[^"'\s`)]+/g, "<local-path>");
}

async function assertDemoDataIsSafe(data, projectRoot) {
  const serialized = JSON.stringify(data);

  if (serialized.includes(projectRoot)) {
    throw new Error("Demo data includes the local project root.");
  }

  for (const pattern of [...SECRET_PATTERNS, ...LOCAL_STATE_PATTERNS]) {
    if (pattern.test(serialized)) {
      throw new Error(`Demo data failed safety check: ${pattern}`);
    }
  }
}

function emptyRoleCoverage() {
  return {
    roles: [],
    counts: {
      populated: 0,
      thin: 0,
      missing: 0,
      stale: 0,
      conflicted: 0
    }
  };
}

async function collectJsonFiles(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolutePath = resolve(root, entry.name);

    if (entry.isDirectory()) {
      const childFiles = await collectJsonFiles(absolutePath);
      files.push(...childFiles);
    } else if (entry.isFile() && entry.name.endsWith(".json")) {
      files.push(absolutePath);
    }
  }

  return files.sort();
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function normalizeProjectPath(path) {
  return path.split(sep).join("/");
}

function compareById(left, right) {
  return left.id.localeCompare(right.id);
}

function earliestTimestamp(objects) {
  return [...objects].map((object) => object.created_at).sort()[0] ?? "2026-05-12T17:53:06+02:00";
}

function latestTimestamp(objects) {
  return [...objects].map((object) => object.updated_at).sort().at(-1) ?? "2026-05-12T17:53:06+02:00";
}

function parseArgs(args) {
  const parsed = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--out") {
      parsed.out = requiredValue(args, index, arg);
      index += 1;
    } else if (arg === "--project-root") {
      parsed.projectRoot = requiredValue(args, index, arg);
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return parsed;
}

function requiredValue(args, index, flag) {
  const value = args[index + 1];

  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${flag} requires a value.`);
  }

  return value;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
