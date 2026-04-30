# Aictx Schemas and Validation Spec

## 1. Purpose

This document defines v1 validation behavior for Aictx.

It owns:

* Exact JSON Schema contracts for canonical schema files
* Patch schema rules
* Validation severity model
* Hash canonicalization
* Secret detection rules
* Conflict marker detection

This spec depends on:

* `storage-format-spec.md`
* `mcp-and-cli-api-spec.md`
* `indexing-and-context-compiler-spec.md`

## 2. Schema Files

V1 stores these canonical schema files:

```text
.aictx/schema/config.schema.json
.aictx/schema/object.schema.json
.aictx/schema/relation.schema.json
.aictx/schema/event.schema.json
.aictx/schema/patch.schema.json
```

Rules:

* Schemas use JSON Schema Draft 2020-12.
* Schema files are canonical and should be tracked when Git is available.
* Runtime validation should use the project-local schemas for project data validation.
* Unknown top-level fields are invalid unless a schema explicitly allows them.
* Schema `$id` values use `https://aictx.dev/schemas/v1/<name>.schema.json`.

## 3. Shared Definitions

These definitions are reused across schemas.

```json
{
  "$defs": {
    "id": {
      "type": "string",
      "pattern": "^[a-z][a-z0-9_]*\\.[a-z0-9][a-z0-9-]*$"
    },
    "relationId": {
      "type": "string",
      "pattern": "^rel\\.[a-z0-9][a-z0-9-]*$"
    },
    "slug": {
      "type": "string",
      "pattern": "^[a-z0-9][a-z0-9-]*$"
    },
    "tag": {
      "type": "string",
      "pattern": "^[a-z0-9][a-z0-9-]*$"
    },
    "isoDateTime": {
      "type": "string",
      "pattern": "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,9})?(Z|[+-]\\d{2}:\\d{2})$"
    },
    "sha256": {
      "type": "string",
      "pattern": "^sha256:[a-f0-9]{64}$"
    },
    "scope": {
      "type": "object",
      "additionalProperties": false,
      "required": ["kind", "project", "branch", "task"],
      "properties": {
        "kind": {
          "enum": ["project", "branch", "task"]
        },
        "project": {
          "type": "string",
          "pattern": "^project\\.[a-z0-9][a-z0-9-]*$"
        },
        "branch": {
          "type": ["string", "null"]
        },
        "task": {
          "type": ["string", "null"]
        }
      }
    },
    "source": {
      "type": "object",
      "additionalProperties": false,
      "required": ["kind"],
      "properties": {
        "kind": {
          "enum": ["agent", "user", "cli", "mcp", "system"]
        },
        "task": {
          "type": "string"
        },
        "commit": {
          "type": "string",
          "minLength": 1
        }
      }
    }
  }
}
```

Implementation note: each schema file may duplicate these `$defs` locally in v1. A shared schema file is not required.

## 4. Config Schema

File:

```text
.aictx/schema/config.schema.json
```

