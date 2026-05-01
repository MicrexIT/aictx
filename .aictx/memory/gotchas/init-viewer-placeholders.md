# Init viewer only shows placeholder memory

`aictx init` creates valid storage and an initial index, but it does not infer rich semantic memory from the repository. Immediately after init, the local viewer should show the starter project and architecture memory objects with one explicit `related_to` graph edge between them.

Older projects initialized before this seed relation may still show unlinked starter placeholders. For first-run seed data or the missing starter link, generate a reviewable patch with `aictx suggest --bootstrap --patch`, review or edit it, then apply it with `aictx save --file <patch.json>`.
