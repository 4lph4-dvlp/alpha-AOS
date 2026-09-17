# Phase 4: Mandatory GSD Gates - Context

**Gathered:** 2026-09-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver deterministic risk-based mandatory GSD lifecycle gates and worker/controller authority enforcement. When a user modifies an authentication boundary, database migration, or release-sensitive surface, alpha-AOS deterministically selects the matching mandatory GSD gate from inspectable repository evidence, runs exactly one selected check engine (suppressing duplicates visibly), and blocks lifecycle progression at the protected GSD lifecycle points until valid current-revision evidence is provided. At the same time, unrelated low-risk work is completely unburdened, and GSD Core retains sole authority over `.planning/` state transitions while worker harnesses (Hermes, etc.) are strictly prevented from writing to `.planning/`.

This phase owns GATE-01 through GATE-05.

Explicitly NOT in this phase:
- Directory-tree opt-out and preload isolation (Phase 5, OPTO-01…09).
- Uninstall, full-stack rollback, and repair flows (Phase 6, LIFE-01…08).
- Cross-platform release proof matrix and end-to-end publishing (Phase 7, REL-01…06).
</domain>

<decisions>
## Implementation Decisions

### Risk Evidence Detection & Diff Boundary (GATE-01, GATE-04)
- **D-01:** Risk evidence is evaluated across the **entire cumulative diff of the phase** (Phase start commit/branch base through all intermediate commits and uncommitted working-tree modifications). This ensures that risk introduced at any point in the phase cannot be hidden by a subsequent commit. — **Reversibility:** reversible — diff evaluation range is controlled by the git diff query helper.
- **D-02:** Risk detection uses **path glob patterns and safe identifier matching** (`**/auth/**`, `**/migrations/**`, `package.json#version`, release configs, etc.) without arbitrary credential scanning. The 8 SECURITY_REVIEW risk facts (`auth-change`, `user-input`, `secrets`, `payments`, `sensitive-data`, `command-execution`, `trust-boundary`, `public-api`) deferred from Phase 2 to GATE-01 are implemented using safe structural and path heuristics that never inspect or leak credential values, adhering strictly to the AGENTS.md secret constraint. — **Reversibility:** costly — changing detection schemas affects fact definitions in `catalog/facts.yaml`.
- **D-03:** Low-risk work receives an **automatic silent pass (Zero-Obligation Silent Pass)**. When git diff analysis yields zero matching risk facts, the resolved obligation set is empty (`obligations: []`), and GSD lifecycle hooks advance immediately without prompting or blocking the user. — **Reversibility:** reversible — zero-obligation branch behavior is purely logical.

### Single-Engine Resolution & Deduplication (GATE-02)
- **D-04:** Check engine selection follows **Native-First precedence**. If the repository defines native verification tooling (e.g. project linter, `npm audit`, `prisma migrate diff`, custom migration/security script), alpha-AOS selects that native engine. ECC skills (such as `security-review` from `ecc-universal`) serve as fallbacks only when native tooling is absent. — **Reversibility:** costly — engine selection precedence touches obligation resolution and plan generation.
- **D-05:** Overlapping engines are **visibly suppressed in the execution report**. Exactly one engine executes per obligation. When a native engine is chosen over an ECC skill (or vice versa), the report explicitly records the selected engine and cites the suppressed engine and reason (e.g., `suppressed: ecc-universal:security-review (native tool exists)`), guaranteeing zero duplicate reviews. — **Reversibility:** reversible — reporting formatting and receipt suppression fields.
- **D-06:** Gate evaluation results are recorded as **Structured Gate Receipts** (`.alpha-aos/receipts/gates/*.json` or unified gate receipt). Each receipt strictly records the obligation, engine identifier, target Git HEAD SHA, execution exit code, status (`passed` | `failed`), suppressed alternatives, and evidence SHA-256 hash. — **Reversibility:** costly — structured schema definition binds reader, writer, and verification checks.

### GSD Lifecycle Integration & Blocking Contract (GATE-03)
- **D-07:** Gates are enforced at the **protected lifecycle boundary: `execute:post` and `verify:pre`**. When plan execution concludes, required gates are evaluated; if any mandatory gate is missing, failed, unverified, or stale, transition into UAT/verification is blocked fail-closed. — **Reversibility:** costly — lifecycle hook dispatch is tied to GSD loop hooks.
- **D-08:** Gate blocking provides **actionable, precise diagnostic feedback**. The blocking message details the failing gate, offending files/diffs, exact engine error output, and a runnable re-check command (`alpha-aos gate check` or equivalent) for immediate remediation. — **Reversibility:** reversible — CLI/hook diagnostic output formatting.
- **D-09:** Gate evidence is **strictly revision-bound**. A recorded gate receipt is bound to the exact Git HEAD commit SHA and working-tree digest. If any file in the risk surface is modified after the gate was run, the evidence immediately classifies as `stale`, refusing lifecycle advancement until re-run. — **Reversibility:** reversible — staleness comparison logic.

