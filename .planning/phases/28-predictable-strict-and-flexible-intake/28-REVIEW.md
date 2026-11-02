---
phase: 28-predictable-strict-and-flexible-intake
reviewed: 2026-11-02T12:08:00Z
depth: standard
head: f4f1ffa50e72d8a0b0ae8a923cd1be9865fc5312
diff_base: 232423a571f3088b9015ba6a05cebb74ce40212f
scope_resolution: phase-range
files_reviewed: 16
files_reviewed_list:
  - catalog/stack.lock.json
  - docs/task-runtime-controls.md
  - schemas/task-intake.schema.json
  - skills/alpha-aos-task/SKILL.md
  - src/cli.ts
  - src/core/task-intake-continuity.ts
  - src/core/task-intake-evidence.ts
  - src/core/task-intake-explicit.ts
  - src/core/task-intake.ts
  - src/format.ts
  - test/task-intake-acceptance.test.ts
  - test/task-intake-cli.test.ts
  - test/task-intake-continuity.test.ts
  - test/task-intake-evidence.test.ts
  - test/task-intake-explicit.test.ts
  - test/task-intake-routing.test.ts
findings:
  critical: 0
  warning: 1
  info: 2
  total: 3
status: passed_with_warnings
---

# Phase 28: Independent Code Review Report

**Reviewed:** 2026-11-02T12:08:00Z  
**Depth:** Standard, covering intake schema validation, six-style question rendering, explicit command/style precedence, active task continuity, simple operation positive/negative matrix, and five-target routing parity.  
**Head SHA:** `f4f1ffa50e72d8a0b0ae8a923cd1be9865fc5312`  
**Diff Base:** `232423a571f3088b9015ba6a05cebb74ce40212f`  
**Files Reviewed:** 16  
**Status:** `passed_with_warnings` (Zero critical security or authority blockers; 1 operational warning regarding host question tool option budget)

---

## Executive Summary

Phase 28 establishes a predictable task intake control plane for alpha-AOS. It guarantees that users understand why a task execution style is presented, how active task continuity is preserved across test repairs and follow-up edits, how explicit direct commands bypass the chooser, and when simple operations skip the chooser via positive/negative evidence.

The implementation strictly satisfies requirements ENTRY-01 through ENTRY-07 and aligns with decisions D-01 through D-20:

1. **Strict Input Interchange & Pre-Parse Budget (ENTRY-01, ENTRY-05, D-01, D-04):**
   - Enforces 16 KiB pre-parse budget (`MAX_INTAKE_INPUT_BYTES`) before JSON parsing.
   - Rejects duplicate JSON keys via `parseManagedDocument`.
   - Validates JSON interchange strictly against `schemas/task-intake.schema.json`.
   - Rejects caller attempts to inject authority overrides (`executionAuthorized: true`).

2. **Deterministic Six-Style Chooser & Native Fallback (ENTRY-01, D-05, D-06):**
   - Defines exact canonical Korean labels, numbers, and short descriptions in `TASK_EXECUTION_STYLES`.
   - Prohibits splitting choices across hidden submenus or dropping options.
   - Detects `questionCapability.supportsSixOptions`: when `false` or unknown, falls back to a deterministic 1–6 numbered text list.

3. **Explicit Command & Style Precedence (ENTRY-02, ENTRY-07, D-02, D-03):**
   - Direct GSD command invocations (`$gsd-*`, `/gsd:*`, `gsd-*`) bypass the style chooser, preserving arguments and native prerequisites.
   - Quoted mentions in prose or code blocks are discriminated and route to substantial work intake.
   - Partial requests for autopilot restrict choices to the three autopilot styles without guessing depth.
   - Contradictory explicit requests trigger a narrow clarification question.

4. **Task Continuity & Pending Answer Correlation (ENTRY-03, D-07, D-08, D-10, D-11):**
   - Binds pending answers to `pendingTaskId` with status detour ("status") and cancellation ("cancel") support.
   - Refuses cross-task answer consumption.
   - Autopilot contract continuity requires exact `runId` and verifies contract digest and revision against state; prohibits implicit latest-run fallbacks.
   - Terminal tasks (`accepted` or `cancelled`) and completed GSD summary artifacts do not restore styles to subsequent independent tasks.

5. **Evidence-Backed Simple Operations & WIP Preservation (ENTRY-04, ENTRY-05, D-13, D-14, D-15, D-16):**
   - Evaluates positive-negative-unknown evidence for bounded `git push`, local file `rename`, and `README` translation/link.
   - Escalates twins with expanded scope (force push, public API rename, README redesign) to substantial work or clarification.
   - Preserves dirty WIP (`wipBytesPreserved: true`) without destructive rollback or forced checkout resets.

