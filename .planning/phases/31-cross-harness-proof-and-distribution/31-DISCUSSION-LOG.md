# Phase 31: Cross-Harness Proof and Distribution - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-03
**Phase:** 31-Cross-Harness Proof and Distribution
**Areas discussed:** 다섯 하네스 시나리오 매트릭스와 증명 계층 (PROVE-01), 패킹 배포판 무결성과 발견·호출 검증 깊이 (PROVE-02), 영문·국문 문서 구성과 지원 한계 안내 (PROVE-03), 최종 회귀 게이트와 기존 회귀 부채·보류 항목 처리 (PROVE-04)

---

## 다섯 하네스 시나리오 매트릭스와 증명 계층 (PROVE-01)

### Q1. 다섯 하네스 교차 시나리오 매트릭스 산출물 구조

| Option | Description | Selected |
|--------|-------------|----------|
| 전용 v0.6.0 시나리오 증명 문서 + JSON 인덱스 + read-only 검증기로 구성 (Recommended) | Phase 29/30 영수증 인덱스와 동일한 패턴으로 디스크 해시·티어를 재검증하고, 기존 `SUPPORT_MATRIX.md`(`doctor --matrix`)는 깨뜨리지 않고 상호 링크만 연결 | ✓ |
| `doctor --matrix` 및 `support-matrix.ts`에 직접 통합 | 기존 하네스 기능 매트릭스 테이블에 v0.6.0 정책 전환·6개 경로 시나리오 행을 추가 출력(기존 provenance/support-matrix 테스트 스키마 변경 수반) | |
| 마크다운 매트릭스 문서 + 테스트 스위트 참조만 유지 | 별도 JSON 인덱스나 read-only 검증 스크립트 없이 문서 표에서 테스트 파일과 기존 영수증 경로만 직접 인용 | |

**User's choice:** 전용 v0.6.0 시나리오 증명 문서 + JSON 인덱스 + read-only 검증기로 구성
**Notes:** 기존 `SUPPORT_MATRIX.md` 호환성을 보존하면서 Phase 29/30 증명 체계와 일관성 유지.

### Q2. 무과금 검증과 `native` 영수증 인정 경계

| Option | Description | Selected |
|--------|-------------|----------|
| 전 하네스 결정론적 CLI/샌드박스 통합 증명 + 승인된 로컬 무과금·기존 Phase 29/30 네이티브 영수증 결합 (Recommended) | 교차 전환·재선택·복구 전체 흐름은 무과금 실제 CLI/파일시스템 테스트로 다섯 하네스를 모두 검증하고, `native` 티어는 기존 확보된 실기 영수증과 무과금 호스트 발견/read-only 프로브만 인정(유료 턴 미실행 경로는 `unverified`/`blocked`로 명시) | ✓ |
| 로컬에 설치된 모든 하네스에서 신규 라이브 모델 세션 실행 | 다섯 하네스 각각에서 실제 모델 턴을 소비해 교차 시나리오 신규 `native` 영수증을 수집(유료 호출 및 인증 필요) | |
| 전 하네스를 순수 `fixture` 티어로만 단일 표기 | 기존 Phase 29/30 로컬 실기 영수증이나 호스트 read-only 프로브를 연결하지 않고 전체 매트릭스를 `fixture` 증명으로만 기록 | |

**User's choice:** 전 하네스 결정론적 CLI/샌드박스 통합 증명 + 승인된 로컬 무과금·기존 Phase 29/30 네이티브 영수증 결합
**Notes:** 로드맵의 유료 카나리 미승인 경계를 준수하면서 확보된 실기 영수증을 정직하게 반영.

### Q3. 하네스별 지원 범위와 미지원·미검증 세분화 수준

| Option | Description | Selected |
|--------|-------------|----------|
| 하네스 × 시나리오·역할 축으로 세분화하고 정확한 사유 코드 기록 (Recommended) | 정책 전환·독립 작업 재선택·초기화 인계·6개 실행 경로·질문 UI(네이티브 vs `1–6` fallback)별로 `verified-native` / `verified-fixture` / `unsupported` / `unverified` / `blocked`를 분리해 `Hermes`의 worker-only 경계나 `Claude` G-07-2 사유가 셀 단위로 드러나게 구성 | ✓ |
| 하네스당 단일 종합 상태 1행으로 요약 | 세부 경로 구분 없이 다섯 하네스를 각각 가장 보수적인 단일 등급 하나로 압축 표기 | |
| 통과 셀 중심 표 + 미지원·미검증은 하단 산문 각주로 분리 | 매트릭스 표에는 통과한 `native`/`fixture` 항목만 싣고 `Hermes` 역할 제한이나 미검증 사유는 본문 설명으로만 기술 | |

