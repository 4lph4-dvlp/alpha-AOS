---
phase: 01-safe-operation-boundary
plan: 08
subsystem: infra
tags: [subprocess, spawn, shell-free, environment-allowlist, timeout, mcp, stdio]

requires:
  - phase: 01-02
    provides: "Argv injection, environment, timeout and output-cap corpus"
  - phase: 01-03
    provides: "Bounded redacted excerpts and stream fingerprints"
provides:
  - "runProcess: shell-free, allowlisted, deadline-bound, output-capped child execution"
  - "PLATFORM_FLOOR_ENVIRONMENT: the names Windows delivers whatever the allowlist says"
  - "An MCP filter proxy that inherits neither ambient environment nor stderr"
affects: [01-11, 01-12, 01-13, 01-14, 01-16]

actuals:
  tokens: 14000
  tasks: 3
  commits: 1

tech-stack:
  added: []
  patterns:
    - "Streams are hashed whole and retained bounded; raw bytes never leave the adapter"
    - "The adapter seeds redaction with the secret values it handed the child"
    - "An interpreted shim without a proven direct equivalent is unsupported, not shelled out"

key-files:
  created: []
  modified:
    - src/core/process.ts
    - src/core/mcp-proxy.ts
    - src/core/inventory.ts
    - src/adapters/harnesses.ts
    - test/process.test.ts

key-decisions:
  - "The Windows platform environment floor is declared and asserted rather than silently tolerated"
  - "runCommandCapture stays a compatibility wrapper — shell-free and case-strict — until plan 01-11 migrates callers"
  - "taskkill /T terminates the child tree on Windows; it is an executable, not a shell"

patterns-established:
  - "Every refusal is a typed ProcessPolicyError with a stable code"
  - "A probe reports found-but-unsupported instead of simulating a version it cannot read"

requirements-completed: [SAFE-06]

coverage:
  - id: D1
    description: "Shell metacharacters in an argument stay data and execute no side effect"
    requirement: SAFE-06
    verification:
      - kind: integration
        ref: "test/process.test.ts#shell metacharacters in an argument stay data and never execute"
        status: pass
      - kind: integration
        ref: "test/process.test.ts#the adapter never routes a command through a shell interpreter"
        status: pass
      - kind: unit
        ref: "test/process.test.ts#the repository ships no shell-enabled spawn in its process adapter"
        status: pass
    human_judgment: false
  - id: D2
    description: "Only declared environment names cross the boundary, case collisions refuse, and the platform floor is declared"
    requirement: SAFE-06
    verification:
      - kind: integration
        ref: "test/process.test.ts#only operation-approved environment names reach the child"
        status: pass
      - kind: integration
        ref: "test/process.test.ts#the platform environment floor is declared rather than discovered at runtime"
        status: pass
      - kind: unit
        ref: "test/process.test.ts#environment names that collide only by case are rejected deterministically"
        status: pass
    human_judgment: false
  - id: D3
    description: "Timeouts and output caps terminate the child tree and return typed bounded evidence"
    requirement: SAFE-06
    verification:
      - kind: integration
        ref: "test/process.test.ts#a timeout terminates the child and reports the timeout as typed evidence"
        status: pass
      - kind: integration
        ref: "test/process.test.ts#unbounded child output is capped and reported as capped"
        status: pass
      - kind: integration
        ref: "test/process.test.ts#a timed-out command leaves no descendant process behind"
        status: pass
    human_judgment: false
  - id: D4
    description: "A captured result carries no raw secret; npm/npx normalize and arbitrary shims are unsupported"
    requirement: SAFE-06
    verification:
      - kind: integration
        ref: "test/process.test.ts#a captured result carries no raw secret and no shell trace"
        status: pass
      - kind: integration
        ref: "test/process.test.ts#known npm and npx shims normalize to node plus an exact CLI script"
        status: pass
      - kind: integration
        ref: "test/process.test.ts#an arbitrary cmd or bat input is unsupported rather than routed through a shell"
        status: pass
    human_judgment: false
  - id: D5
    description: "The MCP filter proxy builds its child environment from an allowlist and drains stderr into bounded redacted evidence"
    requirement: SAFE-06
    verification:
      - kind: unit
        ref: "test/process.test.ts#the MCP filter proxy inherits neither the ambient environment nor stderr"
        status: pass
    human_judgment: true
    rationale: "The source-level contract is asserted, but a live upstream MCP server has not been driven through the proxy on a real host; that canary belongs to phase 3 validation."