Schema:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://aictx.dev/schemas/v1/config.schema.json",
  "type": "object",
  "additionalProperties": false,
  "required": ["version", "project", "memory", "git"],
  "properties": {
    "version": {
      "const": 1
    },
    "project": {
      "type": "object",
      "additionalProperties": false,
      "required": ["id", "name"],
      "properties": {
        "id": {
          "type": "string",
          "pattern": "^project\\.[a-z0-9][a-z0-9-]*$"
        },
        "name": {
          "type": "string",
          "minLength": 1
        }
      }
    },
    "memory": {
      "type": "object",
      "additionalProperties": false,
      "required": ["defaultTokenBudget", "autoIndex", "saveContextPacks"],
      "properties": {
        "defaultTokenBudget": {
          "type": "integer",
          "minimum": 501,
          "maximum": 50000
        },
        "autoIndex": {
          "type": "boolean"
        },
        "saveContextPacks": {
          "type": "boolean"
        }
      }
    },
    "git": {
      "type": "object",
      "additionalProperties": false,
      "required": ["trackContextPacks"],
      "properties": {
        "trackContextPacks": {
          "type": "boolean"
        }
      }
    }
  }
}
```

## 5. Object Schema

File:

```text
.aictx/schema/object.schema.json
```

Schema:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://aictx.dev/schemas/v1/object.schema.json",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "id",
    "type",
    "status",
    "title",
    "body_path",
    "scope",
    "content_hash",
    "created_at",
    "updated_at"
  ],
  "properties": {
    "id": {
      "type": "string",
      "pattern": "^[a-z][a-z0-9_]*\\.[a-z0-9][a-z0-9-]*$"
    },
    "type": {
      "enum": ["project", "architecture", "decision", "constraint", "question", "fact", "gotcha", "workflow", "note", "concept"]
    },
    "status": {
      "enum": ["active", "draft", "stale", "superseded", "rejected", "open", "closed"]
    },
    "title": {
      "type": "string",
      "minLength": 1
    },
    "body_path": {
      "type": "string",
      "pattern": "^memory\\/.+\\.md$"
    },
    "scope": {
      "type": "object",
      "additionalProperties": false,
      "required": ["kind", "project", "branch", "task"],
      "properties": {
        "kind": {
          "enum": ["project", "branch", "task"]
        },
        "project": {
          "type": "string",
          "pattern": "^project\\.[a-z0-9][a-z0-9-]*$"
        },
        "branch": {
          "type": ["string", "null"]
        },
        "task": {
          "type": ["string", "null"]
        }
      }
    },
    "tags": {
      "type": "array",
      "items": {
        "type": "string",
        "pattern": "^[a-z0-9][a-z0-9-]*$"
      },
      "uniqueItems": true
    },
    "source": {
      "type": "object",
      "additionalProperties": false,
      "required": ["kind"],
      "properties": {
        "kind": {
          "enum": ["agent", "user", "cli", "mcp", "system"]
        },
        "task": {
          "type": "string"
        },
        "commit": {
          "type": "string",
          "minLength": 1
        }
      }
    },
    "superseded_by": {
      "type": ["string", "null"],
      "pattern": "^[a-z][a-z0-9_]*\\.[a-z0-9][a-z0-9-]*$"
    },
    "content_hash": {
      "type": "string",
      "pattern": "^sha256:[a-f0-9]{64}$"
    },
    "created_at": {
      "type": "string",
      "pattern": "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,9})?(Z|[+-]\\d{2}:\\d{2})$"
    },
    "updated_at": {
      "type": "string",
      "pattern": "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,9})?(Z|[+-]\\d{2}:\\d{2})$"
    }
  },
  "allOf": [
    {
      "if": {
        "properties": {
          "type": {
            "const": "question"
          }
        }
      },
      "then": {
        "properties": {
          "status": {
            "enum": ["active", "draft", "stale", "superseded", "rejected", "open", "closed"]
          }
        }
      },
      "else": {
        "properties": {
          "status": {
            "enum": ["active", "draft", "stale", "superseded", "rejected"]
          }
        }
      }
    }
  ]
}
```

Additional object validation outside JSON Schema:

* `id` prefix must equal `type`.
* `body_path` must exist.
* `body_path` must not escape `.aictx/`.
* JSON title and Markdown H1 mismatch is a warning.
* Duplicate object IDs are errors.
* `superseded` objects without `superseded_by` or a `supersedes` relation produce a warning.

## 6. Relation Schema

File:

```text
.aictx/schema/relation.schema.json
```

