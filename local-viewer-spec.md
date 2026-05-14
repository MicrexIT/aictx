# Aictx Local Viewer Spec

## 1. Purpose

This document defines the v1 local viewer for Aictx.

It owns:

* `aictx view` CLI behavior
* Local viewer server and browser API boundaries
* Bundled Svelte/Vite app expectations
* Memory browsing behavior
* Obsidian projection export action inside the viewer
* Explicit project memory deletion inside the viewer
* Viewer packaging and test expectations

This spec depends on:

* `prd.md`
* `storage-format-spec.md`
* `mcp-and-cli-api-spec.md`
* `indexing-and-context-compiler-spec.md`
* `runtime-and-project-architecture-spec.md`

This spec does not define:

* Canonical storage schemas
* Patch write semantics
* MCP tool contracts
* Obsidian projection file format details beyond invoking the existing export service

Those remain owned by the other specs.

## 2. Product Boundary

The local viewer is a human inspection surface for Aictx memory. It must make project memory easier to browse without becoming an editor, hosted app, Obsidian plugin, or knowledge-management system.

Rules:

* The viewer must not edit canonical `.aictx/memory/`, `.aictx/relations/`, `.aictx/events.jsonl`, config, schemas, hashes, or generated SQLite indexes.
* Allowed writes from the viewer are the explicit Obsidian export action and the explicit project deletion action. Project deletion permanently removes the target project's derived `.aictx/` directory and unregisters its project registry entry; it must not delete source files.
* The viewer must run locally, bind only to loopback, and require no cloud account, hosted service, telemetry, embeddings, external model API, or network dependency.
* The viewer may read the user-level project registry at `$AICTX_HOME/projects.json`, defaulting to `~/.aictx/projects.json`, to list initialized projects. The registry stores project roots and metadata only; canonical memory remains isolated per project.
* `aictx view`, `aictx lens`, and `aictx handoff` are CLI-only in v1. CLI-only capabilities are intentionally not MCP parity gaps.
* Do not add `aictx view`, `aictx lens`, or `aictx handoff` to MCP.
* Agents and integrations must use supported MCP or CLI entrypoints instead of editing `.aictx/` files directly when a supported entrypoint exists.
* No Obsidian plugin is part of v1. Users who want Obsidian can use the existing generated export through the CLI or viewer export action.

## 3. CLI Command

Syntax:

```bash
aictx view [--port <number>] [--open] [--detach] [--json]
```

Behavior:

* Do not require the launch cwd to be initialized. If it is initialized, include it as the current project in the dashboard even when it is not yet persisted in the registry.
* Resolve the same project root and Git metadata as other CLI commands.
* Bind the HTTP server to loopback only, using `127.0.0.1` by default.
* Use an available random port by default.
* When `--port <number>` is provided, bind only that port and fail if it is unavailable.
* Print the viewer URL to stdout.
* Keep running until interrupted by the user or process shutdown.
* `--open` may launch the default browser after the server starts; failure to open the browser should be a warning, not a server startup failure.
* The printed and opened URL must include a per-run token required by the local API.
* The command must not mutate canonical memory while starting or serving the viewer.

`--json` behavior:

* `aictx view --json` should print the same shared response envelope after the server is listening.
* Success data must include `url`, `host`, `port`, `token_required`, `open_attempted`, `registry_path`, `projects_count`, and `initial_project_registry_id`.
* The command still remains a long-running server process after printing the startup result.

## 4. Local Server API

The viewer server is an implementation detail of `aictx view`, not a public remote API.

Rules:

* Bind only to loopback and never to `0.0.0.0`.
* Do not enable CORS.
* Require the per-run token for every `/api/*` request.
* Serve only the bundled viewer assets and defined local API routes.
* Reject unsupported methods with `405`.
* Return JSON errors using the existing Aictx error shape where practical.
* Do not expose arbitrary filesystem reads, shell execution, Git operations, or generic debug endpoints.

Required routes:

```text
GET /api/projects
DELETE /api/projects/:registryId
GET /api/projects/:registryId/bootstrap
POST /api/projects/:registryId/export/obsidian
GET /api/bootstrap
POST /api/export/obsidian
```

`GET /api/projects` returns:

* Registry path.
* Registered project summaries including registry id, local project id/name, roots, source, timestamps, availability, counts, Git state, and warnings.
* Aggregate project counts.
* Current project registry id when the launch cwd is initialized.

Project-scoped bootstrap and export routes behave like their legacy routes but resolve the target project from the registry id.

`DELETE /api/projects/:registryId`:

