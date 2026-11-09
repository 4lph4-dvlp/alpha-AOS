# Phase 42: Integration Verification and Recovery - Research

**Researched:** 2026-11-09  
**Domain:** 로컬 공식 릴리스의 실제 MCP/하네스 연동 검증과 네이티브 설치 복구  
**Confidence:** MEDIUM

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

### 검증을 끝낼 수 없을 때의 처리

- **D-01:** 새 버전의 무결성·프로토콜 검사가 통과했어도 자격 증명 부족이나 하네스 재시작 등으로 실제 호출을 확인할 수 없으면 기존 사용 버전을 유지한다. 새 버전은 검증 대기로 준비해 두되 실제 사용 대상으로 전환하지 않는다.
- **D-02:** 프리뷰에 검증 항목과 API 호출 비용·권한 조건을 공개한다. 적용 승인 범위 안에서 허용된 읽기 전용 검사는 자동 수행하고, 추가 비용·권한 승인이 필요하면 대기한다. 기존 승인 범위를 확대하지 않는다.
- **D-03:** 대기 결과에 명시적인 검증 재개 명령을 제공한다. 사용자가 조건을 해결한 뒤 실행하면 준비해 둔 정확한 버전과 현재 상태를 재확인하고 부족했던 검증을 이어간다. 재개를 움직이는 최신 버전의 재선택으로 바꾸지 않는다.
- **D-04:** 검증 증거가 의존하는 버전·설정·하네스 등 조건이 그대로면 기존 결과를 재사용한다. 변경된 조건에 관련된 검사는 다시 수행하며, 전환 직전에는 실제 사용 대상이 맞는지 재확인한다.

### 업데이트 인정의 단위

- **D-05:** 공유 설치는 영향받는 모든 하네스의 필수 검증이 통과한 뒤 함께 전환한다. 일부 하네스만 성공했거나 검증 대기이면 공유 설치의 기존 버전을 유지한다. 하네스별 성공·실패·대기 결과는 별도로 표시한다.
- **D-06:** 검증 대상은 현재 연결 설정과 실행 경로로 해당 설치를 실제 사용하도록 연결된 하네스다. 설치된 모든 지원 하네스를 무조건 포함하지 않는다. 사용 대상을 확정할 수 없으면 전환을 보류하고 확인 방법을 안내한다.
- **D-07:** 여러 도구를 한 번에 업데이트하면 한 도구라도 연동 검증 실패·대기 상태일 때 검토한 작업 전체의 전환을 보류한다. 정상 도구만 진행하려면 `--tool`로 범위를 좁혀 새 프리뷰를 검토한다. 기존 출처·무결성·계획 변경 검사 실패 시 전체 적용 거부도 유지한다.
- **D-08:** 전환과 필수 검증이 모두 끝나야 성공으로 종료한다. 완료·검증 대기·실패를 CLI 종료 상태와 구조화된 결과에서 구분한다. 검증 대기와 실패는 서로 다른 비성공 종료 코드로 반환하고, 이유와 다음 조치를 제공한다. 이전 버전으로 복구됐다고 새 버전 업데이트를 성공 처리하지 않는다.

### 적용 후 실패의 자동 복구 범위

- **D-09:** 전환 후 검사 실패 시 프리뷰에서 검토된 범위 안에서 즉시 자동 복구한다. 보존한 이전 버전과 설정을 복원하고 실제 사용 대상·연동을 재확인한다. 추가 권한이나 검토 범위 밖 변경이 필요하면 멈추고 안내한다.
- **D-10:** 여러 도구 전환 중 실패하면 이번 작업에서 전환한 도구 전체를 작업 전 상태로 복구하는 것을 목표로 한다. 도구별 선언된 네이티브 복구 방법을 사용하고 실제 복구 결과와 미복구 부수 효과를 각각 표시한다. 전체 원상복구를 증거 없이 보장하지 않는다.
- **D-11:** 이전 버전 복구와 동작 확인이 성공하면 복구 상태를 유지하고 명시적인 재시도를 기다린다. 실패 원인과 재시도 방법을 제공하며 실패했던 새 버전으로 자동 재전환하지 않는다.
- **D-12:** 복구 자체가 실패하거나 복원 후 실제 사용 버전을 확인할 수 없으면 읽기 전용 진단으로 확인 가능한 현재 버전·경로·설정과 미복구 효과를 수집한다. 추가 변경은 멈추고 필요한 권한과 범위를 명시한 구체적인 다음 복구 명령을 제공한다. 관찰하지 못한 실제 활성 식별 정보는 확인 불가로 남긴다.

### 중단된 설치의 재개와 이전 파일 보존

