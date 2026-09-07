---
phase: 02-evidence-bound-project-planning
verified: 2026-09-08T06:55:00Z
status: gaps_found
score: 2/5 must-haves verified
covered_files:
  - ".planning/REQUIREMENTS.md"
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
  - ".planning/phases/02-evidence-bound-project-planning/02-REVIEW.md"
  - "catalog/facts.yaml"
  - "catalog/stack.lock.json"
  - "schemas/fact-vocabulary.schema.json"
  - "schemas/pack-catalog.schema.json"
  - "schemas/project-stack.schema.json"
  - "scripts/pin-pack-skills.mjs"
  - "src/cli.ts"
  - "src/core/ecc-fixture.ts"
  - "src/core/evidence.ts"
  - "src/core/ignore-list.ts"
  - "src/core/pack-catalog.ts"
  - "src/core/path-boundary.ts"
  - "src/core/project-plan.ts"
  - "src/core/project.ts"
  - "src/core/validation.ts"
  - "src/format.ts"
  - "src/types.ts"
  - "test/catalog.test.ts"
  - "test/ecc-skills.test.ts"
  - "test/evidence.test.ts"
  - "test/helpers/git-fixture.ts"
  - "test/ignore-list.test.ts"
  - "test/pack-catalog.test.ts"
  - "test/preview.test.ts"
  - "test/project-plan.test.ts"
  - "test/project.test.ts"
