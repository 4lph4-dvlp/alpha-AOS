---
status: testing
phase: 01-safe-operation-boundary
source: 01-01-SUMMARY.md, 01-02-SUMMARY.md, 01-03-SUMMARY.md, 01-04-SUMMARY.md, 01-05-SUMMARY.md, 01-06-SUMMARY.md, 01-07-SUMMARY.md, 01-08-SUMMARY.md, 01-09-SUMMARY.md, 01-11-SUMMARY.md, 01-12-SUMMARY.md, 01-13-SUMMARY.md, 01-14-SUMMARY.md, 01-15-SUMMARY.md, 01-16-SUMMARY.md
started: 2026-09-04T14:20:46Z
updated: 2026-09-04T14:20:46Z
---

## Current Test
<!-- OVERWRITE each test - shows where we are -->

number: 1
name: 미리보기가 다섯 개 표면을 바이트 단위로 보존한다 (SAFE-01)
expected: |
  `node --test dist/test/preview.test.js` 가 8개 테스트를 전부 통과하고, CLI 미리보기와 네 개 wrapper 모두 checkout·home·state·package·harness 표면을 그대로 둔다. wrapper 계열 4개가 실제로 실행되고 not-run 목록이 비어 있다. Wave 0 SAFE-01 tracer는 이 phase 내내 빨간불이었으나 이제 초록이다.
awaiting: user response

## Tests

### 1. 미리보기가 다섯 개 표면을 바이트 단위로 보존한다 (SAFE-01)
expected: `node --test dist/test/preview.test.js` 가 8개 테스트를 전부 통과하고, CLI 미리보기와 네 개 wrapper 모두 checkout·home·state·package·harness 표면을 그대로 둔다. wrapper 계열 4개가 실제로 실행되고 not-run 목록이 비어 있다. Wave 0 SAFE-01 tracer는 이 phase 내내 빨간불이었으나 이제 초록이다.
result: [pending]
coverage_id: 01-01 D1

### 2. 어떤 표면에도 비밀값이 남지 않고, 가려진 값은 눈에 보인다 (SAFE-04)
expected: `node --test dist/test/redaction.test.js` 가 14개 통과하고 todo 가 0이다. 사람용·JSON·에러 채널이 모두 같은 redaction seam 을 통과하며, doctor 출력이 `[redacted:<kind>]` 표기 계약을 명시해 독자가 '가려진 값'과 '버그'를 구분할 수 있다.
result: [pending]
coverage_id: 01-01 D2, 01-03 D4

### 3. 모호하거나 미지 버전인 관리 문서는 mutation 전에 거절된다 (SAFE-05)
expected: `node --test dist/test/validation.test.js` 통과. 중복 키, 다중 문서 스트림, 닫힌 스키마 위반, 알 수 없는 상위 schemaVersion 은 렌더링이나 쓰기가 시작되기 전에 코드화된 이유와 함께 거절된다.
result: [pending]
coverage_id: 01-01 D3

### 4. 경로 봉쇄가 설정 경로와 canonical 해석 양쪽에서 성립한다 (SAFE-02)
expected: `node --test dist/test/path-boundary.test.js` 통과(2건은 권한이 필요한 link fixture 로 not-run 보고). 탈출하는 canonical 경로의 쓰기는 거절되고, 바깥 sentinel 은 변하지 않는다.
result: [pending]
coverage_id: 01-02 D1, 01-07 D5

### 5. 경쟁 writer 는 즉시 실패하고, 중단된 쓰기는 hash 로 판별 가능하다 (SAFE-03)
expected: `node --test dist/test/transaction-crash.test.js` 10개 통과. 두 번째 writer 는 1초 내에 active operation 의 id·pid·시작시각과 함께 실패하고 lock 을 지우지 않는다. 경과 시간이나 죽은 pid 는 해제 근거가 되지 않으며(needs-repair), 모든 durable 경계가 before/after/neither 로 분류 가능한 journal 을 남긴다.
result: [pending]
coverage_id: 01-02 D3, 01-02 D4

