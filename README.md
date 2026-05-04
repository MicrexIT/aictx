# Aictx

Aictx is local-first project memory for AI coding agents.

It gives an agent a durable place to store project facts, decisions, warnings,
and context that should survive beyond a single chat. Memory is stored under
`.aictx/` as reviewable local files, indexed into SQLite for fast retrieval, and
kept compatible with Git workflows when the project is inside a Git worktree.

The normal loop is:

```text
load relevant memory -> do work -> save durable memory -> review .aictx changes
```

Aictx does not require a cloud account, embeddings, hosted sync, an external
model API, or network access for core memory commands.

## Install

Aictx requires Node.js `>=22`.

Install it globally for the simplest CLI and MCP setup:

```bash
npm install -g @aictx/memory
```

Global install is the recommended default for regular CLI use and optional MCP
use. You do not need to add Aictx to each project's `package.json` unless you
want that project to pin its own Aictx version.

For project-local version pinning, install Aictx as a dev dependency:

```bash
pnpm add -D @aictx/memory
```

Or with npm:

```bash
npm install -D @aictx/memory
# equivalent long form:
npm install --save-dev @aictx/memory
```

The package provides two binaries:

* `aictx`: the command-line interface
* `aictx-mcp`: the MCP stdio server for AI coding clients

If the package is installed locally instead of globally, run commands through
your package manager:

```bash
pnpm exec aictx init
pnpm exec aictx load "fix Stripe webhook retries"
npm exec aictx init
./node_modules/.bin/aictx init
```

For one-off execution without a global or local install, name the scoped package
explicitly:

```bash
pnpm --package @aictx/memory dlx aictx init
npx --package @aictx/memory -- aictx init
```

The examples below use `aictx` directly for readability. If `aictx` is not on
`PATH`, use the project package-manager form, such as `pnpm exec aictx`,
`npm exec aictx`, or `./node_modules/.bin/aictx`. For one-off `npx` usage, name
the package explicitly with `npx --package @aictx/memory -- aictx`.
Package-manager and local-binary fallbacks are version-sensitive: if a local
install is stale, update it or use a current global/source binary before
trusting schema errors.

## Local Package Testing

For a fast local confidence check before publishing or trying the package in
another project, run:

```bash
pnpm test:local
```

This type-checks the source and runs the package smoke test. The smoke test
uses the current build output, building it first if the required artifacts are
missing, creates the same tarball `pnpm publish` would publish, installs that
tarball into a clean temporary project, runs the installed `aictx` binary,
serves the installed viewer assets, and starts the installed `aictx-mcp` server
through the MCP client.

To run only the packed-artifact smoke test:

```bash
pnpm test:package
```

Use `pnpm test` when you need the full unit and integration suite.

## Mental Model

`.aictx/` contains canonical memory and generated support files.

Canonical memory is the durable source of truth. It includes human-readable
Markdown bodies, JSON sidecars with structured metadata, relation JSON files,
and `events.jsonl` for semantic memory history. These files are meant to be
reviewed like source code.

Generated state is rebuildable. The SQLite search index, context packs, and
exports can be regenerated from canonical memory. Do not hand-edit generated
state when a supported Aictx command can produce it.

Memory writes use structured patches. An agent or user submits a JSON patch
that says what memory should be created, updated, deleted, or linked. Aictx
validates the patch, checks safety rules, writes canonical files, appends
events, and updates generated indexes.

The CLI is the default path for routine agent memory work. MCP is a supported
integration path when the agent client has already launched and connected to
`aictx-mcp`. The CLI is also the complete path for setup, maintenance,
inspection, recovery, suggestion, audit, local viewing, and export workflows.
CLI-only commands are intentional; they are not MCP parity gaps.
MCP exposes exactly `load_memory`, `search_memory`, `save_memory_patch`, and
`diff_memory` in v1.

Aictx is a memory discipline system, not just storage. Load narrowly before
non-trivial work, save only durable knowledge, prefer updating or
stale/supersede changes over duplicate creation, prefer current code and user
requests over loaded memory when they conflict, review memory diffs, and save
nothing when the task produced no durable future value.

Short linked memory works best: keep one durable claim per object, use concise
body text and useful tags, and add relations such as `requires`, `depends_on`,
`affects`, or `supersedes` only when the link helps future agents. Prefer
`update_object` for existing memory, `mark_stale` for wrong memory with no
single replacement, and `supersede_object` when a new object replaces an old
one. Save-nothing-is-valid: if a task produced no reusable project knowledge,
do not create a memory patch.

