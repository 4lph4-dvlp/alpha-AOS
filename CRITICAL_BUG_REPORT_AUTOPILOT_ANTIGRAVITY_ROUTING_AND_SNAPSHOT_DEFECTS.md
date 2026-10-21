# [CRITICAL BUG REPORT] alpha-AOS Autopilot 및 장기 실행 대기(Sleep) 폴링 루프 결함 보고서

**대상 프로젝트**: `D:\dev\alpha-AOS` 및 오토파일럿 워크스페이스 전반

**발생 일시**: 2026-10-21 (BUG-06), 2026-10-18 (BUG-01 ~ BUG-05)

**하네스 및 환경**: Windows 11, Codex CLI (`gpt-6.1-sol` high reasoning), Antigravity CLI (`agy` 1.4.2), `@opengsd/gsd-core@1.16.0`, `alpha-aos`

**심각도**: **CRITICAL (P0)**

**상태**: BUG-06 IN PROGRESS (런타임 추가 및 부분 수리 진행 중; 독립 리뷰 5개 블로커/2개 경고 수리 및 최종 검증 PENDING; 이전 BUG-01~05 해결 완료)

---

## 1. 개요 및 핵심 요약 (Executive Summary)

Codex 및 Antigravity 하네스 환경에서 `alpha-aos`의 오토파일럿(`alpha-aos task`) 또는 장기 실행 GSD 워크플로우를 구동할 때, **장시간 소요되는 도구 실행이나 외부 작업(테스트 스위트, 저장소 빌드, 서브에이전트)의 완료를 대기하기 위해 `sleep`을 주기적으로 호출하는 폴링(Polling) 루프가 발생**하였다 (BUG-06).

이로 인해 매 슬립 주기마다 거대해진 대화 컨텍스트가 모델에 반복 재전송되어 극단적인 토큰 소모와 공급자 레이트 리밋 고갈이 유발된다는 사용자 도그푸딩 보고가 접수되었다(단, 보고된 턴 수 및 20만~30만+ 토큰 추정치는 검증된 과금 측정값이 아닌 사용자 관찰 가설임; 런타임은 모델 경로의 폴링을 배제할 수 있으나 호스트 레이트 리밋 고갈 방지 보증이나 토큰 절감액을 확정할 수 없음). 본 보고서는 BUG-06의 사용자 보고 내역과 원인 분석, 그리고 Phase 24(`v0.3.1`)에서 기 해결된 이전 결함(BUG-01 ~ BUG-05)의 해결 이력을 통합하여 기록한다.

---

## 2. 신규 핵심 결함 상세 (Defect Details: BUG-06)

### [BUG-06] 장기 실행 도구 및 작업 대기 시 `sleep` 폴링 루프로 인한 대규모 토큰 소모 및 레이트 리밋 고갈 (CRITICAL / P0)

- **발생 위치 및 유발 도구**:
  - `alpha-aos task` 오토파일럿 메인 컨트롤러 및 GSD 워크플로우 전반
  - 대규모 테스트 스위트 실행 (`npm test`, 릴리스 게이트 검증, 컴포넌트 픽스처 전수 검사 등)
  - 저장소 전체 빌드 및 장시간 무결성 검증 프로세스
  - 서브에이전트(`gsd-code-reviewer` 등) 및 백그라운드 태스크의 완료 대기

- **현상 (Symptom)**:
  - 장시간 실행되는 명령이나 하위 작업의 완료를 확인하기 위해, 에이전트가 주기적으로 `sleep(45000)` 등의 슬립 도구를 반복 호출하여 대기 루프를 유지함.
  - 실전 세션(`cross-platform-computer-use`)에서 단일 태스크 진행 중 **`sleep` 도구 52회, `wait_agent` 도구 13회(총 65회 이상) 반복 호출**이 보고됨 (*보고된 횟수 및 추정 토큰은 청구서 기반 실측값이 아닌 사용자 보고 가설임*).

- **문제점 및 영향 (Impact & Root Problems)**:
  1. **컨텍스트 누적 재전송에 따른 대규모 토큰 소모 (Context Ballooning)**:
     - LLM 세션 진행에 따라 대화 컨텍스트가 **20만~30만 토큰 이상**으로 누적됨.
     - `sleep` 도구가 반환될 때마다 새 턴이 시작되므로, 누적된 전체 프롬프트 히스토리가 매 턴마다 재전송됨.
     - 65회의 대기 턴 동안 유의미한 코드 작성이나 도구 조작 없이 대기 과정에서만 대규모 토큰(사용자 추정 약 1,500만 토큰 상당 가설)이 소모됨.
  2. **API 레이트 리밋 고갈 (Rate Limit Exhaustion)**:
     - 대기 루프로 인해 토큰 투입이 단시간에 집중되어 공급자 5시간 사용량 윈도우 한도가 2회 연속 고갈되는 병목 사태가 보고됨.
  3. **비효율적 지연 및 불필요한 턴 소모**:
     - 정적 슬립 인터벌로 인해 실제 프로세스가 조기 종료되어도 즉각 감지하지 못하고 잉여 대기 및 턴 낭비가 발생함.

