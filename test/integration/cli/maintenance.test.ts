import { access, mkdir, mkdtemp, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { main, type CliOutputWriter } from "../../../src/cli/main.js";
import { runSubprocess } from "../../../src/core/subprocess.js";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true }))
  );
});

describe("maintenance CLI commands", () => {
  it("backs up .memory into .memory/.backup and clears the remaining contents", async () => {
    const root = await createTempRoot("memory-cli-reset-");
    const output = createCapturedOutput();
    await mkdir(join(root, ".memory", ".backup"), { recursive: true });
    await mkdir(join(root, ".memory", "memory"), { recursive: true });
    await writeFile(join(root, ".memory", ".backup", "old.tar.gz"), "old");
    await writeFile(join(root, ".memory", "config.json"), "{}\n");
    await writeFile(join(root, ".memory", "memory", "note.md"), "# Note\n");

    const exitCode = await main(["node", "memory", "reset"], {
      ...output.writers,
      cwd: root
    });

    expect(exitCode).toBe(0);
    expect(output.stderr()).toBe("");
    expect(output.stdout()).toContain("Backed up and cleared .memory.");
    await expect(readdir(join(root, ".memory"))).resolves.toEqual([".backup"]);

    const backups = await readdir(join(root, ".memory", ".backup"));
    const archive = backups.find((file) => file.endsWith(".tar.gz") && file !== "old.tar.gz");
    expect(archive).toBeDefined();

    const tarList = await runSubprocess("tar", [
      "-tzf",
      join(root, ".memory", ".backup", archive ?? "")
    ]);
    expect(tarList.ok).toBe(true);
    if (!tarList.ok) {
      throw new Error(tarList.error.message);
    }

    expect(tarList.data.exitCode).toBe(0);
    expect(tarList.data.stdout).toContain("./config.json");
    expect(tarList.data.stdout).toContain("./memory/note.md");
    expect(tarList.data.stdout).not.toContain(".backup");
  });

  it("deletes .memory without creating a backup when --destroy is passed", async () => {
    const root = await createTempRoot("memory-cli-reset-destroy-");
    const output = createCapturedOutput();
    await mkdir(join(root, ".memory", ".backup"), { recursive: true });
    await writeFile(join(root, ".memory", "config.json"), "{}\n");

    const exitCode = await main(["node", "memory", "reset", "--destroy"], {
      ...output.writers,
      cwd: root
    });

    expect(exitCode).toBe(0);
    expect(output.stderr()).toBe("");
    expect(output.stdout()).toContain("Deleted .memory.");
    await expect(access(join(root, ".memory"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("backs up and clears .memory for every registered project when --all is passed", async () => {
    const memoryHome = await createTempRoot("memory-cli-reset-all-home-");
    const firstProject = await createRegisteredProject("memory-cli-reset-all-first-", memoryHome);
    const secondProject = await createRegisteredProject("memory-cli-reset-all-second-", memoryHome);

    const reset = await runCli(
      ["node", "memory", "reset", "--all", "--json"],
      firstProject,
      memoryHome
    );
    const envelope = parseJson<{
      ok: true;
      data: {
        destroyed: boolean;
        projects_reset: Array<{ project_root: string; backup_path: string | null }>;
        projects_skipped: unknown[];
        projects_failed: unknown[];
      };
    }>(reset.stdout);

    expect(reset.exitCode).toBe(0);
    expect(reset.stderr).toBe("");
    expect(envelope.data.destroyed).toBe(false);
    expect(envelope.data.projects_reset.map((project) => project.project_root).sort()).toEqual([
      firstProject,
      secondProject
    ].sort());
    expect(envelope.data.projects_reset.every((project) => project.backup_path !== null)).toBe(true);
    expect(envelope.data.projects_skipped).toHaveLength(0);
    expect(envelope.data.projects_failed).toHaveLength(0);
    await expect(readdir(join(firstProject, ".memory"))).resolves.toEqual([".backup"]);
    await expect(readdir(join(secondProject, ".memory"))).resolves.toEqual([".backup"]);
    await expectRegisteredProjectCount(firstProject, memoryHome, 0);
  });

  it("deletes .memory for every registered project when --all and --destroy are passed", async () => {
    const memoryHome = await createTempRoot("memory-cli-reset-all-destroy-home-");
    const firstProject = await createRegisteredProject(
      "memory-cli-reset-all-destroy-first-",
      memoryHome
    );
    const secondProject = await createRegisteredProject(
      "memory-cli-reset-all-destroy-second-",
      memoryHome
    );

    const reset = await runCli(
      ["node", "memory", "reset", "--all", "--destroy", "--json"],
      firstProject,
      memoryHome
    );
    const envelope = parseJson<{
      ok: true;
      data: {
        destroyed: boolean;
        projects_reset: unknown[];
        projects_skipped: unknown[];
        projects_failed: unknown[];
      };
    }>(reset.stdout);

    expect(reset.exitCode).toBe(0);
    expect(reset.stderr).toBe("");
    expect(envelope.data.destroyed).toBe(true);
    expect(envelope.data.projects_reset).toHaveLength(2);
    expect(envelope.data.projects_skipped).toHaveLength(0);
    expect(envelope.data.projects_failed).toHaveLength(0);
    await expect(access(join(firstProject, ".memory"))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(access(join(secondProject, ".memory"))).rejects.toMatchObject({ code: "ENOENT" });
    await expectRegisteredProjectCount(firstProject, memoryHome, 0);
  });

  it("skips stale registered projects during reset --all and unregisters them", async () => {
    const memoryHome = await createTempRoot("memory-cli-reset-all-stale-home-");
    const projectRoot = await createRegisteredProject("memory-cli-reset-all-stale-project-", memoryHome);
    await rm(join(projectRoot, ".memory"), { recursive: true, force: true });

    const reset = await runCli(
      ["node", "memory", "reset", "--all", "--json"],
      projectRoot,
      memoryHome
    );
    const envelope = parseJson<{
      ok: true;
      data: {
        projects_reset: unknown[];
        projects_skipped: Array<{ project_root: string; reason: string }>;
        projects_failed: unknown[];
      };
    }>(reset.stdout);

    expect(reset.exitCode).toBe(0);
    expect(reset.stderr).toBe("");
    expect(envelope.data.projects_reset).toHaveLength(0);
    expect(envelope.data.projects_skipped).toMatchObject([
      {
        project_root: projectRoot,
        reason: ".memory directory does not exist."
      }
    ]);
    expect(envelope.data.projects_failed).toHaveLength(0);
    await expectRegisteredProjectCount(projectRoot, memoryHome, 0);
  });
});

async function createRegisteredProject(prefix: string, memoryHome: string): Promise<string> {
  const projectRoot = await createTempRoot(prefix);
  const init = await runCli(["node", "memory", "init", "--json"], projectRoot, memoryHome);
  expect(init.exitCode).toBe(0);
  expect(init.stderr).toBe("");

  const added = await runCli(
    ["node", "memory", "projects", "add", projectRoot, "--json"],
    projectRoot,
    memoryHome
  );
  expect(added.exitCode).toBe(0);
  expect(added.stderr).toBe("");

  return projectRoot;
}

async function expectRegisteredProjectCount(
  cwd: string,
  memoryHome: string,
  count: number
): Promise<void> {
  const listed = await runCli(["node", "memory", "projects", "list", "--json"], cwd, memoryHome);

  expect(listed.exitCode).toBe(0);
  expect(parseJson<{ ok: true; data: { projects: unknown[] } }>(listed.stdout).data.projects)
    .toHaveLength(count);
}

async function runCli(
  argv: string[],
  cwd: string,
  memoryHome: string
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const output = createCapturedOutput();
  const exitCode = await main(argv, {
    ...output.writers,
    cwd,
    registry: {
      memoryHome
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
  const path = await mkdtemp(join(tmpdir(), prefix));
  const resolvedPath = await realpath(path);
  tempRoots.push(resolvedPath);
  return resolvedPath;
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
