# Phase 43: Migration and Consistent Guidance - Research

**Researched:** 2026-11-09  
**Domain:** 레거시 설치의 로컬 도구 기록 마이그레이션(MIG-01), 단일 진실 공급원(SSOT) 전환(MIG-02), 2트랙 배포 및 일관된 CLI/문서(MIG-03), 컴포넌트·하네스별 구조화 결과(MIG-04)  
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

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

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope. 4대 승인 요구사항(MIG-01, MIG-02, MIG-03, MIG-04)과 로드맵 성공 기준에 온전히 집중되었습니다.
</user_constraints>

## Project Constraints (from AGENTS.md)

- **Repository development policy:** alpha-AOS 저장소 자체 개발은 native Codex 도구로 직접 수행하며 alpha-AOS 거버넌스·팩·계약·자동실행(`alpha-aos-task`, `alpha-aos-control`)을 호출하지 않는다. GSD 호출은 명시적 요청 시에만 계획 산출물 작성에 한정된다. [VERIFIED: AGENTS.md:1-10: "The owner explicitly excludes this repository from alpha-AOS. Develop alpha-AOS directly with the agent's native tools; alpha-AOS must not govern its own development workflow."]
- **Workstation delivery policy:** push/CI/전체 테스트는 자동 전제조건이 아니며 `npm run deploy:local`로 빌드, CLI 구동, 로컬 링크를 검증한다. 예약된 의존성 업데이트 및 자동 프로모션은 비활성화 상태를 유지한다. 실행하지 않은 검증을 통과했다고 기술하지 않는다. [VERIFIED: AGENTS.md:12-14: "The owner explicitly chose personal workstation delivery. Pushes require no CI, tests, or local pre-push verification. Use npm run deploy:local to build, check CLI startup, and link the local checkout."]
- **Runtime and Safety Invariants:** Node.js `>=24.0.0`, npm `>=10.0.0`, Git을 요구하며, 변경 사항은 프리뷰 가능하고(SAFE-01), 루트 경계가 증명되어야 하고(SAFE-02), 스냅샷 및 롤백이 가능해야 한다. 비밀 값은 로그·파일·명령 인자에 노출되지 않는다. [VERIFIED: AGENTS.md:31-36: "Runtime: Node.js >=24.0.0, npm >=10.0.0, and Git", "Safety: Mutations are previewable, root-bounded, snapshotted, and rollback-aware", "Secrets: Credential values cannot enter manifests, locks, plans, journals, diagnostics, command arguments, or repository files"]
- **TypeScript Conventions:** strict 컴파일러 옵션, 상대 `.js` import, 경계 입력 검증 및 구체적인 에러 던지기 원칙을 준수한다. [VERIFIED: AGENTS.md:106-136: "Preserve strict, noUncheckedIndexedAccess, exactOptionalPropertyTypes, forceConsistentCasingInFileNames, and ES module settings in tsconfig.json."]

<phase_requirements>
## Phase Requirements

| ID | Description (from REQUIREMENTS.md) | Research Support |
|---|---|---|
| MIG-01 | Existing stable-lock and Cua-pin installations can migrate to local management while preserving user changes and prior ownership/provenance evidence. | `alpha-aos migrate` 명령 설계, `LegacyToolEvidence` 입양 기록, `.user-backup` 생성 및 마커 경계 기반 선택적 보존, `--resolve-ownership` 강제 해결 경로. |
| MIG-02 | Installation, native configuration, diagnostics, project isolation and recovery use the same selected local version record rather than inconsistent hidden bundled pins. | 단일 공통 로컬 기록 해석자(`resolveAcceptedToolRecord`) 구현, 런타임 코드 내 `stack.lock.json` 및 `computer-use-runtime.json` 직접 참조 제거, Fail-closed 원칙 적용, doctor 내 `[tool-records-alignment]` 진단 추가. |
| MIG-03 | CLI and bilingual documentation distinguish external-tool updates from alpha-AOS code updates and document patch-release/local developer deployment for compatibility fixes. | CLI 도움말(HELP) 및 상태 출력의 2-트랙 분리(`alpha-aos update` vs `npm run deploy:local`), `README.md` & `README.ko.md` 개정, `docs/guides/migration.md` 및 `migration.ko.md` 신설, 관리 스킬(`alpha-aos-control`, `alpha-aos-task`) 프롬프트 동기화. |
| MIG-04 | Users receive component/platform/harness-specific outcomes, including effects on shared configuration and dependencies rather than misleading universal success or failure. | `formatComponentHarnessMatrix` 포매터 구현, 구조화된 결과 모델(`retained`, `updated`, `failed`, `recovered`, `unverified`), 공유 설정 영향 및 필요 조치 명시. |
</phase_requirements>

## Summary

Phase 43은 alpha-AOS v0.8.0의 마지막 핵심 마일스톤 단계로, 정적 번들 락파일(`catalog/stack.lock.json`)과 Cua 런타임 핀(`catalog/computer-use-runtime.json`) 중심의 구형 설치 환경을 Phase 39–42에서 구축된 **로컬 도구 기록 스토어(`tool-records/v1/operations`) 기반 단일 진실 공급원(SSOT)**으로 완전하고 비파괴적으로 전환한다.

기존 코드는 `tool-handoff.ts`의 `evaluateLegacyHandoff`와 `tool-handoff-loader.ts`의 `assessRetainedNpmHandoff`를 통해 레거시 서명과 출처 무결성을 검증하고, `tool-record-store.ts`의 원자적 불변 작업 로그로 마이그레이션 이벤트를 영구 기록할 수 있는 하부 자산을 이미 확보하고 있다. [VERIFIED: src/core/tool-handoff.ts:32-70] [VERIFIED: src/core/tool-record-store.ts:44-150] 그러나 현재 `mcp.ts`, `doctor.ts`, `install.ts`, `isolation.ts`, `cli.ts` 등 주요 소비자 모듈들은 여전히 `loadLock()`을 직접 호출하거나 번들 핀을 하드코딩 참조하고 있으며, `update.ts` 또한 임시로 `synthesizeReleaseStackLock`을 생성하는 과도기적 방식을 취하고 있다. [VERIFIED: src/cli.ts:1010-1011] [VERIFIED: src/core/mcp.ts:653] [VERIFIED: src/core/update.ts:972-1049]

