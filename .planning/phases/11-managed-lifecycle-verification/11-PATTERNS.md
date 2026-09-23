# Phase 11: Managed Lifecycle Verification - Pattern Map

**Mapped:** 2026-09-23
**Files analyzed:** 9
**Analogs found:** 9 / 9 (all tracked; `git ls-files` verified for `test/tarball-fixture.test.ts`)

`src/` is NOT modified (D-05). Only `test/`, `.planning/` files and scratch probe scripts are in scope.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `test/tarball-fixture.test.ts` (modify: export `fingerprintManifest`, `hostSnapshot`/`snapshotTargets`, `describeHostDrift`, `runInstalledCli`; optionally extend LIFE-01 fingerprint oracle) | test utility | file-I/O (byte fingerprint) | itself, lines 80-310 | exact |
| `test/lifecycle-verification.test.ts` (new, pass-only per D-12: LIFE-05 rollback, LIFE-08 update preview fingerprint) | test | file-I/O + subprocess (packed CLI) | `test/tarball-fixture.test.ts` test at line 585 | exact |
| `.planning/phases/11-.../evidence/*.txt` (transcripts) | evidence record | batch (command -> verbatim output) | `.planning/phases/10-three-os-ci-baseline/CI_RUN.md` | role-match |
| `.planning/phases/11-.../evidence/probes/*.mjs` (scratch, gap reproductions; never in `test/`) | probe script | subprocess / module import | research `probe-leads.mjs` pattern + `runInstalledCli` | role-match |
| `.planning/milestones/v0.1.0-phases/06-.../06-VERIFICATION.md` (new, deliverable) | verification report | transform (evidence -> verdicts) | `07-VERIFICATION.md` (gaps frontmatter) + `10-VERIFICATION.md` (re-check tables) | exact |
| `.planning/REQUIREMENTS.md` (Future Requirements, LIFE-09 row) | planning record | append | existing `**REL-02 / G-07-2**` line | exact |
| `.planning/MILESTONES.md` (Known Gaps note) | planning record | append | line 13 LIFE line | exact |
| `.planning/milestones/v0.1.0-REQUIREMENTS.md` (lines 77-84 checkboxes, 179-186 status) | planning record | edit | same file | exact |
| `.planning/milestones/v0.1.0-ROADMAP.md` (line ~416 Phase 6 Plans line) | planning record | edit | same file | exact |

## Pattern Assignments

### `test/tarball-fixture.test.ts` (export helpers, strengthen LIFE-01 oracle)

**Sandbox factory (already exported)** lines 80-140: `createIsolatedSandbox(context)` makes `root/{home,state,prefix,repo,temp,npm-cache,npm-logs}`, scrubs `npm_*` env, sets `HOME, USERPROFILE, XDG_CONFIG_HOME, APPDATA, LOCALAPPDATA, ALPHA_AOS_STATE_DIR, CODEX_HOME, ANTIGRAVITY_CONFIG_DIR, CLAUDE_CONFIG_DIR, PI_CODING_AGENT_DIR, HERMES_HOME, npm_config_prefix/cache/logs_dir/userconfig, TMPDIR/TEMP/TMP`, cleanup:
```typescript
context.after(async () => rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }));
```

**Windows CLI invocation** lines 61-78 (`runInstalledCli`, currently private):
```typescript
if (process.platform === "win32") {
  const entrypoint = join(prefix, "node_modules", "alpha-aos", "dist", "src", "cli.js");
  return commandResult(spawnSync(process.execPath, [entrypoint, ...args], { env, encoding: "utf8", timeout: 600_000, windowsHide: true }));
}
```

**Byte oracle (private; export for reuse, Wave 0)**: `fingerprintManifest(path)` lines 168-215 (sha256 over sorted walk, `link/dir/file/vanished` entries, files >1MiB hashed by size only), `snapshotTargets(targets, manifests?)` lines 228-232 (generic; use this with sandbox roots rather than `hostSnapshot`, which is bound to `hostMutationTargets` lines 217-226), `describeHostDrift(before, after, limit)` lines 261-302 (metadata-only: `status path kind/size/hash12`; the first line text says "packed lifecycle ... host path" - parameterize the header if reused for sandbox roots).

**Existing LIFE-01 oracle to extend** lines 722-760: second `install --target codex --apply --json` asserts `applied=[]`, `operationIds=[]`, all `plan.steps[].action === "current"`, journal name list unchanged. Gap per research: add `snapshotTargets([sandbox.home, sandbox.state, sandbox.prefix])` before/after the second run and assert equal digests with `describeHostDrift` as message; add dry-run `install --target codex` capturing `CURRENT` lines.

**JSON parse helper** `parseJsonResult<T>(result, label)` line 312.

### `test/lifecycle-verification.test.ts` (new, integration)

