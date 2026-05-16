# Contributing to Aictx

Thanks for helping improve Aictx. This project is the npm package
`@aictx/memory`: local-first, reviewable project memory for AI coding agents.

Aictx is not a chat transcript archive, always-on capture server, hosted memory
service, vector DB, or prompt template. Contributions should preserve that
shape: typed memory in `.aictx/`, local indexing, explicit validation, and
normal Git review.

## First contribution paths

You do not need to understand the whole memory model to make a useful
contribution. Start with the path that matches the change.

| Path | Good first work | Verify with |
| --- | --- | --- |
| Docs and examples | Clarify public docs, README wording, recipes, or install notes. | `pnpm build:docs` |
| CLI behavior | Reproduce a small command bug, add a focused test, then fix it. | `pnpm typecheck && pnpm test` |
| Viewer UI | Improve filtering, copy, layout, screenshots, or accessibility. | `pnpm typecheck && pnpm build:viewer` |
| Packaging | Check release packaging, binary entrypoints, or versioned setup text. | `pnpm test:package` |
| Memory model | Propose schema, storage, ranking, MCP, or migration changes. | Open an issue first |

Small pull requests are easier to review and merge. If a change spans several
areas, describe the review order in the pull request so maintainers can check
the riskiest part first.

Please do not include secrets, private project memory, proprietary logs, or
unredacted `.aictx/` content from another project in issues or pull requests.

## Before opening an issue

Good issues make the problem reproducible without exposing private project
memory. Include:

- the command or workflow you ran;
- what you expected to happen;
- what actually happened;
- `node --version`, `pnpm --version`, and `aictx --version` when relevant;
- a minimal redacted `.aictx/` sample only when the issue depends on storage
  contents;
- screenshots for viewer or README visual problems.

Use `SECURITY.md` for vulnerabilities, private disclosure, or anything that
would require sharing secrets, exploit details, proprietary logs, or private
project memory.

## Development setup

Aictx requires Node.js `>=22` and uses pnpm.

```bash
pnpm install
pnpm typecheck
pnpm test
```

Useful verification commands by area:

```bash
pnpm build:docs       # public docs
pnpm build:viewer     # local viewer bundle
pnpm build:guidance   # generated agent guidance
pnpm test:package     # release packaging surface
pnpm build            # full package build
pnpm test:local       # typecheck plus packaging integration test
```

Before opening a pull request for a broad change, run:

```bash
pnpm typecheck
pnpm test
pnpm build
```

Useful local commands:

```bash
pnpm dev -- --help
pnpm dev -- init --json
pnpm dev:mcp
pnpm dev:docs
pnpm dev:site
```

## Working with protected `main`

The `main` branch is protected. Do not push directly to `main`, force-push
`main`, or delete `main`. Work from a branch and merge through a pull request.
Repository administrators may have emergency bypass rights, but routine work,
AI-agent work, and external contributions should still use pull requests so
required checks and review stay visible.

Recommended git flow:

```bash
git checkout main
git pull --ff-only origin main
git checkout -b <short-topic-branch>

# make the change
pnpm typecheck
pnpm test

git status --short
git add <changed-files>
git commit -m "<clear change summary>"
git push -u origin <short-topic-branch>
```

Then open a pull request into `main`. Invited collaborators with write access
may merge their own pull requests after required checks pass. External
contributors can open pull requests, but a maintainer or write collaborator must
merge them.

Required GitHub checks for `main` are:

- `Node 22`
- `Node 24`
- `Analyze JavaScript and TypeScript`

The branch must be up to date with `main` before merge. If GitHub reports that
the pull request is behind, update the branch and wait for checks to run again.
The repository allows merge commits and squash merges; use squash merge for
small focused changes unless preserving individual commits is important.

## AI-agent git instructions

If you use an AI coding agent for git management, give it this prompt before it
starts changing files:

```text
You are working in the Aictx repository.

Before non-trivial work, run:
aictx load "<task summary>"

Never push directly to main. Start from latest main, create a feature branch,
commit only the intended files, push that branch, and open a pull request
targeting main. Required checks are Node 22, Node 24, and Analyze JavaScript and
TypeScript. Wait for checks to pass before merging. If the branch is behind
main, update it and wait for checks again.

Do not edit .aictx canonical memory files directly when the Aictx CLI can make
the change. After meaningful work, decide whether durable memory should change;
use aictx suggest when useful, save with aictx remember --stdin, and report
whether memory changed.
```

If the agent can use the GitHub CLI, these commands are the expected shape after
it has committed and pushed the branch:

```bash
gh pr create --fill --base main --head <short-topic-branch>
gh pr checks --watch
gh pr merge --squash --delete-branch
```

Use `gh pr merge --merge --delete-branch` instead when the pull request should
preserve its commits.

## Pull request expectations

- Keep changes scoped to one behavior or documentation improvement.
- Explain the problem, the approach, and the verification you ran.
- Write the pull request description as a prompt another coding agent could use
  to reproduce, review, or continue the work.
- Add or update tests for CLI, MCP, storage, packaging, and viewer behavior.
- Update README, public docs, or site copy when user-visible behavior,
  positioning, or workflows change.
- Run the verification commands that match the changed area.
- Include before/after output for CLI behavior changes and screenshots for
  viewer, README visual, or marketing-site changes.
- For README or marketing-site visual changes, keep screenshots/assets current
  with the implementation they depict and avoid fake interactive controls in
  static images.
- Keep generated guidance files in sync by running `pnpm build:guidance` when
  editing `integrations/templates/agent-guidance.md`; generated integration
  artifacts live under `integrations/`.
- Do not edit `.aictx/` canonical memory files directly when the Aictx CLI can
  make the change.

## Memory model changes

Changes to storage objects, schemas, context ranking, MCP tool contracts, or
agent memory discipline need extra care. A good proposal should explain:

- the user or agent problem;
- the new or changed CLI/MCP surface;
- storage and migration impact;
- how older `.aictx/` projects behave;
- docs and tests required before release.

## Community standards

By participating, you agree to follow the project code of conduct. For security
issues, follow `SECURITY.md` instead of opening a public issue.
