---
phase: 31-cross-harness-proof-and-distribution
verified: 2026-11-02T20:12:27Z
status: gaps_found
score: 18/19 must-haves verified
covered_files: [".planning/phases/31-cross-harness-proof-and-distribution/31-01-PLAN.md",".planning/phases/31-cross-harness-proof-and-distribution/31-01-SUMMARY.md",".planning/phases/31-cross-harness-proof-and-distribution/31-02-PLAN.md",".planning/phases/31-cross-harness-proof-and-distribution/31-02-SUMMARY.md",".planning/phases/31-cross-harness-proof-and-distribution/31-03-PLAN.md",".planning/phases/31-cross-harness-proof-and-distribution/31-03-SUMMARY.md",".planning/phases/31-cross-harness-proof-and-distribution/31-04-PLAN.md",".planning/phases/31-cross-harness-proof-and-distribution/31-04-SUMMARY.md",".planning/phases/31-cross-harness-proof-and-distribution/31-05-PLAN.md",".planning/phases/31-cross-harness-proof-and-distribution/31-05-SUMMARY.md","README.ko.md","README.md","catalog/stack.lock.json","catalog/stack.yaml","dist/src/core/task-bootstrap.js","docs/SUPPORT_MATRIX.md","docs/research/efficient-wait/BUG-06.md","docs/task-bootstrap-proof.md","docs/task-entry-proof-index.json","docs/task-entry-proof.md","docs/task-entry.ko.md","docs/task-entry.md","docs/task-runtime-controls.md","docs/task-style-proof-index.json","docs/task-style-proof.md","package-lock.json","package.json","schemas/behavior-policy.schema.json","schemas/task-bootstrap.schema.json","schemas/task-contract.schema.json","schemas/task-gsd-stage-receipt.schema.json","schemas/task-intake.schema.json","schemas/task-receipt.schema.json","scripts/audit-tarball.mjs","scripts/run-tests.mjs","scripts/verify-task-entry-proof.mjs","scripts/verify-task-style-native.mjs","skills/alpha-aos-task/SKILL.md","src/cli.ts","src/core/behavior-policy.ts","src/core/doctor.ts","src/core/owned-skills.ts","src/core/release-package-proof.ts","src/core/task-bootstrap-store.ts","src/core/task-bootstrap.ts","src/core/task-contract.ts","src/core/task-gsd-readiness.ts","src/core/task-intake.ts","src/core/task-run.ts","src/core/task-style.ts","test/doctor.test.ts","test/helpers/packed-sandbox.ts","test/helpers/task-fixture.ts","test/provenance.test.ts","test/tarball-fixture.test.ts","test/task-bootstrap-acceptance.test.ts","test/task-bootstrap-resume.test.ts","test/task-entry-cross-harness.test.ts","test/task-entry-docs.test.ts","test/task-entry-proof.test.ts"]
covered_digest: "v3:sha256:e00b5669fbc1487c6cbf894f0cce87237e2a7727fc196e8421f0c07425a33068"
behavior_unverified: 0
overrides_applied: 0
decision_coverage:
  honored: 16
  total: 16
  not_honored: []