covered_digest: "v1:sha256:607480c57eae1c76ff50066f5ac6fcfc74e2abc59efb77f390d5532d5cb410e8"
behavior_unverified: 0
overrides_applied: 0
gaps:
  - truth: "User can select a canonical project root and observe that detection stops at nested repository and worktree boundaries without borrowing evidence from parents, siblings, aliases, or unrelated repositories."
    status: failed
    reason: "Two independently reproduced defects. (a) CR-01: every `project` verb fails to terminate on a git-tracked workspace that contains a sub-project — the single most common real shape (a monorepo). (b) CR-02: a directory junction inside the canonical root does not merely borrow evidence from an alias, it ERASES the real directory, flipping pack selection."
    artifacts:
      - path: "src/core/evidence.ts"
        issue: "resolveCanonicalRoot (:97-109) climbs to the `.git` root for ANY input path. Called with a sub-project path by planSubProject/describeSubProjects it returns the same root, so sub-project discovery re-finds the same member and recurses without bound. Verified: identical 2-file fixture (root package.json + sub/package.json) exits 0 in <1s with `.git` absent and exits 124 with 0 bytes of output after 45s with `.git` present."
      - path: "src/core/project-plan.ts"
        issue: "describeSubProjects (:1117-1126) and planSubProject (:1104-1113) recurse into planProjectCapabilities with the sub-project path but pass no explicit root, so the canonical-root ladder undoes the descent. `--project <rel>` is NOT a workaround: it hangs identically."
      - path: "src/core/evidence.ts"
        issue: "identityKeys (:382) / visited-identity exclusion (:536-538) key a directory by its canonical target. A junction `aaa -> src` is listed first in ascending name order, claims `src`'s identity, and the real `src` is then dropped as already-visited. Verified: BROWNFIELD_INIT went from `selected` (src detected) to `near-miss` after adding an unrelated junction, with the emitted reason falsely stating `none of the declared directories exists under the canonical root: src, lib, app, pkg, internal`."
      - path: "test/project-plan.test.ts"
        issue: "Sub-project planning is tested only on non-git mkdtemp fixtures (:678, packages/api + packages/web). `test/helpers/git-fixture.ts` exists but the git-root + sub-project combination is never driven through planProjectCapabilities, so a fully green 382-test suite coexists with a product that hangs."
    missing:
      - "A canonical-root descent that honours an explicit sub-project root, so planSubProject/describeSubProjects terminate under a git root (e.g. pass the member path as the explicit-override rung, or carry a visited-root set through the recursion)."
      - "A regression fixture combining a `.git` entry with a nested manifest, driven end-to-end through `project plan`, `project plan --project`, `project status` and `project approve`, each under a hard timeout."
      - "A directory identity key that distinguishes a link from its target, so an alias cannot evict the real directory from the walk."
      - "A regression fixture asserting that adding a junction/symlink inside the canonical root changes neither the fact set nor pack selection."
  - truth: "User can inspect the exact versioned files, dependencies, entrypoints, configuration, and manifest facts that selected each pack, plus reasons near-matches failed; a generic `AGENTS.md` alone never selects an agent-runtime pack."
    status: partial
    reason: "The AGENTS.md clause and the positive-evidence rendering are genuinely verified. The failure is in the NEGATIVE half, which is the half DETC-03 exists to make trustworthy: a stated reason can be actively false, and a refused or truncated scan is reported as a confident complete answer."
    artifacts:
      - path: "src/core/evidence.ts"
        issue: "CR-02 makes the negative reason a false statement, not merely a missing one: `none of the declared directories exists under the canonical root: src, ...` was emitted while `src` demonstrably existed and had been detected moments earlier on the same fixture."
      - path: "src/core/evidence.ts"
        issue: "CR-03: `bounds` and `excludedBoundaries` are built (:413-419, :571-572) and carried into the envelope (:1173-1174), but no consumer outside evidence.ts reads them — `grep -rn 'ScanBound|MAX_SCAN_ENTRIES|MAX_SCAN_DEPTH|visited-identity' src/ | grep -v evidence.ts` returns nothing. Verified: a fixture whose only manifest sat behind a nested-repository boundary printed `No pack qualified on the evidence found.` with zero disclosure, in text, in `--why`, and in `--json` (0 occurrences of `bounds` or `excludedBoundaries`)."
      - path: "src/core/evidence.ts"
        issue: "The comment at :205-208 states excludedBoundaries is carried `for tests and for --why`. That claim is false in shipped code: `--why` renders neither boundary exclusions nor scan bounds. A source comment asserting a user-facing disclosure that does not exist is itself a trust defect in a phase whose goal is honest explanation."
    missing:
      - "A scan-completeness line in `project plan` (at minimum under `--why`, and a field in `--json`) that reports when the walk hit MAX_SCAN_DEPTH, MAX_SCAN_ENTRIES, MAX_SUB_PROJECTS, or a visited-identity collision, so `No pack qualified` cannot be printed over a truncated scan."
      - "Either surface excludedBoundaries under `--why` as the comment already claims, or correct the comment to match the code."
      - "A negative-reason invariant: a `none of the declared directories exists` reason must not be emitted for a directory the walk actually saw and excluded."
  - truth: "When evidence for an installed pack disappears, the user sees `STALE` with the missing evidence identified and no automatic deletion."
    status: partial
    reason: "The DETC-06 logic itself is correct and was verified end-to-end. It fails on two inherited paths: `project status` crashes on an attacker-supplied `.alpha-aos/plan.json` (CR-04) at exactly the moment a pack goes stale, and `project status` does not terminate on a git repo with a sub-project (CR-01)."
    artifacts:
      - path: "src/core/project-plan.ts"
        issue: "readApprovedProjectPlan (:1306-1319) reads `.alpha-aos/plan.json` with a bare `JSON.parse` plus three shallow checks, bypassing `validateManagedDocument` — the strict route every other managed document uses (receipts at :1682, catalog, manifest, fact vocabulary). `.gitignore` selectively ignores `.alpha-aos/install-state.json`, `journal/`, `snapshots/` and `evidence/` but NOT `plan.json`, confirming the artifact is intended to be committed and is therefore attacker-supplied on clone."
      - path: "src/core/project-plan.ts"
        issue: "At :1905, `(approvedEvaluation?.satisfied ?? []).filter(...)` guards only nullish. Reproduced: setting `plan.evaluations[i].satisfied` to a string and removing the evidence makes `project status` exit 2 with `((intermediate value) ?? []).filter is not a function` instead of reporting STALE. The crash is reachable only on the stale path, which is precisely the DETC-06 path."
    missing:
      - "Route `.alpha-aos/plan.json` through `validateManagedDocument` against a closed schema, as every other managed document already is."
      - "Make reconcileProjectState defensive about array-shaped fields from a read artifact (or rely on the validator to guarantee them)."
      - "A regression fixture that runs `project status` against a structurally poisoned `.alpha-aos/plan.json` and asserts a domain refusal rather than a TypeError."
