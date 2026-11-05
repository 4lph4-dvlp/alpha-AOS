# Phase 27 — Planning source and probe audit

Planning evidence only, 2026-11-02. No implementation, automated test pass, native invocation, commit or lifecycle transition is claimed. Existing WIP/context/research/patterns are preserved. This bounded planner owns only plans/validation and this evidence file. Runtime exposes apply_patch rather than Write/Edit; canonical plans were created with its file-add operation and validation with scoped replacements, never shell generators/heredocs.

## Dependency and ownership graph

| Plan | Wave | Needs | Creates / user capability | Tasks |
|------|------|-------|---------------------------|-------|
| 27-01 | 1 | Existing root/parser/tree/CLI services | Query real missing/valid policy; guarded root/schema errors | 27-01-01, 27-01-02 |
| 27-02 | 2 | 27-01 query | Exact identity and read-only reviewed mode preview | 27-02-01, 27-02-02 |
| 27-03 | 3 | 27-02 exact identities | Atomic policy-aware common rollback; shared target→state ownership | 27-03-01, 27-03-02 |
| 27-04 | 4 | 27-03 safe journal/rollback | CLI coordinated apply, no-op, real process safety | 27-04-01, 27-04-02 |
| 27-05 | 5 | 27-04 complete CLI | Five owned routes/integrity, docs, native acceptance and final regression | 27-05-01, 27-05-02, 27-05-03 |

Shared source/CLI/test files force these dependencies. No same-wave ownership overlap. Every task edits at most five files; every plan has two or three tasks. Phase-leading tracer is the real CLI→core→filesystem query, followed by behavioral/safety expansions. Coordinator/journal work is validated through actual public rollback transactions, not schema-only foundation tasks. All new tests are created before their verification command is first used. Existing runner/compiler/dependencies suffice. Full regression is at the final execution gate, not during planning.

## Multi-source coverage