must_haves:
  truths:
    - "An inspectable matrix covers Claude, Codex, Antigravity, Pi and Hermes, including Codex sets flexible → Antigravity consumes it → Pi sets strict → an existing Codex session sees strict; native, fixture and unsupported/unverified results are clearly distinguished."
    - "A release task followed by an independent bug fix proves a fresh choice; the composed absent/partial-project scenarios preserve request/style identity and exact autopilot authority."
    - "The packed artifact contains integrity-locked shared guidance and all six routes, with meaningful discovery/invocation checks rather than file-presence-only claims."
    - "English and Korean documentation explains both modes, six styles, exception criteria, task boundaries, initialization and direct commands, including real support limitations."
    - "Targeted positive/negative checks and the final full regression have recorded actual outcomes. Failed/not-run prior regressions are not counted as passed or waived; required failures block affected acceptance and remediation must stay explicitly scoped."
    - "Packaged text is free of private host paths, with fail-closed tarball privacy, forbidden-entry and required-entry checks."
    - "Proof normalization preserves recorded SHA-256 and native commit identifiers."
    - "Doctor validates owned-skill frontmatter, source bytes and all five rendered hashes; deployed drift remains warning-only under the global hold."
    - "Package version remains 0.5.0 with no dependency/version mutations."
    - "The bounded proof index verifies hashes, lock bindings and tiers in checkout and packed contexts without support-matrix mutation."
    - "The index verifier refuses absent, empty, null, linked, oversized and private-path inputs and enforces canonical 55-cell order."
    - "Packed five-target source/rendered skill parity and tamper refusal are exercised."
    - "Packed CLI checks exercise mode query/apply/rollback, six-style intake, readiness and all six route previews with full-quality digest binding."
    - "Packed checks preserve real host fingerprints with no vanished entries and run after other suites."
    - "Both guides preserve all six Korean labels, canonical IDs and order."
    - "Both guides contain symmetric decision flows and four positive/counterexample pairs."
    - "Documentation discloses support/hold limits and has automated parity, links, privacy and version checks."
    - "The package contract requires all fourteen v0.6.0 entries."
    - "Both guide hashes are bound, with successful post-ledger package/build/proof checks."
  artifacts:
    - path: src/core/task-bootstrap.ts
      provides: "Claim state transitions and autopilot authority preservation"
    - path: test/task-entry-cross-harness.test.ts
      provides: "Four composed positive/negative scenario journeys"
    - path: scripts/verify-task-entry-proof.mjs
      provides: "Dual-context proof validation"
    - path: docs/task-entry-proof-index.json
      provides: "55-cell proof matrix and measured regression ledger"
  key_links:
    - from: src/cli.ts
      to: src/core/task-bootstrap.ts
      via: "task bootstrap claim dispatch"
    - from: scripts/verify-task-entry-proof.mjs
      to: docs/task-entry-proof-index.json
      via: "hash, tier, lock and regression validation"
  prohibitions:
    - statement: "MUST NOT leak developer-host private paths into packaged artifacts, mutate real user-global harness state under the Global Apply Hold, bump package.json version beyond 0.5.0, or claim npm publication while release holds remain active."
      status: unverified
      verification: flagged-unverified
    - statement: "MUST NOT promote fixture-tier test runs, unexecuted paid model turns (such as Claude Code G-07-2), or unsupported controller surfaces (such as Hermes GSD state-writer routes) to verified-native status."
      status: unverified
      verification: flagged-unverified
    - statement: "MUST NOT translate, romanize, or alter the six fixed Korean execution style labels in English documentation, leak developer workstation paths into packaged markdown, bump package.json version beyond 0.5.0, or claim official npm registry publication while release holds remain active."
      status: unverified
      verification: flagged-unverified
    - statement: "MUST NOT delete, waive, or fold quick 261101-ww3 historical timeout/not-run debt or active CI, paid-canary, global-apply, push, and npm-publish holds into passed regression totals, nor self-certify milestone completion without preserving the independent read-only review boundary."
      status: unverified
      verification: flagged-unverified
gaps:
  - truth: "A release task followed by an independent bug fix proves a fresh choice; the composed absent/partial-project scenarios preserve request/style identity and exact autopilot authority."
    status: failed
    reason: "A same-nonce retry of an autopilot bootstrap claim before linking returns dispatchAuthorized: true. Initial and linked claims correctly return false. The composed test links before retrying and misses this reachable intermediate state."
    artifacts:
      - path: src/core/task-bootstrap.ts
        issue: "Lines 833-853 return unconditional dispatchAuthorized: true for an already-claimed transfer with the same nonce."
      - path: test/task-entry-cross-harness.test.ts
        issue: "Scenario 3 checks initial claim and linked reentry, but omits claimed-before-link same-nonce retry."
      - path: test/task-bootstrap-resume.test.ts
        issue: "The autopilot authority test checks the first claim only; the retry test uses a conversational style."
    missing:
      - "Preserve the autopilot authorization guard and execution route metadata in the same-nonce claimed-state branch."
      - "Add targeted regression coverage for initial claim → same-nonce pre-link retry → linked reentry, requiring dispatchAuthorized: false throughout for autopilot styles."
unverified_prohibitions:
  - id: P1
    source_plans: [31-01, 31-03]
    status: unverified
    classification: WARNING
    human_decision_required: true
  - id: P2
    source_plans: [31-02]
    status: unverified
    classification: WARNING
    human_decision_required: true
  - id: P3
    source_plans: [31-04]
    status: unverified
    classification: WARNING
    human_decision_required: true
  - id: P4
    source_plans: [31-05]
    status: unverified
    classification: WARNING
    human_decision_required: true
---

# Phase 31: Cross-Harness Proof and Distribution Verification Report

**Phase Goal:** A user can install and understand the new behavior and inspect honest evidence that project mode, per-task selection, initialization and execution compose across supported harnesses.

**Verified:** 2026-11-02T20:12:27Z  
**Status:** gaps_found  
**Re-verification:** No — initial verification; no previous VERIFICATION.md existed.  
**Score:** 18/19 positive truths verified; one failed truth is a BLOCKER. Four distinct prohibition statements remain UNCERTAIN (WARNING), separately from the positive score.

## Goal Achievement

### Observable Truths

