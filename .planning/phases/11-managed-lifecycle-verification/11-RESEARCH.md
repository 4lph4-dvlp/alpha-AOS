# Phase 11: Managed Lifecycle Verification - Research

**Researched:** 2026-09-23
**Domain:** Evidence-backed verification of an existing TypeScript CLI lifecycle (install/reconcile, status/doctor, uninstall, rollback, repair, update) on Windows 11, with POSIX corroboration from CI
**Confidence:** HIGH for evidence inventory and oracle audit (every claim below was read or executed this session); MEDIUM for predicted verdicts (the phase must re-produce the evidence itself per D-01/D-06)

## Summary

Phase 11 builds no product code. It produces `06-VERIFICATION.md` for the archived Phase 6, where every LIFE-01..08 clause carries a verdict backed by evidence produced in this phase. Three evidence sources exist: (1) the six Phase 6 suites, which pass locally right now (33/33, run this session) and in CI run `35818198049` (per-test lines are still retrievable with `gh run view --job <id> --log`); (2) the packed-CLI lifecycle test in `test/tarball-fixture.test.ts`, which already proves Codex install → idempotent reconcile → status/doctor → `uninstall --all --purge` with a host-immutability oracle; (3) new packed-CLI and module probes the phase must write. `src/`, `test/` and `scripts/` are byte-identical between the CI proof commit `35d4c15` and `HEAD` (`git diff 35d4c15 HEAD -- src test scripts catalog package.json` = 0 lines), so the CI run is valid corroboration for the current code.

The oracle audit (D-04) is where the verdicts will actually move. Several Phase 6 tests pass while testing something weaker than their title: the LIFE-01 unit test forces every step to `current` by hand; the LIFE-08 "zero filesystem writes" test only compares journal counts; the "zero subprocesses" test patches the CJS default export without `syncBuiltinESMExports()`; the "sweeps empty directories" uninstall test never asserts a directory was swept; and the LIFE-07 compensation tests pin package names that do not exist in the stable lock. Research-time probes (run against `dist/` in temp directories, reproduced below) already confirm defects behind five of the scouting leads: uninstall removes same-named user entries and user-edited skill files with no receipt or applied-state check (LIFE-04), `uninstall --project` deletes every file under `.alpha-aos/` including the reviewed manifest and user files (LIFE-03/04), apply ignores the previewed hash (LIFE-04), a schema-broken `applying` journal makes `status` say NEEDS-REPAIR while `repair` plans `none` (LIFE-06), and every external-package compensation command names the wrong package or directory (LIFE-07). `doctor --discovery` covers Codex and Pi only; `doctor --canary --no-spend` runs zero execution legs for any harness (LIFE-02).

**Primary recommendation:** Structure the phase as (Wave 1) parallel evidence-collection plans grouped by LIFE cluster, each writing verbatim command/output transcripts into a phase-local evidence directory and committing only passing oracle-strengthening probes to `test/`; then (Wave 2) one plan that writes `06-VERIFICATION.md`, registers `G-11-N` gaps in `REQUIREMENTS.md`, and updates `MILESTONES.md`, `v0.1.0-REQUIREMENTS.md` and `v0.1.0-ROADMAP.md`. Expect LIFE-01/LIFE-08 to be the verdicts that decide Phase 13 gating (D-08). Expect several GAP/PARTIAL verdicts elsewhere, and do not try to "rescue" them.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Evidence standard and verdict grades
- **D-01:** Every verdict rests on evidence produced **in this phase** against the current code. Re-run the Phase 6 suites (`test/lifecycle`, `status`, `recovery-receipt`, `repair`, `rollback`, `uninstall`) and capture the command and its output. **In addition**, exercise each user-facing lifecycle behavior through the **packed CLI** (`npm pack` tarball installed into an isolated sandbox) with the sandbox env shape from `createIsolatedSandbox()` in `test/tarball-fixture.test.ts`. The behaviors are `install`/`plan` reconcile → `CURRENT`, `status`, `doctor`, `uninstall`, `rollback`, `repair`, and `update` preview/apply. Phase 6 SUMMARY `coverage:` blocks and `requirements-completed:` claims are **not** evidence. They are only leads for where to look.
- **D-02:** Verdict grades are **VERIFIED / PARTIAL / GAP**.
  - VERIFIED: every clause of the LIFE text has passing evidence.
  - PARTIAL: some clauses are evidenced. Each unevidenced or failing clause is listed as a named gap.
  - GAP: the core promise is not met.
  - A requirement with any unmet clause is never marked VERIFIED (SC3).
- **D-03:** OS scope. Fresh evidence is generated on the local Windows 11 developer host. POSIX coverage is corroborated by citing the same tests passing in `main` push run `35818198049` attempt 1 (ubuntu/macOS/windows all green, per `.planning/phases/10-three-os-ci-baseline/CI_RUN.md`). No new `workflow_dispatch` verification run is required.
- **D-04:** Audit the **oracles**, not just the pass/fail results. For each cited test, check that its assertions actually test the LIFE clause. Examples:
  - Is "<50ms" actually measured?
  - Is "zero writes" / "no mutation" proven by a filesystem snapshot or hash, not inferred?
  - Does "zero subprocesses" intercept the spawn API?
  - Does "refuses on drift" assert that no bytes changed?

  A passing test with a weak or mismatched oracle cannot alone support VERIFIED. That clause is downgraded to PARTIAL with a named gap, unless a packed-CLI probe from D-01 supplies the missing proof.

#### Gap handling
- **D-05:** **Record only.** Phase 11 does not modify `src/` to close a gap. Every gap is recorded and routed to follow-up work. This keeps the verdicts independent (the verifier is not the fixer) and holds the roadmap SC3 boundary. — **Reversibility:** reversible — a later phase can fix gaps; nothing is foreclosed.
- **D-06:** Each named gap carries:
  - a stable ID (e.g. `G-11-N`)
  - the LIFE clause it fails
  - what is missing
  - what would close it
  - **a reproduction**: the command or probe and its observed output that demonstrate the defect

  A suspicion from code reading alone is not a confirmed gap. It must be reproduced, or it stays a lead.
- **D-07:** Named gaps are tracked in `06-VERIFICATION.md` **and** registered in the current `.planning/REQUIREMENTS.md` `## Future Requirements` section with their IDs. This follows the REL-02 / G-07-2 pattern already used there.
- **D-08:** Phase 13 gating. Only an open gap against **LIFE-01** (idempotent stable-lock reconcile) or **LIFE-08** (update preview non-mutation / stable-lock-only apply) blocks Phase 13 dependency promotion. Gaps in LIFE-02..07 do not block promotion. The report states explicitly whether Phase 13 is blocked.

#### Requirement interpretation
- **D-09:** The **LIFE requirement text is the contract**. Every clause is judged. Examples:
  - LIFE-03: "clean an isolated runtime", "uninstall one target", "without removing harness applications, authentication, or unrelated user resources".
  - LIFE-04: "only **receipted** alpha-AOS-owned bytes or semantic entries **that still match their recorded applied state**".
  - LIFE-07: "shown **verified** external package changes".
  - LIFE-08: "no checkout, package, global-link, configuration, or managed-state mutation".

  Phase 6 decisions D-01..D-16 (`06-CONTEXT.md`) are consulted as the implementation's interpretation. Where an implementation satisfies a D-decision but falls short of the LIFE text, the verdict follows the LIFE text and the shortfall is a gap.
