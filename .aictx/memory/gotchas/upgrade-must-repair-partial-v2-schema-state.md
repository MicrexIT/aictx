# Upgrade must repair partial v2 schema state

`aictx upgrade` must compare bundled schema files even when `.aictx/config.json` already says version 2, because a previous upgrade can fail after writing config but before copying schema files. A clean v2 project should still report no changed files.