# Phase 7: Cross-Platform Release Proof - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-18
**Phase:** 07-cross-platform-release-proof
**Areas discussed:** 크로스 플랫폼 픽스처 매트릭스 및 CI 패키징 파이프라인 (REL-01, REL-05), 지원 매트릭스 및 실환경 카나리/양음성 대조군 체계 (REL-02, REL-03), 브라운필드 E2E GSD 전체 라이프사이클 실증 (REL-04), 릴리즈 출처(Provenance), 발행 게이트 및 스모크 테스트 (REL-05, REL-06)

---

## 크로스 플랫폼 픽스처 매트릭스 및 CI 패키징 파이프라인 (REL-01, REL-05)

### Q1: 릴리즈 tarball 아티팩트 생성 및 전달 파이프라인 구성

| Option | Description | Selected |
|--------|-------------|----------|
| 단일 빌드 tgz 공유 (추천) | CI에서 생성한 단일 `alpha-aos-0.1.0.tgz`를 아티팩트로 업로드하고, 3개 OS 러너가 동일 바이트 tarball을 다운로드하여 픽스처 테스트 실행 | ✓ |
| OS별 독립 패키징 | 각 OS 러너가 개별적으로 `npm pack`을 실행하여 자체 tarball을 생성하고 테스트 실행 | |
| 에이전트 재량에 위임 | 동일 바이트 보장 원칙에 가장 부합하는 방식으로 에이전트가 최적 결정 | |

**User's choice:** 단일 빌드 tgz 공유 (추천)
**Notes:** 3개 OS 러너가 동일한 바이트의 패키지를 검증함으로써 플랫폼 간 패키지 불일치 위험 차단.

### Q2: candidate.lock.json 및 로컬 상태 패키징 차단 (REL-05)

| Option | Description | Selected |
|--------|-------------|----------|
| 화이트리스트 + 전용 tarball 감사 스크립트 (추천) | package.json/files 정밀화, .npmignore 추가와 함께 `scripts/audit-tarball.mjs`가 tarball 내부 엔트리를 파싱해 candidate.lock.json 및 미허용 파일 포함 시 빌드 즉시 거부(fail-closed) | ✓ |
| .npmignore 기반 단순 제외 | catalog/candidate.lock.json만 .npmignore에 추가하고 별도 tarball 파싱 검증 스크립트는 두지 않음 | |
| 에이전트 재량에 위임 | 패키지 화이트리스트 및 검증 스크립트 상세 구현을 에이전트 판단에 일임 | |

**User's choice:** 화이트리스트 + 전용 tarball 감사 스크립트 (추천)
**Notes:** prepack/CI 레벨에서 tarball 엔트리를 직접 파싱 검사하여 공급망 보안 위반 사전 차단.

### Q3: 3개 OS 픽스처 격리 방식 (REL-01)

| Option | Description | Selected |
|--------|-------------|----------|
| 임시 루트 및 환경변수 오버라이드 샌드박스 (추천) | 임시 디렉토리(mkdtemp)를 생성하고 `ALPHA_AOS_STATE_DIR`, 하네스 config 경로, npm_config_prefix를 격리 경로로 주입하여 호스트 실제 루트를 100% 보존하며 install/status/doctor/uninstall 사이클 검증 | ✓ |
| 전역 테스트 후 정리 | 실제 호스트 홈 경로에 설치 및 테스트 후 uninstall 및 롤백 스크립트로 상태 복원 시도 (오염 위험 존재) | |
| 에이전트 재량에 위임 | 3개 OS 러너에서 호스트를 완벽히 격리하는 샌드박스 구성을 에이전트 최적화에 일임 | |

**User's choice:** 임시 루트 및 환경변수 오버라이드 샌드박스 (추천)
**Notes:** 호스트 머신의 실제 `~/.alpha-aos` 및 하네스 글로벌 환경을 전혀 건드리지 않고 비파괴적 검증 보장.

### Q4: 픽스처 라이프사이클 검증 범위

| Option | Description | Selected |
|--------|-------------|----------|
| 전체 라이프사이클 E2E 검증 (추천) | [격리 Prefix 설치] -> [install --apply] -> [2차 실행 시 CURRENT 멱등성 확인] -> [status/doctor 진단 통과] -> [uninstall --all 후 베이스라인 복원] 전 과정을 3개 OS에서 모두 통과 | ✓ |
| 설치 및 진단 중심 축소 검증 | 설치 및 `doctor` 실행 성공까지만 확인하고 재조정 멱등성 및 완전 제거는 제외 | |
| 에이전트 재량에 위임 | REL-01 성공 기준을 만족하는 최적의 라이프사이클 검증 단계를 에이전트에게 위임 | |

