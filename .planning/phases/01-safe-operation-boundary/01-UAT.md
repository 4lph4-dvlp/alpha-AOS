---
status: testing
phase: 01-safe-operation-boundary
source: [01-VERIFICATION.md]
started: 2026-09-05T11:10:00Z
updated: 2026-09-05T11:10:00Z
supersedes: "2026-09-04 UAT derived from the gaps_found report — every item there was [pending], and the automated suites it listed were re-run green by the 2026-09-05 verifier. Only the items below still need a human."
---

## Current Test
<!-- OVERWRITE each test - shows where we are -->

number: 1
name: phase-1 커밋을 push 하고 3-OS CI 매트릭스를 실제로 관측한다
expected: |
  `.github/workflows/ci.yml` 의 ubuntu-latest 와 macos-latest leg 가 `npm run check`, `npm test`,
  `npm run build:check` 및 명명된 10개 Safety boundary 스위트를 통과한다. 10개에는 01-17/01-18 이
  추가한 `dist/test/protocol-session.test.js` 와 `dist/test/mcp-proxy.test.js` 가 포함된다.
  `preview.test.js` 는 두 POSIX wrapper 계열에 대해 빈 not-run 목록을 보고한다.
awaiting: user response

## Tests

### 1. phase-1 커밋을 push 하고 3-OS CI 매트릭스를 실제로 관측한다
expected: ubuntu-latest 와 macos-latest leg 가 `npm run check`, `npm test`, `npm run build:check` 및 명명된 10개 Safety boundary 스위트(신규 `protocol-session.test.js`, `mcp-proxy.test.js` 포함)를 통과하고, `preview.test.js` 가 두 POSIX wrapper 계열에 대해 빈 not-run 목록을 보고한다.
why_human: `git status` 가 `main...origin/main [ahead 61]`, `gh run list` 최신 실행은 2026-09-02 로 phase-1 커밋 이전이다. 워크플로 정의는 존재하고 3-OS 매트릭스에 배선돼 있으나 한 번도 돌지 않았다. 01-VALIDATION.md 는 3-OS CI 스위트가 초록이어야 verification 이 성립한다고 규정한다.
result: [pending]
coverage_id: 01-VERIFICATION human_verification 1

### 2. Windows unknown-reparse 카나리
expected: `fsutil reparsepoint` 권한이 있는 Windows 호스트에서, 허용 루트 안에 미분류 reparse tag 를 가진 디렉터리를 만든 뒤 그 아래 경로에 대해 alpha-AOS dry-run 과 apply 를 실행하면 — 안정적인 unsupported/refusal 코드가 나오고, mutation 이 없고, 바깥 sentinel 해시가 변하지 않는다. dry-run 과 inspection 경로는 계속 쓸모 있어야 한다 (D-01).
why_human: 이번 세션 재확인 — `node --test dist/test/path-boundary.test.js` 가 `an unclassified reparse point yields a stable unsupported refusal` 을 skip 으로 보고한다 (`fsutil reparsepoint is unavailable or unprivileged on this host`). 01-VALIDATION.md 가 이 항목을 phase 유일의 manual-only verification 으로 지정했다. 나머지 4개 SC2 벡터(directory link, junction, alias, parent-path change)는 초록이다.
result: [pending]
coverage_id: 01-VERIFICATION behavior_unverified_items 1

### 3. file-symlink escape 거부 카나리
expected: SeCreateSymbolicLinkPrivilege(또는 Developer Mode)가 있는 Windows 호스트에서 `node --test dist/test/path-boundary.test.js` 를 다시 돌리면 `a file link that escapes the allowed root is refused for both write and removal` 이 skip 이 아니라 실행되어 통과한다.
why_human: 이번 세션 재확인 — skip ('this host cannot create file symlinks without privileges'). directory-link 등가물이 초록이므로 코드 경로 자체는 실행되고 있고, file-link 변종만 not-run 이다.
result: [pending]
coverage_id: 01-VERIFICATION behavior_unverified_items 2

### 4. judgment-tier prohibition 검토 (verifier 판정은 비권위)
expected: 01-01 P2, 01-03, 01-04, 01-11, 01-15 — negative test 가 아니라 소스 판독으로 확인된 5개 prohibition 에 대한 사람의 확인.
why_human: fail-closed 정책 — judgment-tier prohibition 은 절대 조용히 초록이 되지 않는다.
result: [pending]
coverage_id: 01-VERIFICATION human_verification 4

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps
