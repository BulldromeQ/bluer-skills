// Writes the Gemini CLI extension's generated files from the Claude Code
// plugin's, so the two never drift apart:
//
//   plugins/claude-code/skills/bluer/SKILL.md  ->  skills/bluer/SKILL.md
//
// The Gemini CLI extension lives at the repository root, because
// `gemini extensions install` takes a repository, not a folder inside one.
// Run with `npm run build:plugin`; CI fails when the output is out of date.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { joinFrontmatter, splitFrontmatter } from "../src/frontmatter.ts";

const root = join(import.meta.dirname, "..");
const source = join(root, "plugins", "claude-code", "skills", "bluer", "SKILL.md");
const target = join(root, "skills", "bluer", "SKILL.md");

const { data, body } = splitFrontmatter(readFileSync(source, "utf8"));

// Gemini CLI picks skills by `description` only, so fold the trigger phrases in.
const description = `${String(data.description)} Use it for requests such as: ${String(data.when_to_use)}`;
if (description.length > 1024) throw new Error(`The Gemini skill description has ${description.length} characters; the limit is 1024.`);

// ${CLAUDE_PLUGIN_ROOT} is not replaced in a Gemini skill; the shim path is stable.
const fallback = /If there is no note, run\s+`"\$\{CLAUDE_PLUGIN_ROOT\}\/bin\/bluer" <command>`(?: instead)?\./;
if (!fallback.test(body)) throw new Error("The CLI fallback sentence in the Claude Code skill changed; update scripts/build-gemini-extension.ts.");
const geminiBody = body.replace(fallback, "If there is no note, run `~/.bluer/bin/bluer <command>`.");
if (geminiBody.includes("CLAUDE")) throw new Error("The Gemini skill still mentions Claude Code-only text.");

const notice =
  "<!-- Generated from plugins/claude-code/skills/bluer/SKILL.md by scripts/build-gemini-extension.ts. Edit that file, then run npm run build:plugin. -->\n\n";
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, joinFrontmatter({ name: data.name, description }, notice + geminiBody.replace(/^\n+/, "")));
console.log(`wrote ${target.slice(root.length + 1)}`);
