import demoData from "./demo-data.generated.json" with { type: "json" };

type DemoJson =
  | null
  | boolean
  | number
  | string
  | DemoJson[]
  | { [key: string]: DemoJson };

type DemoEnvelopeData =
  | typeof demoData.projects
  | typeof demoData.bootstrap
  | ReturnType<typeof buildLoadPreviewData>;

export interface DemoWorkerEnv {
  ASSETS: {
    fetch(request: Request): Promise<Response>;
  };
}

interface DemoError {
  code: string;
  message: string;
  details?: DemoJson;
}

interface LoadPreviewRequestBody {
  task?: unknown;
  mode?: unknown;
  token_budget?: unknown;
}

const DEMO_MODES = ["coding", "debugging", "review", "architecture", "onboarding"] as const;
const DEMO_ROUTE_PREFIX = `/api/projects/${demoData.registry_id}`;
const API_HEADERS = {
  "cache-control": "no-store",
  "content-type": "application/json; charset=utf-8"
};

export default {
  async fetch(request: Request, env: DemoWorkerEnv): Promise<Response> {
    const url = new URL(request.url);

    if (!url.pathname.startsWith("/api/")) {
      return env.ASSETS.fetch(request);
    }

    if (!isAuthorizedDemoRequest(request, url)) {
      return jsonError(401, {
        code: "AICtxValidationFailed",
        message: "Viewer API token is required."
      });
    }

    if (url.pathname === "/api/projects") {
      return methodGuard(request, "GET", () => jsonOk(demoData.projects));
    }

    if (url.pathname === `${DEMO_ROUTE_PREFIX}/bootstrap`) {
      return methodGuard(request, "GET", () => jsonOk(demoData.bootstrap));
    }

    if (url.pathname === `${DEMO_ROUTE_PREFIX}/load-preview`) {
      return methodGuard(request, "POST", async () => handleLoadPreview(request));
    }

    if (isReadOnlyBlockedRoute(url.pathname, request.method)) {
      return jsonError(403, {
        code: "AICtxValidationFailed",
        message: "The public demo viewer is read-only."
      });
    }

    return jsonError(404, {
      code: "AICtxValidationFailed",
      message: "Viewer API route is not supported.",
      details: {
        path: url.pathname
      }
    });
  }
};

function isAuthorizedDemoRequest(request: Request, url: URL): boolean {
  if (url.searchParams.get("token") === demoData.token) {
    return true;
  }

  return request.headers.get("authorization") === `Bearer ${demoData.token}`;
}

function methodGuard(
  request: Request,
  method: string,
  handler: () => Response | Promise<Response>
): Response | Promise<Response> {
  if (request.method !== method) {
    return jsonError(405, {
      code: "AICtxValidationFailed",
      message: "HTTP method is not supported for this demo route.",
      details: {
        allow: method
      }
    }, {
      allow: method
    });
  }

  return handler();
}

async function handleLoadPreview(request: Request): Promise<Response> {
  const parsed = await readLoadPreviewBody(request);

  if (!parsed.ok) {
    return jsonError(400, parsed.error);
  }

  const body = parsed.body;
  const task = typeof body.task === "string" ? body.task.trim() : "";

  if (task === "") {
    return jsonError(400, {
      code: "AICtxValidationFailed",
      message: "Task is required."
    });
  }

  const mode = normalizeMode(body.mode);

  if (mode === null) {
    return jsonError(400, {
      code: "AICtxValidationFailed",
      message: "Load mode is not supported.",
      details: {
        mode: typeof body.mode === "string" ? body.mode : null
      }
    });
  }

  const tokenBudget = normalizeTokenBudget(body.token_budget);

  if (!tokenBudget.ok) {
    return jsonError(400, tokenBudget.error);
  }

  return jsonOk(buildLoadPreviewData({
    task,
    mode,
    tokenBudget: tokenBudget.value,
    tokenTargetSource: tokenBudget.source,
    wasCapped: tokenBudget.wasCapped
  }));
}

async function readLoadPreviewBody(
  request: Request
): Promise<{ ok: true; body: LoadPreviewRequestBody } | { ok: false; error: DemoError }> {
  try {
    const value: unknown = await request.json();

    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      return {
        ok: false,
        error: {
          code: "AICtxValidationFailed",
          message: "JSON request body must be an object."
        }
      };
    }

    return {
      ok: true,
      body: value
    };
  } catch {
    return {
      ok: false,
      error: {
        code: "AICtxValidationFailed",
        message: "Request body must be valid JSON."
      }
    };
  }
}

