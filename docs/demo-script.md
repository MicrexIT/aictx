# Demo Script

Use this flow to record a short GIF or video for the README.

Goal: show that Aictx gives an agent repo-specific context before work and a
Git-reviewable memory diff after work.

## Setup

```bash
npm install -g @aictx/memory
git clone https://github.com/MicrexIT/aictx-demo.git
cd aictx-demo
```

Or use the local demo scaffold:

```bash
cp -R examples/demo-repo /tmp/aictx-demo
cd /tmp/aictx-demo
git init
aictx setup --apply
aictx save --file memory-patch.json
```

## Shot list

### 1. Cold agent, warm repo memory

```bash
aictx load "change auth session refresh"
```

Show the output briefly:

* hard rules
* related files
* workflow notes
* gotchas

### 2. Local handbook

```bash
aictx view --open
```

Show:

* task chips
* reviewable memory graph
* a source memory toggle
* trust metadata and `aictx inspect <id>`

### 3. Review memory like code

Apply a small memory patch:

```bash
aictx save --file memory-patch.json
aictx diff
```

Show the `.aictx/` diff.

## README embed placeholder

When the recording exists, add it near the top of `README.md`:

```md
![Aictx 30-second demo](docs/assets/aictx-demo.gif)
```

Keep the GIF under 10 MB if possible.
