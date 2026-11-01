---
phase: 25-runtime-usage-and-recovery-controls
verified: 2026-10-30T10:19:14Z
status: passed
score: 8/8 must-haves verified
source_commit: 77cf6d156df66a023a4e5c93dcba82a3738dc367
observed_head: c8720da627c4f03ae05c0cd95cad6a01557f925a
covered_files: [
    ".planning/REQUIREMENTS.md",
    ".planning/ROADMAP.md",
    ".planning/phases/25-runtime-usage-and-recovery-controls/25-01-PLAN.md",
    ".planning/phases/25-runtime-usage-and-recovery-controls/25-01-SUMMARY.md",
    ".planning/phases/25-runtime-usage-and-recovery-controls/25-CONTEXT.md",
    ".planning/phases/25-runtime-usage-and-recovery-controls/25-FINAL-TESTS.json",
    ".planning/phases/25-runtime-usage-and-recovery-controls/25-RESEARCH.md",
    ".planning/phases/25-runtime-usage-and-recovery-controls/25-REVIEW-CLOSURE.md",
    ".planning/phases/25-runtime-usage-and-recovery-controls/25-REVIEW-DELTA.md",
    ".planning/phases/25-runtime-usage-and-recovery-controls/25-REVIEW-DISPOSITION.md",
    ".planning/phases/25-runtime-usage-and-recovery-controls/25-REVIEW-FINAL.md",
    ".planning/phases/25-runtime-usage-and-recovery-controls/25-REVIEW-FIXTURES.md",
    ".planning/phases/25-runtime-usage-and-recovery-controls/25-REVIEW-RUNNER.md",
    ".planning/phases/25-runtime-usage-and-recovery-controls/25-REVIEW.md",
    ".planning/phases/25-runtime-usage-and-recovery-controls/25-VALIDATION.md",
    ".planning/phases/25-runtime-usage-and-recovery-controls/full-acceptance.log",
    ".planning/phases/25-runtime-usage-and-recovery-controls/targeted-closure-accepted.log",
    "docs/task-runtime-controls.md",
    "schemas/command-job-launch.schema.json",
    "schemas/task-contract.schema.json",
    "schemas/task-receipt.schema.json",
    "scripts/run-tests.mjs",
    "src/adapters/task-agent-launch.ts",
    "src/adapters/task-agents.ts",
    "src/adapters/task-codex.ts",
    "src/cli.ts",
    "src/core/command-job-worker.ts",
    "src/core/command-jobs.ts",
    "src/core/process.ts",
    "src/core/task-contract.ts",
    "src/core/task-effects.ts",
    "src/core/task-final-review.ts",
    "src/core/task-gsd-discovery.ts",
    "src/core/task-gsd-gates.ts",
    "src/core/task-gsd-lifecycle.ts",
    "src/core/task-job-binding.ts",
    "src/core/task-journal.ts",
    "src/core/task-native-job.ts",
    "src/core/task-native-sessions.ts",
    "src/core/task-native-usage.ts",
    "src/core/task-read.ts",
    "src/core/task-review-basis.ts",
    "src/core/task-run.ts",
    "src/core/task-runtime.ts",
    "src/core/task-supervisor.ts",
    "src/core/task-telemetry.ts",
    "src/core/task-wait.ts",
    "src/format.ts",
    "test/command-job-worker.test.ts",
    "test/efficient-wait-cli.test.ts",
    "test/helpers/command-job-runtime.ts",
    "test/task-cli.test.ts",
    "test/task-connector-effects.test.ts",
    "test/task-cross-harness-models.test.ts",
    "test/task-final-review-adapters.test.ts",
    "test/task-final-review.test.ts",
    "test/task-gsd-discovery.test.ts",
    "test/task-gsd-lifecycle.test.ts",
    "test/task-gsd-multi-phase.test.ts",
    "test/task-limits.test.ts",
    "test/task-native-job.test.ts",
    "test/task-review-adversarial.test.ts",
    "test/task-runtime-controls.test.ts",
    "test/test-runner-isolation.test.ts"
  ]
