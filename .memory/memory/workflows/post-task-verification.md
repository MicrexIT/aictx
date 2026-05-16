# Post-task verification

After meaningful code changes, prefer these repo verification commands when relevant:
- `pnpm run typecheck`: package.json script `typecheck`: `tsc --noEmit && svelte-check --tsconfig viewer/tsconfig.json`
- `pnpm run test:local`: package.json script `test:local`: `pnpm typecheck && pnpm test:package`
- `pnpm run test:watch`: package.json script `test:watch`: `vitest`
- `pnpm run test`: package.json script `test`: `vitest run`
- `pnpm run test:package`: package.json script `test:package`: `vitest run test/integration/release/packaging.test.ts`
- `pnpm run build`: package.json script `build`: `pnpm build:guidance && pnpm build:version && pnpm build:code && pnpm build:schemas && pnpm build:viewer`
