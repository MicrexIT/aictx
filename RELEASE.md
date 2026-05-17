# Release Policy

Memory publishes two install channels from one release workflow:

- npm: `@aictx/memory`
- Homebrew: `aictx/tap/memory`

Run releases only from the source repo:

```bash
cd /Users/micrex/Dev/remics/projects/aictx
git remote -v
```

The remote should be `aictx/memory.git`. If you are in
`/opt/homebrew/Library/Taps/aictx/homebrew-tap`, stop; that is only the
Homebrew tap checkout.

## Normal Patch Release

Do not run `npm publish` manually. The tag workflow publishes npm and then
updates Homebrew.

`pnpm version:patch` only edits the version in the source repo. It does not
publish npm, update the tap, or create the Git tag.

```bash
pnpm version:patch
VERSION="$(node -p 'require("./package.json").version')"
git add .
git commit -m "Release v${VERSION}"
git push origin main
git tag "v${VERSION}"
git push origin "v${VERSION}"
```

After the tag workflow succeeds:

```bash
npm view @aictx/memory version
brew info aictx/tap/memory
```

Both should show the new version.

## Pre-Release Checks

Run before tagging:

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
pnpm build:docs
pnpm build:site
npm pack --dry-run --json
pnpm test:package
```

Review the package file list and confirm it excludes source, tests, scripts,
raw viewer source, docs build output, and tool caches.

## Versioning

The package is pre-1.0.

- Patch: fixes, docs, packaging, and compatible behavior improvements.
- Minor: new commands, new MCP behavior, storage changes, or breaking changes
  before 1.0.
- Major: reserved for post-1.0 compatibility boundaries.

For a minor release, replace `pnpm version:patch` with:

```bash
npm version minor --no-git-tag-version
pnpm build
pnpm build:docs
VERSION="$(node -p 'require("./package.json").version')"
```

Then commit, push `main`, tag, and push the tag exactly like the patch flow.

## One-Time Setup

These must be done once before tag publishing works.

### Required Credentials

There are exactly two publish credentials/settings:

| Channel | Where to configure | What to add |
| --- | --- | --- |
| npm | npmjs.com package settings for `@aictx/memory` | Trusted Publisher rule |
| Homebrew | GitHub repo settings for `aictx/memory` | `HOMEBREW_TAP_TOKEN` environment secret |

Do not add `NPM_TOKEN` to GitHub. npm publishing uses npm Trusted Publishing,
not a GitHub secret.

### npm Trusted Publishing Rule

Configure npmjs.com for `@aictx/memory`:

- Trusted publisher type: GitHub Actions
- Organization or user: `aictx`
- Repository: `memory`
- Workflow filename: `release.yml`
- Environment name: `npm`

The workflow publishes npm through Trusted Publishing. It does not use an
`NPM_TOKEN` secret. The workflow uses `npm publish --provenance` on Node 24 so
the npm CLI supports OIDC Trusted Publishing.

### Homebrew Tap

Create `github.com/aictx/homebrew-tap` once. Homebrew uses this repo for:

```text
brew install aictx/tap/memory
```

If creating the tap with plain Git:

```bash
brew tap-new aictx/tap
cd "$(brew --repository aictx/tap)"
git remote add origin git@github.com:aictx/homebrew-tap.git
git branch -M main
git push -u origin main
```

Then create a fine-grained GitHub token:

- Name: `HOMEBREW_TAP_TOKEN`
- Resource owner: `aictx`
- Repository access: only `aictx/homebrew-tap`
- Repository permissions: Contents -> Read and write

Save it in `aictx/memory`, not the tap repo:

```text
Settings -> Environments -> npm -> Environment secrets -> HOMEBREW_TAP_TOKEN
```

Create the `npm` environment first if it does not exist.

## Recovery

If the workflow fails at `Publish with provenance`, npm Trusted Publishing is
not configured correctly. Fix it, then rerun the failed job.

If npm was already published manually, rerun the failed job after the latest
workflow fix. The workflow skips duplicate npm publish and still updates
Homebrew from the existing npm tarball.

Manual publishing should be reserved for recovery situations and documented in
the release notes.

## Branch Protection

Before broad public contribution, protect `main` in GitHub settings:

- require the CI workflow to pass;
- require pull request review before merge;
- prevent force pushes and branch deletion;
- require branches to be up to date before merge;
- restrict who can push directly to `main`.
