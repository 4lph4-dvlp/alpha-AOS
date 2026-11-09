# Phase 40: Local Official Release Updates - Context

**Gathered:** 2026-11-07
**Status:** Ready for planning

<domain>
## Phase Boundary

원격 lock 승격(`candidate.lock.json` → `stack.lock.json`)이나 저장소 쓰기 권한 없이, 로컬 워크스테이션에서 Cua(`cua-driver`)와 npm 관리 도구(`gsd`, `ecc`, `mcp:context7`, `mcp:exa`, `mcp:firecrawl`, `bridge:pi`)의 공식 최신 안정(stable) 릴리스를 탐색·검토(Preview)하고, 검토된 정확한 릴리스 식별 정보에 바인딩하여 적용(Apply)하는 공통 라이프사이클을 구현한다. 이 단계는 `LOC-02`, `LOC-03`과 `.planning/ROADMAP.md`의 Phase 40 네 가지 성공 기준을 담당한다.

탐색 시 각 출처의 공식 안정 채널 규칙(Cua 드라이버 릴리스 패밀리 태그·GitHub prerelease 라벨 허용·nightly 제외·OS/아키텍처 지원 및 제한된 페이지 탐색, npm `latest` 시맨틱 프리릴리스 제외)을 적용한다. 프리뷰는 읽기 전용(SAFE-01)으로 정확한 기존/신규 버전과 아티팩트, 영향받는 대상, 네이티브 부수 효과, 복구 범위를 보여주며, 적용(`--apply`)은 움직이는 `latest` 태그를 다시 조회하거나 조용히 구버전으로 폴백하지 않고 검토된 릴리스 식별 정보와 로컬 사전 상태를 재검증한다.

호환성 변환 축소 및 명시적 어댑터 메타데이터(Phase 41), 미기록 버전의 실제 프로토콜·호출 검증 및 사후 복구 실행(Phase 42), 기존 고정 핀 설치 이관과 전체 하위 소비자·이중 언어 문서 전환(Phase 43)은 해당 후속 단계의 범위로 유지한다.

</domain>

<decisions>
## Implementation Decisions

### 설치·업데이트 명령과 대상 선택 방식

- **D-01:** `alpha-aos install`과 `alpha-aos update`는 동일한 로컬 릴리스 해석·프리뷰·적용 라이프사이클 엔진을 공유하되 기본 의도를 구분한다. `install`은 미설치(또는 아직 로컬 인정 기록이 없는) 관리 도구를 공식 최신 안정 릴리스로 설치하고 이미 정상 설치·인정된 도구는 기존 버전을 유지하며, `update`는 설치된 도구까지 공식 최신 안정 릴리스와 비교해 새 버전으로 업그레이드한다.
- **D-02:** `install`과 `update` 모두 `--tool`(Phase 39 `inventory`와 동일한 7개 관리 도구 ID: `cua-driver`, `gsd`, `ecc`, `mcp:context7`, `mcp:exa`, `mcp:firecrawl`, `bridge:pi`)과 `--target`(하네스) 필터를 지원한다. Cua 바이너리나 전역 npm 패키지처럼 여러 하네스가 공유하는 설치가 변경될 때는 직접 지정한 대상뿐 아니라 영향받는 다른 하네스도 프리뷰에 함께 명시한다.
- **D-03:** 기본 `alpha-aos update`는 현재 설치된 관리 도구만 업그레이드 대상으로 삼고 미설치(`absent`) 도구는 건너뛰며(`미설치 · 변경 없음` 표시), 사용자가 `--tool`로 미설치 도구를 직접 지정한 경우에는 암묵적 설치 대신 `install` 명령을 사용하도록 명시적 안내와 함께 거부한다.
- **D-04:** `install`과 일관되게 기본 `alpha-aos update`(및 호환 별칭 `--check`)는 읽기 전용 프리뷰로, `alpha-aos update --apply`는 검토된 계획 적용으로 동작하게 통일한다. 패키지 체크아웃 내부의 `catalog/candidate.lock.json`을 수정하던 `update --stage`는 일반 도구 업데이트 경로에서 제거하고 폐기 안내와 함께 거부한다.

