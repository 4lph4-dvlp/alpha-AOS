---
phase: "14"
slug: "contract-and-vertical-tracer"
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-09-29"
---

# Phase 14 — Validation Strategy

> 실행 중 각 작업의 증거를 수집하기 위한 초안. 아래 작업 ID는 계획 작성 후 실제 PLAN.md 작업 ID와 맞춘다.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | TypeScript 컴파일 후 Node 내장 `node:test` |
| **Config file** | `tsconfig.json`, `scripts/run-tests.mjs` |
| **Quick run command** | `npm run build && node scripts/run-tests.mjs --files dist/test/task-run.test.js dist/test/task-contract.test.js dist/test/task-check.test.js dist/test/task-verdict.test.js dist/test/task-agents.test.js dist/test/task-gsd.test.js dist/test/task-effects.test.js dist/test/task-cli.test.js` |
| **Full suite command** | `npm test && npm run check` |
| **Estimated runtime** | 신규 테스트를 작성한 뒤 측정; 실제 에이전트 tracer는 별도 실행 |

---

## Sampling Rate

- **After every task commit:** 해당 작업의 신규 테스트를 실행한다. Wave 0 테스트 파일 생성 전에는 기존 `npm run check`를 사용한다.
- **After every plan wave:** `npm test && npm run check`를 실행한다.
- **Before `$gsd-verify-work`:** 전체 suite와 실제 에이전트의 성공·실패 tracer를 모두 통과시킨다.
- **Max feedback latency:** 로컬 단위 테스트는 작업 직후; 실제 tracer 시간은 첫 실행에서 측정해 기록한다.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 14-01-01 (tracer) | 01 | 1 | CON-01, AUTO-01, AUTO-03, RUN-01, REV-01 | T-14-01..05 | 승인된 digest만 시작, 승인 1회 소비, 측정이 실행자 주장을 무시, stale review 거부 | unit + API e2e | `npm run build && node scripts/run-tests.mjs --files dist/test/task-run.test.js` | ❌ W0 (task가 생성) | ⬜ pending |
| 14-01-02 | 01 | 1 | CON-01, AUTO-01, REV-01 | T-14-06 | 읽기 전용 preview, exact-digest approve, D-13 report | CLI integration | `npm run build && node scripts/run-tests.mjs --files dist/test/task-cli.test.js dist/test/task-run.test.js` | ❌ W0 (task가 생성) | ⬜ pending |
| 14-02-01 | 02 | 2 | CON-03, AUTO-01 | T-14-09, T-14-10 | canonical digest, 변경 필드 표시, revision 재사용 거부 | unit | `npm run build && node scripts/run-tests.mjs --files dist/test/task-contract.test.js dist/test/task-run.test.js` | ❌ W0 (task가 생성) | ⬜ pending |
| 14-02-02 | 02 | 2 | AUTO-02, CON-01 | T-14-11..14 | 권한 경계, 비밀 값 거부, canonical root 바인딩, wall-time 경계 | unit | `npm run build && node scripts/run-tests.mjs --files dist/test/task-contract.test.js dist/test/task-run.test.js dist/test/task-cli.test.js` | ❌ W0 | ⬜ pending |
| 14-03-01 | 03 | 2 | REV-01, RUN-01 | T-14-19, T-14-21 | exact snapshot 측정, 명명된 unavailable, entry-only substitute (D-08) | unit | `npm run build && node scripts/run-tests.mjs --files dist/test/task-check.test.js dist/test/task-run.test.js` | ❌ W0 (task가 생성) | ⬜ pending |
| 14-03-02 | 03 | 2 | REV-01, CON-02 | T-14-16..18, T-14-20, T-14-22 | 기준별 pass/fail/unknown, 재현 확인 (D-14), stale-review/stale-artifact, 결정 기록 | unit + API e2e | `npm run build && node scripts/run-tests.mjs --files dist/test/task-verdict.test.js dist/test/task-check.test.js dist/test/task-run.test.js dist/test/task-cli.test.js` | ❌ W0 (task가 생성) | ⬜ pending |
| 14-04-01 | 04 | 2 | RUN-01 | T-14-23, T-14-24, T-14-27, T-14-28 | Codex 절대 실행 파일, 이름만 선언한 환경, workspace-write sandbox, claim은 증거 아님 | unit (offline) | `npm run build && node scripts/run-tests.mjs --files dist/test/task-agents.test.js dist/test/process.test.js` | ❌ W0 (task가 생성) | ⬜ pending |
| 14-04-02 | 04 | 2 | REV-01, RUN-01 | T-14-25, T-14-26, T-14-29 | 새 UUID 세션의 읽기 전용 Claude reviewer, bootstrap pair 외 조합 거부, 호스트 버전 probe | unit (offline) + host probe | `npm run build && node scripts/run-tests.mjs --files dist/test/task-agents.test.js dist/test/process.test.js` | ❌ W0 | ⬜ pending |
| 14-05-01 | 05 | 3 | RUN-01, CON-02 | T-14-33 | 설치된 GSD quick 경유 prompt, 읽기 전용 GSD evidence 검증 | unit | `npm run build && node scripts/run-tests.mjs --files dist/test/task-gsd.test.js` | ❌ W0 (task가 생성) | ⬜ pending |
| 14-05-02 | 05 | 3 | AUTO-02, RUN-01, CON-02 | T-14-31, T-14-32, T-14-35..37 | 새 권한은 blocked, 의존성 변경 시 read-only pack checkpoint (D-07), wall-time stopped | unit + API e2e | `npm run build && node scripts/run-tests.mjs --files dist/test/task-effects.test.js dist/test/task-gsd.test.js dist/test/task-run.test.js dist/test/task-verdict.test.js dist/test/task-check.test.js dist/test/task-cli.test.js dist/test/task-contract.test.js` | ❌ W0 (task가 생성) | ⬜ pending |
| 14-06-01 | 06 | 4 | AUTO-01, AUTO-03, CON-03, CON-01 | T-14-38..40 | task start만 supervisor 진입, 소비·타 계약 digest 거부, 일반 명령은 run 생성 안 함 | CLI integration | `npm run build && node scripts/run-tests.mjs --files dist/test/task-cli.test.js dist/test/task-run.test.js dist/test/task-effects.test.js` | ✅ (14-01에서 생성) | ✅ green (2026-09-30: task-cli·task-run·task-effects 포함 task 8개 suite 143 pass / 0 fail, 67 s; commits 240629a, a57f08c) |
| 14-06-02 | 06 | 4 | RUN-01, REV-01 | T-14-41..43 | 실제 Codex GSD quick + 새 Claude 세션이 같은 artifact digest에서 accepted | live integration | `npm run build && node scripts/run-tests.mjs --test-name-pattern="accept a correct" --files dist/test/task-tracer.integration.js` | ✅ (efbbf86) | ⛔ NOT PROVEN on this host — live invocation 1 (run `munx7h9w-b9ec114f`, 10m47s) `blocked`: Codex `workspace-write` sandbox가 `.git`을 읽기 전용으로 유지해 GSD quick commit 불가. 사용자 결정 D로 이월 (아래 "14-06 Live Tracer Evidence") |
| 14-06-03 | 06 | 4 | REV-01, RUN-01 | T-14-41, T-14-42 | 성공을 주장한 실제 결함 실행은 rejected, 실제 review의 변경 artifact 대입은 stale 거부 | live integration | `npm run build && node scripts/run-tests.mjs --test-name-pattern="rejected by measurement\|refused as stale" --files dist/test/task-tracer.integration.js` | ❌ 미작성 (Task 3 precondition 미충족) | ⛔ NOT PROVEN on this host — 14-06-02의 accepted run이 전제이므로 실행하지 않음, live turn 0회. 사용자 결정 D로 이월 |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky · ⛔ NOT PROVEN (필요한 실제 증거를 이 호스트에서 얻지 못함; 통과로 간주하지 않음). 각 task는 자신의 테스트 파일을 같은 task에서 먼저 작성한다(tdd). live tracer는 필요 조건이 없으면 `NOT PROVEN:`으로 실패하며 skip하지 않는다.*

