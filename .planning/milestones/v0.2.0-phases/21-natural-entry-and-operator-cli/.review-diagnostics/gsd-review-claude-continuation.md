

# Phase 21: Natural Entry and Operator CLI — 계획 검토 보고서

7개 계획을 실제 소스 코드와 대조하여 검토했습니다. 각 계획은 `.planning/phases/21-natural-entry-and-operator-cli/21-NN-PLAN.md`에 위치하며, 아래에서 하나씩 분석합니다.

---

## 21-01 — Native task skill and end-to-end entry tracer

**요약:** 다섯 하네스에 배포될 저장소 소유 `alpha-aos-task` 스킬과 계약 미리보기 → 승인 → 시작 → 새 프로세스 상태 추적 경로를 정의합니다. 핵심은 "설치만으로 성공을 판단하지 않는다"는 점과, 일반 GSD 기본값·명시적 autopilot 경로 선택이 계약 승인 경계를 침범하지 않는다는 점입니다.

**강점:**
- **일반 GSD 비활성화 보장이 실제 코드와 일치.** `src/cli.ts:2176-2184`에서 `startTask`를 오직 `task start --apply` 브랜치만 calls 하며, `test/task-cli.test.ts:373` "ordinary gsd-context, status and project plan commands never create a task run" 테스트가 이를 검증합니다. 스킬이 이 경계를 해치지 않는 구조가 잘设计되었습니다.
- **스킬 잠금 체인이 기존 패턴과 동일.** `src/core/owned-skills.ts:85-104`가 `catalog.components.ownedSkills`에서 대상을 찾고, `lock.components.ownedSkills[id].sourceSha256`과 `targetSha256[target]`를 검증하므로, 21-01의 "source/target 해시를 renderOwnedSkill 결과에서 산출" 요구는 이미 구현된 인프라 위에 얹은 것입니다.
- **승인/시작 분리가 이미 존재.** `src/cli.ts:2213-2224`(preview) vs `2231-2234`(approve) vs `2162-2188`(start)가 별도 브랜치이며, `src/core/task-contract.ts:835-895`는 `approveTaskContract`가 시작을 시작하지 않습니다.

**우려事项:**
- **HIGH — `alphaaos-task`가 현재 catalog/lock에 존재하지 않음.** `catalog/stack.yaml:49-61`에는 `alphaaos-ship`, `alphaaos-control`만 있고, `catalog/stack.lock.json:112-129`에도 `alphaaos-task`가 없습니다. `plan: "01"`의 `files_modified`에 `catalog/stack.yaml`, `catalog/stack.lock.json`를 기재했지만, `planOwnedSkillSync`(`src/core/owned-skills.ts:88`)은 `lock.components.ownedSkills?.[id]`가 없으면 `throw new Error("Owned skill lock missing ${id}")`하므로, **계획 단계에서 이미 실패하는 구조**입니다. Wave 1이 끝나기 전에 lock 생성이 선행되어야 합니다.
- **MEDIUM — 스킬 렌더 대상이 5개 중 codex/pi가 같은 디렉터리.** `src/core/owned-skills.ts:44-49`: `codex` → `~/.agents`, `pi` → `~/.agents`로 동일합니다. 21-01의 "다섯 대상의 실제 렌더 파일을 각자의 네이티브 발견 경로에 동기화"라는 요구는 codex와 pi가 같은 `skills/` 디렉터리에서 같은 스킬을 공유하므로, "각 대상의 네이티브 발견 경로"를 구분하는 테스트가 어려울 수 있습니다. fixture에서 둘을 구분하는 방식을 사전에 정의해야 합니다.
- **LOW — `test/task-skill.test.ts`가 없음.** 21-VALIDATION.md Wave 0 Requirements에 `task-skill` ❌ W0로 표시되어 있고, 실제 `test/`에도 해당 파일이 없습니다. `plan: "01"`의 `files_modified`에는 포함되어 있지만, `verify`가 `dist/test/task-skill.test.js`를 references 하므로 빌드가 실패할 수 있습니다. Wave 0 완성 전까지는 이 테스트를 생성하거나 verify 명령에서 제외해야 합니다.
- **MEDIUM — "실제 네이티브 발견·호출 영수증"은 fixture로 증명 불가.** 21-01 Task 2의 human-check는 다섯 실제 하네스 세션에서의 증거를 요구합니다. 이는 Phase 21 완료 판정을 막는 gate이나, 21-01 PLAN.md는 이를 "Phase 21 성공으로 표시하지 않는다"는 조항만으로 처리하므로, **执行 에이전트가 자동으로 판정할 수 있는 기준이 부족**합니다. 21-07 Task 2에 연결되어야 할 것.

