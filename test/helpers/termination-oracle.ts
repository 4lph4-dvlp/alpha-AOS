// The termination oracle: the one instrument in this repository that judges
// whether a process has stopped running.
//
// This module is NOT a test. It is the shared instrument two suites judge
// through — `test/protocol-session.test.ts` and `test/process.test.ts` — and
// it lives in a subdirectory so that neither entrypoint can mistake it for a
// test file. `scripts/run-tests.mjs`'s `compiledTestFiles()` reads
// `dist/test` with `readdir(..., { withFileTypes: true })` and no recursion,
// then keeps only `entry.isFile() && entry.name.endsWith(".test.js")`;
// `dist/test/helpers` fails `isFile()` and the files inside it are never
// enumerated at all. The `Safety boundary suites` step in
// .github/workflows/ci.yml names its ten files explicitly, so it cannot pick
// this up either. `tsconfig.json` includes `test/**/*.ts` with `rootDir: "."`,
// so this compiles to `dist/test/helpers/termination-oracle.js` and nowhere
// else.
//
// It was extracted from `test/protocol-session.test.ts`, which owned it
// privately. `test/process.test.ts` could not reach it and therefore judged
// descendant liveness with a single `process.kill(pid, 0)` — a probe the
// product's own `close()` contract (`src/core/process.ts:690-699`) names as
// invalid, because it succeeds against a zombie. One shared instrument is the
// point: an instrument that only half the repository can use is how a suite
// ends up asserting a guarantee with a tool that cannot decide it.
//
// Nothing here computes a repository path. The `repositoryRoot` constant stays
// in `test/protocol-session.test.ts`, where the two-levels-up arithmetic is
// correct for `dist/test`; it would be three levels from `dist/test/helpers`.
// If this module ever needs a repository path, that is a sign its boundary was
// drawn in the wrong place.

import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Source lines every judged fixture script carries, so the process can testify
 * that it is still running under an identity the test minted.
 *
 * Three properties are load-bearing.
 *
 * A beat is published by writing `<path>.tmp` and renaming it over `<path>`. A
 * rename replaces the directory entry in one step, so a reader observes either
 * the previous complete beat or the new complete beat and never a mixture.
 * Truncating and rewriting in place would expose a half-written line, and a
 * reader landing in that window would see a first token that is not this
 * nonce — which the classifier would read as a foreign identity and therefore
 * as a stopped process. That is a live, actively-writing descendant reported as
 * terminated, and the window widens exactly as the runner gets busier.
 *
 * The terminator is built with `String.fromCharCode(10)` rather than an escape,
 * because this source travels through a JS string array here and a `.mjs` file
 * on disk. `os.EOL` is deliberately not used: CRLF on Windows would disagree
 * with a reader that requires a bare LF terminator.
 *
 * A failed rename is retried a bounded number of times and then swallowed.
 * Windows refuses a replace while a reader holds the destination open, and
 * measured here that is not the rare event it sounds like: against a reader
 * polling every 25ms, 78 of 81 beats were refused with EPERM and the published
 * counter advanced three times in five seconds. A few immediate retries take
 * roughly two attempts per beat and publish all of them. Once the retries are
 * exhausted the beat is simply skipped, because a missed beat is a stall and a
 * stall concludes nothing; throwing here would let the fixture kill the very
 * process under judgment.
 *
 * With no heartbeat path in `argv[2]` nothing is installed at all — no timer
 * and no beat zero — so a script opened without an identity does not litter the
 * fixture root with a file named after `undefined`.
 */
