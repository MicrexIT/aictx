<!-- Generated from integrations/templates/agent-guidance.md. Do not edit directly. -->

# Aictx Memory for Codex

This plugin packages the `aictx-memory` skill for Codex.

It keeps Aictx usage CLI-first: load relevant memory with `aictx load` before substantial work, save durable knowledge with `aictx remember --stdin`, and use MCP equivalents only when the current Codex session already exposes Aictx MCP tools.

## Contents

- `.codex-plugin/plugin.json`
- `skills/aictx-memory/SKILL.md`

## Distribution

This directory follows the Codex plugin format. It intentionally does not include MCP server configuration; Aictx MCP setup remains an optional client-level configuration.

Codex adds plugins through marketplace sources, not by adding this plugin directory directly. Point a marketplace catalog at this plugin directory, then add that marketplace:

```bash
codex plugin marketplace add owner/repo
codex plugin marketplace add owner/repo --ref main
codex plugin marketplace add https://github.com/example/plugins.git --sparse .agents/plugins
codex plugin marketplace add ./local-marketplace-root
```

Refresh or remove configured marketplaces with:

```bash
codex plugin marketplace upgrade
codex plugin marketplace upgrade marketplace-name
codex plugin marketplace remove marketplace-name
```
