import { mkdir, mkdtemp, readFile, realpath, readdir, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath, pathToFileURL } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import fg from "fast-glob";
import { afterEach, describe, expect, it } from "vitest";

import { main, type CliOutputWriter } from "../../../src/cli/main.js";
import { runSubprocess } from "../../../src/core/subprocess.js";
import { readCanonicalStorage } from "../../../src/storage/read.js";
import {
  backupParityAictxRoot,
  cleanupParityTempRoots,
  createInitializedParityProject,
  createParityNotePatch,
  createParityTempRoot,
  parseParityCliEnvelope,
  parseParityToolEnvelope,
  readParityCanonicalSnapshot,
  restoreParityAictxRoot,
  runParityCli,
  startParityMcpClient
} from "./parity-fixtures.js";

const require = createRequire(import.meta.url);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const serverEntry = join(repoRoot, "src/mcp/server.ts");
const tsxLoader = pathToFileURL(require.resolve("tsx")).href;
const tempRoots: string[] = [];

interface StartedMcpClient {
  client: Client;
  close: () => Promise<void>;
  stderr: () => string;
}

interface CliRunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

interface SaveEnvelope {
  ok: true;
  data: SaveData;
  meta: {
    git: {
      available: boolean;
      branch: string | null;
      commit: string | null;
      dirty: boolean | null;
    };
  };
}

interface SaveErrorEnvelope {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  warnings: string[];
  meta: unknown;
}

interface SaveData {
  files_changed: string[];
  memory_created: string[];
  memory_updated: string[];
  memory_deleted: string[];
  relations_created: string[];
  relations_updated: string[];
  relations_deleted: string[];
  recovery_files: unknown[];
  repairs_applied: string[];
  events_appended: number;
  index_updated: boolean;
}

interface TextContent {
  type: "text";
  text: string;
}

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true }))
  );
  await cleanupParityTempRoots();
});

