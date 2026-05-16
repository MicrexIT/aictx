import { memoryError, type JsonValue } from "../core/errors.js";
import {
  generateObjectId,
  isObjectId
} from "../core/ids.js";
import { err, ok, type Result } from "../core/result.js";
import type {
  Evidence,
  FacetCategory,
  ObjectFacets,
  ObjectId,
  ObjectType,
  Predicate,
  RelationConfidence,
  SourceOrigin
} from "../core/types.js";
import {
  FACET_CATEGORIES,
  ORIGIN_KINDS,
  PREDICATES,
  RELATION_CONFIDENCES
} from "../core/types.js";
import type { CanonicalStorageSnapshot } from "../storage/read.js";
import {
  REMEMBER_MEMORY_KINDS,
  type RememberMemoryInput,
  type RememberMemoryInputItem,
  type RememberMemoryKind,
  type RememberRelationInputItem,
  type RememberRelatedInput,
  type RememberStaleInputItem,
  type RememberSupersedeInputItem,
  type RememberUpdateInputItem
} from "./types.js";

type RememberPatchChange =
  | RememberPatchCreateObject
  | RememberPatchUpdateObject
  | RememberPatchMarkStale
  | RememberPatchSupersedeObject
  | RememberPatchCreateRelation;

interface RememberPatchCreateObject {
  op: "create_object";
  id?: ObjectId;
  type: ObjectType;
  title: string;
  body: string;
  tags?: string[];
  facets?: ObjectFacets;
  evidence?: Evidence[];
  origin?: SourceOrigin;
}

interface RememberPatchUpdateObject {
  op: "update_object";
  id: ObjectId;
  title?: string;
  body?: string;
  tags?: string[];
  facets?: ObjectFacets;
  evidence?: Evidence[];
  origin?: SourceOrigin;
}

interface RememberPatchMarkStale {
  op: "mark_stale";
  id: ObjectId;
  reason: string;
}

interface RememberPatchSupersedeObject {
  op: "supersede_object";
  id: ObjectId;
  superseded_by: ObjectId;
  reason: string;
}

interface RememberPatchCreateRelation {
  op: "create_relation";
  from: ObjectId;
  predicate: Predicate;
  to: ObjectId;
  confidence?: RelationConfidence;
  evidence?: Evidence[];
}

export interface RememberMemoryPatch {
  source: {
    kind: "agent";
    task: string;
  };
  changes: RememberPatchChange[];
}

export interface BuildRememberMemoryPatchOptions {
  input: unknown;
  storage: CanonicalStorageSnapshot;
}

const REMEMBER_KIND_SET = new Set<string>(REMEMBER_MEMORY_KINDS);
const FACET_CATEGORY_SET = new Set<string>(FACET_CATEGORIES);
const PREDICATE_SET = new Set<string>(PREDICATES);
const RELATION_CONFIDENCE_SET = new Set<string>(RELATION_CONFIDENCES);

export function buildRememberMemoryPatch(
  options: BuildRememberMemoryPatchOptions
): Result<RememberMemoryPatch> {
  const input = parseRememberMemoryInput(options.input);

  if (!input.ok) {
    return input;
  }

  const reservedObjectIds = new Set(options.storage.objects.map((object) => object.sidecar.id));
  const objectsById = new Map(
    options.storage.objects.map((object) => [object.sidecar.id, object])
  );
  const changes: RememberPatchChange[] = [];

  for (const memory of input.data.memories ?? []) {
    const id =
      memory.id ??
      generateObjectId({
        type: memory.kind,
        title: memory.title,
        existingIds: reservedObjectIds
      });
    reservedObjectIds.add(id);

    changes.push(createObjectChange(memory, id));

    for (const related of memory.related ?? []) {
      changes.push(createRelatedRelationChange(id, related));
    }
  }

  for (const update of input.data.updates ?? []) {
    changes.push(updateObjectChange(update, objectsById.get(update.id)?.sidecar.facets));
  }

  for (const stale of input.data.stale ?? []) {
    changes.push(markStaleChange(stale));
  }

  for (const supersede of input.data.supersede ?? []) {
    changes.push(supersedeObjectChange(supersede));
  }

  for (const relation of input.data.relations ?? []) {
    changes.push(createRelationChange(relation));
  }

  if (changes.length === 0) {
    return invalidRememberInput("Remember input must include at least one memory action.", {
      field: "memories|updates|stale|supersede|relations"
    });
  }

  return ok({
    source: {
      kind: "agent",
      task: input.data.task
    },
    changes
  });
}

