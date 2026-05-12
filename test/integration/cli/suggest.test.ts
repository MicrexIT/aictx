import { lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import fg from "fast-glob";
import { afterEach, describe, expect, it } from "vitest";

import { main, type CliMainOptions, type CliOutputWriter } from "../../../src/cli/main.js";
import { runSubprocess } from "../../../src/core/subprocess.js";
import type {
  ObjectId,
  ObjectStatus,
  ObjectType,
  Predicate,
  RelationConfidence
} from "../../../src/core/types.js";
import {
  computeObjectContentHash,
  computeRelationContentHash
} from "../../../src/storage/hashes.js";
import type { MemoryObjectSidecar } from "../../../src/storage/objects.js";
import { readCanonicalStorage } from "../../../src/storage/read.js";
import type { MemoryRelation } from "../../../src/storage/relations.js";
import { FIXED_TIMESTAMP } from "../../fixtures/time.js";

const tempRoots: string[] = [];

interface CliRunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

interface SuggestSuccessEnvelope {
  ok: true;
  data: {
    mode: "from_diff" | "bootstrap" | "after_task";
    changed_files: string[];
    related_memory_ids: string[];
    possible_stale_ids: string[];
    recommended_memory: string[];
    recommended_facets?: string[];
    remember_template?: unknown;
    recommended_actions?: Array<{
      rank: number;
      action: string;
      confidence: string;
      reason: string;
      guidance: string;
      memory_kind?: string;
      category?: string;
    }>;
    agent_checklist: string[];
  };
  warnings: string[];
  meta: {
    git: {
      available: boolean;
      dirty: boolean | null;
    };
  };
}

interface SuggestErrorEnvelope {
  ok: false;
  error: {
    code: string;
    message: string;
  };
}

interface SuggestPatchEnvelope {
  ok: true;
  data: {
    proposed: boolean;
    patch: {
      source: {
        kind: string;
      };
      changes: Array<{ op: string; id?: string }>;
    } | null;
    packet: SuggestSuccessEnvelope["data"];
    reason: string | null;
  };
}

interface SaveSuccessEnvelope {
  ok: true;
  data: {
    memory_created: string[];
    memory_updated: string[];
    relations_created: string[];
  };
}

interface CheckSuccessEnvelope {
  ok: true;
  data: {
    valid: boolean;
  };
}

interface SetupSuccessEnvelope {
  ok: true;
  data: {
    initialized: boolean;
    would_initialize: boolean;
    force_preview: boolean;
    dry_run: boolean;
    bootstrap_patch_proposed: boolean;
    bootstrap_patch_applied: boolean;
    bootstrap_summary: {
      operations: string[];
      memory_ids: string[];
      relation_ids: string[];
    };
    save: SaveSuccessEnvelope["data"] | null;
    check: {
      valid: boolean;
    } | null;
    check_skipped_reason: string | null;
    role_coverage: {
      roles: Array<{
        key: string;
        label: string;
        status: string;
        memory_ids: string[];
        gap: string | null;
      }>;
      counts: Record<string, number>;
    };
    diff: unknown | null;
    diff_skipped_reason: string | null;
    viewer_url: string | null;
    viewer_log_path: string | null;
    next_step: string | null;
  };
  warnings: string[];
}

interface PatchReviewEnvelope {
  ok: true;
  data: {
    proposed: boolean;
    operations: string[];
    memory_ids: string[];
    touched_files: string[];
    validation_findings: string[];
    secret_findings: string[];
    reason: string | null;
  };
}

interface MemoryFixture {
  id: ObjectId;
  type: ObjectType;
  status: ObjectStatus;
  title: string;
  body: string;
  tags?: string[];
}

interface RelationFixture {
  id: string;
  from: ObjectId;
  predicate: Predicate;
  to: ObjectId;
  confidence?: RelationConfidence;
  fileEvidence: string;
}

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true }))
  );
});

