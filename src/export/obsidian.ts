import { lstat, mkdir, readdir, readFile, rm } from "node:fs/promises";
import { isAbsolute, join, posix, relative, resolve, sep } from "node:path";

import { aictxError, type JsonValue } from "../core/errors.js";
import { stableJsonStringify, writeTextAtomic } from "../core/fs.js";
import { err, ok, type Result } from "../core/result.js";
import type { ObjectId, Predicate } from "../core/types.js";
import type { StoredMemoryObject } from "../storage/objects.js";
import type { CanonicalStorageSnapshot } from "../storage/read.js";
import type { StoredMemoryRelation } from "../storage/relations.js";

export const OBSIDIAN_EXPORT_FORMAT = "obsidian";
export const DEFAULT_OBSIDIAN_EXPORT_DIR = ".aictx/exports/obsidian";
export const OBSIDIAN_EXPORT_MANIFEST_FILENAME = ".aictx-obsidian-export.json";

const MANIFEST_VERSION = 1;
const INDEX_NOTE_PATH = "index.md";
const MEMORY_NOTE_DIRECTORY = "memory";

export interface ExportObsidianProjectionOptions {
  projectRoot: string;
  storage: CanonicalStorageSnapshot;
  outDir?: string;
}

export interface ObsidianProjectionExportData {
  format: typeof OBSIDIAN_EXPORT_FORMAT;
  output_dir: string;
  manifest_path: string;
  objects_exported: number;
  relations_linked: number;
  files_written: string[];
  files_removed: string[];
}

interface ResolvedOutputTarget {
  absolutePath: string;
  relativePath: string;
  manifestAbsolutePath: string;
  manifestRelativePath: string;
}

interface PreparedOutputTarget extends ResolvedOutputTarget {
  previousManifest: ObsidianExportManifest | null;
}

interface ObsidianExportManifest {
  format: typeof OBSIDIAN_EXPORT_FORMAT;
  version: typeof MANIFEST_VERSION;
  files: string[];
}

interface GeneratedFile {
  relativePath: string;
  contents: string;
}

export async function exportObsidianProjection(
  options: ExportObsidianProjectionOptions
): Promise<Result<ObsidianProjectionExportData>> {
  const output = resolveOutputTarget(options.projectRoot, options.outDir);

  if (!output.ok) {
    return output;
  }

  const prepared = await prepareOutputTarget(options.projectRoot, output.data);

  if (!prepared.ok) {
    return prepared;
  }

  const generatedFiles = buildGeneratedFiles(options.storage);
  const generatedPaths = generatedFiles.map((file) => file.relativePath);
  const previousOwnedPaths = new Set(prepared.data.previousManifest?.files ?? []);
  const conflicts = await rejectGeneratedFileConflicts(
    prepared.data.absolutePath,
    generatedPaths,
    previousOwnedPaths
  );

  if (!conflicts.ok) {
    return conflicts;
  }

  const removed = await removeStaleManifestOwnedFiles(
    options.projectRoot,
    prepared.data.absolutePath,
    previousOwnedPaths,
    new Set(generatedPaths)
  );

  if (!removed.ok) {
    return removed;
  }

  const filesWritten: string[] = [];

  for (const file of generatedFiles) {
    const projectRelativePath = outputFileProjectRelativePath(
      options.projectRoot,
      prepared.data.absolutePath,
      file.relativePath
    );
    const written = await writeTextAtomic(options.projectRoot, projectRelativePath, file.contents);

    if (!written.ok) {
      return written;
    }

    filesWritten.push(projectRelativePath);
  }

  const manifest = renderManifest(generatedPaths);
  const manifestWritten = await writeTextAtomic(
    options.projectRoot,
    prepared.data.manifestRelativePath,
    stableJsonStringify(manifestToJson(manifest))
  );

  if (!manifestWritten.ok) {
    return manifestWritten;
  }

  filesWritten.push(prepared.data.manifestRelativePath);

  return ok({
    format: OBSIDIAN_EXPORT_FORMAT,
    output_dir: prepared.data.relativePath,
    manifest_path: prepared.data.manifestRelativePath,
    objects_exported: options.storage.objects.length,
    relations_linked: countLinkedRelations(options.storage),
    files_written: filesWritten,
    files_removed: removed.data
  });
}