따라서 Phase 43은 다음 4가지 핵심 축을 완성해야 한다:
1. **전용 `alpha-aos migrate` 파이프라인 (MIG-01):** SAFE-01 프리뷰/적용 계약을 준수하여 레거시 설치를 탐지하고, 사용자 수정 파일 발견 시 `<filename>.<timestamp>.user-backup`으로 자동 백업하며, 하네스 설정의 alpha-AOS 마커 경계 영역만 로컬 기록에 바인딩하고, 모호한 소유권은 `--resolve-ownership`으로 명시적 해결을 강제한다.
2. **단일 공통 로컬 기록 해석자(`resolveAcceptedToolRecord`) 도입 (MIG-02):** 모든 소비자 모듈이 로컬 스토어의 `accepted` 기록만을 진실 공급원으로 참조하도록 전환하고, 기록 부재 시 숨겨진 핀으로 자동 폴백하지 않고 즉시 중단(Fail-closed)한다.
3. **2-트랙 배포 및 영한 문서/스킬 동기화 (MIG-03):** 외부 도구 릴리스 갱신(`alpha-aos update`)과 alpha-AOS 엔진 코드 배포(`npm run deploy:local`)를 CLI 도움말과 영한 가이드에서 명확히 분리하고, 관리 스킬에서 레거시 원격 프로모션 설명을 제거한다.
4. **컴포넌트·하네스별 구조화 매트릭스 결과 제공 (MIG-04):** 단일 거짓 성공/실패 대신 도구/하네스별 5개 상태(`retained`, `updated`, `failed`, `recovered`, `unverified`)와 공유 설정 영향, 필요 조치를 명확히 출력한다.

**Primary recommendation:** `src/core/tool-bindings.ts`에 `resolveAcceptedToolRecord` 및 `assertAcceptedToolRecord`를 구현하여 모든 소비자 모듈의 핀 참조를 교체하고, `src/core/migrate.ts` 및 CLI 서브커맨드 `alpha-aos migrate`를 신설하여 비파괴 `.user-backup` 보존과 원자적 입양 트랜잭션을 완성한다. [ASSUMED]

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|---|---|---|---|
| 레거시 설치 및 증거 탐색/평가 | API / Backend (로컬 CLI core) | Native filesystem / Registry | `tool-observers.js`와 `tool-handoff.ts`가 로컬 파일시스템과 하네스 설정을 스캔하여 후보를 평가한다. [VERIFIED: src/core/tool-observers.ts:59-158] |
| 비파괴 백업(`.user-backup`) 및 마커 격리 | API / Backend (로컬 CLI core) | Database / Storage (`snapshots`) | 사용자 설정 원본을 보존하고 마커 영역(`# alpha-aos:start mcp`)만 선택적으로 바인딩한다. [VERIFIED: src/core/tool-bindings.ts:45-54] |
| 마이그레이션 계획 및 원자적 불변 로그 커밋 | API / Backend (로컬 CLI core) | Database / Storage (`tool-records`) | `tool-record-store.ts`가 `type: 'migrate'` 작업 로그와 수락 전환(`acceptedTransitions`)을 단일 트랜잭션으로 기록한다. [VERIFIED: src/core/tool-record-store.ts:130-150] |
| 단일 진실 공급원(SSOT) 해석 | API / Backend (공통 헬퍼) | Memory Cache / Store | 모든 소비자 모듈(`mcp`, `doctor`, `isolation`, `recovery`)이 `resolveAcceptedToolRecord`를 통해 최신 승인 기록을 조회한다. [VERIFIED: src/core/tool-records.ts:164-243] |
| SSOT 정합성 및 백업 상태 진단 | API / Backend (로컬 CLI core) | CLI / Diagnostics (`doctor`) | `doctor.ts`에 `[tool-records-alignment]` 진단을 추가하여 하네스 실구성과 승인 기록 간 불일치 및 백업 위생을 검증한다. [VERIFIED: src/core/doctor.ts:44-70] |
| 컴포넌트·하네스 매트릭스 결과 렌더링 | CLI boundary | Formatter (`src/format.ts`) | 구조화된 부분 상태(retained, updated, failed, recovered, unverified)와 공유 설정 영향을 매트릭스 테이블로 시각화한다. [VERIFIED: src/format.ts:2308-2402] |
| 영한 가이드 및 스킬 프롬프트 동기화 | Documentation / Skills | Agent Instruction Surface | `README.md`, `README.ko.md`, `migration.md`, `alpha-aos-control`, `alpha-aos-task`에 2트랙 배포 정책을 일관되게 반영한다. [VERIFIED: skills/alpha-aos-control/SKILL.md:1-184] |

## Standard Stack

### Core

| Library / runtime | Version | Purpose | Why Standard |
|---|---:|---|---|
| Node.js built-ins (`fs/promises`, `crypto`, `path`) | `>=24.0.0` | 비파괴 백업 생성, SHA-256 해시 계산, 원자적 불변 레코드 트랜잭션 | 외부 의존성 없이 표준 네이티브 런타임의 안전 경계(`path-boundary.ts`)와 파일 트랜잭션(`transaction.ts`)을 온전히 활용한다. [VERIFIED: package.json:48-50] |
| `@modelcontextprotocol/sdk` | `1.32.2` | MCP 클라이언트 및 stdio 프로토콜 바인딩 | alpha-AOS 프록시 및 하네스 연동 설정 렌더링의 표준 프로토콜 SDK이다. [VERIFIED: package.json:52-59] |
| `yaml` | `2.7.0` | Hermes 및 매니페스트 설정 파싱/렌더링 | YAML 기반 설정 및 메타데이터 처리에 이미 검증된 프로젝트 의존성이다. [VERIFIED: package.json:60] |
| Node `node:test` | built-in | 단위/통합 마이그레이션 픽스처 테스트 | 추가 테스트 러너 없이 `npm test` 파이프라인에서 즉시 실행된다. [VERIFIED: package.json:37-46] |

