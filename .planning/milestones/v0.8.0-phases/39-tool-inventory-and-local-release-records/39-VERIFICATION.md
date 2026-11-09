---
phase: 39-tool-inventory-and-local-release-records
verified: 2026-11-06T11:37:44Z
status: passed
score: 33/33 must-haves verified
behavior_unverified: 0
overrides_applied: 0
covered_files: [".planning/phases/39-tool-inventory-and-local-release-records/39-01-PLAN.md", ".planning/phases/39-tool-inventory-and-local-release-records/39-01-SUMMARY.md", ".planning/phases/39-tool-inventory-and-local-release-records/39-02-PLAN.md", ".planning/phases/39-tool-inventory-and-local-release-records/39-02-SUMMARY.md", ".planning/phases/39-tool-inventory-and-local-release-records/39-03-PLAN.md", ".planning/phases/39-tool-inventory-and-local-release-records/39-03-SUMMARY.md", ".planning/phases/39-tool-inventory-and-local-release-records/39-04-PLAN.md", ".planning/phases/39-tool-inventory-and-local-release-records/39-04-SUMMARY.md", ".planning/phases/39-tool-inventory-and-local-release-records/39-05-PLAN.md", ".planning/phases/39-tool-inventory-and-local-release-records/39-05-SUMMARY.md", "catalog/tool-handoff-policy.json", "schemas/tool-release-record.schema.json", "src/cli.ts", "src/core/tool-bindings.ts", "src/core/tool-handoff-loader.ts", "src/core/tool-handoff.ts", "src/core/tool-inventory.ts", "src/core/tool-observers.ts", "src/core/tool-record-store.ts", "src/core/tool-records.ts", "src/core/transaction.ts", "src/core/validation.ts", "src/format.ts", "test/tool-bindings.test.ts", "test/tool-handoff-loader.test.ts", "test/tool-handoff.test.ts", "test/tool-inventory-cli.test.ts", "test/tool-inventory-compat.test.ts", "test/tool-inventory-safety.test.ts", "test/tool-inventory.test.ts", "test/tool-observers.test.ts", "test/tool-record-disclosure.test.ts", "test/tool-record-store.test.ts", "test/tool-records.test.ts"]
covered_digest: "v3:sha256:978ffb13117111af3adc9d6cd70fb4591bf54f3044ace98a8cedb0087758dc94"
decision_coverage: {honored: 16, total: 16, not_honored: []}
human_verification:
  - test: "P39-1: 발견과 조회가 관리 소유권 인수로 바뀌지 않는지 별도 금지사항을 검토한다."
    expected: "사용자의 명시적 작업 없는 소유권 인수가 없다."
    why_human: "금지사항에 독립된 enforcement descriptor가 없다. 관련 테스트만으로 별도 판정을 대체하지 않는다."
  - test: "P39-2: 이전 승인 또는 선택 정보가 현재 동작 보장으로 표시되지 않는지 검토한다."
    expected: "현재 관찰과 이전 승인 및 최근 결과가 별도로 제시된다."
    why_human: "독립된 금지사항 enforcement descriptor가 없다."
  - test: "P39-3: 충분한 증거가 있는 인계에 무조건적 재다운로드나 재설치가 필요한지 검토한다."
    expected: "충분한 공식 출처 및 일치 증거가 있으면 재설치가 필수 조건이 아니다."
    why_human: "독립된 금지사항 enforcement descriptor가 없다."
  - test: "A-39-EDGE-01의 LOC-01 미분류 edge를 분류하고 누락 범위를 판단한다."
    expected: "분류 또는 필요한 후속 검증에 대한 명시적 결정이 남는다."
    why_human: "원래 detector가 edge를 분류하지 못했고 기존 fixture는 이 분류를 해소하지 않는다."
---

# Phase 39 검증 보고서

**목표:** Cua를 포함한 관리 외부 도구에 대해 사용자와 downstream 소비자가 하나의 권위 있는 로컬 식별 및 소유권 모델을 조회한다.
**상태:** human_needed. 최초 검증이며 override는 없다. 33/33은 아래 로드맵 및 계획의 긍정적 조건에 대한 점수이며, 별도의 금지사항 세 건과 미분류 edge를 통과시킨 뜻이 아니다.

## 로드맵 성공 기준

| 기준 | 판정 | 코드 및 동작 근거 |
|---|---|---|
| 1. 관리 도구의 버전, 공식 출처, 소유권과 증거 상태 | VERIFIED | `tool-inventory.ts:119-163`이 Cua와 catalog 기반 관찰, 기록 및 하네스 귀속을 결합한다. `tool-observers.test.ts`와 `tool-inventory-cli.test.ts`의 실제 임시 파일 fixture가 이를 확인한다. |
| 2. 체크아웃 밖의 자격 증명 없는 정확한 로컬 기록 | VERIFIED | `tool-records.ts:27,54,77`과 `tool-record-store.ts:44-112`가 경로 증명, 닫힌 레코드 검증 및 트랜잭션을 수행한다. writer→실제 CLI 및 disclosure 테스트가 있다. |
| 3. 네 식별 단계와 실패·중단 시 이전 승인 보존 | VERIFIED | `tool-records.ts:168-181`, `tool-record-store.ts:130-149`의 증거 연결과 기록 처리를 확인했다. 실패 후 승인 보존 및 interrupted 테스트가 있다. |
| 4. 자체 구성요소 분류 및 안전한 기존 설치 인계 계약 | VERIFIED | `tool-inventory.ts`가 skill/library/prerequisite/harness 분류를 생성하고 `tool-handoff.ts:32-73`이 출처·무결성·현재 일치 증거를 요구한다. 실제 호스트 신뢰는 아래 제한 참조. |

## 계획별 조건

각 행은 계획 frontmatter의 개별 truth이며 순서는 원문과 같다. 아래 테스트는 최종 소스에 대한 기존 79개 대상 테스트 결과와 코드 검토에 근거한다.

| 계획 | 조건 | 상태 | 근거 |
|---|---|---|---|
| 01-1 | Cua 관찰과 선택 핀 구분 | VERIFIED | `tool-inventory-cli.test.ts` 실제 임시 Cua 파일 및 CLI |
| 01-2 | 기록 부재·unknown 구분, 읽기 시 미생성 | VERIFIED | `tool-records.ts:77`, CLI 및 records 테스트 |
| 01-3 | requested/resolved/installed/verified 및 증거 구분 | VERIFIED | `tool-records.ts` 계약, schema 및 CLI 기록 테스트 |
| 01-4 | 빈 이력 및 무효 작업 구분 | VERIFIED | `tool-records.test.ts` 빈 저장소/검증 테스트 |
| 01-5 | 이벤트 멱등성 및 충돌 식별 | VERIFIED | `tool-records.ts`, records/store 충돌 테스트 |
| 02-1 | 명시적 기록 writer→inventory CLI | VERIFIED | `tool-record-store.test.ts` writer와 production CLI |
| 02-2 | 외부 root 증명 후 쓰기 | VERIFIED | `proveToolRecordRoot`, store unsafe root 및 ancestor 테스트 |
| 02-3 | 실패·부분·중단 시 이전 승인 보존 | VERIFIED | store partial/interrupted 테스트; 독립 실행한 partial 테스트 통과 |
| 02-4 | 재시도 멱등성 및 경쟁 writer 거부 | VERIFIED | store retry/lock 테스트와 `acquireMutationSession` |
| 02-5 | 동률을 포함한 결정적 최신순 | VERIFIED | store equal timestamps 테스트 및 reader 정렬 |
| 02-6 | 기록 commit과 검증 승인 분리 | VERIFIED | records proof/journal 및 store terminal rename 테스트 |
| 03-1 | 모든 관리 도구와 absent/unknown | VERIFIED | observer catalog seed 및 bounded 관찰 테스트 |
| 03-2 | 수동·다중 설치와 소유권 분리 | VERIFIED | observer multiple 후보 및 bindings 소유권 테스트 |
| 03-3 | 실제 경로로 하네스 귀속, 불명확성 유지 | VERIFIED | `tool-bindings.ts:33,83` 및 bindings 테스트 |
| 03-4 | 공유/버전 분리와 충돌 진단 | VERIFIED | bindings version split 및 inventory 상태 테스트 |
| 03-5 | 설치와 연결 소유권의 별도 근거 | VERIFIED | bindings 모델 및 소유권 테스트 |
| 03-6 | bounded 읽기와 조회 부작용 금지 | VERIFIED | `boundedText`; safety 네트워크/subprocess/writer sentinel 테스트 |
| 04-1 | 충분한 증거의 인계 평가, 재설치 불필요 | VERIFIED | `evaluateLegacyHandoff` 및 synthetic chain 테스트; production npm 경로는 아래 범위에 한정 |
| 04-2 | 자체 hash/핀/버전만으로 신뢰 금지 | VERIFIED | handoff insufficient chain 테스트와 `tool-handoff.ts:42-56` |
| 04-3 | 이전 소유권·증거·변경 보존 | VERIFIED | `LegacyToolEvidence`, handoff writer 및 chain 테스트 |
| 04-4 | 현재·승인·최근 결과 독립 | VERIFIED | `reconcileToolState` 및 inventory 테스트 |
| 04-5 | 실패 후 변경/관찰 불가를 이전 정상으로 오인하지 않음 | VERIFIED | 별도 실행한 scoped reconciliation 테스트 통과 |
| 04-6 | 연동 검사는 실행하지 않고 미검증 이유 제시 | VERIFIED | inventory 모델과 CLI Cua 테스트의 unverified 출력 |
| 05-1 | 관리 도구 상세와 구성요소 요약/detail | VERIFIED | `format.ts:60-66`, CLI detail 테스트 |
| 05-2 | 문제 우선, 후보 및 하네스 관계 보존 | VERIFIED | `orderToolObservations`, bindings/ordering 테스트 |
| 05-3 | 기본 및 상세 출력의 식별/증거 | VERIFIED | formatter와 CLI/detail 테스트 |
| 05-4 | 도구 이력 및 다중 도구 작업 결과 | VERIFIED | `cli.ts:1051-1064`, CLI mixed-operation 테스트 |
| 05-5 | 사람/JSON 출력의 동일 데이터 | VERIFIED | 동일 모델의 formatter 및 CLI mixed-operation 비교 |
| 05-6 | 기존 동기 소비 계약 및 읽기 부작용 금지 | VERIFIED | `cli.ts:936,1085` 등과 compat/safety 테스트 |