### 6. 외부 명령은 shell 없이, 선언된 환경 이름만으로, 경계 안에서 실행된다 (SAFE-06)
expected: `node --test dist/test/process.test.js` 통과. src/ 의 어떤 모듈도 adapter 밖에서 child 를 spawn 하지 않고 ambient 환경을 퍼뜨리지 않는다. 실패는 코드·exit·fingerprint 로만 보고되고 raw 출력은 인용되지 않는다. MCP filter proxy 도 allowlist 환경으로 실행되며 stderr 를 bounded excerpt 로 흡수한다.
result: [pending]
coverage_id: 01-02 D5, 01-08 D5

### 7. 하나의 operation 이 하나의 writer 만 쓴다
expected: managed install 이 aggregate plan 을 재검증한 뒤 session 을 하나만 획득하고, GSD/ECC/MCP fixture 와 모든 component apply 가 그 session 을 공유한다. CLI 의 bootstrap route 는 자체 external mutation 을 하지 않고 두 번째 lock 도 잡지 않는다. 각 callee 의 session 인지는 개별 suite 로 증명돼 있으나, 전체를 한 번에 도는 end-to-end 테스트는 없다(실행하면 테스트 머신에 GSD·ECC 가 전역 설치되므로).
result: [pending]
coverage_id: 01-14 D9, 01-15 D7

### 8. 실패 증거는 typed·bounded 이며 raw 출력이나 credential 을 담지 않는다
expected: component 거절은 `ComponentPlanError` 코드(plan-drift, source-drift, unplanned-path, session-mismatch 등)와 경로만 담는다. 자식 프로세스 결과는 `describeProcessFailure` 를 통해 코드·exit·fingerprint 로만 보고된다.
result: [pending]
coverage_id: 01-12 D6

### 9. isolation 하드닝이 후속 phase 동작을 끌어오지 않았다
expected: isolation.ts 변경은 plan/session/transaction 배선뿐이다. project-pack 선택, tree-off 상속, sealed fallback, 전체 uninstall, 일반 repair 는 추가되지 않았고 sealed 는 여전히 같은 adapter 경로로 fail-closed 다.
result: [pending]
coverage_id: 01-13 D9

### 10. 이전 wave 가 남긴 fixture gap 이 실제로 닫혔다
expected: 세 fixture 모두 plan 에서 root 를 이름 짓고 non-recursive mkdir 로 만든다 — fixture 경로에서 `mkdtemp` 가 사라졌다. ECC skill sync 는 fixture plan 을 embed 해 `<targetRoot>/<skill>/SKILL.md` 를 review 시점에 bind 한다. 01-11 과 01-12 가 미뤄둔 gap 이다.
result: [pending]
coverage_id: 01-11 D4, 01-12 D7

### 11. 미구현으로 남은 항목이 숨겨지지 않고 명시돼 있다
expected: `openProtocolProcess` 는 여전히 없다. mcp-fixture.ts 는 장수명 JSON-RPC child 를 직접 spawn 하며, 이것이 test/process.test.ts 에서 명시적 예외로 assert 되어 조용히 넓어질 수 없다. phase 1 의 어떤 plan 도 이걸 소유하지 않았다.
result: [pending]
coverage_id: 01-11 D5, 01-14 D10

### 12. smol-toml 공급망 판단이 lock 작성 전에 기록됐다
expected: smol-toml@1.8.0 의 신원 검토와 명시적 승인 판단이 01-04 게이트에서 기록되고 integrity 에 바인딩됐으며, 01-05 가 lock 을 쓰기 전에 그 integrity 를 검증했다.
result: [pending]
coverage_id: 01-04 D1

