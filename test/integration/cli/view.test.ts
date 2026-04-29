import { createServer } from "node:http";
import { mkdtemp, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { main, type CliOutputWriter } from "../../../src/cli/main.js";

const tempRoots: string[] = [];
const LOOPBACK_HOST = "127.0.0.1";

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true }))
  );
});

describe("aictx view CLI", () => {
  it("prints a usable local URL and keeps running until shutdown", async () => {
    const projectRoot = await createInitializedProject("aictx-cli-view-project-");
    const assetsDir = await createViewerAssets("aictx-cli-view-assets-");
    const output = createCapturedOutput();
    const shutdown = new AbortController();
    const running = main(["node", "aictx", "view"], {
      ...output.writers,
      cwd: projectRoot,
      viewer: {
        assetsDir,
        shutdownSignal: shutdown.signal
      }
    });
    const url = await waitForHumanViewerUrl(output.stdout);

    expect(url.hostname).toBe(LOOPBACK_HOST);
    expect(url.searchParams.get("token")).toBeTruthy();
    await expect(fetch(url)).resolves.toMatchObject({ status: 200 });
    await expect(promiseState(running)).resolves.toBe("pending");

    shutdown.abort();
    await expect(running).resolves.toBe(0);
    expect(output.stderr()).toBe("");
  });

  it("prints the JSON startup envelope and protects API requests with the token", async () => {
    const projectRoot = await createInitializedProject("aictx-cli-view-json-project-");
    const assetsDir = await createViewerAssets("aictx-cli-view-json-assets-");
    const output = createCapturedOutput();
    const shutdown = new AbortController();
    const running = main(["node", "aictx", "view", "--json"], {
      ...output.writers,
      cwd: projectRoot,
      viewer: {
        assetsDir,
        shutdownSignal: shutdown.signal
      }
    });
    const envelope = await waitForJsonOutput<{
      ok: true;
      data: {
        url: string;
        host: string;
        port: number;
        token_required: true;
        open_attempted: boolean;
      };
    }>(output.stdout);

    expect(envelope.ok).toBe(true);
    expect(envelope.data).toMatchObject({
      host: LOOPBACK_HOST,
      port: expect.any(Number),
      token_required: true,
      open_attempted: false
    });

    const url = new URL(envelope.data.url);
    const base = `${url.protocol}//${url.host}`;

    await expect(fetch(`${base}/api/bootstrap`)).resolves.toMatchObject({ status: 401 });
    await expect(fetch(`${base}/api/bootstrap?token=${url.searchParams.get("token")}`))
      .resolves.toMatchObject({ status: 200 });
    await expect(promiseState(running)).resolves.toBe("pending");

    shutdown.abort();
    await expect(running).resolves.toBe(0);
    expect(output.stderr()).toBe("");
  });

  it("starts on an explicit available loopback port", async () => {
    const projectRoot = await createInitializedProject("aictx-cli-view-port-project-");
    const assetsDir = await createViewerAssets("aictx-cli-view-port-assets-");
    const port = await getAvailableLoopbackPort();
    const output = createCapturedOutput();
    const shutdown = new AbortController();
    const running = main(["node", "aictx", "view", "--port", String(port), "--json"], {
      ...output.writers,
      cwd: projectRoot,
      viewer: {
        assetsDir,
        shutdownSignal: shutdown.signal
      }
    });
    const envelope = await waitForJsonOutput<{
      ok: true;
      data: {
        url: string;
        host: string;
        port: number;
        token_required: true;
        open_attempted: boolean;
      };
    }>(output.stdout);

    expect(envelope.ok).toBe(true);
    expect(envelope.data.host).toBe(LOOPBACK_HOST);
    expect(envelope.data.port).toBe(port);
    expect(new URL(envelope.data.url).port).toBe(String(port));
    await expect(fetch(envelope.data.url)).resolves.toMatchObject({ status: 200 });
    await expect(promiseState(running)).resolves.toBe("pending");

    shutdown.abort();
    await expect(running).resolves.toBe(0);
    expect(output.stderr()).toBe("");
  });

  it("fails clearly for an unavailable explicit port", async () => {
    const projectRoot = await createInitializedProject("aictx-cli-view-busy-project-");
    const assetsDir = await createViewerAssets("aictx-cli-view-busy-assets-");
    const busy = createServer();
    const output = createCapturedOutput();

    await listenOnLoopback(busy, 0);

    try {
      const address = busy.address();
      const port = typeof address === "object" && address !== null ? address.port : 0;
      const exitCode = await main(
        ["node", "aictx", "view", "--port", String(port), "--json"],
        {
          ...output.writers,
          cwd: projectRoot,
          viewer: {
            assetsDir,
            shutdownSignal: AbortSignal.abort()
          }
        }
      );
      const envelope = JSON.parse(output.stdout()) as {
        ok: false;
        error: {
          code: string;
          message: string;
          details: {
            host: string;
            port: number;
          };
        };
      };

      expect(exitCode).toBe(1);
      expect(output.stderr()).toBe("");
      expect(envelope.ok).toBe(false);
      expect(envelope.error.code).toBe("AICtxValidationFailed");
      expect(envelope.error.message).toContain("could not bind");
      expect(envelope.error.details).toMatchObject({
        host: LOOPBACK_HOST,
        port
      });
    } finally {
      await closeNodeServer(busy);
    }
  });
});

