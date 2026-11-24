# Contributing to bluer

Thank you for helping. bluer is young, so every report and every pull request
shapes it.

## Ways to help

- **Use it and tell us what happened.** The most useful report is a skill that
  learned something wrong, or did not learn something it should have. Open an
  issue with the "A skill learned something wrong" form.
- **Bring bluer to another agent.** bluer works in Claude Code and OpenAI Codex.
  Google Antigravity, Gemini CLI, Cursor, GitHub Copilot and others are open to
  contributors. [docs/adding-an-agent.md](docs/adding-an-agent.md) says what an
  adapter needs and how to prove it works.
- **Pick a "good first issue".** They are small, and the issue says where to
  start.
- **Add a learning eval case.** A case in `evals/learning/cases.yaml` that
  catches a real mistake is worth more than new code. See
  [evals/README.md](evals/README.md).

## Before you open a pull request

1. Read [AGENTS.md](AGENTS.md): how to build and test, and the rules for this
   repo.
2. Run `npm run check` (typecheck, tests, and the plugin bundle).
3. If you changed `src/`, run `npm run build:plugin` and commit
   `plugins/claude-code/bin/bluer.mjs`. CI fails when the bundle is out of date.
4. If you changed the notes that bluer gives the agent (`src/agents/hooks.ts`)
   or the `bluer` skill, run the learning eval, and put the result in the pull
   request.
5. Write prose in short, plain sentences. Many bluer users do not write code.

Keep a pull request to one change. Say what it changes for the user and how you
tested it.

## Design changes

bluer's decisions are in [docs/design.md](docs/design.md), section 11. For a
change to how bluer learns, or to what it may change without asking, open an
issue first, so that we can agree on the decision before you write the code.

## Be kind

Assume good intent, keep feedback about the work, and help newcomers. Rude or
hostile behavior gets a warning, then a block.

By contributing, you agree that your work is published under the
[MIT license](LICENSE).
