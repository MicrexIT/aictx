import { describe, expect, it } from "vitest";

import {
  ACTORS,
  EVENT_TYPES,
  OBJECT_TYPES,
  PATCH_OPERATIONS,
  PREDICATES,
  SCOPE_KINDS
} from "../../../src/core/types.js";

describe("core domain type constants", () => {
  it("exports object types from the storage spec", () => {
    expect(OBJECT_TYPES).toEqual([
      "project",
      "architecture",
      "decision",
      "constraint",
      "question",
      "fact",
      "note",
      "concept"
    ]);
  });

  it("exports predicates from the storage spec", () => {
    expect(PREDICATES).toEqual([
      "affects",
      "requires",
      "depends_on",
      "supersedes",
      "conflicts_with",
      "mentions",
      "implements",
      "related_to"
    ]);
  });

  it("exports event types from the storage spec", () => {
    expect(EVENT_TYPES).toEqual([
      "memory.created",
      "memory.updated",
      "memory.marked_stale",
      "memory.superseded",
      "memory.rejected",
      "memory.deleted",
      "relation.created",
      "relation.updated",
      "relation.deleted",
      "index.rebuilt",
      "context.generated"
    ]);
  });

  it("exports actors and scope kinds from the specs", () => {
    expect(ACTORS).toEqual(["agent", "user", "cli", "mcp", "system"]);
    expect(SCOPE_KINDS).toEqual(["project", "branch", "task"]);
  });

  it("exports patch operations from the API spec", () => {
    expect(PATCH_OPERATIONS).toEqual([
      "create_object",
      "update_object",
      "mark_stale",
      "supersede_object",
      "delete_object",
      "create_relation",
      "update_relation",
      "delete_relation"
    ]);
  });
});