covered_digest: "v3:sha256:e5da019fb5eb9f031799c533269c35a3ac139ba2cacc36666c92ef2e94e6729c"
behavior_unverified: 0
overrides_applied: 0
human_verification: []
decision_coverage:
  honored: 0
  total: 0
  not_honored: []
re_verification:
  previous_status: passed
  previous_score: 8/8
  gaps_closed: []
  gaps_remaining: []
  regressions: []
---

# Phase 25: Runtime Usage and Recovery Controls 검증 보고서

**Phase Goal:** Connect observed native usage, resource guards and durable process truth across supported generic/dedicated execution while preserving GSD verification and final independent acceptance.

**검증 시각:** 2026-10-30T10:19:14Z
**상태:** passed
**검증 유형:** 기존 보고서 재생성. 이전 `passed` 보고서는 fingerprint가 없어 소유자 조회가 `stale`을 반환했다. 이전 `gaps` 계약은 없으므로 ROADMAP 목표, PLAN 및 R1–R8의 구현과 행동 증거를 확인했다.

## 목표 달성

ROADMAP Phase 25에는 별도 Success Criteria 배열이 없다. CONTEXT/REQUIREMENTS의 RUNTIME-01..08을 8개 관찰 가능한 기준으로 사용했다. PLAN의 네 truth는 각각 R1/R3, R4, R4/R7, R6/R8에 병합했다. 승인·모델·예산 및 GSD 최종 수용 범위를 줄이지 않았다. `prohibitions`, `verification: backstop`, `<human-check>` 선언은 없다.

### Observable Truths

