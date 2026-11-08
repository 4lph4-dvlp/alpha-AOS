# Phase 41: Minimal Compatibility Adapters - Context

**Gathered:** 2026-11-08
**Status:** Ready for planning

<domain>
## Phase Boundary

일상적인 업스트림 도구(`ecc`, `gsd`, `mcp`, `bridge:pi`, `cua-driver`) 업데이트가 alpha-AOS 코드 수정을 불필요하게 요구하지 않도록, 업스트림 파일·본문 치환을 최소화하고 공식 설정·공개 인터페이스 및 검증된 별도 가이드를 우선 사용하도록 전환한다. 여전히 필요한 호환성 보정은 이유(`rationale`), 적용 조건(`applicability`), 검증 방법(`verificationMethod`), 제거 조건(`removalCondition`)이 명시된 어댑터 계약으로 격리하며, 업스트림에서 해결된 보정은 선택된 릴리스의 실제 동작 검증 증거와 은퇴 사유를 남기고 제거(`retired` / `resolved-upstream`)할 수 있게 한다. 이 단계는 `ADAPT-01` ~ `ADAPT-04`와 `.planning/ROADMAP.md`의 Phase 41 네 가지 성공 기준을 담당한다.

런타임 AI가 업스트림 파일이나 어댑터를 즉석에서 재작성하는 것은 배제한다. 별도 alpha-AOS 가이드가 업스트림 변환을 대체할 때는 하네스별 네이티브 발견·우선순위·의도된 도구 경로 호출이 실증되어야 하며, 미기록 버전의 전면 통합 검증·네이티브 복구 오케스트레이션(Phase 42)과 기존 고정 핀 설치 이관·전체 소비자/문서 전환(Phase 43)은 해당 후속 단계의 범위로 유지한다.

</domain>

<decisions>
## Implementation Decisions

### 어댑터 레지스트리 범위와 메타데이터 조회 방식

- **D-01:** 호환성 어댑터 레지스트리는 ① 업스트림 패키징·문서·인터페이스 한계를 보완하며 제거 조건(`removalCondition`)을 갖는 **한시적 호환성 보정 어댑터(`compatibility-correction`)**(`ecc:deep-research-routing`, `ecc:antigravity-doc-lookup`, `gsd:codex-stop-hook-helpers`, `mcp:pi-bridge`, `gsd:claude-ship-skill`)와, ② alpha-AOS 고유 보안·거버넌스 정책을 공식 설정 포맷으로 렌더링하는 **상시 정책 인터페이스(`policy-interface`)**(Firecrawl 4개 도구 허용 프록시, Claude `skillOverrides`, Codex `AGENTS.md` 마커, 하네스별 네이티브 MCP 설정 렌더러)를 명확히 구분해 등록한다.
- **D-02:** 사용자와 메인테이너는 별도 전용 명령 없이 기존 워크플로에서 어댑터 메타데이터를 조회한다. 기본 `alpha-aos inventory` 화면에서는 도구별 활성/은퇴 어댑터 요약만 간결히 표시하고, `alpha-aos inventory --detail`(또는 `--tool <id>`)과 `alpha-aos install`/`update` 프리뷰(및 `--json` 출력)에서 이유(`rationale`), 적용 대상·조건(`applicability`), 검증 방법(`verificationMethod`), 제거 조건(`removalCondition`), 어댑터 리비전(`revision`), 은퇴 사유 및 검증 증거 전체를 노출한다.
- **D-03:** 어댑터의 정적 메타데이터(ID, 리비전, 대상 도구·하네스·플랫폼, 이유, 적용·검증·제거 조건, 은퇴 기록)와 실제 사전조건 검사·변환·검증 실행 함수는 단일 권위 레지스트리 모듈(`src/core/compatibility-adapters.ts`)에 함께 묶어 선언하며, 레지스트리 밖의 설명 없는 암묵적 파일/문자열 변환을 금지하는 계약 테스트로 검증한다.
- **D-04:** Pi의 `pi-mcp-adapter` 브리지(`mcp:pi-bridge`)는 제거 조건이 명시된 호환성 보정 어댑터로 등록하되, 설치된 Pi 버전에서 내장 MCP 설정만으로 기존 브리지 정책(`lazy` lifecycle, `toolPrefix: "server"`, `outputGuard: true`, `hostConfigDiscovery: "off"`)과 실제 읽기 전용 호출이 검증되기 전까지는 `active` 상태를 유지하여 도구 가용성이 깨지지 않게 한다.

