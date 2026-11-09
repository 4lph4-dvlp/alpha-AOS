# Phase 39 — Source Coverage and Planning Gates

Status: planning contract, implementation unexecuted. 2026-11-06.

## Execution graph and ownership

| Plan | Wave | Needs | Creates / user capability |
|---|---|---|---|
| 39-01 | 1 | current local Cua/catalog/path/CLI patterns | production Cua read tracer; strict shared record reader/schema |
| 39-02 | 2 | 39-01 record contract | explicit safe writer, operation results and failure-safe accepted history |
| 39-03 | 2 | 39-01 collector/model | all managed tools and evidence-based per-harness installation/connection relations |
| 39-04 | 3 | 39-02 writer/records, 39-03 actual observations | legacy evidence handoff evaluation; current/accepted/latest-operation reconciliation |
| 39-05 | 4 | 39-04 final projection | component categories, full detail, tool/operation history and compatibility regression |

Same-wave 39-02 owns record-store/records/tests; 39-03 owns observers/bindings/inventory/tests. Their files_modified intersections are empty. Other overlaps are explicit later-wave dependencies. Each plan has two tasks; each task modifies at most five files. The only leading tracer is 39-01-01, and it must be verified/committed before expansion. No source, tests or tracked lifecycle state were changed during planning. Parent orchestrator owns document commit and roadmap updates.

Calibration: estimate-calibration returned factor=1, sample_count=0, confidence=low. Raw/calibrated estimates are 30000/31000/29000/28000/25000 tokens by plan. Existing module length and bounded source/test reads are included; no plan assumes a whole previous state/history transcript. Discovery uses existing Node/Ajv/path/session/transaction patterns and phase research; no new dependency or remote service discovery is needed.

## Multi-source coverage audit

