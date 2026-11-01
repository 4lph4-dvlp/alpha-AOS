# Phase 26 — Narrow Session-store Decision Review

Date: 2026-10-31. Reviewed `26-SESSION-STORE-DECISION.md` against the existing 26-01 interface/actions and the previously reviewed phase boundaries. No source implementation, whole-plan re-review, new external investigation, benchmark or browser test was performed.

## VERIFICATION PASSED — scoped store direction and boundary

**Architecture decision:** Valid forward continuation within 26-01.  
**Before executor handoff:** Carry the calibrated observed-identity boundary below into the continuation packet.  
**Current issues:** 0 blockers, 0 warnings, 0 info. The original plan-contract mismatch is resolved in the current 26-01 interface.

Using lazy Node built-in SQLite for the new projection alone is within the approved common-panel implementation scope. It preserves the exported APIs, exact binding, authority, read-only HTTP surface and existing resource limits; it adds no package/global setup or native host/model operation. No phase split, wider redesign or renewed task-scope approval is required for this internal substitution. This accepts the design direction, not its implementation or filesystem/performance proof.

## Evidence and rationale

The decision records the 251-event prototype at 26.7 seconds with full-history scanning and 220.4 seconds after three guarded publications per event, plus a crash-surviving publication fence. These are reported prototype measurements, not measurements reproduced by this review. The proposed transaction/index approach directly addresses those recorded failure modes while leaving GSD/controller/runtime fences alone.

The recorded Node v24.13.1 in-memory probe proves API availability only. The experimental API warning and lazy opt-in loading are explicit. Retaining the minimal version-grounded API, existing Node/TypeScript infrastructure and an honest unavailable capability outcome is appropriate. Missing module capability cannot fail or relaunch the underlying task; detached/help paths must not import it eagerly. Do not suppress the warning into a false stability claim.

The identity refinement is sound: one store selected by the validated digest/run identity must compare the entire approved binding inside its transaction. A supplied different host/origin/revision cannot obtain another accepted store merely by producing a different binding hash. Logical origin remains distinct from an unknown native vendor session ID.

## Executable-plan clarification — resolved

The original interface selected `stateRoot/runs/<digest>/sessions/<validated-binding-hash>/` and a short custom event-store write fence. The current 26-01 interface now selects `<validated-run-hash>`, compares the entire binding transactionally and explicitly supersedes that prototype fence with the reviewed SQLite correction. The original documentation blocker is resolved; no additional architecture preflight is required on that issue.

Existing lifecycle/controller/dispatch fences remain intact. The precise spelling of the internal path or SQL schema is an implementation choice; the invariant is stable run selection plus transactional full-binding validation, not a second origin-selected identity.

## Native-path boundary calibration — authoritative clarification

The earlier Native file boundary row was too strong if interpreted as requiring atomic namespace isolation against every arbitrary same-user replacement while SQLite opens or recovers a pathname. That stronger guarantee is not the project's existing filesystem boundary and is not required for this projection continuation. This clarification supersedes that interpretation; it does not waive observed identity checks or claim they provide descriptor-bound native opens.

Evidence: `src/core/command-jobs.ts:1080` states, “Observed identity fences are not an OS sandbox against arbitrary same-user renames.” AGENTS requires root-bounded managed operations and preservation of existing safety checks, not a new OS sandbox. THREAT-MODEL TM-06 specifies fixed paths, existing root/symlink/bounded-read helpers and refusal of traversal/symlink escape. Its Local hostile sites/processes row addresses HTTP authority/origin/bearer checks; its residual-risk section explicitly does not promise OS isolation from a compromised same-user environment.

The acceptable implementation boundary is therefore **private, fixed, run-selected paths with static refusal and observed pre/post identity validation**. Reuse existing supported path/identity guards; do not weaken their existing consumers. Check ancestors, database and the selected journal mode's fixed sidecar names before native access, around transaction/recovery boundaries where observable, and after native operations. Reject observed unsafe types, path drift or unexpected replacement; stop using the connection, return an explicit observer error and withhold unvalidated event results. SQLite's normal documented journal creation/removal is an allowed lifecycle, not an identity mismatch by itself. Bound and test those observations instead of requiring a persistent journal inode across its legitimate deletion.

**Explicit limits of proof:** `DatabaseSync` accepts a pathname. These checks do not prove no-follow/open-by-handle semantics for its internal database/journal opens. A same-user attacker can potentially replace and restore names wholly between checks, replace an entire namespace, or race an indivisible native call. Such attacks are outside this observed-identity proof. A detected post-operation mismatch proves refusal of the resulting observation; it does **not** prove SQLite performed no earlier I/O to a substituted path. Do not label this race-free isolation or claim all substitutions are detected. The implementation must never deliberately accept arbitrary client paths or bypass a mismatch it actually observes. No platform-specific ACL/native addon/OS isolation project is required merely to exclude these already-disclaimed adversarial races.

Concrete focused fixtures for this boundary:

1. Static symlink/junction or non-regular database, ancestor and applicable journal/sidecar paths are refused before the instrumented native-open/recovery operation. Use outside-root sentinel data to confirm this static refusal does not touch its target. Where the test host cannot construct a link type, record that limitation instead of claiming coverage.
2. Deterministic barriers immediately before open/transaction checks substitute a parent or database and leave it changed. The next observed check refuses it; no event result is accepted. These are persistent, observed-race fixtures, not claims about every possible timing.
3. A persistent replacement between a native operation and its postcheck is detected; the operation returns an observer error, publishes no unvalidated result and does not delete/repair the replacement or touch runtime/controller fences. Do not assert that this postcheck prevented all preceding native I/O.
4. For the chosen journal mode, test a pre-existing unsafe sidecar, normal journal creation/removal, a real interrupted transaction's regular private journal and a persistent sidecar/parent substitution at an available observation barrier. Avoid treating legitimate concurrent journal lifecycle as an attack or promising an unobservable native-internal race hook.
5. Verify private creation/access treatment for database and extant native artifacts using the project's supported platform checks. Confirm exact binding after native recovery, finite busy/error cleanup and refusal of legacy/corrupt schema. Continue the already-required real child crash, retry, contention, replay and 251-event fixtures.

