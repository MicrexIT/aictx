import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";

import { afterEach, describe, expect, it } from "vitest";

import { main, type CliOutputWriter } from "../../../src/cli/main.js";
import { runSubprocess } from "../../../src/core/subprocess.js";
import { readCanonicalStorage } from "../../../src/storage/read.js";

const tempRoots: string[] = [];

interface CliRunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

interface SuccessEnvelope<TData> {
  ok: true;
  data: TData;
  warnings: string[];
}

interface LensData {
  name: string;
  markdown: string;
  role_coverage: {
    roles: Array<{ key: string; status: string; memory_ids: string[] }>;
  };
  included_memory_ids: string[];
  relations: unknown[];
  generated_gaps: string[];
}

interface LoadData {
  included_ids: string[];
  excluded_ids: string[];
  context_pack: string;
}

interface HandoffShowData {
  branch: string;
  id: string;
  handoff: {
    id: string;
    status: string;
    scope: {
      kind: string;
      branch: string | null;
    };
    body: string;
  } | null;
}

interface HandoffUpdateData {
  branch: string;
  id: string;
  save: {
    memory_created: string[];
    memory_updated: string[];
  };
}

interface HandoffCloseData {
  branch: string;
  id: string;
  save: {
    memory_created: string[];
    memory_updated: string[];
  };
}

interface InspectData {
  object: {
    id: string;
    status: string;
    body: string;
  };
}

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true }))
  );
});

describe("aictx lens and handoff CLI", () => {
  it("renders built-in lenses with role coverage and generated gaps", async () => {
    const repo = await createSetupRepo("aictx-cli-lens-");
    const setup = await runCli(["node", "aictx", "setup", "--json"], repo);

    expect(setup.exitCode).toBe(0);

    const output = await runCli(["node", "aictx", "lens", "project-map", "--json"], repo);
    const envelope = JSON.parse(output.stdout) as SuccessEnvelope<LensData>;

    expect(output.exitCode).toBe(0);
    expect(envelope.ok).toBe(true);
    expect(envelope.data.name).toBe("project-map");
    expect(envelope.data.markdown).toContain("# Project Map");
    expect(envelope.data.included_memory_ids).toEqual(
      expect.arrayContaining(["synthesis.product-intent", "synthesis.repository-map"])
    );
    expect(envelope.data.role_coverage.roles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "repository-map",
          status: "populated"
        })
      ])
    );
    expect(envelope.data.generated_gaps).toEqual(expect.any(Array));
    expect(envelope.data.relations).toEqual(expect.any(Array));
  });

  it("creates, scopes, shows, and closes branch handoff memory", async () => {
    const repo = await createInitializedRepo("aictx-cli-handoff-");
    const updateInput = {
      goal: "Implement a scoped handoff test",
      current_state: ["The CLI command exists"],
      touched_files: ["src/cli/commands/handoff.ts"],
      temporary_assumptions: ["This is branch-local until closed"],
      open_questions: ["Should this promote a permanent workflow?"],
      verification: ["pnpm run typecheck not yet run"],
      next_action: "Run focused handoff tests"
    };

    const update = await runCli(
      ["node", "aictx", "handoff", "update", "--stdin", "--json"],
      repo,
      JSON.stringify(updateInput)
    );
    const updateEnvelope = JSON.parse(update.stdout) as SuccessEnvelope<HandoffUpdateData>;

    expect(update.exitCode).toBe(0);
    expect(updateEnvelope.data.branch).toBe("main");
    expect(updateEnvelope.data.id).toBe("synthesis.branch-handoff-main");
    expect(updateEnvelope.data.save.memory_created).toContain("synthesis.branch-handoff-main");

    const show = await runCli(["node", "aictx", "handoff", "show", "--json"], repo);
    const showEnvelope = JSON.parse(show.stdout) as SuccessEnvelope<HandoffShowData>;

    expect(show.exitCode).toBe(0);
    expect(showEnvelope.data.handoff?.scope).toEqual(
      expect.objectContaining({
        kind: "branch",
        branch: "main"
      })
    );
    expect(showEnvelope.data.handoff?.body).toContain("Implement a scoped handoff test");

    const mainLoad = await runCli(["node", "aictx", "load", "Run focused handoff tests", "--json"], repo);
    const mainLoadEnvelope = JSON.parse(mainLoad.stdout) as SuccessEnvelope<LoadData>;

    expect(mainLoad.exitCode).toBe(0);
    expect(mainLoadEnvelope.data.included_ids).toContain("synthesis.branch-handoff-main");

    const currentWork = await runCli(["node", "aictx", "lens", "current-work", "--json"], repo);
    const currentWorkEnvelope = JSON.parse(currentWork.stdout) as SuccessEnvelope<LensData>;

    expect(currentWork.exitCode).toBe(0);
    expect(currentWorkEnvelope.data.included_memory_ids).toContain("synthesis.branch-handoff-main");
    expect(currentWorkEnvelope.data.generated_gaps.join("\n")).not.toContain(
      "Branch Handoff is missing"
    );

    await git(repo, ["checkout", "-b", "other"]);
    const otherShow = await runCli(["node", "aictx", "handoff", "show", "--json"], repo);
    const otherShowEnvelope = JSON.parse(otherShow.stdout) as SuccessEnvelope<HandoffShowData>;

    expect(otherShow.exitCode).toBe(0);
    expect(otherShowEnvelope.data.handoff).toBeNull();

    const otherLoad = await runCli(["node", "aictx", "load", "Run focused handoff tests", "--json"], repo);
    const otherLoadEnvelope = JSON.parse(otherLoad.stdout) as SuccessEnvelope<LoadData>;

    expect(otherLoad.exitCode).toBe(0);
    expect(otherLoadEnvelope.data.included_ids).not.toContain("synthesis.branch-handoff-main");

    await git(repo, ["checkout", "main"]);
    const close = await runCli(
      ["node", "aictx", "handoff", "close", "--stdin", "--json"],
      repo,
      JSON.stringify({
        reason: "Branch work is complete",
        promote: {
          memories: [
            {
              kind: "fact",
              title: "Handoff tests cover branch scope",
              body: "The handoff CLI test verifies that branch-scoped handoff memory is visible on its branch and absent on another branch.",
              category: "debugging-fact",
              applies_to: ["test/integration/cli/lens-handoff.test.ts"]
            }
          ]
        }
      })
    );
    const closeEnvelope = JSON.parse(close.stdout) as SuccessEnvelope<HandoffCloseData>;

    expect(close.exitCode).toBe(0);
    expect(closeEnvelope.data.save.memory_created).toContain("fact.handoff-tests-cover-branch-scope");
    expect(closeEnvelope.data.save.memory_updated).toContain("synthesis.branch-handoff-main");

    const storage = await readCanonicalStorage(repo);
    expect(storage.ok).toBe(true);
    if (storage.ok) {
      expect(
        storage.data.objects.find((object) => object.sidecar.id === "synthesis.branch-handoff-main")
          ?.sidecar.status
      ).toBe("stale");
    }

    const closedShow = await runCli(["node", "aictx", "handoff", "show", "--json"], repo);
    const closedShowEnvelope = JSON.parse(closedShow.stdout) as SuccessEnvelope<HandoffShowData>;

    expect(closedShow.exitCode).toBe(0);
    expect(closedShowEnvelope.data.handoff).toBeNull();

    const inspect = await runCli(
      ["node", "aictx", "inspect", "synthesis.branch-handoff-main", "--json"],
      repo
    );
    const inspectEnvelope = JSON.parse(inspect.stdout) as SuccessEnvelope<InspectData>;

    expect(inspect.exitCode).toBe(0);
    expect(inspectEnvelope.data.object.status).toBe("stale");

    const closedLoad = await runCli(["node", "aictx", "load", "Run focused handoff tests", "--json"], repo);
    const closedLoadEnvelope = JSON.parse(closedLoad.stdout) as SuccessEnvelope<LoadData>;

    expect(closedLoad.exitCode).toBe(0);
    expect(closedLoadEnvelope.data.included_ids).not.toContain("synthesis.branch-handoff-main");
  });
});

