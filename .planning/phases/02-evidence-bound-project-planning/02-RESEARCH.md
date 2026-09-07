# Phase 2: Evidence-Bound Project Planning - Research

**Researched:** 2026-09-07
**Domain:** Deterministic repository evidence collection, declarative predicate evaluation, content-addressed plan/approve contracts
**Confidence:** HIGH (in-repo contracts, ECC skill availability, git boundary semantics, workspace declarations) / MEDIUM (predicate-language shape, ignore-list strategy) / LOW (nothing load-bearing)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Project Scope**

- **D-01:** Running from a repository root lists the sub-projects found and their per-project pack decisions; the user names the target rather than the tool guessing. Running inside a sub-project targets that sub-project.
- **D-02:** Sub-project discovery consults the ecosystem's own workspace declaration first (`package.json#workspaces`, `pnpm-workspace.yaml`, `go.work`, and equivalents). Only when no declaration exists does it scan for project-declaration files (`package.json`, `pyproject.toml`, `go.mod`, `Cargo.toml`, …). — **Reversibility:** reversible — the fallback scan already has to exist, so preferring a declaration is a precedence rule, not a second mechanism.
- **D-03:** Detection stops at nested repository, worktree, submodule, and vendored-tree boundaries and borrows no evidence across them. The default is a silent exclusion; a "N separate repositories were excluded" notice is deliberately deferred until a real case demands it.
- **D-04:** Ignore-list membership decides what is scanned, not commit status. A file created but not yet committed is legitimate evidence; `.gitignore`d paths are not. The same rule applies in directories that are not git repositories at all.

**Pack Judgement**

- **D-05:** `catalog/packs/*.yaml` becomes the single authority for pack predicates. Code becomes the engine that loads, schema-validates, and evaluates them. Adding or correcting a pack must not require editing TypeScript or rebuilding. — **Reversibility:** costly — once the YAML is authoritative every consumer, test, and explanation path reads through the predicate evaluator; returning judgement to code would mean rewriting all of them.
- **D-06:** The project manifest can force any pack on or off, not just the two opt-ins that exist today (`scientificResearch`, `criticalUserFlows`). A human override is itself recorded as evidence, so "why did this pack attach?" can answer "the user specified it explicitly" and stay auditable.
- **D-07:** A recorded fact carries file path + fact name + version. Individual facts carry no file hash — an unrelated comment change must not disturb the evidence.
- **D-08:** Every pack skill's source hash is pre-pinned in `catalog/stack.lock.json` before planning can use it. `alpha-aos project plan` therefore touches no network and no package manager and completes fully offline. — **Reversibility:** reversible — pinning more entries in the lock is additive; the alternative (resolving at plan time) is what would be hard to undo.

**Approval Surface**

- **D-09:** Default output shows full reasoning for every selected pack, plus one line per pack that satisfied part of its conditions and failed the rest. Packs that matched nothing stay silent. `--why` prints all 15.
- **D-10:** The approved plan lives inside the project under `.alpha-aos/`, so a team can share and commit it. This is accepted with the boundary stated explicitly: alpha-AOS writes to `.alpha-aos/` and, from Phase 3, to harness project-config paths such as `.claude/skills/<name>/SKILL.md`. It never writes to project source, `package.json`, tests, or build configuration — those are read-only inputs.
- **D-11:** When a target path already holds a file alpha-AOS did not write, the plan reports a conflict and drops that pack from the applicable set. There is no automatic overwrite and no silent rename.
- **D-12:** `alpha-aos project plan` previews and persists nothing. A separate approve command writes the plan artifact. Phase 3's apply executes only that artifact, so "what was looked at" and "what was approved" are never the same act. — **Reversibility:** costly — the command surface and the Phase 3 apply contract both bind to this split.

**Change Response**

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

### Deferred Ideas (OUT OF SCOPE)

