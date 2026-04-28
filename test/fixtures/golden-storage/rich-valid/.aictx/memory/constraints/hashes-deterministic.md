# Fixture hashes must be deterministic

Fixture sidecar hashes must be reproducible from canonical JSON and normalized Markdown.

## Constraint

Do not rely on filesystem ordering or generated timestamps when checking fixture hashes.
