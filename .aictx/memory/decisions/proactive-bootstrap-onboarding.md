# Proactive bootstrap onboarding

Aictx treats init-created project and architecture placeholders as a first-run starter state, not useful seeded memory.

Fresh initialization now creates linked starter placeholders: the project object has an explicit `related_to` relation to `architecture.current`, so the viewer graph starts with one structural edge.

Onboarding surfaces the bootstrap workflow in three places:
- `aictx init` next steps name `aictx suggest --bootstrap --patch`, `aictx save --file`, `aictx check`, and `aictx diff`.
- Generated agent guidance tells agents to run the bootstrap workflow proactively for setup, onboarding, or "why is memory empty?" requests when loaded memory only contains the init placeholders.
- The local viewer shows a starter-memory notice with bootstrap commands when only the initial project and architecture objects exist.

For projects initialized before the starter relation existed, bootstrap suggestion can propose a reviewable `create_relation` patch for the missing project-to-architecture link. Re-running `aictx init` on an already valid project remains conservative and does not silently mutate storage.