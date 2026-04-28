import { access, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";

import { afterEach, describe, expect, it } from "vitest";

import { main, type CliOutputWriter } from "../../../src/cli/main.js";
import { runSubprocess } from "../../../src/core/subprocess.js";

const tempRoots: string[] = [];

interface CliRunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

interface ResponseMeta {
  project_root: string;
  aictx_root: string;
  git: {
    available: boolean;
    branch: string | null;
    commit: string | null;
    dirty: boolean | null;
  };
}

interface SuccessEnvelope<TData> {
  ok: true;
  data: TData;
  warnings: string[];
  meta: ResponseMeta;
}

interface ErrorEnvelope {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  warnings: string[];
  meta: ResponseMeta;
}

interface InitData {
  created: boolean;
  index_built: boolean;
  git_available: boolean;
}

interface SaveData {
  files_changed: string[];
  memory_created: string[];
  memory_updated: string[];
  memory_deleted: string[];
  relations_created: string[];
  relations_updated: string[];
  relations_deleted: string[];
  events_appended: number;
  index_updated: boolean;
}

interface LoadData {
  task: string;
  token_budget: number | null;
  context_pack: string;
  token_target: number | null;
  estimated_tokens: number;
  budget_status: "not_requested" | "within_target" | "over_target";
  truncated: boolean;
  source: {
    project: string;
    git_available: boolean;
    branch: string | null;
    commit: string | null;
  };
  included_ids: string[];
  excluded_ids: string[];
  omitted_ids: string[];
}

interface SearchData {
  matches: Array<{
    id: string;
    type: string;
    status: string;
    title: string;
    snippet: string;
    body_path: string;
    score: number;
  }>;
}

interface HistoryData {
  commits: Array<{
    commit: string;
    short_commit: string;
    author: string;
    timestamp: string;
    subject: string;
  }>;
}

interface RestoreData {
  restored_from: string;
  files_changed: string[];
  index_rebuilt: boolean;
}

interface CheckData {
  valid: boolean;
  errors: unknown[];
  warnings: unknown[];
}

interface RebuildData {
  index_rebuilt: boolean;
  objects_indexed: number;
  relations_indexed: number;
  events_indexed: number;
  event_appended: boolean;
}

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true }))
  );
});