* Resolves the target project from the current project or project registry.
* Derives the `.aictx/` path from `project_root`.
* Permanently deletes that `.aictx/` directory without backup.
* Removes the matching entry from `$AICTX_HOME/projects.json`.
* Treats an already-missing `.aictx/` directory as a successful stale registry cleanup.
* Must not delete source files or any path outside the derived `.aictx/` directory.

`GET /api/bootstrap` returns:

* Project metadata from the shared response `meta`.
* Viewer-readable object summaries including id, type, status, title, paths, scope, tags, timestamps, and body.
* Relation summaries including id, from, predicate, to, status, confidence, evidence, timestamps, and JSON path.
* Counts for objects, relations, source objects, synthesis objects, stale/superseded objects, and active relations.
* Storage/read warnings.

`POST /api/export/obsidian`:

* Accepts optional JSON body `{ "outDir": "<project-relative-dir>" }`.
* Calls the existing Obsidian projection export application service.
* Writes generated projection files only.
* Returns the same export data as `aictx export obsidian --json`.
* Must not read generated Obsidian output as canonical input.

## 5. Viewer App

The bundled app is a Svelte/Vite app packaged with the CLI.

Required first-screen layout:

* Persistent viewer navigation with Projects, Memories, and Export sections.
* Projects dashboard listing registered projects.
* No selected project or document by default.

Required features:

* Search memory objects client-side by title, id, type, status, tags, facets, evidence, and body text.
* Filter by type, status, tag, and memory layer: atomic memories, syntheses, sources, or stale/superseded.
* Selecting a memory object opens a focused detail view.
* Detail view provides a Back action that returns to the filtered object list.
* Show canonical Markdown body for the selected object.
* Render Markdown with raw HTML disabled or sanitized.
* Show sidecar JSON and raw paths/timestamps for the selected object in collapsed technical details.
* Show incoming and outgoing related memories before raw relation details.
* Show provenance links in detail view, including source evidence and `derived_from`, `summarizes`, or `documents` relations.
* Provide a dedicated relation graph screen with current active objects and active relations by default, plus an explicit all-memory scope.
* Keep lens and role coverage data available through existing read-only services without showing guided-view panels above canonical objects.
* Let users trigger the Obsidian projection export and see success/failure output.
* Let users explicitly delete a project's Aictx memory root after confirming the project name.
* Let users return from a selected project to the Projects dashboard.

Non-goals:

* Editing memory.
* Creating, deleting, superseding, or marking individual memory objects stale.
* Graph visualization as the primary UX.
* File watching or live reload of canonical memory.
* Cross-project merged search or combined memory browsing.
* Hosted sharing or team review workflows.
* Obsidian plugin installation or two-way Obsidian sync.

## 6. Build and Packaging

The package remains a single Node.js package.

Expected implementation shape:

```text
viewer/
  package files and Svelte/Vite source
src/viewer/
  local server and API adapter code
dist/viewer/
  built static viewer assets
```

Rules:

* The viewer build must be deterministic and run as part of the package build before packaging.
* The packed npm package must include built viewer assets.
* Runtime must not require Vite, Svelte compiler, or source assets to serve the viewer.
* Server code must serve static assets from packaged `dist/viewer/`.
* Viewer dependencies must not introduce hosted services, telemetry, API keys, or external network calls.

## 7. Tests and Acceptance

Required test coverage:

* Capability guardrails include `aictx view` as CLI-only and prove it is not exposed through MCP.
* Spec mirror guardrails include `local-viewer-spec.md`.
* `aictx view` starts on loopback, prints a usable URL, and rejects remote binding.
* Port selection works for random ports and explicit available ports.
* Startup fails clearly for an unavailable explicit port.
* API requests without the per-run token fail.
* `GET /api/bootstrap` reads canonical storage and does not mutate canonical files.
* Init-created starter project and architecture placeholders render with a first-run bootstrap notice.
* Guided lens and role coverage APIs remain read-only even when the main viewer does not show guided panels.
* Client-side search/filter returns expected visible objects.
* Markdown rendering does not execute raw HTML.
* Graph screen renders visible nodes and relation links, supports fit/reset/zoom controls, and exposes selected node or edge details.
* Obsidian export action writes generated projection files only and does not mutate canonical memory.
* Project deletion requires confirmation, removes the target `.aictx/` directory, unregisters the project, preserves source files, and handles stale registry entries whose `.aictx/` directory is already missing.
* Packed package includes viewer assets and can serve them.
* Browser smoke test loads the page without console errors.

The viewer foundation is complete when a user can run `aictx view`, open the printed local URL, search and inspect project memory, see direct relation context, optionally regenerate the Obsidian projection, and explicitly remove a project memory root without editing individual canonical Aictx memory objects.