Roadmap wording is retained in rows 1–5. The remaining rows add plan-specific detail without reducing the roadmap contract. All 22 plan truths are accounted for: 31-01 → rows 6–9; 31-02 → rows 1–2, 10–11; 31-03 → rows 3, 12–14; 31-04 → rows 4, 15–18; 31-05 → rows 5, 19.

| # | Truth | Status | Evidence |
|---|---|---|---|
| 1 | An inspectable matrix covers Claude, Codex, Antigravity, Pi and Hermes, including Codex sets flexible → Antigravity consumes it → Pi sets strict → an existing Codex session sees strict; native, fixture and unsupported/unverified results are clearly distinguished. | VERIFIED | docs/task-entry-proof.md and index contain all 55 cells. Independently executed verifier reports 7 native, 19 fixture, 7 unsupported, 21 unverified, 1 blocked. Scenario 1 invokes compiled CLI with five isolated harness environments, applies the transition chain and rereads the same Codex state. Its named test passed in both targeted and final raw logs. |
| 2 | A release task followed by an independent bug fix proves a fresh choice; the composed absent/partial-project scenarios preserve request/style identity and exact autopilot authority. | FAILED — BLOCKER | Fresh selection, initial claim, linked reentry and request preservation have behavior evidence. However, src/core/task-bootstrap.ts:833–853 grants dispatchAuthorized: true on same-nonce claimed-state retry, including autopilot-quick-full. A zero-write probe of the actual compiled function reproduced the wrong result. Exact autopilot authority is therefore not preserved throughout recovery. |
| 3 | The packed artifact contains integrity-locked shared guidance and all six routes, with meaningful discovery/invocation checks rather than file-presence-only claims. | VERIFIED | test/tarball-fixture.test.ts:83–141 verifies source/five-target parity, CURRENT parsing, doctor, native inventory discovery and tamper refusals. The lifecycle calls these helpers at lines 644–645 and passed in the final raw log. Inventory discovery alone is never called paid native execution. |
| 4 | English and Korean documentation explains both modes, six styles, exception criteria, task boundaries, initialization and direct commands, including real support limitations. | VERIFIED | Read both complete eight-section guides, README entry tables and runtime-controls separation. Four concrete twin tables, exact labels/IDs, approval/start examples and harness/release limitations are present. All three named documentation tests passed before and after ledger finalization. |
| 5 | Targeted positive/negative checks and the final full regression have recorded actual outcomes. Failed/not-run prior regressions are not counted as passed or waived; required failures block affected acceptance and remediation must stay explicitly scoped. | VERIFIED | Independently parsed raw final log reconciles all 12 groups to 2149/2135/0/14/0. Eight ordered receipt commands exited 0. Historical timeout and four not-run suites remain unwaived, with seven holds separate. This newly discovered mandatory failure blocks phase acceptance despite those historical green results. |
| 6 | Packaged text is free of private host paths, with fail-closed tarball privacy, forbidden-entry and required-entry checks. | VERIFIED | Read decoded UTF-8 archive scanning and JSON/YAML Map/Set traversal, forbidden path allowlist and CLI exit 3. Final/post-ledger audits each report 451 entries. Own read-only in-memory probe rejects escaped JSON and YAML Set private paths. |
| 7 | Proof normalization preserves recorded SHA-256 and native commit identifiers. | VERIFIED | Compared all recorded 40/64-hex identifiers against 0683875^ for bootstrap proof, style proof and style index: identical sets (2, 2, 15). Native-style verifier independently returns valid/allVerified. |
| 8 | Doctor validates owned-skill frontmatter, source bytes and all five rendered hashes; deployed drift remains warning-only under the global hold. | VERIFIED | src/core/doctor.ts:81–180 parses YAML metadata, hashes source, renders every catalog target, checks target hashes and handles deployed-file drift/read failures as warnings. Named positive/tamper and directory/EACCES tests passed in raw full log. CLI doctor calls runDoctor and converts error findings to failure. |
| 9 | Package version remains 0.5.0 with no dependency/version mutations. | VERIFIED | package.json reads 0.5.0; git diff from phase baseline is empty for package.json, package-lock.json and stable lock. No setup or dependency changes were made by this verifier. |
| 10 | The bounded proof index verifies hashes, lock bindings and tiers in checkout and packed contexts without support-matrix mutation. | VERIFIED | Verifier reopens regular files, verifies stable-lock source/five-target values, archived owning-repository commit bytes and scenario hashes. Checkout invocation passed now; packed invocation passed in actual installed lifecycle and post-ledger packed-copy test. SUPPORT_MATRIX.md has no phase delta. |
| 11 | The index verifier refuses absent, empty, null, linked, oversized and private-path inputs and enforces canonical 55-cell order. | VERIFIED | Explicit size/lstat/path/tier/order guards and active negative tests. Boundary, spoofing, one-byte mutation and missing-guide tests pass. The file-symlink runtime test is explicitly skipped on this Windows host; lstat rejection is implemented. That skip is not represented as observed symlink behavior. |
| 12 | Packed five-target source/rendered skill parity and tamper refusal are exercised. | VERIFIED | Packed helper hashes source, syncs and inspects all five targets, checks frontmatter/labels, injects source and Pi target-lock tamper, asserts install/sync refusal and doctor exit 2, then restores bytes. Full lifecycle passed. |
| 13 | Packed CLI checks exercise mode query/apply/rollback, six-style intake, readiness and all six route previews with full-quality digest binding. | VERIFIED | test/tarball-fixture.test.ts:145–239 invokes installed CLI: zero-write default strict, exact mode preview/apply/rollback, six-label chooser, three conversational projections, absent/partial/ready and Hermes refusal, three unapproved autopilot previews with distinct digests. Actual lifecycle passed. Readiness adapter is explicitly fixture evidence. |
| 14 | Packed checks preserve real host fingerprints with no vanished entries and run after other suites. | VERIFIED | hostMutationTargets includes five task-skill destinations; before/after manifests are compared at lines 660–663, vanished count must be zero and tarball bytes unchanged. scripts/run-tests.mjs explicitly awaits ordinary, ten sequential Windows native files, then packed lifecycle. Raw final groups match that enforced ordering. |
| 15 | Both guides preserve all six Korean labels, canonical IDs and order. | VERIFIED | Read exact 1–6 tables in English/Korean guides and READMEs. Contract test asserts ordered labels and matching canonical IDs; passed. |
| 16 | Both guides contain symmetric decision flows and four positive/counterexample pairs. | VERIFIED | Both languages cover simple work vs wider changes, completed independent task vs active continuity, non-destructive recovery vs refused behavior, direct GSD invocation vs quoted prose. They retain exact approval and separate start requirements. |
| 17 | Documentation discloses support/hold limits and has automated parity, links, privacy and version checks. | VERIFIED | Both languages explicitly disclose Hermes worker-only, Claude G-07-2, native UI uncertainty/text fallback, Windows .CMD discovery limitations, CI/global/push/publication holds and 0.5.0. Test assertions and raw passing results confirm section, scenario, fence, link and privacy contracts. |
| 18 | The package contract requires all fourteen v0.6.0 entries. | VERIFIED | REQUIRED_V060_ENTRIES contains skill, six schemas, three verifiers, two guides and proof document/index. Missing-entry negatives and own read-only empty-list probe return fourteen violations. Audit CLI enforces the list. |
| 19 | Both guide hashes are bound, with successful post-ledger package/build/proof checks. | VERIFIED | Both guide paths are mandatory REQUIRED_FILES in verifier and hash-bound in packageBindings. Post-ledger raw logs show 9 passed/1 Windows symlink skip, 451-entry audit, 348-input/686-output build verification; both proof verifiers independently pass now. |

