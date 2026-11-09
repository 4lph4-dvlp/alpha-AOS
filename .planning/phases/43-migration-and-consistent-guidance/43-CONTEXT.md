# Phase 43: Migration and Consistent Guidance - Context

**Gathered:** 2026-11-09
**Status:** Ready for planning

<domain>
## Phase Boundary

기존 stable-lock 및 Cua 핀 설치 환경을 사용자의 변경 사항과 기존 소유권 증거를 유지한 채 로컬 관리(`tool-records`)로 안전하게 마이그레이션(MIG-01)한다.
설치(installation), 네이티브 설정(native configuration), 진단(doctor/diagnostics), 프로젝트 격리(isolation), 복구(recovery) 등 모든 소비자 모듈이 숨겨진 내부 번들 핀이나 정적 락파일 대신 동일한 로컬 버전 기록을 단일 진실 공급원(SSOT)으로 참조하도록 전환(MIG-02)한다.
CLI 도움말과 영한 문서에서 외부 도구 릴리스 업데이트와 alpha-AOS 자체 코드 업데이트(npm 배포 / 로컬 워크스테이션 `npm run deploy:local`)를 엄격히 구분하고 패치 배포 절차를 명확히 안내(MIG-03)한다.
컴포넌트/플랫폼/하네스별 실제 연동 결과와 공유 의존성/설정 영향을 단일 거짓 성공/실패가 아닌 구조화된 상태(retained/updated/failed/recovered/unverified)로 일관되게 제공(MIG-04)한다.

기존 파일 트랜잭션 롤백과 로컬 기록 관리를 기반으로 하되, 무조건적인 파일 덮어쓰기나 임의 삭제를 금지하며 비파괴 원칙을 철저히 유지한다.
배경/야간 자동 갱신 및 스케줄링된 자동 프로모션은 비활성화 상태를 유지한다.

</domain>

<decisions>
## Implementation Decisions

### 레거시 설치 감지 및 마이그레이션 진입점 (MIG-01)
- **D-01:** 전용 `alpha-aos migrate` 명령 제공 + 기존 명령(install/update/doctor) 감지 시 안내 및 연계 지원 — 독립된 프리뷰/검증을 보장하면서 일반 명령 실행 중 레거시 발견 시 마이그레이션 경로를 명확히 제시한다. — **Reversibility:** costly — CLI 명령 트리 및 옵션 체계 추가
- **D-02:** 전체 일괄 마이그레이션을 기본으로 하되, `--tool` 및 `--target` 플래그로 개별 도구/하네스 선별 마이그레이션을 허용한다 (Phase 40의 install/update 플래그 규칙과 일관성 유지). — **Reversibility:** reversible
- **D-03:** SAFE-01 원칙 준수: 기본 실행은 읽기 전용 프리뷰를 출력하고, 실제 적용 시에는 검토된 계획 다이제스트(`--digest`) 및 `--apply` 바인딩을 요구한다 (Phase 2/14/40 패턴 일치). — **Reversibility:** costly — 안전 및 트랜잭션 바인딩 계약
- **D-04:** 레거시 설정 파일(예: `catalog/stack.lock.json`)은 임의 삭제하지 않고 폐기 마킹/유지하며, 로컬 스토어에 `type: 'migrate'` 작업 및 이전 출처·소유권 증거를 원자적으로 기록한다 (비파괴 안전성 및 추적성 보장). — **Reversibility:** one-way — 로컬 레코드 영구 저장 및 레거시 폐기 상태 전환