### Supporting

| Component | Purpose | When to Use |
|---|---|---|
| `tool-handoff.ts` | 레거시 증거 체인 검증 및 `LegacyHandoffAssessment` 산출 | `alpha-aos migrate` 실행 시 기존 설치의 출처·무결성·수정 여부를 판별할 때. [VERIFIED: src/core/tool-handoff.ts:32-70] |
| `tool-record-store.ts` | 원자적 도구 작업 계획, 세션 잠금, 이벤트 기록 | 마이그레이션 작업(`migrate-start`, `tool-result`, `migrate-finish`)을 영구 기록하고 `acceptedTransitions`를 등록할 때. [VERIFIED: src/core/tool-record-store.ts:44-150] |
| `component-session.ts` | 계획 다이제스트 바인딩 및 변경 불허 검증 | SAFE-01 프리뷰와 적용 시점의 다이제스트 일치 여부(`assertPlanUnchanged`)를 검증할 때. [VERIFIED: src/core/component-session.ts:61-166] |
| `transaction.ts` | 파일 스냅샷, 원자적 쓰기 및 안전 롤백 | 설정 파일 수정 시 스냅샷 생성 및 트랜잭션 롤백 보장에 사용. [VERIFIED: src/core/transaction.ts:353-418] |

**Installation:** 새 외부 패키지는 설치하지 않는다. 기존 라이브러리와 내장 모듈만으로 모든 기능을 충족한다. [ASSUMED]

## Package Legitimacy Audit

> Phase 43은 외부 신규 패키지를 설치하지 않고 기존 저장소 인프라와 표준 라이브러리를 확장한다.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---|---|---|---|---|---|---|
| *None* | — | — | — | — | [OK] | Approved (No external packages added) |

**Packages removed due to [SLOP] verdict:** None  
**Packages flagged as suspicious [SUS]:** None  

## Architecture Patterns

### System Architecture Diagram

```text
               +-------------------------------------------------------------+
               |                  Legacy Installation State                  |
               | (stack.lock.json, computer-use-runtime.json, configs, pkgs) |
               +-------------------------------------------------------------+
                                              |
                                              v
                              +-------------------------------+
                              |    alpha-aos migrate (CLI)    |
                              +-------------------------------+
                                              |
                          [Step 1: Read-only Inventory Scan]
                                              v
               +-------------------------------------------------------------+
               | Tool Observers & Handoff Loader (evaluateLegacyHandoff)     |
               | - Detect: gsd, ecc, cua-driver, mcp:*, bridge:pi            |
               | - Classify: ready | modified | ambiguous | unsupported      |
               +-------------------------------------------------------------+
                                              |
                    +-------------------------+-------------------------+
                    |                                                   |
       [Ambiguous Candidates]                                [Modified User Files]
                    |                                                   |
                    v                                                   v
      +----------------------------+                      +----------------------------+
      | Isolate in Preview         |                      | Plan Automatic Backup      |
      | Require:                   |                      | <filename>.<ts>.user-backup|
      | --resolve-ownership        |                      | Selective Marker Adoption  |
      +----------------------------+                      +----------------------------+
                    |                                                   |
                    +-------------------------+-------------------------+
                                              |
                                              v
                              +-------------------------------+
                              |   Migration Preview & Plan    |
                              | - Component/Harness Matrix    |
                              | - Plan Digest & Token         |
                              +-------------------------------+
                                              |
                                       [--apply --digest]
                                              v
               +-------------------------------------------------------------+
               | Tool Record Store (Atomic Migrate Operation)                |
               | - Create .user-backup snapshots                             |
               | - Append ToolResults with LegacyToolEvidence                |
               | - Advance Accepted Transitions in tool-records/v1           |
               | - Mark legacy lockfile/pins as RETIRED SEED (non-delete)    |
               +-------------------------------------------------------------+
                                              |
                                              v
               +-------------------------------------------------------------+
               | Single Source of Truth (SSOT): resolveAcceptedToolRecord()  |
               | [Consumers]: mcp.ts, isolation.ts, doctor.ts, install.ts    |
               | [Fail-Closed]: Missing record -> Stop with migrate guidance |
               +-------------------------------------------------------------+
```

### Recommended Project Structure
```text
src/
├── core/
│   ├── migrate.ts                # [신규] 레거시 마이그레이션 플래너, 백업 생성기, 실행기
│   ├── tool-bindings.ts          # [확장] 단일 공통 로컬 기록 리더(resolveAcceptedToolRecord)
│   ├── tool-records.ts           # [기존] 로컬 레코드 데이터 모델 및 accepted 체인 리더
│   ├── tool-record-store.ts      # [기존] 원자적 작업 로그 스토어
│   ├── tool-handoff.ts           # [기존] 레거시 증거 모델 및 평가 엔진
│   ├── tool-handoff-loader.ts    # [기존] npm 레거시 서명 검증기
│   ├── mcp.ts                    # [수정] 번들 락 대신 resolveAcceptedToolRecord 사용
│   ├── doctor.ts                 # [수정] [tool-records-alignment] 및 백업 진단 추가
│   ├── install.ts                # [수정] 번들 락 대신 로컬 기록 참조 및 마이그레이션 안내
│   └── isolation.ts              # [수정] 런타임 MCP 설정 시 로컬 기록 참조
├── cli.ts                        # [확장] migrate 서브커맨드 라우팅 및 2트랙 도움말
└── format.ts                     # [확장] 컴포넌트·하네스 매트릭스 테이블 포매터
docs/
└── guides/
    ├── migration.md              # [신규] 영문 마이그레이션 및 입양 가이드
    └── migration.ko.md           # [신규] 한글 마이그레이션 및 입양 가이드
```

