import assert from "node:assert/strict";
import { test } from "node:test";

/** Mirrors index.ts — argv[2+] are user args; never treat the script path as [prompt]. */
function userArgsFromProcessArgv(argv: string[]): string[] {
  return argv.slice(2);
}

test("electron-as-node argv does not pass script path as BLXCKCHAT prompt", () => {
  const argv = [
    "/Applications/JEXXXUS.app/Contents/MacOS/JEXXXUS",
    "/Applications/JEXXXUS.app/Contents/Resources/jexxxus-cli/dist/index.js",
  ];
  assert.deepEqual(userArgsFromProcessArgv(argv), []);
});

test("node argv preserves subcommands and prompts", () => {
  assert.deepEqual(
    userArgsFromProcessArgv(["/usr/bin/node", "/opt/jexxxus/dist/index.js", "doctor"]),
    ["doctor"],
  );
  assert.deepEqual(
    userArgsFromProcessArgv([
      "/usr/bin/node",
      "/opt/jexxxus/dist/index.js",
      "blxckchat",
      "hello",
    ]),
    ["blxckchat", "hello"],
  );
});