describe("aictx full CLI workflow", () => {
  it("runs the Git-backed workflow end to end and restores only .aictx", async () => {
    const repo = await createRepo("aictx-e2e-cli-git-");
    const initOutput = await runCli(["node", "aictx", "init", "--json"], repo);

    expect(initOutput.exitCode).toBe(0);
    expect(initOutput.stderr).toBe("");
    const initEnvelope = parseSuccessEnvelope<InitData>(initOutput.stdout);
    expect(initEnvelope.data).toMatchObject({
      created: true,
      index_built: true,
      git_available: true
    });
    expect(initEnvelope.meta.git.available).toBe(true);

    await commit(repo, "Initialize aictx", "2026-04-25T14:00:00+02:00", [
      ".gitignore",
      ".aictx"
    ]);
    const initCommit = (await git(repo, ["rev-parse", "HEAD"])).trim();
    const projectId = await readJsonString(join(repo, ".aictx", "memory", "project.json"), "id");
    const saveOutput = await runCli(
      ["node", "aictx", "save", "--stdin", "--json"],
      repo,
      JSON.stringify(createGitWorkflowPatch(projectId))
    );

    expect(saveOutput.exitCode).toBe(0);
    expect(saveOutput.stderr).toBe("");
    const saveEnvelope = parseSuccessEnvelope<SaveData>(saveOutput.stdout);
    expect(saveEnvelope.data.memory_updated).toContain(projectId);
    expect(saveEnvelope.data.memory_created).toContain("decision.workflow-retry-queue");
    expect(saveEnvelope.data.memory_created).toContain("constraint.workflow-local-only");
    expect(saveEnvelope.data.index_updated).toBe(true);
    expect(saveEnvelope.meta.git.dirty).toBe(true);

    const loadWithoutBudget = parseSuccessEnvelope<LoadData>(
      (
        await expectSuccessfulCli([
          "node",
          "aictx",
          "load",
          "workflow retry queue",
          "--json"
        ], repo)
      ).stdout
    );
    expect(loadWithoutBudget.data).toMatchObject({
      task: "workflow retry queue",
      token_budget: null,
      token_target: null,
      budget_status: "not_requested",
      truncated: false
    });
    expect(loadWithoutBudget.data.omitted_ids).toEqual([]);
    expect(loadWithoutBudget.data.context_pack).toContain("decision.workflow-retry-queue");
    expect(loadWithoutBudget.data.context_pack).toContain("constraint.workflow-local-only");
    expect(loadWithoutBudget.data.context_pack).toContain("decision.workflow-budget-stale-1");
    expect(loadWithoutBudget.data.source.git_available).toBe(true);

    const loadWithBudget = parseSuccessEnvelope<LoadData>(
      (
        await expectSuccessfulCli([
          "node",
          "aictx",
          "load",
          "workflow retry queue",
          "--token-budget",
          "501",
          "--json"
        ], repo)
      ).stdout
    );
    expect(loadWithBudget.data.token_budget).toBe(501);
    expect(loadWithBudget.data.token_target).toBe(501);
    expect(["within_target", "over_target"]).toContain(loadWithBudget.data.budget_status);
    expect(loadWithBudget.data.truncated).toBe(true);
    expect(loadWithBudget.data.context_pack).toContain("decision.workflow-retry-queue");
    expect(loadWithBudget.data.context_pack).toContain("constraint.workflow-local-only");
    expect(loadWithBudget.data.included_ids).toContain("decision.workflow-retry-queue");
    expect(loadWithBudget.data.included_ids).toContain("constraint.workflow-local-only");
    expect(
      loadWithBudget.data.omitted_ids.some((id) =>
        id.startsWith("decision.workflow-budget-stale-")
      )
    ).toBe(true);

    const searchBeforeRestore = parseSuccessEnvelope<SearchData>(
      (
        await expectSuccessfulCli([
          "node",
          "aictx",
          "search",
          "workflow retry queue",
          "--json"
        ], repo)
      ).stdout
    );
    expect(searchIds(searchBeforeRestore)).toContain("decision.workflow-retry-queue");

    const outsideDirtyContent = "outside dirty change must survive restore\n";
    await writeFile(join(repo, "src.ts"), outsideDirtyContent, "utf8");
    const diffOutput = await expectSuccessfulCli(["node", "aictx", "diff"], repo);
    expect(diffOutput.stdout).toContain(".aictx/memory/project.md");
    expect(diffOutput.stdout).toContain("Workflow retry queue requires local deterministic CLI coverage");
    expect(diffOutput.stdout).not.toContain("src.ts");
    expect(() => JSON.parse(diffOutput.stdout) as unknown).toThrow();

    await commit(repo, "Save workflow memory", "2026-04-25T14:01:00+02:00", [
      ".aictx"
    ]);
    const history = parseSuccessEnvelope<HistoryData>(
      (
        await expectSuccessfulCli(["node", "aictx", "history", "--json"], repo)
      ).stdout
    );
    expect(history.data.commits.map((entry) => entry.subject)).toEqual([
      "Save workflow memory",
      "Initialize aictx"
    ]);

    const headBeforeRestore = (await git(repo, ["rev-parse", "HEAD"])).trim();
    const restoreOutput = await expectSuccessfulCli(
      ["node", "aictx", "restore", initCommit, "--json"],
      repo
    );
    const restoreEnvelope = parseSuccessEnvelope<RestoreData>(restoreOutput.stdout);
    expect(restoreEnvelope.data.restored_from).toBe(initCommit);
    expect(restoreEnvelope.data.index_rebuilt).toBe(true);
    expect(restoreEnvelope.data.files_changed.length).toBeGreaterThan(0);
    expect(
      restoreEnvelope.data.files_changed.every((file) => file.startsWith(".aictx/"))
    ).toBe(true);
    expect((await git(repo, ["rev-parse", "HEAD"])).trim()).toBe(headBeforeRestore);
    expect(await readFile(join(repo, "src.ts"), "utf8")).toBe(outsideDirtyContent);
    await expect(
      access(join(repo, ".aictx", "memory", "decisions", "workflow-retry-queue.json"))
    ).rejects.toMatchObject({ code: "ENOENT" });

    const searchAfterRestore = parseSuccessEnvelope<SearchData>(
      (
        await expectSuccessfulCli([
          "node",
          "aictx",
          "search",
          "workflow retry queue",
          "--json"
        ], repo)
      ).stdout
    );
    expect(searchIds(searchAfterRestore)).not.toContain("decision.workflow-retry-queue");
    expect(searchIds(searchAfterRestore)).not.toContain("constraint.workflow-local-only");
  });

  it("runs the core workflow outside Git and rejects Git-only commands", async () => {
    const projectRoot = await createTempRoot("aictx-e2e-cli-nongit-");
    const init = parseSuccessEnvelope<InitData>(
      (await expectSuccessfulCli(["node", "aictx", "init", "--json"], projectRoot)).stdout
    );

    expect(init.meta).toEqual({
      project_root: projectRoot,
      aictx_root: join(projectRoot, ".aictx"),
      git: {
        available: false,
        branch: null,
        commit: null,
        dirty: null
      }
    });

    const save = parseSuccessEnvelope<SaveData>(
      (
        await expectSuccessfulCli(
          ["node", "aictx", "save", "--stdin", "--json"],
          projectRoot,
          JSON.stringify(createNonGitWorkflowPatch())
        )
      ).stdout
    );
    expect(save.data.memory_created).toContain("decision.nongit-cli-workflow");
    expect(save.data.index_updated).toBe(true);
    expect(save.meta.git.available).toBe(false);

    const loaded = parseSuccessEnvelope<LoadData>(
      (
        await expectSuccessfulCli([
          "node",
          "aictx",
          "load",
          "non git workflow search",
          "--json"
        ], projectRoot)
      ).stdout
    );
    expect(loaded.data.context_pack).toContain("decision.nongit-cli-workflow");
    expect(loaded.data.source.git_available).toBe(false);

    const searched = parseSuccessEnvelope<SearchData>(
      (
        await expectSuccessfulCli([
          "node",
          "aictx",
          "search",
          "non git workflow search",
          "--json"
        ], projectRoot)
      ).stdout
    );
    expect(searchIds(searched)).toContain("decision.nongit-cli-workflow");

    const checked = parseSuccessEnvelope<CheckData>(
      (await expectSuccessfulCli(["node", "aictx", "check", "--json"], projectRoot)).stdout
    );
    expect(checked.data).toMatchObject({
      valid: true,
      errors: []
    });

    const rebuilt = parseSuccessEnvelope<RebuildData>(
      (await expectSuccessfulCli(["node", "aictx", "rebuild", "--json"], projectRoot)).stdout
    );
    expect(rebuilt.data.index_rebuilt).toBe(true);
    expect(rebuilt.data.objects_indexed).toBeGreaterThan(0);
    expect(rebuilt.data.event_appended).toBe(false);

    for (const argv of gitOnlyCommands()) {
      const output = await runCli(argv, projectRoot);
      expect(output.exitCode).toBe(3);
      expect(output.stderr).toBe("");
      const envelope = parseErrorEnvelope(output.stdout);
      expect(envelope.error.code).toBe("AICtxGitRequired");
      expect(envelope.meta.git.available).toBe(false);
    }

    const searchAfterFailures = parseSuccessEnvelope<SearchData>(
      (
        await expectSuccessfulCli([
          "node",
          "aictx",
          "search",
          "non git workflow search",
          "--json"
        ], projectRoot)
      ).stdout
    );
    expect(searchIds(searchAfterFailures)).toContain("decision.nongit-cli-workflow");
  });
});