- **D-10:** Harness scope is all **five** active harnesses (Claude Code, Codex, Antigravity, Pi, Hermes). Claude Code became active under D-18 after Phase 6 was built. Its managed config/skill removal and rollback are judged at **sandbox file level** (e.g. `pruneClaudeConfig`, `pruneClaudeSettings`). A Claude Code real-host invocation receipt is **not** required (roadmap planning note; G-07-2 / REL-02 remains future).
- **D-11:** LIFE-02 execution evidence comes from actually running `alpha-aos doctor --discovery` and `alpha-aos doctor --canary --no-spend` locally. Spending (model-turn) canary legs are **not** run, and the report marks them "not executed (cost)". If the no-spend legs do not amount to "meaningful read-only execution evidence" for a harness, LIFE-02 is PARTIAL with a named gap. It is not stretched to VERIFIED.
- **D-12:** Test additions are **allowed under `test/`**. A passing verification probe that fills a weak or missing oracle (e.g. a packed-CLI lifecycle assertion) may be committed as a test so CI keeps guarding it. A **failing** probe that demonstrates a gap is **not** committed as a test, because it would turn `main` red. It lives in the verification record (command + output) and, if useful, in a scratch script referenced by the report. `src/` stays untouched (D-05).

#### Phase 10 carry-forward (SC2)
- **D-13:** Phase 10 classified the Windows `~/.alpha-aos` change as a **test-isolation leak**, not a product isolation leak (`.planning/debug/ci02-windows-alpha-aos-host-leak.md`). The LIFE-03/LIFE-04 verdicts cite that record, stating that the host-safety violation was in test code and was fixed and pinned by regression tests (Phase 10 SC4). They do not name a product requirement violation. Host-safety of the product itself is still judged afresh through the packed-CLI probes (D-01).

#### Milestone record update
- **D-14:** `.planning/MILESTONES.md` v0.1.0 Known Gaps: **keep the original LIFE line verbatim** as the audit record. Append a dated resolution note (`Closed` or `Narrowed to G-11-…`) pointing to `06-VERIFICATION.md`. The note also records that the windows-latest lifecycle red half of that line was resolved in Phase 10 (debug record + `CI_RUN.md`).
- **D-15:** `.planning/milestones/v0.1.0-REQUIREMENTS.md` updates:
  - Traceability status for each LIFE row becomes `Verified`, `Partial (G-11-…)`, or `Gap (G-11-…)`, each with a pointer to `06-VERIFICATION.md`.
  - The `[ ]` checkbox flips to `[x]` **only** for VERIFIED requirements.
  - The Phase 6 entry in `.planning/milestones/v0.1.0-ROADMAP.md` gains a link to the report.

  Editing these archived records is pre-approved (roadmap planning note, 2026-09-23).
- **D-16:** LIFE-09 is complete when all eight LIFE requirements carry evidence-backed verdicts and every gap is recorded and tracked per D-06/D-07, **even if gaps remain**. Zero gaps is not the bar.
- **D-17:** Independent confirmation: the Phase 11 `gsd-verifier` re-executes a sample of the commands cited in `06-VERIFICATION.md` and confirms the outputs match. This mirrors how Phase 10's verifier re-checked the CI run by id.

### Claude's Discretion
- Report layout: per-requirement clause tables, evidence formatting, and whether to include a summary verdict matrix.
- Gap ID scheme details (`G-11-N` suggested).
- How the packed-CLI probes are orchestrated (one scripted scratch harness vs. per-requirement probes), provided the commands and outputs are captured verbatim and secrets are never printed.
- Plan split and wave ordering (e.g. evidence-collection plans per LIFE group, then report + record updates).

### Deferred Ideas (OUT OF SCOPE)
- Fixing any LIFE gap found here belongs in a follow-up phase or future requirement (D-05/D-07). It is not folded into Phase 11.
- A spending (model-turn) canary run for LIFE-02 execution evidence is deferred. It can be added later if the no-spend evidence leaves LIFE-02 PARTIAL.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| LIFE-09 | User can consult a verification report for the Phase 6 managed lifecycle in which each of LIFE-01..08 carries inspectable evidence, and any requirement not met is recorded as a named gap | Per-LIFE clause decomposition, evidence map and oracle audit (§Evidence Map); probe designs (§Architecture Patterns); confirmed lead reproductions (§Research-Time Lead Reproductions); record-update targets and formats (§Record Updates) |

LIFE-01..08 contract text, quoted verbatim from `.planning/milestones/v0.1.0-REQUIREMENTS.md:77-84` [VERIFIED: grep output of that file this session]:

- **LIFE-01**: User can install or reconcile the reviewed stable lock idempotently, and a second unchanged plan reports `CURRENT`
- **LIFE-02**: User can run offline `status` for fast inspection and an explicit `doctor` or canary mode for native discovery and meaningful read-only execution evidence with actionable coded findings
- **LIFE-03**: User can preview and remove a project pack, clean an isolated runtime, uninstall one target, or uninstall the full managed stack without removing harness applications, authentication, or unrelated user resources
- **LIFE-04**: User can remove only receipted alpha-AOS-owned bytes or semantic entries that still match their recorded applied state, while drifted or user-modified resources cause a refusal
- **LIFE-05**: User can preview and apply rollback to restore exact prior bytes, and any post-transaction drift prevents all rollback writes before mutation begins
- **LIFE-06**: User can diagnose corrupt or interrupted journals as `needs-repair` and receive restart-safe recovery guidance instead of a false success state
- **LIFE-07**: User is shown verified external package changes and component-specific recovery instructions when managed-file rollback cannot safely reverse GSD, ECC, npm-link, or Pi bridge state
- **LIFE-08**: User can run update preview with no checkout, package, global-link, configuration, or managed-state mutation, and update apply reconciles only a reviewed stable-lock promotion

Traceability rows to update are `.planning/milestones/v0.1.0-REQUIREMENTS.md:179-186`, each currently `| LIFE-0N | Phase 6 | Unverified (no 06-VERIFICATION.md) |`.
</phase_requirements>

## Project Constraints (from AGENTS.md / CLAUDE.md)

No `./CLAUDE.md` or `./.claude/CLAUDE.md` exists. `AGENTS.md` directives that apply here:

- Work only through a GSD workflow (this phase is one). No direct repo edits outside it.
- **Secrets:** credential values must not enter plans, journals, diagnostics, command arguments, or repository files. Evidence prints hashes, sizes and paths, never file contents (also CONTEXT §specifics).
- **Safety:** mutations are previewable, root-bounded, snapshotted. Stale evidence never triggers automatic deletion.
- **Validation:** configuration-file presence alone is insufficient. Native discovery plus a meaningful read-only invocation is required. This is directly relevant to the LIFE-02 verdict.
- Test style: `node:test` + `node:assert/strict`, TypeScript under `test/*.test.ts`, `.js` relative imports, double quotes, semicolons, two-space indent. Tests run compiled from `dist/test/` through `scripts/run-tests.mjs`.
- Preserve `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` (new tests must typecheck under `npm run check`).
- User memory: speak Korean to the user, keep `.planning/` docs in English. Run verification yourself rather than handing it to a human.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Evidence generation (suites, probes) | Local Windows host (agent-run commands) | CI run `35818198049` logs (POSIX corroboration) | D-01/D-03 |
| Packed-CLI lifecycle probes | Isolated sandbox (`createIsolatedSandbox` env) | Real harness binaries on PATH | The distributable, not the checkout, is under test |
| Oracle-strengthening regression tests | `test/*.test.ts` (committed only if passing) | CI | D-12 |
| Failing gap reproductions | Phase-local evidence dir + scratch scripts | `06-VERIFICATION.md` transcripts | D-12 forbids red tests on `main` |
| Verdict record | `.planning/milestones/v0.1.0-phases/06-.../06-VERIFICATION.md` | `REQUIREMENTS.md` Future Requirements, `MILESTONES.md`, archived v0.1.0 REQUIREMENTS/ROADMAP | D-07, D-14, D-15 |
| Product code | Untouched (`src/`) | — | D-05 |

## Standard Stack

No new packages. Everything the phase needs is already in the repo or is a Node built-in.

### Core
| Tool | Version (verified this session) | Purpose |
|------|---------|---------|
| Node.js | v24.13.1 | Runtime, `node:test`, `node:crypto` hashing for fingerprints |
| npm | 11.8.0 | `npm pack`, sandbox `npm install --global <tgz> --prefix` |
| `scripts/run-tests.mjs --files ...` | repo | Env-scrubbed test runner; supports file subsets |
| `gh` | 2.100.0 | Pull per-test lines from CI job logs by job id |
| `test/tarball-fixture.test.ts` helpers | repo | `createIsolatedSandbox`, `fingerprintManifest`, `hostSnapshot`, `describeHostDrift` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| New `workflow_dispatch` CI run | Cite run `35818198049` job logs | D-03 locks citation. Logs are still retrievable (checked this session) |
| Spending canary for LIFE-02 | `--no-spend` + `--discovery` | D-11 locks no-spend. The spending run is deferred |

**Package Legitimacy Audit:** Not applicable. This phase installs no external packages. The sandbox installs only the repo's own tarball and the already-locked `ecc-universal@2.2.0` (a stable-lock component, not a new dependency), exactly as the existing packed lifecycle test does.

## Evidence Map and Oracle Audit (per LIFE requirement)

Local run this session: `npm run build && node scripts/run-tests.mjs --files dist/test/lifecycle.test.js dist/test/status.test.js dist/test/recovery-receipt.test.js dist/test/repair.test.js dist/test/rollback.test.js dist/test/uninstall.test.js` → `tests 33 / pass 33 / fail 0` [VERIFIED: executed]. CI corroboration: `gh run view --job 107044319989 --log | grep -E "LIFE-0|packed release completes"` returns the same test names as `✔` on ubuntu [VERIFIED: executed]. Job ids: ubuntu `107044319989`, macOS `107044319988`, windows `107044319963` (from `CI_RUN.md` §1).

"Predicted verdict" below is a research lead, not a verdict. The phase must produce its own transcripts.

### LIFE-01 — idempotent stable-lock reconcile, second unchanged plan reports `CURRENT`
| Clause | Existing evidence | Oracle audit |
|---|---|---|
| install/reconcile idempotently | `test/lifecycle.test.ts` "stable-lock reconciliation ... zero writes (LIFE-01, D-15)" | **Weak.** Lines 189-192 build `currentPlan` with `steps: plan.steps.map((s) => ({ ...s, action: "current" as const }))` and pass a synthetic plan with `digest: "synthetic-digest"`. The test proves only that `applyManagedInstall` short-circuits when *given* an all-current plan. It never proves a real second plan *is* all current. [VERIFIED: test/lifecycle.test.ts:189-210] |
| second unchanged plan reports `CURRENT` | Packed lifecycle test `test/tarball-fixture.test.ts:722-753`: second `install --target codex --apply --json` asserts `applied` `[]`, `operationIds` `[]`, every `plan.steps[].action === "current"`, journal file list unchanged | **Strong for Codex**, through the packed CLI. Gaps in the oracle: no byte fingerprint of the sandbox home or state across the second run (only the journal *names*), and it does not exercise the dry-run `install` output the user reads (`CURRENT <id>` lines, `src/cli.ts:495-500`) |
| scope | Codex only | D-10 asks for five harnesses. Only Codex is covered anywhere |

Note: `alpha-aos plan` (`src/cli.ts:483-487` → `createInstallPlan(catalog, lock)`) is a **static** action table and never reports `CURRENT` [VERIFIED: ran `node dist/src/cli.js plan`, output shows only `install/check/register` ops]. The stateful "plan" is `alpha-aos install` without `--apply`. The report must say which command it treats as "the plan" and why, and record the `plan` behavior as an observation or gap by D-09 judgment.

**Probe needed:** packed sandbox: install `--apply` → fingerprint sandbox (home, state, prefix) → `install --target <t>` dry-run (capture `CURRENT` lines) → `install --apply` again → fingerprint again: digests equal except the allowed set (none expected). Do this for Codex first (known to work, CI-proven), then attempt all five targets (see Pitfall 5). **Predicted:** VERIFIED for Codex; five-harness coverage decides PARTIAL vs VERIFIED. **Phase 13 gate hinges on this verdict (D-08).**

### LIFE-02 — offline `status` fast; `doctor`/canary native discovery + meaningful read-only execution evidence, actionable coded findings
| Clause | Evidence | Oracle audit |
|---|---|---|
| offline, zero subprocess | `status.test.ts` "strictly executes zero subprocesses" | **Weak interception.** Patches `childProcess[method]` on the default import (lines 31-42) without `module.syncBuiltinESMExports()`, so ESM named imports would not be intercepted. Structurally it still holds: `status.js`'s transitive import graph is `status.js, writer-lock.js` with externals `node:fs node:fs/promises node:path node:crypto node:os`. No `child_process` [VERIFIED: import-graph walk this session]. The CLI `status` path also runs `loadCatalog`/`loadLock` first (`src/cli.ts:422-424`), which this test does not cover |
| fast | "completes in under 50ms" | Measured: median of 10 in-process `getOfflineStatus` calls on an **empty** state root (lines 60-70). It is not measured through the CLI and not with a populated journal dir. LIFE text says "fast", with no number. Acceptable with a CLI-level timing transcript |
| needs-repair diagnosis | incomplete/corrupt/stale-lock tests | Sound oracles on synthetic journals |
| native discovery | none in Phase 6 | Ran `ALPHA_AOS_STATE_DIR=<scratch> node dist/src/cli.js doctor --discovery .` this session (36.6 s, exit 0): `COMPLETE` rows for **codex, pi** only. Claude `NOT-RUN` ("driving claude spends a model turn"), hermes `unsupported` ("no discovery oracle is defined for hermes"), **antigravity absent from the rows entirely** [VERIFIED: executed] |
| meaningful read-only execution evidence | none in Phase 6 | Ran `doctor --canary . --no-spend` (9.1 s, exit 0): every CAPA-01/02/05 leg for claude and codex is `not attempted`. The only `COMPLETE` rows are CAPA-03 handoff free legs (codex, native use `discovered`), whose receiving leg was not run. Canaries are declared only for claude and codex (`test/canary.test.ts:391` asserts `Declared harnesses: claude, codex`) [VERIFIED: executed] |
| actionable coded findings | plain `doctor` → `DoctorFinding` with `code` (`src/core/doctor.ts`), exit 2 on error | Status output is not coded (`formatOfflineStatus`, `src/format.ts:909-931`). It prints `STATUS: NEEDS-REPAIR (Run 'alpha-aos repair' ...)` |

