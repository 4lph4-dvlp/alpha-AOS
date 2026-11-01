

# Phase 21: Natural Entry and Operator CLI — 계획 검토 보고서 (수정본)

이 보고서는 **7개 PLAN.md가 themselves what they claim to build**를 전제로 합니다. 계획에 명시된 numbered task가新的 module/test/catalog entry/behavior를 명시하고 verification을 부여하는 한, 그 absence는 결함이 아닙니다. 이전 보고서에서 제기한 HIGH 등급 finding 중 Reservation run ID, `task-control.ts`, doctor operand 무시, 실패 JSON serializer는 **계획이 명시적으로 생성하는 작업이므로 철회합니다.** 아래는 진짜 결함만 남긴 것입니다.

---

## 21-01 — Native task skill and end-to-end entry tracer

**요약:** 다섯 하네스용 `alphaaos-task` 스킬과 natural-entry → read-only preview → exact-digest approve → 별도 start → 새 프로세스 status tracer를 정의합니다. "설치만으로 성공을 판단하지 않는다"는 점과 일반 GSD 기본값이 autopilot 동의가 아니라는 점이 잘设计되었습니다.

**강점:**
- **일반 GSD 비활성화 보장이 실제 경계와 일치.** `src/cli.ts:2176-2184`는 `startTask`를 `task start --apply` 브랜치만 calls 하고, `test/task-cli.test.ts:373` "ordinary gsd-context, status and project plan commands never create a task run"이 이를 검증합니다. 스킬이 이 경계를 침범하지 않는 구조입니다.
- **스킬 잠금 체인과 render/digest 검증이 이미 완성됨.** `src/core/owned-skills.ts:85-104`는 `lock.components.ownedSkills[id].sourceSha256`와 `targetSha256[target]`를 검증하므로, 21-01 Task 1의 "source/target 해시를 renderOwnedSkill 결과에서 산출"은 기존 인프라 위에 얹은 것입니다.
- **인접 edge probe(Adjacency/Empty/Ordering)设计가 우수.** `behavior` 필드에 세 probe를 named assertion으로 정의했고, "첫 작업의 autopilot 동의가 다음 작업에 이어지지 않게 한다"는 점은 AUTO-03와 정확히 일치합니다.

**우려事项:**
- **MEDIUM — `success_criteria`/`acceptance_criteria`가 fixture 관측 가능한 behavior와 live-harness behavior를 혼용합니다.** 21-01-PLAN.md `success_criteria`는 "다섯 대상 fixture와 각 실제 하네스의 발견·호출 영수증이 모두 통과한다"고 하고, `acceptance_criteria`는 "하나의 fixture가 자연어 선택 → ... → 새 CLI 프로세스 status의 각 관측값을 검증한다"고 합니다. autonomy-mode executor는 compiled fixture로 "자연어 선택"과 "실제 하네스 세션"을 관측할 수 없습니다. Task 2의 `<human-check>`가 이를 인지하고 있지만, **`success_criteria` 문구 자체는 autonomy 모드에서 충족 불가능하며**, 이는 downstream wave들의 SUMMARY gate를 오동작하게 합니다. (21-01-PLAN.md `success_criteria`, `acceptance_criteria`; ROADMAP.md:372)
- **LOW — codex와 pi가 같은 렌더 루트를 공유.** `src/core/owned-skills.ts:44-49`: codex → `~/.agents`, pi → `~/.agents`. 21-01 Task 2의 "다섯 대상의 실제 렌더 파일을 각자의 네이티브 발견 경로에 동기화"는 이 둘을 구분하지 않으면 모순이 됩니다. fixture가 `target` 파라미터로 구분하더라도 "네이티브 발견 경로"가 동일하므로, 21-01의 증거 템플릿에서 둘을 분리하는 기준이 필요합니다.
- **LOW — "설치-but-not-invoked" vs "미설치"의 구분이 21-NATIVE-INVOCATION-RECEIPTS.md 템플릿에 없음.** Task 2는 각 대상의 "정확한 하네스 버전, 발견 화면/출력, 스킬 활성화와 도구 호출 transcript, 읽기 전용 미리보기 응답, 시각, 실패 이유"를 기록하라고 했으나, 미설치 셀과 설치된-but-호출되지 않은 셀을 어떻게 표시할지가 unspecified입니다. 둘 다 `unverified`로 가는 것은 옳으나, Phase 22의 support matrix(ROADMAP.md:427)가 이 둘을 구분해야 하므로 템플릿이 먼저 정의되어야 합니다.

