---
phase: 02-evidence-bound-project-planning
plan: 06
subsystem: api
tags: [evidence, detectors, facts-vocabulary, package-json, pyproject, requirements-txt, go-mod, cargo-toml, determinism, node-test]

# Dependency graph
requires:
  - phase: 02-evidence-bound-project-planning
    provides: "02-05's bounded, boundary-proven scanProjectTree, its ignore-list-faithful exclusion, and the ReadLedger digest this plan extends into a readInputs list"
  - phase: 02-evidence-bound-project-planning
    provides: "02-02's catalog/facts.yaml declared vocabulary, loadFactVocabularyStrict, and the six detector kinds with their load-time invariants"
  - phase: 02-evidence-bound-project-planning
    provides: "02-01's canonical root ladder, the sealed evidence envelope, and the flat evidence: string[] tracer this plan replaces"
  - phase: 01-safe-operation-boundary
    provides: "provePathBoundary containment proofs, the strict parseManagedDocument JSON/YAML/TOML routes, validateManagedDocument, and 01-19's ENOENT-vs-other-errno precedent"
provides:
  - "detectFact: the six detector kinds (dependency, file, directory, manifestKey, fileAbsent, fileContent), driven entirely by catalog/facts.yaml"
  - "readDeclaredDependencies: package.json, pyproject.toml (PEP 621 + poetry + PEP 735), requirements.txt, go.mod and Cargo.toml behind one name-to-manifest index"
  - "lookupDependency: the inline-literal resolution surface anyDependencies/anyFiles predicates need, with PEP 503 name normalization for Python"
  - "buildEvidenceEnvelope: one record per declared fact, positive and negative, ordered, hash-free, valid against schemas/evidence.schema.json"
  - "digestableEvidence: the one literal both the envelope and the plan digest are built from"
  - "openDetectionContext / DetectionContext: the shared read-once surface plan 02-07's evaluator will consume"
  - "MAX_EVIDENCE_FILE_BYTES, MAX_CONTENT_MATCH_BYTES, MAX_CONTENT_FILES: every evidence read and match bounded by a named constant"
  - "UNDECIDABLE evidence: a non-ENOENT errno carries the errno and the path rather than becoming a confident absence"
  - "Retirement of the hardcoded rule engine, its flat ProjectDetection model, its formatter, and the project detect route"
affects: [02-07, 02-08, 02-09, 02-10, phase-3-capability-materialization]

actuals:
  tokens: 21486
  tasks: 3
  commits: 5
plan_head_before: 70cde464476541c5d80a7995914516383206e369

tech-stack:
  added: []
  patterns:
    - "Detector kinds are code; detector instances are data — every parameter arrives from catalog/facts.yaml, never from a TypeScript literal"
    - "Unrepresentable-by-type secrecy: the fileContent detector returns exactly { matched, path }, so redaction is the second net rather than the first"
    - "Absence, boundedness and unreadability are three different answers, each carrying its own reason"
    - "One literal in one place for every digested object, with createdAt excluded by construction rather than by deletion"

key-files:
  created: []
  modified:
    - src/core/evidence.ts
    - src/core/project.ts
    - src/core/project-plan.ts
    - src/types.ts
    - src/format.ts
    - src/cli.ts
    - test/evidence.test.ts
    - test/project.test.ts

key-decisions:
  - "An evidence file that exists but fails to read with a non-ENOENT errno reports UNDECIDABLE carrying the errno and the path — never STALE, never a silent absence. This reuses plan 01-19's precedent one layer down rather than inventing a second story about unreadable paths."
  - "A directory bearing a declared file's name reports EISDIR, which makes the unreadable-evidence case testable on every supported host without a privileged fixture."
  - "A malformed dependency manifest is UNDECIDABLE rather than a thrown error: the retired tracer crashed `project plan` on any package.json it could not parse unambiguously."
  - "The envelope carries EXACTLY the declared vocabulary. `anyDependencies` names inline package literals, not declared fact ids, so it resolves against the dependency index and synthesizes its explaining fact id — the same split Pattern 3 describes."
  - "`.alpha-aos/stack.yaml` is read directly rather than through the scan's ignore decision: it is the user's own opt-in, not scanned repository evidence, and `.alpha-aos/` is routinely gitignored."
  - "PEP 503 name normalization is applied to Python manifests only, so a Go module path or an npm name cannot acquire a spurious alias."
  - "`project detect` is folded into `project plan` rather than aliased — two entry points would keep two answers to one question."

