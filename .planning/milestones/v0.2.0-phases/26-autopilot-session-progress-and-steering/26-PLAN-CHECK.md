# Phase 26 — Independent Pre-execution Plan Check

## ISSUES FOUND

**Phase:** Autopilot Session Progress and Steering  
**Plans checked:** 3; 8 tasks; waves 1 -> 2 -> 3  
**Reviewed revisions:** initial plans `02af33e`, narrow verification correction `84484bb`  
**Current issues:** 0 blockers, 2 scope warnings, 0 info

The plans cover the approved phase goal. No missing requirement, locked-decision contradiction, unsafe tier assignment, incompatible data contract, dependency defect or omitted critical wiring was found. The remaining file-count warnings are accepted execution risks, not a request to reduce product scope. Root explicitly accepted the existing sequential-task/estimate rationale during this review.

This is plan verification only. No application, implementation tests, browser session, paid canary or original-project operation was run. Implementation and final acceptance remain pending.

## Coverage

| Requirement | Executable coverage | Finding |
|---|---|---|
| SESSION-01 | 26-01-01/02 real metered tracer, actual quick/full/dedicated receipts; 26-03-01 integration | Covered |
| SESSION-02 | 26-01-01/03 exact binding, ordered replay and early observer; 26-02 exact reads/controls; 26-03-01 reconnect | Covered |
| SESSION-03 | 26-01-03 five-host capability metadata; 26-03-01/02 same public entry and rendered skill parity | Covered |
| SESSION-04 | 26-02-01/02/03 bounded evidence and durable proposals through existing responsible boundaries | Covered |
| SESSION-05 | 26-01 observer/auth/resource controls and detached default; 26-02 input/output bounds; 26-03 hostile/expiry fixtures | Covered |
| SESSION-06 | Every task has targeted checks; 26-03 explicitly retains actual independent review, settled fixes, final full regression, visual evidence and GSD verification under root | Covered |

All six roadmap IDs appear in plan requirements frontmatter and have concrete actions and expected behavior. PROJECT.md adds no relevant Phase 26 obligation missing from that coverage; unrelated milestone/native-release/inode/publication work is not silently imported.

## Goal-critical findings

- **Real tracer first:** 26-01-01 follows an actual credential-free metered dispatch through durable records to real authenticated HTTP/SSE. Tests are not a disconnected scaffold. The next slices expand execution-path coverage and the natural launch/control path.
- **Usable early launch:** 26-01-03 requires `onRunReady` after durable actual run creation and before the first long dispatch, surfaces the URL before awaiting `startTask`, and tests this with held work. Approval reservation alone is insufficient. Attach cannot restart or select latest.
- **Identity:** Closed contract ID/digest/revision/run/host/logical-origin binding is carried across records, observers, cursors and controls. Unknown vendor ID stays separate and null; worker identity cannot become origin identity. Concurrent run/revision/session mismatch and conflicting replay are tested.
- **Passive truthful reporting:** Actual process/lifecycle/model receipts are distinguished from configured values, transport liveness and GSD acceptance. Missing reasons/usage stay unknown. Heartbeats, deduplication, timers and delivery do not invoke a model. Dead-owner/process-close uncertainty has explicit states.
- **Q&A and steering:** The initiating conversation reads a bounded redacted evidence packet. Durable receipt/delivery/assessment/deferral/rejection/application remain distinct. Existing normal controller/GSD dispatches consume at safe boundaries; no auxiliary controller, active-plan hot edit or receipt-as-effect shortcut is planned. Changed or uncertain authority requires revision/approval or deferral.
- **Security:** Plans incorporate TM-01..13, including exact loopback Host/Origin, one-use fragment exchange, short scoped bearer, fixed assets/routes, no browser task controls/files, inert rendering, private bounded storage, replay conflicts, finite sockets/queues/drain/retry/deadline/disposal, and redaction.
- **UI usability:** The Korean semantic flow supplies visible binding, current observation, action-needed notice, timeline, capability/evidence and conversation guidance. It specifies keyboard/focus behavior, nonsecret copy fallback, live-region deduplication, contrast, 320px/200% reflow and normal authenticated F5 restoration. Actual browser evidence remains a final gate; source/HTTP assertions cannot substitute.
- **Five hosts:** Common panel availability is separated from native transport, context, wakeup, plugin and visible-acknowledgement facts. Native Codex shell and universal native chat delivery are not approved or required. Unverified native UI stays explicit without blocking the approved panel path.
- **Final ownership:** Executors run targeted checks. Root performs actual Sol high independent review, Terra high accepted fixes, then one settled final full suite, fixture-only visual QA and actual GSD goal verification. Further full-suite runs need a new-change/failure justification. No executor can mark these pending gates complete.