### 사용자 수정 설정 충돌 시 보존 정책 (MIG-01)
- **D-05:** 비파괴 안전 입양 — 사용자 수정 파일이 감지되면 원본을 `.user-backup`으로 자동 백업 보존하고, 로컬 기록에 `modified` 상태와 이전 증거를 기록한 뒤 입양을 완료한다. — **Reversibility:** costly — 백업 스키마 및 파일 시스템 저장 정책
- **D-06:** 마커 경계 기반 선택적 보존 — 하네스 설정에 alpha-AOS 소유 마커/키 영역이 존재하는 경우 해당 영역만 로컬 도구 기록에 바인딩하고, 사용자의 고유 커스텀 섹션은 파일 내에 그대로 온전히 유지한다. — **Reversibility:** reversible
- **D-07:** 명시적 해결 경로 제공 — 프리뷰에서 소유권이나 출처가 모호한(ambiguous) 항목을 별도 섹션으로 격리하고, 자동 덮어쓰기 없이 `--resolve-ownership` (external/alpha-aos 선택) 플래그를 통한 명시적 해결을 요구한다. — **Reversibility:** costly — 소유권 판별 및 CLI 강제 해석 규칙
- **D-08:** doctor 및 inventory에 수정 상태 통합 진단 — inventory에 `modified (backup: .user-backup)` 태그를 표시하고, doctor에서 백업 보존 무결성 및 정돈 상태를 진단 항목으로 제공한다. — **Reversibility:** reversible

### 기존 소비자 내부 핀 제거 및 폴백 처리 (MIG-02)
- **D-09:** Fail-closed 원칙 적용 — 소비자 모듈 실행 시 로컬 도구 기록이 없으면 숨겨진 핀으로 자동 폴백하지 않고, 명시적 `install` 또는 `migrate` 실행을 요구하며 즉시 중단한다 (버전 불일치 및 암묵적 회귀 원천 차단). — **Reversibility:** costly — 전체 소비자 모듈의 실패 정책 변경
- **D-10:** 단일 공통 로컬 기록 해석자(Unified Local Record Reader) 사용 — 모든 소비자 모듈(isolation, mcp, doctor, recovery)이 `tool-record-store`의 최신 승인(`accepted`) 기록에서 버전·출처·무결성 해시를 조회하여 동적 유도한다 (MIG-02 단일 진실 공급원). — **Reversibility:** one-way — 모든 모듈의 버전 획득 계약 단일화
- **D-11:** 레거시 마이그레이션 시드(Read-only Seed)로만 격리 유지 — 런타임 코드의 `catalog/stack.lock.json` 직접 참조는 완전 제거하고, 오직 `migrate` 명령이 과거 고정 버전을 추적·입양할 때만 읽기 전용 참조로 사용한다. — **Reversibility:** costly — 런타임-체크아웃 분리
- **D-12:** doctor에 단일 진실 공급원(SSOT) 일치 검사 추가 — 하네스 설정, 격리 런타임, MCP 프록시가 로컬 accepted 기록과 일치하는지 종합 진단하고, 불일치 시 drift 경고 및 복구 가이드(repair/update)를 제공한다. — **Reversibility:** reversible

### CLI 출력 및 영한 문서 일관성 체계 (MIG-03, MIG-04)
- **D-13:** 명확한 2-트랙 분리 — `alpha-aos update`는 외부 관리 도구 릴리스 전용으로 한정하고, CLI 도움말/상태에서 alpha-AOS 자체 코드 업데이트(npm 배포 및 로컬 `npm run deploy:local`)와 엄격히 구분 안내한다 (MIG-03). — **Reversibility:** costly — CLI UX 및 제품 멘탈 모델
- **D-14:** 컴포넌트·하네스 매트릭스 테이블 형식 — `[도구 | 하네스 | 상태(retained/updated/failed/recovered/unverified) | 공유 설정 영향 | 필요 조치]`를 구조화된 표와 상태 뱃지로 출력하여 부분 상태를 명확히 공개한다 (MIG-04). — **Reversibility:** reversible
- **D-15:** README/README.ko 갱신 + 전용 마이그레이션 가이드(`docs/guides/migration.md` & `docs/guides/migration.ko.md`) 신설 — README에 최신 CLI 사용법 및 엔진 배포 구분을 반영하고, 전용 가이드에 레거시 입양·백업 복원·하네스별 트러블슈팅을 상세화한다. — **Reversibility:** reversible
- **D-16:** 배포 스킬 및 프롬프트 동기화 — `alpha-aos-control`, `alpha-aos-task` 등 관리 스킬 내 명령 설명에서 구형 백그라운드 갱신 언급을 제거하고, 로컬 기록 기반 migrate/update 및 2트랙 배포 정책을 일관되게 반영한다. — **Reversibility:** reversible