**Behavior evidence:** Existing completed runs were inspected directly; no build or test suite was rerun. The named behavioral tests in raw logs, rather than SUMMARY claims or symbol presence, support runtime truths. The newly reproduced failed invariant remains FAILED, not merely behavior-unverified.

### Required Artifacts

All 18 artifact declarations across five plans pass the installed existence/substance checker (15 unique paths); manual inspection checked actual consumers.

| Artifact | Expected | Status | Details |
|---|---|---|---|
| scripts/audit-tarball.mjs | Bounded ustar/privacy/required-surface audit | VERIFIED | Exported validators are used by CLI and provenance/tarball tests; CLI fails with exit 3. |
| src/core/doctor.ts | Frontmatter and five-target integrity diagnostics | VERIFIED | runDoctor is called by src/cli.ts; actual hashes and renderer outputs feed findings. |
| test/doctor.test.ts | Positive/tamper/read-error behavior | VERIFIED | Three active named tests; concrete finding/error assertions and restored mocks. |
| test/task-entry-cross-harness.test.ts | Four composed journeys | PRESENT, INCOMPLETE COVERAGE | Four active tests pass; scenario 3 omits same-nonce pre-link autopilot retry. |
| scripts/verify-task-entry-proof.mjs | Dual-context read-only verifier | VERIFIED | Actual invocation exits 0; failure cases checked in active tests. |
| docs/task-entry-proof-index.json | 55 cells, bindings, debt, measured ledger | VERIFIED | Every on-disk/lock binding passes; test counts independently reconcile. This does not prove untested behavior. |
| docs/task-entry-proof.md | Inspectable matrix and regression explanation | VERIFIED | Links to tiered evidence and honest history/holds; consumed as package documentation. |
| test/task-entry-proof.test.ts | Dual-context and spoofing/boundary negatives | VERIFIED WITH LIMIT | Six passing active tests plus one explicit Windows symlink permission skip. |
| test/tarball-fixture.test.ts | Installed CLI/integrity/host-drift proof | VERIFIED | Ten final tests pass, including helper calls inside actual installed lifecycle. |
| docs/task-entry.md / docs/task-entry.ko.md | Symmetric user guides | VERIFIED | Eight sections each, complete labels/flows/limits, README links and mandatory hash bindings. |
| README.md / README.ko.md | Task-entry summary and entry links | VERIFIED | Matching ten-section/scenario structure and six-label tables. |
| docs/task-runtime-controls.md | Separate operator guide | VERIFIED | Explicit task-entry cross-link and role separation. |
| test/task-entry-docs.test.ts | Bilingual doc/package contract | VERIFIED | Three active tests pass; literal/value assertions. |
| src/core/task-bootstrap.ts | Request/style and authority continuity | FAILED | Substantive and wired, but same-nonce pre-link autopilot retry returns the wrong authority. |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| audit-tarball.mjs | release-package-proof.ts | Matching private-path rule | WIRED | Equivalent PRIVATE_PATH_PATTERN contract, with separate executed validators. |
| doctor.ts | owned-skills.ts | renderOwnedSkill / destinationFor | WIRED | Imports are called to compute target hashes and deployed destinations. |
| verify-task-entry-proof.mjs | proof index | File/hash/tier validation | WIRED | Own real invocation succeeds. |
| verify-task-entry-proof.mjs | stable lock | Owned-skill source and five targets | WIRED | Values are cross-checked against actual lock and source bytes. |
| cross-harness test | compiled CLI | project mode / task intake | WIRED | Subprocess inputs and parsed outputs asserted. |
| packed lifecycle | doctor.ts | Installed doctor --json | WIRED | Actual clean/tampered findings and exit 2 asserted. |
| packed lifecycle | proof verifier | Installed script --index | WIRED | Requires packed-package context and valid 55 cells. |
| README.md | task-entry.md | Relative link | WIRED | Existing target and active link test. |
| README.ko.md | task-entry.ko.md | Relative link | WIRED | Existing target and active link test. |
| audit-tarball.mjs | task-entry.md | Required package list | WIRED | Missing required files fail audit. |
| doc tests | release-package-proof.ts | assertNoPrivatePaths | WIRED | Called for guides, READMEs and proof records. |
| proof index | proof verifier | regressionLedger | WIRED | Actual source/hash/count/receipt guards run. |
| proof document | style proof index | Co-verification chain | WIRED — MANUAL CHECK | Generic checker reports missing literal verify-task-style-native.mjs in prose/target. Actual index currentRun.gates contains that exact command, packageBindings hashes the style index, prose links style proof, and this verifier independently ran both scripts. A regex miss does not establish a broken connection. |
| CLI bootstrap claim | task-bootstrap.ts | claimTaskBootstrap | WIRED, WRONG BEHAVIOR | Existing claimed-state response is user-visible through public task bootstrap CLI. Independent task-run approval/start gates remain separate. |

