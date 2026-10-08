# Plan 19-05 Summary: Native Independent Final Review Ports Across Five Harnesses

## 1. Overview
- **Phase**: 19-structured-independent-review
- **Plan**: 19-05
- **Wave**: 5
- **Requirements Satisfied**: REV-03, REV-04
- **Objective**: Connect the milestone final review port to all five native harness adapters (Claude Code, Codex, Antigravity, Pi Agent, Hermes Agent) using fresh read-only sessions and structured outputs, verifying strict request/session/artifact bindings and rejecting invalid/adversarial runs without masquerading unsupported parity as passes (Decisions D-13, D-14, REV-03, REV-04, Threat T-19-11).

---

## 2. Key Decisions & Guarantees Implemented

- **Common Final Review Prompt Builder & Bounded Constraints (REV-03)**:
  - Exported `buildFinalReviewPrompt()` in `src/core/task-final-review.ts`.
  - Prompts bind exact `schemaVersion: 1`, `requestId`, `contractId`, `contractDigest`, `artifactDigest`, `targetRevisionSha`, and `sessionId`.
  - Contains mandatory requirements to verify, cross-phase audit items (userFlow, approvalBoundaries, gsdStateOwnership, reviewerIndependence), and reporting rules.
  - Hard 64KB bound enforced: oversized review prompts are rejected before process launch.
- **Five Native Final Reviewer Adapters (REV-03, REV-04)**:
  - **Claude Code** (`src/adapters/task-claude.ts`):
    - Uses `-p`, `--output-format json`, `--json-schema`, `--session-id <UUID>`, `--no-session-persistence`, `--restricted`, `--tools Read,Grep,Glob`, `--strict-mcp-config`, and `--permission-mode plan`.
  - **Codex** (`src/adapters/task-codex.ts`):
    - Uses `exec`, `--json`, `--ephemeral`, `--ignore-rules`, `--sandbox read-only`, `-C <reviewRoot>`, and schema output path.
  - **Antigravity** (`src/adapters/task-antigravity.ts`):
    - Uses `-p`, `--output-format json`, `--json-schema`, `--mode plan`, and `--sandbox`.
  - **Pi Agent** (`src/adapters/task-pi.ts`):
    - Uses `-p`, `--mode rpc`, `--tools read,grep,find,ls`, `--no-approve`, `--no-session`, and `--json-schema`. Handles Windows libuv teardown assertion crashes (0xC0000409 / exit 1) gracefully when valid JSON output was produced.
  - **Hermes Agent** (`src/adapters/task-hermes.ts`):
    - Uses `-z <prompt>`, `--toolsets file`, `--ignore-rules`, `--in <reviewRoot>`, and `--usage-file`.
- **Dynamic Port Dispatch (ROL-01, REV-03)**:
  - `createNativeFinalReviewPort(harness, options)` creates a `FinalReviewPort` for any supported harness.
  - `createDynamicFinalReviewPort(policy, options)` dispatches to the harness designated in `contract.agentPolicy.reviewer`.
- **Adversarial Failure Hardening (T-19-11, REV-04)**:
  - Validates session ID matching in both `parseFinalReviewJson` and `validateFinalReviewReport`.
  - Rejects truncated stdout / broken JSON, revision SHA drift, contract digest mismatch, artifact digest mismatch, deadline expiration, and non-zero process exits.
  - Model explanations or process exit codes alone never grant milestone pass.

---

## 3. Key Changes Implemented

### Core Modules
- [`src/core/task-final-review.ts`](file:///D:/dev/alpha-AOS/src/core/task-final-review.ts):
  - Defined `FinalReviewRequest`, `FinalReviewPort`, and implemented `buildFinalReviewPrompt()`.
  - Added `sessionId` binding check to `validateFinalReviewReport()`.

### Harness Adapters
- [`src/adapters/task-claude.ts`](file:///D:/dev/alpha-AOS/src/adapters/task-claude.ts):
  - Added `runClaudeFinalReviewer()` and `parseFinalReviewJson()`.
- [`src/adapters/task-codex.ts`](file:///D:/dev/alpha-AOS/src/adapters/task-codex.ts):
  - Added `runCodexFinalReviewer()`.
- [`src/adapters/task-antigravity.ts`](file:///D:/dev/alpha-AOS/src/adapters/task-antigravity.ts):
  - Added `runAntigravityFinalReviewer()`.
- [`src/adapters/task-pi.ts`](file:///D:/dev/alpha-AOS/src/adapters/task-pi.ts):
  - Added `runPiFinalReviewer()`.
- [`src/adapters/task-hermes.ts`](file:///D:/dev/alpha-AOS/src/adapters/task-hermes.ts):
  - Added `runHermesFinalReviewer()`.
- [`src/adapters/task-agents.ts`](file:///D:/dev/alpha-AOS/src/adapters/task-agents.ts):
  - Added `createNativeFinalReviewPort()` and `createDynamicFinalReviewPort()`.

### Test Coverage
- [`test/task-final-review-adapters.test.ts`](file:///D:/dev/alpha-AOS/test/task-final-review-adapters.test.ts) (New):
  - Unit and adversarial integration test suite covering all 5 harnesses:
    - Task 1: Successful final review execution and structured output across 5 native harnesses.
    - Policy dispatch via `createDynamicFinalReviewPort`.
    - Task 2: Adversarial failure scenarios (session ID mismatch, contract/artifact digest mismatch, process non-zero exit, truncated JSON, deadline expiration) across all 5 harnesses.
    - Oversized prompt rejection (> 64KB).

---

## 4. Verification & Results
- `npm run build`: Success.
- `npm run check`: TypeScript compiler passed with zero errors.
- Test execution:
  - `dist/test/task-final-review-adapters.test.js`: 4 passed (100%).
  - `dist/test/task-agents.test.js`: 34 passed (100%).
  - Full Phase 19 test suite (50 tests across 6 files): 100% passed.