**제안:**
1. `catalog/stack.yaml`와 `stack.lock.json`에 `alphaaos-task`를 먼저 커밋하고, `planOwnedSkillSync`가 통과하는지 빌드 전에 검증할 것.
2. codex/pi가 같은 루트를 공유하므로, fixture는 `target` 파라미터로 구분하고 `destinationFor`의 결과 경로를 각각 assert할 것.
3. `test/task-skill.test.ts`를 Wave 0에 먼저 생성하거나, 21-01의 verify를 `task-skill.test.js` 없이 `task-cli.test.js` + `owned-skills.test.js`로 고정할 것.

**위험 수준: MEDIUM** — 핵심 인프라(catalog/lock)가 없어 Wave 1이 즉시 실패할 수 있고, 실제 하네스 증거는 human_needed로 남는다.

---

## 21-02 — Full contract preview, changes, limits and blocked readiness

**요약:** 계약 미리보기가 승인 전에 목표·기준·허용 권한을 먼저 보여주고, 수정 시 전체 새 계약과 diff를 함께 보여주며, 역할/도구 증거가 없어도 전체 계약은 검토 가능하게 합니다.

**강점:**
- **구조가 이미 존재.** `src/format.ts:1099-1135` `formatTaskContractPreview`는 Goal, Allowed roots, Allowed effect kinds, Mandatory criteria, Agents, Wall-time limit를 출력하며, `src/cli.ts:2195-2209` `showPreview`는 `contract`, `digest`, `gitAuthority`, `reapprovalPreview`를 human/JSON로 둘 다 출력합니다.
- **D-06의 diff는 `changedContractFields`로 이미 구현됨.** `src/core/task-contract.ts:819`는 `changedContractFields(prior.contract, digestableTaskContract(contract))`를 계산하고, `820-828`는 diff와 재승인 경로를 메시지에 포함합니다.
- **D-07의 fail-closed는 `assertTaskStartable`에 있음.** `src/core/task-contract.ts:901-948`는 digest 불일시 drift 거절, 미존재 approval 거절, root 변경 거절, git-directory 변경 거절, cost-meter unavailable 거절을 각각 typed error로 처리합니다.

**우려事项:**
- **MEDIUM — "차단된 계약도 온전히 검토할 수 있다"는 계획의 요구와 현재 코드가 다름.** 현재 `src/cli.ts:2217-2222`는 `checkCostMeterReadiness`가 실패하면 **예외를 던져 계약 표시 전에 종료**합니다. 21-02 Task 2는 "현재의 meter 예외가 계약 표시 전에 발생하는 경로를 바꾼다"고 명시했으므로, 이는 계획이 올바르게 지적한 결함입니다. 하지만 이 결함은 21-RESEARCH.md의 Common Pitfall 4("Unsupported preview hidden")와 일치하므로, 계획이 이를 수정하려는 의도는 타당합니다.
- **MEDIUM — D-05의 "권한·효과를 먼저, 역할·도구·한도는 뒤에" 순서가 현재 형식과 다름.** `src/format.ts:1122`는 Agents(역할)를 Criteria(기준)와 Wall-time limit 사이에, `1123`은 Wall-time limit를 뒤에 배치하므로, "허용 권한과 효과"보다 역할이 먼저 나타납니다. 21-02 Task 1은 이 순서 조정을 요구하므로, 구현 시 `formatTaskContractPreview`를 수정해야 합니다.
- **LOW — JSON과 human의 "변경 필드" 일치가 보장되지 않음.** 현재 `showPreview`(`src/cli.ts:2195-2209`)는 `reapprovalPreview`만 추가하고, changed-fields diff는 `driftError`(`src/core/task-contract.ts:801-828`)에만 있습니다. 승인 시점이 아닌 preview 시점에 diff를 human/JSON로 노출할지가 명확하지 않습니다.
- **LOW — "설정되지 않은 제한"과 "측정 불가능" 구분이 없음.** `src/format.ts:1123`은 `minutes === null ? "no overall limit"`만 처리하고, `maxCostUsd`, `maxTokens`, `maxCycles`는 미표시입니다. D-08의 "각 설정 한도, 한도를 두지 않은 항목, 실제 계측 가능 여부" 요구를 충족하려면 별도 필드가 필요합니다.

