# Contributor guide

This guide is for people and coding agents who work on bluer.

## What this repo is

bluer lets a user write an agent skill as plain steps (`intent.md`) and keeps a
generated, versioned `SKILL.md` that improves with use. Read
[README.md](README.md) for the idea and [docs/design.md](docs/design.md) for
the decisions and open questions.

## Develop

Requires Node.js 22.18 or later (Node runs the TypeScript source directly) and git.

```bash
npm install
npm run typecheck   # tsc, no output files
npm test            # node --test on test/**/*.test.ts
npm run build       # compile src/ to dist/ for the npm package
npm run build:plugin  # bundle src/ into plugins/claude-code/bin/bluer.mjs
node src/main.ts help
```

The Claude Code plugin ships the CLI as one bundled file,
`plugins/claude-code/bin/bluer.mjs`, because an installed plugin gets only its
own folder and no `node_modules`. Run `npm run build:plugin` after any change in
`src/` and commit the bundle. CI fails when the bundle is out of date.

`bin/bluer setup` downloads the Node.js release pinned in
`plugins/claude-code/bin/node-pins.txt`. When a new Node.js LTS release is out,
run `node scripts/pin-node.ts`, check the diff and commit it. Never edit the
checksums by hand: they are what makes the download safe.

OpenAI Codex installs the same plugin. It reads
`plugins/claude-code/.codex-plugin/plugin.json` (before `.claude-plugin/`),
which points it to `hooks/codex-hooks.json`. Keep the two hook files in step.
To check what Codex sees without a model call, use a scratch home:
`CODEX_HOME=/tmp/cx/.codex HOME=/tmp/cx codex plugin marketplace add .`, then
`codex plugin add bluer@bluer-skills` and `codex debug prompt-input "hi"`.

Test the plugin by hand with Claude Code's own tools:

```bash
claude plugin validate ./plugins/claude-code
claude plugin validate .
BLUER_HOME=/tmp/bt/bluer BLUER_USER_HOME=/tmp/bt/user \
  claude --plugin-dir ./plugins/claude-code
```

`evals/learning` runs real agent sessions to check what the agent records; see
`evals/README.md`. Run it after a change to the hook notes
(`src/agents/hooks.ts`) or to the `bluer` skill, and add a line to
`evals/learning/RESULTS.md` with `--summary`. A full run costs about $2.

The plugin icon (`plugins/claude-code/.claude-plugin/icon.png`, also used in the
README title) is three stacked layers that get bluer toward the top: lessons
build on what the owner wrote. To change it, use a 1024 x 1024 PNG with
transparent corners, and check that it still reads at 32 px.

The README demo (`docs/demo/bluer-demo.gif`) is a scripted animation that
`docs/demo/render_demo.py` renders with Pillow and ffmpeg; see the script's
header. Keep its agent lines true to what the plugin really does, and render it
again when the story changes.

`BLUER_USER_HOME` moves the folder where bluer links skills for agents, so a
test does not touch your real `~/.claude/skills`. To let a test session see a
skill, link it into the project: `.claude/skills/<name>`.

- `src/store.ts` holds the skill operations; `src/cli.ts` only parses arguments
  and prints. `src/build.ts` and `src/gate.ts` are pure functions: keep file and
  git access out of them.
- Write imports with the `.ts` extension. `tsc` rewrites them to `.js` in `dist/`.
- Use only erasable TypeScript syntax (no `enum`, no `namespace`, no parameter
  properties), because Node strips types without compiling.
- Tests that touch files use a temp folder and set `home` and `userHome` in the
  `Context`. The CLI reads `BLUER_HOME`, `BLUER_USER_HOME`, `BLUER_TODAY` (a
  fixed date for tests) and `BLUER_CLI_PATH` (the CLI path hooks write into the
  shim). The wrapper `plugins/claude-code/bin/bluer` reads `BLUER_NODE` (set
  it to a missing path to test what users without Node.js see) and
  `BLUER_NODE_MIRROR` (where `setup` downloads from; tests use a `file://`
  mirror). Never let a test write to the real `~/.bluer`, `~/.claude` or `~/.codex`.

## Rules

- Change `docs/design.md` in the same pull request as a change to the design.
  Update its status table (section 10) when a planned part is built, and add a
  row to the decision log (section 11) when you settle an open question.
- Generated `SKILL.md` files must follow the open Agent Skills format. Do not add
  fields that only bluer understands; put bluer settings in `bluer.json`.
- The agent never writes to a user's `intent.md`. Code that writes to it is a bug.
- Every check of a skill must include a trigger test and a negative test. A
  format check alone is not enough. See `docs/lessons-from-practice.md`.
- Keep user data local. Do not add telemetry or calls to outside services.

## Writing style

Write docs and comments for a reader who has no context. Say what a thing does
and why. Use short sentences and active voice.