function createObjectChange(
  memory: RememberMemoryInputItem,
  id: ObjectId
): RememberPatchCreateObject {
  return compactChange({
    op: "create_object",
    id,
    type: memory.kind,
    title: memory.title,
    body: memory.body,
    ...(memory.tags === undefined ? {} : { tags: memory.tags }),
    ...facetsField(facetsForKind(memory.kind, memory.category, memory.applies_to)),
    ...(memory.evidence === undefined ? {} : { evidence: memory.evidence }),
    ...(memory.origin === undefined ? {} : { origin: memory.origin })
  });
}

function updateObjectChange(
  update: RememberUpdateInputItem,
  existingFacets: ObjectFacets | undefined
): RememberPatchUpdateObject {
  return compactChange({
    op: "update_object",
    id: update.id,
    ...(update.title === undefined ? {} : { title: update.title }),
    ...(update.body === undefined ? {} : { body: update.body }),
    ...(update.tags === undefined ? {} : { tags: update.tags }),
    ...facetsField(updateFacets(update, existingFacets)),
    ...(update.evidence === undefined ? {} : { evidence: update.evidence }),
    ...(update.origin === undefined ? {} : { origin: update.origin })
  });
}

function markStaleChange(stale: RememberStaleInputItem): RememberPatchMarkStale {
  return {
    op: "mark_stale",
    id: stale.id,
    reason: stale.reason
  };
}

function supersedeObjectChange(
  supersede: RememberSupersedeInputItem
): RememberPatchSupersedeObject {
  return {
    op: "supersede_object",
    id: supersede.id,
    superseded_by: supersede.superseded_by,
    reason: supersede.reason
  };
}

function createRelationChange(relation: RememberRelationInputItem): RememberPatchCreateRelation {
  return compactChange({
    op: "create_relation",
    from: relation.from,
    predicate: relation.predicate,
    to: relation.to,
    ...(relation.confidence === undefined ? {} : { confidence: relation.confidence }),
    ...(relation.evidence === undefined ? {} : { evidence: relation.evidence })
  });
}

function createRelatedRelationChange(
  from: ObjectId,
  related: RememberRelatedInput
): RememberPatchCreateRelation {
  return compactChange({
    op: "create_relation",
    from,
    predicate: related.predicate,
    to: related.to,
    ...(related.confidence === undefined ? {} : { confidence: related.confidence }),
    ...(related.evidence === undefined ? {} : { evidence: related.evidence })
  });
}

function facetsForKind(
  kind: RememberMemoryKind,
  explicitCategory: FacetCategory | undefined,
  appliesTo: string[] | undefined
): ObjectFacets | undefined {
  const category = explicitCategory ?? defaultFacetCategory(kind);

  if (category === undefined && appliesTo === undefined) {
    return undefined;
  }

  return compactFacets({
    category: category ?? "concept",
    ...(appliesTo === undefined ? {} : { applies_to: appliesTo })
  });
}

function updateFacets(
  update: RememberUpdateInputItem,
  existingFacets: ObjectFacets | undefined
): ObjectFacets | undefined {
  if (update.category === undefined && update.applies_to === undefined) {
    return undefined;
  }

  return compactFacets({
    category: update.category ?? existingFacets?.category ?? "concept",
    ...(update.applies_to === undefined ? {} : { applies_to: update.applies_to }),
    ...(existingFacets?.load_modes === undefined ? {} : { load_modes: existingFacets.load_modes })
  });
}

function defaultFacetCategory(kind: RememberMemoryKind): FacetCategory | undefined {
  switch (kind) {
    case "source":
      return "source";
    case "decision":
      return "decision-rationale";
    case "fact":
      return "debugging-fact";
    case "gotcha":
      return "gotcha";
    case "workflow":
      return "workflow";
    case "question":
      return "open-question";
    case "concept":
      return "concept";
    case "synthesis":
    case "constraint":
    case "note":
      return undefined;
  }
}

