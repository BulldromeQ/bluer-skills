import { existsSync } from "node:fs";
import { join } from "node:path";
import type { AgentAdapter } from "./types.ts";

/** Claude Code reads personal skills from ~/.claude/skills/<name>/SKILL.md and follows symlinks there. */
export const claudeCode: AgentAdapter = {
  id: "claude-code",
  displayName: "Claude Code",
  skillsDir: (userHome) => join(userHome, ".claude", "skills"),
  isInstalled: (userHome) => existsSync(join(userHome, ".claude")),
};
