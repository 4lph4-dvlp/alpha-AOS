---
phase: 02-evidence-bound-project-planning
verified: 2026-09-09T12:52:15Z
status: passed
score: 5/5 must-haves verified
covered_files:
  - ".github/workflows/pack-skill-drift.yml"
  - ".planning/REQUIREMENTS.md"
  - ".planning/ROADMAP.md"
  - ".planning/phases/02-evidence-bound-project-planning/02-01-PLAN.md"
  - ".planning/phases/02-evidence-bound-project-planning/02-01-SUMMARY.md"
  - ".planning/phases/02-evidence-bound-project-planning/02-02-PLAN.md"
  - ".planning/phases/02-evidence-bound-project-planning/02-02-SUMMARY.md"
  - ".planning/phases/02-evidence-bound-project-planning/02-03-PLAN.md"
  - ".planning/phases/02-evidence-bound-project-planning/02-03-SUMMARY.md"
  - ".planning/phases/02-evidence-bound-project-planning/02-04-PLAN.md"
  - ".planning/phases/02-evidence-bound-project-planning/02-04-SUMMARY.md"
  - ".planning/phases/02-evidence-bound-project-planning/02-05-PLAN.md"
  - ".planning/phases/02-evidence-bound-project-planning/02-05-SUMMARY.md"
  - ".planning/phases/02-evidence-bound-project-planning/02-06-PLAN.md"
  - ".planning/phases/02-evidence-bound-project-planning/02-06-SUMMARY.md"
  - ".planning/phases/02-evidence-bound-project-planning/02-07-PLAN.md"
  - ".planning/phases/02-evidence-bound-project-planning/02-07-SUMMARY.md"
  - ".planning/phases/02-evidence-bound-project-planning/02-08-PLAN.md"
  - ".planning/phases/02-evidence-bound-project-planning/02-08-SUMMARY.md"
  - ".planning/phases/02-evidence-bound-project-planning/02-09-PLAN.md"
  - ".planning/phases/02-evidence-bound-project-planning/02-09-SUMMARY.md"
  - ".planning/phases/02-evidence-bound-project-planning/02-10-PLAN.md"
  - ".planning/phases/02-evidence-bound-project-planning/02-10-SUMMARY.md"
  - ".planning/phases/02-evidence-bound-project-planning/02-11-PLAN.md"
  - ".planning/phases/02-evidence-bound-project-planning/02-11-SUMMARY.md"
  - ".planning/phases/02-evidence-bound-project-planning/02-12-PLAN.md"
  - ".planning/phases/02-evidence-bound-project-planning/02-12-SUMMARY.md"
  - ".planning/phases/02-evidence-bound-project-planning/02-13-PLAN.md"
  - ".planning/phases/02-evidence-bound-project-planning/02-13-SUMMARY.md"
  - ".planning/phases/02-evidence-bound-project-planning/02-14-PLAN.md"
  - ".planning/phases/02-evidence-bound-project-planning/02-14-SUMMARY.md"
  - ".planning/phases/02-evidence-bound-project-planning/02-15-PLAN.md"
  - ".planning/phases/02-evidence-bound-project-planning/02-15-SUMMARY.md"
  - ".planning/phases/02-evidence-bound-project-planning/02-16-PLAN.md"
  - ".planning/phases/02-evidence-bound-project-planning/02-16-SUMMARY.md"
  - ".planning/phases/02-evidence-bound-project-planning/02-REVIEW.md"
  - ".planning/phases/02-evidence-bound-project-planning/02-UAT.md"
  - "catalog/facts.yaml"
  - "catalog/stack.lock.json"
  - "schemas/approved-plan.schema.json"
  - "schemas/fact-vocabulary.schema.json"
  - "schemas/pack-catalog.schema.json"
  - "schemas/project-stack.schema.json"
  - "schemas/receipt.schema.json"
  - "scripts/pin-pack-skills.mjs"
  - "src/cli.ts"
  - "src/core/ecc-fixture.ts"
  - "src/core/evidence.ts"
  - "src/core/ignore-list.ts"
  - "src/core/pack-catalog.ts"
  - "src/core/paths.ts"
  - "src/core/project-plan.ts"
  - "src/core/project.ts"
  - "src/core/redaction.ts"
  - "src/core/validation.ts"
  - "src/format.ts"
  - "src/types.ts"
  - "test/evidence.test.ts"
  - "test/ignore-list.test.ts"
  - "test/pack-catalog.test.ts"
  - "test/project-plan.test.ts"
  - "test/project.test.ts"
  - "test/redaction.test.ts"
  - "test/transaction-crash.test.ts"
  - "test/validation.test.ts"
