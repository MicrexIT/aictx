# Package scripts

Use the package scripts in `package.json` for repeated project workflows:
- `build`: `pnpm build:guidance && pnpm build:version && pnpm build:code && pnpm build:schemas && pnpm build:viewer`
- `build:code`: `tsup`
- `build:demo-viewer`: `pnpm build:viewer && node scripts/build-viewer-demo-data.mjs && tsc --noEmit`
- `build:docs`: `astro build --root docs`
- `build:guidance`: `node scripts/generate-agent-guidance.mjs`
- `build:schemas`: `node scripts/copy-schemas.mjs`
- `build:site`: `astro build --root site`
- `build:version`: `node scripts/generate-version.mjs`
- `build:viewer`: `vite build --config viewer/vite.config.ts`
- `version:patch`: `npm version patch --no-git-tag-version && pnpm build && pnpm build:docs`

Setup prompt install commands are intentionally unpinned; do not add package-version sync logic to release scripts for README or docs prompts.