### Pattern 1: Non-destructive Legacy Migration & Adoption with `.user-backup` (MIG-01)
**What:** 기존 설치된 도구 및 하네스 설정을 로컬 관리 기록으로 입양할 때, 사용자 고유 변경 사항을 안전하게 보존하고 alpha-AOS 관리 영역만 선별 바인딩한다.  
**When to use:** `alpha-aos migrate` 실행 시 사용자 수정 파일이 감지되거나 하네스 설정 파일에 기존 커스텀 섹션이 존재할 때.  
**Example:**
```typescript
// Source: src/core/migrate.ts (설계 패턴)
export async function createSafeUserBackup(filePath: string, stateRoot: string): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = `${filePath}.${timestamp}.user-backup`;
  const content = await readFile(filePath);
  await writeFile(backupPath, content, { mode: 0o600 });
  return backupPath;
}
```

### Pattern 2: Unified Local Record Reader (`resolveAcceptedToolRecord`) as SSOT (MIG-02)
**What:** 모든 런타임 소비자 모듈이 개별 번들 락이나 정적 핀 대신 로컬 스토어의 `accepted` 기록에서 버전과 아티팩트 메타데이터를 조회하도록 단일화한다.  
**When to use:** `mcp.ts`, `doctor.ts`, `isolation.ts`, `install.ts` 등 도구 버전이나 실행 경로가 필요한 모든 지점.  
**Example:**
```typescript
// Source: src/core/tool-bindings.ts (확장 패턴)
export async function resolveAcceptedToolRecord(
  toolId: ManagedToolId,
  options: { stateRoot?: string; packageRoot?: string } = {}
): Promise<AcceptedToolRecord> {
  const store = await readToolRecordStore({
    stateRoot: options.stateRoot ?? userStateRoot(),
    packageRoot: options.packageRoot ?? packageRoot(),
  });
  if (store.status !== "current" || store.incomplete || !store.accepted) {
    throw new Error(
      `No accepted tool records found for '${toolId}'. ` +
      `Run 'alpha-aos migrate' to adopt existing installations or 'alpha-aos install' to set up.`
    );
  }
  const accepted = acceptedToolResults(store, toolId);
  const match = accepted.find((item) => item.result.installed !== null);
  if (!match || !match.result.installed || !match.result.resolved) {
    throw new Error(
      `Tool '${toolId}' has no accepted active release in local store. ` +
      `Run 'alpha-aos install --tool ${toolId}' or 'alpha-aos migrate'.`
    );
  }
  return {
    toolId,
    version: match.result.installed.version,
    installationId: match.result.installed.installationId,
    pathAlias: match.result.installed.pathAlias,
    sourceUrl: match.result.resolved.sourceUrl,
    digest: match.result.resolved.digest,
    legacy: match.result.legacy,
  };
}
```

### Pattern 3: 2-Track CLI Guidance & Documentation Separation (MIG-03)
**What:** 외부 도구(Cua, GSD, ECC, MCP) 릴리스 업데이트(`alpha-aos update`)와 alpha-AOS 자체 코드 업데이트(`npm run deploy:local` / npm 배포)를 CLI 도움말과 영한 가이드에서 엄격히 분리한다.  
**When to use:** CLI `HELP`, `alpha-aos status`, `README.md`, `README.ko.md`, 및 관리 스킬(`alpha-aos-control`, `alpha-aos-task`).  
**Rules:**
- `alpha-aos update`: 외부 관리 도구의 새 릴리스 탐색/적용에만 사용.
- `alpha-AOS engine`: 개인 워크스테이션 환경에서는 `npm run deploy:local`, 패키지 매니저 환경에서는 `npm install -g alpha-aos@latest`로 배포됨을 명시.
- 백그라운드 자동 갱신 및 스케줄링된 원격 프로모션 언급 완전 제거.

### Pattern 4: Component/Platform/Harness Outcome Matrix (`formatComponentHarnessMatrix`) (MIG-04)
**What:** 연동 검증 및 마이그레이션 결과를 단순 universal success/failure가 아닌 도구·하네스별 5개 상태로 구조화하여 표시한다.  
**Statuses:**
- `retained`: 기존 버전 및 설정 유지 (검증 대기 또는 보류로 인한 미전환)
- `updated`: 새 로컬 레코드로 성공적으로 마이그레이션/전환 완료
- `failed`: 마이그레이션 또는 연동 검증 실패
- `recovered`: 실패 후 이전 버전/설정으로 안전하게 복구 완료
- `unverified`: 설치/설정은 완료되었으나 실제 호출 증거 대기 중
**Columns:** `[ Tool | Harness | Status | Shared Config Impact | Action Required ]`

### Anti-Patterns to Avoid
- **Silent Fallback to Bundle Pins:** 로컬 레코드가 없다고 해서 `catalog/stack.lock.json`의 구형 핀으로 자동 폴백하는 행위 (D-09 위반). 로컬 레코드 부재 시 반드시 fail-closed하고 명시적 명령을 요구해야 한다.
- **Overwriting User Config Wholesale:** 하네스 설정 마이그레이션 시 파일 전체를 덮어써서 사용자의 커스텀 설정을 날리는 행위 (D-05, D-06 위반). 반드시 `.user-backup`을 남기고 alpha-AOS 마커 영역만 수정해야 한다.
- **Arbitrary File Deletion:** 마이그레이션 완료 후 `stack.lock.json`이나 구형 런타임 핀을 `rm`으로 임의 삭제하는 행위 (D-04 위반). 레거시 파일은 시드로 격리/보존해야 한다.
- **Conflating Tool Update with Engine Deploy:** `alpha-aos update`를 실행하면 alpha-AOS 자체 소스 코드가 업데이트된다고 사용자에게 잘못 안내하는 행위 (D-13 위반).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---|---|---|---|
| 레거시 서명 및 무결성 검증 | 독자적 서명 검증 루프 | `src/core/tool-handoff-loader.ts` (`assessRetainedNpmHandoff`) | ECDSA prime256v1 서명 검증, npm 레지스트리 정책 매핑, 타르볼 아카이브 매니페스트 추출 로직이 이미 검증되어 있음. [VERIFIED: src/core/tool-handoff-loader.ts:62-92] |
| 마이그레이션 이벤트 트랜잭션 기록 | 독자적 JSON 파일 쓰기 | `src/core/tool-record-store.ts` (`withToolRecordSession`, `appendToolResult`, `finishToolOperation`) | 프로세스 뮤테이션 세션 락, SHA-256 이벤트 체인, 파일 트랜잭션 저널, 롤백 안전성을 완전히 보장함. [VERIFIED: src/core/tool-record-store.ts:87-150] |
| 계획 다이제스트 바인딩 및 변경 방지 | 임의 문자열 해시 비교 | `src/core/component-session.ts` (`assertPlanUnchanged`, `reviewedDigest`) | SAFE-01 계약을 만족하는 표준 다이제스트 검증 및 불변 세션 바인딩을 제공함. [VERIFIED: src/core/component-session.ts:61-166] |
| 파일 원자적 교체 및 백업 롤백 | `fs.writeFileSync` 직접 호출 | `src/core/transaction.ts` (`applyFileTransaction`) | 정전이나 프로세스 중단 시 원자적 복구 및 스냅샷 저널링을 제공함. [VERIFIED: src/core/transaction.ts:353-418] |