describe("aictx MCP save_memory_patch tool", () => {
  it("exposes only the normalized v1 MCP tool set", async () => {
    const projectRoot = await createProjectRoot("aictx-mcp-save-tools-");
    const started = await startMcpClient(projectRoot);

    try {
      const result = await started.client.listTools();
      const toolNames = result.tools.map((tool) => tool.name).sort();

      expect(toolNames).toEqual([
        "diff_memory",
        "inspect_memory",
        "load_memory",
        "remember_memory",
        "save_memory_patch",
        "search_memory"
      ]);
      expect(toolNames).not.toEqual(
        expect.arrayContaining([
          "init",
          "check",
          "rebuild",
          "history",
          "restore",
          "rewind",
          "inspect",
          "stale",
          "graph",
          "export",
          "shell",
          "run_shell",
          "execute_command",
          "read_file",
          "write_file",
          "filesystem",
          "create_object",
          "update_object",
          "delete_object",
          "create_relation",
          "update_relation",
          "delete_relation"
        ])
      );
    } finally {
      await started.close();
    }

    expect(started.stderr()).toBe("");
  });

  it("advertises the v4 structured patch shape", async () => {
    const projectRoot = await createProjectRoot("aictx-mcp-save-schema-");
    const started = await startMcpClient(projectRoot);

    try {
      const result = await started.client.listTools();
      const saveTool = result.tools.find((tool) => tool.name === "save_memory_patch");
      const schema = JSON.stringify(saveTool?.inputSchema);

      expect(saveTool).toBeDefined();
      expect(schema).toContain("create_object");
      expect(schema).toContain("update_object");
      expect(schema).toContain("facets");
      expect(schema).toContain("evidence");
      expect(schema).toContain("origin");
      expect(schema).toContain("abandoned-attempt");
      expect(schema).toContain("product-feature");
      expect(schema).not.toContain("additionalProperties\":{}");
    } finally {
      await started.close();
    }

    expect(started.stderr()).toBe("");
  });

  it("remembers intent-first memory through globally targeted MCP writes", async () => {
    const serverRoot = await createProjectRoot("aictx-mcp-remember-server-");
    const projectRoot = await createInitializedProject("aictx-mcp-remember-project-");
    const started = await startMcpClient(serverRoot);

    try {
      const mcp = await started.client.callTool({
        name: "remember_memory",
        arguments: {
          project_root: projectRoot,
          task: "Add MCP remember coverage",
          memories: [
            {
              kind: "decision",
              title: "MCP remember uses intent-first writes",
              body: "The remember_memory tool accepts semantic memory input and routes it through the shared save path.",
              tags: ["mcp", "remember"],
              applies_to: ["src/mcp/tools/remember-memory.ts"],
              evidence: [{ kind: "file", id: "src/mcp/tools/remember-memory.ts" }]
            }
          ]
        }
      });
      const envelope = parseToolEnvelope<SaveEnvelope>(mcp);

      expect(envelope.ok).toBe(true);
      expect(envelope.data.memory_created).toEqual([
        "decision.mcp-remember-uses-intent-first-writes"
      ]);

      const storage = await readCanonicalStorage(projectRoot);

      expect(storage.ok).toBe(true);
      if (!storage.ok) {
        return;
      }

      const saved = storage.data.objects.find(
        (object) =>
          object.sidecar.id === "decision.mcp-remember-uses-intent-first-writes"
      );

      expect(saved?.body).toContain("semantic memory input");
      expect(saved?.sidecar.facets).toEqual({
        category: "decision-rationale",
        applies_to: ["src/mcp/tools/remember-memory.ts"]
      });
      expect(saved?.sidecar.evidence).toEqual([
        { kind: "file", id: "src/mcp/tools/remember-memory.ts" }
      ]);
    } finally {
      await started.close();
    }

    expect(started.stderr()).toBe("");
  });

  it("shares write serialization between remember_memory and save_memory_patch", async () => {
    const projectRoot = await createInitializedProject("aictx-mcp-remember-queue-");
    const started = await startMcpClient(projectRoot);

    try {
      const [remember, save] = await Promise.all([
        started.client.callTool({
          name: "remember_memory",
          arguments: {
            task: "Exercise mixed MCP write queue",
            memories: [
              {
                kind: "fact",
                title: "Mixed MCP queue remember write",
                body: "remember_memory and save_memory_patch serialize through the same project write queue."
              }
            ]
          }
        }),
        started.client.callTool({
          name: "save_memory_patch",
          arguments: {
            patch: createNotePatch(
              "Mixed MCP queue save write",
              "save_memory_patch shares the project write queue with remember_memory."
            )
          }
        })
      ]);
      const rememberEnvelope = parseToolEnvelope<SaveEnvelope>(remember);
      const saveEnvelope = parseToolEnvelope<SaveEnvelope>(save);

      expect(rememberEnvelope.data.memory_created).toEqual([
        "fact.mixed-mcp-queue-remember-write"
      ]);
      expect(saveEnvelope.data.memory_created).toEqual([
        "note.mixed-mcp-queue-save-write"
      ]);
      await expect(readMemoryIds(projectRoot)).resolves.toEqual(
        expect.arrayContaining([
          "fact.mixed-mcp-queue-remember-write",
          "note.mixed-mcp-queue-save-write"
        ])
      );
    } finally {
      await started.close();
    }

    expect(started.stderr()).toBe("");
  });

  it("produces equivalent canonical files to CLI stdin, CLI file, and MCP save", async () => {
    const patch = createNotePatch(
      "MCP shared save note",
      "CLI and MCP save should write equivalent canonical memory."
    );
    const cliStdinProject = await createInitializedProject("aictx-mcp-save-cli-stdin-");
    const cliFileProject = await createInitializedProject("aictx-mcp-save-cli-file-");
    const mcpProject = await createInitializedProject("aictx-mcp-save-mcp-");
    const started = await startMcpClient(mcpProject);

    try {
      const cliStdin = await runCli(
        ["node", "aictx", "save", "--stdin", "--json"],
        cliStdinProject,
        {
          stdin: Readable.from([JSON.stringify(patch)])
        }
      );
      await writeFile(join(cliFileProject, "patch.json"), JSON.stringify(patch), "utf8");
      const cliFile = await runCli(
        ["node", "aictx", "save", "--file", "patch.json", "--json"],
        cliFileProject
      );
      const mcp = await started.client.callTool({
        name: "save_memory_patch",
        arguments: {
          patch
        }
      });
      const cliStdinEnvelope = parseCliEnvelope<SaveEnvelope>(cliStdin);
      const cliFileEnvelope = parseCliEnvelope<SaveEnvelope>(cliFile);
      const mcpEnvelope = parseToolEnvelope<SaveEnvelope>(mcp);

      expect(cliFileEnvelope.data).toEqual(cliStdinEnvelope.data);
      expect(mcpEnvelope.data).toEqual(cliStdinEnvelope.data);
      expect(mcpEnvelope.data).toEqual({
        files_changed: [
          ".aictx/events.jsonl",
          ".aictx/memory/notes/mcp-shared-save-note.json",
          ".aictx/memory/notes/mcp-shared-save-note.md"
        ],
        memory_created: ["note.mcp-shared-save-note"],
        memory_updated: [],
        memory_deleted: [],
        relations_created: [],
        relations_updated: [],
        relations_deleted: [],
        recovery_files: [],
        repairs_applied: [],
        events_appended: 1,
        index_updated: true
      });
      await expectSavedNote(cliStdinProject, "note.mcp-shared-save-note");
      await expectSavedNote(cliFileProject, "note.mcp-shared-save-note");
      await expectSavedNote(mcpProject, "note.mcp-shared-save-note");
      const cliSnapshot = await readCanonicalSnapshot(cliStdinProject);
      await expect(readCanonicalSnapshot(cliFileProject)).resolves.toEqual(cliSnapshot);
      await expect(readCanonicalSnapshot(mcpProject)).resolves.toEqual(cliSnapshot);
    } finally {
      await started.close();
    }

    expect(started.stderr()).toBe("");
  });

  it("keeps globally targeted save_memory_patch envelopes in parity with CLI stdin", async () => {
    const serverRoot = await createParityTempRoot("aictx-mcp-save-parity-server-");
    const projectRoot = await createInitializedParityProject("aictx-mcp-save-parity-");
    const initialSnapshot = await backupParityAictxRoot(projectRoot);
    const patch = createParityNotePatch(
      "Global parity save note",
      "Global project_root save should match CLI stdin."
    );
    const started = await startParityMcpClient(serverRoot);

    try {
      const cli = parseParityCliEnvelope<SaveEnvelope>(
        await runParityCli(["node", "aictx", "save", "--stdin", "--json"], projectRoot, {
          stdin: Readable.from([JSON.stringify(patch)])
        })
      );
      const cliSnapshot = await readParityCanonicalSnapshot(projectRoot);

      await restoreParityAictxRoot(projectRoot, initialSnapshot);

      const mcp = parseParityToolEnvelope<SaveEnvelope>(
        await started.client.callTool({
          name: "save_memory_patch",
          arguments: {
            project_root: projectRoot,
            patch
          }
        })
      );

      expect(mcp).toEqual(cli);
      await expect(readParityCanonicalSnapshot(projectRoot)).resolves.toEqual(cliSnapshot);
    } finally {
      await started.close();
    }

    expect(started.stderr()).toBe("");
  });

  it("saves object facets and object evidence through MCP", async () => {
    const projectRoot = await createInitializedProject("aictx-mcp-save-facets-");
    const started = await startMcpClient(projectRoot);

    try {
      const mcp = await started.client.callTool({
        name: "save_memory_patch",
        arguments: {
          patch: createFacetedPatch()
        }
      });
      const envelope = parseToolEnvelope<SaveEnvelope>(mcp);

      expect(envelope.ok).toBe(true);
      expect(envelope.data.memory_created).toEqual(["concept.mcp-product-feature"]);

      const storage = await readCanonicalStorage(projectRoot);

      expect(storage.ok).toBe(true);
      if (!storage.ok) {
        return;
      }

      const saved = storage.data.objects.find(
        (object) => object.sidecar.id === "concept.mcp-product-feature"
      );

      expect(saved?.sidecar.facets).toEqual({
        category: "product-feature",
        applies_to: ["src/mcp/tools/save-memory-patch.ts"],
        load_modes: ["coding", "onboarding"]
      });
      expect(saved?.sidecar.evidence).toEqual([
        { kind: "file", id: "src/mcp/tools/save-memory-patch.ts" },
        { kind: "task", id: "Save MCP faceted memory" },
        { kind: "source", id: "source.mcp-docs" }
      ]);
    } finally {
      await started.close();
    }

    expect(started.stderr()).toBe("");
  });

  it("saves source origin through MCP remember and patch contracts", async () => {
    const projectRoot = await createInitializedProject("aictx-mcp-save-origin-");
    const started = await startMcpClient(projectRoot);

    try {
      const remembered = await started.client.callTool({
        name: "remember_memory",
        arguments: {
          task: "Remember source origin",
          memories: [
            {
              kind: "source",
              id: "source.mcp-remember-origin",
              title: "MCP remember origin source",
              body: "MCP remember_memory can set raw-source origin metadata on source records.",
              origin: {
                kind: "url",
                locator: "https://example.com/mcp-remember-origin",
                captured_at: "2026-05-14T12:00:00+02:00",
                media_type: "text/markdown"
              }
            }
          ]
        }
      });
      const saved = await started.client.callTool({
        name: "save_memory_patch",
        arguments: {
          patch: createSourceOriginPatch()
        }
      });
      const rememberedEnvelope = parseToolEnvelope<SaveEnvelope>(remembered);
      const savedEnvelope = parseToolEnvelope<SaveEnvelope>(saved);

      expect(rememberedEnvelope.ok).toBe(true);
      expect(savedEnvelope.ok).toBe(true);

      const storage = await readCanonicalStorage(projectRoot);

      expect(storage.ok).toBe(true);
      if (!storage.ok) {
        return;
      }

      const rememberedSource = storage.data.objects.find(
        (object) => object.sidecar.id === "source.mcp-remember-origin"
      );
      const savedSource = storage.data.objects.find(
        (object) => object.sidecar.id === "source.mcp-patch-origin"
      );

      expect(rememberedSource?.sidecar.origin).toMatchObject({
        kind: "url",
        locator: "https://example.com/mcp-remember-origin",
        captured_at: "2026-05-14T12:00:00+02:00",
        media_type: "text/markdown"
      });
      expect(savedSource?.sidecar.origin).toMatchObject({
        kind: "file",
        locator: "docs/mcp-origin.md",
        media_type: "text/markdown"
      });
    } finally {
      await started.close();
    }

    expect(started.stderr()).toBe("");
  });

  it("serializes concurrent MCP writes or returns lock errors", async () => {
    const projectRoot = await createInitializedProject("aictx-mcp-save-concurrent-");
    const started = await startMcpClient(projectRoot);

    try {
      const results = await Promise.all([
        started.client.callTool({
          name: "save_memory_patch",
          arguments: {
            patch: createNotePatch("Concurrent note one", "First concurrent MCP write.")
          }
        }),
        started.client.callTool({
          name: "save_memory_patch",
          arguments: {
            patch: createNotePatch("Concurrent note two", "Second concurrent MCP write.")
          }
        })
      ]);
      const envelopes = results.map((result) =>
        parseToolEnvelope<SaveEnvelope | SaveErrorEnvelope>(result)
      );
      const successes = envelopes.filter(isSaveSuccess);
      const lockFailures = envelopes.filter(
        (envelope): envelope is SaveErrorEnvelope =>
          !envelope.ok && envelope.error.code === "AICtxLockBusy"
      );

      expect(successes.length + lockFailures.length).toBe(2);
      expect(successes.length).toBeGreaterThanOrEqual(1);

      const savedIds = await readMemoryIds(projectRoot);

      if (successes.length === 2) {
        expect(savedIds).toEqual(
          expect.arrayContaining(["note.concurrent-note-one", "note.concurrent-note-two"])
        );
      } else {
        expect(savedIds).toEqual(
          expect.arrayContaining(successes.flatMap((envelope) => envelope.data.memory_created))
        );
      }

      await expect(readFile(join(projectRoot, ".aictx", ".lock"), "utf8")).rejects.toMatchObject({
        code: "ENOENT"
      });
    } finally {
      await started.close();
    }

    expect(started.stderr()).toBe("");
  });

  it("does not create a Git commit", async () => {
    const repo = await createInitializedGitProject("aictx-mcp-save-git-");
    const commitBefore = (await git(repo, ["rev-parse", "HEAD"])).trim();
    const started = await startMcpClient(repo);

    try {
      const mcp = await started.client.callTool({
        name: "save_memory_patch",
        arguments: {
          patch: createNotePatch("MCP git save note", "MCP save must not create a commit.")
        }
      });
      const envelope = parseToolEnvelope<SaveEnvelope>(mcp);

      expect(envelope.ok).toBe(true);
      expect(envelope.meta.git.available).toBe(true);
      expect(envelope.meta.git.commit).toBe(commitBefore);
      expect(envelope.meta.git.dirty).toBe(true);
      expect((await git(repo, ["rev-parse", "HEAD"])).trim()).toBe(commitBefore);

      const status = await git(repo, ["status", "--porcelain=v1", "-uall", "--", ".aictx"]);
      expect(status).toContain(".aictx/events.jsonl");
      expect(status).toContain(".aictx/memory/notes/mcp-git-save-note.md");
      expect(status).toContain(".aictx/memory/notes/mcp-git-save-note.json");
    } finally {
      await started.close();
    }

    expect(started.stderr()).toBe("");
  });

  it("rejects invalid MCP input before service execution", async () => {
    const projectRoot = await createProjectRoot("aictx-mcp-save-invalid-");
    const started = await startMcpClient(projectRoot);

    try {
      const missingPatch = await started.client.callTool({
        name: "save_memory_patch",
        arguments: {}
      });
      const unsupportedProjectRoot = await started.client.callTool({
        name: "save_memory_patch",
        arguments: {
          patch: createNotePatch("Ignored", "Should not run."),
          projectRoot
        }
      });
      const unknownTopLevel = await started.client.callTool({
        name: "save_memory_patch",
        arguments: {
          patch: createNotePatch("Ignored top level", "Should not run."),
          unexpected: true
        }
      });
      const unknownSourceField = await started.client.callTool({
        name: "save_memory_patch",
        arguments: {
          patch: {
            source: {
              kind: "agent",
              task: "Ignored source",
              unexpected: true
            },
            changes: [
              {
                op: "create_object",
                type: "note",
                title: "Ignored source field",
                body: "# Ignored source field\n\nShould not run.\n"
              }
            ]
          }
        }
      });
      const unknownPatchChangeField = await started.client.callTool({
        name: "save_memory_patch",
        arguments: {
          patch: {
            source: {
              kind: "agent",
              task: "Ignored change"
            },
            changes: [
              {
                op: "create_object",
                type: "note",
                title: "Ignored change field",
                body: "# Ignored change field\n\nShould not run.\n",
                unexpected: true
              }
            ]
          }
        }
      });

      expectToolError(missingPatch, /patch/);
      expectToolError(unsupportedProjectRoot, /projectRoot/);
      expectToolError(unknownTopLevel, /unexpected|unrecognized|unknown/i);
      expectToolError(unknownSourceField, /unexpected|unrecognized|unknown/i);
      expectToolError(unknownPatchChangeField, /unexpected|unrecognized|unknown/i);
    } finally {
      await started.close();
    }

    expect(started.stderr()).toBe("");
    await expect(readdir(projectRoot)).resolves.toEqual([]);
  });

  it("returns save_memory_patch app-error envelopes matching CLI save JSON", async () => {
    const projectRoot = await createInitializedProject("aictx-mcp-save-error-parity-");
    const patch = createMissingRelationPatch();
    const started = await startMcpClient(projectRoot);

    try {
      const cli = await runCli(["node", "aictx", "save", "--stdin", "--json"], projectRoot, {
        stdin: Readable.from([JSON.stringify(patch)])
      });
      const mcp = await started.client.callTool({
        name: "save_memory_patch",
        arguments: {
          patch
        }
      });
      const cliEnvelope = parseCliErrorEnvelope<SaveErrorEnvelope>(cli);
      const mcpEnvelope = parseToolEnvelope<SaveErrorEnvelope>(mcp);

      expect(mcpEnvelope).toEqual(cliEnvelope);
      expect(mcpEnvelope.error.code).toBe("AICtxObjectNotFound");
    } finally {
      await started.close();
    }

    expect(started.stderr()).toBe("");
  });
});