deferred:
  - truth: "Cross-host Unicode path normalization (macOS NFD vs Linux NFC naming the same file) produces identical digests."
    addressed_in: "Phase 7"
    evidence: "Phase 7 goal: 'Users receive one v0.1.0 package whose behavior, contents, provenance, support claims, and complete brownfield workflow are proven against the same frozen bytes.' 02-08 explicitly defers this to the Phase 7 three-OS matrix."
  - truth: "SECURITY_REVIEW can select on detected risk facts rather than rendering as `unimplemented`."
    addressed_in: "Phase 4"
    evidence: "All eight SECURITY_REVIEW leaves carry `deferredTo: GATE-01`; Phase 4 goal is 'Mandatory GSD Gates'. Verified at HEAD: SECURITY_REVIEW renders as UNIMPLEMENTED naming all eight facts and GATE-01, which is the honest disposition."
  - truth: "DETC-06's 'previously installed' covers a pack approved but never materialized."
    addressed_in: "Phase 3"
    evidence: "Phase 3 goal: 'Users can obtain optional capabilities in exactly the intended scope...' — Phase 3 owns receipt writing, which is the state reconcileProjectState reads. Carried by 02-10 as WINDOWS #15."
human_verification:
  - test: "Decide the intended RUNG ORDER of the canonical-root ladder (explicit override -> git root -> project declaration -> standalone directory) and whether `worktree-root`, `submodule-root` and `project-declaration` should ever be produced."
    expected: "A stated ordering that DETC-01 can be verified against."
    why_human: "`RootReason` (src/core/evidence.ts:28-34) declares six rungs; `resolveCanonicalRoot` produces only three (`explicit-override`, `git-root`, `standalone-directory`). No source artifact establishes the intended order, so no reading can be falsified from the repository. Carried by 02-05 as coverage entry D9 with `human_judgment: true`. Note: behaviourally the boundary still holds — `isGitBoundary` is `existsSync('.git')`, which matches a `.git` FILE, so a worktree/submodule root does stop the climb; only the reported reason is coarser than the type promises."
  - test: "Decide how D-13 drift classification should behave at the CLI when no `.alpha-aos/plan.json` exists yet."
    expected: "Either a reviewed-plan record the preview is permitted to write, or the must-have truth scoped to callers that hold the plan value."
    why_human: "Verified at HEAD: with a prior artifact the refusal correctly says `selection-changed: ... joined WEB_BASE, WEB_REACT`. Without one it honestly says `The reviewed plan value is not available here, so what moved cannot be named`. This is a consequence of D-12 plus SAFE-01, not a patchable bug — it needs a product decision. Carried as WINDOWS #14."
  - test: "Give `node scripts/pin-pack-skills.mjs check` a CI or release-checklist home."
    expected: "The catalog/lock drift check runs somewhere on a schedule a human sees."
    why_human: "Confirmed at HEAD: `grep -rn pin-pack-skills .github/ package.json` returns nothing, and the repository has only `ci.yml` and `dependency-candidate.yml`. The check needs the network so it is deliberately outside `npm test`; where it belongs is a maintainer policy decision, not a code fix."
---

# Phase 2: Evidence-Bound Project Planning Verification Report

**Phase Goal:** Users receive reproducible project-pack decisions and reviewed plans that are bound to one canonical repository state and explain both matches and non-matches.
**Verified:** 2026-09-08T06:55:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

The engineering under this phase is, in most places, unusually careful: the
no-short-circuit predicate evaluator, the nine-noun plan envelope with an
explicit `null` executable, the byte-identical text and JSON output, the offline
git-context reader, and the STALE-with-named-fact reconciliation all do exactly
what they claim, and I verified each by running the built CLI rather than by
reading a SUMMARY.

The goal is nonetheless not achieved. It has two halves — "bound to one
canonical repository state" and "explain both matches and non-matches" — and
each has a reproduced defect that lands squarely on it. The first half does not
terminate at all on a git repository containing a sub-project. The second half
can emit an explanation that is not merely incomplete but false.

The signature to note is that all 382 tests pass. Every phase-2 fixture is a
bare `mkdtemp` directory, so the suite never observes the interaction between a
`.git` entry and a nested manifest. Task completion is high and evenly
distributed; goal achievement is not.

