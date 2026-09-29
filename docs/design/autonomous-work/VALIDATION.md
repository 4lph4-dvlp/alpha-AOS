# Validation and release evidence plan

The core claim is falsifiable: an accepted run must have current measured evidence for all mandatory criteria and an independent reviewer receipt on the same artifact digest. The tests below target ways that claim could be false.

| Layer | Adversarial case | Expected result |
|---|---|---|
| Contract | Change scope, authority or role after approval | Old approval digest refused |
| Autopilot opt-in | Start an ordinary GSD task or end an opted-in task and start another | No supervisor starts without that task's explicit request or approval |
| Pack checkpoint | Finish scaffolding or dependency installation with a newly matching project pack | Plan/status runs before application work; stale or unapproved digest cannot sync |
| Pack activation | Sync an approved project ECC skill/MCP while an agent session is already open | CURRENT verified; fresh session discovers and actually invokes the capability |
| Capability routing | Give a task a matching global or project ECC skill/MCP predicate at a GSD step | Native call/result receipt exists at that step; installed-only and discovery-only evidence fail |
| Capability drift | Change manifest, phase, pack source or harness version | Selection/proof recomputed; missing required call blocks or uses a proven alternate |
| Process | Hang child, flood stdout, leave a descendant | Bounded redacted output, coded stop, child tree terminated |
| Journal | Crash before action, during action and before recording result | Resume reconciles; uncertain effect is never replayed blindly |
| Concurrency | Two controllers start for one project | One fenced GSD writer; loser cannot restore winner's state |
| Agent protocol | Pi acknowledges prompt but continues working | No success before terminal event |
| Capability evidence | Install newer unsupported harness version | Role demoted to unverified until reprobed |
| Gate | Register a skill with no executable review step | Acceptance fails for missing invocation receipt |
| Review | Feed result for commit A into changed commit B | Stale report rejected |
| Review | Seed missing feature, duplicate issue, out-of-scope suggestion | Blocking gap once; suggestion deferred |
| Resource limits | Unlimited run, hard token cap with missing telemetry, quota failure | No run ceiling for first; fail closed for cap; quota classified separately |
| General connector | Partial success, unknown schema, malicious source text | Item-level result, schema refusal and no instruction execution |
| CoursePilot | Planned/viewed-only/already present/downloaded/error item mix | Only verified saved files count; targeted retry |
| GSD | Interrupt phase and attempt to skip unfinished plan | Resume at recorded boundary; no false phase completion |

## Support matrix acceptance

For each of five harnesses, record exact executable/version, OS, controller/executor/reviewer proof, cancellation, session isolation, global/project ECC skill discovery and invocation, MCP tool calls, pack state, mandatory hook calls, provider/model usage visibility and failure reason. Run synthetic 5×5×5 composition checks. Real-host invocations validate each advertised role and capability path plus representative pair handoffs. A failed, skipped or missing receipt yields `UNVERIFIED` or `UNSUPPORTED`, not a passing substitute.

## Release gate

Run targeted tests as modules are built. At Phase 22 run strict TypeScript check, full Node test suite, build, packed tarball lifecycle and one three-OS CI run. Record exact run IDs and real-host role/skill/MCP/pack invocation receipts. GSD's milestone audit, cross-phase integration checker, UAT, code review and independent final reviewer must have no unresolved blocking requirement gap. Native discovery plus one meaningful read-only invocation remains required for an advertised capability. Include a negative control showing normal GSD work never enters autopilot without task-specific consent.

## Example task oracles

**Development:** A CLI game fixture starts, displays a first-person view, responds to movement and fire inputs, enforces collision/hit rules, and reaches a win/loss state. Automated input and observation cover these criteria; a reviewer examines missing required behavior and code quality on the same commit. “Fun” requires an agreed rubric rather than an unsupported automated pass.

**CoursePilot:** A fresh manifest lists in-scope course/week/module IDs. The runner downloads approved items and records actual returned `downloaded` paths. A verifier checks file existence and source identity. Missing LMS access, `viewed_only`, partial result and a file that disappeared from disk are all reported separately. Re-running reconciles completed files and attempts only unresolved items.