| SOURCE | ID | Feature / requirement | Plan / task | Status | Notes |
|---|---|---|---|---|---|
| GOAL | G39 | authoritative local identity and ownership model including Cua | 01–05 | COVERED | shared model/reader/store, actual observation→CLI |
| GOAL | SC1 | all managed tools; installed/source/owner; missing vs unknown vs verified | 01-01,03-01,03-02,05-01 | COVERED | no pin/config-as-install inference |
| GOAL | SC2 | exact artifact/source/integrity/result/operation; external secret-free records | 01-02,02-01,02-02 | COVERED | closed versioned events and writer boundary |
| GOAL | SC3 | four identities; failure/interruption preserve prior accepted | 01-02,02-02,04-02 | COVERED | journal commit distinct from tool proof |
| GOAL | SC4 | owned/bundled/prerequisite boundaries; legacy adoption trust contract | 04-01,05-01 | COVERED | no full migration/provisioning expansion |
| REQ | LOC-01 | inspect versions, official sources and ownership in one inventory | 01,03,04,05 | COVERED | requirements frontmatter present |
| REQ | LOC-04 | inspect exact locally recorded identity/integrity/results | 01,02,04,05 | COVERED | requirements frontmatter present |
| RESEARCH | R1 | separate async tool collector; preserve sync Inventory consumers | 01-01,05-02 | COVERED | existing collectInventory API unchanged |
| RESEARCH | R2 | actual Cua/GSD/ECC/MCP/bridge observation and missing/unknown distinction | 01-01,03-01 | COVERED | production observers with bounded scope and fixtures |
| RESEARCH | R3 | multiple candidates; harness attribution; independent ownership | 03-02,05-01 | COVERED | no global primary installation assumption |
| RESEARCH | R4 | four identities and evidence target/scope/method/result | 01-02,02-02,04-02 | COVERED | exact subject evidence before acceptance |
| RESEARCH | R5 | closed schema/version routing and corrupt/newer diagnostics | 01-02 | COVERED | no reset or automatic migration |
| RESEARCH | R6 | secret-free field allowlists and source URLs | 01-02,02-01,03-02,05-02 | COVERED | raw args/env/error fields rejected, canary tests |
| RESEARCH | R7 | checkout-external state override/alias/symlink/case safety | 01-02,02-01 | COVERED | canonical external-root proof and prewrite recheck |
| RESEARCH | R8 | reuse path proof, single writer, nested session and transactions | 02-01 | COVERED | explicit session/root/digest ownership |
| RESEARCH | R9 | immutable multi-tool history, failure/interruption and accepted protection | 02-02 | COVERED | no independent mutable accepted file |
| RESEARCH | R10 | deterministic ordering/idempotency/durability limitations | 01-02,02-02 | COVERED | same timestamps/IDs and fault-boundary assertions |
| RESEARCH | R11 | current observation differs from historical accepted/recent operation | 04-02 | COVERED | identity/scope matching; no fabricated health |
| RESEARCH | R12 | official legacy provenance plus current match without unconditional re-download | 04-01 | COVERED | own hash/booleans insufficient |
| RESEARCH | R13 | read-only inventory/detail/history; human and JSON consistency | 01-01,03,05-02 | COVERED | no subprocess/network/installer/writer sentinel |
| RESEARCH | R14 | own skills/bundled libraries/prerequisites are summaries and full detail | 05-01 | COVERED | not managed external provisioning |
| RESEARCH | R15 | existing test runner compiled --files; build first; isolated fault fixtures | all tasks | COVERED | exact task map in 39-VALIDATION.md |
| RESEARCH | R16 | real-host/platform/live integration claims remain unverified | all plans | COVERED | fixture evidence is not target-host proof |
| RESEARCH | R17 | no new packages; current pinned versions are selections | 01-02,03-01 | COVERED | no package-manager install tasks |
| CONTEXT | D-01 | managed tool detail; category summaries; all components detail | 03-01,05-01 | COVERED | user reachable --detail |
| CONTEXT | D-02 | group by tool; harness differences and shared installs | 03-02,05-01 | COVERED | actual per-harness relations |
| CONTEXT | D-03 | include catalog missing; distinguish unknown | 01-01,03-01 | COVERED | absent vs inaccessible |
| CONTEXT | D-04 | problems first | 04-02,05-01 | COVERED | deterministic severity/tool tie-break |
| CONTEXT | D-05 | manual installation; no inferred ownership/trust | 03-01,03-02,04-01 | COVERED | external/no-record explicit |
| CONTEXT | D-06 | proven active first per harness; preserve other candidates | 03-02,05-01 | COVERED | no invented global default |
| CONTEXT | D-07 | separate installation/connection ownership | 03-02,04-01,05-01 | COVERED | independent evidence |
| CONTEXT | D-08 | duplicates info; actual conflicts are problems | 03-02,05-01 | COVERED | version split fixture |
| CONTEXT | D-09 | installation/integrity/integration axes; unrun unverified | 01-01,04-02,05-01 | COVERED | protocol/call evidence not executed here |
| CONTEXT | D-10 | installed first; selected difference; four identities detail | 01-01,01-02,05-01 | COVERED | shared record/projection |
| CONTEXT | D-11 | short reasons/actions and detailed evidence | 01-01,03-01,04-02,05-01 | COVERED | typed codes/localized render |
| CONTEXT | D-12 | current and latest operation distinguished | 02-02,04-02 | COVERED | old accepted does not imply current health |
| CONTEXT | D-13 | tool history and entire multi-tool operation result | 01-02,02-02,05-02 | COVERED | two reverse views from same events |
| CONTEXT | D-14 | retain failed/interrupted metadata; newest first | 01-02,02-02,05-02 | COVERED | no automatic record deletion |
| CONTEXT | D-15 | read-only queries; explicit writers; no discovery adoption | 01-01,02-01,03,05-02 | COVERED | isolated writer consumed, installer cutover later |
| CONTEXT | D-16 | enough official proof+match allows no-reinstall handoff; preserve changes | 04-01 | COVERED | typed handoff path and CLI roundtrip |

Excluded by source boundaries: actual latest resolution/update/review (40), compatibility adapter work (41), new protocol/live invocation/native recovery (42), full migration and all consumer cutover/bilingual operation guidance (43), artifact retention policy, background promotion, harness/CLI-Hub provisioning. Exclusion is not a missing Phase 39 item.

## Research-resolution revision 1