**제안:**
1. `success_criteria`를 "fixture 통과"와 "live receipt"로 분리하고,后者은 `human_needed` 조건임을 명시할 것.
2. codex/pi 쌍에 대해 fixture가 `destinationFor(target, ...)` 결과 경로를 각각 assert하되, "네이티브 발견 경로"는 `homedirRootFor` 결과로 정의할 것.
3. 21-NATIVE-INVOCATION-RECEIPTS.md에 `installed-not-invoked` vs `not-installed` 셀 스키마를 먼저 정의할 것.

**위험 수준: MEDIUM** — 완성 불가능한 success_criteria가 downstream SUMMARY gate를 오동작하게 하고, 증거 템플릿이 미정입니다.

---

## 21-02 — Full contract preview, changes, limits and blocked readiness

**요약:** 승인 전 미리보기가 목표·기준·허용 권한을 먼저 보여주고, 수정 시 전체 새 계약과 diff를 함께 보여주며, 역할/도구 증거가 없어도 전체 계약은 검토 가능하게 합니다.

**강점:**
- **구조가 이미 존재.** `src/format.ts:1099-1135` `formatTaskContractPreview`는 Goal, Allowed roots, Allowed effects, Mandatory criteria, Agents, Wall-time limit를 출력하고, `src/cli.ts:2195-2209` `showPreview`는 human/JSON로 `contract`, `digest`, `gitAuthority`, `reapprovalPreview`를 모두 출력합니다.
- **D-06의 diff는 이미 구현됨.** `src/core/task-contract.ts:819` `changedContractFields`가 변경 필드를 계산하고, `820-828`가 diff + 재승인 경로를 메시지에 포함합니다.
- **D-07의 fail-closed가 이미 typed error로 존재.** `src/core/task-contract.ts:901-948`: drift, not-approved, root-changed, git-directory-changed, cost-meter-unavailable 각각이 별도 error code로 거절됩니다.

**우려事项:**
- **MEDIUM — 21-02가 고치려는 "unsupported preview hidden" 결함은 계획이 정확히 지적했으나, 수정 범위가 preview뿐인지 approve/start까지일지가 명시되지 않았습니다.** 현재 `src/cli.ts:2217-2222`는 meter 실패 시 **예외를 던져 계약 표시 전에 종료**합니다. 21-02 Task 2는 "먼저 전체 계약을 렌더링하고 그 위에 차단 배너·구체적인 복구 조치를 둔다"고 했으나, `approve --apply`(`src/cli.ts:2226-2230`)와 `start --apply`(`src/cli.ts:2172-2175`)도 동일한 `checkCostMeterReadiness` 예외 경로를 가집니다. Task 2의 `behavior`는 "approve/start 모두 차단된다"고 하지만, **어떤 브랜치에서 계약을 표시할지와 어떤 브랜치에서만 거절할지가 분리되어 있지 않습니다.** Task 2의 `fails_when`은 "approve/start가 허용되거나"를 검사하므로 의도는 명확하나, 구현 범위가 preview 브랜치에만 한정될 위험이 있습니다.
- **LOW — D-05의 필드 순서가 prose로만 specified됨.** Task 1 `action`은 "목표·기준·허용 경로/효과를 먼저, 역할·도구·한도·계측을 나중에"但 `acceptance_criteria`는 "모든 계약 필드와 변경 필드의 human/JSON 일치"를 요구합니다. JSON envelope(`src/cli.ts:354` `serializeObservable`)는 human text와 필드 순서가 다를 수 있으므로, executor가 JSON key order도 함께 정의하지 않으면 일치 검사가模棱两可해집니다.
- **LOW — "설정되지 않은 제한"과 "측정 불가능" 구분이 unspecified.** `src/format.ts:1123`은 `maxWallTimeMinutes === null`만 처리하고 `maxCostUsd/maxTokens/maxCycles`는 미표시입니다. Task 1은 "설정되지 않은 제한과 측정 불가능 항목을 구분"하라고 했으나, 세 필드의 null/미설정/미계측 상태를 어떻게 표시할지는 executor의 discretion입니다. acceptance_criteria가 이를 검사하지 않으므로, 표시 계약이 없어 향후 21-05/21-06의 nullable measurement 요구와 불일치할 수 있습니다.