- **D-13:** 다음 설치·업데이트 실행에서 미완료 기록을 발견하면 읽기 전용으로 실제 상태를 확인하고 기존 작업부터 복구·정리한다. 기존 승인과 복구 조건이 여전히 유효할 때만 검토된 복구를 수행한다. 권한·범위가 달라졌거나 상태를 확정할 수 없으면 멈추고 복구 명령을 안내한다. 정리 전에는 같은 도구의 새 작업을 시작하지 않는다.
- **D-14:** 현재 사용 버전, 직전 정상 버전, 검증 대기·복구 중인 작업에 필요한 파일은 보호한다. 더 오래된 이전 버전과 다운로드 아티팩트도 자동 삭제하지 않고 명시적인 정리 명령으로만 삭제한다. 정리 프리뷰에 삭제 대상과 복구에 미치는 영향을 표시한다. Phase 39에서 정한 실패·중단을 포함한 메타데이터·이력의 자동 삭제 금지도 유지한다.
- **D-15:** 검증 대기 중인 버전을 적용하지 않으려면 명시적인 취소 명령을 제공한다. 기존 사용 버전을 유지하고 대기 작업을 취소 상태로 마감한다. 증거와 이력은 보존하며 남은 파일 삭제는 별도 정리 명령으로 처리한다. 취소를 자동 파일 삭제나 새 버전 선택으로 대체하지 않는다.
- **D-16:** 중단 복구에 필요한 이전 버전 파일이 손상·누락됐으면 원래 프리뷰의 복구 범위 안에서만 정확히 동일한 이전 버전의 공식 아티팩트 재확보를 허용한다. 출처·무결성을 검증하고, 확보할 수 없으면 미복구 상태와 다음 조치를 표시한다. 임의의 다른 버전으로 대체하지 않는다.

### the agent's Discretion

사용자가 별도로 판단을 위임한 항목은 없다. 재개·취소·복구·정리 명령의 정확한 이름과 인자, 비성공 종료 코드의 숫자, 증거 의존 조건의 직렬화, 어댑터별 준비·검증·전환·복구 구현은 위 결정을 만족하는 범위에서 연구·계획 단계에서 정한다. 명령은 아직 구현된 것으로 안내하지 않는다.

### Deferred Ideas (OUT OF SCOPE)

없음 — 네 영역 모두 Phase 42의 검증·복구 범위 안에서 논의했다. 기존 Phase 43 범위와 v0.7.0의 미완료 실호스트 인수 검증을 이번 결정만으로 완료 처리하지 않는다.
</user_constraints>

## Project Constraints (from AGENTS.md)

- 저장소 자체 개발은 native Codex로 수행하며 alpha-AOS 거버넌스·팩·계약·자동실행을 호출하지 않는다. 이번 명시적 GSD 호출은 계획 산출물만 허용한다. [VERIFIED: AGENTS.md:5-13]
- 개인 워크스테이션 전달 정책상 push/CI/전체 테스트는 자동 전제조건이 아니며, 실행하지 않은 검증을 통과했다고 말하지 않는다. [VERIFIED: AGENTS.md:12-14]
- Node.js `>=24.0.0`, npm `>=10.0.0`, Git 및 5개 하네스의 실제 증거·루트 제한·비밀 비노출·롤백 안전성은 제품 제약으로 유지한다. [VERIFIED: AGENTS.md:30-45]
- TypeScript는 strict, 상대 `.js` import, 경계 입력 검증과 구체적 `Error`를 사용하고, CLI만 출력하며 비밀 값은 출력하지 않는다. [VERIFIED: AGENTS.md:106-136]

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|---|---|---|
| PROOF-01 | 미기록 버전을 기록 부재만으로 거부하지 않고 실제 연동 검사한다. | 후보 준비와 protocol/schema/읽기 전용 invocation의 분리, 후보별 protocol profile·증거 fingerprint 설계. |
| PROOF-02 | 설치·발견·schema/protocol·실제 invocation을 구분하고 미수행을 명시한다. | 네 단계 evidence 레코드와 `pending`/`needs-action` 결과 모델, MCP `tools/list`와 `tools/call`의 분리. |
| PROOF-03 | 적용 전 실패는 기존 동작 설치를 보존하고 원인을 보인다. | 활성 전환 전의 staging barrier, 전체 작업 보류, 정확한 후보/사전상태 재확인. |
| PROOF-04 | 적용 후/중단된 네이티브 설치를 도구별로 복구·재조정하고 남은 효과를 보고한다. | adapter recovery contract, interruption reconciliation, explicit cleanup/reacquisition 및 실제 활성 identity 재검증. |
</phase_requirements>

## Summary

현재 구현은 정확한 릴리스 토큰·계획 다이제스트 재검증, 단일 writer, 도구별 이벤트 기록, MCP 프로토콜 목록 검사, 관리 파일 롤백의 기반을 이미 갖는다. 그러나 `applyLocalReleasePlan`은 설치 직후 모든 도구 결과를 `outcome: "succeeded"`, `verified: null`로 기록하고 즉시 성공 메시지를 반환한다. 따라서 Phase 42는 이를 연동 성공으로 해석하지 않도록 준비/검증/활성화/복구를 분리한 내구성 작업 상태 기계로 확장해야 한다. [VERIFIED: src/core/update.ts:1276-1414]

MCP에서 `tools/list`와 `tools/call`은 별도 요청이다. 현재 픽스처는 초기화와 목록을 수행하지만 실제 도구 호출은 하지 않으며, 프록시는 실제 호출의 성공·도구 오류·전송 오류·정책 거부를 이미 구분하여 관찰할 수 있다. 즉, 기존 fixture 결과는 후보의 protocol/discovery 증거로 남기고, 실제 사용 하네스와 alpha-AOS 프록시를 통과한 허용된 읽기 전용 호출만 invocation 증거로 승격해야 한다. [VERIFIED: src/core/mcp-fixture.ts:94-155] [VERIFIED: src/core/mcp-proxy.ts:715-770] [CITED: https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle]