## Runtime State Inventory

> Phase 43은 레거시 설치 및 하네스 설정을 로컬 관리 기록으로 이전하는 마이그레이션 단계이므로 런타임 상태 인벤토리를 명시적으로 작성한다.

| Category | Items Found | Action Required |
|---|---|---|
| **Stored data** | 1. `~/.alpha-aos/tool-records/v1/operations/`: 기존에 승인된 도구 레코드가 없거나 이전 Phase 40–42의 부분 작업 로그만 존재할 수 있음.<br>2. `catalog/stack.lock.json` 및 `catalog/computer-use-runtime.json`: 정적 고정 핀 데이터. | **데이터 마이그레이션**: `alpha-aos migrate --apply`를 통해 레거시 핀 및 현재 설치된 후보를 읽어 `type: 'migrate'` 불변 작업 로그로 원자적 기록하고, `acceptedTransitions`를 생성하여 승인 상태로 등록한다. 레거시 락파일은 삭제하지 않고 읽기 전용 시드로 유지한다. |
| **Live service config** | 1. Claude: `~/.claude/settings.json` (MCP 및 스킬 설정)<br>2. Codex: `~/.codex/config.toml` (`# alpha-aos:start mcp` 마커 블록)<br>3. Antigravity: `~/.gemini/antigravity/` 또는 관련 설정<br>4. Pi: `~/.pi/agent/settings.json`<br>5. Hermes: `~/.hermes/config.yaml` | **코드 수정 및 안전 바인딩**: 마이그레이션 시 사용자 수정 파일이 감지되면 `<filename>.<timestamp>.user-backup`으로 백업하고, 마커 영역만 로컬 기록에 바인딩한다. 커스텀 섹션은 온전히 보존한다. |
| **OS-registered state** | 1. Cua driver 실행 파일: Windows (`%LOCALAPPDATA%\Programs\trycua\cua\cua-driver.exe`) 또는 PATH 상의 바이너리.<br>2. 전역 npm 모듈 심링크: `npm root -g` 하위의 `@opengsd/gsd-core` 등. | **코드 검증**: OS 수준 바이너리 및 심링크의 실행 경로(`pathAlias`)를 로컬 기록에 정확히 매핑하고, doctor가 실존 여부를 진단하도록 한다. |
| **Secrets/env vars** | 1. `EXA_API_KEY`, `CONTEXT7_API_KEY`, `FIRECRAWL_API_KEY`<br>2. `ALPHA_AOS_STATE_DIR`, `CLAUDE_CONFIG_DIR`, `CODEX_HOME` 등 | **비밀 보호 유지**: 마이그레이션 작업 로그나 진단 출력에 어떠한 비밀 값도 포함하지 않으며, 환경 변수 이름만 유지한다. |
| **Build artifacts** | 1. `dist/`: 컴파일된 JavaScript 산출물.<br>2. `package.json` 및 `package-lock.json` | **코드 재빌드**: 로컬 기록 리더 및 마이그레이션 CLI가 반영된 후 `npm run build:check` 및 `npm run deploy:local`을 통해 로컬 워크스테이션 링크를 최신화한다. |

## Common Pitfalls

### Pitfall 1: Silent Fallback to Bundle Pins on Missing Records
**What goes wrong:** 신규 프로젝트나 초기화되지 않은 환경에서 로컬 기록이 없다는 이유로 `catalog/stack.lock.json`으로 조용히 되돌아가 오래된 버전을 사용하는 문제.  
**Why it happens:** 개발자가 "편의상" try/catch 블록에서 `loadLock()`을 기본값으로 반환하도록 코딩함.  
**How to avoid:** D-09의 Fail-closed 원칙을 엄격히 적용한다. 로컬 승인 기록이 없으면 명확한 에러 메시지와 함께 `alpha-aos install` 또는 `alpha-aos migrate` 실행을 요구하며 즉시 종료한다.  
**Warning signs:** 로컬 스토어를 비웠는데도 CLI가 오류 없이 이전 버전으로 동작함.

### Pitfall 2: Destroying User Custom Config during Harness Adoption
**What goes wrong:** 마이그레이션 시 하네스 설정 파일(예: `config.toml`이나 `settings.json`)을 alpha-AOS 기본 템플릿으로 통째로 덮어써서 사용자가 직접 등록한 타사 MCP 서버나 커스텀 프롬프트가 영구 삭제됨.  
**Why it happens:** 전체 설정 렌더링 함수(`renderJsonConfig`, `renderCodexConfig`)를 기존 파일 파싱/병합 없이 그대로 overwrite 모드로 호출함.  
**How to avoid:** D-05와 D-06을 적용하여 파일 수정 전 `.user-backup`을 먼저 생성하고, `# alpha-aos:start mcp` 마커 블록 또는 alpha-AOS 예약 키 영역만 정밀하게 갱신한다.  
**Warning signs:** 마이그레이션 후 사용자의 기존 MCP 서버 목록이 사라짐.

