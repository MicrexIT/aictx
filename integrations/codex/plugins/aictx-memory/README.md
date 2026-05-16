<!-- Generated from integrations/templates/agent-guidance.md. Do not edit directly. -->

# Aictx Memory for Codex

This plugin packages the `aictx-memory` skill for Codex.

It keeps Aictx usage CLI-first: load relevant memory with `aictx load` before substantial work, save durable knowledge with `aictx remember --stdin`, and use MCP equivalents only when the current Codex session already exposes Aictx MCP tools.

## Contents

- `.codex-plugin/plugin.json`
- `skills/aictx-memory/SKILL.md`

## Distribution

This directory follows the Codex plugin format. It intentionally does not include MCP server configuration; Aictx MCP setup remains an optional client-level configuration.

Codex adds plugins through marketplace sources, not by adding this plugin directory directly. This repo exposes the plugin through its root marketplace catalog:

```bash
codex plugin marketplace add aictx/memory
```

Then open Codex Plugins, choose the Aictx marketplace, and install Aictx Memory.