**Primary recommendation:** 새 패키지나 전역 설치 없이, `src/core/release-verification.ts`와 `src/core/release-recovery.ts`를 추가하고, `update.ts`의 즉시 활성화 경로를 “준비 → 영향받은 실제 하네스별 검증 → 전부 통과 시 전환 → 전환 후 재검증/복구” barrier로 교체한다. 준비/전환/복구의 파일·네이티브 효과·증거 fingerprint를 같은 operation에 내구성 있게 기록한다. [ASSUMED]

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|---|---|---|---|
| 후보 릴리스의 정확한 준비·무결성 재확인 | API / Backend (로컬 CLI core) | Database / Storage | CLI core가 공식 아티팩트와 계획을 묶고 state root에 증거만 저장한다. [VERIFIED: src/core/update.ts:1029-1267] |
| 실제 사용 하네스 발견 | API / Backend (로컬 CLI core) | Harness native config | 설치됨이 아니라 config/execution path가 가리키는 identity를 검증해야 한다. [VERIFIED: .planning/phases/42-integration-verification-and-recovery/42-CONTEXT.md:40-41] |
| MCP protocol/schema 및 읽기 전용 호출 | API / Backend (로컬 CLI core) | Harness / proxy process | protocol probe는 stdio 세션, 실제 MCP 검증은 프록시와 하네스 경계를 함께 지나야 한다. [VERIFIED: src/core/mcp-fixture.ts:94-155] [VERIFIED: src/core/mcp-proxy.ts:715-782] |
| 공유 도구의 일괄 전환 | API / Backend (로컬 CLI core) | Database / Storage | 전환 조건과 operation atomicity는 단일 writer와 durable operation이 소유해야 한다. [VERIFIED: src/core/tool-record-store.ts:78-149] |
| 중단/실패 복구와 실제 상태 재조정 | API / Backend (로컬 CLI core) | Native installer / Storage | 네이티브 installer가 바꾼 상태는 파일 transaction만으로 되돌릴 수 없으므로 adapter별 read-only diagnosis가 필요하다. [VERIFIED: src/core/install.ts:882-1025] |
| 결과/다음 조치와 JSON 출력 | CLI boundary | Formatter | core는 구조화된 결과를 반환하고 CLI/formatter가 동일한 evidence를 렌더해야 한다. [VERIFIED: src/format.ts:2308-2402] |

## Standard Stack

### Core

| Library / runtime | Version | Purpose | Why Standard |
|---|---:|---|---|
| Node.js built-ins | `>=24.0.0` | process cancellation, filesystem durability, SHA-256, JSON records | 새 런타임을 도입하지 않고 현재 `runProcess`의 abort/tree termination과 transaction/record 경계를 재사용한다. [VERIFIED: package.json:48-50] [VERIFIED: src/core/process.ts:14-23] |
| `@modelcontextprotocol/sdk` | `1.32.2` | stdio client/server와 typed MCP request handling | 이미 프로젝트 의존성이며 프록시가 `Client`로 upstream에 연결한다. [VERIFIED: package.json:52-59] [VERIFIED: src/core/mcp-proxy.ts:715-751] |
| Node `node:test` | repository built-in | unit/integration fixture tests | `npm test`는 build 후 project test runner를 실행한다. [VERIFIED: package.json:37-46] |

### Supporting

| Component | Purpose | When to Use |
|---|---|---|
| `component-session.ts` | reviewed digest, path proof, one writer | 준비·전환·복구 operation의 각 mutation 전 재검증. [VERIFIED: src/core/component-session.ts:61-166] |
| `tool-record-store.ts` | append-only 시작/도구 결과/종료 이벤트 | lifecycle 상태와 evidence summary를 기존 operation ID에 결속. [VERIFIED: src/core/tool-record-store.ts:44-149] |
| `mcp-proxy.ts` | allowlist 경유 호출 observation | 직접 upstream 성공을 alpha-AOS 경계 성공으로 오인하지 않도록 할 때. [VERIFIED: src/core/mcp-proxy.ts:740-770] |
| `transaction.ts` | owned-file snapshot/journal rollback | alpha-AOS 소유 config만 복구할 때; 네이티브 rollback의 대체물이 아님. [VERIFIED: src/core/transaction.ts:353-418] |

**Installation:** 새 외부 패키지는 설치하지 않는다. [ASSUMED]

**Package Legitimacy Audit:** 해당 없음 — Phase 42는 기존 dependency와 프로젝트 코드를 확장하며 새 package installation을 권고하지 않는다. [ASSUMED]

## Architecture Patterns

### System Architecture Diagram

```text
reviewed preview + digest/token
            |
            v
  read-only preflight: source/integrity/pre-state/affected-harness discovery
            | plan drift, unknown active target
            +------------------------------> refuse; fresh preview / diagnosis
            |
            v
 prepare exact candidate (inactive, retained previous artifact)
            |
            v
 protocol + schema fixture ----> evidence fingerprint cache
            |
            v
 per actual affected harness: native config/execution identity -> proxy/client -> allowed read-only call
            | missing credential / cost approval / reload / service
            +------------------------------> verification-pending; old active version remains
            | any failure
            +------------------------------> failed-pre-apply; old active version remains
            |
            v all required evidence passes for every selected tool/harness
 activate reviewed batch -> post-activation identity + invocation recheck
            | post-apply failure / interruption
            v
 adapter-native recovery + owned-file rollback -> read-only reconciliation
            +------------------------------> recovered-failed or recovery-required; never update-success
```

