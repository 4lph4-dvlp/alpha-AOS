---
phase: 25-runtime-usage-and-recovery-controls
reviewed: 2026-10-30T05:15:52Z
depth: focused-delta
head: 2cdc70d9edb09e48f8bdf9f85c976d2dbe58af7a
basis_digest: 0241d41cb6f36771cd74cd7077d6a45d9a090b48bb65b58cb4dedaac69440f8d
findings:
  critical: 1
  warning: 0
  info: 0
  total: 1
status: issues_found
---

# Phase 25: Focused Review Delta

This is a focused source-and-fixture inspection against CR-01 through CR-07 and WR-01 in `25-REVIEW.md`, not another full review. The original report remains unchanged. Six original blockers and the integration coverage gap have source-level repairs; CR-02 remains on the normal Codex reviewer path.

No tests, paid native calls, installation operations, original-project operations, commits, or source/test/state edits were performed. Parent test session `46887` was neither polled nor duplicated. Build success and prior full-suite counts are parent-supplied context, not verification produced here. The added fixture assertions were inspected but not executed by this reviewer; final regression remains the parent's gate.

## Original finding disposition

| Finding | Delta disposition | Evidence in the frozen source |
|---|---|---|
| CR-01 | Resolved for the original counterexamples; execution validation pending parent tests | `task-runtime.ts:245-250,269-285` carries closure state, persists `interrupted` after unresolved timeout or a throw following spawn, and retains a settled-owner lock. Reconciliation rejects observed live children. `task-runtime-controls.test.ts:107-130` asserts an interrupted receipt and zero second calls for both cases. |
| CR-02 | **BLOCKER remains on normal reviewer results** | Dedicated jobs and controllers now provide terminal/process fields, and task reads consider failed receipts. The normal Codex reviewer still relies on `onProcess` for its native terminal; the runtime overwrites that evidence with absent result fields. See the finding below. |
| CR-03 | Resolved for the original unavailable-meter and final-review-entry counterexamples; execution validation pending | `task-runtime.ts:180-181` checks meter capabilities before acquiring/dispatching; `task-final-review.ts:701-702` exposes readiness failure. Completed dispatch/final-review accounting with a required null meter is refused. Runtime-controls and final-review fixtures assert zero callbacks for fresh Codex USD-limited calls. |
| CR-04 | Resolved for the original source-write counterexample; execution validation pending | Native ports declare isolation. `task-final-review.ts:437-447` verifies SHA/artifact and materializes a separate snapshot; after review it checks source tree, SHA and review basis. `task-codex.ts:828-903` uses an independent temporary output/schema directory. The new native gate fixture asserts separate cwd, unchanged source status and no source `.alpha-aos-review` directory. |
| CR-05 | Resolved for the original exception/dead-parent local-log counterexample; execution validation pending | `recoverNativeUsage` now runs in exception handling, interrupted reads and explicit reconciliation. Receipts retain project/session-root identity, and discovery errors preserve unknown coverage. The exception fixture supplies local parent/child counters and asserts 77 tokens and replay deduplication. |
| CR-06 | Resolved for the original generated-ID/native-ID counterexample; execution validation pending | The native final adapter sends actual thread ID plus native cwd through `onProcess`; final gate returns that explicit native ID separately from report session identity. Runtime persists protocol ID separately and uses native cwd for family collection. The native final gate fixture asserts different protocol/native IDs, snapshot cwd, `family` coverage and 132 aggregate tokens. |
| CR-07 | Resolved for the original omitted-row and old-witness reuse counterexamples; execution validation pending | `task-final-review.ts:415-417,590-593` requires nonempty unique declarations and exact sorted reported IDs. Reuse requires `validationVersion: 2` and matching requirement IDs; new receipts record those fields. Omitted, duplicate and unknown-row fixtures require unknown status and no accepted witness. |
| WR-01 | Coverage construction addressed; test outcome pending | `task-gsd-multi-phase.test.ts:237-259` now approves an actual `gsd-multi-phase` contract, records original base/current partial HEAD, then enters through `resumeTask`. It retains dirty WIP, routes through the controller lease/effect audit and invokes an injected final acceptance port. It asserts accepted outer status, one final review, preserved WIP/decisions and Nyquist evidence. Native process behavior remains credential-free fixture coverage, not a paid end-to-end claim. |

## Narrative Findings (AI reviewer)

### CR-02: BLOCKER — Normal reviewer terminal evidence is overwritten before outcome classification

**File:** `D:/dev/alpha-AOS/src/core/task-runtime.ts:242-254`

**Related:** `D:/dev/alpha-AOS/src/adapters/task-codex.ts:777-799`; `D:/dev/alpha-AOS/src/core/task-run.ts:207-220,1459-1465`

**Issue:** The repaired adapter sends `terminal: events.terminal` to `request.onProcess`. Its returned `ReviewDispatchResult` contains process code, exit code, closure, report and issues, but no `terminal` property. The runtime's `processFailed` predicate checks only `result.terminal`, not the already recorded `record.terminal`. It then assigns `terminal: result.terminal ?? null`, discarding the callback evidence. Thus the ordinary criterion-review path is still susceptible to the original native-failure/runtime-completion contradiction even though the dedicated bridge and controller paths are repaired.

