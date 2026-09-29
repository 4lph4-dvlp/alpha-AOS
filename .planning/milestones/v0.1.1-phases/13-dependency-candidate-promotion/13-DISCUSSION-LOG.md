# Phase 13: Dependency Candidate Promotion - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-25
**Phase:** 13-dependency-candidate-promotion
**Areas discussed:** 컴포넌트별 부분 승격 정책 (Partial Promotion Policy), ECC 2.2.1 스킬 및 코드베이스 리터럴 갱신 범위, PR #1 갱신 및 3-OS CI/픽스처 검증 오케스트레이션, GSD Core 1.14.0 호환성 및 렌더러 해시 드리프트 처리, 향후 구성 도구 버전 승격 메커니즘 표준화 (Future Promotion Architecture)

---

## 컴포넌트별 부분 승격 정책 (Partial Promotion Policy)

| Option | Description | Selected |
|--------|-------------|----------|
| (Recommended) 개별 독립 승격 | 픽스처/CI가 완전히 통과(Green)된 컴포넌트만 stable lock에 선별 승격하고, 실패한 컴포넌트는 실패 사유를 기록한 뒤 기존 안정 버전 유지 | ✓ |
| 전체 일괄 승격 (All-or-Nothing) | 5개 후보 컴포넌트가 모두 완벽히 통과할 때만 일괄 승격하고, 하나라도 실패하면 stable lock 승격을 전체 보류 | |
| You decide | 에이전트가 검증 결과 위험도에 따라 자율 판단 | |

**User's choice:** 개별 독립 승격
**Notes:** 5개 컴포넌트 중 일부가 실패하더라도 통과된 컴포넌트의 독립적인 승격을 허용하기로 결정함.

| Option | Description | Selected |
|--------|-------------|----------|
| (Recommended) 전용 증거 문서 | PROMOTION-EVIDENCE.md에 컴포넌트별 픽스처/CI/무결성 판정 및 보류 사유를 구조화하여 기록 | ✓ |
| candidate.lock.json 및 git 커밋 메시지 | 요약 주석/메모로만 기록 | |
| You decide | 에이전트 자율 판단 | |

**User's choice:** 전용 증거 문서 기록
**Notes:** lock.schema.json의 strict 스키마(additionalProperties: false)를 준수하고 감사 추적성을 확보하기 위해 전용 마크다운 증거 파일 사용 결정.

| Option | Description | Selected |
|--------|-------------|----------|
| (Recommended) main의 candidate.lock 초기화 | main 브랜치의 candidate.lock.json은 status: empty로 리셋 | ✓ |
| 미승격 컴포넌트 남겨두기 | 보류된 컴포넌트만 candidate.lock.json에 남김 | |
| You decide | 에이전트 자율 판단 | |

**User's choice:** candidate.lock 초기화
**Notes:** 승격 완료 후 main 브랜치의 candidate 락 채널은 비워두고 다음 자동 발견 사이클에 대비함.

| Option | Description | Selected |
|--------|-------------|----------|
| (Recommended) 3단계 엄격 검증 | (1) npm SHA-512 무결성 재확인, (2) 격리 픽스처 통과, (3) 3-OS CI 및 릴리스 라이프사이클 통과 | ✓ |
| 2단계 검증 | 무결성 확인 및 격리 픽스처 통과만 확인 | |
| You decide | 에이전트 자율 판단 | |

**User's choice:** 3단계 엄격 검증

| Option | Description | Selected |
|--------|-------------|----------|
| (Recommended) B-1 릴리스 시점 완전 정제 | 개발 중 로컬 .planning 활용 후 외부 릴리스/배포 시점에 .planning 완전 제외 | ✓ |
| B-2 즉시 .gitignore 등록 | 지금 즉시 .planning을 gitignore에 추가하여 푸시 차단 | |
| You decide | 에이전트 자율 판단 | |

**User's choice:** B-1: 개발 중 로컬/내부 기록 유지 후 배포 릴리스 시점에 완전 정제
**Notes:** 사용자가 .planning의 보안 영향 및 외부 clone 시 내부 로그 노출 문제를 지적함. 런타임은 .planning을 참조하지 않지만 에이전트 간 컨텍스트 오염을 막기 위한 재실행 검증을 확립하고, 배포 시점에는 .planning이 완전히 배제된 클린 트리를 발행하기로 결정함.