**Predicted:** PARTIAL. Gaps: no execution evidence without spend (D-11: "not executed (cost)"); discovery covers 2/5 harnesses; antigravity is silently absent.

### LIFE-03 — preview + remove project pack, clean isolated runtime, uninstall one target, uninstall full stack; harness apps/auth/unrelated resources kept
| Clause | Evidence | Oracle audit |
|---|---|---|
| preview | `uninstall` without `--apply` prints plan (`src/cli.ts:1415-1422`) | Needs packed-CLI fingerprint proof that preview writes nothing |
| remove a project pack | Two routes. (a) `uninstall --project <p>`: `planUninstall` scans **every** file under `.alpha-aos/` (`src/core/uninstall.ts:385-404`). (b) `project status` → `project approve <path> --plan-digest <removal-digest> --apply` (`planPackRemoval`, `src/cli.ts:1124-1129`) | Unit test "project pack removal removes sidecars and sweeps empty directories" asserts only the file is gone (lines 245-247). **No directory-sweep assertion despite the title.** Route (a) destroys user files (repro P3) |
| clean an isolated runtime | `project isolate clean [path] --apply` → `cleanIsolationRuntime` (`src/core/isolation.ts:661-690`: marker check, `assertUnchangedSincePlan`, journaled removal). Tests: `isolation.test.ts` "clean removes only a marked generated runtime", "a runtime marker is read strictly before a directory is removed", "a clean journals every removal ..." | Design looks strong. Needs packed-CLI probe (init → trust → sync → clean preview → clean apply). `uninstall --all` instead `rm -rf`s `stateRoot/runtimes` with no marker check (`uninstall.ts:566-569`) |
| uninstall one target | `uninstall --target <h>` | Unit test covers claude at file level with user token preserved (good). Packed probe needed per harness |
| uninstall full stack | Packed lifecycle test (`uninstall --all --yes --apply --purge`) asserts AGENTS.md, config.toml and the three ECC skills removed, `sandbox.state` gone | **Incomplete oracle:** never checks for leftovers. `planUninstall` never lists owned skills (`alpha-aos-control` for 5 harnesses, `alpha-aos-ship` for claude). It hard-codes a claude owned skill named `gsd-code-review` (`uninstall.ts:345`), which is not an owned skill in `catalog/stack.yaml` (owned ids: `alpha-aos-ship`, `alpha-aos-control`). Repro P2 shows `alpha-aos-control/SKILL.md` survives `--target codex` |
| harness apps/auth/unrelated kept | claude unit test keeps `userToken`, `customUserServer`, `userPref` | P1/P3 show unrelated user resources **are** removed when they share a managed name or live under `.alpha-aos/` |
| interactive `[y/N]` | `06-VALIDATION.md` marks manual-only | `src/cli.ts:1425-1452`: non-TTY without `--yes` → exit 2 (tested). TTY path needs a pseudo-TTY probe (see Pitfall 7) or stays PARTIAL |
| host safety (D-13) | Phase 10 debug record: `classification: test-isolation leak`, fix commits `8f17c7e`, `7a3ee28` (test-only) | Cite as-is. The packed probes re-judge the product's host safety with `hostSnapshot` |

**Predicted:** GAP or PARTIAL (full-stack uninstall leaves owned skills; the project route destroys unrelated files).

### LIFE-04 — remove only receipted, owned bytes/entries that still match recorded applied state; drift/user edits refuse
| Clause | Evidence | Oracle audit |
|---|---|---|
| receipted | None. `planUninstall` consults no journal, receipt or lock hash. It prunes by fixed name `MANAGED_SERVERS = ["context7", "exa", "firecrawl"]` and fixed skill list `MANAGED_SKILLS = ["unified-memory", "documentation-lookup", "deep-research"]` (`uninstall.ts:225-226`) | Confirmed by repro P1, P2 |
| matches recorded applied state | Plan records `currentHash` (`uninstall.ts:320`), but `applyUninstall` recomputes the prune from current content and never compares (`uninstall.ts:486-512`) | Repro P4: file edited after preview, apply proceeded, edited `exa` removed |
| drift/user-modified refuses | Only *syntactic* tamper refuses: missing TOML end marker, malformed markdown markers, invalid JSON/YAML (`SemanticPruneDriftError`) | Unit test "tampering and missing closing markers" is a sound oracle for syntax only. A user-edited but well-formed managed entry is removed, not refused. `stripManagedToml` also strips *unmarked* `[mcp_servers.context7|exa|firecrawl]` tables (`src/core/mcp.ts:298-312`) |
| journals preserved / purge | "full stack uninstall preserves historical transaction journals", "purge flag" | Sound, but `uninstall --all` deletes `snapshots/` (`uninstall.ts:566-568`), so the preserved journals can no longer be rolled back. This is an observation, not a LIFE-04 clause |

**Predicted:** GAP (the core "only receipted ... still match" promise is not implemented).

### LIFE-05 — preview + apply rollback to exact prior bytes; any drift prevents all writes before mutation
| Clause | Evidence | Oracle audit |
|---|---|---|
| all-or-nothing refusal | `rollback.test.ts` "all-or-nothing preflight refusal on drift performs zero writes" | Asserts the three file contents after refusal (lines 61-63). Adequate for targets. Does not assert the journal status or snapshot bytes are unchanged. Implementation: full preflight loop before any write (`transaction.ts:318-375`) |
| exact prior bytes | `transaction.test.ts` "transaction restores existing bytes and removes files it created", "transactional removal can be restored byte-for-byte"; implementation re-hashes restored bytes against `beforeHash` (`transaction.ts:389-392`) | Good. Cite these alongside the Phase 6 suite |
| preview | `rollback <id>` without `--apply` prints `RESTORE/REMOVE` lines (`src/cli.ts:1363-1369`) | The preview does **not** run the drift preflight, so it can promise a restore that apply will refuse. Judge against "preview" |
| via CLI | `rollback` exit 2 + `formatDriftDiagnostics` on stderr | Packed probe needed. Note that the drift diff prints file lines (see Security) |
| LIFO | "strict LIFO ordering" | Sound |

**Predicted:** VERIFIED is plausible if the packed rollback probe (restore + drift refusal with fingerprint) passes. Observation: CLI rollback takes no writer session (`rollbackManagedTransaction` → `rollbackFileTransaction` acquires no lock). Record it only if the phase reproduces a consequence.

