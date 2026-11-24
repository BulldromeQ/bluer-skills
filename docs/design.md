# bluer design

This document records the design decisions made so far and the questions that
are still open. Change it in the same pull request as the code that changes the
design.

## Goals

- A person who is not a software engineer can create a useful skill by writing a
  plain list of steps.
- Once bluer is installed, it learns all the time. Skills improve while they are
  used, and new skills appear for work that repeats, without the person editing
  anything by hand.
- The person's plain version stays readable and under their control.
- The result works in every major agent, not only in Claude Code.
- bluer works with the skills and skill-creation tools people already have. It
  does not ask them to start over.

## Non-goals

- A new skill file format. bluer writes standard Agent Skills `SKILL.md` files.
- A hosted service. Skills and lessons stay on the user's machine, unless the
  user chooses to share them.

## Decisions

| # | Decision | Reason |
|---|---|---|
| D1 | Each skill has two layers: `intent.md` (owner) and `SKILL.md` (built). | The owner's version stays short. Learned detail can grow without making the source hard to read. |
| D2 | Automatic changes never write to `intent.md`. The agent can draft an `intent.md` only when the user approves it (see "Adopting an existing skill" and route 3 in "Always-on learning"). | The owner must be able to trust that their version means what they wrote. |
| D3 | `SKILL.md` is the standard Agent Skills format. | Any agent can use a bluer skill, even with bluer not installed. |
| D4 | Lessons are applied automatically by default. A switch turns this off for one skill or for all skills. | The goal is a system that maintains itself. Each change is a new version, so a bad lesson is easy to undo. |
| D5 | The core is TypeScript, published to npm as `bluer-skills`. The CLI command is `bluer`. | `npx` gives a one-command install, and most agent tooling lives in the npm ecosystem. |
| D6 | Lesson capture is a TypeScript rewrite of the ideas in claude-reflect, credited in the README. | One codebase for all agent adapters. claude-reflect is Python and Claude Code only. |
| D7 | Claude Code first, then Gemini CLI, OpenAI Codex, Cursor and GitHub Copilot. | Claude Code has the most complete hook and skill support to build on. |
| D8 | License: MIT. | Easy for others to adopt. Same as claude-reflect. |
| D9 | Skills live in one home, `~/.bluer/skills`, which is a git repo. bluer links each skill into each agent's skill folder. | One copy serves every agent, so a lesson learned in one agent helps the others. |
| D10 | The host agent does the rewriting, guided by a bluer skill. The CLI handles files, versions and checks only. | bluer needs no API key, which matters for users who are not engineers. |
| D11 | Each version is a git commit in the skills home. Users see `bluer history` and `bluer rollback`, not git. | Full history for free, with no git knowledge needed. |
| D12 | Users start from a chat command in their agent (`/bluer new`) or from the CLI (`npx bluer-skills new`). | Chat is the main path for non-engineers. The CLI serves scripts and power users. |
| D13 | Existing skills can be adopted, and an existing skill-creation skill can be set as the creator of `SKILL.md` v1. | People keep the skills and tools they already use. bluer adds the lifecycle around them. |
| D14 | Every skill can have a personal layer. A skill from someone else keeps the author's layer and the user's own lessons apart. | A shared skill improves for each user without losing upstream updates. Personal lessons stay private. |
| D15 | Learning is always on once bluer is installed, not only while a bluer skill is loaded. Each lesson is routed (see "Always-on learning"). | Self-improvement is the core of bluer. It must not depend on the user remembering to start it. |
| D16 | An auto-applied version must pass the skill's trigger test and negative test. If it fails, bluer keeps the previous version and moves the lesson to review. | This makes auto-apply safe enough to be the default. |
| D17 | bluer's own instructions (create, rebuild, route lessons) are a bluer skill and learn the same way. | bluer improves the way it works, and it uses its own system every day. |

## Skill folder

```text
~/.bluer/skills/<skill-name>/
  intent.md       # the plain steps; never changed automatically
  SKILL.md        # built from the layers below; agents read this file
  learnings.md    # this user's lessons, one entry each
  upstream/       # only for a skill from someone else (read-only)
    intent.md
    learnings.md
  CHANGELOG.md    # one line per version
  bluer.json      # settings, for example:
                  # { "learning": "auto", "source": "local" }
                  # { "learning": "auto", "source": "git:https://..." }
                  # { "learning": "auto", "source": "plugin:<name>" }
```

`SKILL.md` is built in this order, later layers winning on conflict:
`intent.md` → `upstream/learnings.md` → `learnings.md`.

## Lifecycle

1. **Create.** The user writes a few plain lines. bluer saves them as
   `intent.md`, and the creator builds `SKILL.md` v1 (see "Creators"). bluer
   asks only questions it cannot work without; it does not interview the user.