### Worker Authority & .planning Protection (GATE-05)
- **D-10:** GSD Controller role belongs strictly to the **session initiator (active primary harness, e.g. Antigravity/Codex)**; any delegated or external harnesses (Hermes, Pi, subagents) are automatically assigned **Worker role**. Hermes is structurally prohibited from being a GSD state controller. — **Reversibility:** costly — harness adapter invocation contracts.
- **D-11:** Protection of `.planning/` is enforced via **multi-layered defense**: Worker launch specs hide GSD state-writing instructions, process environments exclude GSD controller credentials, and before/after handoff or gate points, recursive SHA-256 tree hashing (`comparePlanningTrees`) witnesses byte-identical immutability. Any unauthorized mutation by a worker results in immediate rejection and rollback. — **Reversibility:** reversible — wraps existing planning tree hash utilities from Phase 3 (Plan 03-21).

### the agent's Discretion
- Exact CLI flags for standalone gate checks (e.g. `alpha-aos gate check` or `alpha-aos project check`).
- JSON schema design for `.alpha-aos/receipts/gates/` or unified gate receipt format.
- Detailed mapping table from risk facts to default native commands vs ECC skills.

### Folded Todos
None.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Product and Phase Contract
- `.planning/PROJECT.md` — Determinism, safety, secrets, and ownership constraints.
- `.planning/REQUIREMENTS.md` — GATE-01 through GATE-05 verbatim.
- `.planning/ROADMAP.md` §Phase 4 — Goal, deliverables, and five success criteria.
- `.planning/phases/02-evidence-bound-project-planning/02-CONTEXT.md` — Deterministic pack planning and deferred risk facts (`deferredTo: GATE-01`).
- `.planning/phases/03-transactional-project-packs-and-native-optional-use/03-CONTEXT.md` — Active harness scope under D-17 and transactional sync principles.

### Fact and Pack Catalog
- `catalog/facts.yaml` — 8 deferred risk facts under `SECURITY_REVIEW` (`auth-change`, `user-input`, `secrets`, `payments`, `sensitive-data`, `command-execution`, `trust-boundary`, `public-api`).
- `catalog/packs/security.yaml` — Security pack definition with manifest-opt-in and risk-fact predicates.

### Code and Runtime References
- `src/core/canary.ts` — `hashPlanningTree` and `comparePlanningTrees` for recursive SHA-256 `.planning/` witness.
- `src/core/gsd-compat.ts` — Codex GSD hook helpers and runtime integrity contracts.
- `src/core/gsd-context.ts` — Bounded GSD workflow context reader.
- `~/.gemini/antigravity/gsd-core/workflows/verify-work.md` — Loop extension hooks (`loop render-hooks`, gate checks).
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/core/canary.ts` (`hashPlanningTree`, `comparePlanningTrees`): Recursive SHA-256 tree hashing already proven in Plan 03-21 for `.planning/` immutability verification.
- `src/core/process.ts` (`runProcess`): Bounded, shell-free, timeout-aware execution for running native or ECC check engines.
- `src/core/transaction.ts` (`applyFileTransaction`): Atomic file transactions, snapshotting, and rollback for writing receipts.
- `src/core/validation.ts` (`validateManagedDocument`): Strict schema validation for gate receipts and configuration.
- `src/core/evidence.ts`: Fact detection framework to extend with change-risk predicates.

### Established Patterns
- Preview/apply separation with strict hash checking.
- Output redaction for secrets and credential safety.
- Single-transaction atomic writes with hash-checked rollback.

### Integration Points
- GSD lifecycle hook hooks (`execute:post`, `verify:pre`).
- Gate receipt storage under `.alpha-aos/receipts/`.
- Harness launch adapter for worker vs controller enforcement.
</code_context>

<specifics>
## Specific Ideas

- Discussion conducted interactively in Korean with user on 2026-09-17.
- User selected all 4 core areas and confirmed all recommended decisions.
- Native-first engine precedence with visible suppression reporting chosen to keep developer experience transparent.
- Multi-layer defense chosen for `.planning/` protection.
</specifics>

<deferred>
## Deferred Ideas

- None — discussion stayed within phase scope.
</deferred>

---

*Phase: 04-mandatory-gsd-gates*
*Context gathered: 2026-09-17*
