# Phase 1: Safe Operation Boundary - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-03
**Phase:** 1-Safe Operation Boundary
**Areas discussed:** Unsupported filesystem handling, interrupted and concurrent operation recovery, schema evolution policy, diagnostics and redaction

---

## Unsupported Filesystem Handling

| Decision | Selected | Alternatives considered |
|----------|----------|-------------------------|
| Unprovable safety | Block mutations; keep inspection and dry-run | Unsafe override; warn and proceed |
| Paths checked | Every operation path | Targets and state only; final targets only |
| Contained links | Allow only with canonical containment and stability recheck | Reject every link; check final path only |
| Preflight timing | Finish all checks before any mutation | Per-step checks; execution-time checks and rollback |

**User's choice:** Selected the recommended fail-closed option for all four decisions.
**Notes:** No unsafe filesystem escape hatch is part of the v0.1 contract.

---

## Interrupted and Concurrent Operation Recovery

| Decision | Selected | Alternatives considered |
|----------|----------|-------------------------|
| Mutation concurrency | One writer per alpha-AOS state root | Per-target locks; optimistic hash-conflict handling |
| Active lock response | Fail immediately with operation metadata | Bounded wait; indefinite wait |
| Apparently stale lock | Block as `needs-repair` and inspect | PID-based removal; time-based removal |
| Safe inverse | Preview recovery and require `repair --apply` | Automatic rollback; adopt partial state |

**User's choice:** Selected the recommended explicit, non-automatic recovery option for all four decisions.
**Notes:** Read-only inspection remains available while mutation is blocked.

---

## Schema Evolution Policy

| Decision | Selected | Alternatives considered |
|----------|----------|-------------------------|
| Unknown fields | Strict core with explicit `extensions` | Reject all extensions; preserve unknown core fields |
| Extension activation | Registered namespace and schema only | Immediate activation; delete unknown extensions |
| Older versions | Read-only interpretation plus explicit migration apply | Current-only rejection; automatic migration |
| Error reporting | Bounded deterministic error list | First error only; partial warning-based use |

**User's choice:** Selected the recommended strict-core, explicit-extension model for all four decisions.
**Notes:** Unknown newer versions fail closed; preserved unknown extensions remain inert.

---

## Diagnostics and Redaction

| Decision | Selected | Alternatives considered |
|----------|----------|-------------------------|
| Subprocess output | Bounded redacted excerpts plus fingerprint | No output; terminal-only raw output |
| Secret detection | Layered exact-value, name, URL, and structural detection | Exact values only; heuristics only |
| Private paths | Stable home, temp, and project aliases | Credentials only; hide every path |
| Support material | Previewable local redacted bundle, no auto-upload | Screen output only; consent-based auto-upload |

**User's choice:** Selected the recommended bounded and reviewable redaction model for all four decisions.
**Notes:** Raw output is not persisted, and sharing remains a user action.

## the agent's Discretion

- Concrete cross-platform lock and filesystem-probe implementation.
- Strict-schema library and migration internals.
- Diagnostic limits, fingerprint algorithm, code names, and bundle file layout within the locked safety boundaries.

## Deferred Ideas

None.