### 프리뷰(Preview)와 적용(Apply)의 바인딩 계약

- **D-05:** 프리뷰(SAFE-01)는 체크아웃이나 사용자 상태 루트에 어떠한 파일도 쓰지 않는다. 대신 프리뷰 출력에 검토된 릴리스 식별 정보와 계획 다이제스트가 묶인 실행 명령을 제시하고, CLI에서 `--apply` 실행 시 이 검토 바인딩을 필수로 요구하여(생략 시 프리뷰 먼저 실행 안내) 검토 없이 임의 버전이 적용되는 것을 차단한다.
- **D-06:** 프리뷰가 출력하는 복사·실행용 `--apply` 명령에는 계획 다이제스트(`--plan-digest`)와 함께 도구별 검토된 정확한 버전·아티팩트 식별 정보(컴팩트 바인딩 토큰 또는 `--reviewed-plan` 입력 지원)가 포함된다. `--apply`는 움직이는 `latest` 태그나 채널을 다시 조회하지 않고, 바인딩된 특정 릴리스 버전의 공식 메타데이터·무결성·로컬 사전 상태만 재검증한다.
- **D-07:** 사람이 읽는 기본 프리뷰 화면은 변경 대상 도구를 먼저 배치하고, 각 도구별로 ① 기존/인정 버전 → 신규 버전 및 공식 출처·아티팩트 식별 요약, ② 영향받는 하네스(공유 설치 파급 포함), ③ 네이티브 설치기 부수 효과, ④ 복구 범위(트랜잭션 자동 롤백 가능 항목 vs 어댑터 복구·외부 잔여 효과)를 순서대로 표시한다. 이미 최신이거나 변경 없는 도구는 하단에 간결히 요약하며, 전체 세부 필드는 `--json` 출력에도 동일하게 포함한다.
- **D-08:** 선택된 모든 도구가 이미 최신 버전이면 프리뷰는 변경 없음으로 안내하고 적용 시에도 멱등(no-op)으로 처리한다. 프리뷰 이후 `--apply` 실행 시 로컬 설치 상태·대상 설정 파일·경로 경계·아티팩트 무결성 중 하나라도 달라지면 부분 적용 없이 변경 전에 즉시 거부(`plan-drift`)하고, 구체적인 불일치 항목과 새 프리뷰 실행 명령을 안내한다.

### 릴리스 탐색 예외 및 플랫폼 지원 정책

- **D-09:** npm 패키지 탐색은 공식 레지스트리의 `latest` dist-tag를 조회하되, `latest`가 가리키는 버전이 시맨틱 프리릴리스(`-alpha`, `-beta`, `-rc`, `-nightly` 등 하이픈 프리릴리스 식별자 포함)이면 임의로 이전 정식 버전을 탐색해 폴백하지 않고 명시적 거부(`latest-is-prerelease`)로 처리하여 기존 설치 상태를 유지한다.
- **D-10:** Cua 공식 릴리스 탐색은 제한된 페이지 한도(bounded pagination) 내에서 GitHub 릴리스 목록을 조회해 `cua-driver-rs-v<X.Y.Z>` 정식 드라이버 태그(`draft: false`, nightly 및 시맨틱 프리릴리스 제외, 저장소 특성상 붙는 GitHub `prerelease` 불리언 라벨은 허용) 중 가장 높은 정식 버전을 선택한다. 최신 정식 릴리스에 현재 OS/아키텍처용 에셋이 없거나 페이지 탐색 한도 내에 유효한 정식 릴리스를 확정할 수 없으면 이전 버전으로 암묵적 폴백하지 않고 구체적 사유(`unsupported-platform` 또는 `incomplete-discovery`)로 거부한다.
- **D-11:** 여러 관리 도구를 함께 조회·업데이트할 때 대상 범위의 모든 도구 탐색 결과를 끝까지 수집해 함께 보여주되, 하나라도 탐색 실패·메타데이터/출처 검증 실패·플랫폼 미지원이 발생하면 전체 계획의 `--apply`를 거부(기존 상태 유지)하고 사용자가 `--tool` 필터로 정상 도구만 지정해 진행할 수 있음을 안내한다.
- **D-12:** 정식 `cua-driver-rs-v<X.Y.Z>` 릴리스에 현재 Linux 아키텍처(`x64`/`arm64`)의 공식 검증 가능한 바이너리 아카이브가 존재하면 유효한 플랫폼 에셋으로 선택하되, 프리뷰와 기록에 업스트림의 Linux 플랫폼 주의사항 및 네이티브 부수 효과(Wayland helper 등)를 명시하고 실제 호스트 GUI 연동 검증은 `미검증`(`unverified`)으로 구분한다.