| SOURCE | ID | Feature / constraint | Plan / task | Status |
|--------|----|----------------------|-------------|--------|
| GOAL | Phase 27 | One shared mode, inspect/change from any harness before initialization, fresh next intake | 01–05, especially 05-01/03 | COVERED |
| GOAL | SC1 | Missing strict without writes; only mode persists | 01-01, 04-01, 05-01 | COVERED |
| GOAL | SC2 | Natural-language/CLI change and second-harness read | 04-01, 05-01/03 | COVERED; native gate retained |
| GOAL | SC3 | Root/mode/source/revision and next-intake refresh | 01-01, 02-02, 05-01/03 | COVERED |
| GOAL | SC4 | Preview/root/snapshot/rollback/stale/unrelated bytes | 02–04 | COVERED |
| GOAL | SC5 | Invalid/unreadable/wrong-root actionable errors | 01-02, 03-02, 04-01 | COVERED |
| REQ | MODE-01 | Missing strict, no implicit writes | 01, 04, 05 frontmatter | COVERED |
| REQ | MODE-02 | Shared CLI and five native routes before GSD | 01, 05 frontmatter | COVERED; real evidence required |
| REQ | MODE-03 | Inspectable current evidence and fresh intake | 01, 02, 04, 05 frontmatter | COVERED |
| REQ | MODE-04 | Reviewed bounded atomic apply/rollback | 02, 03, 04, 05 frontmatter | COVERED |
| REQ | MODE-05 | Safe fail-closed invalid/unreadable handling | 01–05 frontmatter | COVERED |
| CONTEXT | D-01 | Single behavior.json authority, no absolute root in policy | 01-01, 05-01 | COVERED |
| CONTEXT | D-02 | Exact closed version-1 mode schema, duplicate rejection | 01-01/02 | COVERED |
| CONTEXT | D-03 | Missing read/no writes; explicit strict; exact no-op | 01-01, 02-02, 04-01 | COVERED |
| CONTEXT | D-04 | Preference only; no trust/bootstrap/consent change | 01-01/02, 04-01, 05-01 | COVERED |
| CONTEXT | D-05 | Existing single root ladder/declaration list | 01-01/02 | COVERED |
| CONTEXT | D-06 | No parent/global cascade; independent nested/worktree roots | 01-02 | COVERED |
| CONTEXT | D-07 | Standalone and explicit roots without manifests/Git/GSD | 01-01/02 | COVERED |
| CONTEXT | D-08 | Alias/canonical proof, root mismatch and retarget refusal | 01-02, 02-01, 03-02, 04-02 | COVERED |
| CONTEXT | D-09 | Exact common query/set/rollback CLI, digest apply | 01-01, 02-02, 03-01, 04-01 | COVERED |
| CONTEXT | D-10 | Five owned natural-language routes, agent carries digest | 05-01/03 | COVERED |
| CONTEXT | D-11 | Policy-only early route; mixed request setting first | 05-01/03 | COVERED |
| CONTEXT | D-12 | All target renders/source+target integrity, native distinction | 05-01/03 | COVERED |
| CONTEXT | D-13 | Text/JSON provenance and no raw policy diagnostics | 01-01/02, 02-02, 03-02 | COVERED |
| CONTEXT | D-14 | Fresh next intake; active task unchanged | 05-01/03 | COVERED |
| CONTEXT | D-15 | Raw SHA-256 / missing, format/create/delete freshness | 01-01, 02-02, 04-01/02 | COVERED |
| CONTEXT | D-16 | Absence-only default; invalid blocks no repair | 01-02, 04-01 | COVERED |
| CONTEXT | D-17 | Review root identity/path/revision/request in setting digest | 02-01/02, 04-01 | COVERED |
| CONTEXT | D-18 | One-file bounded snapshot/journal atomic mutation | 03-01, 04-01 | COVERED |
| CONTEXT | D-19 | Under-lock recompute, one winner, stale refusal | 03-01/02, 04-01/02 | COVERED |
| CONTEXT | D-20 | Exact bytes/absence rollback; no sweep or fake no-op ID | 03-01/02, 04-01 | COVERED |
| RESEARCH | R1 | Reuse lower-level strict parser/schema without extension migration | 01-01/02 | COVERED |
| RESEARCH | R2 | Root directory/readability, both tree-off checks and task binding | 01-02, 03-02, 04-01 | COVERED |
| RESEARCH | R3 | Exact >2^53 identity prerequisite and compatible serialization | 02-01 | COVERED |
| RESEARCH | R4 | Cross-state/canonical-alias target coordinator and finite conflict | 03 contract, 04-02 | COVERED |
| RESEARCH | R5 | Lock order, retained crash evidence, conservative unlock | 03-01/02 | COVERED |
| RESEARCH | R6 | Inside-lock recompute and separate byte/path freshness | 04-01/02 | COVERED |
| RESEARCH | R7 | Additive metadata, external/core schema, actual read validation | 03-01 | COVERED |
| RESEARCH | R8 | Common rollback atomic bytes/absence, parent preservation, held session | 03-01/02 | COVERED |
| RESEARCH | R9 | Safe hash/path errors, generic diffs unchanged | 03-02 | COVERED |
| RESEARCH | R10 | Real task source/five renderer/deployment hashes | 05-01 | COVERED |
| RESEARCH | R11 | Full process/rollback/stale matrix, capability/not-run | 01-02, 02-01, 03-02, 04-02 | COVERED |
| RESEARCH | R12 | Native loaded-revision proof separate, no paid/global calls | 05-03 | COVERED; unavailability blocks acceptance |
| RESEARCH | R13 | No dependencies, scope preservation, final regression | All plans; 05-03 | COVERED |

Research's four horizontal slices were advisory and replaced by the tracer/expansion graph. Deferred Phase 28–31 features, global/session mode, inheritance, style persistence and automatic migration are excluded by explicit scope, not silently omitted. No missing source item remains unplanned.

## Spec-less edge accounting

Input files 27-PROBE-REQUIREMENTS.json and 27-EDGE-COVERAGE.json were read unchanged; the deterministic engine was not rerun. Original applicable=9, unresolved=9, unclassified=3.

| Requirement/category | Disposition at planning | Authored predicate / surfaced assumption |
|----------------------|-------------------------|------------------------------------------|
| MODE-01/unclassified | unresolved flagged assumption E-U1 | Requirement wording did not classify. 27-01 covers explicit missing-default cases, but no inferred category closes this row. |
| MODE-02/adjacency | resolved explicit | 27-04 truth: canonical aliases/separate state roots share one target coordinator; equal target identities do not create separate policy authorities. |
| MODE-02/empty | resolved explicit | 27-02 truth: empty/invalid mode and surplus/unknown CLI inputs are rejected. |
| MODE-02/ordering | resolved explicit | 27-05 truth: mixed requests apply only the authorized setting before original-task fresh intake. |
| MODE-02/concurrency | resolved explicit | 27-04 truth: one committed mutation, finite contention and stale old-digest retry. |
| MODE-03/unclassified | unresolved flagged assumption E-U2 | 27-05 assumption: no category inferred; freshness cases are explicit but classification stays unknown. |
| MODE-04/idempotency | resolved explicit | 27-04 truth: reviewed/unreviewed same valid mode preserves bytes, no locks/journal/ID. |
| MODE-04/concurrency | resolved explicit | 27-04 truth: apply/rollback share target coordinator and inside-lock checks in both orders. |
| MODE-05/unclassified | unresolved flagged assumption E-U3 | Requirement wording did not classify. 27-01 covers failure matrix but no category is fabricated. |