V1 object types are `project`, `architecture`, `decision`, `constraint`,
`question`, `fact`, `gotcha`, `workflow`, `note`, and `concept`. Use `gotcha`
for known failure modes and `workflow` for repeated project procedures. Do not
create `history` or `task-note` object types; use Git/events/statuses for
history and branch/task scope for temporary task context.

Track product features as `concept` memory with the `product-feature` facet.
Use tags such as `feature`, `product`, and domain terms; use `active` for
present features, `mark_stale` for removed features, and `supersede_object`
when one feature replaces another. When deterministic bootstrap evidence
creates product-feature concepts, link the project to each feature with an
`implements` relation so graph browsing and one-hop retrieval can reach them.

## Quickstart

Initialize memory storage inside an existing project:

```bash
aictx init
# only when intentionally discarding existing Aictx storage:
aictx init --force
```

If `aictx` is not on `PATH`, use a project-local command instead:

```bash
pnpm exec aictx init
npm exec aictx init
./node_modules/.bin/aictx init
```

For one-off execution without installing first:

```bash
npx --package @aictx/memory -- aictx init
```

By default, init also creates or updates marked Aictx sections in `AGENTS.md`
and `CLAUDE.md` so coding agents are told to load memory before non-trivial
work and save durable memory after meaningful work. Use
`aictx init --no-agent-guidance` to skip those repo instruction files.
Use `aictx init --force` only when you explicitly want to discard existing
Aictx storage and start from scratch.

After init, the viewer will show linked starter project and architecture
placeholders until richer memory is seeded.

For first-run onboarding, use the guided setup flow:

```bash
aictx setup
aictx setup --apply
```

For a manual review flow, ask Aictx for a proposed seed-memory patch, review it,
then save it explicitly:

```bash
aictx suggest --bootstrap --patch > bootstrap-memory.json
aictx patch review bootstrap-memory.json
# optionally edit bootstrap-memory.json
aictx save --file bootstrap-memory.json
aictx check
aictx diff
```

`aictx init` does not infer rich semantic memory from the repository. The
bootstrap patch remains reviewable and is not saved until `aictx save` applies
it. Agent guidance treats setup, onboarding, and "why is memory empty?" requests
as enough context to run this bootstrap workflow proactively.

Copy and paste this prompt into an AI coding agent to set up a repository:

```text
Set up fresh Aictx memory for this Aictx source repository.

First reinstall the current Aictx package globally:
npm install -g @aictx/memory@0.1.18

Then reset the local `.aictx/` state with the Aictx CLI:
aictx reset

Run the initial onboarding and apply the conservative bootstrap memory patch:
aictx setup --apply

Validate and review the generated memory:
aictx check
aictx diff

Start the local viewer:
aictx view --open

Do not manually edit `.aictx/`; report any Aictx errors and the viewer URL.
```

Before a task, load relevant memory:

```bash
aictx load "fix Stripe webhook retries"
aictx load "fix Stripe webhook retries" --mode debugging
```

After meaningful work, save durable project memory with a structured patch:

```bash
aictx save --stdin <<'JSON'
{
  "source": {
    "kind": "agent",
    "task": "Document billing retry behavior"
  },
  "changes": [
    {
      "op": "create_object",
      "type": "note",
      "title": "Billing retries run in the worker",
      "body": "Billing retry execution happens in the queue worker, not inside the HTTP webhook handler.",
      "tags": ["billing", "stripe", "webhooks"]
    }
  ]
}
JSON
```

Review the generated `.aictx/` file changes before committing them. In Git
projects, use:

```bash
aictx diff
```

Aictx never creates Git commits automatically. Commit useful `.aictx/` changes
alongside the code changes they describe.

## CLI Command Reference

All CLI commands render human-readable output by default. Add `--json` to get
the structured response envelope for automation:

```bash
aictx check --json
```

Use built-in help to see the command list for the installed build:

```bash
aictx --help
aictx load --help
```

Print the installed version:

```bash
aictx --version
```

### Setup And Maintenance

#### `aictx init`

Initializes `.aictx/` in the current project.

```bash
aictx init
# only when intentionally discarding existing Aictx storage:
aictx init --force
```

