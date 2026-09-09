---
phase: 02-evidence-bound-project-planning
verified: 2026-09-09T02:28:21Z
status: human_needed
score: 5/5 must-haves verified
covered_files:
  - ".github/workflows/pack-skill-drift.yml"
  - ".planning/REQUIREMENTS.md"
  - ".planning/ROADMAP.md"
  - ".planning/WINDOWS.md"
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
covered_digest: "v1:sha256:0fffeba1953b81e1c4664f2e8ecefd18a62aa21915592f434068a71f1c869083"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 2/5
  gaps_closed:
    - "User can select a canonical project root and observe that detection stops at nested repository and worktree boundaries without borrowing evidence from parents, siblings, aliases, or unrelated repositories. (CR-01 + CR-02)"
    - "User can inspect the exact versioned files, dependencies, entrypoints, configuration, and manifest facts that selected each pack, plus reasons near-matches failed. (CR-02 false reason + CR-03 undisclosed truncation)"
    - "When evidence for an installed pack disappears, the user sees `STALE` with the missing evidence identified and no automatic deletion. (CR-04 + CR-01 on `status`)"
  gaps_remaining: []
  regressions: []
  human_items_closed:
    - "Canonical-root ladder rung order — RESOLVED by narrowing `RootReason` from six declared rungs to four, all four reachable, with the intended order stated at evidence.ts:120-144. `worktree-root` and `submodule-root` were removed because a linked worktree and a submodule both carry a `.git` FILE and therefore answer at `git-root`."
    - "`pin-pack-skills.mjs check` has no home — RESOLVED by .github/workflows/pack-skill-drift.yml (weekly cron `17 4 * * 1` + workflow_dispatch, drift fails the run red, no continue-on-error)."
  human_items_remaining:
    - "D-13 drift classification at the CLI when no `.alpha-aos/plan.json` exists (ledger #14)."
deferred:
  - truth: "Cross-host Unicode path normalization (macOS NFD vs Linux NFC naming the same file) produces identical digests."
    addressed_in: "Phase 7"
    evidence: "Phase 7 goal: behavior proven against the same frozen bytes on a three-OS matrix. The SAME-host half now runs and passes on this Windows host — `two directories named in NFD and NFC form are two scan entries and two digest inputs` executed (not skipped), pass 1 fail 0."
  - truth: "SECURITY_REVIEW can select on detected risk facts rather than rendering as `unimplemented`."
    addressed_in: "Phase 4"
    evidence: "All eight leaves carry `deferredTo: GATE-01`; Phase 4 goal is 'Mandatory GSD Gates'. Re-confirmed at HEAD: every plan rendering emits `UNIMPLEMENTED SECURITY_REVIEW: no detector runs for auth-change, ... — deferred to GATE-01`."
  - truth: "DETC-06's 'previously installed' covers a pack approved but never materialized."
    addressed_in: "Phase 3"
    evidence: "Phase 3 owns receipt writing, which is the state `reconcileProjectState` reads. Carried as ledger #15, still open by design."
  - truth: "An aliased FILE adds no second path for the file it points at."
    addressed_in: "Phase 7"
    evidence: "Ledger #20. Windows requires elevation for file symlinks; the DIRECTORY half of the same rule runs and passes here and was independently reproduced at the CLI in this verification. The file half needs a POSIX host or an elevated Windows run — the Phase 7 three-OS matrix."
carried_forward:
  - finding: "src/core/path-boundary.ts:226 records `inode: Number(info.ino)` and `recheckPathProof` compares that double; a Windows file index above 2^53 rounds (measured: 68398419340753788 -> 68398419340753790, ulp 16), so two distinct inodes within one ulp compare equal and a TOCTOU swap can go undetected."
    owner: "NONE — no phase in the current roadmap owns it"
    basis: "Ledger #25, open with a full written rationale. Same root cause 02-13 fixed in evidence.ts `identityKeys` (now `lstat(..., { bigint: true })`, evidence.ts:463-478). Left open deliberately: path-boundary.ts is Phase 1 code outside 02-13's declared files and `PathProof.inode` is a public `number | null`, so widening it is an interface change needing its own plan. Confirmed unmodified since the prior verification (`git log --since=2026-09-08T06:55:00Z -- src/core/path-boundary.ts` is empty), so it is not a regression of this run and not this phase's failure."
    recommendation: "Schedule a plan that widens `PathProof.inode` to a string or bigint. It currently has no home."
advisory: []
human_verification:
  - test: "Decide how D-13 drift classification should behave at the CLI when no `.alpha-aos/plan.json` exists yet. Either permit the preview to write a reviewed-plan record, or scope the must-have truth to callers that hold the plan value."
    expected: "Either a refusal that names the moved noun in every case, or a must-have narrowed to match D-12 + SAFE-01."
    why_human: "Re-confirmed verbatim at HEAD. WITH a prior artifact the refusal names the noun: `plan-drift: selection-changed: ... joined none; left WEB_BASE, WEB_REACT (reviewed 282d1264bc87, observed 4d0e852d3dd9)`. WITHOUT one it honestly says `The reviewed plan value is not available here, so what moved cannot be named; review the current plan again first.` Both branches refuse, both exit 2, both emit a runnable next step, and neither lies — so ROADMAP criterion 4 is satisfied either way. Closing the diagnostic gap trades a stated safety property (SAFE-01: the preview persists nothing) against a diagnostic one. That is a product decision, not a patchable bug. Carried as ledger #14."
---

# Phase 2: Evidence-Bound Project Planning Verification Report

**Phase Goal:** Users receive reproducible project-pack decisions and reviewed plans that are bound to one canonical repository state and explain both matches and non-matches.
**Verified:** 2026-09-09T02:28:21Z
**Status:** human_needed
**Re-verification:** Yes — after gap closure (plans 02-11 … 02-16)

## Goal Achievement

The prior verification failed this phase on four independently reproduced
defects. I re-ran every one of them at HEAD against fresh fixtures built by
hand, and none reproduces. I did not take a single closure on a SUMMARY's word:
every claim below is backed by a command I ran and its output, or by a named
test I executed in its own process.

