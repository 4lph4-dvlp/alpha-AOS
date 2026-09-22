---
phase: 02-evidence-bound-project-planning
plan: 01
subsystem: api
tags: [evidence, pack-catalog, json-schema, ajv, yaml, path-canonicalization, cli, node-test]

# Dependency graph
requires:
  - phase: 01-safe-operation-boundary
    provides: validateManagedDocument closed-world validation, canonicalizeWithMissingTail, reviewedDigest, the print() redaction seam, and the SAFE-01 PREVIEW_INVOCATIONS enumeration
provides:
  - "A canonical project root ladder with a recorded reason and a symlink-stable 16-hex projectId (src/core/evidence.ts)"
  - "An evidence envelope carrying per-fact path and version but no per-fact hash (D-07)"
  - "A strict pack-catalog loader routing catalog/packs/*.yaml through validateManagedDocument (src/core/pack-catalog.ts)"
  - "schemas/pack-catalog.schema.json and the pack-catalog ManagedDocumentKind"
  - "planProjectCapabilities: non-short-circuiting predicate evaluation plus inputs/evidence/plan digests (src/core/project-plan.ts)"
  - "A working, write-free alpha-aos project plan [path] [--json] CLI route"
affects: [02-02, 02-05, 02-06, 02-07, 02-08, 02-09, 02-10, phase-3-capability-materialization]

actuals:
  tokens: 37747
  tasks: 2
  commits: 3
plan_head_before: a2611e5276e0e150f96f15c4750c132338ec537e

tech-stack:
  added: []
  patterns:
    - "Canonical root ladder with a recorded RootReason, feeding an already-canonical value to isolationProjectId"
    - "Aggregate input digest over the read set, distinct from the per-fact record which carries no hash"
    - "Non-short-circuiting predicate evaluation keeping both satisfied and failed leaf lists"
    - "digestableView built as a single object literal that never contains createdAt"

key-files:
  created:
    - src/core/evidence.ts
    - src/core/pack-catalog.ts
    - src/core/project-plan.ts
    - schemas/pack-catalog.schema.json
    - test/project-plan.test.ts
  modified:
    - src/core/path-boundary.ts
    - src/core/validation.ts
    - src/types.ts
    - src/format.ts
    - src/cli.ts
    - test/preview.test.ts

key-decisions:
  - "canonicalizeWithMissingTail is exported rather than the root being routed through provePathBoundary: a project root has no outer allowed root to be proven against, and re-deriving a second canonical form is the 01-19 asymmetry"
  - "The dependency detector reads package.json through the exported parseManagedDocument({format: \"json\"}) route, which IS parseStrictJson, rather than exporting the module-private function a second time"
  - "A pack whose operator has no evaluator yet contributes no evaluation at all and is absent from the plan, rather than being reported silent — claiming 'did not qualify' for something never evaluated would be false"
  - "The negative dependency record is a single dependency:none fact with a reason, replaced by per-declared-fact negatives once catalog/facts.yaml exists in 02-02"

patterns-established:
  - "Root canonicalization: one canonical form, exported and reused — never a second realpath call"
  - "Boundary detection: existsSync(join(dir, '.git')), never statSync(...).isDirectory()"
  - "Digest construction: one literal, sorted arrays, no timestamp and no git ref"

requirements-completed: [DETC-01, DETC-02, DETC-04]

coverage:
  - id: D1
    description: "`alpha-aos project plan <dir>` on a directory declaring `react` prints a WEB_REACT selection, the package.json path that selected it, and three digests, in one invocation"
    requirement: DETC-04
    verification:
      - kind: e2e
        ref: "test/project-plan.test.ts#project plan selects WEB_REACT and names the path and digests that decided it"
        status: pass
    human_judgment: false
  - id: D2
    description: "The same invocation with --json emits the same decision as a redacted JSON envelope through the existing print() seam, and no fact carries a hash property (D-07)"
    requirement: DETC-02
    verification:
      - kind: e2e
        ref: "test/project-plan.test.ts#project plan --json emits the same decision as a redacted JSON envelope"
        status: pass
    human_judgment: false
  - id: D3
    description: "Two concurrent `project plan` invocations against the same repository both complete and produce byte-identical output; the run opens no writer lock and creates no temporary file"
    requirement: DETC-02
    verification:
      - kind: e2e
        ref: "test/project-plan.test.ts#two concurrent project plan invocations are byte-identical"
        status: pass
      - kind: e2e
        ref: "test/preview.test.ts#every mutating CLI preview leaves all five mutation surfaces byte-identical"
        status: pass
      - kind: e2e
        ref: "test/preview.test.ts#a preview never creates the managed state root or a writer lock"
        status: pass
    human_judgment: false
  - id: D4
    description: "The canonical root and the 16-hex projectId are identical whether the repository is addressed directly or through a symlinked alias"
    requirement: DETC-01
    verification:
      - kind: e2e
        ref: "test/project-plan.test.ts#a symlinked alias of the same repository yields the same canonical root and project id"
        status: pass
    human_judgment: false
  - id: D5
    description: "catalog/packs/web.yaml loads through validateManagedDocument against the on-disk schemas/pack-catalog.schema.json, not a bare yaml parse"
    verification:
      - kind: integration
        ref: "grep -c validateManagedDocument src/core/pack-catalog.ts (returns 2)"
        status: pass
      - kind: unit
        ref: "test/validation.test.ts#every managed document kind carries a case in every validation class"
        status: pass
    human_judgment: false
  - id: D6
    description: "`alpha-aos project plan` is registered in the SAFE-01 mutating-entry-point enumeration, so D-12's 'previews and persists nothing' is enforced rather than claimed"
    verification:
      - kind: e2e
        ref: "test/preview.test.ts#every mutating CLI preview leaves all five mutation surfaces byte-identical"
        status: pass
    human_judgment: false