**제안:**
1. Task 2의 `action`에 preview/approve/start 세 브랜치의 분리 범위를 명시할 것(예: "preview는 전체 계약 + 배너, approve/start는 기존 fail-closed 예외를 유지").
2. JSON envelope의 key order를 human text와 동일하게 고정할 것.
3. `maxCostUsd/maxTokens/maxCycles`의 세 상태(null/미설정/미계측)를 형식 계약에 정의할 것.

**위험 수준: LOW-MEDIUM** — 수정 범위와 JSON 표시 계약이 미정입니다.

---

## 21-03 — Reserved run identity and durable control commands

**요약:** 승인 시점에 계약 다이제스트로부터 결정적 run ID를 예약하고, 실제 start가 동일 ID로 run record를 생성하며, 승인/시작 결과에 계약 ID·실행 ID·파일 경로·복사 가능한 status/stop/resume 명령을 포함시킵니다.

**강점:**
- **run ID 생성 패턴과 RUN_ID_PATTERN이 이미 존재.** `src/core/task-run.ts:1368`은 `options.runId ?? ...`로 run ID를 생성하고, `572` `RUN_ID_PATTERN = /^[0-9a-z]{8,}-[0-9a-f]{8}$/u`로 검증합니다. digest(64 hex chars)에서 `slice(0,8)+"-"+slice(8,16)`는 이 패턴을 만족하므로, "결정적 예약"은 기술적으로 가능합니다.
- **승인과 시작의 분리가 이미 강제됨.** `src/core/task-contract.ts:835-895` `approveTaskContract`는 run ID를 포함하지 않는 `TaskApprovalResult`만 반환하고, `src/cli.ts:2231-2234`는 `taskStartCommand`를 별도로 생성합니다.
- **"consumed approval" 거절이 이미 존재.** `src/core/task-run.ts:1297-1304`는 `approval-consumed` 오류로 이미 승인된 digest의 재시작을 거절합니다.
- **general/development 양쪽 시작이 `options.runId`를 공유함이 확인됨.** `src/core/task-run.ts:1029` `startGeneralTask`와 `1368` `startTask` 모두 `options.runId ?? <생성>` 패턴을 사용하므로, 21-03 Task 1의 "general/development 얣쪽 시작에서 동일 ID"는 가능합니다.

