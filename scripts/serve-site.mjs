import { createReadStream, existsSync, statSync } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const distDir = path.join(rootDir, "site", "dist");
const port = Number(process.env.PORT ?? 4321);
const host = process.env.HOST ?? "0.0.0.0";

const mimeTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".map", "application/json; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".txt", "text/plain; charset=utf-8"],
  [".webp", "image/webp"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"]
]);

if (!existsSync(distDir) || !statSync(distDir).isDirectory()) {
  console.error(`Missing static site build output: ${distDir}`);
  console.error("Run `pnpm build:site` before starting the production site server.");
  process.exit(1);
}

function sendText(response, statusCode, text) {
  response.writeHead(statusCode, {
    "content-length": Buffer.byteLength(text),
    "content-type": "text/plain; charset=utf-8"
  });
  response.end(text);
}

function resolveRequestPath(requestUrl) {
  const url = new URL(requestUrl, "http://localhost");
  const decodedPath = decodeURIComponent(url.pathname);
  const normalizedPath = path.normalize(decodedPath).replace(/^(\.\.[/\\])+/, "");
  const candidatePath = path.join(distDir, normalizedPath);

  if (candidatePath !== distDir && !candidatePath.startsWith(`${distDir}${path.sep}`)) {
    return null;
  }

  return candidatePath;
}

async function findStaticFile(candidatePath) {
  try {
    const candidateStat = await stat(candidatePath);

    if (candidateStat.isDirectory()) {
      return path.join(candidatePath, "index.html");
    }

    return candidatePath;
  } catch {
    const htmlPath = `${candidatePath}.html`;

    try {
      const htmlStat = await stat(htmlPath);
      return htmlStat.isFile() ? htmlPath : null;
    } catch {
      return null;
    }
  }
}

const server = createServer(async (request, response) => {
  if (!request.url) {
    sendText(response, 400, "Bad request");
    return;
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { allow: "GET, HEAD" });
    response.end();
    return;
  }

  const candidatePath = resolveRequestPath(request.url);

  if (!candidatePath) {
    sendText(response, 403, "Forbidden");
    return;
  }

  const filePath = await findStaticFile(candidatePath);
  const notFoundPath = path.join(distDir, "404.html");

  if (!filePath || !existsSync(filePath)) {
    if (existsSync(notFoundPath)) {
      response.writeHead(404, { "content-type": "text/html; charset=utf-8" });
      if (request.method === "HEAD") {
        response.end();
      } else {
        createReadStream(notFoundPath).pipe(response);
      }
      return;
    }

    sendText(response, 404, "Not found");
    return;
  }

  const contentType = mimeTypes.get(path.extname(filePath)) ?? "application/octet-stream";
  const fileStat = await stat(filePath);

  response.writeHead(200, {
    "cache-control": "public, max-age=300",
    "content-length": fileStat.size,
    "content-type": contentType
  });

  if (request.method === "HEAD") {
    response.end();
    return;
  }

  createReadStream(filePath).pipe(response);
});

server.listen(port, host, () => {
  console.log(`Serving ${distDir} on http://${host}:${port}`);
});
