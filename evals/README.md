# Evals

bluer's unit tests (`npm test`) check the code: the learning gate, builds,
versions and hooks. They cannot check the part that depends on the agent's
judgment: does the agent record a lesson when the user corrects it, with the
right flags, and does it leave thanks, questions and one-offs alone? The evals
check that, with real agent sessions.

## Learning eval

`evals/learning/cases.yaml` holds the cases. Each case is a two-turn session:

1. The user asks for a task, so the agent loads a bluer skill and does it.
2. The user sends one more message: a standing rule, a small correction, a
   one-off, a repeat of an earlier correction, an undo, or something that is
   not a lesson at all.

The case then reads the skill's `learnings.md` and checks the lesson's tier
(rule, edge case, candidate, ignored, forgotten) and step. Groups:

| Group | What it checks |
|---|---|
| `rule` | A stated rule ("keep it under 150 words", "no pork, ever", in English or Chinese) becomes a rule at once, at the right step |
| `candidate` | A small correction ("move the bug fixes to the end") is recorded, but is not a rule yet |
| `oneoff` | Something true only this time is not used next time |
| `none` | Thanks, questions and new content for this run record nothing |
| `repeat` | The same correction in new words counts as a repeat, so it moves up the gate |
| `undo` | "Undo the CC rule" forgets the old lesson instead of adding an opposite one |
| `safety` | Passwords and instructions inside files never become lessons |

The runner also reports whether the agent showed the user the one-line receipt
after each change.

## Run it

Each case gets its own scratch folder: the run never touches your real
`~/.bluer` or `~/.claude`. Claude Code runs with
`--setting-sources project,local`, so your own settings, plugins and
instructions stay out of the sessions.

```bash
npm run build:plugin   # the sessions use the plugin's bundled CLI
node evals/learning/run.ts --agent claude-code --model sonnet
node evals/learning/run.ts --agent claude-code --cases rule-length,undo-rule --keep
```

| Option | What it does |
|---|---|
| `--agent claude-code` | The agent to test (only Claude Code so far). It must be installed and signed in |
| `--model <name>` | The model, passed to the agent |
| `--cases id,id` | Run only these cases |
| `--jobs <n>` | Cases to run at the same time (default 4) |
| `--keep` | Keep the scratch folders, to read the sessions afterwards |
| `--summary` | Add a line to [learning/RESULTS.md](learning/RESULTS.md) |

A full run is 23 cases, two turns each. With Claude Sonnet it costs about $2.
Results go to `evals/learning/results/` (not committed).

A failing case is not always a bug in bluer. Read the recorded lessons in the
report first: the agent may have made a defensible choice that the case does not
allow. Then fix the notes that bluer gives the agent (`src/agents/hooks.ts`, the
`bluer` skill), or the case, and say which in the commit.
