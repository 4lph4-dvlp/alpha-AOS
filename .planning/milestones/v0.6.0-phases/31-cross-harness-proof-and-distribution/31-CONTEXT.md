# Phase 31: Cross-Harness Proof and Distribution - Context

**Gathered:** 2026-11-03
**Status:** Ready for planning

<domain>
## Phase Boundary

`PROVE-01`–`PROVE-04`: 사용자가 다섯 지원 하네스(`Claude Code`, `Codex`, `Antigravity`, `Pi Agent`, `Hermes Agent`) 전반에서 공유 프로젝트 모드(`strict`/`flexible`) 전환, 독립 작업별 새 스타일 선택, 미초기화·부분 초기화 복구 및 6개 실행 경로가 의도대로 결합됨을 정직한 증거 계층(`verified-native` / `verified-fixture` / `unsupported` / `unverified` / `blocked`)으로 조회할 수 있게 하고, 무결성 잠금된 패킹 배포판(`npm pack`) 검증, 영문·국문 사용자 문서, 표적 양성·음성 행동 검증 및 최종 전체 회귀 원장을 완결한다.

Phase 27의 공유 `strict`/`flexible` 정책 권위, Phase 28의 6개 고정 한국어 라벨·직접 GSD 명령 우선순위·증거 기반 단순 작업 면제·작업 수명 경계, Phase 29의 네이티브 readiness 진단·비파괴 복구·원래 요청 1회 인계, Phase 30의 `scope.quickQuality` 기반 일반/full 계약·다이제스트·7단계 품질 증거 바인딩은 이미 확정된 선행 전제다. 새 실행 엔진이나 스타일 기본값은 추가하지 않으며, 유료 네이티브 카나리 자동 실행·글로벌 재설치·`git push`·3-OS CI 수리·패키지 배포(`npm publish`) 보류(holds)를 그대로 유지한다.

</domain>

<decisions>
## Implementation Decisions

### 다섯 하네스 시나리오 매트릭스와 증명 계층 (`PROVE-01`)

- **D-01:** 교차 하네스 시나리오 매트릭스는 전용 v0.6.0 시나리오 증명 문서(`docs/` 하위 마크다운) + JSON 인덱스 + 독립 실행형 read-only 검증 스크립트 조합으로 구성한다. Phase 29(`docs/task-bootstrap-proof.md`)·Phase 30(`docs/task-style-proof.md`, `docs/task-style-proof-index.json`) 패턴을 계승해 온디스크 해시·커밋·증거 티어를 재검증하며, 기존 `alpha-aos doctor --matrix`와 provenance 테스트가 소비하는 `docs/SUPPORT_MATRIX.md` 스키마는 오염시키지 않고 상호 참조 링크만 연결한다.
- **D-02:** 유료 모델 호출 보류 원칙을 준수하여, 다섯 하네스 공통 교차 전환(`Codex flexible 설정 → Antigravity 소비 → Pi strict 설정 → 기존 Codex 세션이 다음 intake에서 strict 재확인`), `릴리스 완료 후 독립 버그 픽스 새 선택`, `absent`/`partial` 초기화·복구 결합 시나리오 전체는 무과금 결정론적 실제 CLI·파일시스템 통합 스위트로 5개 하네스 모두 검증한다. `native` 티어는 이미 확보된 승인 실기 영수증(예: Phase 29/30 로컬 실기 영수증)과 가용 호스트의 무과금 발견/read-only 프로브만 인정하며, 유료 모델 턴이 실행되지 않은 경로는 `unverified` 또는 `blocked`로 정직하게 분리 표기한다.
- **D-03:** 매트릭스는 하네스별 단일 요약 등급으로 뭉뚱그리지 않고, `하네스 × 시나리오·역할 축`(공유 정책 읽기/변경, 독립 작업 재선택, 초기화/복구 인계, 대화형 3경로, 오토파일럿 3경로, 네이티브 질문 UI vs `1–6` 번호 텍스트 fallback)으로 세분화해 `verified-native`, `verified-fixture`, `unsupported`, `unverified`, `blocked` 상태와 구체적 사유 코드를 셀 단위로 기록한다(예: `Hermes`는 공유 정책 조회·변경 및 intake 조회는 지원하되 GSD controller/state-writer 실행은 `unsupported`, `Claude Code` 격리 카나리 인증 한계는 `G-07-2` 사유 명시).
- **D-04:** 시나리오 매트릭스의 사용자 조회 수단은 패키지 동봉 문서(`docs/`) + JSON 인덱스 + `text`/`--json` 출력을 지원하는 독립 read-only 검증 스크립트로 제공한다. 공개 `alpha-aos` CLI 서브커맨드를 불필요하게 비대화하지 않으면서 소스 체크아웃과 패킹 설치본 양쪽에서 즉시 조회·재검증할 수 있게 한다.

