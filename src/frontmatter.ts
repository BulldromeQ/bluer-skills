import { parse, stringify } from "yaml";
import { BluerError } from "./errors.ts";

export type Frontmatter = Record<string, unknown>;

const BLOCK = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

/**
 * Split a SKILL.md into its YAML frontmatter and its body. This uses a real
 * YAML parser on purpose: a value such as `description: Use when: X` is
 * invalid YAML, and agents then skip the skill without a clear error.
 */
export function splitFrontmatter(text: string): { data: Frontmatter; body: string } {
  const match = BLOCK.exec(text);
  if (!match) return { data: {}, body: text };
  let data: unknown;
  try {
    data = parse(match[1] ?? "") ?? {};
  } catch (err) {
    throw new BluerError(`The SKILL.md frontmatter is not valid YAML: ${(err as Error).message}`);
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new BluerError("The SKILL.md frontmatter must be a YAML map of keys and values.");
  }
  return { data: data as Frontmatter, body: text.slice(match[0].length) };
}

export function joinFrontmatter(data: Frontmatter, body: string): string {
  return `---\n${stringify(data, { lineWidth: 0 })}---\n\n${body.replace(/^\n+/, "")}`;
}