covered_digest: "v1:sha256:913351ae6832d3677a931cdcc4b2fd930508f58e9f12c034f8ce11db1ffaa564"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  round: 3
  previous_status: human_needed
  previous_score: 5/5
  gaps_closed: []
  gaps_remaining: []
  regressions: []
  human_items_closed:
    - "Canonical-root ladder rung order — RESOLVED (round 2) by narrowing `RootReason` from six declared rungs to four, all four reachable, with the intended order stated at evidence.ts:120-144. `worktree-root` and `submodule-root` were removed because a linked worktree and a submodule both carry a `.git` FILE and therefore answer at `git-root`."
    - "`pin-pack-skills.mjs check` has no home — RESOLVED (round 2) by .github/workflows/pack-skill-drift.yml (weekly cron `17 4 * * 1` + workflow_dispatch, drift fails the run red, no continue-on-error)."
    - "D-13 drift classification at the CLI when no `.alpha-aos/plan.json` exists (ledger #14) — RESOLVED (round 3) by the recorded UAT decision: narrow the must-have truth to callers that hold the reviewed plan value; the preview stays non-persisting so SAFE-01 and D-12 both stand. Decision re-tested against code in this round, not accepted on its write-up. Ledger #14 is now `waived` with that decision as its written reason (commit e63b727)."
  human_items_remaining: []
  history_note: "Round 1 = gaps_found 2/5 (four CR blockers). Round 2 = human_needed 5/5 after gap-closure plans 02-11 … 02-16 closed all four. Round 3 (this report) = passed 5/5 after the one remaining human item was decided in UAT. No source file changed between round 2 and round 3: `git log --since=2026-09-09T02:28:21Z` returns exactly three commits (8e757db, b6ecbcb, e63b727), all touching only `.planning/`."
  fingerprint_note: "Round 2's covered_files included `.planning/WINDOWS.md`, and waiving ledger #14 in e63b727 therefore invalidated its covered_digest and made the report read `stale` — a documentation edit staling a verdict about product code. `.planning/WINDOWS.md` is deliberately OMITTED from this round's covered_files: it is a mutable cross-phase ledger, not a PLAN/SUMMARY, a requirement mapping, or an implementation file, and later phases will keep editing it. `.planning/phases/02-evidence-bound-project-planning/02-UAT.md` is ADDED, because it now carries the load-bearing evidence for the D-13 closure. Digest recomputed via `gsd-tools query verification.fingerprint` over the 65 files listed above."
deferred:
  - truth: "Cross-host Unicode path normalization (macOS NFD vs Linux NFC naming the same file) produces identical digests."
    addressed_in: "Phase 7"
    evidence: "Phase 7 goal: behavior proven against the same frozen bytes on a three-OS matrix. The SAME-host half runs and passes on this Windows host — `two directories named in NFD and NFC form are two scan entries and two digest inputs` executed (not skipped), pass 1 fail 0."
  - truth: "SECURITY_REVIEW can select on detected risk facts rather than rendering as `unimplemented`."
    addressed_in: "Phase 4"
    evidence: "All eight leaves carry `deferredTo: GATE-01`; Phase 4 goal is 'Mandatory GSD Gates'. Re-confirmed at HEAD this round: a live `project plan` emits `UNIMPLEMENTED SECURITY_REVIEW: no detector runs for auth-change, command-execution, payments, public-api, secrets, sensitive-data, trust-boundary, user-input — deferred to GATE-01`."
  - truth: "DETC-06's 'previously installed' covers a pack approved but never materialized."
    addressed_in: "Phase 3"
    evidence: "Phase 3 owns receipt writing, which is the state `reconcileProjectState` reads. Carried as ledger #15, still open by design."
  - truth: "An aliased FILE adds no second path for the file it points at."
    addressed_in: "Phase 7"
    evidence: "Ledger #20. Windows requires elevation for file symlinks; the DIRECTORY half of the same rule runs and passes here. The file half needs a POSIX host or an elevated Windows run — the Phase 7 three-OS matrix."
carried_forward:
  - finding: "src/core/path-boundary.ts:226 records `inode: Number(info.ino)` and `recheckPathProof` compares that double; a Windows file index above 2^53 rounds (measured: 68398419340753788 -> 68398419340753790, ulp 16), so two distinct inodes within one ulp compare equal and a TOCTOU swap can go undetected."
    owner: "NONE — no phase in the current roadmap owns it"
    basis: "Ledger #25, open with a full written rationale. Same root cause 02-13 fixed in evidence.ts `identityKeys` (now `lstat(..., { bigint: true })`). Left open deliberately: path-boundary.ts is Phase 1 code outside 02-13's declared files and `PathProof.inode` is a public `number | null`, so widening it is an interface change needing its own plan. Re-confirmed verbatim at HEAD this round (line 226 unchanged) and confirmed unmodified since round 2 — `git log --since=2026-09-09T02:28:21Z -- src/core/path-boundary.ts` is empty."
    recommendation: "Schedule a plan that widens `PathProof.inode` to a string or bigint. It currently has no home."
  - finding: "A ready-to-paste re-approval command can name a path whose segment has been replaced by a redaction token, so the command as printed does not resolve."
    owner: "NONE — candidate for Phase 6/7"
    basis: "Reproduced again this round on a scratch path containing a UUID-shaped segment: the refusal's next step reads `alpha-aos project approve C:/.../[redacted:secret:6972f7d5167e]/scratchpad/reverify/fxB --plan-digest ... --apply`. Presentation interaction between Phase-1 redaction machinery and the paste-safe command builder. The refusal itself, its exit code and its digests are all correct, and an ordinary repository path never triggers it, so this is not a safety failure and does not block any success criterion."
    recommendation: "Decide in Phase 6/7 whether a redacted path suppresses the runnable-command line rather than emitting an unresolvable one. CI checkout paths and temp dirs do sometimes carry UUIDs."