These fixtures give Terra a concrete implementation route using the approved built-in API. Lack of a descriptor-taking SQLite constructor alone is not an observer-capability blocker. Actual observed-path failures, unavailable API or failed fixtures remain honest errors; do not substitute a model, silently reset data or invent a filesystem pass.

## Essential acceptance evidence

These conditions belong to the existing tracer/security/crash/performance verification. They do not claim completed tests or mandate an additional controller, dependency, framework or repeated full-suite run.

| Property | Concrete evidence required before accepting the corrected tracer |
|---|---|
| Atomic identity and sequence | Initial binding, sequence allocation and unique source identity are committed consistently. Every read/write checks the complete tuple. Same source/content returns the original record; different content fails without consuming an accepted sequence or producing a false event. Wrong origin/revision/run cannot create an alternate accepted binding. |
| Crash before commit | A real credential-free child is interrupted with an uncommitted transaction; confirm actual child closure before reopening. Recovery exposes no partial binding/event/sequence and a later append succeeds without deleting an alpha-AOS fence based on PID absence. |
| Commit before return | Crash after native commit but before caller acknowledgement, then retry the same source ID. The committed event replays once and retry returns its identity; no second effect/event is fabricated. |
| Concurrent publication | Separate processes contend on the same run with distinct and duplicate source IDs. Sequences remain unique/ordered, duplicate versus conflicting content stays deterministic, and a live writer cannot be bypassed. |
| Finite contention and errors | Explicit short finite busy timeout; rollback/close paths release connection resources. No model/network/user wait occurs inside a held transaction. Busy/corrupt/unavailable/unsafe-path outcomes remain explicit reporting errors and never clear execution locks, start work or manufacture lifecycle acceptance. |
| Native file boundary | Apply the calibrated boundary and five fixtures above: fixed private run-selected paths; static parent/database/sidecar symlink/type refusal; observed pre/post identity checks and persistent-race detection; explicit refusal on detected drift. Document journal mode and legitimate sidecar lifecycle. Do not require descriptor-bound native opens or claim prevention/detection of arbitrary same-user swap-back, whole-namespace or native-internal races. In-memory API success alone proves none of these checks. |
| Private native artifacts | Newly created database and journal/sidecar files receive the required private access treatment, not only the eventual main database. Explicit close and cleanup are tested without deleting durable evidence or taking over a live native transaction. |
| Bounded replay and retention | Prepared parameterized/indexed operations retain immutable event evidence, return bounded rows/bytes and explicit gaps, and preserve snapshot-to-cursor continuity. Observer ring eviction does not delete source evidence; existing retention policy remains authoritative. No full-history scan/rewrite is introduced per append. |
| Legacy/corrupt data | Unsupported prototype or schema formats are refused explicitly. Rebuildable projection does not authorize silent reset, deletion or overwrite of unknown data. Old prototype evidence is retained. |
| Measured usefulness | Run the same 251-event comparison once after the correction settles, recording configuration, elapsed time, exact successful event count and relevant fixture/process evidence. Check that contention/publication does not stall progress delivery or the task beyond the stated finite bounds. Decide the performance pass/fail budget before interpreting the result; SQLite's presence or a faster isolated insert is not a performance pass. Repeat only if a later relevant correction invalidates that evidence. |
| Preserved feature behavior | Retain real dispatch-to-HTTP/SSE, redaction, exact binding, replay/conflict, auth/reload, finite disposal and no-provider-request regressions. Database repair never creates a task transition. Browser evidence on the checkpointed prototype is evidence of that prototype; relevant rendering/transport checks must apply to the corrected backend before final acceptance. |

No requirement here demands a power-loss/disk-failure guarantee from a process-crash fixture. State the demonstrated failure model accurately. The decision's linked primary SQLite documentation supports a design choice; actual native path/recovery behavior still requires the isolated fixtures above.

## Preserved execution and verification boundaries

- Keep checkpoint `4712a8b`, reported timings and the initial missing-RED-history deviation. Do not rewrite history as successful TDD. Project TDD mode is advisory/disabled; existing tracer flags and forward tests remain unchanged.
- This substitution does not install anything, inspect credentials, run paid inference, operate a native Codex shell, mutate/resume original Oh-My-Circuit, or bypass the denied cleanup.
- Root's independent fixture browser QA can proceed on the preserved prototype while this decision is reviewed. It neither authorizes source changes outside GSD nor proves the corrected store.
- Keep actual independent review, accepted fixes, targeted affected checks, one settled final full regression, visual evidence and GSD goal verification. Do not repeat the full suite per storage edit or mark the phase complete from this decision.

## Structured issues

```yaml
issues: []
```

## Recommendation

Proceed with the approved internal backend correction through the existing GSD execution lane. The plan-contract mismatch is resolved. Root should carry this calibrated observed-identity boundary and concrete fixtures into the fresh continuation packet; another architecture-research loop or OS-sandbox preflight is not required. Implementation, actual crash/recovery, path-check, performance and feature acceptance remain pending. This scoped design pass is not a phase-completion pass.