duration: 80min
completed: 2026-09-04
status: complete
---

# Phase 01 Plan 08: Shell-free bounded process adapter

**Children now run with no shell, an explicitly declared environment, a deadline and an output budget, returning hashed bounded redacted evidence instead of raw bytes — and the MCP filter proxy no longer inherits the ambient environment or a stderr handle.**

## Performance

- **Duration:** ~80 min
- **Completed:** 2026-09-04
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments

- **`runProcess` replaces the shell paths.** `shell: false` everywhere; the environment is built from declared `required`/`optional`/`literal` names against an explicit source that defaults to empty, so `process.env` is never inherited implicitly. Case-colliding names refuse with `environment-conflict`; a missing required name refuses before spawning; a relative executable refuses rather than triggering a PATH search.
- **Streams are hashed whole and retained bounded.** `BoundedStream` fingerprints every byte and keeps a head buffer, so a capped capture still reports `totalBytes` and a complete `sha256`. A child that keeps writing past eight times its budget is terminated.
- **Timeouts kill the tree.** `taskkill /T /F` on Windows and a process-group kill on POSIX, so a timed-out command leaves no descendant running.
- **Secrets the adapter itself passed are redacted back.** The redaction context is seeded with the values of secret-bearing environment names, so an echoed credential is caught even though it matches no structural pattern.
- **Interpreted shims are unsupported, not shelled out.** `cmd.exe`, `powershell.exe` and `ComSpec` are gone from the adapter. npm and npx normalize to the running Node binary plus the exact CLI script; anything else with a `.cmd`/`.bat`/`.ps1` extension returns a typed `unsupported-executable`.
- **The MCP filter proxy builds its child environment from a per-server allowlist** and drains upstream stderr into a bounded, redacted collector with a whole-stream fingerprint, rather than handing the terminal an inherited handle.
- **Probes report rather than simulate.** `probeCommand` normalizes npm/npx, and a harness whose CLI is an unreadable shim gets an explicit `version unavailable: …` note instead of a fabricated or silently null version.

## Verification

`node --test dist/test/process.test.js` → 15/15. Pre-existing suites unchanged.

## Notable Finding

**Windows delivers a floor of environment variables that no allowlist can suppress.** Regardless of the environment block passed to `spawn`, libuv guarantees `HOMEDRIVE`, `HOMEPATH`, `LOGONSERVER`, `PATH`, `SYSTEMDRIVE`, `SYSTEMROOT`, `TEMP`, `USERDOMAIN`, `USERNAME`, `USERPROFILE` and `WINDIR`.

Three of those — `USERNAME`, `USERPROFILE`, `HOMEPATH` — are user-identifying. This is now exported as `PLATFORM_FLOOR_ENVIRONMENT` and asserted against what the OS actually delivers, so the set cannot widen unnoticed.

This matters beyond SAFE-06: PROJECT.md requires `project-only` launch environments to "default to a reviewed allowlist" and to "avoid unrelated environment-secret leakage". On Windows that allowlist has a floor, and phase 5 must state it rather than imply total control.

## Decisions Made

- **`runCommandCapture` remains a compatibility wrapper.** Six modules still parse its text output. It is now shell-free and enforces the same case-collision rule, but keeps returning text until plan 01-11 migrates those callers to `runProcess`.
- **The proxy assertion matches a call or an import, not a mention.** The first version failed on the comment explaining why the SDK helper is avoided, which would have pushed the explanation out of the code.

## Deviations from Plan

Task 2 asks for a full MCP SDK `Transport` adapter over `openProtocolProcess`, with per-message deadlines and a fake upstream server fixture. What shipped removes the two concrete leaks the plan names — the ambient-environment copy and the inherited stderr handle — and adds bounded, fingerprinted stderr evidence, but the proxy still uses the SDK's own `StdioClientTransport` rather than a transport built on this adapter. The remaining work is the protocol-session mode and its fake-server test; it is recorded as a phase-1 gap rather than silently marked done.

## Next Phase Readiness

`01-11` can migrate the fixture and installer callers to `runProcess`. The protocol-session transport remains open and should be picked up alongside that migration.

---
*Phase: 01-safe-operation-boundary*
*Completed: 2026-09-04*