### 13. Windows unknown-reparse 권한 fixture
expected: 권한이 필요한 reparse fixture 를 만들어 dry-run 과 apply 시도가 안정적인 unsupported 거절 코드를 내고 바깥 sentinel hash 가 불변인지 확인한다. 이 호스트에서는 `fsutil reparsepoint` 가 비권한이라 실행할 수 없으며, 그 경우 pass 가 아니라 not-run 으로 보고돼야 한다.
result: [pending]
coverage_id: 01-02 D2, 01-07 D4

### 14. 3-OS 안전 경계 게이트
expected: `.github/workflows/ci.yml` 이 Windows·macOS·Linux 각각에서 `npm run check`, 전체 suite, `npm run build:check`, 그리고 Phase 1 안전 suite 를 파일명으로 지정해 실행한다. 로컬에서는 Windows 에서만 관측됐고(네 wrapper 전부 실행, not-run 비어 있음), 나머지 두 leg 은 첫 CI 실행에서 확인된다.
result: [pending]
coverage_id: 01-16 D5

### 15. A secret-bearing nested Error reaches a support preview as typed placeholders with no raw value
expected: A secret-bearing nested Error reaches a support preview as typed placeholders with no raw value
result: pass
source: automated
coverage_id: D1 (01-03-SUMMARY.md)

### 16. Recursive redaction is bounded on cycles, depth, item count and string length
expected: Recursive redaction is bounded on cycles, depth, item count and string length
result: pass
source: automated
coverage_id: D2 (01-03-SUMMARY.md)

### 17. Private path aliases are segment-aware across roots, separators and case
expected: Private path aliases are segment-aware across roots, separators and case
result: pass
source: automated
coverage_id: D3 (01-03-SUMMARY.md)

### 18. Malformed, ambiguous, closed-world-violating and unknown-newer documents are rejected before mutation across all nine managed kinds
expected: Malformed, ambiguous, closed-world-violating and unknown-newer documents are rejected before mutation across all nine managed kinds
result: pass
source: automated
coverage_id: D1 (01-05-SUMMARY.md)

### 19. Validation never coerces, defaults or strips the input it is judging
expected: Validation never coerces, defaults or strips the input it is judging
result: pass
source: automated
coverage_id: D2 (01-05-SUMMARY.md)

### 20. Issues are deterministic, sorted and capped, with truncation reported rather than silent
expected: Issues are deterministic, sorted and capped, with truncation reported rather than silent
result: pass
source: automated
coverage_id: D3 (01-05-SUMMARY.md)

### 21. Only a registered namespace with a passing schema contributes typed data; every other extension is preserved and inert
expected: Only a registered namespace with a passing schema contributes typed data; every other extension is preserved and inert
result: pass
source: automated
coverage_id: D4 (01-05-SUMMARY.md)

### 22. Version routing separates current, migratable and unknown-newer, and produces a deterministic non-mutating migration plan
expected: Version routing separates current, migratable and unknown-newer, and produces a deterministic non-mutating migration plan
result: pass
source: automated
coverage_id: D5 (01-05-SUMMARY.md)

### 23. Exact audited dependency versions resolve with the reviewed integrity
expected: Exact audited dependency versions resolve with the reviewed integrity
result: pass
source: automated
coverage_id: D6 (01-05-SUMMARY.md)

### 24. Catalog refuses duplicate, multi-document, alias-bomb, unknown-core and unknown-newer input before returning a value
expected: Catalog refuses duplicate, multi-document, alias-bomb, unknown-core and unknown-newer input before returning a value
result: pass
source: automated
coverage_id: D1 (01-06-SUMMARY.md)

### 25. An unregistered catalog extension round-trips but cannot change the install plan digest
expected: An unregistered catalog extension round-trips but cannot change the install plan digest
result: pass
source: automated
coverage_id: D2 (01-06-SUMMARY.md)

### 26. A candidate lock is never accepted as stable authority, and a non-exact version is not a lock
expected: A candidate lock is never accepted as stable authority, and a non-exact version is not a lock
result: pass
source: automated
coverage_id: D3 (01-06-SUMMARY.md)