**User's choice:** 전체 라이프사이클 E2E 검증 (추천)
**Notes:** 설치부터 멱등 재조정, 진단, 완전 제거 및 베이스라인 복원까지 전체 상태 머신 통과를 릴리즈 게이트로 설정.

---

## 지원 매트릭스 및 실환경 카나리/양음성 대조군 체계 (REL-02, REL-03)

### Q1: 버전화된 지원 매트릭스 관리 및 노출 (REL-02)

| Option | Description | Selected |
|--------|-------------|----------|
| 구조화된 소스 + CLI/문서 동기화 (추천) | `src/core/support-matrix.ts`에 버전/OS/하네스별 카나리 검증 결과를 정형 데이터로 관리하고, `alpha-aos doctor --matrix` 및 `docs/SUPPORT_MATRIX.md`로 동일 증적 렌더링 | ✓ |
| 정적 Markdown 문서만 작성 | `docs/SUPPORT_MATRIX.md` 파일에 정적 테이블로만 수동 작성하고 CLI 노출은 제외 | |
| 에이전트 재량에 위임 | 지원 매트릭스의 데이터 구조 및 문서/CLI 표현 방식을 에이전트에 위임 | |

**User's choice:** 구조화된 소스 + CLI/문서 동기화 (추천)
**Notes:** 코드와 문서 간의 드리프트를 방지하고 사용자가 터미널에서도 동일한 지원 현황을 검사 가능하게 지원.

### Q2: 실환경 카나리 호출 증적 수집 및 기록

| Option | Description | Selected |
|--------|-------------|----------|
| 격리 실행 + 정형 증적 기록 (추천) | `alpha-aos doctor --canary`를 통해 각 활성 하네스의 실제 호출을 안전하게 수행하고 토큰/자격증명이 마스킹된 증적 레코드 생성; 미설치 하네스는 unverified로 정직하게 보고 | ✓ |
| 100% 모의(Mock) 카나리 | 외부 하네스 CLI를 실제로 실행하지 않고 모의 서브프로세스로만 통과 여부 시뮬레이션 | |
| 에이전트 재량에 위임 | 하네스별 실환경 호출 방식 및 증적 기록 메커니즘을 에이전트 최적 설계에 일임 | |

**User's choice:** 격리 실행 + 정형 증적 기록 (추천)
**Notes:** 토큰 및 크리덴셜 노출 없이 활성 하네스(Codex, Antigravity, Pi, Hermes)의 실제 네이티브 도구 발견 및 실행을 증명.

### Q3: 4대 핵심 기능 양음성 페어 대조군 구축 (REL-03)

| Option | Description | Selected |
|--------|-------------|----------|
| 자동화된 쌍 테스트 + 정형 검증 아티팩트 (추천) | `test/release-controls.test.ts`에 4개 영역별 Positive/Negative 대조군 테스트를 구현하고, 실행 결과를 담은 검증 리포트(`docs/RELEASE_CONTROLS.md` 등)를 생성해 검사 가능하게 구성 | ✓ |
| 수동 체크리스트 문서 | 사용자가 수동으로 양성/음성 시나리오를 직접 실행해볼 수 있는 Markdown 체크리스트 가이드만 제공 | |
| 에이전트 재량에 위임 | 4개 대조군(옵션 호출, 프로젝트 스코프, 필수 게이트, opt-out)의 테스트 구성 및 아티팩트 설계를 에이전트에 위임 | |

**User's choice:** 자동화된 쌍 테스트 + 정형 검증 아티팩트 (추천)
**Notes:** 단순 기능 실행 성공뿐 아니라, 의도치 않은 영역에서의 비호출/차단/격리(Negative control)까지 엄격하게 검증.

### Q4: 상태 분류 체계 정의

| Option | Description | Selected |
|--------|-------------|----------|
| 4단계 상태 체계 명시 (추천) | PROVEN(실환경 검증 완료), RESIDUE(Claude Code 호환 잔여물), UNVERIFIED(미검증/카나리 미실행), UNSUPPORTED(미지원)로 명확히 구분하여 거짓 성공 보고 원천 방지 | ✓ |
| 단순 2단계(Supported/Unsupported) | 세부 상태 구분 없이 지원/미지원으로만 단순 표기 | |
| 에이전트 재량에 위임 | 지원 매트릭스 및 진단 결과의 상태 태그와 출력 포맷 설계를 에이전트에 위임 | |

