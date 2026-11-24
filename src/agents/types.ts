/**
 * What bluer needs to know about one agent (Claude Code, Gemini CLI, ...).
 * Each agent gets one adapter. Lesson capture hooks will be added here when
 * the first adapter supports them.
 */
export interface AgentAdapter {
  /** Stable id used on the command line, for example "claude-code". */
  id: string;
  displayName: string;
  /** The folder where this agent looks for the user's own skills. */
  skillsDir(userHome: string): string;
  /** True when the agent looks installed for this user. */
  isInstalled(userHome: string): boolean;
}
