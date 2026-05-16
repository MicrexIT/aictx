import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";

import fg from "fast-glob";
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
  memory_root: string;
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
  mode: string;
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

interface SuggestData {
  mode: "from_diff" | "bootstrap";
  changed_files: string[];
  related_memory_ids: string[];
  possible_stale_ids: string[];
  recommended_memory: string[];
  agent_checklist: string[];
}

interface AuditData {
  findings: Array<{
    severity: "warning" | "info";
    rule: string;
    memory_id: string;
    message: string;
    evidence: Array<{
      kind: string;
      id: string;
    }>;
  }>;
}

interface DiffData {
  diff: string;
  changed_files: string[];
  changed_memory_ids: string[];
  changed_relation_ids: string[];
}

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true }))
  );
});

describe("memory discipline e2e workflow", () => {
  it("covers bootstrap, save, mode-aware load, suggest, audit, stale/supersede, and async inspection", async () => {
    const repo = await createRepo("memory-e2e-memory-discipline-");
    const init = parseSuccessEnvelope<InitData>(
      (await expectSuccessfulCli(["node", "memory", "init", "--json"], repo)).stdout
    );

    expect(init.data).toMatchObject({
      created: true,
      index_built: true,
      git_available: true
    });

    const beforeBootstrap = await readCanonicalSnapshot(repo);
    const bootstrap = parseSuccessEnvelope<SuggestData>(
      (
        await expectSuccessfulCli([
          "node",
          "memory",
          "suggest",
          "--bootstrap",
          "--json"
        ], repo)
      ).stdout
    );

    expect(bootstrap.data.mode).toBe("bootstrap");
    expect(bootstrap.data.changed_files).toEqual(
      expect.arrayContaining(["README.md", "package.json", "src/release.ts"])
    );
    expect(bootstrap.data.changed_files).not.toContain(".memory/config.json");
    expect(bootstrap.data.recommended_memory).toEqual(
      expect.arrayContaining(["workflow", "gotcha"])
    );
    expect(bootstrap.data.agent_checklist).toContain(
      "Save nothing if the work produced no durable future value."
    );
    await expect(readCanonicalSnapshot(repo)).resolves.toEqual(beforeBootstrap);

    await commit(repo, "Initialize Memory", "2026-04-25T14:00:00+02:00", [
      ".gitignore",
      "AGENTS.md",
      "CLAUDE.md",
      ".memory"
    ]);

    const seedSave = parseSuccessEnvelope<SaveData>(
      (
        await expectSuccessfulCli(
          ["node", "memory", "save", "--stdin", "--json"],
          repo,
          JSON.stringify(createSeedPatch())
        )
      ).stdout
    );

    expect(seedSave.data.memory_created).toEqual(
      expect.arrayContaining([
        "gotcha.release-env-trap",
        "workflow.release-old-checklist",
        "workflow.release-current-checklist"
      ])
    );
    expect(seedSave.data.relations_created).toContain(
      "rel.release-workflow-missing-evidence"
    );
    expect(seedSave.data.index_updated).toBe(true);

    const debugging = parseSuccessEnvelope<LoadData>(
      (
        await expectSuccessfulCli([
          "node",
          "memory",
          "load",
          "release discipline workflow gotcha",
          "--mode",
          "debugging",
          "--json"
        ], repo)
      ).stdout
    );
    const onboarding = parseSuccessEnvelope<LoadData>(
      (
        await expectSuccessfulCli([
          "node",
          "memory",
          "load",
          "release discipline workflow gotcha",
          "--mode",
          "onboarding",
          "--json"
        ], repo)
      ).stdout
    );

    expect(debugging.data.mode).toBe("debugging");
    expect(onboarding.data.mode).toBe("onboarding");
    expect(debugging.data.context_pack).toContain("## Relevant gotchas");
    expect(onboarding.data.context_pack).toContain("## Relevant workflows");
    expect(debugging.data.included_ids).toContain("gotcha.release-env-trap");
    expect(onboarding.data.included_ids).toContain("workflow.release-old-checklist");

    await commit(repo, "Seed memory discipline entries", "2026-04-25T14:01:00+02:00", [
      ".memory"
    ]);
    await writeProjectFile(
      repo,
      "src/release.ts",
      "export const releaseMode = 'verified-package';\n"
    );

    const diffSuggestion = parseSuccessEnvelope<SuggestData>(
      (
        await expectSuccessfulCli([
          "node",
          "memory",
          "suggest",
          "--from-diff",
          "--json"
        ], repo)
      ).stdout
    );

    expect(diffSuggestion.data.mode).toBe("from_diff");
    expect(diffSuggestion.data.changed_files).toEqual(["src/release.ts"]);
    expect(diffSuggestion.data.related_memory_ids).toEqual(
      expect.arrayContaining([
        "gotcha.release-env-trap",
        "workflow.release-old-checklist",
        "workflow.release-current-checklist"
      ])
    );
    expect(diffSuggestion.data.possible_stale_ids).toEqual(
      expect.arrayContaining([
        "gotcha.release-env-trap",
        "workflow.release-old-checklist"
      ])
    );
    expect(diffSuggestion.data.recommended_memory).toEqual(
      expect.arrayContaining(["decision", "constraint", "gotcha", "workflow"])
    );

    const audit = parseSuccessEnvelope<AuditData>(
      (await expectSuccessfulCli(["node", "memory", "audit", "--json"], repo)).stdout
    );
    const auditRules = new Set(audit.data.findings.map((finding) => finding.rule));

    for (const rule of [
      "referenced_file_missing",
      "missing_evidence",
      "vague_memory",
      "missing_tags"
    ]) {
      expect(auditRules.has(rule)).toBe(true);
    }
    expect(audit.data.findings).toContainEqual(
      expect.objectContaining({
        rule: "referenced_file_missing",
        memory_id: "gotcha.release-env-trap"
      })
    );

    const lifecycleSave = parseSuccessEnvelope<SaveData>(
      (
        await expectSuccessfulCli(
          ["node", "memory", "save", "--stdin", "--json"],
          repo,
          JSON.stringify(createLifecyclePatch())
        )
      ).stdout
    );

    expect(lifecycleSave.data.memory_updated).toEqual([
      "gotcha.release-env-trap",
      "workflow.release-old-checklist"
    ]);
    expect(lifecycleSave.data.relations_created).toContain(
      "rel.workflow-release-current-checklist-supersedes-workflow-release-old-checklist"
    );
    expect(lifecycleSave.data.index_updated).toBe(true);

    const postLifecycleLoad = parseSuccessEnvelope<LoadData>(
      (
        await expectSuccessfulCli([
          "node",
          "memory",
          "load",
          "release discipline workflow gotcha",
          "--mode",
          "debugging",
          "--json"
        ], repo)
      ).stdout
    );
    const mustKnow = sectionText(postLifecycleLoad.data.context_pack, "Must know");
    const staleSection = sectionText(
      postLifecycleLoad.data.context_pack,
      "Stale or superseded memory to avoid"
    );

    expect(mustKnow).not.toContain("gotcha.release-env-trap");
    expect(mustKnow).not.toContain("workflow.release-old-checklist");
    expect(staleSection).toContain("STALE");
    expect(staleSection).toContain("SUPERSEDED");
    expect(staleSection).toContain("gotcha.release-env-trap");
    expect(staleSection).toContain("workflow.release-old-checklist");

    await git(repo, [
      "add",
      "--intent-to-add",
      ".memory/relations/workflow-release-current-checklist-supersedes-workflow-release-old-checklist.json"
    ]);

    const finalDiff = parseSuccessEnvelope<DiffData>(
      (await expectSuccessfulCli(["node", "memory", "diff", "--json"], repo)).stdout
    );

    expect(finalDiff.data.changed_files.length).toBeGreaterThan(0);
    expect(finalDiff.data.changed_files.every((file) => file.startsWith(".memory/"))).toBe(
      true
    );
    expect(finalDiff.data.changed_files).toEqual(
      expect.arrayContaining([
        ".memory/events.jsonl",
        ".memory/memory/gotchas/release-env-trap.json",
        ".memory/memory/workflows/release-old-checklist.json",
        ".memory/relations/workflow-release-current-checklist-supersedes-workflow-release-old-checklist.json"
      ])
    );
    expect(finalDiff.data.changed_memory_ids).toEqual(
      expect.arrayContaining([
        "gotcha.release-env-trap",
        "workflow.release-old-checklist"
      ])
    );
    expect(finalDiff.data.changed_relation_ids).toContain(
      "rel.workflow-release-current-checklist-supersedes-workflow-release-old-checklist"
    );
    expect(finalDiff.data.diff).not.toContain("src/release.ts");

    const humanDiff = await expectSuccessfulCli(["node", "memory", "diff"], repo);

    expect(humanDiff.stdout).toContain(".memory/memory/gotchas/release-env-trap.json");
    expect(humanDiff.stdout).toContain("memory.marked_stale");
    expect(humanDiff.stdout).toContain("memory.superseded");
    expect(humanDiff.stdout).not.toContain("src/release.ts");
    expect(() => JSON.parse(humanDiff.stdout) as unknown).toThrow();
  });
});