| # | 기준 | 상태 | 실제 코드 및 행동 증거 |
|---|---|---|---|
| 1 | RUNTIME-01 / R1: quota/crash 종료가 최종 controller bookkeeping 없이 관찰된다. | VERIFIED | `task-runtime.ts:75–110,239–283`의 durable 기록, callback/반환값 병합 및 실패 분류 → `task-read.ts:404–442` 상태 출력. `Codex retains all completed turns before a quota failure`, `ordinary native failure and argv rejection remain distinct from runtime completion`, `callback-only native reviewer failure survives a successful process return`가 최종 로그에서 각각 `ok 1525`, `ok 1528`, `ok 1529`다. |
| 2 | RUNTIME-02 / R2: 살아 있거나 종료가 미확인인 자식은 중복 dispatch를 막는다. | VERIFIED | `task-runtime.ts:101–141,200,247–280`은 native/protocol ID를 분리하고 positive owned close가 없는 interrupted 기록을 reconcile하지 않는다. `resumeTask`가 먼저 reconcile한다(`task-supervisor.ts:346`). 실제 Node 자식 생존, PID 부재, handle-only, 명시적 false 및 throw 반례가 후속 invoke 0회를 검증한다. 최종 `ok 1441`, `ok 1527`, `ok 1531–1533`; 실제 close 후 복구도 `ok 1532`다. |
| 3 | RUNTIME-03 / R3: 실패·최종 이벤트 부재·replay·resume·자식 사용량을 보존하고 한 번만 합산한다. | VERIFIED | `task-native-usage.ts` stdout chunk → `task-native-sessions.ts` exact thread/parent/cwd family → `task-telemetry.ts:176–245` observation dedup/watermark/descendant 제외 → `dispatchUsage` → checkpoint/status. 최종 `ok 1440`, `ok 1442`, `ok 1520`, `ok 1530`은 수동 기대값 270/170/77 tokens 및 replay 동일값을 assert한다. cache/reasoning은 중복 가산하지 않는다. |
| 4 | RUNTIME-04 / R4: 관측 합계 한도는 다음 dispatch를 차단하며 필수 미지원 meter는 launch를 거부한다. | VERIFIED | `meteredTaskDispatch:180–209`가 invoke 이전 readiness/lock/합계 한도를 확인한다. generic controller/reviewer(`task-run.ts:1453–1463`), native lifecycle(`task-gsd-lifecycle.ts:577`), 등록 job(`task-native-job.ts:77`), final review(`task-final-review.ts:451`)가 공통 경계를 사용한다. 등록 route는 승인 전 spawn 0회, quota 이후 총 1회(`ok 1438`). missing meter/common/final guard와 resume budget은 `ok 1519`, `ok 1521–1522`, `ok 1526`, `ok 1329`다. |
| 5 | RUNTIME-05 / R5: 유한 wait·프로세스 관찰·bookkeeping에 모델 호출이 필요 없다. | VERIFIED | command-jobs/worker 및 `task-wait.ts:1406` → `completion-wait.ts`의 파일 관찰/native timer를 사용하며 이 timer 경로에 agent dispatch는 없다. 실제 별도 CLI가 동일 job ID로 reconnect하고 terminal을 확인한다(`full-acceptance.log:10721,10745,10751`). status의 알림은 `durable-only`; 관측이 acceptance를 만들지 않는다. |
| 6 | RUNTIME-06 / R6: 동일 근거의 리뷰는 재사용하되 필수 독립 최종 수용은 유지한다. | VERIFIED | `task-review-basis.ts:7–20`은 contract/SHA/artifact/requirements/project/config/dependency bytes를 묶는다. `task-final-review.ts:406–430,589–635`는 port/accepted witness/validationVersion/정확한 requirement 집합을 요구한다. `orchestrateMultiPhaseProgression requires real GSD evidence and final independent acceptance`는 no-op 거부, port 부재, 실제 port 1회, 동일 근거 재사용 및 requirements 변경 시 2회를 assert한다(`ok 1328`). 누락/중복/unknown row 거부 `ok 1330`, 독립 snapshot/native family accounting `ok 1317`. |
| 7 | RUNTIME-07 / R7: Windows typed argv가 구분자·실행 파일·다국어 prompt·resume identity를 보존한다. | VERIFIED | `approvedCodexJobArgs`/`approvedLaunch`가 승인 role/model/effort 및 settled resume ID를 검증하고 worker가 executable/argv/cwd를 재대조한다. CLI → private spec/digest → worker → 등록 route 연결. 실제 Windows PowerShell shim delimiter 손실/Node typed argv 보존 `ok 1443`; 정확한 model/effort/resume/문자열 `ok 1439`. |
| 8 | RUNTIME-08 / R8: 공개 승인 resume가 partial commit과 dirty WIP를 보존하며 verify·Nyquist·최종 수용까지 진행한다. | VERIFIED | `task-run.ts:1495–1525`는 기록된 baseCommit/current HEAD와 effect audit가 맞을 때만 dirty recovery를 허용한다. `startMultiPhaseTask`가 finalReviewPort를 전달한다. lifecycle은 현재 GSD evidence/verify/Nyquist와 마지막 SHA/artifact의 final gate를 거친다. `task-gsd-multi-phase.test.ts:237–318`은 공개 `resumeTask`, partial SUMMARY, 기존 결정, dirty WIP 잔존, 2개 phase 및 final port 1회를 assert한다(`ok 1377`). 단순 exit 0은 수용을 만들지 못한다(`ok 1328`). |

**Score:** 8/8. 행동 미검증 truth 0개, override 0개. 각 상태 전이에 실제 통과한 명명 테스트가 있으며 symbol 존재만으로 VERIFIED를 판정하지 않았다.

### Required Artifacts