**User's choice:** 4단계 상태 체계 명시 (추천)
**Notes:** Claude Code는 compatibility residue로 명확히 못 박고, 미실행 카나리를 지원됨으로 왜곡하지 않음.

---

## 브라운필드 E2E GSD 전체 라이프사이클 실증 (REL-04)

### Q1: E2E 라이프사이클 테스트 환경 구성

| Option | Description | Selected |
|--------|-------------|----------|
| 독립 Git 픽스처 워크스페이스 (추천) | `test/fixtures/brownfield-gsd-cycle`에 실제 브라운필드 레포를 구성하고, 임시 디렉토리로 복제하여 단일 GSD 작성기 하에서 discuss → plan → execute → verify → ship 전 과정을 실행 및 검증 | ✓ |
| 인메모리 시뮬레이션 | 별도 픽스처 저장소 없이 단계별 함수들을 순차 호출하는 모의 테스트로 대체 | |
| 에이전트 재량에 위임 | 브라운필드 픽스처 저장소의 디렉토리 구조 및 복제 실행 방식을 에이전트에 위임 | |

**User's choice:** 독립 Git 픽스처 워크스페이스 (추천)
**Notes:** 실제 git 히스토리, .planning 디렉토리, 코드 베이스가 존재하는 실전 브라운필드 상황을 비파괴 복제하여 완벽 재현.

### Q2: 5대 실증 요소 대상 선정

| Option | Description | Selected |
|--------|-------------|----------|
| 대표 실전 벤치마크 세트 (추천) | [Global: Context7 문서조회] + [Pack: Web API 팩] + [Gate: 인증 Mandatory Security Gate] + [Handoff: Unified Memory 핸드오프] + [Cleanup: uninstall --project 정밀 복원] 조합으로 실증 | ✓ |
| 최소 더미 조합 | 임의의 더미 팩과 더미 게이트를 생성하여 워크플로우 통과 여부만 간이 검증 | |
| 에이전트 재량에 위임 | 5대 실증 요소의 구체적인 구현 대상 선정을 에이전트 최적 조합에 일임 | |

**User's choice:** 대표 실전 벤치마크 세트 (추천)
**Notes:** 프로덕션에서 가장 빈번하게 사용되는 핵심 기능 조합으로 실증 신뢰도 극대화.

### Q3: 단일 GSD 작성기(Single GSD Writer) 원칙 증명

| Option | Description | Selected |
|--------|-------------|----------|
| writer.lock 검증 + 비인가 쓰기 감시 (추천) | `.planning/` 디렉토리에 대해 단일 GSD 컨트롤러만 `writer.lock`을 점유함을 증명하고, 워커나 핸드오프 과정에서 타 하네스가 .planning/을 직접 변조하지 못함을 엄격히 검증 | ✓ |
| 종료 후 상태 파일 단순 점검 | 전체 사이클 종료 후 최종 STATE.md 형식 유효성만 단순 확인 | |
| 에이전트 재량에 위임 | 단일 작성기 원칙의 락 검증 및 증적 생성 메커니즘을 에이전트에 일임 | |

**User's choice:** writer.lock 검증 + 비인가 쓰기 감시 (추천)
**Notes:** Hermes나 비컨트롤러 하네스가 GSD 상태를 조작하지 못하게 단일 쓰기 권한 통제.

### Q4: CI 및 개발자 실행 이원화

| Option | Description | Selected |
|--------|-------------|----------|
| 이원화(CI 자동 회귀 테스트 + 독립 CLI 재현 스크립트) (추천) | `test/brownfield-gsd-cycle.test.ts`를 통해 CI 3개 OS에서 자동 실행되고, 개발자/감사자가 언제든 `scripts/run-brownfield-proof.mjs`로 재현할 수 있도록 이원화 | ✓ |
| CI 통합 배제 및 릴리즈 전 수동 1회 실행 | CI 실행 시간 단축을 위해 CI 파이프라인에서 제외하고 릴리즈 직전에만 수동 스크립트로 실행 | |
| 에이전트 재량에 위임 | 브라운필드 E2E 실행 스크립트 및 CI 파이프라인 연계 방식을 에이전트에 위임 | |

**User's choice:** 이원화(CI 자동 회귀 테스트 + 독립 CLI 재현 스크립트) (추천)
**Notes:** 회귀 방지를 위한 자동화와 감사자의 수동 검증 편의성을 동시에 충족.

---

## 릴리즈 출처(Provenance), 발행 게이트 및 스모크 테스트 (REL-05, REL-06)

### Q1: 패키지 출처 증명 및 stable lock 무결성 검증

