<!-- Generated from integrations/templates/agent-guidance.md. Do not edit directly. -->

# Aictx Memory for Claude Code

This plugin packages the `aictx-memory` skill for Claude Code.

It keeps Aictx usage CLI-first: load relevant memory with `aictx load` before substantial work, save durable knowledge with `aictx remember --stdin`, and use MCP equivalents only when the current Claude Code session already exposes Aictx MCP tools.

## Contents

- `.claude-plugin/plugin.json`
- `skills/aictx-memory/SKILL.md`

## Distribution

This directory follows the Claude Code plugin format. Submit it through Anthropic's plugin submission flow when targeting the official Claude plugin directory.

Claude Code adds plugins through marketplace sources, not by adding this plugin directory directly. Point a marketplace catalog at this plugin directory, then add that marketplace.

Inside Claude Code:

```text
/plugin marketplace add owner/repo
/plugin marketplace add ./local-marketplace-root
/plugin install aictx-memory@marketplace-name
/plugin marketplace list
/plugin marketplace update
/plugin marketplace remove marketplace-name
```

For scripting or automation, use the equivalent CLI commands:

```bash
claude plugin marketplace add owner/repo
claude plugin marketplace add owner/repo@main
claude plugin marketplace add https://github.com/example/plugins.git
claude plugin marketplace add ./local-marketplace-root
claude plugin marketplace add owner/repo --scope project
claude plugin marketplace add owner/monorepo --sparse .claude-plugin plugins
claude plugin marketplace list
claude plugin marketplace list --json
claude plugin marketplace update
claude plugin marketplace update marketplace-name
claude plugin marketplace remove marketplace-name
```