No-silent-drop equality: 9 surfaced = 6 explicit must_haves truth predicates + 3 unresolved/unclassified assumptions. No backstop or auto-dismissal was invented. E-U1/E-U3 are also visible in 27-01; E-U2 is visible in 27-05. This planning resolution is not a test-pass claim and does not mutate the saved deterministic input/report.

## Two-stage prohibition recall and precision

Stage 1 asked each requirement: “What could this silently become that its author would not want?” Compact raw recall candidates (routine/edge/canon candidates are intentionally overproduced):

| Requirement | Raw recall candidates |
|-------------|-----------------------|
| MODE-01 | implicit write; directory creation; journal creation; global default; parent cascade; false flexible default; stale cache; style persistence; malformed fallback; hidden GSD bootstrap |
| MODE-02 | consent expansion; chooser for settings; forced contract; paid host call; copied digest burden; direct JSON edits; global deployment; target hash mismatch; fake host proof; wrong-root switch |
| MODE-03 | cached authority; active-task restart; hidden source; raw bytes in errors; mtime authority; fallback parent; fake revision; wrong root; misleading native parity; execution consent |
| MODE-04 | last writer wins; no-op journal; overwrite drift; rounded identity; stale lock deletion; parent sweep; torn restore; generic metadata bypass; partial rollback; lock deadlock |
| MODE-05 | secret echo; invalid becomes default; unsafe repair; wrong-root fallback; raw diffs; hidden capability skip; fabricated host success; error without remediation; schema guessing; silent migration |

Stage 2 dropped routine correctness/hygiene and edge-owned items (atomicity, duplicates, locks, parser grammar, idempotency); existing D-XX constraints remain implemented through their task coverage. Canon referral: path traversal/injection, credential leakage and generic authorization are security canon, covered by this phase's STRIDE controls and $gsd-secure-phase review; no duplicate bespoke prohibition minted. Two product-specific intent constraints survive: flexible never becomes execution/style/active-task authority; fixture/source proof never becomes native success. Installed `C:/Users/alpha/.gemini/antigravity/gsd-core/bin/lib/probe-core.cjs` `projectProhibitions` was actually called with those two unresolved records; its output was copied into 27-05 must_haves.prohibitions without check_* descriptors.

No-silent-drop equality: 2 kept = 2 authored descriptor-less prohibitions; both remain flagged-unverified/unresolved. No machine-check descriptor, fail-first claim or auto-dismissal was fabricated.

## Planning contributions and grounding

All four active planner contributions were consumed verbatim from loop render-hooks plan:pre --raw: API coverage, assumption-delta, schema-gate, security. Assumption scan detected second/fallback signals; 27-01 records promote canonical project policy with harness consumers. Actual schema-path scan returned 0 ORM matches: behavior JSON schema is a local document, not a live DB push. Actual API detector over the Phase 27 ROADMAP section plus all five plans returned detected:false with no signals, so no external-API matrix or declaration is required. Security is ASVS L1/high with unique T-27-01…T-27-16 and shared reserved T-27-SC. Graph status is disabled; codebase drift skipped/not-a-git-repo is not used as freshness proof. Current tracked source, context and pattern references supplied grounding.

Existing edited/read source paths were checked using git ls-files; new service/schema/test/evidence paths are explicitly identified in each plan. package.json and scripts/run-tests.mjs establish build/check/full/terminal --files commands; missing named compiled files fail loudly. No zero-match grep acceptance gates are authored. Calibration result factor=1, sample_count=0, confidence=low; each estimate equals raw projection × 1. Discovery uses current research and source patterns, with no new package/API/ORM integration. No prior verified command list was supplied.

Research assumptions: A1 resolved by the explicit reviewed transient root-level coordinator contract (no duplicate mode; no lock on query/preview/no-op). A2 stays a native acceptance blocker until real evidence. A3 targeted latency remains unmeasured until execution. Arbitrary hostile editors and unproven network-filesystem CAS are not claimed supported by a cooperative lock.

Remaining execution gates: new tests and full regression have not run; actual native host receipts and platform capability proof are unverified. Git commits remain controller-owned and blocked by the disclosed index permission; this planner did not bypass or attempt them.

Artifact validation: all five PLANs passed installed frontmatter and plan-structure validation and end with closing output tags. The three one-way warnings are expected: exact D-01/D-02/D-09 decisions were already settled, and --no-reversibility-gates suppresses checkpoint insertion for additive journal metadata while retaining its rating. No implementation tests were executed by this validation.