| Option | Description | Selected |
|--------|-------------|----------|
| 암호학적 출처 번들 + 검증 CLI (추천) | `alpha-aos-0.1.0.tgz.sha256`, 빌드 매니페스트, stack.lock.json 무결성을 GitHub Release에 게시하고 `scripts/verify-provenance.mjs` 또는 CLI 명령으로 원클릭 출처/해시 검증 지원 | ✓ |
| Git 태그 기반 단순 확인 | 별도 체크섬 번들 없이 GitHub Git Release 태그 커밋 일치 여부만 수동 확인 | |
| 에이전트 재량에 위임 | 릴리즈 출처(Provenance) 구성 및 검증 도구 설계를 에이전트에 위임 | |

**User's choice:** 암호학적 출처 번들 + 검증 CLI (추천)
**Notes:** 다운로드된 패키지의 SHA-256 해시와 빌드 시점의 매니페스트를 대조하여 위변조 없는 불변 릴리즈 증명.

### Q2: 릴리즈 노트 및 알려진 제약사항 문서화

| Option | Description | Selected |
|--------|-------------|----------|
| CHANGELOG.md + docs/RELEASE_NOTES_v0.1.0.md 정형화 (추천) | [Active Harnesses], [Claude Code 호환 잔여물], [플랫폼별 제약 및 v2 연기 항목]을 명시하는 표준 릴리즈 문서 템플릿 작성 | ✓ |
| GitHub Release 웹 릴리즈 본문에만 작성 | 레포 내 별도 문서 파일 없이 GitHub 릴리즈 폼에만 수동 입력 | |
| 에이전트 재량에 위임 | 릴리즈 노트 및 제한사항 문서의 저장 위치와 서식 구성을 에이전트에 위임 | |

**User's choice:** CHANGELOG.md + docs/RELEASE_NOTES_v0.1.0.md 정형화 (추천)
**Notes:** 레포지토리 내 영구적인 공식 문서로 릴리즈 내역 및 지원 경계를 기록.

### Q3: 클린 환경 스모크 테스트 실행 방식

| Option | Description | Selected |
|--------|-------------|----------|
| 2단계 스모크 게이트 (추천) | `scripts/smoke-test.mjs`를 통해 배포 전 로컬 tarball 클린 설치 검증을 통과해야 배포가 허용되고, 배포 후 실제 레지스트리 패키지 설치로 최종 합격 판정 | ✓ |
| 단일 사후 수동 설치 확인 | 배포 전 검증 없이 npm publish 후 터미널에서 수동으로 `npm install -g alpha-aos` 실행하여 에러 여부 확인 | |
| 에이전트 재량에 위임 | 스모크 테스트의 단계별 자동화 스크립트 구현을 에이전트에 위임 | |

**User's choice:** 2단계 스모크 게이트 (추천)
**Notes:** 사전 배포 방어 및 사후 실제 레지스트리 패키지 전파 확인의 2단계 안전장치 확보.

### Q4: 최종 발행 전 안전 사전 검증 및 게이트 통제

| Option | Description | Selected |
|--------|-------------|----------|
| 릴리즈 프리뷰 기본값 (`scripts/release.mjs --dry-run`) (추천) | 빌드 무결성, tarball 화이트리스트, SHA-256 해시, 변경사항을 사전 검사하여 안전하게 리포트하고, `--publish` 플래그가 있어야만 실제 발행 단계 진입 | ✓ |
| 표준 `npm publish --dry-run` 수동 활용 | 별도 릴리즈 오케스트레이션 스크립트 없이 npm 내장 dry-run 플래그만 사용자가 수동 실행 | |
| 에이전트 재량에 위임 | 릴리즈 프리뷰 스크립트 및 발행 게이트 파이프라인 설계를 에이전트에 일임 | |

**User's choice:** 릴리즈 프리뷰 기본값 (`scripts/release.mjs --dry-run`) (추천)
**Notes:** SAFE-01 불변식에 따라 릴리즈 명령도 기본적으로 dry-run으로 작동하여 실수에 의한 배포 방지.

---

## the agent's Discretion

- `alpha-aos doctor --matrix`의 터미널 컬러 서식 및 테이블 정렬 세부 사항.
- `scripts/audit-tarball.mjs` 및 `scripts/verify-provenance.mjs`의 내부 보조 함수 구조.
- `test/fixtures/brownfield-gsd-cycle`의 세부 파일 모의 데이터 구성.

## Deferred Ideas

- OS/컨테이너 수준의 `sealed` 격리 모드는 v2로 연기 (SEAL-01).