function createSeedPatch() {
  return {
    source: {
      kind: "agent",
      task: "Seed memory discipline workflow"
    },
    changes: [
      {
        op: "create_object",
        id: "gotcha.release-env-trap",
        type: "gotcha",
        title: "Release environment trap",
        body:
          "# Release environment trap\n\nRelease discipline workflow gotcha: src/release.ts must use local package verification. Do not rely on src/missing-release.ts because that file no longer exists.\n",
        tags: ["release", "discipline", "gotcha"]
      },
      {
        op: "create_object",
        id: "workflow.release-old-checklist",
        type: "workflow",
        title: "Release discipline workflow",
        body:
          "# Release discipline workflow\n\nRelease discipline workflow for src/release.ts still describes the old manual checklist before package verification.\n",
        tags: ["release", "discipline", "workflow"]
      },
      {
        op: "create_object",
        id: "workflow.release-current-checklist",
        type: "workflow",
        title: "Release discipline workflow current",
        body:
          "# Release discipline workflow current\n\nRelease discipline workflow now verifies the package after source changes in src/release.ts.\n",
        tags: ["release", "discipline", "workflow"]
      },
      {
        op: "create_object",
        id: "decision.todo",
        type: "decision",
        title: "TODO",
        body: "# TODO\n\nTBD.\n",
        tags: []
      },
      {
        op: "create_relation",
        id: "rel.release-workflow-missing-evidence",
        from: "workflow.release-old-checklist",
        predicate: "requires",
        to: "gotcha.release-env-trap",
        confidence: "high",
        evidence: []
      }
    ]
  };
}