patterns-established:
  - "Named-cap refusals: every bound that stops a read is reported with the constant's own name in the reason (MAX_EVIDENCE_FILE_BYTES, MAX_CONTENT_MATCH_BYTES, MAX_CONTENT_FILES)"
  - "Completeness-first invariants: a test asserting a property of the envelope asserts the envelope covers the whole vocabulary first, so a shrinking fact set cannot walk through the net"
  - "Code-point ordering, never localeCompare, on any array that reaches a digest or an emitted document"

requirements-completed: [DETC-02]

coverage:
  - id: D1
    description: "A dependency fact resolves from five ecosystems — package.json, pyproject.toml, requirements.txt, go.mod and Cargo.toml — recording the declaring manifest as its path and the declared range as its version"
    requirement: "DETC-02"
    verification:
      - kind: unit
        ref: "test/evidence.test.ts#a dependency fact resolves from package.json and records the declared range"
        status: pass
      - kind: unit
        ref: "test/evidence.test.ts#the same dependency fact id resolves from pyproject.toml and from requirements.txt"
        status: pass
      - kind: unit
        ref: "test/evidence.test.ts#a Go module in go.mod and a crate in Cargo.toml both resolve"
        status: pass
    human_judgment: false
  - id: D2
    description: "The file, directory, manifestKey, fileAbsent and fileContent detectors each answer for the declarations catalog/facts.yaml gives them, and a directory fact never matches a file bearing its name"
    requirement: "DETC-02"
    verification:
      - kind: unit
        ref: "test/evidence.test.ts#a file fact records which of its declared alternatives matched"
        status: pass
      - kind: unit
        ref: "test/evidence.test.ts#a directory fact matches a directory and never a file bearing its name"
        status: pass
      - kind: unit
        ref: "test/evidence.test.ts#a manifestKey fact contributes only from a current, valid project manifest"
        status: pass
      - kind: unit
        ref: "test/evidence.test.ts#a fileAbsent fact detects the absence of every declared alternative"
        status: pass
    human_judgment: false
  - id: D3
    description: "A fileContent detection cannot represent the text it matched — the return type has exactly { matched, path } — so a credential-bearing DSN is uncapturable rather than merely redacted (T-02-03)"
    requirement: "DETC-02"
    verification:
      - kind: unit
        ref: "test/evidence.test.ts#a fileContent fact reports where it matched and cannot represent what it matched"
        status: pass
    human_judgment: false
  - id: D4
    description: "Every evidence read is bounded by a named constant and an unreadable file reports UNDECIDABLE with its errno and path rather than a confident absence (T-02-22, T-02-23)"
    requirement: "DETC-02"
    verification:
      - kind: unit
        ref: "test/evidence.test.ts#an evidence file over MAX_EVIDENCE_FILE_BYTES is not matched and the cap is the reason"
        status: pass
      - kind: unit
        ref: "test/evidence.test.ts#an evidence file that exists but cannot be read is UNDECIDABLE, never a confident absence"
        status: pass
    human_judgment: false
  - id: D5
    description: "The envelope carries one record for every declared fact, positive and negative, every negative carries a reason, no record carries a hash, and it validates against schemas/evidence.schema.json as a current document"
    requirement: "DETC-02"
    verification:
      - kind: unit
        ref: "test/evidence.test.ts#the evidence envelope validates against schemas/evidence.schema.json as a current document"
        status: pass
      - kind: unit
        ref: "test/evidence.test.ts#every fact declared in catalog/facts.yaml appears in the envelope exactly once"
        status: pass
      - kind: unit
        ref: "test/evidence.test.ts#every negative record carries a reason"
        status: pass
      - kind: unit
        ref: "test/evidence.test.ts#no record carries a per-fact hash"
        status: pass
      - kind: unit
        ref: "test/evidence.test.ts#a repository containing nothing still answers for every declared fact"
        status: pass
    human_judgment: false
  - id: D6
    description: "Two runs over an unchanged repository agree on facts and sourceHash while createdAt differs, facts are emitted in one total order, and a gitignored evidence file contributes nothing (T-02-24)"
    requirement: "DETC-02"
    verification:
      - kind: unit
        ref: "test/evidence.test.ts#two runs over an unchanged repository agree on facts and sourceHash while createdAt differs"
        status: pass
      - kind: unit
        ref: "test/evidence.test.ts#facts are emitted in one total order — ascending id, then ascending path"
        status: pass
      - kind: unit
        ref: "test/evidence.test.ts#a gitignored evidence file contributes no fact and an unignored one does"
        status: pass
      - kind: e2e
        ref: "test/project-plan.test.ts#two concurrent project plan invocations are byte-identical"
        status: pass
    human_judgment: false
  - id: D7
    description: "The hardcoded rule engine, its flat model, its formatter and the project detect route are gone, and the two behavioural cases that outlived them assert against the plan's selected pack ids"
    verification:
      - kind: unit
        ref: "test/project.test.ts#pack selection comes only from positive repository evidence"
        status: pass
      - kind: unit
        ref: "test/project.test.ts#an instructions document alone does not activate the agent runtime pack"
        status: pass
      - kind: integration
        ref: "npm run check (strict mode enumerates every consumer of a removed export)"
        status: pass
    human_judgment: false
  - id: D8
    description: "`alpha-aos project plan .` runs against this repository and reports a decision with all three digests"
    verification:
      - kind: manual_procedural
        ref: "node dist/src/cli.js project plan . (exit 0)"
        status: pass
    human_judgment: true
    rationale: "The CLI exits 0 and the observations are asserted by test, but whether the SELECTED SET is right for this repository cannot be judged until plan 02-07 supplies evaluators for the other four predicate operators. Today the plan selects nothing where the retired route reported MCP_SERVER — see Deviations."

