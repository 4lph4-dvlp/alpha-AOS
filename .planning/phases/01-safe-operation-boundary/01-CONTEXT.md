# Phase 1: Safe Operation Boundary - Context

**Gathered:** 2026-09-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Close the safety gaps around every existing alpha-AOS preview, filesystem mutation, transaction, schema input, subprocess, and diagnostic surface. Preserve the working dry-run, journal, snapshot, hash, rollback, fixture, and adapter foundations; add only the missing guarantees required by SAFE-01 through SAFE-06. Project detection, project-pack materialization, mandatory GSD gates, tree-off behavior, full uninstall, and release qualification remain in their later roadmap phases.

</domain>

<decisions>
## Implementation Decisions

### Unsupported Filesystem Handling
- **D-01:** If alpha-AOS cannot prove path-boundary, reparse-point, or filesystem safety, all mutations fail closed. Inspection and dry-run remain available, and no unsafe override is offered.
- **D-02:** Preflight covers every path involved in an operation: targets, state, journals, snapshots, temporary files, install sources, and the package root. All checks finish before any file or external-package mutation begins.
- **D-03:** Symlinks and junctions are allowed only when both configured and canonical paths remain inside the allowed boundary and stability is rechecked immediately before apply. Escaping links and unknown reparse-point kinds are rejected.

### Interrupted and Concurrent Operations
- **D-04:** Each alpha-AOS state root permits one mutating writer at a time. Read-only status, doctor, and dry-run operations remain available while a writer is active.
- **D-05:** A competing mutation fails immediately and reports the active operation ID, start time, PID, and retry guidance. It does not wait indefinitely or remove the lock.
- **D-06:** A lock that appears abandoned is never cleared solely because its PID is absent or a timeout elapsed. It blocks new mutations as `needs-repair` until the journal, operation token, and target hashes are inspected.
- **D-07:** Diagnosis may construct a safe recovery plan, but recovery never mutates automatically. Restoration requires an explicit `repair --apply` action.

### Schema Evolution
- **D-08:** Catalog, lock, manifest, evidence, receipt, and journal core fields use strict closed-world validation. Extensibility is permitted only under an explicit namespaced `extensions` area.
- **D-09:** Extension data affects planning or apply only when its namespace and schema are registered with a supported adapter. Unknown extension data may be preserved and displayed but remains inert.
- **D-10:** Supported older schema versions are interpreted read-only and receive a previewable migration plan that requires explicit apply. Unknown newer versions are rejected.
- **D-11:** Validation reports a bounded, deterministically sorted error list with stable error codes, document paths, expected forms, and redacted summaries of actual forms.

### Diagnostics and Redaction
- **D-12:** Failed subprocesses retain only bounded redacted excerpts, a whole-output fingerprint, exit code, and timeout metadata. Raw stdout or stderr is never persisted to plans, journals, JSON, CI evidence, or support artifacts.
- **D-13:** Redaction combines exact credential values, secret-bearing name patterns, URL userinfo and token parameters, and structural PEM, JWT, and API-key detection. Replacements use stable typed placeholders.
- **D-14:** Human, JSON, and CI output consistently alias home, user-identifying, temporary, and selected project roots while preserving useful repository-relative paths and environment-variable names.
- **D-15:** Diagnostic support material is an explicit local bundle with a dry-run manifest and redacted content preview. alpha-AOS never uploads it automatically; the user controls sharing.

### the agent's Discretion
- Select the locking primitive, lock-record encoding, and platform-specific filesystem probes that satisfy the decisions above on Windows, macOS, and Linux.
- Select strict schema-validation and migration implementation details while preserving deterministic output and extension inertness.
- Set bounded excerpt sizes, fingerprint algorithms, typed placeholder vocabulary, and support-bundle layout, provided raw secrets and raw subprocess output cannot escape.
- Define stable diagnostic error-code names and CLI formatting consistent with the repository's existing typed finding and plan/apply patterns.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Product and Phase Contract
- `.planning/PROJECT.md` — Product safety, determinism, secret-handling, ownership, and supply-chain constraints.
- `.planning/REQUIREMENTS.md` — SAFE-01 through SAFE-06 and the later-phase boundaries that Phase 1 must not absorb.
- `.planning/ROADMAP.md` — Phase 1 goal, deliverables, success criteria, and dependency order.

### Existing Architecture and Gaps
- `.planning/codebase/ARCHITECTURE.md` — Existing plan/apply, adapter, fixture, transaction, and state-root architecture to preserve.
- `.planning/codebase/CONCERNS.md` — Confirmed dry-run mutation, path escape, secret disclosure, configuration, and concurrency gaps.
- `.planning/codebase/TESTING.md` — Existing Node test patterns and missing filesystem, crash, CLI, wrapper, and redaction coverage.

No external specification was referenced during discussion; the project planning documents above are authoritative for this phase.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/core/transaction.ts`: Existing atomic temp-file writes, snapshots, hash journal entries, allowed-root checks, rollback preflight, and byte restoration form the base to harden rather than replace.
- `src/core/process.ts`: Existing command resolution, captured/interactive execution, and timeouts provide the seam for a single bounded shell-free process adapter and environment policy.
- `src/core/paths.ts`: Existing home-path redaction and state-root resolution can become the centralized path-alias layer.
- `src/core/catalog.ts` and `schemas/`: Existing catalog/lock parsing and JSON schemas provide migration points for strict compiled validation.
- `src/core/doctor.ts` and `src/types.ts`: Typed diagnostic findings provide the pattern for stable safety and repair codes.

### Established Patterns
- Public mutations split plan from apply and default to dry-run in `src/cli.ts`.
- Managed file writes flow through `applyFileTransaction`; external package-manager mutations are verified and reported separately.
- Tests use `node:test`, strict assertions, real temporary files, and behavior-focused negative cases without a mocking framework.
- Stable locks and exact hashes are authoritative; candidate inputs must never reach end-user apply.

### Integration Points
- Every `applyFileTransaction` caller must use the shared canonical-boundary preflight and writer lock.
- `src/core/install.ts` currently starts external installers before all managed paths are proven safe; Phase 1 must establish complete preflight before those calls.
- Fixture and installer modules that concatenate subprocess output into errors must route through the centralized redaction and bounded-result contract.
- `scripts/update.ps1` and `scripts/update.sh` must share the zero-mutation preview contract instead of pulling, installing, building, or linking before apply.
- Catalog, lock, project manifest, transaction journal, receipt, and future evidence loaders must consume the same strict schema policy and deterministic validation format.

</code_context>

<specifics>
## Specific Ideas

- Use stable visible aliases such as `~`, `<temp>`, and `<project>` for private paths.
- Represent redacted material with stable typed placeholders such as `<redacted:TYPE>` instead of variable-length masking.
- Keep dry-run and inspection useful even when a mutation is blocked by an unsupported filesystem or `needs-repair` state.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within Phase 1 scope.

</deferred>

---

*Phase: 01-safe-operation-boundary*
*Context gathered: 2026-09-03*