### the agent's Discretion
- `alpha-aos migrate` 명령의 세부 콘솔 UI 서식 및 컬럼 간격 조율
- `.user-backup` 생성 시 타임스탬프 파일명 서식(예: `<filename>.<timestamp>.user-backup`)
- 공통 로컬 기록 리더 헬퍼 모듈의 구체적인 함수 시그니처 및 에러 메시지 세부 문구

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Core Tool Records & Legacy Handoff
- `src/core/tool-records.ts` — 로컬 도구 기록 데이터 모델, 스키마 검증, 출처 URL 검증(`safeToolRecordSource`), 인정 체인 판별
- `src/core/tool-record-store.ts` — 원자적 로컬 작업 기록 트랜잭션 스토어(`planToolRecordOperation`, `beginToolOperation`, `appendToolResult`, `finishToolOperation`)
- `src/core/tool-handoff.ts` — 레거시 증거 모델(`LegacyToolEvidence`), 평가 함수(`evaluateLegacyHandoff`), 소유권 및 수정 판정
- `src/core/tool-handoff-loader.ts` — 레거시 설치 및 락 증거 수집기
- `src/core/tool-inventory.ts` — 관리 도구 인벤토리 수집 및 로컬 기록 조정

### Session & Safe Mutation Boundaries
- `src/core/component-session.ts` — 검토된 계획 다이제스트 바인딩(`reviewedDigest`, `assertPlanUnchanged`), 세션 생명주기
- `src/core/path-boundary.ts` — 허용된 루트 경계 증명 및 안전한 파일 경로 검증
- `src/core/transaction.ts` — 원자적 파일 교체, 스냅샷, 안전 롤백

### Consumers Migrating to Local Records (SSOT)
- `src/core/isolation.ts` — 프로젝트 격리 런타임 및 도구 버전 의존성
- `src/core/doctor.ts` — 시스템 상태 진단 및 단일 진실 공급원(SSOT) 일치 검사
- `src/core/install.ts` — 도구 설치 파이프라인
- `src/core/update.ts` — 도구 업데이트 및 릴리스 리졸버
- `src/core/mcp.ts` — MCP 프록시 및 설정 렌더링
- `src/core/release-recovery.ts` — 적용 실패 시 복구 실행기

### CLI & Presentation
- `src/cli.ts` — CLI 진입점, 서브커맨드 라우팅(`migrate`, `install`, `update`), 2트랙 도움말 구조
- `src/format.ts` — 컴포넌트·하네스 매트릭스 테이블 및 상태 뱃지 포매터