### Observable Truths

| # | Truth (ROADMAP Success Criterion) | Status | Evidence |
|---|---|---|---|
| 1 | Canonical root selected; detection stops at nested repo/worktree boundaries without borrowing from parents, siblings, aliases, or unrelated repos | ✗ FAILED | Alias ADDRESSING verified: junction -> fixture yields identical root, `Project id: 23a966271a979843`, `Plan digest: 5127…af8`. Nested-repo boundary verified: `nested/.git` fixture borrowed nothing. But CR-01 reproduced (git + sub-project: exit 124, 0 bytes at 45s, vs exit 0 in <1s without `.git`; `--project`, `status`, `approve` all hang identically), and CR-02 reproduced (junction `aaa -> src` flipped BROWNFIELD_INIT from selected to near-miss). |
| 2 | Exact files/deps/entrypoints/config/manifest facts that selected each pack, plus reasons near-matches failed; generic `AGENTS.md` alone never selects an agent-runtime pack | ✗ FAILED | AGENTS.md clause VERIFIED: `NEAR-MISS AGENT_RUNTIME: A generic agent-instruction file or skill directory (AGENTS.md) — missing: An agent-orchestration framework is a declared dependency`. Positive evidence VERIFIED: `SELECT BROWNFIELD_INIT: … (src)` and full `--why` leaf detail. FAILED on the negative half: CR-02 produced an actively false reason, and CR-03 confirmed a boundary-excluded scan prints `No pack qualified on the evidence found.` with no disclosure in text, `--why`, or `--json`. |
| 3 | Repeated detection of unchanged inputs produces stable text and JSON plans exposing scope, owner, exact source version and hash, renderer, target pre-state, adapter support, approvals, safe inverse | ✓ VERIFIED | Two consecutive runs byte-identical in BOTH modes (`cmp` -> YES/YES). All nine nouns present as named fields, plus `executable: null` with `executableDisposition`, plus three digests. `source[0]` carries `version: 2.2.0`, `integrity: sha512-…`, `sourceSha256: 14e7b204…`. Scope caveat: on the CR-01 shape no plan is produced at all; that defect is recorded under truth 1 rather than double-counted here. |
| 4 | Applying a reviewed plan is refused if evidence, manifest, stable lock, renderer, executable, adapter capability, or target bytes changed after review | ✓ VERIFIED | Evidence-drift leg verified at the CLI: `plan-drift: selection-changed: … joined WEB_BASE, WEB_REACT; left none (reviewed bee79b3276b2, observed 4558a97a1fa3)` with a runnable re-approval command. Remaining nouns verified behaviourally by two named single tests, both green: `target-bytes, lock, manifest, adapter-support and inputs changes each get their own classification` and `mutating any one of the seven DETC-05 nouns changes the plan digest`. See WARNING W-1 and human item 2. |
| 5 | When evidence for an installed pack disappears, the user sees `STALE` with the missing evidence identified and no automatic deletion | ✗ FAILED | Happy path VERIFIED and well built: `STALE-FACT BROWNFIELD_INIT — the \`existing-source\` fact (…) that selected it is gone`, a removal plan gated on its own digest, `Read only. project status deletes nothing`, and the receipt still present afterwards. FAILED on two inherited paths: CR-04 reproduced (poisoned `.alpha-aos/plan.json` -> exit 2, `((intermediate value) ?? []).filter is not a function`, on exactly the stale branch), and CR-01 (`project status` hangs on git + sub-project). |

**Score:** 2/5 truths verified (0 present, behavior-unverified)