| Artifact | 기대 역할 | 상태 | 구현·연결 증거 |
|---|---|---|---|
| `test/task-runtime-controls.test.ts` | PLAN 필수 회귀 | VERIFIED | 15개 active test. 실제 프로세스/ledger/fence/unknown/합계 및 재호출 횟수 assert; 최종 `ok 1519–1533`. |
| `src/core/task-runtime.ts`, `src/core/task-telemetry.ts` | 공통 guard/기록/복구/집계 | VERIFIED | substantive 구현이 generic, 등록 native job, lifecycle 및 final reviewer에서 호출된다. |
| `src/core/task-native-job.ts`, `task-job-binding.ts`, `task-native-usage.ts`, `task-native-sessions.ts` | 승인 dedicated route와 stream/family usage | VERIFIED | typed binding/digest/model/effort/deadline 및 exact local family가 공통 runtime에 연결된다. |
| `src/core/command-jobs.ts`, `command-job-worker.ts`, `process.ts` | durable process/종료/wait | VERIFIED | binding을 spec digest에 포함, worker 재검증/실패 terminal 보존/실제 owned close 기록. |
| `src/core/task-run.ts`, `task-supervisor.ts`, `task-gsd-lifecycle.ts`, `task-gsd-discovery.ts`, `task-gsd-gates.ts` | generic accounting 및 GSD recovery | VERIFIED | 합계 checkpoint, 공개 resume, dirty audit, 현재 GSD evidence/verify/Nyquist 관찰. |
| `src/core/task-final-review.ts`, `task-review-basis.ts` | 독립 final gate/reuse | VERIFIED | port 부재/근거 변경/requirement 누락 거부, accepted witness만 재사용. |
| `schemas/command-job-launch.schema.json`, `task-contract.schema.json`, `task-receipt.schema.json` | binding/effort/receipt 계약 | VERIFIED | 구조화 launch/승인/receipt validation과 관련 contract/CLI 회귀에 연결된다. |
| `src/core/task-read.ts`, `src/format.ts`, `src/cli.ts` | 실제 관측 CLI 출력 | VERIFIED | task dispatch/status, selected-run launches/contract-wide calls·sessions로 연결. |
| `scripts/run-tests.mjs`, `test/test-runner-isolation.test.ts` | 전체 coverage 보존 | VERIFIED | 파일당 1회, Windows native suite 분리, packed gate 마지막 실행을 child runner로 검증(`ok 1648`). |
| `docs/task-runtime-controls.md` | 지원 범위와 한계 | VERIFIED | 등록 route/legacy migration/boundary/USD null/durable CLI/unconfirmed closure를 구현에 맞게 기술. |

설치 GSD `verify.artifacts`와 `verify.key-links`는 각각 exit 1, `total: 0`이었다. PLAN이 object 대신 문자열 shorthand를 써 자동 추출이 비어 있다. 이를 자동 통과로 간주하지 않았다. 위 artifact 및 아래 PLAN 연결은 직접 source/caller/테스트로 확인했다. 이 검사기 한계는 구현 부재의 증거가 아니다.

### Key Link Verification

| From | To | 경로 | 상태 | 증거 |
|---|---|---|---|---|
| Native telemetry | receipts/checkpoint/status | collector → observer → runtime → dispatchUsage → supervisor/read | WIRED | `task-supervisor.ts:527–531,626–628`, `task-read.ts:404–442`; R1/R3/R4 회귀. |
| Dedicated jobs | 공통 guard/durable 관측 | CLI → startApprovedTaskJob → private spec → worker → runApprovedTaskJobProcess → meteredTaskDispatch | WIRED | `cli.ts:2164–2172`, `command-job-worker.ts:307–308`, `task-native-job.ts:70–94`; R4/R7 회귀. |
| Generic/native lifecycle/final reviewer | 같은 guard | port wrapper/lifecycle/final gate → meteredTaskDispatch | WIRED | model/effort/deadline/observer 전달 및 unknown 이후 다음 호출 차단. |
| Public resume | 보존된 GSD와 final gate | approval → reconcile → checkpoint audit → remaining lifecycle → final review | WIRED | R2/R8 및 no-op/port 부재 회귀. runtime 기록을 GSD 수용 상태로 복사하지 않는다. |

### Data-Flow Trace (Level 4)

