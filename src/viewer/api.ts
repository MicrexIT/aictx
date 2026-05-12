import type { IncomingMessage, ServerResponse } from "node:http";

import {
  deleteViewerProject,
  exportObsidianProjection,
  exportViewerProjectObsidian,
  getViewerProjectBootstrap,
  getViewerBootstrap,
  getViewerProjects,
  type AppResult,
  type ExportObsidianProjectionData,
  type ViewerBootstrapData,
  type ViewerProjectDeleteData,
  type ViewerProjectsData
} from "../app/operations.js";
import { aictxError, type AictxError, type JsonValue } from "../core/errors.js";
import { err, ok, type Result } from "../core/result.js";

const MAX_API_BODY_BYTES = 64 * 1024;

export interface ViewerApiContext {
  cwd: string;
  token: string;
  aictxHome?: string;
}

type ViewerApiResult =
  | AppResult<ViewerBootstrapData>
  | AppResult<ViewerProjectsData>
  | AppResult<ViewerProjectDeleteData>
  | AppResult<ExportObsidianProjectionData>;

export async function handleViewerApiRequest(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  context: ViewerApiContext
): Promise<void> {
  if (!isAuthorizedApiRequest(request, url, context.token)) {
    writeViewerJsonResponse(response, 401, viewerErrorBody(
      aictxError("AICtxValidationFailed", "Viewer API token is required.")
    ));
    return;
  }

  if (url.pathname === "/api/bootstrap") {
    await handleBootstrapRequest(request, response, context);
    return;
  }

  if (url.pathname === "/api/projects") {
    await handleProjectsRequest(request, response, context);
    return;
  }

  const projectDelete = matchProjectDeleteRoute(url.pathname);

  if (projectDelete !== null) {
    await handleProjectDeleteRequest(request, response, context, projectDelete);
    return;
  }

  const projectBootstrap = matchProjectRoute(url.pathname, "bootstrap");

  if (projectBootstrap !== null) {
    await handleProjectBootstrapRequest(request, response, context, projectBootstrap);
    return;
  }

  const projectExport = matchProjectRoute(url.pathname, "export/obsidian");

  if (projectExport !== null) {
    await handleProjectExportObsidianRequest(request, response, context, projectExport);
    return;
  }

  if (url.pathname === "/api/export/obsidian") {
    await handleExportObsidianRequest(request, response, context);
    return;
  }

  writeViewerJsonResponse(response, 404, viewerErrorBody(
    aictxError("AICtxValidationFailed", "Viewer API route is not supported.", {
      path: url.pathname
    })
  ));
}

export function writeViewerJsonResponse(
  response: ServerResponse,
  statusCode: number,
  body: JsonValue
): void {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(`${JSON.stringify(body)}\n`);
}

export function viewerErrorBody(error: AictxError): JsonValue {
  return {
    ok: false,
    error: error as unknown as JsonValue,
    warnings: []
  };
}

function isAuthorizedApiRequest(
  request: IncomingMessage,
  url: URL,
  token: string
): boolean {
  if (url.searchParams.get("token") === token) {
    return true;
  }

  const authorization = request.headers.authorization;

  return typeof authorization === "string" && authorization === `Bearer ${token}`;
}

async function handleBootstrapRequest(
  request: IncomingMessage,
  response: ServerResponse,
  context: ViewerApiContext
): Promise<void> {
  if (request.method !== "GET") {
    writeMethodNotAllowed(response, "GET");
    return;
  }

  const result = await getViewerBootstrap({ cwd: context.cwd });
  writeAppResult(response, result);
}

async function handleProjectsRequest(
  request: IncomingMessage,
  response: ServerResponse,
  context: ViewerApiContext
): Promise<void> {
  if (request.method !== "GET") {
    writeMethodNotAllowed(response, "GET");
    return;
  }

  const result = await getViewerProjects({
    cwd: context.cwd,
    ...(context.aictxHome === undefined ? {} : { aictxHome: context.aictxHome })
  });
  writeAppResult(response, result);
}

async function handleProjectBootstrapRequest(
  request: IncomingMessage,
  response: ServerResponse,
  context: ViewerApiContext,
  registryId: string
): Promise<void> {
  if (request.method !== "GET") {
    writeMethodNotAllowed(response, "GET");
    return;
  }

  const result = await getViewerProjectBootstrap({
    cwd: context.cwd,
    registryId,
    ...(context.aictxHome === undefined ? {} : { aictxHome: context.aictxHome })
  });
  writeAppResult(response, result);
}

async function handleProjectDeleteRequest(
  request: IncomingMessage,
  response: ServerResponse,
  context: ViewerApiContext,
  registryId: string
): Promise<void> {
  if (request.method !== "DELETE") {
    writeMethodNotAllowed(response, "DELETE");
    return;
  }

  const result = await deleteViewerProject({
    cwd: context.cwd,
    registryId,
    ...(context.aictxHome === undefined ? {} : { aictxHome: context.aictxHome })
  });
  writeAppResult(response, result);
}

