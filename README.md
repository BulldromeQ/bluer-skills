# bluer-skills

> 青出于蓝而胜于蓝 — *Blue comes from the indigo plant, yet it is bluer than the plant.*
> (Xunzi: the student can surpass the teacher.)

**bluer** lets anyone write an agent skill as a short, plain list of steps. The
agent then improves that skill each time it uses it. Your plain version stays
yours and stays easy to read. The agent keeps a detailed, versioned version next
to it.

> **Status:** design stage. Nothing is ready to install yet. See
> [docs/design.md](docs/design.md) for the design and the open questions.

## The idea

You write what you want, the way you would tell a person:

```text
Doing house work
1. clean the table
2. clean the restroom
3. clean the kitchen
```

The first time an agent does this, it has questions. How clean is "clean"?
Should it move the things on the table, or clean around them? The answers, the
corrections you give, and the mistakes the agent makes are all lessons. bluer
saves each lesson into the skill, so the next run does not need to ask again.

Later you add one line:

```text
4. clean the living room
```

bluer rebuilds the detailed skill. It keeps everything it learned about steps 1
to 3, and starts to learn step 4.

## Two layers: 蓝 and 青

Each skill is a folder with two layers:

| Layer | File | Who writes it | What it is |
|---|---|---|---|
| 蓝 (the indigo plant, the source) | `intent.md` | You | Your plain steps. The agent never changes this file. |
| 青 (the blue, refined from it) | `SKILL.md` | bluer | Your steps plus everything learned. Agents read this file. |

```text
house-work/
  intent.md       # yours, plain
  SKILL.md        # generated; standard Agent Skills format
  learnings.md    # every lesson, with where it came from and when
  CHANGELOG.md    # v1, v2, v3 ... one line per version
```

`SKILL.md` follows the open [Agent Skills](https://agentskills.io) format.
Any agent that reads skills can use it, with or without bluer installed.

## What makes it different

- **It learns from use, not only at creation.** Other skill tools help you write
  a skill once. bluer keeps the skill up to date while you use it.
- **Your version stays simple.** Learned details never go into `intent.md`.
- **Lessons are applied automatically, and each change is a new version.** You
  can turn auto-apply off for one skill or for all skills, and you can roll back
  to any version.
- **It learns all the time.** Once installed, bluer captures lessons in every
  session, sends each one to the skill it belongs to, and drafts new skills for
  work that repeats.
- **It works with what you have.** Adopt the skills you already use, keep your
  favorite skill-creation tool, and keep a personal learned layer on top of
  skills that other people share.
- **It works across agents.** Claude Code is first. Gemini CLI, OpenAI Codex,
  Cursor and GitHub Copilot follow.

## Roadmap

1. Design (now).
2. Claude Code: create a skill from plain text, build `SKILL.md`, versions.
3. Claude Code: capture lessons during sessions, auto-apply, roll back.
4. Gemini CLI.
5. OpenAI Codex.
6. Cursor.
7. GitHub Copilot.

## Credits

The lesson-capture design builds on ideas from
[claude-reflect](https://github.com/BayramAnnakov/claude-reflect) by Bayram
Annakov (MIT), which captures corrections from Claude Code sessions.

## License

[MIT](LICENSE)
