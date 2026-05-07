## Coding-agent prompt

Write the PR as a prompt that another coding agent could use to reproduce,
review, or continue the work.

```text
Goal:

Context:

Files or areas to inspect first:

Required changes:

Constraints:

Out of scope:

Acceptance criteria:

Verification commands:

Aictx memory decision:
```

## Verification

- [ ] `pnpm typecheck`
- [ ] `pnpm test`
- [ ] `pnpm build`
- [ ] `pnpm build:docs`

## Checklist

- [ ] The prompt is specific enough for a coding agent to act without guessing.
- [ ] Public docs or README updated when behavior changed.
- [ ] Package contents considered when release files changed.
- [ ] Aictx memory save/no-save decision made after meaningful work.
