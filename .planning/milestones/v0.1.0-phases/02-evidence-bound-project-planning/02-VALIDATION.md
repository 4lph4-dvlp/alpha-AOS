---
phase: "2"
slug: "evidence-bound-project-planning"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-09-07"
---

> **Provenance:** the Per-Task Verification Map, the Wave 0 Requirements answer, and the Manual-Only
> Verifications table below were populated by `/gsd-plan-phase`'s revision pass on 2026-09-07, read
> directly out of the ten committed `02-NN-PLAN.md` files. They are derived data, not a sign-off.
> `/gsd-validate-phase` §6 still owes this phase its validation: `status` remains `draft`,
> `nyquist_compliant` remains `false`, the Validation Sign-Off boxes remain unchecked, and
> **Approval** remains `pending`. Do not read a populated map as a validated phase.

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `node:test` (Node built-in runner) via `scripts/run-tests.mjs` over compiled `dist/test/*.test.js` |
| **Config file** | `tsconfig.json` (compile) + `scripts/run-tests.mjs` (runner); no separate test-framework config |
| **Quick run command** | `npm run check && npm run build && node --test dist/test/<file>.test.js` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~60 seconds (full suite, includes `npm run build`) |

**Baseline at phase start:** 208 tests (`pass 203, fail 0, skipped 5`) — confirmed by the researcher this session. Any Phase 2 plan must raise the total above 208.

---

## Sampling Rate

- **After every task commit:** Run `npm run check && npm run build && node --test dist/test/<task's test file>.test.js`
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green (`fail 0`, total > 208)
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

