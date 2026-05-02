import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  buildAuditFindings,
  type AuditFinding,
  type AuditRule,
  type AuditSeverity
} from "../../../src/discipline/audit.js";
import type {
  Evidence,
  ObjectId,
  ObjectStatus,
  ObjectType,
  Predicate,
  RelationConfidence,
  RelationStatus
} from "../../../src/core/types.js";
import type { MemoryObjectSidecar, StoredMemoryObject } from "../../../src/storage/objects.js";
import type { CanonicalStorageSnapshot } from "../../../src/storage/read.js";
import type { MemoryRelation, StoredMemoryRelation } from "../../../src/storage/relations.js";

const tempRoots: string[] = [];
const TIMESTAMP = "2026-04-25T14:00:00+02:00";
const HASH = `sha256:${"0".repeat(64)}`;

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true }))
  );
});

describe("audit discipline findings", () => {
  it("reports each v1 audit rule with deterministic finding and evidence order", async () => {
    const projectRoot = await createTempRoot("aictx-discipline-audit-rules-");
    await writeProjectFile(projectRoot, "package.json", '{ "version": "1.2.3" }\n');
    await writeProjectFile(projectRoot, "src/current.ts", "export const current = true;\n");
    const objects = [
      memoryObject({
        id: "gotcha.old-cleanup",
        type: "gotcha",
        status: "stale",
        title: "Old cleanup",
        body: longBody("Old cleanup memory is now stale but still linked.")
      }),
      memoryObject({
        id: "decision.duplicate-b",
        status: "draft",
        title: "Shared webhook rule",
        tags: ["webhooks", "stripe", "billing"],
        body: longBody("Second duplicate memory keeps the same title and tags.")
      }),
      memoryObject({
        id: "decision.todo",
        title: "TODO",
        tags: [],
        body: "# TODO\n\nTBD.\n"
      }),
      memoryObject({
        id: "fact.package-version",
        type: "fact",
        title: "Release package version",
        tags: ["release"],
        body: longBody("The package version is 9.9.9 for release notes.")
      }),
      memoryObject({
        id: "decision.superseded-cleanup",
        status: "superseded",
        title: "Superseded cleanup",
        body: longBody("Superseded memory should identify its replacement.")
      }),
      memoryObject({
        id: "gotcha.missing-body-file",
        type: "gotcha",
        title: "Missing body file",
        tags: ["files"],
        body: longBody("This references src/missing.ts for future cleanup.")
      }),
      memoryObject({
        id: "decision.current",
        title: "Current replacement",
        tags: ["current"],
        body: longBody("Current replacement memory remains active.")
      }),
      memoryObject({
        id: "decision.duplicate-a",
        title: "Shared webhook rule",
        tags: ["billing", "stripe", "webhooks"],
        body: longBody("First duplicate memory keeps the same title and tags.")
      })
    ];
    const relations = [
      relation({
        id: "rel.missing-evidence",
        from: "decision.duplicate-a",
        to: "decision.current",
        confidence: "high",
        evidence: []
      }),
      relation({
        id: "rel.stale-active-link",
        from: "gotcha.old-cleanup",
        to: "decision.current",
        evidence: [{ kind: "memory", id: "gotcha.old-cleanup" }]
      }),
      relation({
        id: "rel.missing-file",
        from: "gotcha.missing-body-file",
        to: "decision.current",
        evidence: [{ kind: "file", id: "src/relation-missing.ts" }]
      })
    ];
    const storage = storageSnapshot({ projectRoot, objects, relations });

    const findings = await buildAuditFindings({ projectRoot, storage });
    const reversedFindings = await buildAuditFindings({
      projectRoot,
      storage: storageSnapshot({
        projectRoot,
        objects: [...objects].reverse(),
        relations: [...relations].reverse()
      })
    });

    expect(reversedFindings).toEqual(findings);
    expect(new Set(findings.map((finding) => finding.rule))).toEqual(
      new Set<AuditRule>([
        "vague_memory",
        "duplicate_like_title_or_tags",
        "stale_or_superseded_cleanup",
        "referenced_file_missing",
        "missing_tags",
        "missing_evidence",
        "manifest_version_contradiction"
      ])
    );
    expect(findings.map(findingKey)).toEqual([...findings].sort(compareFindings).map(findingKey));
    for (const finding of findings) {
      expect(finding.evidence.map(evidenceKey)).toEqual(
        [...finding.evidence].sort(compareEvidence).map(evidenceKey)
      );
    }
    expect(findings).toContainEqual(
      expect.objectContaining({
        severity: "warning",
        rule: "referenced_file_missing",
        memory_id: "gotcha.missing-body-file",
        evidence: [
          { kind: "file", id: "src/relation-missing.ts" },
          { kind: "relation", id: "rel.missing-file" }
        ]
      })
    );
    expect(findings).toContainEqual(
      expect.objectContaining({
        severity: "info",
        rule: "vague_memory",
        memory_id: "decision.todo"
      })
    );
  });

  it("returns no findings for healthy deterministic memory", async () => {
    const projectRoot = await createTempRoot("aictx-discipline-audit-healthy-");
    await writeProjectFile(projectRoot, "package.json", '{ "version": "1.2.3" }\n');
    await writeProjectFile(projectRoot, "src/current.ts", "export const current = true;\n");
    const storage = storageSnapshot({
      projectRoot,
      objects: [
        memoryObject({
          id: "project.summary",
          type: "project",
          title: "Project summary",
          tags: [],
          body: longBody("Project memory is allowed to omit tags.")
        }),
        memoryObject({
          id: "decision.current",
          title: "Current implementation decision",
          tags: ["implementation"],
          body: longBody("The package version is 1.2.3 and src/current.ts exists.")
        })
      ],
      relations: [
        relation({
          id: "rel.current-implements-project",
          from: "decision.current",
          predicate: "implements",
          to: "project.summary",
          confidence: "high",
          evidence: [{ kind: "file", id: "src/current.ts" }]
        })
      ]
    });

    await expect(buildAuditFindings({ projectRoot, storage })).resolves.toEqual([]);
  });

  it("reports v2 facet, object evidence, task diary, oversized vague, and duplicate facet findings", async () => {
    const projectRoot = await createTempRoot("aictx-discipline-audit-v2-");
    const storage = storageSnapshot({
      projectRoot,
      version: 2,
      objects: [
        memoryObject({
          id: "decision.no-facets",
          title: "Decision without facets",
          body: longBody("Decision memory should carry facets in storage v2."),
          tags: ["decision"]
        }),
        memoryObject({
          id: "gotcha.no-evidence",
          type: "gotcha",
          title: "Gotcha without evidence",
          body: longBody("Gotcha memory should include evidence when possible."),
          facets: { category: "gotcha" }
        }),
        memoryObject({
          id: "note.task-diary",
          type: "note",
          title: "Changed files",
          body: "I changed three files and tests passed.",
          facets: { category: "concept" },
          evidence: []
        }),
        memoryObject({
          id: "note.large-vague",
          type: "note",
          title: "Notes",
          body: `${"large vague memory ".repeat(230)}`,
          evidence: []
        }),
        memoryObject({
          id: "constraint.duplicate-a",
          type: "constraint",
          title: "Duplicate A",
          body: longBody("First duplicate applies to the same file."),
          facets: { category: "testing", applies_to: ["src/a.ts"] },
          evidence: []
        }),
        memoryObject({
          id: "constraint.duplicate-b",
          type: "constraint",
          title: "Duplicate B",
          body: longBody("Second duplicate applies to the same file."),
          facets: { category: "testing", applies_to: ["src/a.ts"] },
          evidence: []
        })
      ],
      relations: []
    });

    const findings = await buildAuditFindings({ projectRoot, storage });
    const rules = new Set(findings.map((finding) => finding.rule));

    expect(rules.has("missing_facets")).toBe(true);
    expect(rules.has("missing_object_evidence")).toBe(true);
    expect(rules.has("task_diary_like_memory")).toBe(true);
    expect(rules.has("oversized_vague_memory")).toBe(true);
    expect(rules.has("duplicate_like_facet_category")).toBe(true);
  });

  it("reports weak connectivity, unlinked applicability overlap, related_to overuse, and missing rationale gaps", async () => {
    const projectRoot = await createTempRoot("aictx-discipline-audit-connectivity-");
    const storage = storageSnapshot({
      projectRoot,
      version: 2,
      objects: [
        memoryObject({
          id: "decision.weak",
          type: "decision",
          title: "Weak decision",
          body: longBody("Decision memory has no evidence or active relation."),
          facets: { category: "decision-rationale" },
          evidence: []
        }),
        memoryObject({
          id: "decision.overlap-a",
          type: "decision",
          title: "Overlap A",
          body: longBody("First memory applies to rank context."),
          facets: { category: "decision-rationale", applies_to: ["src/context/rank.ts"] },
          evidence: [{ kind: "file", id: "src/context/rank.ts" }]
        }),
        memoryObject({
          id: "fact.overlap-b",
          type: "fact",
          title: "Overlap B",
          body: longBody("Second memory applies to rank context."),
          facets: { category: "debugging-fact", applies_to: ["src/context/rank.ts"] },
          evidence: [{ kind: "file", id: "src/context/rank.ts" }]
        })
      ],
      relations: [
        relation({ id: "rel.related-1", from: "note.related-1", predicate: "related_to", to: "note.related-2" }),
        relation({ id: "rel.related-2", from: "note.related-2", predicate: "related_to", to: "note.related-3" }),
        relation({ id: "rel.related-3", from: "note.related-3", predicate: "related_to", to: "note.related-4" }),
        relation({ id: "rel.related-4", from: "note.related-4", predicate: "related_to", to: "note.related-5", status: "stale" }),
        relation({ id: "rel.related-5", from: "note.related-5", predicate: "related_to", to: "note.related-6" }),
        relation({ id: "rel.related-6", from: "note.related-6", predicate: "related_to", to: "note.related-7" })
      ]
    });

    const findings = await buildAuditFindings({
      projectRoot,
      storage,
      gitFileChanges: [
        {
          file: "src/context/render.ts",
          commit: "1111111111111111111111111111111111111111",
          shortCommit: "1111111",
          timestamp: "2026-04-25T14:00:00+02:00",
          subject: "Update render sections"
        },
        {
          file: "src/context/render.ts",
          commit: "2222222222222222222222222222222222222222",
          shortCommit: "2222222",
          timestamp: "2026-04-25T15:00:00+02:00",
          subject: "Refine render sections"
        }
      ]
    });
    const rules = new Set(findings.map((finding) => finding.rule));

    expect(rules.has("weakly_connected_memory")).toBe(true);
    expect(rules.has("unlinked_applicability_overlap")).toBe(true);
    expect(rules.has("excessive_related_to")).toBe(true);
    expect(rules.has("changed_file_missing_rationale")).toBe(true);
    expect(findings).toContainEqual(
      expect.objectContaining({
        rule: "changed_file_missing_rationale",
        memory_id: "project.test",
        evidence: expect.arrayContaining([
          { kind: "file", id: "src/context/render.ts" }
        ])
      })
    );
  });
});

