import type { HookEvent } from "./hooks.ts";

/**
 * How one agent's hooks differ: its event names, its skill-loading tool, and how
 * its own bluer skill is named. The hook logic in hooks.ts is shared.
 */
export interface HookDialect {
  /** The agent's event name for each bluer hook event, used in hookSpecificOutput.hookEventName. */
  eventNames: Record<HookEvent, string>;
  /** The tool the model calls to load a skill. */
  skillTool: string;
  /** The field of that tool's input that holds the skill name. */
  skillField: string;
  /** True for the skills that the bluer plugin or extension ships itself. */
  isOwnSkill(name: string): boolean;
  /** True when typing "/<skill>" loads a skill without calling skillTool, so the prompt hook must catch it. */
  slashSkipsTool: boolean;
}

/**
 * What bluer needs to know about one agent (Claude Code, Gemini CLI, ...).
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
