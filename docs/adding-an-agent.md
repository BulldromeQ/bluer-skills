# Adding an agent

bluer ships adapters for Claude Code and OpenAI Codex. Support for other agents (Google Antigravity, Gemini CLI, Cursor, GitHub Copilot
and others) is open to contributors. This guide says what an adapter needs, and how to prove that it
works.

A bluer skill is a standard [Agent Skills](https://agentskills.io) `SKILL.md`,
so any agent that reads skills can already use one. An adapter adds the part
that makes it learn: it tells bluer when a skill is in use, and passes the
user's messages to the agent with a note on how to record lessons.

## What the agent must offer

| Need | Why | Claude Code | OpenAI Codex |
|---|---|---|---|
| A personal skills folder that follows symlinks | bluer keeps skills in `~/.bluer/skills` and links them in | `~/.claude/skills` | `~/.agents/skills` |
| A hook when a skill loads, with the skill's name | To count runs and give the agent the skill's lessons | `PostToolUse` on `Skill` | `PostToolUse` on `Bash` that reads a `SKILL.md`, and `$<skill>` in the prompt |
| A hook on each user message that can add model context | To remind the agent to record corrections | `UserPromptSubmit` | `UserPromptSubmit` |
| A hook at session start | To write the CLI shim and check for Node.js | `SessionStart` | `SessionStart` |
| A hook at session end (optional) | To rebuild the skills used in the session | `SessionEnd` | `SessionEnd` (at most 3 s) |
| A way to show text to the user from a hook (optional) | The Node.js message | `systemMessage` | `systemMessage` |
| A package that ships a skill and hooks together | So that users install one thing | Plugin in `plugins/claude-code` | The same plugin, through `.codex-plugin/plugin.json` |
| A headless mode that can resume a session | To run the learning eval | `claude -p`, `-c` | `codex exec --json`, `codex exec resume --last` |

An agent without a hook on each message can still work in a weaker form: scan
the session log at session end for lessons (design decision D25). Say so in the
adapter's notes.

## Steps

1. **Read the agent's source or docs, not blog posts.** Third-party guides
   often disagree about hook names, input fields and output formats. Check each
   fact you rely on.
2. **Write the adapter** in `src/agents/<id>.ts`: the skills folder, how to tell
   the agent is installed, and a `HookDialect` (see `src/agents/types.ts`):
   the agent's name for each hook event, its skill-loading tool, the input field
   that holds the skill name, and how its own bluer skill is named. Add it to
   `AGENTS` in `src/agents/index.ts`. The hook logic in `src/agents/hooks.ts` is
   shared; change it only for a real difference, and test both agents.
3. **Package it.** Reuse the bundled CLI in `plugins/claude-code/bin/` (the
   `bin/bluer` wrapper finds Node.js and runs `bluer.mjs`), so that there is one
   CLI to build. If the agent's skill format differs from Claude Code's, generate
   its copy of the `bluer` skill from `plugins/claude-code/skills/bluer/SKILL.md`
   in `npm run build:plugin` (the removed Gemini CLI adapter did this in
   `scripts/build-gemini-extension.ts`; see commit `5278857`), and add it to the
   CI up-to-date check.
4. **Test the dialect** in `test/hooks.test.ts`: a skill load counts a run and
   returns the note in the agent's event name, and the agent's own bluer skill
   is not counted.
5. **Test it live** in a scratch home (`BLUER_HOME`, `BLUER_USER_HOME`, and the
   agent's own home variable, if it has one): create a skill in chat, use it,
   correct it in a resumed session, and say "undo that".
6. **Run the learning eval.** Add the agent to `evals/learning/run.ts` (how to
   set up its home, run one turn, and resume), then run all cases. See
   [../evals/README.md](../evals/README.md). Put the result in
   `evals/learning/RESULTS.md` with `--summary`.
7. **Document it**: a row and install steps in the README's "Get started", the
   agent's column and findings in section 9 of [design.md](design.md), and the
   status table in section 10.

## Things that surprised us

- In Claude Code, a typed `/<skill>` loads the skill without the `Skill` tool,
  so the message hook catches the slash.
- Codex has no skill tool: the model reads `SKILL.md` with a shell command, and
  a typed `$<skill>` loads the file with no tool call at all. Codex also reads
  Claude Code plugins, so one plugin serves both.
- Claude Code's permission check refuses a command that sets a shell variable,
  so the notes tell the agent to run each command with its full path.
- A word list ("never", "always") missed plain corrections such as "move the
  bug fixes to the end", so the note goes with every message while a skill is
  in use. The learning eval found this.

## Notes from the Gemini CLI adapter

bluer had a Gemini CLI adapter until commit `5278857` (see `src/agents/gemini-cli.ts`
and the root `gemini-extension.json` there). Google moved Gemini CLI users to
Antigravity CLI, which keeps skills, hooks and extensions, so these notes may
help an Antigravity adapter:

- Skills loaded from `~/.agents/skills`, through the `activate_skill` tool
  (input `{ name }`); a typed `/<skill>` called the same tool.
- Hook events were `SessionStart`, `BeforeAgent` (the user's message),
  `AfterTool` and `SessionEnd`, with timeouts in milliseconds.
- Hook context escaped `<` and `>`, so bluer's notes use no angle brackets.
- An extension installed only from a repository root, and `${extensionPath}`
  was replaced in the manifest and hook file, but not in a skill.
- The session log was JSONL, with model lines of type `gemini` and the text in a
  top-level `content` field.
- An extension could not pre-approve a shell command; the user chose "Allow for
  all future sessions" once.