---

## ECC 2.2.1 스킬 및 코드베이스 리터럴 갱신 범위

| Option | Description | Selected |
|--------|-------------|----------|
| (Recommended) pin-pack-skills.mjs 자동 도출 | 2.2.1 타르볼 무결성 검증 후 유지보수 스크립트로 19개 팩 스킬 해시 자동 산출 | ✓ |
| 수동 점검 및 해시 계산 | 개별 해시를 순차적으로 수동 계산 | |
| You decide | 에이전트 자율 판단 | |

**User's choice:** pin-pack-skills.mjs 자동 도출

| Option | Description | Selected |
|--------|-------------|----------|
| (Recommended) 런타임/테스트 동기화 및 히스토리 보존 | mcp-proxy.ts, canaries.yaml, test 등은 2.2.1로 갱신, 과거 문서는 2.2.0 보존 | ✓ |
| 전체 일괄 치환 | 과거 문서 및 주석을 포함하여 일괄 치환 | |
| You decide | 에이전트 자율 판단 | |

**User's choice:** 런타임/테스트 동기화 및 히스토리 보존

| Option | Description | Selected |
|--------|-------------|----------|
| (Recommended) 스킬 Diff 검증 및 안전 정책 준수 | 2.2.0과 2.2.1 사이 diff를 검사하여 도구 허용 정책 위반 여부 확인 | ✓ |
| 무조건 자동 승격 허용 | diff 내용과 관계없이 승격 | |
| You decide | 에이전트 자율 판단 | |

**User's choice:** 스킬 Diff 검증 및 안전 정책 준수

| Option | Description | Selected |
|--------|-------------|----------|
| (Recommended) CAPA-02 라우팅 정합성 재평가 | 2.2.1 deep-research 스킬 대조 후 narrow 판정을 2.2.1로 갱신 유지 | ✓ |
| 기존 2.2.0 판정 유지 | 확인 없이 그대로 유지 | |
| You decide | 에이전트 자율 판단 | |

**User's choice:** CAPA-02 라우팅 정합성 재평가

---

## PR #1 갱신 및 3-OS CI/픽스처 검증 오케스트레이션

| Option | Description | Selected |
|--------|-------------|----------|
| (Recommended) rebase 및 force-push | automation/dependency-candidate를 최신 green main 위로 rebase | ✓ |
| 워크플로 수동 트리거 | dependency-candidate.yml로 자동 재생성 | |
| You decide | 에이전트 자율 판단 | |

**User's choice:** rebase 및 force-push

| Option | Description | Selected |
|--------|-------------|----------|
| (Recommended) 로컬 사전 검증(Pre-flight) 후 CI 관찰 | 로컬에서 5개 후보 픽스처 및 기본 테스트 먼저 실행 후 push | ✓ |
| 직접 CI 실행 | 사전 로컬 검증 없이 바로 push하여 CI로만 판단 | |
| You decide | 에이전트 자율 판단 | |

**User's choice:** 로컬 사전 검증 후 CI 관찰

| Option | Description | Selected |
|--------|-------------|----------|
| (Recommended) GitHub Actions & PR 상태 교차 확인 | gh CLI 및 Actions 로그로 red-main guard 통과 여부 교차 확인 | ✓ |
| 로컬 스크립트 실행으로 갈음 | 로컬에서만 실행 | |
| You decide | 에이전트 자율 판단 | |

**User's choice:** GitHub Actions & PR 상태 교차 확인

| Option | Description | Selected |
|--------|-------------|----------|
| (Recommended) 단일 Run ID 및 3-OS 매트릭스 표 형식 | Phase 10 CI_RUN.md 패턴을 따라 단일 Run ID 및 3-OS 매트릭스 기록 | ✓ |
| 간략한 텍스트 요약 | 1줄 요약 기록 | |
| You decide | 에이전트 자율 판단 | |

**User's choice:** 단일 Run ID 및 3-OS 매트릭스 표 형식

---

## GSD Core 1.14.0 호환성 및 렌더러 해시 드리프트 처리