function facetsField(facets: ObjectFacets | undefined): { facets?: ObjectFacets } {
  return facets === undefined ? {} : { facets };
}

function compactFacets(facets: ObjectFacets): ObjectFacets {
  return {
    category: facets.category,
    ...(facets.applies_to === undefined || facets.applies_to.length === 0
      ? {}
      : { applies_to: facets.applies_to }),
    ...(facets.load_modes === undefined || facets.load_modes.length === 0
      ? {}
      : { load_modes: facets.load_modes })
  };
}

function compactChange<T extends RememberPatchChange>(change: T): T {
  return change;
}

function parseRememberMemoryInput(value: unknown): Result<RememberMemoryInput> {
  if (!isRecord(value)) {
    return invalidRememberInput("Remember input must be an object.", { field: "<input>" });
  }

  const task = stringField(value, "task");

  if (!task.ok) {
    return task;
  }

  const memories = optionalArray(value.memories, "memories", parseMemoryInputItem);
  if (!memories.ok) {
    return memories;
  }

  const updates = optionalArray(value.updates, "updates", parseUpdateInputItem);
  if (!updates.ok) {
    return updates;
  }

  const stale = optionalArray(value.stale, "stale", parseStaleInputItem);
  if (!stale.ok) {
    return stale;
  }

  const supersede = optionalArray(value.supersede, "supersede", parseSupersedeInputItem);
  if (!supersede.ok) {
    return supersede;
  }

  const relations = optionalArray(value.relations, "relations", parseRelationInputItem);
  if (!relations.ok) {
    return relations;
  }

  return ok({
    task: task.data,
    ...(memories.data.length === 0 ? {} : { memories: memories.data }),
    ...(updates.data.length === 0 ? {} : { updates: updates.data }),
    ...(stale.data.length === 0 ? {} : { stale: stale.data }),
    ...(supersede.data.length === 0 ? {} : { supersede: supersede.data }),
    ...(relations.data.length === 0 ? {} : { relations: relations.data })
  });
}

function parseMemoryInputItem(value: unknown, field: string): Result<RememberMemoryInputItem> {
  if (!isRecord(value)) {
    return invalidRememberInput("Remember memory item must be an object.", { field });
  }

  const kind = memoryKindField(value, `${field}.kind`);
  if (!kind.ok) {
    return kind;
  }

  const title = stringField(value, "title", `${field}.title`);
  if (!title.ok) {
    return title;
  }

  const body = stringField(value, "body", `${field}.body`);
  if (!body.ok) {
    return body;
  }

  const id = optionalObjectIdField(value.id, `${field}.id`);
  if (!id.ok) {
    return id;
  }

  const tags = optionalStringArray(value.tags, `${field}.tags`);
  if (!tags.ok) {
    return tags;
  }

  const appliesTo = optionalStringArray(value.applies_to, `${field}.applies_to`);
  if (!appliesTo.ok) {
    return appliesTo;
  }

  const category = optionalFacetCategoryField(value.category, `${field}.category`);
  if (!category.ok) {
    return category;
  }

  const evidence = optionalEvidenceArray(value.evidence, `${field}.evidence`);
  if (!evidence.ok) {
    return evidence;
  }

  const origin = optionalSourceOrigin(value.origin, `${field}.origin`);
  if (!origin.ok) {
    return origin;
  }

  const related = optionalArray(value.related, `${field}.related`, parseRelatedInputItem);
  if (!related.ok) {
    return related;
  }

  return ok({
    ...(id.data === undefined ? {} : { id: id.data }),
    kind: kind.data,
    title: title.data,
    body: body.data,
    ...(tags.data === undefined ? {} : { tags: tags.data }),
    ...(appliesTo.data === undefined ? {} : { applies_to: appliesTo.data }),
    ...(category.data === undefined ? {} : { category: category.data }),
    ...(evidence.data === undefined ? {} : { evidence: evidence.data }),
    ...(origin.data === undefined ? {} : { origin: origin.data }),
    ...(related.data.length === 0 ? {} : { related: related.data })
  });
}

