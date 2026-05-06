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
  it("deduplicates projects by canonical project root", async () => {
    const aictxHome = await createTempRoot("aictx-registry-home-");
    const projectRoot = await createInitializedProject("aictx-registry-project-");

    const first = await upsertCurrentProjectInRegistry({
      cwd: projectRoot,
      aictxHome,
      source: "auto"
    });
    const second = await upsertCurrentProjectInRegistry({
      cwd: join(projectRoot, "."),
      aictxHome,
      source: "manual"
    });
    const registry = await readProjectRegistry({ aictxHome });

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
    const aictxHome = await createTempRoot("aictx-registry-invalid-home-");
    const projectRoot = await createInitializedProject("aictx-registry-invalid-project-");
    await writeProjectFile(aictxHome, "projects.json", "{not-json\n");

    const registered = await upsertCurrentProjectInRegistry({
      cwd: projectRoot,
      aictxHome,
      source: "manual"
    });
    const entries = await readdir(aictxHome);
    const contents = JSON.parse(await readFile(join(aictxHome, "projects.json"), "utf8")) as {
      projects: unknown[];
    };

    expect(registered.ok).toBe(true);
    expect(registered.warnings.join("\n")).toContain("invalid JSON");
    expect(entries.some((entry) => entry.startsWith("projects.invalid-"))).toBe(true);
    expect(contents.projects).toHaveLength(1);
  });

  it("returns lock busy when another registry writer holds the lock", async () => {
    const aictxHome = await createTempRoot("aictx-registry-lock-home-");
    const projectRoot = await createInitializedProject("aictx-registry-lock-project-");
    const location = resolveProjectRegistryLocation({ aictxHome });

    await writeProjectFile(aictxHome, "projects.lock", "{}\n");

    const registered = await upsertCurrentProjectInRegistry({
      cwd: projectRoot,
      aictxHome,
      source: "auto"
    });

    expect(registered.ok).toBe(false);
    if (!registered.ok) {
      expect(registered.error.code).toBe("AICtxLockBusy");
      expect(registered.error.details).toMatchObject({ lockPath: location.lockPath });
    }
  });

  it("rejects ambiguous remove by project id", async () => {
    const aictxHome = await createTempRoot("aictx-registry-ambiguous-home-");
    const firstProject = await createInitializedProject("aictx-registry-first-project-");
    const secondProject = await createInitializedProject("aictx-registry-second-project-");
    await setProjectId(firstProject, "project.same");
    await setProjectId(secondProject, "project.same");

    await upsertCurrentProjectInRegistry({ cwd: firstProject, aictxHome, source: "manual" });
    await upsertCurrentProjectInRegistry({ cwd: secondProject, aictxHome, source: "manual" });

    const removed = await removeProjectFromRegistry({
      cwd: firstProject,
      aictxHome,
      identifier: "project.same"
    });

    expect(removed.ok).toBe(false);
    if (!removed.ok) {
      expect(removed.error.code).toBe("AICtxValidationFailed");
      expect(removed.error.message).toContain("Multiple");
    }
  });

  it("prunes unavailable project roots", async () => {
    const aictxHome = await createTempRoot("aictx-registry-prune-home-");
    const projectRoot = await createInitializedProject("aictx-registry-prune-project-");

    await upsertCurrentProjectInRegistry({ cwd: projectRoot, aictxHome, source: "auto" });
    await rm(join(projectRoot, ".aictx"), { recursive: true, force: true });

    const pruned = await pruneProjectRegistry({ aictxHome });

    expect(pruned.ok).toBe(true);
    if (!pruned.ok) {
      throw new Error(pruned.error.message);
    }

    expect(pruned.data.removed).toHaveLength(1);
    expect(pruned.data.projects).toHaveLength(0);
  });

  it("removes multiple projects by canonical project root", async () => {
    const aictxHome = await createTempRoot("aictx-registry-bulk-remove-home-");
    const firstProject = await createInitializedProject("aictx-registry-bulk-first-project-");
    const secondProject = await createInitializedProject("aictx-registry-bulk-second-project-");
    const thirdProject = await createInitializedProject("aictx-registry-bulk-third-project-");

    await upsertCurrentProjectInRegistry({ cwd: firstProject, aictxHome, source: "manual" });
    await upsertCurrentProjectInRegistry({ cwd: secondProject, aictxHome, source: "manual" });
    await upsertCurrentProjectInRegistry({ cwd: thirdProject, aictxHome, source: "manual" });

    const removed = await removeProjectRootsFromRegistry({
      aictxHome,
      projectRoots: [join(firstProject, "."), secondProject]
    });
    const registry = await readProjectRegistry({ aictxHome });

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
  const exitCode = await main(["node", "aictx", "init", "--json"], {
    ...output.writers,
    cwd: projectRoot,
    registry: { enabled: false }
  });

  expect(exitCode).toBe(0);
  expect(output.stderr()).toBe("");

  return projectRoot;
}

async function setProjectId(projectRoot: string, projectId: string): Promise<void> {
  const configPath = join(projectRoot, ".aictx", "config.json");
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