function normalizeMode(value: unknown): (typeof DEMO_MODES)[number] | null {
  if (value === undefined) {
    return demoData.defaults.mode as (typeof DEMO_MODES)[number];
  }

  return typeof value === "string" && isDemoMode(value) ? value : null;
}

function isDemoMode(value: string): value is (typeof DEMO_MODES)[number] {
  return (DEMO_MODES as readonly string[]).includes(value);
}

function normalizeTokenBudget(
  value: unknown
):
  | { ok: true; value: number; source: "explicit" | "fallback_default"; wasCapped: boolean }
  | { ok: false; error: DemoError } {
  if (value === undefined) {
    return {
      ok: true,
      value: demoData.defaults.token_budget,
      source: "fallback_default",
      wasCapped: false
    };
  }

  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 500) {
    return {
      ok: false,
      error: {
        code: "AICtxValidationFailed",
        message: "Token budget must be an integer greater than 500.",
        details: {
          field: "token_budget",
          minimumExclusive: 500,
          actual: typeof value === "number" ? value : null
        }
      }
    };
  }

  return {
    ok: true,
    value: Math.min(value, 50000),
    source: "explicit",
    wasCapped: value > 50000
  };
}

function buildLoadPreviewData(input: {
  task: string;
  mode: (typeof DEMO_MODES)[number];
  tokenBudget: number;
  tokenTargetSource: "explicit" | "fallback_default";
  wasCapped: boolean;
}) {
  const includedObjects = demoData.bootstrap.objects
    .filter((object) => object.status === "active" && object.type !== "source")
    .slice(0, 8);
  const includedIds = includedObjects.map((object) => object.id);
  const omittedIds = demoData.bootstrap.objects
    .filter((object) => !includedIds.includes(object.id))
    .map((object) => object.id);
  const contextPack = renderDemoContextPack(input.task, includedObjects);
  const estimatedTokens = estimateTokens(contextPack);

  return {
    task: input.task,
    token_budget: input.tokenBudget,
    mode: input.mode,
    context_pack: contextPack,
    source: {
      project: demoData.bootstrap.project.id,
      git_available: demoData.meta.git.available,
      branch: demoData.meta.git.branch,
      commit: demoData.meta.git.commit
    },
    token_target: {
      value: input.tokenBudget,
      source: input.tokenTargetSource,
      enforced: true,
      was_capped: input.wasCapped
    },
    estimated_tokens: estimatedTokens,
    budget_status: estimatedTokens <= input.tokenBudget ? "within_target" : "over_target",
    truncated: false,
    included_ids: includedIds,
    excluded_ids: [],
    omitted_ids: omittedIds
  };
}

function renderDemoContextPack(
  task: string,
  objects: readonly (typeof demoData.bootstrap.objects)[number][]
): string {
  const sections = objects.map((object) => [
    `## ${object.title}`,
    "",
    object.body.trim()
  ].join("\n"));

  return [
    "# AI Context Pack",
    "",
    `Task: ${task}`,
    "Generated from: curated public Todo App demo memory",
    "",
    "## Must know",
    "",
    "- The demo project is a local-first Todo App, not the Aictx repository itself.",
    "- Aictx stores this durable project memory as local, reviewable files.",
    "- This public demo is read-only and uses sanitized seed data.",
    "",
    ...sections
  ].join("\n");
}

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

function isReadOnlyBlockedRoute(pathname: string, method: string): boolean {
  return pathname === "/api/export/obsidian" ||
    pathname.endsWith("/export/obsidian") ||
    (method === "DELETE" && isProjectDeleteRoute(pathname));
}

function isProjectDeleteRoute(pathname: string): boolean {
  const prefix = "/api/projects/";
  const projectId = pathname.startsWith(prefix) ? pathname.slice(prefix.length) : "";

  return projectId !== "" && !projectId.includes("/");
}

function jsonOk(data: DemoEnvelopeData): Response {
  return Response.json({
    ok: true,
    data,
    warnings: [],
    meta: demoData.meta
  }, {
    headers: API_HEADERS
  });
}

function jsonError(status: number, error: DemoError, headers: HeadersInit = {}): Response {
  return Response.json({
    ok: false,
    error,
    warnings: []
  }, {
    status,
    headers: {
      ...API_HEADERS,
      ...headers
    }
  });
}