function createGitWorkflowPatch(projectId: string) {
  return {
    source: {
      kind: "agent",
      task: "Full CLI workflow test"
    },
    changes: [
      {
        op: "update_object",
        id: projectId,
        title: "Workflow Project Memory",
        body:
          "# Workflow Project Memory\n\nWorkflow retry queue requires local deterministic CLI coverage. Do not call network services while loading context. Relevant file src/cli/main.ts.\n",
        tags: ["workflow", "retry", "e2e"]
      },
      {
        op: "create_object",
        id: "constraint.workflow-local-only",
        type: "constraint",
        title: "Workflow stays local",
        body:
          "# Workflow stays local\n\nFull CLI workflow tests must pass without network access and restore must stay scoped to .aictx/ only.\n",
        tags: ["workflow", "local", "restore"]
      },
      {
        op: "create_object",
        id: "decision.workflow-retry-queue",
        type: "decision",
        title: "Workflow retry queue",
        body:
          "# Workflow retry queue\n\nUse the generated SQLite index and CLI adapters to load and search saved workflow retry queue memory. Do not mutate product files from the e2e test.\n",
        tags: ["workflow", "retry", "queue"]
      },
      ...Array.from({ length: 14 }, (_, index) => ({
        op: "create_object",
        id: `decision.workflow-budget-stale-${index + 1}`,
        type: "decision",
        status: "stale",
        title: `Workflow budget stale ${index + 1}`,
        body: `# Workflow budget stale ${index + 1}\n\n${"Workflow retry queue budget context should be visible when no token budget is requested, but it can be omitted under an explicit low token target. ".repeat(12)}\n`,
        tags: ["workflow", "budget"]
      }))
    ]
  };
}

