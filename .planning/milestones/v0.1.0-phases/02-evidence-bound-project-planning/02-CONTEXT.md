# Phase 2: Evidence-Bound Project Planning - Context

**Gathered:** 2026-09-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Turn a bounded, canonical view of one repository into a deterministic pack decision and a reviewable, apply-bound plan. This phase decides **which project capability packs a repository qualifies for, why, and why not**, and produces an approved plan artifact that Phase 3 will execute.

This phase writes no capability into any harness. `alpha-aos project sync --apply` stays refused when this phase ends; Phase 3 opens it. Global always-on capabilities (Phase 3), mandatory GSD gates (Phase 4), and tree-off isolation (Phase 5) are all out of scope.

The existing detection code is a starting point to replace, not preserve: `src/core/project.ts:36-96` hardcodes pack rules that already disagree with `catalog/packs/*.yaml`, and records no path, version, negative evidence, or canonical root.

</domain>

<decisions>
## Implementation Decisions

### Project Scope

- **D-01:** Running from a repository root lists the sub-projects found and their per-project pack decisions; the user names the target rather than the tool guessing. Running inside a sub-project targets that sub-project.
- **D-02:** Sub-project discovery consults the ecosystem's own workspace declaration first (`package.json#workspaces`, `pnpm-workspace.yaml`, `go.work`, and equivalents). Only when no declaration exists does it scan for project-declaration files (`package.json`, `pyproject.toml`, `go.mod`, `Cargo.toml`, …). — **Reversibility:** reversible — the fallback scan already has to exist, so preferring a declaration is a precedence rule, not a second mechanism.
- **D-03:** Detection stops at nested repository, worktree, submodule, and vendored-tree boundaries and borrows no evidence across them. The default is a silent exclusion; a "N separate repositories were excluded" notice is deliberately deferred until a real case demands it.
- **D-04:** Ignore-list membership decides what is scanned, not commit status. A file created but not yet committed is legitimate evidence; `.gitignore`d paths are not. The same rule applies in directories that are not git repositories at all.

### Pack Judgement

- **D-05:** `catalog/packs/*.yaml` becomes the single authority for pack predicates. Code becomes the engine that loads, schema-validates, and evaluates them. Adding or correcting a pack must not require editing TypeScript or rebuilding. — **Reversibility:** costly — once the YAML is authoritative every consumer, test, and explanation path reads through the predicate evaluator; returning judgement to code would mean rewriting all of them.
- **D-06:** The project manifest can force any pack on or off, not just the two opt-ins that exist today (`scientificResearch`, `criticalUserFlows`). A human override is itself recorded as evidence, so "why did this pack attach?" can answer "the user specified it explicitly" and stay auditable.
- **D-07:** A recorded fact carries file path + fact name + version. Individual facts carry no file hash — an unrelated comment change must not disturb the evidence.
- **D-08:** Every pack skill's source hash is pre-pinned in `catalog/stack.lock.json` before planning can use it. `alpha-aos project plan` therefore touches no network and no package manager and completes fully offline. — **Reversibility:** reversible — pinning more entries in the lock is additive; the alternative (resolving at plan time) is what would be hard to undo.

### Approval Surface

- **D-09:** Default output shows full reasoning for every selected pack, plus one line per pack that satisfied part of its conditions and failed the rest. Packs that matched nothing stay silent. `--why` prints all 15.
- **D-10:** The approved plan lives inside the project under `.alpha-aos/`, so a team can share and commit it. This is accepted with the boundary stated explicitly: alpha-AOS writes to `.alpha-aos/` and, from Phase 3, to harness project-config paths such as `.claude/skills/<name>/SKILL.md`. It never writes to project source, `package.json`, tests, or build configuration — those are read-only inputs.
- **D-11:** When a target path already holds a file alpha-AOS did not write, the plan reports a conflict and drops that pack from the applicable set. There is no automatic overwrite and no silent rename.
- **D-12:** `alpha-aos project plan` previews and persists nothing. A separate approve command writes the plan artifact. Phase 3's apply executes only that artifact, so "what was looked at" and "what was approved" are never the same act. — **Reversibility:** costly — the command surface and the Phase 3 apply contract both bind to this split.

### Change Response

- **D-13:** DETC-05's refusal is not a dead end. When apply is refused, the user sees what changed and whether it altered pack selection, and can re-approve in place.
- **D-14:** A pack whose evidence disappeared is reported `STALE` and a removal plan is offered. The removal plan still requires approval, so nothing is auto-deleted.
- **D-15:** `STALE` reflects current state — a branch switch that removes evidence does produce `STALE`. The report also states that the branch/commit differs from the approved one, so the user can tell a real removal from a checkout.
- **D-16:** Only the latest approved plan is kept under `.alpha-aos/`. History is git's job.