async function startMcpClient(cwd: string): Promise<StartedMcpClient> {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["--import", tsxLoader, serverEntry],
    cwd,
    stderr: "pipe"
  });
  const stderrChunks: string[] = [];
  const stderr = transport.stderr;

  if (stderr instanceof Readable) {
    stderr.setEncoding("utf8");
    stderr.on("data", (chunk: string) => {
      stderrChunks.push(chunk);
    });
  }

  const client = new Client({
    name: "aictx-mcp-save-tool-test-client",
    version: "0.0.0"
  });

  await client.connect(transport);

  return {
    client,
    close: async () => {
      await client.close();
    },
    stderr: () => stderrChunks.join("")
  };
}

async function createInitializedProject(prefix: string): Promise<string> {
  const projectRoot = await createProjectRoot(prefix);
  const output = await runCli(["node", "aictx", "init", "--json"], projectRoot);

  expect(output.exitCode).toBe(0);
  expect(output.stderr).toBe("");

  return projectRoot;
}

async function createInitializedGitProject(prefix: string): Promise<string> {
  const repo = await createRepo(prefix);
  const output = await runCli(["node", "aictx", "init", "--json"], repo);

  expect(output.exitCode).toBe(0);
  expect(output.stderr).toBe("");

  await git(repo, ["add", ".gitignore", ".aictx"]);
  await git(repo, ["commit", "-m", "Initialize aictx"]);

  return repo;
}

