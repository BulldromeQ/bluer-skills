# Lessons from maintaining agent skills in practice

These lessons come from maintaining a large set of Claude Code skills and agent
memory files for a real engineering team. Each one shaped a part of the bluer
design. Facts about Claude Code were true as of late 2026; check them against
the current documentation before you rely on them.

## Triggering

- **A description only reads like it triggers. Test it.** Run the agent headless
  with a realistic prompt and check for a `Skill` tool use in the output stream:

  ```bash
  claude -p "<realistic prompt>" --output-format stream-json --verbose \
    --max-turns 12 --permission-mode default --allowedTools "Skill" "Read"
  ```

  Limit the allowed tools so a test run cannot change real systems.
- **Always add a negative prompt.** A nearby but different task must not load
  the skill. Without this check, a broad description takes over other tasks.
- **Test in an empty directory** that holds only the skill. Project files and
  `CLAUDE.md` can help the agent find a skill that would not trigger on its own.
- **Another skill can win.** A broad skill installed at user level can take a
  prompt from a narrower project skill. Test with the user's real skill set
  installed, not only with the new skill.
- **Claude Code reads `description` and `when_to_use` together**, up to about
  1,536 characters. Put trigger phrases in `when_to_use` when the description
  is about what the skill does.

## Format traps

- **A plain YAML value that contains `: ` is invalid.** The frontmatter then
  fails to parse, and the skill does not load, with no clear error. Use a folded
  block (`>-`) for long text, and parse the frontmatter with a real YAML parser
  in checks.

## Skills go stale

- **Skills go out of date when the world changes**: a command is renamed, a path
  moves, a tool gets a new flag. An agent that finds a wrong instruction must
  fix the skill right away, or the next run fails the same way.
- **Read skills from their source of truth.** A local copy that is behind the
  source gives the agent old instructions that look correct.

## Generated files

- **Never hand-edit a generated file without changing its source.** The next
  generate run silently reverts the edit. This is why bluer turns a hand edit to
  `SKILL.md` into a lesson instead of keeping it as an edit.

## Context

- **A sub-agent sees only what it is given.** Workers spawned by an agent do not
  get the parent's memory or conversation. A skill must make sense on its own,
  without the context of the session that created it.
- **Commands in a skill must work in the user's shell.** A recipe tested only in
  bash can break in zsh (for example, an unquoted `$VAR` that holds several
  flags), and the failure can be silent. Test commands in each shell users run.

## Memory versus skills

- **Memory notes and skills drift into each other.** A long-lived memory note
  often becomes a set of steps, and that set should be a skill. Facts about the
  user or the project belong in memory. Steps for a task belong in a skill. bluer
  keeps task lessons with the skill they belong to.
