import { spawn } from "node:child_process";

import { memoryError } from "./errors.js";
import { err, ok, type Result } from "./result.js";

export interface SubprocessResult {
  command: string;
  args: readonly string[];
  cwd: string | null;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
}

export interface SubprocessRunnerOptions {
  cwd?: string;
  input?: string;
  env?: NodeJS.ProcessEnv;
}

export type SubprocessRunner = (
  command: string,
  args: readonly string[],
  options: SubprocessRunnerOptions
) => Promise<SubprocessResult>;

export interface RunSubprocessOptions extends SubprocessRunnerOptions {
  runner?: SubprocessRunner;
}

export async function runSubprocess(
  command: string,
  args: readonly string[],
  options: RunSubprocessOptions = {}
): Promise<Result<SubprocessResult>> {
  const runnerOptions = toRunnerOptions(options);

  try {
    if (options.runner !== undefined) {
      return ok(await options.runner(command, args, runnerOptions));
    }

    return ok(await spawnSubprocess(command, args, runnerOptions));
  } catch (error) {
    return err(
      memoryError("MemoryInternalError", "Subprocess execution failed.", {
        command,
        message: messageFromUnknown(error)
      })
    );
  }
}

function spawnSubprocess(
  command: string,
  args: readonly string[],
  options: SubprocessRunnerOptions
): Promise<SubprocessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, [...args], {
      cwd: options.cwd,
      env: options.env,
      shell: false,
      stdio: ["pipe", "pipe", "pipe"]
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    child.stdout.on("data", (chunk: Buffer) => {
      stdoutChunks.push(chunk);
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderrChunks.push(chunk);
    });

    child.on("error", reject);

    child.on("close", (exitCode, signal) => {
      resolve({
        command,
        args,
        cwd: options.cwd ?? null,
        exitCode,
        signal,
        stdout: Buffer.concat(stdoutChunks).toString("utf8"),
        stderr: Buffer.concat(stderrChunks).toString("utf8")
      });
    });

    if (options.input !== undefined) {
      child.stdin.end(options.input, "utf8");
    } else {
      child.stdin.end();
    }
  });
}

function toRunnerOptions(options: RunSubprocessOptions): SubprocessRunnerOptions {
  const runnerOptions: SubprocessRunnerOptions = {};

  if (options.cwd !== undefined) {
    runnerOptions.cwd = options.cwd;
  }

  if (options.input !== undefined) {
    runnerOptions.input = options.input;
  }

  if (options.env !== undefined) {
    runnerOptions.env = options.env;
  }

  return runnerOptions;
}

function messageFromUnknown(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