Checker property: every research Open Questions entry has a source-grounded planning answer before execution; implementation must not choose a fundamental contract later. Both entries are now RESOLVED in the researcher-owned research document and adopted explicitly by plans 39-03/39-04. This revision changes no task count, file ownership, requirement, wave, command or locked decision.

| Research question | Source-grounded answer adopted | Plan enforcement | Disposition |
|---|---|---|---|
| OQ1: bounded observation and harness attribution | Research tool/harness matrix fixes Cua official/legacy paths, GSD native version/profile/runtime files, ECC npm/skill roots, bounded MCP/npm/PATH and Pi bridge manifests; current probeHarness calls subprocess probeCommand and cannot be reused by the read-only route | 39-03 resolved contract, 39-03-01 sentinel/acceptance; bounded-candidate absence distinct from unobserved host scope, npx/proxy intent distinct from actual installed/active proof | RESOLVED — source contract decided; actual host installations remain unverified |
| OQ2: sufficient legacy handoff evidence | Research evidence matrix fixes official source→exact artifact→trusted digest/actual verification→current installed or identified transformed bytes→prior ownership/modification chain; lock, journal and Cua pin claims alone cannot supply the entire chain | 39-04 resolved contract, 39-04-01 per-link insufficiency/transform fixtures; enough retained evidence permits ready without mandatory re-download | RESOLVED — sufficiency contract decided; existence of a complete chain on any real host remains unverified |

Sources rechecked for this correction: `src/adapters/harnesses.ts` probeHarness→probeCommand; `src/core/install.ts` globalGsdConfigRoot/inspectGsdInstall; `src/core/computer-use-install.ts` officialCuaPaths/verifyOfficialCua; `src/core/transaction.ts` journal fields; `src/types.ts` LockedPackage/StackLock; `src/core/ecc-fixture.ts` actual tarball/source/target hashes; `src/core/mcp-fixture.ts` metadata integrity/archive existence. None was executed or modified. The unchanged validation rows already map 39-03-01/02 to observer/binding fixtures and 39-04-01 to handoff/record-store fixtures, so no validation-map edit is required; draft/false flags remain honest.

## Deterministic contribution gates

- API pre-plan detector: detected:false on actual ROADMAP input. Final ROADMAP+PLAN detector: detected:true, matched internal Inventory API wording. Scope inspection confirms local file/in-process APIs only. COVERAGE.md contains the required reasoned No external API integration declaration; no fictitious external capability matrix.
- Assumption-delta query on resolved roadmap: detected:false. Additional combined-scope scan: detected:true for fallback in probe notes and optional legacy evidence. 39-01 contains the explicit primary noun/no-change decision: generalized tool + candidate + operation remains primary per D-02/D-06; optional metadata never becomes an identity anchor. No unasked architectural choice or accepted debt is introduced.
- Schema push scan: no Payload/Prisma/Drizzle/Supabase/TypeORM path in scoped files. JSON record schema is not an ORM/live database. SCHEMA_PUSH_REQUIRED=false; no database mutation is planned.
- Security: ASVS L1, block high. Unique T-39-01..T-39-21 registers and test mitigations are mapped in 39-VALIDATION.md. Reserved T-39-SC appears in each plan. No package install tasks, no additional legitimacy checkpoint.
- UI detector frontend:false and no AI system scope. No UI-SPEC/AI-SPEC is needed. Graph query returned disabled; no graph relationship is treated as current truth.

## Spec-less edge report dispositions

Source: C:/Users/alpha/AppData/Local/Temp/gsd-plan39-td28RQ/edge-probe.json, four items, no SPEC section producer. The original report is unchanged.

| Requirement / category | Final disposition | Authored contract |
|---|---|---|
| LOC-01 / unclassified | unresolved; FLAGGED ASSUMPTION A-39-EDGE-01 | Classification is incomplete, not proof of edge-free behavior. Manual review remains visible at phase verification; existing concrete observation/ownership fixtures do not silently resolve the detector row. |
| LOC-04 / adjacency | resolved, verification: explicit | 39-01 truths: equal event identity+equal content is one event; changed content conflicts; equal version/path/time never merges different tools. 39-01-02 and 39-02-02 tests. |
| LOC-04 / empty | resolved, verification: explicit | 39-01 truths: empty store returns empty history/null accepted; empty tool operation and null required IDs rejected. 39-01-02 and 39-02-01 tests. |
| LOC-04 / ordering | resolved, verification: explicit | 39-02 truth: occurredAt descending, then operationId/sequence/eventId descending; randomized directory enumeration and equal-time fixtures. 39-02-02 tests. |