### ECC 스킬 본문 치환 축소와 별도 가이드 전환 기준

- **D-05:** 카나리아 런타임에만 배포되던 `skills/alpha-aos-research-routing/SKILL.md`를 지원 하네스 전역 `ownedSkills`(`catalog/stack.yaml`)로 정식 배포한다. 하네스별로 별도 가이드의 발견·우선순위 및 의도된 도구 경로(`web_search_exa` → `firecrawl_scrape`) 호출이 증명된 대상에서는 `deep-research` 본문 치환을 제거(또는 업스트림 본문 보존 + 최소 라우팅 헤더로 축소)하고, 미증명 하네스에서는 명시적 어댑터를 유지한다.
- **D-06:** Antigravity 전용 `documentation-lookup` 보정(`ecc:antigravity-doc-lookup`)은 명시적 호환성 어댑터로 격리하여 업스트림 본문 변형을 최소화하되, 별도 가이드 분리 시 Antigravity(GUI/IDE)에서의 발견·우선순위와 Context7 실제 호출(네이티브 웹 검색 대체 방지) 증거가 확보되기 전까지는 보정을 유지한다.
- **D-07:** 별도 alpha-AOS 가이드가 업스트림 본문 치환을 대체할 수 있다고 판정하려면 하네스별로 ① 네이티브 가이드 발견(`discovery`), ② 업스트림 원문과 공존 시 충돌·차단 도구(`firecrawl_search` 등) 대신 alpha-AOS 라우팅 규칙이 우선 적용됨(`precedence`), ③ 의도된 도구 경로의 실제 호출 관찰(`invocation receipt`)이라는 3단계 실증 기준이 모두 충족되어야 한다. 단순 파일 존재나 모델의 텍스트 언급만으로는 전환 완료로 인정하지 않는다.
- **D-08:** 별도 가이드 전환이 아직 증명되지 않아 유지되는 ECC 호환성 어댑터(`ecc:deep-research-routing`, `ecc:antigravity-doc-lookup`)는 기존처럼 본문 내 4개 섹션과 6개 마크다운 헤딩 문자열에 강하게 결합된 전체 정규식 치환을 지양하고, 필수 프론트매터·라우팅 경계 사전조건만 검증한 뒤 상단(또는 MCP 요구사항 경계)에 명시적 alpha-AOS 라우팅 계약 블록 주입 + 차단된 도구 식별자(`firecrawl_search` 등) 중립화만 수행하는 최소 범위 구조적 어댑터로 축소한다.

### GSD Codex 훅 보정의 동작 판별과 은퇴 절차

- **D-09:** `src/core/gsd-compat.ts`의 Codex Stop 훅 보정(`gsd:codex-stop-hook-helpers`)은 단일 고정 문자열(`require('./lib/hook-exit.js')`) 포함 여부 검사에서 벗어나, `gsd-context-monitor.js`의 로컬 `./lib/*` 모듈 참조 구조와 실제 `hooks/lib/*` 파일 존재 여부를 구조적으로 점검하고, alpha-AOS 보정 전 순수 업스트림 설치 상태 그대로 `smokeTestCodexGsdStopHook`을 실행해 정상 통과하면 '업스트림 해결(`resolved-upstream`)'로 판정한다.
- **D-10:** 복사할 GSD 훅 헬퍼 집합은 고정된 3개 파일명 배열에만 의존하지 않고, 모니터 엔트리포인트에서 시작하는 `hooks/lib/` 내부 상대 참조 체인을 검증된 업스트림 패키지 안에서 확인해 필요한 헬퍼만 복사 계획에 바인딩한다. `hooks/lib/` 경계를 벗어나거나 검증된 패키지에 존재하지 않는 참조가 있으면 임의 추측 없이 어댑터 사전조건 불일치(`precondition-failed`)로 거부한다.
- **D-11:** 사용자 호스트의 `~/.codex/hooks/lib/`에 이전 버전 설치 때 alpha-AOS가 복사해 둔 잔여 파일이 남아 있어 미해결 업스트림이 '해결됨'으로 오판되는 것을 막기 위해, 깨끗한 격리 픽스처(`runGsdFixture`)의 순수 업스트림 설치 결과에서 먼저 무보정 스모크 검증과 파일 존재 검사를 수행하여 업스트림 자체 해결 여부를 판정한다. 해결이 증명된 릴리스에서만 어댑터를 은퇴(`retired` / `resolved-upstream`) 처리하며, 호스트의 불필요해진 alpha-AOS 소유 잔여 헬퍼만 안전하게 정리한다.
- **D-12:** Codex Stop 훅 외에 Claude 대상 `alpha-aos-ship` 소유 스킬의 `gsd-core/workflows/ship.md` 경로 의존성 및 Claude 네이티브 커맨드 노출 여부(`gsd:claude-ship-skill`)도 어댑터/소유 스킬 사전조건과 제거 조건에 명시하여, 업스트림 GSD가 네이티브 노출을 해결하면 은퇴하고 워크플로 경로가 바뀌면 사전조건 불일치로 명확히 안내한다.

