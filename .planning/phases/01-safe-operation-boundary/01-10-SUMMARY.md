---
phase: 01-safe-operation-boundary
plan: 10
subsystem: infra
tags: [strict-validation, native-config, install-state, evidence, receipt, closed-schema]

requires:
  - phase: 01-05
    provides: "Strict multi-format validation engine and version router"
  - phase: 01-06
    provides: "Strict catalog, lock and project-manifest loaders"
  - phase: 01-09
    provides: "MutationSession and durable transaction state"
provides:
  - "Closed schemas for managed runtime state, evidence envelopes and receipt envelopes"
  - "validateNativeConfig: strict syntax plus owned-subtree validation before any MCP render"
  - "inspectRuntimeMarker: version-aware, read-only operational state inspection"
  - "rejectRawCredentials: a domain rule that refuses an envelope carrying a secret"
affects: [01-13, 01-15]

actuals:
  tokens: 34000
  tasks: 3
  commits: 1

tech-stack:
  added: []
  patterns:
    - "Validation claims only the fields alpha-AOS writes; the rest of a native file is not this tool's to judge"
    - "A future envelope gets a closed schema and an inspect-only route long before it gets a writer"

key-files:
  created:
    - schemas/evidence.schema.json
    - schemas/receipt.schema.json
  modified:
    - schemas/install-state.schema.json
    - src/core/validation.ts
    - src/core/mcp.ts
    - src/core/isolation.ts
    - test/validation.test.ts
    - test/mcp.test.ts
    - test/isolation.test.ts

key-decisions:
  - "OWNED_SERVER_SCHEMA keeps additionalProperties open: a harness owns the rest of its own entry, and claiming the whole object would mean rejecting fields that are not alpha-AOS's to manage"
  - "The runtime marker is the only evidence a directory is alpha-AOS's to remove, so its schema is fully closed — nothing in it may be inferred or defaulted"
  - "Evidence and receipt envelopes ship parse/inspect/migration-plan APIs only; no collection, materialization or apply behaviour was added"

patterns-established:
  - "validateAgainstSchema roots its issues at the owned subtree, so an issue path points at the field a user can actually fix"

requirements-completed: [SAFE-04, SAFE-05]

coverage:
  - id: D1
    description: "Ambiguous or malformed native configuration is rejected before anything is rendered or applied"
    requirement: SAFE-05
    verification:
      - kind: unit
        ref: "test/mcp.test.ts#ambiguous native configuration is rejected before anything is rendered"
        status: pass
      - kind: integration
        ref: "test/mcp.test.ts#planMcpSync refuses ambiguous native input before it can mutate"
        status: pass
    human_judgment: false
  - id: D2
    description: "Only alpha-AOS-owned entries are semantically validated; unrelated user-owned native content is preserved untouched"
    requirement: SAFE-05
    verification:
      - kind: unit
        ref: "test/mcp.test.ts#validation claims only the fields alpha-AOS writes, not the whole entry"
        status: pass
      - kind: unit
        ref: "test/mcp.test.ts#a native config with no managed servers is accepted untouched"
        status: pass
    human_judgment: false
  - id: D3
    description: "A malformed owned subtree returns a stable, redacted, path-rooted issue"
    requirement: SAFE-04
    verification:
      - kind: unit
        ref: "test/mcp.test.ts#a malformed alpha-AOS-owned entry is refused with a stable redacted issue"
        status: pass
      - kind: unit
        ref: "test/validation.test.ts#validateAgainstSchema roots its issues at the owned subtree"
        status: pass
    human_judgment: false
  - id: D4
    description: "Operational state validates as a closed document before inspection or mutation; an older supported record is read-only and an unknown newer one refuses"
    requirement: SAFE-05
    verification:
      - kind: integration
        ref: "test/isolation.test.ts#a runtime marker is read strictly before a directory is removed"
        status: pass
      - kind: integration
        ref: "test/isolation.test.ts#a supported older runtime marker is readable but is not acted on"
        status: pass
    human_judgment: false
  - id: D5
    description: "Evidence and receipt envelopes are closed current documents, and an unknown core field or newer version refuses"
    requirement: SAFE-05
    verification:
      - kind: unit
        ref: "test/validation.test.ts#evidence and receipt envelopes validate as closed current documents"
        status: pass
      - kind: unit
        ref: "test/validation.test.ts#an envelope with an unknown core field or a newer version refuses"
        status: pass
    human_judgment: false
  - id: D6
    description: "An envelope carrying a raw credential is refused by domain validation"
    requirement: SAFE-04
    verification:
      - kind: unit
        ref: "test/validation.test.ts#an envelope carrying a raw credential is refused"
        status: pass
    human_judgment: false
  - id: D7
    description: "An unregistered extension namespace is preserved but cannot change the normalized core"
    requirement: SAFE-05
    verification:
      - kind: unit
        ref: "test/validation.test.ts#an unregistered envelope extension is preserved but cannot change the normalized core"
        status: pass
    human_judgment: false