Schema:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://aictx.dev/schemas/v1/relation.schema.json",
  "type": "object",
  "additionalProperties": false,
  "required": ["id", "from", "predicate", "to", "status", "created_at", "updated_at"],
  "properties": {
    "id": {
      "type": "string",
      "pattern": "^rel\\.[a-z0-9][a-z0-9-]*$"
    },
    "from": {
      "type": "string",
      "pattern": "^[a-z][a-z0-9_]*\\.[a-z0-9][a-z0-9-]*$"
    },
    "predicate": {
      "enum": ["affects", "requires", "depends_on", "supersedes", "conflicts_with", "mentions", "implements", "related_to"]
    },
    "to": {
      "type": "string",
      "pattern": "^[a-z][a-z0-9_]*\\.[a-z0-9][a-z0-9-]*$"
    },
    "status": {
      "enum": ["active", "stale", "rejected"]
    },
    "confidence": {
      "enum": ["low", "medium", "high"]
    },
    "evidence": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["kind", "id"],
        "properties": {
          "kind": {
            "enum": ["memory", "relation", "file", "commit"]
          },
          "id": {
            "type": "string",
            "minLength": 1
          }
        }
      }
    },
    "content_hash": {
      "type": "string",
      "pattern": "^sha256:[a-f0-9]{64}$"
    },
    "created_at": {
      "type": "string",
      "pattern": "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,9})?(Z|[+-]\\d{2}:\\d{2})$"
    },
    "updated_at": {
      "type": "string",
      "pattern": "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,9})?(Z|[+-]\\d{2}:\\d{2})$"
    }
  }
}
```

Additional relation validation outside JSON Schema:

* `from` must reference an existing object.
* `to` must reference an existing object.
* Duplicate equivalent relations are errors.
* Duplicate relation IDs are errors.
* `from`, `predicate`, and `to` identify relation equivalence.

## 7. Event Schema

File:

```text
.aictx/schema/event.schema.json
```

Schema:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://aictx.dev/schemas/v1/event.schema.json",
  "type": "object",
  "additionalProperties": false,
  "required": ["event", "actor", "timestamp"],
  "properties": {
    "event": {
      "enum": [
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
      ]
    },
    "id": {
      "type": "string",
      "pattern": "^[a-z][a-z0-9_]*\\.[a-z0-9][a-z0-9-]*$"
    },
    "relation_id": {
      "type": "string",
      "pattern": "^rel\\.[a-z0-9][a-z0-9-]*$"
    },
    "actor": {
      "enum": ["agent", "user", "cli", "mcp", "system"]
    },
    "timestamp": {
      "type": "string",
      "pattern": "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,9})?(Z|[+-]\\d{2}:\\d{2})$"
    },
    "reason": {
      "type": "string"
    },
    "payload": {
      "type": "object"
    }
  },
  "allOf": [
    {
      "if": {
        "properties": {
          "event": {
            "pattern": "^memory\\."
          }
        }
      },
      "then": {
        "required": ["id"]
      }
    },
    {
      "if": {
        "properties": {
          "event": {
            "pattern": "^relation\\."
          }
        }
      },
      "then": {
        "required": ["relation_id"]
      }
    }
  ]
}
```

JSONL validation:

* Each line must parse as one JSON object.
* Blank lines are errors.
* Each event object must validate against `event.schema.json`.
* Line numbers should be reported in validation errors.
* `index.rebuilt` is schema-valid, but v1 `aictx rebuild` must not append it because rebuilds must not mutate canonical files.

## 8. Patch Schema

File:

```text
.aictx/schema/patch.schema.json
```