| Option | Description | Selected |
|--------|-------------|----------|
| (Recommended) 4개 하네스 격리 픽스처 전수 검증 | Claude, Codex, Antigravity, Pi의 gsd-fixture를 모두 구동하여 검증 | ✓ |
| 단일 하네스 간이 검증 | Codex 등 1개 하네스만 검증 | |
| You decide | 에이전트 자율 판단 | |

**User's choice:** 4개 하네스 격리 픽스처 전수 검증
**Notes:** 사용자가 초기 선택 후 재질의를 요청하여 4개 하네스 전수 검증으로 확정함.

| Option | Description | Selected |
|--------|-------------|----------|
| (Recommended) 정당한 업스트림 개선 시 어댑터/해시 동기화 | 정상 훅/템플릿 변경 시 gsd-compat.ts 렌더러 및 테스트 해시 동기화 | ✓ |
| 무조건 승격 거부 | 해시 드리프트 시 1.12.0 현행 유지 | |
| You decide | 에이전트 자율 판단 | |

**User's choice:** 정당한 업스트림 개선 시 어댑터/해시 동기화

| Option | Description | Selected |
|--------|-------------|----------|
| (Recommended) 'standard' 프로필 고정 유지 | 1.14.0에서도 오직 공식 standard 프로필만 허용 | ✓ |
| 하네스별 커스텀 프로필 허용 | 프로필 확장 허용 | |
| You decide | 에이전트 자율 판단 | |

**User's choice:** 'standard' 프로필 고정 유지

| Option | Description | Selected |
|--------|-------------|----------|
| (Recommended) 완전한 GSD 검증 증거 세트 | npm 무결성, 4개 하네스 픽스처 결과, 렌더러 해시 일치 여부를 증거 문서에 상세 기록 | ✓ |
| 간략 기록 | 버전 및 CI 성공 여부만 기록 | |
| You decide | 에이전트 자율 판단 | |

**User's choice:** 완전한 GSD 검증 증거 세트

---

## 향후 구성 도구 버전 승격 메커니즘 표준화 (Future Promotion Architecture)

| Option | Description | Selected |
|--------|-------------|----------|
| (Recommended) 컴포넌트 유형별 검증 게이트 표준화 | MCP, 스킬/팩, 하네스 어댑터, 워크플로우별 특화 게이트 규격화 | ✓ |
| 단일 CI 일괄 판정 | 통합 CI 통과 여부로만 판정 | |
| You decide | 에이전트 자율 판단 | |

**User's choice:** 컴포넌트 유형별 검증 게이트 표준화

| Option | Description | Selected |
|--------|-------------|----------|
| (Recommended) 전용 승격 표준 가이드 구축 | docs/how-to/promote-dependencies.md에 전체 승격 절차 공식 가이드 문서화 | ✓ |
| CONTEXT.md에만 기록 | 별도 docs 미작성 | |
| You decide | 에이전트 자율 판단 | |

**User's choice:** 전용 승격 표준 가이드 구축

| Option | Description | Selected |
|--------|-------------|----------|
| (Recommended) 전용 승격 헬퍼 스크립트 도입 | scripts/promote-candidate.mjs를 구축하여 무결성 검증, 락 갱신, 스키마 검증 원자화 | ✓ |
| 수동 편집 방식 유지 | JSON 파일 직접 수동 갱신 | |
| You decide | 에이전트 자율 판단 | |

**User's choice:** 전용 승격 헬퍼 스크립트 도입

| Option | Description | Selected |
|--------|-------------|----------|
| (Recommended) 릴리스 정제 자동화 도구 규격화 | 릴리스 파이프라인에서 .planning 및 임시 파일 배제 클린 트리 보장 코드화 | ✓ |
| 수동 점검 | 배포 시 수동 점검 | |
| You decide | 에이전트 자율 판단 | |

**User's choice:** 릴리스 정제 자동화 도구 규격화

---

## the agent's Discretion

- 증거 문서(`PROMOTION-EVIDENCE.md`)의 구체적인 마크다운 표 서식 및 섹션 배치
- `scripts/promote-candidate.mjs`의 내부 모듈 구성 및 에러 핸들링 설계
- Phase 13 세부 계획(`13-PLAN.md`)의 웨이브 분할 및 세부 태스크 순서

## Deferred Ideas

- None
