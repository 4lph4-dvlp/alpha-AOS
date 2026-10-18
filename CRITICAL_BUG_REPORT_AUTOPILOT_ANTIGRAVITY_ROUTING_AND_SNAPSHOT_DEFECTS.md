# [CRITICAL BUG REPORT] alpha-AOS Autopilot 실전 사용 결함 보고서
**대상 프로젝트**: `D:\dev\GPTRPG` (Python/FastAPI + React TRPG 플랫폼)  
**발생 일시**: 2026-10-18  
**하네스 및 환경**: Windows 11, Antigravity CLI (`agy` 1.4.2), `@opengsd/gsd-core@1.16.0`, `alpha-aos@1.0.0`  
**심각도**: **CRITICAL (P0 / P1)**  

---

## 1. 개요 및 핵심 요약 (Executive Summary)

GPTRPG 프로젝트의 M0 마일스톤 완료 및 MVP 전환 작업 중 `alpha-aos`의 오토파일럿(`alpha-aos task`) 워크플로우를 실제 구동(Dogfooding)하는 과정에서, **사용자의 명시적 설정 및 기대 동작과 정면으로 어긋나는 중대한 설계 결함 및 런타임 오류 5건**이 발견되었다.

사용자는 **"고추론 기획/플랜(Argon) + 경량/고속 코드 구현(Flash)"**의 이원화 모델 라우팅을 의도하고 옵션 A를 채택하였으나, 실제 런타임에서는 `alpha-aos`가 하네스 호출 시 모델 플래그를 전달하지 않아 메인 세션 전역 설정에 맹목적으로 종속되었고, 격리 스냅샷 아티팩트와 GSD 저장소 구조의 충돌, 그리고 Antigravity 내부 서브에이전트 모델의 무단 다운그레이드로 인해 다수의 실패, 교착 및 계약 불일치가 발생하였다.

---

## 2. 발견된 핵심 결함 목록 (Defect Details)

### [BUG-01] Antigravity 하네스의 모델 티어 라우팅 부재 (CRITICAL / P0)
- **위치**: `src/adapters/task-antigravity.js` (`antigravityExecutorArgs`, `antigravityControllerArgs`)
- **현상**:
  - `alpha-aos`의 태스크 계약(`contract.json`)이나 `.planning/config.json`에 `model_profile_overrides` 또는 `cross_ai_command`(`--model gemini-3.8-flash-high`)를 지정해도, `task-antigravity.js`는 `agy.EXE`를 실행할 때 `--model` 인자를 전혀 주입하지 않음.
  - 생성되는 인자 목록: `['--output-format', 'json', '--json-schema', schemaPath, '--dangerously-skip-permissions', '-p', prompt]`
  - 이로 인해 하위 프로세스는 사용자의 전역 `settings.json`에 설정된 단일 기본 모델로만 구동됨.
- **영향**:
  - 기획/계획 단계와 실행 단계의 모델 분리(Dual-tier)가 완전히 무력화됨.
  - 전역이 Argon이면 실행 단계의 사소한 작업(테스트, 커밋 등)에서도 막대한 Argon 토큰이 소모되어 주간 쿼터(77%+)가 급속 고갈됨.
  - 반대로 전역이 Flash이면 심층 추론이 필요한 Discuss/Plan 단계에서도 3.8 Flash로 다운그레이드되어 의도한 고품질 계획 수립이 누락됨.
- **요구 조치**:
  - `agentPolicy.executor`, `agentPolicy.controller` 설정 또는 태스크 프로필에 따라 `agy` 호출 인자에 `--model <model-id>` 플래그를 명시적으로 주입하도록 어댑터 수정.

---

