# Init viewer only shows placeholder memory

`aictx init` creates valid storage and an initial index, but it does not infer rich semantic memory from the repository. Immediately after init, the local viewer should show only the starter project and architecture memory objects unless additional memory has been saved.

For first-run seed data, generate a reviewable patch with `aictx suggest --bootstrap --patch`, review or edit it, then apply it with `aictx save --file <patch.json>`.
