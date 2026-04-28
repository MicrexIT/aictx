#!/usr/bin/env node

import type { Readable, Writable } from "node:stream";
import { resolve } from "node:path";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
  type CallToolResult,
  type Tool
} from "@modelcontextprotocol/sdk/types.js";

import { version } from "../generated/version.js";
import { diffMemoryTool } from "./tools/diff-memory.js";
import { loadMemoryTool } from "./tools/load-memory.js";
import { saveMemoryPatchTool } from "./tools/save-memory-patch.js";
import { searchMemoryTool } from "./tools/search-memory.js";

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

interface AictxMcpTool {
  name: string;
  title: string;
  description: string;
  inputSchema: Tool["inputSchema"];
  annotations: Tool["annotations"];
  call: (
    context: AictxMcpContext,
    args: Record<string, unknown>
  ) => Promise<CallToolResult>;
}

const TOOLS: AictxMcpTool[] = [
  loadMemoryTool,
  searchMemoryTool,
  saveMemoryPatchTool,
  diffMemoryTool
];

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

function registerTools(mcp: AictxMcpServer): void {
  const toolsByName = new Map(TOOLS.map((tool) => [tool.name, tool]));

  mcp.server.server.registerCapabilities({
    tools: {
      listChanged: true
    }
  });

  mcp.server.server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: TOOLS.map((tool) => ({
      name: tool.name,
      title: tool.title,
      description: tool.description,
      inputSchema: tool.inputSchema,
      annotations: tool.annotations
    }))
  }));

  mcp.server.server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const tool = toolsByName.get(request.params.name);

    if (tool === undefined) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Tool ${request.params.name} not found.`
      );
    }

    return tool.call(mcp.context, request.params.arguments ?? {});
  });
}
