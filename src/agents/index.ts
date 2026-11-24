import { lstatSync, mkdirSync, readlinkSync, renameSync, symlinkSync } from "node:fs";
import { join, resolve } from "node:path";
import { BluerError } from "../errors.ts";
import { claudeCode } from "./claude-code.ts";
import { geminiCli } from "./gemini-cli.ts";
import type { AgentAdapter } from "./types.ts";

export type { AgentAdapter, HookDialect } from "./types.ts";

export const AGENTS: AgentAdapter[] = [claudeCode, geminiCli];

export function findAgent(id: string): AgentAdapter {
  const agent = AGENTS.find((a) => a.id === id);
  if (!agent) throw new BluerError(`Unknown agent "${id}". Known agents: ${AGENTS.map((a) => a.id).join(", ")}.`);
  return agent;
}

export type LinkResult = "linked" | "already-linked" | "replaced";

function lstatOrNull(path: string): ReturnType<typeof lstatSync> | null {
  try {
    return lstatSync(path);
  } catch {
    return null;
  }
}

/**
 * Make a skill in the bluer home visible to an agent, as a symlink in the
 * agent's skills folder. An existing folder with the same name is never
 * overwritten: with `replace`, it is moved to `backupsDir` first.
 */
export function linkSkill(
  agent: AgentAdapter,
  opts: { userHome: string; skillDir: string; name: string; backupsDir: string; replace?: boolean; now?: Date },
): LinkResult {
  const agentDir = agent.skillsDir(opts.userHome);
  const target = join(agentDir, opts.name);
  const existing = lstatOrNull(target);
  let result: LinkResult = "linked";

  if (existing) {
    if (existing.isSymbolicLink() && resolve(agentDir, readlinkSync(target)) === resolve(opts.skillDir)) {
      return "already-linked";
    }
    if (!opts.replace) {
      throw new BluerError(
        `${target} already exists. Run "bluer link ${opts.name} --agent ${agent.id} --replace" to move it to ${opts.backupsDir} and link the bluer version.`,
      );
    }
    mkdirSync(opts.backupsDir, { recursive: true });
    const stamp = (opts.now ?? new Date()).toISOString().replace(/[:.]/g, "-");
    renameSync(target, join(opts.backupsDir, `${agent.id}-${opts.name}-${stamp}`));
    result = "replaced";
  }

  mkdirSync(agentDir, { recursive: true });
  symlinkSync(resolve(opts.skillDir), target, "dir");
  return result;
}