**Analog:** `test/tarball-fixture.test.ts` line 585 test (`{ timeout: 900_000 }`, async `context`), same install recipe (`npm pack --ignore-scripts --json --pack-destination`, `npm install --global <tgz> --prefix ... --ignore-scripts --prefer-offline`, seed GSD `VERSION`/`.gsd-runtime`/`.gsd-profile` ~lines 665-666, install locked `ecc-universal`). Import `createIsolatedSandbox` and newly exported helpers with `.js` extension:
```typescript
import { createIsolatedSandbox } from "./tarball-fixture.test.js";
```
Caveat: importing a `.test.js` module registers its tests in the importing file too. If that duplicates the heavy packed test, move helpers into a non-test module (e.g. `test/support/sandbox.ts`) instead. Style: `node:test` + `node:assert/strict`, double quotes, semicolons, strict TS (`exactOptionalPropertyTypes`). Only commit if passing (D-12). Runner: `node scripts/run-tests.mjs --files dist/test/lifecycle-verification.test.js`.

### Evidence transcripts `evidence/*.txt` and probes

**Analog:** `.planning/phases/10-three-os-ci-baseline/CI_RUN.md` (run id + job id table) and research §Code Examples. Convention: header with `git rev-parse HEAD`, exact command, exit code, verbatim stdout/stderr, temp paths aliased to `<sandbox>`, never file contents or env dumps (hash/size/path only, per `describeHostDrift`). CI corroboration command:
```bash
gh run view --job 107044319963 --log | grep -E "\(LIFE-0[1-8]|packed release completes"   # windows; ubuntu 107044319989, macOS 107044319988
```
Interruption probe: `ALPHA_AOS_FAILPOINT=after-target-rename` (names at `src/core/transaction.ts:105-118`). Doctor probes: `ALPHA_AOS_STATE_DIR=<scratch>`, scratch project copy (canary writes `.ecc/memory/...`).

### `06-VERIFICATION.md` (report)

**Analog A:** `.planning/milestones/v0.1.0-phases/07-cross-platform-release-proof/07-VERIFICATION.md` lines 1-30: frontmatter `phase`, `verified`, `status: gaps_found`, `score`, and a `gaps:` list with `gap_id`, `requirement`, `truth`, `status: failed`, `reason`, `severity`, `test`, `root_cause`, `artifacts`. Map D-06 fields onto this: `gap_id: G-11-N`, `requirement: LIFE-0X`, clause, missing, close-condition (`test`), reproduction (command + output).
**Analog B:** `.planning/phases/10-three-os-ci-baseline/10-VERIFICATION.md` lines 1-60: "Primary evidence records" list and "Independent re-check" table (`Field | Returned value | Matches`) - use for per-clause tables `Clause | Evidence (cmd/test/run id) | Oracle audit | Result`. Add summary matrix LIFE-01..08 with VERIFIED/PARTIAL/GAP and an explicit `Phase 13 gating: BLOCKED|NOT BLOCKED` line (D-08). Cite `.planning/debug/ci02-windows-alpha-aos-host-leak.md` for D-13.

### Record edits

- `.planning/REQUIREMENTS.md` `## Future Requirements` (current style): `- **REL-02 / G-07-2**: Claude Code real-host invocation receipt ...` -> append `- **G-11-N** (LIFE-0X): <one line>`.
- `.planning/MILESTONES.md` line 13, kept verbatim: `- **LIFE-01..08** (Phase 6): implemented and summarized, but Phase 6 has no \`06-VERIFICATION.md\`; ...` -> add indented dated sub-bullet (Closed / Narrowed to G-11-...; Phase 10 resolved the windows red half). Consider matching note under line 15 (`**CI**`).
- `.planning/milestones/v0.1.0-REQUIREMENTS.md:77-84` format `- [ ] **LIFE-0N**: ...` (flip to `[x]` only when VERIFIED); `:179-186` rows `| LIFE-0N | Phase 6 | Unverified (no 06-VERIFICATION.md) |` -> `Verified` / `Partial (G-11-…)` / `Gap (G-11-…)` + report link.
- `.planning/milestones/v0.1.0-ROADMAP.md:416` currently `**Plans**: 3/3 plans executed. Verification complete (2026-09-18).` -> correct stale claim and link `06-VERIFICATION.md`.

## Shared Patterns

- **No-mutation oracle:** `snapshotTargets` + `describeHostDrift` (tarball-fixture lines 228-302) for LIFE-01/03/05/08 probes; justify excluded roots (npm cache/logs).
- **Isolation:** always `createIsolatedSandbox` env or explicit `ALPHA_AOS_STATE_DIR`; take host `hostSnapshot()` before/after packed probes.
- **Secrets/redaction:** metadata only (path, kind, size, 12-char hash prefix); synthetic non-secret fixture content for rollback drift probes (drift diff prints lines).
- **Red-test rule:** failing reproductions live in `evidence/` only (D-12).
- **Build freshness:** `npm run build` before each suite/pack run; record HEAD.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| Pseudo-TTY `[y/N]` probe (optional, WSL `script`) | probe | interactive | No pty-driven test exists; use research Pitfall 7 or record PARTIAL |
| CLI-level zero-subprocess preload (`--import` + `syncBuiltinESMExports`) | probe | interception | No existing preload; use research §Code Examples with a positive control |

## Metadata

**Analog search scope:** `test/`, `.planning/phases/10-*`, `.planning/milestones/v0.1.0-phases/*/`, `.planning/*.md`
**Files scanned:** ~10
**Pattern extraction date:** 2026-09-23