### Claude's Discretion

- The exact shape of the YAML predicate language, provided it can express everything the 15 declared packs need today (`all`, `any`, `anyFiles`, `anyDependencies`, `manifestOptIn`) and every predicate resolves against a declared fact vocabulary that D-09's explanations can render uniformly.
- The definition of "partially matched" for D-09's near-miss line, and the bound on how many near-miss lines print.
- Whether `API` and `DEPLOYMENT` (declared in YAML, absent from code) ship in this phase or are declared unimplemented — decide from whether their evidence is expressible in the predicate language.
- Project identity derivation for the evidence envelope's 16-hex `projectId`. `src/core/isolation.ts` already hashes a canonical project path; reuse it unless nested-project addressing forces something else.
- Whether unreadable evidence (EACCES on a candidate file) reports as `STALE` or as an undecidable state. Phase 01's D-01 fail-closed reasoning points at undecidable, but `STALE` is a report rather than a mutation, so the call is open.
- Artifact layout, file names, and text/JSON formatting under `.alpha-aos/`, consistent with existing plan/apply output conventions.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Product and Phase Contract
- `.planning/PROJECT.md` — Determinism, safety, secret, and ownership constraints. Note especially: project-pack selection cannot depend on LLM judgment, and stale evidence never triggers automatic deletion.
- `.planning/REQUIREMENTS.md` — DETC-01 through DETC-06 verbatim, plus the CAPA/OPTO boundaries this phase must not absorb.
- `.planning/ROADMAP.md` §Phase 2 — Goal, deliverables, and the five success criteria.
- `.planning/phases/01-safe-operation-boundary/01-CONTEXT.md` — D-01 through D-15 from Phase 1. D-01 (fail closed when safety is unprovable), D-08/D-09 (strict closed-world schemas, inert unregistered extensions), and D-11 (bounded, deterministically sorted, stable-coded validation errors) all bind this phase's loaders and reports.

### Design Source (authoritative for pack semantics)
- `docs/alpha-vibe-stack-codex.md` §5.2 — The 15-pack table with each pack's deterministic detection evidence and the ECC skills it supplies. §5.1 defines why `security-review` is a pack rather than a global skill. §5.3 states that third-party ECC `SKILL.md` bytes must not be modified, which is what makes D-08's source hashes meaningful. §5.4 shows the `--target claude-project` install shape Phase 3 will use.
- `docs/alpha-vibe-stack-claude.md` §pack table — Parallel statement of the same pack semantics; consult when the two documents disagree.

### Existing Contracts to Consume
- `schemas/evidence.schema.json` — The closed evidence envelope Phase 1 sealed. Its own description says collecting and acting on evidence is this phase's job. Fields `facts[].path`, `.version`, and `.reason` are exactly what D-07 and D-09 need; `facts[].hash` exists but D-07 leaves it unused per fact.
- `schemas/receipt.schema.json` — The pack receipt envelope. Phase 3 writes these; this phase must read them to compute `STALE` (D-14). Note `evidenceHash` binds a receipt to the evidence that selected it.
- `catalog/packs/*.yaml` — The 15 declared packs. Currently read by no code; D-05 makes them authoritative.
- `catalog/stack.lock.json` — Currently pins `ecc-universal@2.2.0` and `sourceSha256` for exactly three global skills. D-08 requires extending this to every pack skill.

