# Aictx Demo Repo

This tiny repo is for demos and screenshots.

It intentionally contains a few realistic project constraints so Aictx can show
why local project memory helps agents before they edit code.

## Try it

```bash
git init
aictx setup --apply
aictx save --file memory-patch.json
aictx load "change auth session refresh"
aictx view --open
aictx diff
```

The patch creates memory for:

* an auth session refresh workflow
* a generated type file constraint
* a token storage security fact
* a known gotcha around local servers

The patch is reviewable before saving. It does not require manually editing
`.aictx/`.