**User's choice:** 하네스 × 시나리오·역할 축으로 세분화하고 정확한 사유 코드 기록
**Notes:** 없음.

### Q4. 시나리오 증명 결과 조회 수단

| Option | Description | Selected |
|--------|-------------|----------|
| 패키지 동봉 문서(`docs/`) + JSON 인덱스 + 독립 read-only 검증 스크립트(`text`/`--json` 출력) (Recommended) | Phase 29/30 검증기 패턴과 일관되며, 공개 CLI 명령 표면을 불필요하게 늘리지 않고도 소스와 패킹 배포판 양쪽에서 해시·증거 계층을 즉시 조회·재검증 가능 | ✓ |
| 공개 `alpha-aos` CLI에 전용 조회 하위 명령/플래그 추가 | 예: `alpha-aos task proof` 또는 `doctor` 옵션을 신설해 CLI 본체에서 매트릭스를 렌더링(공개 CLI 파서·포매터 확장 수반) | |
| 정적 마크다운 문서 열람만으로 제한 | 실행 가능한 read-only 검증 출력(`text`/`--json`) 없이 문서화된 표와 테스트 파일명만 제공 | |

**User's choice:** 패키지 동봉 문서(`docs/`) + JSON 인덱스 + 독립 read-only 검증 스크립트(`text`/`--json` 출력)
**Notes:** 없음.

---

## 패킹 배포판 무결성과 발견·호출 검증 깊이 (PROVE-02)

### Q1. 패킹 아티팩트(`npm pack`) 허용 목록과 포함·차단 경계

| Option | Description | Selected |
|--------|-------------|----------|
| `audit-tarball` allowlist에 v0.6.0 안내·스키마·정규화된 증명 문서/인덱스를 명시 등록하고 개인 경로(`assertNoPrivatePaths`)·`.planning/`·`candidate` lock은 엄격 차단 (Recommended) | 패킹 아카이브에 필요한 모든 런타임/안내 산출물을 빠짐없이 포함하되 로컬 scratch 경로 유출은 빌드·패킹 감사에서 즉시 실패 처리 | ✓ |
| 코드·스키마·스킬(`dist/`, `schemas/`, `skills/`, `catalog/`)만 패킹에 포함하고 `docs/` 증명 문서·검증 스크립트는 저장소 전용으로 제외 | 배포판 용량은 줄지만 설치된 패키지 단독으로는 시나리오 증명 문서 열람 불가 | |
| 기존 `package.json` `files` 글로브를 그대로 신뢰하고 별도 allowlist 항목 검증은 생략 | 새 스키마나 안내 파일이 누락·초과 포함될 위험 존재 | |

**User's choice:** `audit-tarball` allowlist 명시 등록 및 개인 경로·`.planning/`·`candidate` lock 엄격 차단
**Notes:** 없음.

### Q2. 공유 정책·6개 경로 안내의 무결성 잠금 검증 범위

| Option | Description | Selected |
|--------|-------------|----------|
| 패킹 샌드박스에서 다섯 하네스 타깃 전체 렌더링 해시 일치 + 변조 시 fail-closed 거부(음성 케이스)까지 검증 (Recommended) | 설치된 tarball의 `stack.lock.json` 핀과 다섯 타깃에 배포된 `alpha-aos-task` 바이트 해시를 대조하고, 안내 변조 시 `install`/`doctor`가 즉시 차단함을 확인 | ✓ |
| 패킹 샌드박스에서는 대표 하네스 1개(`Codex`)만 동기화·해시 대조 | 나머지 네 하네스 렌더링 무결성은 기존 단위 테스트(`owned-skills.test.ts`)에만 맡김 | |
| tarball 내 원본 `SKILL.md` 파일 해시만 확인 | 하네스별 네이티브 설정 루트로의 실제 렌더링 해시 대조는 패킹 테스트에서 생략 | |

**User's choice:** 다섯 하네스 타깃 전체 렌더링 해시 일치 + 변조 시 fail-closed 거부 검증
**Notes:** 없음.

### Q3. 패킹 설치 후 발견성(discoverability) 증명 기준

