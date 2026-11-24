import { existsSync } from "node:fs";
import { join } from "node:path";
import type { AgentAdapter } from "./types.ts";

/**
 * Claude Code reads personal skills from ~/.claude/skills/<name>/SKILL.md and
 * follows symlinks there. The plugin's skills load as "bluer:<skill>". A user who
 * types "/<skill>" skips the Skill tool, so the prompt hook catches the slash.
 */
export const claudeCode: AgentAdapter = {
  id: "claude-code",
  displayName: "Claude Code",
  skillsDir: (userHome) => join(userHome, ".claude", "skills"),
  isInstalled: (userHome) => existsSync(join(userHome, ".claude")),
  hooks: {
    eventNames: {
      "session-start": "SessionStart",
      "user-prompt-submit": "UserPromptSubmit",
      "post-tool-use": "PostToolUse",
      "session-end": "SessionEnd",
    },
    skillFromTool: (tool, input) => (tool === "Skill" ? String(input.skill ?? "").replace(/^\//, "") || null : null),
    isOwnSkill: (name) => name.startsWith("bluer:"),
    skillFromPrompt: (prompt) => /^\/([a-z0-9]+(?:-[a-z0-9]+)*)(?:\s|$)/.exec(prompt.trim())?.[1] ?? null,
  },
};
