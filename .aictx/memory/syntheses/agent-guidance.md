# Agent guidance


Verification workflows:
- pnpm run typecheck: package.json script `typecheck`: `tsc --noEmit && svelte-check --tsconfig viewer/tsconfig.json`
- pnpm run test:local: package.json script `test:local`: `pnpm typecheck && pnpm test:package`
- pnpm run test:watch: package.json script `test:watch`: `vitest`
- pnpm run test: package.json script `test`: `vitest run`
- pnpm run test:package: package.json script `test:package`: `vitest run test/integration/release/packaging.test.ts`
- pnpm run build: package.json script `build`: `pnpm build:guidance && pnpm build:version && pnpm build:code && pnpm build:schemas && pnpm build:viewer`

Update this synthesis when agent instructions, conventions, or verification workflows change.
