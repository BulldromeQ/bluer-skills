#!/usr/bin/env node
// The `bluer` command. All logic lives in cli.ts so that tests can call run() directly.
import { run } from "./cli.ts";
import { BluerError } from "./errors.ts";

try {
  run(process.argv.slice(2));
} catch (err) {
  const code = (err as { code?: string }).code ?? "";
  if (err instanceof BluerError || code.startsWith("ERR_PARSE_ARGS")) {
    console.error(`bluer: ${(err as Error).message}`);
    process.exit(1);
  }
  throw err;
}