**제안:**
1. `checkCostMeterReadiness` 실패를 예외가 아닌 preview 내 배너로 변경하고, `blocked` 상태·사유 코드·다음 조치를 `formatTaskContractPreview`에 추가할 것.
2. `formatTaskContractPreview`의 출력 순서를 Goal → Criteria → Allowed effects → Agents → Limits → digest로 재정렬할 것.
3. `maxCostUsd/maxTokens/maxCycles` null/미설정/미계측 세 가지 상태를 모두 출력할 것.

**위험 수준: MEDIUM** — 현재 코드는 이미 "unsupported preview hidden" 결함을 가지고 있고, 계획이 이를 수정하려는 점은 옳으나 순서·표시 계약의 세부 사항이 미정입니다.

---

## 21-03 — Reserved run identity and durable control commands

**요약:** 승인 시점에 계약 다이제스트로부터 결정적 run ID를 예약하고, 실제 start가 동일 ID로 run record를 생성하며, 승인/시작 결과에 계약 ID·실행 ID·파일 경로·복사 가능한 status/stop/resume 명령을 포함시킵니다.

**강점:**
- **run ID 생성 패턴이 이미 존재.** `src/core/task-run.ts:1368`은 `options.runId ?? \`${started.getTime().toString(36).padStart(8, "0")}-${randomUUID()...}\`로 run ID를 생성하며, `RUN_ID_PATTERN`(`src/core/task-run.ts:572`)은 `/^[0-9a-z]{8,}-[0-9a-f]{8}$/u`로 검증합니다.
- **승인과 시작의 분리는 이미 강제됨.** `src/core/task-contract.ts:835-895` `approveTaskContract`는 `TaskApprovalResult`에 `contractDigest`, `recordPath`, `transactionId`만 반환하며 run ID는 포함하지 않습니다. `src/cli.ts:2231-2234`는 `taskStartCommand`를 별도로 생성합니다.
- **"consumed approval" 거절이 존재.** `src/core/task-run.ts:1297-1304`는 `approval-consumed` 오류로 이미 승인된 digest의 재시작을 거절합니다.

**우려事项:**
- **HIGH — `reservedRunId`가 anywhere에 존재하지 않음.** `src/core/task-contract.ts`의 `TaskApprovalResult` 타입(`src/core/task-contract.ts:223-226`)은 `status | recordPath | contractDigest | transactionId`만 가지며, run ID 필드가 없습니다. `src/cli.ts`의 `formatTaskApproval`(`src/format.ts:1138-1148`)도 계약 ID·경로·명령만 출력하고 **실행 ID를 없습니다**. 21-03 Task 1/2는 "승인 결과에 예약된 실행 ID"를 요구하므로, 현재 코드로는 이를 충족할 수 없습니다. 이는 계획이 정확히 지적한 gap입니다.
- **HIGH — digest 기반 결정적 ID 예약이 구현되지 않음.** 21-03 Task 1은 "정확한 SHA-256 digest에서 기존 RUN_ID_PATTERN을 만족하는 결정적 예약 runId를 만든다"고 요구하지만, 현재 `startTask`(`src/core/task-run.ts:1368`)는 `randomUUID()`를 사용해 무작위 ID를 생성합니다. 동일 digest의 재승인/재조회가 같은 ID를 반환하지 않아, D-10의 "같은 계약·실행을 다시 찾는다"는 요구가 충족되지 않습니다.
- **MEDIUM — "예약만으로 run record가 없음" 검증 불가.** 현재 `approveTaskContract`는 승인 레코드만 작성하고 run directory는 생성하지 않습니다(`src/core/task-contract.ts:889-894`). 하지만 `runDirectory`는 `contractDigest` 기준(`src/core/task-journal.ts:71-73`)이므로, **예약 runId를 digest에 매핑하는 저장소가 없어** "예약 상태"를 외부에서 조회할 수 없습니다.
- **LOW — `taskStopCommand`/`taskStatusCommand`가 CLI에 없음.** `src/cli.ts:473-481`에는 `taskStartCommand`, `taskResumeCommand`만 있고, `taskApproveCommand`는 `src/core/task-contract.ts:777`에 있습니다. stop/status의 복사 가능한 명령을 생성하는 헬퍼가 없으므로, D-10의 "바로 복사할 수 있는 status, stop, resume 명령" 요구 중 stop/status 부분이 공백입니다.

**제안:**
1. `TaskApprovalResult`에 `reservedRunId`를 추가하고, digest → runId 매핑을 결정적/hash 기반으로 생성할 것. `sha256(digest).slice(0,8)` 형태로 RUN_ID_PATTERN을 만족하도록.
2. `formatTaskApproval`과 시작 결과에 contractId, reservedRunId, contractPath, status/stop/resume 세 명령을 모두 포함시킬 것.
3. `taskStopCommand`/`taskStatusCommand` 헬퍼를 `src/cli.ts`에 추가하고, `--run` 인자로 정확한 실행을 지정하도록 할 것.

**위험 수준: HIGH** — D-10의 핵심인 "채팅 없이 같은 실행을 다시 찾는다"가 현재 코드로는 불가능하고, run ID 예약 메커니즘 전체가 없음.

---

## 21-04 — Cross-process stop, confirmed termination and safe resume

**요약:** 별도 CLI 프로세스의 stop 요청을 활성 controller에 전달하고, 실제 자식/후손 종료가 관측된 후에만 `stopped` 상태를 기록하며, 재개는 GSD/Git/효과 일치 검사를 통과해야 합니다.

**강점:**
- **현재 stop이 정확히 계획이 지적한 결함을 가지고 있음.** `src/cli.ts:1943-1977`는 checkpoint를 즉시 `status: "stopped"`로 쓰고 `limit_exceeded` 이벤트를 기록하며, 프로세스 종료를 관측하지 않습니다. 21-04는 이를 교체하려는 의도가 올바릅니다.
- **controller lease fencing이 이미 존재.** `src/core/controller-lease.ts:41-137`는 단일 프로젝트에 대한 배타적 controller lease를 관리하며, `test/task-controller-lease.test.ts:67` "second controller acquisition immediately fails fast"이 이를 검증합니다.
- **프로세스 트리 종료가 이미 구현됨.** `src/core/process.ts:399-445`는 bounded process runner와 descendant termination을 처리하며, `src/adapters/task-agents.ts:380-410`는 adapter cancel 경로를 제공합니다.
- **AbortSignal 기반 취소가 존재.** `src/core/task-supervisor.ts:428-436`는 `signal?.aborted` 감지 시 `process_cancelled` 이벤트와 checkpoint status를 `stopped`로 변경합니다.

**우려事项:**
- **HIGH — cross-process stop transport가 nowhere에 존재함.** `src/core/task-control.ts`는 **존재하지 않습니다.** `src/core/` 디렉터리 목록에 task-control.ts가 없고, `grep`로도 찾을 수 없습니다. 21-04 Task 1이 "stateRoot의 승인된 계약/run 경로에 원자적 0600 stop 요청을 남긴다"고 요구하지만, 이 저장소 구조는 단 한 줄도 구현되지 않았습니다.
- **HIGH — "요청 접수"와 "종료 확인"을 분리할 상태 필드가 없음.** `TaskCheckpoint`(`src/core/task-journal.ts:57-69`)는 `status`, `stopReason`, `updatedAt`만 가지며, stop-requested/pending/confirmed 같은 중간 상태를 표현할 수 없습니다. 21-04 Task 2의 "요청 접수 상태와 실제 종료 확인 상태를 구분"은 현재 스키마로는 불가능합니다.
- **MEDIUM — controller가 stop 요청을 폴링할 경로가 없음.** `src/core/task-supervisor.ts:251-295` `superviseTask`는 checkpoint와 journal만 읽고, 외부 stop 요청을 폴링하는 로직이 없습니다. `src/adapters/task-agents.ts`의 controller dispatch(`209-263`)도 abort signal 수신 경로를 제공하지 않습니다.
- **MEDIUM — "다른 run을 건드리지 않는다"는 fencing이 run-id 기준이 아님.** `src/core/controller-lease.ts`는 projectRoot 기준 lease이므로, 한 계약에 여러 run이 있을 때 run-id 기준 fencing이 되지 않습니다. 21-04의 "잘못된 run ID나 다른 lease의 요청은 현재 실행을 건드리지 않는다"는 요구는 현재 구조로는 보장되지 않습니다.
- **LOW — resume의 GSD/Git 일치 검사가 development 전용.** `src/core/task-supervisor.ts:321-326`는 `!isGeneral` 조건에서만 `verifyGsdStateConsistency`을 수행하므로, general(task) 카테고리의 resume은 GSD 일치 검사를跳过합니다. 21-04 Task 2의 "재개 전 GSD·Git 상태와 효과 조정"은 general 작업에도 적용되어야 할 수 있습니다.

**제안:**
1. `src/core/task-control.ts`를 생성하고, `writeStopRequest(stateRoot, runId, digest, leaseId)`와 `readStopRequest(stateRoot, runId)` API를 구현할 것. 원자적 0600 쓰기 + lease identity 검증.
2. `TaskCheckpoint`에 `stopRequest` 필드(요청 시각, 확인 시각, 상태)를 추가하고, supervisor loop가 이를 폴링해 bounded child에 AbortSignal을 전달할 것.
3. `src/cli.ts:1943-1977` stop 브랜치를 stop-request 작성으로 교체하고, `stopped`는 controller가 observed termination 이벤트를 작성한 후에만 설정할 것.

**위험 수준: HIGH** — cross-process stop transport 전체가 없고, 상태 모델이 request/acknowledgment/termination 세 가지를 구분할 수 없음.

---

## 21-05 — Run-scoped status and shared evidence view

**요약:** status와 report가 같은 실행을 결정적으로 선택하고, 선택된 run ID/시각을 눈에 띄게 보여주며, status 첫 화면을 판정·이유·다음 조치 우선으로 구성합니다.

**강점:**
- **선택 로직이 이미 결정적.** `src/core/task-run.ts:548-552` `listTaskRuns`는 `startedAt` → `runId` tie-breaker로 정렬하고, `556-564` `readTaskReport`는 `--run` 생략 시 `runs.at(-1)`을 반환합니다. 21-05 Task 1의 "startedAt/runId 정렬" 요구는 이와 일치합니다.
- **checkpoint 기반 status가 이미 존재.** `src/cli.ts:1882-1940` `task status`는 `findLatestTaskCheckpoint`를 사용하고, ledger, journal events, GSD diagnostics, capability report를 결합합니다.
- **nullable measurement 처리가 이미 존재.** `src/core/task-journal.ts:50-55` `TaskCheckpointUsage`은 `tokens: number | null`, `costUsd: number | null`로 미계측을 null로 유지합니다.
- **"다른 시도 checkpoint를 섞지 않는다"는 보호가 존재.** `src/cli.ts:1901-1906`는 `approvals.find((a) => a.contractDigest === found.contractDigest)`로 매칭된 계약만 contractSnapshot으로 사용합니다.

**우려事项:**
- **MEDIUM — status와 report가 서로 다른 선택 로직을 사용함.** `src/cli.ts:1886` `task status`는 `findLatestTaskCheckpoint`(`src/cli.ts:545-600`, checkpoint 기준)를 사용하는 반면, `1876` `task report`는 `readTaskReport`(`src/core/task-run.ts:556-564`, run record 기준)를 사용합니다. 21-05 Task 1의 "두 명령이 같은 선택 규칙을 사용"은 현재로는 불가능합니다. 이는 21-RESEARCH.md also identified ("Status reads a digest checkpoint while report reads per-run records").
- **MEDIUM — checkpoint가 run record와 다른 시도를 가리킬 때 "unknown 근거" 처리가 없음.** `src/cli.ts:1886-1887`는 checkpoint가 없으면 예외를 던지고, `1902`는 digest가 일치하는 approval만 선택하지만, checkpoint의 digest가 선택된 run record의 digest와 다를 경우를 처리하는 로직이 없습니다.
- **LOW — `findLatestTaskCheckpoint`의 runId 매칭이 digest로만 동작.** `src/cli.ts:581-589`는 `cp.contractDigest === runId`만 비교하고, events의 `payload.runId`로만 폴백하므로, runId가 checkpoint의 contractDigest와 다른 경우(예약 ID vs 실제 ID) 매칭이 실패합니다. 21-03의 run ID 예약과 연동하면 이 문제는 더 커집니다.
- **MEDIUM — status 첫 화면이 판정·이유·다음 조치가 아니라 상태 필드를 먼저 출력.** `src/format.ts:1372-1384` `formatTaskStatus`는 Task/Status/Cycle/Attempt/Wall time/Stop reason/Effect summary를 순서대로 출력하고, verdict·reason·nextAction은 없습니다. D-14의 "현재 판정, 구체적인 이유, 사용자의 다음 조치를 먼저"는 현재 형식으로는 충족되지 않습니다.

**제안:**
1. `src/core/task-read.ts`를 생성하고, status/report 모두가 동일한 `selectRun(stateRoot, contractId, runId)`를 사용하도록 할 것.
2. 선택된 run record의 digest와 checkpoint의 digest가 다를 경우 `unknown` 근거와 함께 표시할 것.
3. `formatTaskStatus`를 verdict → reasonCode → nextAction → progress → roles/usage 순서로 재정렬할 것.

**위험 수준: MEDIUM** — 두 명령이 다른 선택 로직을 쓰고, status 화면 구성이 D-14 요구와 다름.

---

## 21-06 — Complete criterion and item-level reports

**요약:** report가 미해결 필수 기준과 다음 조치를 먼저 보여주고, 통과한 모든 기준의 검증 증거를 포함하며, 일반 작업의 항목별 결과와 개발 작업의 리뷰 근거를 각각 처리합니다.

**강점:**
- **기준별 verdict rows가 이미 존재.** `src/format.ts:1160-1177` `formatTaskRunReport`는 `run.verdict?.rows`를 criterionId/verdict/measured/review/artifact/reason으로 테이블 출력합니다.
- **미해결 기준과 다음 조치가 이미 보고됨.** `src/format.ts:1244-1248`는 verdict rows의 `nextAction`과 `run.nextAction`을 "Next action" 섹션으로 출력합니다.
- **일반 작업 보고가 이미 존재.** `src/format.ts:1738-1791` `formatGeneralTaskReport`는 summary, materials/files details, next actions를 출력합니다.
- **독립 리뷰 증거가 이미 포함.** `src/format.ts:1160-1165`는 각 row의 `review.verdict`와 `artifactDigest`를 출력합니다.

**우려事项:**
- **MEDIUM — "통과한 모든 기준"와 "미충족 기준"의 분리가 없음.** `src/format.ts:1160-1177`은 verdict rows를 verdict 유형별로 분류하지 않고 하나의 테이블로 출력하므로, D-15의 "미충족·확인 불가 필수 기준과 다음 조치를 먼저, 통과 기준은 뒤에"는 현재 형식으로는 불가능합니다.
- **MEDIUM — development vs general 작업의 구분이 report 수준에서 없음.** `src/format.ts:1156-1158`은 `run.generalReport`가 있으면 `formatGeneralTaskReport`를, 없으면 기준 테이블을 출력합니다. 21-06 Task 2는 "일반 item의 성공/부분 실패/미확인과 각각의 다음 조치·source receipt"를 요구하지만, 현재 `formatGeneralTaskReport`는 source receipt(호출 영수증)를 출력하지 않습니다.
- **MEDIUM — 선택된 run ID와 startedAt이 report에 없음.** `src/format.ts:1169-1173`는 `Run: ${run.runId}`만 출력하고 `startedAt`은 없습니다. D-11의 "실제 선택한 실행의 ID와 시각을 눈에 띄게 보인다"는 요구는 startedAt이 빠져 있습니다.
- **LOW — stale reviewer artifact에 대한 검증이 없음.** `src/format.ts:1165`는 `row.artifactDigest.slice(0, 12)`만 출력하고, 현재 artifact digest와 비교하지 않습니다. 21-06 Task 1의 "서로 다른 artifact의 리뷰는 통과 근거가 아니다"는 검증이 없습니다.
- **LOW — human/JSON criterion 집합 일치가 보장되지 않음.** `print`(`src/cli.ts:347-363`)은 JSON로 `serializeObservable`를, human로 `redactDocument`를 사용하므로, 필드 구성이 다를 수 있습니다.

**제안:**
1. `formatTaskRunReport`를 unresolved(pass/fail/unknown) → next actions → passed criteria(with evidence) → items/usage 순서로 재구성할 것.
2. `formatGeneralTaskReport`에 선택된 run ID, startedAt, capability receipt, 선택 도구 목록을 추가할 것.
3. verdict rows의 artifactDigest를 현재 run artifact digest와 비교해 stale 리뷰를 unknown으로 판단할 것.

**위험 수준: MEDIUM** — report의 구성 순서와 일반 작업의 증거 깊이가 D-15 요구에 미치지 못함.

---

## 21-07 — Scoped doctor, structured failure JSON and integrated proof

**요약:** doctor를 환경 전체 sweep와 지정 작업 진단으로 분리하고, 실패 JSON을 구조화된 오류 응답으로 통일하며, 최종 회귀 검사와 다섯 하네스의 실제 네이티브 발견·호출 영수증을 검증합니다.

**강점:**
- ** doctor의 no-ID sweep가 이미 존재.** `src/cli.ts:1830-1850`는 `buildTaskDoctorReport`와 `diagnoseGsdLifecycleStatus`를 사용해 환경 sweep를 수행합니다.
- ** doctor가 --apply 없음을 이미 강제.** `src/cli.ts:1819-1821`은 `task doctor --apply`를 거절합니다.
- **JSON 실패 경로가 이미 일부 존재.** `src/cli.ts:2075-2077`, `2158`, `2191`은 `process.exitCode = 2`를 설정하고, `2094-2097`, `2165-2169`는 typed error를 던집니다.
- **top-level catch가 redaction seam을 이미 사용.** `src/cli.ts:2353-2359`는 `redactString(message, observableContext())`를 사용해 stderr를 처리합니다.

**우려事项:**
- **HIGH — top-level catch가 여전히 JSON이 아닌 plain stderr만 출력.** `src/cli.ts:2353-2359`는 `process.stderr.write(\`alpha-os: ${redactString(message, ...)}\`)`만 수행하고, `--json` 플래그를 무시합니다. 21-07 Task 2는 "main catch와 명시적 blocked 반환 경로가 공통 observable serializer를 사용하도록 만든다"고 요구하므로, 이는 계획이 정확히 지적한 결함입니다. 현재 상태로는 `--json` 실패가 JSON envelope 없이 나갑니다.
- **HIGH — doctor가 여전히 ID를 무시.** `src/cli.ts:1827` `const operand = parts[0]`을 추출하지만, `1830-1850` doctor 브랜치는 **operand를 완전히 무시**하고 항상 전체 sweep를 수행합니다. 21-07 Task 1의 "契约 ID는 해당 계약의 차단 원인, run ID는 그 정확한 run의 차단 원인"은 현재로는 구현되지 않았습니다.
- **MEDIUM — doctor의 ID-scoped diagnosis가 없음.** `src/core/task-doctor.ts:25-83`은 전체 role/GSD 진단만 제공하고, 계약 또는 run ID로 필터링하는 API가 없습니다. `src/core/task-read.ts`도 존재하지 않습니다.
- **MEDIUM — "ID 없는 doctor가 작업을 암묵적으로 선택하지 않는다"는 검증이 없음.** 현재 doctor는 작업 선택 자체를 하지 않으므로 이 요구는 자연스럽게 충족되지만, 21-07의 "형식 오류/없는 ID/ 계약에 속하지 않은 run ID가 최근 작업으로 대체되지 않는지" 테스트가 필요합니다.
- **LOW — "정상 plan/preview/approve/start/status/stop/resume/doctor/report도 같은 실제 상태를 가리킨다"는 통합 검증이 없음.** 현재까지 각 명령은 다른 출처(checkpoint vs run record vs journal)를 읽으므로, 이 일관성을 검증하는 fixture가 없습니다.
- **MEDIUM — 21-01의 다섯 하네스 실제 증거 gate가 21-07에 연결되어 있지 않음.** 21-07 Task 2는 `21-NATIVE-INVOCATION-RECEIPTS.md`를 references 하지만, 해당 파일은 현재 존재하지 않고 `21-01` PLAN.md에만 있습니다. 21-07의 verify가 이增거를 gate로 사용하므로, 21-01이 먼저 완성되어야 합니다.

**제안:**
1. `src/cli.ts:2353-2359`를 `--json` 플래그를 인식하는 구조화된 오류 serializer로 교체하고, `status`, `reasonCode`, `contractId?`, `runId?`, `nextAction`을 포함할 것.
2. doctor 브랜치를 `operand`가 주어지면 `src/core/task-doctor.ts`에 ID-scoped diagnosis를, 없으면 기존 sweep를 수행하도록 분기할 것.
3. 최종 gate에서 `npm run check && npm test && npm run build:check`와 함께, 모든 CLI 명령이 같은 선택된 run을 가리키는 fixture를 추가할 것.

**위험 수준: HIGH** — 실패 JSON가 `--json`와 함께 동작하지 않고, doctor가 여전히 작업 operand를 무시하며, 최종 통합 검증이 없습니다.

---

## 전체 위험 평가

**전체 위험 수준: HIGH**

**근거:**

1. **7개 계획 모두가 구현되지 않은 새로운 모듈을 요구하지만, 기존 코드는 이미 상당한 부분을 보유.** `src/cli.ts`, `src/core/task-contract.ts`, `src/core/task-run.ts`, `src/core/task-journal.ts`, `src/core/task-supervisor.ts`, `src/core/owned-skills.ts`, `src/core/controller-lease.ts`는 계획에서 요구하는 기능의 약 60-70%를 이미 구현하고 있습니다. 따라서 이 계획들은 "통합"보다는 "보완"에 가깝습니다.

2. **HIGH 등급의 빈 gap가 4건.** `reservedRunId` 예약(21-03), cross-process stop transport(21-04), `task-control.ts` 모듈(21-04), doctor ID-scoped diagnosis(21-07), 실패 JSON serializer(21-07)은 모두 현재 코드에 완전히 없고, 계획도 이를 명시적으로 인지하고 있습니다. Wave 3~4가 가장 높은 위험을 가집니다.

3. **Wave 1의 사전 조건이 충족되지 않았음.** `alphaaos-task`가 `catalog/stack.yaml`와 `catalog/stack.lock.json`에 없고, `test/task-skill.test.ts`가 없으므로, 21-01의 verify가 즉시 실패합니다. 21-02 이후 계획들은 21-01의 SUMMARY를 depends_on으로 가집니다.

4. **실제 하네스 증거 gate가 Phase 21 완료를 방해할 가능성이 높음.** 21-01 Task 2와 21-07 Task 2는 다섯 실제 하네스의 네이티브 발견·호출 영수증을 요구하며, "인증이나 설치 부재로 호출할 수 없는 대상도 human_needed/unverified로 유지"합니다. 이는 fixture 통과와 별개로, Phase 21을 human_needed 상태로 남길 수 있습니다.

5. **구조적 일관성 문제.** checkpoint(digest-keyed)와 run record(runId-keyed)의 이중 저장 구조가 21-05에서 "한 read model"로의 통합을 요구하지만, 현재 두 출처는 다른 선택 로직을 사용합니다. 21-03의 run ID 예약이 없이는 이 통합이 불가능합니다.

**다음 단계 권장:**
- Wave 1(21-01)을 먼저执行하고, `catalog/stack.yaml` + `stack.lock.json`에 `alphaaos-task`를 추가한 뒤 `planOwnedSkillSync`가 통과하는지 확인할 것.
- 21-03과 21-04는 하나의 `task-control.ts` + `task-read.ts` 모듈로 병합하여 구현하는 것을 권장합니다. run ID 예약 → stop transport → read model이 같은 state root 경계를 공유하면 중복이 줄어듭니다.
- 21-07의 실패 JSON serializer는 21-02 Task 2의 "차단된 계약도 검토 가능"와 공통 boundary를 공유하므로, 먼저 구현하는 것이 좋습니다.

---

*이 검토는 `.planning/phases/21-natural-entry-and-operator-cli/`의 7개 PLAN.md 파일과, `src/cli.ts`, `src/format.ts`, `src/core/task-contract.ts`, `src/core/task-run.ts`, `src/core/task-journal.ts`, `src/core/task-supervisor.ts`, `src/core/owned-skills.ts`, `src/core/controller-lease.ts`, `src/adapters/task-agents.ts`, `catalog/stack.yaml`, `catalog/stack.lock.json`의 실제 코드를 대조하여 작성되었습니다.*