### Data-Flow Trace (Level 4)

| Artifact/output | Data variable | Real source | Status |
|---|---|---|---|
| CLI policy/intake | effectiveMode / revision / chooser | Fresh resolveProjectBehavior → actual project behavior.json or explicit strict default → intake → JSON/text formatter | FLOWING |
| Doctor findings | source/target/current hashes | Packaged SKILL.md + stable lock + renderOwnedSkill + deployed file bytes | FLOWING |
| Proof verifier result | tierCounts / validity / gateStatus | Bounded index + on-disk package files + archive git objects + stable lock | FLOWING |
| Packed discovery/route output | inventory/readiness/intake/preview | Installed binary + sandbox filesystem + host executable discovery; explicit fixture GSD readiness adapter | FLOWING, FIXTURE SCOPE |
| Bootstrap claim response | dispatchAuthorized | Durable claimed record + same-nonce branch | FLOWING, INCORRECT VALUE |
| Regression table | measured counts | Raw full log → twelve group records → regressionLedger/document | FLOWING; no skipped/held work promoted |

No frontend or DB-backed rendering applies. Static proof documents are intentional archived evidence, not empty fallback data.

### Behavioral Spot-Checks

| Behavior/check | Command or evidence | Result | Status |
|---|---|---|---|
| Matrix/package/source/archives | node scripts/verify-task-entry-proof.mjs --index docs/task-entry-proof-index.json --json | Own process: valid true; checkout verified; 55 cells and exact tier counts | PASS |
| Archived Pi six routes | node scripts/verify-task-style-native.mjs --index docs/task-style-proof-index.json --json | Own process: valid true; allVerified true | PASS |
| Encoded private-path and mandatory surface guards | Read-only node --input-type=module import of audit validators, synthetic JSON/YAML Set inputs and empty required-entry list | Two encoded paths rejected; 14 missing-entry violations; zero writes | PASS |
| Same-nonce pre-link autopilot retry | Read-only VM probe of actual dist/src/core/task-bootstrap.js; command/reproduction below | actual dispatchAuthorized true; expected false; probe exit 1; zero writes | FAIL — BLOCKER |
| Four composed journeys | Existing raw 31-final-targeted.log and 31-final-full.log; exact test names in source | All four tests passed; they omit the failing intermediate retry state | PASS WITH COVERAGE GAP |
| Installed packed lifecycle | Existing raw full log, named “packed release completes the isolated install, reconcile, diagnose, and uninstall lifecycle” | Passed; packed group 10/10 | PASS |
| Full regression accounting | Independent raw-log summary extraction reconciled with counts/index | 12 groups; 2149 total, 2135 passed, 0 failed, 14 skipped, 0 not-run; zero cancelled/todo | PASS |