**Concrete counterexample (source trace, no duplicate test run):** A native reviewer exits 0 after `thread.started` and `turn.failed` with an ordinary non-quota error. `runCodexReviewer` emits `{processCode: "ok", exitCode: 0, terminal: "failed", closeConfirmed: true}` through `onProcess`, then returns `{processCode: "ok", exitCode: 0, closeConfirmed: true, report: null, issues: [...]}`. At runtime classification all three `processFailed` terms evaluate false; closure is confirmed and quota detection is false. The persisted outcome becomes `status: "completed", terminal: null, reason: null`. The higher-level review can reject its missing report, but its runtime observation still falsely declares completion.

**Why the new regression does not cover it:** `task-runtime-controls.test.ts:133-146` puts `terminal` directly in the returned result. It does not supply native terminal evidence only through `onProcess`, as the normal reviewer does.

**Fix:** Normalize one effective process/native evidence object from explicit result fields plus persisted callback fields, then use that same object for both classification and persistence. In particular, retain the last observed native terminal when the result omits it. Adding terminal to the normal review result is useful, but the common guard should also preserve callback-only evidence. Add one focused callback-only failed-terminal regression with process `ok`/exit 0/confirmed closure, asserting a failed receipt, retained `terminal: "failed"`, non-null failure reason and stopped status interpretation.

## Reviewed basis

SHA-256 values below identify the exact files used for this delta. The basis digest is SHA-256 of `JSON.stringify(files)` where `files` is the ordered array of `{path, sha256}` objects in this table. HEAD remained `2cdc70d9edb09e48f8bdf9f85c976d2dbe58af7a`; repairs are working-tree bytes, not an asserted committed revision.

| File | SHA-256 |
|---|---|
| `.planning/phases/25-runtime-usage-and-recovery-controls/25-REVIEW.md` | `7b17880956f0dc64593328f8657bed1b2a2eeac9e0deb7fb0cc1a17d78e74cf1` |
| `docs/task-runtime-controls.md` | `7dc6d8b0b0ec3b05f300a54782fa81d4cbbf4c6006ec76415b8e854ea5dd6382` |
| `src/core/task-runtime.ts` | `bda37820d3c9ff2cadb5a4ddd7ead3b926fd36a7eb61ac1ec188836a470aea27` |
| `src/core/task-native-job.ts` | `284930d090c1db736d0863d27dd8d873e2738d5fd33846a97831259ecf5b5cde` |
| `src/core/task-native-usage.ts` | `b7e3cf987b68c87d7e86c61d6ebea8b69de82bb5164ff7cd2f5e0266458e9b0f` |
| `src/core/task-native-sessions.ts` | `74b7b20d6d2ed638e68500285a9c3cb09e52d00bf6a8daa7d601d0c0bdb987b0` |
| `src/core/task-job-binding.ts` | `3f314dd903e35b3eb5da321b5c5dd7c847e16e13a2dce5da37d0f66df0e0c79c` |
| `src/core/task-final-review.ts` | `2cb9a3044e320762341effd99a90277f06e88291a579e555e74bf86b125037cb` |
| `src/core/task-read.ts` | `85508185d1b8f6c35874ec886a7d0ebdf8a5f5e64d15e8f31b56577b9c5e0915` |
| `src/core/task-run.ts` | `4c0145184bf2cb1f18b3a31ab95f6275ffb63f63c1521f4aec2905172f3e52e4` |
| `src/core/task-supervisor.ts` | `39cbc153bb811587b55942647090ffd1ae4fbc5e352c74fb2ea9c0bf93adc228` |
| `src/core/task-gsd-lifecycle.ts` | `b4c015e39290e7b790b3df176812131d02b3f1f970df8f5da02aee7fe8f836fa` |
| `src/core/task-effects.ts` | `1b46050ebbb091f33057d85333d79649fb0b31b61fc8e64c816b3a6ce207cc6c` |
| `src/core/task-wait.ts` | `f38c03f42ad9e42e062945fb8c312f0b7eb5a738bae035583b6b2faa001b0036` |
| `src/core/command-job-worker.ts` | `4de3b9c3362a4da53863750d0d7bdd5667dffa25208fd4f0592f438f555c12eb` |
| `src/core/command-jobs.ts` | `12cf9ba60de255ee11bcd1d8ac58f4ef3e90971ee4e312a416bb593f3cf3373b` |
| `src/core/task-check.ts` | `6be8ae65b17e8b6bd44cc9b7723cd8b1cf1e8c2378531ab8d1c24bbd422a5907` |
| `src/adapters/task-codex.ts` | `3494de45fcedbd847255c26ea9a7532f6d3467221afb3738bac483a2a6b32f33` |
| `src/adapters/task-agents.ts` | `0c3c2a04f4255759549624b2aec74528dd46d56abc600c62953afba2505c7400` |
| `src/format.ts` | `56efd9ed251677955b48562cb13da14ee512bcd1fbe82de9e94396f3dc671dc6` |
| `test/task-runtime-controls.test.ts` | `ef6e276a9594fe9ad443ba23cb599acedc2028b85739320216cb8a31b3e2d968` |
| `test/task-native-job.test.ts` | `aedf533461de52f7fa17131b78a8c2701caf6a3b9beb715ebfe844e9d5e4e0cf` |
| `test/task-final-review.test.ts` | `6e7f294a30310e089d03e76544162ff5498fdbd4701b16d0f79cbacde3e3815e` |
| `test/task-final-review-adapters.test.ts` | `3a78fb2618bca1d516052e15c0ae04122abefd9ea1e707169d289fea784740fa` |
| `test/task-gsd-multi-phase.test.ts` | `63ce62a5415ffd7095dec18181091ee7683e22137f84e842c13ae61fd2429025` |

_Independent focused delta review; only this report was written._