async function createRepo(prefix: string): Promise<string> {
  const repo = await createProjectRoot(prefix);
  await git(repo, ["init", "--initial-branch=main"]);
  await git(repo, ["config", "user.email", "test@example.com"]);
  await git(repo, ["config", "user.name", "Aictx Test"]);
  await writeFile(join(repo, "README.md"), "# Test\n", "utf8");
  await git(repo, ["add", "README.md"]);
  await git(repo, ["commit", "-m", "Initial commit"]);
  return repo;
}

async function createProjectRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  const resolvedRoot = await realpath(root);
  const projectRoot = join(resolvedRoot, "repo");

  tempRoots.push(resolvedRoot);
  await mkdir(projectRoot);

  return projectRoot;
}

async function runCli(
  argv: string[],
  cwd: string,
  options: { stdin?: Readable } = {}
): Promise<CliRunResult> {
  const output = createCapturedOutput();
  const exitCode = await main(argv, {
    ...output.writers,
    cwd,
    ...(options.stdin === undefined ? {} : { stdin: options.stdin })
  });

  return {
    exitCode,
    stdout: output.stdout(),
    stderr: output.stderr()
  };
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

function createNotePatch(title: string, body: string) {
  return {
    source: {
      kind: "agent",
      task: "Save MCP integration test"
    },
    changes: [
      {
        op: "create_object",
        type: "note",
        title,
        body: `# ${title}\n\n${body}\n`
      }
    ]
  };
}

function createFacetedPatch() {
  return {
    source: {
      kind: "agent",
      task: "Save MCP faceted memory"
    },
    changes: [
      {
        op: "create_object",
        id: "concept.mcp-product-feature",
        type: "concept",
        title: "Feature: MCP product feature",
        body: "# Feature: MCP product feature\n\nMCP save accepts product-feature facets and evidence.\n",
        tags: ["feature", "mcp", "product"],
        facets: {
          category: "product-feature",
          applies_to: ["src/mcp/tools/save-memory-patch.ts"],
          load_modes: ["coding", "onboarding"]
        },
        evidence: [
          { kind: "file", id: "src/mcp/tools/save-memory-patch.ts" },
          { kind: "task", id: "Save MCP faceted memory" },
          { kind: "source", id: "source.mcp-docs" }
        ]
      }
    ]
  };
}

function createSourceOriginPatch() {
  return {
    source: {
      kind: "agent",
      task: "Save MCP source origin"
    },
    changes: [
      {
        op: "create_object",
        id: "source.mcp-patch-origin",
        type: "source",
        title: "MCP patch origin source",
        body: "# MCP patch origin source\n\nMCP save_memory_patch can set raw-source origin metadata.\n",
        tags: ["mcp", "origin"],
        origin: {
          kind: "file",
          locator: "docs/mcp-origin.md",
          media_type: "text/markdown"
        }
      }
    ]
  };
}

function createMissingRelationPatch() {
  return {
    source: {
      kind: "agent",
      task: "Exercise save error envelope parity"
    },
    changes: [
      {
        op: "create_relation",
        from: "decision.missing",
        predicate: "requires",
        to: "constraint.missing"
      }
    ]
  };
}

async function expectSavedNote(projectRoot: string, id: string): Promise<void> {
  const storage = await readCanonicalStorage(projectRoot);

  expect(storage.ok).toBe(true);
  if (!storage.ok) {
    return;
  }

  const saved = storage.data.objects.find((object) => object.sidecar.id === id);

  expect(saved).toBeDefined();
  expect(saved?.body).toContain("CLI and MCP save should write equivalent canonical memory.");
}

async function readMemoryIds(projectRoot: string): Promise<string[]> {
  const storage = await readCanonicalStorage(projectRoot);

  expect(storage.ok).toBe(true);
  if (!storage.ok) {
    return [];
  }

  return storage.data.objects.map((object) => object.sidecar.id).sort();
}

async function readCanonicalSnapshot(projectRoot: string): Promise<Record<string, unknown>> {
  const paths = (
    await fg(".aictx/**/*.{json,jsonl,md}", {
      cwd: projectRoot,
      dot: true,
      ignore: [".aictx/index/**", ".aictx/context/**", ".aictx/exports/**", ".aictx/.lock"],
      onlyFiles: true,
      unique: true
    })
  ).sort();
  const entries = await Promise.all(
    paths.map(async (path) => {
      const contents = await readFile(join(projectRoot, path), "utf8");
      return [path, normalizeCanonicalFile(path, contents)] as const;
    })
  );

  return Object.fromEntries(entries);
}

function normalizeCanonicalFile(path: string, contents: string): unknown {
  if (path.endsWith(".json")) {
    return normalizeVolatileFields(JSON.parse(contents) as unknown);
  }

  if (path.endsWith(".jsonl")) {
    return contents
      .split("\n")
      .filter((line) => line.length > 0)
      .map((line) => normalizeVolatileFields(JSON.parse(line) as unknown));
  }

  return contents;
}

function normalizeVolatileFields(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizeVolatileFields);
  }

  if (!isRecord(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => {
      if (
        typeof entry === "string" &&
        (key === "created_at" ||
          key === "updated_at" ||
          key === "timestamp" ||
          key === "content_hash")
      ) {
        return [key, `<${key}>`];
      }

      return [key, normalizeVolatileFields(entry)];
    })
  );
}