async function handleExportObsidianRequest(
  request: IncomingMessage,
  response: ServerResponse,
  context: ViewerApiContext
): Promise<void> {
  if (request.method !== "POST") {
    writeMethodNotAllowed(response, "POST");
    return;
  }

  const body = await readJsonBody(request);

  if (!body.ok) {
    writeViewerJsonResponse(response, 400, viewerErrorBody(body.error));
    return;
  }

  const outDir = parseExportOutDir(body.data);

  if (!outDir.ok) {
    writeViewerJsonResponse(response, 400, viewerErrorBody(outDir.error));
    return;
  }

  const result = await exportObsidianProjection({
    cwd: context.cwd,
    ...(outDir.data === undefined ? {} : { outDir: outDir.data })
  });

  writeAppResult(response, result);
}

async function handleProjectExportObsidianRequest(
  request: IncomingMessage,
  response: ServerResponse,
  context: ViewerApiContext,
  registryId: string
): Promise<void> {
  if (request.method !== "POST") {
    writeMethodNotAllowed(response, "POST");
    return;
  }

  const body = await readJsonBody(request);

  if (!body.ok) {
    writeViewerJsonResponse(response, 400, viewerErrorBody(body.error));
    return;
  }

  const outDir = parseExportOutDir(body.data);

  if (!outDir.ok) {
    writeViewerJsonResponse(response, 400, viewerErrorBody(outDir.error));
    return;
  }

  const result = await exportViewerProjectObsidian({
    cwd: context.cwd,
    registryId,
    ...(outDir.data === undefined ? {} : { outDir: outDir.data }),
    ...(context.aictxHome === undefined ? {} : { aictxHome: context.aictxHome })
  });

  writeAppResult(response, result);
}

function writeMethodNotAllowed(response: ServerResponse, allow: string): void {
  response.setHeader("Allow", allow);
  writeViewerJsonResponse(response, 405, viewerErrorBody(
    aictxError("AICtxValidationFailed", "HTTP method is not supported for this route.", {
      allow
    })
  ));
}

function writeAppResult(response: ServerResponse, result: ViewerApiResult): void {
  writeViewerJsonResponse(response, statusCodeForAppResult(result), result as unknown as JsonValue);
}

function statusCodeForAppResult(result: ViewerApiResult): number {
  if (result.ok) {
    return 200;
  }

  switch (result.error.code) {
    case "AICtxNotInitialized":
    case "AICtxAlreadyInitializedInvalid":
    case "AICtxUnsupportedStorageVersion":
    case "AICtxConflictDetected":
    case "AICtxDirtyMemory":
    case "AICtxIndexUnavailable":
    case "AICtxLockBusy":
    case "AICtxGitRequired":
      return 412;
    case "AICtxObjectNotFound":
    case "AICtxRelationNotFound":
      return 404;
    case "AICtxInternalError":
    case "AICtxGitOperationFailed":
      return 500;
    default:
      return 400;
  }
}

function matchProjectRoute(pathname: string, suffix: string): string | null {
  const prefix = "/api/projects/";

  if (!pathname.startsWith(prefix) || !pathname.endsWith(`/${suffix}`)) {
    return null;
  }

  const encoded = pathname.slice(prefix.length, pathname.length - suffix.length - 1);

  try {
    const registryId = decodeURIComponent(encoded);
    return registryId === "" || registryId.includes("/") ? null : registryId;
  } catch {
    return null;
  }
}

function matchProjectDeleteRoute(pathname: string): string | null {
  const prefix = "/api/projects/";

  if (!pathname.startsWith(prefix)) {
    return null;
  }

  const encoded = pathname.slice(prefix.length);

  try {
    const registryId = decodeURIComponent(encoded);
    return registryId === "" || registryId.includes("/") ? null : registryId;
  } catch {
    return null;
  }
}

function readJsonBody(request: IncomingMessage): Promise<Result<unknown>> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let settled = false;

    request.on("data", (chunk: Buffer) => {
      size += chunk.byteLength;

      if (size > MAX_API_BODY_BYTES) {
        settled = true;
        request.destroy();
        resolve(err(
          aictxError("AICtxValidationFailed", "Viewer API request body is too large.", {
            max_bytes: MAX_API_BODY_BYTES
          })
        ));
        return;
      }

      chunks.push(chunk);
    });

    request.on("error", (error: Error) => {
      if (!settled) {
        settled = true;
        resolve(err(
          aictxError("AICtxInternalError", "Viewer API request body could not be read.", {
            message: error.message
          })
        ));
      }
    });

    request.on("end", () => {
      if (settled) {
        return;
      }

      settled = true;
      const raw = Buffer.concat(chunks).toString("utf8");

      if (raw.trim() === "") {
        resolve(ok({}));
        return;
      }

      try {
        resolve(ok(JSON.parse(raw) as unknown));
      } catch (error) {
        resolve(err(
          aictxError("AICtxInvalidJson", "Invalid JSON.", {
            message: messageFromUnknown(error)
          })
        ));
      }
    });
  });
}

function parseExportOutDir(value: unknown): Result<string | undefined> {
  if (!isRecord(value)) {
    return err(
      aictxError("AICtxValidationFailed", "Viewer export request body must be a JSON object.")
    );
  }

  if (value.outDir === undefined) {
    return ok(undefined);
  }

  if (typeof value.outDir !== "string") {
    return err(
      aictxError("AICtxValidationFailed", "Viewer export outDir must be a string.")
    );
  }

  return ok(value.outDir);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function messageFromUnknown(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