**우려事项:**
- **MEDIUM — 예약 run ID의 지속화 경로가 unspecified.** 21-03 Task 1은 run ID를 "승인 결과"에만 返回하고 "시작 전에는 TaskRunRecord가 없다"고 합니다. 하지만 21-05 Task 1의 `fails_when`에 "예약만 된 ID"가 fixture case로 포함되어 있습니다. 즉 21-05의 read model은 시작되지 않은 예약 ID를 조회할 수 있어야 합니다. 현재 `listTaskRuns`(`src/core/task-run.ts:533-553`)는 디스크의 run record 파일만 읽으므로, 예약 ID는 어디에도persist되지 않습니다. 두 해결책이 가능합니다(a) 예약 레코드를 별도 persist, b) read model이 approved digest로부터 ID를 recomputed) 하지만 **21-03은 neither를 지정하고 21-05는 그 결과를 fixture로 요구합니다.** (21-03-PLAN.md Task 1 action; 21-05-PLAN.md Task 1 `fails_when`; `src/core/task-run.ts:533-564`)
- **LOW — 21-03 Task 2의 "재개 전 확인할 상태"가 이미 구현된 API와 겹침.** `taskResumeCommand`(`src/cli.ts:541`)과 `inspectTaskResumeReadiness`(`src/cli.ts:2155`)가 이미 존재하므로, Task 2는 이 둘을 재사용하면 되고 새로운 command helper가 필요 없습니다. 계획이 "정확한 resume 명령을 보여준다"는 점은 이미 충족되므로, executor가 동일 API를 사용한다고 가정해도 무방합니다.

**제안:**
1. 21-03 Task 1에 "예약 run ID의 persist 방식"을 선택项으로 명시하고, 21-05 Task 1의 read model이 그 방식을 따라야 함을 연결할 것. (권장: digest로부터 recomputed — 새로운 저장소 없음)
2. 21-03 Task 2의 `done`가 이미 존재하는 `taskResumeCommand`/`inspectTaskResumeReadiness`를 재사용한다고 명시할 것.

**위험 수준: MEDIUM** — 21-03과 21-05 사이의 persist 계약이 안Undefined되어 21-05 fixture가 구현 불가능할 수 있습니다.

---

## 21-04 — Cross-process stop, confirmed termination and safe resume

**요약:** 별도 CLI 프로세스의 stop 요청을 활성 controller에 전달하고, 실제 자식/후손 종료가 관측된 후에만 `stopped` 상태를 기록하며, 재개는 GSD/Git/효과 일치 검사를 통과해야 합니다.

**강점:**
- **현재 stop이 계획이 지적한 결함을 정확히 가지고 있음.** `src/cli.ts:1943-1977`는 checkpoint를 즉시 `status: "stopped"`로 쓰고 `limit_exceeded` 이벤트를 기록하며 프로세스 종료를 관측하지 않습니다. 21-04는 이를 교체하려는 의도가 올바릅니다.
- **controller lease fencing이 이미 존재.** `src/core/controller-lease.ts:41-137`는 단일 프로젝트에 대한 배타적 controller lease를 관리합니다.
- **AbortSignal 기반 취소가 이미 존재.** `src/core/task-supervisor.ts:428-436`는 `signal?.aborted` 감지 시 `process_cancelled` 이벤트와 checkpoint status 변경을 수행합니다.
- **프로세스 트리 종료가 이미 구현됨.** `src/core/process.ts:399-445`는 bounded process runner와 descendant termination을 처리합니다.