### Pitfall 3: Ambiguous Candidate Overwrite without Human Resolution
**What goes wrong:** 한 도구에 대해 여러 개의 후보(예: 글로벌 npm 설치본과 하네스 로컬 설치본)가 감지되었을 때 시스템이 임의로 하나를 골라 덮어쓰거나 승인해버림.  
**Why it happens:** `candidates.length > 1` 상황을 단일 후보로 단순 축약함.  
**How to avoid:** D-07에 따라 모호한 상태(`ambiguous`)를 프리뷰에서 별도 섹션으로 격리하고, `--resolve-ownership cua=external,gsd=alpha-aos`와 같이 명시적 플래그가 주어지지 않으면 적용을 차단한다.  
**Warning signs:** 사용자가 의도하지 않은 테스트용 디렉터리의 바이너리가 활성 도구로 등록됨.

### Pitfall 4: Conflating Tool Updates with Engine Deployment
**What goes wrong:** 사용자가 alpha-AOS 버그 수정을 반영하기 위해 `alpha-aos update`를 실행했으나, 이는 외부 도구(Cua, GSD)만 업데이트하고 alpha-AOS 엔진 코드는 그대로 남아 혼란을 겪음.  
**Why it happens:** CLI 도움말과 README에서 도구 릴리스와 엔진 배포의 개념을 분리하여 설명하지 않음.  
**How to avoid:** D-13에 따라 `alpha-aos update` 도움말에 "External managed tools update only"를 명시하고, alpha-AOS 자체 코드 반영은 `npm run deploy:local`(개발/워크스테이션) 또는 `npm install -g alpha-aos@latest`임을 명확히 안내한다.  
**Warning signs:** 사용자 이슈에서 "update 명령을 실행했는데도 alpha-AOS 버그가 안 고쳐진다"는 불만 제기.

### Pitfall 5: Collapsing Multi-Harness Outcomes into Binary Success/Failure
**What goes wrong:** 5개 하네스 중 4개는 마이그레이션에 성공하고 1개(예: Pi)만 실패했는데, 전체를 "성공"으로 표시하여 오류를 감추거나, 전체를 "실패"로 표시하여 이미 성공한 작업의 추적을 어렵게 함.  
**Why it happens:** 하네스별 세부 결과를 단일 boolean 플래그로 축약함.  
**How to avoid:** D-14에 따라 `[도구 | 하네스 | 상태 | 공유 설정 영향 | 필요 조치]` 형태의 매트릭스 테이블로 각 하네스의 세부 상태(retained/updated/failed/recovered/unverified)를 독립적으로 공개한다.  
**Warning signs:** 특정 하네스에서 도구가 동작하지 않는데 CLI는 "All tools updated successfully"를 출력함.

## Code Examples

### 1. 단일 공통 로컬 기록 리더 (`resolveAcceptedToolRecord`)
```typescript
// Source: src/core/tool-bindings.ts:19-31 기반 확장
import { userStateRoot, packageRoot } from "./paths.js";
import { readToolRecordStore, type ToolRecordStore, type ToolResult } from "./tool-records.js";
import type { ManagedToolId } from "../types.js";

export interface AcceptedToolRecord {
  toolId: string;
  version: string;
  installationId: string;
  pathAlias: string;
  sourceUrl: string;
  digest: string;
  legacy?: import("./tool-handoff.js").LegacyToolEvidence;
}

export async function resolveAcceptedToolRecord(
  toolId: ManagedToolId,
  options: { stateRoot?: string; packageRoot?: string } = {}
): Promise<AcceptedToolRecord> {
  const store = await readToolRecordStore({
    stateRoot: options.stateRoot ?? userStateRoot(),
    packageRoot: options.packageRoot ?? packageRoot(),
  });

  if (store.status !== "current" || store.incomplete || !store.accepted) {
    throw new Error(
      `No accepted tool records found for '${toolId}' (store status: ${store.status}). ` +
      `Run 'alpha-aos migrate' to adopt existing installations or 'alpha-aos install' to set up.`
    );
  }

  const accepted = acceptedToolResults(store, toolId);
  const match = accepted.find((item) => item.result.installed !== null);
  if (!match || !match.result.installed || !match.result.resolved) {
    throw new Error(
      `Tool '${toolId}' has no accepted active release in local store. ` +
      `Run 'alpha-aos install --tool ${toolId}' or 'alpha-aos migrate'.`
    );
  }

  return {
    toolId,
    version: match.result.installed.version,
    installationId: match.result.installed.installationId,
    pathAlias: match.result.installed.pathAlias,
    sourceUrl: match.result.resolved.sourceUrl,
    digest: match.result.resolved.digest,
    legacy: match.result.legacy,
  };
}
```

### 2. 비파괴 사용자 설정 백업 및 타임스탬프 파일 생성
```typescript
// Source: src/core/migrate.ts (신규 제안 패턴)
import { copyFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

export async function createSafeUserBackup(targetFilePath: string): Promise<string> {
  const resolved = resolve(targetFilePath);
  const info = await stat(resolved);
  if (!info.isFile()) throw new Error(`Target is not a regular file: ${resolved}`);

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = `${resolved}.${timestamp}.user-backup`;

  await copyFile(resolved, backupPath);
  return backupPath;
}
```

### 3. 컴포넌트·하네스 매트릭스 결과 포매터
```typescript
// Source: src/format.ts (신규 제안 패턴)
export interface ComponentHarnessMatrixRow {
  toolId: string;
  harness: string;
  status: "retained" | "updated" | "failed" | "recovered" | "unverified";
  sharedConfigImpact: string;
  actionRequired: string;
}

export function formatComponentHarnessMatrix(rows: ComponentHarnessMatrixRow[]): string {
  const lines: string[] = [
    "=== COMPONENT & HARNESS OUTCOME MATRIX ===",
    "",
    "| Tool | Harness | Status | Shared Config Impact | Action Required |",
    "|---|---|---|---|---|",
  ];

  for (const row of rows) {
    const badge = row.status === "updated" ? "UPDATED [OK]"
      : row.status === "retained" ? "RETAINED [SKIP]"
      : row.status === "recovered" ? "RECOVERED [ROLLBACK]"
      : row.status === "unverified" ? "UNVERIFIED [PENDING]"
      : "FAILED [ERR]";

    lines.push(
      `| ${row.toolId} | ${row.harness} | ${badge} | ${row.sharedConfigImpact} | ${row.actionRequired} |`
    );
  }

  return lines.join("\n");
}
```