| Option | Description | Selected |
|--------|-------------|----------|
| 패킹 설치본 CLI 진단(`doctor`/어댑터 파싱·메타데이터·해시 상태 `CURRENT` 확인) + 가용 호스트의 무과금 네이티브 발견 프로브 결합 (Recommended) | 단순 파일 존재나 grep만으로 발견을 선언하지 않고, 설치된 바이너리의 하네스별 발견·검증 경로가 공유 정책과 6개 경로 안내를 정상 인식함을 입증(미설치/미지원 하네스는 명시 보고) | ✓ |
| 스킬 파일 생성 여부와 frontmatter 텍스트 정규식 매칭만 수행 | 별도 CLI `doctor`나 어댑터 발견 진단은 패킹 검증에서 생략 | |
| 다섯 하네스 전체에 실제 유료 모델 프롬프트를 호출해 암묵적 스킬 선택 검증 | 현행 유료 카나리 보류(hold) 원칙과 충돌 | |

**User's choice:** 패킹 설치본 CLI 진단 + 가용 호스트 무과금 네이티브 발견 프로브 결합
**Notes:** 없음.

### Q4. 패킹 설치본 대상 의미 있는 호출(meaningful invocation) 범위

| Option | Description | Selected |
|--------|-------------|----------|
| 패킹 설치된 `alpha-aos` CLI로 정책 조회·전환·롤백 + intake 분류 + readiness 진단 + 6개 경로 투영·계약 preview(`full` 다이제스트 포함)를 격리 샌드박스에서 실제 실행 및 호스트 무오염 검증 (Recommended) | 배포 바이너리에서 스키마·런타임 경로 누락 없이 v0.6.0 전체 공개 계약이 동작함을 무과금으로 입증 | ✓ |
| 패킹 설치본에서는 `install`/`doctor`/`uninstall` 기본 수명주기만 실행 | v0.6.0 공유 모드·6개 경로 호출은 컴파일된 소스 테스트에만 맡김 | |
| 패킹 샌드박스 내부에서 유료 외부 에이전트 워커(`task start`)까지 매 테스트마다 실기 구동 | 유료 호출 보류 원칙 위반 및 로컬 CI 불안정성 초래 | |

**User's choice:** 패킹 설치된 `alpha-aos` CLI로 v0.6.0 정책·intake·readiness·6개 경로 투영/preview 전체 호출 및 호스트 무오염 검증
**Notes:** 없음.

---

## 영문·국문 문서 구성과 지원 한계 안내 (PROVE-03)

### Q1. 영문·국문 문서 배치와 역할 분담

| Option | Description | Selected |
|--------|-------------|----------|
| `README.md` / `README.ko.md` 핵심 요약 + 전용 영·한 사용자 가이드 쌍(예: `docs/task-entry.md` & `docs/task-entry.ko.md`) 분리 (Recommended) | `README` 비대화를 막으면서 일반 사용자가 두 모드·6개 스타일·예외·초기화·지원 한계를 저수준 운영 감사 문서(`task-runtime-controls.md`)와 섞이지 않고 영·한 대칭으로 따라갈 수 있게 구성 | ✓ |
| 별도 가이드 파일 없이 `README.md`와 `README.ko.md` 본문에 모든 상세 규칙·사례를 직접 수록 | 파일 수는 늘지 않지만 이미 450줄 이상인 양쪽 `README`가 크게 길어짐 | |
| 기존 `docs/task-runtime-controls.md`에 영·한 섹션을 덧붙이고 `README`는 링크만 추가 | 토큰 회계·사고 감사 내용과 일반 사용자 작업 진입 안내가 한 파일에 혼재됨 | |

**User's choice:** `README.md` / `README.ko.md` 핵심 요약 + 전용 영·한 사용자 가이드 쌍 분리
**Notes:** 없음.

### Q2. 영문 문서에서의 6개 한국어 고정 라벨 표기 규칙

| Option | Description | Selected |
|--------|-------------|----------|
| 영문 문서에도 실제 출력되는 한국어 고정 라벨 원문을 그대로 싣고 번호(`1–6`)·canonical ID(`conversational-quick` 등)·영문 설명을 1:1 매핑 표로 병기 (Recommended) | Phase 28 고정 라벨 불변 원칙을 지키면서 영문 독자도 실제 화면/번호 선택과 명시 스타일 입력을 혼동 없이 따라갈 수 있음 | ✓ |
| 영문 문서 본문에는 내부 canonical ID(`conversational-quick` 등)만 표기 | 실제 strict chooser 출력의 한국어 라벨과 문서 표기가 어긋날 수 있음 | |
| 임의 번역된 영문 표시 라벨(예: `Interactive-quick`)을 새로 병행 표기 | 승인되지 않은 비표준 라벨이 생겨 정규화 규칙과 충돌할 위험 있음 | |