**우려事项:**
- **MEDIUM — stop request/acknowledgment의 persisted schema가 unspecified.** `TaskCheckpoint`(`src/core/task-journal.ts:57-69`)는 `status`, `stopReason`, `updatedAt`만 가지며, stop-requested/pending/confirmed 같은 중간 상태를 표현할 수 있는 필드가 없습니다. 21-04 Task 2는 "run 종료 관측과 stop request acknowledgment를 별도로 보존한다"고만 하며, **어떤 필드/어떤 파일에保存할지는 executor의 discretion입니다.** Problem: 21-05 Task 1의 read model은 checkpoint facts를 join하므로, stop acknowledgment이 checkpoint 밖에 persist되면 read model이 이를 invisible하게 만듭니다. 21-04의 `interfaces` 블록("요청은 별도 상태이며 TaskRunRecord/TaskCheckpoint의 terminal 값은 실제 종료 관측으로만 갱신한다")은 "별도 상태"의 존재는 인정하지만 그 위치를 지정하지 않습니다. (21-04-PLAN.md Task 2 action, `interfaces`; `src/core/task-journal.ts:57-69`)
- **LOW — controller crash 후 stop 요청의 처리가 unspecified.** Task 1은 "요청/확인 전환은 재시작 후도 읽히고"라고 했으나, restart 후 resume이 이 pending stop 요청을 honor할지(즉, 재개 즉시 종료할지)는未指定입니다. resume이 게속되면 stop 요청이 무시될 수 있습니다. 21-04 Task 2의 resume gate는 GSD/Git/효과 일치만 검사하므로, pending stop 요청 검사가 추가로 필요합니다.
- **LOW — stop 선택 규칙이 21-05의 선택 규칙과 분리될 수 있음.** Task 1은 "--run이 없는 경우 선택 기준을 명시한다"고 했으나, D-11(`src/cli.ts:1882-1886` status/report)은 이미 startedAt/runId 최신 선택을 정의합니다. stop에 대해 독립적인 규칙을 정하면, "최신 run"을 두 번째로 정의하는 것처럼 보일 수 있습니다. stop은 D-11 범위 밖이므로 무방하나, 21-05와의 일관성을 위해 stop도 동일 정렬을 재사용할 것을 권장합니다.

**제안:**
1. 21-04 Task 2의 `interfaces`에 stop request/acknowledgment의 persisted shape(필드명, 파일 경로, 읽기 API)를 추가할 것.
2. resume 경로에 pending stop 요청 honor 조건을 추가할 것.
3. stop 선택 규칙을 `listTaskRuns`의 기존 정렬(`src/core/task-run.ts:548-552`)로 고정할 것.

**위험 수준: MEDIUM** — stop 상태의 persisted schema가 21-05의 read model과 연결되지 않아 불일치가 발생할 수 있습니다.

---

## 21-05 — Run-scoped status and shared evidence view

**요약:** status와 report가 같은 실행을 결정적으로 선택하고, 선택된 run ID/시각을 눈에 띄게 보여주며, status 첫 화면을 판정·이유·다음 조치 우선으로 구성합니다.

**강점:**
- **선택 로직이 이미 결정적.** `src/core/task-run.ts:548-552` `listTaskRuns`는 `startedAt` → `runId` tie-breaker로 정렬하고, `556-564` `readTaskReport`는 `--run` 생략 시 `runs.at(-1)`을 반환합니다. 21-05 Task 1의 "startedAt/runId 정렬" 요구는 이와 일치합니다.
- **checkpoint 기반 status가 이미 존재.** `src/cli.ts:1882-1940` `task status`는 `findLatestTaskCheckpoint`를 사용하고, ledger, journal events, GSD diagnostics, capability report를 결합합니다.
- **nullable measurement 처리가 이미 존재.** `src/core/task-journal.ts:50-55` `TaskCheckpointUsage`은 `tokens: number | null`, `costUsd: number | null`로 미계측을 null로 유지합니다.
- **"다른 시도 checkpoint를 섞지 않는다"는 보호가 존재.** `src/cli.ts:1901-1906`는 `approvals.find((a) => a.contractDigest === found.contractDigest)`로 매칭된 계약만 contractSnapshot으로 사용합니다.