Schema:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://aictx.dev/schemas/v1/patch.schema.json",
  "type": "object",
  "additionalProperties": false,
  "required": ["source", "changes"],
  "properties": {
    "source": {
      "type": "object",
      "additionalProperties": false,
      "required": ["kind"],
      "properties": {
        "kind": {
          "enum": ["agent", "user", "cli", "mcp", "system"]
        },
        "task": {
          "type": "string"
        },
        "commit": {
          "type": "string",
          "minLength": 1
        }
      }
    },
    "changes": {
      "type": "array",
      "minItems": 1,
      "items": {
        "oneOf": [
          {
            "$ref": "#/$defs/createObject"
          },
          {
            "$ref": "#/$defs/updateObject"
          },
          {
            "$ref": "#/$defs/markStale"
          },
          {
            "$ref": "#/$defs/supersedeObject"
          },
          {
            "$ref": "#/$defs/deleteObject"
          },
          {
            "$ref": "#/$defs/createRelation"
          },
          {
            "$ref": "#/$defs/updateRelation"
          },
          {
            "$ref": "#/$defs/deleteRelation"
          }
        ]
      }
    }
  },
  "$defs": {
    "objectId": {
      "type": "string",
      "pattern": "^[a-z][a-z0-9_]*\\.[a-z0-9][a-z0-9-]*$"
    },
    "relationId": {
      "type": "string",
      "pattern": "^rel\\.[a-z0-9][a-z0-9-]*$"
    },
    "scope": {
      "type": "object",
      "additionalProperties": false,
      "required": ["kind", "project", "branch", "task"],
      "properties": {
        "kind": {
          "enum": ["project", "branch", "task"]
        },
        "project": {
          "type": "string",
          "pattern": "^project\\.[a-z0-9][a-z0-9-]*$"
        },
        "branch": {
          "type": ["string", "null"]
        },
        "task": {
          "type": ["string", "null"]
        }
      }
    },
    "tags": {
      "type": "array",
      "items": {
        "type": "string",
        "pattern": "^[a-z0-9][a-z0-9-]*$"
      },
      "uniqueItems": true
    },
    "source": {
      "type": "object",
      "additionalProperties": false,
      "required": ["kind"],
      "properties": {
        "kind": {
          "enum": ["agent", "user", "cli", "mcp", "system"]
        },
        "task": {
          "type": "string"
        },
        "commit": {
          "type": "string",
          "minLength": 1
        }
      }
    },
    "evidence": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["kind", "id"],
        "properties": {
          "kind": {
            "enum": ["memory", "relation", "file", "commit"]
          },
          "id": {
            "type": "string",
            "minLength": 1
          }
        }
      }
    },
    "createObject": {
      "type": "object",
      "additionalProperties": false,
      "required": ["op", "type", "title", "body"],
      "properties": {
        "op": {
          "const": "create_object"
        },
        "id": {
          "$ref": "#/$defs/objectId"
        },
        "type": {
          "enum": ["project", "architecture", "decision", "constraint", "question", "fact", "gotcha", "workflow", "note", "concept"]
        },
        "status": {
          "enum": ["active", "draft", "stale", "superseded", "rejected", "open", "closed"]
        },
        "title": {
          "type": "string",
          "minLength": 1
        },
        "body": {
          "type": "string",
          "minLength": 1
        },
        "scope": {
          "$ref": "#/$defs/scope"
        },
        "tags": {
          "$ref": "#/$defs/tags"
        },
        "source": {
          "$ref": "#/$defs/source"
        }
      }
    },
    "updateObject": {
      "type": "object",
      "additionalProperties": false,
      "required": ["op", "id"],
      "properties": {
        "op": {
          "const": "update_object"
        },
        "id": {
          "$ref": "#/$defs/objectId"
        },
        "status": {
          "enum": ["active", "draft", "stale", "superseded", "rejected", "open", "closed"]
        },
        "title": {
          "type": "string",
          "minLength": 1
        },
        "body": {
          "type": "string",
          "minLength": 1
        },
        "scope": {
          "$ref": "#/$defs/scope"
        },
        "tags": {
          "$ref": "#/$defs/tags"
        },
        "source": {
          "$ref": "#/$defs/source"
        },
        "superseded_by": {
          "$ref": "#/$defs/objectId"
        }
      }
    },
    "markStale": {
      "type": "object",
      "additionalProperties": false,
      "required": ["op", "id", "reason"],
      "properties": {
        "op": {
          "const": "mark_stale"
        },
        "id": {
          "$ref": "#/$defs/objectId"
        },
        "reason": {
          "type": "string",
          "minLength": 1
        }
      }
    },
    "supersedeObject": {
      "type": "object",
      "additionalProperties": false,
      "required": ["op", "id", "superseded_by", "reason"],
      "properties": {
        "op": {
          "const": "supersede_object"
        },
        "id": {
          "$ref": "#/$defs/objectId"
        },
        "superseded_by": {
          "$ref": "#/$defs/objectId"
        },
        "reason": {
          "type": "string",
          "minLength": 1
        }
      }
    },
    "deleteObject": {
      "type": "object",
      "additionalProperties": false,
      "required": ["op", "id"],
      "properties": {
        "op": {
          "const": "delete_object"
        },
        "id": {
          "$ref": "#/$defs/objectId"
        }
      }
    },
    "createRelation": {
      "type": "object",
      "additionalProperties": false,
      "required": ["op", "from", "predicate", "to"],
      "properties": {
        "op": {
          "const": "create_relation"
        },
        "id": {
          "$ref": "#/$defs/relationId"
        },
        "from": {
          "$ref": "#/$defs/objectId"
        },
        "predicate": {
          "enum": ["affects", "requires", "depends_on", "supersedes", "conflicts_with", "mentions", "implements", "related_to"]
        },
        "to": {
          "$ref": "#/$defs/objectId"
        },
        "status": {
          "enum": ["active", "stale", "rejected"]
        },
        "confidence": {
          "enum": ["low", "medium", "high"]
        },
        "evidence": {
          "$ref": "#/$defs/evidence"
        }
      }
    },
    "updateRelation": {
      "type": "object",
      "additionalProperties": false,
      "required": ["op", "id"],
      "properties": {
        "op": {
          "const": "update_relation"
        },
        "id": {
          "$ref": "#/$defs/relationId"
        },
        "status": {
          "enum": ["active", "stale", "rejected"]
        },
        "confidence": {
          "enum": ["low", "medium", "high"]
        },
        "evidence": {
          "$ref": "#/$defs/evidence"
        }
      }
    },
    "deleteRelation": {
      "type": "object",
      "additionalProperties": false,
      "required": ["op", "id"],
      "properties": {
        "op": {
          "const": "delete_relation"
        },
        "id": {
          "$ref": "#/$defs/relationId"
        }
      }
    }
  }
}
```

Additional patch validation outside JSON Schema:

* `create_object.id` prefix must match `create_object.type` when ID is provided.
* `create_object.status` must obey object type status rules when status is provided.
* `update_object.status` must obey object type status rules.
* Any supplied scope must obey scope kind rules.
* Scope `kind: "project"` requires `branch: null` and `task: null`.
* Scope `kind: "branch"` requires non-empty `branch` and `task: null`.
* Scope `kind: "task"` requires non-empty `task`; `branch` may be a string or `null`.
* Branch scope is invalid when Git is unavailable.
* `create_relation.from` and `create_relation.to` must exist after applying prior changes in the same patch.
* `supersede_object.superseded_by` must exist after applying prior changes in the same patch.
* `delete_object` must fail if active relations still reference the object.
* The full patch must be validated before canonical files are modified.

## 9. Canonical JSON and Hashing

Hashing must be deterministic across platforms.

### 9.1 Text Normalization

Before hashing:

* Decode files as UTF-8.
* Reject invalid UTF-8.
* Normalize line endings to LF.
* Remove UTF-8 BOM if present.
* Do not trim leading or trailing whitespace from Markdown body content.
* Ensure the Markdown body hash input ends exactly as stored after LF normalization.

Unicode normalization:

* V1 does not normalize Unicode code points.
* Implementations must preserve source text bytes after UTF-8 decode and LF normalization.

### 9.2 Canonical JSON Serialization

Canonical JSON rules:

* Remove the hash field being computed.
* Sort object keys lexicographically by Unicode code point.
* Preserve array order.
* Omit insignificant whitespace.
* Serialize strings using JSON escaping rules.
* Serialize numbers in normal JSON decimal notation.
* Do not include undefined values.
* Include explicit `null` values when present in canonical data.

Object hash input:

```text
canonical_json(object_without_content_hash) + "\n" + normalized_markdown_body
```

Object hash output:

```text
sha256:<lowercase-hex>
```

Relation hash input:

```text
canonical_json(relation_without_content_hash)
```

Relation hashes are optional in v1. If present, they must validate.

### 9.3 Hash Severity

Validation severity:

* Missing memory object `content_hash`: error.
* Mismatched memory object `content_hash`: warning.
* Missing relation `content_hash`: no issue.
* Mismatched relation `content_hash` when present: warning.

Reasoning:

Manual Markdown edits should remain possible. A hash mismatch indicates the sidecar needs refresh, but the memory should still be readable unless other validation errors exist.

## 10. Validation Severity Model

Validation result shape:

```json
{
  "valid": false,
  "errors": [
    {
      "code": "ObjectBodyMissing",
      "message": "Object body file is missing.",
      "path": ".aictx/memory/decisions/billing-retries.json",
      "field": "body_path"
    }
  ],
  "warnings": []
}
```

Error fields:

* `code`
* `message`
* `path`
* `field`

`field` may be `null` when the issue is file-level.

Errors block writes:

* Invalid JSON
* Invalid JSONL
* Schema validation failure
* Missing required canonical files
* Missing Markdown body
* Duplicate object ID
* Duplicate relation ID
* Relation endpoint missing
* Invalid status for object type
* Conflict marker in canonical file
* Unsupported storage version
* Missing object `content_hash`
* Secret detection with severity `block`

Warnings do not block reads:

* Markdown H1 differs from JSON title
* Object hash mismatch
* Relation hash mismatch
* Excessive `related_to`
* Superseded object without replacement link
* Generated directories not gitignored when Git is available
* Secret detection with severity `warn`

## 11. Conflict Marker Detection

Aictx must scan canonical text files for conflict markers.

Canonical text files:

* `.aictx/config.json`
* `.aictx/**/*.json`
* `.aictx/**/*.jsonl`
* `.aictx/**/*.md`

Generated directories are excluded:

* `.aictx/index/`
* `.aictx/context/`
* `.aictx/exports/`

Conflict marker regexes:

```text
^<<<<<<< .+$
^=======$
^>>>>>>> .+$
^||||||| .+$
```

Rules:

* Any conflict marker in a canonical file is an error.
* Save, rebuild, and restore operations must be blocked until conflicts are resolved.
* `aictx diff` may still run when Git is available.

## 12. Secret Detection

Secret detection runs before applying memory patches and during `aictx check`.

Scan targets:

* Patch string fields
* Markdown bodies
* JSON sidecar string fields
* Relation string fields
* Event `reason`
* Event `payload` serialized as JSON

Do not scan:

* Generated SQLite database
* Generated context packs unless `config.git.trackContextPacks` is true
* Generated Obsidian projection exports

### 12.1 Block Rules

These findings block writes and produce `AICtxSecretDetected`.

```text
Private key block:
-----BEGIN (RSA |DSA |EC |OPENSSH |PGP )?PRIVATE KEY-----