export const heartbeatSource = [
  "import { renameSync, writeFileSync } from 'node:fs';",
  "const heartbeatPath = process.argv[2];",
  "const heartbeatNonce = process.argv[3];",
  "if (heartbeatPath !== undefined && heartbeatNonce !== undefined) {",
  "  const beat = (counter) => {",
  "    try {",
  "      writeFileSync(heartbeatPath + '.tmp', heartbeatNonce + ' ' + counter + String.fromCharCode(10));",
  "    } catch { return; }",
  "    for (let attempt = 0; attempt < 20; attempt += 1) {",
  "      try { renameSync(heartbeatPath + '.tmp', heartbeatPath); return; } catch {}",
  "    }",
  "  };",
  "  let heartbeatCounter = 0;",
  "  beat(heartbeatCounter);",
  "  const heartbeatTimer = setInterval(() => { heartbeatCounter += 1; beat(heartbeatCounter); }, 50);",
  "  heartbeatTimer.unref();",
  "}",
];

/**
 * Mints one heartbeat identity. The path is named after the nonce it carries,
 * so one probe's heartbeat file can never be another's — which is what makes
 * a well-formed foreign nonce a fixture-integrity tripwire rather than
 * something a race can produce. `args` is spread straight after a session's
 * own arguments.
 */
export function mintHeartbeat(root: string): { path: string; nonce: string; args: [string, string] } {
  const nonce = randomUUID();
  const path = join(root, `heartbeat-${nonce}.txt`);
  return { path, nonce, args: [path, nonce] };
}

// ---------------------------------------------------------------------------
// The termination oracle
//
// `process.kill(pid, 0)` succeeding answers "may I signal this pid", not "is
// this process running". It succeeds against a zombie that has already stopped
// executing, and it succeeds against a recycled pid belonging to an unrelated
// process. All three of those are exactly what a descendant-termination
// assertion needs to know, so a single such probe cannot be the instrument.
//
// The replacement is split in two: an impure observation, and a pure
// classification over one observation. Splitting them is what lets the zombie
// and pid-reuse branches be asserted from literal `/proc` text on any host,
// including the ones that have no `/proc` and cannot produce a zombie.
// ---------------------------------------------------------------------------

/**
 * Accepts ONLY a complete beat: `<nonce> <counter>` followed by a line
 * terminator and nothing else. Anything shorter, emptier, or otherwise
 * unparseable is no evidence (null) — never a foreign nonce (false).
 *
 * Requiring the terminator is the whole point. It is what separates "a line
 * that was written all the way to the end" from "a line that is being written
 * right now", so a torn read cannot be promoted into a termination verdict even
 * on a host where the writer's atomic rename somehow failed to protect it.
 * Publishing and parsing are two independent closures over the same hazard;
 * either one alone would suffice.
 */
export function parseHeartbeatLine(
  nonce: string,
  raw: string | null,
): { nonceMatches: boolean | null; counter: number | null } {
  if (raw === null) return { nonceMatches: null, counter: null };
  const match = /^(\S+) (\d+)\r?\n$/u.exec(raw);
  const token = match?.[1];
  const digits = match?.[2];
  if (token === undefined || digits === undefined) return { nonceMatches: null, counter: null };
  if (token !== nonce) return { nonceMatches: false, counter: null };
  return { nonceMatches: true, counter: Number(digits) };
}

/** One observation of one pid. Every field is a fact, not a conclusion. */
export interface ProcessSample {
  /** ESRCH: no process holds the pid. EPERM: one does, but not ours. */
  readonly signalProbe: "esrch" | "eperm" | "permitted" | "unknown";
  /** Whether this host exposes procfs at all. False on win32 and darwin. */
  readonly procfs: boolean;
  /** Raw `/proc/<pid>/stat`, or null when procfs has no such entry. */
  readonly procStat: string | null;
  /** Field 22 read once while the process was known to be alive. */
  readonly recordedStartTime: string | null;
  /**
   * true  - a complete beat whose nonce token is ours.
   * false - a complete beat whose nonce token is present and differs.
   * null  - NO EVIDENCE: unreadable, absent, empty, truncated, or anything
   *         that is not a complete `<nonce> <counter>` line. A partial read
   *         is not a foreign nonce, and must never become one.
   */
  readonly heartbeatNonceMatches: boolean | null;
  /** True once the counter has been seen to increase with our nonce. */
  readonly counterAdvanced: boolean;
}

