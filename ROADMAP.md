# Roadmap

Aictx is local-first project memory for AI coding agents. The public roadmap is
focused on making that workflow reliable before expanding into hosted or remote
services.

## Current focus

- Stable CLI memory loop: `init`, `setup`, `load`, `remember`, `diff`, `check`,
  recovery, and viewer workflows.
- Local MCP quality for MCP-capable coding clients.
- Clear public docs for users and agent integrators.
- Package hygiene, CI, security policy, and release provenance.

## Near-term themes

- Improve retrieval quality without hidden cloud services.
- Strengthen storage validation, migrations, and recovery.
- Keep CLI and MCP contracts clear instead of mirroring every CLI command in MCP.
- Make the local viewer more useful for reviewing memory and relations.
- Continue dogfooding Aictx memory in this repository.

## Not in v1

- Hosted sync or multi-tenant cloud memory.
- OAuth, billing, or cloud account management.
- Remote MCP service.
- Automatic commits or autonomous repository repair.

Roadmap changes should come through issues or pull requests that explain the
user problem, interface impact, storage impact, and release risk.