6. **Five-Target Deployment & Authority Invariant (ENTRY-01, ENTRY-05, ENTRY-06, D-12, D-18, D-19, D-20):**
   - Owned skill `alpha-aos-task` deployed identically across `claude`, `codex`, `antigravity`, `pi`, and `hermes`.
   - Exact hash locked in `catalog/stack.lock.json` (`349b09d2baa3eaae2f4423dfdbb62eebc3bd11fbe16783cb22371ef5dc2a659e`).
   - Every public decision enforces `executionAuthorized: false`. Intake is strictly read-only inspection.

---

## Detailed Findings

### Warnings

#### WARN-01: Host UI Question Tool Option Budget Limit
- **File:** `src/core/task-intake.ts:184-219`, `skills/alpha-aos-task/SKILL.md:40-70`
- **Context:** In interactive harnesses such as Antigravity, the host's native question tool (e.g. `ask_question`) is designed for small choice sets (typically 2–4 options). Attempting to pass 6 options into native tools may fail or truncate.
- **Assessment:** `renderTaskStyleQuestion` correctly inspects `questionCapability.supportsSixOptions` and falls back to `rendering: "numbered-text"` with the full 1–6 list when `supportsSixOptions` is not true. However, host agents must respect `rendering: "numbered-text"` by outputting plain text instead of attempting to invoke their native question tool.
- **Recommendation:** `skills/alpha-aos-task/SKILL.md` already contains explicit instructions on handling `numbered-text`. The warning is informational for host adapter authors: do not declare `supportsSixOptions: true` unless the host UI genuinely supports rendering all 6 options without truncation.

---

### Informational Observations

#### INFO-01: Safe Fail-Closed Behavior for Unclassified Operations
- **File:** `src/core/task-intake-evidence.ts:180-260`
- **Assessment:** Natural language processing cannot reliably classify arbitrary open-ended tasks as simple. The implementation safely limits automatic simple exemptions to explicit, positive evidence matches for `push`, `rename`, `readme-translation`, and `readme-link`. All other operations fall through to `substantial-work` or request clarification. This aligns with requirement ENTRY-05 and prevents unauthorized bypass of the chooser.

#### INFO-02: Zero Write Guarantee During Task Intake
- **File:** `src/core/task-intake.ts:250-280`, `src/cli.ts:1730-1760`
- **Assessment:** Running `alpha-aos task intake` performs zero disk writes, zero Git mutations, and creates no records under `~/.alpha-aos`. It is completely idempotent and safe to run in read-only environments.

---

## Requirements Verification Matrix

| Requirement | Implementation Artifacts | Test Verification | Verdict |
|---|---|---|---|
| **ENTRY-01** | `src/core/task-intake.ts:33-219`, `schemas/task-intake.schema.json` | `test/task-intake-cli.test.ts`, `test/task-intake-acceptance.test.ts` | **PASS** |
| **ENTRY-02** | `src/core/task-intake-explicit.ts:120-210` | `test/task-intake-explicit.test.ts`, `test/task-intake-acceptance.test.ts` | **PASS** |
| **ENTRY-03** | `src/core/task-intake-continuity.ts:40-225` | `test/task-intake-continuity.test.ts`, `test/task-intake-acceptance.test.ts` | **PASS** |
| **ENTRY-04** | `src/core/task-intake-evidence.ts:40-280` | `test/task-intake-evidence.test.ts`, `test/task-intake-acceptance.test.ts` | **PASS** |
| **ENTRY-05** | `src/core/task-intake-evidence.ts:180-320`, `src/format.ts:210-250` | `test/task-intake-evidence.test.ts`, `test/task-intake-acceptance.test.ts` | **PASS** |
| **ENTRY-06** | `src/core/task-intake.ts:220-270` | `test/task-intake-routing.test.ts`, `test/task-intake-acceptance.test.ts` | **PASS** |
| **ENTRY-07** | `src/core/task-intake-explicit.ts:40-119` | `test/task-intake-explicit.test.ts`, `test/task-intake-acceptance.test.ts` | **PASS** |

---

## Conclusion

Phase 28 is architecturally sound, thoroughly tested, and adheres to all project safety and determinism constraints. Zero security vulnerabilities or authority boundary violations were found. Automated verification passes with 100% green tests. Live paid host model calls remain cataloged as `unavailable` / `human_needed` per Decision D-20.