### LIFE-06 — corrupt/interrupted journals → `needs-repair`, restart-safe guidance, no false success
| Clause | Evidence | Oracle audit |
|---|---|---|
| corrupt → needs-repair | `status.test.ts` corrupt journal test; `repair.test.ts` quarantine tests | Sound on unparseable JSON |
| interrupted → needs-repair | synthetic `status: "applying"` journal | Synthetic only. A packed probe with a **real** interruption is available: `ALPHA_AOS_FAILPOINT=after-target-rename` (read from env in production code, `transaction.ts:120-134`; exits 70 leaving the journal `applying` and a dead-pid writer lock) |
| restart-safe guidance | `formatCrashRepairPlan`/`Result` (`src/format.ts:956-984`) print action/ids/files only. No "pass --apply" and no "re-run the original operation" text | D-10 of Phase 6 promised re-execution guidance. Judge the text |
| no false success | — | Repro P5: an `applying` journal lacking `files` → `status` NEEDS-REPAIR but `planCrashRepair` → `action: "none"` (the TypeError is swallowed by the outer `catch`, `repair.ts:95-97`), so `repair` cannot clear it. Repro P6: a `failed` journal → `status` OK, `repair` none. Whether a `failed` journal is "interrupted" needs D-09 judgment. A real reproduction needs a failed transaction whose compensating rollback also failed |

**Predicted:** PARTIAL.

### LIFE-07 — verified external package changes + component-specific recovery instructions (GSD, ECC, npm-link, Pi bridge)
| Clause | Evidence | Oracle audit |
|---|---|---|
| shown verified changes | `install --apply` prints `External verified changes retained outside journal rollback: ...` (`src/cli.ts:509`). On failure the error says `External verified changes retained: gsd:codex, ...` (`install.ts:862-876`) | Only ids are shown. Whether "verified" means post-install version verification must be read in `installGsd`/`installEccRuntime`/`installPiBridge` |
| component-specific recovery instructions | `compensateGsd/Ecc/PiBridge/NpmLink` exist, but **no install/update path calls them**. The only receipt writer is `applyUninstall` (grep: `writeRecoveryReceipt` referenced only from `src/core/uninstall.ts`) [VERIFIED: grep this session] | Install failure yields no instructions |
| instructions correct | Tests pin `npm uninstall -g @enterprise-coding-companion/companion` and `npm unlink @modelcontextprotocol/server-pi` (`test/recovery-receipt.test.ts:126,132`) | **Mismatched oracle.** The stable lock's ECC package is `ecc-universal` and the Pi bridge is `pi-mcp-adapter`, installed via `pi install npm:pi-mcp-adapter@2.31.0` (from `alpha-aos plan` output). `uninstall --all` emits `rm -rf ~/.claude/get-shit-done ~/.codex/get-shit-done` (`uninstall.ts:417`), but GSD lives at `~/.codex/gsd-core` (the packed test seeds `gsd-core/VERSION`, `tarball-fixture.test.ts:665-666`) |

**Predicted:** GAP.

### LIFE-08 — update preview mutates nothing (checkout, package, global-link, config, managed state); apply reconciles only reviewed stable-lock promotion
| Clause | Evidence | Oracle audit |
|---|---|---|
| preview no mutation | `lifecycle.test.ts` "pure read-only update preview ..." | **Weak.** Compares only `listManagedTransactions` counts (lines 274-291) and calls `planCandidateStage`, not the `update --check` CLI. `update.test.ts` "an update preflight binds the exact resolved remote commit without touching the checkout" asserts plan fields and digest stability, **not bytes of the checkout** |
| preview surfaces | `alpha-aos update` / `--check` (registry `fetch` only, `update.ts:24-33`), `update --stage` without `--apply`, `bootstrap update` (git `ls-remote`, `npm root --global`), `scripts/update.sh`/`update.ps1` without `--apply` → `bootstrap update` | All need fingerprint probes |
| apply only stable lock | `update --apply` = `applyManagedInstall` with the packaged lock (`src/cli.ts:1012-1026`). `loadLockStrict` reads `stack.lock.json` for the stable channel and enforces `lockInvariants(channel)` (`src/core/catalog.ts:163-178`). The tarball contains no `candidate.lock.json` (asserted `tarball-fixture.test.ts:627,659`). "candidate locks are strictly rejected" test only checks a plan note string | Packed probe: drop a bogus `catalog/candidate.lock.json` into the installed package, run `update --apply`, show it is ignored and no new journal appears |

**Predicted:** VERIFIED if the fingerprint probes pass. **Phase 13 gate hinges on this verdict (D-08).**

## Research-Time Lead Reproductions

Run this session with `C:\...\scratchpad\probe-leads.mjs` importing `D:/dev/alpha-AOS/dist/src/core/*.js`. Every path was under a fresh `mkdtemp` root with explicit `home`/`stateRoot`/`env`. The host was untouched (host `~/.alpha-aos` mtimes unchanged). Verbatim output:

```
P1 user-authored context7 (no receipt) removed by uninstall --target claude
  {"planned":[["prune",["context7"]]],"removedFiles":[],"prunedFiles":["C:\\Users\\alpha\\AppData\\Local\\Temp\\alpha-aos-p11-probe-oQdm4h\\p1\\home\\.claude.json"],"cfgExistsAfter":true}
P2 user-edited deep-research SKILL.md removed; owned alpha-aos-control left
  {"filesToRemove":["...\\p2\\home\\.agents\\skills\\deep-research\\SKILL.md"],"removed":["...\\deep-research\\SKILL.md"],"userSkillExistsAfter":false,"ownedControlExistsAfter":true}
P3 uninstall --project removes user file + manifest
  {"filesToRemove":["\\.alpha-aos\\my-notes.txt","\\.alpha-aos\\stack.yaml"],"manifestAfter":false,"userFileAfter":false}
P4 apply ignores plan currentHash (edited after preview)
  {"plannedCurrentHash":"f38d4be7f495","actualBeforeApply":"3601cd87540c","err":null,"serversAfter":["mine","extra"]}
P5 applying journal without files[]: status vs repair
  {"statusNeedsRepair":true,"incomplete":["tx-nofiles"],"repairAction":"none"}
P6 failed journal (compensating rollback outcome unknown): status/repair
  {"statusNeedsRepair":false,"repairAction":"none"}
P7 compensation commands vs lock packages
  {"lockEcc":"ecc-universal","eccCmd":["npm uninstall -g @enterprise-coding-companion/companion"],"lockPiBridge":"pi-mcp-adapter","piCmd":["npm unlink @modelcontextprotocol/server-pi"]}
P7b uninstall --all compensation commands
  [["gsd",["rm -rf ~/.claude/get-shit-done ~/.codex/get-shit-done"]],["ecc-runtime",["npm uninstall -g @enterprise-coding-companion/companion"]],["npm-link",["npm unlink -g alpha-aos"]]]
```

These are **module-level** reproductions made during research. Under D-06 the phase must re-run them (preferably through the packed CLI, e.g. `uninstall --target claude --yes --apply --json` in a sandbox seeded with a user-authored `context7`) and paste its own output. The research transcript is not the phase's evidence. P6 is a synthetic journal and needs D-09 judgment before it becomes a gap.

## Architecture Patterns

### System Architecture Diagram

```
 repo HEAD (== CI proof 35d4c15 for src/test/scripts)
    │
    ├─► [A] Phase 6 suites ──run-tests.mjs --files──► transcript (33 tests)
    │                                                   └─► cross-check: gh run view --job {ubuntu,macos,windows} --log | grep
    │
    ├─► [B] npm pack ─► tarball (sha256 recorded) ─► sandbox npm install --global --prefix
    │        │                                                  │
    │        │         createIsolatedSandbox env (HOME, USERPROFILE, APPDATA, ALPHA_AOS_STATE_DIR,
    │        │         CODEX_HOME, CLAUDE_CONFIG_DIR, ANTIGRAVITY_CONFIG_DIR, PI_CODING_AGENT_DIR,
    │        │         HERMES_HOME, npm_config_prefix/cache, TEMP)
    │        ▼                                                  ▼
    │   hostSnapshot(before) ──► packed-CLI probe sequence per LIFE cluster ──► hostSnapshot(after)
    │                              │  fingerprint(sandbox) before/after each step
    │                              ▼
    │                    verbatim stdout/stderr/exit + digest diffs (metadata only)
    │
    ├─► [C] module probes (gap reproductions) ─► scratch script + transcript (never committed as failing tests)
    │
    └─► [D] doctor --discovery / --canary --no-spend (real HOME for harness discovery,
             ALPHA_AOS_STATE_DIR=scratch, project = scratch copy) ─► transcript
                         │
                         ▼
     evidence/ transcripts ─► per-clause verdict tables ─► 06-VERIFICATION.md
                                   │                         ├─► REQUIREMENTS.md Future Requirements (G-11-N)
                                   │                         ├─► MILESTONES.md Known Gaps resolution note
                                   ▼                         └─► v0.1.0-REQUIREMENTS.md / v0.1.0-ROADMAP.md
                     passing oracle-strengthening probes ─► test/*.test.ts (D-12)
```

### Recommended Artifact Structure
```
.planning/phases/11-managed-lifecycle-verification/
├── 11-0N-PLAN.md / SUMMARY.md
└── evidence/                         # verbatim transcripts, one file per probe
    ├── suites-local.txt              # run-tests.mjs output
    ├── ci-35818198049-lifelines.txt  # gh log grep per job
    ├── life01-reconcile.txt ...      # packed-CLI probes
    └── probes/                       # scratch probe scripts referenced by the report
.planning/milestones/v0.1.0-phases/06-managed-lifecycle-uninstall-and-recovery/
└── 06-VERIFICATION.md                # the deliverable
```
Putting transcripts in `.planning/` (committed, English) lets the D-17 verifier diff re-runs against them. Redact sandbox temp paths to a stable alias (e.g. `<sandbox>`) so the verifier's re-run compares cleanly.

### Pattern 1: Packed sandbox reuse
Import or copy the exported `createIsolatedSandbox` (it is `export`ed at `test/tarball-fixture.test.ts:80`). `fingerprintManifest`, `hostSnapshot` and `describeHostDrift` are **not** exported (module-private `function`s), so a probe must either (a) be a new test file that duplicates them, or (b) export them from `tarball-fixture.test.ts` (a `test/` edit, allowed by D-12). Prefer (b) so there is one fingerprint implementation. Follow the tarball test's install recipe exactly: `npm pack --ignore-scripts --json --pack-destination`, `npm install --global <tgz> --prefix <sandbox.prefix> --ignore-scripts --prefer-offline` with the host npm cache, then seed GSD `VERSION`/`.gsd-runtime`/`.gsd-profile`, install `ecc-universal@<locked>` into the prefix, and pre-render the three ECC skills. On Windows, run the CLI as `node <prefix>/node_modules/alpha-aos/dist/src/cli.js` (`runInstalledCli`, lines 61-78).

### Pattern 2: "No mutation" oracle
A byte fingerprint of every relevant root, taken before and after, with digests compared and drift described by metadata (path/kind/size/hash prefix), never content. For LIFE-08 the roots are: the checkout work tree **and** `.git` (fixture clone, not the real repo), the npm global prefix, harness config roots, and the state root. Explicitly exclude, with a written justification, the npm cache and log dirs (npm writes debug logs on every invocation, see the `scripts/run-tests.mjs` header comment).

### Pattern 3: Deterministic interruption for LIFE-06
`ALPHA_AOS_FAILPOINT=after-target-rename node <cli> owned-skills sync alpha-aos-control --target codex --apply` (or any single-transaction command) → exit 70 → `status` (expect exit 1, NEEDS-REPAIR) → `repair` (plan) → `repair --apply` → `status` (OK) → re-run the original command (restart safety) → `repair --apply` again (idempotence). The failpoint names are `after-snapshot-sync`, `after-intent-journal-sync`, `after-target-rename`, `after-step-sync`, `after-final-sync` [VERIFIED: src/core/transaction.ts:105-118]. Confirm the chosen command takes a single transaction and that its session lock is left with the dead pid.

### Pattern 4: CI corroboration by job log
`gh run view --job <id> --log | grep -E "<exact test title>"` per job id, pasted with the job id. This is re-checkable by the verifier (D-17).

### Anti-Patterns to Avoid
- **Citing SUMMARY `coverage:` as evidence.** It is a lead only (D-01).
- **Committing a red probe.** Gap reproductions stay out of `test/` (D-12).
- **Running probes against the real host state or the real repo tree.** See Pitfalls 1-2.
- **Letting a weak test carry VERIFIED.** Name the weaker oracle and either supply a probe or downgrade (D-04).
- **Promoting a code-read suspicion to a gap.** No reproduction means it stays a lead (D-06). The leads that have no reproduction yet: rollback without writer session; `failed` journal semantics; drift-diff secret exposure.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Sandbox env | New env builder | `createIsolatedSandbox` | Already scrubs `npm_*`, sets every harness root, CI-proven on 3 OS |
| Before/after byte oracle | Ad-hoc `readdir` diff | `fingerprintManifest` + `describeHostDrift` | Handles links, vanished entries, and content-free reporting (Phase 10 convention) |
| Test runner | `node --test dist/test/*.js` | `scripts/run-tests.mjs --files` | Strips npm lifecycle env, refuses empty sets (CI run 33937610401 history) |
| Crash simulation | Hand-written `applying` journals only | `ALPHA_AOS_FAILPOINT` | Produces real journal, snapshot and lock state |
| CI proof | New dispatch run | `gh run view --job` log grep | D-03 |

## Common Pitfalls

### Pitfall 1: `doctor --canary` writes into the target project
**What goes wrong:** The CAPA-03 handoff free legs write Memory Vault entries into the project. Research ran `doctor --canary . --no-spend` in the repo, and it created `.ecc/memory/project/handoffs/mem_*.md` plus `.ecc/memory/project/.gitignore` (removed afterwards; git status was back to `?? nul`).
**How to avoid:** Run canary and discovery against a scratch project (a copy with `.planning/` and the evidence files the packs need), or run in a disposable git worktree. Record the vault write as expected product behavior, not as a LIFE mutation.

