// An I/O trap loaded with `node --import <file URL>` in front of a CLI run.
//
// When ALPHA_AOS_IO_TRAP_LOG names a file, every call to a process-spawning or
// network-opening builtin appends one line (`<module>.<function>`, or `fetch`)
// to that file and then delegates to the original function with the same
// `this` and arguments, so behavior is unchanged apart from the log line. When
// the variable is unset, nothing is patched.
//
// Patching the default export alone does not reach an ESM named import such as
// `import { spawnSync } from "node:child_process"`: the named bindings are a
// snapshot of the builtin's exports. `syncBuiltinESMExports()` copies the
// patched properties into those bindings, which is what makes this trap
// CLI-level rather than a default-export patch (the weakness the Phase 11
// oracle audit found in the Phase 6 in-process test).
//
// Like `packed-sandbox.ts`, this module lives in `test/helpers/` so the test
// runner never enumerates it as a suite, and it registers no test.

import childProcess from "node:child_process";
import dns from "node:dns";
import { appendFileSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import { syncBuiltinESMExports } from "node:module";
import net from "node:net";
import tls from "node:tls";

type Callable = (this: unknown, ...args: unknown[]) => unknown;

const TRAPPED: readonly { readonly label: string; readonly target: object; readonly names: readonly string[] }[] = [
  { label: "child_process", target: childProcess, names: ["spawn", "spawnSync", "exec", "execSync", "execFile", "execFileSync", "fork"] },
  { label: "net", target: net, names: ["connect", "createConnection"] },
  { label: "tls", target: tls, names: ["connect"] },
  { label: "dns", target: dns, names: ["lookup", "resolve"] },
  { label: "http", target: http, names: ["request", "get"] },
  { label: "https", target: https, names: ["request", "get"] },
];

const SKIPPED_OWN_KEYS = new Set<PropertyKey>(["length", "name", "prototype"]);

function trapped(original: Callable, line: string, logPath: string): Callable {
  const wrapper = function (this: unknown, ...args: unknown[]): unknown {
    appendFileSync(logPath, `${line}\n`, "utf8");
    return original.apply(this, args);
  };
  // Keep attached behavior such as `util.promisify.custom` on exec/execFile.
  for (const key of Reflect.ownKeys(original)) {
    if (SKIPPED_OWN_KEYS.has(key)) continue;
    const descriptor = Object.getOwnPropertyDescriptor(original, key);
    if (descriptor) Object.defineProperty(wrapper, key, descriptor);
  }
  return wrapper;
}

const logPath = process.env.ALPHA_AOS_IO_TRAP_LOG?.trim();
if (logPath) {
  for (const { label, target, names } of TRAPPED) {
    const table = target as Record<string, unknown>;
    for (const name of names) {
      const original = table[name];
      if (typeof original !== "function") continue;
      table[name] = trapped(original as Callable, `${label}.${name}`, logPath);
    }
  }
  const globals = globalThis as unknown as Record<string, unknown>;
  if (typeof globals.fetch === "function") {
    globals.fetch = trapped(globals.fetch as Callable, "fetch", logPath);
  }
  syncBuiltinESMExports();
}