## State of the Art

| Old Approach (v0.1.0 ~ v0.7.0) | Current Approach (v0.8.0 Phase 43) | When Changed | Impact |
|---|---|---|---|
| 정적 번들 파일 `catalog/stack.lock.json` 및 `catalog/computer-use-runtime.json`에 의존 | 로컬 불변 스토어(`tool-records/v1/operations`)의 `accepted` 기록을 단일 진실 공급원(SSOT)으로 사용 | 2026-11-09 (Phase 43) | 중앙 락파일 배포나 관리자 승인 없이도 각 머신에서 독립적으로 최신 릴리스를 선택하고 일관되게 소비 가능 |
| 파일 덮어쓰기 시 사용자 커스텀 설정 소실 위험 | `.user-backup` 자동 생성 및 마커 경계 기반 선택적 보존 | 2026-11-09 (Phase 43) | 사용자의 타사 MCP 서버 및 개인 프롬프트가 완벽히 보존되는 비파괴 마이그레이션 달성 |
| `alpha-aos update`가 엔진 코드까지 갱신한다고 오인 | 외부 도구 릴리스와 엔진 배포(`npm run deploy:local`)의 명확한 2-트랙 분리 | 2026-11-09 (Phase 43) | 사용자 및 에이전트의 멘탈 모델 명확화, 워크스테이션 배포 정책과의 완전한 정렬 |
| 전체 성공 또는 실패의 단일 boolean 결과 | `[도구 | 하네스 | 상태 | 공유 설정 영향 | 필요 조치]` 매트릭스 테이블 제공 | 2026-11-09 (Phase 43) | 하네스별 부분 실패나 대기 상태가 숨겨지지 않고 투명하게 보고됨 |

**Deprecated/outdated:**
- `synthesizeReleaseStackLock` in `update.ts`: 번들 락 객체를 합성하던 임시 브릿지. SSOT 로컬 레코드 리더 완성 후 직접 조회로 전환.
- Scheduled dependency promotion workflows: 2026-11-05 소유자 결정으로 비활성화됨. 문서와 스킬 프롬프트에서 잔재 완전 제거.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|---|---|---|
| A1 | 신규 외부 패키지 설치 없이 Node.js 내장 모듈 및 기존 의존성만으로 마이그레이션 구현 가능 | Standard Stack | 추가 패키지 필요 시 패키지 적법성 감사 및 설치 단계 추가 필요 (영향 낮음) |
| A2 | `.user-backup` 파일 형식은 `<filename>.<timestamp>.user-backup` 형식을 사용 | Architecture Patterns | 파일명 규칙 변경 시 백업 진단 정규식만 수정하면 됨 (영향 낮음) |
| A3 | `resolveAcceptedToolRecord`는 `acceptedToolResults`를 래핑하여 단일 활성 레코드를 반환함 | Architecture Patterns | 반환 인터페이스 변경 시 소비자 모듈 호출부 조정 필요 (영향 낮음) |

## Open Questions (RESOLVED)

1. **레거시 설치에서 서명 체인 파일(`evidence.json`, `artifact.tgz`)이 완전히 없는 brownfield 머신의 입양 처리:**
   - What we know: `tool-handoff-loader.ts`는 `stateRoot/tool-handoff/<toolId>` 디렉터리의 서명 및 아티팩트를 요구한다. [VERIFIED: src/core/tool-handoff-loader.ts:73-85]
   - What's unclear: Phase 39 이전에 설치된 순수 레거시 머신에는 `tool-handoff` 폴더가 없을 수 있다.
   - Recommendation: `evaluateLegacyHandoff`에 `catalog/stack.lock.json`의 해시를 읽기 전용 시드 증거로 공급하여, 파일이 일치하면 `priorInstallationOwner: 'alpha-aos'`, `userModificationEvidence: 'unmodified'`로 인정하고 마이그레이션을 완결한다 (D-04, D-11 부합).
   - RESOLVED: `evaluateLegacyHandoff` 및 `migrate` 파이프라인에서 `catalog/stack.lock.json`의 잠금 해시를 읽기 전용 시드 증거로 공급하여, 파일이 일치할 경우 `priorInstallationOwner: 'alpha-aos'` 및 `userModificationEvidence: 'unmodified'`로 인정하고 마이그레이션을 원자적으로 완결한다 (D-04, D-11 확정).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|---|---|---|---|---|
| Node.js | Core runtime | ✓ | v24.x | — (필수) |
| npm | Package management / CLI link | ✓ | v10.x | — (필수) |
| Git | Version control & repo boundary | ✓ | 2.x | — (필수) |
| Windows (PowerShell) | Host platform | ✓ | Win32 x64 | macOS / Linux POSIX sh 지원 |
| Claude Code | Supported harness | ✓ | native | 비활성 시 건너뜀 |
| Codex | Supported harness | ✓ | native | 비활성 시 건너뜀 |
| Antigravity | Supported harness | ✓ | native | 비활성 시 건너뜀 |
| Pi Agent | Supported harness | ✓ | native | 비활성 시 건너뜀 |
| Hermes Agent | Supported harness | ✓ | native | 비활성 시 건너뜀 |

**Missing dependencies with no fallback:** None  
**Missing dependencies with fallback:** None  

## Validation Architecture