The full test command took 1,887,926 ms at tested functional source 9b6679a481a0d694551712e6c1f621afbdada704 on win32/x64, Node v24.13.1, npm 11.8.0. Functional src/scripts/test/catalog/schema/skill/package inputs have no delta from that tested source. Current inspected HEAD is 6778dad67d548921c96b65c1958ce2be558552ec. Later evidence/bookkeeping commits do not repair the discovered invariant. The superseded incomplete bdd19aa run is excluded.

### Probe Execution

No shell probe paths or human-check blocks are declared in these five plans/summaries. Both declared standalone proof verifiers were executed in this verifier's own processes; their successful results do not certify unrelated bootstrap branch behavior.

### Requirements Coverage

| Requirement | Source plans | Description | Status | Evidence |
|---|---|---|---|---|
| PROVE-01 | 02, 05 | Inspectable policy/fresh-selection scenario evidence with honest tiers | SATISFIED WITH LIMITS | Matrix, chain tests, archived receipts and unsupported/held cells checked; no universal native parity claimed. |
| PROVE-02 | 01, 03, 04, 05 | Integrity-locked packed guidance and meaningful discovery/invocation | SATISFIED | Actual packed CLI lifecycle, five-target checks, tamper refusals, required surface and audit evidence. |
| PROVE-03 | 04, 05 | English/Korean explanation of modes, styles, exceptions, bootstrap and direct commands | SATISFIED | Complete guides/README tables and passing doc contracts. |
| PROVE-04 | 02, 05 | Targeted positive/negative behavior and honest final regression | BLOCKED FOR ACCEPTANCE | Measured historical result is authentic, but required D-13 exact-autopilot-authority negative coverage missed a reachable failing retry state. Fix and scoped behavioral regression required before acceptance. |

All four roadmap IDs appear in plan requirements; no orphaned Phase 31 requirement was found. Requirement checkboxes in REQUIREMENTS.md are tracking data, not verification evidence. The phase remains pending regardless of those checked boxes.

### Decision Coverage

All trackable CONTEXT.md decisions are honored by shipped artifacts.

Installed non-blocking decision check reports 16/16, not_honored []. This substring-based gate does not override the independently reproduced D-13 behavioral defect.

### Test Quality Audit

| Test file | Linked requirement | Declared tests | Runtime skip | Circular expectations | Strongest assertion | Verdict |
|---|---|---:|---:|---|---|---|
| doctor.test.ts | PROVE-02 | 3 | 0 | None found | Value/behavior; tamper and read-failure variants | Adequate for checked cases |
| provenance.test.ts | PROVE-02 | 13 | 0 | None found | Archive/hash/privacy negatives, including escaped Set inputs | Adequate |
| task-entry-cross-harness.test.ts | PROVE-01/04 | 4 | 0 | None found | Multi-step CLI and runtime behavior | Incomplete authority transition coverage |
| task-entry-proof.test.ts | PROVE-01/04 | 7 | 1 | None found | Tier/hash/ledger mutations in checkout/packed contexts | Symlink permission limitation explicit |
| task-entry-docs.test.ts | PROVE-02/03 | 3 | 0 | None found | Ordered literal labels, headings, links and privacy | Adequate for document contract |
| tarball-fixture.test.ts | PROVE-02 | 10 | 0 | None found | Real installed CLI, tamper, rollback and host snapshots | Adequate for checked cases |

Fixture writes create inputs/implementations or injected violations; they do not regenerate expected outputs from the subject as an oracle. Native expected provenance comes from separately archived scratch receipts and committed archival bytes, not fixture-generated native claims. One skipped symlink test is not the sole proof of any entire requirement, so it is a WARNING, not a separate missing implementation.