- **Isolating a project while giving it independent skills, MCP, and harness configuration** — raised during discussion. Materializing project-scoped capabilities is Phase 3 (CAPA-01..08); excluding global customization for a directory tree is Phase 5 (OPTO-01..09). Not Phase 2.
- **"N separate repositories were excluded" notice** — deliberately not built now (D-03). Revisit if a real submodule case makes the silence confusing.
- **Reviewing the pack list itself** — whether the 15 declared packs are the right 15, and whether `API`/`DEPLOYMENT` (in YAML, absent from code) should ship, was raised but not discussed. Partially delegated to Claude's discretion above; a deliberate product review belongs to a later cycle.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DETC-01 | User can select one canonical project root, and detection stops at nested repository or worktree boundaries instead of borrowing evidence from parents, siblings, or unrelated repositories | §Pattern 1 (canonical root selection ladder), §Pattern 2 (boundary stop rule — `.git` as file **or** directory, empirically verified), §Don't Hand-Roll (path canonicalization → `provePathBoundary`), §Pitfall 1, §Pitfall 4 |
| DETC-02 | User can see the positive, versioned file, dependency, entrypoint, configuration, and manifest evidence that caused each project capability pack to be selected | §Pattern 3 (declared fact vocabulary + 6 detector kinds), §Standard Stack (existing manifest parsers already vendored), §Code Example 2 (fact record shape against `schemas/evidence.schema.json`) |
| DETC-03 | User can see why a near-match did not select a pack, and generic files such as `AGENTS.md` alone cannot activate agent-runtime capabilities | §Pattern 4 (evaluate-all, never short-circuit; negative facts carry `reason`), §Pattern 5 (near-miss ranking + bound), §Pitfall 3 |
| DETC-04 | User receives stable text and JSON plans that identify scope, owner, exact source version and hash, renderer, target pre-state, adapter support, approvals, and safe inverse | §Pattern 6 (`ProjectCapabilityPlan` field map, one field per DETC-04 noun), §Pattern 7 (two digests: `inputsDigest` / `evidenceDigest`), §Pitfall 2 (`createdAt` and key-order determinism hazards), §Finding F-1 (all 19 pack skills exist and hash cleanly) |
| DETC-05 | User cannot apply a reviewed plan after its evidence, manifest, stable lock, renderer, executable, adapter capability, or target bytes have changed | §Pattern 8 (revalidate-and-compare using `reviewedDigest` / `assertPlanUnchanged`), §Code Example 3, §Pattern 7 (D-13's "inputs changed" vs "selection changed" split) |
| DETC-06 | User sees a previously installed project pack marked `STALE` when its evidence disappears, with no automatic deletion | §Pattern 9 (receipt × evidence reconciliation, `.alpha-aos/receipts/<packId>.json` contract), §Pitfall 6 (`STALE` must name the missing fact, not the pack) |
</phase_requirements>

## Project Constraints (from AGENTS.md)

There is no `CLAUDE.md` or `.claude/` directory in this repository `[VERIFIED: ls of repo root and `ls -a .claude .agents` returned neither]`. The effective project instruction file is `AGENTS.md` (GSD-managed, 21 KB). Directives the planner must honour, quoted from it:

- **Determinism**: "Installation, project-pack selection, policy checks, and mandatory gates cannot depend only on LLM judgment — evidence, versions, hashes, and decisions must be inspectable" `[VERIFIED: AGENTS.md line ~21, §Constraints]`
- **Safety**: "Mutations are previewable, root-bounded, snapshotted, and rollback-aware — stale evidence never triggers automatic deletion" `[VERIFIED: AGENTS.md §Constraints]`
- **Secrets**: "Credential values cannot enter manifests, locks, plans, journals, diagnostics, command arguments, or repository files" `[VERIFIED: AGENTS.md §Constraints]`
- **Supply chain**: "End users receive only the reviewed stable lock — candidate dependencies and mutable external automation are not trusted without fixture and review gates" `[VERIFIED: AGENTS.md §Constraints]`
- **Code style**: "TypeScript uses double-quoted strings, semicolons, trailing commas in multiline constructs, two-space indentation, and braces for control blocks"; no formatter/linter config exists — match hand-written style in `src/core/*.ts` `[VERIFIED: AGENTS.md §Conventions/Code Style]`
- **Imports**: "No path aliases are configured. Use explicit relative imports with `.js` extensions from TypeScript source" `[VERIFIED: AGENTS.md §Conventions/Import Organization]`
- **tsconfig invariants**: "Preserve `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `forceConsistentCasingInFileNames`, and ES module settings" `[VERIFIED: AGENTS.md §Conventions]`
- **Error handling**: "Validate inputs and invariants at the boundary, then throw `new Error(...)`"; "Represent expected diagnostics as typed values (`DoctorFinding`) rather than exceptions" `[VERIFIED: AGENTS.md §Conventions/Error Handling]`
- **Tests**: `node:test` + `node:assert/strict`, no mocking framework, real temporary files `[VERIFIED: AGENTS.md §Conventions; test/*.test.ts]`

---

## Summary

This phase replaces a 60-line hardcoded detector with a three-layer machine: a **bounded, boundary-proven evidence collector**, a **declarative predicate evaluator** driven by `catalog/packs/*.yaml`, and a **content-addressed plan/approve pair**. Almost none of the primitives need to be invented — Phase 1 shipped path canonicalization with proofs, strict closed-world document validation with stable codes, journaled transactions with snapshots, a reviewed-plan digest contract (`reviewedDigest` / `assertPlanUnchanged`), and a redaction seam that already strips URL userinfo. The work is assembling them behind one new evidence/predicate core plus two new CLI verbs, not building new safety machinery.

Three research findings change what the plan can commit to. **First, the blocking supply-chain question is answered affirmatively:** all 19 skills referenced by `catalog/packs/*.yaml` exist in the installed `ecc-universal@2.2.0` with valid `SKILL.md` files, and the three already-pinned skills hash byte-identically to `catalog/stack.lock.json`, which proves the hashing convention and that the installed tree matches the locked tarball. D-08 is therefore implementable for every pack, with no pack left sourceless. **Second, the lock schema already accepts them** — `components.ecc.sourceSha256` is an open `additionalProperties` map and `skills` is an open string array, so pinning 19 more entries requires zero schema change. **Third, `catalog/packs/*.yaml` disagrees with `src/core/project.ts` in six distinct ways**, not one: four of fifteen packs have no code at all, the container fact is named differently in each place, four packs check only half their declared alternatives, and the dependency reader looks exclusively in `package.json` while the hardcoded package lists contain Python names (`psycopg2`, `asyncpg`) that can never appear there.

The most consequential architectural recommendation is to split **pack declarations** (pure YAML, D-05's requirement) from a **declared fact vocabulary** (`catalog/facts.yaml`), so that adding a pack, and adding most new facts, both stay out of TypeScript. Only six bounded *detector kinds* remain in code. Without that split, D-05 is only half true: a pack could be added in YAML but would silently never match, because the fact it names has no detector. The engine must **refuse a pack that references an undeclared fact** rather than let it be permanently unselectable.

**Primary recommendation:** Build `src/core/evidence.ts` (collector, boundary-proven, bounded), `src/core/pack-catalog.ts` (strict loader through `validateManagedDocument` with a new `pack-catalog` document kind), and `src/core/project-plan.ts` (evaluator + `ProjectCapabilityPlan` builder + two digests); keep `inspectProjectManifest` and delete `detectProject`'s hardcoded rules; ship 14 of 15 packs and restrict `SECURITY_REVIEW` to its manifest-opt-in branch, deferring its eight risk-evidence facts to Phase 4's GATE-01, which already owns "deterministic risk evidence."

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Canonical root selection, nested-boundary stop | Filesystem boundary (`src/core/path-boundary.ts`) | Evidence collector | DETC-01 is a containment property; Phase 1 already owns symmetric canonicalization and containment proofs. Re-deriving it in a detector reintroduces Pitfall 1. |
| Ignore-list evaluation | Evidence collector | Catalog (declared vendor vocabulary) | D-04 says ignore membership, not commit status, decides. This is a pure predicate over paths and must work in non-git directories, so it cannot delegate to `git`. |
| Sub-project discovery | Evidence collector | Catalog (declared workspace-declaration readers) | D-02's precedence rule (declaration first, scan second) is data about ecosystems, best expressed as a declared reader list. |
| Fact detection (files, dirs, dependencies, manifest keys, content) | Evidence collector (6 detector kinds) | Catalog (`catalog/facts.yaml`) | DETC-02 needs versioned, path-carrying observations. Detector *kinds* are code; detector *instances* are data, so D-05 holds for new facts too. |
| Pack predicate evaluation | Predicate evaluator (`src/core/project-plan.ts`) | Catalog (`catalog/packs/*.yaml`) | D-05 makes YAML authoritative; code is the engine. |
| Pack-file schema validation | Managed-document validator (`src/core/validation.ts`) | — | Phase 1 D-08/D-11: one strict, closed-world, stable-coded pipeline for every managed document. A YAML-parsing shortcut in the pack loader would be a second validation regime. |
| Source version + hash binding | Stable lock (`catalog/stack.lock.json`) | Pack catalog | D-08: pre-pinned, so plan is offline. The lock is already the authority for `ecc` source hashes. |
| Target pre-state + conflict detection | Project-local resource inventory | Harness adapters | D-11 needs "does this path hold bytes we did not write". `discoverSkillPaths` in `src/core/isolation.ts` already enumerates the three known project-local skill roots. |
| Adapter support classification | Harness adapters (`src/adapters/harnesses.ts`) | Catalog (`catalog/stack.yaml` harness table) | DETC-04's "adapter support" is a per-harness capability claim; `catalog/stack.yaml` already records `eccStrategy: bridge` for Pi and `gsdStrategy: worker-only` for Hermes. |
| Plan persistence + safe inverse | Transaction (`src/core/transaction.ts`) | Component session | D-10/D-16 write inside the project; journaled snapshots are what make "no automatic deletion" enforceable rather than aspirational. |
| Approval binding + change refusal | Component session (`reviewedDigest`, `assertPlanUnchanged`) | CLI | DETC-05 is exactly the contract `src/core/component-session.ts` already implements for ECC/GSD/MCP components. |
| Redaction of everything printed | `src/core/redaction.ts` via `print()` | — | `postgres-dsn` / `redis-dsn` evidence touches credential-bearing strings; the seam already redacts URL userinfo and query tokens. |

---

## Standard Stack

### Core — already vendored, no new install required

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `yaml` | `2.9.0` | Parse `catalog/packs/*.yaml`, `pnpm-workspace.yaml`, `.alpha-aos/stack.yaml` | Already a dependency and already the parser behind `parseManagedDocument`'s YAML route `[VERIFIED: package.json dependencies; src/core/validation.ts:6 imports `parseAllDocuments` from "yaml"]` |
| `smol-toml` | `1.8.0` | Parse `pyproject.toml`, `Cargo.toml` for dependency facts and workspace declarations | Already a dependency, already used by `parseManagedDocument`'s TOML route, already gated and approved at the 01-04 review `[VERIFIED: package.json; src/core/validation.ts:5; STATE.md "smol-toml@1.8.0 approved at the 01-04 gate"]` |
| `jsonc-parser` | `3.3.1` | Duplicate-key-rejecting JSON parse for `package.json`, `deno.json`, `.mcp.json` | Already used by `parseStrictJson`; `JSON.parse` "silently keeps the last value, which turns an ambiguous document into a confident one" `[VERIFIED: src/core/validation.ts:120-123 comment, verbatim]` |
| `ajv` | `8.20.0` | Compile the new `schemas/pack-catalog.schema.json` and `schemas/fact-vocabulary.schema.json` | The validator is already Ajv 2020 with `strict: true, allErrors: true, coerceTypes: false, useDefaults: false, removeAdditional: false` `[VERIFIED: src/core/validation.ts:366-373, verbatim]` |
| Node `node:crypto` | built-in | `sha256` for `inputsDigest`, `evidenceDigest`, plan digest | `reviewedDigest` already exists: `createHash("sha256").update(\`${kind}\n${JSON.stringify(content)}\`, "utf8").digest("hex")` `[VERIFIED: src/core/component-session.ts:65-67, verbatim]` |

**Installation:** none required for the core path.

### Supporting — one candidate dependency, gated

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `ignore` | `7.0.5` (2025-05-31) | gitignore-spec pattern matching for D-04 | Only if the supply-chain gate approves it. Zero runtime dependencies, MIT, `engines.node >= 4`, no `postinstall`. `dist.integrity` = `sha512-Hs59xBNfUIunMFgWAbGX5cq6893IbWg4KnrjbYwX3tx0ztorVgTDA6B2sxf8ejHJ4wz8BqGUMYlnzNBer5NvGg==` `[ASSUMED — package identified from training knowledge, not from official documentation or Context7; registry metadata confirmed via `npm view` but registry existence alone does not confer verification]` |

`ignore` is a pure matcher: it does not read `.gitignore` files and does not walk directories, which is exactly the division this phase wants — alpha-AOS keeps the boundary-proven traversal and delegates only pattern semantics.

**Version note:** `7.0.8` is the current latest but was published `2026-08-31`, one week ago, and the legitimacy seam flags it `SUS / too-new`. `7.0.5` has been published since `2025-05-31` `[VERIFIED: npm view ignore time --json]`. Recommend pinning `7.0.5`, not `latest`.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `ignore` dependency | Spawn `git check-ignore --stdin` through `ProcessSpec` | Correct by construction, but D-04 requires the same rule "in directories that are not git repositories at all", where `git check-ignore` has no answer. It also puts a subprocess on the preview path that D-08's offline intent is trying to keep clean. Reject as the primary mechanism. |
| `ignore` dependency | Bounded in-house matcher: literal names, directory-suffix patterns, leading-slash anchoring, single `*`; report `undecidable` on `!` negation or `**` | No new dependency, fail-closed per Phase 1 D-01. But negation appears in ordinary repositories, so a large fraction of real projects would land in `undecidable`. Recommend as the **fallback** if the dependency gate refuses, not as the default. |
| Hardcoded prune list (`node_modules`, `dist`, `.venv`, …) | — | Contradicts D-04 directly: it decides by name, not by ignore-list membership, and would treat a deliberately un-ignored `dist/` as invisible evidence. Reject. |
| New predicate grammar | Keep the exact five operators already in the YAML files | Recommended — see §Pattern 3. Inventing a grammar forces a rewrite of all 7 pack files for no expressive gain and burns D-05's "adding a pack must not require editing TypeScript" goodwill on churn. |

**Version verification performed this session:**

```bash
node --version   # v24.13.1
npm --version    # 11.8.0
git --version    # 2.55.0.windows.3
npm view ignore@7.0.5 dist.integrity dependencies engines license
```

`[VERIFIED: commands run 2026-09-07 on the developer host]`

---

## Package Legitimacy Audit

Only one external package is a candidate for this phase. Everything else is already in the reviewed stable dependency set.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `ignore` (`latest` = 7.0.8) | npm | latest published 2026-08-31 (7 days) | 214,539,984/wk | github.com/kaelzhang/node-ignore | **SUS** (`too-new`) | Flagged — planner must add a `checkpoint:human-verify` before install, and pin `7.0.5` rather than `latest` |
| `yaml@2.9.0` | npm | existing dependency | — | — | OK (already in reviewed lock) | Approved, no change |
| `smol-toml@1.8.0` | npm | existing dependency | — | — | OK (approved at 01-04 gate) | Approved, no change |
| `jsonc-parser@3.3.1` | npm | existing dependency | — | — | OK (already in reviewed lock) | Approved, no change |
| `ajv@8.20.0` | npm | existing dependency | — | — | OK (already in reviewed lock) | Approved, no change |

Seam output, verbatim:

```json
{ "name": "ignore", "verdict": "SUS",
  "signals": { "exists": true, "publishedAt": "2026-08-31T11:11:34.910Z",
               "weeklyDownloads": 214539984,
               "repoUrl": "git+https://github.com/kaelzhang/node-ignore.git",
               "deprecated": false, "postinstall": null, "ecosystem": "npm" },
  "reasons": ["too-new"] }
```

`[VERIFIED: gsd_run query package-legitimacy check --ecosystem npm ignore, run 2026-09-07]`

**Packages removed due to `SLOP` verdict:** none
**Packages flagged as suspicious `SUS`:** `ignore` — the `too-new` signal is about the 7.0.8 release, not the package (which has 214M weekly downloads and a long-lived source repo). Pinning `7.0.5` addresses the signal. The planner must still insert a `checkpoint:human-verify` and follow the same gate `smol-toml@1.8.0` received at 01-04, including binding the integrity hash into the plan before `catalog/stack.lock.json` is written.

*The package name `ignore` was identified from training knowledge, not from official documentation or Context7, and is therefore tagged `[ASSUMED]` throughout this document.*

---

## Architecture Patterns

### System Architecture Diagram

```text
  alpha-aos project plan [path] [--project <rel>] [--why] [--json]
                    │
                    ▼
  ┌───────────────────────────────────────────────────────────────────┐
  │ 1. CANONICAL ROOT SELECTION                    (DETC-01)          │
  │    given path ──► canonicalize (realpath, missing-tail tolerant)  │
  │             │                                                     │
  │             ├─ explicit --project?  ──► reason: explicit-override │
  │             ├─ nearest ancestor with .git ──► reason: git-root /  │
  │             │       worktree-root / submodule-root                │
  │             ├─ nearest ancestor with project declaration file     │
  │             │       ──► reason: project-declaration               │
  │             └─ else the directory itself ──► reason: standalone   │
  │                                                                   │
  │    outputs: canonicalRoot, rootReason, projectId (16-hex)         │
  └───────────────────────────────────────────────────────────────────┘
                    │
                    ▼
  ┌───────────────────────────────────────────────────────────────────┐
  │ 2. BOUNDED SCAN                       (DETC-01, D-02, D-03, D-04) │
  │                                                                   │
  │   workspace declaration? ──yes──► declared member paths           │
  │            │ no                                                   │
  │            └──────────► depth-bounded walk for declaration files  │
  │                                                                   │
  │   at every directory, STOP and do not descend when:               │
  │     • it contains a .git entry  (file OR directory)               │
  │     • its path is listed in the superproject .gitmodules          │
  │     • it is ignore-list matched                                   │
  │     • it is a declared vendor directory                           │
  │     • realpath leaves canonicalRoot (symlink/junction escape)     │
  │     • depth or visited-inode bound is hit                         │
  │                                                                   │
  │   outputs: subProjects[], excludedBoundaries[] (silent per D-03)  │
  └───────────────────────────────────────────────────────────────────┘
                    │
     per selected project scope
                    ▼
  ┌───────────────────────────────────────────────────────────────────┐
  │ 3. FACT DETECTION                                      (DETC-02)  │
  │    catalog/facts.yaml ──► detector instances                      │
  │            │                                                      │
  │            ├─ dependency  ─┐                                      │
  │            ├─ file         │  each read is boundary-proven and    │
  │            ├─ directory    ├─ byte-bounded; every path actually   │
  │            ├─ manifestKey  │  read is appended to readInputs[]    │
  │            ├─ fileAbsent   │                                      │
  │            └─ fileContent ─┘                                      │
  │                                                                   │
  │    every declared fact produces a record — positive AND negative  │
  │    { id, kind, detected, path?, version?, reason? }               │
  └───────────────────────────────────────────────────────────────────┘
                    │
                    ├──────────────────────────┐
                    ▼                          ▼
  ┌──────────────────────────────┐   ┌──────────────────────────────┐
  │ 4. PREDICATE EVALUATION      │   │ 4b. MANIFEST OVERRIDES  D-06 │
  │    catalog/packs/*.yaml      │   │  .alpha-aos/stack.yaml       │
  │    evaluate ALL 15 packs,    │◄──┤  packOverrides: force on/off │
  │    never short-circuit       │   │  recorded as evidence, not   │
  │    (DETC-03 needs the        │   │  as a bypass                 │
  │     failing branch too)      │   └──────────────────────────────┘
  │  ► selected / near-miss /    │
  │    silent / unimplemented    │
  └──────────────────────────────┘
                    │
                    ▼
  ┌───────────────────────────────────────────────────────────────────┐
  │ 5. DESIRED-STATE COMPILATION                           (DETC-04)  │
  │    selected packs × catalog/stack.lock.json (source+hash, D-08)   │
  │                   × harness adapter support matrix                │
  │                   × project-local target pre-state (D-11)         │
  │                   × receipts under .alpha-aos/receipts/  (D-14)   │
  │                                                                   │
  │    ► ProjectCapabilityPlan { scope, owner, source, renderer,      │
  │        targetPreState, adapterSupport, approvals, safeInverse,    │
  │        inputsDigest, evidenceDigest, planDigest }                 │
  └───────────────────────────────────────────────────────────────────┘
                    │
        ┌───────────┴────────────────────────────┐
        ▼                                        ▼
  text / JSON report                    alpha-aos project approve
  (persists NOTHING, D-12)              --plan-digest <digest> --apply
        │                                        │
        │                     revalidate ──► assertPlanUnchanged (DETC-05)
        │                                        │
        │                          applyFileTransaction (journal+snapshot)
        │                                        ▼
        │                          .alpha-aos/plan.json   (latest only, D-16)
        ▼
  alpha-aos project status ──► CURRENT | STALE | CHANGED | CONFLICT
                                 └─ STALE names the MISSING FACT (D-15)
                                    and never deletes (DETC-06)

  alpha-aos project sync --apply  ──►  still REFUSED until Phase 3
```

### Recommended Project Structure

```text
src/core/
├── evidence.ts          # canonical root, bounded scan, 6 detector kinds,
│                        #   evidence envelope construction, inputsDigest
├── pack-catalog.ts      # strict loader for catalog/packs/*.yaml and
│                        #   catalog/facts.yaml; merge, duplicate-id refusal
├── project-plan.ts      # predicate evaluator, near-miss ranking,
│                        #   ProjectCapabilityPlan, approve/revalidate
├── project.ts           # KEEP inspectProjectManifest (+ D-06 overrides);
│                        #   DELETE detectProject's hardcoded rules
└── ignore-list.ts       # ignore-list resolution (thin wrapper over the
                         #   approved matcher, or the bounded fallback)

schemas/
├── pack-catalog.schema.json      # new — closes catalog/packs/*.yaml
├── fact-vocabulary.schema.json   # new — closes catalog/facts.yaml
└── project-stack.schema.json     # extend: packOverrides (D-06)

catalog/
├── facts.yaml           # new — the declared fact vocabulary
├── packs/*.yaml         # unchanged shape; becomes authoritative
└── stack.lock.json      # extend: 19 pack-skill sourceSha256 entries

scripts/
└── pin-pack-skills.mjs  # maintainer-only: run the ECC fixture over the
                         #   pack skill list and emit lock entries (D-08)
```

### Pattern 1: Canonical root selection ladder with a recorded reason

**What:** Resolve the project root through one ordered ladder and record *which rung answered*, never just the path.
**When to use:** Every entry into `plan`, `approve`, and `status`.

```typescript
// Source: composed from src/core/path-boundary.ts:245 (provePathBoundary)
//         and src/core/isolation.ts:132-135 (isolationProjectId)
export type RootReason =
  | "explicit-override"
  | "git-root"
  | "worktree-root"
  | "submodule-root"
  | "project-declaration"
  | "standalone-directory";

export interface CanonicalRoot {
  root: string;          // realpath-canonical, native separators
  reason: RootReason;
  projectId: string;     // 16 hex, from isolationProjectId(root)
}
```

`isolationProjectId` is reusable **only if it is fed an already-canonical root**. Its body is `resolve(projectRoot).replaceAll("\\", "/").toLowerCase()` then `sha256(...).slice(0, 16)` `[VERIFIED: src/core/isolation.ts:132-135, verbatim]`. `resolve()` does not follow symlinks, so two aliases of one repository would otherwise produce two ids — precisely the failure `.planning/research/PITFALLS.md` names: "A path-derived, lowercased project ID is not a portable repository identity for case-sensitive filesystems, renamed directories, symlink aliases, or worktrees" `[VERIFIED: .planning/research/PITFALLS.md:48, verbatim]`. Passing the canonicalized root makes `resolve()` an identity and the function correct. **Do not change `isolationProjectId` itself** — its output names existing isolation runtime roots under `~/.alpha-aos/`.

### Pattern 2: One boundary rule — a `.git` entry of *either* kind

**What:** A directory containing a `.git` entry is the root of a different project, whether that entry is a directory (ordinary repository), or a file (linked worktree or submodule).
**When to use:** Every descent decision in the scan.

Empirically verified this session on Git 2.55.0:

| Case | `.git` entry | Content |
|------|-------------|---------|
| Ordinary repository | **directory** | — |
| Linked worktree (`git worktree add`) | **file** | `gitdir: C:/…/main/.git/worktrees/wt` (absolute) |
| Submodule (`git submodule add`) | **file** | `gitdir: ../.git/modules/sub` (relative) |
| Nested `git init` inside a working tree | **directory** | parent `git status` shows `?? nested/` — git itself does not descend |

`[VERIFIED: fixtures created and inspected under the session scratchpad, 2026-09-07; `ls -ld` and `cat` output transcribed above]`

**Consequences for the plan:**
- The rule is `existsSync(join(dir, ".git"))` — **not** `statSync(...).isDirectory()`. A `isDirectory()` check silently walks into every worktree and submodule.
- The `gitdir:` pointer may be **relative or absolute**; do not assume either.
- `.gitmodules` at the superproject root additionally declares submodule paths (`[submodule "sub"] path = sub`), which is useful when a submodule is *declared but not initialized* and therefore has no `.git` file yet. Read it as a second, independent boundary source.
- Git's own `status` treats a nested repository as an opaque untracked directory. Matching that behaviour is not merely conservative — it is the same semantics the user already expects.

### Pattern 3: Keep the five existing operators; add a declared fact vocabulary

**What:** Do not invent a predicate grammar. Close a schema around the shape `catalog/packs/*.yaml` already uses, and move the *facts* those predicates reference into their own declared vocabulary.

The five operators in use today, verbatim from the pack files:

```yaml
evidence: { any: [mcp-sdk-dependency, mcp-server-manifest] }          # ai.yaml
evidence: { all: [web-framework, browser-entrypoint] }                # web.yaml
evidence: { anyFiles: [Dockerfile, docker-compose.yml, docker-compose.yaml, compose.yml, compose.yaml] }  # infra.yaml
evidence: { anyDependencies: [react, next] }                          # web.yaml
evidence: { manifestOptIn: scientificResearch }                       # research.yaml
```

`[VERIFIED: catalog/packs/ai.yaml, web.yaml, infra.yaml, research.yaml — full files read this session]`

**Minimal extension required.** `SECURITY_REVIEW` is documented as "위 위험 증거 **또는** manifest opt-in" `[CITED: docs/alpha-vibe-stack-codex.md §5.2 pack table]`, which today's one-operator-per-pack shape cannot express. Make `all`/`any` items accept **either a fact id (string) or a nested evidence node (object)**, with a depth bound of 4. Every existing file stays valid unchanged:

```yaml
evidence:
  any:
    - auth-change
    - user-input
    - { manifestOptIn: securityReview }
```

**Uniform explanation rendering (D-09).** `anyFiles` and `anyDependencies` carry inline literals rather than fact ids, so they would otherwise be unexplainable in the same vocabulary as `any`/`all`. Have the evaluator synthesize a fact id from operator plus matched literal: `file:Dockerfile`, `dependency:react`, `manifest:criticalUserFlows`. **This convention already exists in the repository** — the current detector emits exactly `manifest:scientificResearch` and `manifest:criticalUserFlows` `[VERIFIED: src/core/project.ts:86 and :90, verbatim `evidence.add("manifest:scientificResearch")` and `evidence.add("manifest:criticalUserFlows")`]`.

**`catalog/facts.yaml` — the vocabulary.** Each entry names one of six detector kinds plus its parameters. This is what makes D-05 true for facts as well as packs:

```yaml
schemaVersion: 1
facts:
  - id: postgres-driver
    kind: dependency
    polarity: positive
    packages: [pg, postgres, psycopg, psycopg2, psycopg2-binary, asyncpg, pg-promise]
  - id: missing-conventions-document
    kind: fileAbsent
    polarity: negative-is-detection    # detected == the document is absent
    files: [docs/ai/CONVENTIONS.md, CONVENTIONS.md, docs/CONVENTIONS.md]
```

The six detector kinds — and there should be exactly six, because they cover all 29 named facts:

| Kind | Reads | Produces `version`? | Notes |
|------|-------|--------------------|-------|
| `dependency` | declared manifest readers | yes — the declared range | e.g. `"^8.0.0"` from `package.json` |
| `file` | path/glob existence | no | `path` records which alternative matched |
| `directory` | directory existence | no | `migration-directory`, `eval-assets` |
| `manifestKey` | `.alpha-aos/stack.yaml` | yes — manifest `schemaVersion` | current-and-valid manifests only |
| `fileAbsent` | path non-existence | no | `missing-conventions-document`; makes the negation expressible without a `not` operator |
| `fileContent` | bounded regex over a declared file set | no | `openapi`, `deploy-workflow`, `postgres-dsn`. **Records only `matched: true` and the path — never the matched text.** |

**Manifest readers needed for `dependency`, all parseable with existing dependencies:** `package.json` (`dependencies` / `devDependencies` / `peerDependencies`), `pyproject.toml` (`[project].dependencies`, `[tool.poetry.dependencies]`, `[dependency-groups]`), `requirements.txt`, `go.mod` (`require` block), `Cargo.toml` (`[dependencies]`, `[dev-dependencies]`). `yaml`, `smol-toml`, and `jsonc-parser` cover four of five; `go.mod` needs a small bounded line reader.

**Fail-closed rule (Phase 1 D-01):** a pack whose predicate references a fact id absent from `catalog/facts.yaml` must be **refused at load** with a stable code, and reported as `unimplemented` in output. A pack that silently never matches is indistinguishable from a pack whose evidence is genuinely absent, which is the exact failure DETC-03 exists to prevent.

### Pattern 4: Evaluate every pack, never short-circuit

**What:** The evaluator computes the truth value of every leaf of every pack's predicate, then classifies. `Array.prototype.some` short-circuits, which destroys the information DETC-03 needs.

```typescript
// A pack's evaluation is a full tree of leaf results, not a boolean.
interface LeafResult { factId: string; detected: boolean; path: string | null; reason: string | null; }
interface PackEvaluation {
  packId: string;
  status: "selected" | "near-miss" | "silent" | "unimplemented" | "conflict" | "forced-on" | "forced-off";
  satisfied: LeafResult[];   // every leaf that held
  failed: LeafResult[];      // every leaf that did not, each with a reason
}
```

Every failed leaf carries a `reason`, which is exactly the field `schemas/evidence.schema.json` reserves: `"reason": { "description": "Why a near-match failed. Present on negative evidence.", "type": "string", "minLength": 1 }` `[VERIFIED: schemas/evidence.schema.json, facts[].reason, verbatim]`.

### Pattern 5: Near-miss definition and bound (D-09 discretion, resolved)

**Recommended definition of "partially matched":** a pack is a near-miss when **at least one leaf of its predicate is satisfied and at least one is not**. Under `all`, that is a genuine partial match. Under `any`, no leaf being satisfied means the pack matched nothing and stays silent; if `any` had a satisfied leaf the pack would be selected, so `any`-only packs are never near-misses — which is correct, because there is nothing to explain. Under nested composition, apply the rule to the flattened leaf set.

**Recommended bound:** print at most **5** near-miss lines by default, ordered by descending satisfied-leaf count then ascending pack id (deterministic tiebreak), with a trailing `… N more (use --why)` line. `--why` prints all 15 packs with full leaf detail. This mirrors `finalizeIssues`, which "Deterministic order and a hard cap, so a hostile document cannot flood output" `[VERIFIED: src/core/validation.ts:105 comment, verbatim]`.

**Required output shape**, matching the CONTEXT's specific ask:

```text
AGENT_RUNTIME: AGENTS.md present, but no agent SDK dependency.
```

Rendered as `<PACK_ID>: <satisfied leaf phrase>, but <failed leaf phrase>.` — both phrases come from the fact vocabulary, not from a per-pack string, so the rendering stays uniform across all 15.

### Pattern 6: `ProjectCapabilityPlan` — one field per DETC-04 noun

DETC-04 enumerates nine things a plan must identify. Map them explicitly so the plan-checker can verify coverage:

| DETC-04 noun | Field | Source |
|--------------|-------|--------|
| scope | `scope: { canonicalRoot, rootReason, projectId, subProjectPath \| null }` | Pattern 1 |
| owner | `owner: "alpha-aos"` + `producer: { name, version }` | `schemas/evidence.schema.json` `producer` shape |
| exact source version and hash | `source: { package: "ecc-universal", version: "2.2.0", integrity, skill, sourceSha256 }` | `catalog/stack.lock.json` (D-08) |
| renderer | `renderer: { id: "ecc-skill/identity", version }` | `renderEccSkill` returns `source` unchanged for every skill except `documentation-lookup`+`antigravity` and `deep-research` `[VERIFIED: src/core/ecc-fixture.ts:61-103]` — so for all 19 pack skills the render is identity and `targetSha256 === sourceSha256` |
| target pre-state | `targetPreState: { path, exists, currentHash \| null, ownedByReceipt: boolean }` | `discoverSkillPaths` roots + `.alpha-aos/receipts/` |
| adapter support | `adapterSupport: Record<HarnessId, "supported" \| "unsupported" \| "unverified">` | Reuse the project's own vocabulary: `type SurfaceSupport = "supported" \| "unsupported" \| "unverified"` `[VERIFIED: .planning/research/ARCHITECTURE.md:101, verbatim]` |
| approvals | `approvals: Array<{ code, detail }>` | `SUS` packages, D-06 forced overrides, D-11 conflicts |
| safe inverse | `safeInverse: { operation: "remove" \| "restore", guard: { path, expectedHash } }` | Transaction snapshot semantics |
| stable text and JSON | both rendered from one value through `print(value, json, formatted, context)` | `[VERIFIED: src/cli.ts:136-142]` |

**Adapter support, concretely.** Claude Code's project skill location is `.claude/skills/<skill-name>/SKILL.md` `[CITED: https://code.claude.com/docs/en/skills — "Project | `.claude/skills/<skill-name>/SKILL.md` | This project only"]`, which matches the shape the design doc already assumes for `--target claude-project` `[CITED: docs/alpha-vibe-stack-codex.md §5.4]`. `src/core/isolation.ts:163` already enumerates `.agents/skills`, `.claude/skills`, and `.pi/skills` as project-local roots `[VERIFIED: src/core/isolation.ts:163, verbatim]`. `catalog/stack.yaml` records `pi: eccStrategy: bridge` with no `eccTarget`, and `hermes: gsdStrategy: worker-only` `[VERIFIED: catalog/stack.yaml harnesses block, verbatim]`. Recommendation: report `claude` as `supported`, `codex`/`pi` as `unverified` (a project root exists at `.agents/skills` but no documented project-scope discovery has been proven), and `antigravity`/`hermes` as `unsupported` until a canary proves otherwise. `"supported" means a real harness/version probe has passed, not that an adapter contains a plausible filename" `[VERIFIED: .planning/research/ARCHITECTURE.md:130, verbatim]`.

**Two Claude Code discovery facts that bear directly on scope:**

- "When skills share the same name, Claude Code resolves the conflict by source: Across levels, enterprise overrides personal, and personal overrides project." `[CITED: https://code.claude.com/docs/en/skills]` — a project pack skill is *shadowed* by a same-named personal skill. None of the 19 pack skills collide with the 3 global skills today, but the plan's `adapterSupport` should record the shadowing risk as a named approval line rather than assume none.
- "Project skills load from `.claude/skills/` in the directory where you start Claude Code and in every parent directory up to the repository root." `[CITED: https://code.claude.com/docs/en/skills]` — a pack installed at the *repository* root leaks into every sub-project, while one installed at a *sub-project* root is scoped to that subtree and namespaced (`/apps/web:deploy`). This makes D-01's sub-project targeting load-bearing for CAPA-06 in Phase 3, and the Phase 2 plan's `scope` field is where that decision is recorded.

### Pattern 7: Two digests, because D-13 needs to tell them apart

**What:** Compute `inputsDigest` and `evidenceDigest` separately.

- `inputsDigest` = sha256 over the sorted list of `(relative POSIX path, sha256 of bytes)` for **every file a detector actually read**. Answers "did anything we looked at change?"
- `evidenceDigest` = sha256 over the normalized, sorted fact set (ids, detected flags, versions, paths — **not** timestamps). Answers "did the selection-relevant observations change?"

D-13 requires distinguishing "inputs changed but the pack selection is identical" from "the selection itself changed". Two digests make that a two-line comparison rather than a re-derivation. This also resolves the apparent tension with D-07: D-07 forbids a **per-fact** file hash, so an unrelated comment does not disturb any individual fact; the **aggregate** input digest is a different object and is exactly what the phase's "full input and target digests" deliverable asks for. A comment change moves `inputsDigest` and leaves `evidenceDigest` alone, which is precisely the case D-13 wants reported as re-approvable.

`schemas/evidence.schema.json` requires `sourceHash`, described as "Digest of the canonical repository state this evidence was derived from" `[VERIFIED: schemas/evidence.schema.json, sourceHash description, verbatim]`. Map `inputsDigest` onto `sourceHash`; carry `evidenceDigest` in the plan artifact.

### Pattern 8: Revalidate-and-compare, using the contract that already exists

**What:** DETC-05 is exactly `assertPlanUnchanged`. Do not build a second drift mechanism.

```typescript
// Source: src/core/component-session.ts:117-125 (verbatim)
export function assertPlanUnchanged(reviewed: ReviewedPlanBoundary, revalidated: ReviewedPlanBoundary): void {
  if (revalidated.digest !== reviewed.digest) {
    throw new ComponentPlanError(
      "plan-drift",
      `${reviewed.kind} changed between review and apply: reviewed ${reviewed.digest.slice(0, 12)}, observed ${revalidated.digest.slice(0, 12)}`,
    );
  }
}
```

The digest content must cover all seven DETC-05 nouns: evidence (`evidenceDigest`), manifest (manifest content hash), stable lock (`sourceSha256` for each selected pack skill), renderer (`renderer.id` + version), executable (n/a for Phase 2 — plan and approve spawn nothing; record `null` explicitly rather than omitting the field), adapter capability (`adapterSupport` map), and target bytes (`targetPreState[].currentHash`).

The CLI shape to copy is the `repair` branch, which prints `Plan digest: ${plan.planDigest}` and requires it back at apply: `applyWriterRepair(stateRoot, plan.planDigest)` `[VERIFIED: src/cli.ts:587-603]`.

### Pattern 9: `STALE` from receipt × evidence reconciliation

**What:** `status` reads `.alpha-aos/receipts/<packId>.json` (written by Phase 3), re-collects evidence, and classifies.

`schemas/receipt.schema.json` already carries `evidenceHash`, described as "Digest of the evidence envelope that selected this pack" `[VERIFIED: schemas/receipt.schema.json, evidenceHash description, verbatim]`. That binding is what makes the reconciliation exact.

| Condition | Report |
|-----------|--------|
| Receipt exists, pack still selected, `targetHash` matches | `CURRENT` |
| Receipt exists, pack no longer selected because a fact flipped to `detected: false` | `STALE`, naming the fact — never deletes |
| Receipt exists, `targetHash` no longer matches the file on disk | `DRIFTED` |
| Receipt exists, evidence unreadable (EACCES) | `UNDECIDABLE` — see §Open Questions |

**Phase 2/3 contract handshake:** Phase 2 must *read* receipts to compute `STALE` (D-14), but Phase 3 *writes* them. The receipt location is therefore a Phase 2 decision that Phase 3 inherits. Recommend declaring `.alpha-aos/receipts/<packId>.json` in this phase and writing it into the plan artifact so Phase 3 cannot choose differently.

**Branch context (D-15):** the report must also state that the branch/commit differs from the approved one. Since `plan` and `approve` must stay offline and subprocess-free, read `HEAD` from the filesystem (`.git/HEAD`, and the referenced ref file, or the packed-refs entry) rather than spawning `git rev-parse`. Record it as *context only* — it must never participate in `evidenceDigest`, or every commit would invalidate every approval.

### Anti-Patterns to Avoid

- **Widening `selectedSkills` to include pack skills.** `src/core/ecc-skills.ts:26` declares `const selectedSkills: SelectedEccSkill[] = ["unified-memory", "documentation-lookup", "deep-research"];` and `src/core/ecc-fixture.ts:23` declares the same tuple as the source of `SelectedEccSkill` `[VERIFIED: both lines read this session, verbatim]`. `requireEccLock` and `planEccSkillSync` iterate that array to build the **global** sync plan. Adding the 19 pack skills to it would make `alpha-aos` install all 22 skills into every user's global skill root — the exact opposite of CAPA-08's "without installing broad language/framework profiles globally". Introduce a **separate** `PackSkillId` set derived from `catalog/packs/*.yaml` and a separate lock-read path.
- **Parsing `catalog/packs/*.yaml` with a bare `yaml.parse`.** Phase 1 D-08/D-11 made `validateManagedDocument` the single route for managed documents; a direct parse would skip duplicate-key rejection, closed-world checking, version routing, and stable error codes. Add `"pack-catalog"` and `"fact-vocabulary"` to `ManagedDocumentKind` `[VERIFIED: src/core/validation.ts:12-22 declares the union: `"catalog" | "lock" | "project-manifest" | "journal" | "install-state" | "writer-lock" | "evidence" | "receipt" | "native-config"`]`. TypeScript's `Record<ManagedDocumentKind, …>` on `OWNED_SUBTREE` (`:290`) and `CORE_SCHEMAS` (`:305`) will force every site to be updated — lean on that rather than grepping.
- **Omitting `lifecycle` and `selectionPolicy` from the pack schema.** `catalog/packs/brownfield.yaml` carries `lifecycle: one-shot-remove-after-output` and `catalog/packs/security.yaml` carries `selectionPolicy: prefer-native-single-engine` `[VERIFIED: both files read this session, verbatim]`. Because the schema is closed-world, omitting either field makes alpha-AOS's own catalog fail its own loader.
- **Short-circuiting predicate evaluation.** Destroys DETC-03's near-miss data. See Pattern 4.
- **Deriving `projectId` from `resolve()` instead of `realpath`.** See Pattern 1.
- **Letting `createdAt` into any digest.** See Pitfall 2.
- **Spawning `git` on the preview path.** D-08 says `project plan` "touches no network and no package manager and completes fully offline"; D-04 requires the ignore rule to work "in directories that are not git repositories at all". Both point away from subprocess delegation.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Path canonicalization + containment | `realpath` + string prefix compare | `provePathBoundary` / `proveOperationPaths` / `recheckPathProof` (`src/core/path-boundary.ts:245,419,341`) | Phase 1 D-01 and 01-19 found the exact bug: the target was canonicalized through its deepest existing ancestor while the allowed root got a bare `realpath` whose catch left an unresolved string `[VERIFIED: STATE.md 01-19 decision entry]`. A prefix compare also aliases `/home/al-backup` under `/home/al` `[VERIFIED: src/core/paths.ts:50-52 comment, verbatim]`. |
| Duplicate-key-safe JSON/YAML/TOML parsing | `JSON.parse`, `yaml.parse` | `parseManagedDocument` / `validateManagedDocument` | "`JSON.parse` silently keeps the last value, which turns an ambiguous document into a confident one" `[VERIFIED: src/core/validation.ts:120-123, verbatim]`. A pack file with a duplicated `id` must be a refusal, not a coin flip. |
| gitignore pattern semantics | A regex translator | `ignore@7.0.5` (gated) or the bounded fallback with explicit `undecidable` | Negation, `**`, per-directory precedence, and the rule that "It is not possible to re-include a file if a parent directory of that file is excluded" `[CITED: https://git-scm.com/docs/gitignore]` are individually easy and collectively a determinism bug farm on a path that decides pack selection. |
| Workspace glob expansion | Custom glob | Node 24's `fs.glob` / `path.matchesGlob`, or the same matcher used for ignore | A hand-rolled glob that mishandles `packages/*` vs `packages/**` silently changes which sub-projects exist. |
| Plan-drift detection | A bespoke comparison | `reviewedDigest` + `assertPlanUnchanged` + `assertUnchangedSincePlan` | Already the contract for ECC, GSD, MCP, isolation, and support-bundle components. A second mechanism would drift from the first. |
| Journaled, snapshotted, rollbackable writes | `writeFile` to `.alpha-aos/` | `applyFileTransaction` with `allowedRoots: [join(root, ".alpha-aos")]` | This is what makes D-14's "no automatic deletion" enforceable rather than aspirational — the snapshot is the safe inverse. |
| Secret scrubbing in plan output | A `.replace()` pass | `print()` → `redactString` / `serializeObservable` | Already redacts URL userinfo (`url.username = placeholder("userinfo")`) and secret query keys `[VERIFIED: src/core/redaction.ts:71-85]`, which is exactly the `postgres-dsn` / `redis-dsn` hazard. |
| Session/writer serialization | An ad-hoc lockfile | `withComponentSession` / `MutationSession` | "the writer lock is exclusive-create, so a second acquisition would not merely be wasteful, it would deadlock the operation against itself" `[VERIFIED: src/core/component-session.ts:128-133 comment, verbatim]`. |

**Key insight:** Phase 1 spent 27 plans building exactly the primitives this phase needs, and several of its hardest bugs (01-19 canonicalization asymmetry, 01-21 preview-writes-to-home, 01-27 invalid termination instrument) were cases where a plausible local implementation quietly disagreed with the shared one. In this domain the custom solution is not merely worse — it is *invisibly* worse, because the wrong answer still looks like a decision.

---

## Findings That Settle CONTEXT.md's Open Questions

### F-1 — All 19 pack skills exist in `ecc-universal@2.2.0` (settles Open Question 1)

The installed global `ecc-universal` reports `version: 2.2.0` and every skill named by `catalog/packs/*.yaml` has a `SKILL.md`:

| Skill | sha256 of `SKILL.md` | Bytes |
|-------|---------------------|-------|
| `browser-qa` | `c501257d2c9ca711342b56d7adfb04897f17c6946dc6cdb88a5c75c87e4aa951` | 3727 |
| `accessibility` | `d8578fe750e7321658450386e2112a46ea1aedca0235fbf97f3db2457e599b3a` | 6563 |
| `frontend-a11y` | `62afdfd4e616ed21bf9037d47f771f3504d21838c898b9e9de8ac0da9b0bf3f7` | 12724 |
| `click-path-audit` | `662fc5d02483bcd8ff799d6d3109a38da673182341cfc14445e9076fcd920162` | 7975 |
| `database-migrations` | `ad7f2f04ca03e592a16e2a539d8c6e90bf4e08892408820ce99a53e9d07775de` | 11957 |
| `postgres-patterns` | `9c8c391ae9e9aa87faa7ca091e1d395c97766df14080d0bfbea8a97721776163` | 3914 |
| `redis-patterns` | `6cabb1cd03174a0584ff3538371c780aba90da156db15260691278ed3307d8fe` | 11977 |
| `docker-patterns` | `2a880cf2f6401874151daa9bcc0eacd10cf79f5f48b97f98e93a877a8f3fd12b` | 14937 |
| `deployment-patterns` | `b864abd1954570c4a469b7e1deb897e57858d25db2fd98d035ff7bca4a15b9b6` | 11113 |
| `mcp-server-patterns` | `eacb07c953e0440c758e3ee7d92984d2c9128e3444005ea7ad5da7bc0201d43d` | 4192 |
| `agent-harness-construction` | `e7fb390a6663b46ea5d3c2876753a5ce32ba3bad1889686b21a42894caa1742d` | 2100 |
| `ai-regression-testing` | `83f2f5c4083af5762dd658f742d4a390eb3a6f969d835f69e8f47efba296c127` | 11659 |
| `eval-harness` | `9d3afbeca1479975c2575daa7467ca3666e7627fcebe02ea050f2db93917c4fd` | 6592 |
| `security-review` | `fe6f9151fb15c1dffd47a55080c3ad147af7c95dd0ad3714735dec6824b060b7` | 12493 |
| `inherit-legacy-style` | `14e7b20424f123b594d3ee3d6ac3e722b21e5a6816fe90bacf8a23e6c3af5b6d` | 8552 |
| `scientific-db-pubmed-database` | `516c24ed8c74713191ec2424accf11f8f5518356b046561e5017f40687289838` | 4813 |
| `scientific-db-uspto-database` | `96849e8dc762df699fea11a283e9424660dd3b606e7e513617e4e9a9ce2011be` | 6317 |
| `scientific-thinking-literature-review` | `456e7ef6b33300bfefeeee46fc8dae55fec62e4a8b418ba2323e12779de70195` | 5181 |
| `scientific-thinking-scholar-evaluation` | `e9f8a3bce2bce769a96611a52804a2b3955f2796ee2749bc8275aea38a26cd2d` | 4886 |

`[VERIFIED: sha256sum over C:/Users/alpha/AppData/Roaming/npm/node_modules/ecc-universal/skills/<name>/SKILL.md, run 2026-09-07]`

**Cross-check that validates the whole table:** the three already-pinned skills hash to exactly the values in `catalog/stack.lock.json`:

```text
unified-memory        a6eb9a96b92dfd4a700bceff15195ca1fd4b7fad2944bb014c08812d1a0dc8b0
documentation-lookup  81ad2b5b4acbe02259f4b6cbfd9111d81d5cfe51025051b6048959c45f6516c1
deep-research         f85e06874ffd0fcfea6051b4292f45fc2b7e4cd47586659817ddbafd6bea3ede
```

`[VERIFIED: sha256sum output matches catalog/stack.lock.json components.ecc.sourceSha256 byte for byte]` — which proves both that `sourceSha256` means "sha256 of the raw `SKILL.md` bytes" and that the installed tree is unmodified relative to the locked tarball.

**Caveat and required plan task:** these hashes were read from a *global install*, not from the integrity-checked tarball. `runEccFixture` is the authoritative path — it runs `npm pack ecc-universal@2.2.0`, compares `pack.integrity !== options.ecc.integrity` and throws on mismatch, then hashes `SKILL.md` from the extracted tree `[VERIFIED: src/core/ecc-fixture.ts:286-308]`. The plan must regenerate these 19 values through a fixture-driven maintainer script and treat the table above as a cross-check, not as the source. Because `createEccFixtureOperationPlan` hardcodes `skills: selectedSkills`, the fixture needs a caller-supplied skill list (defaulting to today's three) before it can be reused.

**Lock schema accepts them unchanged.** `components.ecc.required` is `["package", "version", "integrity", "skills", "sourceSha256"]`; `skills` is `{ "type": "array", "minItems": 1, "uniqueItems": true, "items": { "type": "string", "minLength": 1 } }` and `sourceSha256` is `{ "type": "object", "additionalProperties": { "$ref": "#/$defs/sha256" } }` `[VERIFIED: schemas/lock.schema.json, components.ecc block, verbatim]`. `targetSha256` is **not** in `required`, so Phase 2 can pin source hashes without target hashes and leave per-harness targets to Phase 3.

### F-2 — `catalog/packs/*.yaml` and `src/core/project.ts` disagree in six ways (extends the CONTEXT premise)

CONTEXT.md states the two "already disagree". They disagree more broadly than one line implies:

1. **Four of fifteen packs have no code at all:** `API`, `DEPLOYMENT`, `SECURITY_REVIEW`, `BROWNFIELD_INIT`. The eleven produced by `detectProject` are `WEB_BASE`, `WEB_REACT`, `CONTAINER`, `DB_MIGRATION`, `DB_POSTGRES`, `CACHE_REDIS`, `MCP_SERVER`, `AGENT_RUNTIME`, `AI_EVAL`, `RESEARCH_SCIENTIFIC`, `WEB_FLOW_AUDIT` `[VERIFIED: src/core/project.ts:36-96]`.
2. **The container fact is named differently in each place.** Code emits `evidence.add("container-file")` `[VERIFIED: src/core/project.ts:50, verbatim]`; the YAML uses `anyFiles: [Dockerfile, docker-compose.yml, docker-compose.yaml, compose.yml, compose.yaml]` with no fact id at all `[VERIFIED: catalog/packs/infra.yaml, verbatim]`.
3. **Four packs check only one of their two declared alternatives.** `DB_MIGRATION` declares `any: [migration-directory, orm-migration-config]` but code checks only directories; `DB_POSTGRES` declares `any: [postgres-driver, postgres-dsn]` but code checks only the driver; likewise `CACHE_REDIS` (`redis-dsn` unchecked), `MCP_SERVER` (`mcp-server-manifest` unchecked), and `AGENT_RUNTIME` (`agent-runtime-config` unchecked) `[VERIFIED: catalog/packs/backend.yaml and ai.yaml vs src/core/project.ts:53-72]`.
4. **The dependency reader looks only in `package.json`.** `packageDependencies` reads `join(root, "package.json")` and nothing else `[VERIFIED: src/core/project.ts:26-34]`, yet the hardcoded lists contain Python package names: `const postgresPackages = ["pg", "postgres", "psycopg", "psycopg2", "asyncpg"];` `[VERIFIED: src/core/project.ts:16, verbatim]`. `psycopg2` and `asyncpg` can appear only in `pyproject.toml` or `requirements.txt`, so those three entries are unreachable today. The design doc names FastAPI and Django REST as `API` evidence `[CITED: docs/alpha-vibe-stack-codex.md §5.2]`, which is likewise unreachable.
5. **Manifest facts use a `manifest:` prefix in code that the YAML does not use.** `manifest:scientificResearch` vs `manifestOptIn: scientificResearch`. (Recommendation in Pattern 3 keeps the code convention and derives it from the YAML.)
6. **Code returns `{ root, evidence: string[], packs: string[] }`** `[VERIFIED: src/types.ts:111-115, verbatim]` — a flat string list with no path, version, polarity, or reason, which cannot express DETC-02 or DETC-03 at all.

### F-3 — `lifecycle` and `selectionPolicy` must be in the Phase 2 schema (settles Open Question 3)

`catalog/packs/brownfield.yaml` declares `lifecycle: one-shot-remove-after-output` and `catalog/packs/security.yaml` declares `selectionPolicy: prefer-native-single-engine` `[VERIFIED: both files, verbatim]`. Because `validateManagedDocument` is closed-world (`additionalProperties: false` on core fields, with only `x-` namespaced extensions preserved and inert `[VERIFIED: src/core/validation.ts:79-80, EXTENSION_NAMESPACE regex]`), a pack schema that omits these fields would make alpha-AOS reject its own catalog.

**Answer:** both fields are part of the Phase 2 **declaration** contract (they must be schema-declared and round-tripped into the plan artifact so Phase 3 can read them) and neither is a Phase 2 **behaviour** (removal-after-output and native-engine preference are Phase 3 materialization and Phase 4 gate concerns respectively). Declare them, carry them, do not act on them. The design doc confirms the intent: `inherit-legacy-style` "brownfield 최초 분석에서 중립적인 `docs/ai/CONVENTIONS.md`를 만든 뒤 제거하고, 이후에는 그 문서를 모든 하네스가 읽는다" `[CITED: docs/alpha-vibe-stack-codex.md §5.3]`.

### F-4 — Workspace declarations, verified against official documentation (settles Open Question 2)

| Ecosystem | File | Key | Verbatim |
|-----------|------|-----|----------|
| npm / yarn / bun | `package.json` | `workspaces` | `{ "name": "my-workspaces-powered-project", "workspaces": ["packages/a"] }` `[CITED: https://docs.npmjs.com/cli/v11/using-npm/workspaces]` |
| pnpm | `pnpm-workspace.yaml` | `packages` | `packages:\n  - 'my-app'\n  - 'packages/*'\n  - '!**/test/**'` — "The root package is always included" `[CITED: https://pnpm.io/pnpm-workspace_yaml]` |
| Cargo | `Cargo.toml` | `[workspace] members` / `exclude` / `default-members` | `members = ["member1", "path/to/member2", "crates/*"]`; a *virtual* workspace omits `[package]` `[CITED: https://doc.rust-lang.org/cargo/reference/workspaces.html]` |
| Go | `go.work` | `use` | `use (\n    ../othermod\n    ./subdir/thirdmod\n)` — "The `use` directive does not add modules in subdirectories of its argument directory" `[CITED: https://go.dev/ref/mod]` |
| uv (Python) | `pyproject.toml` | `[tool.uv.workspace] members` / `exclude` | `members = ["packages/*"]`, `exclude = ["packages/seeds"]` — "Each member directory must contain its own `pyproject.toml`" `[CITED: https://docs.astral.sh/uv/concepts/projects/workspaces/]` |

**Three facts that shape D-02's fallback rule:**

1. **Globs, not paths.** Every declaration except `go.work` uses globs, and pnpm supports *negated* globs (`'!**/test/**'`). The reader must expand globs and then boundary-prove each result, not treat entries as literal directories.
2. **Exclusions are real.** Cargo has `exclude`, uv has `exclude`, pnpm has `!` — a declaration that lists a member and then excludes it is not "incorrect", it is normal.
3. **`go.work` is frequently absent by design.** "It is generally **inadvisable** to commit `go.work` files into version control systems" `[CITED: https://go.dev/ref/mod]`. This is the strongest single argument for D-02's fallback: for Go specifically, the declaration will usually not be in the repository at all, so the scan is the primary path, not the exception.

**Recommended answer to "what does the fallback do in a repository that declares workspaces incorrectly?"** — Treat a declaration as *additive evidence*, not as a replacement for reality. Expand the declaration; for each declared member, verify it exists, is inside `canonicalRoot`, is not behind a boundary, and contains a project-declaration file. A declared member failing any check is **reported** (one line, with the reason) and dropped, and the scan still runs to find undeclared members. This satisfies D-02's precedence rule — the declaration decides *ordering and naming* — while refusing to let a stale `workspaces` entry make a real sub-project invisible. It is also cheap: D-02's own reversibility note says "the fallback scan already has to exist."

### F-5 — Which packs can honestly ship in Phase 2 (settles the CONTEXT discretion item on `API` / `DEPLOYMENT`)

| Pack | Ship in Phase 2? | Reason |
|------|-----------------|--------|
| `WEB_BASE`, `WEB_REACT`, `WEB_FLOW_AUDIT`, `DB_MIGRATION`, `DB_POSTGRES`, `CACHE_REDIS`, `CONTAINER`, `MCP_SERVER`, `AGENT_RUNTIME`, `AI_EVAL`, `RESEARCH_SCIENTIFIC` | **Yes** | Expressible with `dependency`, `file`, `directory`, `manifestKey` detectors; all skills pinned per F-1. |
| `API` | **Yes** | `server-framework` → `dependency` (express, fastify, nest, fastapi, django, djangorestframework, flask, gin, actix-web, …); `openapi` → `file` (`openapi.yaml`/`openapi.json`/`swagger.yaml`) plus `fileContent` fallback; `route-controller` → `directory`. `skills: []` is already declared, so nothing needs pinning `[VERIFIED: catalog/packs/backend.yaml, API entry has `skills: []`]`. |
| `DEPLOYMENT` | **Yes, with a narrowed `deploy-workflow`** | `kubernetes` → `file` (`kustomization.yaml`, `Chart.yaml`, `k8s/**`); `terraform` → `file` (`*.tf`); `deploy-workflow`/`release-workflow` → `fileContent` over `.github/workflows/*.y*ml` matching a bounded, declared job/step vocabulary. The design doc is explicit that presence alone is insufficient: "**실제** deploy/release/publish workflow" `[CITED: docs/alpha-vibe-stack-codex.md §5.2]`. `deployment-patterns` is pinned per F-1. |
| `BROWNFIELD_INIT` | **Yes** | `existing-source` → `directory`/`file`; `missing-conventions-document` → `fileAbsent`. `inherit-legacy-style` is pinned. `lifecycle` is declared and carried, not acted on (F-3). |
| `SECURITY_REVIEW` | **Manifest-opt-in branch only** | Its eight facts — `auth-change`, `user-input`, `secrets`, `payments`, `sensitive-data`, `command-execution`, `trust-boundary`, `public-api` `[VERIFIED: catalog/packs/security.yaml, verbatim]` — are **change-risk semantics, not repository-state facts**. Two of them (`secrets`, `sensitive-data`) would require content-scanning a user's repository for credentials, which collides head-on with the AGENTS.md secrets constraint. GATE-01 already owns "deterministic risk evidence" and lands in Phase 4. Both design docs give `SECURITY_REVIEW` an explicit manifest-opt-in alternative, so shipping only that branch is faithful to the declared semantics rather than a reduction of them. Record the eight risk facts as `unimplemented` with `deferredTo: "GATE-01"` so the near-miss line is honest rather than silent. |

**Net: 14 of 15 packs fully, 1 partially, 0 sourceless.**

---

## Common Pitfalls

`.planning/research/PITFALLS.md` §Pitfall 2 already owns "Project evidence or installed packs leak across repository boundaries" for this phase, including its fixture matrix. The pitfalls below **extend** it with what this session's investigation surfaced; do not duplicate Pitfall 2's content into the plan, cite it.

### Pitfall 1: The canonical root is proven but the *scan* is not

**What goes wrong:** The root is canonicalized correctly, then the directory walk follows a symlink or junction inside the repository that points outside it, and evidence from an unrelated tree is attributed to this project.
**Why it happens:** `readdir` returns entries; nothing about the entry says where it really lives. `existsSync(join(root, "src"))` — the shape used throughout `detectProject` today `[VERIFIED: src/core/project.ts:43]` — is true for a symlink to anywhere.
**How to avoid:** Every path the collector *reads* must be boundary-proven with `allowedRoots: [canonicalRoot]`, not merely joined under it. Maintain a visited `(device, inode)` set to terminate symlink cycles, and a depth bound.
**Warning signs:** `detect` output differs when invoked through a symlinked path; an evidence `path` escapes `canonicalRoot` after aliasing; the walk does not terminate on a self-referential link.

### Pitfall 2: The plan is "stable" until you look at the timestamp

**What goes wrong:** `plan` produces different bytes on two consecutive runs against an unchanged repository, so DETC-04's stability claim fails and DETC-05 refuses every apply.
**Why it happens:** Three independent causes, all live in this codebase's shape:
1. `schemas/evidence.schema.json` **requires** `createdAt` `[VERIFIED: required: ["schemaVersion", "projectId", "producer", "createdAt", "sourceHash", "facts"]`, verbatim]`. If `createdAt` is inside the digested content, every run differs.
2. `reviewedDigest` hashes `JSON.stringify(content)` `[VERIFIED: src/core/component-session.ts:65-67]`, and `JSON.stringify` preserves **insertion order**. Two code paths building the same logical object with keys in different orders produce different digests.
3. Iteration order of `Set`/`Map`/`readdir`. The current detector already sorts on exit (`[...evidence].sort()` `[VERIFIED: src/core/project.ts:95]`) — that discipline must extend to every array in the plan.
**How to avoid:** Exclude `createdAt` and the git `HEAD` context from both digests, by construction (build a separate `digestable` view rather than deleting fields from the envelope). Sort every array. Build digested objects from a single literal, in one place. Add a test that runs `plan` twice and asserts byte-identical output — this is the cheapest possible regression net for DETC-04.
**Warning signs:** `plan` output diffs across runs; `approve` immediately refuses its own freshly printed digest.

### Pitfall 3: `AGENTS.md` is not the only over-broad signal

**What goes wrong:** A pack activates on a file that exists in ordinary repositories. The named case is `AGENTS.md` → `AGENT_RUNTIME`, but the current code has an unnamed sibling: `WEB_BASE`'s `browser-entrypoint` is `["app", "pages", "src", "public"].some((path) => existsSync(join(root, path)))` `[VERIFIED: src/core/project.ts:43, verbatim]`. A bare `src/` directory satisfies it. That is only safe today because `all: [web-framework, browser-entrypoint]` also demands a web framework dependency.
**Why it happens:** Directory-existence facts are cheap to write and almost always too broad.
**How to avoid:** Every fact in `catalog/facts.yaml` must be reviewed against the question "does this exist in a repository that is *not* this kind of project?" Facts that fail get a `broad: true` marker and are forbidden from being a pack's *only* satisfied leaf. This makes the doc's rule mechanical: "`AGENTS.md`나 `.claude/skills/`의 존재만으로 `AGENT_RUNTIME`을 활성화하지 않는다" `[CITED: docs/alpha-vibe-stack-codex.md §5.2]`. Note that this repository itself has a 21 KB `AGENTS.md` and a `skills/` directory — it is its own negative fixture.
**Warning signs:** A pack selects on a repository with no dependency evidence; the near-miss line for a pack is empty because everything matched trivially.

### Pitfall 4: `.git` is checked with `isDirectory()`

**What goes wrong:** Detection walks straight into every linked worktree and submodule, borrowing their evidence — the precise DETC-01 failure.
**Why it happens:** "a git repository has a `.git` directory" is the common mental model, and it is wrong for two of the four cases (see Pattern 2's verified table).
**How to avoid:** Test for *existence* of the entry, of either kind. Add fixtures for all four cases; the `git worktree add` and `git submodule add` fixtures take three commands each.
**Warning signs:** Sub-project count differs after `git worktree add`; a submodule's `package.json` dependencies appear in the superproject's evidence.

### Pitfall 5: Adding pack skills to `selectedSkills` installs them globally

**What goes wrong:** 19 project-scoped skills land in every user's global skill root at the next `alpha-aos sync`.
**Why it happens:** `selectedSkills` is the global sync list *and* the fixture's render list, and it looks like "the list of ECC skills we manage" `[VERIFIED: src/core/ecc-skills.ts:26 and src/core/ecc-fixture.ts:23]`.
**How to avoid:** Separate `PackSkillId` from `SelectedEccSkill`; add a test asserting `planEccSkillSync` still produces exactly three entries after the lock grows.
**Warning signs:** `alpha-aos plan` shows more than three ECC skill operations; `~/.claude/skills/` gains `postgres-patterns`.

### Pitfall 6: `STALE` names the pack instead of the missing evidence

**What goes wrong:** The user is told `postgres-patterns — STALE` and cannot tell whether the dependency was removed, the branch changed, or the file became unreadable.
**Why it happens:** The receipt knows the pack; deriving *which fact* flipped requires keeping the approved evidence alongside the receipt.
**How to avoid:** Persist the approved fact set inside `.alpha-aos/plan.json` (D-16 keeps only the latest, which is exactly enough) and diff fact-by-fact at `status` time. Required output shape, from the CONTEXT: `` `postgres-patterns` — the `pg` dependency that selected it is gone. ``
**Warning signs:** `status` output mentions no fact id; two different causes produce identical text.

### Pitfall 7: DSN and secret-adjacent facts leak values

**What goes wrong:** `postgres-dsn` matches `postgres://admin:hunter2@db.internal/app` inside a config file and the plan records the matched text — into a repository file, since D-10 puts the plan under `.alpha-aos/` where a team may commit it.
**Why it happens:** `fileContent` detectors naturally want to record what they matched.
**How to avoid:** The `fileContent` detector's return type must make the value **unrepresentable**: `{ matched: boolean; path: string }` with no text field. D-07 already forbids per-fact hashes, so there is nothing to carry. `redactString` is a second net, not the first — it already handles URL userinfo `[VERIFIED: src/core/redaction.ts:71-85]` but cannot rescue a value the record was designed to hold.
**Warning signs:** Any `fileContent` detector signature returning a string; a plan artifact containing an `@` inside a URL.

### Pitfall 8: A pack referencing an unknown fact is silently unselectable

**What goes wrong:** Someone adds a pack in YAML per D-05, references a fact that has no detector, and the pack never selects — indistinguishable from "your repository does not qualify."
**Why it happens:** An evaluator that treats an unknown fact as `detected: false` is the obvious implementation and is wrong.
**How to avoid:** Refuse at load with a stable code, and surface the pack as `unimplemented` with the offending fact id. This is Phase 1 D-01 applied to the catalog.
**Warning signs:** A pack never appears in `--why` output; adding a pack changes nothing.

---

## Code Examples

### Pattern: adding a new managed document kind (the compiler does the work)

```typescript
// Source: src/core/validation.ts:12-22, :290, :305 (existing structure)
export type ManagedDocumentKind =
  | "catalog" | "lock" | "project-manifest" | "journal" | "install-state"
  | "writer-lock" | "evidence" | "receipt" | "native-config"
  | "pack-catalog"        // new
  | "fact-vocabulary";    // new

// OWNED_SUBTREE and CORE_SCHEMAS are Record<ManagedDocumentKind, …>, so tsc
// reports both omissions. Do not grep for call sites; let strict mode enumerate.
const CORE_SCHEMAS: Record<ManagedDocumentKind, Record<string, unknown>> = {
  // …
  "pack-catalog": coreObject(["schemaVersion", "packs"], {
    schemaVersion: { type: "integer" },
    packs: { type: "array" },
  }),
  "fact-vocabulary": coreObject(["schemaVersion", "facts"], {
    schemaVersion: { type: "integer" },
    facts: { type: "array" },
  }),
};
```

The loader then passes the repository's own file as the authoritative schema, exactly as `inspectProjectManifest` does — "Omit to use the engine's built-in core schema; supply the repository's own schemas/*.json to make that file the single source of truth for a kind" `[VERIFIED: src/core/validation.ts:503-508 comment, verbatim]`.

### Pattern: evidence fact record, valid against the sealed envelope

```typescript
// Source: schemas/evidence.schema.json facts[] (required: id, kind, detected;
//         optional: path, version, hash, reason; additionalProperties: false)
interface EvidenceFact {
  id: string;              // "postgres-driver"
  kind: string;            // "dependency" — one of the six detector kinds
  detected: boolean;       // negative facts are recorded, not omitted (DETC-03)
  path?: string;           // "package.json"  — D-07: path is recorded
  version?: string;        // "^8.0.0"        — D-07: version is recorded
  reason?: string;         // present on negative evidence only
  // hash is deliberately NOT set per fact — D-07
}
```

### Pattern: the plan/approve split, following the `repair` branch

```typescript
// Source: src/cli.ts:587-603 (repair branch — the established shape)
if (!hasFlag(args, "--apply")) {
  print(plan, json, [
    `Project: ${plan.scope.canonicalRoot} (${plan.scope.rootReason})`,
    ...plan.selected.map((p) => `SELECT ${p.packId} — ${p.satisfied.map(describeLeaf).join(", ")}`),
    ...plan.nearMiss.slice(0, 5).map((p) => `${p.packId}: ${describeNearMiss(p)}`),
    `Inputs digest: ${plan.inputsDigest}`,
    `Evidence digest: ${plan.evidenceDigest}`,
    `Plan digest: ${plan.planDigest}`,
    "Preview only. Nothing was written. Pass the plan digest to `project approve --apply`.",
  ].join("\n"), context);
} else {
  // approve revalidates, then writes .alpha-aos/plan.json under one transaction
  const result = await approveProjectPlan({ plan, expectedDigest, session });
  print(result, json, `Approved ${result.packCount} packs. Transaction: ${result.operationId}.`, context);
}
```

Note `project plan` must have **no** `--apply` at all (D-12: it persists nothing). `--apply` belongs to `approve`. Both `plan` and `approve` must be added to the mutating-entry-point list in `test/preview.test.ts` around line 260, where `project isolate init|plan|sync|clean` are already enumerated `[VERIFIED: test/preview.test.ts:260-263]`.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Hardcoded TypeScript pack rules (`src/core/project.ts:36-96`) | YAML-declared predicates over a declared fact vocabulary | This phase (D-05) | Adding or correcting a pack stops requiring a rebuild; the catalog becomes reviewable as data |
| Flat `evidence: string[]` | Versioned fact records with path, polarity, and reason | This phase (DETC-02/03) | Near-miss explanation becomes possible at all |
| `evidence.add(...)` on a `Set`, sorted at exit | Explicit positive *and* negative records for every declared fact | This phase | Absence stops being indistinguishable from "not checked" |
| Skills resolved at plan time | Source hashes pre-pinned in `catalog/stack.lock.json` | This phase (D-08) | `project plan` is fully offline; no npm invocation on a preview path |
| Flat `<name>.md` skill files | `<skill-root>/<name>/SKILL.md` | Already adopted | "`.claude/skills/<name>.md`는 로드되지 않는다. 팩 배포 스크립트가 이 구조를 지키는지 반드시 검증한다" `[CITED: docs/alpha-vibe-stack-claude.md line 156]` — the doc names this the #1 pack-deployment failure cause |

**Deprecated/outdated in this repository:**

- `detectProject` — to be deleted, not extended. Its `ProjectDetection` return type (`{ root, evidence: string[], packs: string[] }`) cannot express DETC-02, DETC-03, or DETC-04, and its Python package names in a `package.json`-only reader are already dead code (F-2 item 4).
- `formatProject(detection)` at `src/format.ts:37` will need replacing alongside it.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `ignore@7.0.5` is the appropriate gitignore matcher | Standard Stack, Don't Hand-Roll | Package identified from training knowledge, not official docs. Mitigated by the `checkpoint:human-verify` and the named fallback (bounded matcher + `undecidable`). If rejected, D-04's fidelity drops for repositories using `!` negation. |
| A2 | The 19 pack-skill hashes in F-1 are the tarball's hashes | F-1 | Read from a *global install*, cross-checked against the three locked values. If the global tree were modified, the 16 unverifiable entries would be wrong. **Mitigated by requiring the fixture-driven regeneration task**; the table is a cross-check, not the source. |
| A3 | `.agents/skills` project-scope discovery works for Codex and Pi | Pattern 6 (adapter support) | Only `.claude/skills/` project scope is documented. Deliberately reported as `unverified`, which is the safe classification — an over-claimed `supported` would be the real failure. |
| A4 | Six detector kinds cover all 29 named facts | Pattern 3 | Derived by enumerating the facts in `catalog/packs/*.yaml`. If a fact needs a seventh kind, the vocabulary schema needs a new `kind` enum value — additive, low cost. |
| A5 | `.alpha-aos/receipts/<packId>.json` is the receipt location | Pattern 9 | No code writes receipts yet (Phase 3 does). Phase 2 must declare it, so this is a decision, not an observation. If Phase 3 disagrees, `STALE` breaks. Flag for confirmation. |
| A6 | Reading git `HEAD` from the filesystem is sufficient for D-15's branch context | Pattern 9 | Packed-refs and detached-HEAD cases need handling. If the parse fails, report the context as unavailable rather than guessing — it is context only and never enters a digest. |
| A7 | A near-miss bound of 5 is right | Pattern 5 | A pure UX judgement, flagged in CONTEXT as Claude's discretion. Trivially adjustable. |

---

## Open Questions (RESOLVED)

All four questions were settled during phase planning on 2026-09-07 and each recommendation was adopted
by a named plan. Nothing below is still open; no question was deleted.

1. **Does `alpha-aos project plan` at a repository root evaluate every sub-project eagerly?** — **(RESOLVED — adopted in `02-05`, Task 3)**
   - What we know: D-01 says running from a repository root "lists the sub-projects found and their per-project pack decisions."
   - What's unclear: In a 40-package monorepo this means 40 full evidence collections on every invocation.
   - Recommendation: Evaluate all, but share one `inputsDigest` cache keyed by file path across sub-projects — the same `package.json` at the root is read once. Add a `--project <rel>` fast path that skips sibling evaluation. Measure before optimising further.
   - **Resolution:** recommendation adopted verbatim. `02-05` Task 3 evaluates every discovered sub-project, shares ONE read cache keyed by canonical path so a root `package.json` read by three members is read once, enforces `MAX_SUB_PROJECTS` (recommended 64) so a pathological monorepo reports a bound rather than running unbounded, and makes `--project <rel>` the fast path that skips sibling evaluation. The plan states explicitly that no further optimisation happens without a measurement.

2. **Does the unreadable-evidence case report `STALE` or `UNDECIDABLE`?** (CONTEXT flags this as Claude's discretion.) — **(RESOLVED — `UNDECIDABLE`, not `STALE`; adopted in `02-06` and `02-10`)**
   - What we know: Phase 1 D-01 fails closed when safety is unprovable; 01-19 established that "not existing and not being readable are different facts — ENOENT continues the ancestor walk, every other errno becomes an unprovable-filesystem refusal carrying a reason" `[VERIFIED: STATE.md 01-19 decision, verbatim]`.
   - What's unclear: `STALE` is a report, not a mutation, which weakens the fail-closed argument.
   - Recommendation: `UNDECIDABLE`, with the errno and path in the reason. The 01-19 precedent is directly on point and already implemented one layer down; reusing its distinction costs nothing and keeps one story about unreadable paths. `STALE` should mean "the evidence is gone", and an EACCES does not establish that.
   - **Resolution:** recommendation adopted. The answer is `UNDECIDABLE` at BOTH layers, and it is a `must_haves` truth in each rather than only prose: `02-06` — "An evidence file that exists but cannot be read reports `UNDECIDABLE` carrying the errno and path, never `STALE` and never a silent absence"; `02-10` — "An installed pack whose evidence file exists but cannot be read reports `UNDECIDABLE` carrying the errno and path, never `STALE`." `02-10` additionally makes it a prohibition, because an unreadable file wrongly classified `STALE` would motivate a removal plan.

3. **How narrow should `deploy-workflow`'s content match be?** — **(RESOLVED — declared vocabulary in `catalog/facts.yaml`, seeded conservatively; adopted in `02-02`, Task 1)**
   - What we know: the doc requires "**실제** deploy/release/publish workflow", not just the presence of `.github/workflows/`.
   - What's unclear: whether matching job names, `on: release`, or specific action names is the right vocabulary.
   - Recommendation: declare the vocabulary in `catalog/facts.yaml` so it is reviewable and correctable without a rebuild, seed it conservatively (`on:\s+release`, `environment:`, known deploy actions), and let the near-miss line say which one was looked for. Treat a false negative as acceptable and a false positive as not.
   - **Resolution:** recommendation adopted verbatim. `02-02` Task 1 declares `deploy-workflow` and `release-workflow` as `kind: fileContent` over `files: [.github/workflows]`, seeded conservatively with a release trigger, a declared deployment environment, and a small named set of well-known deploy action names — with the stated rule that a false negative is acceptable and a false positive is not. Every pattern lives in the repository-owned YAML and is never read from the scanned project (that is also the ReDoS boundary, `T-02-05`), so narrowing or widening it later needs no rebuild.

4. **Does `catalog/facts.yaml` belong in the release allowlist?** — **(RESOLVED — yes, automatically; REL-05 recorded as a Phase 7 note in `02-04` and `02-10`)**
   - What we know: `package.json` `files` includes `"catalog/"` `[VERIFIED: package.json files array]`, so a new file under `catalog/` ships automatically.
   - What's unclear: nothing blocking, but STATE.md records an open REL-05 concern that `catalog/candidate.lock.json` is currently included by `npm pack`. Adding files under `catalog/` interacts with that.
   - Recommendation: note it for Phase 7; do not attempt the allowlist fix here.
   - **Resolution:** recommendation adopted. `package.json` `files` already includes `"catalog/"`, so `catalog/facts.yaml` ships with `npm pack` without any allowlist edit. The interacting REL-05 concern (`catalog/candidate.lock.json` currently included by `npm pack`) is recorded as a Phase 7 note in `02-04` §Flagged planner note and again in `02-10` §Phase-close note, and no plan in this phase edits the candidate lock — `02-04` Task 2 makes that a prohibition and gates it with `git diff --stat -- catalog/candidate.lock.json`.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Everything | ✓ | v24.13.1 (`>=24.0.0` required) | — |
| npm | Lock pinning (maintainer script only) | ✓ | 11.8.0 (`>=10.0.0` required) | — |
| Git | Boundary fixtures; **not** on the product's plan path | ✓ | 2.55.0.windows.3 | Boundary detection is filesystem-only by design |
| `ecc-universal@2.2.0` | Source of all 19 pack skills | ✓ | 2.2.0 (global install) | Fixture re-acquires via `npm pack` with integrity check |
| `yaml`, `smol-toml`, `jsonc-parser`, `ajv` | Manifest and catalog parsing | ✓ | in `node_modules/` | — |
| `ignore` | D-04 ignore semantics | ✗ | — | Bounded in-house matcher reporting `undecidable` on `!`/`**` |
| Network | **Must not be needed** (D-08) | n/a | — | Plan and approve are offline by contract |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** `ignore` — see §Standard Stack alternatives. The fallback is viable but degrades D-04 fidelity for repositories using gitignore negation.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | `node:test` + `node:assert/strict` (Node 24 built-in), no mocking framework |
| Config file | none — `scripts/run-tests.mjs` is the runner; `tsconfig.json` compiles `test/**/*.ts` to `dist/test/` |
| Quick run command | `npm run build && node scripts/run-tests.mjs --files dist/test/project.test.js dist/test/evidence.test.js dist/test/pack-catalog.test.js` |
| Full suite command | `npm test` (= `npm run build && node scripts/run-tests.mjs`) |

**Runner contract the plan must respect:** `--files` is terminal — "flags before, paths after, order preserved; a named-but-unbuilt path is a loud failure naming every missing path" `[VERIFIED: STATE.md 01-25 decision, verbatim]`. Do not use a shell glob; a glob that expands to nothing exits 0.

**Verified current baseline, run this session:**

```text
ℹ tests 208
ℹ pass 203
ℹ fail 0
ℹ skipped 5
ℹ duration_ms 135295.0462
```

`[VERIFIED: `npm test` executed 2026-09-07 on the Windows developer host]` — matching STATE.md's recorded 208-test baseline and the noted "developer host skips FIVE" divergence from windows-latest's four. **Any Phase 2 plan must raise its baseline above 208, never restate 202 or 200.**

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DETC-01 | Canonical root selected with a recorded reason; symlink alias yields the same `projectId` | unit | `node scripts/run-tests.mjs --files dist/test/evidence.test.js` | ❌ Wave 0 |
| DETC-01 | Scan stops at a nested `.git` **directory** | unit (real fixture) | same | ❌ Wave 0 |
| DETC-01 | Scan stops at a linked-worktree `.git` **file** | unit (real fixture, `git worktree add`) | same | ❌ Wave 0 |
| DETC-01 | Scan stops at a submodule `.git` **file** and at `.gitmodules`-declared paths | unit (real fixture) | same | ❌ Wave 0 |
| DETC-01 | A symlink inside the repo pointing outside is refused, not followed | unit | same | ❌ Wave 0 |
| DETC-02 | Every selected pack's evidence carries `path` and, for dependencies, `version` | unit | `--files dist/test/project.test.js` | ⚠️ extend existing |
| DETC-02 | Dependency facts resolve from `pyproject.toml`, `go.mod`, `Cargo.toml`, not only `package.json` | unit | same | ❌ Wave 0 |
| DETC-02 | A `.gitignore`d evidence file is not counted; an uncommitted one is | unit | `--files dist/test/evidence.test.js` | ❌ Wave 0 |
| DETC-03 | `AGENTS.md` alone does not select `AGENT_RUNTIME` | unit | `--files dist/test/project.test.js` | ✅ exists (`test/project.test.ts:22`) |
| DETC-03 | The `AGENT_RUNTIME` near-miss line names both the satisfied and the failed leaf | unit | same | ❌ Wave 0 |
| DETC-03 | Near-miss list is capped and deterministically ordered | unit | `--files dist/test/project-plan.test.js` | ❌ Wave 0 |
| DETC-03 | A pack referencing an undeclared fact is refused at load, not silently unselectable | unit | `--files dist/test/pack-catalog.test.js` | ❌ Wave 0 |
| DETC-04 | `plan` twice on an unchanged repository is byte-identical (text **and** JSON) | unit | `--files dist/test/project-plan.test.js` | ❌ Wave 0 |
| DETC-04 | Plan carries all nine DETC-04 nouns as named fields | unit | same | ❌ Wave 0 |
| DETC-04 | `plan` writes nothing (D-12) — covered by the SAFE-01 tracer | integration | `--files dist/test/preview.test.js` | ⚠️ extend list at `test/preview.test.ts:260` |
| DETC-05 | `approve` refuses a stale digest after evidence changes | unit | `--files dist/test/project-plan.test.js` | ❌ Wave 0 |
| DETC-05 | `approve` refuses after a target file's bytes change | unit | same | ❌ Wave 0 |
| DETC-05 | Refusal distinguishes "inputs changed, selection identical" from "selection changed" (D-13) | unit | same | ❌ Wave 0 |
| DETC-06 | Removing a dependency yields `STALE` naming the fact, and deletes nothing | unit | same | ❌ Wave 0 |
| DETC-06 | A branch switch that removes evidence yields `STALE` plus the branch-differs note (D-15) | unit (real git fixture) | same | ❌ Wave 0 |
| D-08 | Every skill named by `catalog/packs/*.yaml` has a `sourceSha256` in `catalog/stack.lock.json` | unit | `--files dist/test/catalog.test.js` | ❌ Wave 0 |
| Anti-regression | `planEccSkillSync` still produces exactly 3 entries after the lock grows | unit | `--files dist/test/ecc-skills.test.js` | ⚠️ extend existing |

### Sampling Rate

- **Per task commit:** `npm run check` (tsc --noEmit) plus the narrowest `--files` set touching the changed module
- **Per wave merge:** `npm test` — full 208+ suite, `fail 0`
- **Phase gate:** full suite green on all three CI legs in **one run id** before `/gsd-verify-work`, per the closing-evidence rule 01-23/01-26/01-27 established

### Wave 0 Gaps

- [ ] `test/evidence.test.ts` — canonical root, boundary stop (4 git cases), ignore list, detector kinds — covers DETC-01, DETC-02
- [ ] `test/pack-catalog.test.ts` — strict pack/fact loading, duplicate-id refusal, undeclared-fact refusal, `lifecycle`/`selectionPolicy` round-trip — covers DETC-03, F-3
- [ ] `test/project-plan.test.ts` — evaluation, near-miss, digests, byte-stability, approve/refuse, STALE — covers DETC-03, DETC-04, DETC-05, DETC-06
- [ ] `test/helpers/git-fixture.ts` — shared builders for `git init`, `git worktree add`, `git submodule add`, and a nested `git init`, since four tests need all four shapes
- [ ] Extend `test/preview.test.ts` mutating-entry-point list (`:260`) with `project plan` and `project approve`
- [ ] Extend `test/catalog.test.ts` with the lock↔pack-skill coverage assertion
- Framework install: **none** — `node:test` is built in

---

## Security Domain

### Applicable ASVS Categories (level 1)

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No authentication surface; harness auth stays user-managed (REQUIREMENTS.md Out of Scope) |
| V3 Session Management | no | No sessions; `MutationSession` is a writer lock, not an auth session |
| V4 Access Control | yes | `provePathBoundary` with `allowedRoots: [canonicalRoot]` for reads and `[join(root, ".alpha-aos")]` for writes; D-10's boundary ("never writes to project source, `package.json`, tests, or build configuration") must be an enforced allowed-root, not a convention |
| V5 Input Validation | **yes — primary** | `validateManagedDocument` for every managed document; bounded byte reads for every untrusted repository file; `parseStrictJson` duplicate-key rejection; depth/count bounds on the walk |
| V6 Cryptography | yes | `node:crypto` sha256 only, via the existing `reviewedDigest` helper. Never hand-roll; never introduce a non-cryptographic hash for "speed" on a value that gates apply |
| V7 Error Handling & Logging | yes | Stable coded issues via `ValidationIssue`; `actualShape` never carries the value — "The value itself never appears, because untrusted input may be a secret" `[VERIFIED: src/core/validation.ts:38-40 comment, verbatim]` |
| V12 Files & Resources | **yes — primary** | Symlink/junction escape refusal, `(device, inode)` cycle set, per-file byte cap, total-bytes cap, depth cap |
| V14 Configuration | yes | Closed-world schemas; unregistered `x-` extensions preserved and inert |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Malicious `workspaces: ["../../.."]` in a user's `package.json` escapes the canonical root | Elevation of Privilege / Tampering | Boundary-prove every expanded workspace member against `canonicalRoot` **before** reading it; a member outside the root is reported and dropped, never followed |
| Symlink or junction inside the repository pointing at `~/.ssh` or a sibling repository | Information Disclosure | `provePathBoundary` on every read; `(device, inode)` visited set |
| Credential-bearing DSN captured by a `fileContent` detector and written into a committable `.alpha-aos/plan.json` | Information Disclosure | Detector return type carries no text field (Pitfall 7); `redactString` as the second net; D-07 forbids per-fact hashes so there is nothing derived to leak either |
| ReDoS via a hostile `.gitignore` or a hostile `fileContent` pattern | Denial of Service | Pattern vocabulary is declared in `catalog/facts.yaml` (repository-owned, reviewed), never taken from the scanned project; cap input length before matching |
| Directory-walk exhaustion (deep nesting, symlink cycle, millions of entries) | Denial of Service | Depth bound, entry-count bound, visited-inode set. Mirror the existing discipline: "Bounds on any recursive walk. A diagnostic value can be arbitrarily large, cyclic, or hostile, so every traversal terminates on structure rather than on trust" `[VERIFIED: src/core/redaction.ts:6-15 comment, verbatim]` |
| Prototype pollution via `__proto__` in a scanned `package.json` | Tampering | Read dependency names via `Object.keys` on a null-prototype object; never spread untrusted parsed objects into a config object |
| YAML billion-laughs / alias expansion in a scanned config | Denial of Service | `validateManagedDocument`'s YAML route already limits aliases (`MAX_ALIAS_COUNT = 100` `[VERIFIED: src/core/validation.ts:76]`); route scanned YAML through it rather than a bare `parse` |
| A malicious repository plants `.alpha-aos/plan.json` claiming packs the evidence does not support | Spoofing / Tampering | `approve` is the only writer, and `status` recomputes evidence rather than trusting the artifact; a plan whose `evidenceDigest` does not match freshly collected evidence is reported `CHANGED`, never honoured |

---

## Sources

### Primary (HIGH confidence)

- **In-repo source, read in full this session:** `src/core/project.ts`, `src/core/ecc-fixture.ts`, `src/core/component-session.ts`, `src/adapters/harnesses.ts`, `catalog/packs/*.yaml` (all 7), `catalog/stack.lock.json`, `catalog/stack.yaml`, `schemas/evidence.schema.json`, `schemas/receipt.schema.json`, `schemas/lock.schema.json`, `schemas/project-stack.schema.json`, `package.json`, `.planning/config.json`
- **In-repo source, read in relevant part:** `src/core/validation.ts` (:1-140, :290-560), `src/core/path-boundary.ts` (:133-152, :245-307), `src/core/isolation.ts` (:120-225), `src/core/ecc-skills.ts` (:1-140), `src/core/transaction.ts` (:105-200), `src/core/paths.ts` (:40-113), `src/core/redaction.ts` (:1-60), `src/cli.ts` (:136-152, :502-640), `test/project.test.ts`, `test/preview.test.ts`, `scripts/run-tests.mjs`
- **Empirical git fixtures** created and inspected this session (ordinary repo / linked worktree / submodule / nested `git init`) — Git 2.55.0.windows.3
- **`sha256sum` over `ecc-universal@2.2.0` skill tree** — 22 skills, three cross-checked against the stable lock
- **`npm test`** executed this session — 208 tests, fail 0
- **`gsd_run query package-legitimacy check --ecosystem npm ignore`**

### Secondary (MEDIUM confidence)

- [npm workspaces](https://docs.npmjs.com/cli/v11/using-npm/workspaces) — `workspaces` field form
- [pnpm-workspace.yaml](https://pnpm.io/pnpm-workspace_yaml) — `packages` key, negated globs
- [Cargo workspaces](https://doc.rust-lang.org/cargo/reference/workspaces.html) — `[workspace] members` / `exclude` / `default-members`, virtual workspaces
- [Go modules reference](https://go.dev/ref/mod) — `go.work` `use` directive; "generally inadvisable to commit `go.work` files"
- [uv workspaces](https://docs.astral.sh/uv/concepts/projects/workspaces/) — `[tool.uv.workspace] members` / `exclude`
- [gitignore(5)](https://git-scm.com/docs/gitignore) — precedence order, negation, "It is not possible to re-include a file if a parent directory of that file is excluded"
- [Claude Code Agent Skills](https://code.claude.com/docs/en/skills) — project vs personal skill roots, personal-overrides-project precedence, parent-directory and nested discovery
- `docs/alpha-vibe-stack-codex.md` §5.1–5.5 and `docs/alpha-vibe-stack-claude.md` §3.1–3.3 — authoritative pack semantics; the two agree on all 15 packs
- `.planning/research/ARCHITECTURE.md` and `.planning/research/PITFALLS.md` — prior project-level research; `SurfaceSupport` vocabulary and Pitfall 2 are reused rather than restated

### Tertiary (LOW confidence)

- `ignore` npm package identity and suitability — training knowledge, registry-confirmed only. Tagged `[ASSUMED]` throughout and gated behind `checkpoint:human-verify`.

---

## Metadata

**Confidence breakdown:**

- Standard stack: **HIGH** — every core library is already a reviewed dependency, read from `package.json` and confirmed in use at named lines. The one new candidate is explicitly `[ASSUMED]` and gated.
- Existing-code integration points: **HIGH** — every claim cites a file and line range read this session, with values quoted verbatim.
- ECC pack-skill availability (F-1): **HIGH** — 19 files hashed directly, with three cross-checked byte-for-byte against the shipped lock.
- Git boundary semantics (Pattern 2): **HIGH** — verified empirically on the target Git version rather than recalled.
- Workspace declarations (F-4): **MEDIUM-HIGH** — official documentation for all five ecosystems, quoted.
- Predicate language shape (Pattern 3): **MEDIUM** — a design recommendation constrained by the existing YAML and the CONTEXT's discretion grant, not an external fact.
- Ignore-list strategy: **MEDIUM** — the requirement is well understood, the mechanism depends on a gate outcome this research cannot decide.
- Pitfalls: **HIGH** — six of eight are grounded in code read this session or in STATE.md's recorded Phase 1 failures; two extend the project's own prior PITFALLS.md.

**Research date:** 2026-09-07
**Valid until:** 2026-10-07 for the in-repo findings (stable until this phase changes them); 2026-09-21 for `ignore` version guidance and the Claude Code skills documentation, both of which move faster.