### Pitfall 2: `doctor --discovery/--canary` append to the ledger in `userStateRoot()`
**How to avoid:** Always set `ALPHA_AOS_STATE_DIR=<scratch>`. Leave `HOME` real so the harness binaries find their own configuration (discovery launches codex and pi). Discovery took 36.6 s and canary no-spend 9.1 s.

### Pitfall 3: Two different verification files
`06-VERIFICATION.md` (archived Phase 6 folder) is the deliverable. The Phase 11 `gsd-verifier` will separately write `11-VERIFICATION.md` in the phase 11 folder. Plans must not conflate them.

### Pitfall 4: Drift diagnostics print file content
`generateUnifiedDiff` emits changed lines (`transaction.ts:24-45`), and the CLI writes `formatDriftDiagnostics` directly to stderr, bypassing the `print()` redaction seam (`src/cli.ts:1375-1383`). LIFE-05 probe files must contain only synthetic, non-secret text. Whether this is a SAFE-04 defect is outside LIFE scope. Record it as an observation, not a G-11 gap, unless the phase reproduces a secret actually printed.

### Pitfall 5: Five-harness packed install is heavy and network-bound
Non-Codex targets pull GSD via `npx --yes @opengsd/gsd-core@1.12.0 --<harness> --global` (claude, antigravity, pi) and the Pi bridge via `pi install npm:pi-mcp-adapter@2.31.0`, plus MCP canary fixtures (Phase 10 recorded cold starts of 37-70 s). Stage it: Codex first (mirrors CI), then one probe per additional harness under a time budget. An environmental failure (network, missing auth) is **not** a product gap (D-06). Record it as "not observed" with the output. Seeding GSD `VERSION` files as the tarball test does is legitimate for reconcile evidence. State that in the report.

### Pitfall 6: `plan` vs `install` dry-run
`alpha-aos plan` never prints `CURRENT`. Decide and document which command is "the plan" for LIFE-01 before writing the verdict.

### Pitfall 7: TTY confirmation cannot be driven through `spawnSync` pipes
`process.stdin.isTTY` is false under pipes, so the prompt branch is unreachable that way. Options: (a) on WSL/Linux, `script -qc "node cli.js uninstall --all --apply" /dev/null <<< "n"` gives a pty. The Windows-local packed install lives on the Windows filesystem, so run WSL against a Linux-side sandbox. (b) Accept PARTIAL with the existing non-TTY refusal test and name the gap. Research did not execute (a). [ASSUMED: `script(1)` is available in the WSL Arch distro]

### Pitfall 8: Sandbox cleanup on Windows
Use `rm(..., { maxRetries: 10, retryDelay: 50 })` as the tarball test does. Harness child processes can hold handles.

### Pitfall 9: The dist build must match HEAD
Run `npm run build` (includes `build-artifact.mjs write`) before every suite or pack run, and record `git rev-parse HEAD` in each transcript.

## Code Examples

### Suite re-run (verbatim command that passed this session)
```bash
npm run build && node scripts/run-tests.mjs --files dist/test/lifecycle.test.js dist/test/status.test.js dist/test/recovery-receipt.test.js dist/test/repair.test.js dist/test/rollback.test.js dist/test/uninstall.test.js
# ℹ tests 33 / pass 33 / fail 0 (this session)
```
Add `dist/test/transaction.test.js dist/test/isolation.test.js dist/test/update.test.js dist/test/canary.test.js` for the supporting oracles cited above. Add `dist/test/tarball-fixture.test.js` for the packed lifecycle; it needs network for `ecc-universal` unless cached.

### Stronger zero-subprocess probe (CLI level)
```js
// probe-preload.mjs — load with: node --import ./probe-preload.mjs <cli.js> status --json
import cp from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { appendFileSync } from "node:fs";
for (const m of ["spawn", "spawnSync", "exec", "execSync", "execFile", "execFileSync", "fork"]) {
  const orig = cp[m];
  cp[m] = (...a) => { appendFileSync(process.env.PROBE_LOG, `${m}\n`); return orig(...a); };
}
syncBuiltinESMExports(); // makes ESM named imports observe the patch
// likewise wrap globalThis.fetch and net.connect for the "offline" clause
```
[ASSUMED: `syncBuiltinESMExports` propagates to named ESM imports of `node:child_process` evaluated after the preload. Confirm with a positive control, i.e. a command known to spawn, such as `doctor`, must log entries.]

### CI log corroboration
```bash
gh run view --job 107044319963 --log | grep -E "\(LIFE-0[1-8]|packed release completes"   # windows-latest
```

## Record Updates (Wave 2)

- `.planning/MILESTONES.md:13`: keep the line verbatim. Append a dated sub-bullet: `2026-09-23 — Narrowed to G-11-… (or Closed): see .planning/milestones/v0.1.0-phases/06-.../06-VERIFICATION.md. The windows-latest lifecycle red half was resolved in Phase 10 (.planning/debug/ci02-windows-alpha-aos-host-leak.md, .planning/phases/10-three-os-ci-baseline/CI_RUN.md run 35818198049).` Line 15 (the CI red line) mentions the same Windows failure. Consider a matching note there, noting it is Phase 10's to close.
- `.planning/milestones/v0.1.0-REQUIREMENTS.md:77-84` checkboxes (flip only VERIFIED) and `:179-186` status cells.
- `.planning/milestones/v0.1.0-ROADMAP.md:416`: the Phase 6 "Plans" line currently says "Verification complete (2026-09-18)". That is a stale claim with no report behind it. Add the link and correct the wording.
- `.planning/REQUIREMENTS.md:25-27` `## Future Requirements`: append `- **G-11-N** (LIFE-0X): <one line>` entries in the existing `**REL-02 / G-07-2**:` style.
- LIFE-09 traceability row (`REQUIREMENTS.md`) → Complete at phase close (D-16).
- The report must contain an explicit "Phase 13 gating: BLOCKED/NOT BLOCKED" line (D-08).

## State of the Art
Not applicable (internal verification of an existing codebase; no external ecosystem shifts are relevant).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `syncBuiltinESMExports()` in an `--import` preload makes later ESM named imports of `node:child_process` see patched functions | Code Examples | Zero-subprocess probe gives a false negative. Mitigate with a positive control |
| A2 | `script(1)` is available in the WSL Arch distro for a pty probe | Pitfall 7 | TTY clause stays PARTIAL |
| A3 | A five-harness packed install is feasible on this host within a reasonable time budget | Pitfall 5 | LIFE-01/03 coverage limited to Codex. Record as not observed, not as a gap |
| A4 | Predicted verdicts (per LIFE section) | Evidence Map | These are leads. The phase's own evidence decides |

## Open Questions (RESOLVED)

1. **Which command is "the plan" for LIFE-01?** `install` (dry-run) reports `CURRENT`; `plan` never does. Recommendation: treat `install` without `--apply` as the plan (it is what D-15 of Phase 6 names), and record the static `plan` command as an observation. Raise it as a gap only if the user-facing docs point users to `plan` for this.
   - **RESOLVED (plans 11-01, 11-03):** `install` without `--apply` is "the plan". Plan 11-01 adopts it as a must-have truth and records the static `plan` table as `CHECK life01.plan-command-static` OBSERVED plus a docs scan `CHECK life01.plan-command-docs`; plan 11-03 carries the decision into `LIFE-01-findings.md` and raises a gap candidate only if the docs check finds a line telling users to run `alpha-aos plan` for reconcile state.