GitHub token:
gh[pousr]_[A-Za-z0-9_]{36,255}

GitHub fine-grained token:
github_pat_[A-Za-z0-9_]{22,255}

OpenAI API key:
sk-[A-Za-z0-9_-]{20,}

Stripe secret key:
sk_(live|test)_[A-Za-z0-9]{16,}

Slack token:
xox[baprs]-[A-Za-z0-9-]{10,}

AWS access key:
AKIA[A-Z0-9]{16}

Google API key:
AIza[A-Za-z0-9_-]{35}

Generic assignment secret:
(?i)(password|passwd|secret|api[_-]?key|access[_-]?token|auth[_-]?token)\s*[:=]\s*['\"][^'\"\s]{12,}['\"]
```

### 12.2 Warn Rules

These findings do not block writes by default but appear in warnings.

```text
JWT-like token:
eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+

Bearer token:
(?i)bearer\s+[A-Za-z0-9._~+\/-]{20,}

Long high-entropy string:
[A-Za-z0-9_\-\/+=]{40,}
```

Long high-entropy string rule:

* Warn only when Shannon entropy is at least `4.0`.
* Ignore strings that look like Markdown headings, prose sentences, file paths, URLs, object IDs, relation IDs, or SHA-256 hashes.

### 12.3 Secret Detection Results

Finding shape:

```json
{
  "severity": "block",
  "rule": "openai_api_key",
  "path": ".aictx/memory/notes/example.md",
  "line": 12,
  "message": "Potential OpenAI API key detected."
}
```

Rules:

* Do not print the secret value.
* Include line number when available.
* For patch validation, use JSON pointer path when no file path exists.
* Block-level findings prevent writes.
* Warn-level findings do not prevent writes.

## 13. Acceptance Criteria

Validation is implementation-ready when:

* All canonical schema files can be generated from this spec.
* Config, object, relation, event, and patch examples in this document validate.
* Invalid object status by type is rejected.
* Duplicate IDs are detected outside JSON Schema.
* Relation endpoints are checked outside JSON Schema.
* Hashes are reproducible across platforms.
* LF and CRLF Markdown bodies hash identically after LF normalization.
* Conflict markers in canonical files block writes.
* Obvious secrets block writes without printing secret values.
* Warn-level secret findings appear in validation output without blocking reads.
