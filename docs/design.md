# bluer design

This document describes how bluer works and why. Read sections 1 and 2 for the
model. Read the rest for the parts you work on.

Keep this document true. Change it in the same pull request as the code that
changes the design, and update the status table in section 10.

**Contents**

1. [The problem and the idea](#1-the-problem-and-the-idea)
2. [Words we use](#2-words-we-use)
3. [Principles](#3-principles)
4. [The skill model](#4-the-skill-model)
5. [Lifecycle](#5-lifecycle)
6. [Learning](#6-learning)
7. [Safety](#7-safety)
8. [Existing, created and shared skills](#8-existing-created-and-shared-skills)
9. [Agent adapters](#9-agent-adapters)
10. [Status](#10-status)
11. [Decision log](#11-decision-log)
12. [Open questions](#12-open-questions)

## 1. The problem and the idea

Agent skills (`SKILL.md` files) let an agent do a task the way a person wants.
Four things make them hard to use today:

- **They are hard to write.** A good skill needs a precise description, clear
  steps and the right detail. Most people who are not engineers cannot write one.
- **They are hard to read.** A skill that works well is long and full of detail.
  Its owner can no longer see, at a glance, what it does.
- **They go stale or bloat.** The world changes and the skill does not. Or the
  agent writes every edge case into it until the important rules get lost.
- **Each agent is different.** A skill and its upkeep do not move from one agent
  to another.

bluer splits each skill into two layers, after 青出于蓝而胜于蓝 ("blue comes from
the indigo plant, yet it is bluer than the plant"):

- **蓝, the source:** `intent.md`, the owner's short steps in their own words.
- **青, the refined result:** `SKILL.md`, which bluer builds from the source plus
  every lesson that passed the learning gate.

The owner reads and edits the short version. Agents read the detailed one.
bluer keeps the detailed one current, versioned and short enough to work.

### Goals

- A person who is not a software engineer can create a useful skill by writing a
  few plain lines.
- Once installed, bluer learns all the time. Skills improve while they are used,
  and new skills appear for work that repeats.
- The owner's version stays short, true and under the owner's control.
- bluer works in every major agent, and with the skills and tools people already
  have.

### Non-goals

- A new skill format. bluer writes standard [Agent Skills](https://agentskills.io)
  `SKILL.md` files.
- A hosted service. Skills and lessons stay on the user's machine unless the user
  chooses to share them.

## 2. Words we use

| Word | Meaning |
|---|---|
| Owner | The person a skill belongs to. For a shared skill, its **author** owns `intent.md`. |
| Intent | `intent.md`: a title, numbered steps and optional notes, in the owner's words. |
| Built skill | `SKILL.md` and `references/learned-edge-cases.md`, which bluer builds. Agents read these. |
| Lesson | One thing learned: an answer, a correction, a failure or a hand edit. Stored in `learnings.md`. |
| Tier | Where the learning gate puts a lesson: rule, edge case, candidate or ignored. |
| Version | One built state of a skill. Each version is a git commit in the bluer home. |
| Run | One use of a skill by an agent. Candidates expire by runs as well as by days. |
| Home | `~/.bluer` (or `$BLUER_HOME`), a git repo that holds every skill. |
| Creator | The skill that writes the first detail for a new skill: bluer's own, or one the user picks. |
| Adapter | The code that connects bluer to one agent: install, lesson capture and tests. |

## 3. Principles

1. **The owner's words are never changed automatically.** bluer may propose a
   change to `intent.md`. It changes the file only after the owner says yes.
2. **Learn by default, and make every change easy to undo.** Each change is a
   version, and rollback is one command.
3. **Keep skills short.** A lesson must earn its place. Rare cases go to a side
   file, and one-offs are not kept.
4. **Standard output.** A bluer skill works in any agent, with or without bluer.
5. **Local and private.** No telemetry. Nothing leaves the machine without a yes.
6. **No API key.** The host agent does the language work. The CLI does files,
   versions and checks.
7. **Work with what exists.** Adopt existing skills, accept other creators, and
   add a personal layer on top of skills that other people share.

## 4. The skill model

### Home

```text
~/.bluer/                 # a git repo
  settings.json           # global settings and levels (section 7)
  skills/<name>/          # one folder per skill, linked into each agent's skill folder
  backups/                # agent skill folders that "bluer link --replace" moved aside (not in git)
```

### Skill folder

```text
<name>/
  intent.md               # the owner's steps; never changed automatically
  intent.local.md         # shared skills only: the user's own extra steps
  SKILL.md                # built; agents read this file
  references/
    learned-edge-cases.md # built; rare cases, read only when they come up
  learnings.md            # this user's lessons, one block each
  base/SKILL.md           # adopted or externally created skills: the base text, unchanged
  upstream/               # shared skills only: the author's layer (read-only)
    intent.md
    learnings.md
  hand-edits/             # copies of SKILL.md that someone edited by hand
  CHANGELOG.md            # one line per version
  bluer.json              # mode, source, version, run count, description, hash of SKILL.md
```

The edge-case file has a `learned-` prefix so that it never overwrites a
reference file that an adopted skill already has.

### Build order

`SKILL.md` is built from these layers. A later layer wins on conflict.

1. The base: `intent.md` (plus `intent.local.md`), or `base/SKILL.md` for a
   skill in base mode (section 8).
2. The description in `bluer.json`, when an agent has written one.
3. `upstream/learnings.md`, for a shared skill.
4. `learnings.md`, the user's own lessons.

The build is a pure function: the same layers always give the same files. This
keeps builds easy to test, to diff and to roll back.

### Steps and lessons

A lesson belongs to a step by the step's text, not its number. Adding or
reordering steps does not move lessons to the wrong step. When a step is removed,
its lessons are archived; when the step comes back, so do they.

When the user undoes a lesson (`bluer forget`), it is marked forgotten, not
deleted. If an agent records the same lesson again, it stays forgotten: the user
said no once, and an agent must not override that. `bluer restore` brings it
back.

### Built `SKILL.md`

- Frontmatter: `name`, `description` and `metadata` (`built-by`, `version`),
  written with a YAML library so that values such as `a: b` are quoted.
- A notice that the file is built and must not be edited by hand.
- The title, the owner's notes, then one section per step with that step's
  rules, then general rules.
- A pointer to `references/learned-edge-cases.md` when there are edge cases.

## 5. Lifecycle

1. **Create.** The user writes a few plain lines in chat or on the command line.
   bluer saves them as `intent.md` and builds v1. The creator adds the first
   detail (section 8). bluer asks only the questions it cannot work without.
2. **Use.** An agent loads `SKILL.md` as a normal skill. The adapter counts a run.
3. **Capture.** The adapter records lessons in every session (section 6).
4. **Gate.** Each lesson gets a tier. Only rules and edge cases change the built
   skill.
5. **Apply.** In `auto` mode, bluer builds a new version at once. In `review`
   mode, new lessons wait as pending until the user approves them. In `off`
   mode, nothing is captured for that skill.
6. **Test.** After an automatic change, bluer runs the skill's trigger tests.
   If they fail, bluer keeps the previous version and moves the lesson to
   review (section 7).
7. **Change the intent.** The owner edits `intent.md` (adds step 4, removes step
   2). bluer rebuilds and keeps every lesson whose step still exists.
8. **Roll back.** The user returns the learned layer to an earlier version.
   bluer restores `learnings.md` from that version and builds a new version from
   it. Rollback never changes `intent.md`: it undoes what was learned, not what
   the owner wrote. Later lessons come back as new lessons if they happen again.

## 6. Learning

### Lesson sources

From most to least valuable:

1. **Answers to the agent's questions.** "Who should get the update?" The next
   run should not have to ask again.
2. **Corrections from the user.** "No, leave out meetings shorter than 15 minutes."
3. **The agent's own failures** inside the skill: a command that fails, a step
   that had to be done again.
4. **Hand edits to `SKILL.md`.** A rebuild would lose them. bluer detects the
   edit by its hash, saves a copy in `hand-edits/`, and records a pending lesson
   that points to it. The agent then turns the edit into real lessons.

### Routes

Capture runs in every session once bluer is installed, not only while a bluer
skill is loaded. Each lesson takes one route:

1. **A bluer skill was in use.** The lesson goes to that skill. In Claude Code,
   the adapter knows the skill from the `Skill` tool call.
2. **No skill was loaded, but a skill covers the task.** The lesson goes to that
   skill, and bluer records a *missed trigger*. Missed triggers improve the
   skill's description and become new trigger tests.
3. **The same kind of task repeats and no skill covers it.** After 3 repeats,
   bluer drafts a new skill and asks the user once to accept its `intent.md`.
   To count repeats, the agent writes a one-line summary (goal and main steps)
   of each task to a local task log. Two tasks are the same kind when their goal
   and main steps match.
4. **The lesson is about the user, not a task** (for example, a writing style).
   It goes to a personal profile, which bluer copies into each agent's memory file
   (`CLAUDE.md`, `GEMINI.md`, `AGENTS.md`) inside a marked block. This route ships
   with the second agent, because it adds most value when a user has two agents.

### Learning gate

Agents tend to write every edge case into a skill. The gate keeps the main body
for real rules:

| Tier | Where it goes | When (level `balanced`) |
|---|---|---|
| Rule | Main body of `SKILL.md` | The user stated a standing rule ("always CC my manager", "keep it under 150 words", "remember this"); or the lesson prevented a costly failure (impact `high`); or it was seen 3 times |
| Edge case | `references/learned-edge-cases.md`, read only when the case comes up | Seen 2 times, or impact `medium` |
| Candidate | `learnings.md` only; the built skill does not change | Seen once, impact `low` |
| Ignored | Kept in `learnings.md`, never built | About one run only ("this week, leave out the offsite planning"). A one-off that comes back is no longer a one-off. |

- A candidate expires after 30 days or 10 runs without a sighting. It is kept as
  `expired`, and becomes active again if it is seen again.
- Rules and edge cases do not expire. A rule that has not been needed for a long
  time moves down to the edge-case file.
- The main body has a size budget (under 500 lines, the size agents load well).
  When it is full, a new rule replaces a weaker one or goes to the edge-case file.

The level changes the numbers:

| Level | Rule at | Edge case at | Candidate expires after |
|---|---|---|---|
| `balanced` (default) | 3 sightings | 2 sightings | 30 days or 10 runs |
| `strict` | 4 | 3 | 14 days or 5 runs |
| `eager` | 2 | 2 | 60 days or 20 runs |

### Intent drift

`intent.md` must stay true. When lessons pull the skill away from what the intent
says, bluer reports it at the end of a session and proposes an edit. Signs of
drift:

- The user corrects the same step again and again in the same direction.
- A step is always skipped, or the agent always adds a step the intent does not
  name.
- A lesson contradicts the words of a step.

```text
Step 3 says "email it to my team". You told me 4 times to post it in the
team chat instead. Change step 3 to "post it in the team chat"?
[yes] [no] [edit]
```

bluer changes `intent.md` only after a yes. For a shared skill, a yes does not
change the author's version: bluer offers the change to the author, at the
user's sharing level.

### Maintenance

At the end of a session (or the start of the next one), bluer runs in a batch:
merge similar lessons, check for drift, rerun trigger tests for changed skills,
and report unused skills and conflicting lessons.

## 7. Safety

### Guardrails for automatic changes

- **Trusted sources only.** Take lessons only from the user's own messages and
  from the agent's own results. Never take a lesson from text inside a web page,
  a file or a tool output: such text can carry instructions an attacker wrote
  (prompt injection).
- **No secrets.** Remove tokens, passwords and keys from a lesson before it is
  saved.
- **Conflicts.** When a new lesson conflicts with an old one, the newer lesson
  from the user wins, and bluer records the conflict.
- **Test gate.** An automatic version must pass the skill's trigger test and
  negative test, or bluer keeps the previous version.
- **A receipt for every lesson.** `bluer learn` prints one line for the user:
  what the skill learned, its tier, and "Say "undo that" to remove it". The
  agent shows that line word for word. No lesson changes a skill without the
  user seeing it.
- **Undo in one sentence.** "Undo that" makes the agent run
  `bluer forget <skill> --last`. bluer stores the id of the last lesson it
  recorded, so the agent does not have to guess which one.
- **Visible history.** Every change is a version with a `CHANGELOG.md` line.

### Trigger tests

A description can read well and still not trigger. bluer tests behaviour, not
only format:

- Run the agent headless with a prompt that should load the skill, and check
  that it did. In Claude Code, look for a `Skill` tool use in the output of
  `claude -p ... --output-format stream-json --verbose`.
- Always run a negative prompt too: a nearby task that must not load the skill.
- Run in an empty folder that holds only the skill, so that project files do not
  help the agent find it.

See [lessons-from-practice.md](lessons-from-practice.md) for the reasons behind
these rules.

### Levels

The user picks how much to trust automation and how many tokens to spend:

| Setting | Levels (default first) | What changes |
|---|---|---|
| `learning` | `auto` · `review` · `off` | Whether lessons change the skill at once, after approval, or not at all. A skill's `bluer.json` can override it. |
| `gate` | `balanced` · `strict` · `eager` | How quickly a lesson becomes a rule (section 6). |
| `tests` | `standard`: at session end, changed skills only, with a daily limit · `light`: only when a description changes · `thorough`: every version, all tests | Token cost against confidence. |
| `sharing` | `ask`: each lesson, with a yes · `digest`: once a week · `off`: never offer | How lessons are offered to a shared skill's author. At every level, nothing leaves without a yes, and bluer shows the exact text first. |

## 8. Existing, created and shared skills

A skill has one of two **modes**:

- **intent mode:** built from `intent.md` plus lessons. This is the normal mode.
- **base mode:** built from a fixed base text (`base/SKILL.md`) plus lessons. Used
  for adopted skills whose intent is not approved yet, and for skills that an
  external creator wrote.

### Adopting an existing skill

`bluer adopt <folder>` (or `/bluer adopt` in chat):

1. bluer copies the skill into the home and keeps the original `SKILL.md`
   unchanged as `base/SKILL.md` and as version 0. The original folder is not
   touched; `bluer link --replace` swaps it for the bluer copy.
2. The agent drafts a short `intent.md` from it and shows it to the user.
3. With a yes, the skill moves to intent mode. Without one, it stays in base mode
   and lessons are added on top.

### Creators

A new skill needs more than its steps: a good description, and detail for each
step. The creator writes that first detail.

- **bluer's own creator** writes its detail as lessons with the source `creator`
  and a description in `bluer.json`. The skill stays in intent mode, so the gate,
  drift checks and rollback treat the creator's work like any other lesson.
- **An external creator** (for example Anthropic's `skill-creator`, or the user's
  own) returns a full `SKILL.md`. bluer stores it as `base/SKILL.md` and keeps
  `intent.md` next to it for the owner. When the owner changes `intent.md`,
  bluer asks the creator to write a new base, then applies the lessons again.

### The description

The description decides when an agent loads a skill. bluer writes a simple one
from the intent. An agent replaces it with a better one in `bluer.json`, and
missed triggers improve it later. A rebuild never overwrites it.

### Shared skills

A user can install a skill someone else wrote:

- The author's `intent.md` and learnings go into `upstream/`, which is read-only.
  `bluer update` refreshes it.
- The user's own lessons go into the top-level `learnings.md` and stay on the
  machine. A personal lesson wins over an upstream one for that user.
- The user can add their own steps in `intent.local.md`. They come after the
  author's steps, and they stay local.
- Good personal lessons can be offered to the author, at the user's sharing
  level.

A skill that a plugin or marketplace installed is treated the same way: the
plugin's text is the upstream layer, and the user's lessons are the personal
layer. Section 12 explains why this case is still open.

## 9. Agent adapters

Each agent gets one adapter. An adapter provides:

| Capability | What it does | Claude Code | Gemini CLI |
|---|---|---|---|
| Skill folder | Where the agent reads personal skills; bluer links skills there | `~/.claude/skills/<name>`; symlinks work | `~/.agents/skills/<name>`; symlinks work |
| Chat entry | Commands the user types in chat | A plugin with a `/bluer` skill | An extension with the `bluer` skill and TOML commands |
| Skill-in-use signal | Which skill is loaded, to count runs and route lessons | `PostToolUse` hook on the `Skill` tool | `AfterTool` hook on the `activate_skill` tool |
| Message capture | The user's messages, to find answers and corrections | `UserPromptSubmit` hook | `BeforeAgent` hook |
| Session end | When to run the batch (gate, drift, tests) | `Stop` / `SessionEnd` hooks | `SessionEnd` hook |
| Headless run | Runs trigger tests | `claude -p --output-format stream-json` | `gemini -p -o stream-json` |

The hook logic is shared (`src/agents/hooks.ts`). Each adapter gives a small
dialect: its event names, its skill tool and the input field that names the
skill, and how its own bluer skill is named.

Findings from the Claude Code adapter:

- Plugin skills load as `/<plugin>:<skill>`, so the plugin's skills are
  `bluer:bluer`, `bluer:new`, `bluer:teach` and `bluer:status`.
- A user who types `/<skill>` skips the `Skill` tool, so `PostToolUse` does not
  fire. The `UserPromptSubmit` hook catches the slash and counts the run.
- Claude Code's permission check refuses a command that sets a shell variable
  (`B=...; $B learn`). The skill and the hook note tell the agent to run each
  command with its full path.
- `claude --continue` resumes the same session, so session state is kept and
  pruned after 7 days instead of deleted at `SessionEnd`.
- The plugin's install path changes with each update. Hooks write a stable shim
  at `~/.bluer/bin/bluer`, so "don't ask again" permission rules keep working.
- An agent tends to mark a direct instruction ("keep it under 150 words") as a
  rule. That is right: the gate is for situational corrections and edge cases,
  not for rules the user states. `--always` means "a standing rule".

Findings from the Gemini CLI adapter (Gemini CLI 0.68):

- Gemini CLI installs an extension only from the root of a repository, so
  `gemini-extension.json`, `hooks/`, `commands/` and `skills/` sit at the repo
  root. The hooks run the same bundled CLI as the Claude Code plugin, through
  `${extensionPath}/plugins/claude-code/bin/bluer`.
- `${extensionPath}` is replaced in the manifest and in `hooks/hooks.json`, but
  not in a skill body. The extension's `skills/bluer/SKILL.md` is generated from
  the Claude Code skill by `scripts/build-gemini-extension.ts` and uses the
  stable shim `~/.bluer/bin/bluer`.
- Gemini CLI reads both `~/.gemini/skills` and `~/.agents/skills`. bluer links
  into `~/.agents/skills`, which other agents also read.
- A typed `/<skill>` also calls `activate_skill`, so the `AfterTool` hook counts
  every run and the prompt hook does not need to catch the slash.
- Gemini CLI escapes `<` and `>` in hook context, so the hook notes do not use
  angle brackets.
- The session log is JSONL. Model lines have `type: "gemini"` and the text in a
  top-level `content` field, not in `message.content` as in Claude Code.
- An extension cannot pre-approve a shell command. The user approves the
  `bluer` command once ("Allow for all future sessions").

An agent that cannot run a hook on each message gets a fallback: at the end of a
session (or the start of the next one), the adapter scans the session log for
lessons. This is enough for a first version of such an adapter.

Order: Claude Code, Gemini CLI, then OpenAI Codex, Cursor and GitHub Copilot.
Check each agent's current hook and skill support when its adapter is built.

## 10. Status

| Part | Status |
|---|---|
| CLI: `new`, `learn`, `forget`, `restore`, `approve`, `used`, `build`, `list`, `status`, `history`, `rollback`, `adopt`, `link`, `init` | Built |
| Intent parsing (one line or one step per line, Chinese punctuation) | Built |
| Learning gate with levels, candidate expiry by days and runs | Built |
| Build in intent mode and base mode; edge-case file | Built |
| Lessons follow steps by text; archive and restore with the step | Built |
| Lesson receipts, `bluer forget` (`--last`) and `bluer restore`; `status` lists each lesson | Built; tested live in Claude Code and Gemini CLI |
| Hand-edit detection and saving | Built |
| Git versions, history, rollback that keeps `intent.md` | Built |
| Link into each installed agent's skills folder; never overwrite without `--replace` | Built |
| Settings file with all four levels | Built (only `learning` and `gate` have an effect yet) |
| External creators | Planned |
| Claude Code plugin: `bluer` skill, `/bluer:new`, `/bluer:teach`, `/bluer:status`, capture hooks (route 1), run counting | Built; tested live with `claude -p --plugin-dir` |
| `bluer describe` (description in `bluer.json`), `bluer add-step`, creator lessons | Built |
| Trigger tests and the test gate | Planned |
| Size budget and rule demotion | Planned |
| Intent drift reports | Planned |
| Routes 2–4 (missed triggers, new-skill drafts, personal profile) | Planned |
| Shared skills, `upstream/`, `intent.local.md`, sharing levels | Planned |
| Secret removal in lessons | Planned |
| Gemini CLI extension: `bluer` skill, `/bluer:new`, `/bluer:teach`, `/bluer:status`, capture hooks, run counting | Built; tested live with `gemini -p` |
| Adapters for Codex, Cursor, Copilot | Planned |

## 11. Decision log

IDs are stable: other documents and commits refer to them.

| # | Decision | Reason |
|---|---|---|
| D1 | Each skill has two layers: `intent.md` (owner) and `SKILL.md` (built). | The owner's version stays short while learned detail grows. |
| D2 | Automatic changes never write to `intent.md`. An agent may draft one only with the user's yes. | The owner must trust that their version means what they wrote. |
| D3 | `SKILL.md` is the standard Agent Skills format. | A bluer skill works in any agent, even without bluer. |
| D4 | Lessons apply automatically by default; a switch turns this off per skill or for all. | The goal is a system that maintains itself; versions make mistakes easy to undo. |
| D5 | TypeScript core on npm as `bluer-skills`; the command is `bluer`. | One-command install with `npx`; most agent tooling lives on npm. |
| D6 | Lesson capture is a TypeScript rewrite of ideas from claude-reflect, credited. | One codebase for every adapter; claude-reflect is Python and Claude Code only. |
| D7 | Claude Code first, then Gemini CLI, OpenAI Codex, Cursor, GitHub Copilot. | Claude Code has the most complete hook and skill support. |
| D8 | MIT license. | Easy to adopt. |
| D9 | One home, `~/.bluer`, a git repo, linked into each agent's skill folder. | One copy serves every agent. |
| D10 | The host agent does the language work; the CLI does files, versions and checks. | No API key, which matters for non-engineers. |
| D11 | Each version is a git commit; users see `history` and `rollback`, not git. | Full history with no git knowledge. |
| D12 | Users start in chat (`/bluer new`) or on the CLI (`npx bluer-skills new`). | Chat for non-engineers; the CLI for scripts and power users. |
| D13 | Existing skills can be adopted; an existing skill-creation skill can be the creator. | People keep the skills and tools they have. |
| D14 | A shared skill keeps the author's layer and the user's lessons apart. | It improves for each user without losing upstream updates. |
| D15 | Learning is always on, not only while a bluer skill is loaded; lessons are routed. | Self-improvement must not depend on the user remembering to start it. |
| D16 | An automatic version must pass its trigger and negative tests, or it is not kept. | Makes auto-apply safe enough to be the default. |
| D17 | bluer's own instructions are a bluer skill and learn the same way. | bluer improves how it works, and uses its own system daily. |
| D18 | When the learned version drifts from `intent.md`, bluer proposes an edit; it changes the file only with a yes. | The short version must stay true. |
| D19 | Every lesson passes the learning gate; one-off edge cases wait and expire. | Skills stay short and keep their important rules. |
| D20 | Route 3 drafts a new skill after 3 repeats of the same kind of task. | Fewer repeats would draft skills for one-off work. |
| D21 | The personal profile ships with the second agent's adapter. | Claude Code already has memory; the profile helps most across agents. |
| D22 | Users choose levels for learning, gate, tests and sharing. | Users differ in trust and in token budget. |
| D23 | A user's own steps on a shared skill go in `intent.local.md`, after the author's steps. | The user can extend a shared skill without forking it. |
| D24 | Two tasks are "the same kind" when the one-line summaries of their goal and main steps match. | Gives route 3 a count that means something. |
| D25 | Agents without per-message hooks scan the session log at session end. | Good enough for a first adapter; better than no capture. |
| D26 | bluer's own creator writes lessons (source `creator`); an external creator's `SKILL.md` becomes a base. | A rebuild must never wipe the creator's work, and the built-in path keeps one model for everything learned. |
| D27 | The description lives in `bluer.json`, written by an agent and improved by missed triggers. | It decides triggering, so it must survive rebuilds and improve with use. |
| D28 | Each lesson gets a one-line receipt that the agent shows word for word; "undo that" forgets the last lesson, and a forgotten lesson stays forgotten. | Users fear "the agent changed my skill". Seeing every change, and undoing it in one sentence, builds more trust than history and rollback alone. |

## 12. Open questions

- **Q1. Two copies of a plugin skill.** A plugin owns its skill file and replaces
  it on each update, so a personal layer needs a second, built copy. The agent may
  then pick the original and ignore the user's lessons, load both and get
  conflicting instructions, or keep a stale copy after a plugin update. Duplicate
  names also behave differently in each agent. Candidate fixes, per agent:
  - A. Turn off the original. Some agents can only turn off a whole plugin.
  - B. Hide the original by giving the copy the same name, where the agent's
    rules let the copy win.
  - C. Patch the plugin's file in place, and patch it again after each update.
  - D. Add a notes-only companion skill. Nothing makes the agent load both.

  Plan: use A where an agent supports it, else C, and prove the result with a
  trigger test in each agent.