## Structure, dependencies and scope

`verify.plan-structure` returned `valid:true`, no errors/warnings, and complete files/action/verify/done fields for all three plans. Their must_haves were loaded and traced to concrete actions and user-observable outcomes. Declared dependencies are valid and acyclic. Shared mutable source files are ordered by waves; there are no same-wave plan pairs or undeclared temporal-coupling advisories. Session/projection/steering packet schemas agree across slices and retain raw durable evidence while bounding presentation.

| Plan | Tasks | Files | Wave / dependency | Calibrated estimate / budget | Scope |
|---|---:|---:|---|---|---|
| 26-01 | 3 | 12 | 1 / none | 66,000 / 100,000 | File-count warning |
| 26-02 | 3 | 11 | 2 / 26-01 | 56,000 / 100,000 | File-count warning |
| 26-03 | 2 | 9 | 3 / 26-01, 26-02 | 42,000 / 100,000 | Within thresholds |

All estimates were checked with `estimate-check --calibrated`: `over_budget:false`. Confidence is **low**, factor 1, sample count 0; these are not precise calibrated measurements. Mitigation is explicit sequential ownership, at most three tasks per plan, tracer-first behavior and targeted feedback. No task reaches the ten-file threshold. The first two plans still cross the ten-file plan warning threshold; keep that risk visible during execution.

## Nyquist and command checks

Nyquist is enabled. RESEARCH now explicitly links its Validation Architecture to the concrete VALIDATION task/threat map. It was reviewed rather than skipped.

| Task | Wave | Automated check | Failure statement | Result |
|---|---:|---|---|---|
| 26-01-01 | 1 | Build + session/panel phase26 fixtures | Exit, zero/no-op and required executed cases | Planned PASS |
| 26-01-02 | 1 | Build + progress/lifecycle phase26 fixtures | Exit, zero/no-op and required executed cases | Planned PASS |
| 26-01-03 | 1 | Build + CLI/session/panel phase26 fixtures | Exit, zero/no-op and required executed cases | Planned PASS |
| 26-02-01 | 2 | Build + steering/progress phase26 fixtures | Exit, zero/no-op and required executed cases | Planned PASS |
| 26-02-02 | 2 | Build + steering/lifecycle phase26 fixtures | Exit, zero/no-op and required executed cases | Planned PASS |
| 26-02-03 | 2 | Build + CLI/steering/session phase26 fixtures | Exit, zero/no-op and required executed cases | Planned PASS |
| 26-03-01 | 3 | Build + integration/panel phase26 fixtures | Exit, zero/no-op and required executed cases | Planned PASS |
| 26-03-02 | 3 | Build + owned-skill/task-skill/catalog fixtures | Exit, zero-pass and required executed cases | Planned PASS |