### 어댑터 사전조건 불일치 처리와 리비전·은퇴 기록

- **D-13:** 선택된 업스트림 아티팩트에서 호환성 어댑터의 적용 패턴이 더 이상 일치하지 않을 때는 먼저 해당 어댑터의 '제거 조건(업스트림 자체 해결 검증)'이 충족되었는지 검사한다. 검증을 통과하면 정상 은퇴(`retired` / `resolved-upstream`)로 기록·진행하고, 제거 조건을 통과하지 못했는데 사전조건이 깨진 경우에는 어댑터 ID·이유·실패한 사전조건을 명시하여 업데이트를 fail-closed로 거부(기존 정상 버전 유지)한다. 런타임 AI 재작성이나 검증되지 않은 깨진 원문 통과(`fail-open`)는 금지한다.
- **D-14:** 업스트림 릴리스마다 패키지 체크아웃에 새 기대 해시(`targetSha256`)를 배포하지 않으면서도 재현성과 변조 방지를 유지하기 위해, 검증된 업스트림 원본 해시(`sourceSha256`)와 결정론적 어댑터 리비전(`adapterId` + `revision` + 적용/은퇴 상태)으로부터 기대 출력 해시를 로컬 도출하여 프리뷰-적용 계획 다이제스트(`reviewedDigest`)에 바인딩하고, `userStateRoot()/tool-records`의 `ToolEvidence`에 적용·은퇴된 어댑터 리비전과 검증 결과를 함께 기록한다.
- **D-15:** 업스트림에서 해결되어 은퇴한 호환성 어댑터는 레지스트리(`src/core/compatibility-adapters.ts`)에서 단순 삭제하지 않고 `status: "retired"`(또는 선택된 릴리스 기준 `resolved-upstream`)와 은퇴 사유(`retirementReason`), 검증된 릴리스 버전(`verifiedRelease`), 검증 방법 및 증거 요약을 보존한다. 실제 파일 변환은 수행하지 않되(no-op), 로컬 `tool-records`와 `inventory --detail`에서 은퇴 사유와 실제 검증 증거를 계속 조회할 수 있게 한다.
- **D-16:** 추측성 버전 임계값(`version >= X.Y.Z`)만으로 필요한 보정을 생략하는 것을 금지하며, 반드시 선택된 릴리스 아티팩트에 대한 실제 구조·동작 검증 증거로만 은퇴를 판정한다. 이미 은퇴한 어댑터라도 후속 릴리스 업데이트 시 사후 검증 조건(postcondition)을 계속 확인하여 업스트림 회귀(regression) 발생 시 즉시 감지·거부한다.

### the agent's Discretion

사용자가 별도로 판단을 위임한 항목은 없다. `src/core/compatibility-adapters.ts`의 세부 인터페이스 타입명, 어댑터 리비전 식별자 문자열 규칙(예: `v1` 또는 정규화 해시), `ToolEvidence` 내 어댑터 증거 `proofId`/`method` 명명 규칙, CLI 테이블의 정확한 열 너비와 정렬은 위 16개 결정과 기존 런타임 안전 계약을 만족하는 범위에서 연구·계획 단계에서 정한다.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 범위와 소유자 정책
- `AGENTS.md` — Repository development policy 및 Delivery policy. 이번 명시적 GSD 논의가 저장소의 alpha-AOS 자체 거버넌스를 다시 활성화하지 않는다.
- `.planning/PROJECT.md` — v0.8.0 목표, 소유자 결정, 최소 호환성 어댑터 및 런타임 AI 재작성 배제 원칙.
- `.planning/REQUIREMENTS.md` — `ADAPT-01`, `ADAPT-02`, `ADAPT-03`, `ADAPT-04` 및 Interpretation and Boundaries.
- `.planning/ROADMAP.md` — Phase 41의 네 가지 성공 기준과 Phases 40, 42, 43과의 경계.
- `.planning/phases/39-tool-inventory-and-local-release-records/39-CONTEXT.md` — 로컬 도구 기록(`ToolRecordEvent`, `ToolEvidence`) 및 소유권·신뢰 정책 계약.
- `.planning/phases/40-local-official-release-updates/40-CONTEXT.md` — 로컬 공식 안정 릴리스 해석, 프리뷰-적용 바인딩, 인메모리 `StackLock` 합성 및 `tool-records` 기록 계약.

