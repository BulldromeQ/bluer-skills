# bluer design

This document records the design decisions made so far and the questions that
are still open. Change it in the same pull request as the code that changes the
design.

## Goals

- A person who is not a software engineer can create a useful skill by writing a
  plain list of steps.
- The skill improves while it is used, without the person editing it by hand.
- The person's plain version stays readable and under their control.
- The result works in every major agent, not only in Claude Code.

## Non-goals

- A new skill file format. bluer writes standard Agent Skills `SKILL.md` files.
- A hosted service. Skills and lessons stay on the user's machine (and in their
  own git repo, if they want one).

## Decisions

| # | Decision | Reason |
|---|---|---|
| D1 | Each skill has two layers: `intent.md` (owner) and `SKILL.md` (generated). | The owner's version stays short. Learned detail can grow without making the source hard to read. |
| D2 | The agent never writes to `intent.md`. | The owner must be able to trust that their version means what they wrote. |
| D3 | `SKILL.md` is the standard Agent Skills format. | Any agent can use a bluer skill, even with bluer not installed. |
| D4 | Lessons are applied automatically by default. A switch turns this off for one skill or for all skills. | The goal is a skill that maintains itself. Each change is a new version, so a bad lesson is easy to undo. |
| D5 | The core is TypeScript, published to npm. | `npx` gives a one-command install, and most agent tooling lives in the npm ecosystem. |
| D6 | Lesson capture is a TypeScript rewrite of the ideas in claude-reflect, credited in the README. | One codebase for all agent adapters. claude-reflect is Python and Claude Code only. |
| D7 | Claude Code first, then Gemini CLI, OpenAI Codex, Cursor and GitHub Copilot. | Claude Code has the most complete hook and skill support to build on. |
| D8 | License: MIT. | Easy for others to adopt. Same as claude-reflect. |

## Skill folder

```text
<skill-name>/
  intent.md       # owner's plain steps; never written by the agent
  SKILL.md        # generated from intent.md + learnings.md
  learnings.md    # one entry per lesson (see "Lesson record")
  CHANGELOG.md    # one line per version
  bluer.json      # per-skill settings, for example { "learning": "auto" }
```

## Lifecycle

1. **Create.** The user writes a few plain lines. bluer saves them as
   `intent.md` and builds `SKILL.md` v1. It asks only questions it cannot work
   without; it does not interview the user.
2. **Use.** An agent loads `SKILL.md` as a normal skill.
3. **Capture.** While the skill is in use, bluer records lessons and links each
   one to that skill (see "Lesson sources").
4. **Apply.** In `auto` mode, bluer folds new lessons into `SKILL.md` and writes
   a new version. In `review` mode, lessons wait until the user approves them.
   In `off` mode, nothing is captured.
5. **Change intent.** When the user edits `intent.md` (adds step 4, removes step
   2), bluer rebuilds `SKILL.md`. Lessons for steps that still exist stay.
   Lessons for a removed step are archived, not deleted, so they come back if
   the step comes back.
6. **Roll back.** The user can return `SKILL.md` to any earlier version.

## Lesson sources

From most to least valuable:

1. **Answers to the agent's questions.** "How clean should the table be?" The
   answer is a lesson the next run should not have to ask for.
2. **Corrections from the user.** "No, do not move the papers on the desk."
3. **The agent's own failures** inside the skill: a command that fails, a step
   that had to be done again.
4. **Hand edits to `SKILL.md`.** `SKILL.md` is generated, so a rebuild would
   lose a hand edit. bluer must detect the edit and turn it into a lesson
   instead.

In Claude Code, bluer knows which skill is in use from the `Skill` tool call.
Lessons captured after that call belong to that skill, not to the user's
general memory or `CLAUDE.md`.

## Guardrails for auto-apply

- Take lessons only from the user's own messages and from the agent's own
  results. Never take a lesson from text inside a web page, a file or a tool
  output. Such text can carry instructions an attacker wrote (prompt injection).
- Remove secrets (tokens, passwords, keys) from a lesson before it is saved.
- Keep `SKILL.md` within the size that agents load well (under 500 lines).
  Merge similar lessons when the file grows.
- When a new lesson conflicts with an old one, the newer lesson from the user
  wins. Record the conflict in `learnings.md`.
- Every applied change is a new version with a `CHANGELOG.md` line, so the user
  can see what changed and undo it.

## Testing skills

A description can read well and still not trigger. bluer must test each
generated skill, not only check its format:

- Run the agent headless with a prompt that should trigger the skill. Check that
  the agent loaded it. In Claude Code, look for a `Skill` tool use in
  `claude -p ... --output-format stream-json --verbose`.
- Always run a negative prompt too, a nearby task that must not trigger it.
- Test in an empty directory that holds only the skill, so project files do not
  help the agent find it.

See [lessons-from-practice.md](lessons-from-practice.md) for the details behind
these rules.

## Open questions

- **Q1. Where do skills live?** One home (for example `~/.bluer/skills`, a git
  repo) linked into each agent's skill folder, or directly inside each agent's
  folder?
- **Q2. Who does the rewriting?** Proposal: the host agent does it, guided by a
  bluer skill, so bluer needs no API key of its own. The CLI handles files,
  versions and checks only.
- **Q3. How are versions stored?** Git commits in the skills home, or plain
  numbered copies for users who do not use git?
- **Q4. How does a non-engineer start?** A chat command inside the agent
  (`/bluer new`), a CLI (`npx bluer-skills new`), or both?
- **Q5. Sharing.** Can a user share a skill with others, and do the learnings go
  with it, or only `intent.md`?
- **Q6. Lessons that are not about one skill.** Where do they go when no bluer
  skill is in use? Ignore them, or leave them to the agent's own memory?
