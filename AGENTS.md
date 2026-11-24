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
node src/main.ts help
```

- `src/store.ts` holds the skill operations; `src/cli.ts` only parses arguments
  and prints. `src/build.ts` and `src/gate.ts` are pure functions: keep file and
  git access out of them.
- Write imports with the `.ts` extension. `tsc` rewrites them to `.js` in `dist/`.
- Use only erasable TypeScript syntax (no `enum`, no `namespace`, no parameter
  properties), because Node strips types without compiling.
- Tests that touch files use a temp folder and set `home` and `userHome` in the
  `Context`. The CLI reads `BLUER_HOME`, `HOME` and `BLUER_TODAY` (a fixed date
  for tests). Never let a test write to the real `~/.bluer` or `~/.claude`.

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