이 순서는 candidate의 isolated protocol 검사를 host proof로 승격하지 않고, 어느 activation도 shared affected-harness barrier 이전에 일어나지 않게 한다. [VERIFIED: .planning/phases/42-integration-verification-and-recovery/42-CONTEXT.md:12-33]

### Recommended Project Structure

```text
src/core/
├── release-verification.ts  # proposed: candidate, protocol, host/proxy invocation evidence
├── release-recovery.ts      # proposed: adapter-native recovery, reconciliation, retention/cleanup plans
├── update.ts                # orchestration boundary; replace immediate success path
├── tool-records.ts          # extend/validate durable lifecycle facts
├── tool-record-store.ts     # atomic operation events; preserve accepted chain rules
└── mcp-fixture.ts           # reusable protocol/discovery probe, not invocation proof
test/
├── release-verification.test.ts
├── release-recovery.test.ts
└── local-release-update.test.ts
```

새 modules와 exact exported names는 계획 단계의 제안이며 아직 구현된 API가 아니다. [ASSUMED]

### Pattern 1: Evidence is tiered and fingerprinted

**What:** 각 tool/harness에 설치, 발견, protocol/schema, invocation의 독립 evidence를 기록한다. evidence는 target release, installation identity, harness config/execution-path digest, adapter revision, platform/architecture, proxy policy revision 및 read-only request class의 fingerprint에 결속한다. 같은 fingerprint면 재사용하고 하나라도 달라지면 해당 tier부터 재검사한다. [ASSUMED]

**Why:** 현재 record schema는 이미 `installation`, `integrity`, `integration` target과 `sha256`, `signature`, `invocation`, `protocol`, `discovery` method를 구분한다. 아래 값은 source-of-truth의 verbatim 값이다: `"target": {"enum": ["installation", "integrity", "integration"]}` 및 `"method": {"enum": ["sha256", "signature", "invocation", "protocol", "discovery"]}`. [VERIFIED: schemas/tool-release-record.schema.json:31-32]

**Implementation seam:** schema v2를 도입하거나 별도 `release-operation` document를 추가해 pending/cancelled/recovered facts를 표현한다. 기존 v1 `ToolResult.outcome`은 `"succeeded", "failed", "unknown"`만 허용하므로, 기존 값을 재정의하지 않는다. verbatim 기존 enum: `"outcome": {"enum": ["succeeded", "failed", "unknown"]}`. [VERIFIED: schemas/tool-release-record.schema.json:32-32]

### Pattern 2: Actual affected-harness discovery before a shared barrier

**What:** 고정 table을 “검증 대상”으로 쓰지 말고, inventory의 observed native configuration과 resolved execution path에서 candidate가 실제 사용되는 harness만 산출한다. `unknown` 또는 path/config drift는 `pending`이며, 더 넓은 설치된 harness를 억측해 통과 처리하지 않는다. [ASSUMED]

**Why:** 현재 table은 모든 일반 도구를 다섯 harness에, Pi bridge만 Pi에 매핑한다. verbatim source values: `"cua-driver": ["claude", "codex", "antigravity", "pi", "hermes"]` 및 `"bridge:pi": ["pi"]`. 이는 preview blast-radius의 conservative input일 뿐 D-06의 actual-use proof가 아니다. [VERIFIED: src/core/update.ts:275-283]

### Pattern 3: Candidate preparation without activation

**What:** adapter contract를 `prepare`, `verify`, `activate`, `recover`, `reconcile`로 나눈다. `prepare`는 exact artifact와 previous identity를 state root의 protected operation scope에 기록/보존하지만 active alias, PATH, harness native config를 바꾸지 않는다. native installer가 true inactive staging을 지원하지 않으면 해당 tool은 pre-apply host verification을 할 수 없으므로 activation 이전에는 `needs-action`으로 끝내고 기존 버전을 유지한다. [ASSUMED]

**Why:** 기존 update apply는 `applyManagedInstall`을 호출한 뒤 각 tool을 성공으로 기록하므로 candidate/active separation이 없다. [VERIFIED: src/core/update.ts:1317-1401]

### Pattern 4: Batch decision, adapter-native rollback, then reconciliation

**What:** 한 operation에 선택된 tool 중 하나라도 pending/fail이면 아무 tool도 activate하지 않는다. activation 후 하나라도 fail/interrupted이면 operation에서 activate된 모든 tool에 declared native recovery를 역순으로 시도하고, 그 결과를 read-only actual identity/relevant invocation으로 재확인한다. owned-file journal rollback은 부수 단계로만 사용한다. [ASSUMED]

**Why:** 현재 managed install도 외부 installer가 변경한 native state는 자동 rollback하지 않으며 external changes를 보고한다. [VERIFIED: src/core/install.ts:882-1025]

### Proposed CLI surface and exit statuses