### 패킹 배포판 무결성과 발견·호출 검증 깊이 (`PROVE-02`)

- **D-05:** `package.json` `files` 및 `scripts/audit-tarball.mjs` 허용 목록(allowlist)에 v0.6.0 공유 정책·6개 경로 안내(`skills/alpha-aos-task/SKILL.md`), 추가된 `schemas/task-*.schema.json`, 검증 스크립트(`scripts/verify-*.mjs`) 및 정규화된 증명 문서·인덱스(`docs/`)를 명시적으로 등록한다. 반면 개인 호스트 절대 경로(`assertNoPrivatePaths`), `.planning/` 아티팩트, 임시 scratch 영수증, `catalog/candidate.lock.json` 유입은 패킹 감사에서 즉시 실패(fail-closed) 처리한다 — **Reversibility:** `costly` — 배포 tarball 허용 목록과 동봉 스키마·문서 경로는 패킹 검증 게이트(`audit-tarball.mjs`, `tarball-fixture.test.ts`) 전반이 공유하는 패키지 표면 계약이다.
- **D-06:** 패킹 아티팩트 설치 샌드박스에서 `catalog/stack.lock.json`에 핀 고정된 `alpha-aos-task` 원본 해시 및 다섯 하네스 타깃(`claude`, `codex`, `antigravity`, `pi`, `hermes`) 전체의 렌더링 바이트 해시 일치를 모두 검증한다. 안내 본문이나 타깃 렌더링 바이트가 변조된 경우 `install`/`doctor`가 fail-closed로 거부하는 음성(negative) 케이스까지 패킹 검증에 포함한다.
- **D-07:** 공유 정책과 6개 경로 안내의 발견성(discoverability)은 단순 `existsSync`나 문자열 포함 검사만으로 인정하지 않는다. 패킹 설치본 `alpha-aos` 바이너리의 `doctor`/어댑터 파싱(frontmatter, 메타데이터, 해시 상태 `CURRENT` 판정) 통과와 가용 로컬 하네스의 무과금 네이티브 발견 프로브를 결합해 증명하며, 미설치·미지원 하네스는 사유를 명시 보고한다.
- **D-08:** 패킹 설치본의 의미 있는 호출(meaningful invocation) 검증은 격리 샌드박스(`test/tarball-fixture.test.ts` 및 `test/helpers/packed-sandbox.ts` 패턴)에 설치된 실제 `alpha-aos` CLI 바이너리를 실행하여, (1) 설정 부재 시 무쓰기 `strict` 조회 및 `strict` ↔ `flexible` preview/apply/rollback, (2) 예측 가능한 intake 판정 및 6개 라벨 chooser 출력, (3) `absent`/`partial`/`ready` readiness 진단, (4) 대화형 3경로 투영 및 오토파일럿 3경로 구체적 계약 preview(`quickQuality: "full"` 다이제스트 바인딩 포함)까지 end-to-end로 무과금 호출하고, 개발자 실제 호스트 경로 무오염(`hostSnapshot`)을 함께 입증한다.

### 영문·국문 문서 구성과 지원 한계 안내 (`PROVE-03`)

