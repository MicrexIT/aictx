---
title: Publishing Plugins
description: Publish the generated Aictx Codex and Claude Code plugin artifacts.
---

Aictx ships generated plugin artifacts, but marketplace install and official
publication are different steps. Adding a marketplace registers a catalog so a
user can browse or install from it; it does not publish the plugin to an
official directory.

The generated artifacts stay CLI-first and do not bundle MCP configuration.
Use MCP only when the current agent client has already launched and exposed
`aictx-mcp`.

## Self-hosted marketplace

This repo includes marketplace catalogs for the generated plugins:

- Codex catalog: `.agents/plugins/marketplace.json`
- Claude Code catalog: `.claude-plugin/marketplace.json`

Once the repo is public and pushed, Codex users can add the marketplace with:

```bash
codex plugin marketplace add MicrexIT/aictx
```

Then they open Codex Plugins, choose the **Aictx** marketplace, and install
**Aictx Memory**.

Claude Code users can add the marketplace and install the plugin with:

```text
/plugin marketplace add MicrexIT/aictx
/plugin install aictx-memory@aictx
```

The marketplace name is `aictx`; the plugin name is `aictx-memory`.

## Official paths

Codex plugin directory listing is not currently self-serve. OpenAI's
[plugin build docs](https://developers.openai.com/codex/plugins/build) say
official public plugin publishing and management are coming soon. Do not open a
PR to `openai/codex` for this plugin.

Codex standalone skills are separate from Codex plugins. For skill catalog
exposure, prepare a PR to [`openai/skills`](https://github.com/openai/skills)
using `integrations/codex/skills/aictx-memory/` as the source directory.

Claude official listing uses Anthropic's submission flow. Validate the generated
plugin first:

```bash
claude plugin validate integrations/claude/plugins/aictx-memory
```

Then submit a public GitHub link or zip through the
[Claude.ai submission form](https://claude.ai/settings/plugins/submit) or the
[Console submission form](https://platform.claude.com/plugins/submit). Anthropic
documents the marketplace mechanics in
[Claude Code plugin marketplaces](https://code.claude.com/docs/en/plugin-marketplaces).

## Agent-run release prep

An agent can prepare the repo for self-hosted distribution by running:

```bash
pnpm build:guidance
claude plugin validate integrations/claude/plugins/aictx-memory
claude plugin validate .claude-plugin/marketplace.json
pnpm build:docs
```

For an official Claude submission zip, commit the release state first, then
package the generated plugin directory:

```bash
git archive --format=zip --prefix=aictx-memory/ HEAD:integrations/claude/plugins/aictx-memory > aictx-memory-claude-plugin.zip
```

The final form submission still requires an authenticated human account.