---

## Wave 0 Requirements

- [ ] `test/task-run.test.ts`와 `test/helpers/task-fixture.ts` (14-01-01) — tracer 경로, 승인 소비, 측정 우선, stale review. fixture는 정적 디렉터리 대신 임시 디렉터리에 git 저장소와 GSD `.planning/` seed를 생성한다.
- [ ] `test/task-cli.test.ts` (14-01-02, 14-06-01) — 읽기 전용 미리보기, 승인/시작 분리, 기본 off, 일반 명령의 무개입.
- [ ] `test/task-contract.test.ts` (14-02) — canonicalization, 변경 필드, revision 재사용, 권한 경계, 비밀 값.
- [ ] `test/task-check.test.ts`, `test/task-verdict.test.ts` (14-03) — snapshot 측정, 기준별 판정, 재현 확인, stale review/artifact, unknown 다음 조치, 결정 기록.
- [ ] `test/task-agents.test.ts` (14-04) — 네이티브 어댑터의 인자·환경·파싱; 모델 turn을 쓰지 않는다.
- [ ] `test/task-gsd.test.ts`, `test/task-effects.test.ts` (14-05) — GSD quick evidence, 효과 감사, pack checkpoint, wall-time.
- [ ] `test/task-tracer.integration.ts` (14-06-02, 14-06-03) — 격리된 실제 성공·실패 경로와 실제 review의 stale 대입. 필요 조건이 없으면 `NOT PROVEN:`으로 실패하며 Phase 14 수락 근거가 될 수 없다.
- [ ] 새 테스트는 기존 `node:test`와 TypeScript 인프라를 재사용한다.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 설치된 exact-version Codex executor와 새 Claude reviewer 세션의 생산 경로 호출 | RUN-01, REV-01 | 인증·네이티브 실행 파일과 실제 모델 응답은 고립된 단위 fixture로 증명할 수 없음 | 선언된 환경 정책으로 성공·결함 tracer를 별도 실행하고 실행 파일/버전, contract/artifact digest, 검토 세션 ID와 기준별 결과를 기록한다. |

