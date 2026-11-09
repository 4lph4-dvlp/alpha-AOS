# Plan 41-01 Summary: Minimal Compatibility Adapters Registry and Tracer

## 1. 개요 및 달성 결과

Plan 41-01에서는 임의의 ad-hoc 정규식 치환을 제거하고 단일 진실 원천(authoritative single source of truth)으로 기능하는 호환성 어댑터 레지스트리(`src/core/compatibility-adapters.ts`), 3단계 별도 가이드 실증 게이트, ECC 최소 구조적 어댑터(`v2`), `alpha-aos-research-routing` 전역 배포, GSD Codex Stop 훅 상대 참조 클로저 분석 및 순수 픽스처 은퇴(`resolved-upstream`) 메커니즘을 구현하였습니다.

- **완료된 태스크:**
  1. `41-01-01`: 권위 호환성 어댑터 레지스트리(`src/core/compatibility-adapters.ts`), 3단계 가이드 게이트, 은퇴/사전조건 평가 및 결정론적 해시 도출 Tracer 구현 (커밋: `b91efdc`).
  2. `41-01-02`: ECC 최소 구조적 어댑터 전환(4개 섹션 정규식 제거), `alpha-aos-research-routing` 전역 `ownedSkills` 배포, GSD 상대 참조 클로저 및 순수 픽스처 은퇴 연결 (커밋: `7e466b2`).

## 2. 세부 구현 내역

### 2.1 단일 권위 어댑터 레지스트리 (`src/core/compatibility-adapters.ts`)
- 5개 `compatibility-correction` 어댑터 등록 (`ecc:deep-research-routing`, `ecc:antigravity-doc-lookup`, `gsd:codex-stop-hook-helpers`, `mcp:pi-bridge`, `gsd:claude-ship-skill`).
  - 모든 correction은 명확한 `removalCondition`과 `applicability`, `verificationMethod`를 구비.
- 4개 영구 `policy-interface` 등록 (`mcp:firecrawl-policy-proxy`, `policy:claude-skill-overrides`, `policy:codex-execution-guidance`, `mcp:native-config-renderers`).
  - 모든 policy interface는 `removalCondition: null`로 불변 보안 경계 보장.
- `isSeparateGuidanceProvenForHarness`: `discovery`, `precedence`, `invocationReceipt` 3단계 실증이 모두 완료되고 유효한 `evidenceId`가 제공된 경우에만 `true`를 반환하는 엄격한 게이트.
- `deriveAdaptedTargetDigest`: `adapterId`, `revision`, `status`, `sourceSha256`, `targetSha256` 기반 결정론적 64-hex SHA-256 도출.
- `buildAdapterToolEvidence`: `schemas/tool-release-record.schema.json` 규격(콜론 없는 `proofId`/`subject`, regex `/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/`) 준수 증거 생성.

### 2.2 ECC 최소 구조적 어댑터 (`v2`)
- `src/core/ecc-fixture.ts`의 `renderEccSkill`에서 4개 마크다운 섹션 정규식 치환(`## MCP Requirements` 등)을 완전 제거.
- 프론트매터 직후 라우팅 계약 마커(`<!-- alpha-aos-adapter:ecc:deep-research-routing:v2:start -->`) 주입 및 차단 도구 식별자(`firecrawl_search`, `web_search_advanced_exa`, `crawling_exa`) 중립화만 수행하는 최소 구조적 변환 적용.
- `catalog/stack.lock.json`의 `components.ecc.targetSha256`을 `v2` 렌더링 결과 해시로 정확히 갱신.

### 2.3 `alpha-aos-research-routing` 전역 소유 스킬 배포
- `catalog/stack.yaml`의 `components.ownedSkills`에 `alpha-aos-research-routing` 등록 (`targets: [claude, codex, antigravity, pi, hermes]`, `invocation: automatic`).
- `catalog/stack.lock.json`에 `sourceSha256` 및 5개 하네스 `targetSha256` 기록.
- `src/core/owned-skills.ts`의 `planOwnedSkillSync`와 `applyOwnedSkillSync`를 통해 5개 하네스 전체에 일관되게 배포.
- `alpha-aos-ship` 계획 시 `evaluateClaudeShipSkillAdapter`를 통해 업스트림 GSD의 네이티브 ship 스킬 노출 시 자동 은퇴(`resolved-upstream`) 평가.

### 2.4 GSD Codex Stop 훅 동적 상대 참조 클로저 및 순수 픽스처 은퇴
- `stripJsComments`: 주석 내 require 문자열 오탐 방지.
- `extractLocalHookSpecifiers`: 정적 문자열 리터럴 상대 require/import만 추출하고, 동적 비리터럴(`require('./lib/' + x)`)이나 경계 탈출(`..`) 탐지 시 `ComponentPlanError("plan-incomplete", ...)`로 즉시 fail-closed 거부.
- `discoverCodexHookHelperClosure`: `gsd-context-monitor.js`에서 시작하는 `./lib/*` 상대 모듈 및 헬퍼 간 상호 참조를 BFS로 동적 순회하여 필요한 헬퍼 목록을 결정론적으로 추출.
- `inspectPureUpstreamCodexStopHook`: 보정 전 순수 업스트림 상태에서 모니터와 헬퍼, Stop 스모크 테스트를 평가하여 업스트림 패키지가 자체 헬퍼를 완비하고 성공하면 `resolved-upstream`(`retired`) 판정.
- `src/core/gsd-fixture.ts`: 격리 픽스처 설치 후 `inspectPureUpstreamCodexStopHook`을 선행 실행하여 순수 해결 시 불필요한 헬퍼 복사 생략.
- `applyCodexGsdHookCompatibility`: 업스트림 해결 시 호스트 `~/.codex/hooks/lib/`에 남아 있는 과거 alpha-AOS 복사본만 `applyFileTransaction`으로 안전하게 정리.

## 3. 검증 결과

- **컴파일 및 빌드:**
  `npm run build` (tsc -p tsconfig.json && node scripts/build-artifact.mjs write) -> 정상 통과 (0 errors).
- **테스트 결과:**
  `node scripts/run-tests.mjs --files dist/test/compatibility-adapters.test.js dist/test/ecc-skills.test.js dist/test/gsd-compat.test.js dist/test/owned-skills.test.js`
  - 총 33개 테스트 실행, **33개 통과 (0 fail)**.
  - `dist/test/compatibility-adapters.test.js`: 8/8 통과
  - `dist/test/ecc-skills.test.js`: 10/10 통과
  - `dist/test/gsd-compat.test.js`: 10/10 통과
  - `dist/test/owned-skills.test.js`: 5/5 통과

## 4. 커밋 이력

1. `b91efdc`: `feat(compat): implement compatibility adapter registry and tracer evaluation (41-01-01)`
2. `7e466b2`: `feat(compat): switch to v2 structural adapters and dynamic hook helper closure (41-01-02)`