describe("aictx suggest CLI", () => {
  it("builds from-diff packets from Git project changes without mutating Aictx files", async () => {
    const repo = await createInitializedSuggestGitProject("aictx-cli-suggest-diff-");
    await writeProjectFile(
      repo,
      "src/billing/webhook.ts",
      "export function handleWebhook() { return 'changed'; }\n"
    );
    await writeProjectFile(
      repo,
      "src/billing/worker.ts",
      "export function runWorker() { return 'new'; }\n"
    );
    await writeProjectFile(repo, "dist/generated.ts", "ignored\n");
    const before = await readCanonicalSnapshot(repo);

    const output = await runCli(["node", "aictx", "suggest", "--from-diff", "--json"], repo);

    expect(output.exitCode).toBe(0);
    expect(output.stderr).toBe("");
    const envelope = JSON.parse(output.stdout) as SuggestSuccessEnvelope;
    expect(envelope.ok).toBe(true);
    expect(envelope.warnings).toEqual([]);
    expect(envelope.data.mode).toBe("from_diff");
    expect(envelope.data.changed_files).toEqual([
      "src/billing/webhook.ts",
      "src/billing/worker.ts"
    ]);
    expect(envelope.data.changed_files).not.toContain("dist/generated.ts");
    expect(envelope.data.related_memory_ids).toEqual([
      "constraint.billing-idempotency",
      "decision.webhook-retries",
      "gotcha.old-webhook",
      "note.queue"
    ]);
    expect(envelope.data.possible_stale_ids).toEqual([
      "constraint.billing-idempotency",
      "decision.webhook-retries"
    ]);
    expect(envelope.data.recommended_memory).toEqual([
      "synthesis",
      "decision",
      "constraint",
      "gotcha",
      "workflow",
      "fact"
    ]);
    expect(envelope.data.agent_checklist).toContain(
      "Create memory only for durable future value."
    );
    expect(envelope.meta.git.available).toBe(true);
    expect(envelope.meta.git.dirty).toBe(false);
    await expect(readCanonicalSnapshot(repo)).resolves.toEqual(before);
  });

  it("does not render empty recommended action sections for from-diff text output", async () => {
    const repo = await createInitializedSuggestGitProject("aictx-cli-suggest-diff-text-");
    await writeProjectFile(
      repo,
      "src/billing/webhook.ts",
      "export function handleWebhook() { return 'changed'; }\n"
    );

    const output = await runCli(["node", "aictx", "suggest", "--from-diff"], repo);

    expect(output.exitCode).toBe(0);
    expect(output.stdout).not.toContain("Top recommendation:");
    expect(output.stdout).not.toContain("Candidate actions:");
  });

  it("renders after-task top recommendations in non-JSON output", async () => {
    const projectRoot = await createInitializedLocalProject("aictx-cli-after-text-");

    const output = await runCli(
      ["node", "aictx", "suggest", "--after-task", "Summarize recent discussion"],
      projectRoot
    );

    expect(output.exitCode).toBe(0);
    expect(output.stderr).toContain("Git is unavailable; after-task changed_files is empty.");
    expect(output.stdout).toContain("Top recommendation: #1 save_nothing (high)");
    expect(output.stdout).toContain("Reason: No changed files, related memory, or durable task signals were detected.");
    expect(output.stdout).toContain("Candidate actions:");
    expect(output.stdout).toContain("Remember template: available in --json output");
  });

  it("includes additive recommended_actions in after-task JSON output", async () => {
    const projectRoot = await createInitializedLocalProject("aictx-cli-after-json-");

    const output = await runCli(
      ["node", "aictx", "suggest", "--after-task", "Document release smoke test checklist", "--json"],
      projectRoot
    );

    expect(output.exitCode).toBe(0);
    expect(output.stderr).toBe("");
    const envelope = JSON.parse(output.stdout) as SuggestSuccessEnvelope;
    expect(envelope.ok).toBe(true);
    expect(envelope.warnings).toContain("Git is unavailable; after-task changed_files is empty.");
    expect(envelope.data.mode).toBe("after_task");
    expect(envelope.data.recommended_memory).toEqual([
      "workflow",
      "synthesis",
      "decision",
      "constraint",
      "gotcha",
      "fact",
      "question"
    ]);
    expect(envelope.data.remember_template).toBeDefined();
    expect(envelope.data.recommended_actions?.[0]).toMatchObject({
      rank: 1,
      action: "create_memory",
      confidence: "high",
      memory_kind: "workflow",
      category: "workflow"
    });
    expect(envelope.data.agent_checklist).toContain(
      "Create memory only for durable future value."
    );
  });

  it("returns AICtxGitRequired for from-diff outside Git", async () => {
    const projectRoot = await createInitializedLocalProject("aictx-cli-suggest-local-diff-");
    const before = await readCanonicalSnapshot(projectRoot);

    const output = await runCli(
      ["node", "aictx", "suggest", "--from-diff", "--json"],
      projectRoot
    );

    expect(output.exitCode).toBe(3);
    expect(output.stderr).toBe("");
    const envelope = JSON.parse(output.stdout) as SuggestErrorEnvelope;
    expect(envelope.ok).toBe(false);
    expect(envelope.error.code).toBe("AICtxGitRequired");
    await expect(readCanonicalSnapshot(projectRoot)).resolves.toEqual(before);
  });

  it("builds bootstrap packets outside Git without mutating Aictx files", async () => {
    const projectRoot = await createLocalProjectWithFiles("aictx-cli-suggest-bootstrap-");
    const before = await readCanonicalSnapshot(projectRoot);

    const output = await runCli(
      ["node", "aictx", "suggest", "--bootstrap", "--json"],
      projectRoot
    );

    expect(output.exitCode).toBe(0);
    expect(output.stderr).toBe("");
    const envelope = JSON.parse(output.stdout) as SuggestSuccessEnvelope;
    expect(envelope.ok).toBe(true);
    expect(envelope.data.mode).toBe("bootstrap");
    expect(envelope.data.changed_files).toEqual(
      expect.arrayContaining(["README.md", "package.json", "src/index.ts"])
    );
    expect(envelope.data.changed_files).not.toContain(".aictx/config.json");
    expect(envelope.data.recommended_memory).toEqual([
      "project",
      "architecture",
      "source",
      "synthesis",
      "workflow",
      "constraint",
      "gotcha",
      "decision"
    ]);
    expect(envelope.meta.git.available).toBe(false);
    expect(envelope.meta.git.dirty).toBeNull();
    await expect(readCanonicalSnapshot(projectRoot)).resolves.toEqual(before);
  });

  it("prints a raw bootstrap patch that can be reviewed, saved, checked, and diffed before the first Aictx commit", async () => {
    const repo = await createBootstrapPatchGitProject("aictx-cli-suggest-bootstrap-patch-");

    const patchOutput = await runCli(
      ["node", "aictx", "suggest", "--bootstrap", "--patch"],
      repo
    );

    expect(patchOutput.exitCode).toBe(0);
    expect(patchOutput.stderr).toBe("");
    const patch = JSON.parse(patchOutput.stdout) as {
      source: { kind: string };
      changes: Array<{ op: string; id?: string }>;
    };
    expect(patch.source.kind).toBe("cli");
    expect(patch.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ op: "update_object" }),
        expect.objectContaining({ op: "create_object", id: "source.readme" }),
        expect.objectContaining({ op: "create_object", id: "synthesis.product-intent" }),
        expect.objectContaining({ op: "create_object", id: "workflow.package-scripts" })
      ])
    );

    await writeProjectFile(repo, "bootstrap-memory.json", JSON.stringify(patch));
    const saveOutput = await runCli(
      ["node", "aictx", "save", "--file", "bootstrap-memory.json", "--json"],
      repo
    );
    const saveEnvelope = JSON.parse(saveOutput.stdout) as SaveSuccessEnvelope;

    expect(saveOutput.exitCode).toBe(0);
    expect(saveOutput.stderr).toBe("");
    expect(saveEnvelope.ok).toBe(true);
    expect(saveEnvelope.data.memory_updated).toContain("architecture.current");
    expect(saveEnvelope.data.memory_created).toEqual(
      expect.arrayContaining([
        "source.readme",
        "source.package-json",
        "synthesis.product-intent",
        "workflow.package-scripts",
        "constraint.node-engine"
      ])
    );

    const checkOutput = await runCli(["node", "aictx", "check", "--json"], repo);
    const checkEnvelope = JSON.parse(checkOutput.stdout) as CheckSuccessEnvelope;

    expect(checkOutput.exitCode).toBe(0);
    expect(checkOutput.stderr).toBe("");
    expect(checkEnvelope.data.valid).toBe(true);

    const diffOutput = await runCli(["node", "aictx", "diff", "--json"], repo);
    expect(diffOutput.exitCode).toBe(0);
    expect(diffOutput.stderr).toBe("");
  });

  it("prints bootstrap patch proposals in the standard JSON envelope", async () => {
    const repo = await createBootstrapPatchGitProject("aictx-cli-suggest-bootstrap-json-patch-");

    const output = await runCli(
      ["node", "aictx", "suggest", "--bootstrap", "--patch", "--json"],
      repo
    );

    expect(output.exitCode).toBe(0);
    expect(output.stderr).toBe("");
    const envelope = JSON.parse(output.stdout) as SuggestPatchEnvelope;
    expect(envelope.ok).toBe(true);
    expect(envelope.data.proposed).toBe(true);
    expect(envelope.data.patch?.source.kind).toBe("cli");
    expect(envelope.data.packet.mode).toBe("bootstrap");
    expect(envelope.data.reason).toBeNull();
  });

  it("runs setup with bootstrap apply, check, and diff summary", async () => {
    const repo = await createBootstrapPatchGitProject("aictx-cli-setup-apply-");

    const output = await runCli(["node", "aictx", "setup", "--json"], repo);

    expect(output.exitCode).toBe(0);
    expect(output.stderr).toBe("");
    const envelope = JSON.parse(output.stdout) as SetupSuccessEnvelope;
    expect(envelope.ok).toBe(true);
    expect(envelope.data.dry_run).toBe(false);
    expect(envelope.data.bootstrap_patch_proposed).toBe(true);
    expect(envelope.data.bootstrap_patch_applied).toBe(true);
    expect(envelope.data.save?.memory_created).toEqual(
      expect.arrayContaining([
        "source.readme",
        "source.package-json",
        "synthesis.product-intent",
        "synthesis.repository-map",
        "synthesis.stack-and-tooling",
        "workflow.package-scripts",
        "constraint.node-engine"
      ])
    );
    expect(envelope.data.role_coverage.roles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "repository-map",
          status: "populated",
          memory_ids: expect.arrayContaining(["synthesis.repository-map"])
        })
      ])
    );
    expect(envelope.data.check?.valid).toBe(true);
    expect(envelope.data.next_step).toContain("aictx lens project-map");
  });

  it("does not start the setup viewer by default in JSON mode", async () => {
    const repo = await createBootstrapPatchGitProject("aictx-cli-setup-json-no-view-");

    const output = await runCli(["node", "aictx", "setup", "--json"], repo, {
      viewer: {
        detacher: async () => {
          throw new Error("detacher should not run for default JSON setup");
        }
      }
    });

    expect(output.exitCode).toBe(0);
    const envelope = JSON.parse(output.stdout) as SetupSuccessEnvelope;
    expect(envelope.ok).toBe(true);
    expect(envelope.data.viewer_url).toBeNull();
    expect(envelope.data.viewer_log_path).toBeNull();
  });

  it("starts a detached viewer by default for human setup output", async () => {
    const repo = await createBootstrapPatchGitRepo("aictx-cli-setup-default-view-");

    const output = await runCli(["node", "aictx", "setup"], repo, {
      viewer: {
        detacher: async (options) => {
          expect(options).toMatchObject({
            cwd: repo,
            open: false
          });

          return {
            ok: true,
            data: {
              url: "http://127.0.0.1:7778/?token=default-token",
              host: "127.0.0.1",
              port: 7778,
              log_path: "/tmp/aictx-viewer-default-test.log"
            },
            warnings: options.open ? ["opened viewer"] : []
          };
        }
      }
    });

    expect(output.exitCode).toBe(0);
    expect(output.stderr).toBe("");
    expect(output.stdout).toContain("Aictx viewer: http://127.0.0.1:7778/?token=default-token");
    expect(output.stdout).toContain("Aictx viewer log: /tmp/aictx-viewer-default-test.log");
  });

  it("skips the default setup viewer when --no-view is passed", async () => {
    const repo = await createBootstrapPatchGitRepo("aictx-cli-setup-no-view-");

    const output = await runCli(["node", "aictx", "setup", "--no-view"], repo, {
      viewer: {
        detacher: async () => {
          throw new Error("detacher should not run when --no-view is passed");
        }
      }
    });

    expect(output.exitCode).toBe(0);
    expect(output.stderr).toBe("");
    expect(output.stdout).not.toContain("Aictx viewer:");
  });

  it("runs setup after reset when tracked Aictx files are dirty deletions", async () => {
    const repo = await createBootstrapPatchGitProject("aictx-cli-setup-after-reset-");
    await git(repo, ["add", ".gitignore", "AGENTS.md", "CLAUDE.md", ".aictx"]);
    await git(repo, ["commit", "-m", "Track Aictx memory"]);

    const reset = await runCli(["node", "aictx", "reset", "--json"], repo);

    expect(reset.exitCode).toBe(0);
    expect(reset.stderr).toBe("");
    const resetEnvelope = JSON.parse(reset.stdout) as {
      ok: true;
      data: { backup_path: string | null };
    };
    expect(resetEnvelope.ok).toBe(true);
    expect(resetEnvelope.data.backup_path).not.toBeNull();
    await expect(pathExists(join(repo, resetEnvelope.data.backup_path ?? ""))).resolves.toBe(true);
    await expect(git(repo, ["status", "--short", "--", ".aictx"])).resolves.toContain(
      ".aictx/config.json"
    );

    const output = await runCli(["node", "aictx", "setup", "--json"], repo);

    expect(output.exitCode).toBe(0);
    expect(output.stderr).toBe("");
    const envelope = JSON.parse(output.stdout) as SetupSuccessEnvelope;
    expect(envelope.ok).toBe(true);
    expect(envelope.data.initialized).toBe(true);
    expect(envelope.data.bootstrap_patch_applied).toBe(true);
    expect(envelope.data.check?.valid).toBe(true);
    await expect(pathExists(join(repo, resetEnvelope.data.backup_path ?? ""))).resolves.toBe(true);
  });

  it("applies explicit README product features as a source-backed feature-map synthesis during setup", async () => {
    const repo = await createProductFeatureBootstrapGitProject(
      "aictx-cli-setup-product-features-"
    );

    const output = await runCli(["node", "aictx", "setup", "--apply", "--json"], repo);

    expect(output.exitCode).toBe(0);
    expect(output.stderr).toBe("");
    const envelope = JSON.parse(output.stdout) as SetupSuccessEnvelope;
    expect(envelope.ok).toBe(true);
    expect(envelope.data.bootstrap_patch_applied).toBe(true);
    expect(envelope.data.save?.memory_created).toEqual(
      expect.arrayContaining(["source.readme", "synthesis.feature-map"])
    );

    const storage = await readCanonicalStorage(repo);
    expect(storage.ok).toBe(true);
    if (!storage.ok) {
      return;
    }

    const feature = storage.data.objects.find(
      (object) => object.sidecar.id === "synthesis.feature-map"
    );
    expect(feature?.sidecar.type).toBe("synthesis");
    expect(feature?.sidecar.facets).toEqual({
      category: "feature-map",
      applies_to: ["README.md"],
      load_modes: ["coding", "onboarding"]
    });
    expect(feature?.sidecar.evidence).toEqual([{ kind: "source", id: "source.readme" }]);
    expect(feature?.body).toContain("Customer dashboard");
    const featureRelation = storage.data.relations.find(
      (stored) =>
        stored.relation.from === "synthesis.feature-map" &&
        stored.relation.predicate === "derived_from" &&
        stored.relation.to === "source.readme"
    );
    expect(featureRelation?.relation).toEqual(
      expect.objectContaining({
        from: "synthesis.feature-map",
        predicate: "derived_from",
        to: "source.readme",
        status: "active",
        confidence: "high",
        evidence: [{ kind: "source", id: "source.readme" }]
      })
    );
    const featureRelationId = featureRelation?.relation.id;
    expect(featureRelationId).toBeDefined();
    expect(envelope.data.save?.relations_created).toContain(featureRelationId);
    expect(envelope.data.check?.valid).toBe(true);
  });

  it("applies agent guidance, verification commands, and code-derived features during setup", async () => {
    const repo = await createRichBootstrapGitProject("aictx-cli-setup-rich-bootstrap-");

    const output = await runCli(["node", "aictx", "setup", "--apply", "--json"], repo);

    expect(output.exitCode).toBe(0);
    expect(output.stderr).toBe("");
    const envelope = JSON.parse(output.stdout) as SetupSuccessEnvelope;
    expect(envelope.ok).toBe(true);
    expect(envelope.data.bootstrap_patch_applied).toBe(true);
    expect(envelope.data.save?.memory_created).toEqual(
      expect.arrayContaining([
        "source.readme",
        "source.package-json",
        "source.agents",
        "synthesis.product-intent",
        "synthesis.feature-map",
        "synthesis.agent-guidance",
        "workflow.post-task-verification",
        "constraint.code-conventions"
      ])
    );

    const storage = await readCanonicalStorage(repo);
    expect(storage.ok).toBe(true);
    if (!storage.ok) {
      return;
    }

    const conventions = storage.data.objects.find(
      (object) => object.sidecar.id === "constraint.code-conventions"
    );
    expect(conventions?.sidecar.facets).toEqual({
      category: "convention",
      applies_to: ["AGENTS.md"],
      load_modes: ["coding", "review"]
    });
    expect(conventions?.body).toContain("Prefer small TypeScript modules.");
    expect(conventions?.body).not.toContain("generated convention");

    const verification = storage.data.objects.find(
      (object) => object.sidecar.id === "workflow.post-task-verification"
    );
    expect(verification?.sidecar.facets?.category).toBe("testing");
    expect(verification?.body).toContain("pnpm run typecheck");
    expect(verification?.body).toContain("pnpm run lint");
    expect(verification?.body).not.toContain("pnpm run generated");
    const featureMap = storage.data.objects.find(
      (object) => object.sidecar.id === "synthesis.feature-map"
    );
    expect(featureMap?.sidecar.type).toBe("synthesis");
    expect(featureMap?.body).toContain("CLI binary billing");
    expect(featureMap?.body).toContain("CLI command sync");
    const binRelation = storage.data.relations.find(
      (stored) =>
        stored.relation.from === "synthesis.feature-map" &&
        stored.relation.predicate === "derived_from" &&
        stored.relation.to === "source.package-json"
    );
    expect(binRelation?.relation).toEqual(
      expect.objectContaining({
        from: "synthesis.feature-map",
        predicate: "derived_from",
        to: "source.package-json",
        evidence: [{ kind: "source", id: "source.package-json" }]
      })
    );
    const relationIds = [binRelation?.relation.id].filter(
      (id): id is string => id !== undefined
    );
    expect(relationIds).toHaveLength(1);
    expect(envelope.data.save?.relations_created).toEqual(
      expect.arrayContaining(relationIds)
    );
    expect(envelope.data.check?.valid).toBe(true);
  });

  it("previews setup without applying the bootstrap patch", async () => {
    const repo = await createBootstrapPatchGitProject("aictx-cli-setup-preview-");

    const output = await runCli(["node", "aictx", "setup", "--dry-run"], repo);

    expect(output.exitCode).toBe(0);
    expect(output.stderr).toBe("");
    expect(output.stdout).toContain("Dry run: yes");
    expect(output.stdout).toContain("Would initialize storage: no");
    expect(output.stdout).toContain("Bootstrap patch: proposed");
    expect(output.stdout).toContain("Bootstrap patch applied: no");
    expect(output.stdout).toContain("Role coverage:");
    expect(output.stdout).toContain("Check: skipped");
    expect(output.stdout).toContain("Aictx diff: skipped");
    expect(output.stdout).toContain("Next: Run `aictx setup`");
    const storage = await readCanonicalStorage(repo);
    expect(storage.ok).toBe(true);
    if (storage.ok) {
      expect(storage.data.objects.some((object) => object.sidecar.id === "source.readme")).toBe(false);
    }
  });

  it("previews setup on a fresh repo without initializing storage or writing files", async () => {
    const repo = await createBootstrapPatchGitRepo("aictx-cli-setup-fresh-preview-");
    const beforeStatus = await git(repo, ["status", "--short"]);

    const output = await runCli(["node", "aictx", "setup", "--dry-run", "--json"], repo);

    expect(output.exitCode).toBe(0);
    expect(output.stderr).toBe("");
    const envelope = JSON.parse(output.stdout) as SetupSuccessEnvelope;
    expect(envelope.ok).toBe(true);
    expect(envelope.data.dry_run).toBe(true);
    expect(envelope.data.initialized).toBe(false);
    expect(envelope.data.would_initialize).toBe(true);
    expect(envelope.data.force_preview).toBe(false);
    expect(envelope.data.bootstrap_patch_proposed).toBe(true);
    expect(envelope.data.bootstrap_patch_applied).toBe(false);
    expect(envelope.data.bootstrap_summary.memory_ids).toEqual(
      expect.arrayContaining(["source.readme", "source.package-json"])
    );
    expect(envelope.data.save).toBeNull();
    expect(envelope.data.check).toBeNull();
    expect(envelope.data.check_skipped_reason).toContain("Dry run did not write storage");
    expect(envelope.data.diff).toBeNull();
    expect(envelope.data.diff_skipped_reason).toContain("Dry run did not write storage");
    expect(envelope.data.role_coverage.roles.length).toBeGreaterThan(0);
    await expect(pathExists(join(repo, ".aictx"))).resolves.toBe(false);
    await expect(pathExists(join(repo, ".gitignore"))).resolves.toBe(false);
    await expect(pathExists(join(repo, "AGENTS.md"))).resolves.toBe(false);
    await expect(pathExists(join(repo, "CLAUDE.md"))).resolves.toBe(false);
    await expect(git(repo, ["status", "--short"])).resolves.toBe(beforeStatus);
  });

  it("previews forced setup without deleting or rewriting existing storage", async () => {
    const repo = await createBootstrapPatchGitProject("aictx-cli-setup-force-preview-");
    const before = await readCanonicalSnapshot(repo);

    const output = await runCli(["node", "aictx", "setup", "--force", "--dry-run", "--json"], repo);

    expect(output.exitCode).toBe(0);
    expect(output.stderr).toBe("");
    const envelope = JSON.parse(output.stdout) as SetupSuccessEnvelope;
    expect(envelope.ok).toBe(true);
    expect(envelope.data.dry_run).toBe(true);
    expect(envelope.data.initialized).toBe(true);
    expect(envelope.data.would_initialize).toBe(true);
    expect(envelope.data.force_preview).toBe(true);
    expect(envelope.data.save).toBeNull();
    expect(envelope.data.check).toBeNull();
    await expect(readCanonicalSnapshot(repo)).resolves.toEqual(before);
  });

  it("skips viewer startup during setup dry-run", async () => {
    const repo = await createBootstrapPatchGitProject("aictx-cli-setup-dry-run-view-");

    const output = await runCli(["node", "aictx", "setup", "--dry-run", "--view", "--json"], repo, {
      viewer: {
        detacher: async () => {
          throw new Error("detacher should not run during setup dry-run");
        }
      }
    });

    expect(output.exitCode).toBe(0);
    const envelope = JSON.parse(output.stdout) as SetupSuccessEnvelope;
    expect(envelope.ok).toBe(true);
    expect(envelope.data.viewer_url).toBeNull();
    expect(envelope.warnings).toContain(
      "Viewer startup skipped because setup --dry-run does not write storage. Run `aictx setup` to start the viewer after applying setup."
    );
  });

  it("starts a detached viewer from setup when requested", async () => {
    const repo = await createBootstrapPatchGitProject("aictx-cli-setup-view-");

    const output = await runCli(["node", "aictx", "setup", "--view", "--open", "--json"], repo, {
      viewer: {
        detacher: async (options) => {
          expect(options).toMatchObject({
            cwd: repo,
            open: true
          });

          return {
            ok: true,
            data: {
              url: "http://127.0.0.1:7777/?token=test-token",
              host: "127.0.0.1",
              port: 7777,
              log_path: "/tmp/aictx-viewer-test.log"
            },
            warnings: options.open ? ["opened viewer"] : []
          };
        }
      }
    });

    expect(output.exitCode).toBe(0);
    const envelope = JSON.parse(output.stdout) as SetupSuccessEnvelope;
    expect(envelope.ok).toBe(true);
    expect(envelope.data.viewer_url).toBe("http://127.0.0.1:7777/?token=test-token");
    expect(envelope.data.viewer_log_path).toBe("/tmp/aictx-viewer-test.log");
    expect(envelope.warnings).toContain("opened viewer");
  });

  it("reviews real and no-op patch files without writing memory", async () => {
    const repo = await createBootstrapPatchGitProject("aictx-cli-patch-review-");
    const patchOutput = await runCli(
      ["node", "aictx", "suggest", "--bootstrap", "--patch"],
      repo
    );
    await writeProjectFile(repo, "bootstrap-memory.json", patchOutput.stdout);

    const reviewOutput = await runCli(
      ["node", "aictx", "patch", "review", "bootstrap-memory.json", "--json"],
      repo
    );
    const review = JSON.parse(reviewOutput.stdout) as PatchReviewEnvelope;

    expect(reviewOutput.exitCode).toBe(0);
    expect(review.ok).toBe(true);
    expect(review.data.proposed).toBe(true);
    expect(review.data.operations).toEqual(
      expect.arrayContaining(["create_object", "update_object"])
    );
    expect(review.data.memory_ids).toContain("workflow.package-scripts");
    expect(review.data.touched_files).toContain(".aictx/events.jsonl");
    expect(review.data.validation_findings).toEqual([]);
    expect(review.data.secret_findings).toEqual([]);

    await writeProjectFile(
      repo,
      "noop-memory.json",
      JSON.stringify({
        proposed: false,
        reason: "No bootstrap memory patch to apply.",
        packet: {}
      })
    );
    const noopOutput = await runCli(
      ["node", "aictx", "patch", "review", "noop-memory.json", "--json"],
      repo
    );
    const noop = JSON.parse(noopOutput.stdout) as PatchReviewEnvelope;
    expect(noopOutput.exitCode).toBe(0);
    expect(noop.data.proposed).toBe(false);
    expect(noop.data.reason).toBe("No bootstrap memory patch to apply.");
  });

  it("returns validation errors when mode selection is invalid", async () => {
    const projectRoot = await createInitializedLocalProject("aictx-cli-suggest-invalid-");

    const missingMode = await runCli(["node", "aictx", "suggest", "--json"], projectRoot);
    const duplicateMode = await runCli(
      ["node", "aictx", "suggest", "--from-diff", "--bootstrap", "--json"],
      projectRoot
    );
    const fromDiffPatch = await runCli(
      ["node", "aictx", "suggest", "--from-diff", "--patch", "--json"],
      projectRoot
    );

    expect(missingMode.exitCode).toBe(1);
    expect(duplicateMode.exitCode).toBe(1);
    expect(fromDiffPatch.exitCode).toBe(1);
    expect((JSON.parse(missingMode.stdout) as SuggestErrorEnvelope).error.code).toBe(
      "AICtxValidationFailed"
    );
    expect((JSON.parse(duplicateMode.stdout) as SuggestErrorEnvelope).error.code).toBe(
      "AICtxValidationFailed"
    );
    expect((JSON.parse(fromDiffPatch.stdout) as SuggestErrorEnvelope).error.code).toBe(
      "AICtxValidationFailed"
    );
  });
});

