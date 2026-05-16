import { mkdir, mkdtemp, readdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { main, type CliOutputWriter } from "../../../src/cli/main.js";
import {
  pruneProjectRegistry,
  readProjectRegistry,
  registryIdForProjectRoot,
  removeProjectFromRegistry,
  removeProjectRootsFromRegistry,
  resolveProjectRegistryLocation,
  upsertCurrentProjectInRegistry
} from "../../../src/registry/projects.js";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("project registry", () => {
  it("uses MEMORY_HOME as the default registry home", async () => {
    const memoryHome = await createTempRoot("memory-registry-env-home-");
    const previousMemoryHome = process.env.MEMORY_HOME;
    process.env.MEMORY_HOME = memoryHome;

    try {
      expect(resolveProjectRegistryLocation()).toEqual({
        memoryHome,
        registryPath: join(memoryHome, "projects.json"),
        lockPath: join(memoryHome, "projects.lock")
      });
    } finally {
      if (previousMemoryHome === undefined) {
        delete process.env.MEMORY_HOME;
      } else {
        process.env.MEMORY_HOME = previousMemoryHome;
      }
    }
  });

  it("deduplicates projects by canonical project root", async () => {
    const memoryHome = await createTempRoot("memory-registry-home-");
    const projectRoot = await createInitializedProject("memory-registry-project-");

    const first = await upsertCurrentProjectInRegistry({
      cwd: projectRoot,
      memoryHome,
      source: "auto"
    });
    const second = await upsertCurrentProjectInRegistry({
      cwd: join(projectRoot, "."),
      memoryHome,
      source: "manual"
    });
    const registry = await readProjectRegistry({ memoryHome });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(registry.ok).toBe(true);
    if (!registry.ok || !first.ok) {
      throw new Error("Expected registry read to succeed.");
    }

    expect(registry.data.registry.projects).toHaveLength(1);
    expect(registry.data.registry.projects[0]?.registry_id)
      .toBe(registryIdForProjectRoot(await realpath(projectRoot)));
    expect(registry.data.registry.projects[0]?.source).toBe("manual");
  });

  it("recovers an invalid registry file on the next write", async () => {
    const memoryHome = await createTempRoot("memory-registry-invalid-home-");
    const projectRoot = await createInitializedProject("memory-registry-invalid-project-");
    await writeProjectFile(memoryHome, "projects.json", "{not-json\n");

    const registered = await upsertCurrentProjectInRegistry({
      cwd: projectRoot,
      memoryHome,
      source: "manual"
    });
    const entries = await readdir(memoryHome);
    const contents = JSON.parse(await readFile(join(memoryHome, "projects.json"), "utf8")) as {
      projects: unknown[];
    };

    expect(registered.ok).toBe(true);
    expect(registered.warnings.join("\n")).toContain("invalid JSON");
    expect(entries.some((entry) => entry.startsWith("projects.invalid-"))).toBe(true);
    expect(contents.projects).toHaveLength(1);
  });

  it("returns lock busy when another registry writer holds the lock", async () => {
    const memoryHome = await createTempRoot("memory-registry-lock-home-");
    const projectRoot = await createInitializedProject("memory-registry-lock-project-");
    const location = resolveProjectRegistryLocation({ memoryHome });

    await writeProjectFile(memoryHome, "projects.lock", "{}\n");

    const registered = await upsertCurrentProjectInRegistry({
      cwd: projectRoot,
      memoryHome,
      source: "auto"
    });

    expect(registered.ok).toBe(false);
    if (!registered.ok) {
      expect(registered.error.code).toBe("MemoryLockBusy");
      expect(registered.error.details).toMatchObject({ lockPath: location.lockPath });
    }
  });

  it("rejects ambiguous remove by project id", async () => {
    const memoryHome = await createTempRoot("memory-registry-ambiguous-home-");
    const firstProject = await createInitializedProject("memory-registry-first-project-");
    const secondProject = await createInitializedProject("memory-registry-second-project-");
    await setProjectId(firstProject, "project.same");
    await setProjectId(secondProject, "project.same");

    await upsertCurrentProjectInRegistry({ cwd: firstProject, memoryHome, source: "manual" });
    await upsertCurrentProjectInRegistry({ cwd: secondProject, memoryHome, source: "manual" });

    const removed = await removeProjectFromRegistry({
      cwd: firstProject,
      memoryHome,
      identifier: "project.same"
    });

    expect(removed.ok).toBe(false);
    if (!removed.ok) {
      expect(removed.error.code).toBe("MemoryValidationFailed");
      expect(removed.error.message).toContain("Multiple");
    }
  });

  it("prunes unavailable project roots", async () => {
    const memoryHome = await createTempRoot("memory-registry-prune-home-");
    const projectRoot = await createInitializedProject("memory-registry-prune-project-");

    await upsertCurrentProjectInRegistry({ cwd: projectRoot, memoryHome, source: "auto" });
    await rm(join(projectRoot, ".memory"), { recursive: true, force: true });

    const pruned = await pruneProjectRegistry({ memoryHome });

    expect(pruned.ok).toBe(true);
    if (!pruned.ok) {
      throw new Error(pruned.error.message);
    }

    expect(pruned.data.removed).toHaveLength(1);
    expect(pruned.data.projects).toHaveLength(0);
  });

  it("removes multiple projects by canonical project root", async () => {
    const memoryHome = await createTempRoot("memory-registry-bulk-remove-home-");
    const firstProject = await createInitializedProject("memory-registry-bulk-first-project-");
    const secondProject = await createInitializedProject("memory-registry-bulk-second-project-");
    const thirdProject = await createInitializedProject("memory-registry-bulk-third-project-");

    await upsertCurrentProjectInRegistry({ cwd: firstProject, memoryHome, source: "manual" });
    await upsertCurrentProjectInRegistry({ cwd: secondProject, memoryHome, source: "manual" });
    await upsertCurrentProjectInRegistry({ cwd: thirdProject, memoryHome, source: "manual" });

    const removed = await removeProjectRootsFromRegistry({
      memoryHome,
      projectRoots: [join(firstProject, "."), secondProject]
    });
    const registry = await readProjectRegistry({ memoryHome });

    expect(removed.ok).toBe(true);
    expect(registry.ok).toBe(true);
    if (!removed.ok || !registry.ok) {
      throw new Error("Expected bulk registry removal to succeed.");
    }

    expect(removed.data.map((entry) => entry.project_root).sort()).toEqual([
      firstProject,
      secondProject
    ].sort());
    expect(registry.data.registry.projects.map((entry) => entry.project_root)).toEqual([
      thirdProject
    ]);
  });
});

async function createInitializedProject(prefix: string): Promise<string> {
  const projectRoot = await createTempRoot(prefix);
  const output = createCapturedOutput();
  const exitCode = await main(["node", "memory", "init", "--json"], {
    ...output.writers,
    cwd: projectRoot,
    registry: { enabled: false }
  });

  expect(exitCode).toBe(0);
  expect(output.stderr()).toBe("");

  return projectRoot;
}

async function setProjectId(projectRoot: string, projectId: string): Promise<void> {
  const configPath = join(projectRoot, ".memory", "config.json");
  const config = JSON.parse(await readFile(configPath, "utf8")) as {
    project: { id: string };
  };

  config.project.id = projectId;
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

async function writeProjectFile(
  root: string,
  relativePath: string,
  contents: string
): Promise<void> {
  const target = join(root, relativePath);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, contents, "utf8");
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