async function createInitializedProject(prefix: string): Promise<string> {
  const projectRoot = await createTempRoot(prefix);
  const output = createCapturedOutput();
  const exitCode = await main(["node", "aictx", "init", "--json"], {
    ...output.writers,
    cwd: projectRoot
  });

  expect(exitCode).toBe(0);
  expect(output.stderr()).toBe("");

  return projectRoot;
}

async function createViewerAssets(prefix: string): Promise<string> {
  const assetsRoot = await createTempRoot(prefix);

  await writeProjectFile(
    assetsRoot,
    "index.html",
    "<!doctype html><html><body>cli viewer asset</body></html>\n"
  );

  return assetsRoot;
}

async function waitForHumanViewerUrl(readStdout: () => string): Promise<URL> {
  const output = await waitForOutput(readStdout, (text) => text.includes("Aictx viewer:"));
  const match = output.match(/Aictx viewer: (?<url>http:\/\/127\.0\.0\.1:\d+\/\?token=\S+)/);

  if (match?.groups?.url === undefined) {
    throw new Error(`Viewer URL was not printed. Output: ${output}`);
  }

  return new URL(match.groups.url);
}

async function waitForJsonOutput<T>(readStdout: () => string): Promise<T> {
  const output = await waitForOutput(readStdout, (text) => text.trimEnd().endsWith("}"));
  return JSON.parse(output) as T;
}

async function waitForOutput(
  readStdout: () => string,
  predicate: (text: string) => boolean
): Promise<string> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < 5_000) {
    const output = readStdout();

    if (predicate(output)) {
      return output;
    }

    await delay(20);
  }

  throw new Error(`Timed out waiting for CLI output. Current stdout: ${readStdout()}`);
}

async function promiseState<T>(promise: Promise<T>): Promise<"pending" | "settled"> {
  const state = await Promise.race([
    promise.then(
      () => "settled" as const,
      () => "settled" as const
    ),
    delay(50).then(() => "pending" as const)
  ]);

  return state;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function writeProjectFile(
  root: string,
  relativePath: string,
  contents: string
): Promise<void> {
  const target = join(root, relativePath);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, contents, "utf8");
}

async function createTempRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  const resolvedRoot = await realpath(root);
  tempRoots.push(resolvedRoot);
  return resolvedRoot;
}

function listenOnLoopback(server: ReturnType<typeof createServer>, port: number): Promise<void> {
  return new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(port, LOOPBACK_HOST, () => {
      resolveListen();
    });
  });
}

async function getAvailableLoopbackPort(): Promise<number> {
  const server = createServer();

  await listenOnLoopback(server, 0);

  try {
    const address = server.address();

    if (typeof address === "object" && address !== null) {
      return address.port;
    }

    throw new Error("Loopback server did not report a port.");
  } finally {
    await closeNodeServer(server);
  }
}

function closeNodeServer(server: ReturnType<typeof createServer>): Promise<void> {
  return new Promise((resolveClose, reject) => {
    server.close((error) => {
      if (error !== undefined) {
        reject(error);
        return;
      }

      resolveClose();
    });
  });
}

function createCapturedOutput(): {
  writers: { stdout: CliOutputWriter; stderr: CliOutputWriter };
  stdout: () => string;
  stderr: () => string;
} {
  let stdout = "";
  let stderr = "";

  return {
    writers: {
      stdout: (text) => {
        stdout += text;
      },
      stderr: (text) => {
        stderr += text;
      }
    },
    stdout: () => stdout,
    stderr: () => stderr
  };
}