### Existing Code
- `src/core/project.ts` — `detectProject` (to be replaced by the predicate engine) and `inspectProjectManifest` (the strict manifest route to keep and extend for D-06).
- `src/core/ecc-skills.ts` — Plan/apply pair for skill sync. `:65` throws when `sourceSha256` lacks a skill, which is the concrete failure D-08 prevents. Its `EccSkillOperationSource` shape already carries `source`/`sourceHash` bound at review time.
- `src/cli.ts:575-584` — The current `project detect|plan|sync` branch and the explicit `sync --apply` refusal.
- `.planning/codebase/ARCHITECTURE.md` — Plan/apply separation, transaction boundaries, and the `~/.alpha-aos/` state root layout.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/core/validation.ts` (`validateManagedDocument`, `createMigrationPlan`): Strict closed-world validation with stable error codes. The pack-predicate loader (D-05) must consume this rather than parsing YAML directly, so a malformed pack file is rejected the way every other managed document is.
- `src/core/path-boundary.ts` (`canonicalizeWithMissingTail`, `provePathBoundary`): Phase 1's symmetric canonicalization. D-01's canonical root and D-03's nested-boundary stop should be expressed through it rather than through bare `realpath`.
- `src/core/ecc-skills.ts`: Already binds every source byte and its hash at review time and supports a caller-supplied `MutationSession`. This is the model for how a Phase 2 plan describes sources it has not yet acquired.
- `src/cli.ts` `repair` branch (`:587-603`): The established pattern of printing a `planDigest` and requiring it back at apply. D-12's approve command and D-13's refusal path should follow this shape.
- `src/core/isolation.ts`: Already hashes a canonical project path into a project id and discovers project-local skill/MCP resources — directly relevant to `projectId` and to D-11's target pre-state inspection.

### Established Patterns
- Every mutating command splits plan from apply and defaults to dry-run.
- Managed writes go through `applyFileTransaction` with explicit allowed roots, snapshots, and hash-checked journals. D-10's `.alpha-aos/` writes and D-14's removal plan are subject to this, which is what makes "no automatic deletion" enforceable rather than aspirational.
- Tests use `node:test` with real temporary files and behavior-focused negative cases; no mocking framework.
- Stable lock is authoritative and `catalog/candidate.lock.json` must never reach an end-user apply path.
- Previews must not spawn package managers. Plan 01-21 removed an `npm root --global` probe precisely because it wrote into the user's home during a preview. D-08 exists to keep `project plan` on the correct side of that line.

### Integration Points
- `src/core/project.ts` is replaced by an evidence collector plus a predicate evaluator; `src/cli.ts:575-584` grows the approve command and loses the blanket `sync --apply` refusal message only when Phase 3 lands.
- `catalog/stack.lock.json` gains pack-skill entries; `src/core/ecc-skills.ts:65` stops being reachable for pack skills once they are pinned.
- `schemas/` gains a pack-predicate schema alongside the existing evidence and receipt envelopes.
- `.planning/codebase/CONCERNS.md` records the `project sync --apply` stub and the missing dry-run diff model; this phase closes the diff-model half.

</code_context>

<specifics>
## Specific Ideas

- The near-miss line should read like the AGENTS.md case from the design doc: "`AGENT_RUNTIME`: `AGENTS.md` present, but no agent SDK dependency." A generic file that exists in ordinary repositories must never be sufficient on its own, and the explanation must make that visible rather than merely true.
- The refusal in D-13 should distinguish "inputs changed but the pack selection is identical" from "the selection itself changed" — the user's mental model of re-approval depends on that difference.
- The `STALE` line in D-15 should name the missing evidence, not just the pack: "`postgres-patterns` — the `pg` dependency that selected it is gone."

</specifics>

<deferred>
## Deferred Ideas

- **Isolating a project while giving it independent skills, MCP, and harness configuration** — raised during discussion. Materializing project-scoped capabilities is Phase 3 (CAPA-01..08); excluding global customization for a directory tree is Phase 5 (OPTO-01..09). Not Phase 2.
- **"N separate repositories were excluded" notice** — deliberately not built now (D-03). Revisit if a real submodule case makes the silence confusing.
- **Reviewing the pack list itself** — whether the 15 declared packs are the right 15, and whether `API`/`DEPLOYMENT` (in YAML, absent from code) should ship, was raised but not discussed. Partially delegated to Claude's discretion above; a deliberate product review belongs to a later cycle.

</deferred>

<open_questions>
## Verification Required Before Planning

These are facts this discussion could not establish and the researcher must settle:

1. **Do the pack skills exist in `ecc-universal@2.2.0`?** The lock pins hashes for `unified-memory`, `documentation-lookup`, and `deep-research` only. `browser-qa`, `accessibility`, `frontend-a11y`, `click-path-audit`, `database-migrations`, `postgres-patterns`, `redis-patterns`, `docker-patterns`, `deployment-patterns`, `mcp-server-patterns`, `agent-harness-construction`, `ai-regression-testing`, `eval-harness`, `security-review`, `inherit-legacy-style`, and the four `scientific-*` skills are referenced by `catalog/packs/*.yaml` but have never been resolved against the real package. D-08 cannot be implemented for a skill that does not exist; any absent skill leaves its pack sourceless and must be reported rather than silently planned.
2. **Whether the workspace declarations named in D-02 cover the ecosystems this project must support**, and what the fallback scan does in a repository that declares workspaces incorrectly.
3. **`BROWNFIELD_INIT`'s `lifecycle: one-shot-remove-after-output`** appears in `catalog/packs/brownfield.yaml` and in no schema or code. Whether a lifecycle field is part of the Phase 2 predicate contract or a Phase 3 materialization concern is unresolved.

</open_questions>

---

*Phase: 02-evidence-bound-project-planning*
*Context gathered: 2026-09-07*
