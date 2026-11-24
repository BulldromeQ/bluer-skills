import type { HookEvent } from "./hooks.ts";

/**
 * How one agent's hooks differ: its event names, its skill-loading tool, and how
 * its own bluer skill is named. The hook logic in hooks.ts is shared.
 */
export interface HookDialect {
  /** The agent's event name for each bluer hook event, used in hookSpecificOutput.hookEventName. */
  eventNames: Record<HookEvent, string>;
  /** The name of the skill that this tool call loads, or null when it loads none. */
  skillFromTool(toolName: string, toolInput: Record<string, unknown>): string | null;
  /** True for the skills that the bluer plugin or extension ships itself. */
  isOwnSkill(name: string): boolean;
  /**
   * The skill that a user message loads without any tool call ("/<skill>" in
   * Claude Code, "$<skill>" in Codex), or null. Absent when every skill load is
   * a tool call.
   */
  skillFromPrompt?(prompt: string): string | null;
}

/**
 * What bluer needs to know about one agent (Claude Code, Codex, ...).
 * Each agent gets one adapter. Two adapters may share a skills folder; bluer
 * links each skill there once.
 */
export interface AgentAdapter {
  /** Stable id used on the command line, for example "claude-code". */
  id: string;
  displayName: string;
  /** The folder where this agent looks for the user's own skills. */
  skillsDir(userHome: string): string;
  /** True when the agent looks installed for this user. */
  isInstalled(userHome: string): boolean;
  /** Present when bluer can capture lessons through this agent's hooks. */
  hooks?: HookDialect;
}