async function git(cwd: string, args: readonly string[]): Promise<string> {
  const result = await runSubprocess("git", args, { cwd });

  if (!result.ok) {
    throw new Error(result.error.message);
  }

  if (result.data.exitCode !== 0) {
    throw new Error(
      [
        `git ${args.join(" ")} failed with exit code ${result.data.exitCode}`,
        result.data.stderr
      ].join("\n")
    );
  }

  return result.data.stdout;
}

function parseCliEnvelope<T>(output: CliRunResult): T {
  expect(output.exitCode).toBe(0);
  expect(output.stderr).toBe("");
  return JSON.parse(output.stdout) as T;
}

function parseCliErrorEnvelope<T>(output: CliRunResult): T {
  expect(output.exitCode).not.toBe(0);
  expect(output.stderr).toBe("");
  return JSON.parse(output.stdout) as T;
}

function expectToolError(result: unknown, message: RegExp): void {
  expect(isRecord(result)).toBe(true);
  if (!isRecord(result)) {
    throw new Error("Expected MCP tool error result to be an object.");
  }

  expect(result.isError).toBe(true);
  expect(Array.isArray(result.content)).toBe(true);

  if (!Array.isArray(result.content)) {
    throw new Error("Expected MCP tool error result content to be an array.");
  }

  const text = result.content.find(isTextContent);

  expect(text).toBeDefined();
  if (text === undefined) {
    throw new Error("Expected MCP tool error result to include text content.");
  }

  expect(text.text).toMatch(message);
}

function parseToolEnvelope<T>(result: unknown): T {
  expect(isRecord(result)).toBe(true);
  if (!isRecord(result)) {
    throw new Error("Expected MCP tool result to be an object.");
  }

  expect(result.isError).not.toBe(true);
  expect(result.structuredContent).toBeDefined();
  expect(Array.isArray(result.content)).toBe(true);

  if (!Array.isArray(result.content)) {
    throw new Error("Expected MCP tool result content to be an array.");
  }

  const text = result.content.find(isTextContent);

  expect(text).toBeDefined();
  if (text === undefined || !isRecord(result.structuredContent)) {
    throw new Error("Expected MCP tool result to include text and structured content.");
  }

  expect(JSON.parse(text.text) as unknown).toEqual(result.structuredContent);

  return result.structuredContent as T;
}

function isSaveSuccess(envelope: SaveEnvelope | SaveErrorEnvelope): envelope is SaveEnvelope {
  return envelope.ok;
}

function isTextContent(value: unknown): value is TextContent {
  return isRecord(value) && value.type === "text" && typeof value.text === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