duration: unrecorded
completed: 2026-09-04
status: complete
---

# Phase 01 Plan 10: Strict operational and native document boundaries

**Every remaining managed record — runtime state, evidence, receipt — has a closed schema, and a native configuration file is now parsed strictly and validated only where alpha-AOS actually owns it.**

> **Reconstructed record.** This summary was written on 2026-09-05 from the plan, the commit and the passing tests, because the original execution committed its work (`b7a01eb`, 2026-09-04) but never wrote the summary. The wave 3 documentation commit (`c34ca9a`) says "Summaries for 01-10 and 01-11" but only contains 01-11. Nothing was re-executed: every claim below is read back from the delivered artifacts and the suites that cover them. `duration` is `unrecorded` because it was never captured.

## Performance

- **Completed:** 2026-09-04 (commit `b7a01eb`)
- **Tasks:** 3
- **Files created:** 2 · **modified:** 7 — exactly the nine the plan declared in `files_modified`

## Accomplishments

- **`validateNativeConfig` is the gate every native MCP config passes before a renderer sees it.** Syntax ambiguity — a duplicate key, a multi-document YAML stream, a colliding TOML table — is rejected there, and `planMcpSync` calls it before it can reach a mutation. `nativeConfigFormat` names each harness's syntax (Codex TOML, Hermes YAML, the rest JSON) in one place instead of at each call site.
- **Validation claims only the fields alpha-AOS writes.** `OWNED_SERVER_SCHEMA` checks `command`, `args`, `env`, `type`, `lifecycle` and `directTools` on a managed server entry and deliberately leaves `additionalProperties` open: a harness owns the rest of its own entry — Codex writes `startup_timeout_sec` — and claiming the whole object would mean rejecting or discarding fields that are not this tool's to manage. A config with no managed servers is accepted untouched.
- **`validateAgainstSchema` roots its issues at the owned subtree**, so a reported `documentPath` points at the field a user can actually fix rather than at the root of a file they did not write.
- **The runtime marker schema is fully closed.** `install-state.schema.json` requires `schemaVersion`, `managedBy: "alpha-aos"`, a 16-hex `projectId`, a `mode` enum and a 64-hex `policyHash`, with `additionalProperties: false`. That marker is the only evidence a directory is alpha-AOS's to remove, so nothing in it may be inferred or defaulted.
- **`inspectRuntimeMarker` reads that state through the version router without acting on it.** A current record yields a value; a supported older one yields a migration plan and an explicit `value: null` so it cannot be consumed as current; an unknown newer one refuses. `cleanIsolationRuntime` consumes this, which is why a malformed, extended or unknown-version marker leaves the directory alone instead of being partially trusted.
- **Evidence and receipt envelopes exist as closed schemas before their writers do.** Both are `additionalProperties: false` with identity, version, producer, `createdAt` and `sourceHash`; evidence carries `facts`, receipt carries `targets` and an optional `evidenceHash`. Only parse, inspect and migration-plan routes were added — no Phase 2 evidence collection and no Phase 3 receipt materialization.
- **`rejectRawCredentials` is a domain rule, not a formatting one.** An envelope whose bytes carry a credential-shaped value is refused even when it satisfies the schema.

## Verification

`node --test dist/test/validation.test.js dist/test/mcp.test.js dist/test/isolation.test.js` → 50 tests, 50 pass, 0 fail (re-run 2026-09-05).

Twelve of those tests were introduced by this plan; they are named in the coverage block above.

## Deviations from Plan

- **The summary was not written at execution time.** This is the deviation. The code, the schemas and the tests all landed together in one commit and have been green since; only the record was missing, which is why `/gsd-execute-phase` halted at `safe_resume_gate` on 2026-09-05 rather than re-running work that was already done.
- **`duration` is unrecorded.** It was never captured and is not reconstructible from the commit alone; recording a plausible number would be inventing evidence.

## Open Gaps

- **No writer produces an evidence or receipt envelope yet.** That is the plan's intent — the schemas and inspection routes exist so the boundary is in place before Phase 2 and Phase 3 add the workflows that fill them — but until then those two schemas are validated only against test fixtures.

## Next Phase Readiness

Wave 3 is complete with `01-11`. The strict native-config route this plan added is what `01-13` later builds `planMcpOperation` on top of, and `inspectRuntimeMarker` is what makes `01-13`'s journaled `cleanIsolationRuntime` able to refuse an unproven directory.

---
*Phase: 01-safe-operation-boundary*
*Completed: 2026-09-04 · Summary reconstructed 2026-09-05*