### 27. A supported older lock is readable but not authoritative
expected: A supported older lock is readable but not authoritative
result: pass
source: automated
coverage_id: D4 (01-06-SUMMARY.md)

### 28. An invalid or migratable project manifest contributes no detection evidence, and an unregistered extension cannot select capabilities
expected: An invalid or migratable project manifest contributes no detection evidence, and an unregistered extension cannot select capabilities
result: pass
source: automated
coverage_id: D5 (01-06-SUMMARY.md)

### 29. A path whose canonical form escapes the allowed root is refused even though the configured path is inside it
expected: A path whose canonical form escapes the allowed root is refused even though the configured path is inside it
result: pass
source: automated
coverage_id: D1 (01-07-SUMMARY.md)

### 30. All seven path roles are proven up front and a path discovered during apply cannot be proven late
expected: All seven path roles are proven up front and a path discovered during apply cannot be proven late
result: pass
source: automated
coverage_id: D2 (01-07-SUMMARY.md)

### 31. An ancestor retargeted or replaced after preflight fails the immediate recheck
expected: An ancestor retargeted or replaced after preflight fails the immediate recheck
result: pass
source: automated
coverage_id: D3 (01-07-SUMMARY.md)

### 32. Shell metacharacters in an argument stay data and execute no side effect
expected: Shell metacharacters in an argument stay data and execute no side effect
result: pass
source: automated
coverage_id: D1 (01-08-SUMMARY.md)

### 33. Only declared environment names cross the boundary, case collisions refuse, and the platform floor is declared
expected: Only declared environment names cross the boundary, case collisions refuse, and the platform floor is declared
result: pass
source: automated
coverage_id: D2 (01-08-SUMMARY.md)

### 34. Timeouts and output caps terminate the child tree and return typed bounded evidence
expected: Timeouts and output caps terminate the child tree and return typed bounded evidence
result: pass
source: automated
coverage_id: D3 (01-08-SUMMARY.md)

### 35. A captured result carries no raw secret; npm/npx normalize and arbitrary shims are unsupported
expected: A captured result carries no raw secret; npm/npx normalize and arbitrary shims are unsupported
result: pass
source: automated
coverage_id: D4 (01-08-SUMMARY.md)

### 36. A competing writer fails fast with operation metadata and never removes the lock; readers stay available
expected: A competing writer fails fast with operation metadata and never removes the lock; readers stay available
result: pass
source: automated
coverage_id: D1 (01-09-SUMMARY.md)

### 37. An abandoned-looking lock is needs-repair and is never cleared by elapsed time or a missing pid
expected: An abandoned-looking lock is needs-repair and is never cleared by elapsed time or a missing pid
result: pass
source: automated
coverage_id: D2 (01-09-SUMMARY.md)

### 38. Every durable boundary leaves the target classifiable and the journal present
expected: Every durable boundary leaves the target classifiable and the journal present
result: pass
source: automated
coverage_id: D3 (01-09-SUMMARY.md)

### 39. Repair diagnosis is read-only with a stable digest; apply performs only a proven transition and drift blocks it
expected: Repair diagnosis is read-only with a stable digest; apply performs only a proven transition and drift blocks it
result: pass
source: automated
coverage_id: D4 (01-09-SUMMARY.md)

### 40. The transaction consumes a complete path proof and rechecks it before every mutation
expected: The transaction consumes a complete path proof and rechecks it before every mutation
result: pass
source: automated
coverage_id: D5 (01-09-SUMMARY.md)

### 41. No source module spawns a child outside the process adapter or spreads the ambient environment
expected: No source module spawns a child outside the process adapter or spreads the ambient environment
result: pass
source: automated
coverage_id: D1 (01-11-SUMMARY.md)

### 42. Fixture and installer children receive only the names their operation declares
expected: Fixture and installer children receive only the names their operation declares
result: pass
source: automated
coverage_id: D2 (01-11-SUMMARY.md)

### 43. A failed fixture or installer step is described without quoting raw output
expected: A failed fixture or installer step is described without quoting raw output
result: pass
source: automated
coverage_id: D3 (01-11-SUMMARY.md)

### 44. The plan enumerates every path role, source hash, declared child and environment name, and creates nothing
expected: The plan enumerates every path role, source hash, declared child and environment name, and creates nothing
result: pass
source: automated
coverage_id: D1 (01-12-SUMMARY.md)

### 45. A standalone apply acquires exactly one writer after complete revalidation and releases it
expected: A standalone apply acquires exactly one writer after complete revalidation and releases it
result: pass
source: automated
coverage_id: D2 (01-12-SUMMARY.md)

### 46. A nested apply consumes the caller's session, takes no second lock, journals under the caller's operation and does not release the caller's writer
expected: A nested apply consumes the caller's session, takes no second lock, journals under the caller's operation and does not release the caller's writer
result: pass
source: automated
coverage_id: D3 (01-12-SUMMARY.md)

### 47. A plan that no longer matches a re-read refuses with zero mutations, zero processes and an unchanged target
expected: A plan that no longer matches a re-read refuses with zero mutations, zero processes and an unchanged target
result: pass
source: automated
coverage_id: D4 (01-12-SUMMARY.md)

### 48. A caller session that owns a different state root is refused before any mutation
expected: A caller session that owns a different state root is refused before any mutation
result: pass
source: automated
coverage_id: D5 (01-12-SUMMARY.md)

### 49. Every mutation publishes a complete read-only plan that names its path roles and writes nothing
expected: Every mutation publishes a complete read-only plan that names its path roles and writes nothing
result: pass
source: automated
coverage_id: D1 (01-13-SUMMARY.md)

### 50. A standalone apply acquires one writer after complete revalidation and releases it
expected: A standalone apply acquires one writer after complete revalidation and releases it
result: pass
source: automated
coverage_id: D2 (01-13-SUMMARY.md)

### 51. A nested apply consumes the caller's session, takes no second lock, and does not release the caller's writer
expected: A nested apply consumes the caller's session, takes no second lock, and does not release the caller's writer
result: pass
source: automated
coverage_id: D3 (01-13-SUMMARY.md)

### 52. An active writer blocks these mutations while plans, status and doctor stay readable
expected: An active writer blocks these mutations while plans, status and doctor stay readable
result: pass
source: automated
coverage_id: D4 (01-13-SUMMARY.md)

### 53. A plan that no longer matches a re-read refuses with zero mutations and an unchanged target
expected: A plan that no longer matches a re-read refuses with zero mutations and an unchanged target
result: pass
source: automated
coverage_id: D5 (01-13-SUMMARY.md)

### 54. A removal is journaled and snapshotted rather than deleted outright
expected: A removal is journaled and snapshotted rather than deleted outright
result: pass
source: automated
coverage_id: D6 (01-13-SUMMARY.md)

### 55. Plans and results never serialize the documents they read
expected: Plans and results never serialize the documents they read
result: pass
source: automated
coverage_id: D7 (01-13-SUMMARY.md)

### 56. Unrelated user-owned configuration survives every managed write
expected: Unrelated user-owned configuration survives every managed write
result: pass
source: automated
coverage_id: D8 (01-13-SUMMARY.md)

### 57. The aggregate plan enumerates every fixture, component and external step, and creates nothing
expected: The aggregate plan enumerates every fixture, component and external step, and creates nothing
result: pass
source: automated
coverage_id: D1 (01-14-SUMMARY.md)

### 58. A reviewed plan re-read with its own fixture roots is digest-stable, and a plan naming fresh roots is a different plan
expected: A reviewed plan re-read with its own fixture roots is digest-stable, and a plan naming fresh roots is a different plan
result: pass
source: automated
coverage_id: D2 (01-14-SUMMARY.md)

