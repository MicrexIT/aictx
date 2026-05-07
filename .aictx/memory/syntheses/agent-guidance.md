# Agent guidance

Verification workflows:
- pnpm run typecheck: package.json script `typecheck`: `tsc --noEmit && svelte-check --tsconfig viewer/tsconfig.json`
- pnpm run test:local: package.json script `test:local`: `pnpm typecheck && pnpm test:package`
- pnpm run test:watch: package.json script `test:watch`: `vitest`
- pnpm run test: package.json script `test`: `vitest run`
- pnpm run test:package: package.json script `test:package`: `vitest run test/integration/release/packaging.test.ts`
- pnpm run build:guidance: package.json script `build:guidance`: `node scripts/generate-agent-guidance.mjs`
- pnpm run build: package.json script `build`: `pnpm build:guidance && pnpm build:version && pnpm build:code && pnpm build:schemas && pnpm build:viewer`

Generated guidance workflow:
- `integrations/templates/agent-guidance.md` is the canonical generated-guidance body.
- `pnpm build:guidance` generates Codex, Claude, Cursor, Cline, and generic integration artifacts under `integrations/`.
- Generated guidance tells agents to treat `suggest --after-task --json` `recommended_actions` as the primary advisory save/no-save aid while still writing semantic title/body/reason fields themselves.
- Public `agent-recipes` docs describe where users should copy those artifacts and keep CLI as the default routine path.

Update this synthesis when agent instructions, conventions, generated integration targets, or verification workflows change.