다음은 **제안**이며 기존 명령이 아니다. Phase 40의 `install/update --apply` token contract는 유지한다. [ASSUMED]

| Intent | Proposed command form | Mutation | Result contract |
|---|---|---|---|
| 전체 lifecycle 시작 | `alpha-aos update --apply --plan-digest … --reviewed-plan …` | approved candidate prepare/verification/activation only | all-pass만 success; pending/fail은 non-success |
| pending 재검증 | `alpha-aos update --resume <operation-id> --apply` | prior reviewed scope가 재검증될 때만 | latest 재선택 금지; stale이면 fresh preview |
| pending 취소 | `alpha-aos update --cancel <operation-id> --apply` | operation state only | active version 유지, evidence/artifact 보존 |
| interrupted/post-apply 복구 | `alpha-aos update --recover <operation-id> --apply` | declared recovery scope only | reconciliation의 observed state와 residual effects 출력 |
| 명시적 artifact cleanup | `alpha-aos update --cleanup <operation-id>` then `--apply` | previewed removable files only | protected current/previous/pending/recovery artifacts 제외 |

권장 종료 상태 숫자는 `0=accepted`, `3=verification-pending`, `4=update-failed-or-recovered`, `5=recovery-required`, `2=invalid-or-stale-plan`이다. 이는 새 public contract 제안이므로 implementation 전에 planner가 결정으로 확인해야 한다. [ASSUMED]

### Ordered implementation slices

1. **Domain contract and read-only reconciliation:** release operation lifecycle, evidence dependency fingerprints, protected artifacts, adapter recovery descriptor, current-actual diagnostic; v1 accepted chain의 immutable semantics를 보존한다. [ASSUMED]
2. **Verification runner:** protocol/schema fixture plus actual-use discovery and proxy/harness read-only invocation; cost/credential/reload are pending evidence, not failure or pass. [ASSUMED]
3. **Update interlock:** pre-apply staging barrier, all-tool/all-actual-harness decision, post-activation check, atomic record transition only after proof. [ASSUMED]
4. **Recovery/control CLI:** resume/cancel/recover/cleanup preview/apply, interruption-first reconciliation, exact prior-artifact reacquisition only within approved recovery scope. [ASSUMED]
5. **Output and adversarial tests:** JSON/text equivalence, redaction, fake native installers/proxies and interrupted journals across every terminal state. [ASSUMED]

### Anti-Patterns to Avoid

- **`tools/list`를 호출 증거로 승격:** 목록은 capability/discovery evidence일 뿐 network permission, credential, request schema, proxy policy, server-side tool error를 검사하지 않는다. [CITED: https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle]
- **전역 table만으로 actual harness 지정:** current mapping은 blast radius 표시용이다; D-06은 resolved configuration/execution path를 요구한다. [VERIFIED: src/core/update.ts:275-283] [VERIFIED: .planning/phases/42-integration-verification-and-recovery/42-CONTEXT.md:22-24]
- **파일 rollback을 native rollback이라고 표시:** current install code도 external installer native state가 자동 rollback되지 않을 수 있음을 명시한다. [VERIFIED: src/core/install.ts:882-1025]
- **취소를 artifact 삭제로 구현:** D-15/D-14와 충돌하며 실패·중단 evidence와 recovery inputs를 잃는다. [VERIFIED: .planning/phases/42-integration-verification-and-recovery/42-CONTEXT.md:34-39]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---|---|---|---|
| child process cancellation/tree termination | installer별 ad-hoc `kill` | existing `runProcess` `AbortSignal` and tree termination result | Windows/POSIX subtree semantics, close confirmation, output bounds, redaction이 이미 있다. [VERIFIED: src/core/process.ts:471-628] |
| MCP stdio negotiation | JSON-RPC framing parser | existing `openProtocolProcess` fixture session / SDK client | absolute deadline, frame cap, allowlisted environment를 보존한다. [VERIFIED: src/core/mcp-fixture.ts:94-155] |
| config rollback | unjournaled direct writes | `applyFileTransaction` / `rollbackManagedTransaction` | snapshot-before-write, path proof, LIFO rollback constraints가 있다. [VERIFIED: src/core/transaction.ts:353-418] [VERIFIED: src/core/transaction.ts:655-744] |
| tool operation history | mutable status file | append-only `tool-record-store` | terminal evidence와 accepted transition 검증을 기존 journal에 결속한다. [VERIFIED: src/core/tool-record-store.ts:93-149] |
| MCP policy validation | upstream direct tool call | existing proxy and `allowedMcpTools` | Firecrawl allowlist is policy; bypass cannot prove alpha-AOS client/proxy behavior. [VERIFIED: src/core/mcp-proxy.ts:27-35] [VERIFIED: src/core/mcp-proxy.ts:740-770] |

**Key insight:** native effects vary by tool; shared lifecycle orchestration can be generic, but activation/recovery/reconciliation must dispatch through declared per-tool adapters. [ASSUMED]

## Common Pitfalls

### Pitfall 1: Existing `apply` says success before integration evidence

**What goes wrong:** installation result becomes a successful operation although `verified` remains null and no accepted transition is emitted. [VERIFIED: src/core/update.ts:1373-1401]

