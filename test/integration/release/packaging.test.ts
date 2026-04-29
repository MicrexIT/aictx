import { mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterEach, describe, expect, it } from "vitest";

import { runSubprocess } from "../../../src/core/subprocess.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const tempRoots: string[] = [];

interface PackedFile {
  path: string;
}

interface PnpmPackOutput {
  filename: string;
  files: PackedFile[];
}

interface PackageJson {
  bin?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  engines?: {
    node?: string;
  };
  license?: string;
  scripts?: Record<string, string>;
}

interface StartedMcpClient {
  client: Client;
  close: () => Promise<void>;
  stderr: () => string;
}

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true }))
  );
});

describe("release package", () => {
  it("packs required files and runs published binaries", async () => {
    const packDestination = await createTempRoot("aictx-release-pack-");
    const installRoot = await createTempRoot("aictx-release-install-");

    await expectSuccessfulCommand("pnpm", ["build"], repoRoot);
    await expect(readFile(join(repoRoot, "dist", "viewer", "index.html"), "utf8")).resolves.toContain(
      '<script type="module"'
    );

    const pack = parsePnpmPackOutput(
      await expectSuccessfulCommand("pnpm", [
        "pack",
        "--pack-destination",
        packDestination,
        "--json"
      ], repoRoot)
    );
    const packedPaths = pack.files.map((file) => file.path).sort();
    const packedPathSet = new Set(packedPaths);

    expect(packedPaths).toEqual(expect.arrayContaining(requiredPackedPaths));
    expect(packedPaths.some((path) => path.startsWith("dist/viewer/assets/"))).toBe(true);
    expect(packedPaths).not.toEqual(
      expect.arrayContaining([
        "src/cli/main.ts",
        "scripts/copy-schemas.mjs",
        "scripts/generate-agent-guidance.mjs",
        "viewer/index.html",
        "viewer/src/App.svelte",
        "viewer/src/main.ts",
        "viewer/vite.config.ts",
        "test/fixtures/.gitkeep",
        "test/fixtures/time.ts",
        "test/integration/release/packaging.test.ts"
      ])
    );
    expect(packedPaths.every((path) => !path.startsWith("src/"))).toBe(true);
    expect(packedPaths.every((path) => !path.startsWith("scripts/"))).toBe(true);
    expect(packedPaths.every((path) => !path.startsWith("test/"))).toBe(true);
    expect(packedPaths.every((path) => !path.startsWith("viewer/"))).toBe(true);

    const packageJson = parsePackageJson(await readFile(join(repoRoot, "package.json"), "utf8"));

    expect(packageJson.license).toBe("MIT");
    expect(packageJson.engines?.node).toBe(">=22");
    expect(packageJson.bin).toEqual({
      aictx: "./dist/cli/main.js",
      "aictx-mcp": "./dist/mcp/server.js"
    });
    expect(packageJson.scripts?.build).toContain("pnpm build:viewer");
    expect(packageJson.scripts?.["build:viewer"]).toBe("vite build --config viewer/vite.config.ts");
    expect(packageJson.devDependencies).toEqual(
      expect.objectContaining({
        "@sveltejs/vite-plugin-svelte": expect.any(String),
        svelte: expect.any(String),
        "svelte-check": expect.any(String),
        vite: expect.any(String)
      })
    );
    expect(packageJson.dependencies ?? {}).not.toEqual(
      expect.objectContaining({
        "@sveltejs/vite-plugin-svelte": expect.any(String),
        svelte: expect.any(String),
        "svelte-check": expect.any(String),
        vite: expect.any(String)
      })
    );

    for (const requiredPath of requiredPackedPaths) {
      expect(packedPathSet.has(requiredPath)).toBe(true);
    }

    await expectSuccessfulCommand("pnpm", ["add", "--offline", pack.filename], installRoot);

    const aictxHelp = await expectSuccessfulCommand(
      installedBin("aictx", installRoot),
      ["--help"],
      installRoot
    );

    expect(aictxHelp.stderr).toBe("");
    expect(aictxHelp.stdout).toContain("Usage: aictx");
    expect(aictxHelp.stdout).toContain("Aictx project memory CLI");

    const started = await startInstalledMcpClient(installRoot);

    try {
      await expect(started.client.ping()).resolves.toEqual({});
      expect(started.client.getServerVersion()).toMatchObject({
        name: "aictx-mcp"
      });
    } finally {
      await started.close();
    }

    expect(started.stderr()).toBe("");
  }, 120_000);
});

const requiredPackedPaths = [
  "README.md",
  "LICENSE",
  "package.json",
  "dist/cli/main.js",
  "dist/mcp/server.js",
  "dist/schemas/config.schema.json",
  "dist/schemas/event.schema.json",
  "dist/schemas/object.schema.json",
  "dist/schemas/patch.schema.json",
  "dist/schemas/relation.schema.json",
  "dist/viewer/index.html",
  "docs/agent-integration.md",
  "integrations/templates/agent-guidance.md",
  "integrations/codex/aictx/SKILL.md",
  "integrations/claude/aictx/SKILL.md",
  "integrations/claude/aictx.md",
  "integrations/generic/aictx-agent-instructions.md"
];

async function expectSuccessfulCommand(
  command: string,
  args: readonly string[],
  cwd: string
): Promise<{ stdout: string; stderr: string }> {
  const result = await runSubprocess(command, args, { cwd });

  if (!result.ok) {
    throw new Error(result.error.message);
  }

  expect(result.data.exitCode).toBe(0);

  return {
    stdout: result.data.stdout,
    stderr: result.data.stderr
  };
}

function parsePnpmPackOutput(output: { stdout: string }): PnpmPackOutput {
  const parsed = JSON.parse(output.stdout) as unknown;

  if (!isPnpmPackOutput(parsed)) {
    throw new Error("Unexpected pnpm pack --json output.");
  }

  return parsed;
}

function isPnpmPackOutput(value: unknown): value is PnpmPackOutput {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.filename === "string" &&
    Array.isArray(value.files) &&
    value.files.every((file) => isRecord(file) && typeof file.path === "string")
  );
}

function parsePackageJson(contents: string): PackageJson {
  const parsed = JSON.parse(contents) as unknown;

  if (!isRecord(parsed)) {
    throw new Error("package.json must contain a JSON object.");
  }

  return parsed as PackageJson;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function startInstalledMcpClient(cwd: string): Promise<StartedMcpClient> {
  const transport = new StdioClientTransport({
    command: installedBin("aictx-mcp", cwd),
    cwd,
    stderr: "pipe"
  });
  const stderrChunks: string[] = [];
  const stderr = transport.stderr;

  if (stderr instanceof Readable) {
    stderr.setEncoding("utf8");
    stderr.on("data", (chunk: string) => {
      stderrChunks.push(chunk);
    });
  }

  const client = new Client({
    name: "aictx-release-test-client",
    version: "0.0.0"
  });

  await client.connect(transport);

  return {
    client,
    close: async () => {
      await client.close();
    },
    stderr: () => stderrChunks.join("")
  };
}

function installedBin(name: "aictx" | "aictx-mcp", installRoot: string): string {
  return join(installRoot, "node_modules", ".bin", executableName(name));
}

function executableName(name: string): string {
  return process.platform === "win32" ? `${name}.cmd` : name;
}

async function createTempRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  const resolvedRoot = await realpath(root);

  tempRoots.push(resolvedRoot);

  return resolvedRoot;
}
