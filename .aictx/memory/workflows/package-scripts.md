# Package scripts

Use the package scripts in `package.json` for repeated project workflows:
- `build`: runs generated guidance, version sync, TypeScript bundling, schema copying, and viewer build.
- `dev`: runs the CLI from TypeScript sources with `tsx`.
- `dev:mcp`: runs the MCP stdio server from TypeScript sources with `tsx`.
- `version:patch`: runs `npm version patch --no-git-tag-version`, pins the README setup-prompt install command to the new package version, and regenerates `src/generated/version.ts`.
- `reset:aictx`: runs `scripts/reset-aictx.mjs`; default mode backs up `.aictx/` to `.aictx/.backup/*.tar.gz` and clears other `.aictx` contents, while `--destroy` deletes `.aictx/` without backup.
- `test`, `test:local`, `test:package`, `test:watch`, and `typecheck`: run Vitest, package verification, and TypeScript/Svelte checks.
