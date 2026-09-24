---
phase: "12"
slug: "red-main-guard"
status: draft
nyquist_compliant: true
wave_0_complete: false
created: "2026-09-24"
---

# Phase 12 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js built-in `node:test` + `node:assert/strict` with TypeScript compilation |
| **Config file** | `tsconfig.json` + `scripts/run-tests.mjs` |
| **Quick run command** | `npm run check && npm run build && node --test dist/test/red-main-guard.test.js dist/test/check-main-baseline.test.js` |
| **Full suite command** | `npm run check && npm test` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run quick run command
- **After every plan wave:** Run full suite command
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 12-01-01 | 01 | 1 | CI-04 | T-12-01 | GitHub CLI calls use explicit args without shell interpolation (`shell: false`) | unit | `node --check scripts/red-main-guard.mjs` | ❌ W0 | ⬜ pending |
| 12-01-02 | 01 | 1 | CI-04 | T-12-02, T-12-04 | Issue lifecycle deduplicates repeated failures, auto-closes on green, and filters branches | unit | `npm run build && node --test dist/test/red-main-guard.test.js` | ❌ W0 | ⬜ pending |
| 12-01-03 | 01 | 1 | DEP-03 | T-12-03, T-12-05 | Promotion gate fails closed on missing/indeterminate baseline and toggles label safely | unit | `node --check scripts/check-main-baseline.mjs` | ❌ W0 | ⬜ pending |
| 12-01-04 | 01 | 1 | DEP-03 | T-12-03, T-12-05 | Unit tests verify blocked on red, eligible on green, fail-closed on error, banner update, and label toggle | unit | `npm run build && node --test dist/test/check-main-baseline.test.js` | ❌ W0 | ⬜ pending |
| 12-02-01 | 02 | 2 | CI-04 | T-12-06 | Red-main workflow permissions isolated to `issues: write`, `contents: read`, `actions: read` on `main` only | integration | `node -e "const yaml=require('yaml'),fs=require('node:fs'),doc=yaml.parse(fs.readFileSync('.github/workflows/red-main-guard.yml','utf8')); if(doc.permissions.issues!=='write'\|\|doc.permissions.contents!=='read'\|\|doc.permissions.actions!=='read')process.exit(1); if(!doc.on.workflow_run\|\|!('workflow_dispatch' in doc.on))process.exit(1);"` | ❌ W0 | ⬜ pending |
| 12-02-02 | 02 | 2 | DEP-03 | T-12-08 | Candidate workflow permissions widened to `contents: write`, `pull-requests: write`, `issues: write`, `actions: read` with baseline check wired | integration | `node -e "const yaml=require('yaml'),fs=require('node:fs'),doc=yaml.parse(fs.readFileSync('.github/workflows/dependency-candidate.yml','utf8')); if(doc.permissions.contents!=='write'\|\|doc.permissions['pull-requests']!=='write'\|\|doc.permissions.issues!=='write'\|\|doc.permissions.actions!=='read')process.exit(1); const steps=doc.jobs.stage.steps; if(!steps.some(s=>s.run&&s.run.includes('check-main-baseline.mjs')))process.exit(1);"` | ❌ W0 | ⬜ pending |
| 12-02-03 | 02 | 2 | CI-04, DEP-03 | T-12-07 | Full test suite passes (0 failures), build manifest matches, and release tarball allowlist verified | e2e | `npm run check && npm run build && npm run build:check && npm test && npm run audit-tarball` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/red-main-guard.test.ts` — stubs and mocks for CI-04 (tracking issue open, refresh, auto-close)
- [ ] `test/check-main-baseline.test.ts` — stubs and mocks for DEP-03 (candidate promotion eligible, blocked, fail-closed)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real GitHub Actions `workflow_run` trigger on default branch | CI-04 | `workflow_run` triggers only after merge to repository default branch | Verify after merging to `main` by checking Actions tab for red-main-guard workflow run |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 10s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending 2026-09-24