---

## 14-06 Live Tracer Evidence

> 2026-09-30, Windows 11 개발 호스트. 14-06-02와 14-06-03은 **NOT PROVEN**이며 통과로 표시하지 않는다. RUN-01, REV-01과 이 실제 실행에 의존하는 ROADMAP Phase 14 성공 기준 2-5는 이 호스트에서 증명되지 않았다.

### Live invocation 1/3 (14-06-02 accept test) — 유일한 실제 실행

| Field | Observed |
|-------|----------|
| Command | `npm run build && node scripts/run-tests.mjs --test-name-pattern="accept a correct" --files dist/test/task-tracer.integration.js` |
| Test result | `not ok 1` — `task start exited 1 with status blocked`; `# pass 0`, `# fail 1`, `# skipped 0`; test 646 s, 전체 약 10m47s |
| Run id | `munx7h9w-b9ec114f` |
| Contract digest | `c979926b9c1fb06d09ac9f1097deb276b24c8aa066597a3708195be71c828a2b` (inventory-summary, revision 1) |
| Base commit (fixture) | `a00416063c5cd3c1f1f386f7004421264cab030c` |
| Executor | codex `0.158.0` (npm global `@openai/codex/bin/codex.js`), session `01a0f1b5-34d5-7371-aae8-66c4f87502fb`, exit 0, processCode `ok`, terminal `completed` |
| Executor claim (not evidence) | `needs-authority`; authorityRequest `local-commit requiring write access to .git` ("Git could not create .git/index.lock because this run has read-only access to .git."); gsdQuickId `260930-q4s`; summary: CLI와 테스트 구현, 5 tests pass, sandbox가 `.git` 쓰기를 거부해 GSD가 완료 못 함 |
| Status / stop reason | `blocked` / `new-authority-required: local-commit requiring write access to .git` |
| Next action | Revise the contract as revision 2 with the needed authority, preview it, and approve it; this run is not accepted. |
| GSD evidence | `not-run` (quickId null, commits 없음; blocked 경로는 검증 전에 멈춤) |
| Reviewer / verdict / artifact | 실행 안 됨 / null / null (blocked는 측정과 review 전에 끝남) |
| Effects | implementation `bin/inventory-summary.mjs`, `test/inventory-summary.test.mjs`; planning `.planning/quick/260930-q4s-implement-dependency-free-node-esm-inven/260930-q4s-PLAN.md`; violation `.gsd/dispatch-isolation-sentinel.json` (workspace-write) — 2d8a014에서 GSD runtime state로 분류하도록 수정 |
| Decisions | 5개 기록, decision log `valid` (gsd-default, file-layout, implementation ×2, verification) |

