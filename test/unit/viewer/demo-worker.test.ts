import { describe, expect, it } from "vitest";

import worker, { type DemoWorkerEnv } from "../../../src/viewer/demo-worker.js";

const env: DemoWorkerEnv = {
  ASSETS: {
    fetch: async (request: Request) => new Response(`asset:${new URL(request.url).pathname}`)
  }
};

describe("viewer demo Worker", () => {
  it("serves the seeded projects route for the public demo token", async () => {
    const response = await worker.fetch(request("/api/projects?token=demo"), env);
    const body = await response.json() as {
      ok: true;
      data: {
        projects: Array<{ registry_id: string; available: boolean }>;
        current_project_registry_id: string | null;
      };
    };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.current_project_registry_id).toBe("demo");
    expect(body.data.projects).toHaveLength(1);
    expect(body.data.projects[0]).toMatchObject({
      registry_id: "demo",
      available: true
    });
  });

  it("serves seeded bootstrap data with objects and relations", async () => {
    const response = await worker.fetch(request("/api/projects/demo/bootstrap?token=demo"), env);
    const body = await response.json() as {
      ok: true;
      data: {
        objects: Array<{ id: string }>;
        relations: Array<{ from: string; to: string }>;
      };
    };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.objects.map((object) => object.id)).toContain("synthesis.product-intent");
    expect(body.data.relations.length).toBeGreaterThan(0);
  });

  it("serves read-only load previews", async () => {
    const response = await worker.fetch(request("/api/projects/demo/load-preview?token=demo", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        task: "try the public demo",
        mode: "coding",
        token_budget: 1600
      })
    }), env);
    const body = await response.json() as {
      ok: true;
      data: {
        task: string;
        mode: string;
        context_pack: string;
        included_ids: string[];
        token_budget: number;
      };
    };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.task).toBe("try the public demo");
    expect(body.data.mode).toBe("coding");
    expect(body.data.token_budget).toBe(1600);
    expect(body.data.context_pack).toContain("AI Context Pack");
    expect(body.data.included_ids.length).toBeGreaterThan(0);
  });

  it("requires the demo token for API routes", async () => {
    const response = await worker.fetch(request("/api/projects"), env);
    const body = await response.json() as { ok: false; error: { code: string } };

    expect(response.status).toBe(401);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("AICtxValidationFailed");
  });

  it("blocks write routes in the public demo", async () => {
    const response = await worker.fetch(request("/api/projects/demo/export/obsidian?token=demo", {
      method: "POST"
    }), env);
    const body = await response.json() as { ok: false; error: { message: string } };

    expect(response.status).toBe(403);
    expect(body.ok).toBe(false);
    expect(body.error.message).toContain("read-only");
  });

  it("passes non-API requests through to static assets", async () => {
    const response = await worker.fetch(request("/?token=demo"), env);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("asset:/");
  });
});

function request(path: string, init?: RequestInit): Request {
  return new Request(`https://demo.aictx.dev${path}`, init);
}
