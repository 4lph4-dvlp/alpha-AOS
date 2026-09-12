---
status: diagnosed
phase: 03-transactional-project-packs-and-native-optional-use
source: [03-VERIFICATION.md]
started: 2026-09-12T12:29:44.3151934Z
updated: 2026-09-12T17:23:56.5491941Z
---

## Current Test

[testing paused — 4 items outstanding]

## Tests

### 1. CAPA-01 documentation invocation

expected: Native Context7 selection and ordered version-scoped read-only use on the claimed surface.
result: issue
reported: "현재 claude는 계정이 없어서 사용할 수 없는 상태야. 일단 앞으로의 개발에서 claude에 대한 고려는 배제하고 개발과 verify를 진행하자."
severity: major

### 2. CAPA-02 research routing and ordinary control

expected: Ordered Exa-to-Firecrawl routing, bounded ordinary lookup, and an explicit decision on the canary-runtime scope note.
result: blocked
blocked_by: third-party
reason: "The declared research positive and ordinary control both run only on Claude, which is excluded while no Claude account is available."

### 3. CAPA-03 receiving handoff leg

expected: The receiver demonstrably works from the memory handoff; the planning-tree witness stays unchanged.
result: blocked
blocked_by: third-party
reason: "Every declared handoff pair targets Claude, which is excluded while no Claude account is available."

### 4. CAPA-05 representative pack exercise

expected: The harness natively selects the project pack for an ordinary intent-matched task.
result: blocked
blocked_by: third-party
reason: "The representative pack-exercise canary is declared only for Claude, which is excluded while no Claude account is available."

## Summary

total: 4
passed: 0
issues: 1
pending: 0
skipped: 0
blocked: 3

## Gaps

- gap_id: G-03-1
  truth: "Phase 3 native-use verification can run on Codex without requiring a Claude account."
  status: failed
  reason: "User reported: 현재 claude는 계정이 없어서 사용할 수 없는 상태야. 일단 앞으로의 개발에서 claude에 대한 고려는 배제하고 개발과 verify를 진행하자."
  severity: major
  test: 1
  root_cause: "Phase 3 hard-codes invocation canaries as Claude-only: the catalog selects no Codex leg, Codex readiness cannot recognize runtime-local Context7, Codex MCP isolation is disabled, and invocation reuses the discovery-only prompt vector instead of codex exec."
  artifacts:
    - path: "catalog/canaries.yaml"
      issue: "CAPA-01 and the remaining invocation canaries declare only Claude."
    - path: "src/core/canary.ts"
      issue: "Codex readiness and MCP-isolation seams refuse a native observed invocation."
    - path: "src/adapters/capability-oracle.ts"
      issue: "The free discovery oracle uses codex debug prompt-input and cannot serve as a costed invocation adapter."
    - path: "src/adapters/isolation.ts"
      issue: "No verified Codex canary configuration path binds the observation front while preserving authentication."
    - path: "src/cli.ts"
      issue: "Explicit harness filters that select zero declarations do not fail closed with a useful result."
  missing:
    - "Add a separate costed Codex invocation adapter using codex exec --json --ephemeral."
    - "Prove isolated observation-front configuration while preserving user-managed Codex authentication."
    - "Teach readiness to evaluate the runtime-local Codex MCP configuration."
    - "Declare and test CAPA-01 on Codex, and reject zero-selection explicit harness filters."
  debug_session: ".planning/debug/codex-native-verification-gap.md"