# Metrics
duration: 35 min
completed: 2026-09-07
status: complete
---

# Phase 02 Plan 06: Evidence Detectors and the Complete Envelope Summary

**Six declaration-driven detector kinds and five dependency-manifest readers replacing a hardcoded rule engine, producing one ordered, reason-bearing record for every fact in `catalog/facts.yaml` — positive and negative — inside an envelope that is byte-stable across runs and cannot represent a matched secret.**

## Performance

- **Duration:** 35 min
- **Started:** 2026-09-07T16:53:31Z
- **Completed:** 2026-09-07T17:28:54Z
- **Tasks:** 3
- **Files modified:** 8

## Accomplishments

- **Dependency evidence now resolves from five ecosystems instead of one.** `package.json`
  (`dependencies` / `devDependencies` / `peerDependencies`), `pyproject.toml` (PEP 621
  `[project].dependencies`, `[tool.poetry.dependencies]`, PEP 735 `[dependency-groups]`),
  `requirements.txt`, `go.mod` (both `require` forms) and `Cargo.toml` (`[dependencies]`,
  `[dev-dependencies]`, `[build-dependencies]`) all feed one name-to-manifest index. This is what
  first makes the migrated `psycopg2` / `asyncpg` / `gin` / `actix-web` entries reachable — under
  the `package.json`-only reader they were unreachable code.
- **Every declared fact produces a record, positive or negative, and every negative says why.**
  A repository with nothing in it now yields 31 records rather than an empty array, so "not
  detected" and "not checked" stopped being the same output — which is what DETC-03's explanation
  will be built on.
- **The `fileContent` detector cannot leak.** Its return type is exactly `{ matched, path }`;
  there is no field a matched DSN could occupy. A test asserts `Object.keys` on the result equals
  that set, and the rich fixture carries `postgres://admin:hunter2@db.internal:5432/app` and
  asserts `hunter2` appears nowhere in the serialized detection.
- **Unreadability is now its own answer.** A file that exists but fails to read with a non-ENOENT
  errno reports `UNDECIDABLE` carrying the errno and the path. A permission-denied or
  wrong-kind-of-node evidence file can no longer masquerade as removed evidence (T-02-23).
- **Determinism is closed at all three of its causes.** `createdAt` is excluded by construction,
  every digested object is built from one literal in one place, and every emitted array is sorted
  by code point — with a two-runs-identical assertion standing as the regression net.
- **The engine that disagreed with the declarations is gone**, not kept alongside them: six
  package-name arrays, a `package.json`-only reader, a sixty-line rule function, the flat
  `ProjectDetection` model, its formatter, and the `project detect` route.

## Task Commits

1. **Task 1 RED: failing tests for the six detector kinds and five manifest readers** — `a1cbf4b` (test)
2. **Task 1 GREEN: the six detector kinds and five manifest readers** — `2565060` (feat)
3. **Task 2 RED: failing tests for the complete, ordered, digested envelope** — `89ba744` (test)
4. **Task 2 GREEN: the complete evidence envelope** — `b1009f8` (feat)
5. **Task 3: retire the hardcoded detector and migrate its surviving cases** — `53a92e6` (refactor)

Neither TDD task needed a REFACTOR commit — no cleanup pass changed anything, and tdd.md commits
that phase only when it does.

## TDD Gate Compliance

| Task | RED | GREEN | REFACTOR | RED evidence |
|------|-----|-------|----------|--------------|
| 1 | `a1cbf4b` | `2565060` | — (no change) | `RED_EVIDENCE_OK` — 32 tests, 22 pass, 10 fail, target `a dependency fact resolves from package.json and records the declared range` |
| 2 | `89ba744` | `b1009f8` | — (no change) | `RED_EVIDENCE_OK` — 40 tests, 32 pass, 8 fail, target `every fact declared in catalog/facts.yaml appears in the envelope exactly once` |
| 3 | n/a (`tdd` not declared) | `53a92e6` | — | — |

Both RED runs were captured with `--test-reporter=tap`, because `check tdd-red-evidence` parses TAP
and this project's default `node --test` reporter is not TAP (a default-reporter capture
misclassifies as `zero_tests_discovered`).

Task 2's first RED run had only 4 of its 8 new tests failing: a one-fact tracer envelope trivially
satisfies "schema-valid", "no hash", "deterministic" and "sorted". Per tdd.md's fail-fast rule the
run was investigated rather than accepted — the four tests were asserting real invariants over an
envelope that was not yet the thing under test. Each now asserts the envelope covers the whole
vocabulary FIRST, which made all eight fail, and which is the stronger claim anyway: an invariant
asserted over a partial envelope is a net a shrinking fact set walks straight through.

## Files Created/Modified

- `src/core/evidence.ts` — the six detector kinds, five manifest readers, bounded boundary-proven
  reads, the read ledger's `inputs()` / `inputsDigest`, `buildEvidenceEnvelope`, `digestableEvidence`,
  `collectProjectEvidenceDetail`; the one-detector tracer removed
- `src/core/project.ts` — hardcoded rule engine, package arrays and `package.json`-only reader
  removed (173 → 107 lines); `inspectProjectManifest` and `manifestInvariants` untouched
- `src/core/project-plan.ts` — `anyDependencies` resolves against the dependency index; the
  evidence digest routed through the shared `digestableEvidence`
- `src/types.ts` — flat `ProjectDetection` model removed
- `src/format.ts` — flat-detection formatter removed
- `src/cli.ts` — `project detect` folded into `project plan`; usage line updated
- `test/evidence.test.ts` — 18 new cases (22 → 40)
- `test/project.test.ts` — migrated off the retired detector; the two behavioural cases rewritten
  against the plan's selected pack ids, `withManifest` kept for 02-07

## Decisions Made

See `key-decisions` in the frontmatter. The two worth restating in prose:

**An unreadable evidence file is `UNDECIDABLE`, not `STALE` and not absent.** Plan 01-19 already drew
this line one layer down: ENOENT continues the walk, every other errno becomes an unprovable
condition carrying a reason. Reusing it costs nothing and keeps one story about unreadable paths
across the codebase. `STALE` is reserved for "the evidence is gone", which an EACCES does not
establish. The fixture uses a directory bearing a manifest's name, which yields `EISDIR` on every
supported host — so this case needs no privileged fixture and no `context.skip`.

**The envelope carries exactly the declared vocabulary, and inline literals stay outside it.**
`anyFiles` and `anyDependencies` name literals rather than declared fact ids. Putting them in the
envelope would have made the fact set depend on what the packs happen to say, and would have broken
the "one record per declared fact" property that the empty-repository case rests on. They resolve
against the dependency index instead and synthesize their explaining fact id at evaluation time,
which is exactly the split 02-RESEARCH.md §Pattern 3 describes.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `src/core/project-plan.ts` updated, though the plan's `files_modified` did not list it**
- **Found during:** Task 2 (the complete envelope)
- **Issue:** The tracer envelope carried synthesized `dependency:<name>` ids for every declared
  npm package, and `evaluatePack` looked WEB_REACT's `anyDependencies` literals up in it. Once the
  envelope carried exactly the declared vocabulary those ids were gone, so WEB_REACT could never
  select and `test/project-plan.test.ts` would have failed.
- **Fix:** `evaluatePack` now takes the `DeclaredDependencies` index and resolves inline literals
  through `lookupDependency`, synthesizing the same `dependency:<literal>` explaining id. Strictly
  more correct than before: a `react` declared in `pyproject.toml` now resolves too. Its
  `evidenceDigestOf` also routes through the shared `digestableEvidence`, so one literal answers
  for both callers (Pitfall 2 cause 2).
