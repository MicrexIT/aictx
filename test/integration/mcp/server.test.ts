import { mkdtemp, readdir, realpath, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Readable } from "node:stream";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterEach, describe, expect, it } from "vitest";

import { createAictxMcpServer } from "../../../src/mcp/server.js";
import { version } from "../../../src/generated/version.js";

const require = createRequire(import.meta.url);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const serverEntry = join(repoRoot, "src/mcp/server.ts");
const tsxLoader = pathToFileURL(require.resolve("tsx")).href;
const tempRoots: string[] = [];

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

describe("aictx MCP server bootstrap", () => {
  it("creates a project-scoped server context before connecting", async () => {
    const projectRoot = await createTempRoot("aictx-mcp-context-");
    const mcp = createAictxMcpServer({ cwd: projectRoot });

    expect(mcp.context.cwd).toBe(projectRoot);
    expect(mcp.server.isConnected()).toBe(false);
  });

  it("starts over stdio without non-protocol stdout or filesystem writes", async () => {
    const projectRoot = await createTempRoot("aictx-mcp-stdio-");
    const started = await startMcpClient(projectRoot);

    try {
      await expect(started.client.ping()).resolves.toEqual({});
      expect(started.client.getServerVersion()).toEqual({
        name: "aictx-mcp",
        version
      });
      expect(started.client.getServerCapabilities()).toEqual({
        tools: {
          listChanged: true
        }
      });
    } finally {
      await started.close();
    }

    expect(started.stderr()).toBe("");
    await expect(readdir(projectRoot)).resolves.toEqual([]);
  });

  it("exposes only normalized Aictx tools and no CLI-only, shell, or filesystem tools", async () => {
    const projectRoot = await createTempRoot("aictx-mcp-tools-");
    const started = await startMcpClient(projectRoot);

    try {
      await expect(started.client.ping()).resolves.toEqual({});

      const result = await started.client.listTools();
      const toolNames = result.tools.map((tool) => tool.name).sort();

      expect(toolNames).toEqual([
        "diff_memory",
        "load_memory",
        "save_memory_patch",
        "search_memory"
      ]);
      expect(toolNames).not.toEqual(
        expect.arrayContaining([
          "init",
          "check",
          "rebuild",
          "history",
          "restore",
          "rewind",
          "inspect",
          "stale",
          "graph",
          "export",
          "shell",
          "run_shell",
          "execute_command",
          "read_file",
          "write_file",
          "filesystem",
          "create_object",
          "update_object",
          "delete_object",
          "create_relation",
          "update_relation",
          "delete_relation"
        ])
      );
    } finally {
      await started.close();
    }

    expect(started.stderr()).toBe("");
    await expect(readdir(projectRoot)).resolves.toEqual([]);
  });
});

async function startMcpClient(cwd: string): Promise<StartedMcpClient> {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["--import", tsxLoader, serverEntry],
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
    name: "aictx-mcp-test-client",
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

async function createTempRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  const resolvedRoot = await realpath(root);
  tempRoots.push(resolvedRoot);
  return resolvedRoot;
}