async function createInitializedSuggestGitProject(prefix: string): Promise<string> {
  const repo = await createRepo(prefix);
  const output = await runCli(["node", "aictx", "init", "--json"], repo);

  expect(output.exitCode).toBe(0);
  expect(output.stderr).toBe("");

  await writeMemoryObject(repo, {
    id: "decision.webhook-retries",
    type: "decision",
    status: "active",
    title: "Webhook retries",
    body: "# Webhook retries\n\nWebhook retries are handled by src/billing/webhook.ts.\n"
  });
  await writeMemoryObject(repo, {
    id: "constraint.billing-idempotency",
    type: "constraint",
    status: "active",
    title: "Billing idempotency",
    body: "# Billing idempotency\n\nBilling operations must be idempotent.\n",
    tags: ["billing"]
  });
  await writeMemoryObject(repo, {
    id: "note.queue",
    type: "note",
    status: "active",
    title: "Queue",
    body: "# Queue\n\nAsync jobs use the project queue.\n"
  });
  await writeMemoryObject(repo, {
    id: "gotcha.old-webhook",
    type: "gotcha",
    status: "stale",
    title: "Old webhook gotcha",
    body: "# Old webhook gotcha\n\nOld notes mention src/billing/webhook.ts.\n"
  });
  await writeRelation(repo, {
    id: "rel.worker-affects-billing",
    from: "note.queue",
    predicate: "affects",
    to: "constraint.billing-idempotency",
    confidence: "medium",
    fileEvidence: "src/billing/worker.ts"
  });
  await git(repo, ["add", ".gitignore", "AGENTS.md", "CLAUDE.md", ".aictx"]);
  await git(repo, ["commit", "-m", "Initialize Aictx memory"]);

  return repo;
}

