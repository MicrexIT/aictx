import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";

import type { Clock } from "../core/clock.js";
import { memoryError, type JsonValue } from "../core/errors.js";
import { stableJsonStringify, writeJsonAtomic, writeTextAtomic } from "../core/fs.js";
import { err, ok, type Result } from "../core/result.js";
import type {
  Evidence,
  FacetCategory,
  ObjectFacets,
  ObjectType,
  Scope,
  Source,
  SourceOrigin
} from "../core/types.js";
import { computeObjectContentHash } from "./hashes.js";
import type { MemoryConfig, MemoryObjectSidecar, StoredMemoryObject } from "./objects.js";
import type { StoredMemoryRelation } from "./relations.js";
import { readCanonicalStorage } from "./read.js";
import { fileSourceOrigin } from "./source-origin.js";
import { SCHEMA_FILES } from "../validation/schemas.js";

interface UpgradeEvent {
  event: string;
  actor: string;
  timestamp: string;
  id?: string;
  relation_id?: string;
  reason?: string;
  payload?: unknown;
}

export interface UpgradeStorageOptions {
  projectRoot: string;
  clock: Clock;
}

export interface UpgradeStorageData {
  upgraded: boolean;
  from_version: number;
  to_version: 4;
  files_changed: string[];
  objects_upgraded: string[];
  objects_deleted: string[];
  relations_deleted: string[];
}

export async function upgradeStorageToV4(
  options: UpgradeStorageOptions
): Promise<Result<UpgradeStorageData>> {
  const storage = await readCanonicalStorage(options.projectRoot);

  if (!storage.ok) {
    return storage;
  }

  const filesChanged: string[] = [];
  const objectsUpgraded: string[] = [];
  const objectsDeleted: string[] = [];
  const relationsDeleted: string[] = [];
  const fromVersion = storage.data.config.version;

  if (fromVersion !== 4) {
    const config = {
      ...storage.data.config,
      version: 4
    } satisfies MemoryConfig;

    const configWrite = await writeJsonAtomic(
      options.projectRoot,
      ".memory/config.json",
      configToJson(config)
    );

    if (!configWrite.ok) {
      return configWrite;
    }
    filesChanged.push(".memory/config.json");
  }

  const schemas = await writeBundledSchemas(options.projectRoot);

  if (!schemas.ok) {
    return schemas;
  }
  filesChanged.push(...schemas.data);

  const events = migrateEventsForV3(storage.data.events);

  if (events.changed) {
    const written = await writeTextAtomic(
      options.projectRoot,
      ".memory/events.jsonl",
      events.contents
    );

    if (!written.ok) {
      return written;
    }

    filesChanged.push(".memory/events.jsonl");
  }

  const rejectedObjectIds = new Set(
    storage.data.objects
      .filter((object) => isLegacyRejectedObject(object))
      .map((object) => object.sidecar.id)
  );

  for (const relation of storage.data.relations) {
    if (!shouldDeleteRelationForV3(relation, rejectedObjectIds)) {
      continue;
    }

    const deleted = await deleteCanonicalFile(options.projectRoot, relation.path);

    if (!deleted.ok) {
      return deleted;
    }

    filesChanged.push(relation.path);
    relationsDeleted.push(relation.relation.id);
  }

  for (const object of storage.data.objects) {
    if (rejectedObjectIds.has(object.sidecar.id)) {
      const deleted = await deleteRejectedObject(options.projectRoot, object);

      if (!deleted.ok) {
        return deleted;
      }

      filesChanged.push(object.path, object.bodyPath);
      objectsDeleted.push(object.sidecar.id);
      continue;
    }

    const inferredOrigin = await inferSourceOrigin(options.projectRoot, object);

    if (!needsObjectUpgrade(object) && inferredOrigin === undefined) {
      continue;
    }

    const upgraded = upgradeObjectSidecar(object, inferredOrigin);
    const written = await writeJsonAtomic(
      options.projectRoot,
      object.path,
      objectSidecarToJson(upgraded)
    );

    if (!written.ok) {
      return written;
    }

    filesChanged.push(object.path);
    objectsUpgraded.push(object.sidecar.id);
  }

  return ok({
    upgraded: fromVersion !== 4 || filesChanged.length > 0,
    from_version: fromVersion,
    to_version: 4,
    files_changed: filesChanged,
    objects_upgraded: objectsUpgraded,
    objects_deleted: objectsDeleted,
    relations_deleted: relationsDeleted
  });
}