### Documentation & Skills
- `README.md` & `README.ko.md` — 메인 영한 사용자 문서
- `docs/guides/migration.md` & `docs/guides/migration.ko.md` — 신설 마이그레이션 가이드
- `C:/Users/alpha/.gemini/config/skills/alpha-aos-control/SKILL.md` — 제어 스킬 프롬프트
- `C:/Users/alpha/.gemini/config/skills/alpha-aos-task/SKILL.md` — 태스크 코디네이터 스킬 프롬프트
- `.planning/REQUIREMENTS.md` — MIG-01, MIG-02, MIG-03, MIG-04 요구사항

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/core/tool-handoff.ts`: Phase 39에서 구현된 `evaluateLegacyHandoff` 함수는 레거시 도구 증거를 평가하여 `ready`, `needs-evidence`, `modified`, `ambiguous`, `unsupported` 상태를 정확히 구분하므로 `alpha-aos migrate`의 판별 엔진으로 직결된다.
- `src/core/tool-record-store.ts`: `userStateRoot()/tool-records/v1/operations`에 격리된 불변 작업 로그 스토어로, 마이그레이션 작업(`type: 'migrate'`)의 요청·결과·증거를 원자적으로 기록할 수 있다.
- `src/core/component-session.ts`: `assertPlanUnchanged` 및 `reviewedDigest`를 활용하여 migrate 프리뷰 시 생성된 다이제스트와 apply 시점의 일치 여부를 즉시 검증할 수 있다.
- `src/format.ts`: 기존 테이블 포매팅 헬퍼(`formatTable`)를 확장하여 하네스별 상태와 공유 설정 영향을 매트릭스 형태로 렌더링할 수 있다.

### Established Patterns
- SAFE-01: 모든 상태 변경 명령(`install`, `update`, `approve`, `task start`)은 읽기 전용 프리뷰가 기본이며, `--apply`와 바인딩된 `--digest`가 제공될 때만 실행된다.
- Fail-Closed: 사전 조건 불일치, 해시 불일치, 알 수 없는 출처 또는 모호한 소유권 발견 시 즉시 안전하게 거부하고 명시적 해결 경로를 요구한다.
- 2-트랙 업데이트: 외부 도구 릴리스(npm/GitHub) 업데이트와 alpha-AOS 엔진 코드 배포(`npm run deploy:local`)는 개념 및 실행 주체가 완전히 분리된다.

### Integration Points
- `src/cli.ts`: `migrate` 서브커맨드를 신설하고, `inventory`/`doctor`/`install`/`update` 실행 시 레거시 감지 로직을 삽입하여 마이그레이션 경로를 안내한다.
- `src/core/tool-bindings.ts` (신설 또는 확장): 모든 소비자 모듈이 개별 핀 대신 사용할 `resolveAcceptedToolRecord(toolId)` 공통 함수를 제공하여 단일 진실 공급원을 실현한다.
- `src/core/isolation.ts` & `src/core/mcp.ts`: `stack.lock.json` 하드코딩 핀 읽기 코드를 제거하고 공통 로컬 기록 해석자로 교체한다.
- `src/core/doctor.ts`: 레거시 락 잔재, 불일치 핀, 사용자 수정 백업(.user-backup), 로컬 기록-하네스 설정 동기화 여부를 진단하는 신규 규칙을 추가한다.

</code_context>

<specifics>
## Specific Ideas

- `alpha-aos migrate` 명령 실행 시:
  - 프리뷰 화면 상단에 "Legacy Tool Installations Detected" 섹션을 표시하고, 각 도구의 레거시 출처/버전, 소유권(`alpha-aos` / `external` / `ambiguous`), 사용자 수정 여부(`modified`), 대상 하네스를 명시한다.
  - 모호한 항목(`ambiguous`)이 있는 경우, 해결 방법(`alpha-aos migrate --resolve-ownership cua=external,gsd=alpha-aos ...`)을 함께 제시한다.
  - 마이그레이션 적용 시 사용자 수정 설정 파일이 있으면 `<filepath>.<timestamp>.user-backup`으로 백업하고 원자적으로 마커 영역만 바인딩한다.
- `alpha-aos doctor` 실행 시:
  - `[tool-records-alignment]` 진단 섹션을 추가하여, 각 하네스에 구성된 도구 버전이 로컬 스토어의 `accepted` 버전과 완전히 일치하는지(SSOT) 녹색 체크로 표시한다.
- `docs/guides/migration.md` 및 `migration.ko.md` 신설:
  - 1. 레거시(v0.7.0 이전) 구조와 v0.8.0 로컬 도구 기록 구조 비교
  - 2. `alpha-aos migrate`를 통한 단계별 입양 및 검증 절차
  - 3. 사용자 설정 충돌 및 `.user-backup` 복원 가이드
  - 4. 외부 도구 업데이트(`alpha-aos update`)와 엔진 로컬 배포(`npm run deploy:local`)의 차이점 요약

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. 4대 승인 요구사항(MIG-01, MIG-02, MIG-03, MIG-04)과 로드맵 성공 기준에 온전히 집중되었습니다.

</deferred>

---

*Phase: 43-migration-and-consistent-guidance*
*Context gathered: 2026-11-09*