- **8a:** Automated presence 8/8; commands target concrete compiled fixture paths after build.
- **8b:** Finite targeted built-in runner commands, no watch mode or task-level full browser E2E suite. Runtime latency is unmeasured at planning time; the long final full suite is isolated under root.
- **8c:** Sampling continuity: wave 1 3/3, wave 2 3/3, wave 3 2/2.
- **8d:** New session/panel/progress/steering/integration tests have explicit owning red-first slices before their checks. No dangling MISSING sentinel or dependency on an unowned test scaffold. Creation remains pending, not existing passing evidence.
- **8e:** VALIDATION exists and maps all requirements, threats and final gate ownership. Its pending execution/sign-off flags are honest.
- **8f:** Initial supplied probe reported eight missing statements despite process exit 0. Correction `84484bb` changes only those eight verify blocks; commands and task scope are unchanged. Refreshed `phase26-failure-directions.json` is `status:ok`, total 8, blocker 0, warning 0, readError null. Statements name observable exits, zero/no-op outcomes and executed-case evidence.
- Supplied `phase26-verify-paths.json`: 8 commands, 0 blockers/warnings, readError null. No replacement paths were guessed and no probe was independently rerun.
- No swallowed-error assignment, anchored package-manager listing gate, fixed numerical test-total assertion or text/count acceptance gate is present.

## Other dimensions

Context compliance and scope reduction: PASS. All locked bullets are implemented or preserved as boundaries; CONTEXT contains no numbered D-XX decisions. Discretion over names/schema is exercised explicitly. No deferred feature, paid canary, denied cleanup bypass, global install, original Oh-My-Circuit write/resume or model substitution is introduced.

Dimension 7c: SKIPPED (no Architectural Responsibility Map). Nevertheless browser code only presents data; approval, controller ownership, steering validation and persistence stay outside that less-trusted tier.

Dimension 10: PASS. Repo AGENTS and supplied execution guidance are respected: GSD sole lifecycle owner, existing Node/TypeScript/testing and bounded private helpers, explicit model policy, finite handles and targeted checks followed by root final regression. No local project skill directories or configured checker skills were found. Task intake is already the authorized ordinary GSD plan-review lane.

Research resolution: PASS; summary has no unresolved Open Questions. Pattern compliance: named runtime, exact-reader, command-job, observer, controller and renderer patterns are incorporated; the no-analog HTTP/SSE surface is grounded by RESEARCH/UI-SPEC/THREAT-MODEL. No new library/framework or speculative native adapter is planned. Review incorporation: not applicable; no REVIEWS artifact supplied.

## Warnings and structured issues

Both warnings concern context/quality risk, not missing functionality. Root accepted the current three-task slices and sub-budget estimates; a split is an optional route, never a product-scope reduction or mandatory architecture change.

```yaml
issues:
  - plan: "26-01"
    dimension: scope_sanity
    severity: warning
    required_property: "Per-plan file scope should stay below the ten-file warning threshold."
    description: "26-01 lists 12 modified files and combines the event/authenticated-panel tracer, execution-path expansion and early CLI handoff. This exceeds the file-count warning threshold. Three sequential tasks and a low-confidence 66000/100000 estimate mitigate but do not erase context risk; root accepted this rationale."
    fix_hint: "If execution pressure materializes, preserve the tracer and full requirement coverage while moving a later expansion into a separate sequential slice."
  - plan: "26-02"
    dimension: scope_sanity
    severity: warning
    required_property: "Per-plan file scope should stay below the ten-file warning threshold."
    description: "26-02 lists 11 modified files across exact evidence reads, durable steering, existing GSD/supervisor boundaries and CLI entry. This exceeds the file-count warning threshold. Three sequential tasks and a low-confidence 56000/100000 estimate mitigate but do not erase context risk; root accepted this rationale."
    fix_hint: "If execution pressure materializes, isolate the public CLI completion from the existing-boundary tracer without adding a controller or narrowing approved steering."
```

## Recommendation

The eight initial verification blockers are resolved. No blocking revision remains. The two scope warnings have an explicit accepted-risk disposition; no scope-reduction or broader rewrite is requested. Root may proceed through the ordinary GSD execution gate with those warnings visible. This report does not claim implementation, UI or phase completion.
