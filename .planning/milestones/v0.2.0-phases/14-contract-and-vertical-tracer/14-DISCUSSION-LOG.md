# Phase 14: Contract and Vertical Tracer - Discussion Log

> **논의 기록 전용.** 연구·계획·구현의 기준은 `14-CONTEXT.md`입니다.

**Date:** 2026-09-29
**Phase:** 14-Contract and Vertical Tracer
**Areas discussed:** Approval handoff, Delegation limits, Tracer task, Verdict presentation

---

## Approval handoff

### 1. Where should final approval for the first run happen?

| Option | Selected |
|--------|----------|
| CLI final approval | ✓ |
| In-conversation final approval |  |
| Both |  |

**User choice:** Final approval in the CLI after a read-only contract preview; the conversation may refine the contract.

### 2. Should approval and execution start be separate?

| Option | Selected |
|--------|----------|
| Separate commands | ✓ |
| Approve and start immediately |  |
| Both |  |

**User choice:** Separate commands: approve the contract, then start with its approved digest.

### 3. How specifically should file-change authority be represented?

| Option | Selected |
|--------|----------|
| Paths and effect categories | ✓ |
| Predetermine each file |  |
| Effect categories only |  |

**User choice:** Show allowed roots and effect categories; record actual changed files in the execution result.

### 4. What should a stale-approval refusal display?

| Option | Selected |
|--------|----------|
| Changed fields and new preview | ✓ |
| Digest mismatch only |  |
| Full new contract only |  |

**User choice:** Identify changed contract fields and show a fresh preview and digest for reapproval.

---

## Delegation limits

### 1. Which implementation choices may the controller make within approved roots and the GSD plan?

| Option | Selected |
|--------|----------|
| Approach, files, and verification | ✓ |
| Approach only |  |
| Only tasks written in the plan |  |

**User choice:** Choose implementation approach and file structure and strengthen verification with tests without additional approval.

### 2. How much rationale should be recorded for delegated decisions?

| Option | Selected |
|--------|----------|
| Each meaningful decision | ✓ |
| Every step |  |
| Final summary only |  |

**User choice:** Record each meaningful implementation decision and its rationale as it occurs.

### 3. What happens when a new dependency is needed?

| Option | Selected |
|--------|----------|
| Proceed under contract authority | ✓ |
| Pause for every dependency |  |
| Delegate development dependencies only |  |

**User choice:** Proceed when the contract explicitly permits dependency changes, record the reason, and retain separate exact-digest approval for new project packs.

### 4. May the controller substitute a measurement method for a mandatory criterion?

| Option | Selected |
|--------|----------|
| Equivalent measurement allowed | ✓ |
| Approve every substitution |  |
| No substitution |  |

**User choice:** Use an equivalent method that proves the same criterion and record why; if proof is insufficient, report unknown.

---

## Tracer task

### 1. Which project should prove the first development path?

| Option | Selected |
|--------|----------|
| Isolated small CLI project | ✓ |
| Small alpha-AOS change |  |
| Small web UI project |  |

**User choice:** Run a real task in an isolated small CLI project.

### 2. Which CLI behavior should be mandatory?

| Option | Selected |
|--------|----------|
| Input data transform | ✓ |
| File organizer |  |
| Interactive mini-game |  |

**User choice:** Transform an input file to a specified JSON result, measuring normal and malformed input behavior.

### 3. Which deliberate failure should the tracer show?

| Option | Selected |
|--------|----------|
| Incorrect output despite success claim | ✓ |
| Missing malformed-input handling |  |
| Unrunnable verification command |  |

**User choice:** The executor claims success but produces incorrect JSON, so objective measurement rejects the run.

### 4. How should the success and failure cases run?

| Option | Selected |
|--------|----------|
| Two independent runs | ✓ |
| Fail, fix, and accept in one run |  |
| Real success plus simulated failure |  |

**User choice:** Use two independent real-agent runs: accept the correct result and reject the seeded incorrect result. Test stale reviewer output separately.

---

## Verdict presentation

### 1. What should the CLI's first verdict screen show?

| Option | Selected |
|--------|----------|
| Per-criterion evidence table | ✓ |
| Short conclusion and report path |  |
| Full chronological run log |  |

**User choice:** Show a per-criterion evidence table with check and reviewer outcomes, artifact digest, and failure reason.

### 2. What if an objective check passes but the independent reviewer reports a defect?

| Option | Selected |
|--------|----------|
| Reject with reproducible evidence | ✓ |
| Mark disagreement unknown |  |
| Prefer objective check |  |

**User choice:** Show both results and reject when the review defect has confirmed reproduction steps and evidence.

### 3. What should an unknown verdict explain?

| Option | Selected |
|--------|----------|
| Missing evidence and next action | ✓ |
| Missing evidence only |  |
| Run log only |  |

**User choice:** Name the missing evidence for each affected criterion and the actionable next step, such as rerun, environment repair, or criterion clarification.

### 4. Where should the verdict be inspectable after the run?

| Option | Selected |
|--------|----------|
| Managed-state acceptance receipt | ✓ |
| Console output only |  |
| Report inside task project |  |

**User choice:** Store a local managed-state acceptance receipt binding contract revision and digest, artifact digest, measured checks, and reviewer evidence, retrievable through the CLI.

---

## the agent's Discretion

사용자가 위임한 계약 내 구현 결정 외에 별도로 에이전트에 맡긴 논의 항목은 없습니다.

## Deferred Ideas

없음.