### 59. No fixture calls mkdtemp; each creates the root its plan named, exclusively
expected: No fixture calls mkdtemp; each creates the root its plan named, exclusively
result: pass
source: automated
coverage_id: D3 (01-14-SUMMARY.md)

### 60. One operation writes several journals without collision, and repair reads all of them
expected: One operation writes several journals without collision, and repair reads all of them
result: pass
source: automated
coverage_id: D4 (01-14-SUMMARY.md)

### 61. The session is acquired before the first external child; a contended root runs nothing
expected: The session is acquired before the first external child; a contended root runs nothing
result: pass
source: automated
coverage_id: D5 (01-14-SUMMARY.md)

### 62. A wrapper operation refuses a missing or stale build artifact with a stable digest and no mutation
expected: A wrapper operation refuses a missing or stale build artifact with a stable digest and no mutation
result: pass
source: automated
coverage_id: D6 (01-14-SUMMARY.md)

### 63. An update binds the exact remote OID, refuses a dirty checkout, and refuses a target object it cannot inspect locally
expected: An update binds the exact remote OID, refuses a dirty checkout, and refuses a target object it cannot inspect locally
result: pass
source: automated
coverage_id: D7 (01-14-SUMMARY.md)

### 64. External evidence is durable and honest; a failed step never claims a rollback
expected: External evidence is durable and honest; a failed step never claims a rollback
result: pass
source: automated
coverage_id: D8 (01-14-SUMMARY.md)

### 65. A support bundle preview creates nothing and offers no destination but the local one
expected: A support bundle preview creates nothing and offers no destination but the local one
result: pass
source: automated
coverage_id: D1 (01-15-SUMMARY.md)

### 66. An applied bundle is written through the transaction under one session, and journal evidence carries no secret
expected: An applied bundle is written through the transaction under one session, and journal evidence carries no secret
result: pass
source: automated
coverage_id: D2 (01-15-SUMMARY.md)

### 67. Snapshot sources contribute metadata only, never bytes
expected: Snapshot sources contribute metadata only, never bytes
result: pass
source: automated
coverage_id: D3 (01-15-SUMMARY.md)

### 68. Every observable surface redacts, and says so legibly
expected: Every observable surface redacts, and says so legibly
result: pass
source: automated
coverage_id: D4 (01-15-SUMMARY.md)

### 69. The repair diagnosis is readable and mutates nothing
expected: The repair diagnosis is readable and mutates nothing
result: pass
source: automated
coverage_id: D5 (01-15-SUMMARY.md)

### 70. Every new mutating route previews without touching any mutation surface or creating the state root
expected: Every new mutating route previews without touching any mutation surface or creating the state root
result: pass
source: automated
coverage_id: D6 (01-15-SUMMARY.md)

### 71. No wrapper contains a direct git, npm, build or link command, or a fallback that would run one
expected: No wrapper contains a direct git, npm, build or link command, or a fallback that would run one
result: pass
source: automated
coverage_id: D1 (01-16-SUMMARY.md)

### 72. Each wrapper family previews without changing the checkout, package sentinel, home, harness roots or state root
expected: Each wrapper family previews without changing the checkout, package sentinel, home, harness roots or state root
result: pass
source: automated
coverage_id: D2 (01-16-SUMMARY.md)

### 73. A wrapper refuses without a verified artifact and delegates with one, changing nothing either way
expected: A wrapper refuses without a verified artifact and delegates with one, changing nothing either way
result: pass
source: automated
coverage_id: D3 (01-16-SUMMARY.md)

### 74. The build artifact manifest binds the exact sources a build consumed and the files it produced
expected: The build artifact manifest binds the exact sources a build consumed and the files it produced
result: pass
source: automated
coverage_id: D4 (01-16-SUMMARY.md)

## Summary

total: 74
passed: 60
issues: 0
pending: 14
skipped: 0
blocked: 0

## Gaps

[none yet]
