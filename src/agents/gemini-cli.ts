import { existsSync } from "node:fs";
import { join } from "node:path";
import type { AgentAdapter } from "./types.ts";

/**
 * Gemini CLI reads user skills from ~/.gemini/skills and from ~/.agents/skills,
 * the folder that several agents share; ~/.agents/skills wins when both hold a
 * skill with the same name. bluer links into ~/.agents/skills, so one link
 * serves every agent that reads it, and Gemini reports no conflict.
 *
 * The model loads a skill with the activate_skill tool ({ name }). Typing
 * "/<skill>" calls the same tool, so the AfterTool hook sees both. The bluer
 * extension's own skill is named "bluer".
 */
export const geminiCli: AgentAdapter = {
  id: "gemini-cli",
  displayName: "Gemini CLI",
  skillsDir: (userHome) => join(userHome, ".agents", "skills"),
  isInstalled: (userHome) => existsSync(join(userHome, ".gemini")),
  hooks: {
    eventNames: {
      "session-start": "SessionStart",
      "user-prompt-submit": "BeforeAgent",
      "post-tool-use": "AfterTool",
      "session-end": "SessionEnd",
    },
    skillFromTool: (tool, input) => (tool === "activate_skill" ? String(input.name ?? "") || null : null),
    isOwnSkill: (name) => name === "bluer",
  },
};