export type LivenessVerdict = {
  readonly state: "terminated" | "running" | "indeterminate";
  readonly evidence: string;
};

/**
 * The whole liveness judgment, as a pure function over one observation.
 *
 * `terminated` is returned ONLY on positive terminal evidence — a fact that
 * could not be true of a process that is still running. Positive liveness (the
 * counter advanced under our nonce) proves the opposite, but its ABSENCE proves
 * nothing at all.
 *
 * The final rule is the one that matters. A stalled counter never yields
 * `terminated` in any case. A live descendant on a loaded runner can easily go
 * a few hundred milliseconds without being scheduled, and a staleness rule
 * would report it terminated — turning a flaky red into a flaky green on a
 * safety boundary, which is strictly the worse direction to be wrong in.
 *
 * A heartbeat that could not be read lands in the same place. `null` reaches
 * neither the foreign-nonce rule (which tests `false` only) nor the liveness
 * rule (which is true only under our own nonce), so absent other evidence it
 * falls through to `indeterminate`. The moment before the file first exists, a
 * beat whose rename was refused, and a torn read that the atomic publish should
 * have made impossible are all here. A stall and a missed observation carry the
 * same weight: none.
 */
export function classifyProcessSample(sample: ProcessSample): LivenessVerdict {
  if (sample.heartbeatNonceMatches === false) return { state: "terminated", evidence: "foreign-nonce" };
  if (sample.signalProbe === "esrch") return { state: "terminated", evidence: "esrch" };
  if (sample.signalProbe === "eperm") return { state: "terminated", evidence: "eperm-foreign-pid" };
  if (sample.procfs && sample.procStat === null) return { state: "terminated", evidence: "proc-absent" };
  if (sample.procStat !== null) {
    const fields = statFieldsFromThree(sample.procStat);
    const runState = fields[0];
    const startTime = fields[19];
    if (runState === "Z" || runState === "X") return { state: "terminated", evidence: "zombie" };
    if (sample.recordedStartTime !== null && startTime !== undefined && startTime !== sample.recordedStartTime) {
      return { state: "terminated", evidence: "pid-reused" };
    }
  }
  if (sample.counterAdvanced) return { state: "running", evidence: "heartbeat-advanced" };
  return { state: "indeterminate", evidence: "no-terminal-evidence" };
}

/**
 * Splits `/proc/<pid>/stat` from field 3 onward, so index 0 is the state
 * character and index 19 is the start time (field 22).
 *
 * The split is anchored on the LAST `)`. Field 2 is the executable name and may
 * itself contain spaces and parentheses; anchoring anywhere earlier silently
 * misclassifies any process with an awkward name.
 */
function statFieldsFromThree(procStat: string): string[] {
  return procStat.slice(procStat.lastIndexOf(")") + 1).trim().split(/\s+/u);
}

export interface TerminationProbe {
  readonly pid: number;
  readonly heartbeatPath: string;
  readonly nonce: string;
  readonly recordedStartTime: string | null;
}

const delay = (ms: number): Promise<void> => new Promise((resolveDelay) => { setTimeout(resolveDelay, ms); });

function probeSignal(pid: number): ProcessSample["signalProbe"] {
  try {
    process.kill(pid, 0);
    return "permitted";
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ESRCH") return "esrch";
    if (code === "EPERM") return "eperm";
    return "unknown";
  }
}

async function readProcStat(pid: number): Promise<string | null> {
  if (process.platform !== "linux") return null;
  return readFile(`/proc/${pid}/stat`, "utf8").catch(() => null);
}