This creates the canonical storage layout, copies the JSON schemas Aictx uses
for validation, builds the generated index when available, and may update
`.gitignore` for rebuildable state. It does not start the MCP server. Run this
once per project, then configure your MCP client separately if you want MCP
tools. Use `--force` only to discard existing Aictx storage and initialize a
fresh starter state.

#### `aictx check`

Validates canonical memory and generated index health.

```bash
aictx check
aictx check --json
```

Use this when reviewing memory changes, diagnosing a broken `.aictx/` directory,
or checking for invalid JSON, schema errors, conflict markers, hash issues, or
secret-like content.

#### `aictx rebuild`

Rebuilds generated indexes from canonical memory.

```bash
aictx rebuild
```

Use this when the generated SQLite index is missing, stale, or suspected to be
wrong. Rebuild does not change canonical memory.

#### `aictx reset`

Backs up and clears local `.aictx/` storage.

```bash
aictx reset
aictx reset --destroy
```

Default reset writes a timestamped archive under `.aictx/.backup/`, then clears
the rest of `.aictx/` while preserving the backup directory. Use `--destroy`
only when you intentionally want to delete `.aictx/` entirely without creating
a backup.

### Routine Memory Work

#### `aictx load <task>`

Compiles task-specific memory into a context pack.

```bash
aictx load "fix Stripe webhook retries"
```

The task text tells Aictx what context to retrieve and rank. The output is a
Markdown context pack intended to be read by a human or pasted into an agent
when MCP is unavailable.

You can pass an explicit token target:

```bash
aictx load "fix Stripe webhook retries" --token-budget 6000
```

`--token-budget` is optional and advisory. It gives Aictx a packaging target,
not a hard limit. If you omit it, Aictx does not compress context because of a
missing budget.

`--mode` is optional and defaults to `coding`. Planned modes are `coding`,
`debugging`, `review`, `architecture`, and `onboarding`; modes tune deterministic
ranking and rendering without loading the whole project.

#### `aictx suggest`

Builds a deterministic memory review packet without writing memory.

```bash
aictx suggest --from-diff --json
aictx suggest --bootstrap --json
aictx suggest --bootstrap --patch > bootstrap-memory.json
```

`--from-diff` is Git-required and packages changed files, related memory, stale
candidates, and an agent checklist. `--bootstrap` lists likely source files and
seed memory classes for a first-run project memory pass. Add `--patch` with
`--bootstrap` to generate a proposed structured patch suitable for review and
`aictx save --file`; it remains read-only until saved explicitly. Bootstrap
product-feature concepts are linked from the project with `implements` when the
feature evidence is deterministic.

#### `aictx audit`

Reports deterministic memory hygiene findings without writing memory.

```bash
aictx audit --json
```

Audit findings include severity, rule, memory ID, message, and evidence. Agents
can turn findings into structured memory patches through `aictx save` or
`save_memory_patch`.

#### `aictx save --stdin`

Reads a structured memory patch from standard input and applies it.

```bash
aictx save --stdin < memory-patch.json
```

This is the CLI equivalent of the MCP `save_memory_patch` tool. It validates the
patch, rejects unsafe patch input, updates canonical memory files, appends
events, and refreshes generated indexes. Dirty touched memory files are backed
up under `.aictx/recovery/` before overwrite or delete, then the save continues
where possible.

#### `aictx save --file <path>`

Reads a structured memory patch from a JSON file and applies it.

```bash
aictx save --file memory-patch.json
```

Use this when you want to inspect or generate the patch file before applying it.
Exactly one of `--stdin` or `--file` is required.

#### `aictx search <query>`

Searches local Aictx memory through the generated SQLite index.

```bash
aictx search "webhook retries"
aictx search "webhook retries" --limit 5
```

Use search when you need matching memory objects but do not need a full task
context pack. `--limit` caps the number of matches returned.

### Inspection And Debugging

#### `aictx inspect <id>`

Shows one memory object and its direct relations.

```bash
aictx inspect obj_123
```

Use this when search or load gives you an object ID and you want the full body,
metadata paths, tags, and incoming or outgoing relation summaries.

#### `aictx stale`

Lists stale, superseded, and rejected memory.

```bash
aictx stale
```

Use this to find memory that should not normally be used as current project
truth, but may still matter for audit history or cleanup.

#### `aictx graph <id>`

Shows the one-hop relation neighborhood around a memory object.

```bash
aictx graph obj_123
```