**우려事项:**
- **MEDIUM — `failed` verdict에 대한 source type이 nowhere에 존재합니다.** `TaskRunStatus`(`src/core/task-run.ts:251`)는 `"executing" | "accepted" | "rejected" | "unknown" | "blocked" | "stopped"`만 가지며 **`failed`가 없습니다.** 하지만 21-05 Task 2 `behavior`는 "failed는 실패 기준/실행 오류"라고 정의하고, 21-06 Task 1 `behavior`도 "fail/unknown 필수 기준"을 구분합니다. 21-RESEARCH.md:126는 "Phase 21's user-facing failed verdict therefore needs an explicit evidence-backed mapping, not a string rename in one formatter"라고 경고하지만, **21-05는 `failed`를 type extension으로 할지, verdict rows로부터 derived로 할지 unspecified입니다.** executor가 "string rename" shortcut을 취하면 21-RESEARCH.md가 경고한 것과 같은 결함이 발생합니다. (21-05-PLAN.md Task 2 behavior; `src/core/task-run.ts:251`; 21-RESEARCH.md:126)
- **LOW — checkpoint provenance mismatch 시나리오가 계획의 가정과 다름.** Task 1은 "checkpoint가 선택 run 이후 다른 시도를 가리키면 ... unknown 근거를 표시"라고 하지만, 현재 `findLatestTaskCheckpoint`(`src/cli.ts:545-600`)는 contractId/digest로만 매칭하므로, **서로 다른 digest의 checkpoint가 선택된 run record와 결합될 수 있는 경로가 없습니다.** 계획의 read model이 digest equality를 강제하면 이 시나리오는 fixture로만 테스트 가능할 뿐 실제 발생은 드 rar합니다. 따라서 `fails_when`의 "서로 다른 digest checkpoint" fixture는 read model의 내부 불변을 검사하는 것일 뿐, 외부 공격 시나리오가 아닙니다. 무방하나, `fails_when` 문구를 "checkpoint provenance mismatch"로 다듬을 것을 권장합니다.
- **LOW — 21-03의 예약 run ID와의 연결이 미정.** 위 21-03 MEDIUM 참조. Task 1의 read model이 예약 ID를 조회할 persist 방식이 21-03에 unspecified이므로, "예약만 된 ID" fixture는 21-03의 선택에 달려 있습니다.

**제안:**
1. `failed` verdict의 source를 Task 2 `interfaces`에 명시할 것(예: "extend TaskRunStatus with 'failed', derived only from verdict rows with failed mandatory criteria or executor terminal error").
2. `fails_when`의 "서로 다른 digest checkpoint"를 "checkpoint provenance mismatch (internal invariant)"로 재정의할 것.

**위험 수준: MEDIUM** — `failed` verdict의 source가 unspecified이고, string-rename shortcut을誘발할 수 있습니다.

---

## 21-06 — Complete criterion and item-level reports

**요약:** report가 미해결 필수 기준과 다음 조치를 먼저 보여주고, 통과한 모든 기준의 검증 증거를 포함하며, 일반 작업의 항목별 결과와 개발 작업의 리뷰 근거를 각각 처리합니다.

**강점:**
- **기준별 verdict rows가 이미 존재.** `src/format.ts:1160-1177` `formatTaskRunReport`는 `run.verdict?.rows`를 criterionId/verdict/measured/review/artifact/reason으로 테이블 출력합니다.
- **미해결 기준과 다음 조치가 이미 보고됨.** `src/format.ts:1244-1248`는 verdict rows의 `nextAction`과 `run.nextAction`을 "Next action" 섹션으로 출력합니다.
- **일반 작업 보고가 이미 존재.** `src/format.ts:1738-1791` `formatGeneralTaskReport`는 summary, materials/files details, next actions를 출력합니다.
- **독립 리뷰 증거가 이미 포함.** `src/format.ts:1160-1165`는 각 row의 `review.verdict`와 `artifactDigest`를 출력합니다.

