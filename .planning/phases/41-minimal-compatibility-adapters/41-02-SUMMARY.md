# Plan 41-02 Summary: Tool Inventory & Release Update Pipeline Adapter Integration

## 1. 개요 및 달성 결과

Plan 41-02에서는 Phase 41의 핵심 목표인 호환성 어댑터 레지스트리 메타데이터와 결정론적 해시 도출(`ADAPT-01` ~ `ADAPT-04`)을 로컬 릴리스 업데이트 파이프라인(`src/core/update.ts`), 통합 도구 인벤토리(`src/core/tool-inventory.ts`), CLI 및 포매터(`src/cli.ts`, `src/format.ts`)에 완전 통합하였습니다.

- **완료된 태스크:**
  1. `41-02-01`: 로컬 릴리스 프리뷰·적용(`update.ts`)의 어댑터 해시 도출 바인딩 및 `tool-records` 증거 기록 연결 (커밋: `6fe34df`).
  2. `41-02-02`: 통합 인벤토리(`inventory`, `--detail`, `--tool`) 및 `install`/`update` 프리뷰 포매터의 어댑터 메타데이터·은퇴 증거 노출 완성 (커밋: `b5f8030`).

## 2. 세부 구현 내역

### 2.1 로컬 릴리스 프리뷰·적용 파이프라인 어댑터 바인딩 (`src/core/update.ts`)
- **`createLocalReleasePlan`**:
  - `listCompatibilityAdapters({ toolId })` 및 `summarizeToolAdapters(toolId, { adapters })`를 호출하여 도구별 어댑터 목록(`adapters`)과 요약(`adaptersSummary`)을 `ToolReleasePreviewItem`과 `ReviewedToolBinding`에 바인딩.
  - `reviewedDigest`에 도구별 어댑터 바인딩이 결정론적으로 포함되어 승인 토큰과 실행 계약을 보호.
- **`decodeReviewedReleasePlan` / `revalidateLocalReleasePlan`**:
  - 승인 토큰의 `item.adapters` 배열 유효성 및 스키마 검증.
  - 재검증 시점 레지스트리와 바인딩 토큰 간의 어댑터 목록 크기, `revision`, `status` 불일치 감지 시 `ComponentPlanError("plan-drift", ...)`로 fail-closed 거부 (`D-14`).
  - 과거 토큰 하위 호환성(`tool.adapters !== undefined` 조건) 보장.
- **`synthesizeReleaseStackLock`**:
  - `renderEccSkill` v2 최소 구조적 어댑터를 호출하여 메모리 상에서 원본 해시와 어댑터 리비전으로부터 결정론적 기대 해시 도출.
- **`applyLocalReleasePlan`**:
  - `userStateRoot()/tool-records`의 `ToolResult.evidence`에 기본 다운로드 무결성 증거와 함께 각 어댑터의 `buildAdapterToolEvidence` 레코드(`proofId: <safeToolId>-<safeAdapterId>-adapter`, `subject: <safeToolId>-compatibility`, `target: "integration"`, `method: "sha256"`, `fingerprint: derivationDigest`)를 추가 기록.
  - 닫힌 스키마(`schemas/tool-release-record.schema.json`)와 완벽 호환되며, `readToolRecordStore`에서 `status: "current"`로 검증.

### 2.2 통합 도구 인벤토리 어댑터 연계 (`src/core/tool-inventory.ts`)
- `ToolObservation` 인터페이스에 `adaptersSummary` 및 `adapters` 필드 추가.
- `collectToolInventory`:
  - 각 도구에 대해 `listCompatibilityAdapters({ toolId })`로 어댑터 목록을 조회하고, `tool-records` 내 최신 `*-adapter` 증거의 지문(`derivationDigest`)을 매핑.
  - `summarizeToolAdapters(toolId, { adapters })`를 통해 도구별 간결한 요약 텍스트(`summaryText`)를 생성하여 탑재.

### 2.3 CLI 및 포매터 확장 (`src/format.ts`, `src/cli.ts`)
- **`src/core/compatibility-adapters.ts` (`summarizeToolAdapters`)**:
  - 요약 텍스트에 활성/은퇴 어댑터의 ID 및 리비전(`ecc:deep-research-routing@v2` 등)을 포함하여 기본 인벤토리 출력의 직관성 대폭 향상.
- **`formatToolInventory`**:
  - 기존 모든 출력 줄을 온전히 보존한 채, 도구 하단에 `  adapters: <adaptersSummary.text>` 요약 한 줄을 추가 노출.
  - 기본 `alpha-aos inventory --json`에서는 `overview.components === undefined` 불변성을 철저히 보존.
- **`formatToolDetail` / `formatToolAdapterDetails`**:
  - `alpha-aos inventory --detail` 및 `alpha-aos inventory --tool <id>` 호출 시 도구별 모든 어댑터의 전체 메타데이터(`id`, `kind`, `status`, `revision`, `harnesses`, `platforms`, `rationale`, `applicability`, `verificationMethod`, `removalCondition`, 은퇴 시 `retirementReason`, `verifiedRelease`, `evidenceSummary`)를 구조화된 텍스트 및 JSON으로 출력.
- **`formatLocalReleasePreview`**:
  - `4. Recovery Scope:` 아래에 `  5. Compatibility Adapters & Policy Interfaces:` 섹션을 추가하여 install/update 프리뷰 시 사용자가 적용될 어댑터와 보안 정책 인터페이스의 전체 메타데이터를 명확히 인지하도록 보장.
- **`src/cli.ts`**:
  - `inventory` 커맨드에서 `detail || typeof tool === "string"`일 때 상세 어댑터 블록을 렌더링하도록 라우팅 연결.

## 3. 검증 결과

- **컴파일 및 엄격한 타입 검사:**
  - `npm run build`: 정상 완료 (396 inputs, 778 outputs).
  - `npm run check` (`tsc -p tsconfig.json --noEmit`): 에러 0건 통과.
- **전체 Phase 41 관련 단위 및 통합 테스트:**
  `node scripts/run-tests.mjs --files dist/test/compatibility-adapters.test.js dist/test/tool-inventory-cli.test.js dist/test/tool-inventory-compat.test.js dist/test/local-release-update.test.js dist/test/ecc-skills.test.js dist/test/gsd-compat.test.js`
  - 총 56개 테스트 실행, **56개 전체 통과 (0 fail, 0 errors)**.
    - `compatibility-adapters.test.js`: 8/8 통과
    - `ecc-skills.test.js`: 10/10 통과
    - `gsd-compat.test.js`: 10/10 통과
    - `local-release-update.test.js`: 24/24 통과
    - `tool-inventory-cli.test.js`: 4/4 통과
    - `tool-inventory-compat.test.js`: 1/1 통과

## 4. 커밋 이력

1. `6fe34df`: `feat(update): bind compatibility adapters to local release plan and tool-records (41-02-01)`
2. `b5f8030`: `feat(inventory): expose compatibility adapters in inventory and release previews (41-02-02)`