Use this to debug why related memories appear together or to inspect how facts,
decisions, constraints, and notes are linked.

### Git Review And Recovery

These commands require Git because they use Git history and Aictx-scoped diffs under
`.aictx/`.

#### `aictx diff`

Shows Aictx memory changes, including untracked memory files.

```bash
aictx diff
```

Use this before committing to review what an agent or CLI command changed under
`.aictx/`. It includes untracked Aictx memory files that plain
`git diff -- .aictx/` can omit.

#### `aictx history`

Shows Git history scoped to Aictx memory files.

```bash
aictx history
aictx history --limit 10
```

Use this to find when memory changed and which commit to restore from.
`--limit` caps the number of commits returned.

#### `aictx restore <commit>`

Restores Aictx memory files from a specific Git commit.

```bash
aictx restore abc1234
```

Use this when you know the commit whose `.aictx/` state you want. Restore is
scoped to Aictx memory files and rebuilds the generated index afterward when
possible.

#### `aictx rewind`

Restores Aictx memory files to the previous committed state.

```bash
aictx rewind
```

Use this as the convenience recovery command when recent memory changes should
be discarded and the last committed `.aictx/` state is the desired state.

### Export

#### `aictx export`

`export` is a command namespace for generated projections. Run the concrete
export command below for an actual export.

```bash
aictx export --help
```

#### `aictx export obsidian`

Writes a generated Obsidian-compatible projection from canonical memory.

```bash
aictx export obsidian
aictx export obsidian --out notes/aictx
```

By default, the projection is written under `.aictx/exports/obsidian/`. Use
`--out <dir>` to choose another output directory inside the project root. This
does not mutate canonical memory.

### Local Viewer

#### `aictx view`

Starts the local read-only memory viewer.

```bash
aictx view
aictx view --open
aictx view --port 4888
aictx view --json
```

The command requires an initialized `.aictx/` directory, binds only to
`127.0.0.1`, chooses an available random port by default, and prints a local URL
that includes a per-run API token. Open that URL in a browser to inspect memory.
Use `--port <number>` when you need a fixed loopback port, and `--open` when you
want Aictx to try launching the default browser after the server starts.

Inside the viewer, the default Memories screen shows a centered searchable list
with type, status, and tag filters. Selecting an object opens a focused detail
view with its canonical Markdown body, readable incoming and outgoing related
memories, a direct-neighborhood connection map, and collapsed technical details
for raw JSON, paths, and timestamps. Use Back to return to the filtered list.

The viewer does not edit canonical memory. The only write action in the viewer
is the explicit Obsidian export screen, which calls the same generated
projection service as `aictx export obsidian` and writes generated projection
files only.

`aictx view --json` prints the shared startup envelope after the server is
listening. The command remains a long-running local server process until it is
interrupted.

## MCP Setup

`aictx init` does not start the MCP server. Configure your MCP client to start
`aictx-mcp`. A globally installed `aictx-mcp` can be started once and reused
across projects by passing `project_root` to routine MCP tools. When
`project_root` is omitted, tools keep the legacy behavior and resolve the
project from the MCP server process current working directory.

Memory remains isolated by default. Each project keeps its own `.aictx/`
directory, generated index, lock file, and Git-aware provenance. A global MCP
server switches projects only for the specific tool call that names a
`project_root`.

`aictx-mcp` is an MCP stdio server: the MCP client must launch it and connect to
its stdin/stdout. An agent generally cannot start `aictx-mcp` in a shell and
then use it as MCP tools in an already-running session. When MCP is not
configured, agents should stay on the CLI path.

Example command configuration:

```json
{
  "command": "aictx-mcp"
}
```

Then target a project in MCP calls:

```text
load_memory({
  project_root: "/path/to/your/project",
  task: "fix Stripe webhook retries"
})
```

When installed as a local dev dependency, configure the client to run through
your package manager if the client supports command arguments:

```json
{
  "command": "npm",
  "args": ["exec", "aictx-mcp"],
  "cwd": "/path/to/your/project"
}
```

With pnpm:

```json
{
  "command": "pnpm",
  "args": ["exec", "aictx-mcp"],
  "cwd": "/path/to/your/project"
}
```

Other local-install options are equivalent when the client supports command
arguments:

```json
{
  "command": "npx",
  "args": ["--package", "@aictx/memory", "--", "aictx-mcp"],
  "cwd": "/path/to/your/project"
}
```