function parseUpdateInputItem(value: unknown, field: string): Result<RememberUpdateInputItem> {
  if (!isRecord(value)) {
    return invalidRememberInput("Remember update item must be an object.", { field });
  }

  const id = objectIdField(value, "id", `${field}.id`);
  if (!id.ok) {
    return id;
  }

  const title = optionalStringField(value.title, `${field}.title`);
  if (!title.ok) {
    return title;
  }

  const body = optionalStringField(value.body, `${field}.body`);
  if (!body.ok) {
    return body;
  }

  const tags = optionalStringArray(value.tags, `${field}.tags`);
  if (!tags.ok) {
    return tags;
  }

  const appliesTo = optionalStringArray(value.applies_to, `${field}.applies_to`);
  if (!appliesTo.ok) {
    return appliesTo;
  }

  const category = optionalFacetCategoryField(value.category, `${field}.category`);
  if (!category.ok) {
    return category;
  }

  const evidence = optionalEvidenceArray(value.evidence, `${field}.evidence`);
  if (!evidence.ok) {
    return evidence;
  }

  const origin = optionalSourceOrigin(value.origin, `${field}.origin`);
  if (!origin.ok) {
    return origin;
  }

  if (
    title.data === undefined &&
    body.data === undefined &&
    tags.data === undefined &&
    appliesTo.data === undefined &&
    category.data === undefined &&
    evidence.data === undefined &&
    origin.data === undefined
  ) {
    return invalidRememberInput("Remember update item must include at least one update field.", {
      field
    });
  }

  return ok({
    id: id.data,
    ...(title.data === undefined ? {} : { title: title.data }),
    ...(body.data === undefined ? {} : { body: body.data }),
    ...(tags.data === undefined ? {} : { tags: tags.data }),
    ...(appliesTo.data === undefined ? {} : { applies_to: appliesTo.data }),
    ...(category.data === undefined ? {} : { category: category.data }),
    ...(evidence.data === undefined ? {} : { evidence: evidence.data }),
    ...(origin.data === undefined ? {} : { origin: origin.data })
  });
}

function parseStaleInputItem(value: unknown, field: string): Result<RememberStaleInputItem> {
  if (!isRecord(value)) {
    return invalidRememberInput("Remember stale item must be an object.", { field });
  }

  const id = objectIdField(value, "id", `${field}.id`);
  if (!id.ok) {
    return id;
  }

  const reason = stringField(value, "reason", `${field}.reason`);
  if (!reason.ok) {
    return reason;
  }

  return ok({ id: id.data, reason: reason.data });
}

function parseSupersedeInputItem(
  value: unknown,
  field: string
): Result<RememberSupersedeInputItem> {
  if (!isRecord(value)) {
    return invalidRememberInput("Remember supersede item must be an object.", { field });
  }

  const id = objectIdField(value, "id", `${field}.id`);
  if (!id.ok) {
    return id;
  }

  const supersededBy = objectIdField(value, "superseded_by", `${field}.superseded_by`);
  if (!supersededBy.ok) {
    return supersededBy;
  }

  const reason = stringField(value, "reason", `${field}.reason`);
  if (!reason.ok) {
    return reason;
  }

  return ok({
    id: id.data,
    superseded_by: supersededBy.data,
    reason: reason.data
  });
}

function parseRelationInputItem(
  value: unknown,
  field: string
): Result<RememberRelationInputItem> {
  if (!isRecord(value)) {
    return invalidRememberInput("Remember relation item must be an object.", { field });
  }

  const from = objectIdField(value, "from", `${field}.from`);
  if (!from.ok) {
    return from;
  }

  const predicate = predicateField(value.predicate, `${field}.predicate`);
  if (!predicate.ok) {
    return predicate;
  }

  const to = objectIdField(value, "to", `${field}.to`);
  if (!to.ok) {
    return to;
  }

  const confidence = optionalRelationConfidenceField(value.confidence, `${field}.confidence`);
  if (!confidence.ok) {
    return confidence;
  }

  const evidence = optionalEvidenceArray(value.evidence, `${field}.evidence`);
  if (!evidence.ok) {
    return evidence;
  }

  return ok({
    from: from.data,
    predicate: predicate.data,
    to: to.data,
    ...(confidence.data === undefined ? {} : { confidence: confidence.data }),
    ...(evidence.data === undefined ? {} : { evidence: evidence.data })
  });
}