function resolveOutputTarget(
  projectRoot: string,
  outDir: string | undefined
): Result<ResolvedOutputTarget> {
  const root = resolve(projectRoot);
  const absolutePath = resolve(root, outDir ?? DEFAULT_OBSIDIAN_EXPORT_DIR);

  if (!isInsideOrEqual(root, absolutePath)) {
    return invalidTarget("Obsidian export target must stay inside the project root.", {
      target: outDir ?? DEFAULT_OBSIDIAN_EXPORT_DIR,
      projectRoot: root
    });
  }

  if (absolutePath === root) {
    return invalidTarget("Obsidian export target cannot be the project root.", {
      target: relativeProjectPath(root, absolutePath)
    });
  }

  const relativePath = relativeProjectPath(root, absolutePath);

  if (isUnsafeAictxTarget(relativePath)) {
    return invalidTarget("Obsidian export target cannot overlap canonical Aictx storage.", {
      target: relativePath
    });
  }

  const manifestAbsolutePath = join(absolutePath, OBSIDIAN_EXPORT_MANIFEST_FILENAME);

  return ok({
    absolutePath,
    relativePath,
    manifestAbsolutePath,
    manifestRelativePath: relativeProjectPath(root, manifestAbsolutePath)
  });
}

async function prepareOutputTarget(
  projectRoot: string,
  output: ResolvedOutputTarget
): Promise<Result<PreparedOutputTarget>> {
  const symlinks = await rejectSymlinkComponents(projectRoot, output.absolutePath);

  if (!symlinks.ok) {
    return symlinks;
  }

  const outputStat = await lstat(output.absolutePath).catch((error: unknown) => {
    if (errorCode(error) === "ENOENT") {
      return null;
    }

    throw error;
  });

  if (outputStat !== null && outputStat.isSymbolicLink()) {
    return invalidTarget("Obsidian export target cannot be a symbolic link.", {
      target: output.relativePath
    });
  }

  if (outputStat !== null && !outputStat.isDirectory()) {
    return invalidTarget("Obsidian export target must be a directory.", {
      target: output.relativePath
    });
  }

  try {
    await mkdir(output.absolutePath, { recursive: true });
  } catch (error) {
    return invalidTarget("Obsidian export target directory could not be created.", {
      target: output.relativePath,
      message: messageFromUnknown(error)
    });
  }

  const entries = await readdir(output.absolutePath);
  const hasManifest = entries.includes(OBSIDIAN_EXPORT_MANIFEST_FILENAME);

  if (!hasManifest) {
    if (entries.length > 0) {
      return invalidTarget(
        "Obsidian export target is non-empty and does not contain an Aictx export manifest.",
        {
          target: output.relativePath
        }
      );
    }

    return ok({ ...output, previousManifest: null });
  }

  const manifest = await readManifest(output.manifestAbsolutePath, output.relativePath);

  if (!manifest.ok) {
    return manifest;
  }

  return ok({ ...output, previousManifest: manifest.data });
}

async function rejectSymlinkComponents(
  projectRoot: string,
  absolutePath: string
): Promise<Result<void>> {
  const root = resolve(projectRoot);
  const parts = relative(root, absolutePath).split(sep).filter((part) => part.length > 0);
  let current = root;

  for (const [index, part] of parts.entries()) {
    current = join(current, part);
    const stat = await lstat(current).catch((error: unknown) => {
      if (errorCode(error) === "ENOENT") {
        return null;
      }

      throw error;
    });

    if (stat === null) {
      return ok(undefined);
    }

    if (stat.isSymbolicLink()) {
      return invalidTarget("Obsidian export target cannot include symbolic links.", {
        target: relativeProjectPath(root, current)
      });
    }

    if (index < parts.length - 1 && !stat.isDirectory()) {
      return invalidTarget("Obsidian export target parent is not a directory.", {
        target: relativeProjectPath(root, current)
      });
    }
  }

  return ok(undefined);
}