## 산출물, 연결 및 데이터 흐름

5개 계획의 artifact 검사 결과는 각각 7/7, 3/3, 6/6, 6/6, 4/4 통과했다. 15개 선언된 key link도 도구의 패턴 검사상 통과했다. 이는 단순 패턴 검사이므로 핵심 호출을 별도 확인했다: CLI → `collectToolInventory` → `observeManagedTools`/`readToolRecordStore`/`attributeToolInstallations` → formatter, CLI history → 공통 record reader, writer → lock 및 `applyFileTransaction`. 렌더 데이터는 catalog와 실제 bounded 파일 관찰, 검증된 record event에서 온다. fixture 자체가 실제 호스트 증거를 뜻하지는 않는다.

## 테스트 및 품질

| 검사 | 결과 |
|---|---|
| 독립 명명 테스트: `node --test --test-name-pattern='partial operations retain prior acceptance' dist/test/tool-record-store.test.js` | 통과 1/1; 약 13초로 권장 10초를 초과했다. |
| 독립 명명 테스트: `node --test --test-name-pattern='collector reconciles scoped file proofs' dist/test/tool-inventory.test.js` | 통과 1/1; 약 10초. |
| 독립 명명 테스트: `node --test --test-name-pattern='collector authenticates a retained npm registry signature' dist/test/tool-handoff-loader.test.js` | 통과 1/1; 합성 키와 범위 제한된 manifest 증거. |
| 최종 targeted 실행 로그 `alpha-aos-phase39-final-targeted.log` | 79 통과, 0 실패/취소/skip. 상위 실행자가 build, check 및 tarball audit도 통과했다고 전달했다. 전체 `npm test`는 취소되었고 통과로 주장하지 않는다. |
| 테스트 품질 | `test/tool-*.test.ts`에 skip/todo 표기 없음. fixture는 독립적으로 값과 상태를 비교하며, 실제 설치 소스 증거로 해석하지 않는다. |
| debt marker | `src/core/tool-*.ts`, `test/tool-*.test.ts`, schema에서 미해결 TBD/FIXME/XXX 없음. |
| probe | 계획에 실행할 `probe-*.sh`가 선언되지 않아 해당 없음. |

## 요구사항 및 결정

| 요구사항 | 판정 | 근거 |
|---|---|---|
| LOC-01 | SATISFIED, 단 A-39-EDGE-01 별도 확인 필요 | 관찰·출처·소유권 모델과 CLI. 실호스트 및 다른 OS는 검증하지 않았다. |
| LOC-04 | SATISFIED | schema, 외부 기록 writer/reader 및 실제 CLI fixture. 실제 신뢰 증거가 없는 경우 verified로 승격하지 않는다. |

두 요구사항은 모두 계획에서 선언되었으며 이 단계에 매핑된 고아 요구사항은 없다. Decision coverage 도구 결과는 16/16이며 비차단 휴리스틱이다. 보안 보고서는 `threats_open: 0`이나 실제 호스트의 출처 검증이나 시스템 전체에 대한 인증은 아니다. 재검토된 정책 `catalog/tool-handoff-policy.json`의 packages와 keys는 비어 있다. 따라서 production npm loader는 현재 실제 호스트에 대한 신뢰를 주장하지 않고 `needs-evidence`로 남긴다. Loader의 ready 판정은 registry 서명·아티팩트 digest·`package.json` 범위의 바이트 일치에 국한되며 전체 설치의 검증이 아니다. 소스별 공식 검증 정책이 승인되었고 모든 출처에 대한 일괄 서명 요구로 해석하지 않는다.

## 사람의 결정 필요

위 frontmatter의 P39-1, P39-2, P39-3은 descriptor 없는 `unverified-prohibition — human review recommended` 항목이다. 인접 테스트가 유용한 증거지만 별도 금지사항 판정을 대체하지 않는다. A-39-EDGE-01도 미분류 상태다. 각 항목을 검토해 명시적으로 해결하거나 적절한 검증을 연결해야 한다. 선택적인 실제 호스트 확인을 수행한다면 도구·플랫폼·하네스와 근거/누락을 기록해야 하며, 수행하지 않은 플랫폼이나 연동은 검증된 것으로 표시하지 않는다.

_검증자: gsd-verifier. 커밋하지 않음._