**Disconfirmation findings:** Native proof remains intentionally partial; fixture scenarios are not native parity. Scenario 3 is misleadingly broad if treated as proof of every recovery state: it checks initial claim and linked retry, not same-nonce pre-link retry. That uncovered path fails the authority invariant and is the blocking gap below.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|---|---:|---|---|---|
| src/core/task-bootstrap.ts | 848 | Unconditional dispatchAuthorized: true in same-nonce claimed-state branch | BLOCKER | An autopilot bootstrap retry reports dispatch permission despite requiring exact approval and separate start. |
| test/task-entry-cross-harness.test.ts | 837 | Reentry tested only after native link | WARNING supporting blocker | The observed passing sequence skips the failing intermediate state. |
| test/task-entry-proof.test.ts | 77 | Windows EPERM file-symlink skip | WARNING | Linked-index behavior is implemented but not exercised on this host. |
| Five PLAN files | frontmatter | Four distinct status: unverified / verification: flagged-unverified prohibitions | WARNING | Require explicit end-of-phase resolution; objective evidence is not human acceptance. |

No unreferenced TBD/FIXME/XXX debt marker, placeholder implementation, empty user-visible fallback or console-only handler was found in the changed implementation/docs scan. No frontend files or UI-SPEC are involved.

### Human Verification Required — Prohibition Decisions

These are not requests to execute paid canaries, CI, global apply, push or publication. They are four recorded intent-boundary decisions. No prior per-item human resolution exists.

**Exact authority:** [Installed verifier instructions](C:/Users/alpha/.codex/agents/gsd-verifier.toml:152) state: “Interactive verify requires explicit human resolution per item (belongs in the end-of-phase human checkpoint, not a mid-run gate).” [Line 155](C:/Users/alpha/.codex/agents/gsd-verifier.toml:155) states: “A flagged prohibition counts as a human-verification item (status human_needed) or a gap (status gaps_found) per the existing decision tree — it must never be silently absorbed into a passed verdict.” These match the governing verifier instructions supplied to this run. The plans use the explicit flagged-unverified value, not a resolved test/judgment disposition with enforcement metadata. This verifier cannot silently reclassify them or invent approval.

**Classification:** Each item below is UNCERTAIN (WARNING) as a recorded prohibition disposition. Its objective controls are separately supported; the unresolved human judgment is whether the bounded evidence and remaining holds satisfy the prohibition's intended scope. The BLOCKER already makes overall status gaps_found. If that implementation gap is fixed while these items remain unresolved, the governing decision tree routes to human_needed.

1. **P1 — Packaged privacy, host-global state and release authority** (31-01/31-03, deduplicated)

   **Statement:** MUST NOT leak developer-host private paths into packaged artifacts, mutate real user-global harness state under the Global Apply Hold, bump package.json version beyond 0.5.0, or claim npm publication while release holds remain active.

   **Objective evidence:** Decoded archive privacy negatives and 451-entry audits; exact before/after host snapshots with no vanished entries; unchanged package/dependency/lock files; version 0.5.0 and explicit release holds.

   **Bounded proposed resolution:** Explicitly accept this evidence for the Phase 31 packaged/sandboxed scope while retaining global reconciliation, version bump and publication holds. No permission to mutate global harness state or publish is implied.

2. **P2 — Evidence-tier honesty and unsupported authority** (31-02)

   **Statement:** MUST NOT promote fixture-tier test runs, unexecuted paid model turns (such as Claude Code G-07-2), or unsupported controller surfaces (such as Hermes GSD state-writer routes) to verified-native status.

   **Objective evidence:** Verifier enforces native provenance plus known scratch receipt/archive bindings; negative spoofing tests pass; seven archival native cells only; Hermes controller/routes unsupported and Claude canary blocked.

   **Bounded proposed resolution:** Explicitly accept seven archival native claims and the remaining fixture/unsupported/unverified/blocked classifications as accurate for this evidence set, leaving native question UI, paid routes and unsupported Hermes authority unproven/unavailable.

3. **P3 — Fixed labels, privacy and release claims in both languages** (31-04)

   **Statement:** MUST NOT translate, romanize, or alter the six fixed Korean execution style labels in English documentation, leak developer workstation paths into packaged markdown, bump package.json version beyond 0.5.0, or claim official npm registry publication while release holds remain active.

   **Objective evidence:** Literal ordered label/ID assertions pass in both languages; direct guide review, privacy scans/audit and 0.5.0 version assertion pass.

   **Bounded proposed resolution:** Explicitly accept the current bilingual wording and literal labels as preserving intended meaning and release boundaries; retain publication/version holds.

