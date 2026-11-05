# Phase 28 Plan 04 Summary: Evidence-Backed Simple Operations, Narrow Clarification, and WIP-Preserving Escalation

**Executed:** 2026-11-02
**Status:** Completed
**Requirements fulfilled:** ENTRY-04, ENTRY-05, ENTRY-02, ENTRY-03, ENTRY-06; Decisions D-13, D-14, D-15, D-16, D-17, D-18

## What was built

1. **Simple-Operation Evidence Collector (`src/core/task-intake-evidence.ts`)**:
   - `collectTaskIntakeEvidence`: Read-only, mechanical inspection service evaluating candidate bounded operations against root containment, filesystem existence, Git references, and boundedness caps.
   - Zero-write & zero-push boundary: Intake performs only read-only Git calls (`rev-parse`) and filesystem stats. It never pushes, fetches, renames files, or contacts external networks. Actual execution authority remains strictly downstream (`executionAuthorized: false`).
   - Resource inspection limits: Enforces a strict budget of at most 16 explicitly scoped paths and 64 KiB total text inspected. Cap exhaustion or incomplete impact becomes unknown/substantial-work, never an inferred simple exemption.
   - Canonical root proof: Every path is validated via `provePathBoundary` against `canonicalRoot` before access. Escapes or unprovable paths reject simple exemption.

2. **Positive Operations & Same-Name Complex Twins Matrix (ENTRY-04, D-13, D-14)**:
   - **Normal Bounded Push**:
     - *Positive Evidence*: Explicit remote (e.g. `origin`), explicit branch/local ref (e.g. `main`), normal non-force intent, and local ref verified in Git via `runGitRead(canonicalRoot, ["rev-parse", "--verify", ref])`. Skips chooser and bootstrap request (`kind: "simple-operation"`, `nextAction: "execute-simple"`).
     - *Same-name Complex Twin*: Force push (`--force`, `-f`), deletion (`--delete`), mirror (`--mirror`), history rewrite (`rebase`, `amend`), or conflict resolution. Refuses exemption and routes to substantial intake (`kind: "substantial-work"`).
   - **Local File Rename**:
     - *Positive Evidence*: Exact root-contained `oldPath` and `newPath`, verified source file on filesystem, explicit `unchangedApiMeaning: true`, scoped references bounded within 16 files and 64 KiB text. Skips chooser (`kind: "simple-operation"`, `nextAction: "execute-simple"`).
     - *Same-name Complex Twin*: Public API changes, schema alterations, or cross-subsystem breaks (`unchangedApiMeaning: false`). Refuses exemption and routes to substantial work.
   - **README Translation / Linking**:
     - *Positive Evidence (Translation)*: Source `README.md` verified in canonical root, target in canonical root, faithful translation intent (`faithful: true`, no redesign/new feature scope), bounded text <= 64 KiB. Skips chooser (`kind: "simple-operation"`).
     - *Positive Evidence (Linking)*: Source `README.md` and target linked document (e.g. `docs/arch.md`) verified to exist within canonical root. Skips chooser (`kind: "simple-operation"`).
     - *Same-name Complex Twin*: Structural redesign, architecture reorganization, or new feature scope (`redesign: true` or `newFeatureScope: true`). Refuses exemption and routes to substantial work.

3. **Narrow Clarification for Missing Scope (ENTRY-05, D-15)**:
   - Maps missing target/result/impact to bounded `missingFacts` and exactly one discriminating question (e.g., `"어느 원격 저장소와 브랜치로 push할 예정인가요?"` or `"파일명만 변경하나요, 아니면 공개 API/인터페이스도 변경하나요?"`).
   - Known substantial work proceeds directly to strict choose-style or flexible adaptive intake without redundant scope interrogation.
   - Explicit style requests (e.g. `대화형-quick-full`) continue to outrank simple-operation exemptions (ENTRY-02, D-02).

4. **Scope-Change Handling & WIP Preservation (ENTRY-04, ENTRY-05, D-16)**:
   - Evaluates `scopeChange` input before general task continuation:
     - **Expanded Scope / Investigation Needed**: Stops before expanded work, preserves every dirty WIP byte (`wipBytesPreserved: true`), and reclassifies to substantial work (`kind: "substantial-work"` with 6-style chooser in strict mode, or adaptive intake in flexible mode).
     - **Active Task Repair**: If marked as a repair of an active task (`isTaskRepair: true`), retains the verified task's style (`kind: "continuation"`, `nextAction: "continue-task"`), preserving dirty WIP without inheriting new execution effects or expanding authority.