- **D-09:** 사용자 문서는 `README.md` / `README.ko.md`의 핵심 개요·빠른 시작 요약 표와, 전용 영문·국문 상세 사용자 가이드 쌍(예: `docs/task-entry.md` 및 `docs/task-entry.ko.md`)으로 역할을 분리한다. 이를 통해 `README` 비대화를 막고 저수준 운영 감사 문서인 `docs/task-runtime-controls.md`와 일반 사용자용 작업 진입 가이드를 명확히 구분한다.
- **D-10:** 영문 문서(`README.md` 및 영문 상세 가이드)에서도 실제 UI/CLI에 출력되는 6개 한국어 고정 라벨 원문(`대화형-quick`, `대화형-quick-full`, `대화형-phase`, `오토파일럿-quick`, `오토파일럿-quick-full`, `오토파일럿-phase`)을 번역·변형하지 않고 그대로 표기하며, 번호(`1–6`)·내부 canonical ID(`conversational-quick` 등)·영문 설명 및 명시 요청 예시를 1:1 매핑 표로 병기한다.
- **D-11:** 영문·국문 상세 가이드는 추상적 규칙 나열에 그치지 않고 대칭적인 의사결정 흐름과 구체적 양성/반례 쌍을 수록한다: (1) 단순 작업 면제(국소 rename·README 번역/링크 추가·한정 push) vs 비면제(다중 서브시스템/공개 API rename·충돌 해결 push), (2) 작업 수명 경계(릴리스 완료 후 독립 버그 픽스는 새 선택 vs 동일 활성 작업의 테스트 수리는 스타일 유지), (3) `absent`/`partial` 비파괴 복구 후 원래 요청 1회 인계, (4) 직접 GSD 명령 호출 시 chooser 생략(인용 문장과 구분) 및 오토파일럿의 exact 계약 승인·별도 `start` 경계.
- **D-12:** 영문·국문 양쪽 문서 모두 다섯 하네스의 실제 지원 한계 표(`Hermes` worker-only, `Claude Code` G-07-2 미검증 실기 영수증, 하네스별 질문 UI vs `1–6` 번호 텍스트 fallback, 미실행 3-OS CI 및 보류 상태)를 숨김없이 수록한다. 또한 `package.json` 버전 범프나 npm 정식 배포가 승인되지 않은 현 상태를 지켜 정식 출시 완료로 허위 표기하지 않으며, 영·한 필수 섹션 대칭·상대 링크 유효성·6개 고정 라벨 보존·개인 호스트 경로 부재를 자동 테스트로 강제한다.

### 최종 회귀 게이트와 기존 회귀 부채·보류 항목 처리 (`PROVE-04`)

- **D-13:** Phase 31 전용 표적 행동 검증 스위트는 교차 하네스 전체 여정을 양성·음성(positive/negative) 쌍으로 결합 검증한다: (1) `Codex → Antigravity → Pi → 기존 Codex 세션` 모드 전환 성공 vs 손상된 정책/잘못된 루트 fail-closed 거부, (2) `오토파일럿-phase` 릴리스 완료 후 독립 버그 픽스의 새 chooser 강제 vs 활성 작업 연속성 유지, (3) `absent`/`partial` 복구 후 원래 요청·스타일 1회 인계 및 오토파일럿 exact 권한 보존 vs 중복 인계·승인 없는 시작 차단, (4) `오토파일럿-quick-full` 전 단계 증거 통과 vs 일반 quick 증거만 제출·다이제스트/안내 변조·미지원 하네스(`Hermes` 컨트롤러 등) 거부.
- **D-14:** 구현 웨이브 중에는 변경 슬라이스에 대한 표적 검사(`npm run check` 및 관련 테스트 파일 지정 실행)만 수행해 불필요한 전체 스위트 반복을 피하고, 최종 수용 게이트에서 동일 소스 `HEAD` 기준으로 `npm run check` → `npm run build` → 표적 Phase 31 양성/음성·문서·패킹 스위트 → `npm run audit-tarball` → 전체 `npm test`(`scripts/run-tests.mjs`) → `npm run build:check` → read-only 네이티브/시나리오 증명 검증기를 완주하여 실제 수치(`total`, `passed`, `failed`, `skipped`, `not-run`), 플랫폼, 커밋 SHA를 원장에 기록한다.
- **D-15:** 과거 `261101-ww3`에서 기록된 워커 시작 타임아웃 이력 및 4개 스위트(`task-progress-integration`, `task-progress`, `verify-efficient-wait`, `tarball-fixture`) 이력은 삭제하거나 임의 면제(waive)하지 않고 원장에 보존한다. 동시에 이번 Phase 31 최종 실행에서의 스위트별 실제 측정 결과(pass/fail/호스트 권한 제약 skip)를 대조 열로 투명하게 기록하며, 미실행 보류 항목(`3-OS/macOS CI`, `Claude G-07-2`, 글로벌 재적용/push/publish hold)이나 실패 항목은 절대 `passed`로 합산하지 않는다.
- **D-16:** 최종 회귀에서 v0.6.0 시나리오·패킹·무결성·호환성 관련 필수 검증이 하나라도 실패하면 해당 수용을 즉시 차단한다. 승인된 Phase 31 범위를 벗어나는 타 서브시스템 결함이 발견될 경우 무단으로 범위를 확장해 수리하지 않고 정확한 실패 증거를 기록한 뒤 명시적 범위 승인을 거친다. 로컬 테스트 통과만으로 완료를 선언하지 않고 승인된 별도 read-only 독립 코드 리뷰 게이트와 기존 릴리스 보류 경계를 유지한다.