**User's choice:** 한국어 고정 라벨 원문 + 번호(`1–6`) + canonical ID + 영문 설명 1:1 매핑 표 병기
**Notes:** 없음.

### Q3. 영문·국문 가이드의 설명 깊이와 예시 구성

| Option | Description | Selected |
|--------|-------------|----------|
| 영·한 대칭 의사결정 흐름과 구체적 대조 사례(양성 vs 반례) 수록 (Recommended) | 국소 rename·번역·한정 push(면제) vs 다중 서브시스템 rename·충돌 push(비면제), 완료 후 독립 버그 픽스(새 선택) vs 활성 작업 테스트 수리(유지), `absent`/`partial` 복구 후 1회 재개, 직접 GSD 명령(chooser 생략)과 오토파일럿 exact 승인·별도 `start`를 실제 사용자 흐름으로 설명 | ✓ |
| 개념 정의와 규칙 요약만 간결하게 기술 | 구체적 대조 사례 없이 각 항목의 원칙만 짧게 나열 | |
| CLI 옵션·JSON 스키마 레퍼런스 중심으로 기술 | 자연어 하네스 대화 흐름보다 CLI 하위 명령 명세 위주로 구성 | |

**User's choice:** 영·한 대칭 의사결정 흐름과 구체적 대조 사례(양성 vs 반례) 수록
**Notes:** 없음.

### Q4. 실제 지원 한계 표기, 버전·출시 경계, 영·한 문서 정합성 검증

| Option | Description | Selected |
|--------|-------------|----------|
| 하네스별 실제 지원 한계 표를 영·한 양쪽에 명시하고, 정식 릴리스 컷(`package.json` 범프/npm 배포) 주장 없이 현행 동작으로 기술 + 자동 문서 정합성 테스트 추가 (Recommended) | `Hermes` worker-only, `Claude` G-07-2, 번호 fallback, 미실행 3-OS CI를 숨김없이 적고, 영·한 필수 섹션/링크/6개 라벨/개인경로 부재를 테스트로 강제 | ✓ |
| 지원 한계는 영문 시나리오 증명 문서에만 적고 `README`·국문 가이드에서는 생략 | 국문 독자가 실제 지원 한계를 놓칠 수 있음 | |
| 문서에서 0.6.0 정식 릴리스 완료로 선표기하고 `package.json` 버전도 함께 수정 | `ROADMAP`의 버전 범프·배포 보류(hold) 결정과 충돌 | |

**User's choice:** 영·한 지원 한계 표 명시 + 미출시 정합성 유지 + 자동 문서 정합성 테스트 추가
**Notes:** 없음.

---

## 최종 회귀 게이트와 기존 회귀 부채·보류 항목 처리 (PROVE-04)

### Q1. 표적 양성·음성 행동 검증 필수 시나리오 범위

| Option | Description | Selected |
|--------|-------------|----------|
| 교차 하네스 전체 여정을 양성·음성(positive/negative) 행동 쌍으로 구성 (Recommended) | (1) `Codex→Antigravity→Pi→Codex` 모드 전환 vs 손상 정책/루트 불일치 거부, (2) 릴리스 완료 후 독립 버그 픽스 새 선택 vs 활성 작업 연속성, (3) `absent`/`partial` 복구 1회 인계 vs 중복/미승인 실행 차단, (4) `full` 품질 통과 vs 일반 quick 위장·변조·미지원 하네스 거부를 결합 검증 | ✓ |
| Phase 27–30 개별 단위 테스트를 재실행하는 것으로 갈음하고 Phase 31 전용 교차 결합 스위트는 최소화 | 단계 간 인계 경계에서 발생하는 회귀를 놓칠 수 있음 | |
| 정상 경로(happy path) 결합 시나리오만 추가하고 음성·변조·차단 케이스는 기존 테스트에 위임 | `PROVE-04`의 표적 양성/음성 행동 검증 요구에 미달할 우려 있음 | |

**User's choice:** 교차 하네스 전체 여정을 양성·음성 행동 쌍으로 결합 검증
**Notes:** 없음.

### Q2. 구현 중 검증과 최종 전체 회귀 실행·기록 절차