### Cua 공식 설치 어댑터와 아티팩트 검증 경계

- **D-13:** 체크아웃의 `catalog/computer-use-runtime.json` 고정 버전 핀에만 의존하지 않고 최신 Cua 정식 릴리스를 선택·설치할 수 있도록, 저장소에 검토된 Cua 공식 출처 신뢰 정책(공식 서명된 체크섬 목록·Sigstore 증빙·허용된 발행 워크플로 식별자)으로 선택한 릴리스 아카이브의 무결성을 먼저 검증한 뒤 검증된 아카이브에서 설치 엔트리포인트 및 구성 파일 해시를 로컬 도출해 설치 검증과 로컬 기록에 사용한다. 서명·체크섬 증빙이 누락되거나 일치하지 않으면 변경 전에 거부한다.
- **D-14:** 최신 Cua 릴리스 설치 시에는 해시가 검증된 공식 설치 어댑터(검토된 벤더 설치 스크립트 또는 해당 릴리스 태그에 서명·검증된 공식 설치기)에 검토된 정확한 버전(`-Release` / `CUA_DRIVER_RS_VERSION`)과 검증된 아티팩트를 고정 전달해 실행한다. 검증되지 않은 외부 `main` 브랜치 스크립트를 런타임에 내려받아 실행하는 것은 금지한다.
- **D-15:** Cua 업데이트 실행 시 기존처럼 `CUA_DRIVER_RS_KEEP_VERSIONS: "0"`으로 이전 버전을 즉시 삭제하지 않고 최소 직전 정상 버전을 보존하도록 설치 환경/경로를 구성하며, OS별 네이티브 설치 부수 효과(Windows 정션 및 바이너리 경로, macOS `/Applications/CuaDriver.app`, Linux `~/.local/bin` 및 Wayland helper)와 복구 범위를 프리뷰 및 실행 계획에 명시한다.
- **D-16:** `--apply` 실행은 패키지 체크아웃 내부의 `catalog/*.json`(`stack.lock.json`, `candidate.lock.json`, `computer-use-runtime.json`)을 수정하지 않고, `userStateRoot()/tool-records`에 작업(`started` → 도구별 `tool-result` → `finished`)과 정확한 `requested`·`resolved`·`installed` 식별 정보 및 실제 수행된 발견·무결성 증거를 기록한다. 수행하지 않은 실제 호스트 호출(invocation) 검증은 `unverified`로 남겨 이전 인정(`accepted`) 체인을 허위 완료로 덮어쓰지 않는다.

### the agent's Discretion