Or use the local binary path directly:

```json
{
  "command": "./node_modules/.bin/aictx-mcp",
  "cwd": "/path/to/your/project"
}
```

In command-line form, the local MCP launch commands are
`pnpm exec aictx-mcp`, `npm exec aictx-mcp`, or
`./node_modules/.bin/aictx-mcp`. For one-off `npx` usage, run
`npx --package @aictx/memory -- aictx-mcp`.

### MCP Tools

#### `load_memory`

Compiles task-specific Aictx memory into a context pack.

Inputs:

* `task`: task description to compile context for
* `token_budget`: optional advisory token target
* `mode`: optional compiler mode, defaulting to coding behavior
* `project_root`: optional project root for globally launched MCP servers

Use this before non-trivial agent work.

#### `search_memory`

Searches local memory through the generated SQLite index.

Inputs:

* `query`: search query
* `limit`: optional maximum number of matches
* `project_root`: optional project root for globally launched MCP servers

Use this when an agent needs targeted memory results without a full context
pack.

#### `save_memory_patch`

Validates and applies a structured Aictx memory patch.

Inputs:

* `patch`: structured memory patch object
* `project_root`: optional project root for globally launched MCP servers

Use this after meaningful work to save durable facts, decisions, constraints,
or stale-memory updates when the agent client already exposes Aictx MCP tools.

#### `diff_memory`

Returns Aictx memory changes, including untracked memory files. The output is
diff-shaped for review and includes files that plain `git diff -- .aictx/` can
omit before staging.

Inputs: none.

Optional input:

* `project_root`: optional project root for globally launched MCP servers

Use this when an agent or user needs to review pending `.aictx/` changes through
MCP.

## Capability Map

V1 parity means every supported Aictx capability is reachable to agents through
MCP or CLI. It does not mean MCP and CLI expose identical command lists.

| Capability | MCP | CLI | Notes |
| --- | --- | --- | --- |
| Load task context | `load_memory` | `aictx load` | Default routine agent path is CLI; MCP equivalent is supported when configured. |
| Search memory | `search_memory` | `aictx search` | Default routine agent path is CLI; MCP equivalent is supported when configured. |
| Save memory patch | `save_memory_patch` | `aictx save` | All writes use structured patches. |
| Show memory diff | `diff_memory` | `aictx diff` | Git-backed; CLI is the default review path. |
| Initialize storage | none | `aictx init`, `aictx setup` | Setup remains CLI-only in v1. |
| Review patch file | none | `aictx patch review` | Patch review remains CLI-only in v1. |
| Validate storage | none | `aictx check` | Maintenance remains CLI-only in v1. |
| Rebuild generated index | none | `aictx rebuild` | Maintenance remains CLI-only in v1. |
| Reset local storage | none | `aictx reset` | Destructive maintenance remains CLI-only in v1. |
| Show memory history | none | `aictx history` | Recovery and inspection remain CLI-only in v1. |
| Restore memory | none | `aictx restore` | Recovery remains CLI-only in v1. |
| Rewind memory | none | `aictx rewind` | Recovery remains CLI-only in v1. |
| Inspect object | none | `aictx inspect` | Debug inspection remains CLI-only in v1. |
| List stale memory | none | `aictx stale` | Debug inspection remains CLI-only in v1. |
| Show graph neighborhood | none | `aictx graph` | Debug inspection remains CLI-only in v1. |
| Export Obsidian projection | none | `aictx export obsidian` | Generated projection remains CLI-only in v1. |
| View local memory | none | `aictx view` | Local read-only viewer remains CLI-only in v1. |
| Suggest memory review packet | none | `aictx suggest` | Agent assistance remains CLI-only in v1. |
| Audit memory hygiene | none | `aictx audit` | Deterministic hygiene review remains CLI-only in v1. |

CLI-only capabilities are not MCP parity gaps and should not be added to MCP
solely to mirror CLI commands. Agents should use supported MCP tools or CLI
commands instead of editing `.aictx/` files directly unless the user explicitly
asks for a direct file edit.

## Files And Review

Canonical memory lives in `.aictx/`:

* Markdown files hold human-readable memory bodies.
* JSON sidecars hold structured metadata.
* Relation JSON files describe links between memory objects.
* `events.jsonl` records semantic memory history.

Generated files are rebuildable:

