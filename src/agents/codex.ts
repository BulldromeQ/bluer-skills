import { existsSync } from "node:fs";
import { join } from "node:path";
import type { AgentAdapter } from "./types.ts";

/**
 * OpenAI Codex reads user skills from ~/.agents/skills (in the real home
 * folder, not CODEX_HOME), and follows symlinked skill folders.
 *
 * Codex has no skill tool. Its prompt lists each skill's SKILL.md path, and
 * the model reads the file with a shell command, so the PostToolUse hook
 * (matcher "Bash", tool_input { command }) looks for ".../<skill>/SKILL.md" in
 * the command. A user who types "$<skill>" makes Codex put the file in the
 * context itself, with no tool call, so the prompt hook catches the "$".
 *
 * Codex installs the Claude Code plugin from the same marketplace. It reads
 * .codex-plugin/plugin.json first, which points it to hooks/codex-hooks.json,
 * so that the hooks run as "bluer hook codex ...".
 */
const SKILL_FILE = /([A-Za-z0-9_.-]+)\/SKILL\.md\b/;

export const codex: AgentAdapter = {
  id: "codex",
  displayName: "Codex",
  skillsDir: (userHome) => join(userHome, ".agents", "skills"),
  isInstalled: (userHome) => existsSync(join(userHome, ".codex")),
  hooks: {
    eventNames: {
      "session-start": "SessionStart",
      "user-prompt-submit": "UserPromptSubmit",
      "post-tool-use": "PostToolUse",
      "session-end": "SessionEnd",
    },
    skillFromTool: (tool, input) => (tool === "Bash" ? (SKILL_FILE.exec(String(input.command ?? ""))?.[1] ?? null) : null),
    isOwnSkill: (name) => name === "bluer",
    skillFromPrompt: (prompt) => /(?:^|\s)\$([a-z0-9]+(?:-[a-z0-9]+)*)\b/.exec(prompt)?.[1] ?? null,
  },
};