| Option | Description | Selected |
|--------|-------------|----------|
| 구현 중에는 표적 검사만 수행하고, 최종 수용에서 동일 `HEAD` 기준으로 전체 게이트(`check` → `build` → 표적 양성/음성·패킹 → `audit-tarball` → `npm test` → `build:check` → read-only 검증기)를 1회 완주해 정확한 수치·SHA 기록 (Recommended) | 불필요한 반복 실행을 막으면서 최종 증거의 일관성을 보장 | ✓ |
| 모든 중간 플랜·커밋마다 전체 `npm test`와 패킹 테스트를 매번 반복 실행 | 실행 시간이 과도하게 늘어나고 로드맵의 효율적 실행 원칙에 어긋남 | |
| 새로 추가한 Phase 31 표적 스위트와 패킹 테스트만 최종 실행하고 전체 `npm test`는 생략 | `PROVE-04`의 최종 전체 회귀(final full regression) 요구를 충족하지 못함 | |

**User's choice:** 구현 중 표적 검사 + 최종 수용 동일 `HEAD` 전체 게이트 1회 완주 및 실측 기록
**Notes:** 없음.

### Q3. 기존 회귀 부채 이력(`261101-ww3` 등)과 미실행·`skip` 항목 집계·표기

| Option | Description | Selected |
|--------|-------------|----------|
| 과거 부채 이력 보존 + 이번 실행의 스위트별 실측 결과 대조 + 미실행/실패 항목의 `passed` 합산 엄격 금지 (Recommended) | `261101-ww3`의 4개 스위트를 포함해 현재 실제 실행 결과(pass/fail/skip)를 투명하게 기록하되, 과거 이력을 지우거나 미실행 보류 항목(3-OS CI, Claude 실기 카나리 등)을 통과·면제로 위장하지 않음 | ✓ |
| 로컬 전체 테스트 통과 시 과거 부채 이력과 미실행 보류 항목도 일괄 해결(`passed`)로 정리 | `PROVE-04`의 정직한 미실행/실패 보존 원칙에 위배됨 | |
| 과거 부채 관련 스위트들을 테스트 러너에서 제외하고 미실행으로만 남겨둠 | 현재 코드에서의 실제 회귀 여부를 확인하지 못함 | |

**User's choice:** 과거 부채 이력 보존 + 스위트별 실측 대조 + 미실행/실패 항목의 `passed` 합산 엄격 금지
**Notes:** 없음.

### Q4. 최종 회귀 실패 시 차단·수리 범위와 독립 리뷰 게이트

| Option | Description | Selected |
|--------|-------------|----------|
| 필수 수용 실패는 즉시 완료 차단 + 범위 외 회귀 수리는 명시적 범위 승인 요구 + 독립 read-only 코드 리뷰 필수 유지 (Recommended) | v0.6.0 시나리오·패킹·무결성·호환성 실패는 자동 우회 없이 차단하고, 범위 밖 서브시스템 수리는 무단 확장 대신 정확한 실패 기록 후 승인을 거치며, 로컬 테스트 통과 외에 독립 리뷰 게이트를 유지 | ✓ |
| 최종 회귀에서 발견된 모든 범위 외 과거 결함까지 Phase 31 안에서 무제한 자율 수리 | 승인된 Phase 31 범위를 벗어나 의도치 않은 런타임 부작용 위험 초래 | |
| 회귀 실패를 경고(advisory)로만 남기고 Phase 31 완료 선언 허용 | 필수 실패 차단(SC 5) 원칙 위반 | |

**User's choice:** 필수 수용 실패 즉시 차단 + 범위 외 수리 명시적 승인 요구 + 독립 코드 리뷰 필수 유지
**Notes:** 없음.

---

## the agent's Discretion

- 신규 시나리오 증명 문서·인덱스·검증 스크립트 및 영문/국문 사용자 가이드의 구체적 파일명과 JSON 인덱스 세부 필드는 기존 Phase 29/30 검증기 및 `scripts/audit-tarball.mjs` 규칙에 맞춰 연구·계획 단계에서 확정.
- 패킹 샌드박스 검증 및 표적 수용/문서 정합성 테스트 파일 분할 구조는 실행 시간과 격리 안전성을 기준으로 설계.

## Deferred Ideas

- 유료 네이티브 카나리 실행(`Claude Code` G-07-2 실기 유료 영수증 포함), 글로벌 설치 재적용(global reconcile), 원격 `git push`, 3-OS/macOS CI 실행·수리, `package.json` 버전 범프 및 `npm publish` 배포는 기존 보류(holds)에 따라 범위 밖으로 유지.
