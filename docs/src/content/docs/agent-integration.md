---
title: Agent integration
description: How Aictx fits into a coding-agent workflow.
---

Aictx gives coding agents a local project-memory loop:

```text
load memory -> work -> save durable memory
```

The v1 agent model is CLI-first and MCP-compatible. Use the CLI by default. Use
MCP only when the agent client has already launched and connected to
`aictx-mcp`.

Aictx does not infer durable project meaning from diffs. The agent is
responsible for semantic judgment: reading the task, loaded context, repository
changes, tests, and conversation context, then deciding what future agents
should remember.

## Routine workflow

Before non-trivial coding, architecture, debugging, dependency, or
configuration work:

```bash
aictx load "<task summary>"
aictx load "<task summary>" --mode debugging
aictx load "<task summary>" --file src/context/rank.ts --changed-file src/index/search.ts --history-window 30d
```

MCP equivalents are available only when the client already exposes Aictx MCP
tools:

```text
load_memory({ task: "<task summary>", mode: "coding" })
load_memory({
  task: "<task summary>",
  mode: "coding",
  hints: {
    files: ["src/context/rank.ts"],
    changed_files: ["src/index/search.ts"],
    subsystems: ["retrieval"],
    history_window: "30d"
  }
})
```

Load modes are `coding`, `debugging`, `review`, `architecture`, and
`onboarding`. Modes tune deterministic ranking and rendering only.

After meaningful work, save durable knowledge that future agents should know:

```bash
aictx remember --stdin
```

MCP equivalent when available:

```text
remember_memory({ task, memories, updates, stale, supersede, relations })
```

`remember` is the normal intent-first write path. It converts semantic agent
input into the structured patch format internally. Use `aictx save --stdin` or
`save_memory_patch({ patch })` only for advanced patch-shaped writes.

Saved memory is active immediately after Aictx validates and writes it. Dirty
or untracked `.aictx/` files are not by themselves a reason to skip saving
durable memory. When a save overwrites or deletes a dirty touched file, Aictx
first backs it up under `.aictx/recovery/`.

Accepted memory can be inspected later:

```bash
aictx view
aictx diff
```

`aictx diff` includes tracked and untracked Aictx memory changes in Git
projects. Aictx writes local files and never commits automatically.

When `aictx` is not on `PATH`, the same commands can run through the project
package manager or local binary:

```bash
pnpm exec aictx load "<task summary>"
npm exec aictx load "<task summary>"
./node_modules/.bin/aictx load "<task summary>"
npx --package @aictx/memory -- aictx load "<task summary>"
pnpm exec aictx-mcp
npm exec aictx-mcp
./node_modules/.bin/aictx-mcp
npx --package @aictx/memory -- aictx-mcp
```

:::tip
Save nothing when the task produced no durable future value. Aictx is meant to
reduce repeated context work, not record every step an agent took.
:::

## Capability reference

The v1 agent model is CLI-first and MCP-compatible.

Local MCP exposes exactly `load_memory`, `search_memory`, `inspect_memory`,
`remember_memory`, `save_memory_patch`, and `diff_memory`. Setup, lenses,
handoff, maintenance, recovery, export, registry, viewer, docs, suggest, audit,
wiki, and stale workflows are CLI-only in v1. Graph inspection is available in the
CLI and local viewer, but remains outside MCP. Non-MCP capabilities are v1
surfaces, not MCP parity gaps.

Local MCP is the near-term integration path for local agent harnesses. Remote
MCP, hosted sync, cloud auth, cloud hosting, and ChatGPT App SDK UI remain
future work. Future ChatGPT-compatible `search`/`fetch` names are adapter
aliases over search/inspect behavior, not local MCP tool names.

| Capability | MCP | CLI |
| --- | --- | --- |
| Load task context | `load_memory` | `aictx load` |
| Search memory | `search_memory` | `aictx search` |
| Inspect object | `inspect_memory` | `aictx inspect` |
| Remember durable context | `remember_memory` | `aictx remember` |
| Save structured patch | `save_memory_patch` | `aictx save` |
| Show memory diff | `diff_memory` | `aictx diff` |
| Initialize storage | none | `aictx init`, `aictx setup` |
| Review patch file | none | `aictx patch review` |
| Validate storage | none | `aictx check` |
| Rebuild generated index | none | `aictx rebuild` |
| Reset local storage | none | `aictx reset` |
| Show memory history | none | `aictx history` |
| Restore memory | none | `aictx restore` |
| Rewind memory | none | `aictx rewind` |
| List stale memory | none | `aictx stale` |
| Show graph neighborhood | none | `aictx graph`, `aictx view` graph screen |
| Show memory lens | none | `aictx lens` |
| Manage branch handoff | none | `aictx handoff` |
| Export Obsidian projection | none | `aictx export obsidian` |
| Manage project registry | none | `aictx projects` |
| View local memory | none | `aictx view` |
| Suggest memory decision packet | none | `aictx suggest` |
| Audit memory hygiene | none | `aictx audit` |
| Wiki source workflow | none | `aictx wiki` |
| Read public docs | none | `aictx docs` |

For setup, lenses, handoff, maintenance, recovery, export, registry, viewer,
docs, suggest, audit, wiki, and stale workflows, the CLI is the supported interface.
Graph inspection is supported by both `aictx graph` and the local viewer. Supported
CLI or MCP save paths should handle `.aictx/` changes; editing `.aictx/` files directly
is reserved for exceptional manual recovery or explicit user requests.

## Memory lifecycle

Good memory stays narrow, durable, and current:

- Load narrowly before non-trivial work.
- Save only durable knowledge directly as active memory.
- Update existing memory before creating duplicates.
- Stale or supersede wrong old memory when current evidence invalidates it.
- Delete memory that should not persist.
- Prefer current code and user requests over loaded memory when they conflict.
- Report whether memory changed; async inspection is available through
  `aictx view`, `aictx diff`, or Git tools.
- Save nothing when the task produced no durable future value.

After failure or correction, treat the event as a memory-quality signal:

- Did the agent need missing project context?
- Did loaded memory conflict with current evidence?
- Did the user correct a stale assumption?
- Should existing memory be updated, marked stale, superseded, or deleted?
- Should an open `question`, `gotcha`, `source`, or `synthesis` be saved?

## Memory shape

Right-size memory. Atomic memories should normally carry one durable claim.
Use `synthesis` memories for compact area-level understanding that future agents
should load quickly. Use `source` memories to preserve where context came from,
especially repo docs, AGENTS/CLAUDE/rules, package manifests, issues, external
references recorded by the agent, and user-stated context.

Use relations only when the link matters. Common predicates include
`derived_from`, `supports`, `summarizes`, `documents`, `challenges`, `requires`,
`depends_on`, `affects`, and `supersedes`.

Update-before-create behavior keeps memory from drifting into duplicates:

- `update_object` refreshes an existing object.
- `mark_stale` records that old memory is wrong or no longer useful.
- `supersede_object` connects old memory to its replacement.
- `delete_object` removes memory that should not persist.
- `create_relation` records a durable, useful link between objects.

Create a new object only when no existing memory should be updated, marked
stale, or superseded.

Save-nothing-is-valid policy: if the work produced no durable future value, do
not invent a patch. Tell the user that no Aictx memory was saved.

## Object taxonomy

Object types are `project`, `architecture`, `decision`, `constraint`,
`question`, `fact`, `gotcha`, `workflow`, `note`, `concept`, `source`, and
`synthesis`.

`history`, `task-note`, and `feature` are not object types. Git, events, and
statuses cover history. Branch or task scope covers temporary task context.
Product capabilities fit `concept` objects or `synthesis` objects with feature
facets.

`gotcha` fits known failure modes and traps. `workflow` fits repeated
project-specific how-tos: procedures, runbooks, command sequences,
release/debugging/migration paths, verification routines, and maintenance
steps. Organization facets such as `domain`, `bounded-context`,
`capability`, `business-rule`, and `unresolved-conflict` are optional
plain-language retrieval hints, not mandatory DDD terminology.

Durable syntheses should usually have source evidence or active source
provenance relations.

## Examples

Good memory examples:

- Good durable fact: a `fact` titled "Webhook retries run in the worker" with
  one sentence naming the current retry location.
- Good linked decision: `decision.billing-retries` plus a `requires` relation
  to `constraint.webhook-idempotency` when the decision depends on that
  constraint.
- Good gotcha: `gotcha.viewer-export-overwrites-manifest-files` when a repeated
  failure mode affects future work.
- Good workflow/how-to: `workflow.release-smoke-test` for a repeated release
  verification procedure.
- Good source-backed synthesis: `synthesis.product-intent` summarizes what the
  product is for and has `derived_from` relations to source records.

Bad memory examples:

- Duplicate creation: creating a second memory for the same durable claim
  instead of updating, marking stale, or superseding the existing one.
- Task diary: saving "I changed three files and ran tests" when Git history
  already records the work.
- Speculation: saving guesses that are not supported by current evidence.
- No-value save: creating a memory patch only to say that nothing important
  happened.

Secrets, tokens, credentials, private keys, sensitive raw logs, unsupported
speculation, and unrelated user preferences should not be saved as memory.
Memory should never ask future agents to ignore current code, tests, user
requests, or safety rules.

## Bootstrap and suggestion packets

`aictx setup` provides guided first-run onboarding. It initializes storage if
needed, writes conservative evidence-backed bootstrap memory by default, runs
checks, prints soft role coverage, and starts the local viewer for
inspection. Use `aictx setup --dry-run` to preview without initializing
storage, writing repo files, running checks, or starting the viewer. Use
`aictx setup --no-view` for scripts or agent runs that should skip viewer
startup. `aictx setup --force --dry-run` previews reset/setup behavior without
deleting anything.

For the agent-led first-run path, use `aictx setup`, then run
`aictx lens project-map` for a readable overview or
`aictx load "onboard to this repository"` to verify the first task-focused
memory pack. Use `aictx handoff update --stdin` only for unfinished branch
continuity that should not become project truth yet. For client-specific
instruction files and copyable setup prompts, see [Agent recipes](/agent-recipes/).

```bash
aictx suggest --bootstrap --json
aictx suggest --bootstrap --patch > bootstrap-memory.json
aictx patch review bootstrap-memory.json
aictx save --file bootstrap-memory.json
aictx check
```

`aictx suggest --from-diff --json` creates a memory suggestion packet from
current code changes. `aictx suggest --after-task --json` includes ranked
`recommended_actions`; treat them as advisory defaults, not authoritative
semantic memory. Agents still fill in durable `title`, `body`, and `reason`
fields from current evidence. `aictx audit --json` reports grouped, actionable
memory hygiene issues and role coverage gaps. Missing roles are not `aictx
check` failures.

During setup, product features can use the `product-feature` facet. Durable
project how-tos use the existing `workflow` object type and `workflow` facet.
Source-backed syntheses are a good fit for product intent, feature maps,
roadmap, architecture, conventions, agent guidance, and repeated workflows or
how-to collections.

For the full memory-quality loop, see [Demand-driven memory](/demand-driven-memory/).