### 마일스톤 연구
- `.planning/research/SUMMARY.md` — 업스트림 변환 축소 및 명시적 호환성 어댑터 격리 방향.
- `.planning/research/ARCHITECTURE.md` — Compatibility adapter 책임, 검증된 원본 해시 + 어댑터 리비전 기반 로컬 출력 해시 도출 계약.
- `.planning/research/FEATURES.md` — Minimal adaptation, Differentiators(rationale/applicability/verification/removal conditions), Pi MCP 브리지 주의사항.
- `.planning/research/EVIDENCE.md` — `ecc-fixture.ts` 본문 치환, `gsd-compat.ts` 문자열 탐지, `owned-skills.ts`/`mcp.ts`/`skill-policy.ts` 경계 조사 결과.
- `.planning/research/PITFALLS.md` — *Hash/text success assumed semantic success*, *Exact-string hook detection*, *Separate guidance assumed effective* 함정 및 예방책.

### 기존 구현 및 연결 코드
- `src/core/ecc-fixture.ts` — 현재 `renderEccSkill`(`deep-research` 4개 섹션 치환, Antigravity `documentation-lookup` 치환) 및 `runEccFixture`.
- `src/core/ecc-skills.ts` — 전역 ECC 스킬 동기화 계획(`planEccSkillSync`, `planEccSkillOperation`) 및 `applyEccSkillSync`.
- `src/core/gsd-compat.ts` — 현재 `planCodexGsdHookCompatibility`(`require('./lib/hook-exit.js')` 문자열 검사), `CODEX_HOOK_HELPERS` 복사 및 `smokeTestCodexGsdStopHook`.
- `src/core/gsd-fixture.ts` — 격리된 GSD 설치 픽스처(`createGsdFixtureOperationPlan`, `runGsdFixture`).
- `skills/alpha-aos-research-routing/SKILL.md` — Phase 3에서 작성된 alpha-AOS 리서치 라우팅 계약 스킬(전역 `ownedSkills` 승격 대상).
- `catalog/stack.yaml` — 관리 도구 및 `ownedSkills` 선언(`alpha-aos-research-routing`, `alpha-aos-ship` 등).
- `src/core/owned-skills.ts` — `renderOwnedSkill`, `planOwnedSkillSync`, `applyOwnedSkillSync` 및 `workflow` 의존성 확인.
- `src/core/mcp.ts` — 하네스별 네이티브 MCP 설정 렌더링, Firecrawl 프록시 연결, Pi `pi-mcp-adapter` 브리지 설정, Hermes `auto_load`.
- `src/core/skill-policy.ts` — Claude `settings.json`의 `skillOverrides` 정책 렌더링.
- `src/core/codex-policy.ts` — Codex `AGENTS.md` 실행 정책 마커 블록 렌더링.
- `src/core/update.ts` — Phase 40 로컬 릴리스 해석·프리뷰·적용 및 인메모리 `StackLock` 합성(`renderEccSkill` 호출 지점 포함).
- `src/core/tool-records.ts` 및 `src/core/tool-inventory.ts` — 로컬 도구 기록 스키마 및 통합 인벤토리 조회·조정.
- `src/cli.ts` 및 `src/format.ts` — `inventory`, `install`, `update` CLI 파싱 및 텍스트/JSON 출력 포매터.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/core/gsd-compat.ts`의 `smokeTestCodexGsdStopHook`: 이미 Codex Stop 훅에 표준 JSON 이벤트를 전달하고 종료 코드 0 및 무출력을 검증하는 실행기를 갖추고 있으므로, 이를 격리 픽스처(`src/core/gsd-fixture.ts`)의 무보정 업스트림 상태 검증과 어댑터 은퇴 판정에 직접 재사용할 수 있다.
- `skills/alpha-aos-research-routing/SKILL.md` 및 `src/core/owned-skills.ts`: 리서치 라우팅 계약 스킬 파일과 5개 하네스 대상 `ownedSkills` 배포 파이프라인이 이미 존재하므로, `catalog/stack.yaml`과 `catalog/stack.lock.json`에 등록해 전역 배포 및 발견·우선순위 검증으로 연결할 수 있다.
- `src/core/tool-records.ts`의 `ToolEvidence`: `proofId`, `subject`, `target`, `method`, `result`, `platform`, `architecture`, `harness`, `fingerprint` 필드를 지원하므로, 어댑터 리비전·적용/은퇴 상태·검증 결과를 스키마 호환성 안에서 기록할 수 있다.
- `src/core/component-session.ts`: `reviewedDigest`와 `assertPlanUnchanged`를 통해 어댑터 리비전과 사전조건 평가 결과를 프리뷰-적용 계획 다이제스트에 바인딩할 수 있다.

### Established Patterns
- 모든 파일 변경은 읽기 전용 프리뷰에서 경로 증명(`proveOperationPaths`)과 기대 해시를 바인딩하고, `--apply` 시 사전 상태를 재검증한 뒤 `applyFileTransaction`으로 기록한다.
- 핵심 모듈은 구조화된 도메인 객체를 반환하고 `src/cli.ts`와 `src/format.ts`가 사람용 텍스트와 `--json` 출력을 일관되게 렌더링한다.
- 사전조건 불일치나 검증 실패는 조용히 우회(`fail-open`)하지 않고 구체적인 코드와 이유를 담아 `fail-closed`로 거부한다.

### Integration Points
- `src/core/compatibility-adapters.ts` (신규 권위 레지스트리): 모든 호환성 보정 어댑터와 상시 정책 인터페이스의 메타데이터·사전조건·변환·검증·은퇴 판정을 집약한다.
- `src/core/ecc-fixture.ts`, `src/core/ecc-skills.ts`, `src/core/update.ts`: `renderEccSkill` 및 인메모리 해시 도출 경로가 `compatibility-adapters.ts`의 어댑터 실행 결과와 어댑터 리비전을 사용하도록 연결한다.
- `src/core/gsd-compat.ts`, `src/core/gsd-fixture.ts`, `src/core/install.ts`: GSD Codex 훅 보정이 고정 문자열 대신 구조적 참조 체인과 격리 픽스처 무보정 스모크 검증을 통해 적용/은퇴를 판별하도록 연결한다.
- `src/core/tool-inventory.ts`, `src/cli.ts`, `src/format.ts`: `inventory`(기본 요약 및 `--detail`/`--tool` 상세)와 `install`/`update` 프리뷰에서 어댑터 메타데이터와 은퇴 증거를 표시하도록 연결한다.

</code_context>

<specifics>
## Specific Ideas

- 호환성 보정 어댑터(`compatibility-correction`)와 상시 정책 인터페이스(`policy-interface`)를 구분해, 보안/거버넌스 정책(Firecrawl 4개 도구 허용 프록시 등)이 한시적 임시방편으로 오해되지 않으면서도 모든 변환·보정의 이유와 경계를 한눈에 조회할 수 있게 한다.
- `deep-research`의 4개 본문 섹션 정규식 통째 치환을 줄이고 `alpha-aos-research-routing`을 전역 `ownedSkills`로 배포하되, 하네스별로 발견·우선순위·실제 도구 호출(`web_search_exa` → `firecrawl_scrape`) 3단계 증거가 확인된 대상만 치환 제거 완료로 인정한다.
- GSD Codex Stop 훅 보정은 사용자 호스트의 `~/.codex/hooks/lib/`에 남은 이전 파일 때문에 업스트림 미해결 상태가 가려지지 않도록 반드시 격리 픽스처(`runGsdFixture`)의 순수 업스트림 설치본에서 무보정 스모크 검증을 먼저 수행한다.
- 업스트림 파일 변경 시 '제거 조건(업스트림 해결 검증) 통과 → 정상 은퇴(`retired` / `resolved-upstream`)'와 '제거 조건 미통과 + 사전조건 실패 → 명시적 호환성 거부(`fail-closed`)'를 엄격히 구분하고, 추측성 버전 비교(`>= X.Y.Z`)나 런타임 AI 재작성을 배제한다.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. 미기록 버전의 실제 프로토콜·스키마·읽기 전용 호출 통합 검증 및 네이티브 설치기 사후 복구(Phase 42), 기존 stable-lock/Cua-pin 설치의 전면 이관 및 하위 소비자·이중 언어 문서 전환(Phase 43)은 승인된 로드맵 단계에 그대로 유지한다.

</deferred>

---

*Phase: 41-minimal-compatibility-adapters*
*Context gathered: 2026-11-08*