### the agent's Discretion

- 신규 v0.6.0 교차 하네스 증명 문서·JSON 인덱스·검증 스크립트 및 영문/국문 사용자 가이드의 정확한 파일명(예: `docs/task-entry-proof.md`, `docs/task-entry-proof-index.json`, `scripts/verify-task-entry-proof.mjs`, `docs/task-entry.md`, `docs/task-entry.ko.md`)과 JSON 스키마 세부 필드 구성은 기존 Phase 29/30 검증기 및 `scripts/audit-tarball.mjs` 규칙에 맞춰 연구·계획 단계에서 확정한다.
- 패킹 샌드박스 테스트(`test/tarball-fixture.test.ts` 확장 vs 별도 패킹 검증 테스트 파일 분리) 및 표적 수용/문서 정합성 테스트 파일 분할 구조는 `scripts/run-tests.mjs` 실행 시간과 격리 안전성을 기준으로 설계한다.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 승인 범위와 선행 Phase 결정
- `.planning/PROJECT.md` — v0.6.0 목표, GSD 단일 lifecycle/state 소유권, 다섯 지원 하네스 범위 및 공급망·안전 제약.
- `.planning/REQUIREMENTS.md` — `PROVE-01`–`PROVE-04`, 6개 한국어 고정 라벨/설명 표, 범위 제외(Out of Scope) 및 보류 경계.
- `.planning/ROADMAP.md` — Phase 31 목표·5개 성공 기준·계획 초점·검증 강조점 및 `261101-ww3`/릴리스 보류 게이트.
- `.planning/phases/27-shared-project-behavior-policy/27-CONTEXT.md` — 공유 `strict`/`flexible` 정책 권위, 설정 부재 시 무쓰기 `strict`, 트랜잭션·롤백 및 세션 재읽기 규칙.
- `.planning/phases/28-predictable-strict-and-flexible-intake/28-CONTEXT.md` — 공통 intake 판정 순서, 6개 고정 한국어 라벨과 `1–6` 번호 fallback, 작업 수명과 단순 작업 면제 기준.
- `.planning/phases/29-gsd-initialization-and-request-continuity/29-CONTEXT.md` — `missing`/`absent`/`partial`/`ready` 구분, 비파괴 복구 및 원래 요청 1회 인계 계약.
- `.planning/phases/30-six-execution-styles-and-quality-binding/30-CONTEXT.md` — 6개 실행 경로 바인딩, `scope.quickQuality`, 7단계 full 품질 증거 및 exact 승인/별도 `start` 경계.
- `.planning/phases/30-six-execution-styles-and-quality-binding/30-VERIFICATION.md` — Phase 30 검증 완료 상태와 Pi 기반 6개 경로 실기 영수증 참조.

### 증명 원장·매트릭스·검증 스크립트
- `docs/SUPPORT_MATRIX.md` — 기존 `alpha-aos doctor --matrix` capability ledger 문서(스키마 보존 및 상호 링크 대상).
- `src/core/support-matrix.ts` — 기존 하네스 표면 ceiling/ledger 평가기.
- `docs/task-bootstrap-proof.md` — Phase 29 초기화·연속성 증명 티어 및 네이티브 영수증 스키마 기준.
- `docs/task-style-proof.md` — Phase 30 6개 실행 경로 3계층 증명 원장 및 회귀 부채 기록 형식.
- `docs/task-style-proof-index.json` — Phase 30 온디스크 영수증 해시·커밋 인덱스 구조.
- `scripts/verify-task-style-native.mjs` — 독립 read-only 네이티브 증거 검증기(64 KiB 한도, 정규 파일 강제, 픽스처 위장 차단, SHA-256 및 `git cat-file` 확인).