| 출력/상태 | 실제 source | 전달 경로 | 상태 |
|---|---|---|---|
| tokens/cost/calls/sessions | native JSON stdout 및 exact local session-family log | collector/family → durable dispatch → aggregate → checkpoint/status/format | FLOWING |
| failed/stopped/interrupted 및 handle | owned callback/result, job terminal, host/owner 관측 | worker/runtime read → readTaskStatus → CLI | FLOWING |
| accepted / remaining GSD work | SUMMARY/commit/STATE/VERIFICATION/VALIDATION 및 independent report | GSD discovery → lifecycle → current SHA/artifact final gate | FLOWING |

관측을 대체하는 static fallback/빈 출력은 발견하지 못했다. Codex `costUsd: null`과 미확인 coverage는 의도적인 unknown이며 0 또는 수용으로 치환되지 않는다.

### Behavioral Spot-Checks

이번 재생성에서는 승인된 중복 실행 금지에 따라 테스트를 재실행하지 않았다. verifier가 실제 코드/테스트 본문과 기존 실행의 named `ok`를 대조하고 로그 hash, 8개 TAP 그룹 합계 및 소스 동일성을 직접 다시 확인했다. SUMMARY의 pass 주장은 근거로 사용하지 않았다.

| 행동/검사 | 명령 또는 기존 실행 | 관측 결과 | 상태 |
|---|---|---|---|
| 최종 gate와 현재 source 동일성 | `git diff --quiet 77cf6d1 HEAD -- src test scripts schemas docs`; `git status --short` | exit 0; 검증 시작 시 clean. HEAD 추가 변경은 metadata다. | PASS |
| 완료 로그 무결성 | `Get-FileHash .../full-acceptance.log -Algorithm SHA256`; TAP 합계 재계산 | `80b30ca3bf7428f4d5930be5b7aaf39ba5d01be9b1eed2761bf64a146bbad721`; 8 groups, 1857 total, 1846 pass, 11 skip, 0 fail. JSON receipt와 동일. | PASS |
| R1–R8 행동 | 기존 `ALPHA_AOS_LIVE_CANARY=0 npm test -- --test-reporter=tap`의 위 named tests | 실제 ok 행, 기대값, 재호출 횟수, closure/WIP/review invariant 확인. 새 실행으로 주장하지 않는다. | PASS |
| 최종 R2/GSD closure | `targeted-closure-accepted.log` 및 `25-FINAL-TESTS.json` | targeted 30/30, final native handle `49739`, observed exit 0, `2026-10-30T07:24:50.192Z`. | PASS |
| 독립 closure의 source binding | runtime/test/docs `Get-FileHash` → `25-REVIEW-CLOSURE.md` | 전체 hashes 일치: `2431fbe1…`, `aff22ba5…`, `175ac04c…`. | PASS |

최종 full gate 이후 source/test/scripts/schemas/docs가 바뀌지 않았다. 기존 74개 prior-phase regression 참조도 orchestrator가 같은 최종 full gate 범위에 대조했다. 이번 verifier는 full/targeted suite를 중복 실행하지 않았다.

### Probe Execution

N/A. PLAN/SUMMARY의 별도 probe 선언 및 `scripts/*/tests/probe-*.sh`가 없다. test-runner/완료 영수증을 별도 probe 실행으로 표시하지 않았다.

### Requirements Coverage