<!-- Populated by plan-phase's revision pass from the ten committed PLAN.md files.
     Selection rule where a task declares several <automated> commands: the first one that
     EXECUTES TESTS; where a task has no test-executing command, its first <automated>.
     28 implementation tasks are listed. The 29th task in the phase, `02-03` Task 1, is a
     gate="blocking-human" checkpoint and appears in Manual-Only Verifications instead. -->

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 02-01-T1 | 02-01 | 1 | DETC-01, DETC-02, DETC-04 | T-02-01, T-02-06, T-02-08, T-02-10 | Single canonical root survives symlink aliasing; strict YAML load; duplicate-key-rejecting JSON; output via redaction seam | integration (tracer, CLI-spawning) | `npm run check && npm run build && node --test dist/test/project-plan.test.js` | ❌ new — created by this task | ⬜ pending |
| 02-01-T2 | 02-01 | 1 | DETC-04 | T-02-11 | `project plan` enrolled in the SAFE-01 preview enumeration, so writing any byte fails the tracer | integration (preview tracer) | `npm run check && npm run build && node --test dist/test/preview.test.js` | ✅ tracked | ⬜ pending |
| 02-02-T1 | 02-02 | 2 | DETC-03 | T-02-05 | Content-match patterns declared in repository-owned YAML, never read from the scanned project | unit | `npm run check && npm run build && node --test dist/test/pack-catalog.test.js` | ❌ new — created by this task | ⬜ pending |
| 02-02-T2 | 02-02 | 2 | DETC-03 | T-02-07, T-02-12 | Alias-capped YAML route; evidence nesting bounded at 4 explicit `$defs` levels, no `$ref` cycle | unit | `npm run check && npm run build && node --test dist/test/pack-catalog.test.js` | ⚠️ extended by this task (created 02-02-T1) | ⬜ pending |
| 02-02-T3 | 02-02 | 2 | DETC-03 | T-02-13, T-02-14 | Duplicate id / undeclared fact refuse at load; issues report `string(length=N)` and never the value | unit | `npm run check && npm run build && node --test dist/test/pack-catalog.test.js` | ⚠️ extended by this task (created 02-02-T1) | ⬜ pending |
| 02-03-T2 | 02-03 | 2 | DETC-01 | T-02-SC | Approved `dist.integrity` re-verified before it is written; exact pin; no lifecycle script | maintainer gate (registry read) | `npm view ignore@7.0.5 name version dist.integrity scripts --json` | n/a — no test file (registry gate) | ⬜ pending |
| 02-03-T3 | 02-03 | 2 | DETC-01 | T-02-05, T-02-15, T-02-16 | Byte and pattern caps on `.gitignore`; `undecidable` propagates; no subprocess on the ignore path | unit (real fixtures) | `npm run check && npm run build && node --test dist/test/ignore-list.test.js` | ❌ new — created by this task | ⬜ pending |
| 02-04-T1 | 02-04 | 2 | DETC-04 | T-02-17 | Global sync tuple provably stays at three; pack skills cannot reach a global skill root | unit | `npm run check && npm run build && node --test dist/test/ecc-skills.test.js` | ✅ tracked | ⬜ pending |
| 02-04-T2 | 02-04 | 2 | DETC-04 | T-02-09, T-02-18, T-02-20 | Hashes come only from the integrity-checked `npm pack` fixture; candidate lock never written | maintainer script (`check` mode) | `node scripts/pin-pack-skills.mjs check` | n/a — no test file (script gate) | ⬜ pending |
| 02-04-T3 | 02-04 | 2 | DETC-04 | T-02-17, T-02-19 | Coverage set derived from the catalog at runtime, so a new pack cannot go green vacuously | unit | `npm run check && npm run build && node --test dist/test/catalog.test.js dist/test/ecc-skills.test.js` | ✅ tracked (both) | ⬜ pending |
| 02-05-T1 | 02-05 | 3 | DETC-01 | T-02-21 | All four real `.git` shapes buildable on demand; fixture-local git identity; no network git | unit (fixture self-check) | `npm run check && npm run build && node --test dist/test/evidence.test.js` | ❌ new — created by this task (with `test/helpers/git-fixture.ts`) | ⬜ pending |
| 02-05-T2 | 02-05 | 3 | DETC-01 | T-02-01, T-02-04, T-02-15 | Every read path boundary-proven; `(device, inode)` visited set; three named bounds reported, never silently truncating | unit (real fixtures, skip-aware) | `npm run check && npm run build && node --test dist/test/evidence.test.js` | ⚠️ extended by this task (created 02-05-T1) | ⬜ pending |
| 02-05-T3 | 02-05 | 3 | DETC-01 | T-02-02, T-02-06 | Declared workspace members boundary-proven BEFORE they are read; `["../../.."]` reported and dropped | unit (five ecosystems) | `npm run check && npm run build && node --test dist/test/evidence.test.js` | ⚠️ extended by this task (created 02-05-T1) | ⬜ pending |
| 02-06-T1 | 02-06 | 4 | DETC-02 | T-02-03, T-02-05, T-02-22, T-02-23 | `fileContent` return type has no text field; per-file byte caps; non-ENOENT errno ⇒ `UNDECIDABLE` | unit (real files) | `npm run check && npm run build && node --test dist/test/evidence.test.js` | ⚠️ extended by this task (created 02-05-T1) | ⬜ pending |
| 02-06-T2 | 02-06 | 4 | DETC-02 | T-02-24 | Envelope validates against the sealed schema; total ordering; `createdAt` excluded by construction | unit + schema validation | `npm run check && npm run build && node --test dist/test/evidence.test.js dist/test/validation.test.js` | ⚠️ extended (evidence) / ✅ tracked (validation) | ⬜ pending |
| 02-06-T3 | 02-06 | 4 | DETC-02 | T-02-06 | Hardcoded rule engine deleted; strict manifest route survives; strict mode enumerates every consumer | unit + regression | `npm run check && npm run build && node --test dist/test/project.test.js dist/test/project-plan.test.js dist/test/preview.test.js` | ✅ tracked (project, preview) / ⚠️ extended (project-plan) | ⬜ pending |
| 02-07-T1 | 02-07 | 5 | DETC-03 | T-02-27, T-02-14 | No short-circuit, so every failed leaf keeps its reason; a `broad` fact alone never selects a pack | unit | `npm run check && npm run build && node --test dist/test/project-plan.test.js` | ⚠️ extended by this task (created 02-01-T1) | ⬜ pending |
| 02-07-T2 | 02-07 | 5 | DETC-03 | T-02-26, T-02-10 | `MAX_NEAR_MISS_LINES` hard cap with deterministic order; all output via the redaction seam | unit + CLI | `npm run check && npm run build && node --test dist/test/project-plan.test.js` | ⚠️ extended by this task (created 02-01-T1) | ⬜ pending |
| 02-07-T3 | 02-07 | 5 | DETC-03 | T-02-25 | An override is validated against the declared pack set and recorded as evidence, never a silent bypass | unit + schema validation | `npm run check && npm run build && node --test dist/test/project-plan.test.js dist/test/project.test.js dist/test/validation.test.js` | ⚠️ extended (project-plan) / ✅ tracked (project, validation) | ⬜ pending |
| 02-08-T1 | 02-08 | 6 | DETC-04 | T-02-17, T-02-30 | Separate pack-skill lock reader; a missing hash refuses; `executable` recorded as an explicit null | unit | `npm run check && npm run build && node --test dist/test/project-plan.test.js` | ⚠️ extended by this task (created 02-01-T1) | ⬜ pending |
| 02-08-T2 | 02-08 | 6 | DETC-04 | T-02-28, T-02-29 | An unowned target drops its pack; planning reads only; an unproven harness is `unverified` | unit (before/after hash snapshot) | `npm run check && npm run build && node --test dist/test/project-plan.test.js dist/test/isolation.test.js` | ⚠️ extended (project-plan) / ✅ tracked (isolation) | ⬜ pending |
| 02-08-T3 | 02-08 | 6 | DETC-04 | T-02-24, T-02-03 | One digestable literal in one place; explicit UTF-8 at every hash call; two-run byte-identical gate | unit + CLI determinism gate | `npm run check && npm run build && node --test dist/test/project-plan.test.js` | ⚠️ extended by this task (created 02-01-T1) | ⬜ pending |
| 02-09-T1 | 02-09 | 7 | DETC-05 | T-02-31, T-02-32 | Existing `assertPlanUnchanged` contract; write confined to `.alpha-aos/` under one journaled transaction | unit + transaction | `npm run check && npm run build && node --test dist/test/project-plan.test.js dist/test/transaction.test.js` | ⚠️ extended (project-plan) / ✅ tracked (transaction) | ⬜ pending |
| 02-09-T2 | 02-09 | 7 | DETC-05 | T-02-11, T-02-08 | `--apply` belongs to `approve` alone; preview form registered in the SAFE-01 enumeration | integration (CLI + preview tracer) | `npm run check && npm run build && node --test dist/test/preview.test.js dist/test/project-plan.test.js` | ✅ tracked (preview) / ⚠️ extended (project-plan) | ⬜ pending |
| 02-09-T3 | 02-09 | 7 | DETC-05 | T-02-33, T-02-34 | Concurrent approves serialize on the writer lock; every refusal carries a runnable next step | unit + concurrency | `npm run check && npm run build && node --test dist/test/project-plan.test.js dist/test/transaction-crash.test.js` | ⚠️ extended (project-plan) / ✅ tracked (transaction-crash) | ⬜ pending |
| 02-10-T1 | 02-10 | 8 | DETC-06 | T-02-08, T-02-23 | `status` recomputes evidence rather than trusting the artifact; unreadable ⇒ `UNDECIDABLE`, never `STALE` | unit + schema validation | `npm run check && npm run build && node --test dist/test/project-plan.test.js dist/test/validation.test.js` | ⚠️ extended (project-plan) / ✅ tracked (validation) | ⬜ pending |
| 02-10-T2 | 02-10 | 8 | DETC-06 | T-02-22, T-02-15, T-02-24 | Byte-capped offline git-context read, no subprocess; branch/commit in no digest | unit (git fixtures) | `npm run check && npm run build && node --test dist/test/project-plan.test.js` | ⚠️ extended by this task (created 02-01-T1) | ⬜ pending |
| 02-10-T3 | 02-10 | 8 | DETC-06 | T-02-35, T-02-11 | Stale evidence never auto-deletes; removal executes only through the approve digest contract | unit + preview tracer | `npm run check && npm run build && node --test dist/test/project-plan.test.js dist/test/preview.test.js` | ⚠️ extended (project-plan) / ✅ tracked (preview) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