# Metrics
duration: 18 min
completed: 2026-09-07
status: complete
---

# Phase 2 Plan 01: End-to-end tracer — one repository selects one pack Summary

**One repository directory declaring `react` produces a YAML-declared `WEB_REACT` selection with its selecting `package.json` path and three digests, in text and JSON, through the built CLI — with a canonical root that survives symlink aliasing and a run that writes nothing.**

## Performance

- **Duration:** 18 min
- **Started:** 2026-09-07T13:13:18Z
- **Completed:** 2026-09-07T13:31:35Z
- **Tasks:** 2
- **Files modified:** 11 (5 created, 6 modified)

## Accomplishments

- **The whole Phase 2 seam is proven on one path.** `cli.ts` → `project-plan.ts` → `evidence.ts` + `pack-catalog.ts` → `path-boundary.ts` / `isolation.ts` / `validation.ts` all connect and produce a reviewable value. Every later plan in this phase now widens a layer of a shape that already works rather than guessing at one.
- **`canonicalizeWithMissingTail` is now the one canonical form for a project root too.** It was module-private; exporting it (body untouched, ENOENT-continues split intact) is the explicit resolution of the CONTEXT premise that named it a reusable asset, and it is what makes the symlink-alias case pass instead of producing two ids for one repository.
- **`catalog/packs/*.yaml` is authoritative rather than decorative.** `pack-catalog` joined `ManagedDocumentKind`, `schemas/pack-catalog.schema.json` closes the shape all seven pack files already use (including `lifecycle` and `selectionPolicy`, which a closed-world schema would otherwise use to reject alpha-AOS's own catalog), and the loader mirrors `loadCatalogStrict` exactly.
- **The plan is stable by construction, not by luck.** `digestableView` is one object literal that never contains `createdAt`; every array is sorted before it enters a digest. Two concurrent invocations produce byte-identical stdout.
- **`project plan` is inside the SAFE-01 net.** The preview tracer now exercises it and proves the checkout, package/global-link sentinels, native configuration, managed state root and every harness resource root stay byte-identical across the invocation.

## Task Commits

1. **Task 1: End-to-end "one repository selects one pack"** — `91d6e58` (feat)
2. **Task 2: Register `project plan` in the SAFE-01 enumeration** — `8c6e2a5` (test)

**Plan metadata:** the `docs(02-01): complete end-to-end pack-selection tracer plan` commit carrying this file. `commits: 3` in the frontmatter is `git rev-list --count a2611e5..HEAD` measured after that commit landed, so it uses the same instrument `/gsd-verify-work` will.

## Files Created/Modified

- `src/core/evidence.ts` — `RootReason` / `CanonicalRoot`, `resolveCanonicalRoot` (two rungs: `.git` entry of either kind → `git-root`, else `standalone-directory`), and `collectProjectEvidence` with one `dependency` detector reading `package.json` through the duplicate-key-rejecting route.
- `src/core/pack-catalog.ts` — `loadPackCatalogStrict`, mirroring `loadCatalogStrict`: schema cached from disk, `validateManagedDocument`, `ManagedDocumentError` + `createMigrationPlan` on refusal.
- `src/core/project-plan.ts` — `planProjectCapabilities`: canonical root → evidence → catalog → non-short-circuiting evaluation → `inputsDigest` / `evidenceDigest` / `planDigest`.
- `schemas/pack-catalog.schema.json` — closed contract for a pack file; five operators, `id` / `evidence` required, `skills` / `lifecycle` / `selectionPolicy` optional.
- `src/core/path-boundary.ts` — `canonicalizeWithMissingTail` exported; body, errno split and every call site unchanged.
- `src/core/validation.ts` — `"pack-catalog"` added to `ManagedDocumentKind`, `OWNED_SUBTREE` (`null`) and `CORE_SCHEMAS`.
- `src/types.ts` — `EvidenceFact`, `EvidenceEnvelope`, `PackEvidenceNode`, `PackDeclaration`, `PackCatalog`, `LeafResult`, `PackEvaluation`, `ProjectCapabilityPlan`. `ProjectDetection` left in place for 02-06.
- `src/format.ts` — `formatProjectPlan` beside `formatProject`.
- `src/cli.ts` — the `plan` route, through `print(plan, json, formatProjectPlan(plan), observableContext())`. No `--apply`.
- `test/project-plan.test.ts` — four cases: text, JSON + no-per-fact-hash, concurrency, symlink alias.
- `test/preview.test.ts` — one `PREVIEW_INVOCATIONS` entry.

## Decisions Made

1. **`canonicalizeWithMissingTail` exported rather than the root routed through `provePathBoundary`.** A canonical project root has no outer allowed root to be proven against, so `provePathBoundary` cannot express it; deriving a second canonical form for it is exactly the 01-19 asymmetry. The plan called this out and it held on contact.
2. **`parseManagedDocument({ format: "json" })` instead of exporting `parseStrictJson`.** The plan named `parseStrictJson`, which is module-private in `validation.ts`. `parseManagedDocument` is its already-exported wrapper and delegates to it directly for `format: "json"`, so the duplicate-key refusal the plan asked for is obtained without widening the module's public surface.
3. **A pack whose operator has no evaluator yet is absent from the plan value, not reported `silent`.** Research Pitfall 8 is explicit that a pack which silently never matches is indistinguishable from one whose evidence is genuinely absent. `evaluatePack` returns `null` for such packs so nothing false is claimed; `unimplemented` as a first-class status belongs to 02-07.
4. **The negative dependency record is one `dependency:none` fact carrying a reason.** With no declared fact vocabulary yet there is no per-fact negative to emit, but absence still had to be recorded rather than omitted. 02-02 replaces it with one negative record per declared fact.
5. **`RootReason` is declared in `evidence.ts` and imported type-only by `types.ts`.** Both directions are type-only and erased at compile, so there is no runtime cycle, and the reason vocabulary stays beside the ladder that produces it rather than being duplicated.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `parseStrictJson` is not exported from `src/core/validation.ts`**

- **Found during:** Task 1 (step 2, the dependency detector)
- **Issue:** The plan directed the detector to read `package.json` "through `parseStrictJson` from `src/core/validation.ts` (never `JSON.parse`)". `parseStrictJson` is declared `function parseStrictJson(...)` at `src/core/validation.ts:127` and is not in the module's export list, so the import would not compile.
- **Fix:** Used the exported `parseManagedDocument({ text, format: "json" })`, whose body dispatches to `parseStrictJson` for JSON. The duplicate-key refusal the plan asked for is obtained unchanged, and `validation.ts`'s public surface is not widened for a single caller.
- **Files modified:** `src/core/evidence.ts` (no change to `validation.ts` beyond the planned `pack-catalog` registration)
- **Verification:** `npm run check` exits 0; the JSON case in `test/project-plan.test.ts` reads a real `package.json` through this route and produces the expected facts.
- **Committed in:** `91d6e58` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** None on behaviour. The substitution preserves the plan's stated intent (duplicate keys are a refusal, not a coin flip) and avoids adding a second public export to a Phase 1 module for one consumer. No scope creep.

## Known Stubs

| Stub | File | Reason it is intentional | Resolved by |
|------|------|--------------------------|-------------|
| `evaluatePack` implements only the `anyDependencies` operator; the 12 packs declared with `all` / `any` / `anyFiles` / `manifestOptIn` contribute no evaluation | `src/core/project-plan.ts` | Tracer scope stated in the plan objective. Nothing false is claimed — such a pack is absent from the plan rather than reported `silent` — but a user cannot yet distinguish "not evaluated" from "did not qualify". | 02-02 (fact vocabulary + remaining operators), 02-07 (near-miss / `unimplemented` statuses) |
| `collectProjectEvidence` runs one `dependency` detector over `package.json` only | `src/core/evidence.ts` | Tracer scope. The other five detector kinds (`file`, `directory`, `manifestKey`, `fileAbsent`, `fileContent`) and the non-npm manifest readers are the next layer. | 02-02, 02-06 |
| `loadPackCatalogStrict` defaults to `["catalog/packs/web.yaml"]`; no cross-file duplicate-id refusal | `src/core/pack-catalog.ts` | The plan explicitly assigns the seven-file merge and its duplicate-id refusal to the next plan; building half of it here would be the second mechanism that merge is meant to avoid. | 02-02 |
| `resolveCanonicalRoot` implements two of six `RootReason` rungs | `src/core/evidence.ts` | Tracer scope. `worktree-root`, `submodule-root` and `project-declaration` need the boundary walk and workspace-declaration reader. | 02-05, 02-06 |

The first row is recorded in `.planning/WINDOWS.md` as an open `stub` for phase 02, so it is visible at ship time rather than only here.

## Threat Flags

None. The three files this plan reads — the scanned repository's `package.json`, `catalog/packs/web.yaml`, and alpha-AOS's own `package.json` for the producer version — are covered by the plan's declared register (T-02-06, T-02-08) or cross no trust boundary. No network endpoint, auth path, or schema at a trust boundary was introduced beyond the declared `pack-catalog` contract, whose closed-world refusal is T-02-08's stated mitigation.

Threat-register mitigations applied and evidenced:

- **T-02-01 (Information Disclosure):** the root travels through the single exported `canonicalizeWithMissingTail`; proven by the symlink-alias case.
- **T-02-06 (Tampering):** `package.json` is parsed through the duplicate-key-rejecting route and names are read with `Object.keys` over a null-prototype copy; the parsed value is never spread into a live object.
- **T-02-08 (Spoofing):** `loadPackCatalogStrict` throws `ManagedDocumentError` on a not-ok or null result rather than partially applying whatever parsed.
- **T-02-10 (Information Disclosure):** the `plan` route calls `print(value, json, formatted, observableContext())`; it contains no `process.stdout.write`.
- **T-02-11 (Tampering):** `project plan` is in `PREVIEW_INVOCATIONS`.

## Issues Encountered

None beyond the deviation above.

## Verification Results

| Check | Result |
|-------|--------|
| `npm run check` | exits 0, no TypeScript error |
| `npm run build` | exits 0 |
| `npm run build:check` | `build artifact verified: 60 inputs, 114 outputs` |
| `node --test dist/test/project-plan.test.js` | `tests 4, pass 4, fail 0` |
| `node --test dist/test/preview.test.js` | `tests 11, pass 11, fail 0` |
| `node scripts/run-tests.mjs` (full suite) | `tests 212, pass 207, fail 0, skipped 5` — above the 208 phase-start baseline |
| `node dist/src/cli.js project plan . --json` | exits 0, parses, `scope.projectId` = `b33de7edb6d8ad07`, `scope.rootReason` = `git-root` |
| `grep -c "export async function canonicalizeWithMissingTail" src/core/path-boundary.ts` | `1` |
| `grep -c "isolationProjectId" src/core/evidence.ts` | `6` |
| `grep -c "validateManagedDocument" src/core/pack-catalog.ts` | `2` |
| `git diff --stat -- src/core/isolation.ts` | empty — the function naming existing runtime roots was not touched |
| `--apply` inside the `plan` route | absent; the route contains no `hasFlag(args, "--apply")` |

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **Ready for 02-02.** The seam is fixed: `EvidenceEnvelope`, `PackCatalog` and `ProjectCapabilityPlan` are declared, the `pack-catalog` document kind is registered, and the loader shape is in place. 02-02 adds `catalog/facts.yaml`, the fact-vocabulary schema, the remaining operators, and the seven-file merge with cross-file duplicate-id refusal against a contract that already compiles and runs.
- **Ready for 02-05 / 02-06.** `RootReason` declares all six rungs; the two unimplemented detector paths are the only additions the boundary walk needs.
- **One carried risk.** Until 02-02 and 02-07 land, `project plan` reports on 3 of 15 declared packs and says nothing about the other 12. That is recorded in `.planning/WINDOWS.md` (phase 02, kind `stub`) rather than left to memory.

## Self-Check: PASSED

All five created files verified present on disk (`schemas/pack-catalog.schema.json`, `src/core/evidence.ts`, `src/core/pack-catalog.ts`, `src/core/project-plan.ts`, `test/project-plan.test.ts`). Both task commits verified in `git log`: `91d6e58`, `8c6e2a5`. Commit count measured from `plan_head_before` (`a2611e5`) with `git rev-list --count`: 3 (two task commits plus this metadata commit).

---
*Phase: 02-evidence-bound-project-planning*
*Completed: 2026-09-07*