**우려事项:**
- **MEDIUM — "통과한 모든 기준"과 "미충족 기준"의 분리가 unspecified.** Task 1 `behavior`는 "fail/unknown 필수 기준과 각 nextAction이 report 앞에 온다. pass 기준은 ... measurement result, review verdict, evidence reference, artifact digest와 함께 나온다"고 했으나, **어떤 verdict을 "미해결"로 분류할지의 기준(예: verdict !== "pass"인 모든 mandatory criterion)이 명시되지 않았습니다.** `unknown` verdict를 미해결에 포함시킬지(포함하는 것이 D-15의 "확인 불가 필수 기준"과 일치) 여부가 unspecified입니다.
- **LOW — stale reviewer artifact에 대한 검증이 unspecified.** Task 1 `fails_when`은 "오래된 artifact 리뷰로 pass 처리되거나"를 검사하므로, executor는 verdict row의 `artifactDigest`를 현재 run artifact digest와 비교해 stale를 unknown으로 판단해야 합니다. 이는 21-05의 read model에 속하므로 21-06에서 명시적으로 구현해야 합니다.
- **LOW — 일반 작업의 "source receipt" 출력이 unspecified.** Task 2 `behavior`는 "일반 item의 ... 각각의 다음 조치·source receipt가 유지된다"고 했으나, `formatGeneralTaskReport`(`src/format.ts:1738-1791`)는 현재 source receipt(호출 영수증)를 출력하지 않습니다. Task 2는 Phase 20 구현을 "그대로 사용한다"고 했으나, 20-06 SUMMARY에 이 receipt가 포함되어 있는지 확인이 필요합니다. 포함되지 않았으면 Task 2의 `done`가 불가능합니다.

**제안:**
1. Task 1에 "미해결 = verdict가 pass가 아닌 모든 mandatory criterion (fail + unknown)"을 명시할 것.
2. Task 2에서 source receipt의 정의를 20-06 SUMMARY와 대조해 확인하고, lacking하면 Task 2 범위로 추가할 것.

**위험 수준: LOW-MEDIUM** — verdict 분류 기준과 일반 작업 receipt 출력이 미정입니다.

---

## 21-07 — Scoped doctor, structured failure JSON and integrated proof

**요약:** doctor를 환경 전체 sweep와 지정 작업 진단으로 분리하고, 실패 JSON을 구조화된 오류 응답으로 통일하며, 최종 회귀 검사와 다섯 하네스의 실제 네이티브 발견·호출 영수증을 검증합니다.

**강점:**
- ** doctor의 no-ID sweep가 이미 존재.** `src/cli.ts:1830-1850`는 `buildTaskDoctorReport`와 `diagnoseGsdLifecycleStatus`를 사용해 환경 sweep를 수행합니다.
- ** doctor가 --apply 없음을 이미 강제.** `src/cli.ts:1819-1821`은 `task doctor --apply`를 거절합니다.
- **top-level catch가 redaction seam을 이미 사용.** `src/cli.ts:2353-2359`는 `redactString(message, observableContext())`를 사용해 stderr를 처리합니다.
- **ID-scoped diagnosis의 design가 21-05 read model과 연결됨.** Task 1 `key_links`는 `src/core/task-doctor.ts` → `src/core/task-read.ts`로의 링크를 명시하고, 21-07 depends_on 21-06(21-05 기반)이므로 순서가 올바릅니다.

**우려事项:**
- **MEDIUM — 21-07의 최종 gate가 21-01의 live-receipt gap에 종속되어 phase 완료가 불가능할 수 있음.** Task 2 `<human-check>`은 `21-NATIVE-INVOCATION-RECEIPTS.md`의 다섯 셀을 검토하고 "공백은 human_needed/unverified로 보고하고 Phase 21 완료 승인을 보류한다"고 했습니다. 하지만 21-07 `depends_on: ["21-06"]`이고 21-06 → 21-05 → 21-04 → 21-03 → 21-02 → 21-01 순이므로, **21-01이 live receipt로 human_needed 상태이면 모든 downstream wave가 SUMMARY를 작성하지 못해 Phase 21 전체가 멈춘습니다.** 이는 21-01의 MEDIUM finding과 동일한 구조입니다. 계획들은 `status: halted`(summary.md:175)를 사용한 close-out 경로를 nowhere에 지정하지 않았습니다. (21-07-PLAN.md Task 2 `<human-check>`, `success_criteria`; ROADMAP.md:372)
- **LOW — "정상 plan/preview/approve/start/status/stop/resume/doctor/report도 같은 실제 상태를 가리킨다"는 통합 검증이 unspecified.** Task 2 `behavior`는 이를 요구하지만, 각 명령이 다른 출처(checkpoint vs run record vs journal)를 읽는 현재 구조에서 이 일관성을 검증하는 fixture가 어디에 있는지가 명시되지 않았습니다. Task 2의 `files_modified`는 `test/task-cli.test.ts`만 연장하므로, executor가 이 fixture를 어디에 추가할지가 unspecified입니다.
- **LOW — doctor의 ID-scoped diagnosis가 read-only인지 확인 필요.** Task 1 `behavior`는 "두 경우 모두 읽기 전용"이라 했으나, 21-05의 read model이 read-only인 것과 별개로, doctor가 계약/실행 ID 해석 중 예외를 던질 때 `process.exitCode`를 어떻게 설정할지가 unspecified입니다. `fails_when`은 "진단이 영속 상태를 수정하거나"를 검사하므로 read-only은 보장되나, exit code 계약은 미정입니다.

