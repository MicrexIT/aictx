import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { CommanderError, type Command } from "commander";

import { type AppResult } from "../../app/operations.js";
import { aictxError, type AictxError } from "../../core/errors.js";
import { runSubprocess } from "../../core/subprocess.js";
import { CLI_EXIT_SUCCESS, type CliExitCode } from "../exit.js";
import { renderAppResult } from "../render.js";

type CliOutputWriter = (text: string) => void;

export type DocsUrlOpener = (url: string) => Promise<void> | void;

export interface RegisterDocsCommandOptions {
  stdout: CliOutputWriter;
  stderr: CliOutputWriter;
  docsDir?: string;
  baseUrl?: string;
  opener?: DocsUrlOpener;
}

interface DocsCommandFlags {
  open?: boolean;
}

interface DocsTopic {
  topic: string;
  title: string;
  description: string;
  file: string;
  path: string;
  aliases: readonly string[];
}

interface DocsTopicSummary {
  topic: string;
  title: string;
  description: string;
  url: string;
  aliases: readonly string[];
}

interface DocsListData {
  kind: "list";
  base_url: string;
  topics: DocsTopicSummary[];
  open_attempted: boolean;
  opened_url: string | null;
}

interface DocsTopicData extends DocsTopicSummary {
  kind: "topic";
  content: string;
  open_attempted: boolean;
  opened_url: string | null;
}

type DocsData = DocsListData | DocsTopicData;

const DEFAULT_DOCS_BASE_URL = "https://docs.aictx.dev";

const DOC_TOPICS = [
  {
    topic: "getting-started",
    title: "Getting started",
    description: "Install Aictx, initialize memory, and run the first load/save/diff loop.",
    file: "getting-started.md",
    path: "/getting-started/",
    aliases: ["quickstart", "install", "start"]
  },
  {
    topic: "mental-model",
    title: "Mental model",
    description: "Understand canonical memory, generated state, and the hybrid memory model.",
    file: "mental-model.md",
    path: "/mental-model/",
    aliases: ["model", "memory-model"]
  },
  {
    topic: "demand-driven-memory",
    title: "Demand-driven memory",
    description: "Use agent failure, confusion, and correction to improve durable project memory.",
    file: "demand-driven-memory.md",
    path: "/demand-driven-memory/",
    aliases: ["demand-driven", "memory-quality", "context-engine"]
  },
  {
    topic: "cli",
    title: "CLI guide",
    description: "Use setup, routine memory, inspection, recovery, export, viewer, and docs commands.",
    file: "cli.md",
    path: "/cli/",
    aliases: ["commands", "command-line"]
  },
  {
    topic: "mcp",
    title: "MCP guide",
    description: "Configure Aictx MCP and understand the CLI/MCP capability boundary.",
    file: "mcp.md",
    path: "/mcp/",
    aliases: ["mcp-setup", "tools"]
  },
  {
    topic: "agent-integration",
    title: "Agent integration",
    description: "Teach coding agents to load, use, save, and inspect Aictx memory safely.",
    file: "agent-integration.md",
    path: "/agent-integration/",
    aliases: ["agents", "agent", "guidance"]
  },
  {
    topic: "viewer",
    title: "Local viewer",
    description: "Inspect project memory through the local read-only browser viewer.",
    file: "viewer.md",
    path: "/viewer/",
    aliases: ["view", "local-viewer"]
  },
  {
    topic: "troubleshooting",
    title: "Troubleshooting",
    description: "Fix common install, PATH, MCP, schema, index, and recovery issues.",
    file: "troubleshooting.md",
    path: "/troubleshooting/",
    aliases: ["help", "debug"]
  },
  {
    topic: "reference",
    title: "Reference",
    description: "Compact CLI, MCP, docs, object taxonomy, and structured patch reference.",
    file: "reference.md",
    path: "/reference/",
    aliases: ["ref", "patch", "structured-patch"]
  }
] as const satisfies readonly DocsTopic[];

export function registerDocsCommand(
  program: Command,
  options: RegisterDocsCommandOptions
): void {
  program
    .command("docs")
    .description("Read bundled public Aictx docs or open the hosted docs site.")
    .argument("[topic]", "Docs topic to print.")
    .option("--open", "Open the hosted docs page in the default browser.")
    .action(async (topic: string | undefined, flags: DocsCommandFlags, command: Command) => {
      const result = await docsCommandResult(topic, flags, options);
      const rendered = renderAppResult(result, {
        json: isJsonMode(command),
        renderData: renderDocsData
      });

      options.stdout(rendered.stdout);
      options.stderr(rendered.stderr);

      if (rendered.exitCode !== CLI_EXIT_SUCCESS) {
        throwCommandFailed(rendered.exitCode);
      }
    });
}