export const upgradeStorageToV3 = upgradeStorageToV4;
export const upgradeStorageToV2 = upgradeStorageToV4;

function isLegacyRejectedObject(object: StoredMemoryObject): boolean {
  return objectStatusString(object) === "rejected";
}

function shouldDeleteRelationForV3(
  relation: StoredMemoryRelation,
  rejectedObjectIds: ReadonlySet<string>
): boolean {
  return (
    relation.relation.status === "rejected" ||
    rejectedObjectIds.has(relation.relation.from) ||
    rejectedObjectIds.has(relation.relation.to)
  );
}

async function deleteRejectedObject(
  projectRoot: string,
  object: StoredMemoryObject
): Promise<Result<void>> {
  const sidecarDeleted = await deleteCanonicalFile(projectRoot, object.path);

  if (!sidecarDeleted.ok) {
    return sidecarDeleted;
  }

  return deleteCanonicalFile(projectRoot, object.bodyPath);
}

async function deleteCanonicalFile(projectRoot: string, path: string): Promise<Result<void>> {
  try {
    await rm(join(projectRoot, path), { force: true });
    return ok(undefined);
  } catch (error) {
    return err(
      memoryError("MemoryValidationFailed", "Canonical file could not be deleted during upgrade.", {
        path,
        message: error instanceof Error ? error.message : String(error)
      })
    );
  }
}

function needsObjectUpgrade(object: StoredMemoryObject): boolean {
  return (
    object.sidecar.facets === undefined ||
    object.sidecar.evidence === undefined ||
    objectStatusString(object) !== normalizedObjectStatus(object)
  );
}

function migrateEventsForV3(
  events: readonly UpgradeEvent[]
): { changed: boolean; contents: string } {
  let changed = false;
  const lines = events.map((event) => {
    const json = eventToJson(event);

    if (json.event === "memory.rejected") {
      json.event = "memory.deleted";
      changed = true;
    }

    return JSON.stringify(json);
  });

  return {
    changed,
    contents: lines.length === 0 ? "" : `${lines.join("\n")}\n`
  };
}

function eventToJson(event: UpgradeEvent): Record<string, JsonValue> {
  const json: Record<string, JsonValue> = {
    event: event.event,
    actor: event.actor,
    timestamp: event.timestamp
  };

  if (event.id !== undefined) {
    json.id = event.id;
  }

  if (event.relation_id !== undefined) {
    json.relation_id = event.relation_id;
  }

  if (event.reason !== undefined) {
    json.reason = event.reason;
  }

  if (isJsonValue(event.payload)) {
    json.payload = event.payload;
  }

  return json;
}

function upgradeObjectSidecar(
  object: StoredMemoryObject,
  inferredOrigin: SourceOrigin | undefined
): MemoryObjectSidecar {
  const sidecarWithoutHash: Omit<MemoryObjectSidecar, "content_hash"> = {
    id: object.sidecar.id,
    type: object.sidecar.type,
    status: normalizedObjectStatus(object),
    title: object.sidecar.title,
    body_path: object.sidecar.body_path,
    scope: cloneScope(object.sidecar.scope),
    tags: [...(object.sidecar.tags ?? [])],
    facets: object.sidecar.facets ?? inferFacets(object.sidecar.type, object.sidecar.tags ?? []),
    evidence: object.sidecar.evidence ?? [],
    ...(object.sidecar.source === undefined ? {} : { source: cloneSource(object.sidecar.source) }),
    ...(object.sidecar.origin === undefined
      ? inferredOrigin === undefined
        ? {}
        : { origin: cloneSourceOrigin(inferredOrigin) }
      : { origin: cloneSourceOrigin(object.sidecar.origin) }),
    ...(object.sidecar.superseded_by === undefined
      ? {}
      : { superseded_by: object.sidecar.superseded_by }),
    created_at: object.sidecar.created_at,
    updated_at: object.sidecar.updated_at
  };

  return {
    ...sidecarWithoutHash,
    content_hash: computeObjectContentHash(objectSidecarToJson(sidecarWithoutHash), object.body)
  };
}