**Sampling continuity:** every one of the 28 implementation tasks carries an `<automated>` command, so
there is no run of consecutive tasks without automated feedback. Two of the 28 (`02-03-T2`, `02-04-T2`)
verify through a registry read and a maintainer script rather than a test file; both are still
automated and both still fail loudly.

---

## Wave 0 Requirements

<!-- Populated by plan-phase's revision pass from the ten committed PLAN.md files. -->

**No task in this phase carries a `MISSING` automated reference.** Every `<automated>` command names a
target that either already exists in the repository or is created by the task that first runs it, so
there is no Wave 0 test-infrastructure debt to discharge before execution begins. The existing
`node:test` + `scripts/run-tests.mjs` infrastructure needs no install and no change.

Five new test artifacts are created inside the wave that first verifies against them — each by the task
that owns it, never by a separate scaffolding step:

- `test/project-plan.test.ts` — created by `02-01` Task 1 (wave 1), then extended by 02-06 through 02-10
- `test/pack-catalog.test.ts` — created by `02-02` Task 1 (wave 2)
- `test/ignore-list.test.ts` — created by `02-03` Task 3 (wave 2)
- `test/evidence.test.ts` — created by `02-05` Task 1 (wave 3), then extended by 02-06
- `test/helpers/git-fixture.ts` — created by `02-05` Task 1 (wave 3), reused by `02-10` Task 2