### [BUG-02] 취약한 바이너리 SHA-256 해시 검증으로 인한 Fail-Closed 차단 (HIGH / P1)
- **위치**: `src/adapters/task-receipts.js` (`readHarnessRoleReceipt`)
- **현상**:
  - `agy.EXE`가 1.4.0에서 1.4.2로 정상 업데이트되었을 뿐인데, `receipts/harnesses/antigravity-*.json`의 `binarySha256` 해시와 불일치한다는 이유로 `alpha-aos task start`가 `UNSUPPORTED_ROLE` 에러와 함께 즉시 거부됨.
  - 오류 메시지: `binary hash mismatch (receipt: f5466e6aaf9f, current: 4f6c7a807f3f). Re-probe required. (D-02)`
  - 그러나 사용자 인터페이스 상에서 이를 갱신할 수 있는 `re-probe` 또는 `repair` 자동 갱신 경로가 동작하지 않아 사용자가 `~/.alpha-aos/receipts/` 내의 JSON 파일 3개를 수동으로 찾아가 SHA-256 해시를 직접 덮어써야만 했음.
- **요구 조치**:
  - 바이너리 해시 드리프트 발생 시, `--probe` 플래그를 통해 즉시 카나리/프로브를 재실행하여 영수증을 자동 갱신할 수 있는 복구 경로 제공.

---

### [BUG-03] 격리 스냅샷 아티팩트와 GSD `.planning` 소유권 충돌로 인한 Reviewer 오진 (CRITICAL / P1)
- **위치**: `src/core/task-artifacts.js` 및 `contract.schema.json` (`allowedRoots`)
- **현상**:
  - `alpha-aos`는 보안 및 재현성 검증을 위해 `allowedRoots`에 명시된 파일들만 복사하여 독립 격리 스냅샷 디렉토리를 만든 뒤 독립 리뷰어를 구동함.
  - 그런데 `allowedRoots`에는 GSD 소유 정책상 `.planning`을 포함할 수 없도록 강제되어 있음.
  - 결과적으로 리뷰어가 격리 스냅샷 환경에서 오라클(`tests/aos_stage2_oracle.mjs`) 또는 테스트를 돌릴 때, 프로젝트의 정상 파일인 `.planning/ROADMAP.md`를 찾지 못하고 `ENOENT` 예외가 발생하여 모든 기능이 완벽히 구현되었음에도 `c5` 기준이 기각(`verdict: "fail"`)됨.
- **영향**:
  - 사용자는 오라클과 테스트 코드 내에 "스냅샷에 `.planning`이 없으면 읽기를 건너뛴다"는 비정상적인 회피(Workaround) 코드를 억지로 삽입해야 했음.
- **요구 조치**:
  - 리뷰어 격리 스냅샷 생성 시, 읽기 전용 참조가 필요한 `.planning` 메타데이터(예: `ROADMAP.md`, `STATE.md`)를 읽기 전용 미러링으로 제공하거나, `allowedRoots` 정책에서 GSD 상태 파일의 참조를 유연하게 허용해야 함.

---

### [BUG-04] `verifyGsdEvidence`의 이전 커밋 기반 락인(Lock-in) 결함 (HIGH / P1)
- **위치**: `src/core/task-gsd.js` (`verifyGsdEvidence`)
- **현상**:
  - 태스크가 리뷰어 오진 등으로 인해 1차 기각된 후, 계약 리비전을 올려 2차 실행할 때 `baseCommit`이 이미 직전 시도에서 생성된 `.planning/quick/<id>` 디렉토리를 포함하고 있는 경우 발생.
  - `verifyGsdEvidence`는 `baseCommit` 시점의 `ls-tree`와 현재를 비교하여 `fresh` 디렉토리가 1개 존재해야만 통과함:
    `if (fresh.length === 0) return missingEvidence("no new .planning/quick directory was created after the base commit");`
  - 컨트롤러가 이미 작성된 quick 태스크를 정상적으로 감지하고 재사용하더라도, `alpha-aos`는 "신규 생성된 디렉토리가 없다"는 이유로 영구 거부함.
- **영향**:
  - 사용자가 git 커밋을 되돌리거나 기존 quick 폴더를 강제 삭제하고 다시 커밋하여 `baseCommit`을 인위적으로 세탁해야만 다음 실행이 통과되는 심각한 사용성 결함 발생.
- **요구 조치**:
  - 동일한 contract ID / task claim에 대한 재실행인 경우, 기존의 유효한 quick 태스크 디렉토리와 커밋 증거를 인정하도록 `verifyGsdEvidence` 조건 완화.

---

