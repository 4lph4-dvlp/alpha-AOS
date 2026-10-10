---
phase: 22-release-proof
reviewed: 2026-10-10T13:54:42Z
depth: standard
files_reviewed: 24
files_reviewed_list:
  - .github/workflows/ci.yml
  - README.ko.md
  - README.md
  - docs/RELEASE_NOTES_v0.2.0.md
  - docs/SUPPORT_MATRIX_v0.2.0.md
  - package.json
  - scripts/release-evidence.mjs
  - scripts/release.mjs
  - src/adapters/task-receipts.ts
  - src/cli.ts
  - src/core/release-evidence.ts
  - src/core/release-examples.ts
  - src/core/release-fault-proof.ts
  - src/core/release-package-proof.ts
  - src/core/support-matrix.ts
  - src/format.ts
  - test/fixtures/release-development-game.mjs
  - test/helpers/packed-sandbox.ts
  - test/release-evidence.test.ts
  - test/release-examples.test.ts
  - test/release-fault-controls.test.ts
  - test/release-package-proof.test.ts
  - test/support-matrix.test.ts
  - test/tarball-fixture.test.ts
findings:
  critical: 7
  warning: 1
  info: 0
  total: 8
status: issues_found
---

# Phase 22: Code Review Report

**Reviewed:** 2026-10-10T13:54:42Z  
**Depth:** standard  
**Files Reviewed:** 24  
**Status:** issues_found

## Summary

릴리스 증거의 출처와 구조를 검증하지 않아 실행되지 않은 작업을 `PROVEN` 또는 `passed`로 판정할 수 있다. 특히 지원 매트릭스의 실인계 수치, CI 고장 대조, 패키지 호스트 경계, CoursePilot 파일 무결성에 확인 가능한 결함이 있다.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: 정적 예시 인계를 실호스트 검증으로 게시함

**File:** `src/core/support-matrix.ts:368`, `src/core/support-matrix.ts:817`, `docs/SUPPORT_MATRIX_v0.2.0.md:8`  
**Issue:** `BASE_RELEASE_HANDOFFS`에는 고정된 버전, `a1b2...` 같은 예시 해시, 영수증 경로와 `kind: "real", status: "PROVEN"`인 세 항목이 들어 있다. `evaluateReleaseSupportMatrix`는 실제 영수증을 읽거나 양쪽 하네스 호출 및 아티팩트 해시를 대조하지 않고 이 배열을 기본값으로 채택한다. 영수증과 하네스가 전혀 없는 입력에서도 `provenCount: 0`, `realHandoffsCount: 3`이 나왔으며, 커밋된 공개 문서도 같은 주장을 한다.  
**Fix:** 기본 인계는 빈 배열로 두고, 실제 송신·수신 영수증과 동일 아티팩트 해시를 확인한 항목만 `real PROVEN`으로 계산한다. 검증되지 않은 예시가 필요하면 `synthetic` 또는 `UNVERIFIED`로 표시한다.

### CR-02: 종합 릴리스 판정이 하위 증거의 충족 여부를 검사하지 않음

**File:** `src/core/release-evidence.ts:354`, `src/core/release-evidence.ts:480`, `test/release-evidence.test.ts:319`  
**Issue:** 지원 매트릭스 객체가 존재하기만 하면 0개 셀이어도 매트릭스 게이트가 `PROVEN`이다. CI와 패키지 게이트도 `overallStatus/status === "passed"`만 신뢰하고 실제 3개 OS 레그, 5개 고장 대조, 3개 수명주기 단계 및 호스트 범주를 재확인하지 않는다. 통과 테스트 자체가 CI 레그 1개와 빈 매트릭스·패키지 단계로 `isReleaseReady: true`를 기대하므로, 완성되지 않은 증거가 릴리스 승인을 얻는다.  
**Fix:** 집계 직전에 하위 결과의 필수 항목과 수를 검증하거나, 검증 완료된 판정만 생성할 수 있는 생성 경로로 제한한다. 35개 매트릭스 셀의 고유성·상태, CI 세 OS와 다섯 대조, 패키지 필수 단계를 확인하고 누락은 `UNVERIFIED` 및 `blockingGaps`로 기록한다.

### CR-03: CI 고장 대조가 실제 고장 주입을 실행하지 않음

**File:** `test/release-fault-controls.test.ts:18`, `.github/workflows/ci.yml:80`  
**Issue:** 다섯 고장 케이스 테스트는 `passed`, `exitCode`, `failedAssertion`, `logReference`를 메모리에서 생성해 `evaluateFaultCase`에 전달한다. 컨트롤러 충돌, 취소, 중복 효과 등 제품 경로를 실행하거나 고장을 주입하지 않는다. CI에 추가한 단계는 이 테스트를 한 번 더 실행할 뿐인데, 테스트는 이를 `5/5` 고장 감지 증거로 취급한다.  
**Fix:** 각 OS에서 실제 제품 프로세스에 고장을 주입하는 별도 실행기를 추가하고, green/red 실행의 종료 코드·기대 assertion·로그 참조를 수집한 뒤 판정기에 전달한다. 현재 테스트는 판정기 단위 테스트로만 표기한다.

### CR-04: 서로 다른 CI 실행의 OS 결과를 하나의 통과로 결합함

**File:** `src/core/release-fault-proof.ts:188`, `src/core/release-fault-proof.ts:205`  
**Issue:** `evaluateThreeOsRun`은 `runId`를 검사하지 않고 OS별 마지막 레그를 `Map`에 덮어쓴다. 세 OS가 서로 다른 workflow run에서 왔어도 SHA·tarball·상태가 같으면 `passed`가 된다. 재현 시 `runId`가 각각 `0`, `1`, `2`인 세 레그가 `passed`를 반환했다. 단일 후보의 동일 CI 실행이라는 감사 경계가 깨진다.  
**Fix:** 레그가 정확히 세 개이고 OS가 중복되지 않으며, 세 레그의 `runId`가 같고 각 `jobId`와 `logUrl`이 비어 있지 않은지 검사한다. 중복 또는 혼합 실행은 `indeterminate`로 판정한다.

### CR-05: 호스트 범주를 전혀 관찰하지 않아도 패키지 게이트가 통과함

**File:** `src/core/release-package-proof.ts:258`  
**Issue:** `evaluatePackedLifecycle`은 제공된 `hostCategories`에서 `isClean === false`인 항목만 찾는다. 배열이 비어 있거나 5개 필수 범주 중 일부가 빠지면 검사 대상이 없어 `passed`를 반환한다. 빈 배열을 전달한 재현에서도 `status: "passed"`였다. 이 결과를 종합 판정에 전달하면 호스트 무변경 증명이 없는 상태에서 패키지 게이트가 `PROVEN`이 된다.  
**Fix:** `managed_state`, `harness_config`, `harness_policy`, `skills`, `gsd_workflow`의 정확한 한 항목씩을 요구하고 각 범주의 digest·변경 수치·`isClean` 일관성을 검증한다. 누락 또는 불일치는 `indeterminate`로 처리한다.

### CR-06: CoursePilot 다운로드 해시 불일치와 빈 자료 목록을 완료로 처리함

**File:** `src/core/release-examples.ts:213`  
**Issue:** 자료 검증은 `downloaded`, `filePresentOnDisk`, `sourceIdentityVerified`만 확인하고 `expectedSha256`과 `actualSha256`을 비교하지 않는다. 해시가 서로 다른 항목과 빈 `coursePilotMaterials` 배열 모두 `materialsVerified: true`, `overallStatus: "completed"`로 재현됐다. 문서가 주장하는 SHA-256 무결성과 실제 판정이 다르다.  
**Fix:** CoursePilot 사례에서 자료 목록의 비어 있지 않음을 요구하고, 각 다운로드의 예상·실제 해시 형식과 일치 여부를 확인한다. 누락, 불일치 또는 목록 공백은 완료 판정을 막는다.

### CR-07: 한 하네스의 훅 영수증이 다른 하네스의 훅 셀도 증명함

**File:** `src/core/support-matrix.ts:627`  
**Issue:** 훅 영수증 검색은 `status === "passed" && exitCode === 0`만 비교하며 현재 `entry.harnessId`를 연결하지 않는다. `HookExecutionReceipt`에도 하네스 식별자가 없다. 따라서 감지된 Claude, Codex, Antigravity, Pi의 훅 셀에 같은 영수증 하나가 재사용되어 모두 `PROVEN`으로 승격될 수 있다.  
**Fix:** 훅 영수증에 실행 하네스와 버전 또는 검증 가능한 세션 연결을 기록하고, 셀의 하네스·현재 버전·대상 revision과 일치할 때만 승격한다. 기존 영수증은 하네스별 훅 증거로 사용하지 않는다.

## Warnings

### WR-01: `doctor --matrix`가 저장된 skill/MCP/pack 증거를 읽지 않음

**File:** `src/cli.ts:978`, `src/core/support-matrix.ts:693`  
**Issue:** 실제 CLI는 `receiptsRoot`만 전달한다. `evaluateReleaseMatrixCell`의 skill/MCP/pack 분기는 `options.capabilityReceipts` 또는 `options.capabilityLedger`가 주입된 경우에만 영수증을 검사한다. CLI 호출에서는 둘 다 없으므로 호스트에 유효한 능력 영수증이 있어도 해당 15개 셀은 항상 `UNVERIFIED`다.  
**Fix:** CLI에서 저장된 capability 영수증과 ledger를 검증해 전달하거나, 평가 함수가 `receiptsRoot`에서 직접 읽도록 한다. 읽기 실패는 셀별 `UNVERIFIED` 사유로 남긴다.

---

_Reviewed: 2026-10-10T13:54:42Z_  
_Reviewer: inline gsd-code-reviewer workflow_  
_Depth: standard_