function parseRelatedInputItem(value: unknown, field: string): Result<RememberRelatedInput> {
  if (!isRecord(value)) {
    return invalidRememberInput("Remember related item must be an object.", { field });
  }

  const predicate = predicateField(value.predicate, `${field}.predicate`);
  if (!predicate.ok) {
    return predicate;
  }

  const to = objectIdField(value, "to", `${field}.to`);
  if (!to.ok) {
    return to;
  }

  const confidence = optionalRelationConfidenceField(value.confidence, `${field}.confidence`);
  if (!confidence.ok) {
    return confidence;
  }

  const evidence = optionalEvidenceArray(value.evidence, `${field}.evidence`);
  if (!evidence.ok) {
    return evidence;
  }

  return ok({
    predicate: predicate.data,
    to: to.data,
    ...(confidence.data === undefined ? {} : { confidence: confidence.data }),
    ...(evidence.data === undefined ? {} : { evidence: evidence.data })
  });
}

function optionalArray<T>(
  value: unknown,
  field: string,
  parseItem: (item: unknown, field: string) => Result<T>
): Result<T[]> {
  if (value === undefined) {
    return ok([]);
  }

  if (!Array.isArray(value)) {
    return invalidRememberInput("Remember input field must be an array.", { field });
  }

  const parsed: T[] = [];

  for (const [index, item] of value.entries()) {
    const result = parseItem(item, `${field}.${index}`);

    if (!result.ok) {
      return result;
    }

    parsed.push(result.data);
  }

  return ok(parsed);
}

function stringField(
  record: Record<string, unknown>,
  key: string,
  field = key
): Result<string> {
  const value = record[key];

  if (typeof value !== "string" || value.trim() === "") {
    return invalidRememberInput("Remember input field must be a non-empty string.", {
      field
    });
  }

  return ok(value.trim());
}

function optionalStringField(value: unknown, field: string): Result<string | undefined> {
  if (value === undefined) {
    return ok(undefined);
  }

  if (typeof value !== "string" || value.trim() === "") {
    return invalidRememberInput("Remember input field must be a non-empty string.", {
      field
    });
  }

  return ok(value.trim());
}

function objectIdField(
  record: Record<string, unknown>,
  key: string,
  field: string
): Result<ObjectId> {
  const value = record[key];
  return objectIdValue(value, field);
}

function optionalObjectIdField(value: unknown, field: string): Result<ObjectId | undefined> {
  if (value === undefined) {
    return ok(undefined);
  }

  return objectIdValue(value, field);
}

function objectIdValue(value: unknown, field: string): Result<ObjectId> {
  if (typeof value !== "string" || !isObjectId(value)) {
    return invalidRememberInput("Remember input field must be an Memory object ID.", {
      field
    });
  }

  return ok(value);
}

function memoryKindField(
  record: Record<string, unknown>,
  field: string
): Result<RememberMemoryKind> {
  const value = record.kind;

  if (typeof value !== "string" || !REMEMBER_KIND_SET.has(value)) {
    return invalidRememberInput("Remember memory kind is not supported.", {
      field,
      allowed: [...REMEMBER_MEMORY_KINDS]
    });
  }

  return ok(value as RememberMemoryKind);
}

function predicateField(value: unknown, field: string): Result<Predicate> {
  if (typeof value !== "string" || !PREDICATE_SET.has(value)) {
    return invalidRememberInput("Remember relation predicate is not supported.", {
      field,
      allowed: [...PREDICATES]
    });
  }

  return ok(value as Predicate);
}