async function readManifest(
  manifestPath: string,
  outputRelativePath: string
): Promise<Result<ObsidianExportManifest>> {
  let parsed: unknown;

  try {
    parsed = JSON.parse(await readFile(manifestPath, "utf8")) as unknown;
  } catch (error) {
    return invalidTarget("Obsidian export manifest is invalid.", {
      target: outputRelativePath,
      manifest: OBSIDIAN_EXPORT_MANIFEST_FILENAME,
      message: messageFromUnknown(error)
    });
  }

  if (!isManifest(parsed)) {
    return invalidTarget("Obsidian export manifest is invalid.", {
      target: outputRelativePath,
      manifest: OBSIDIAN_EXPORT_MANIFEST_FILENAME
    });
  }

  const uniqueFiles = new Set<string>();

  for (const file of parsed.files) {
    if (!isSafeManifestFile(file) || uniqueFiles.has(file)) {
      return invalidTarget("Obsidian export manifest contains an unsafe file path.", {
        target: outputRelativePath,
        file
      });
    }

    uniqueFiles.add(file);
  }

  return ok({
    format: OBSIDIAN_EXPORT_FORMAT,
    version: MANIFEST_VERSION,
    files: [...uniqueFiles].sort()
  });
}

async function rejectGeneratedFileConflicts(
  outputDirectory: string,
  generatedPaths: readonly string[],
  previousOwnedPaths: ReadonlySet<string>
): Promise<Result<void>> {
  for (const generatedPath of generatedPaths) {
    const target = join(outputDirectory, generatedPath);
    const stat = await lstat(target).catch((error: unknown) => {
      if (errorCode(error) === "ENOENT") {
        return null;
      }

      throw error;
    });

    if (stat === null) {
      continue;
    }

    if (stat.isSymbolicLink()) {
      return invalidTarget("Obsidian export target contains a symbolic link.", {
        file: generatedPath
      });
    }

    if (!stat.isFile()) {
      return invalidTarget("Obsidian export generated file path is not a file.", {
        file: generatedPath
      });
    }

    if (!previousOwnedPaths.has(generatedPath)) {
      return invalidTarget("Obsidian export would overwrite an unmanifested file.", {
        file: generatedPath
      });
    }
  }

  return ok(undefined);
}

async function removeStaleManifestOwnedFiles(
  projectRoot: string,
  outputDirectory: string,
  previousOwnedPaths: ReadonlySet<string>,
  nextOwnedPaths: ReadonlySet<string>
): Promise<Result<string[]>> {
  const removed: string[] = [];

  for (const stalePath of [...previousOwnedPaths].sort()) {
    if (nextOwnedPaths.has(stalePath)) {
      continue;
    }

    const target = join(outputDirectory, stalePath);
    const stat = await lstat(target).catch((error: unknown) => {
      if (errorCode(error) === "ENOENT") {
        return null;
      }

      throw error;
    });

    if (stat === null) {
      continue;
    }

    if (stat.isSymbolicLink()) {
      return invalidTarget("Obsidian export target contains a symbolic link.", {
        file: stalePath
      });
    }

    if (!stat.isFile()) {
      return invalidTarget("Obsidian export manifest-owned path is not a file.", {
        file: stalePath
      });
    }

    try {
      await rm(target, { force: true });
    } catch (error) {
      return invalidTarget("Stale Obsidian export file could not be removed.", {
        file: stalePath,
        message: messageFromUnknown(error)
      });
    }

    removed.push(relativeProjectPath(projectRoot, target));
  }

  return ok(removed);
}

