import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import {
  dataAccessService,
  type DataAccessSearchInput
} from "../../data-access/index.js";
import type { RetrievalHints } from "../../retrieval/hints.js";
import {
  PROJECT_ROOT_ARGUMENT_DESCRIPTION,
  resolveMcpProjectCwd,
  type AictxMcpContext,
  type ProjectScopedMcpArgs
} from "../context.js";
import {
  READ_ONLY_TOOL_ANNOTATIONS,
  toMcpToolResult
} from "./shared.js";

const RETRIEVAL_HINTS_SCHEMA = z
  .object({
    files: z.array(z.string()).optional(),
    changed_files: z.array(z.string()).optional(),
    symbols: z.array(z.string()).optional(),
    subsystems: z.array(z.string()).optional(),
    history_window: z.string().optional()
  })
  .strict();

const SEARCH_MEMORY_INPUT_SCHEMA = z
  .object({
    query: z.string().describe("Search query."),
    limit: z
      .number()
      .optional()
      .describe("Optional maximum number of matches to return."),
    hints: RETRIEVAL_HINTS_SCHEMA.optional().describe(
      "Optional retrieval hints for files, changed_files, symbols, subsystems, and history_window."
    ),
    project_root: z
      .string()
      .optional()
      .describe(PROJECT_ROOT_ARGUMENT_DESCRIPTION)
  })
  .strict();

type SearchMemoryArgs = z.infer<typeof SEARCH_MEMORY_INPUT_SCHEMA> & ProjectScopedMcpArgs;

export const searchMemoryTool = {
  name: "search_memory",
  title: "Search Aictx Memory",
  description: "Search local Aictx memory using the generated SQLite index.",
  inputSchema: SEARCH_MEMORY_INPUT_SCHEMA,
  annotations: READ_ONLY_TOOL_ANNOTATIONS,
  call: callSearchMemoryTool
};

async function callSearchMemoryTool(
  context: AictxMcpContext,
  args: SearchMemoryArgs
): Promise<CallToolResult> {
  const result = await dataAccessService.search(parseSearchMemoryArgs(context, args));

  return toMcpToolResult(result);
}

function parseSearchMemoryArgs(
  context: AictxMcpContext,
  args: SearchMemoryArgs
): DataAccessSearchInput {
  const options: DataAccessSearchInput = {
    target: {
      kind: "cwd",
      cwd: resolveMcpProjectCwd(context, args)
    },
    query: args.query
  };

  if (args.limit !== undefined) {
    options.limit = args.limit;
  }

  if (args.hints !== undefined) {
    options.hints = compactRetrievalHints(args.hints);
  }

  return options;
}

function compactRetrievalHints(value: z.infer<typeof RETRIEVAL_HINTS_SCHEMA>): RetrievalHints {
  const hints: RetrievalHints = {};

  if (value.files !== undefined) {
    hints.files = value.files;
  }

  if (value.changed_files !== undefined) {
    hints.changed_files = value.changed_files;
  }

  if (value.symbols !== undefined) {
    hints.symbols = value.symbols;
  }

  if (value.subsystems !== undefined) {
    hints.subsystems = value.subsystems;
  }

  if (value.history_window !== undefined) {
    hints.history_window = value.history_window;
  }

  return hints;
}