function optionalRelationConfidenceField(
  value: unknown,
  field: string
): Result<RelationConfidence | undefined> {
  if (value === undefined) {
    return ok(undefined);
  }

  if (typeof value !== "string" || !RELATION_CONFIDENCE_SET.has(value)) {
    return invalidRememberInput("Remember relation confidence is not supported.", {
      field,
      allowed: [...RELATION_CONFIDENCES]
    });
  }

  return ok(value as RelationConfidence);
}

function optionalFacetCategoryField(
  value: unknown,
  field: string
): Result<FacetCategory | undefined> {
  if (value === undefined) {
    return ok(undefined);
  }

  if (typeof value !== "string" || !FACET_CATEGORY_SET.has(value)) {
    return invalidRememberInput("Remember facet category is not supported.", {
      field,
      allowed: [...FACET_CATEGORIES]
    });
  }

  return ok(value as FacetCategory);
}

function optionalStringArray(value: unknown, field: string): Result<string[] | undefined> {
  if (value === undefined) {
    return ok(undefined);
  }

  if (!Array.isArray(value)) {
    return invalidRememberInput("Remember input field must be an array of strings.", {
      field
    });
  }

  const strings: string[] = [];

  for (const [index, item] of value.entries()) {
    if (typeof item !== "string" || item.trim() === "") {
      return invalidRememberInput("Remember input array item must be a non-empty string.", {
        field: `${field}.${index}`
      });
    }

    strings.push(item.trim());
  }

  return ok([...new Set(strings)]);
}

function optionalEvidenceArray(value: unknown, field: string): Result<Evidence[] | undefined> {
  if (value === undefined) {
    return ok(undefined);
  }

  if (!Array.isArray(value)) {
    return invalidRememberInput("Remember evidence must be an array.", { field });
  }

  const evidence: Evidence[] = [];

  for (const [index, item] of value.entries()) {
    if (!isRecord(item)) {
      return invalidRememberInput("Remember evidence item must be an object.", {
        field: `${field}.${index}`
      });
    }

    const kind = item.kind;
    const id = item.id;

    if (
      kind !== "memory" &&
      kind !== "relation" &&
      kind !== "file" &&
      kind !== "commit" &&
      kind !== "task" &&
      kind !== "source"
    ) {
      return invalidRememberInput("Remember evidence kind is not supported.", {
        field: `${field}.${index}.kind`
      });
    }

    if (typeof id !== "string" || id.trim() === "") {
      return invalidRememberInput("Remember evidence id must be a non-empty string.", {
        field: `${field}.${index}.id`
      });
    }

    evidence.push({ kind, id: id.trim() });
  }

  return ok(evidence);
}

function optionalSourceOrigin(value: unknown, field: string): Result<SourceOrigin | undefined> {
  if (value === undefined) {
    return ok(undefined);
  }

  if (!isRecord(value)) {
    return invalidRememberInput("Remember origin must be an object.", { field });
  }

  const kind = value.kind;
  if (typeof kind !== "string" || !(ORIGIN_KINDS as readonly string[]).includes(kind)) {
    return invalidRememberInput("Remember origin kind is not supported.", {
      field: `${field}.kind`,
      allowed: [...ORIGIN_KINDS]
    });
  }

  const locator = value.locator;
  if (typeof locator !== "string" || locator.trim() === "") {
    return invalidRememberInput("Remember origin locator must be a non-empty string.", {
      field: `${field}.locator`
    });
  }

  const capturedAt = optionalStringField(value.captured_at, `${field}.captured_at`);
  if (!capturedAt.ok) {
    return capturedAt;
  }

  const digest = optionalStringField(value.digest, `${field}.digest`);
  if (!digest.ok) {
    return digest;
  }

  const mediaType = optionalStringField(value.media_type, `${field}.media_type`);
  if (!mediaType.ok) {
    return mediaType;
  }

  return ok({
    kind: kind as SourceOrigin["kind"],
    locator: locator.trim(),
    ...(capturedAt.data === undefined ? {} : { captured_at: capturedAt.data }),
    ...(digest.data === undefined ? {} : { digest: digest.data }),
    ...(mediaType.data === undefined ? {} : { media_type: mediaType.data })
  });
}

function invalidRememberInput<T>(message: string, details: JsonValue): Result<T> {
  return err(memoryError("MemoryValidationFailed", message, details));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