function createLifecyclePatch() {
  return {
    source: {
      kind: "agent",
      task: "Apply memory discipline lifecycle"
    },
    changes: [
      {
        op: "mark_stale",
        id: "gotcha.release-env-trap",
        reason: "Current release verification no longer uses the old environment trap."
      },
      {
        op: "supersede_object",
        id: "workflow.release-old-checklist",
        superseded_by: "workflow.release-current-checklist",
        reason: "The current checklist replaces the old manual release workflow."
      }
    ]
  };
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

function sectionText(markdown: string, title: string): string {
  const marker = `## ${title}`;
  const start = markdown.indexOf(marker);

  if (start === -1) {
    return "";
  }

  const afterMarker = markdown.slice(start + marker.length);
  const nextSection = afterMarker.search(/\n## /u);

  return nextSection === -1 ? afterMarker : afterMarker.slice(0, nextSection);
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
  await git(repo, ["config", "user.name", "Memory Test"]);
  await writeProjectFile(repo, "README.md", "# Release Test\n");
  await writeProjectFile(repo, "package.json", '{ "version": "1.2.3" }\n');
  await writeProjectFile(repo, "src/release.ts", "export const releaseMode = 'manual';\n");
  await commit(repo, "Initial project", "2026-04-25T13:59:00+02:00", [
    "README.md",
    "package.json",
    "src/release.ts"
  ]);

  return repo;
}

async function createTempRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  const resolvedRoot = await realpath(root);

  tempRoots.push(resolvedRoot);

  return resolvedRoot;
}

async function readCanonicalSnapshot(projectRoot: string): Promise<Record<string, string>> {
  const paths = await fg(
    [
      ".memory/config.json",
      ".memory/events.jsonl",
      ".memory/memory/**",
      ".memory/relations/**"
    ],
    {
      cwd: projectRoot,
      dot: true,
      onlyFiles: true,
      unique: true
    }
  );
  const snapshot: Record<string, string> = {};

  for (const path of paths.sort()) {
    snapshot[path] = (await readFile(join(projectRoot, path))).toString("base64");
  }

  return snapshot;
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