function buildGeneratedFiles(storage: CanonicalStorageSnapshot): GeneratedFile[] {
  const objects = sortedObjects(storage.objects);
  const outgoingRelations = activeOutgoingRelationsByObject(storage.relations);

  return [
    {
      relativePath: INDEX_NOTE_PATH,
      contents: renderIndexNote(storage, objects)
    },
    ...objects.map((object) => ({
      relativePath: objectNotePath(object.sidecar.id),
      contents: renderObjectNote(object, outgoingRelations.get(object.sidecar.id) ?? [])
    }))
  ];
}

function renderIndexNote(
  storage: CanonicalStorageSnapshot,
  objects: readonly StoredMemoryObject[]
): string {
  const frontmatter: JsonValue = {
    aictx_export_format: OBSIDIAN_EXPORT_FORMAT,
    aictx_project: storage.config.project.id,
    aliases: ["Aictx Memory"],
    tags: ["aictx"]
  };
  const body = [
    "# Aictx Memory",
    "",
    `Project: ${storage.config.project.name}`,
    "",
    "## Memory",
    "",
    ...objects.map((object) => {
      const sidecar = object.sidecar;
      return `- [[${wikilinkTarget(sidecar.id)}|${wikilinkAlias(sidecar.title)}]] (${sidecar.type}, ${sidecar.status})`;
    }),
    ""
  ].join("\n");

  return renderNote(frontmatter, body);
}

function renderObjectNote(
  object: StoredMemoryObject,
  outgoingRelations: readonly StoredMemoryRelation[]
): string {
  const frontmatter = objectFrontmatter(object, outgoingRelations);
  const body = `${object.body}${bodySectionSeparator(object.body)}${renderRelationsSection(
    outgoingRelations
  )}`;

  return renderNote(frontmatter, body);
}

function objectFrontmatter(
  object: StoredMemoryObject,
  outgoingRelations: readonly StoredMemoryRelation[]
): JsonValue {
  const sidecar = object.sidecar;
  const frontmatter: Record<string, JsonValue> = {
    aictx_id: sidecar.id,
    aictx_title: sidecar.title,
    aictx_type: sidecar.type,
    aictx_status: sidecar.status,
    aictx_scope_kind: sidecar.scope.kind,
    aictx_scope_project: sidecar.scope.project,
    aictx_created_at: sidecar.created_at,
    aictx_updated_at: sidecar.updated_at,
    aliases: [sidecar.title],
    tags: [...(sidecar.tags ?? [])]
  };

  if (sidecar.scope.branch !== null) {
    frontmatter.aictx_scope_branch = sidecar.scope.branch;
  }

  if (sidecar.scope.task !== null) {
    frontmatter.aictx_scope_task = sidecar.scope.task;
  }

  for (const [predicate, relations] of groupRelationsByPredicate(outgoingRelations)) {
    frontmatter[`aictx_rel_${predicate}`] = relations.map((relation) =>
      wikilink(relation.relation.to)
    );
  }

  return frontmatter;
}

function renderRelationsSection(outgoingRelations: readonly StoredMemoryRelation[]): string {
  if (outgoingRelations.length === 0) {
    return "## Aictx Relations\n\nNo active outgoing relations.\n";
  }

  return [
    "## Aictx Relations",
    "",
    ...outgoingRelations.map(
      (relation) => `- ${relation.relation.predicate}: ${wikilink(relation.relation.to)}`
    ),
    ""
  ].join("\n");
}

function renderNote(frontmatter: JsonValue, body: string): string {
  return `---\n${stableJsonStringify(frontmatter)}---\n${body}`;
}

function renderManifest(files: readonly string[]): ObsidianExportManifest {
  return {
    format: OBSIDIAN_EXPORT_FORMAT,
    version: MANIFEST_VERSION,
    files: [...files].sort()
  };
}

function activeOutgoingRelationsByObject(
  relations: readonly StoredMemoryRelation[]
): Map<ObjectId, StoredMemoryRelation[]> {
  const byObject = new Map<ObjectId, StoredMemoryRelation[]>();

  for (const relation of relations.filter(isActiveRelation).sort(compareRelationsById)) {
    const existing = byObject.get(relation.relation.from) ?? [];
    existing.push(relation);
    byObject.set(relation.relation.from, existing);
  }

  return byObject;
}

