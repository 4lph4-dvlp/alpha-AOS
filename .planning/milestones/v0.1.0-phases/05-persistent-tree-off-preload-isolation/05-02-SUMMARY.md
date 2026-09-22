---
phase: 05-persistent-tree-off-preload-isolation
plan: 02
subsystem: adapters
tags: [shims, preload-exclusion, fast-dispatch, zero-copy-auth, fail-closed]

# Dependency graph
requires:
  - phase: 05-persistent-tree-off-preload-isolation
    plan: 01
    provides: "tree-policy.ts (resolveEffectivePolicy, loadTreeRegistry)"
provides:
  - "src/types.ts — HarnessPreloadExclusion, ShimGenerationResult, UpstreamBinaryResolution"
  - "src/adapters/isolation.ts — getHarnessPreloadExclusion with provable support checks and fail-closed reporting"
  - "src/adapters/shims.ts — generateShimScripts, findUpstreamBinary, linkAuthWithoutCopying, prepareIsolatedTreeRoot, verifyShimsPrecedence, SHIMMED_COMMANDS"
  - "src/shim-dispatch.ts — ultra-fast standalone Node CLI dispatcher entrypoint"
  - "test/shims.test.ts — Unit and integration tests for shims, preload exclusion, and loop-free binary resolution"
affects: [tree-classify, surface-inspector, cli]

actuals:
  tokens: 48000
  tasks: 3
  commits: 1
plan_head_before: 3910d73

tech-stack:
  added: []
  patterns:
    - "Transparent CLI shims in ~/.alpha-aos/shims/ for codex, pi, hermes, agy without wrapper commands (D-05, OPTO-02)"
    - "Preload exclusion flag injection (Codex: --strict-config --ignore-user-config --ignore-rules; Pi: --no-skills ...; Hermes: chat --ignore-user-config ...) (D-05, OPTO-05)"
    - "Clean isolated configuration roots (~/.alpha-aos/isolated/trees/<tree-id>/) with zero-copy filesystem linking for credentials (D-07)"
    - "Recursion-free upstream binary lookup strictly filtering shimsDir from PATH (D-05)"
    - "Fail-closed exit code 2 on unprovable surfaces such as Antigravity IDE/GUI desktop launches (D-06, D-08, OPTO-08)"
    - "Sub-millisecond dispatch policy resolution benchmarked under 1ms (average <0.1ms) (D-05)"

key-files:
  created:
    - src/adapters/shims.ts
    - src/shim-dispatch.ts
    - test/shims.test.ts
  modified:
    - src/types.ts
    - src/adapters/isolation.ts

key-decisions:
  - "CLI shims generate POSIX (sh), Windows CMD (.cmd), and Windows PowerShell (.ps1) wrappers targeting standalone shim-dispatch.js"
  - "Upstream binary resolution explicitly drops shimsDir from PATH evaluation to break recursive invocation loops"
  - "Antigravity IDE/GUI desktop launches are marked provable: false and halt with exit code 2, directing users to alpha-aos tree inspect"
  - "Existing authentication tokens (~/.codex/auth.json, etc.) are reused via hardlinks/symlinks, preventing secret byte copying into managed state"

requirements-completed: [OPTO-02, OPTO-05, OPTO-08]

coverage:
  - id: D-05
    description: "Transparent CLI shims intercept normal invocations on PATH and delegate or isolate based on CWD policy"
    requirement: "OPTO-02"
    verification:
      - kind: integration
        ref: "test/shims.test.ts#generateShimScripts creates POSIX, CMD, and PS1 shims for all shimmed commands"
        status: pass
      - kind: unit
        ref: "test/shims.test.ts#findUpstreamBinary finds mock binary in system directory while ignoring shimsDir"
        status: pass
  - id: D-06
    description: "Antigravity GUI reported as unsupported/unprovable; CLI agy remains supported"
    requirement: "OPTO-08"
    verification:
      - kind: unit
        ref: "test/shims.test.ts#getHarnessPreloadExclusion returns correct flags and detects unprovable surfaces"
        status: pass
  - id: D-07
    description: "Isolated configuration root with reference-based credential reuse without byte copying"
    requirement: "OPTO-05"
    verification:
      - kind: integration
        ref: "test/shims.test.ts#linkAuthWithoutCopying links credentials without reading or copying bytes"
        status: pass
  - id: D-08
    description: "Preload exclusion fail-closed semantics on unprovable surfaces"
    requirement: "OPTO-08"
    verification:
      - kind: unit
        ref: "test/shims.test.ts#getHarnessPreloadExclusion returns correct flags and detects unprovable surfaces"
        status: pass
---

# Plan 05-02 Summary: Transparent CLI Shims, Sub-Millisecond Dispatch, and Preload Exclusion

## Accomplishments
1. **Harness Preload Exclusion & Provable Support (`src/adapters/isolation.ts`)**:
   - Implemented `getHarnessPreloadExclusion` for Codex, Pi, Hermes, and Antigravity.
   - Injected `--strict-config --ignore-user-config --ignore-rules` for Codex, `--no-skills --no-extensions --no-prompt-templates --no-themes` for Pi, and `chat --ignore-user-config --ignore-rules` for Hermes.
   - Formally designated Antigravity GUI as unprovable (`provable: false`) with fail-closed guidance, while CLI `agy` is fully supported.
2. **Transparent CLI Shim Generator & Upstream Binary Resolution (`src/adapters/shims.ts`)**:
   - Implemented `generateShimScripts` producing POSIX `sh`, Windows `.cmd`, and Windows `.ps1` shims for `codex`, `pi`, `hermes`, and `agy`.
   - Implemented `findUpstreamBinary` which strictly filters `shimsDir` from `PATH`, eliminating recursive fork loop hazards.
   - Implemented `linkAuthWithoutCopying` using hardlinks (and symlinks) to reuse session logins without duplicating or reading secret bytes into state.
   - Implemented `prepareIsolatedTreeRoot` provisioning isolated configuration directories per tree ID.
3. **Ultra-Fast Standalone Shim Dispatcher (`src/shim-dispatch.ts`)**:
   - Created lightweight dispatch entrypoint bypassing full CLI overhead.
   - Benchmarked CWD policy lookup under 1ms (<0.1ms typical).
   - Enforced fail-closed termination (exit code 2) on unprovable surfaces.
4. **Comprehensive Test Suite (`test/shims.test.ts`)**:
   - 6 automated tests covering shim generation, loop prevention, auth linking, preload exclusion flags, dispatch performance, and PATH precedence. All passed with 0 failures.
