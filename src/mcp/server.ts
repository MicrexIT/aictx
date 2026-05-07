#!/usr/bin/env node

import { realpathSync } from "node:fs";
import type { Readable, Writable } from "node:stream";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { version } from "../generated/version.js";
import type { AictxMcpContext } from "./context.js";
import { diffMemoryTool } from "./tools/diff-memory.js";
import { inspectMemoryTool } from "./tools/inspect-memory.js";
import { loadMemoryTool } from "./tools/load-memory.js";
import { rememberMemoryTool } from "./tools/remember-memory.js";
import { saveMemoryPatchTool } from "./tools/save-memory-patch.js";
import { searchMemoryTool } from "./tools/search-memory.js";

export interface AictxMcpServer {
  context: AictxMcpContext;
  server: McpServer;
}

export interface CreateAictxMcpServerOptions {
  cwd?: string;
}

export interface StartMcpServerOptions extends CreateAictxMcpServerOptions {
  stdin?: Readable;
  stdout?: Writable;
}

export interface AictxMcpMainOptions extends StartMcpServerOptions {
  stderr?: Writable;
  startServer?: (options: StartMcpServerOptions) => Promise<AictxMcpServer>;
}

export function createAictxMcpServer(
  options: CreateAictxMcpServerOptions = {}
): AictxMcpServer {
  const context: AictxMcpContext = {
    cwd: resolve(options.cwd ?? process.cwd())
  };
  const server = new McpServer({
    name: "aictx-mcp",
    version
  });
  const mcp = {
    context,
    server
  };

  registerTools(mcp);

  return mcp;
}

export async function startMcpServer(
  options: StartMcpServerOptions = {}
): Promise<AictxMcpServer> {
  const mcp = createAictxMcpServer(options);
  const transport = new StdioServerTransport(options.stdin, options.stdout);

  await mcp.server.connect(transport);

  return mcp;
}

export async function main(options: AictxMcpMainOptions = {}): Promise<void> {
  const startServer = options.startServer ?? startMcpServer;
  const startOptions = toStartMcpServerOptions(options);

  try {
    await startServer(startOptions);
  } catch (error: unknown) {
    writeStartupFailure(error, {
      cwd: resolve(options.cwd ?? process.cwd()),
      stderr: options.stderr ?? process.stderr,
      debug: process.env.AICTX_DEBUG === "1"
    });
    throw error;
  }
}

if (isEntrypoint()) {
  await main().catch(() => {
    process.exitCode = 1;
  });
}

function isEntrypoint(): boolean {
  const argvPath = process.argv[1];

  if (argvPath === undefined) {
    return false;
  }

  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(argvPath);
  } catch {
    return fileURLToPath(import.meta.url) === argvPath;
  }
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    const name = error.name.length > 0 ? error.name : "Error";

    return `${name}: ${error.message}`;
  }

  return String(error);
}

interface StartupFailureOptions {
  cwd: string;
  stderr: Writable;
  debug: boolean;
}

function toStartMcpServerOptions(options: AictxMcpMainOptions): StartMcpServerOptions {
  const startOptions: StartMcpServerOptions = {};

  if (options.cwd !== undefined) {
    startOptions.cwd = options.cwd;
  }

  if (options.stdin !== undefined) {
    startOptions.stdin = options.stdin;
  }

  if (options.stdout !== undefined) {
    startOptions.stdout = options.stdout;
  }

  return startOptions;
}

function writeStartupFailure(error: unknown, options: StartupFailureOptions): void {
  const lines = [
    "Aictx MCP server failed to start.",
    `cwd: ${options.cwd}`,
    `error: ${formatError(error)}`
  ];

  if (options.debug && error instanceof Error && error.stack !== undefined) {
    lines.push("stack:");
    lines.push(error.stack);
  }

  options.stderr.write(`${lines.join("\n")}\n`);
}

function registerTools(mcp: AictxMcpServer): void {
  mcp.server.registerTool(
    loadMemoryTool.name,
    {
      title: loadMemoryTool.title,
      description: loadMemoryTool.description,
      inputSchema: loadMemoryTool.inputSchema,
      annotations: loadMemoryTool.annotations
    },
    (args) => loadMemoryTool.call(mcp.context, args)
  );
  mcp.server.registerTool(
    searchMemoryTool.name,
    {
      title: searchMemoryTool.title,
      description: searchMemoryTool.description,
      inputSchema: searchMemoryTool.inputSchema,
      annotations: searchMemoryTool.annotations
    },
    (args) => searchMemoryTool.call(mcp.context, args)
  );
  mcp.server.registerTool(
    inspectMemoryTool.name,
    {
      title: inspectMemoryTool.title,
      description: inspectMemoryTool.description,
      inputSchema: inspectMemoryTool.inputSchema,
      annotations: inspectMemoryTool.annotations
    },
    (args) => inspectMemoryTool.call(mcp.context, args)
  );
  mcp.server.registerTool(
    saveMemoryPatchTool.name,
    {
      title: saveMemoryPatchTool.title,
      description: saveMemoryPatchTool.description,
      inputSchema: saveMemoryPatchTool.inputSchema,
      annotations: saveMemoryPatchTool.annotations
    },
    (args) => saveMemoryPatchTool.call(mcp.context, args)
  );
  mcp.server.registerTool(
    rememberMemoryTool.name,
    {
      title: rememberMemoryTool.title,
      description: rememberMemoryTool.description,
      inputSchema: rememberMemoryTool.inputSchema,
      annotations: rememberMemoryTool.annotations
    },
    (args) => rememberMemoryTool.call(mcp.context, args)
  );
  mcp.server.registerTool(
    diffMemoryTool.name,
    {
      title: diffMemoryTool.title,
      description: diffMemoryTool.description,
      inputSchema: diffMemoryTool.inputSchema,
      annotations: diffMemoryTool.annotations
    },
    (args) => diffMemoryTool.call(mcp.context, args)
  );
}
