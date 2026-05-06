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
  it("backs up .aictx into .aictx/.backup and clears the remaining contents", async () => {
    const root = await createTempRoot("aictx-cli-reset-");
    const output = createCapturedOutput();
    await mkdir(join(root, ".aictx", ".backup"), { recursive: true });
    await mkdir(join(root, ".aictx", "memory"), { recursive: true });
    await writeFile(join(root, ".aictx", ".backup", "old.tar.gz"), "old");
    await writeFile(join(root, ".aictx", "config.json"), "{}\n");
    await writeFile(join(root, ".aictx", "memory", "note.md"), "# Note\n");

    const exitCode = await main(["node", "aictx", "reset"], {
      ...output.writers,
      cwd: root
    });

    expect(exitCode).toBe(0);
    expect(output.stderr()).toBe("");
    expect(output.stdout()).toContain("Backed up and cleared .aictx.");
    await expect(readdir(join(root, ".aictx"))).resolves.toEqual([".backup"]);

    const backups = await readdir(join(root, ".aictx", ".backup"));
    const archive = backups.find((file) => file.endsWith(".tar.gz") && file !== "old.tar.gz");
    expect(archive).toBeDefined();

    const tarList = await runSubprocess("tar", [
      "-tzf",
      join(root, ".aictx", ".backup", archive ?? "")
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

  it("deletes .aictx without creating a backup when --destroy is passed", async () => {
    const root = await createTempRoot("aictx-cli-reset-destroy-");
    const output = createCapturedOutput();
    await mkdir(join(root, ".aictx", ".backup"), { recursive: true });
    await writeFile(join(root, ".aictx", "config.json"), "{}\n");

    const exitCode = await main(["node", "aictx", "reset", "--destroy"], {
      ...output.writers,
      cwd: root
    });

    expect(exitCode).toBe(0);
    expect(output.stderr()).toBe("");
    expect(output.stdout()).toContain("Deleted .aictx.");
    await expect(access(join(root, ".aictx"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("backs up and clears .aictx for every registered project when --all is passed", async () => {
    const aictxHome = await createTempRoot("aictx-cli-reset-all-home-");
    const firstProject = await createRegisteredProject("aictx-cli-reset-all-first-", aictxHome);
    const secondProject = await createRegisteredProject("aictx-cli-reset-all-second-", aictxHome);

    const reset = await runCli(
      ["node", "aictx", "reset", "--all", "--json"],
      firstProject,
      aictxHome
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
    await expect(readdir(join(firstProject, ".aictx"))).resolves.toEqual([".backup"]);
    await expect(readdir(join(secondProject, ".aictx"))).resolves.toEqual([".backup"]);
    await expectRegisteredProjectCount(firstProject, aictxHome, 0);
  });

  it("deletes .aictx for every registered project when --all and --destroy are passed", async () => {
    const aictxHome = await createTempRoot("aictx-cli-reset-all-destroy-home-");
    const firstProject = await createRegisteredProject(
      "aictx-cli-reset-all-destroy-first-",
      aictxHome
    );
    const secondProject = await createRegisteredProject(
      "aictx-cli-reset-all-destroy-second-",
      aictxHome
    );

    const reset = await runCli(
      ["node", "aictx", "reset", "--all", "--destroy", "--json"],
      firstProject,
      aictxHome
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
    await expect(access(join(firstProject, ".aictx"))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(access(join(secondProject, ".aictx"))).rejects.toMatchObject({ code: "ENOENT" });
    await expectRegisteredProjectCount(firstProject, aictxHome, 0);
  });

  it("skips stale registered projects during reset --all and unregisters them", async () => {
    const aictxHome = await createTempRoot("aictx-cli-reset-all-stale-home-");
    const projectRoot = await createRegisteredProject("aictx-cli-reset-all-stale-project-", aictxHome);
    await rm(join(projectRoot, ".aictx"), { recursive: true, force: true });

    const reset = await runCli(
      ["node", "aictx", "reset", "--all", "--json"],
      projectRoot,
      aictxHome
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
        reason: ".aictx directory does not exist."
      }
    ]);
    expect(envelope.data.projects_failed).toHaveLength(0);
    await expectRegisteredProjectCount(projectRoot, aictxHome, 0);
  });
});

async function createRegisteredProject(prefix: string, aictxHome: string): Promise<string> {
  const projectRoot = await createTempRoot(prefix);
  const init = await runCli(["node", "aictx", "init", "--json"], projectRoot, aictxHome);
  expect(init.exitCode).toBe(0);
  expect(init.stderr).toBe("");

  const added = await runCli(
    ["node", "aictx", "projects", "add", projectRoot, "--json"],
    projectRoot,
    aictxHome
  );
  expect(added.exitCode).toBe(0);
  expect(added.stderr).toBe("");

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
  aictxHome: string
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const output = createCapturedOutput();
  const exitCode = await main(argv, {
    ...output.writers,
    cwd,
    registry: {
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