async function createInitializedLocalProject(prefix: string): Promise<string> {
  const projectRoot = await createTempRoot(prefix);
  const output = await runCli(["node", "aictx", "init", "--json"], projectRoot);

  expect(output.exitCode).toBe(0);
  expect(output.stderr).toBe("");

  return projectRoot;
}

async function createBootstrapPatchGitProject(prefix: string): Promise<string> {
  const repo = await createBootstrapPatchGitRepo(prefix);
  const output = await runCli(["node", "aictx", "init", "--json"], repo);

  expect(output.exitCode).toBe(0);
  expect(output.stderr).toBe("");

  return repo;
}

async function createBootstrapPatchGitRepo(prefix: string): Promise<string> {
  const repo = await createTempRoot(prefix);
  await git(repo, ["init", "--initial-branch=main"]);
  await git(repo, ["config", "user.email", "test@example.com"]);
  await git(repo, ["config", "user.name", "Aictx Test"]);
  await writeProjectFile(
    repo,
    "README.md",
    "# Billing API\n\nHandles recurring billing and webhook processing for Stripe.\n"
  );
  await writeJsonProjectFile(repo, "package.json", {
    name: "@example/billing-api",
    description: "Billing API for Stripe webhook processing.",
    type: "module",
    packageManager: "pnpm@10.0.0",
    engines: {
      node: ">=22"
    },
    scripts: {
      build: "tsc --noEmit",
      test: "vitest run"
    },
    devDependencies: {
      vitest: "^4.0.0"
    }
  });
  await writeProjectFile(repo, "tsconfig.json", "{}\n");
  await writeProjectFile(repo, "src/index.ts", "export const value = 1;\n");
  await writeProjectFile(repo, "test/index.test.ts", "import { it } from 'vitest';\n");
  await git(repo, ["add", "."]);
  await git(repo, ["commit", "-m", "Initial project files"]);

  return repo;
}

