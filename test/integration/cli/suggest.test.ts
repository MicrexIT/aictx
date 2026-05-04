import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
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
    mode: "from_diff" | "bootstrap";
    changed_files: string[];
    related_memory_ids: string[];
    possible_stale_ids: string[];
    recommended_memory: string[];
    recommended_facets?: string[];
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
    bootstrap_patch_proposed: boolean;
    bootstrap_patch_applied: boolean;
    save: SaveSuccessEnvelope["data"] | null;
    check: {
      valid: boolean;
    };
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
      expect.arrayContaining(["workflow.package-scripts", "constraint.node-engine"])
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

    const output = await runCli(["node", "aictx", "setup", "--apply", "--json"], repo);

    expect(output.exitCode).toBe(0);
    expect(output.stderr).toBe("");
    const envelope = JSON.parse(output.stdout) as SetupSuccessEnvelope;
    expect(envelope.ok).toBe(true);
    expect(envelope.data.bootstrap_patch_proposed).toBe(true);
    expect(envelope.data.bootstrap_patch_applied).toBe(true);
    expect(envelope.data.save?.memory_created).toEqual(
      expect.arrayContaining(["workflow.package-scripts", "constraint.node-engine"])
    );
    expect(envelope.data.check.valid).toBe(true);
  });

  it("applies explicit README product features as product-feature concepts during setup", async () => {
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
      expect.arrayContaining(["concept.feature-customer-dashboard"])
    );

    const storage = await readCanonicalStorage(repo);
    expect(storage.ok).toBe(true);
    if (!storage.ok) {
      return;
    }

    const feature = storage.data.objects.find(
      (object) => object.sidecar.id === "concept.feature-customer-dashboard"
    );
    expect(feature?.sidecar.type).toBe("concept");
    expect(feature?.sidecar.facets).toEqual({
      category: "product-feature",
      applies_to: ["README.md"],
      load_modes: ["coding", "onboarding"]
    });
    expect(feature?.sidecar.evidence).toEqual([{ kind: "file", id: "README.md" }]);
    expect(envelope.data.check.valid).toBe(true);
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
        "workflow.post-task-verification",
        "constraint.code-conventions",
        "concept.feature-cli-binary-billing",
        "concept.feature-cli-command-sync"
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
    expect(envelope.data.check.valid).toBe(true);
  });

  it("prints a setup review summary without applying the bootstrap patch", async () => {
    const repo = await createBootstrapPatchGitProject("aictx-cli-setup-review-");

    const output = await runCli(["node", "aictx", "setup"], repo);

    expect(output.exitCode).toBe(0);
    expect(output.stderr).toContain("Aictx is already initialized");
    expect(output.stdout).toContain("Bootstrap patch: proposed");
    expect(output.stdout).toContain("Next: Run `aictx setup --apply`");
  });

  it("starts a detached viewer from setup when requested", async () => {
    const repo = await createBootstrapPatchGitProject("aictx-cli-setup-view-");

    const output = await runCli(["node", "aictx", "setup", "--view", "--open", "--json"], repo, {
      viewer: {
        detacher: async (options) => ({
          ok: true,
          data: {
            url: "http://127.0.0.1:7777/?token=test-token",
            host: "127.0.0.1",
            port: 7777,
            log_path: "/tmp/aictx-viewer-test.log"
          },
          warnings: options.open ? ["opened viewer"] : []
        })
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

  const output = await runCli(["node", "aictx", "init", "--json"], repo);

  expect(output.exitCode).toBe(0);
  expect(output.stderr).toBe("");

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
