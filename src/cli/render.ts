import type { AppResult } from "../app/operations.js";
import type { MemoryError } from "../core/errors.js";
import {
  CLI_EXIT_SUCCESS,
  exitCodeForMemoryError,
  type CliExitCode
} from "./exit.js";

export interface RenderedCliOutput {
  stdout: string;
  stderr: string;
  exitCode: CliExitCode;
}

export interface RenderAppResultOptions<T> {
  json: boolean;
  renderData?: (data: T) => string;
}

export function renderAppResult<T>(
  result: AppResult<T>,
  options: RenderAppResultOptions<T>
): RenderedCliOutput {
  if (options.json) {
    return {
      stdout: `${JSON.stringify(result)}\n`,
      stderr: "",
      exitCode: result.ok ? CLI_EXIT_SUCCESS : exitCodeForMemoryError(result.error)
    };
  }

  const warnings = renderWarnings(result.warnings);

  if (!result.ok) {
    return {
      stdout: "",
      stderr: `${warnings}${renderError(result.error)}`,
      exitCode: exitCodeForMemoryError(result.error)
    };
  }

  const body = options.renderData?.(result.data) ?? "";

  return {
    stdout: body === "" || body.endsWith("\n") ? body : `${body}\n`,
    stderr: warnings,
    exitCode: CLI_EXIT_SUCCESS
  };
}

function renderWarnings(warnings: readonly string[]): string {
  if (warnings.length === 0) {
    return "";
  }

  return `${warnings.map((warning) => `warning: ${warning}`).join("\n")}\n`;
}

function renderError(error: MemoryError): string {
  return `error: ${error.code}: ${error.message}\n`;
}
