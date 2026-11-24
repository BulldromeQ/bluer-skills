# Contributor guide

This guide is for people and coding agents who work on bluer.

## What this repo is

bluer lets a user write an agent skill as plain steps (`intent.md`) and keeps a
generated, versioned `SKILL.md` that improves with use. Read
[README.md](README.md) for the idea and [docs/design.md](docs/design.md) for
the decisions and open questions.

## Rules

- Change `docs/design.md` in the same pull request as a change to the design.
  Add a row to "Decisions" when you settle an open question.
- Generated `SKILL.md` files must follow the open Agent Skills format. Do not add
  fields that only bluer understands; put bluer settings in `bluer.json`.
- The agent never writes to a user's `intent.md`. Code that writes to it is a bug.
- Every check of a skill must include a trigger test and a negative test. A
  format check alone is not enough. See `docs/lessons-from-practice.md`.
- Keep user data local. Do not add telemetry or calls to outside services.

## Writing style

Write docs and comments for a reader who has no context. Say what a thing does
and why. Use short sentences and active voice.