async function createSetupRepo(prefix: string): Promise<string> {
  const repo = await createInitializedRepo(prefix);
  await writeProjectFile(
    repo,
    "README.md",
    "# Lens App\n\nAictx lens test repository for durable project memory.\n\n## Features\n\n- Project map: Shows important memory roles.\n"
  );
  await writeJsonProjectFile(repo, "package.json", {
    name: "lens-app",
    description: "Aictx lens test repository.",
    type: "module",
    packageManager: "pnpm@10.0.0",
    scripts: {
      typecheck: "tsc --noEmit"
    }
  });
  await writeProjectFile(repo, "src/index.ts", "export const value = 1;\n");
  await git(repo, ["add", "."]);
  await git(repo, ["commit", "-m", "Add project files"]);
  return repo;
}

async function createInitializedRepo(prefix: string): Promise<string> {
  const repo = await createTempRoot(prefix);
  await git(repo, ["init", "--initial-branch=main"]);
  await git(repo, ["config", "user.email", "test@example.com"]);
  await git(repo, ["config", "user.name", "Aictx Test"]);
  await writeProjectFile(repo, "README.md", "# Initial project\n");
  await git(repo, ["add", "README.md"]);
  await git(repo, ["commit", "-m", "Initial project"]);
  const output = await runCli(["node", "aictx", "init", "--json"], repo);

  expect(output.exitCode).toBe(0);
  expect(output.stderr).toBe("");

  return repo;
}

async function createTempRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  const resolved = await realpath(root);
  tempRoots.push(resolved);
  return resolved;
}

async function writeProjectFile(root: string, path: string, contents: string): Promise<void> {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), contents, "utf8");
}

async function writeJsonProjectFile(
  root: string,
  path: string,
  contents: unknown
): Promise<void> {
  await writeProjectFile(root, path, `${JSON.stringify(contents, null, 2)}\n`);
}

async function runCli(
  argv: string[],
  cwd: string,
  stdinText?: string
): Promise<CliRunResult> {
  const output = createCapturedOutput();
  const exitCode = await main(argv, {
    ...output.writers,
    cwd,
    ...(stdinText === undefined ? {} : { stdin: Readable.from([stdinText]) })
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

async function git(cwd: string, args: string[]): Promise<void> {
  const result = await runSubprocess("git", args, { cwd });

  if (!result.ok || result.data.exitCode !== 0) {
    throw new Error(
      `git ${args.join(" ")} failed: ${result.ok ? result.data.stderr : result.error.message}`
    );
  }
}