5. **Schema Synchronization (`schemas/task-intake.schema.json`)**:
   - Extended `operation` object properties (`remote`, `branch`, `localRef`, `force`, `delete`, `mirror`, `historyRewrite`, `conflictResolution`, `oldPath`, `newPath`, `unchangedApiMeaning`, `sourcePath`, `targetLink`, `scopedPaths`, `faithful`, `redesign`, `newFeatureScope`).
   - Added closed `scopeChange` object (`previousOperationId`, `expandedScope`, `requiresInvestigation`, `wipBytesPreserved`, `isTaskRepair`, `reason`).

6. **Test Suites (`test/task-intake-evidence.test.ts`)**:
   - 12 comprehensive unit tests covering:
     - Push positive vs force push vs missing target clarification.
     - Local rename positive vs public API rename twin vs ambiguous API impact clarification vs disk preservation.
     - README translation positive vs redesign twin.
     - README link positive vs nonexistent target clarification.
     - Scope expansion with WIP preservation.
     - Active task repair retaining style with WIP preservation.
     - Explicit style outranking simple exemption.

## Actual Evidence Matrix

| Operation | Candidate Inputs | Verification Mechanism | Outcome Classification | Observed Reasons / Actions |
|---|---|---|---|---|
| **Push** (Simple) | `remote: "origin"`, `branch: "main"` | Git `rev-parse --verify main` in canonical root | `simple-operation` | Skips chooser; `nextAction: "execute-simple"`; push authority not granted |
| **Push** (Complex Twin) | `force: true` or `--force` | Explicit flag / keyword scan | `substantial-work` | Refuses exemption; strict 6-style chooser or flexible adaptive intake |
| **Push** (Missing Info) | `remote` or `branch` missing | Input inspection | `clarification-needed` | `missingFacts: ["remote", "branch"]`; asks target question |
| **Push** (Invalid Ref) | Nonexistent branch `foo` | Git `rev-parse` throws | `clarification-needed` | `missingFacts: ["local-ref"]`; asks valid local ref question |
| **Rename** (Simple) | `oldPath`, `newPath`, `unchangedApiMeaning: true` | `provePathBoundary`, `lstat`, <=16 files, <=64 KiB | `simple-operation` | Skips chooser; leaves files untouched on disk |
| **Rename** (Complex Twin) | `unchangedApiMeaning: false` | Explicit flag / keyword scan | `substantial-work` | Public API / schema changes require substantial task intake |
| **Rename** (Ambiguous) | `unchangedApiMeaning: undefined` | Ambiguity detection | `clarification-needed` | `missingFacts: ["api-impact"]`; asks filename vs API question |
| **Rename** (Missing Source)| Missing `oldPath` or `ENOENT` | Filesystem check | `clarification-needed` | `missingFacts: ["old-path"]` / `["old-path-exists"]` |
| **README** (Simple Translation) | `README.md` -> `README.ko.md`, `faithful: true` | `provePathBoundary`, `stat`, <=64 KiB | `simple-operation` | Skips chooser; target/result/impact bounded and verified |
| **README** (Simple Link) | `README.md` + `docs/arch.md` | `provePathBoundary`, `stat`, <=64 KiB | `simple-operation` | Skips chooser; doc link verified in canonical root |
| **README** (Complex Twin) | `redesign: true` or `newFeatureScope: true` | Explicit flag / keyword scan | `substantial-work` | Redesign requires substantial task intake |
| **Scope Expansion** | `expandedScope: true`, `isTaskRepair: false` | Scope change inspection | `substantial-work` | Stops before expansion; preserves dirty WIP bytes |
| **Task Repair** | `isTaskRepair: true`, `currentTask.selectedStyle` | Active task binding check | `continuation` | Retains verified style; preserves dirty WIP |

## Unresolved Semantic Cases (Flagged Assumption ENTRY-04)

- **Arbitrary Operation Classification**: As noted in ENTRY-04 and the spec-less edge probe, natural language input alone cannot mechanically prove arbitrary operation simplicity across unseen verbs. Only the closed, explicit positive operations (`push`, `rename`, `readme-translation`, `readme-link`) are eligible for simple-operation exemption via observed mechanical evidence.
- **Unscoped Broad File Modifications**: Any operation modifying unspecified files or more than 16 scoped paths / 64 KiB text remains strictly unexempted and defaults to substantial work or clarification. Residual semantic judgment is thus safely fail-closed.

## Verification Evidence

- `npm run check`: 0 errors
- `npm run build`: cleanly built (`dist/build-artifact.json` generated)
- `node scripts/run-tests.mjs --files dist/test/task-intake-evidence.test.js dist/test/task-intake-continuity.test.js dist/test/task-intake-explicit.test.js dist/test/task-intake-cli.test.js dist/test/tree-policy.test.js`:
  - 33 tests executed: 33 passed, 0 failed, 0 skipped in 19.5s.
- Zero-mutation & zero-write boundary verified:
  - Filesystem remains untouched during intake classification (e.g. rename source files remain unmoved, targets uncreated).
  - Git remote is never contacted; no pushes executed.