### 원인과 재현 (모델 turn 없음)

1. **해결됨 (Rule 1):** GSD quick이 dispatch-isolation 조회마다 쓰는 `.gsd/dispatch-isolation-sentinel.json`이 effect audit에서 위반으로 분류됨. c93decf (RED) / 2d8a014 (GREEN)로 정확히 그 경로만 GSD 상태로 분류하고, 다른 `.gsd` 경로는 계속 위반.
2. **미해결 (보안 경계):** Codex `workspace-write` sandbox는 모든 플랫폼에서 프로젝트 `.git`과 해석된 gitdir을 설계상 읽기 전용으로 둔다 (Context7 `/openai/codex` 문서). Windows restricted-token backend는 읽기 전용 carveout 아래를 다시 쓰기 가능하게 여는 방법을 문서화하지 않는다. `codex sandbox`로 결정적으로 재현: `git add` → `.git/index.lock: Permission denied`; `-c sandbox_workspace_write.writable_roots=['<repo>/.git']`도 여전히 거부 (같은 설정은 TEMP 밖 경로에는 적용됨). 따라서 `--add-dir`/`writable_roots`로는 Windows에서 해결되지 않으며, 모든 해결책이 controller 보안 경계(T-14-23..28, T-14-41) 또는 RUN-01 증거 설계를 바꾼다.

### 결정과 이월

- 제시된 선택지: A (정확한 git add/commit prefix에 대한 exec-policy allow rule), B (supervisor가 controller 대신 commit — RUN-01/T-14-34 위반), C (commit 없는 bootstrap), D (NOT PROVEN 기록 후 이월).
- **사용자 결정: D.** sandbox 인자, exec policy, supervisor commit 동작, 14-05 GSD evidence 계약은 바꾸지 않는다. 추가 live 실행 없음 (accept 1/3 사용, defect/stale 0/2 사용).
- **이월 대상:** `.git` 쓰기 권한 문제는 Phase 16/17 (GSD-04 hook-receipt provenance 포함) 또는 sealed/container adapter에서 다룬다. 그때 14-06-02와 14-06-03을 같은 명령으로 다시 실행해 이 표를 갱신한다.
- **Research assumption A3 증명됨:** `codex exec`가 설치된 `$gsd-quick` (`~/.agents/skills/gsd-quick`)을 실제로 구동해 quick PLAN, decision log, 구현과 테스트를 만들었다 (invocation 1).

## Validation Sign-Off

- [ ] 모든 작업에 `<automated>` 검증 또는 Wave 0 의존성이 있다.
- [ ] 연속 세 작업 이상 자동 검증 없이 진행하지 않는다.
- [ ] Wave 0가 신규 테스트 파일을 만들고 실제 에이전트 tracer의 미증명 상태를 명시한다.
- [ ] watch mode 플래그를 사용하지 않는다.
- [ ] 검증 명령의 실제 소요 시간을 기록한다.
- [ ] 실제 성공·실패 tracer와 stale review 거부가 확인된 후 `nyquist_compliant: true`로 변경한다.

**Approval:** pending
