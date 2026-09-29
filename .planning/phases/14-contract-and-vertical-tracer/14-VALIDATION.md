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
| **Quick run command** | `npm run build && node scripts/run-tests.mjs --files dist/test/task-contract.test.js dist/test/task-verdict.test.js dist/test/task-cli.test.js` |
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

| Task ID (provisional) | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|-----------------------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 14-01-01 | 01 | 1 | CON-01, CON-03 | approval replay | 계약 canonical digest 변경이 이전 승인을 무효화 | unit | `npm run build && node scripts/run-tests.mjs --files dist/test/task-contract.test.js` | ❌ W0 | ⬜ pending |
| 14-01-02 | 01 | 1 | AUTO-01, AUTO-02, AUTO-03 | consent leakage | 미리보기는 읽기 전용, 별도 승인과 시작, 다음 작업 기본 off | CLI integration | `npm run build && node scripts/run-tests.mjs --files dist/test/task-cli.test.js` | ❌ W0 | ⬜ pending |
| 14-02-01 | 02 | 2 | RUN-01 | unsafe child process | 정확한 네이티브 실행 파일, 명시적 환경, 유계 출력과 별도 reviewer 세션 | integration | `npm run build && node scripts/run-tests.mjs --files dist/test/task-tracer.integration.js` | ❌ W0 | ⬜ pending |
| 14-03-01 | 03 | 3 | CON-02, REV-01 | stale evidence | 의미 있는 위임 결정의 이유, 기준별 pass/fail/unknown, exact artifact/review digest | unit | `npm run build && node scripts/run-tests.mjs --files dist/test/task-verdict.test.js` | ❌ W0 | ⬜ pending |
| 14-04-01 | 04 | 4 | RUN-01, REV-01 | false acceptance | 독립된 실제 성공·실패 실행과 stale review 주입이 수락 오판을 막음 | live integration | `npm run build && node scripts/run-tests.mjs --files dist/test/task-tracer.integration.js` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky. 작업 ID와 wave는 최종 PLAN.md에 맞춰 갱신한다.*

---

## Wave 0 Requirements

- [ ] `test/task-contract.test.ts` — canonicalization, 계약 변경, 이전 승인 거부.
- [ ] `test/task-verdict.test.ts` — 기준별 판정, stale review, unknown, 결정 이유.
- [ ] `test/task-cli.test.ts` — 읽기 전용 미리보기, 승인/시작 분리, 기본 off.
- [ ] `test/task-tracer.integration.ts`와 `test/fixtures/task-json-cli/` — 격리된 실제 성공·실패 경로. 지원되지 않는 호스트에서 skip은 **미증명**으로 보고하며 Phase 14 수락 근거가 될 수 없다.
- [ ] 새 테스트는 기존 `node:test`와 TypeScript 인프라를 재사용한다.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 설치된 exact-version Codex executor와 새 Claude reviewer 세션의 생산 경로 호출 | RUN-01, REV-01 | 인증·네이티브 실행 파일과 실제 모델 응답은 고립된 단위 fixture로 증명할 수 없음 | 선언된 환경 정책으로 성공·결함 tracer를 별도 실행하고 실행 파일/버전, contract/artifact digest, 검토 세션 ID와 기준별 결과를 기록한다. |

---

## Validation Sign-Off

- [ ] 모든 작업에 `<automated>` 검증 또는 Wave 0 의존성이 있다.
- [ ] 연속 세 작업 이상 자동 검증 없이 진행하지 않는다.
- [ ] Wave 0가 신규 테스트 파일을 만들고 실제 에이전트 tracer의 미증명 상태를 명시한다.
- [ ] watch mode 플래그를 사용하지 않는다.
- [ ] 검증 명령의 실제 소요 시간을 기록한다.
- [ ] 실제 성공·실패 tracer와 stale review 거부가 확인된 후 `nyquist_compliant: true`로 변경한다.

**Approval:** pending