**제안:**
1. Phase 21 수준에서 `status: halted` close-out 경로를 21-01에 명시할 것(예: "live receipt가 human_needed이면 SUMMARY에 `status: halted` + human_needed rationale를 기록하고 Phase 22로 전달").
2. 통합 일관성 fixture의 위치를 `test/task-cli.test.ts` 내에 명시할 것.
3. doctor의 exit code 계약(0=ok, 2=blocked/unresolved)을 Task 1 `interfaces`에 추가할 것.

**위험 수준: MEDIUM** — 최종 gate가 live-receipt gap에 종속되어 phase 완료가 불가능하고, halt close-out 경로가 없습니다.

---

## 교차 계획 (Cross-Plan)

1. **MEDIUM — Phase 21 완료가 live harness receipt에 종속되어 autonomy 모드에서 불가능하며, halt close-out 경로가 nowhere에 있음.** 21-01 Task 2 `<human-check>`, 21-07 Task 2 `<human-check>`, REQUIREMENTS.md:71 (UX-01), ROADMAP.md:372. `depends_on` 체인(21-02→21-01, 21-07→21-06)이므로 human_needed 21-01은 phase 전체를 차단합니다. summary.md:175의 `status: halted`는 존재하지만哪个 계획도 이를 사용하지 않습니다.
2. **MEDIUM — `failed` verdict의 source type이 nowhere에 있음.** 21-05 Task 2, 21-06 Task 1; `src/core/task-run.ts:251`. type extension vs derived가 unspecified이고, 21-RESEARCH.md:126의 "string rename" 경고를誘발합니다.
3. **MEDIUM — 예약 run ID persist 계약이 21-03과 21-05 사이에 없음.** 21-03 Task 1 action vs 21-05 Task 1 `fails_when` "예약만 된 ID".
4. **MEDIUM — stop request/acknowledgment schema가 21-04와 21-05 사이에 없음.** 21-04 Task 2 action vs 21-05 read model checkpoint join.
5. **LOW — 21-01의 스킬 텍스트가 21-02의 preview field layout에 의존하지만, 21-02는 21-01에 depend.** 역종속 관계. 스킬이 command name만 reference하므로 낮은 위험이나, 21-02가 preview field를 추가하면 스킬 텍스트 갱신이 필요합니다.
6. **LOW — codex와 pi가 같은 렌더 루트를 공유.** `src/core/owned-skills.ts:44-49`. 21-01의 "다섯 대상의 네이티브 발견 경로"가 이 둘을 구분하지 못함.
7. **LOW — stop 선택 규칙이 21-05의 선택 규칙과 독립적으로 정의될 수 있음.** D-11은 status/report에만 적용되므로 stop는 별도 규칙이 가능하나, 두 "최신 run" 규칙이 공존할 수 있음.

**전체 위험 수준: MEDIUM** — 계획들은 과거 결함을 정확히 인지하고 수정할 방향이지만, 4개의 cross-task persist/type 계약이 unspecified이고, phase 완료 gate가 autonomy 모드에서 불가능한 live receipt에 종속되어 있습니다.