### Deferred Items

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | Cross-host Unicode NFD/NFC path digest stability | Phase 7 | Phase 7 goal — behavior proven against the same frozen bytes; 02-08 defers to the three-OS matrix |
| 2 | SECURITY_REVIEW risk-fact detectors | Phase 4 | All eight leaves carry `deferredTo: GATE-01`; verified rendering as UNIMPLEMENTED naming GATE-01 |
| 3 | "Previously installed" for an approved-but-never-materialized pack | Phase 3 | Phase 3 owns receipt writing; WINDOWS #15 |

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `src/core/evidence.ts` | Boundary walk, canonical root, six detector kinds | ⚠️ HOLLOW | Substantive and wired, but carries CR-01's root-climb, CR-02's identity collision, and CR-03's write-only `bounds`/`excludedBoundaries` |
| `src/core/project-plan.ts` | Plan envelope, approval, reconciliation | ⚠️ HOLLOW | Nine nouns and drift refusal verified; CR-01 recursion and CR-04 unvalidated read path present |
| `src/core/pack-catalog.ts` | Strict catalog + fact vocabulary load | ✓ VERIFIED | 15 packs / 31 facts load through `validateManagedDocument`; duplicate and undeclared-fact refusals covered by suite |
| `src/core/ignore-list.ts` | Ignore membership without git | ✓ VERIFIED | No subprocess (`grep` for child_process returns only RegExp `.exec`); comment at :6 matches code |
| `catalog/facts.yaml` | 31 declared facts, six kinds | ✓ VERIFIED | Verified via rendered leaf descriptions in `--why` |
| `catalog/stack.lock.json` | `sourceSha256` for every pack skill | ✓ VERIFIED | Plan `source[0]` resolves package/version/integrity/sourceSha256 offline |
| `scripts/pin-pack-skills.mjs` | Maintainer pinning script | ⚠️ ORPHANED | Exists and is substantive, but has no CI or release-checklist caller — see human item 3 |
| `schemas/*.schema.json` | Closed contracts | ✓ VERIFIED | Receipt schema is closed-world (`additionalProperties: false`); no schema exists for `.alpha-aos/plan.json` — see CR-04 |
| `test/helpers/git-fixture.ts` | Git-shaped fixtures | ⚠️ ORPHANED for the case that matters | Used by evidence/project-plan tests, but never combined with a sub-project through `planProjectCapabilities` — the exact blind spot CR-01 hides in |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `src/cli.ts project plan` | `project-plan.ts planProjectCapabilities` | CLI branch | ✓ WIRED | Verified by running the built CLI |
| `project-plan.ts` | `evidence.ts collectProjectEvidence` | direct call | ✓ WIRED | Fact records rendered in `--why` |
| `project-plan.ts` | `pack-catalog.ts loadPackCatalogStrict` | strict load | ✓ WIRED | 15 packs enumerated under `--why` |
| `project-plan.ts source` | `catalog/stack.lock.json` | lock read | ✓ WIRED | version + integrity + sourceSha256 in JSON |
| `project-plan.ts readGitContext` | `.git/HEAD`, ref file | offline read | ✓ WIRED | `Branch: main at commit bbbbbbbbbbbb` |
| `evidence.ts scanProjectTree bounds` | any renderer | — | ✗ NOT_WIRED | CR-03: populated, never read outside evidence.ts |
| `evidence.ts excludedBoundaries` | `--why` renderer | — | ✗ NOT_WIRED | Source comment claims this link exists; it does not |
| `readApprovedProjectPlan` | `validation.ts validateManagedDocument` | strict route | ✗ NOT_WIRED | CR-04: bare `JSON.parse` instead |
| `describeSubProjects` | `resolveCanonicalRoot` explicit rung | — | ✗ NOT_WIRED | CR-01: recursion passes no explicit root, so the ladder undoes the descent |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|---|---|---|---|---|
| plan `source[]` | pack skill hashes | `catalog/stack.lock.json` | Yes — real version/integrity/sha256 | ✓ FLOWING |
| plan `adapterSupport` | five harnesses | `catalog/stack.yaml` harness table | Yes — three-value vocabulary with per-harness basis strings | ✓ FLOWING |
| plan `evaluations[]` | leaf results | live evidence envelope | Yes — flips with fixture content | ✓ FLOWING |
| status `STALE-FACT` | missing fact id | recomputed evidence vs approved set | Yes — named `existing-source` after deleting `src/` | ✓ FLOWING |
| plan scan completeness | `bounds`, `excludedBoundaries` | built in evidence.ts | No — terminates in the envelope, never rendered | ✗ DISCONNECTED |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| CR-01 control (no `.git`) | `timeout 60 node dist/src/cli.js project plan <fix>` | exit 0, 1791 bytes, sub-project listed | ✓ PASS |
| CR-01 repro (`.git` added, same fixture) | `timeout 45 … project plan <fix>` | **exit 124, 0 bytes** | ✗ FAIL |
| CR-01 `--project` workaround | `timeout 45 … project plan <fix> --project sub` | **exit 124, 0 bytes** | ✗ FAIL |
| CR-01 on `status` | `timeout 45 … project status <fix>` | **exit 124, 0 bytes** | ✗ FAIL |
| CR-01 on `approve` | `timeout 40 … project approve … --apply` | **exit 124, 0 bytes**, no `.alpha-aos/` residue | ✗ FAIL |
| CR-02 control (real `src/`) | `… project plan <fix> --why` | `SELECT BROWNFIELD_INIT … (src)` | ✓ PASS |
| CR-02 repro (junction `aaa -> src`) | same command after `New-Item -ItemType Junction` | `[near-miss] … none of the declared directories exists under the canonical root: src, lib, app, pkg, internal` | ✗ FAIL |
| CR-03 boundary disclosure | `… project plan <nested-repo-fix>` and `--why` and `--json` | `No pack qualified on the evidence found.`; 0 occurrences of `bounds`/`excludedBoundaries` | ✗ FAIL |
| CR-04 repro | poisoned `plan.json` + evidence removed, `project status` | **exit 2**, `((intermediate value) ?? []).filter is not a function` | ✗ FAIL |
| DETC-06 happy path | `project status` after deleting `src/` | `STALE` + `STALE-FACT … existing-source` + digest-gated removal + receipt intact | ✓ PASS |
| DETC-05 drift refusal | `project approve --plan-digest <stale> --apply` | `plan-drift: selection-changed … joined WEB_BASE, WEB_REACT` | ✓ PASS |
| DETC-05 drift, no prior artifact | same, fresh fixture | honest refusal: `The reviewed plan value is not available here, so what moved cannot be named` | ✓ PASS |
| DETC-04 determinism | 2x text, 2x `--json`, `cmp -s` | identical / identical | ✓ PASS |
| DETC-04 nine nouns | JSON key inspection | all nine + `executable: null` + `executableDisposition` + 3 digests | ✓ PASS |
| DETC-03 AGENTS.md clause | `project plan <AGENTS.md-only>` | near-miss naming the missing framework leaf; not selected | ✓ PASS |
| Alias addressing (02-01 truth) | plan via junction vs direct | identical root, projectId, plan digest | ✓ PASS |
| Git context offline | `project status` on `.git` fixture | `Branch: main at commit bbbbbbbbbbbb` | ✓ PASS |
| Named test: multi-noun drift | `node --test --test-name-pattern="target-bytes, lock, manifest, adapter-support and inputs changes each get their own classification"` | pass 1, fail 0 | ✓ PASS |
| Named test: seven-noun digest | `node --test --test-name-pattern="mutating any one of the seven DETC-05 nouns changes the plan digest"` | pass 1, fail 0 | ✓ PASS |
| Full suite (run once) | `npm test` | tests 382, pass 377, fail 0, skipped 5 | ✓ PASS |

