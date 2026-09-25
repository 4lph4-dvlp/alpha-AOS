# Quick Task Summary: 260925-s1a Fix Install Guidance, Actionable Error Messages, and Source Installation README Docs

**Execution Date:** 2026-09-25  
**Status:** Completed  
**Subsystem:** Documentation / Build Artifacts / Developer Experience  
**Related Requirements:** LIFE-01, PLAT-01, SAFE-06

---

## 1. Problem Overview & Scope

### Problem
1. **Fresh Clone / New Machine Install Failure**:
   Running `.\scripts\install.ps1 -Apply` on a newly cloned workstation failed immediately with:
   ```text
   alpha-aos: no build artifact manifest at dist\build-artifact.json; run npm run build first.
   Write-Error: alpha-aos: refusing to run without a verified build artifact.
   ```
2. **Missing Actionable Guidance**:
   The refusal error lacked actionable step-by-step remediation instructions for new users who clone the repo and need to prepare dependencies and compile build artifacts.
3. **Misleading "Quick Start" Documentation**:
   The documentation labeled source installation as "Quick Start" while omitting the prerequisite `npm ci` and `npm run build` steps.
4. **Unclear Distribution Status**:
   The repository does not currently publish to the public npm registry; installation is strictly source-based (Git clone) until an official release channel is published.

---

## 2. Changes Made

### 1. Actionable Remediation in Build Artifact Checker (`scripts/build-artifact.mjs`)
- When `dist/build-artifact.json` is missing, `check()` now outputs explicit guidance:
  ```text
  alpha-aos: no build artifact manifest at dist/build-artifact.json; run npm run build first.
  This appears to be a fresh clone or unbuilt environment.
  To build alpha-AOS, run:
    npm ci
    npm run build
  Then re-run the installation or update command.
  ```
- Retained the exact substring `no build artifact manifest` to preserve backward compatibility with `test/install.test.ts` and `test/preview.test.ts`.
- Kept wrapper scripts (`install.ps1`, `install.sh`, `update.ps1`, `update.sh`) free of forbidden direct execution commands to respect the invariant tested in `test/preview.test.ts` (`FORBIDDEN_WRAPPER_COMMANDS`).

### 2. English Documentation (`README.md`)
- Restructured `Quick Start (Workstation Setup)` into `Installation`:
  - Clarified current source-based distribution status and noted future npm registry distribution.
  - Added subsection `### Installation from Source (Git Clone)` with explicit:
    ```sh
    git clone https://github.com/4lph4-dvlp/alpha-AOS.git
    cd alpha-AOS
    npm ci
    npm run build
    ```
  - Followed by Windows PowerShell and POSIX shell install launcher invocations.

### 3. Korean Documentation (`README.ko.md`)
- Maintained exact 1:1 structural and heading symmetry with `README.md`.
- Restructured `빠른 시작` into `설치 가이드 (Installation)`.
- Added `### 소스 복제를 통한 설치 (Installation from Source)` detailing `npm ci` and `npm run build` before running platform installation scripts.

---

## 3. Verification

1. **Type Check & Build:**
   - `npm run check` completed with 0 errors.
   - `npm run build` and `npm run build:check` completed cleanly with verified build artifact (128 inputs, 254 outputs).
2. **Safety Boundary Tests:**
   - `node scripts/run-tests.mjs --files dist/test/preview.test.js`: 11/11 passed (including `no wrapper contains a direct mutation command` and wrapper refusal/delegation assertions).
   - `node scripts/run-tests.mjs --files dist/test/install.test.js`: 14/14 passed (including missing build artifact refusal assertion).
3. **PowerShell Script Syntax:**
   - Scriptblock parse test passed for `scripts/install.ps1` and `scripts/update.ps1`.
4. **Documentation Parity:**
   - Verified 1:1 structural symmetry, code blocks, and headings between `README.md` and `README.ko.md`.
