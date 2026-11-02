# Phase 28 Native Evidence: Five-Target Intake Routing, Chooser Capabilities, and Honest Parity Limits

**Phase:** 28-predictable-strict-and-flexible-intake  
**Date:** 2026-11-02  
**Requirement Focus:** ENTRY-01–ENTRY-07 (D-01–D-20)  
**Status:** Incomplete / Open for Human Review (`human_needed` per D-20, ENTRY-06, and flagged edge assumptions)

---

## 1. Skill Source and Target Rendered Integrity

All five supported target harnesses render and deploy from the single canonical owned skill source `skills/alpha-aos-task/SKILL.md`. Source and rendered hashes match with byte-level integrity in `catalog/stack.lock.json` and are verified by `test/owned-skills.test.ts`, `test/task-intake-routing.test.ts`, and `test/task-governance-hierarchy.test.ts`:

- **Skill Name:** `alpha-aos-task`
- **Source SHA-256:** `349b09d2baa3eaae2f4423dfdbb62eebc3bd11fbe16783cb22371ef5dc2a659e`
- **Rendered Target SHA-256 Hashes:**
  - `claude`: `349b09d2baa3eaae2f4423dfdbb62eebc3bd11fbe16783cb22371ef5dc2a659e`
  - `codex`: `349b09d2baa3eaae2f4423dfdbb62eebc3bd11fbe16783cb22371ef5dc2a659e`
  - `antigravity`: `349b09d2baa3eaae2f4423dfdbb62eebc3bd11fbe16783cb22371ef5dc2a659e`
  - `pi`: `349b09d2baa3eaae2f4423dfdbb62eebc3bd11fbe16783cb22371ef5dc2a659e`
  - `hermes`: `349b09d2baa3eaae2f4423dfdbb62eebc3bd11fbe16783cb22371ef5dc2a659e`

---

## 2. Five-Target Host Evidence Table

| Target ID | Detected Host Binary & Version | Invocation Surface | Loaded Skill Source / Rendered SHA | Canonical Project Root | Observed Intake / Chooser Result | Evidence Class | Status | Reason / Blocker Detail |
|---|---|---|---|---|---|---|---|---|
| `claude` | Claude Code `2.1.312` (`C:\Users\alpha\.local\bin\claude.exe`) | CLI / subprocess fixture | `349b09d2...` | Sandbox | Strict 6 choices, flexible adaptive, direct command bypass | Offline Fixture (`test/task-intake-routing.test.ts`) | `unavailable` | Native interactive session with external chargeable Anthropic API call is unauthorized in automated test runner; synthetic model invocation is prohibited. Complete numbered text fallback verified. |
| `codex` | Codex CLI `0.166.0` (`codex-cli`) | CLI / subprocess fixture | `349b09d2...` | Sandbox | Strict 6 choices, flexible adaptive, direct command bypass | Offline Fixture (`test/task-intake-routing.test.ts`) | `unavailable` | Native execution requires active interactive OpenAI API quota/session; chargeable calls and global package mutations are forbidden. Complete numbered text fallback verified. |
| `antigravity` | Antigravity CLI / Antigravity 2.0 (Google DeepMind) | Interactive Agent / Tools | `349b09d2...` | `D:\dev\alpha-AOS` | `alpha-aos task intake` executed via process tool | Native Session Observation | `proven` | Skill instructions loaded in active Antigravity session (`C:\Users\alpha\.gemini\config\skills\alpha-aos-task\SKILL.md`). Intake inspection executed via process tool without expanding execution authority. Host question tool (`ask_question`) has options limit; complete numbered text fallback proven in Journey D. |
| `pi` | Pi Agent `1.4.0` (`C:\Users\alpha\AppData\Roaming\npm\pi`) | CLI / subprocess fixture | `349b09d2...` | Sandbox | Strict 6 choices, flexible adaptive, direct command bypass | Offline Fixture (`test/task-intake-routing.test.ts`) | `unavailable` | Native invocation requires interactive cloud model session; external paid calls are unauthorized. Complete numbered text fallback verified. |
| `hermes` | Hermes Agent `v0.22.5` (`C:\Users\alpha\.hermes\bin\hermes.cmd`) | CLI / subprocess fixture | `349b09d2...` | Sandbox | Strict 6 choices, flexible adaptive, direct command bypass | Offline Fixture (`test/task-intake-routing.test.ts`) | `unavailable` | Native invocation requires interactive LLM backend; chargeable model inference is unauthorized. Complete numbered text fallback verified. |