사용자가 별도로 판단을 위임한 항목은 없다. 컴팩트 바인딩 토큰/인자의 구체적 직렬화 형식, GitHub 릴리스 페이지 탐색 상한 수치, Cua 아카이브/체크섬 검증 모듈 분리 구조, 세부 오류 코드 이름은 위 결정과 기존 런타임 안전 계약을 만족하는 범위에서 연구·계획 단계에서 정한다.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 범위와 소유자 정책
- `AGENTS.md` — Repository development policy 및 Delivery policy. 이번 명시적 GSD 논의가 저장소의 alpha-AOS 자체 거버넌스를 다시 활성화하지 않는다.
- `.planning/PROJECT.md` — v0.8.0 목표, 소유자 결정, 공식 안정 릴리스 로컬 해석 및 관리 범위.
- `.planning/REQUIREMENTS.md` — `LOC-02`, `LOC-03` 및 Interpretation and Boundaries.
- `.planning/ROADMAP.md` — Phase 40의 네 가지 성공 기준과 Phases 41–43의 경계.
- `.planning/phases/39-tool-inventory-and-local-release-records/39-CONTEXT.md` — Phase 39에서 확정한 로컬 기록 계약(`requested`/`resolved`/`installed`/`verified`), 소유권 표시, 2026-11-06 공식 출처 신뢰 정책 결정.

### 마일스톤 연구
- `.planning/research/SUMMARY.md` — npm/Cua 로컬 릴리스 해석 요약 및 단계별 경계.
- `.planning/research/ARCHITECTURE.md` — Release resolver, Planner, Official installer adapter, Data Flow and Compatibility Contract.
- `.planning/research/FEATURES.md` — Local discovery, Exact preview, Anti-Features.
- `.planning/research/EVIDENCE.md` — 현재 `update.ts`/`install.ts`/`computer-use-install.ts` 동작 증거와 공식 출처 레지스터.
- `.planning/research/PITFALLS.md` — Cua GitHub prerelease 라벨 함정, 플로팅 `@latest` 금지, 구버전 암묵적 폴백 금지, 이전 아티팩트 보존 원칙.