Equality: 4 surfaced = 3 explicit must_haves truths + 1 surfaced flagged assumption. No dismissal or invented backstop pass. A-39-EDGE-01 remains an honest unresolved classification flag, not an omitted requirement.

## Prohibition recall, precision and projection

Stage 1 adversarial candidates, ten per requirement:

| Requirement | Candidate | Stage 2 disposition |
|---|---|---|
| LOC-01 | discovery silently takes management ownership | KEEP P39-1: bespoke values/authorization intent |
| LOC-01 | historical/selected data promises current health | KEEP P39-2: bespoke transparency intent |
| LOC-01 | missing catalog tools omitted | DROP routine correctness; SC1/observer fixtures |
| LOC-01 | duplicates merged away | DROP routine shape correctness; relation fixtures |
| LOC-01 | unreadable shown absent | DROP routine edge correctness; unknown fixtures |
| LOC-01 | unstable row ordering | DROP routine ordering; deterministic fixtures |
| LOC-01 | config command injection | DROP canon-referral; security register T-39-10 |
| LOC-01 | credentials from config displayed | DROP canon-referral; T-39-12/T-39-19 |
| LOC-01 | path escape while observing | DROP canon-referral; path/security verification |
| LOC-01 | unnecessary external service calls during read | DROP routine read-contract correctness; sentinels |
| LOC-04 | enough prior official evidence still forces reinstall/download | KEEP P39-3: bespoke preservation/control intent |
| LOC-04 | failed operation overwrites accepted identity | DROP routine state-machine correctness; fault fixtures |
| LOC-04 | partial multi-tool results hidden | DROP routine result correctness; operation fixtures |
| LOC-04 | failed attempts deleted | DROP routine explicit retention contract; history fixtures |
| LOC-04 | broken/newer records reset | DROP routine version correctness; reader fixtures |
| LOC-04 | equal event IDs collide | DROP routine adjacency; edge contract |
| LOC-04 | concurrent writer clobbers events | DROP routine concurrency; ownership fixtures |
| LOC-04 | unsafe state path override | DROP canon-referral; T-39-05 |
| LOC-04 | source URL carries credential values | DROP canon-referral; T-39-02/T-39-09 |
| LOC-04 | arbitrary hash masquerades as official provenance | DROP routine explicit provenance correctness; T-39-14 |

Canon breadcrumbs: injection/path traversal/secrets are canon security — refer to `$gsd-secure-phase` and the project's applicable static/security tooling; do not mint duplicate prohibition items. No claim is made that ESLint exists or a security review ran. Product tests and STRIDE mitigations remain explicit obligations.

All three kept items were passed through installed `probe-core.cjs` `projectProhibitions` with status=unresolved and the spec-less descriptor-less reason. The returned statement/status/reason fields are preserved in plan 01 (P39-1) and plan 04 (P39-2/P39-3). No check_kind/check_target/check_rule/check_violation_fixture/check_clean_fixture descriptor was authored. They dispose as flagged-unverified and must not be counted green because adjacent contract tests pass. Separate later review may wire/resolve them honestly. Equality: 3 kept = 3 authored in must_haves.prohibitions; 0 silently dropped.

## Reversibility and evidence limits

39-01-02 and 39-02-02 retain one-way ratings for versioned persistent history/accepted protection, already settled by D-12~D-16 with schema/path details delegated in CONTEXT. Structure validation warns that no new decision checkpoint precedes them; the already-settled exception applies. No newly selected service, irreversible host adoption or deletion is authorized. Other public internal contracts are costly; observer/projection changes are reversible.

All implementation commands are planned, not run. Draft validation flags stay false until execution evidence exists. Fixture green does not establish target-host discovery coverage, official source availability, native invocation, new-version compatibility, all-platform parity or phase completion. Planning does not authorize install, upgrade, link, deployment, push or publication.
