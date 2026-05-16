import { randomBytes } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, realpath } from "node:fs/promises";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse
} from "node:http";
import { extname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { memoryError } from "../core/errors.js";
import { err, ok, type Result } from "../core/result.js";
import {
  handleViewerApiRequest,
  viewerErrorBody,
  writeViewerJsonResponse
} from "./api.js";

export const VIEWER_LOOPBACK_HOST = "127.0.0.1";

export interface StartViewerServerOptions {
  cwd: string;
  port?: number;
  assetsDir?: string;
  token?: string;
  memoryHome?: string;
}

export interface StartedViewerServer {
  host: typeof VIEWER_LOOPBACK_HOST;
  port: number;
  token: string;
  url: string;
  close: () => Promise<void>;
}

interface ViewerRequestContext {
  cwd: string;
  assetsDir: string;
  token: string;
  memoryHome?: string;
}

export async function startViewerServer(
  options: StartViewerServerOptions
): Promise<Result<StartedViewerServer>> {
  const assetsDir = resolve(options.assetsDir ?? defaultViewerAssetsDir());
  const port = options.port ?? 0;

  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    return err(
      memoryError("MemoryValidationFailed", "Viewer port must be an integer from 0 to 65535.", {
        port
      })
    );
  }

  const assets = await validateViewerAssetsDir(assetsDir);

  if (!assets.ok) {
    return assets;
  }

  const token = options.token ?? randomBytes(32).toString("base64url");
  const context: ViewerRequestContext = {
    cwd: options.cwd,
    assetsDir,
    token,
    ...(options.memoryHome === undefined ? {} : { memoryHome: options.memoryHome })
  };
  const server = createServer((request, response) => {
    void handleViewerRequest(request, response, context).catch((error: unknown) => {
      writeViewerJsonResponse(response, 500, viewerErrorBody(
        memoryError("MemoryInternalError", "Viewer request failed.", {
          message: messageFromUnknown(error)
        })
      ));
    });
  });

  const listened = await listen(server, port);

  if (!listened.ok) {
    return listened;
  }

  const url = `http://${VIEWER_LOOPBACK_HOST}:${listened.data}/?token=${encodeURIComponent(token)}`;

  return ok({
    host: VIEWER_LOOPBACK_HOST,
    port: listened.data,
    token,
    url,
    close: closeServer(server)
  });
}

export function defaultViewerAssetsDir(): string {
  return fileURLToPath(new URL("../../dist/viewer", import.meta.url));
}

async function validateViewerAssetsDir(assetsDir: string): Promise<Result<void>> {
  const indexPath = resolve(assetsDir, "index.html");

  try {
    const stat = await lstat(indexPath);

    if (!stat.isFile()) {
      return err(
        memoryError("MemoryValidationFailed", "Viewer assets are missing index.html.", {
          assetsDir
        })
      );
    }

    return ok(undefined);
  } catch (error) {
    return err(
      memoryError("MemoryValidationFailed", "Viewer assets are not available.", {
        assetsDir,
        message: messageFromUnknown(error)
      })
    );
  }
}

function listen(server: Server, port: number): Promise<Result<number>> {
  return new Promise((resolveListen) => {
    let settled = false;

    const settle = (result: Result<number>): void => {
      if (!settled) {
        settled = true;
        resolveListen(result);
      }
    };

    server.once("error", (error: NodeJS.ErrnoException) => {
      settle(err(
        memoryError("MemoryValidationFailed", "Viewer server could not bind the requested port.", {
          host: VIEWER_LOOPBACK_HOST,
          port,
          code: error.code ?? null,
          message: error.message
        })
      ));
    });

    server.listen(port, VIEWER_LOOPBACK_HOST, () => {
      const address = server.address();

      if (typeof address === "object" && address !== null) {
        settle(ok(address.port));
        return;
      }

      settle(err(
        memoryError("MemoryInternalError", "Viewer server did not report a TCP address.")
      ));
    });
  });
}

