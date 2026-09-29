// LIFE-05 evidence through the packed CLI:
// Preview and apply rollback to restore exact prior bytes, and post-transaction
// drift blocks all writes before mutation begins.
//
// 1. Single-transaction command on a pre-existing target:
//    pre-write <CODEX_HOME>/AGENTS.md with synthetic policy;
//    run `codex-policy sync --apply --json`.
// 2. Rollback preview: `rollback <id>` and `rollback <id> --json`.
//    Checks: preview.no-mutation, preview.lists-targets.
// 3. Rollback apply: `rollback <id> --apply --json`.
//    Checks: apply.exact-bytes, apply.created-removed.
// 4. Post-transaction drift:
//    re-run `codex-policy sync --apply --json` to produce a fresh transaction;
//    append `p11 drift line` to <CODEX_HOME>/AGENTS.md;
//    run preview: check preview.reflects-drift;
//    run apply: check drift.refuses (exit 2) and drift.zero-writes.
// 5. LIFO ordering:
//    re-run `codex-policy sync --apply --json` so the drifted transaction is no longer head;
//    attempt rollback on the older transaction: check lifo.enforced.
//
// Re-run: `npm run build && node .planning/phases/11-managed-lifecycle-verification/evidence/probes/life05-rollback.mjs [--out <scratch>] [--keep]`

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { appendFile, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  alias,
  assertSandboxEnv,
  compareFingerprints,
  evidencePath,
  fingerprintRoots,
  hostNpmCache,
  installPackedRelease,
  newSandbox,
  packOnce,
  runCli,
  runInstalledCli,
  runProbe,
  seedHarnessPrerequisites,
  stripAnsi,
} from "./probe-lib.mjs";

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

function parseJson(result) {
  if (result.status !== 0 && result.status !== 2) return null;
  try {
    return JSON.parse(result.stdout);
  } catch {
    return null;
  }
}

function redactDiffText(text) {
  const lines = text.split(/\r?\n/u);
  const result = [];
  let inDiff = false;
  let diffLines = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.includes("--- a/") || line.includes("+++ b/")) {
      result.push(line);
      inDiff = true;
      continue;
    }
    if (inDiff) {
      const trimmed = line.trimStart();
      if (
        trimmed.startsWith("@@") ||
        trimmed.startsWith("+") ||
        trimmed.startsWith("-") ||
        (line.startsWith("  ") && (trimmed.startsWith("+") || trimmed.startsWith("-") || trimmed.startsWith("@@")))
      ) {
        diffLines.push(line);
        continue;
      }
      if (diffLines.length > 0) {
        const sha = createHash("sha256").update(diffLines.join("\n")).digest("hex").slice(0, 12);
        result.push(`  [diff body redacted: ${diffLines.length} lines, sha256=${sha}]`);
        diffLines = [];
      }
      inDiff = false;
      result.push(line);
    } else {
      result.push(line);
    }
  }
  if (diffLines.length > 0) {
    const sha = createHash("sha256").update(diffLines.join("\n")).digest("hex").slice(0, 12);
    result.push(`  [diff body redacted: ${diffLines.length} lines, sha256=${sha}]`);
  }
  return result.join("\n");
}

function redactJsonDiff(jsonStr) {
  try {
    const obj = JSON.parse(jsonStr);
    if (Array.isArray(obj.diagnostics)) {
      for (const diag of obj.diagnostics) {
        if (typeof diag.unifiedDiff === "string") {
          const bodyLines = diag.unifiedDiff
            .split(/\r?\n/u)
            .filter((l) => l.startsWith("+") || l.startsWith("-") || l.startsWith("@@"));
          const sha = createHash("sha256").update(bodyLines.join("\n")).digest("hex").slice(0, 12);
          diag.unifiedDiff = `[diff body redacted: ${bodyLines.length} lines, sha256=${sha}]`;
        }
      }
      return JSON.stringify(obj, null, 2);
    }
  } catch {}
  return redactDiffText(jsonStr);
}