### 패킹 배포·스킬 무결성·테스트 러너
- `package.json` — 배포 `files` 목록, `audit-tarball`, `prepack`, `build`, `build:check`, `test` 스크립트 정의.
- `scripts/audit-tarball.mjs` — POSIX ustar 아카이브 경계 검사 및 배포 파일 allowlist 감사기.
- `src/core/release-package-proof.ts` — 패킹 수명주기 평가기 및 개인 호스트 경로 유출 방지(`assertNoPrivatePaths`).
- `test/tarball-fixture.test.ts` — `npm pack` 아카이브 감사, 격리 샌드박스 설치/진단/제거 및 호스트 무오염(`hostSnapshot`) 검증.
- `src/core/owned-skills.ts` — `alpha-aos-task` 등 자체 소유 스킬의 5개 하네스 타깃 렌더링·검증·동기화.
- `skills/alpha-aos-task/SKILL.md` — 다섯 하네스에 배포되는 공통 정책·intake·초기화·6개 경로 안내 원본.
- `catalog/stack.yaml` — 하네스 타깃 메타데이터 및 owned skill 배포 정책.
- `catalog/stack.lock.json` — GSD `1.18.0` 핀 및 owned skill 원본/타깃 SHA-256 무결성 잠금.
- `scripts/run-tests.mjs` — npm 라이프사이클 환경 오염을 제거하는 표준 테스트 실행기(`--files` 표적 실행 및 전체 스위트 실행).

### 현행 영문·국문 사용자 문서 및 핵심 도메인 서비스
- `README.md` — 영문 최상위 설치·개요·기능 안내 문서.
- `README.ko.md` — 국문 최상위 설치·개요·기능 안내 문서.
- `docs/task-runtime-controls.md` — 런타임 리소스·디스패치·복구 제어 문서(신규 사용자 가이드와 역할 분리 및 상호 참조 대상).
- `src/core/behavior-policy.ts` — 프로젝트 `strict`/`flexible` 정책 해석·변경·트랜잭션 서비스.
- `src/core/task-intake.ts` — 예측 가능한 작업 진입 판정 및 6개 스타일 카탈로그 서비스.
- `src/core/task-bootstrap.ts` — GSD readiness 게이트 및 원래 요청 1회 인계 서비스.
- `src/core/task-style.ts` — 6개 스타일 경로 투영 서비스.
- `src/core/task-contract.ts` — 작업 계약 다이제스트(`quickQuality` 포함), 승인 및 드리프트 검증 서비스.
- `src/core/task-run.ts` — 오토파일럿 격리 실행 및 7단계 full 품질 수용 게이트 서비스.

별도 외부 ADR이나 제3자 사양 문서는 없으며, 위 저장소 문서와 고정된 `@opengsd/gsd-core` `1.18.0` 런타임 계약을 기준으로 삼는다.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `scripts/verify-task-style-native.mjs` 및 `docs/task-style-proof-index.json`: 64 KiB 크기 제한, 심볼릭 링크 거부, `evidenceTier: "fixture"` 승격 차단, 온디스크 SHA-256 및 `git cat-file` 재검증 패턴이 이미 구현되어 있어 Phase 31 교차 하네스 시나리오 검증기/인덱스에 그대로 재사용·연결할 수 있다.
- `test/tarball-fixture.test.ts`, `test/helpers/packed-sandbox.ts`, `src/core/release-package-proof.ts`: 실제 `npm pack` 산출물을 격리 샌드박스에 설치하고 개발자 호스트 경로(`hostSnapshot`) 무오염과 개인 경로 부재(`assertNoPrivatePaths`)를 검증하는 인프라가 준비되어 있다.
- `src/core/owned-skills.ts` 및 `catalog/stack.lock.json`: `alpha-aos-task` 원본 해시와 다섯 타깃 렌더링 해시를 결정론적으로 검증하는 메커니즘이 이미 동작 중이다.
- `src/core/behavior-policy.ts`, `src/core/task-intake.ts`, `src/core/task-bootstrap.ts`, `src/core/task-style.ts`, `src/core/task-contract.ts`, `src/core/task-run.ts`: Phase 27–30에서 구현·검증된 공개 도메인 서비스와 CLI 명령이 완비되어 있어 새 런타임 로직 추가 없이 교차 하네스 결합 시나리오와 패킹 호출을 구성할 수 있다.

### Established Patterns
- 모든 증명 문서와 배포 포함 파일은 `assertNoPrivatePaths` 규칙을 통과해야 하며, 개인 사용자 홈 경로·로컬 절대 경로·시크릿 값을 커밋 문서나 인덱스에 남기지 않는다.
- `docs/SUPPORT_MATRIX.md`는 `alpha-aos doctor --matrix` 및 `test/provenance.test.ts`와 결합된 v0.1.0 capability ledger 산출물이므로 직접 덮어쓰지 않고 별도 v0.6.0 시나리오 증명 문서와 상호 링크로 연결한다.
- `.planning/codebase/*.md` 지도는 2026-09-02 기준 초기 스냅샷이므로 디렉터리 관례 참고에만 쓰고, 실제 파일 목록·스키마·테스트 총수는 현행 코드베이스와 `scripts/run-tests.mjs` 실행 결과를 기준으로 삼는다.