function storageSnapshot(options: {
  projectRoot: string;
  objects: StoredMemoryObject[];
  relations: StoredMemoryRelation[];
  version?: 1 | 2;
}): CanonicalStorageSnapshot {
  return {
    projectRoot: options.projectRoot,
    aictxRoot: join(options.projectRoot, ".aictx"),
    config: {
      version: options.version ?? 1,
      project: {
        id: "project.test",
        name: "Test"
      },
      memory: {
        defaultTokenBudget: 6000,
        autoIndex: true,
        saveContextPacks: false
      },
      git: {
        trackContextPacks: false
      }
    },
    objects: options.objects,
    relations: options.relations,
    events: []
  };
}

function memoryObject(options: {
  id: ObjectId;
  type?: ObjectType;
  status?: ObjectStatus;
  title: string;
  body: string;
  tags?: string[];
  facets?: MemoryObjectSidecar["facets"];
  evidence?: MemoryObjectSidecar["evidence"];
  supersededBy?: ObjectId | null;
}): StoredMemoryObject {
  const type = options.type ?? objectTypeFromId(options.id);
  const slug = options.id.slice(options.id.indexOf(".") + 1);
  const bodyPath = `memory/${slug}.md`;
  const sidecar: MemoryObjectSidecar = {
    id: options.id,
    type,
    status: options.status ?? "active",
    title: options.title,
    body_path: bodyPath,
    scope: {
      kind: "project",
      project: "project.test",
      branch: null,
      task: null
    },
    tags: options.tags ?? ["test"],
    ...(options.facets === undefined ? {} : { facets: options.facets }),
    ...(options.evidence === undefined ? {} : { evidence: options.evidence }),
    source: {
      kind: "agent"
    },
    superseded_by: options.supersededBy ?? null,
    content_hash: HASH,
    created_at: TIMESTAMP,
    updated_at: TIMESTAMP
  };

  return {
    path: `.aictx/${bodyPath.replace(/\.md$/u, ".json")}`,
    bodyPath: `.aictx/${bodyPath}`,
    sidecar,
    body: options.body
  };
}

