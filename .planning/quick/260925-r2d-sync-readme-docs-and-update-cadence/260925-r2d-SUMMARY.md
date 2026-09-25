# Quick Task Summary: 260925-r2d Sync README Docs with CLI Syntax, Promoted Versions, and Update Cadence

**Execution Date:** 2026-09-25  
**Status:** Completed  
**Subsystem:** Documentation / CLI Reference / Maintenance  
**Related Requirements:** LIFE-01, PLAT-01, SAFE-06

---

## 1. Problem Overview & Scope

### Problem
1. **Tree Policy CLI Syntax Mismatch**: The documentation in `README.md` and `README.ko.md` previously instructed users to run `alpha-aos tree policy set . --mode off/inherit`, but the CLI router only recognizes `alpha-aos tree set <path> --mode <managed|off>` and `alpha-aos tree remove <path>`. Passing `policy` caused CLI error `Unknown tree subcommand: policy`.
2. **Outdated Global Stack Matrix Versions**: The table in both READMEs still listed GSD Core `1.12.0` and Firecrawl Proxy `3.24.0`, whereas Phase 13 promoted them to GSD Core `1.14.0` and Firecrawl Proxy `3.25.2`.
3. **Missing Direct CLI Update Reference**: While bootstrap scripts (`scripts/update.ps1` and `scripts/update.sh`) were described, the direct CLI command `alpha-aos update --apply` was undocumented in the README.
4. **Missing Upstream Check Cadence Documentation**: Users inquiring about how often dependencies are checked and updated had no documentation referencing the automated weekly cron workflow and promotion CI gates.

---

## 2. Changes Made

### 1. English Documentation (`README.md`)
- Corrected tree subcommands from `alpha-aos tree policy set . --mode off` to `alpha-aos tree set . --mode off`, and `alpha-aos tree status .` to `alpha-aos tree inspect .`.
- Updated tree restore command to `alpha-aos tree remove .` (or `alpha-aos tree set . --mode managed`).
- Corrected Scenario D confidentiality command to `alpha-aos tree set /path/to/confidential-project --mode off`.
- Updated Global Stack Matrix:
  - GSD Core `standard`: updated to `1.14.0`.
  - Firecrawl Proxy: updated to `3.25.2`.
- Added structured Updating documentation:
  - Section 1: Repository & Global CLI Update (`update.ps1` / `update.sh`).
  - Section 2: Direct Harness Reconcile via CLI (`alpha-aos update --check`, `alpha-aos update --apply`, `--target`).
  - Section 3: Automated Upstream Version Check Cadence (detailed schedule every Monday at 03:17 UTC / 12:17 KST, automated PR generation, pack drift check at 04:17 UTC, 3-tier CI gate).

### 2. Korean Documentation (`README.ko.md`)
- Maintained exact 1:1 structural and heading symmetry with `README.md`.
- Corrected tree subcommands to `alpha-aos tree set` and `alpha-aos tree remove` / `inspect`.
- Corrected Scenario D command to `alpha-aos tree set /경로/보안프로젝트 --mode off`.
- Updated Global Stack Matrix to GSD Core `1.14.0` and Firecrawl Proxy `3.25.2`.
- Added Korean descriptions for CLI reconcile commands (`alpha-aos update --check` / `--apply`) and upstream update check cadence (매주 월요일 낮 12:17 KST, 자동 PR 생성, 3단계 CI 게이트 검증).

---

## 3. Verification

1. **Type Check & Build:**
   - `npm run check` completed with 0 errors.
   - `npm run build` completed with updated `dist/build-artifact.json` (128 inputs, 254 outputs).
2. **CLI Alignment Verification:**
   - Checked `src/cli.ts` usage string against updated commands: confirmed `tree set`, `tree remove`, `tree inspect`, `update --check`, and `update --apply` match exactly.
3. **Parity Check:**
   - Verified 1:1 heading, table, and code-block symmetry between `README.md` and `README.ko.md`.
