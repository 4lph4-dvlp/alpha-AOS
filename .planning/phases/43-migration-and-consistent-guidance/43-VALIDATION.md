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
| **Full suite command** | `npm run build:check && node --test dist/test/migrate.test.js dist/test/tool-bindings.test.js` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `node --test dist/test/tool-handoff.test.js dist/test/tool-handoff-loader.test.js` (or relevant plan test)
- **After every plan wave:** Run `npm run build:check && node scripts/run-tests.mjs`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 20 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 43-01-01 | 01 | 1 | MIG-01 | T-43-01 | `.user-backup` 생성 및 허용된 하네스 루트 경계 검증 | integration | `node --test dist/test/migrate.test.js` | ❌ W0 | ⬜ pending |
| 43-01-02 | 01 | 1 | MIG-01 | T-43-03 | 모호한 소유권 발견 시 `--resolve-ownership` 강제 거부 | unit/integration | `node --test dist/test/migrate-ownership.test.js` | ❌ W0 | ⬜ pending |
| 43-02-01 | 02 | 1 | MIG-02 | T-43-02 | `resolveAcceptedToolRecord` 단일 진실 공급원 및 fail-closed 거부 | unit | `node --test dist/test/tool-bindings-ssot.test.js` | ❌ W0 | ⬜ pending |
| 43-02-02 | 02 | 1 | MIG-02 | — | `doctor`의 `[tool-records-alignment]` 진단 및 백업 위생 | unit/integration | `node --test dist/test/doctor-migration.test.js` | ❌ W0 | ⬜ pending |
| 43-03-01 | 03 | 2 | MIG-03 | — | CLI HELP 2-트랙 분리 및 영한 문서 일관성 | unit | `node --test dist/test/migrate-docs-consistency.test.js` | ❌ W0 | ⬜ pending |
| 43-03-02 | 03 | 2 | MIG-04 | — | `formatComponentHarnessMatrix` 5개 상태 및 공유 설정 영향 렌더링 | unit | `node --test dist/test/matrix-format.test.js` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/migrate.test.ts` — stubs for MIG-01 (레거시 탐색, `.user-backup`, 원자적 마이그레이션 기록)
- [ ] `test/tool-bindings-ssot.test.ts` — stubs for MIG-02 (단일 공통 리더 및 fail-closed 거부)
- [ ] `test/matrix-format.test.ts` — stubs for MIG-04 (매트릭스 테이블 포매팅)

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
- [ ] Feedback latency < 20s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