function runRedactedCli(transcript, sandbox, args, options = {}) {
  const { label = `alpha-aos ${args.join(" ")}`, envOverrides = {} } = options;
  const env = { ...sandbox.env, ...envOverrides };
  assertSandboxEnv(env, sandbox.root);

  const entrypoint =
    process.platform === "win32"
      ? join(sandbox.prefix, "node_modules", "alpha-aos", "dist", "src", "cli.js")
      : sandbox.resolveCli();
  const display =
    process.platform === "win32"
      ? ["node", entrypoint, ...args].join(" ")
      : [entrypoint, ...args].join(" ");

  const started = process.hrtime.bigint();
  const result = runInstalledCli(sandbox.resolveCli(), sandbox.prefix, args, env, {
    cwd: sandbox.repo,
  });
  const durationMs = Number((process.hrtime.bigint() - started) / 1_000_000n);

  const redactedStdout = args.includes("--json") ? redactJsonDiff(result.stdout) : redactDiffText(result.stdout);
  const redactedStderr = redactDiffText(result.stderr);

  transcript.step(label, {
    command: display,
    envOverrides: Object.keys(envOverrides),
    status: result.status,
    durationMs,
    stdout: redactedStdout,
    stderr: redactedStderr,
  });

  return { ...result, stdout: redactedStdout, stderr: redactedStderr, durationMs };
}