advisory: []
---

# Phase 2: Evidence-Bound Project Planning Verification Report

**Phase Goal:** Users receive reproducible project-pack decisions and reviewed plans that are bound to one canonical repository state and explain both matches and non-matches.
**Verified:** 2026-09-09T12:52:15Z
**Status:** passed
**Re-verification:** Yes — round 3, after the single remaining human item was decided in UAT

## Why This Round Exists

Round 2 returned `human_needed` at 5/5 truths with exactly one open item: the
D-13 CLI drift-classification question (broken-windows ledger #14). That item
was routed to a human because it was a product decision, not a defect. It has
since been decided and recorded in `02-UAT.md` (status `complete`, 1 test,
1 passed, 0 issues, 0 gaps), and commit `e63b727` flipped ledger #14 from
`open` to `waived` with that decision as its written reason.

Because round 2's `covered_files` included `.planning/WINDOWS.md`, that ledger
edit invalidated its `covered_digest` and the report began reading `stale`.
Nothing about the product changed. This round re-verifies against current HEAD
and emits a fresh fingerprint.

**I did not treat this as a formality.** No source file has changed since round
2, but a scope decision that narrows a must-have truth is exactly the kind of
closure that can be written down correctly and still be wrong about the code.
So I re-tested the decision's premises at the CLI rather than reading its
write-up, and I re-ran all five success criteria as behavior rather than
carrying round 2's verdicts forward on trust.

## Goal Achievement

### Observable Truths

| # | Truth (ROADMAP Success Criterion) | Status | Evidence (all commands run by me in this round) |
|---|---|---|---|
| 1 | Canonical root selected; detection stops at nested repository and worktree boundaries without borrowing from parents, siblings, aliases, or unrelated repos | ✓ VERIFIED | Rebuilt the nested-repository fixture from scratch. Planning the INNER root reports `Project: …/outer/inner (project-declaration)` and `SELECT WEB_REACT: the react package is a declared dependency (package.json)` — it borrows nothing from the parent, which declares `express`. Planning the OUTER root reports `SELECT API: An HTTP server framework is a declared dependency` and excludes the child by name: `EXCLUDED-BOUNDARY inner — git-entry (the directory holds a .git entry, so it is the root of another project)` plus `EXCLUDED-BOUNDARY .git — git-entry`. The boundary holds in both directions, and the exclusion is disclosed rather than silent. |
| 2 | Exact versioned files/deps/entrypoints/config/manifest facts that selected each pack, plus reasons near-matches failed; generic `AGENTS.md` alone never selects an agent-runtime pack | ✓ VERIFIED | On a fixture holding only `AGENTS.md` + a bare manifest: `WHY AGENT_RUNTIME [near-miss] AGENT_RUNTIME: A generic agent-instruction file or skill directory (AGENTS.md) — missing: An agent-orchestration framework is a declared dependency`. Present as evidence, absent from `selected` — the exact clause the criterion names. Positive side on the react fixture: `SELECT WEB_BASE: A directory a browser entrypoint conventionally lives in (src), A browser-facing UI framework is a declared dependency (package.json)`, and `SELECT BROWNFIELD_INIT: … (src), Detected means the conventions document is ABSENT` — a negative fact rendered as a positive reason, which is the honesty property DETC-03 exists for. `SECURITY_REVIEW` renders `UNIMPLEMENTED … deferred to GATE-01` rather than a silent omission. |
| 3 | Repeated detection of unchanged inputs produces stable text and JSON plans exposing scope, owner, exact source version and hash, renderer, target pre-state, adapter support, approvals, safe inverse | ✓ VERIFIED | Two consecutive runs in each mode, compared with `cmp -s`: **TEXT IDENTICAL** and **JSON IDENTICAL**. All nine nouns present as named top-level JSON keys: `scope`, `owner`, `source`, `renderer`, `targetPreState`, `adapterSupport`, `approvals`, `safeInverse` — plus `executable: null` beside a populated `executableDisposition`, `adapterSupportEvidence`, and four digests (`manifestDigest`, `inputsDigest`, `evidenceDigest`, `planDigest`). The diagnostic trio `scanBounds` / `undecidableBoundaries` / `excludedBoundaries` is present in the same envelope, so a bounded scan cannot be mistaken for a complete one. |
| 4 | Applying a reviewed plan is refused if evidence, manifest, stable lock, renderer, executable, adapter capability, or target bytes changed after review | ✓ VERIFIED | **Both branches reproduced end-to-end this round.** WITH a prior artifact: approved `--apply` (exit 0, `.alpha-aos/plan.json` written), removed `react` from the manifest, re-approved with the now-stale digest → **exit 2**, `plan-drift: selection-changed: the pack selection itself changed, so this is a different decision from the one that was reviewed: joined none; left WEB_BASE, WEB_REACT (reviewed 66ab81ed6357, observed b211cd3047f0)`. The artifact's sha256 is **byte-identical before and after** the refusal (`dcfa0e3f…` both times) — the refusal wrote nothing. WITHOUT a prior artifact: **exit 2**, `plan-drift: project-capability-plan changed between review and apply (reviewed f3e685b2c1d0, observed 66ab81ed6357). The reviewed plan value is not available here, so what moved cannot be named; review the current plan again first.` Both branches refuse, both exit 2, both emit a runnable re-approval command. See "The D-13 Decision, Re-Tested" below. |
| 5 | When evidence for an installed pack disappears, the user sees `STALE` with the missing evidence identified and no automatic deletion | ✓ VERIFIED | Behavioral evidence, not presence: the named test `the DETC-06 happy path is unchanged: STALE names the fact, a removal is offered, nothing is deleted` was run in its own process this round — **pass 1, fail 0, skipped 0** (1351ms). That test drives the real built CLI via `runCli` on a hand-built receipt fixture and asserts filesystem state after the fact (`existsSync(target)`, `existsSync(receiptPath)`), so it exercises the deletion invariant rather than a return shape. Round 2 additionally reproduced the same path by hand at the CLI (`STALE DB_POSTGRES 1/1 matching` → `STALE-FACT DB_POSTGRES — the \`postgres-driver\` fact … is gone` → `REMOVAL DB_POSTGRES — 1 target(s). Nothing has been removed.`); `src/core/project-plan.ts` is byte-unchanged since. |

**Score:** 5/5 truths verified (0 present, behavior-unverified)

Every one of the five is behavior-dependent — each asserts a state transition or
a refusal/cleanup invariant — and every one carries either a live command I ran
or a named test I executed. None was upgraded to VERIFIED on symbol presence.

### The D-13 Decision, Re-Tested

The UAT decision narrows must-have truth 4 to callers that hold the reviewed
plan value, and refuses to let the preview persist a reviewed-plan record. That
is a scope decision, so the right check is not "did someone write it down" but
"does the code actually have the shape the decision assumes". Three premises,
each tested:

**Premise 1 — SAFE-01 holds in code: the preview persists nothing.**
Ran `project plan` on a fresh fixture. Exit 0, full plan rendered, trailer
`Preview only. Nothing was written: project plan persists nothing.`
(`format.ts:246`). Directory listing afterwards: `package.json`, `src`, and
nothing else. **No `.alpha-aos/` residue.** Re-checked after the no-artifact
drift refusal on a second fixture — also clean. So the decision's premise that
the preview cannot supply the reviewed plan value is a property of the shipped
code, not an assumption.

**Premise 2 — the un-nameable window is real, bounded, and honest.**
Confirmed the window's shape by reproducing both branches (truth 4 above). The
CLI can only fail to name the moved noun *before a repository's first
approval*. Once `.alpha-aos/plan.json` exists, `project-plan.ts:1862-1863`
falls back to `reviewedPlanFromArtifact(...)` and the refusal names the packs
that joined and left. The window closes permanently after the first approval
and cannot reopen. Critically, the refusal in that window does not guess or
fabricate — it says the value is unavailable and what to do instead.
**ROADMAP criterion 4 says "applying … is refused if … changed". Both branches
refuse, both exit 2. The criterion is met in the narrow window too**; what is
narrowed is diagnostic detail, not the safety guarantee.

**Premise 3 — the named future fix is genuinely out of scope, not a dodge.**
The UAT record points at `ApproveProjectPlanOptions.reviewedPlan` as a future
`--reviewed-plan <file>` flag. Verified: `reviewedPlan` appears at
`project-plan.ts:1533` (the options type) and at `:1862` (the library
consumption path), and `grep -n "reviewedPlan\|reviewed-plan" src/cli.ts`
returns **zero matches**. So it is exactly what the decision claims — a
library-only seam whose exposure is an interface change requiring its own plan,
not a one-line omission someone could have fixed inside this phase.

**Verdict: the recorded reasoning holds against the code.** The decision does
not narrow away any part of ROADMAP criterion 4; it narrows a diagnostic
quality clause that was never in the criterion. Ledger #14 is correctly
`waived` rather than `fixed`, because nothing was patched — a scope question
was answered. Truth 4 is VERIFIED on its own reproduction, not on the waiver.

### Deferred Items

Items not yet met but explicitly addressed in later milestone phases. Carried
forward unchanged from round 2; each re-checked for whether it has since become
actionable in Phase 2 (none has).

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | Cross-HOST Unicode NFD/NFC digest equality | Phase 7 | Three-OS matrix. Same-host half runs and passes on this host. |
| 2 | SECURITY_REVIEW risk-fact detectors | Phase 4 | All eight leaves carry `deferredTo: GATE-01`; re-confirmed this round in live output rendering as `UNIMPLEMENTED … deferred to GATE-01`. |
| 3 | "Previously installed" for an approved-but-never-materialized pack | Phase 3 | Phase 3 owns receipt writing; ledger #15, open by design. |
| 4 | Aliased FILE adds no second path | Phase 7 | Ledger #20. Directory half runs and passes; file half needs POSIX or elevated Windows. |

### Carried Forward — Not This Phase's Failure

| # | Item | Owner | Disposition |
|---|------|-------|-------------|
| 1 | `path-boundary.ts:226` `inode: Number(info.ino)` rounds 64-bit Windows file indices, so `recheckPathProof` can miss a TOCTOU swap within one ulp | **NONE** | Ledger #25, open with a complete written rationale. Line 226 re-read verbatim at HEAD this round and is unchanged; `git log --since=2026-09-09T02:28:21Z -- src/core/path-boundary.ts` is empty, so it is not a regression of this round either. 02-13 correctly fixed the same class in `evidence.ts identityKeys` and correctly declined to widen the public `PathProof.inode` type outside its declared scope. **This still needs a plan; no phase has one.** |
| 2 | A paste-ready re-approval command can carry a redacted path segment and therefore not resolve | **NONE** (Phase 6/7 candidate) | Reproduced again this round. Presentation interaction, not a safety failure: the refusal, exit code and digests are all correct and an ordinary repository path never triggers it. Promoted from a round-2 anti-pattern Warning into `carried_forward` so it is not lost when this report is superseded. |

### Advisory (New Scope, Unevidenced)

None. I raised no new-scope concern this round that lacks a reproduction, so
nothing was downgraded to advisory. The `advisory:` list is empty because it
was checked and found empty, not because it went unchecked.

### Required Artifacts

Re-verified at HEAD. Every artifact below is byte-unchanged since round 2 (no
source commit exists in the interval), so this is a regression check rather
than a re-derivation; the ones load-bearing for the five truths were
additionally re-exercised by command.

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `src/core/evidence.ts` | Boundary walk, canonical root, six detector kinds, alias exclusion, scan bounds | ✓ VERIFIED | Boundary exclusion re-exercised live this round (`EXCLUDED-BOUNDARY inner — git-entry`, `EXCLUDED-BOUNDARY .git — git-entry`); root ladder reports `project-declaration` on both fixtures; unchanged since round 2 |
| `src/core/project-plan.ts` | Plan envelope, approval, reconciliation, strict artifact read | ✓ VERIFIED | Drift classification re-exercised in both branches; `reviewedPlan` seam confirmed library-only at `:1533` / `:1862`; DETC-06 named test green |
| `src/format.ts` | Renderer for bounds, undecidable paths, dropped members, boundary exclusions, host notes | ✓ VERIFIED | `EXCLUDED-BOUNDARY` observed under `--why`; SAFE-01 trailer at `:246` observed verbatim in live output |
| `src/core/paths.ts` `RootKeyedCache` | Root-keyed, bounded process cache | ✓ VERIFIED | Unchanged; consumed by five caches; determinism across repeated runs is its observable consequence and was measured (TEXT/JSON IDENTICAL) |
| `src/core/ignore-list.ts` | Ignore membership without git, honest caps | ✓ VERIFIED | Unchanged; `IGNORE_PATTERN_COUNT_CAP` boundary behaviour proven in round 2 at 5000/5001; escaped-`#` handling cross-checked against real `git check-ignore` |
| `src/core/redaction.ts` + `src/cli.ts` | UTF-8 byte budget, no truncated success | ✓ VERIFIED | Unchanged; redaction observed active in live output (and see carried-forward item 2 for its presentation cost) |
| `schemas/approved-plan.schema.json` | Closed contract for the one committed managed document | ✓ VERIFIED | `a well-formed approved-plan artifact validates as a closed current document`, `the approved-plan schema admits the two shapes plan 02-15 introduces`, and `each reproduced approved-plan poisoning is refused with a stable code` all green in this round's suite run |
| `.github/workflows/pack-skill-drift.yml` | A scheduled home for the catalog/lock drift check | ✓ VERIFIED | Weekly `17 4 * * 1` + `workflow_dispatch`, drift fails red, no `continue-on-error` |
| `scripts/pin-pack-skills.mjs` | Maintainer pinning script | ✓ VERIFIED | Caller at `pack-skill-drift.yml:56` |
| `.planning/phases/…/02-UAT.md` | Recorded resolution of the one round-2 human item | ✓ VERIFIED | `status: complete`, total 1 / passed 1 / issues 0 / gaps 0, with the decision text and its reproduction record; premises independently re-tested above |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `project approve` (no artifact) | honest un-nameable refusal | digest comparison only | ✓ WIRED | exit 2 + `The reviewed plan value is not available here, so what moved cannot be named` |
| `project approve` (artifact present) | `reviewedPlanFromArtifact` → named drift | `project-plan.ts:1862-1863` | ✓ WIRED | exit 2 + `selection-changed: … left WEB_BASE, WEB_REACT` |
| `ApproveProjectPlanOptions.reviewedPlan` | CLI surface | **deliberately absent** | ✓ WIRED (as designed) | `grep reviewedPlan src/cli.ts` → zero matches; the library seam is not exposed, which is what makes the D-13 narrowing a real scope boundary |
| `project plan` | filesystem | **must write nothing** | ✓ WIRED (prohibition) | No `.alpha-aos/` after preview on two fresh fixtures |
| `evidence.ts excludedBoundaries` | `--why` renderer | `plan.excludedBoundaries` | ✓ WIRED | Two `EXCLUDED-BOUNDARY` lines observed on the outer-root fixture |
| `evidence.ts` boundary walk | pack selection isolation | canonical root pin | ✓ WIRED | Inner root selects `react`, never `express`; outer root selects `API`, excludes `inner` |
| `readApprovedProjectPlan` | `validation.ts validateManagedDocument` | strict route | ✓ WIRED | `each reproduced approved-plan poisoning is refused with a stable code` green in the suite |
| `scripts/pin-pack-skills.mjs check` | scheduled CI caller | workflow step | ✓ WIRED | `pack-skill-drift.yml:56` |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|---|---|---|---|---|
| plan `source[]` | pack skill version + hash | `catalog/stack.lock.json` | Yes — resolved offline; verified in round 2 down to `2.2.0` / `sha512-jk3Zedc7…` / `14e7b204…` | ✓ FLOWING |
| plan `evaluations[]` / `selected` | leaf results | live evidence envelope | Yes — flipped with fixture content on every fixture I built this round (`react` present → `WEB_REACT` selected; removed → `left WEB_BASE, WEB_REACT`) | ✓ FLOWING |
| plan `targetPreState` | per-target harness/state/action | filesystem probe | Yes — 12 rows across three harnesses, all `absent` / `create` on a fresh fixture | ✓ FLOWING |
| plan `adapterSupport` | five harnesses | `catalog/stack.yaml` harness table | Yes — with per-harness basis strings, e.g. `antigravity unsupported: no project-local skill root is enumerated …` | ✓ FLOWING |
| plan `excludedBoundaries` | path / reason / detail | boundary walk | Yes — `inner/git-entry`, `.git/git-entry` observed | ✓ FLOWING |
| plan `planDigest` | canonical plan hash | `digestablePlan` | Yes — stable across repeated runs, and moved when and only when the manifest changed (`f3e685b2…` → `66ab81ed…` on path change, `66ab81ed…` → `b211cd30…` on dependency removal) | ✓ FLOWING |
| approval artifact bytes | `.alpha-aos/plan.json` | `project approve --apply` | Yes — written on success, sha256 byte-identical across a subsequent refusal | ✓ FLOWING |

### Behavioral Spot-Checks

All commands run by me in this round's own process, against fixtures built from
scratch. Nothing in this table is carried over.

| Behavior | Command | Result | Status |
|---|---|---|---|
| Build is green at HEAD | `npm run build` | exit 0; 65 inputs, 124 outputs | ✓ PASS |
| Full suite (run once) | `npm test` | **tests 470, pass 464, fail 0, skipped 6**, 206s | ✓ PASS |
| SAFE-01: preview persists nothing | `project plan <fx>` then list | exit 0, 1 plan rendered, `Preview only. Nothing was written`, **no `.alpha-aos/`** | ✓ PASS |
| Criterion 3: text determinism | 2× `project plan`, `cmp -s` | **TEXT IDENTICAL** | ✓ PASS |
| Criterion 3: JSON determinism | 2× `project plan --json`, `cmp -s` | **JSON IDENTICAL** | ✓ PASS |
| Criterion 3: nine nouns | top-level JSON key inspection | `scope, owner, source, renderer, targetPreState, adapterSupport, approvals, safeInverse` + `executable: null` + `executableDisposition` + 4 digests | ✓ PASS |
| Criterion 2: AGENTS.md never selects | `project plan <AGENTS.md-only> --why` | `[near-miss] AGENT_RUNTIME … missing: An agent-orchestration framework is a declared dependency`; not selected | ✓ PASS |
| Criterion 1: nested repo, inner root | `project plan <outer>/inner` | roots at `inner`; `SELECT WEB_REACT`; no `express` borrowed from parent | ✓ PASS |
| Criterion 1: nested repo, outer root | `project plan <outer> --why` | `SELECT API`; `EXCLUDED-BOUNDARY inner — git-entry (… the root of another project)` | ✓ PASS |
| Criterion 4: approve --apply happy path | `project approve <fxB> --plan-digest 66ab81ed… --apply` | exit 0; `.alpha-aos/plan.json` written; `Only .alpha-aos/plan.json was written; project source … stay read-only inputs` | ✓ PASS |
| Criterion 4: drift WITH prior artifact | remove `react`, re-approve stale digest | **exit 2**, `selection-changed … left WEB_BASE, WEB_REACT (reviewed 66ab81ed6357, observed b211cd3047f0)` | ✓ PASS |
| Criterion 4: refusal writes nothing | sha256 of `plan.json` before/after refusal | `dcfa0e3fc182…` **byte-identical** | ✓ PASS |
| Criterion 4: drift WITHOUT prior artifact | fresh fixture, stale digest | **exit 2**, honest `… what moved cannot be named; review the current plan again first`; no `.alpha-aos/` created by the refusal | ✓ PASS |
| D-13 premise: `reviewedPlan` is library-only | `grep -n "reviewedPlan\|reviewed-plan" src/cli.ts` | **zero matches**; present only at `project-plan.ts:1533` / `:1862` | ✓ PASS |
| Criterion 5 (named test) | `node --test --test-name-pattern="the DETC-06 happy path is unchanged: STALE names the fact, a removal is offered, nothing is deleted" dist/test/project-plan.test.js` | **pass 1, fail 0, skipped 0** | ✓ PASS |
| Debt-marker gate | `grep -rn "TBD\|FIXME\|XXX"` over `src/ catalog/ schemas/ scripts/ test/ .github/` | **zero matches** | ✓ PASS |
| Debt-marker gate (warning tier) | same for `TODO\|HACK\|PLACEHOLDER` | **zero matches** | ✓ PASS |
| No source changed since round 2 | `git log --since=2026-09-09T02:28:21Z --name-only` | 3 commits, files touched: `.planning/WINDOWS.md`, `.planning/ROADMAP.md`, `02-UAT.md`, `02-VERIFICATION.md` only | ✓ PASS |
| Working tree clean | `git status --porcelain` | only untracked `.gsd/` and `.planning/milestone.lock` | ✓ PASS |

### Probe Execution

| Probe | Command | Result | Status |
|---|---|---|---|
| — | — | No `scripts/*/tests/probe-*.sh` exists and no PLAN declares one. The project's runnable check is `npm test` / `node scripts/run-tests.mjs`, which I ran once (470/464/0/6). | ? SKIP |

### Requirements Coverage

Every requirement ID declared in PLAN frontmatter was collected and
cross-referenced against `.planning/REQUIREMENTS.md`.

| Requirement | Source Plans | Description | Status | Evidence |
|---|---|---|---|---|
| DETC-01 | 02-01, 02-03, 02-05, 02-11, 02-13 | Canonical root; detection stops at boundaries | ✓ SATISFIED | Nested-repository isolation reproduced in both directions this round |
| DETC-02 | 02-01, 02-06, 02-12, 02-13, 02-16 | Positive versioned evidence per selected pack | ✓ SATISFIED | Named facts with their source file in every `SELECT` line; lock-resolved version/integrity/sha256 |
| DETC-03 | 02-02, 02-07, 02-11, 02-12, 02-13 | Why a near-match failed; `AGENTS.md` cannot activate agent-runtime | ✓ SATISFIED | Near-miss clause reproduced verbatim; boundary exclusions disclosed rather than rendered as non-existence |
| DETC-04 | 02-01, 02-04, 02-08, 02-12, 02-15, 02-16 | Stable text and JSON plans with nine nouns | ✓ SATISFIED | Byte-identical in both modes; all nine nouns present as named keys |
| DETC-05 | 02-09, 02-14, 02-15 | Refuse apply after any watched noun changed | ✓ SATISFIED | Both drift branches exit 2; approved artifact byte-unchanged across the refusal |
| DETC-06 | 02-10, 02-14 | `STALE` on disappeared evidence, no auto-deletion | ✓ SATISFIED | Named end-to-end CLI-driving test green in its own process |

**Orphaned requirements:** none. `.planning/REQUIREMENTS.md` maps exactly
DETC-01 … DETC-06 to Phase 2 (lines 135-140); all six are claimed by plan
frontmatter across the 16 plans; all six read `Complete` at lines 27-32 and
`Complete` in the traceability table. No requirement mapped to Phase 2 is
unclaimed by a plan, and no plan claims an ID outside the phase's declared set.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|---|---|---|---|---|
| `src/`, `catalog/`, `schemas/`, `scripts/`, `test/`, `.github/` | — | Debt markers `TBD` / `FIXME` / `XXX` / `TODO` / `HACK` / `PLACEHOLDER` | ℹ️ Info | **Zero found**, re-scanned this round. The debt-marker gate passes cleanly. |
| `.planning/WINDOWS.md` | entries 16, 19 | Round-2 Warning: fixed blockers still recorded `open` | ✅ RESOLVED | Both now read `status: fixed` with `resolved_at` 2026-09-09T02:33Z (commit `8e757db`). Phase 3 will no longer inherit two phantom live blockers. |
| `.planning/ROADMAP.md` | 138 | Round-2 Warning: stale count `0/6 executed` | ✅ RESOLVED | Now reads `16/16 plans executed; 6 gap-closure plans added (02-11 … 02-16), 6/6 executed`. |
| `.planning/ROADMAP.md` | 311 | Phase 2 status still `In Progress` | ℹ️ Info | Expected: the status table flips on ship, after this verification passes. Not a gap — flagging so the orchestrator's `update_roadmap` step is not skipped. |
| `src/core/project-plan.ts` `approvalCommand` × `src/core/redaction.ts` | — | Paste-safe command can name a redacted, unresolvable path | ⚠️ Warning | Reproduced again. Promoted to `carried_forward` (item 2) so it survives this report being superseded. Not goal-blocking: refusal, exit code and digests are all correct and an ordinary repository path never triggers it. |
| `src/core/path-boundary.ts` | 226 | 64-bit inode narrowed to a double | ⚠️ Warning (carried forward) | Ledger #25, open with rationale. Unmodified since round 2; unowned by any phase. |
| `test/transaction-crash.test.ts` | — | Windows teardown flake | ℹ️ Info | Ledger #26, open. Did not manifest in this round's full-suite run (0 failures). |

**Re-verification evidence gate applied.** Every finding above carries either a
reproduction from this round or an unchanged-since-round-2 confirmation, so
none was downgraded to advisory for lack of evidence and none was inflated into
a blocker it cannot support. No finding is a 🛑 Blocker: none prevents any of
the five success criteria, all five of which I verified by direct execution.
Two round-2 Warnings are now resolved by the intervening documentation commits;
I confirmed both by reading the current files, not by trusting the commit
messages.

### Prohibitions

| Prohibition | Status | Evidence (this round unless noted) |
|---|---|---|
| `project plan` persists nothing; no `--apply` | ✓ VERIFIED | Two fresh fixtures, no `.alpha-aos/` after preview; trailer at `format.ts:246` observed live |
| A refusal must write nothing | ✓ VERIFIED | Approved artifact sha256 byte-identical across the drift refusal; no-artifact refusal created no `.alpha-aos/` |
| A refusal must never guess what it does not know | ✓ VERIFIED | The pre-first-approval branch says the value is unavailable rather than naming a noun it cannot know |
| Approving must touch only `.alpha-aos/plan.json` | ✓ VERIFIED | `Approved. Only .alpha-aos/plan.json was written; project source, package manifests, tests and build configuration stay read-only inputs.` |
| A generic `AGENTS.md` must never select an agent-runtime pack | ✓ VERIFIED | Rendered as a near-miss naming the missing framework leaf; absent from `selected` |
| A repository must not borrow evidence across a `.git` boundary | ✓ VERIFIED | Inner root selects `react` only; outer root selects `API` and excludes `inner` by name |
| A failure reason must not assert non-existence of something the walk observed | ✓ VERIFIED | Exclusions are reported as `EXCLUDED-BOUNDARY <name> — <reason>`, naming what was seen |
| An unimplemented detector must not be silent | ✓ VERIFIED | `UNIMPLEMENTED SECURITY_REVIEW: no detector runs for … — deferred to GATE-01` |
| Managed documents not read with a bare parse | ✓ VERIFIED | `each reproduced approved-plan poisoning is refused with a stable code` green in the suite |
| No `git` subprocess, no package manager, no network in the detection seam | ✓ VERIFIED (round 2, unchanged source) | `grep -E "child_process\|spawn(\|execFile\|fetch("` across the five seam modules returns zero matches |
| Stale evidence never triggers automatic deletion | ✓ VERIFIED | DETC-06 named test asserts `existsSync(target)` and `existsSync(receiptPath)` after `status`; pass 1 fail 0 |

### Process Notes

| Note | Assessment |
|---|---|
| Ledger #14 marked `waived`, not `fixed` | **Correct disposition.** Nothing was patched; a scope question was answered. A `fixed` here would have been a false claim that code changed. The waiver reason records the decision, the reproduction, and the named future candidate. |
| Ledger state at HEAD | `open_count: 9, waived_count: 2, fixed_count: 15, total_count: 26`. The nine open entries are #5, #6, #8 (Phase 1) and #15, #20, #22, #23, #25, #26 (Phase 2) — each carries a written rationale and none is a Phase-2 success-criterion blocker. `workflow.windows_enforce` is `false`, so the open count does not gate ship; it is a register, not a queue. |
| `covered_files` composition changed | Deliberate and stated in frontmatter. Round 2 included `.planning/WINDOWS.md`, a mutable cross-phase ledger that later phases will keep editing — which is precisely what staled round 2 without any product change. Removing it and adding `02-UAT.md` makes the fingerprint track the phase's contract and evidence rather than a shared register. |
| Round-2 verdicts not blindly carried | No source commit exists between rounds, so carrying them would have been defensible — but a scope decision that narrows a must-have is exactly where a stale carry-forward hides. All five criteria were re-executed, and the D-13 decision's three premises were tested against code rather than read. |

### Human Verification Required

**None.** The single round-2 item (D-13 drift classification, ledger #14) is
closed by a recorded decision whose premises I independently re-tested against
the code this round. No new item was generated: every one of the five truths is
behavior-dependent, and every one carries a live command or a named test rather
than a presence check, so nothing was left in a present-but-unproven state.

### Gaps Summary

No gaps, and no regressions.

The phase goal has two halves and both hold. **"Bound to one canonical
repository state"**: a nested repository is a hard boundary in both directions —
the inner project roots at itself and borrows nothing from a parent declaring a
different framework, and the outer project names the child as an exclusion
rather than silently walking into it or silently around it. **"Explains both
matches and non-matches"**: every selection names its facts and their source
file, a near-match names the specific leaf it is missing, an undetectable pack
renders as `UNIMPLEMENTED` naming the gate that owns it, and a boundary
exclusion is reported as something observed and excluded rather than as
something that does not exist.

The apply-binding half of the goal is the one this round scrutinized hardest,
because that is where the outstanding question lived. It holds. A reviewed plan
whose evidence has moved is refused with exit 2 and writes nothing — I confirmed
"writes nothing" by hashing the approved artifact on both sides of the refusal,
not by reading the trailer that claims it. The narrowed clause the UAT decided
is a diagnostic-quality clause, not part of criterion 4: in the one bounded
window where the CLI cannot name which pack moved — before a repository's first
approval, and never again after it — the tool refuses anyway, says plainly that
it cannot name the noun, and hands back a command that works. It does not
fabricate, and it does not let the apply through. That is the difference
between a narrowed scope and a hole, and it is why this closes as `passed`
rather than as an override.

Two things leave this phase unfinished but not unowned-by-accident, and both are
recorded rather than buried: `path-boundary.ts:226` narrows a 64-bit inode to a
double and **no phase in the roadmap owns it** — it needs a plan, and saying so
here is the only thing keeping it from disappearing; and a redacted path segment
can produce a paste-ready command that does not resolve, which is a Phase 6/7
presentation decision. Four further items are deferred to Phases 3, 4 and 7 with
the specific criterion in each later phase that covers them.

---

_Verified: 2026-09-09T12:52:15Z_
_Verifier: Claude (gsd-verifier)_