**How to avoid:** split “prepared/installed” from “accepted”; only call `finishToolOperation` with accepted transitions after matching actual invocation proof(s) pass. Existing transition validation already requires an integration/invocation/pass proof with harness and matching installation identity. [VERIFIED: src/core/tool-record-store.ts:130-149]

### Pitfall 2: Protocol version drift

**What goes wrong:** current fixture initializes with `"protocolVersion": "2025-06-18"`, while MCP specifications evolve. A hard-coded newest version can break a selected candidate before it is meaningfully evaluated. [VERIFIED: src/core/mcp-fixture.ts:132-145] [CITED: https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle]

**How to avoid:** bind a candidate-specific supported protocol profile to the reviewed plan and record negotiated protocol capability; do not infer unsupportedness from the absence of a version list. [ASSUMED]

### Pitfall 3: One successful harness activates a shared install

**What goes wrong:** one harness proof hides a pending/failing consumer of the same global package or MCP registration.

**How to avoid:** compute actual affected harnesses, require all required results, and block the complete reviewed tool batch on any fail/pending. Existing record reader already rejects partially applied multi-identity acceptance chains. [VERIFIED: src/core/tool-records.ts:231-242]

### Pitfall 4: Cancellation is mistaken for rollback

**What goes wrong:** process cancellation may stop the child but its installer may already have changed native state. Node documents AbortSignal cancellation as a process abort; it does not establish installer rollback. [CITED: https://nodejs.org/docs/latest-v24.x/api/child_process.html]

**How to avoid:** persist `started` before first native mutation, classify no-terminal operation as interrupted, then reconcile before any new operation for that tool. Existing reader calls a start without terminal event `interrupted` when writer ownership is gone. [VERIFIED: src/core/tool-records.ts:151-162]

### Pitfall 5: Credentials or request values enter durable evidence

**What goes wrong:** invocation evidence can accidentally preserve API keys, identifiers, tool arguments or raw server output.

**How to avoid:** persist only request class/name, outcome, redacted bounded excerpts and hashes; keep proxy observation’s no-value model. [VERIFIED: src/core/mcp-proxy.ts:740-770] [VERIFIED: src/core/process.ts:58-65]

### Pitfall 6: Reacquiring “a prior version” rather than the exact artifact

**What goes wrong:** a recovery branch silently substitutes a different version or mutable release asset.

**How to avoid:** retain the original release/artifact/source/integrity tuple; re-download only that tuple through the original official adapter and revalidate before recovery. This is a locked decision, while the on-disk serialization is still to be designed. [VERIFIED: .planning/phases/42-integration-verification-and-recovery/42-CONTEXT.md:38-39]

## Code Examples

### Evidence state transition (implementation pattern)

No copy-paste type skeleton is supplied because lifecycle status names and schema version are new public values still at planner discretion. Implement the following invariant instead: `accept` is reachable only after `prepared`, all required protocol/discovery evidence, all actual-harness invocation evidence, activation, and post-activation recheck; `pending`, `failed-pre-apply`, `recovered-failed`, and `recovery-required` never write an accepted transition. [ASSUMED]

The existing acceptance guard gives the required seam: it checks the proof target `integration`, method `invocation`, result `pass`, non-null harness, and matching installation/version/platform/architecture before it permits the transition. [VERIFIED: src/core/tool-record-store.ts:143-149]

### MCP verification flow

Use the existing ordered behavior as the reference: initialize, send `notifications/initialized`, list tools, then separately perform one declared allowed read-only `tools/call` via the same proxy/client boundary. MCP’s lifecycle requires initialization before normal operations and advises timeout/cancellation handling. [VERIFIED: src/core/mcp-fixture.ts:132-152] [CITED: https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle]

## State of the Art

| Old approach | Current Phase 42 approach | Impact |
|---|---|---|
| install result is recorded as success with no real invocation proof | staged candidate plus host/proxy invocation evidence gates acceptance | prevents a fixture/protocol-only result from activating a shared version. [ASSUMED] |
| fixed full harness map is preview data | resolved actual-use discovery is validation scope | avoids both untested consumers and unjustified all-harness claims. [ASSUMED] |
| owned file rollback is the only automatic mechanism | adapter-native recovery then read-only reconciliation | reports residual native effects honestly. [ASSUMED] |

**Deprecated/outdated:** treating a missing entry in a compatibility/support list as incompatibility. The Phase boundary explicitly rejects that criterion; a positive protocol/schema/call test decides the selected candidate. [VERIFIED: .planning/phases/42-integration-verification-and-recovery/42-CONTEXT.md:7-11]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|---|---|---|
| A1 | `release-verification.ts` and `release-recovery.ts` are the best module split. | Architecture Patterns | planner may choose different seams, but must retain the lifecycle boundary. |
| A2 | proposed `update --resume/cancel/recover/cleanup` command forms are suitable. | Proposed CLI surface | public CLI may need a different compatible syntax. |
| A3 | exit code numbers `3`, `4`, `5` are appropriate. | Proposed CLI surface | scripts could rely on a different stable numeric contract. |
| A4 | **Resolved design disposition:** universal inactive preparation is not assumed. Every adapter must positively prove its own inactive capability; unavailable or unproven capability yields `verification-pending` with the old active identity unchanged. | Pattern 3; Plans 42-01/42-04 | Per-release empirical capability remains runtime evidence, not a planning claim. |
| A5 | **Resolved design disposition:** use a separate backward-readable lifecycle schema/store at `userStateRoot()/tool-release-lifecycle/v1/operations/<operationId>/events/<sequence>.json`; existing `ToolRecordEvent` history and accepted semantics remain untouched. | Pattern 1; Plan 42-02 | New lifecycle readers must keep schema-version dispatch; legacy evidence is never silently promoted. |

## Open Questions (RESOLVED)

1. **Inactive candidate staging — design contract resolved; empirical support remains runtime-gated.**
   - Verified boundary: Cua preview lists retained releases and recovery scope; generic global npm install is an external mutation. [VERIFIED: src/core/update.ts:588-665]
   - Decision: every `NativeReleaseAdapter` declares `prepareMode: "inactive" | "activation-required" | "unsupported"`. `inactive` is accepted only when `prepare` returns positive proof containing the exact candidate artifact/integrity tuple plus before/after active identity, alias/config digests and resolved execution path, with every active binding unchanged. `activation-required` and `unsupported`, or a missing/mismatched proof, return `verification-pending`/`needs-action`, preserve the old active identity and perform no candidate activation.
   - Runtime boundary: this decision does not assert which current release/tool actually supports inactive preparation. Plan 42-01 Task 42-01-01 and Plan 42-04 Task 42-04-02 require adapter-specific evidence; absent evidence stays pending.

2. **Safe read-only invocation — descriptor contract resolved; no call shape is invented.**
   - Verified boundary: proxy policy allows only four Firecrawl tool names, and `tools/list` is insufficient. [VERIFIED: src/core/mcp-proxy.ts:27-35] [VERIFIED: src/core/mcp-proxy.ts:715-770]
   - Decision: an auditable `ReadOnlyInvocationDescriptor` must bind `descriptorId`, `revision`, `toolId/serverId`, `harness`, `requestClass`, `toolName`, a closed argument schema (names/types/required fields, never credential values), `credentialTier`, `permissionScope`, `costClass: "none" | "metered" | "unknown"`, `requiresApproval`, `boundary: "harness-native" | "alpha-aos-proxy"`, expected observation class and result-redaction/digest policy. Automatic invocation is allowed only when the descriptor and current approval cover the exact request/cost/permission and the actual configured boundary can be observed.
   - Runtime boundary: absence of this descriptor, an unknown/metered cost without approval, missing permission/credential/reload, or inability to traverse the actual boundary is `verification-pending`; the planner does not manufacture a supposedly free request. Plan 42-01 Tasks 42-01-01/02 consume this contract.

3. **Legacy acceptance and new lifecycle coexistence — separate store selected.**
   - Verified boundary: existing schema has closed enums and current readers validate journal-backed terminal events. [VERIFIED: schemas/tool-release-record.schema.json:4-35] [VERIFIED: src/core/tool-records.ts:130-243]
   - Decision: preserve all existing `ToolRecordEvent` bytes, readers and accepted transitions unchanged. Add `schemas/tool-release-lifecycle.schema.json` and append-only events under `userStateRoot()/tool-release-lifecycle/v1/operations/<operationId>/events/<sequence>.json`, linked by operation/tool/installation identities. New projection code may display both stores but may create an accepted transition only through the existing invocation-proof guard; legacy records never acquire lifecycle completion by inference.
   - Compatibility boundary: unknown newer lifecycle schema versions remain unreadable/needs-action, not success. Plan 42-02 Tasks 42-02-01/02 implement and test this contract.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|---|---|---:|---|---|
| Node.js | CLI, tests, protocol/process runners | ✓ | `v24.13.1` | none |
| npm | current workspace scripts and managed-tool adapters | ✓ | `11.8.0` | none |
| Git | repository workflow/tool provenance | ✓ | `2.55.0.windows.3` | none |
| real harness credentials/services | actual invocation proof | unknown | — | explicit `verification-pending`, never fixture promotion |

The first three values were probed in this research session; real host credentials/services were deliberately not invoked. [VERIFIED: session command output, 2026-11-09]

## Validation Architecture

### Test Framework

| Property | Value |
|---|---|
| Framework | Node built-in `node:test` after TypeScript build [VERIFIED: package.json:37-46] |
| Config file | `tsconfig.json`; no separate test config was identified in the inspected package scripts. [VERIFIED: package.json:37-46] |
| Quick run command | `npm run build && node --test dist/test/local-release-update.test.js` [ASSUMED: dist test file naming must be confirmed after build] |
| Full suite command | `npm test` [VERIFIED: package.json:37-46] |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|---|---|---|---|---|
| PROOF-01 | unknown selected version proceeds to protocol/schema + configured read-only path, not list exclusion | unit + fake MCP integration | `npm test -- --test-name-pattern="integration verification"` [ASSUMED] | ❌ Wave 0 |
| PROOF-02 | installation/discovery/protocol/invocation/pending remain separate in JSON/text | unit | `npm test -- --test-name-pattern="evidence tiers"` [ASSUMED] | ❌ Wave 0 |
| PROOF-03 | pre-apply failure leaves active identity unchanged and writes no accepted transition | unit + fake adapter | existing local-release test target after extension | ✅ extend `test/local-release-update.test.ts` |
| PROOF-04 | post-apply/interruption runs declared recovery then reports observed identity/residual effects | integration with fake native installer | `npm test -- --test-name-pattern="release recovery"` [ASSUMED] | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** targeted compiled Node test for changed module(s). [ASSUMED]
- **Per wave merge:** `npm test`. [VERIFIED: package.json:44-44]
- **Phase gate:** focused fake-host/proxy tests pass; real host tests remain explicitly unverified unless their actual receipts exist. [ASSUMED]

### Wave 0 Gaps

- [ ] `test/release-verification.test.ts` — PROOF-01/02: protocol list vs call, credential/cost/reload pending, fingerprint reuse/invalidation.
- [ ] `test/release-recovery.test.ts` — PROOF-03/04: fake activation fault, interruption, reverse recovery, reconciliation and exact-artifact refusal.
- [ ] Extend `test/local-release-update.test.ts` — old apply behavior is presently asserted as `verified: null`; replace only with explicit pending/accepted lifecycle expectations. [VERIFIED: test/local-release-update.test.ts:763-763]
- [ ] Extend `test/mcp-proxy.test.ts` — proxy-path read-only call is a proof only if allowlist, request class, and observed outcome match. [VERIFIED: test/mcp-proxy.test.ts:1176-1176]

## Security Domain

OWASP ASVS is a security verification framework; stable ASVS 5.0.0 is published by OWASP. This phase uses it as a threat-coverage checklist, not as a claim of ASVS compliance. [CITED: https://asvs.owasp.org/]

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---|---|---|
| V2 Authentication | conditional | missing credential is `pending`; no credential value is serialized. [ASSUMED] |
| V3 Session Management | yes | bounded process/protocol sessions; close/cancellation result is recorded before reconciliation. [VERIFIED: src/core/process.ts:471-628] |
| V4 Access Control | yes | adapter declares permitted read-only call; proxy allowlist rejects other calls. [VERIFIED: src/core/mcp-proxy.ts:740-770] |
| V5 Input Validation | yes | closed CLI flags/schema and reviewed plan/path proofs before mutation. [VERIFIED: src/core/component-session.ts:92-123] |
| V6 Cryptography | yes | reuse existing SHA-256/integrity evidence; do not implement custom cryptography. [VERIFIED: src/core/update.ts:1188-1215] |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---|---|---|
| mutable/latest release or changed plan token | Tampering | exact release binding + source/integrity/local pre-state revalidation; fail closed on drift. [VERIFIED: src/core/update.ts:1029-1267] |
| untrusted native config alters command/path | Tampering / Elevation | prove/recheck paths and require absolute executable; no shell parsing. [VERIFIED: src/core/component-session.ts:92-123] [VERIFIED: src/core/process.ts:477-497] |
| credential/request-output disclosure in evidence | Information Disclosure | env allowlists, redaction/bounds, persist fingerprints not values. [VERIFIED: src/core/process.ts:34-90] |
| cancel/timeout leaves installer side effects | Repudiation / Tampering | record interruption, reconcile first, then bounded adapter recovery. [VERIFIED: src/core/tool-records.ts:151-162] [ASSUMED] |
| policy-bypassing upstream direct tool call | Elevation | execute proof through alpha-AOS proxy and retain denied/transport/tool outcome. [VERIFIED: src/core/mcp-proxy.ts:740-770] |

## Sources

### Primary (HIGH confidence)

- Current repository source-of-truth files opened in this session: `src/core/update.ts`, `tool-records.ts`, `tool-record-store.ts`, `mcp-fixture.ts`, `mcp-proxy.ts`, `process.ts`, `transaction.ts`, `install.ts`, `component-session.ts`, `src/types.ts`, `schemas/tool-release-record.schema.json`, `package.json`, and focused tests.

### Secondary (MEDIUM confidence)

- [Model Context Protocol TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk/blob/v1.29.0/docs/client.md) — stdio client connection, `listTools`, `callTool`, timeout usage. [CITED: Context7 `/modelcontextprotocol/typescript-sdk/v1.29.0`]
- [Node.js v24 child_process](https://nodejs.org/docs/latest-v24.x/api/child_process.html) — AbortSignal abort behavior and `AbortError`. [CITED: Context7 `/websites/nodejs_latest-v24_x_api`]
- [MCP lifecycle specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle) — initialization, capability negotiation, timeout/cancellation and stdio shutdown. [CITED: https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle]
- [OWASP ASVS](https://asvs.owasp.org/) — security verification reference. [CITED: https://asvs.owasp.org/]

### Tertiary (LOW confidence)

- None used for recommendations; Exa discovery only selected the official MCP and OWASP sources above. [VERIFIED: Exa search, 2026-11-09]

## Metadata

**Confidence breakdown:**

- Standard stack: **HIGH** — current package/runtime/process/MCP code definitions were opened in this session.
- Architecture: **MEDIUM** — current seams and locked decisions are verified; lifecycle module split and command names are intentionally flagged assumptions.
- Pitfalls: **HIGH** for existing immediate-success, interruption and proxy behavior; **MEDIUM** for adapter-specific inactive staging limits.

**Research date:** 2026-11-09  
**Valid until:** 2026-11-16 for MCP/Node documentation; repository facts are valid only against the inspected revision.