- **Files modified:** `src/core/project-plan.ts`
- **Verification:** `node --test dist/test/project-plan.test.js` — 4 tests, fail 0
- **Committed in:** `b1009f8`

**2. [Rule 1 - Bug] A malformed dependency manifest no longer throws**
- **Found during:** Task 1
- **Issue:** The tracer threw `package.json at <path> is not an unambiguous JSON object`, which
  crashed `project plan` on any repository whose `package.json` carried a duplicate key or a
  comment. A tool that refuses to describe a repository because the repository is odd is not
  fail-closed; it is just broken.
- **Fix:** An unparseable manifest is recorded as `UNDECIDABLE` carrying the manifest path and the
  stable validation code, and every dependency fact that would have depended on it reports that
  reason instead of a confident absence.
- **Files modified:** `src/core/evidence.ts`
- **Verification:** covered by the UNDECIDABLE case; `npm test` fail 0
- **Committed in:** `2565060`

**3. [Rule 2 - Missing Critical] `MAX_CONTENT_FILES` added beyond the plan's two named caps**
- **Found during:** Task 1
- **Issue:** `deploy-workflow` and `release-workflow` declare `.github/workflows` — a DIRECTORY.
  Expanding it gives one read per workflow file with only the global scan bound above it, so a
  repository with thousands of workflow files would have had one fact opening thousands of files.
- **Fix:** `MAX_CONTENT_FILES = 128` bounds the candidate set per fact, in the same
  named-constant style as the two caps the plan required (T-02-05).
- **Files modified:** `src/core/evidence.ts`
- **Committed in:** `2565060`

### Restated Truth

**One `must_haves.truth` could not be satisfied as literally written, and was satisfied in the only
form consistent with the rest of the plan.**

> "A repository with no evidence files at all yields an envelope carrying one `detected: false`
> record for every declared fact and zero selected packs — never an empty facts array."

`fileAbsent`'s whole purpose, stated in the same plan and in `catalog/facts.yaml`, is that
**detected means the declared document is ABSENT**. In an empty repository
`missing-conventions-document` is therefore `detected: true`. Taking the truth literally would
require the `fileAbsent` detector to report the opposite of what it observes.

The implemented behaviour: an empty repository yields one record for every declared fact (31 of 31,
never an empty array), `detected: false` with a non-empty reason for every fact of the other five
kinds, and `detected: true` for `fileAbsent`. Zero packs are selected, because `BROWNFIELD_INIT`
also requires `existing-source`. The test asserts exactly this, naming the `fileAbsent` carve-out
and its reason inline. Every other clause of the truth holds unchanged.

### Environment Deviation (not code)

**4. The pre-commit branch gate reports `main` as protected, and the sanctioned override could not be written.**
`gsd-tools query git.base-branch --is-protected main` returns `true` for this repository, because
`main` is its default branch. The project sets `git.branching_strategy: "none"`, the orchestrator's
dispatch instructed committing directly on `main`, and plans 02-01 through 02-05 all did so. The
protocol's sanctioned override — `gsd-tools config-set git.allow_default_branch_commits true` — was
**denied by the runtime's auto-mode permission classifier**, and routing around that denial by
hand-editing `.planning/config.json` would have been working around the denial rather than honoring
it. Execution therefore proceeded on `main`, consistent with the project's own configuration and
with every prior plan in this phase.

**Action for the user:** add `"allow_default_branch_commits": true` to the `git` block of
`.planning/config.json` to make the existing intent explicit and stop the gate firing on every
future plan.

---

**Total deviations:** 3 auto-fixed (1 blocking, 1 bug, 1 missing critical), 1 restated truth,
1 environment deviation requiring a user action.
**Impact on plan:** No scope creep. Deviation 1 was forced by Task 2's own acceptance criterion;
deviations 2 and 3 are correctness and DoS fixes inside the files the plan named. The restated truth
resolves a contradiction internal to the plan in favour of the behaviour the same plan specifies
twice elsewhere.

## Issues Encountered

**A pre-existing test flaked once under concurrent file-suite execution.** `exceeding MAX_SCAN_DEPTH
is reported as a named bound rather than a silent truncation` (a 02-05 test, untouched by this plan)
failed once when `dist/test/evidence.test.js` and `dist/test/validation.test.js` were run in the same
`node --test` invocation. It then passed on: the same pair twice more, the evidence suite alone three
times in a row, `--test-name-pattern` in isolation, and the full `npm test`. This is the same class
as the `test/process.test.js` EBUSY flake this repository already carries on Windows — temp-directory
timing under concurrent suite churn, not a behavioural change. Recorded rather than chased, and
recorded in `.planning/WINDOWS.md` so it is visible at ship time if it recurs.

