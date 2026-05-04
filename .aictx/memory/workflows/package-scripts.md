# Package scripts

Use the package scripts in `package.json` for repeated project workflows:
- `build`: `pnpm build:guidance && pnpm build:version && pnpm build:code && pnpm build:schemas && pnpm build:viewer`
- `build:code`: `tsup`
- `build:guidance`: `node scripts/generate-agent-guidance.mjs`
- `build:schemas`: `node scripts/copy-schemas.mjs`
- `build:version`: `node scripts/generate-version.mjs`
- `build:viewer`: `vite build --config viewer/vite.config.ts`
- `dev`: `tsx src/cli/main.ts`
- `dev:mcp`: `tsx src/mcp/server.ts`
- `version:patch`: runs `npm version patch --no-git-tag-version`, syncs the README setup-prompt install version, and regenerates `src/generated/version.ts`