4. **P4 — Historical debt, held work and independent review** (31-05)

   **Statement:** MUST NOT delete, waive, or fold quick 261101-ww3 historical timeout/not-run debt or active CI, paid-canary, global-apply, push, and npm-publish holds into passed regression totals, nor self-certify milestone completion without preserving the independent read-only review boundary.

   **Objective evidence:** Raw 12-group counts reconcile; historical timeout job and four not-run suites remain side-by-side and unwaived; all seven current holds remain separate. Source/final-ledger review is independently clean with CR-01/02/03 and WR-01 resolved; separate milestone final review remains held.

   **Bounded proposed resolution:** Explicitly accept the historical/current ledger separation and phase-review evidence, keeping the newly discovered implementation gap blocking and all CI/canary/global/push/release/milestone-review holds intact.

No additional artificial manual task, visual review or paid/external integration exercise is required by this report. None of the listed holds is moved to passed or silently deferred. Phase 31 is the final phase in the current milestone; no later roadmap phase specifically takes ownership of the failed authority invariant.

### Gaps Summary

**G-31-01 — Autopilot claimed-state retry grants the wrong bootstrap authority.** An initial autopilot claim reaches the durable claimed state and returns dispatchAuthorized: false. Repeating claim with the same nonce before linking enters the idempotent branch at src/core/task-bootstrap.ts:833. That branch returns true, a generic native-link instruction, and omits the guarded execution-route metadata used on first claim. This is reachable normal retry behavior, not malformed or malicious state.

The following fix is narrowly within Phase 31's D-13 integration requirement: apply the same autopilot authority guard/route projection on the retry branch and add targeted initial → pre-link retry → linked reentry assertions. The existing full-suite pass remains an authentic historical result; it cannot compensate for missing coverage of this failure. This report does not claim that task-run's separate exact-digest approval or start checks were bypassed.

### Reproduction of G-31-01 (zero filesystem mutations)

Run the following from repository root using PowerShell. It loads the actual compiled module unchanged and supplies a reachable claimed handoff through in-memory I/O stubs. Mutation functions throw if touched. Expected exit is 0 when the invariant holds; current output is actualDispatchAuthorized: true and exit 1.

~~~powershell
@'
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
const root = process.cwd();
const context = vm.createContext({ process, Buffer, console });
const noWrite = () => { throw new Error("Probe forbids mutation"); };
const locals = {
  "./behavior-policy.js": { resolveProjectBehavior: async () =>
    ({ canonicalRoot: root, projectId: "probe-project" }) },
  "./paths.js": { findPackageRoot: () => root },
  "./task-bootstrap-store.js": {
    computeHandoffContentDigest: noWrite, persistTaskBootstrapHandoff: noWrite,
    readTaskBootstrapHandoff: async () => ({
      status: "claimed", claim: { nonce: "same-claimant" },
      canonicalSelectedStyle: "autopilot-quick-full",
      contentDigest: "a".repeat(64),
    }),
    resolveBootstrapStoragePath: () => "<read-only-state>",
    TaskBootstrapStoreError: class extends Error {},
    updateTaskBootstrapHandoff: noWrite, validateTaskBootstrapHandoffLimits: noWrite,
  },
  "./task-gsd-readiness.js": { inspectGsdProjectReadiness: async () =>
    ({ diagnosis: "ready", ready: true }) },
  "./task-bootstrap-recovery.js": { planNativeBootstrapRecovery: noWrite },
  "./task-style.js": { resolveTaskExecutionRoute: noWrite },
  "./validation.js": { parseManagedDocument: noWrite, validateAgainstSchema: noWrite },
};
const subject = new vm.SourceTextModule(
  readFileSync("dist/src/core/task-bootstrap.js", "utf8"),
  { context, identifier: pathToFileURL(root + "/dist/src/core/task-bootstrap.js").href },
);
await subject.link(async (specifier) => {
  const ns = locals[specifier] ?? await import(specifier);
  return new vm.SyntheticModule(Object.keys(ns), function () {
    for (const key of Object.keys(ns)) this.setExport(key, ns[key]);
  }, { context });
});
await subject.evaluate();
const result = await subject.namespace.claimTaskBootstrap({
  invocationPath: root, projectRoot: root, stateRoot: "<read-only-state>",
  pendingId: "probe", claimNonce: "same-claimant",
});
console.log(JSON.stringify({
  selectedStyle: result.selectedStyle,
  expectedDispatchAuthorized: false,
  actualDispatchAuthorized: result.dispatchAuthorized,
  nextAction: result.nextAction, writes: 0,
}, null, 2));
if (result.dispatchAuthorized !== false) process.exitCode = 1;
'@ | node --experimental-vm-modules --input-type=module
~~~

---

_Verified: 2026-11-02T20:12:27Z_  
_Verifier: the agent (gsd-verifier), authorized current-session model inheritance_  
_No source edits, builds, test-suite reruns, commits or phase-completion mutations were performed._