The two halves of the goal now both hold. "Bound to one canonical repository
state" terminates on the monorepo shape that used to hang, and no longer lets a
directory junction inside the repository steer its own pack selection.
"Explains both matches and non-matches" no longer emits a reason that is false,
and no longer prints a confident negative over a scan it never finished.

What changed structurally is worth naming, because it is the difference between
a patched symptom and a closed class of defect. `bounds`, `excludedBoundaries`,
`undecidableBoundaries` and `droppedMembers` were computed-and-discarded state;
they are now rendered, digested, and load-bearing in the failure reasons
themselves — so a "directory does not exist" sentence has been replaced by "the
walk observed and excluded `src` (git-entry: …)". That is the honesty property
DETC-03 exists for, implemented rather than asserted.

The phase is not `passed` for one reason, and it is not a defect: the D-13
CLI drift-classification question (ledger #14) is still an open product
decision that no plan owns and that the phase itself deliberately routed to a
human. Criterion 4 is satisfied with or without that decision.

### Observable Truths

| # | Truth (ROADMAP Success Criterion) | Status | Evidence |
|---|---|---|---|
| 1 | Canonical root selected; detection stops at nested repository and worktree boundaries without borrowing from parents, siblings, aliases, or unrelated repos | ✓ VERIFIED | **CR-01 closed:** identical git + nested-manifest fixture that previously hung — `project plan` exit 0/1834 bytes, `project plan --project sub` exit 0/2605 bytes, `project status` exit 0/483 bytes, `project approve --apply` exit 0, all under a 45-60s timeout. Sub-project isolation holds: planning `sub` selects `WEB_REACT` from its own `react`; the only occurrence of `express` in its JSON is the catalog's NEGATIVE reason list. **CR-02 closed:** junction `aaa -> src` yields `EXCLUDED-BOUNDARY aaa — alias-entry (the entry resolves to src, so it is an alias rather than content)`, `SELECT BROWNFIELD_INIT … (src)` unchanged, and the selection lines diff clean. **Order-independence proven:** alias sorting BEFORE (`aaa`), AFTER (`zzz`) and ABSENT all produce evidence digest `101d56bbd047…` and inputs digest `5effe90593fb…` — three identical values. **Parent/sibling:** a `.git`-bearing `child/` under a parent declaring `express` beside a sibling declaring `react` roots at `child` and borrows neither. **Worktree:** a `.git` FILE (`gitdir: …`) stops the climb; the inner project borrows nothing from the outer repo. |
| 2 | Exact versioned files/deps/entrypoints/config/manifest facts that selected each pack, plus reasons near-matches failed; generic `AGENTS.md` alone never selects an agent-runtime pack | ✓ VERIFIED | **AGENTS.md clause:** `NEAR-MISS AGENT_RUNTIME: A generic agent-instruction file or skill directory (AGENTS.md) — missing: An agent-orchestration framework is a declared dependency`; not selected. **Positive evidence:** `SELECT BROWNFIELD_INIT: … (src)`, `SELECT WEB_REACT: the react package is a declared dependency (package.json)`, and `source[0]` resolving `version 2.2.0` / `integrity sha512-jk3Zedc7…` / `sourceSha256 14e7b204…` offline from the lock. **CR-02's false reason closed:** on a fixture where `src` exists but is excluded, the reason is now `no declared directory was scanned: the walk observed and excluded src (git-entry: the directory holds a .git entry, so it is the root of another project); and no path under the canonical root carries lib, app, pkg, internal` — the old sentence claimed `src` did not exist. **CR-03 closed:** a depth-15 fixture prints `BOUNDED MAX_SCAN_DEPTH=12 was reached at d1/…/d13; the scan is INCOMPLETE, so what follows is not a complete answer` in the DEFAULT rendering, above `No pack qualified`. A 5001-pattern `.gitignore` prints two `UNDECIDABLE-PATH … pattern-count-cap: construct=gitignore-file, cap=5000, exceeded=true` lines and populates `undecidableBoundaries` in `--json`; at exactly 5000 patterns it is accepted (0 lines) — the number in the refusal is the number that decided. `--why` renders `EXCLUDED-BOUNDARY`, which is what the evidence.ts module comment claims. |
| 3 | Repeated detection of unchanged inputs produces stable text and JSON plans exposing scope, owner, exact source version and hash, renderer, target pre-state, adapter support, approvals, safe inverse | ✓ VERIFIED (regression) | Two consecutive runs byte-identical in BOTH modes (`cmp -s` → TEXT IDENTICAL / JSON IDENTICAL). All nine nouns present as named fields, plus `executable: null` with a populated `executableDisposition`, plus four digests. **New this round (WR-01):** the digest is now host-independent by construction — `digestablePlan` is a literal that omits `createdAt`, the git context and `hostNotes`, and a personal-scope skill collision is still REPORTED via `format.ts:239` as a `SHADOWED` line. Two reviewers on the same commit therefore compute the same digest. |
| 4 | Applying a reviewed plan is refused if evidence, manifest, stable lock, renderer, executable, adapter capability, or target bytes changed after review | ✓ VERIFIED (regression) | Reproduced at the CLI: after removing `react` from a fixture's manifest, `project approve --plan-digest <stale> --apply` exits **2** with `plan-drift: selection-changed: … joined none; left WEB_BASE, WEB_REACT (reviewed 282d1264bc87, observed 4d0e852d3dd9)` plus a runnable re-approval command, and the artifact's `approvedDigest` is byte-unchanged afterwards. A genuinely unchanged plan correctly reports `Already current. No bytes were written and no transaction was opened.` — I confirmed the "unchanged" leg was a true negative by checking that the removed directory was not the one that selected the pack. **W-1 exposure closed:** the idempotency verdict is now derived from a schema-validated artifact, so an attacker-chosen `approvedDigest` cannot produce a false already-current. Paste-safety (WR-14) verified in source: `SHELL_UNSAFE_ARGUMENT` covers whitespace, both quote characters and shell metacharacters, and `shellQuote` is platform-aware. |
| 5 | When evidence for an installed pack disappears, the user sees `STALE` with the missing evidence identified and no automatic deletion | ✓ VERIFIED | Reproduced end-to-end at the CLI on a hand-built fixture (real receipt + materialized skill + approved plan): removing the `pg` dependency yields `STALE  DB_POSTGRES  1/1 matching`, then `STALE-FACT DB_POSTGRES — the \`postgres-driver\` fact (A PostgreSQL driver is a declared dependency) that selected it is gone: no dependency manifest at the canonical root declares any of: pg, postgres, …`, then `REMOVAL DB_POSTGRES — 1 target(s). Nothing has been removed.` under its own `Removal digest: 021600a0bad9…`, closing with `Read only. \`project status\` deletes nothing`. Target file and receipt both still present afterwards. **CR-04 closed on exactly this path:** poisoning `plan.evaluations[0].satisfied` to a string now yields `UNREADABLE-APPROVAL .alpha-aos/plan.json exists and did not pass its closed schema, so it is refused rather than partly trusted: schema.type@/plan/evaluations/0/satisfied` and `Approved plan: none (unreadable)` — a domain refusal with a stable issue code, never the old `((intermediate value) ?? []).filter is not a function`. A wholly non-JSON artifact yields `syntax.malformed@/` and degrades honestly to `CHANGED … no approved plan records which facts selected it, so the fact that changed cannot be named`. |

**Score:** 5/5 truths verified (0 present, behavior-unverified)

### The Two Deliberate Deviations — Judged

Both were flagged by the orchestrator as reasoned decisions rather than misses.
I judged each on its merits, independently.

#### 1. 02-12 inverted its own acceptance criterion (escaped `#` in `.gitignore`) — **the deviation is CORRECT**

The plan's clause read "the escape is removed before the pattern reaches the
matcher". I reproduced the mechanism from scratch rather than reading the
executor's account:

```
raw gitignore line   "\\#foo" -> ignores "#foo": true
backslash stripped   "#foo"   -> ignores "#foo": false
ignore version: 7.0.5
```

and independently against real git in a scratch repository:

```
$ git check-ignore -v '#foo'
.gitignore:1:\#foo	#foo        (exit 0)
```

The backslash is part of the gitignore pattern grammar, not a wrapper the
parser should peel. Stripping it would have handed `#foo` to the matcher, which
discards it as a comment — **silently un-ignoring a file the repository
explicitly declared**. That is a data-loss-shaped bug, and the plan's clause
would have introduced it. The executor was right to refuse the criterion and
right to log it as an `unmet-truth` (ledger #22) instead of quietly complying.

The OBSERVABLE truth the criterion was serving is intact and covered: the test
`a leading # escaped with a backslash names a file whose name begins with #`
passes (`pass 1, fail 0`) and — importantly — it cross-checks its own answer
against `git check-ignore` in the same fixture, so its oracle is external to
alpha-AOS rather than circular. Its negative twin (`an unescaped leading # is a
comment for this parser and for git alike`) asserts `git check-ignore` returns
1. Source comment at `ignore-list.ts:186-192` records the reasoning at the site.

#### 2. 02-11 narrowed the Unicode criterion — **the narrowing is SOUND, and stronger than claimed**

I verified the premise rather than accepting it. `digestableEvidence`
(`evidence.ts:2248-2254`) projects exactly
`[fact.id, fact.detected, fact.path ?? null, fact.version ?? null]`. `path` IS
in the projection — so the narrowing rests entirely on the second half of the
claim: that no catalog fact would ever DETECT a `café` directory.
`grep -P "[^\x00-\x7F]"` over `catalog/facts.yaml` returns only prose inside
comments; no declared directory, file or dependency name is non-ASCII.
A `café` directory therefore produces no fact, so no path, so the projection
cannot move. The premise holds.

Re-asserting on `scan.paths` is not a weaker substitute — it is the correct
seam. `scan.paths` is the input every path predicate and every path-bearing
fact is decided from, which is where "alpha-AOS applies no normalization of its
own" actually lives. The test goes further than the criterion required: it also
builds a second single-form fixture and asserts the two `scan.paths` digests
differ, so the two forms are proven to be two distinct digest inputs and not
merely two distinct strings.

One correction to the record: the test is written to skip with a stated reason
on a folding filesystem, but on this Windows host it **RAN** — `pass 1, fail 0,
skipped 0`. The same-host half of the contract is therefore measured here, not
deferred. Only the genuinely cross-host half (NFD on macOS vs NFC on Linux)
remains for the Phase 7 matrix.

### Deferred Items

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | Cross-HOST Unicode NFD/NFC digest equality | Phase 7 | Three-OS matrix. Same-host half now runs and passes here. |
| 2 | SECURITY_REVIEW risk-fact detectors | Phase 4 | All eight leaves carry `deferredTo: GATE-01`; re-confirmed rendering as UNIMPLEMENTED naming GATE-01 in every plan output. |
| 3 | "Previously installed" for an approved-but-never-materialized pack | Phase 3 | Phase 3 owns receipt writing; ledger #15. |
| 4 | Aliased FILE adds no second path | Phase 7 | Ledger #20. Directory half runs and passes and was reproduced at the CLI here; file half needs POSIX or elevated Windows. |

### Carried Forward — Not This Phase's Failure, and Currently Unowned

| # | Item | Owner | Disposition |
|---|------|-------|-------------|
| 1 | `path-boundary.ts:226` `inode: Number(info.ino)` rounds 64-bit Windows file indices, so `recheckPathProof` can miss a TOCTOU swap within one ulp | **NONE** | Recorded open as ledger #25 with a complete written rationale. Confirmed NOT a regression of this run: `git log --since=2026-09-08T06:55:00Z -- src/core/path-boundary.ts` is empty. 02-13 correctly fixed the same class in `evidence.ts identityKeys` (now `lstat(..., { bigint: true })`) and correctly declined to widen the public `PathProof.inode` type outside its declared scope. **This needs a plan; no phase currently has one.** |

### Advisory (New Scope, Unevidenced)

None. Every new-scope concern I raised this pass carries a reproduction, so
none was downgraded for lack of evidence. Both appear as Warnings in the
anti-pattern table below rather than here.

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `src/core/evidence.ts` | Boundary walk, canonical root, six detector kinds, alias exclusion, scan bounds | ✓ VERIFIED | Root ladder narrowed to four reachable rungs with the order stated at :120-144; `identityKeys` reads `{ bigint: true }` at :478; alias exclusion reproduced at the CLI; `bounds`/`excludedBoundaries` now consumed downstream |
| `src/core/project-plan.ts` | Plan envelope, approval, reconciliation, strict artifact read | ✓ VERIFIED | Nine nouns verified; `readApprovedProjectPlan` routes through `validateManagedDocument` against `schemas/approved-plan.schema.json` (the only `JSON.parse` left reads the alpha-AOS-owned schema file); `digestablePlan` omits `createdAt`/git/`hostNotes` by construction; `shellQuote`/`pasteSafe` present |
| `src/format.ts` | Renderer for bounds, undecidable paths, dropped members, boundary exclusions, host notes | ✓ VERIFIED | `BOUNDED` / `UNDECIDABLE-PATH` / `DROPPED-MEMBER` in the default rendering, `EXCLUDED-BOUNDARY` under `--why`, `SHADOWED` for host notes — all four observed in live output |
| `src/core/paths.ts` `RootKeyedCache` | Root-keyed, bounded process cache | ✓ VERIFIED | Keyed by `resolve(root)`, `ROOT_CACHE_LIMIT = 8`, oldest-inserted eviction, race-safe; consumed by five caches across `project.ts`, `pack-catalog.ts`, `project-plan.ts` |
| `src/core/ignore-list.ts` | Ignore membership without git, honest caps | ✓ VERIFIED | `IGNORE_PATTERN_COUNT_CAP = 5000` behaviour proven at the boundary (5000 accepted, 5001 undecidable); escaped-`#` handling documented at the site and cross-checked against real git |
| `src/core/redaction.ts` + `src/cli.ts` | UTF-8 byte budget, no truncated success | ✓ VERIFIED | `truncateToUtf8Bytes` cuts on a code-point boundary; `cli.ts:178` throws `describeOverBudgetEnvelope` when `envelope.truncated` — the flag is consumed, not discarded |
| `schemas/approved-plan.schema.json` | Closed contract for the one committed managed document | ✓ VERIFIED | Exists, closed; admits `hostNotes` and a null guard hash (the 02-15 shapes); `the approved-plan schema admits the two shapes plan 02-15 introduces` passes in the suite |
| `.github/workflows/pack-skill-drift.yml` | A scheduled home for the catalog/lock drift check | ✓ VERIFIED | Weekly `17 4 * * 1` + `workflow_dispatch`, offset from `dependency-candidate.yml`, `permissions: contents: read`, drift fails red with no `continue-on-error` or `|| true` |
| `scripts/pin-pack-skills.mjs` | Maintainer pinning script | ✓ VERIFIED (was ⚠️ ORPHANED) | Now has a caller: `pack-skill-drift.yml:56` |
| `test/helpers/git-fixture.ts` + phase-02 fixtures | Git-shaped fixtures joined with sub-manifests | ✓ VERIFIED (was ⚠️ ORPHANED for the case that matters) | The git-root + nested-manifest combination is now driven end-to-end; the blind spot CR-01 hid in is covered |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `src/cli.ts project plan --project` | `planSubProject` → `resolveCanonicalRoot` pinned rung | descent pin | ✓ WIRED | `pin === "descent"` yields `project-declaration` without re-climbing; reproduced: `--project sub` exits 0 and reports the sub-project's own evidence |
| `evidence.ts scanProjectTree bounds` | `format.ts` default rendering + `--json` | `plan.scanBounds` | ✓ WIRED (was ✗ NOT_WIRED) | `BOUNDED MAX_SCAN_DEPTH=12 …` observed in default output; field present in JSON |
| `evidence.ts excludedBoundaries` | `--why` renderer | `plan.excludedBoundaries` | ✓ WIRED (was ✗ NOT_WIRED) | `EXCLUDED-BOUNDARY nested — git-entry (…)` observed; the module comment is now true of shipped code |
| `evidence.ts` undecidable rule sets | `format.ts UNDECIDABLE-PATH` + `--json` | `plan.undecidableBoundaries` | ✓ WIRED | Two lines + a populated JSON array on the 5001-pattern fixture |
| `plan.scanBounds/undecidableBoundaries/excludedBoundaries/droppedMembers` | `digestablePlan` | plan digest | ✓ WIRED | Present at `project-plan.ts:969-972`, so an approval taken under a bound is not silently reusable once the bound clears |
| `evidence.ts` boundary exclusions | the directory-kind detector's failure reason | reason composition | ✓ WIRED | `no declared directory was scanned: the walk observed and excluded src (git-entry: …)` |
| `readApprovedProjectPlan` | `validation.ts validateManagedDocument` | strict route | ✓ WIRED (was ✗ NOT_WIRED) | Schema-typed refusal `schema.type@/plan/evaluations/0/satisfied` proves the route is live |
| `discoverPersonalSkillNames` | `hostNotes` (rendered) and NOT `digestablePlan` | deliberate omission | ✓ WIRED | `format.ts:239 SHADOWED`; absent from the digest literal |
| `options.packageRoot` | `project.ts` / `pack-catalog.ts` / `project-plan.ts` caches | `RootKeyedCache` | ✓ WIRED | Threaded, not rediscovered; all five caches keyed by resolved root |
| `scripts/pin-pack-skills.mjs check` | scheduled CI caller | workflow step | ✓ WIRED (was ✗ NOT_WIRED) | `pack-skill-drift.yml:56` |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|---|---|---|---|---|
| plan `source[]` | pack skill hashes | `catalog/stack.lock.json` | Yes — `2.2.0` / `sha512-jk3Zedc7…` / `14e7b204…` resolved offline | ✓ FLOWING |
| plan `adapterSupport` | five harnesses | `catalog/stack.yaml` harness table | Yes — three-value vocabulary with per-harness basis strings | ✓ FLOWING |
| plan `evaluations[]` | leaf results | live evidence envelope | Yes — flips with fixture content across every fixture I built | ✓ FLOWING |
| plan `scanBounds` | bound / limit / first-reached path | `scanProjectTree` | Yes — `MAX_SCAN_DEPTH / 12 / d1/…/d13` on a depth-15 tree, `[]` on an ordinary one | ✓ FLOWING (was ✗ DISCONNECTED) |
| plan `undecidableBoundaries` | path / reason / detail | ignore-rule-set refusal | Yes — two entries naming `pattern-count-cap, cap=5000` | ✓ FLOWING (was ✗ DISCONNECTED) |
| plan `excludedBoundaries` | path / reason / detail | boundary walk | Yes — `aaa/alias-entry`, `nested/git-entry`, `src/git-entry` observed | ✓ FLOWING (was ✗ DISCONNECTED) |
| plan `hostNotes` | personal-skill collisions | home-directory scan | Yes — rendered, and deliberately absent from the digest | ✓ FLOWING |
| status `STALE-FACT` | missing fact id | recomputed evidence vs approved set | Yes — named `postgres-driver` after removing `pg` | ✓ FLOWING |
| status `artifactState` | validation issue code | `validateManagedDocument` | Yes — `schema.type@…` and `syntax.malformed@/` are distinct real codes | ✓ FLOWING |

### Behavioral Spot-Checks

All commands run by me in this verification's own process. Fixtures built by
hand from scratch; the four CR reproductions replicate the prior verification's
fixtures as closely as their descriptions allow.

| Behavior | Command | Result | Status |
|---|---|---|---|
| CR-01 `plan` on git + sub-project | `timeout 45 node dist/src/cli.js project plan <fix>` | **exit 0, 1834 bytes**, sub-project listed (was exit 124 / 0 bytes) | ✓ PASS |
| CR-01 `plan --project` | `… project plan <fix> --project sub` | **exit 0, 2605 bytes**, `SELECT WEB_REACT` | ✓ PASS |
| CR-01 `status` | `… project status <fix>` | **exit 0, 483 bytes** | ✓ PASS |
| CR-01 `approve --apply` | `… project approve <fix> --plan-digest 3125b006… --apply` | **exit 0**, artifact written | ✓ PASS |
| Sub-project evidence isolation | JSON scan of `--project sub` | sees `react`; the only `express` is a NEGATIVE reason list | ✓ PASS |
| CR-02 junction repro | `New-Item -ItemType Junction aaa -> src`, then `project plan --why` | `EXCLUDED-BOUNDARY aaa — alias-entry`; `SELECT BROWNFIELD_INIT … (src)`; selection diff clean | ✓ PASS |
| Alias order-independence | alias sorts before / after / absent | evidence digest `101d56bbd047…` identical in all three | ✓ PASS |
| Parent + sibling isolation | `project plan <parent>/child` | roots at `child`; no `react` from sibling; no borrowed `express` fact | ✓ PASS |
| Worktree boundary (`.git` FILE) | `project plan <outer>/inner` | roots at `inner`; borrows nothing from the outer repo | ✓ PASS |
| CR-03 depth bound, DEFAULT rendering | depth-15 fixture, `project plan` | `BOUNDED MAX_SCAN_DEPTH=12 was reached at d1/…/d13; the scan is INCOMPLETE` | ✓ PASS |
| CR-03 nested-repo disclosure | nested-repo fixture, `--why` and `--json` | two `EXCLUDED-BOUNDARY` lines; `excludedBoundaries` populated in JSON | ✓ PASS |
| CR-03 false negative reason | `src/` present but git-excluded, `--why` | `the walk observed and excluded src (git-entry: …)` — no longer claims it does not exist | ✓ PASS |
| Undecidable rule set + cap boundary | 5001-pattern `.gitignore`, then 5000 | 2 `UNDECIDABLE-PATH … cap=5000` lines, then 0 at exactly the cap | ✓ PASS |
| CR-04 poisoned `plan.json` (no receipt) | `evaluations[0].satisfied = "POISON"`, `project status` | `UNREADABLE-APPROVAL … schema.type@/plan/evaluations/0/satisfied`, exit 2 | ✓ PASS |
| CR-04 on the STALE path (with receipt) | same poisoning on the stale fixture | same named refusal; no TypeError | ✓ PASS |
| CR-04 wholly malformed artifact | `echo "{not json"`, `project status` | `syntax.malformed@/`; `Approved plan: none (unreadable)`; honest `CHANGED … cannot be named` | ✓ PASS |
| DETC-06 happy path, end to end | hand-built receipt + approve + remove `pg`, `project status` | `STALE`, `STALE-FACT … postgres-driver`, removal under its own digest, target and receipt both present | ✓ PASS |
| DETC-05 drift refusal | `project approve --plan-digest <stale> --apply` after a real evidence change | exit 2, `plan-drift: selection-changed … left WEB_BASE, WEB_REACT`; `approvedDigest` byte-unchanged | ✓ PASS |
| DETC-04 determinism | 2× text, 2× `--json`, `cmp -s` | TEXT IDENTICAL / JSON IDENTICAL | ✓ PASS |
| DETC-04 nine nouns | JSON key inspection | all nine + `executable: null` + `executableDisposition` + 4 digests | ✓ PASS |
| DETC-03 AGENTS.md clause | `project plan <AGENTS.md-only>` | near-miss naming the missing framework leaf; not selected | ✓ PASS |
| Empty repository is a complete answer | `project plan <empty> --json` | exit 0; `selected: []`, `applicable: []`, `scanBounds: []`; all nine nouns present | ✓ PASS |
| 02-13 backstop: concurrent `--why` order | 8 overlapping `project plan . --why` on the real repository (4 rounds of 2) | all 8 **byte-identical** (9689 bytes), near-miss fingerprint `a7b62a90bde1` in all 8, no `.alpha-aos` residue, tree clean | ✓ PASS |
| Prohibition: `plan` persists nothing | residue check across every preview fixture | no `.alpha-aos/` anywhere, incl. on the repo itself | ✓ PASS |
| Prohibition: no subprocess/network in the seam | `grep -E "child_process\|spawn(\|execFile\|fetch("` over evidence/project-plan/ignore-list/pack-catalog/project | zero matches | ✓ PASS |
| WR-01 host-independence | `digestablePlan` literal + `format.ts:239` | `hostNotes` absent from digest, present as `SHADOWED` | ✓ PASS |
| Escaped-`#`: ignore@7 mechanism | standalone probe | `"\#foo"` → true; `"#foo"` → false | ✓ PASS |
| Escaped-`#`: real git oracle | `git check-ignore -v '#foo'` in a scratch repo | `.gitignore:1:\#foo	#foo`, exit 0 | ✓ PASS |
| Named test: escaped `#` | `node --test --test-name-pattern="a leading # escaped with a backslash names a file whose name begins with #" dist/test/ignore-list.test.js` | pass 1, fail 0 | ✓ PASS |
| Named test: NFD/NFC | `… --test-name-pattern="two directories named in NFD and NFC form are two scan entries and two digest inputs" dist/test/evidence.test.js` | pass 1, fail 0, **skipped 0** (ran on this host) | ✓ PASS |
| Named test: DETC-06 happy path | `… --test-name-pattern="the DETC-06 happy path is unchanged: STALE names the fact, a removal is offered, nothing is deleted"` | pass 1, fail 0 | ✓ PASS |
| Named test: poisoned artifact on stale path | `… --test-name-pattern="a poisoned approval artifact makes project status a named refusal on the stale path"` | pass 1, fail 0 | ✓ PASS |
| Named test: corrupt receipt (WR-02) | `… --test-name-pattern="one corrupt receipt does not make plan approval impossible"` | pass 1, fail 0 | ✓ PASS |
| Named test: stale digest + corrupt receipt | `… --test-name-pattern="a stale digest plus a corrupt receipt refuses naming both halves"` | pass 1, fail 0 | ✓ PASS |
| Build | `npm run build` | exit 0; 65 inputs, 124 outputs | ✓ PASS |
| Full suite (run once) | `npm test` | **tests 470, pass 464, fail 0, skipped 6** | ✓ PASS |

### Probe Execution

| Probe | Command | Result | Status |
|---|---|---|---|
| — | — | No `scripts/*/tests/probe-*.sh` exists; no PLAN declares one. The project's runnable check is `npm test` / `node scripts/run-tests.mjs`, which I ran once. | ? SKIP |

### Test Quality Audit

| Concern | Finding | Verdict |
|---|---|---|
| Disabled tests on requirements | Zero `it.skip` / `describe.skip` / `test.skip` / `.todo`. The only skips are runtime `context.skip(...)` host-capability gates, each writing a stated reason into a surfaced `notRun` list. | ✓ PASS |
| Skipped count and reasons | 6 skipped: 1 phase-02 (`an aliased FILE adds no second path` — file symlinks need elevation; ledger #20, and the DIRECTORY half runs, passes, and was reproduced at the CLI here) and 5 phase-01 path-boundary host gates (file symlinks, privileged reparse, three `mode 0o000` cases the host resolves anyway). | ✓ PASS — no requirement is proven ONLY by a skipped test |
| Circular tests | No fixture-generating script exists (`scripts/` holds build-artifact, install, pin-pack-skills, run-tests, update only). No `baseline`/`snapshot`/`capture` generator imports the system under test. | ✓ PASS |
| Expected-value provenance | VALID. The escaped-`#` pair uses **real `git check-ignore`** as an external oracle — the strongest provenance available for a gitignore-semantics claim. Digests are compared for equality/inequality between independently built fixtures rather than against captured constants. | ✓ PASS |
| Assertion strength | Behavioral. The DETC-06 and CR-01 regressions drive the real built CLI via `runCli` under a hard bounded timeout and assert on emitted lines and on filesystem state after the fact (`existsSync(target)`, `existsSync(receiptPath)`), not on return shapes. | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|---|---|---|---|---|
| DETC-01 | 02-01, 02-03, 02-05, 02-11, 02-13 | Canonical root; detection stops at boundaries | ✓ SATISFIED (was ✗ BLOCKED) | CR-01 and CR-02 both closed by reproduction; parent/sibling/worktree/nested-repo isolation each verified at the CLI |
| DETC-02 | 02-01, 02-06, 02-12, 02-13, 02-16 | Positive versioned evidence per selected pack | ✓ SATISFIED | Positive rendering plus real lock version/integrity/sha256 resolved offline |
| DETC-03 | 02-02, 02-07, 02-11, 02-12, 02-13 | Why a near-match failed; `AGENTS.md` cannot activate agent-runtime | ✓ SATISFIED (was ✗ BLOCKED) | AGENTS.md clause verified; the false reason is replaced by an observed-and-excluded reason; truncation and undecidability are disclosed in default output, `--why` and `--json` |
| DETC-04 | 02-01, 02-04, 02-08, 02-12, 02-15, 02-16 | Stable text and JSON plans with nine nouns | ✓ SATISFIED | Byte-identical both modes; nine nouns; digest now host-independent |
| DETC-05 | 02-09, 02-14, 02-15 | Refuse apply after any watched noun changed | ✓ SATISFIED | CLI drift refusal reproduced; idempotency now derived from a validated artifact; paste-safe next step |
| DETC-06 | 02-10, 02-14 | `STALE` on disappeared evidence, no auto-deletion | ✓ SATISFIED (was ✗ BLOCKED) | Full end-to-end reproduction with a real receipt; CR-04 closed on exactly the stale path |

**Orphaned requirements:** none. REQUIREMENTS.md maps exactly DETC-01…DETC-06
to Phase 2, all six are claimed by plan frontmatter, and all six read
`Complete` at lines 27-32 and 135-140.

**Traceability:** the prior report's discrepancy is resolved. All six now read
`Complete` AND all six are verified here, so nothing false is carried into
Phase 3 planning.

### Decision Coverage

All 16 CONTEXT.md decisions (D-01 … D-16) appear by id in shipped source under
`src/`. **16/16 honored, 0 not honored.** Non-blocking gate; recorded for drift
tracking.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|---|---|---|---|---|
| `src/`, `catalog/`, `schemas/`, `scripts/`, `test/`, `.github/` | — | Debt markers `TBD` / `FIXME` / `XXX` | ℹ️ Info | **Zero** found. `TODO` / `HACK` / `PLACEHOLDER` also zero. The debt-marker gate passes cleanly. |
| `.planning/WINDOWS.md` | entries 16, 19 | **Stale ledger status: a fixed blocker still recorded `open`** | ⚠️ Warning | Entry #16 (CR-01 non-termination) and entry #19 (CR-04 unvalidated `plan.json`) both read `status: open`, but I reproduced both as FIXED at HEAD. Entries #17 (CR-02) and #18 (CR-03) were correctly closed at 2026-09-08T17:49. Neither 02-11's nor 02-14's SUMMARY records disposing its own blocker. Not goal-blocking, but it would hand Phase 3 two phantom live blockers. **Recommend closing #16 and #19 with this report's reproductions as the basis.** |
| `.planning/ROADMAP.md` | 138 | Stale count `0/6 executed` | ⚠️ Warning | All six gap-closure plans executed and are committed. Line 311 also still reads `In Progress`. Orchestrator has flagged this for `update_roadmap`. |
| `src/core/project-plan.ts` `approvalCommand` × `src/core/redaction.ts` | — | Paste-safe command can be emitted with a redacted path segment | ⚠️ Warning | Reproduced: on a fixture whose path contains a UUID-shaped segment, the refusal's runnable next step reads `… project approve C:/…/[redacted:secret:009cbefbf697]/scratchpad/det --plan-digest … --apply` — a command presented as ready to paste that names a path which does not exist. The redaction is Phase-1 machinery doing its job and the refusal, exit code and digest are all correct, so this is a presentation interaction rather than a safety failure, and an ordinary repository path never triggers it. Worth a decision in Phase 6/7 (temp dirs and CI checkout paths do sometimes carry UUIDs). |
| `src/core/path-boundary.ts` | 226 | 64-bit inode narrowed to a double | ⚠️ Warning (carried forward) | Ledger #25, open with rationale. Not a regression of this run; unmodified since the prior verification. Currently unowned by any phase. |
| `test/transaction-crash.test.ts` | — | Windows teardown flake | ℹ️ Info | Ledger #26, open. Two orchestrator commits (`025505b`, `5a4f9b0`) addressed the timing; I verified both touch ONLY this test file — `git show --stat` shows 1 file changed in each, no product code. |

**Re-verification evidence gate applied.** The three new-scope findings above
(stale ledger status, redacted paste command, `path-boundary.ts:226`) each
carry a reproduction, so none was downgraded to advisory for lack of evidence.
None was classified as a 🛑 Blocker: none prevents any of the five success
criteria, all five of which I verified by direct execution. The `advisory:`
list is therefore correctly empty rather than merely unchecked.

### Prohibitions

| Prohibition | Status | Evidence |
|---|---|---|
| `project plan` persists nothing; no `--apply` | ✓ VERIFIED | `Preview only. Nothing was written`; residue check found no `.alpha-aos/` after any preview fixture, including 8 overlapping previews against the real repository, after which `git status` was unchanged |
| No `git` subprocess, no package manager, no network | ✓ VERIFIED | `grep -E "child_process\|spawn(\|execFile\|fetch("` across `evidence.ts`, `project-plan.ts`, `ignore-list.ts`, `pack-catalog.ts`, `project.ts` returns zero matches |
| Git branch/commit excluded from every digest | ✓ VERIFIED | `digestablePlan` is a literal that omits the git context by construction; branch context still rendered in `status` |
| The digest depends on nothing outside the repository and the pinned lock | ✓ VERIFIED (new) | `createdAt`, git context and `hostNotes` all omitted from the digest literal; `hostNotes` still reported as `SHADOWED` |
| Managed documents not read with a bare parse | ✓ VERIFIED (was ✗ VIOLATED) | `.alpha-aos/plan.json` now travels `validateManagedDocument` against a closed schema; the schema-typed refusal code proves the route is live |
| A repository must not steer its own selection by adding a link inside itself | ✓ VERIFIED | Alias-before / alias-after / no-alias all produce one evidence digest |
| A confident negative must never be printed over a bounded or refused scan | ✓ VERIFIED | `BOUNDED` and `UNDECIDABLE-PATH` precede `No pack qualified` in the default rendering |
| A failure reason must not assert non-existence of a directory the walk observed | ✓ VERIFIED | `the walk observed and excluded src (git-entry: …)` |
| A source comment must not assert a disclosure the code does not perform | ✓ VERIFIED | `--why` now renders `EXCLUDED-BOUNDARY`, matching the module comment |
| A guard hash must not be invented for bytes never observed | ✓ VERIFIED | `buildSafeInverse` returns `expectedHash: target.currentHash` (null when unreadable) with a `TARGET_UNREADABLE` approval beside it |
| A ready-to-paste command must not be reinterpretable by the shell | ✓ VERIFIED | `SHELL_UNSAFE_ARGUMENT` + platform-aware `shellQuote`; ordinary Windows paths pass through unquoted |
| A JSON envelope must not be written with a success exit after being cut | ✓ VERIFIED | `cli.ts:178` throws when `envelope.truncated` |
| Stale evidence never triggers automatic deletion | ✓ VERIFIED | Removal offered under its own digest; target file and receipt both present after `status` |
| A `STALE` line names the missing fact, not just the pack | ✓ VERIFIED | `STALE-FACT DB_POSTGRES — the \`postgres-driver\` fact … is gone` |
| A process-wide cache must not be keyed on nothing | ✓ VERIFIED | `RootKeyedCache` keyed by `resolve(root)`, bounded at 8 with stated eviction semantics |

### Process Notes

| Note | Assessment |
|---|---|
| 02-13's executor ran `git stash` / `pop` once, which its contract prohibits | **No artifact damage.** Independently confirmed: `git stash list` is empty, `git status --porcelain` shows only untracked `.gsd/` and `.planning/milestone.lock`, and all 02-13 commits (`29d7ad3`, `b9030f0`, `948c220`, `5609111`, `3d6abd8`, `4335ad6`, `573f899`) are present in history. The contract breach is real and worth recording; its consequence is nil. |
| Orchestrator commits `025505b`, `5a4f9b0` | **Test-harness only.** `git show --stat` on each shows exactly one file changed, `test/transaction-crash.test.ts`. No product code, so neither can have manufactured a green result for any phase-02 claim. |
| Ledger #23 — 02-12 edited a file outside its declared `files_modified` | Recorded open as a deviation with the reason (the undecidable fixture moved from an over-long line to a past-the-cap file when 02-12 reclassified the over-long-line case as a note). Self-disclosed rather than hidden; the resulting behaviour is the one I verified above. |
| Flagged assumptions | 02-11 and 02-14 each carry a DETC edge-probe row `unclassified — review manually` as UNRESOLVED in `flagged_assumptions` rather than silently asserting an acceptance criterion for it. Correct disposition. |

### Human Verification Required

One item. It is not a defect and not a rediscovery — it is the same product
decision the phase itself routed to a human, re-confirmed unchanged at HEAD.

#### 1. D-13 drift classification at the CLI with no prior artifact

**Test:** Decide between (a) permitting the preview to write a reviewed-plan
record, or (b) scoping the must-have truth to callers that already hold the
plan value.
**Expected:** Either a refusal that names the moved noun in every case, or a
must-have narrowed to match D-12 + SAFE-01.
**Why human:** Both branches were observed working as designed and neither
lies. With a prior artifact:
`plan-drift: selection-changed: … joined none; left WEB_BASE, WEB_REACT
(reviewed 282d1264bc87, observed 4d0e852d3dd9)`. Without one:
`plan-drift: project-capability-plan changed between review and apply
(reviewed 000000000000, observed 4113ee081f0a). The reviewed plan value is not
available here, so what moved cannot be named; review the current plan again
first.` Both exit 2, both refuse, both emit a runnable re-approval command.
ROADMAP criterion 4 — "applying is refused if … changed" — is satisfied in
both. Closing the diagnostic gap means trading SAFE-01 (the preview persists
nothing) against a diagnostic property. Carried as ledger #14.

*Note on the other two prior human items:* both are now CLOSED. The
canonical-root ladder question was answered in code — `RootReason` was narrowed
from six declared rungs to four, every one reachable, with the intended order
stated at `evidence.ts:120-144` and `worktree-root`/`submodule-root` removed
with the reason that both carry a `.git` FILE and therefore answer at
`git-root`. All four rungs were observed in live output
(`project-declaration`, `git-root`, `standalone-directory` on fixtures;
`explicit-override` in source at the pinned branch). The
`pin-pack-skills.mjs check` question was answered by
`.github/workflows/pack-skill-drift.yml`.

### Gaps Summary

No gaps. All five success criteria are achieved, and each was verified by
running the product rather than by reading a summary.

The four blockers that decided the prior verification are closed, and closed at
the level of mechanism rather than symptom:

- **CR-01** — the canonical-root ladder can no longer climb out of a descent. A
  pinned descent reports `project-declaration` instead of re-resolving, so
  `planSubProject` terminates. All four verbs exit 0 on the fixture shape that
  previously returned exit 124 with zero bytes.
- **CR-02** — a directory alias is now excluded by name with the target it
  resolved to (`alias-entry (the entry resolves to src …)`), the real directory
  survives, and the identity read uses `{ bigint: true }` so a 64-bit file
  index is not rounded into a collision. The strongest evidence is the digest
  equality: alias-before, alias-after and no-alias produce one evidence digest,
  which is the property the criterion actually names.
- **CR-03** — the write-only diagnostic state is now load-bearing in three
  places at once: rendered (`BOUNDED`, `UNDECIDABLE-PATH`, `DROPPED-MEMBER`,
  `EXCLUDED-BOUNDARY`), digested (so an approval taken under a bound is not
  reusable once the bound clears), and consumed by the failure reasons
  themselves. The last is the one that mattered: the sentence that used to say
  a directory does not exist now names the exclusion it observed.
- **CR-04** — `.alpha-aos/plan.json`, the one managed document designed to be
  committed and therefore attacker-supplied on clone, now travels the same
  strict validator as every other managed document, and a malformed artifact is
  reported as *unreadable* rather than as *absent* — so a user can tell a
  rejected approval from a missing one.

Both deliberate deviations survive scrutiny. The `.gitignore` escape inversion
is not merely defensible, it is the correct call: I reproduced the mechanism
against both `ignore@7.0.5` and real `git check-ignore`, and complying with the
written criterion would have silently un-ignored files the repository
explicitly declared. The Unicode narrowing rests on a premise I checked rather
than accepted (no catalog fact carries a non-ASCII name), and the substituted
assertion is on the seam where the contract actually lives — and on this host it
runs rather than skips.

What remains is one product decision and some bookkeeping. The bookkeeping is
worth naming plainly because it is the only thing in this phase's record that is
now untrue: `.planning/WINDOWS.md` still carries entries #16 (CR-01) and #19
(CR-04) as `open` when both are demonstrably fixed, and `.planning/ROADMAP.md`
still says `0/6 executed`. Neither affects the product; both would mislead
Phase 3.

---

_Verified: 2026-09-09T02:28:21Z_
_Verifier: Claude (gsd-verifier)_