async function createProductFeatureBootstrapGitProject(prefix: string): Promise<string> {
  const repo = await createTempRoot(prefix);
  await git(repo, ["init", "--initial-branch=main"]);
  await git(repo, ["config", "user.email", "test@example.com"]);
  await git(repo, ["config", "user.name", "Aictx Test"]);
  await writeProjectFile(
    repo,
    "README.md",
    [
      "# Billing API",
      "",
      "Handles recurring billing and webhook processing for Stripe.",
      "",
      "## Features",
      "",
      "- Customer dashboard: Shows subscription status and invoices.",
      ""
    ].join("\n")
  );
  await writeJsonProjectFile(repo, "package.json", {
    name: "@example/billing-api",
    description: "Billing API for Stripe webhook processing.",
    type: "module",
    scripts: {
      test: "vitest run"
    }
  });
  await writeProjectFile(repo, "src/index.ts", "export const value = 1;\n");
  await git(repo, ["add", "."]);
  await git(repo, ["commit", "-m", "Initial project files"]);

  const output = await runCli(["node", "aictx", "init", "--json"], repo);

  expect(output.exitCode).toBe(0);
  expect(output.stderr).toBe("");

  return repo;
}

async function createRichBootstrapGitProject(prefix: string): Promise<string> {
  const repo = await createTempRoot(prefix);
  await git(repo, ["init", "--initial-branch=main"]);
  await git(repo, ["config", "user.email", "test@example.com"]);
  await git(repo, ["config", "user.name", "Aictx Test"]);
  await writeProjectFile(
    repo,
    "README.md",
    "# Billing App\n\nCoordinates billing support operations.\n"
  );
  await writeProjectFile(
    repo,
    "AGENTS.md",
    [
      "# Agent instructions",
      "",
      "## Code Conventions",
      "",
      "- Prefer small TypeScript modules.",
      "- Avoid default exports in source files.",
      "- After changes, run `pnpm run lint`.",
      "",
      "<!-- aictx-memory:start -->",
      "## Aictx Memory",
      "- Never use generated convention text.",
      "- Run `pnpm run generated`.",
      "<!-- aictx-memory:end -->",
      ""
    ].join("\n")
  );
  await writeJsonProjectFile(repo, "package.json", {
    name: "billing-app",
    packageManager: "pnpm@10.0.0",
    bin: {
      billing: "dist/cli.js"
    },
    scripts: {
      typecheck: "tsc --noEmit",
      test: "vitest run"
    }
  });
  await writeProjectFile(
    repo,
    "src/cli/commands/sync.ts",
    [
      "export function registerSync(program) {",
      "  program",
      "    .command(\"sync\")",
      "    .description(\"Synchronize billing data.\");",
      "}",
      ""
    ].join("\n")
  );
  await git(repo, ["add", "."]);
  await git(repo, ["commit", "-m", "Initial project files"]);

  const output = await runCli(["node", "aictx", "init", "--json"], repo);

  expect(output.exitCode).toBe(0);
  expect(output.stderr).toBe("");

  return repo;
}

