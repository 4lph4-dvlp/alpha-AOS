# [CRITICAL BUG REPORT] alpha-AOS Codex 오토파일럿 대기(sleep) 폴링 루프 및 토큰 폭식 결함 보고서

**대상 프로젝트**: `D:\dev\alpha-AOS` (및 오토파일럿 워크스페이스 전반)  
**발생 일시**: 2026-10-21  
**하네스 및 환경**: Windows 11, Codex CLI (`gpt-6.1-sol` high reasoning), `alpha-aos` 오토파일럿 / GSD Quick  
**심각도**: **CRITICAL (P0)**  

---

## 1. 개요 및 핵심 결함 요약 (Executive Summary)

Codex 하네스 환경에서 `alpha-aos`의 오토파일럿(`alpha-aos task`) 또는 장기 실행 GSD 워크플로우를 구동할 때, **장시간 소요되는 도구 실행이나 외부 작업 완료를 대기하기 위해 `sleep`을 주기적으로 호출하는 폴링(Polling) 루프가 발생**하고 있다.

이로 인해 매 슬립 주기마다 수십만 토큰에 달하는 전체 대화 컨텍스트가 모델에 반복 재전송되어, **수천만 토큰에 달하는 극단적인 토큰 낭비(Token Blowout)와 5시간 윈도우 레이트 리밋 고갈 사태가 반복 발생**하고 있다. 현재의 `sleep` 기반 대기 방식을 근본적으로 대체할 수 있는 새로운 메커니즘 설계가 시급히 요구된다.

---

## 2. 결함 상세 (Defect Details)

### [BUG-06] 장기 실행 도구 및 작업 대기 시 `sleep` 폴링 루프로 인한 대규모 토큰 폭식 및 레이트 리밋 고갈 (CRITICAL / P0)

- **발생 위치 및 유발 도구**:
  - `alpha-aos task` 오토파일럿 메인 컨트롤러 및 GSD 워크플로우 전반
  - 대규모 테스트 스위트 실행 (`npm test`, 릴리스 게이트 검증, 컴포넌트 픽스처 전수 검사 등)
  - 저장소 전체 빌드 및 장시간 무결성 검증 프로세스
  - 서브에이전트(`gsd-code-reviewer` 등) 및 백그라운드 태스크의 완료 대기

- **현상 (Symptom)**:
  - 장시간 실행되는 명령이나 하위 작업의 완료를 확인하기 위해, 에이전트가 주기적으로 `sleep(45000)` 등의 슬립 도구를 반복 호출하여 대기 루프를 유지함.
  - 실제 실전 세션(`cross-platform-computer-use`)에서 단일 태스크 진행 중 **`sleep` 도구가 52회, `wait_agent` 도구가 13회(총 65회 이상) 반복 호출**됨.

- **문제점 및 영향 (Impact & Root Problems)**:
  1. **거대 컨텍스트 재전송에 따른 기하급수적 토큰 낭비 (Context Ballooning)**:
     - LLM 세션 특성상 워크플로우가 진행되면서 대화 컨텍스트가 **20만~30만 토큰 이상**으로 누적됨.
     - `sleep` 도구가 반환될 때마다 모델이 깨어나 새 턴을 시작하므로, **누적된 20만~30만 토큰의 전체 프롬프트 히스토리가 매 턴마다 고스란히 재전송**됨.
     - 65회의 대기 턴 동안 아무런 유의미한 코드 작성이나 도구 조작 없이, **순수하게 "대기"하는 데만 약 1,500만 토큰 이상이 허공으로 증발**함.
  2. **API 레이트 리밋의 치명적 고갈 (Rate Limit Exhaustion)**:
     - 대기 루프로 인해 수천만 토큰의 Input이 단시간에 집중 투입되어, OpenAI 5시간 사용량 윈도우 한도를 **2회 연속으로 전부 고갈**시킴.
     - 이로 인해 오토파일럿 작업이 수 시간 동안 강제 정지되거나 중단되는 심각한 병목 현상이 발생함.
  3. **비효율적 지연 및 불필요한 턴 소모**:
     - 정적 슬립 인터벌로 인해 실제 프로세스가 일찍 끝나도 잉여 대기 시간이 발생하며, 상태 변화를 감지하기 위해 과도한 턴이 소비됨.

- **요구 조치 및 해결 과제 (Action Required)**:
  - 주기적으로 `sleep`을 부르며 전체 대화 컨텍스트를 반복 재평가시키는 현재의 폴링 방식은 완전히 지속 불가능함.
  - Codex 및 타 하네스 환경에서 장기 실행 도구(테스트, 빌드, 서브에이전트 등)의 완료 여부를 **거대 컨텍스트의 불필요한 재전송 없이 안전하고 효율적으로 인지하고 대기할 수 있는 대체 방안**이 반드시 마련되어야 함.
  - *구체적인 아키텍처 및 구현 메커니즘은 다음 수정을 담당할 에이전트가 하네스 특성과 런타임 제약조건을 깊이 있게 조사하여 최적의 대안을 설계 및 도출할 것.*

---

## 3. 이전 결함 해결 내역 (Resolved History)

> [!NOTE]
> 본 보고서에 수록되었던 이전의 결함 5건은 **Phase 24 (`v0.3.1`, commit `3a4e632`)**에서 구현 및 검증이 완료되어 본문에서 정리되었습니다.
> 
> * **[BUG-01] Antigravity 하네스의 모델 티어 라우팅 부재** → `AUTO-FIX-01` (`--model` 플래그 주입 및 계약/config 모델 바인딩 구현 완료)
> * **[BUG-02] 취약한 바이너리 SHA-256 해시 검증으로 인한 Fail-Closed 차단** → `AUTO-FIX-02` (`reprobeHarnessRoleReceipt`, `--probe` 자동 갱신 구현 완료)
> * **[BUG-03] 격리 스냅샷 아티팩트와 GSD `.planning` 소유권 충돌** → `AUTO-FIX-03` (`materializeTaskSnapshot`의 `.planning` 읽기 전용 미러링 구현 완료)
> * **[BUG-04] `verifyGsdEvidence`의 이전 커밋 기반 락인 결함** → `AUTO-FIX-04` (재시도 시 기존 quick 증거 인정 `allowExistingClaimedQuick` 구현 완료)
> * **[BUG-05] Antigravity 서브에이전트 모델 무단 다운그레이드 및 강제 상속 결함** → `AUTO-FIX-05` (`INCOMPATIBLE_SUBAGENT_MODEL` Fail-closed 및 거버넌스 가드레일 구현 완료)
> 
> 관련 회귀 테스트(`test/task-autopilot-bugfixes.test.ts`) 5건 전원 통과 (`pass 5 / fail 0`).

---
**작성자**: alpha-AOS Post-Mortem & Dogfooding Team  
**상태**: OPEN / ACTION REQUIRED (BUG-06)  
