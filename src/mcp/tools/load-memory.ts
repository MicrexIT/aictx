import type { CallToolResult, ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import {
  loadMemory,
  type AppResult,
  type LoadMemoryOptions
} from "../../app/operations.js";
import type { LoadMemoryData, LoadMemorySource } from "../../context/compile.js";
import type { ObjectId } from "../../core/types.js";

interface AictxMcpContext {
  cwd: string;
}

type CliBudgetStatus = "not_requested" | "within_target" | "over_target";

interface CliLoadMemoryData {
  task: string;
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
      .describe("Optional context compiler mode. Defaults to coding.")
  })
  .strict();

type LoadMemoryArgs = z.infer<typeof LOAD_MEMORY_INPUT_SCHEMA>;

const READ_ONLY_TOOL_ANNOTATIONS: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false
};

export const loadMemoryTool = {
  name: "load_memory",
  title: "Load Aictx Memory",
  description: "Compile task-specific Aictx memory into a context pack.",
  inputSchema: LOAD_MEMORY_INPUT_SCHEMA,
  annotations: READ_ONLY_TOOL_ANNOTATIONS,
  call: callLoadMemoryTool
};

async function callLoadMemoryTool(
  context: AictxMcpContext,
  args: LoadMemoryArgs
): Promise<CallToolResult> {
  const parsed = parseLoadMemoryArgs(context, args);
  const result = await loadMemory(parsed.options);

  return toToolResult(cliLoadResult(result, parsed.hasExplicitTokenBudget));
}

function parseLoadMemoryArgs(
  context: AictxMcpContext,
  args: LoadMemoryArgs
): {
  options: LoadMemoryOptions;
  hasExplicitTokenBudget: boolean;
} {
  const options: LoadMemoryOptions = {
    cwd: context.cwd,
    task: args.task
  };
  const hasExplicitTokenBudget = args.token_budget !== undefined;

  if (args.token_budget !== undefined) {
    options.token_budget = args.token_budget;
  }

  if (args.mode !== undefined) {
    options.mode = args.mode;
  }

  return {
    options,
    hasExplicitTokenBudget
  };
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

function toToolResult(envelope: object): CallToolResult {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(envelope)
      }
    ],
    structuredContent: envelope as Record<string, unknown>
  };
}
