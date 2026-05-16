# Security Policy

## Supported versions

Aictx is pre-1.0 software. Security fixes are released for the latest published
`@aictx/memory` version unless a maintainer explicitly documents otherwise in a
release note.

## Reporting a vulnerability

Do not open a public issue for suspected vulnerabilities.

Use GitHub private vulnerability reporting or draft a private repository security
advisory:

https://github.com/aictx/memory/security/advisories/new

If that path is unavailable, open a minimal public issue asking for a private
security contact and do not include exploit details, private project memory, or
secrets.

Helpful reports include:

- affected Aictx version;
- Node.js version and operating system;
- affected surface: CLI, MCP, viewer, package install, docs, or workflow;
- minimal reproduction steps;
- impact and whether exploitation requires local project access;
- any suggested fix.

## Scope

Aictx is local-first and reads/writes project files under `.aictx/`. Security
reports are most useful when they involve unauthorized file access, secret
exposure, unsafe path handling, supply-chain behavior, command execution,
viewer/MCP exposure, or package integrity.

Please do not send unrelated dependency scanner output without a plausible
Aictx exploit path.
