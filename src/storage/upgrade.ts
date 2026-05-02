import { readFile } from "node:fs/promises";

import type { Clock } from "../core/clock.js";
import { aictxError, type JsonValue } from "../core/errors.js";
import { writeJsonAtomic } from "../core/fs.js";
import { err, ok, type Result } from "../core/result.js";
import type {
  Evidence,
  FacetCategory,
  ObjectFacets,
  ObjectType,
  Scope,
  Source
} from "../core/types.js";
import { computeObjectContentHash } from "./hashes.js";
import type { AictxConfig, MemoryObjectSidecar, StoredMemoryObject } from "./objects.js";
import { readCanonicalStorage } from "./read.js";
import { SCHEMA_FILES } from "../validation/schemas.js";

export interface UpgradeStorageOptions {
  projectRoot: string;
  clock: Clock;
}

export interface UpgradeStorageData {
  upgraded: boolean;
  from_version: number;
  to_version: 2;
  files_changed: string[];
  objects_upgraded: string[];
}

export async function upgradeStorageToV2(
  options: UpgradeStorageOptions
): Promise<Result<UpgradeStorageData>> {
  const storage = await readCanonicalStorage(options.projectRoot);

  if (!storage.ok) {
    return storage;
  }

  const filesChanged: string[] = [];
  const objectsUpgraded: string[] = [];
  const fromVersion = storage.data.config.version;

  if (fromVersion !== 2) {
    const config = {
      ...storage.data.config,
      version: 2
    } satisfies AictxConfig;

    const configWrite = await writeJsonAtomic(
      options.projectRoot,
      ".aictx/config.json",
      configToJson(config)
    );

    if (!configWrite.ok) {
      return configWrite;
    }
    filesChanged.push(".aictx/config.json");
  }

  if (fromVersion !== 2) {
    const schemas = await writeBundledSchemas(options.projectRoot);

    if (!schemas.ok) {
      return schemas;
    }
    filesChanged.push(...schemas.data);
  }

  for (const object of storage.data.objects) {
    if (object.sidecar.facets !== undefined && object.sidecar.evidence !== undefined) {
      continue;
    }

    const upgraded = upgradeObjectSidecar(object);
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
    upgraded: fromVersion !== 2 || objectsUpgraded.length > 0,
    from_version: fromVersion,
    to_version: 2,
    files_changed: filesChanged,
    objects_upgraded: objectsUpgraded
  });
}

function upgradeObjectSidecar(object: StoredMemoryObject): MemoryObjectSidecar {
  const sidecarWithoutHash: Omit<MemoryObjectSidecar, "content_hash"> = {
    id: object.sidecar.id,
    type: object.sidecar.type,
    status: object.sidecar.status,
    title: object.sidecar.title,
    body_path: object.sidecar.body_path,
    scope: cloneScope(object.sidecar.scope),
    tags: [...(object.sidecar.tags ?? [])],
    facets: object.sidecar.facets ?? inferFacets(object.sidecar.type, object.sidecar.tags ?? []),
    evidence: object.sidecar.evidence ?? [],
    ...(object.sidecar.source === undefined ? {} : { source: cloneSource(object.sidecar.source) }),
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
    const target = `.aictx/schema/${schemaFile}`;

    try {
      const schema = JSON.parse(await readFile(source, "utf8")) as unknown;

      if (!isJsonValue(schema)) {
        return err(
          aictxError("AICtxValidationFailed", "Bundled schema is not a JSON value.", {
            schema: schemaFile
          })
        );
      }

      const result = await writeJsonAtomic(projectRoot, target, schema);

      if (!result.ok) {
        return result;
      }

      written.push(target);
    } catch (error) {
      return err(
        aictxError("AICtxValidationFailed", "Bundled schema could not be copied.", {
          schema: schemaFile,
          message: error instanceof Error ? error.message : String(error)
        })
      );
    }
  }

  return ok(written);
}

function configToJson(config: AictxConfig): JsonValue {
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