| Requirement | Source Plan | 요구 행동 | 상태 | 증거 |
|---|---|---|---|---|
| RUNTIME-01 | 25-01 | quota/crash 관측 | SATISFIED | truth 1 및 failed terminal/retained usage. |
| RUNTIME-02 | 25-01 | surviving/unconfirmed child 중복 방지 | SATISFIED | truth 2 및 negative/positive owned closure. |
| RUNTIME-03 | 25-01 | failed/replayed/resumed/child usage 1회 합산 | SATISFIED | truth 3 및 독립 tokens 기대값. |
| RUNTIME-04 | 25-01 | 다음 dispatch/미지원 meter 차단 | SATISFIED | truth 4 및 invoke 횟수 assert. |
| RUNTIME-05 | 25-01 | 모델 없는 wait/bookkeeping | SATISFIED | truth 5 및 별도 CLI 동일 handle reconnect. |
| RUNTIME-06 | 25-01 | review reuse/독립 acceptance 유지 | SATISFIED | truth 6 및 witness/invalidation/no-op 거부. |
| RUNTIME-07 | 25-01 | Windows typed argv | SATISFIED | truth 7 및 실제 Windows shim/typed 실행. |
| RUNTIME-08 | 25-01 | 공개 resume/WIP/verify/Nyquist/final gate | SATISFIED | truth 8 및 공개 진입점/보존 assert. |

8개 PLAN ID와 REQUIREMENTS의 Phase 25 매핑은 일치한다. ORPHANED requirement는 없다. 이후 Phase 26 이상이 ROADMAP에 없어 deferred gap도 없다. traceability의 `In Progress`와 ROADMAP 미체크는 orchestrator의 정식 phase transition이 처리하며 verifier가 수정하지 않았다.

### Decision Coverage

설치 `check.decision-coverage-verify` 결과: `No trackable decisions in CONTEXT.md.` (`skipped: true`, `total: 0`, `honored: 0`, `blocking: false`). CONTEXT에 `<decisions>` 블록이 없다. 고정 범위 bullet은 R1–R8과 아래 한계에 반영했다.

### Test Quality Audit

| Test File | 연결 요구 | Active | Skipped | Circular | Assertion Level | 판정 |
|---|---|---:|---:|---|---|---|
| `task-runtime-controls.test.ts` | R1–R4 | 15 | 0 | 없음 | value/behavioral | 통과 |
| `task-native-job.test.ts` | R1–R4/R7 | 6 | 0 (Windows) | 없음 | value/behavioral | 통과 |
| `task-final-review.test.ts` | R4/R6/R8 | 10 | 0 | 없음 | behavioral/review 횟수/거부 | 통과 |
| `task-final-review-adapters.test.ts` | R3/R6 | 5 | 0 | 없음 | native/protocol 분리·snapshot·132 tokens | 통과 |
| `task-gsd-multi-phase.test.ts` | R8 | 1 | 0 | 없음 | 공개 resume/WIP/final port | 통과 |
| `efficient-wait-cli.test.ts` | R5/R7 | 9 | 0 | 없음 | 실제 CLI child/handle/terminal | 통과 |

요구사항을 단독 담당하는 disabled test는 없다. R7의 Windows 조건부 skip은 이 호스트에서 실행되어 `ok 1443`이다. 전체 11 skips는 paid/live opt-in, privileged symlink/reparse/permission, POSIX 전용 locator 등 이 8개 기준 밖의 호스트 조건이다. fixture 쓰기는 입력/barrier/adapter simulation 설정이며 SUT 출력으로 expected 값을 생성하지 않는다. R3는 독립 산술 기대값, R2는 실제 child/owned closure를 assert한다.

R8의 GSD 실행기와 final-review port는 credential-free fixture 대체 구현이다. production resume/lifecycle/gate의 계약과 호출·보존을 검증하며 실제 유료 provider 또는 설치된 외부 GSD 전체 workflow 실행을 증명한다고 주장하지 않는다. 별도의 실제 독립 reviewer 보고서들이 source gate/복구 연결을 검토했고 보존되어 있다.

### Anti-Patterns Found

| 범위 | 패턴 | 심각도 | 판정 |
|---|---|---|---|
| 변경 47개 implementation/test/schema/script/doc | unreferenced TBD/FIXME/XXX, TODO/HACK/placeholder | 없음 | 검색 결과 없음. |
| 테스트 child scripts | console.log | Info | argv/환경/terminal 출력을 실제 assert하는 fixture다. production stub이 아니다. |
| PLAN artifacts/key_links | 문자열 shorthand 자동 추출 0건 | Info | 도구 한계를 명시하고 실제 artifact/wiring으로 검증했다. |