### Probe Execution

| Probe | Command | Result | Status |
|---|---|---|---|
| — | — | No `scripts/*/tests/probe-*.sh` exists and no PLAN declares one | ? SKIP |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|---|---|---|---|---|
| DETC-01 | 02-01, 02-03, 02-05 | Canonical root; detection stops at boundaries | ✗ BLOCKED | CR-01 non-termination on git + sub-project; CR-02 alias erases real evidence |
| DETC-02 | 02-01, 02-06 | Positive versioned evidence per selected pack | ✓ SATISFIED | Positive rendering verified in default and `--why` output; inherits DETC-01's detection defects |
| DETC-03 | 02-02, 02-07 | Why a near-match failed; `AGENTS.md` cannot activate agent-runtime | ✗ BLOCKED | AGENTS.md clause verified; near-miss reason can be actively false (CR-02) and truncation/exclusion undisclosed (CR-03) |
| DETC-04 | 02-01, 02-04, 02-08 | Stable text and JSON plans with nine nouns | ✓ SATISFIED | Byte-identical both modes; all nouns present with real values from the lock |
| DETC-05 | 02-09 | Refuse apply after any watched noun changed | ✓ SATISFIED | CLI evidence-drift leg + two named tests covering the other six nouns; W-1 and human item 2 attached |
| DETC-06 | 02-10 | `STALE` on disappeared evidence, no auto-deletion | ✗ BLOCKED | Correct on the clean path; crashes on a committed poisoned `plan.json` (CR-04) and hangs on git + sub-project (CR-01) |