async function createLocalProjectWithFiles(prefix: string): Promise<string> {
  const projectRoot = await createTempRoot(prefix);
  await writeProjectFile(projectRoot, "README.md", "# Local project\n");
  await writeProjectFile(projectRoot, "package.json", "{}\n");
  await writeProjectFile(projectRoot, "src/index.ts", "export const value = 1;\n");
  await writeProjectFile(projectRoot, "dist/generated.ts", "ignored\n");
  const output = await runCli(["node", "aictx", "init", "--json"], projectRoot);

  expect(output.exitCode).toBe(0);
  expect(output.stderr).toBe("");

  return projectRoot;
}

async function createRepo(prefix: string): Promise<string> {
  const repo = await createTempRoot(prefix);
  await git(repo, ["init", "--initial-branch=main"]);
  await git(repo, ["config", "user.email", "test@example.com"]);
  await git(repo, ["config", "user.name", "Aictx Test"]);
  await writeProjectFile(repo, "README.md", "# Test\n");
  await writeProjectFile(
    repo,
    "src/billing/webhook.ts",
    "export function handleWebhook() { return 'initial'; }\n"
  );
  await git(repo, ["add", "README.md", "src/billing/webhook.ts"]);
  await git(repo, ["commit", "-m", "Initial commit"]);
  return repo;
}