Seven already-tracked test files are extended rather than created: `test/preview.test.ts`,
`test/catalog.test.ts`, `test/ecc-skills.test.ts`, `test/project.test.ts`, `test/validation.test.ts`,
`test/transaction.test.ts`, `test/transaction-crash.test.ts`. `test/isolation.test.ts` is read-only in
this phase — it is run as a regression guard, not modified.

---

## Manual-Only Verifications

<!-- Populated by plan-phase's revision pass. One entry: the phase's single blocking-human checkpoint. -->

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `02-03` Task 1 — `ignore@7.0.5` package legitimacy gate (`type="checkpoint:human-verify"`, `gate="blocking-human"`) | DETC-01 | The researcher's audit records `ignore` as verdict `SUS` / reason `too-new`, and the package name was identified from training knowledge rather than from official documentation. Registry existence alone does not confer verification, so no automated check can settle it — a human must look at the package. Legitimacy checkpoints are never auto-approvable, and `workflow.auto_advance` does not apply. | 1. Open `https://www.npmjs.com/package/ignore`; confirm the package is `ignore` by `kaelzhang`, the repository link resolves to `github.com/kaelzhang/node-ignore`, the README describes a gitignore-spec pattern matcher, and it is not deprecated. 2. Open `https://github.com/kaelzhang/node-ignore`; confirm it is the real repository, not a fork or typosquat, with a plausible commit history. 3. Confirm version `7.0.5` exists and was published on or about 2025-05-31. 4. Answer **approve** (Task 2 installs and pins `7.0.5`, binding the reviewed `dist.integrity`) or **reject** (Task 2 is skipped; Task 3 builds the bounded in-house fallback, and the summary must record the D-04 fidelity loss for `!` negation and `**` as an accepted limitation, not as an equivalent outcome). |

---

## Validation Sign-Off

<!-- Owned by /gsd-validate-phase §6. Left unchecked deliberately: plan-phase populated the map above
     but cannot sign off on its own plans. -->

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
