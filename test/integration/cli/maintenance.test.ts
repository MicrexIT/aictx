import { access, mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
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
});

async function createTempRoot(prefix: string): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), prefix));
  tempRoots.push(path);
  return path;
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