### Integration Points
- 패킹 아카이브 감사: `package.json` `files` ↔ `scripts/audit-tarball.mjs` allowlist ↔ 신규 `docs/` 증명·가이드 문서 및 `schemas/task-*.schema.json` 동기화.
- 스킬 무결성: `skills/alpha-aos-task/SKILL.md` 문구 보완이 발생할 경우 `src/core/owned-skills.ts` 다섯 타깃 렌더링과 `catalog/stack.lock.json` 해시를 동일 변경에서 갱신.
- 문서 연결: `README.md` ↔ `README.ko.md` 핵심 요약 표 추가 및 신규 영·한 상세 가이드(`docs/`)·시나리오 증명 원장(`docs/`)·`docs/task-runtime-controls.md` 간 상호 링크 연결.

</code_context>

<specifics>
## Specific Ideas

- **필수 교차 하네스 전이 체인 (`PROVE-01`):** `Codex`가 프로젝트를 `flexible`로 전환 → `Antigravity`가 동일 프로젝트 진입 시 재설정 없이 `flexible` 소비 → `Pi`가 다시 `strict`로 전환 → 이미 열려 있던 `Codex` 세션이 다음 작업 intake에서 캐시된 옛 값이 아닌 최신 `strict`를 재확인하는 흐름이 매트릭스와 결합 테스트 양쪽에 명시적으로 드러나야 한다.
- **작업 수명 및 초기화 결합 체인 (`PROVE-01` / `PROVE-04`):** `오토파일럿-phase`로 릴리스 작업을 마친 뒤 들어오는 독립 버그 픽스 요청이 이전 스타일을 상속하지 않고 새 6지선다 chooser를 거쳐 `오토파일럿-quick-full`을 선택할 수 있음을 증명하고, `absent`/`partial` 프로젝트 복구 시 원래 요청과 선택된 스타일이 한 번만 인계되며 오토파일럿 exact 승인·별도 `start` 권한 경계가 유지됨을 함께 입증한다.
- **영·한 스타일 매핑 표 (`PROVE-03`):** 영문 문서에서도 `1`~`6` 번호, 한국어 고정 라벨 원문(`대화형-quick` ~ `오토파일럿-phase`), 내부 canonical ID(`conversational-quick` ~ `autopilot-phase`), 영문 동작 요약, 명시적 자연어 호출 예시를 한눈에 대조할 수 있는 표로 제시한다.

</specifics>

<deferred>
## Deferred Ideas

- 유료 라이브 카나리 실행(`Claude Code` G-07-2 실기 유료 호출 영수증 수집 포함), 개발자 머신 글로벌 스킬 재적용(global reconcile), 원격 `git push`, GitHub Actions 3-OS/macOS CI 실행 및 수리, `package.json` 버전 범프 및 `npm publish` 정식 릴리스는 기존 보류(holds)에 따라 이번 Phase 범위 밖으로 유지한다.
- 프로젝트/글로벌 기본 실행 스타일 저장, 사용자 정의 스타일 카탈로그 추가, 신규 GUI/대시보드, 새로운 GSD 대체 상태 엔진은 채택하지 않는다.

논의는 승인된 Phase 31(`PROVE-01`–`PROVE-04`) 범위 안에 머물렀으며 folded/reviewed todo는 없다.

</deferred>

---

*Phase: 31-cross-harness-proof-and-distribution*
*Context gathered: 2026-11-03*

## User amendment at final checkpoint — 2026-11-03

The user explicitly replaced the local package-version 0.5.0 hold with target **0.6.0** and requested effective remediation of the repeated 0.5.0 macOS CI failures. P2/P3 and privacy/history boundaries were accepted. These decisions supersede only the corresponding deferred local version/CI-remediation scope above. See `31-PROHIBITION-RESOLUTION.md` and `.planning/debug/macos-release-panel-ci.md`. Paid canaries, global reconciliation and npm publication are not authorized by this amendment; native CI acceptance and independent final verification remain required. Earlier failed CI and completed local regression receipts are preserved at their original source states.