/** Reads the start time while the process is still known alive. */
export async function registerProbe(
  input: { pid: number; heartbeatPath: string; nonce: string },
): Promise<TerminationProbe> {
  const procStat = await readProcStat(input.pid);
  const recordedStartTime = procStat === null ? null : statFieldsFromThree(procStat)[19] ?? null;
  return {
    pid: input.pid,
    heartbeatPath: input.heartbeatPath,
    nonce: input.nonce,
    recordedStartTime,
  };
}

/**
 * Polls to a deadline the product itself declares, and returns `terminated`
 * only once the classifier has seen terminal evidence.
 *
 * A deadline that expires without such evidence returns `terminated: false`.
 * That reads as "could not prove it stopped" and not as "it was alive" — the
 * two are different claims and this instrument can only make the first.
 *
 * `heartbeatNonceMatches` carries the last observation's identity evidence, so
 * a caller that wants to signal the pid can confirm it is the process this test
 * started before doing so.
 */
export async function waitForTermination(
  probe: TerminationProbe,
  deadlineMs: number,
): Promise<{
  terminated: boolean;
  evidence: string;
  observedMs: number;
  lastCounter: number | null;
  advanced: boolean;
  heartbeatNonceMatches: boolean | null;
}> {
  const startedAt = Date.now();
  let lastCounter: number | null = null;
  let advanced = false;
  let verdict: LivenessVerdict = { state: "indeterminate", evidence: "no-terminal-evidence" };
  let nonceMatches: boolean | null = null;

  for (;;) {
    const procStat = await readProcStat(probe.pid);
    const beat = parseHeartbeatLine(probe.nonce, await readFile(probe.heartbeatPath, "utf8").catch(() => null));
    nonceMatches = beat.nonceMatches;
    if (beat.nonceMatches === true && beat.counter !== null) {
      if (lastCounter !== null && beat.counter > lastCounter) advanced = true;
      lastCounter = beat.counter;
    }
    verdict = classifyProcessSample({
      signalProbe: probeSignal(probe.pid),
      procfs: process.platform === "linux",
      procStat,
      recordedStartTime: probe.recordedStartTime,
      heartbeatNonceMatches: beat.nonceMatches,
      counterAdvanced: advanced,
    });
    if (verdict.state === "terminated") {
      return {
        terminated: true,
        evidence: verdict.evidence,
        observedMs: Date.now() - startedAt,
        lastCounter,
        advanced,
        heartbeatNonceMatches: nonceMatches,
      };
    }
    if (Date.now() - startedAt >= deadlineMs) break;
    await delay(50);
  }

  return {
    terminated: false,
    evidence: verdict.evidence,
    observedMs: Date.now() - startedAt,
    lastCounter,
    advanced,
    heartbeatNonceMatches: nonceMatches,
  };
}

/** Resolves once the counter has been seen to increase `minAdvances` times. */
export async function waitForHeartbeatAdvance(
  probe: TerminationProbe,
  minAdvances: number,
  deadlineMs: number,
): Promise<{ advances: number; lastCounter: number | null }> {
  const startedAt = Date.now();
  let advances = 0;
  let lastCounter: number | null = null;

  for (;;) {
    const beat = parseHeartbeatLine(probe.nonce, await readFile(probe.heartbeatPath, "utf8").catch(() => null));
    if (beat.nonceMatches === true && beat.counter !== null) {
      if (lastCounter !== null && beat.counter > lastCounter) advances += 1;
      lastCounter = beat.counter;
    }
    if (advances >= minAdvances) break;
    if (Date.now() - startedAt >= deadlineMs) break;
    await delay(25);
  }

  return { advances, lastCounter };
}

/** Renders an oracle result for a failure message without hiding the reason. */
export function describeTermination(observed: Awaited<ReturnType<typeof waitForTermination>>): string {
  return (
    `evidence ${observed.evidence}, observed ${observed.observedMs}ms, ` +
    `last counter ${String(observed.lastCounter)}, advanced ${String(observed.advanced)}`
  );
}
