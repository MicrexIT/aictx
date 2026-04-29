import { CommanderError, type Command } from "commander";

import {
  getViewerBootstrap,
  type AppResult
} from "../../app/operations.js";
import { aictxError, type AictxError } from "../../core/errors.js";
import { err, ok, type Result } from "../../core/result.js";
import { runSubprocess } from "../../core/subprocess.js";
import {
  startViewerServer,
  type StartedViewerServer
} from "../../viewer/server.js";
import { CLI_EXIT_SUCCESS, type CliExitCode } from "../exit.js";
import { renderAppResult } from "../render.js";

type CliOutputWriter = (text: string) => void;

export type ViewerUrlOpener = (url: string) => Promise<void> | void;

export interface RegisterViewCommandOptions {
  cwd: string;
  stdout: CliOutputWriter;
  stderr: CliOutputWriter;
  assetsDir?: string;
  opener?: ViewerUrlOpener;
  shutdownSignal?: AbortSignal;
}

export interface ViewServerData {
  url: string;
  host: string;
  port: number;
  token_required: true;
  open_attempted: boolean;
}

interface ViewCommandFlags {
  port?: string;
  open?: boolean;
}

export function registerViewCommand(
  program: Command,
  options: RegisterViewCommandOptions
): void {
  program
    .command("view")
    .description("Start the local read-only Aictx memory viewer.")
    .option("--port <number>", "Port to bind on 127.0.0.1.")
    .option("--open", "Open the viewer URL in the default browser.")
    .action(async (flags: ViewCommandFlags, command: Command) => {
      const preflight = await getViewerBootstrap({ cwd: options.cwd });

      if (!preflight.ok) {
        renderAndThrowOnFailure(preflight, command, options);
        return;
      }

      const port = parsePort(flags.port);

      if (!port.ok) {
        renderAndThrowOnFailure(errorResult(port.error, preflight), command, options);
        return;
      }

      const started = await startViewerServer({
        cwd: options.cwd,
        ...(port.data === undefined ? {} : { port: port.data }),
        ...(options.assetsDir === undefined ? {} : { assetsDir: options.assetsDir })
      });

      if (!started.ok) {
        renderAndThrowOnFailure(errorResult(started.error, preflight), command, options);
        return;
      }

      const openAttempted = flags.open === true;
      const openWarnings = openAttempted
        ? await openViewer(started.data.url, options.opener)
        : [];
      const result: AppResult<ViewServerData> = {
        ok: true,
        data: {
          url: started.data.url,
          host: started.data.host,
          port: started.data.port,
          token_required: true,
          open_attempted: openAttempted
        },
        warnings: [...preflight.warnings, ...openWarnings],
        meta: preflight.meta
      };
      const rendered = renderAppResult(result, {
        json: isJsonMode(command),
        renderData: renderViewData
      });

      options.stdout(rendered.stdout);
      options.stderr(rendered.stderr);
      await waitForShutdown(started.data, options.shutdownSignal);
    });
}

function renderAndThrowOnFailure(
  result: AppResult<ViewServerData>,
  command: Command,
  options: RegisterViewCommandOptions
): void {
  const rendered = renderAppResult(result, {
    json: isJsonMode(command),
    renderData: renderViewData
  });

  options.stdout(rendered.stdout);
  options.stderr(rendered.stderr);

  if (rendered.exitCode !== CLI_EXIT_SUCCESS) {
    throwCommandFailed(rendered.exitCode);
  }
}

function errorResult(
  error: AictxError,
  preflight: Extract<AppResult<unknown>, { ok: true }>
): AppResult<ViewServerData> {
  return {
    ok: false,
    error,
    warnings: preflight.warnings,
    meta: preflight.meta
  };
}

function parsePort(value: string | undefined): Result<number | undefined> {
  if (value === undefined) {
    return ok(undefined);
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    return err(
      aictxError("AICtxValidationFailed", "Viewer port must be an integer from 1 to 65535.", {
        port: value
      })
    );
  }

  return ok(parsed);
}

function renderViewData(data: ViewServerData): string {
  return `Aictx viewer: ${data.url}`;
}

function isJsonMode(command: Command): boolean {
  const options = command.optsWithGlobals() as { json?: unknown };
  return options.json === true;
}

async function openViewer(
  url: string,
  opener: ViewerUrlOpener | undefined
): Promise<string[]> {
  try {
    if (opener !== undefined) {
      await opener(url);
      return [];
    }

    await openWithDefaultBrowser(url);
    return [];
  } catch (error) {
    return [`Viewer server started, but the browser could not be opened: ${messageFromUnknown(error)}`];
  }
}

async function openWithDefaultBrowser(url: string): Promise<void> {
  const command = browserOpenCommand(url);
  const result = await runSubprocess(command.command, command.args);

  if (!result.ok) {
    throw new Error(result.error.message);
  }

  if (result.data.exitCode !== 0) {
    throw new Error(result.data.stderr.trim() || `exit code ${result.data.exitCode}`);
  }
}

function browserOpenCommand(url: string): { command: string; args: string[] } {
  if (process.platform === "darwin") {
    return { command: "open", args: [url] };
  }

  if (process.platform === "win32") {
    return { command: "cmd", args: ["/c", "start", "", url] };
  }

  return { command: "xdg-open", args: [url] };
}

function waitForShutdown(
  server: StartedViewerServer,
  shutdownSignal: AbortSignal | undefined
): Promise<void> {
  if (shutdownSignal === undefined) {
    return new Promise(() => {
      // Keep the CLI action alive while the HTTP server owns the process lifetime.
    });
  }

  if (shutdownSignal.aborted) {
    return server.close();
  }

  return new Promise((resolve, reject) => {
    shutdownSignal.addEventListener(
      "abort",
      () => {
        server.close().then(resolve, reject);
      },
      { once: true }
    );
  });
}

function throwCommandFailed(exitCode: CliExitCode): never {
  throw new CommanderError(
    exitCode,
    "aictx.command.failed",
    "Aictx command failed."
  );
}

function messageFromUnknown(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
