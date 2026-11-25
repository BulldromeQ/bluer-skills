# bluer for Claude Code

This plugin connects [bluer](https://github.com/BulldromeQ/bluer-skills) to
Claude Code. Create a skill from a few plain steps in chat. While Claude uses it,
the plugin records what Claude learns, and bluer folds the good lessons back into
the skill.

## Install

Runs on Node.js 20 or later. If it is missing or too old, the plugin tells you
when Claude Code starts. Say "set up bluer" to download Node.js for bluer only.

```text
/plugin marketplace add BulldromeQ/bluer-skills
/plugin install bluer@bluer-skills
```

### OpenAI Codex

Codex installs this same plugin. It reads `.codex-plugin/plugin.json`, which
points it to `hooks/codex-hooks.json`.

```bash
codex plugin marketplace add BulldromeQ/bluer-skills
codex plugin add bluer@bluer-skills
```

Then start Codex and trust the plugin's hooks when it asks.

## Use

- Ask in plain words: *"Make a skill for my weekly update email: 1. read my
  notes, 2. write a short summary, 3. email it to my team."*
- Or use the commands: `/bluer:new`, `/bluer:teach`, `/bluer:status`.
- Then use your skill as usual (`/weekly-update-email`, or just ask). When you
  correct Claude or answer its question, it records the lesson and shows you a
  one-line receipt. Say "undo that" to remove the lesson.

## What the plugin contains

| Part | What it does |
|---|---|
| `skills/bluer` | Teaches Claude how to create skills, record lessons and stay within the rules |
| `skills/new`, `teach`, `status` | Short commands that load the `bluer` skill |
| `hooks/hooks.json` | `SessionStart` writes `~/.bluer/bin/bluer` and checks for Node.js; `PostToolUse` (Skill) counts a run of a bluer skill and gives Claude its known lessons; `UserPromptSubmit` adds a short note on how to record lessons, only while a bluer skill is in use; `SessionEnd` rebuilds the skills used |
| `bin/bluer`, `bin/bluer.mjs` | `bin/bluer` finds Node.js and runs `setup`; `bin/bluer.mjs` is the bluer CLI, bundled into one file. Built from `src/` with `npm run build:plugin`; do not edit it by hand |
| `.codex-plugin/plugin.json`, `hooks/codex-hooks.json` | What Codex reads instead of `.claude-plugin/plugin.json` and `hooks/hooks.json`: the same skills, with hooks that run as `bluer hook codex` |
| `skills/*/agents/openai.yaml` | Tells Codex to load `new`, `teach` and `status` only when the user asks for them |
| `bin/node-pins.txt` | The Node.js release and checksums that `bin/bluer setup` uses. Made by `scripts/pin-node.ts` |

Hooks never block a session: on any error they print to stderr and exit 0.
Without a usable Node.js, the `SessionStart` hook shows a message with the fix
and the other hooks do nothing. Set `BLUER_NODE` to a Node.js path to skip the
search.

`bin/bluer setup` downloads the Node.js release pinned in `bin/node-pins.txt`
from nodejs.org, checks its SHA-256 against the pin, and keeps only `bin/node`
in `~/.bluer/runtime`. bluer uses that Node.js first. It does not change PATH.

## What the plugin runs, reads and writes

- **Runs:** Node.js (to run `bin/bluer.mjs`) and `git` (to keep versions of
  your skills in `~/.bluer`). `bin/bluer setup` also runs `curl` or `wget`,
  `shasum` or `sha256sum`, and `tar`.
- **Reads:** the files in `~/.bluer`; the hook input that Claude Code sends;
  and the last reply in the current session log, to tell if Claude asked you a
  question.
- **Writes:** `~/.bluer` (your skills, lessons, versions, settings, and the
  `bluer` command in `~/.bluer/bin`), and links to your skills in
  `~/.claude/skills` and `~/.agents/skills`. It never changes PATH or your
  shell settings.
- **Fetches:** nothing, except when you run `bluer setup`: then it downloads
  the pinned Node.js release from nodejs.org (or `BLUER_NODE_MIRROR`, if you
  set it). Claude asks you before it runs this.
- **Sends:** nothing. bluer has no server and no telemetry. Your skills and
  lessons stay on your machine.