### 기존 구현 및 연결 코드
- `src/core/update.ts` — 현재 npm `latest` 조회(`resolveCandidate`)와 레거시 `candidate.lock.json` 스테이징(`planCandidateStage`, `writeCandidate`).
- `src/core/install.ts` — 현재 `createManagedInstallPlan`, `applyManagedInstall` 및 GSD/ECC/MCP/Pi 브리지/Cua 순차 설치 오케스트레이션.
- `src/core/computer-use-install.ts` — 현재 `officialCuaPaths`, `verifyOfficialCua`, `planCuaInstall`, `installCua` 및 `CUA_DRIVER_RS_KEEP_VERSIONS` 설정.
- `catalog/computer-use-runtime.json` — 기존 Cua 0.38.0 정적 핀, 발행자/워크플로 식별자(`publisherIdentity`), 벤더 설치 헬퍼 해시(`scripts/vendor/cua-driver-0.38.0`).
- `src/core/tool-records.ts` — Phase 39 로컬 도구 기록 스키마 검증, 출처 URL 검증(`safeToolRecordSource`), 인정 체인(`accepted`) 판별.
- `src/core/tool-record-store.ts` — Phase 39 로컬 도구 기록 트랜잭션 작성자(`planToolRecordOperation`, `beginToolOperation`, `appendToolResult`, `finishToolOperation`, `runToolRecordOperation`).
- `src/core/tool-inventory.ts` — Phase 39 통합 관리 도구 관찰 및 로컬 기록 조정(`collectToolInventory`, `reconcileToolState`).
- `src/core/component-session.ts` — `reviewedDigest`, `assertPlanUnchanged`, `withComponentSession` 등 검토된 계획 바인딩 패턴.
- `src/cli.ts` — `install`, `update`, `inventory` 명령 파싱 및 출력 경계.
- `src/format.ts` — CLI 텍스트 출력 포매터.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/core/tool-record-store.ts` 및 `src/core/tool-records.ts`: Phase 39에서 구현된 `userStateRoot()/tool-records/v1/operations` 기반 작업 기록 스토어와 `safeToolRecordSource` 검증을 그대로 재사용하여, 체크아웃 수정 없이 로컬 업데이트 요청·해석·설치 결과와 증거를 기록할 수 있다.
- `src/core/component-session.ts`: `reviewedDigest`, `assertPlanUnchanged`, `assertUnchangedSincePlan`, `withComponentSession`이 이미 검토된 계획 다이제스트 바인딩과 경로 증명을 수행하므로, 통합 릴리스 업데이트 계획의 프리뷰-적용 바인딩에 확장 활용할 수 있다.
- `src/core/process.ts` 및 `src/core/path-boundary.ts`: 모든 외부 설치 명령 실행과 파일 경로 검증을 기존 허용 목록·타임아웃·바이트 상한·경로 경계 증명 아래에 유지할 수 있다.
- `src/core/tool-inventory.ts` 및 `src/core/tool-observers.ts`: 현재 설치된 도구 상태와 하네스 바인딩을 수집하는 Phase 39 관찰 계층을 프리뷰의 기존 상태(`old version` 및 공유 하네스 파급) 입력으로 재사용할 수 있다.

### Established Patterns
- 읽기 전용 프리뷰(SAFE-01)는 파일 시스템에 아무것도 기록하지 않고, 필요한 바인딩 정보와 다이제스트가 포함된 실행 가능한 명령줄을 반환한다(Phase 2 `project approve`, Phase 14 `task start` 패턴과 일관).
- 핵심 모듈은 도메인 결과 객체를 반환하고 `src/cli.ts`와 `src/format.ts`가 레드액션 경계(`print`)를 통해 사람용 텍스트와 `--json` 출력을 렌더링한다.
- 모든 상태 변경은 단일 작성자 세션(`MutationSession`)과 경로 경계 재검증을 거치며, 사전 조건이나 검토된 입력이 달라지면 즉시 fail-closed로 거부한다.

### Integration Points
- `src/core/update.ts`: 레거시 `candidate.lock.json` 중심 해석기를 공식 npm 안정 채널 해석기(시맨틱 프리릴리스 거부, 레지스트리 무결성/출처 검증)와 Cua GitHub 릴리스 패밀리 해석기(`cua-driver-rs-v<X.Y.Z>`, 제한된 페이지네이션, OS/아키텍처 에셋 및 서명된 체크섬 검증)를 아우르는 로컬 릴리스 리졸버로 확장·전환한다.
- `src/core/computer-use-install.ts`: 정적 `catalog/computer-use-runtime.json` 단일 버전에만 묶인 검증을 검토된 Cua 신뢰 정책 기반의 선택 릴리스 검증 및 이전 버전 보존(`CUA_DRIVER_RS_KEEP_VERSIONS`) 구조로 연결한다.
- `src/core/install.ts` 및 `src/cli.ts`: `install`과 `update`가 `--tool`, `--target`, 검토 바인딩 인자를 통해 공통 프리뷰·적용 파이프라인과 `tool-record-store` 기록을 사용하도록 연결한다.

</code_context>

<specifics>
## Specific Ideas

- `alpha-aos install`은 미설치·미인정 도구를 최신 공식 릴리스로 채우고, `alpha-aos update`는 이미 설치된 도구를 최신 공식 릴리스로 올린다.
- `alpha-aos update --tool <미설치도구>` 호출 시에는 암묵적으로 신규 설치하지 않고 `alpha-aos install --tool <도구>`를 안내하며 거부한다.
- `alpha-aos update --stage`는 체크아웃 내 `catalog/candidate.lock.json`을 수정하던 과거 승격 워크플로이므로 폐기 안내와 함께 거부한다.
- 프리뷰 화면에는 변경 대상 도구를 상단에 배치하고 각 도구의 ① 구버전→신버전·출처·아티팩트 요약, ② 영향받는 하네스(공유 설치 포함), ③ 네이티브 설치 부수 효과, ④ 복구 범위와 함께, 바로 복사해 실행할 수 있는 바인딩된 `--apply` 명령줄을 표시한다.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. 호환성 어댑터 단순화(Phase 41), 미기록 버전의 실제 프로토콜·호출 검증 및 사후 복구(Phase 42), 기존 설치의 전면 이관 및 하위 소비자/문서 전환(Phase 43)은 승인된 로드맵 단계에 그대로 유지한다.

</deferred>

---

*Phase: 40-local-official-release-updates*
*Context gathered: 2026-11-07*
