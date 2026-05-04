import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { main, type CliOutputWriter } from "../../../src/cli/main.js";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("aictx projects CLI", () => {
  it("adds, lists, removes, and prunes registered projects", async () => {
    const aictxHome = await createTempRoot("aictx-cli-projects-home-");
    const projectRoot = await createInitializedProject("aictx-cli-projects-project-", aictxHome);

    const empty = await runCli(["node", "aictx", "projects", "list", "--json"], projectRoot, aictxHome);
    expect(empty.exitCode).toBe(0);
    expect(parseJson<{ ok: true; data: { projects: unknown[] } }>(empty.stdout).data.projects)
      .toHaveLength(0);

    const added = await runCli(["node", "aictx", "projects", "add", projectRoot, "--json"], projectRoot, aictxHome);
    expect(added.exitCode).toBe(0);
    const addedEnvelope = parseJson<{
      ok: true;
      data: { project: { registry_id: string; project_root: string } };
    }>(added.stdout);
    expect(addedEnvelope.data.project.project_root).toBe(projectRoot);

    const listed = await runCli(["node", "aictx", "projects", "list", "--json"], projectRoot, aictxHome);
    expect(parseJson<{ ok: true; data: { projects: unknown[] } }>(listed.stdout).data.projects)
      .toHaveLength(1);

    const removed = await runCli(
      ["node", "aictx", "projects", "remove", addedEnvelope.data.project.registry_id, "--json"],
      projectRoot,
      aictxHome
    );
    expect(removed.exitCode).toBe(0);
    expect(parseJson<{ ok: true; data: { removed: { registry_id: string } } }>(removed.stdout)
      .data.removed.registry_id).toBe(addedEnvelope.data.project.registry_id);

    await runCli(["node", "aictx", "projects", "add", projectRoot, "--json"], projectRoot, aictxHome);
    await rm(join(projectRoot, ".aictx"), { recursive: true, force: true });

    const pruned = await runCli(["node", "aictx", "projects", "prune", "--json"], projectRoot, aictxHome);
    const prunedEnvelope = parseJson<{
      ok: true;
      data: { projects: unknown[]; removed: unknown[] };
    }>(pruned.stdout);

    expect(pruned.exitCode).toBe(0);
    expect(prunedEnvelope.data.projects).toHaveLength(0);
    expect(prunedEnvelope.data.removed).toHaveLength(1);
  });

  it("auto-registers successful project-scoped commands", async () => {
    const aictxHome = await createTempRoot("aictx-cli-auto-home-");
    const projectRoot = await createTempRoot("aictx-cli-auto-project-");

    const init = await runCli(["node", "aictx", "init", "--json"], projectRoot, aictxHome, true);
    expect(init.exitCode).toBe(0);
    await expectRegisteredProjectCount(projectRoot, aictxHome, 1);

    const listed = await runCli(["node", "aictx", "projects", "list", "--json"], projectRoot, aictxHome);
    const registryId = parseJson<{
      ok: true;
      data: { projects: Array<{ registry_id: string }> };
    }>(listed.stdout).data.projects[0]?.registry_id;

    expect(registryId).toBeTruthy();
    await runCli(["node", "aictx", "projects", "remove", registryId ?? "", "--json"], projectRoot, aictxHome);
    await expectRegisteredProjectCount(projectRoot, aictxHome, 0);

    const check = await runCli(["node", "aictx", "check", "--json"], projectRoot, aictxHome, true);
    expect(check.exitCode).toBe(0);
    await expectRegisteredProjectCount(projectRoot, aictxHome, 1);

    const afterCheck = await runCli(["node", "aictx", "projects", "list", "--json"], projectRoot, aictxHome);
    const registryIdAfterCheck = parseJson<{
      ok: true;
      data: { projects: Array<{ registry_id: string }> };
    }>(afterCheck.stdout).data.projects[0]?.registry_id;

    await runCli(["node", "aictx", "projects", "remove", registryIdAfterCheck ?? "", "--json"], projectRoot, aictxHome);
    await expectRegisteredProjectCount(projectRoot, aictxHome, 0);

    const load = await runCli(["node", "aictx", "load", "project context", "--json"], projectRoot, aictxHome, true);
    expect(load.exitCode).toBe(0);
    await expectRegisteredProjectCount(projectRoot, aictxHome, 1);

    const registryIdAfterLoad = parseJson<{
      ok: true;
      data: { projects: Array<{ registry_id: string }> };
    }>((await runCli(["node", "aictx", "projects", "list", "--json"], projectRoot, aictxHome)).stdout)
      .data.projects[0]?.registry_id;

    await runCli(["node", "aictx", "projects", "remove", registryIdAfterLoad ?? "", "--json"], projectRoot, aictxHome);
    await expectRegisteredProjectCount(projectRoot, aictxHome, 0);

    await writeFile(
      join(projectRoot, "noop-memory.json"),
      JSON.stringify({
        proposed: false,
        reason: "No patch needed.",
        packet: {}
      }),
      "utf8"
    );
    const patchReview = await runCli(
      ["node", "aictx", "patch", "review", "noop-memory.json", "--json"],
      projectRoot,
      aictxHome,
      true
    );
    expect(patchReview.exitCode).toBe(0);
    await expectRegisteredProjectCount(projectRoot, aictxHome, 1);
  });
});

async function createInitializedProject(prefix: string, aictxHome: string): Promise<string> {
  const projectRoot = await createTempRoot(prefix);
  const init = await runCli(["node", "aictx", "init", "--json"], projectRoot, aictxHome, false);

  expect(init.exitCode).toBe(0);
  return projectRoot;
}

async function expectRegisteredProjectCount(
  cwd: string,
  aictxHome: string,
  count: number
): Promise<void> {
  const listed = await runCli(["node", "aictx", "projects", "list", "--json"], cwd, aictxHome);

  expect(listed.exitCode).toBe(0);
  expect(parseJson<{ ok: true; data: { projects: unknown[] } }>(listed.stdout).data.projects)
    .toHaveLength(count);
}

async function runCli(
  argv: string[],
  cwd: string,
  aictxHome: string,
  autoRegister = false
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const output = createCapturedOutput();
  const exitCode = await main(argv, {
    ...output.writers,
    cwd,
    registry: {
      enabled: autoRegister,
      aictxHome
    }
  });

  return {
    exitCode,
    stdout: output.stdout(),
    stderr: output.stderr()
  };
}

function parseJson<T>(text: string): T {
  return JSON.parse(text) as T;
}

async function createTempRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  const resolvedRoot = await realpath(root);
  tempRoots.push(resolvedRoot);
  return resolvedRoot;
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