* SQLite indexes support search and context loading.
* Context packs are compiled views for a specific task.
* Export directories are projections for tools such as Obsidian.

In Git projects, commit useful `.aictx/` changes alongside the code changes they
describe. Aictx never creates Git commits automatically.

## Agent Guidance

`aictx init` installs concise repo-level guidance in `AGENTS.md` and
`CLAUDE.md` by default. Generated guidance files are also available for agent
clients that support skills or copyable instruction files:

* [Codex skill](integrations/codex/aictx/SKILL.md)
* [Claude skill](integrations/claude/aictx/SKILL.md)
* [Claude guidance](integrations/claude/aictx.md)
* [Generic agent instructions](integrations/generic/aictx-agent-instructions.md)

These files are generated from
[integrations/templates/agent-guidance.md](integrations/templates/agent-guidance.md).

Codex users can enable a skill folder with `skills.config[].path` in Codex
configuration. Claude Code users can use a project skill under
`.claude/skills/aictx-memory/SKILL.md`. Aictx does not install client-specific
skills or edit user-global agent configuration by default.

Generated guidance tells agents to use CLI commands by default and to use MCP
only when the client already exposes Aictx MCP tools. It also documents
package-manager fallbacks when `aictx` or `aictx-mcp` is not on `PATH`,
including `pnpm exec`, `npm exec`, `./node_modules/.bin/`, and explicit
scoped-package `npx --package` commands, with a warning that stale local
installs can produce misleading schema errors.

## Development

Install dependencies:

```bash
pnpm install
```

Repository commands:

| Command | What it does |
| --- | --- |
| `pnpm build` | Runs the full package build: generated agent guidance, TypeScript bundling, schema copying, and viewer asset build. |
| `pnpm build:code` | Bundles the CLI and MCP server with `tsup`. |
| `pnpm build:schemas` | Copies JSON schema files into the build output. |
| `pnpm build:guidance` | Regenerates agent guidance files under `integrations/`. |
| `pnpm build:viewer` | Builds the bundled local viewer assets into `dist/viewer/`. |
| `pnpm dev` | Runs the CLI from TypeScript sources with `tsx`. Pass CLI arguments after `--`, for example `pnpm dev -- load "task"`. |
| `pnpm dev:mcp` | Runs the MCP stdio server from TypeScript sources with `tsx`. |
| `npm run version:patch` | Runs `npm version patch --no-git-tag-version`, pins the README setup prompt install command to the new package version, and regenerates `src/generated/version.ts`. |
| `pnpm test` | Runs the Vitest test suite once. |
| `pnpm test:package` | Builds and verifies the packed package, including installed CLI, MCP, and viewer assets. |
| `pnpm test:watch` | Runs Vitest in watch mode for local development. |
| `pnpm typecheck` | Runs TypeScript type checking without emitting files. |

Useful local examples:

```bash
pnpm dev --help
pnpm dev -- load "document the restore flow"
pnpm test
pnpm typecheck
```

## Use The Local Package In Another Repo

Use the packed tarball when testing Aictx in another local project. This uses
the same package artifact that would be published to npm.

From this repo:

```bash
cd /path/to/aictx
pnpm build
mkdir -p /tmp/aictx-pack
pnpm pack --pack-destination /tmp/aictx-pack
```

This creates a tarball such as:

```bash
/tmp/aictx-pack/aictx-memory-0.1.4.tgz
```

Then install it in the other repo:

```bash
cd /path/to/other/repo
pnpm add -D /tmp/aictx-pack/aictx-memory-0.1.4.tgz
pnpm exec aictx --version
pnpm exec aictx init
```

With npm:

```bash
cd /path/to/other/repo
npm install --save-dev /tmp/aictx-pack/aictx-memory-0.1.4.tgz
npx --package /tmp/aictx-pack/aictx-memory-0.1.4.tgz -- aictx --version
```

After rebuilding Aictx locally, reinstall the tarball in the consumer repo:

```bash
cd /Users/micrex/Dev/remics/projects/aictx
pnpm build
pnpm pack --pack-destination /tmp/aictx-pack

cd /path/to/other/repo
pnpm remove @aictx/memory
pnpm add -D /tmp/aictx-pack/aictx-memory-0.1.4.tgz
```

Prefer this over `pnpm link` or `npm link` for package validation, because the
published binaries point at `dist/` and the tarball verifies the built files,
schemas, docs, integrations, and `bin` entries exactly as a real install would.