function relation(options: {
  id: string;
  from: ObjectId;
  predicate?: Predicate;
  to: ObjectId;
  status?: RelationStatus;
  confidence?: RelationConfidence;
  evidence?: Evidence[];
}): StoredMemoryRelation {
  const relationData: MemoryRelation = {
    id: options.id,
    from: options.from,
    predicate: options.predicate ?? "affects",
    to: options.to,
    status: options.status ?? "active",
    ...(options.confidence === undefined ? {} : { confidence: options.confidence }),
    ...(options.evidence === undefined ? {} : { evidence: options.evidence }),
    content_hash: HASH,
    created_at: TIMESTAMP,
    updated_at: TIMESTAMP
  };

  return {
    path: `.aictx/relations/${options.id}.json`,
    relation: relationData
  };
}

function objectTypeFromId(id: ObjectId): ObjectType {
  return id.slice(0, id.indexOf(".")) as ObjectType;
}

function longBody(sentence: string): string {
  return `# ${sentence}\n\n${sentence} This body includes enough concrete words for deterministic audit tests.\n`;
}

async function createTempRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  const resolvedRoot = await realpath(root);
  tempRoots.push(resolvedRoot);
  return resolvedRoot;
}

async function writeProjectFile(
  projectRoot: string,
  relativePath: string,
  contents: string
): Promise<void> {
  const target = join(projectRoot, relativePath);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, contents, "utf8");
}

function findingKey(finding: AuditFinding): string {
  return [
    finding.severity,
    finding.rule,
    finding.memory_id,
    finding.evidence.map(evidenceKey).join("|"),
    finding.message
  ].join("\u001f");
}

function compareFindings(left: AuditFinding, right: AuditFinding): number {
  return (
    severityOrder(left.severity) - severityOrder(right.severity) ||
    left.rule.localeCompare(right.rule) ||
    left.memory_id.localeCompare(right.memory_id) ||
    left.evidence.map(evidenceKey).join("|").localeCompare(
      right.evidence.map(evidenceKey).join("|")
    ) ||
    left.message.localeCompare(right.message)
  );
}

function severityOrder(severity: AuditSeverity): number {
  return severity === "warning" ? 0 : 1;
}

function compareEvidence(left: Evidence, right: Evidence): number {
  return evidenceKey(left).localeCompare(evidenceKey(right));
}

function evidenceKey(evidence: Evidence): string {
  return `${evidence.kind}:${evidence.id}`;
}