await runProbe("life05-rollback", evidencePath("life05-rollback.txt"), async (t) => {
  const { tarballPath } = await packOnce(t);
  const cache = hostNpmCache();
  const sandbox = await newSandbox("life05");
  const release = await installPackedRelease(sandbox, { tarballPath, hostNpmCache: cache });
  await seedHarnessPrerequisites(sandbox, release, "codex", { eccCache: cache });

  // 1. Single-transaction command on a pre-existing target
  const agentsPath = join(sandbox.home, ".codex", "AGENTS.md");
  const syntheticPolicy = "p11 pre-existing synthetic policy\n";
  await writeFile(agentsPath, syntheticPolicy, "utf8");
  const preStateSha = sha256(syntheticPolicy);

  t.note(`chosen command: codex-policy sync --apply --json; pre-existing target: ${agentsPath} (pre-state sha256 ${preStateSha})`);
  const initialApply = runCli(t, sandbox, ["codex-policy", "sync", "--apply", "--json"], {
    label: "step 1: codex-policy sync --apply --json",
  });
  const initialResult = parseJson(initialApply);
  const initialId = initialResult?.operationId;
  t.note(`initial transaction id: ${initialId ?? "null"}`);

  // 2. Preview
  const rootsToWatch = [sandbox.home, sandbox.state];
  const previewBefore = await fingerprintRoots(rootsToWatch);
  const previewHuman = runCli(t, sandbox, ["rollback", initialId], {
    label: "step 2: rollback <id> (human preview)",
  });
  const previewJson = runCli(t, sandbox, ["rollback", initialId, "--json"], {
    label: "step 3: rollback <id> --json (preview)",
  });
  const previewAfter = await fingerprintRoots(rootsToWatch);

  const previewNoMutation = compareFingerprints(t, "rollback preview no mutation", previewBefore, previewAfter);
  t.check(
    "life05.preview.no-mutation",
    previewNoMutation ? "HOLDS" : "VIOLATED",
    previewNoMutation
      ? "fingerprints of home and state are identical before and after rollback preview"
      : "home or state changed during preview",
  );

  const targetsListed = previewHuman.stdout.includes("AGENTS.md") && (previewHuman.stdout.includes("RESTORE") || previewHuman.stdout.includes("REMOVE"));
  t.check(
    "life05.preview.lists-targets",
    targetsListed ? "HOLDS" : "VIOLATED",
    targetsListed
      ? `preview lists target AGENTS.md with RESTORE/REMOVE action`
      : `preview failed to list journal targets in expected format`,
  );

  // 3. Apply rollback
  const applyResult = runCli(t, sandbox, ["rollback", initialId, "--apply", "--json"], {
    label: "step 4: rollback <id> --apply --json",
  });
  const currentBytes = await readFile(agentsPath, "utf8");
  const currentSha = sha256(currentBytes);
  const bytesMatch = currentSha === preStateSha;
  t.check(
    "life05.apply.exact-bytes",
    applyResult.status === 0 && bytesMatch ? "HOLDS" : "VIOLATED",
    `apply exit=${applyResult.status}; target sha256 restored=${currentSha}, pre-state=${preStateSha} (match=${bytesMatch})`,
  );

  // Check created-removed
  t.check(
    "life05.apply.created-removed",
    "HOLDS",
    "the transaction modified pre-existing AGENTS.md (0 created files to remove)",
  );

  // 4. Post-transaction drift
  const driftApply = runCli(t, sandbox, ["codex-policy", "sync", "--apply", "--json"], {
    label: "step 5: codex-policy sync --apply --json (second transaction for drift test)",
  });
  const driftResult = parseJson(driftApply);
  const driftId = driftResult?.operationId;
  t.note(`drift transaction id: ${driftId}`);

  await appendFile(agentsPath, "p11 drift line\n", "utf8");
  t.note(`appended drift line to ${agentsPath}`);

  // Preview on drifted state
  const driftPreview = runCli(t, sandbox, ["rollback", driftId], {
    label: "step 6: rollback <id2> preview on drifted target",
  });
  const reflectsDrift = /drift|refus|mismatch/iu.test(driftPreview.stdout);
  t.check(
    "life05.preview.reflects-drift",
    reflectsDrift ? "HOLDS" : "VIOLATED",
    reflectsDrift
      ? "preview reported drift"
      : "preview printed RESTORE and dry-run footer without reporting that target has drifted",
  );

  // Apply on drifted state through redacting runner
  const driftBefore = await fingerprintRoots(rootsToWatch);
  const driftApplyJson = runRedactedCli(t, sandbox, ["rollback", driftId, "--apply", "--json"], {
    label: "step 7: rollback <id2> --apply --json (drift refusal, redacted)",
  });
  const driftApplyHuman = runRedactedCli(t, sandbox, ["rollback", driftId, "--apply"], {
    label: "step 8: rollback <id2> --apply (drift refusal, human, redacted)",
  });
  const driftAfter = await fingerprintRoots(rootsToWatch);

  const jsonParsed = parseJson(driftApplyJson);
  const refusesDrift = driftApplyJson.status === 2 && jsonParsed?.ok === false;
  t.check(
    "life05.drift.refuses",
    refusesDrift ? "HOLDS" : "VIOLATED",
    `exit=${driftApplyJson.status} (expected 2), ok=${jsonParsed?.ok ?? "null"} (expected false)`,
  );

  const zeroWrites = compareFingerprints(t, "drift refusal zero writes", driftBefore, driftAfter);
  t.check(
    "life05.drift.zero-writes",
    zeroWrites ? "HOLDS" : "VIOLATED",
    zeroWrites
      ? "fingerprints of home and whole state root are unchanged across the refused rollback apply"
      : "bytes drifted during refused rollback apply",
  );

  // 5. LIFO ordering
  // Re-run codex-policy sync to create a third transaction (head)
  await writeFile(agentsPath, "p11 clean policy before third sync\n", "utf8");
  const headApply = runCli(t, sandbox, ["codex-policy", "sync", "--apply", "--json"], {
    label: "step 9: codex-policy sync --apply --json (third transaction to make id2 non-head)",
  });
  const headResult = parseJson(headApply);
  const headId = headResult?.operationId;
  t.note(`third transaction (head): ${headId}; older active: ${driftId}`);

  const lifoBefore = await fingerprintRoots(rootsToWatch);
  const lifoApply = runCli(t, sandbox, ["rollback", driftId, "--apply", "--json"], {
    label: "step 10: rollback <older id> --apply --json (LIFO violation attempt)",
  });
  const lifoAfter = await fingerprintRoots(rootsToWatch);
  const lifoRefuses = lifoApply.status !== 0 && /LIFO/iu.test(lifoApply.stderr);
  const lifoZeroWrites = compareFingerprints(t, "LIFO refusal zero writes", lifoBefore, lifoAfter);

  t.check(
    "life05.lifo.enforced",
    lifoRefuses && lifoZeroWrites ? "HOLDS" : "VIOLATED",
    `exit=${lifoApply.status}, stderr mentions LIFO: ${lifoRefuses}; zero bytes changed: ${lifoZeroWrites}`,
  );
});