function createNonGitWorkflowPatch() {
  return {
    source: {
      kind: "agent",
      task: "Full CLI workflow non Git test"
    },
    changes: [
      {
        op: "create_object",
        id: "decision.nongit-cli-workflow",
        type: "decision",
        title: "Non Git CLI workflow",
        body:
          "# Non Git CLI workflow\n\nCore non git workflow search, load, check, and rebuild commands must work without Git metadata.\n",
        tags: ["non", "git", "workflow"]
      }
    ]
  };
}

function gitOnlyCommands(): string[][] {
  return [
    ["node", "aictx", "diff", "--json"],
    ["node", "aictx", "history", "--json"],
    ["node", "aictx", "restore", "HEAD", "--json"],
    ["node", "aictx", "rewind", "--json"]
  ];
}

async function expectSuccessfulCli(
  argv: string[],
  cwd: string,
  stdinText?: string
): Promise<CliRunResult> {
  const output = await runCli(argv, cwd, stdinText);

  expect(output.exitCode).toBe(0);
  expect(output.stderr).toBe("");

  return output;
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

function parseSuccessEnvelope<TData>(stdout: string): SuccessEnvelope<TData> {
  return JSON.parse(stdout) as SuccessEnvelope<TData>;
}

function parseErrorEnvelope(stdout: string): ErrorEnvelope {
  return JSON.parse(stdout) as ErrorEnvelope;
}

function searchIds(envelope: SuccessEnvelope<SearchData>): string[] {
  return envelope.data.matches.map((match) => match.id);
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

async function createRepo(prefix: string): Promise<string> {
  const repo = await createTempRoot(prefix);
  await git(repo, ["init", "--initial-branch=main"]);
  await git(repo, ["config", "user.email", "test@example.com"]);
  await git(repo, ["config", "user.name", "Aictx Test"]);
  await writeFile(join(repo, "README.md"), "# Test\n", "utf8");
  await writeFile(join(repo, "src.ts"), "initial source\n", "utf8");
  await commit(repo, "Initial commit", "2026-04-25T13:59:00+02:00", [
    "README.md",
    "src.ts"
  ]);
  return repo;
}

async function createTempRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  const resolvedRoot = await realpath(root);
  tempRoots.push(resolvedRoot);
  return resolvedRoot;
}

async function commit(
  cwd: string,
  message: string,
  date: string,
  paths: string[]
): Promise<void> {
  await git(cwd, ["add", ...paths]);
  await git(cwd, ["commit", "-m", message], {
    GIT_AUTHOR_DATE: date,
    GIT_COMMITTER_DATE: date
  });
}

async function git(
  cwd: string,
  args: readonly string[],
  env: Record<string, string> = {}
): Promise<string> {
  const result = await runSubprocess("git", args, {
    cwd,
    env: { ...process.env, ...env }
  });

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

async function readJsonString(path: string, key: string): Promise<string> {
  const parsed = JSON.parse(await readFile(path, "utf8")) as unknown;

  if (!isRecord(parsed) || typeof parsed[key] !== "string") {
    throw new Error(`Expected ${path} to contain a string ${key}.`);
  }

  return parsed[key];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
