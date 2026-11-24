import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { BluerError } from "./errors.ts";

/** Run git in `cwd` and return its trimmed output. */
export function git(cwd: string, args: string[]): string {
  try {
    return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch (err) {
    const e = err as { stderr?: string | Buffer; message: string };
    const detail = String(e.stderr || e.message).trim();
    throw new BluerError(`git ${args[0] ?? ""} failed: ${detail}`);
  }
}

function configValue(cwd: string, key: string): string {
  try {
    return git(cwd, ["config", "--get", key]);
  } catch {
    return "";
  }
}

/**
 * Make `dir` a git repo. Users never run git themselves, so when no git
 * identity is set, use a local one for this repo only.
 */
export function ensureRepo(dir: string): void {
  if (!existsSync(join(dir, ".git"))) git(dir, ["init", "-q", "-b", "main"]);
  if (!configValue(dir, "user.email")) {
    git(dir, ["config", "user.name", "bluer"]);
    git(dir, ["config", "user.email", "bluer@localhost"]);
  }
}

/** Stage `paths` and commit them. Returns false when there was nothing to commit. */
export function commitPaths(dir: string, paths: string[], message: string): boolean {
  git(dir, ["add", "-A", "--", ...paths]);
  if (!git(dir, ["diff", "--cached", "--name-only"])) return false;
  // Signing would stop for a passphrase prompt the user never sees.
  git(dir, ["-c", "commit.gpgsign=false", "commit", "-q", "--no-verify", "-m", message]);
  return true;
}
