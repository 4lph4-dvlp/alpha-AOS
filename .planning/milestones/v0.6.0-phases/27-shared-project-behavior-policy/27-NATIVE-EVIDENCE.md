# Phase 27 Native Evidence: Five-Target Mode Routing and Cross-Host Handoff

**Phase:** 27-shared-project-behavior-policy  
**Date:** 2026-11-02  
**Requirement Focus:** MODE-02, MODE-03 (D-10, D-11, D-12, D-13, D-14)  
**Status:** Incomplete / Open for Human Review (`human_needed` per D-12 / 27-05-03)

---

## 1. Skill Source and Target Rendered Integrity

All five supported target harnesses render and deploy from the single canonical owned skill source `skills/alpha-aos-task/SKILL.md`. Source and rendered hashes match with byte-level integrity in `catalog/stack.lock.json` and are verified by `test/owned-skills.test.ts` and `test/project-mode-routing.test.ts`:

- **Skill Name:** `alpha-aos-task`
- **Source SHA-256:** `b09adce603f26cb12c4e8f8ecb0f8ace4aac8f3cefd364cea8e50afc5a50c00e`
- **Rendered Target SHA-256 Hashes:**
  - `claude`: `b09adce603f26cb12c4e8f8ecb0f8ace4aac8f3cefd364cea8e50afc5a50c00e`
  - `codex`: `b09adce603f26cb12c4e8f8ecb0f8ace4aac8f3cefd364cea8e50afc5a50c00e`
  - `antigravity`: `b09adce603f26cb12c4e8f8ecb0f8ace4aac8f3cefd364cea8e50afc5a50c00e`
  - `pi`: `b09adce603f26cb12c4e8f8ecb0f8ace4aac8f3cefd364cea8e50afc5a50c00e`
  - `hermes`: `b09adce603f26cb12c4e8f8ecb0f8ace4aac8f3cefd364cea8e50afc5a50c00e`

---

## 2. Five-Target Host Evidence Table

| Target ID | Detected Host Binary & Version | Invocation Surface | Loaded Skill Source / Rendered SHA | Canonical Project Root | Observed Query / Mode Result | Status | Reason / Blocker Detail |
|-----------|--------------------------------|--------------------|-----------------------------------|------------------------|------------------------------|--------|-------------------------|
| `claude` | Claude Code `2.1.312` (`C:\Users\alpha\.local\bin\claude.exe`) | CLI / subshell | `b09adce6...` | Disposable sandbox | Reread via `alpha-aos project mode` | `unavailable` | Native interactive session with external chargeable Anthropic API call is not authorized in unattended test runner; synthetic model invocation is prohibited. Fixture deployment is fully verified in `test/project-mode-routing.test.ts`. |
| `codex` | Codex CLI `0.166.0` (`codex-cli`) | CLI / subshell | `b09adce6...` | Disposable sandbox | Reread via `alpha-aos project mode` | `unavailable` | Native execution requires active interactive OpenAI API quota/session; chargeable calls and global package mutations are forbidden per D-12. Fixture deployment verified in `test/project-mode-routing.test.ts`. |
| `antigravity` | Antigravity CLI / Antigravity 2.0 (Google DeepMind) | Interactive Agent / Tools | `b09adce6...` | `D:\dev\alpha-AOS` | `alpha-aos project mode` | `proven` | Skill instructions loaded in active Antigravity session (`C:\Users\alpha\.gemini\config\skills\alpha-aos-task\SKILL.md`). Policy queries executed via child tool processes without expanding execution authority. |
| `pi` | Pi Agent `1.4.0` (`C:\Users\alpha\AppData\Roaming\npm\pi`) | CLI | `b09adce6...` | Disposable sandbox | Reread via `alpha-aos project mode` | `unavailable` | Native invocation requires interactive cloud model session; external paid calls are unauthorized. Fixture deployment verified in `test/project-mode-routing.test.ts`. |
| `hermes` | Hermes Agent `v0.22.5` (`C:\Users\alpha\.hermes\bin\hermes.cmd`) | CLI / Python local | `b09adce6...` | Disposable sandbox | Reread via `alpha-aos project mode` | `unavailable` | Native invocation requires interactive LLM backend; chargeable model inference is unauthorized. Fixture deployment verified in `test/project-mode-routing.test.ts`. |

---

## 3. Two-Host Handoff & Next-Intake Freshness (Fixture Evidence)

In `test/project-mode-routing.test.ts`, cross-target visibility and next-intake freshness are exercised deterministically across separate host environments with isolated state roots:

1. **Host A (Claude environment fixture, `stateRootA`):**
   - Queries policy on clean project directory: reports default `strict`, source `builtin-default`, revision `missing`.
   - Previews change to `flexible` mode: generates exact reviewed `planDigest`.
   - Applies change with reviewed digest: creates `.alpha-aos/behavior.json` containing `{"schemaVersion":1,"mode":"flexible"}` with transaction journal and target coordinator lock.
2. **Host B (Codex environment fixture, `stateRootB`):**
   - Executes next task intake query on the same canonical project root:
   - Reads `.alpha-aos/behavior.json` directly from project disk;
   - Observes effective mode `flexible`, source `project-policy`, exists `true`, and exact revision SHA-256 matching Host A's applied revision.
   - Proves zero cross-contamination between `stateRootA` and `stateRootB`.
3. **Host A Reread:**
   - Host A queries again and observes the identical raw revision SHA-256.

---

## 4. Authority & Consent Boundary Verification

The skill contract in `skills/alpha-aos-task/SKILL.md` explicitly enforces:
- **Precedence:** Section `### 1. Project Behavior Policy Request` strictly precedes Section `### 2. General Task Request`.
- **Zero Consent Expansion:** Explicitly establishes the *Mode Preference Invariant*: a mode request changes only project behavior preference (`strict` vs `flexible`) and MUST NOT be treated as task execution consent.
- **No Autopilot Bypass:** Flexible mode does NOT bypass exact-digest contract approval or the separate start authorization mandate.
- **No Style/Workflow Tampering:** Policy changes do not alter an active task's style, contract, or plan, and do not trigger GSD milestone commands, `new-project`, or style choosers (deferred to Phase 28).
- **Bound Task Guard:** A bound task checks its canonical project root; any mismatch blocks execution rather than silently switching projects.

---

## 5. Acceptance Verdict

- **Fixture & Structural Verification:** **PASS** (100% automated coverage in `test/project-mode-routing.test.ts`, `test/owned-skills.test.ts`, `test/project-mode-cli.test.ts`, `test/behavior-policy.test.ts`, and `test/project-mode-concurrency.test.ts`).
- **Native Five-Target Proof Status:** **`human_needed` / INCOMPLETE** per D-12 and Phase 27 validation rules.
  - While Antigravity is natively proven, live end-to-end LLM invocations for Claude Code, Codex, Pi, and Hermes were not run because chargeable/paid model calls and global package mutations are unauthorized in unattended CI execution.
  - Under D-12, fixture proof must NOT be deceptively claimed as native proof; native receipts for these external hosts remain open for final human verification.