2. **Is a `failed` journal "interrupted"?** Recommendation: attempt a real reproduction (a transaction failure whose compensating rollback hits drift). If reproduced, record it under LIFE-06. Otherwise keep it as a lead.
   - **RESOLVED (plan 11-06):** resolved by rule. A `failed` journal counts as "interrupted" under LIFE-06 only if a real CLI command path produces it with target bytes matching neither the pre- nor the post-state. Plan 11-06 makes at most two bounded reproduction attempts (`CHECK life06.p6.real-failed-journal`); without a reproduction the behavior stays a lead with the synthetic observation `CHECK life06.p6.synthetic` recorded, and `LIFE-06-findings.md` states the rule.
3. **Which project-pack removal route does LIFE-03 judge?** Both exist. Recommendation: judge both. The approve route can evidence "remove a project pack"; `uninstall --project` still violates LIFE-04's "only".
   - **RESOLVED (plan 11-04):** both routes are judged. Plan 11-04 evidences "remove a project pack" through the approve route (`project status` removal digest, then `project approve <p> --plan-digest <removal-digest> --apply`, `CHECK life03.pack.approve-route`) and through `uninstall --project <p>`, which is also judged for the unrelated-user-resources clause (`CHECK life03.project.user-file-kept`). A defect on the `uninstall --project` route that also fails LIFE-04's "only" clause is kept as its own LIFE-03 candidate cross-referencing the LIFE-04 key (the adjacency rule plans 11-04 and 11-05 share), and plan 11-07 assigns one gap id per failed clause.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | everything | ✓ | v24.13.1 | — |
| npm | pack/sandbox install | ✓ | 11.8.0 | — |
| git (Git Bash) | fixture checkout for LIFE-08 | ✓ | /mingw64/bin/git | — |
| gh | CI log corroboration | ✓ | 2.100.0 (logs for run 35818198049 retrievable) | cite CI_RUN.md tables |
| codex | discovery, Codex target | ✓ | on PATH | — |
| claude | Claude target (file level only) | ✓ | on PATH | file-level only per D-10 |
| pi | discovery, Pi bridge | ✓ | on PATH | — |
| hermes | Hermes target, handoff canary | ✓ | 0.21.3 (from canary output) | — |
| agy (Antigravity) | Antigravity target | ✓ (`agy`; no `antigravity` command) | — | — |
| WSL | optional pty probe | ✓ | Arch (running), docker-desktop | PARTIAL for the TTY clause |
| Network (npm registry) | ECC install, GSD npx, `update --check` | assumed | — | host npm cache (`--prefer-offline`) |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `node:test` + `node:assert/strict` (Node 24) |
| Config file | `tsconfig.json`, `package.json` |
| Quick run command | `npm run build && node scripts/run-tests.mjs --files dist/test/<file>.test.js` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| LIFE-09 | Report exists with 8 verdicts, every non-VERIFIED clause has a G-11 id with a reproduction | doc check | `grep -cE "^\| LIFE-0[1-8]" 06-VERIFICATION.md` + grep for `G-11-` in both the report and REQUIREMENTS.md | ❌ Wave 2 |
| LIFE-01 (oracle) | packed second reconcile: all `CURRENT`, byte-identical sandbox | integration | extend `test/tarball-fixture.test.ts` (pass-only, D-12) | ✅ partial |
| LIFE-05/08 (oracle) | packed rollback restore/refusal; update preview fingerprint | integration | new `test/lifecycle-verification.test.ts` (if passing) | ❌ Wave 1 |

### Sampling Rate
- Per task: the quick command for touched test files, plus `npm run check`.
- Per wave: `npm test` (must stay green; failing probes never land in `test/`).
- Phase gate: full suite green; the D-17 verifier re-runs a sample of the cited commands.

### Wave 0 Gaps
- [ ] Export `fingerprintManifest`/`hostSnapshot`/`describeHostDrift` (or a sandbox-root variant) from `test/tarball-fixture.test.ts` for reuse.
- [ ] Evidence directory and transcript naming convention.

## Security Domain

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no (harness auth must merely be preserved; judged under LIFE-03) | — |
| V3 Session Management | no | — |
| V4 Access Control | yes (root-bounded removal) | `applyFileTransaction` allowed roots, path proofs |
| V5 Input Validation | yes (journals, receipts) | schema validation (`validateManagedDocument`) |
| V6 Cryptography | yes (hash oracles only) | `node:crypto` SHA-256. Never hand-roll |
| V7 Error/Logging | yes | evidence redaction: hashes, sizes, paths only |

| Threat | STRIDE | Mitigation in this phase |
|--------|--------|--------------------------|
| Secret leaks into committed evidence (config diffs, env dumps) | Information disclosure | Synthetic non-secret fixture content; never paste config bodies; alias temp paths; no `env` dumps |
| Probe mutates real host state | Tampering | `hostSnapshot` before/after every packed probe; `ALPHA_AOS_STATE_DIR` always set; scratch project for canary |
| Red probe committed to `main` | Denial of service (CI) | D-12: failing reproductions live only in transcripts or scratch |

## Sources

### Primary (HIGH confidence, read or executed this session)
- `src/core/uninstall.ts`, `status.ts`, `repair.ts`, `recovery-receipt.ts`, `transaction.ts`, `doctor.ts`; `src/cli.ts:400-524, 770-1134, 1260-1470`; `src/core/install.ts:700-878`; `src/core/update.ts:1-60`; `src/core/isolation.ts:661-690`; `src/core/mcp.ts:105-113, 296-314`; `src/core/catalog.ts:163-184`
- `test/lifecycle|status|uninstall|rollback|repair|recovery-receipt|tarball-fixture.test.ts`; `test/canary.test.ts:374-425`; `test/update.test.ts:175-235`
- Executed: Phase 6 suite run (33/33), `alpha-aos plan`, `doctor --discovery`, `doctor --canary --no-spend`, lead probes P1-P7, `gh run view --job 107044319989 --log`, `git diff 35d4c15 HEAD`
- `.planning/debug/ci02-windows-alpha-aos-host-leak.md`, `.planning/phases/10-three-os-ci-baseline/CI_RUN.md`, `10-VERIFICATION.md` (format), Phase 6 CONTEXT/VALIDATION/SUMMARY files

### Tertiary (LOW)
- Node `syncBuiltinESMExports` semantics (A1), from training knowledge.

## Metadata

**Confidence breakdown:**
- Evidence inventory / oracle audit: HIGH. Every source was read and the key behaviors were executed.
- Predicted verdicts: MEDIUM. They are leads by design (D-06).
- Probe feasibility (five harnesses, pty): MEDIUM/LOW. Not executed during research.

**Research date:** 2026-09-23
**Valid until:** as long as `src/` is unchanged. Re-check `git diff 35d4c15 HEAD -- src test scripts` before citing CI evidence.