async function runCli(
  argv: string[],
  cwd: string,
  options: Pick<CliMainOptions, "viewer"> = {}
): Promise<CliRunResult> {
  const output = createCapturedOutput();
  const exitCode = await main(argv, {
    ...output.writers,
    cwd,
    ...options
  });

  return {
    exitCode,
    stdout: output.stdout(),
    stderr: output.stderr()
  };
}

function createCapturedOutput(): {
  writers: { stdout: CliOutputWriter; stderr: CliOutputWriter };
  stdout: () => string;
  stderr: () => string;
} {
  let stdout = "";
  let stderr = "";

  return {
    writers: {
      stdout: (text) => {
        stdout += text;
      },
      stderr: (text) => {
        stderr += text;
      }
    },
    stdout: () => stdout,
    stderr: () => stderr
  };
}

async function createTempRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  const resolvedRoot = await realpath(root);
  tempRoots.push(resolvedRoot);
  return resolvedRoot;
}

async function writeMemoryObject(projectRoot: string, fixture: MemoryFixture): Promise<void> {
  const storage = await readStorageOrThrow(projectRoot);
  const bodyPath = memoryBodyPath(fixture);
  const sidecarWithoutHash = {
    id: fixture.id,
    type: fixture.type,
    status: fixture.status,
    title: fixture.title,
    body_path: bodyPath,
    scope: {
      kind: "project",
      project: storage.config.project.id,
      branch: null,
      task: null
    },
    tags: fixture.tags ?? [],
    source: {
      kind: "agent"
    },
    superseded_by: null,
    created_at: FIXED_TIMESTAMP,
    updated_at: FIXED_TIMESTAMP
  } satisfies Omit<MemoryObjectSidecar, "content_hash">;
  const sidecar: MemoryObjectSidecar = {
    ...sidecarWithoutHash,
    content_hash: computeObjectContentHash(sidecarWithoutHash, fixture.body)
  };

  await writeProjectFile(projectRoot, `.aictx/${bodyPath}`, fixture.body);
  await writeJsonProjectFile(
    projectRoot,
    `.aictx/${bodyPath.replace(/\.md$/u, ".json")}`,
    sidecar
  );
}