---

## 3. Native UI Capability vs Complete Numbered Text Fallback (D-05, D-06)

- **Observed Tool Constraint**: In Antigravity (and typical LLM UI tool environments), native question APIs (e.g. `ask_question`) are designed for short 2–3 option prompts. They cannot reliably display all six canonical Korean execution styles together without UI truncation or silent omission.
- **Fail-Safe Fallback**: `renderTaskStyleQuestion` inspects `questionCapability.supportsSixOptions`. When `false` or when capability is unknown, it deterministically emits `rendering: "numbered-text"` with the complete, unshortened 1–6 list:
  1. `대화형-quick`: 현재 대화에서 작은 작업을 간소화된 GSD 절차로 처리
  2. `대화형-quick-full`: 작은 작업에 토론·조사·계획 검사·구현·검증 적용
  3. `대화형-phase`: 로드맵과 Phase를 따라 필요한 사항을 질문하며 진행
  4. `오토파일럿-quick`: 승인된 계약과 별도 실행기로 작은 작업 처리
  5. `오토파일럿-quick-full`: 승인된 범위에서 작은 작업의 전체 품질 절차 수행
  6. `오토파일럿-phase`: 승인된 로드맵 범위의 Phase들을 자율 진행
- **Prohibition Enforcement**: The system never splits the six canonical styles into two hidden submenus or hides any choice.

---

## 4. End-to-End Behavioral Scenarios (Fixture Evidence in `test/task-intake-acceptance.test.ts`)

1. **Journey A (Release Milestones & Bug Isolation: ENTRY-01, ENTRY-03, D-05, D-09, D-10, D-11, D-20)**:
   - Release task receives strict chooser -> selects `autopilot-phase`.
   - Test repair during release wave retains `autopilot-phase` without re-prompting.
   - Authoritative completion (`accepted` / `completed`) ends the selection's lifecycle.
   - Subsequent independent bug fix receives a fresh strict chooser (does NOT inherit `autopilot-phase`) and selects `autopilot-quick-full`.
   - No approval/start/digest leakage across tasks; zero choice saved in `behavior.json`.
2. **Journey B (Pending Chooser Correlation, Detours, and Cancellation: ENTRY-01, ENTRY-05, D-07, D-08, D-11)**:
   - Initial pending question bound to `pendingTaskId`.
   - Status detour ("status" / "진행 상황") preserves pending selection.
   - Invalid answer ("99") leaves choice pending.
   - Cross-task answer reply with mismatched `pendingTaskId` is rejected (`pending-task-correlation-id-mismatch`).
   - Cancellation ("cancel" / "취소") discards the pending choice.
   - Valid answer ("1") resolves to `conversational-quick`.
3. **Journey C (Precedence, Direct Commands, Twins, and WIP Preservation: ENTRY-02, ENTRY-04, ENTRY-07, D-02, D-03, D-13, D-14, D-16)**:
   - Direct command `gsd-discuss-phase 28` bypasses chooser; quoted mention in prose goes to substantial work chooser.
   - Explicit style `대화형-quick-full` outranks README simple exemption.
   - Positive local rename skips chooser; public API rename twin routes to substantial work chooser.
   - Scope expansion stops before expanded work and preserves dirty WIP (`wipBytesPreserved: true`).
4. **Journey D (Error Boundaries and Authority Protection: ENTRY-01, ENTRY-05, D-05, D-06, D-18, D-19)**:
   - Numbered text fallback tested when `supportsSixOptions: false`.
   - Caller attempting to inject `executionAuthorized: true` in input is rejected by schema validation.

---

## 5. Unresolved Semantic Assumptions and Prohibitions (Handoff to Verification)

1. **ENTRY-04 Unclassified Assumption**: Natural language alone cannot prove arbitrary operation simplicity. Simple exemptions are strictly limited to the positive-negative-unknown matrix for `push`, `rename`, and `readme-translation`/`readme-link`. Unobserved impact remains clarification-needed.
2. **ENTRY-06 Unclassified Assumption**: Host adaptive interaction cannot be modeled by edge vocabulary alone. Shared CLI routing fixtures cover deterministic behavior; live vendor model delivery stays unverified.
3. **Prohibition 1**: "A task style selection must not become implicit consent to run or expand another task." (Status: `unresolved`, verification: `judgment`).
4. **Prohibition 2**: "The system must not hide available styles or persist a task choice as a project default." (Status: `unresolved`, verification: `judgment`).
