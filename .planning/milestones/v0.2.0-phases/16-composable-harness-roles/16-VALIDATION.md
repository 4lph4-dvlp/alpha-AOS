---
phase: "16"
slug: "composable-harness-roles"
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-02"
---

# Phase 16 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js built-in `node:test` + `node:assert/strict` |
| **Config file** | `package.json` (`test` script: `tsc -p tsconfig.json && node scripts/run-tests.mjs`) |
| **Quick run command** | `npm run build && node scripts/run-tests.mjs --files dist/test/task-agents.test.js dist/test/task-matrix.test.js dist/test/task-controller-lease.test.js` |
| **Full suite command** | `npm test && npm run check` |
| **Estimated runtime** | ~35 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run build && node scripts/run-tests.mjs --files dist/test/<target>.test.js`
- **After every plan wave:** Run `npm test && npm run check`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 35 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 16-01-01 | 01 | 2 | ROL-01 | T-16-01 | 125(5×5×5) 역할 매트릭스 모의 픽스처 전수 합성 및 결손 시 fail-closed 검증 | unit | `npm run build && node scripts/run-tests.mjs --files dist/test/task-matrix.test.js` | ❌ W0 | ⬜ pending |
| 16-01-02 | 01 | 2 | ROL-01 | T-16-01 | TaskAgents 레지스트리 포트 바인딩 및 누락 영수증 구체 원인 출력 | unit | `npm run build && node scripts/run-tests.mjs --files dist/test/task-agents.test.js dist/test/task-matrix.test.js` | ✅ | ⬜ pending |
| 16-02-01 | 02 | 1 | ROL-02 | T-16-01 | 실측 영수증 저장소(`~/.alpha-aos/receipts/harnesses/<h>-<r>.json`) 및 스키마 검증 | unit | `npm run build && node scripts/run-tests.mjs --files dist/test/task-receipts.test.js` | ❌ W0 | ⬜ pending |
| 16-02-02 | 02 | 1 | ROL-02 | T-16-01 | 바이너리 SHA-256 해시/버전 불일치 시 Version Drift 감지 및 unverified 강등 | unit | `npm run build && node scripts/run-tests.mjs --files dist/test/task-receipts.test.js` | ❌ W0 | ⬜ pending |
| 16-03-01 | 03 | 3 | ROL-03 | T-16-02 | 프로젝트 로컬 `.alpha-aos/controller.lock` 펜싱 임대 및 LOCKED_PROJECT_CONTROLLER 충돌 차단 | unit | `npm run build && node scripts/run-tests.mjs --files dist/test/task-controller-lease.test.js` | ❌ W0 | ⬜ pending |
| 16-03-02 | 03 | 3 | ROL-03 | T-16-02 | 좀비 락 자동 회수(`isProcessAlive`) 및 감사 로그(`controller-lease-audit.jsonl`) | unit | `npm run build && node scripts/run-tests.mjs --files dist/test/task-controller-lease.test.js` | ❌ W0 | ⬜ pending |
| 16-03-03 | 03 | 3 | ROL-03 | T-16-06 | D-10 Hermes 하드코딩 제거 및 하네스 중립 펜싱 컨트롤러 권한 검증 (`assertControllerRole`) | unit | `npm run build && node scripts/run-tests.mjs --files dist/test/worker-authority.test.js dist/test/task-controller-lease.test.js` | ✅ | ⬜ pending |
| 16-04-01 | 04 | 3 | ROL-04 | T-16-02 | 동일 하네스 리뷰어 격리 임시 설정 디렉토리 및 세션 UUID 발급 | unit | `npm run build && node scripts/run-tests.mjs --files dist/test/task-agents.test.js dist/test/task-tree-guard.test.js` | ❌ W0 | ⬜ pending |
| 16-04-02 | 04 | 3 | ROL-04 | T-16-02 | `differentReviewerPolicy` 계약 옵션 검증 및 위반 시 fail-closed 거부 | unit | `npm run build && node scripts/run-tests.mjs --files dist/test/task-contract.test.js dist/test/task-agents.test.js` | ✅ | ⬜ pending |
| 16-04-03 | 04 | 3 | ROL-04 | T-16-02 | 리뷰 후 파일 변조 감지 시 INVALID_MUTATING_REVIEW 즉시 무효화 (`TreeMutationGuard`) | unit | `npm run build && node scripts/run-tests.mjs --files dist/test/task-tree-guard.test.js` | ❌ W0 | ⬜ pending |
| 16-05-01 | 05 | 4 | ROL-05 | T-16-05 | 실측 필드만 `measured` 정규화 및 미제공 필드 `null`/`unknown` 보존 | unit | `npm run build && node scripts/run-tests.mjs --files dist/test/task-telemetry.test.js` | ❌ W0 | ⬜ pending |
| 16-05-02 | 05 | 4 | ROL-05 | T-16-05 | 비용/토큰 한도 설정 시 미계측 하네스 MISSING_TELEMETRY_METER fail-closed 사전 차단 | unit | `npm run build && node scripts/run-tests.mjs --files dist/test/task-telemetry.test.js dist/test/task-limits.test.js` | ❌ W0 | ⬜ pending |
| 16-05-03 | 05 | 4 | ROL-05 | — | CLI `alpha-aos task doctor` 및 `task status` 3차원 종합 리포트 표 렌더링 | unit | `npm run build && node scripts/run-tests.mjs --files dist/test/task-cli.test.js dist/test/task-telemetry.test.js` | ✅ | ⬜ pending |
| 16-06-01 | 06 | 5 | ROL-01, ROL-02 | T-16-01 | Antigravity, Pi, Hermes 네이티브 어댑터 런칭 및 실행 스펙 정제 | unit | `npm run build && node scripts/run-tests.mjs --files dist/test/task-harness-adapters.test.js` | ❌ W0 | ⬜ pending |
| 16-06-02 | 06 | 5 | SC6 | T-16-01 | Codex 컨트롤러 최소 권한 환경 및 결합 종료 상태 해석기, SC6 라이브 결함 트레이서 완주 | integration | `npm run build && node scripts/run-tests.mjs --files dist/test/task-tracer.integration.js` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/task-matrix.test.ts` — 125개 역할 조합 매트릭스 픽스처 및 결손 감지 테스트 스텁
- [ ] `test/task-receipts.test.ts` — 영수증 저장소, 스키마 검증 및 Version Drift 감지 테스트 스텁
- [ ] `test/task-controller-lease.test.ts` — 배타적 펜싱 락 및 좀비 락 회수 테스트 스텁
- [ ] `test/task-tree-guard.test.ts` — 리뷰어 세션 격리 및 TreeMutationGuard 테스트 스텁
- [ ] `test/task-telemetry.test.ts` — 실측 텔레메트리 파싱 및 MISSING_TELEMETRY_METER 테스트 스텁
- [ ] `test/task-harness-adapters.test.ts` — Antigravity, Pi, Hermes 어댑터 런칭 스펙 테스트 스텁

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Cross-OS process-tree termination on non-Windows hosts | ROL-02 | 로컬 워크스테이션은 Windows 11; macOS/Linux 네이티브 바이너리 실행은 GitHub Actions CI 환경에서 검증 | Verify CI matrix runs harness adapter tests across Windows, macOS, and Linux |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 35s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending 2026-10-02
