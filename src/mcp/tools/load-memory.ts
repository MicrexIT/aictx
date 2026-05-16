import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import {
  type AppResult,
  dataAccessService,
  type DataAccessLoadInput
} from "../../data-access/index.js";
import type { LoadMemoryData, LoadMemorySource } from "../../context/compile.js";
import type { LoadMemoryMode } from "../../context/modes.js";
import type { ObjectId } from "../../core/types.js";
import type { RetrievalHints } from "../../retrieval/hints.js";
import {
  PROJECT_ROOT_ARGUMENT_DESCRIPTION,
  resolveMcpProjectCwd,
  type MemoryMcpContext,
  type ProjectScopedMcpArgs
} from "../context.js";
import {
  READ_ONLY_TOOL_ANNOTATIONS,
  toMcpToolResult
} from "./shared.js";

type CliBudgetStatus = "not_requested" | "within_target" | "over_target";

const RETRIEVAL_HINTS_SCHEMA = z
  .object({
    files: z.array(z.string()).optional(),
    changed_files: z.array(z.string()).optional(),
    symbols: z.array(z.string()).optional(),
    subsystems: z.array(z.string()).optional(),
    history_window: z.string().optional()
  })
  .strict();

interface CliLoadMemoryData {
  task: string;
  mode: LoadMemoryMode;
  token_budget: number | null;
  context_pack: string;
  token_target: number | null;
  estimated_tokens: number;
  budget_status: CliBudgetStatus;
  truncated: boolean;
  source: LoadMemorySource;
  included_ids: ObjectId[];
  excluded_ids: ObjectId[];
  omitted_ids: ObjectId[];
}

const LOAD_MEMORY_INPUT_SCHEMA = z
  .object({
    task: z.string().describe("Task description to compile context for."),
    token_budget: z
      .number()
      .optional()
      .describe("Optional advisory token target for context packaging."),
    mode: z
      .string()
      .optional()
      .describe("Optional context compiler mode. Defaults to coding."),
    hints: RETRIEVAL_HINTS_SCHEMA.optional().describe(
      "Optional retrieval hints for files, changed_files, symbols, subsystems, and history_window."
    ),
    project_root: z
      .string()
      .optional()
      .describe(PROJECT_ROOT_ARGUMENT_DESCRIPTION)
  })
  .strict();

type LoadMemoryArgs = z.infer<typeof LOAD_MEMORY_INPUT_SCHEMA> & ProjectScopedMcpArgs;

export const loadMemoryTool = {
  name: "load_memory",
  title: "Load Memory",
  description: "Compile task-specific Memory into a context pack.",
  inputSchema: LOAD_MEMORY_INPUT_SCHEMA,
  annotations: READ_ONLY_TOOL_ANNOTATIONS,
  call: callLoadMemoryTool
};

async function callLoadMemoryTool(
  context: MemoryMcpContext,
  args: LoadMemoryArgs
): Promise<CallToolResult> {
  const parsed = parseLoadMemoryArgs(context, args);
  const result = await dataAccessService.load(parsed.options);

  return toMcpToolResult(cliLoadResult(result, parsed.hasExplicitTokenBudget));
}

function parseLoadMemoryArgs(
  context: MemoryMcpContext,
  args: LoadMemoryArgs
): {
  options: DataAccessLoadInput;
  hasExplicitTokenBudget: boolean;
} {
  const options: DataAccessLoadInput = {
    target: {
      kind: "cwd",
      cwd: resolveMcpProjectCwd(context, args)
    },
    task: args.task
  };
  const hasExplicitTokenBudget = args.token_budget !== undefined;

  if (args.token_budget !== undefined) {
    options.token_budget = args.token_budget;
  }

  if (args.mode !== undefined) {
    options.mode = args.mode;
  }

  if (args.hints !== undefined) {
    options.hints = compactRetrievalHints(args.hints);
  }

  return {
    options,
    hasExplicitTokenBudget
  };
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

function cliLoadResult(
  result: AppResult<LoadMemoryData>,
  hasExplicitTokenBudget: boolean
): AppResult<CliLoadMemoryData> {
  if (!result.ok) {
    return result;
  }

  return {
    ok: true,
    data: {
      task: result.data.task,
      mode: result.data.mode,
      token_budget: hasExplicitTokenBudget ? result.data.token_budget : null,
      context_pack: result.data.context_pack,
      token_target: hasExplicitTokenBudget ? result.data.token_target.value : null,
      estimated_tokens: result.data.estimated_tokens,
      budget_status: hasExplicitTokenBudget
        ? result.data.budget_status
        : "not_requested",
      truncated: result.data.truncated,
      source: result.data.source,
      included_ids: result.data.included_ids,
      excluded_ids: result.data.excluded_ids,
      omitted_ids: result.data.omitted_ids
    },
    warnings: result.warnings,
    meta: result.meta
  };
}