async function handleViewerRequest(
  request: IncomingMessage,
  response: ServerResponse,
  context: ViewerRequestContext
): Promise<void> {
  const url = parseRequestUrl(request);

  if (url === null) {
    writeViewerJsonResponse(response, 400, viewerErrorBody(
      memoryError("MemoryValidationFailed", "Request URL is invalid.")
    ));
    return;
  }

  if (url.pathname.startsWith("/api/")) {
    await handleViewerApiRequest(request, response, url, {
      cwd: context.cwd,
      token: context.token,
      ...(context.memoryHome === undefined ? {} : { memoryHome: context.memoryHome })
    });
    return;
  }

  await handleStaticRequest(request, response, url, context.assetsDir);
}

function parseRequestUrl(request: IncomingMessage): URL | null {
  try {
    return new URL(request.url ?? "/", `http://${VIEWER_LOOPBACK_HOST}`);
  } catch {
    return null;
  }
}

async function handleStaticRequest(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  assetsDir: string
): Promise<void> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.setHeader("Allow", "GET, HEAD");
    writeViewerJsonResponse(response, 405, viewerErrorBody(
      memoryError("MemoryValidationFailed", "HTTP method is not supported for static assets.", {
        allow: "GET, HEAD"
      })
    ));
    return;
  }

  const assetPath = resolveAssetPath(assetsDir, url.pathname);

  if (assetPath === null) {
    writeViewerJsonResponse(response, 404, viewerErrorBody(
      memoryError("MemoryValidationFailed", "Viewer asset was not found.")
    ));
    return;
  }

  const readable = await readableAsset(assetsDir, assetPath);

  if (!readable.ok) {
    writeViewerJsonResponse(response, 404, viewerErrorBody(readable.error));
    return;
  }

  response.statusCode = 200;
  response.setHeader("Content-Type", contentTypeForPath(assetPath));

  if (request.method === "HEAD") {
    response.end();
    return;
  }

  await streamFile(assetPath, response);
}

function resolveAssetPath(assetsDir: string, pathname: string): string | null {
  let decoded: string;

  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }

  if (decoded.includes("\0")) {
    return null;
  }

  const relativePath = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
  const resolved = resolve(assetsDir, relativePath);

  return isInsideOrEqual(assetsDir, resolved) ? resolved : null;
}

async function readableAsset(
  assetsDir: string,
  assetPath: string
): Promise<Result<void>> {
  try {
    const [rootRealPath, stat] = await Promise.all([realpath(assetsDir), lstat(assetPath)]);

    if (stat.isSymbolicLink() || !stat.isFile()) {
      return err(
        memoryError("MemoryValidationFailed", "Viewer asset was not found.")
      );
    }

    const targetRealPath = await realpath(assetPath);

    if (!isInsideOrEqual(rootRealPath, targetRealPath)) {
      return err(
        memoryError("MemoryValidationFailed", "Viewer asset was not found.")
      );
    }

    return ok(undefined);
  } catch {
    return err(
      memoryError("MemoryValidationFailed", "Viewer asset was not found.")
    );
  }
}

function streamFile(path: string, response: ServerResponse): Promise<void> {
  return new Promise((resolveStream, reject) => {
    const stream = createReadStream(path);

    stream.on("error", reject);
    stream.on("end", resolveStream);
    stream.pipe(response);
  });
}

function contentTypeForPath(path: string): string {
  switch (extname(path)) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    case ".ico":
      return "image/x-icon";
    case ".txt":
      return "text/plain; charset=utf-8";
    default:
      return "application/octet-stream";
  }
}

function closeServer(server: Server): () => Promise<void> {
  let closed = false;

  return () =>
    new Promise((resolveClose, reject) => {
      if (closed) {
        resolveClose();
        return;
      }

      closed = true;
      server.close((error) => {
        if (error !== undefined) {
          reject(error);
          return;
        }

        resolveClose();
      });
    });
}

function isInsideOrEqual(root: string, target: string): boolean {
  const relativePath = relative(resolve(root), resolve(target));
  return relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath));
}

function messageFromUnknown(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
