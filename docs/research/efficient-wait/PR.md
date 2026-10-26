# Pull Request: v0.4.5 Efficient Wait & Reactive Completion Runtime

**Target Branch**: `main`

**Task Base**: `54ecf5042a5cc969004716484f85c0b91b013505` (local v0.4.0); remote `origin/main` last seen at `3a4e632` is v0.3.1 (does not contain v0.4.0). No current v0.4.5 final implementation hash known yet.

**Type**: Feature / Architecture & Guidance Fix (BUG-06)

**Status**: LOCAL REVIEW ONLY (No remote push, tag, or publish actions performed)

---

## Summary of Changes

1. **Detached Command Jobs (`alpha-aos job`)**:
   - Implemented `job start`, `job wait`, `job status`, and `job cancel` CLI commands.
   - Assigned exact ID format `job-` followed by 16 lowercase hex characters (not UUID).
   - Enforced combined retained child output ceiling of 64 KiB (`MAX_COMBINED_OUTPUT_BYTES`), distinct from larger record/envelope bounds and total process memory.
   - Decoupled process lifetimes under the same caller identity without escaping OS/sandbox boundaries.
   - Argument preservation without shell string concatenation; dry-run preview when `--apply` is omitted.
   - Observer timeout semantics: observer timeout does not cancel running jobs (`observer expiry != cancellation`).

2. **Autonomous Task Wait (`alpha-aos task wait`)**:
   - Observes canonical task runs by exact contract ID, run ID, digest, and revision.
   - Anti-forgery check ensures tasks cannot succeed based on orphaned checkpoints alone; unsupported legacy supervisor linkage remains explicitly unresolved.

3. **Prompt & Skill Guidance (Eliminating Polling Loops)**:
   - Updated `buildGsdControllerPrompt` in `src/core/task-gsd.ts` to instruct models against repetitive `sleep` or busy-wait loops.
   - Updated `skills/alpha-aos-task/SKILL.md` to correct the false detached supervisor claim and explain truthful foreground awaiting vs. `alpha-aos job`.
   - Updated `docs/codex-execution-policy.md` and added `docs/efficient-wait.md` comprehensive runnable guide.

4. **Fixture Path Corrections**:
   - Corrected `repositoryRoot` path resolution in `test/efficient-wait-guidance.test.ts` and `test/verify-efficient-wait.test.ts` to reference the compiled package root properly.

---

## Validation & Verification Status

- **Historical Targeted Slice**: 67/67 passed, 0 failures, 0 skips at implementation commit `0320c27`.
- **Broader Test Suite**: 69 total cases evaluated (63 pass, 6 fail) across broader coverage.
- **Independent GPT-6.1 Review**: Subsequent independent review in `task-wait-resolution-review.md` found 5 blockers and 2 warnings; active repairs are underway by Worker D (job/verifier/tests) and Worker E (task-observer/tests). No final closure or verified fix yet.
- **v0.4.0 Retained Evidence**: Windows live computer-use evidence (6 actions, 20 audit events, 10 captures) retained. macOS/Linux GUI actions and 3-OS CI remain unrun as requested.
- **Billing / Savings**: No measured token billing or cost savings claims are asserted; runtime avoids model-driven polling on its path, but cannot promise preventing host rate-limit exhaustion or quantify savings.
- **Independent Review Gate**: PENDING active worker repairs and re-review.
- **Release Verification Gate**: PENDING controller verification packet.

Historical scope: the approved plan targeted 0.4.1 from 54ecf50. Current integration includes original main 0.4.4 (29619ab) and prepares candidate 0.4.5; final verification is pending. The committed original user report from 02c2bf7 is retained as input.
