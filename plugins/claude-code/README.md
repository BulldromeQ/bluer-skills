# bluer for Claude Code

This plugin connects [bluer](https://github.com/BulldromeQ/bluer-skills) to
Claude Code. Create a skill from a few plain steps in chat. While Claude uses it,
the plugin records what Claude learns, and bluer folds the good lessons back into
the skill.

## Install

Requires Node.js 20 or later.

```text
/plugin marketplace add BulldromeQ/bluer-skills
/plugin install bluer@bluer-skills
```

## Use

- Ask in plain words: *"Make a skill for my weekly update email: 1. read my
  notes, 2. write a short summary, 3. email it to my team."*
- Or use the commands: `/bluer:new`, `/bluer:teach`, `/bluer:status`.
- Then use your skill as usual (`/weekly-update-email`, or just ask). When you
  correct Claude or answer its question, it records the lesson and tells you.

## What the plugin contains

| Part | What it does |
|---|---|
| `skills/bluer` | Teaches Claude how to create skills, record lessons and stay within the rules |
| `skills/new`, `teach`, `status` | Short commands that load the `bluer` skill |
| `hooks/hooks.json` | `SessionStart` writes `~/.bluer/bin/bluer`; `PostToolUse` (Skill) counts a run and tells Claude how to record lessons; `UserPromptSubmit` reminds Claude when a message looks like a lesson; `SessionEnd` rebuilds the skills used |
| `bin/bluer`, `bin/bluer.mjs` | The bluer CLI, bundled into one file. Built from `src/` with `npm run build:plugin`; do not edit it by hand |

Hooks never block a session: on any error they print to stderr and exit 0, and
without Node.js they do nothing.

## Privacy

Everything stays on your machine, in `~/.bluer`. The plugin sends nothing
anywhere.
