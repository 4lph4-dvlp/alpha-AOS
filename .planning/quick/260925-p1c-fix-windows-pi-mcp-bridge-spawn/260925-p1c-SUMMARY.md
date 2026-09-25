# Quick Task Summary: 260925-p1c Fix Windows Pi MCP Bridge Spawn EINVAL

**Execution Date:** 2026-09-25  
**Status:** Completed  
**Subsystem:** Install / Process Launch / Windows Compatibility  
**Related Requirements:** SAFE-06, PLAT-01, LIFE-01

---

## 1. Problem Overview & Root Cause

### Problem
When running `alpha-aos update --apply` or `alpha-aos install --apply` on a Windows host where Pi Agent is installed via npm global shim (`pi.cmd`), the operation failed with:
```
alpha-aos: spawn EINVAL. External verified changes retained: gsd:claude, gsd:codex, gsd:antigravity, gsd:pi, ecc:runtime.
```

### Root Cause
1. `src/core/install.ts` defined the external process specification for `mcp-bridge:pi` using `resolveCommand("pi")` directly without unwrapping.
2. On Windows, `resolveCommand("pi")` returns the global batch wrapper `...\\npm\\pi.cmd`.
3. In Node.js (specifically since Windows CVE-2024-27980 patch in v18.20.2/v20.12.2/v22+), invoking `child_process.spawn` on `.cmd` or `.bat` files with `{ shell: false }` triggers an immediate OS argument validation failure resulting in `Error: spawn EINVAL`.
4. Other harnesses and fixtures in alpha-AOS (e.g. `src/core/mcp-fixture.ts`, `src/adapters/capability-oracle.ts`) consistently use `resolveDirectLaunch` to parse npm `.cmd` shims into `node.exe <cli.js>` direct launches. `src/core/install.ts` had omitted this unwrap for `mcp-bridge:pi`.

---

## 2. Changes Made

### 1. Direct Launch Resolution in `src/core/install.ts`
- Imported `resolveDirectLaunch` from `../adapters/capability-oracle.js`.
- In `createManagedInstallOperationPlan`, resolved `pi` command via `resolveDirectLaunch(pi)`.
- If `resolveDirectLaunch` returns null, fails closed with `Cannot launch Pi executable directly: ${pi}`.
- Configured `externalSpec(launch.executable, [...launch.argsPrefix, "install", ...])`, ensuring `node.exe` is spawned directly with `{ shell: false }`.

### 2. Regression Test in `test/install.test.ts`
- Added unit test `"managed install resolves Pi CLI via resolveDirectLaunch rather than spawning shims directly"`:
  - Verifies static contract in `src/core/install.ts`.
  - Verifies that `createManagedInstallOperationPlan` produces an executable for `mcp-bridge:pi` that does not end in `.cmd` or `.bat`.

---

## 3. Verification

1. **Type Check:** `npm run check` passed with 0 errors.
2. **Build & Artifact:** `npm run build` completed with updated `dist/build-artifact.json`.
3. **Unit Test:** `node --test dist/test/install.test.js` passed all 14 tests (including new regression test).
4. **End-to-End Update Reconciliation:**
   Executed `alpha-aos update --apply` on the Windows host:
   ```
   alpha-AOS stable update reconciled: claude, codex, antigravity, pi, hermes
   Applied: mcp:claude, mcp:codex, mcp:antigravity, mcp:pi, mcp:hermes
   Already current: gsd:claude, gsd:codex, gsd:antigravity, gsd:pi, ecc:runtime, mcp-bridge:pi, ...
   ```
5. **System Health:** `alpha-aos doctor` verified all harnesses and locks are OK.
6. **Full Test Suite:** `npm test` executed all 945 tests across the entire test suite with 936 passing, 0 failing, 9 skipped.