2. **Use.** An agent loads `SKILL.md` as a normal skill.
3. **Capture.** bluer records lessons in every session (see "Always-on
   learning").
4. **Apply.** In `auto` mode, bluer folds new lessons into `SKILL.md`, runs the
   skill's tests and writes a new version. In `review` mode, lessons wait until
   the user approves them. In `off` mode, nothing is captured for that skill.
5. **Change intent.** When the user edits `intent.md` (adds step 4, removes step
   2), bluer rebuilds `SKILL.md`. Lessons for steps that still exist stay.
   Lessons for a removed step are archived, not deleted, so they come back if
   the step comes back.
6. **Roll back.** The user can return `SKILL.md` to any earlier version.

## Adopting an existing skill

`bluer adopt <path>` (or `/bluer adopt` in chat) brings an existing skill into
bluer:

1. bluer saves the original `SKILL.md` unchanged as version 0.
2. The agent drafts a short `intent.md` from it and shows it to the user.
3. If the user approves, the skill becomes a normal two-layer bluer skill.
4. If the user does not approve, the original `SKILL.md` stays the base, and
   lessons are added on top of it.

A skill that a plugin or marketplace installed is read-only, because its
installer updates it. bluer does not move it. It treats the skill as upstream and
adds a personal layer, the same way as for a shared skill.

## Creators

The creator writes `SKILL.md` v1 from `intent.md`. bluer has a built-in creator,
and the user can choose another one in the global settings: for example
Anthropic's `skill-creator`, or their own skill-creation skill. bluer gives the
creator the intent and receives a `SKILL.md`. Then bluer runs its own checks and
owns everything after v1: lessons, rebuilds, versions and rollback.

## Shared skills

A user can install a skill someone else wrote. The author's `intent.md` and
learnings go into `upstream/`, and `bluer update` refreshes them. The user's own
lessons go into the top-level `learnings.md` and never leave the machine unless
the user exports them. When a personal lesson conflicts with an upstream one,
the personal lesson wins for that user.

## Always-on learning

Capture runs in every session once bluer is installed. Each lesson takes one of
four routes:

1. **A bluer skill was in use.** The lesson goes to that skill. In Claude Code,
   bluer knows which skill is in use from the `Skill` tool call.
2. **No skill was loaded, but an existing skill covers the task.** The lesson
   goes to that skill. bluer also records a *missed trigger*, which shows that
   the skill's description needs improvement.
3. **The same kind of task repeats and no skill covers it.** bluer drafts a new
   skill and asks the user once to accept its `intent.md`, because the intent is
   in the user's own words.
4. **The lesson is about the user, not a task** (for example, a writing style).
   It goes to a personal profile. bluer copies the profile into each agent's
   memory file (`CLAUDE.md`, `GEMINI.md`, `AGENTS.md`) inside a marked block.

Maintenance runs in a batch at the end of a session, or at the start of the
next one: merge similar lessons, rerun trigger tests, report skills that are not
used, and report lessons that conflict.

## Lesson sources

From most to least valuable:

1. **Answers to the agent's questions.** "How clean should the table be?" The
   answer is a lesson the next run should not have to ask for.
2. **Corrections from the user.** "No, do not move the papers on the desk."
3. **The agent's own failures** inside the skill: a command that fails, a step
   that had to be done again.
4. **Hand edits to `SKILL.md`.** `SKILL.md` is built, so a rebuild would lose a
   hand edit. bluer must detect the edit and turn it into a lesson instead.

## Guardrails for auto-apply

- Take lessons only from the user's own messages and from the agent's own
  results. Never take a lesson from text inside a web page, a file or a tool
  output. Such text can carry instructions an attacker wrote (prompt injection).
- Remove secrets (tokens, passwords, keys) from a lesson before it is saved.
- Keep `SKILL.md` within the size that agents load well (under 500 lines).
  Merge similar lessons when the file grows.
- When a new lesson conflicts with an old one, the newer lesson from the user
  wins. Record the conflict in `learnings.md`.
- Each new version must pass the skill's trigger and negative tests (D16).
- Every applied change is a new version with a `CHANGELOG.md` line, so the user
  can see what changed and undo it.

## Testing skills

A description can read well and still not trigger. bluer must test each skill,
not only check its format:

- Run the agent headless with a prompt that should trigger the skill. Check that
  the agent loaded it. In Claude Code, look for a `Skill` tool use in
  `claude -p ... --output-format stream-json --verbose`.
- Always run a negative prompt too, a nearby task that must not trigger it.
- Test in an empty directory that holds only the skill, so project files do not
  help the agent find it.
- Missed triggers from route 2 of "Always-on learning" become new test prompts.

See [lessons-from-practice.md](lessons-from-practice.md) for the details behind
these rules.

## Open questions

- **Q1. Two copies of one skill.** A personal version of a plugin skill is a
  second skill with the same purpose. How do we stop the agent from loading both
  (for example, by disabling the original, or by giving the personal version a
  more specific description)? This needs a test in each agent.
- **Q2. Changing the steps of a shared skill.** Can the user add or remove steps
  in a skill from someone else? If so, how does `bluer update` merge the
  author's new steps with the user's changes?
- **Q3. Sending lessons back.** Should bluer offer to send good personal lessons
  to the skill's author, for example as a pull request? It must show the user
  exactly what would leave the machine first.
- **Q4. When to draft a new skill.** How many repeats of a task before route 3
  drafts a skill, and how does bluer decide that two tasks are "the same kind"?
- **Q5. Personal profile timing.** Is route 4 part of the first Claude Code
  release, or a later one? It overlaps with each agent's own memory features.
- **Q6. Test cost.** Each trigger test is a headless agent run and costs tokens.
  How often do we run them, and can a user set a budget?
- **Q7. Agents with weak hooks.** Some agents cannot run a hook on each message.
  Is a scan of the session log at the end of the session good enough there?