반증 대상으로 callback failure 은폐, PID 부재의 가짜 closure, dirty resume/reuse의 GSD 우회를 점검했다. 각각 effective terminal 병합/실패 테스트, positive-owned-close 조건/handle-only 반례, 공개 resume/no-op/정확한 requirement 집합 테스트로 반증했다.

### Advisory (New Scope, Unevidenced)

없음. 이전 carried-forward gap이 없고 현재 source 회귀를 발견하지 못했다. 특정 undeclared-precondition/incidental-ordering/fixture-only에 의존하는 VERIFIED truth도 발견하지 못했다. fixture가 공급하는 protocol/port 입력은 production caller의 계약 입력이며 production 경로에도 같은 guard가 있다.

### 독립 검토와 gate 경계

원본 `25-REVIEW.md` critical 7/warning 1을 삭제하거나 새 full clean review로 대체하지 않았다. `25-REVIEW-DISPOSITION.md`의 CR-01..07/WR-01 처리 및 실제 focused delta/final/fixtures/runner/closure 보고서를 대조했다. 마지막 handle-only CR-01 closure는 현재 runtime/test/docs 전체 hash와 일치한다. focused reviewer가 테스트를 실행하거나 unchanged product 전체를 재검토했다고 주장하지 않는다. 그 뒤 `77cf6d1`의 최종 native receipt가 regression gate를 담당한다.

상위 orchestrator의 `verify:post`/`execute:post` 조회는 activeHooks가 비어 있고 `tdd_mode: false`였다. integer Phase 25에는 gap-closure-artifacts가 적용되지 않으며 regression-gate는 기존 최종 full gate로 확인했다. verifier는 phase/state/requirements 전이, 커밋 또는 다른 review 보고서 수정을 수행하지 않는다.

### Human Verification Required

없음 (`human_verification: []`). 승인 범위는 소스 수리와 credential-free 검증이며 R1–R8은 행동 테스트와 실제 Windows process/CLI 관측으로 확인된다. 유료 native canary, 원본 `D:/dev/oh-my-circuit` migration/restart, global installation, 3-OS remote CI는 명시적으로 제외되어 미완료 UAT로 추가하지 않았다. GUI/performance-feel 요구도 없다.

### Gaps Summary 및 지원 한계

승인된 8개 기준을 막는 gap은 없다. 지원 generic 경로와 등록 `codex-json-v1` dedicated leaf launch에 대해 목표가 달성됐다.

- 한도는 관측 합계에 근거한 다음 runtime dispatch의 경계 enforcement다. native 내부 호출/completion-only meter는 관측 전에 초과할 수 있어 provider hard cap/예약/zero overshoot를 보장하지 않는다.
- Codex USD는 `null`이며 필수 USD 한도는 launch 전에 거부한다. audit의 Standard credit 환산은 실측 비용이 아니다.
- 알림은 durable CLI 기록이다. 호스트 callback이나 자동 사용자 메시지를 보장하지 않는다.
- positive owned-process close 증거 없는 기록은 fenced 상태로 검사해야 한다. PID 부재/resume 시도로 closure를 만들거나 강제 해제하지 않는다.
- arbitrary `job start`/legacy PowerShell controller는 task controls를 자동 획득하지 않는다. leaf launch를 등록 route로 명시적으로 이전해야 한다.

설치 `gsd-tools.cjs query verification.fingerprint`가 47개 변경 파일 및 실제 근거에서 digest를 계산했다. helper가 PLAN/SUMMARY를 추가한 64개 `covered_files`와 `covered_digest`를 그대로 복사했다. 보고서 자신은 제외하고 planning-root projection은 helper 규칙을 따랐다.

---

_Verified: 2026-10-30T10:19:14Z_
_Verifier: gsd-verifier_
