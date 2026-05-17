# Release Policy

Memory publishes the npm package `@aictx/memory` and updates the Homebrew
formula in `aictx/homebrew-tap`.

## Versioning

The package is pre-1.0. Use semver as follows:

- Patch: fixes, docs, packaging, and compatible behavior improvements.
- Minor: new commands, new MCP behavior, storage changes, or breaking changes
  before 1.0.
- Major: reserved for post-1.0 compatibility boundaries.

Every published version should have a matching Git tag in the form `vX.Y.Z`.

## Pre-release checks

Run:

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
pnpm build:docs
pnpm build:site
npm pack --dry-run --json
```

For package changes, run:

```bash
pnpm test:package
```

Review the package file list and confirm it excludes source, tests, scripts,
raw viewer source, docs build output, and tool caches.

## Publishing

Releases should be published through the GitHub Actions release workflow with
npm provenance. The workflow checks that the pushed tag matches
`package.json#version`, publishes npm, then renders `Formula/memory.rb` from the
published npm tarball and pushes it to `aictx/homebrew-tap`.

The `npm` environment must expose `HOMEBREW_TAP_TOKEN` with write access to the
tap repository before tagging a release. The workflow verifies the token and tap
checkout before publishing npm, so a release does not silently skip Homebrew.

Manual publishing should be reserved for recovery situations and documented in
the release notes.

## Branch protection

Before broad public contribution, protect `main` in GitHub settings:

- require the CI workflow to pass;
- require pull request review before merge;
- prevent force pushes and branch deletion;
- require branches to be up to date before merge;
- restrict who can push directly to `main`.
