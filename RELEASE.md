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

There are two GitHub repos involved:

- `aictx/memory`: this normal source repo. Run normal release commands here.
- `aictx/homebrew-tap`: the Homebrew package index repo. Create it once; after
  that, the release workflow updates it automatically.

The publish trigger is still one tag push from `aictx/memory`:

```text
push vX.Y.Z tag from aictx/memory
  -> GitHub Actions publishes npm
  -> GitHub Actions writes Formula/memory.rb to aictx/homebrew-tap
```

Do not run normal releases from the tap repo.

### One-time Homebrew setup

Homebrew needs a tap repo because `brew install aictx/tap/memory` resolves to:

```text
github.com/aictx/homebrew-tap
Formula/memory.rb
```

Create `github.com/aictx/homebrew-tap` once in the GitHub web UI as an empty
repo. Then create and push the tap scaffold:

```bash
brew tap-new aictx/tap
cd "$(brew --repository aictx/tap)"
git remote add origin git@github.com:aictx/homebrew-tap.git
git branch -M main
git push -u origin main
```

Create the Homebrew tap token:

1. Open GitHub user settings.
2. Go to Developer settings -> Personal access tokens -> Fine-grained tokens.
3. Generate a new token named `HOMEBREW_TAP_TOKEN`.
4. Resource owner: `aictx`.
5. Repository access: only `aictx/homebrew-tap`.
6. Repository permissions: Contents -> Read and write.
7. Generate the token and copy it.

Save that token in the `aictx/memory` repo, not the tap repo:

1. Open `github.com/aictx/memory`.
2. Go to Settings -> Environments.
3. Create an environment named `npm` if it does not already exist.
4. Open the `npm` environment.
5. Under Environment secrets, add `HOMEBREW_TAP_TOKEN`.

Use an environment secret because the release workflow runs with
`environment: npm`.

This token lets the `aictx/memory` release workflow commit the generated formula
to `aictx/homebrew-tap`. It is separate from npm provenance.

### Normal release

Run this from the `aictx/memory` repo. This is the normal source repo, not
`aictx/homebrew-tap`.

If your prompt is inside `/opt/homebrew/Library/Taps/aictx/homebrew-tap`, stop.
That is the tap checkout, not the source repo. Go back to the source repo first:

```bash
cd /Users/micrex/Dev/remics/projects/aictx
git remote -v
```

`git remote -v` should show `aictx/memory.git`, not `aictx/homebrew-tap.git`.

The release has two separate steps:

1. Commit the version bump to `main`.
2. Push the matching `vX.Y.Z` tag.

The normal branch push stores the release commit. The tag push is what publishes.
The workflow is intentionally tag-triggered so an ordinary commit to `main`
cannot accidentally publish a package.

```bash
pnpm version:patch
VERSION="$(node -p 'require("./package.json").version')"
git add .
git commit -m "Release v${VERSION}"
git push origin main
git tag "v${VERSION}"
git push origin "v${VERSION}"
```

`pnpm version:patch` runs this package script:

```bash
npm version patch --no-git-tag-version && pnpm build && pnpm build:docs
```

That command only updates local release files. It does not publish. The
`--no-git-tag-version` flag is deliberate: it prevents `npm version` from making
its own commit and tag so the release commit stays explicit and reviewable.

The release workflow then checks that the pushed tag equals `package.json`
version. If `package.json` is `0.1.42`, the tag must be `v0.1.42`.

One tag push publishes both install channels:

```text
vX.Y.Z tag pushed from aictx/memory
  -> publish @aictx/memory to npm
  -> render Homebrew formula from that npm tarball
  -> push Formula/memory.rb to aictx/homebrew-tap
```

For a pre-1.0 minor release, use this instead of `pnpm version:patch`:

```bash
npm version minor --no-git-tag-version
pnpm build
pnpm build:docs
VERSION="$(node -p 'require("./package.json").version')"
```

Then commit, push `main`, tag, and push the tag the same way.

If you accidentally create a local release commit with the message `Release v`
before pushing, fix only the commit message:

```bash
VERSION="$(node -p 'require("./package.json").version')"
git commit --amend -m "Release v${VERSION}"
```

If the bad commit was already pushed, do not rewrite history just for the commit
message. Make sure the tag name is correct; the tag controls publishing.

Manual publishing should be reserved for recovery situations and documented in
the release notes.

## Branch protection

Before broad public contribution, protect `main` in GitHub settings:

- require the CI workflow to pass;
- require pull request review before merge;
- prevent force pushes and branch deletion;
- require branches to be up to date before merge;
- restrict who can push directly to `main`.
