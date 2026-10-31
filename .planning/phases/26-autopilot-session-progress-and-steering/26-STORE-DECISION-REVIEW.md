# Phase 26 — Narrow Session-store Decision Review

Date: 2026-10-31. Reviewed `26-SESSION-STORE-DECISION.md` against the existing 26-01 interface/actions and the previously reviewed phase boundaries. No source implementation, whole-plan re-review, new external investigation, benchmark or browser test was performed.

## ISSUES FOUND

**Architecture decision:** Valid forward continuation within 26-01.  
**Before executor handoff:** One narrow plan-contract clarification is required.  
**Issues:** 1 blocker (documentation alignment), 0 warnings, 0 info.

Using lazy Node built-in SQLite for the new projection alone is within the approved common-panel implementation scope. It preserves the exported APIs, exact binding, authority, read-only HTTP surface and existing resource limits; it adds no package/global setup or native host/model operation. No phase split, wider redesign or renewed task-scope approval is required for this internal substitution. This accepts the design direction, not its implementation or filesystem/performance proof.

## Evidence and rationale

The decision records the 251-event prototype at 26.7 seconds with full-history scanning and 220.4 seconds after three guarded publications per event, plus a crash-surviving publication fence. These are reported prototype measurements, not measurements reproduced by this review. The proposed transaction/index approach directly addresses those recorded failure modes while leaving GSD/controller/runtime fences alone.

The recorded Node v24.13.1 in-memory probe proves API availability only. The experimental API warning and lazy opt-in loading are explicit. Retaining the minimal version-grounded API, existing Node/TypeScript infrastructure and an honest unavailable capability outcome is appropriate. Missing module capability cannot fail or relaunch the underlying task; detached/help paths must not import it eagerly. Do not suppress the warning into a false stability claim.

The identity refinement is sound: one store selected by the validated digest/run identity must compare the entire approved binding inside its transaction. A supplied different host/origin/revision cannot obtain another accepted store merely by producing a different binding hash. Logical origin remains distinct from an unknown native vendor session ID.

## Required executable-plan clarification

26-01's current interface still says artifacts live under `stateRoot/runs/<digest>/sessions/<validated-binding-hash>/` and publication uses a short custom event-store write fence. The decision instead requires a digest/run-selected database, full-binding rejection and native transactions with no PID-based lock takeover. Both instructions cannot remain authoritative at executor handoff.

The narrow update must identify the run-selected guarded location/schema, transaction/index identity semantics and the removal of this projection-specific custom fence. Reference this decision and the focused checks in the relevant 26-01 action/verification content so the executor receives them through normal GSD inputs. Existing lifecycle/controller/dispatch fences remain intact. The precise spelling of the internal path or SQL schema is an implementation choice; the invariant is stable run selection plus transactional full-binding validation, not a second origin-selected identity.

## Essential acceptance evidence

These conditions belong to the existing tracer/security/crash/performance verification. They do not claim completed tests or mandate an additional controller, dependency, framework or repeated full-suite run.

| Property | Concrete evidence required before accepting the corrected tracer |
|---|---|
| Atomic identity and sequence | Initial binding, sequence allocation and unique source identity are committed consistently. Every read/write checks the complete tuple. Same source/content returns the original record; different content fails without consuming an accepted sequence or producing a false event. Wrong origin/revision/run cannot create an alternate accepted binding. |
| Crash before commit | A real credential-free child is interrupted with an uncommitted transaction; confirm actual child closure before reopening. Recovery exposes no partial binding/event/sequence and a later append succeeds without deleting an alpha-AOS fence based on PID absence. |
| Commit before return | Crash after native commit but before caller acknowledgement, then retry the same source ID. The committed event replays once and retry returns its identity; no second effect/event is fabricated. |
| Concurrent publication | Separate processes contend on the same run with distinct and duplicate source IDs. Sequences remain unique/ordered, duplicate versus conflicting content stays deterministic, and a live writer cannot be bypassed. |
| Finite contention and errors | Explicit short finite busy timeout; rollback/close paths release connection resources. No model/network/user wait occurs inside a held transaction. Busy/corrupt/unavailable/unsafe-path outcomes remain explicit reporting errors and never clear execution locks, start work or manufacture lifecycle acceptance. |
| Native file boundary | Choose/document the journal mode and account for every native-created journal/sidecar it uses. Guard the database, directory ancestors and applicable sidecars against symlink/junction/file replacement, including recovery/reopen paths. Fixtures exercise pre-existing hostile paths and substitution during access. A pathname precheck or in-memory SQLite test alone is insufficient proof of the native open/recovery boundary. If safe identity cannot be established with this API, fail the observer explicitly; do not weaken shared helpers or advertise this as proven filesystem isolation. |
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

## Structured issue

```yaml
issues:
  - plan: "26-01"
    task: 1
    dimension: key_links_planned
    severity: blocker
    required_property: "The executable plan and selected session-store decision specify one consistent storage identity and publication/recovery mechanism before executor handoff."
    description: "The current interface_contract still selects a sessions/<validated-binding-hash> location and custom event-store write fence. The reviewed decision requires one digest/run-selected database with transactional full-binding rejection and native recovery without that projection fence. An executor following the unchanged plan can retain the failed fence or accept a second origin-selected store."
    fix_hint: "Narrowly supersede the old path/fence paragraph and reference the reviewed run-bound transaction and focused acceptance conditions in the existing tracer action/verification. Preserve public APIs, all task authority and unrelated runtime/GSD fences."
```

## Recommendation

Approve the internal backend direction. Resolve the narrow plan-contract mismatch, then resume 26-01 through the existing GSD execution lane with the listed focused evidence pending. No architectural rejection or broader replanning is warranted; no implementation, crash-safety, performance or phase-completion pass is issued.
