# Contributing to Aictx

Thanks for helping improve Aictx. This project is the npm package
`@aictx/memory`: a local-first project memory tool for AI coding agents.

## Ways to contribute

- Report reproducible bugs with the bug report template.
- Improve public docs under `docs/src/content/docs/`.
- Propose CLI, MCP, storage, retrieval, or viewer improvements through focused issues.
- Send small pull requests that keep behavior, tests, and docs aligned.

Please do not include secrets, private project memory, proprietary logs, or
unredacted `.aictx/` content from another project in issues or pull requests.

## Development setup

Aictx requires Node.js `>=22` and uses pnpm.

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
pnpm build:docs
```

Useful local commands:

```bash
pnpm dev -- --help
pnpm dev -- init --json
pnpm dev:mcp
pnpm dev:docs
pnpm dev:site
```

## Pull request expectations

- Keep changes scoped to one behavior or documentation improvement.
- Write the pull request description as a prompt another coding agent could use
  to reproduce, review, or continue the work.
- Add or update tests for CLI, MCP, storage, packaging, and viewer behavior.
- Update README or public docs when user-visible behavior changes.
- Run the verification commands that match the changed area.
- Keep generated guidance files in sync by running `pnpm build:guidance` when
  editing `integrations/templates/agent-guidance.md`.
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