function groupRelationsByPredicate(
  relations: readonly StoredMemoryRelation[]
): Array<[Predicate, StoredMemoryRelation[]]> {
  const grouped = new Map<Predicate, StoredMemoryRelation[]>();

  for (const relation of relations) {
    const existing = grouped.get(relation.relation.predicate) ?? [];
    existing.push(relation);
    grouped.set(relation.relation.predicate, existing);
  }

  return [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right));
}

function countLinkedRelations(storage: CanonicalStorageSnapshot): number {
  const objectIds = new Set(storage.objects.map((object) => object.sidecar.id));

  return storage.relations.filter(
    (relation) => isActiveRelation(relation) && objectIds.has(relation.relation.from)
  ).length;
}

function isActiveRelation(relation: StoredMemoryRelation): boolean {
  return relation.relation.status === "active";
}

function sortedObjects(objects: readonly StoredMemoryObject[]): StoredMemoryObject[] {
  return [...objects].sort((left, right) => left.sidecar.id.localeCompare(right.sidecar.id));
}

function compareRelationsById(
  left: StoredMemoryRelation,
  right: StoredMemoryRelation
): number {
  return left.relation.id.localeCompare(right.relation.id);
}

function objectNotePath(id: ObjectId): string {
  return `${MEMORY_NOTE_DIRECTORY}/${id}.md`;
}

function wikilink(id: ObjectId): string {
  return `[[${wikilinkTarget(id)}]]`;
}

function wikilinkTarget(id: ObjectId): string {
  return `${MEMORY_NOTE_DIRECTORY}/${id}`;
}

function wikilinkAlias(alias: string): string {
  return alias.replaceAll("|", "-").replaceAll("]", "");
}

function bodySectionSeparator(body: string): string {
  return body.endsWith("\n") ? "\n" : "\n\n";
}

function outputFileProjectRelativePath(
  projectRoot: string,
  outputDirectory: string,
  filePath: string
): string {
  return relativeProjectPath(projectRoot, join(outputDirectory, filePath));
}

function relativeProjectPath(projectRoot: string, absolutePath: string): string {
  return relative(resolve(projectRoot), resolve(absolutePath)).split(sep).join("/");
}

function isInsideOrEqual(root: string, target: string): boolean {
  const relativePath = relative(root, target);
  return relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath));
}

function isUnsafeAictxTarget(relativePath: string): boolean {
  if (relativePath === ".aictx" || relativePath === ".aictx/exports") {
    return true;
  }

  return relativePath.startsWith(".aictx/") && !relativePath.startsWith(".aictx/exports/");
}

function isSafeManifestFile(file: string): boolean {
  if (file.includes("\\") || posix.isAbsolute(file)) {
    return false;
  }

  const normalized = posix.normalize(file);

  if (normalized !== file || normalized.startsWith("../") || normalized === "..") {
    return false;
  }

  return file === INDEX_NOTE_PATH || /^memory\/[a-z][a-z0-9_]*\.[a-z0-9][a-z0-9-]*\.md$/.test(file);
}

function isManifest(value: unknown): value is ObsidianExportManifest {
  return (
    isRecord(value) &&
    value.format === OBSIDIAN_EXPORT_FORMAT &&
    value.version === MANIFEST_VERSION &&
    Array.isArray(value.files) &&
    value.files.every((file) => typeof file === "string")
  );
}

function manifestToJson(manifest: ObsidianExportManifest): JsonValue {
  return {
    format: manifest.format,
    version: manifest.version,
    files: manifest.files
  };
}

function invalidTarget<T>(message: string, details: JsonValue): Result<T> {
  return err(aictxError("AICtxExportTargetInvalid", message, details));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return null;
  }

  const code = error.code;
  return typeof code === "string" ? code : null;
}

function messageFromUnknown(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