- **요구 조치 및 해결 방향**:
  - `alpha-aos job start` / `alpha-aos job wait` 및 `alpha-aos task wait`을 통한 이벤트 기반 분리 런타임 제공.
  - 잡 ID는 `job-` 뒤 16자리 소문자 16진수(`^job-[0-9a-f]{16}$`)이며, 결합 자식 프로세스 출력 보존 상한은 64 KiB(`MAX_COMBINED_OUTPUT_BYTES`)로 제한(전체 프로세스 메모리 주장 아님).
  - 미지원 레거시 슈퍼바이저 연계는 미해결(unresolved)로 명시 유지.
  - 단일 유한 타임아웃 관찰 모델 가이드라인 확립.
  - 반복적인 `sleep`/폴링 루프를 거부하고 정적 핸들 기반 관찰로 전환.

---

## 3. 이전 결함 해결 내역 (Resolved History: BUG-01 ~ BUG-05)

> [!NOTE]
> 본 보고서에 수록되었던 이전의 결함 5건은 **Phase 24 (`v0.3.1`, commit `3a4e632`)**에서 구현 및 검증이 완료되었습니다.

1. **[BUG-01] Antigravity 하네스의 모델 티어 라우팅 부재 (CRITICAL / P0)**:
   - 원인: `agy.EXE` 실행 시 `--model` 인자 미전달로 인한 단일 기본 모델 종속.
   - 해결: `AUTO-FIX-01` (`src/adapters/task-antigravity.ts`에 `--model <model-id>` 주입 및 계약/config 모델 바인딩 구현).
2. **[BUG-02] 취약한 바이너리 SHA-256 해시 검증으로 인한 Fail-Closed 차단 (HIGH / P1)**:
   - 원인: 하네스 CLI 업데이트 시 바이너리 해시 불일치로 `alpha-aos task start` 즉시 거부.
   - 해결: `AUTO-FIX-02` (`reprobeHarnessRoleReceipt` 및 CLI `--probe` 플래그로 영수증 자동 갱신 지원).
3. **[BUG-03] 격리 스냅샷 아티팩트와 GSD `.planning` 소유권 충돌 (CRITICAL / P1)**:
   - 원인: 리뷰어 격리 스냅샷 생성 시 `.planning` 디렉토리 제외로 인한 오라클 ENOENT 오류.
   - 해결: `AUTO-FIX-03` (`materializeTaskSnapshot`에서 `.planning` 읽기 전용 미러링 구현).
4. **[BUG-04] `verifyGsdEvidence`의 이전 커밋 기반 락인 결함 (HIGH / P1)**:
   - 원인: 1차 기각 후 재시도 시 baseCommit에 이미 quick 폴더가 존재하여 검증 영구 거부.
   - 해결: `AUTO-FIX-04` (동일 contract ID/task claim 재실행 시 기존 quick 디렉토리 및 커밋 인정 `allowExistingClaimedQuick` 구현).
5. **[BUG-05] Antigravity 서브에이전트 모델 무단 다운그레이드 및 강제 상속 결함 (CRITICAL / P0)**:
   - 원인: Antigravity `invoke_subagent`가 `typeName: "self"`에 대해 Model 인자를 무시하고 부모 모델로 강제 상속/다운그레이드.
   - 해결: `AUTO-FIX-05` (`INCOMPATIBLE_SUBAGENT_MODEL` Fail-closed 방어 및 컨트롤러 프롬프트 가드레일 확립).

---

## 4. 종합 평가 및 후속 조치

- BUG-01 ~ BUG-05는 회귀 테스트(`test/task-autopilot-bugfixes.test.ts`) 5건 전원 통과 (`pass 5 / fail 0`).
- BUG-06은 커밋 `0320c27`에서 대상 슬라이스 67/67 통과(0 fail, 0 skip)를 기록했으나, 확장 테스트(총 69건 중 63 통과, 6 실패) 및 이후 독립 GPT-6.1 리뷰(`task-wait-resolution-review.md`)에서 5개 블로커와 2개 경고가 식별되었습니다.
- 현재 작업자 D(job/verifier/tests)와 작업자 E(task-observer/tests)가 수리 작업을 능동적으로 진행 중이며, 최종 종결(closure)이나 완전 수정 확인은 이루어지지 않았습니다.
- 전체 스위트 실행, 최종 독립 재검토 및 GSD 검증 릴리스 게이트는 PENDING 상태입니다.