**Orphaned requirements:** none. REQUIREMENTS.md maps exactly DETC-01..DETC-06 to Phase 2 and all six are claimed by plan frontmatter.

**Traceability discrepancy:** REQUIREMENTS.md marks all six Complete (lines 27-32 and 135-140). Three (DETC-01, DETC-03, DETC-06) are BLOCKED by this verification and should not be carried as Complete into Phase 3 planning.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|---|---|---|---|---|
| `src/core/evidence.ts` | 97-109 / 1104-1126 (project-plan.ts) | Unbounded recursion | 🛑 Blocker | CR-01 — every `project` verb hangs on a monorepo |
| `src/core/evidence.ts` | 382, 536-538 | Aliasing identity collision | 🛑 Blocker | CR-02 — alias evicts real directory; false negative reason |
| `src/core/evidence.ts` | 413-419, 571-572, 1173-1174 | Computed-but-unread state | 🛑 Blocker | CR-03 — silent truncation reported as a confident answer |
| `src/core/project-plan.ts` | 1306-1319, 1905 | Unvalidated parse of a committed document + unguarded `.filter` | 🛑 Blocker | CR-04 — crash on the DETC-06 path from attacker-supplied bytes |
| `src/core/evidence.ts` | 205-208 | Comment asserts a link the code does not have | ⚠️ Warning | Misleads the next reader about `--why` disclosure |
| `src/core/evidence.ts` | 28-34 vs 97-109 | Declared-but-unreachable enum members | ⚠️ Warning (W-2) | `worktree-root`, `submodule-root`, `project-declaration` never produced |
| `scripts/pin-pack-skills.mjs` | — | No caller | ⚠️ Warning (W-3) | Catalog/lock can drift silently |
| — | — | Debt markers (`TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER`) | ℹ️ Info | **Zero** found across `src/`, `catalog/`, `schemas/`, `scripts/`, `test/` — the debt-marker gate passes cleanly |

**W-1 (DETC-05):** CR-04's unvalidated read path feeds the approval machinery. I traced the consequence and it does NOT bypass the refusal: `assertPlanUnchanged` compares freshly computed values, not artifact contents. The exposure is the idempotency check at `:1343`, where an attacker-chosen `approvedDigest` matching the current plan digest would yield a false "already current" — a denial, not a wrongful write. Recorded as a warning on DETC-05 and a blocker on DETC-06, where it crashes.

### Prohibitions

| Prohibition | Status | Evidence |
|---|---|---|
| `project plan` persists nothing; no `--apply` | ✓ VERIFIED | `Preview only. Nothing was written`; residue check after every preview fixture found no `.alpha-aos/` |
| No `git` subprocess, no package manager, no network | ✓ VERIFIED | `grep -n "spawn\|execFile\|child_process"` across evidence/project-plan/ignore-list/pack-catalog returns only RegExp `.exec` matches; no `fetch`/`https` |
| Git branch/commit excluded from every digest | ✓ VERIFIED | Branch context rendered in `status` while plan digests stayed stable across runs; covered by the named seven-noun digest test |
| Managed documents not read with a bare parse | ✗ VIOLATED | CR-04: `.alpha-aos/plan.json` is the one exception, and it is the one document intended to be committed |
| Stale evidence never triggers automatic deletion | ✓ VERIFIED | Removal offered under its own digest; receipt file still present after `status` |
| A `STALE` line names the missing fact, not just the pack | ✓ VERIFIED | `STALE-FACT … the \`existing-source\` fact … that selected it is gone` |

### Human Verification Required

Three items need a decision rather than a patch. All three are already carried
by the executors themselves; none is a rediscovery.

#### 1. Canonical-root ladder rung order

