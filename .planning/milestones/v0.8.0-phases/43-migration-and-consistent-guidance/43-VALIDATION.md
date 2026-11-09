---
phase: "43"
slug: "migration-and-consistent-guidance"
status: draft
nyquist_compliant: true
wave_0_complete: false
created: "2026-11-09"
---

# Phase 43 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js built-in `node:test` + `node:assert/strict` |
| **Config file** | `package.json` (`scripts.test: "node scripts/run-tests.mjs"`) |
| **Quick run command** | `node --test dist/test/tool-handoff.test.js dist/test/tool-handoff-loader.test.js` |
| **Full suite command** | `npm run build:check && node --test dist/test/migrate.test.js dist/test/tool-bindings-ssot.test.js dist/test/matrix-format.test.js dist/test/migrate-docs-consistency.test.js` |
| **Estimated runtime** | ~20 seconds |

---

## Sampling Rate

- **After every task commit:** Run task-specific `<automated>` verify command
- **After every plan wave:** Run `npm run build:check && node scripts/run-tests.mjs`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 25 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 43-01-01 | 01 | 1 | MIG-01 | T-43-01, T-43-02 | `.user-backup` 생성 및 허용된 하네스 루트 경계 검증, 원자적 불변 로그 커밋 | integration | `npm run build && node --test dist/test/migrate.test.js` | ❌ W0 | ⬜ pending |
| 43-01-02 | 01 | 1 | MIG-01 | T-43-03, T-43-04 | 모호한 소유권 발견 시 `--resolve-ownership` 강제 해결 및 마커 경계 선택적 보존 | unit/integration | `npm run build && node --test dist/test/migrate-ownership.test.js` | ❌ W0 | ⬜ pending |
| 43-02-01 | 02 | 2 | MIG-02 | T-43-05 | `resolveAcceptedToolRecord` 단일 진실 공급원 및 fail-closed 거부 | unit | `npm run build && node --test dist/test/tool-bindings-ssot.test.js` | ❌ W0 | ⬜ pending |
| 43-02-02 | 02 | 2 | MIG-02 | T-43-06 | `doctor`의 `[tool-records-alignment]` 진단 및 백업 위생 검사 | unit/integration | `npm run build && node --test dist/test/doctor-migration.test.js` | ❌ W0 | ⬜ pending |
| 43-03-01 | 03 | 3 | MIG-04 | T-43-07 | `formatComponentHarnessMatrix` 5개 상태 및 공유 설정 영향 렌더링 | unit | `npm run build && node --test dist/test/matrix-format.test.js` | ❌ W0 | ⬜ pending |
| 43-03-02 | 03 | 3 | MIG-03 | T-43-08 | CLI HELP 2-트랙 분리 및 상태 출력 안내 | unit | `npm run build && node --test dist/test/migrate-cli-guidance.test.js` | ❌ W0 | ⬜ pending |
| 43-04-01 | 04 | 4 | MIG-03 | T-43-09 | 영한 마이그레이션 가이드 및 README 2-트랙 갱신 | unit | `npm run build && node --test dist/test/migrate-docs-consistency.test.js` | ❌ W0 | ⬜ pending |
| 43-04-02 | 04 | 4 | MIG-03 | T-43-10 | 에이전트 관리 스킬 동기화 및 바이링궐 패리티 검증 | unit | `npm run build && node --test dist/test/migrate-docs-consistency.test.js` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/migrate.test.ts` — covers MIG-01 (레거시 탐색, `.user-backup`, 원자적 마이그레이션 기록)
- [ ] `test/migrate-ownership.test.ts` — covers MIG-01 (소유권 모호성 해결 및 마커 경계 선택적 보존)
- [ ] `test/tool-bindings-ssot.test.ts` — covers MIG-02 (단일 공통 리더 및 fail-closed 거부)
- [ ] `test/doctor-migration.test.ts` — covers MIG-02 (doctor SSOT 정합성 및 백업 위생)
- [ ] `test/matrix-format.test.ts` — covers MIG-04 (매트릭스 테이블 포매팅)
- [ ] `test/migrate-cli-guidance.test.ts` — covers MIG-03 (CLI 2-트랙 라우팅 및 도움말)
- [ ] `test/migrate-docs-consistency.test.ts` — covers MIG-03 (영한 문서 대칭성 및 스킬 동기화)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real harness file adoption preview | MIG-01 | 실제 워크스테이션 파일시스템 상의 Claude/Codex/Antigravity 설정 파일 구조 확인 | `npm run start -- migrate` 실행 후 콘솔 출력의 `.user-backup` 및 마커 경계 표시 육안 확인 |
| Korean / English documentation readability | MIG-03 | 영문/한글 마이그레이션 가이드 문맥 및 용어 자연스러움 확인 | `docs/guides/migration.md` 및 `migration.ko.md` 리뷰 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 25s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