async function inferSourceOrigin(
  projectRoot: string,
  object: StoredMemoryObject
): Promise<SourceOrigin | undefined> {
  if (object.sidecar.origin !== undefined || object.sidecar.type !== "source") {
    return undefined;
  }

  const fileEvidence = (object.sidecar.evidence ?? []).find(
    (evidence) => evidence.kind === "file" && evidence.id.trim() !== ""
  );

  if (fileEvidence !== undefined) {
    return fileSourceOrigin({
      projectRoot,
      locator: fileEvidence.id,
      capturedAt: object.sidecar.created_at
    });
  }

  const url = extractFirstUrl([object.sidecar.title, object.body].join("\n"));

  if (url !== null) {
    return {
      kind: "url",
      locator: url,
      captured_at: object.sidecar.created_at
    };
  }

  return undefined;
}

function extractFirstUrl(value: string): string | null {
  return value.match(/https?:\/\/[^\s<>)"']+/u)?.[0] ?? null;
}

function objectStatusString(object: StoredMemoryObject): string {
  return object.sidecar.status as string;
}

function normalizedObjectStatus(object: StoredMemoryObject): MemoryObjectSidecar["status"] {
  const status = objectStatusString(object);

  if (object.sidecar.type === "question") {
    if (status === "closed" || status === "stale" || status === "superseded") {
      return status;
    }

    return "open";
  }

  if (status === "stale" || status === "superseded") {
    return status;
  }

  return "active";
}

function inferFacets(type: ObjectType, tags: readonly string[]): ObjectFacets {
  return {
    category: inferFacetCategory(type, tags)
  };
}

function inferFacetCategory(type: ObjectType, tags: readonly string[]): FacetCategory {
  const tagSet = new Set(tags.map((tag) => tag.toLowerCase()));

  if (hasAnyTag(tagSet, ["test", "tests", "testing", "vitest"])) {
    return "testing";
  }

  if (hasAnyTag(tagSet, ["stack", "framework", "dependency", "dependencies", "runtime"])) {
    return "stack";
  }

  if (hasAnyTag(tagSet, ["layout", "file-layout", "files", "structure"])) {
    return "file-layout";
  }

  if (hasAnyTag(tagSet, ["architecture", "design"])) {
    return "architecture";
  }

  switch (type) {
    case "project":
      return "project-description";
    case "architecture":
      return "architecture";
    case "source":
      return "source";
    case "synthesis":
      if (hasAnyTag(tagSet, ["product-intent", "purpose", "vision"])) {
        return "product-intent";
      }
      if (hasAnyTag(tagSet, ["feature-map", "features", "product-feature"])) {
        return "feature-map";
      }
      if (hasAnyTag(tagSet, ["roadmap", "milestone", "milestones"])) {
        return "roadmap";
      }
      if (hasAnyTag(tagSet, ["agent-guidance", "agents", "guidance"])) {
        return "agent-guidance";
      }
      return "concept";
    case "decision":
      return "decision-rationale";
    case "constraint":
      return "convention";
    case "question":
      return "open-question";
    case "fact":
      return "debugging-fact";
    case "gotcha":
      return "gotcha";
    case "workflow":
      return "workflow";
    case "concept":
      return "concept";
    case "note":
      return "concept";
  }
}

function hasAnyTag(tags: ReadonlySet<string>, candidates: readonly string[]): boolean {
  return candidates.some((candidate) => tags.has(candidate));
}

async function writeBundledSchemas(projectRoot: string): Promise<Result<string[]>> {
  const written: string[] = [];

  for (const schemaFile of Object.values(SCHEMA_FILES)) {
    const source = new URL(`../schemas/${schemaFile}`, import.meta.url);
    const target = `.memory/schema/${schemaFile}`;

    try {
      const schema = JSON.parse(await readFile(source, "utf8")) as unknown;

      if (!isJsonValue(schema)) {
        return err(
          memoryError("MemoryValidationFailed", "Bundled schema is not a JSON value.", {
            schema: schemaFile
          })
        );
      }

      const current = await readExistingJson(projectRoot, target);

      if (current.ok && stableJsonStringify(current.data) === stableJsonStringify(schema)) {
        continue;
      }

      const result = await writeJsonAtomic(projectRoot, target, schema);

      if (!result.ok) {
        return result;
      }

      written.push(target);
    } catch (error) {
      return err(
        memoryError("MemoryValidationFailed", "Bundled schema could not be copied.", {
          schema: schemaFile,
          message: error instanceof Error ? error.message : String(error)
        })
      );
    }
  }

  return ok(written);
}

async function readExistingJson(projectRoot: string, target: string): Promise<Result<JsonValue>> {
  try {
    const parsed = JSON.parse(await readFile(join(projectRoot, target), "utf8")) as unknown;

    if (!isJsonValue(parsed)) {
      return err(
        memoryError("MemoryValidationFailed", "Existing schema is not a JSON value.", {
          path: target
        })
      );
    }

    return ok(parsed);
  } catch {
    return err(
      memoryError("MemoryValidationFailed", "Existing schema could not be read.", {
        path: target
      })
    );
  }
}

function configToJson(config: MemoryConfig): JsonValue {
  return {
    version: config.version,
    project: config.project,
    memory: config.memory,
    git: config.git
  };
}

function objectSidecarToJson(
  sidecar: Omit<MemoryObjectSidecar, "content_hash"> | MemoryObjectSidecar
): Record<string, JsonValue> {
  const json: Record<string, JsonValue> = {
    id: sidecar.id,
    type: sidecar.type,
    status: sidecar.status,
    title: sidecar.title,
    body_path: sidecar.body_path,
    scope: {
      kind: sidecar.scope.kind,
      project: sidecar.scope.project,
      branch: sidecar.scope.branch,
      task: sidecar.scope.task
    },
    tags: [...(sidecar.tags ?? [])],
    facets: facetsToJson(sidecar.facets ?? inferFacets(sidecar.type, sidecar.tags ?? [])),
    evidence: (sidecar.evidence ?? []).map(evidenceToJson),
    ...(sidecar.source === undefined ? {} : { source: sourceToJson(sidecar.source) }),
    ...(sidecar.origin === undefined ? {} : { origin: sourceOriginToJson(sidecar.origin) }),
    ...(sidecar.superseded_by === undefined ? {} : { superseded_by: sidecar.superseded_by }),
    created_at: sidecar.created_at,
    updated_at: sidecar.updated_at
  };

  if ("content_hash" in sidecar) {
    json.content_hash = sidecar.content_hash;
  }

  return json;
}

function facetsToJson(facets: ObjectFacets): Record<string, JsonValue> {
  return {
    category: facets.category,
    ...(facets.applies_to === undefined ? {} : { applies_to: [...facets.applies_to] }),
    ...(facets.load_modes === undefined ? {} : { load_modes: [...facets.load_modes] })
  };
}

function evidenceToJson(evidence: Evidence): Record<string, JsonValue> {
  return {
    kind: evidence.kind,
    id: evidence.id
  };
}

function sourceToJson(source: Source): Record<string, JsonValue> {
  return {
    kind: source.kind,
    ...(source.task === undefined ? {} : { task: source.task }),
    ...(source.commit === undefined ? {} : { commit: source.commit })
  };
}

function sourceOriginToJson(origin: SourceOrigin): Record<string, JsonValue> {
  return {
    kind: origin.kind,
    locator: origin.locator,
    ...(origin.captured_at === undefined ? {} : { captured_at: origin.captured_at }),
    ...(origin.digest === undefined ? {} : { digest: origin.digest }),
    ...(origin.media_type === undefined ? {} : { media_type: origin.media_type })
  };
}

function cloneScope(scope: Scope): Scope {
  return {
    kind: scope.kind,
    project: scope.project,
    branch: scope.branch,
    task: scope.task
  };
}

function cloneSource(source: Source): Source {
  return {
    kind: source.kind,
    ...(source.task === undefined ? {} : { task: source.task }),
    ...(source.commit === undefined ? {} : { commit: source.commit })
  };
}

function cloneSourceOrigin(origin: SourceOrigin): SourceOrigin {
  return {
    kind: origin.kind,
    locator: origin.locator,
    ...(origin.captured_at === undefined ? {} : { captured_at: origin.captured_at }),
    ...(origin.digest === undefined ? {} : { digest: origin.digest }),
    ...(origin.media_type === undefined ? {} : { media_type: origin.media_type })
  };
}

function isJsonValue(value: unknown): value is JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }

  if (typeof value === "object") {
    return Object.values(value).every(isJsonValue);
  }

  return false;
}
