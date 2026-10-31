import { syncBuiltinESMExports } from "node:module";
import fs from "node:fs/promises";
import { join, parse, resolve } from "node:path";
import { appendTaskSessionEvent, taskSessionRoot, type TaskSessionBinding } from "../../src/core/task-session.js";

// Isolated child: alter only its own built-in import bindings at observable barriers.
const [stateRoot, encoded, phase] = process.argv.slice(2) as [string, string, string];
const binding = JSON.parse(encoded) as TaskSessionBinding;
const root = taskSessionRoot(stateRoot, binding);
const journal = join(root, "events.sqlite-journal");
const actualLstat = fs.lstat.bind(fs);
let observations = 0;
let injected = false;
fs.lstat = (async (...args: Parameters<typeof fs.lstat>) => {
  const path = String(args[0]);
  const stack = new Error().stack ?? "";
  if (!injected && phase === "4" && resolve(path) === parse(resolve(root)).root && (stack.split("\n")[2] ?? "").includes("at identities ")) {
    const stat = await actualLstat(...args);
    const db = join(root, "events.sqlite");
    await fs.rename(db, db + "-moved");
    await fs.copyFile(db + "-moved", db);
    injected = true;
    return stat;
  }
  if (resolve(path) === resolve(root) && (stack.split("\n")[2] ?? "").includes("at identities ")) {
    observations++;
    if (observations === Number(phase)) {
      if (phase === "1") {
        await fs.rename(root, root + "-moved");
        await fs.symlink(root + "-moved", root, process.platform === "win32" ? "junction" : "dir");
      } else {
        await fs.mkdir(journal);
      }
      injected = true;
    }
  }
  return actualLstat(...args);
}) as typeof fs.lstat;
syncBuiltinESMExports();

try {
  await appendTaskSessionEvent(stateRoot, binding, { sourceEventId: "barrier-event", observedAt: "2026-10-31T00:00:00.000Z",
    kind: "decision", workflow: null, step: null, role: null, configuredModel: null, configuredEffort: null,
    observedModel: null, observedEffort: null, outcome: null, processState: null, recordedReason: null, evidenceRefs: [] });
  throw new Error("replacement was accepted");
} catch (error) {
  if (!injected || (error as Error).message === "replacement was accepted") throw error;
  console.log(JSON.stringify({ injected, observations, error: (error as Error).message }));
}