### Test Framework
| Property | Value |
|---|---|
| Framework | Node.js built-in `node:test` + `node:assert/strict` |
| Config file | `package.json` (`scripts.test: "node scripts/run-tests.mjs"`) |
| Quick run command | `node --test dist/test/tool-handoff.test.js dist/test/tool-handoff-loader.test.js` |
| Full suite command | `npm run build:check && node --test dist/test/migrate.test.js dist/test/tool-bindings.test.js` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|---|---|---|---|---|
| MIG-01 | 레거시 설치 감지, `.user-backup` 생성, 마커 영역 바인딩, `type: 'migrate'` 원자적 기록 | integration | `node --test dist/test/migrate.test.js` | ❌ Wave 0 Gap |
| MIG-01 | 사용자 수정 파일 감지 및 `--resolve-ownership` 강제 거부 | unit/integration | `node --test dist/test/migrate-ownership.test.js` | ❌ Wave 0 Gap |
| MIG-02 | `resolveAcceptedToolRecord`가 단일 진실 공급원으로 동작하며, 기록 부재 시 fail-closed | unit | `node --test dist/test/tool-bindings-ssot.test.js` | ❌ Wave 0 Gap |
| MIG-02 | `doctor`의 `[tool-records-alignment]` 진단 및 백업 위생 검사 | unit/integration | `node --test dist/test/doctor-migration.test.js` | ❌ Wave 0 Gap |
| MIG-03 | CLI HELP의 2-트랙 안내 및 README/마이그레이션 가이드 일관성 | unit | `node --test dist/test/migrate-docs-consistency.test.js` | ❌ Wave 0 Gap |
| MIG-04 | `formatComponentHarnessMatrix`가 5개 상태와 공유 설정 영향을 구조화 렌더링 | unit | `node --test dist/test/matrix-format.test.js` | ❌ Wave 0 Gap |

### Sampling Rate
- **Per task commit:** `npm run build:check && node --test dist/test/migrate.test.js`
- **Per wave merge:** `npm run build:check && node scripts/run-tests.mjs`
- **Phase gate:** Full suite green before `/gsd-verify-work 43`

### Wave 0 Gaps
- [ ] `test/migrate.test.js` — covers MIG-01 (레거시 탐색, `.user-backup`, 원자적 마이그레이션 기록)
- [ ] `test/tool-bindings-ssot.test.js` — covers MIG-02 (단일 공통 리더 및 fail-closed 거부)
- [ ] `test/matrix-format.test.js` — covers MIG-04 (매트릭스 테이블 포매팅)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---|---|---|
| V1 Architecture & Threat Modeling | yes | 비파괴 백업 원칙, 원자적 불변 로그 커밋, Fail-closed 아키텍처 |
| V4 Access Control | yes | `userStateRoot` 및 하네스 설정 경로 경계 검증 (`provePathBoundary`, `inside`) |
| V5 Input Validation | yes | CLI 옵션(`--tool`, `--target`, `--resolve-ownership`) 및 스키마 검증 (`validateManagedDocument`) |
| V6 Cryptography | yes | SHA-256 이벤트 다이제스트 검증, ECDSA P-256 서명 검증 |

### Known Threat Patterns for alpha-AOS

| Pattern | STRIDE | Standard Mitigation |
|---|---|---|
| Path Traversal via User Backup | Tampering / Information Disclosure | `provePathBoundary` 및 `canonicalizeWithMissingTail`로 대상 파일이 허용된 하네스 루트 내에 있는지 엄격히 검증. [VERIFIED: src/core/path-boundary.ts:27-40] |
| Credential Leakage in Migration Log | Information Disclosure | `rejectRawCredentials` 도메인 검증기를 적용하여 API Key나 토큰이 로컬 이벤트 로그에 기록되는 것을 원천 차단. [VERIFIED: src/core/validation.ts:6-15] |
| Forged Legacy Ownership | Elevation of Privilege | 서명 체인 또는 검증된 시드 락파일 해시가 일치하지 않으면 `alpha-aos` 소유권 인정을 거부하고 `external` 또는 `needs-evidence`로 분류. [VERIFIED: src/core/tool-handoff-loader.ts:55-65] |

## Sources

### Primary (HIGH confidence)
- `src/core/tool-records.ts`: 로컬 도구 기록 데이터 모델, 이벤트 체인, `accepted` 전환 로직 [VERIFIED: src/core/tool-records.ts:1-277]
- `src/core/tool-record-store.ts`: 원자적 파일 트랜잭션 기반 작업 로그 스토어 [VERIFIED: src/core/tool-record-store.ts:1-169]
- `src/core/tool-handoff.ts` & `src/core/tool-handoff-loader.ts`: 레거시 증거 모델 및 npm 레지스트리 서명 검증 [VERIFIED: src/core/tool-handoff.ts:1-77] [VERIFIED: src/core/tool-handoff-loader.ts:1-92]
- `src/core/tool-bindings.ts`: `acceptedToolResults`, 하네스 설정 바인딩 관찰 [VERIFIED: src/core/tool-bindings.ts:1-126]
- `src/core/mcp.ts` & `src/core/doctor.ts`: MCP 설정 렌더링 및 진단 체계 [VERIFIED: src/core/mcp.ts:469-827] [VERIFIED: src/core/doctor.ts:44-70]
- `AGENTS.md` & `PROJECT.md`: 저장소 거버넌스 및 배포 정책 제약 [VERIFIED: AGENTS.md:1-45]

### Secondary (MEDIUM confidence)
- `.planning/phases/43-migration-and-consistent-guidance/43-CONTEXT.md`: 사용자 논의 및 확정된 16개 구현 결정 (D-01 ~ D-16) [VERIFIED: .planning/phases/43-migration-and-consistent-guidance/43-CONTEXT.md:1-140]

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — 추가 외부 의존성 없이 표준 Node.js 내장 및 기존 코드베이스로 완결.
- Architecture: HIGH — Phase 39-42에서 축적된 트랜잭션, 증거, 복구 패턴과 100% 호환.
- Pitfalls & Boundaries: HIGH — 실호스트 검증 및 AGENTS.md 제약에 기반하여 구체적인 예방책 수립.

**Research date:** 2026-11-09  
**Valid until:** 2026-12-09 (안정적인 로컬 아키텍처 및 소유자 결정)