### [BUG-05] Antigravity 서브에이전트 모델 무단 다운그레이드 및 강제 상속 결함 (CRITICAL / P0)
- **위치**: Antigravity 하네스 내부 서브에이전트 디스패처 (`invoke_subagent` 런처 및 `typeName: "self"`)
- **현상**:
  - 메인 세션이 주간 쿼터 보존을 위해 `gemini-3.8-flash-high`로 동작 중인 상태에서, 고추론 기획/아키텍처 설계를 위해 `invoke_subagent` 호출 시 `Model: "pro"` (Gemini 4 Argon 매핑)를 명시적으로 요청함.
  - 그러나 플랫폼 런처는 `typeName: "self"`에 대해 `"inherit": true` 규칙을 강제로 적용하여 호출 인자(`Model: "pro"`)를 묵살함.
  - 결과적으로 서브에이전트가 요청된 Argon이 아닌 부모의 Flash 계열인 **`gemini-3.8-flash-tiered`로 조용히 다운그레이드(Silent Downgrade)**되어 실행됨.
  - **실증 데이터베이스 증거**:
    - 서브에이전트 세션 DB(`conversations/c54b65c7-46a6-40ce-939f-cd8db7dca980.db`)의 `gen_metadata` 전수 조사 결과: 60단계 생성 턴 전체가 `gemini-3.8-flash-tiered`로만 실행됨.
    - Argon 호출 횟수: **0건 (0토큰 소모)**.
- **영향**:
  - 사용자가 설정하고 승인한 **"기획/설계 = Gemini 4 Argon, 코드구현/검증 = Gemini 3.8 Flash"의 2-Tier 오토파일럿 분리 원칙이 완전히 붕괴됨**.
  - 사용자는 고성능 모델(Argon)에 의해 심층 검토 및 아키텍처 수립이 완료된 것으로 신뢰하고 작업을 진행하였으나, 실제로는 경량 모델(Flash)로만 기획이 처리되어 의도했던 추론의 깊이와 설계 검증 품질이 누락됨.
  - 플랫폼이 다운그레이드 사실에 대해 사용자나 오케스트레이터에게 아무런 경고나 오류를 알리지 않아 심각한 인지 불일치(Cognitive Drift)를 초래함.
- **요구 조치**:
  - `invoke_subagent` 호출 시 `Model` 인자가 명시된 경우(`pro`, `flash` 등), `typeName: "self"`이더라도 부모 세션 상속을 오버라이드하고 요청된 모델 티어로 디스패치할 것.
  - 플랫폼 정책상 서브에이전트 모델 오버라이드가 불가능하다면, 무단으로 다운그레이드하여 침묵 실행하지 말고 즉시 `INCOMPATIBLE_SUBAGENT_MODEL` 오류를 반환하여 호출자가 다른 경로를 선택할 수 있도록 할 것.

---

## 3. 재발 방지를 위한 alpha-AOS 및 하네스 개선 요구사항

1. **`alpha-aos` 하네스 모델 파라미터화**:
   - `task.json` 계약에 선언된 모델 식별자를 하네스 프로세스 실행 플래그(`--model`)로 정확히 매핑하여 전달할 것.
2. **GSD 스냅샷 격리 계층 개선**:
   - 리뷰어 샌드박스 실행 시 `.planning` 디렉토리의 읽기 전용 바인드 마운트 또는 사본 주입을 허용할 것.
3. **오토파일럿 재시도(Retry/Resume) 복원력 강화**:
   - 증거 검증(`verifyGsdEvidence`) 시 이전 시도에서 이미 작성 완료된 GSD 증거물과의 정합성을 유연하게 판정할 것.
4. **서브에이전트 모델 티어 오버라이드 정합성 보장**:
   - `invoke_subagent`의 `Model` 매개변수가 실제 생성되는 하위 세션의 `model_enum`에 1:1로 정확히 반영되도록 보장하고, 묵시적 다운그레이드(Silent Fallback)를 엄격히 금지할 것.

---
**작성자**: Antigravity Pair Programmer & alpha-AOS Dogfooding Team  
**상태**: OPEN / ACTION REQUIRED  
  
