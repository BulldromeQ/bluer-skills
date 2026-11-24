// Pins the Node.js release that "bin/bluer setup" downloads for users who have
// no Node.js. Writes plugins/claude-code/bin/node-pins.txt: the version, and the
// SHA-256 of each archive that setup can pick. Setup refuses any download whose
// checksum differs, so a changed file on the server is never used.
//
//   node scripts/pin-node.ts            # the newest LTS release
//   node scripts/pin-node.ts 26.13.1    # one release
//
// Run it when a new LTS release is out, check the diff, and commit the file.
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const DIST = "https://nodejs.org/dist";
const PLATFORMS = ["darwin-arm64", "darwin-x64", "linux-arm64", "linux-x64"];
const FORMATS = ["tar.xz", "tar.gz"];

async function text(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.text();
}

let version = process.argv[2]?.replace(/^v/, "");
if (!version) {
  const releases = JSON.parse(await text(`${DIST}/index.json`)) as { version: string; lts: string | false }[];
  const lts = releases.find((r) => r.lts !== false);
  if (!lts) throw new Error("No LTS release found in index.json.");
  version = lts.version.slice(1);
}

const sums = new Map(
  (await text(`${DIST}/v${version}/SHASUMS256.txt`))
    .trim()
    .split("\n")
    .map((line) => {
      const [sum, file] = line.trim().split(/\s+/);
      return [file ?? "", sum ?? ""] as const;
    }),
);

const lines = [
  "# The Node.js release that `bin/bluer setup` downloads, with the SHA-256 of each",
  "# archive. Made by scripts/pin-node.ts from nodejs.org's SHASUMS256.txt; do not",
  "# edit by hand.",
  `version ${version}`,
];
for (const platform of PLATFORMS) {
  for (const format of FORMATS) {
    const file = `node-v${version}-${platform}.${format}`;
    const sum = sums.get(file);
    if (!sum) throw new Error(`SHASUMS256.txt for v${version} has no ${file}.`);
    lines.push(`${platform}.${format} ${sum}`);
  }
}

const target = join(import.meta.dirname, "..", "plugins", "claude-code", "bin", "node-pins.txt");
writeFileSync(target, lines.join("\n") + "\n");
console.log(`pinned Node.js v${version} in plugins/claude-code/bin/node-pins.txt`);