async function docsCommandResult(
  topic: string | undefined,
  flags: DocsCommandFlags,
  options: RegisterDocsCommandOptions
): Promise<AppResult<DocsData>> {
  const baseUrl = normalizeBaseUrl(options.baseUrl ?? DEFAULT_DOCS_BASE_URL);
  const openAttempted = flags.open === true;

  if (topic === undefined) {
    const openedUrl = openAttempted ? baseUrl : null;
    const warnings = openAttempted ? await openDocsUrl(baseUrl, options.opener) : [];

    return {
      ok: true,
      data: {
        kind: "list",
        base_url: baseUrl,
        topics: DOC_TOPICS.map((entry) => summarizeTopic(entry, baseUrl)),
        open_attempted: openAttempted,
        opened_url: openedUrl
      },
      warnings,
      meta: docsMeta()
    };
  }

  const entry = findTopic(topic);

  if (entry === null) {
    return {
      ok: false,
      error: unknownTopicError(topic),
      warnings: [],
      meta: docsMeta()
    };
  }

  const url = topicUrl(entry, baseUrl);
  let content: string;

  try {
    content = await readTopicMarkdown(entry, options.docsDir);
  } catch (error) {
    return {
      ok: false,
      error: aictxError("AICtxInternalError", `Could not read bundled docs topic: ${entry.topic}`, {
        topic: entry.topic,
        message: messageFromUnknown(error)
      }),
      warnings: [],
      meta: docsMeta()
    };
  }

  const warnings = openAttempted ? await openDocsUrl(url, options.opener) : [];

  return {
    ok: true,
    data: {
      kind: "topic",
      ...summarizeTopic(entry, baseUrl),
      content,
      open_attempted: openAttempted,
      opened_url: openAttempted ? url : null
    },
    warnings,
    meta: docsMeta()
  };
}

function renderDocsData(data: DocsData): string {
  if (data.kind === "topic") {
    return data.content;
  }

  if (data.open_attempted) {
    return `Aictx docs: ${data.base_url}`;
  }

  return [
    `Aictx docs: ${data.base_url}`,
    "",
    "Topics:",
    ...data.topics.map((topic) => `- ${topic.topic}: ${topic.description}`),
    "",
    "Run `aictx docs <topic>` to print a topic or `aictx docs --open` to open the docs site."
  ].join("\n");
}

async function readTopicMarkdown(entry: DocsTopic, docsDir: string | undefined): Promise<string> {
  const errors: string[] = [];

  for (const baseUrl of docsContentUrls(docsDir)) {
    const path = fileURLToPath(new URL(entry.file, baseUrl));

    try {
      const content = await readFile(path, "utf8");

      return stripFrontmatter(content).trimStart();
    } catch (error) {
      errors.push(`${path}: ${messageFromUnknown(error)}`);
    }
  }

  throw new Error(errors.join("; "));
}

function docsContentUrls(docsDir: string | undefined): URL[] {
  if (docsDir !== undefined) {
    return [pathToFileURL(ensureTrailingSlash(resolve(docsDir)))];
  }

  return [
    new URL("../../docs/src/content/docs/", import.meta.url),
    new URL("../../../docs/src/content/docs/", import.meta.url)
  ];
}

function stripFrontmatter(content: string): string {
  if (!content.startsWith("---\n")) {
    return content;
  }

  const end = content.indexOf("\n---\n", 4);

  if (end === -1) {
    return content;
  }

  return content.slice(end + "\n---\n".length);
}

function summarizeTopic(entry: DocsTopic, baseUrl: string): DocsTopicSummary {
  return {
    topic: entry.topic,
    title: entry.title,
    description: entry.description,
    url: topicUrl(entry, baseUrl),
    aliases: entry.aliases
  };
}

function findTopic(value: string): DocsTopic | null {
  const normalized = normalizeTopic(value);

  return (
    DOC_TOPICS.find(
      (entry) =>
        normalizeTopic(entry.topic) === normalized ||
        entry.aliases.some((alias) => normalizeTopic(alias) === normalized)
    ) ?? null
  );
}

function unknownTopicError(topic: string): AictxError {
  return aictxError("AICtxObjectNotFound", `Unknown docs topic: ${topic}`, {
    topic,
    available_topics: DOC_TOPICS.map((entry) => entry.topic)
  });
}

function topicUrl(entry: DocsTopic, baseUrl: string): string {
  return new URL(entry.path, baseUrl).toString();
}

function normalizeTopic(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeBaseUrl(value: string): string {
  return ensureTrailingSlash(value);
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

async function openDocsUrl(
  url: string,
  opener: DocsUrlOpener | undefined
): Promise<string[]> {
  try {
    if (opener !== undefined) {
      await opener(url);
      return [];
    }

    await openWithDefaultBrowser(url);
    return [];
  } catch (error) {
    return [`Docs URL could not be opened: ${messageFromUnknown(error)}`];
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

function docsMeta() {
  return {
    project_root: process.cwd(),
    aictx_root: `${process.cwd()}/.aictx`,
    git: {
      available: false,
      branch: null,
      commit: null,
      dirty: null
    }
  };
}

function isJsonMode(command: Command): boolean {
  const options = command.optsWithGlobals() as { json?: unknown };
  return options.json === true;
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
