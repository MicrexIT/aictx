# Proactive bootstrap onboarding

Aictx treats init-created project and architecture placeholders as a first-run starter state, not useful seeded memory.

Onboarding now surfaces the bootstrap workflow in three places:
- `aictx init` next steps name `aictx suggest --bootstrap --patch`, `aictx save --file`, `aictx check`, and `aictx diff`.
- Generated agent guidance tells agents to run the bootstrap workflow proactively for setup, onboarding, or "why is memory empty?" requests when loaded memory only contains the init placeholders.
- The local viewer shows a starter-memory notice with bootstrap commands when only the initial project and architecture objects exist.