**Test:** Decide the intended order and whether `worktree-root`,
`submodule-root` and `project-declaration` should ever be produced.
**Expected:** A stated ordering DETC-01 can be verified against.
**Why human:** `RootReason` declares six rungs; only three are reachable. No
source artifact establishes the intended order. The boundary itself still holds
(`isGitBoundary` is `existsSync('.git')`, which matches the `.git` FILE of a
worktree or submodule), so this is a labelling and contract question, not a
correctness one. Carried as 02-05 coverage entry D9.

#### 2. D-13 drift classification at the CLI

**Test:** Decide between a reviewed-plan record the preview may write, or
scoping the truth to callers holding the plan value.
**Expected:** Either a refusal that names the moved noun in all cases, or a
must-have narrowed to match D-12 + SAFE-01.
**Why human:** Both branches were observed working as designed and neither
lies. Closing the gap requires trading a stated safety property against a
diagnostic one. Carried as WINDOWS #14.

#### 3. `pin-pack-skills.mjs check` has no home

**Test:** Give the drift check a CI job or a release-checklist step.
**Expected:** Catalog/lock drift is detected on a cadence a human sees.
**Why human:** The check needs the network, so it is correctly outside
`npm test`; where it belongs is maintainer policy. Confirmed at HEAD that
nothing references it.

### Broken Windows Ledger Disposition

| Entry | Disposition | Basis |
|---|---|---|
| #12 (`project plan` does not name source version and hash) | **STALE — mark fixed** | Verified at HEAD: `source[0]` carries `version: 2.2.0`, `integrity: sha512-jk3Zedc7…`, `sourceSha256: 14e7b204…`. 02-09 and 02-10 both flagged this entry as stale and left disposal here; it is disposed. |
| #13 (MAX_SCAN_DEPTH test flake) | Remains open | Not reproduced in this run; the full suite was green. Insufficient evidence to close a flake on one green run. |
| #14 (D-13 CLI partial) | Remains open | Reproduced verbatim; routed to human item 2. |
| #15 (receipt semantics) | Remains open | Deferred to Phase 3; recorded in `deferred`. |
| New | Four new blocker entries recommended | CR-01, CR-02, CR-03, CR-04 — all reproduced here, none covered by a later phase. |

### Gaps Summary

Three of five success criteria are not achieved, and the four root causes are
independent of each other.

**CR-01 is the one that decides the phase.** A git repository containing a
sub-project — a monorepo, the shape D-01 and D-02 exist to serve — makes
`project plan`, `project plan --project`, `project status` and `project approve`
all fail to terminate. There is no workaround from the command line. Criterion 1
is not merely degraded there, it is unreachable, and criteria 3 and 5 are
unreachable with it. The defect is two lines of intent apart: the recursion
descends into a sub-project, and the canonical-root ladder climbs straight back
out. Nothing in the suite sees it because no fixture has both a `.git` entry and
a nested manifest.

**CR-02 is the one that matters most for trust.** A directory junction does not
cause alpha-AOS to borrow evidence from an alias — it causes alpha-AOS to lose
the real directory and then state, in the output a user is meant to rely on,
that the directory does not exist. A phase whose goal is to "explain both
matches and non-matches" cannot ship an explanation that is false on a
one-command reproduction.

**CR-03 and CR-04 are smaller but land on the same two criteria.** A truncated
or boundary-refused scan is rendered as a confident "No pack qualified on the
evidence found", with the disclosure data computed and then discarded — and a
source comment claiming `--why` shows it, which it does not. And
`.alpha-aos/plan.json`, the only managed document in the system that is meant
to be committed and is therefore attacker-supplied on clone, is the only one
that skips the strict validator; a structurally poisoned copy turns the DETC-06
stale report into a TypeError.

What is genuinely done, and done well, should not be lost in the gap list: the
nine-noun plan envelope with an honest `null` executable, byte-identical text
and JSON across runs, source hashes resolved offline from the lock, the
seven-noun drift refusal with runnable re-approval, the offline git context, the
`AGENTS.md` near-miss, and the STALE report that names the missing fact and
deletes nothing. Those are five of the six requirements' hardest parts. The
gaps are concentrated in the interaction between the boundary walk and the
recursion, and in the two places where computed honesty data never reaches the
user.

---

_Verified: 2026-09-08T06:55:00Z_
_Verifier: Claude (gsd-verifier)_