async function writeRelation(projectRoot: string, fixture: RelationFixture): Promise<void> {
  const relationWithoutHash = {
    id: fixture.id,
    from: fixture.from,
    predicate: fixture.predicate,
    to: fixture.to,
    status: "active",
    ...(fixture.confidence === undefined ? {} : { confidence: fixture.confidence }),
    evidence: [
      {
        kind: "file",
        id: fixture.fileEvidence
      }
    ],
    created_at: FIXED_TIMESTAMP,
    updated_at: FIXED_TIMESTAMP
  } satisfies Omit<MemoryRelation, "content_hash">;
  const relation: MemoryRelation = {
    ...relationWithoutHash,
    content_hash: computeRelationContentHash(relationWithoutHash)
  };

  await writeJsonProjectFile(
    projectRoot,
    `.aictx/relations/${fixture.id.replace(/^rel\./u, "")}.json`,
    relation
  );
}

function memoryBodyPath(fixture: MemoryFixture): string {
  const slug = fixture.id.slice(fixture.id.indexOf(".") + 1);

  return `memory/${memoryDirectory(fixture.type)}/${slug}.md`;
}

function memoryDirectory(type: ObjectType): string {
  switch (type) {
    case "decision":
      return "decisions";
    case "constraint":
      return "constraints";
    case "question":
      return "questions";
    case "fact":
      return "facts";
    case "gotcha":
      return "gotchas";
    case "workflow":
      return "workflows";
    case "note":
      return "notes";
    case "concept":
      return "concepts";
    case "source":
      return "sources";
    case "synthesis":
      return "syntheses";
    case "project":
    case "architecture":
      throw new Error(`Unsupported fixture type for nested memory path: ${type}`);
  }
}

async function readStorageOrThrow(projectRoot: string) {
  const storage = await readCanonicalStorage(projectRoot);

  expect(storage.ok).toBe(true);
  if (!storage.ok) {
    throw new Error(storage.error.message);
  }

  return storage.data;
}

async function writeJsonProjectFile(
  projectRoot: string,
  relativePath: string,
  value: unknown
): Promise<void> {
  await writeProjectFile(projectRoot, relativePath, `${JSON.stringify(value, null, 2)}\n`);
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

async function readCanonicalSnapshot(projectRoot: string): Promise<Record<string, string>> {
  const paths = (
    await fg(".aictx/**/*.{json,jsonl,md}", {
      cwd: projectRoot,
      dot: true,
      ignore: [".aictx/index/**", ".aictx/context/**"],
      onlyFiles: true,
      unique: true
    })
  ).sort();
  const entries = await Promise.all(
    paths.map(async (path) => [path, await readFile(join(projectRoot, path), "utf8")] as const)
  );

  return Object.fromEntries(entries);
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch {
    return false;
  }
}

async function git(cwd: string, args: readonly string[]): Promise<string> {
  const result = await runSubprocess("git", args, { cwd });

  if (!result.ok) {
    throw new Error(result.error.message);
  }

  if (result.data.exitCode !== 0) {
    throw new Error(
      [
        `git ${args.join(" ")} failed with exit code ${result.data.exitCode}`,
        result.data.stderr
      ].join("\n")
    );
  }

  return result.data.stdout;
}