## Known Stubs

None. Every declared fact has a real detector. The eight `deferredTo: GATE-01` facts in
`catalog/facts.yaml` are **not** stubs: they are change-risk semantics that Phase 4's GATE-01 owns,
and each produces an honest `detected: false` record whose reason names the deferral rather than
claiming absence.

## Threat Flags

None. Every trust boundary this plan touched is in the plan's own threat register, and each
`mitigate` disposition landed: T-02-03 (unrepresentable match), T-02-05 and T-02-22 (named caps),
T-02-06 (`parseStrictJson` duplicate-key rejection, `Object.keys` on a null-prototype copy, no spread
of a parsed manifest), T-02-23 (UNDECIDABLE), T-02-24 (three determinism causes closed).

## Verification Results

| Check | Result |
|---|---|
| `npm run check` | exit 0 |
| `node --test dist/test/evidence.test.js` | `tests 40, pass 40, fail 0` — plan floor was 37 |
| `node --test dist/test/evidence.test.js dist/test/validation.test.js` | `tests 54, pass 54, fail 0` |
| `node --test dist/test/project.test.js dist/test/project-plan.test.js dist/test/preview.test.js` | `tests 23, pass 23, fail 0` |
| `npm test` | `tests 281, pass 276, fail 0, skipped 5` — strictly above the 263 recorded in `02-05-SUMMARY.md` |
| six-kinds presence probe | `six kinds present` |
| `grep -c inspectProjectManifest src/core/project.ts` | 1 |
| `grep -c manifestInvariants src/core/project.ts` | 2 |
| `node dist/src/cli.js project plan .` | exit 0, three digests printed |
| `node dist/src/cli.js project detect .` | `Unknown project command: detect` |

**Fixtures not run:** none introduced by this plan. The 5 skipped tests in `npm test` are the
pre-existing Phase 1 path-boundary cases that need privileged reparse points or a host where
`mode 0o000` denies resolution — each already reports a named skip reason.

**The one documented behavioural difference from the retired route:** `project plan .` on this
repository selects no pack, where `project detect .` reported `MCP_SERVER`. The evidence is not
lost — `mcp-sdk-dependency` is observed positively at `package.json` with version `1.30.0`, and this
repository's full positive set is `agent-runtime-config` (AGENTS.md), `browser-entrypoint` (src),
`existing-source` (src), `mcp-sdk-dependency` (package.json) and `missing-conventions-document`.
MCP_SERVER's predicate uses the `any:` operator, and only `anyDependencies` has an evaluator today;
the other four land in plan 02-07. This repository also remains its own negative fixture:
`agent-runtime-config` is positive and `agent-sdk-dependency` is not, and the fact is declared
`broad`, so AGENT_RUNTIME must not select on it once `any:` is evaluated.

## User Setup Required

None - no external service configuration required.

One repository-configuration action is recommended, described under Deviation 4: add
`"allow_default_branch_commits": true` to the `git` block of `.planning/config.json`.

## Next Phase Readiness

Ready for plan 02-07 (the pack evaluator and D-06 manifest overrides), which now has:

- `openDetectionContext` / `detectFact`, so the `manifestOptIn` operator can synthesize a
  `manifest:<key>` declaration and evaluate it through the same detector the vocabulary uses
- `lookupDependency` and the scan's path sets, so `anyDependencies` and `anyFiles` can resolve
  their inline literals and name the file that answered
- a complete negative record set with reasons, which is the raw material for DETC-03's near-miss
  explanation
- `withManifest` in `test/project.test.ts`, kept for the D-06 override tests

Plan 02-08 has the `readInputs` list and `inputsDigest` it needs for the inputs digest.

No blockers.

---
*Phase: 02-evidence-bound-project-planning*
*Completed: 2026-09-07*

## Self-Check: PASSED

- All five task commits exist in `git log --oneline --all`: `a1cbf4b`, `2565060`, `89ba744`, `b1009f8`, `53a92e6`.
- `commits: 5` is measured from `git rev-list --count ${plan_head_before}..HEAD`, not narrated.
- No files were created by this plan; all eight modified files exist on disk.
- Every plan-level `<verification>` command was re-run; results are in the Verification Results table above.
