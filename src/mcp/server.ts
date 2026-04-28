#!/usr/bin/env node

import type { Readable, Writable } from "node:stream";
import { resolve } from "node:path";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { version } from "../generated/version.js";

export interface AictxMcpContext {
  cwd: string;
}

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

  return {
    context,
    server
  };
}

export async function startMcpServer(
  options: StartMcpServerOptions = {}
): Promise<AictxMcpServer> {
  const mcp = createAictxMcpServer(options);
  const transport = new StdioServerTransport(options.stdin, options.stdout);

  await mcp.server.connect(transport);

  return mcp;
}

export async function main(options: StartMcpServerOptions = {}): Promise<void> {
  await startMcpServer(options);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main().catch((error: unknown) => {
    process.stderr.write(`Aictx MCP server failed to start: ${formatError(error)}\n`);
    process.exitCode = 1;
  });
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
