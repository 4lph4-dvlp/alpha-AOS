---
phase: 03-transactional-project-packs-and-native-optional-use
plan: 16
subsystem: capability-canary
tags: [codex, context7, mcp, isolation, native-verification]

requires:
  - phase: 03-08
    provides: MCP observation-front invocation matcher and version-scoped Context7 proof contract
provides:
  - Costed native Codex CAPA-01 invocation distinct from free discovery
  - Runtime-derived Context7 MCP overrides with authentication-by-reference isolation
  - Deterministic Codex Context7 routing and live invoked/held evidence
affects: [03-17, capability-ledger, canary-runtime, codex-isolation]

actuals:
  tokens: 12844
  tasks: 2
  commits: 5

tech-stack:
  added: []
  patterns:
    - Separate free harness discovery from costed native invocation definitions
    - Derive closed Codex CLI overrides from validated runtime-local TOML
    - Reuse authentication by reference while pinning controlled write roots to the canary runtime

key-files:
  created: []
  modified:
    - catalog/canaries.yaml
    - src/adapters/capability-oracle.ts
    - src/adapters/isolation.ts
    - src/core/canary.ts
    - src/cli.ts
    - test/canary.test.ts
    - test/isolation.test.ts

key-decisions:
  - "Codex discovery remains the free debug prompt-input vector while invocation uses the costed ephemeral exec vector."
  - "The canary reuses the caller's Codex authentication boundary by reference, but all alpha-AOS-controlled write roots remain runtime-local."
  - "Because --ignore-rules removes ambient documentation routing, the isolated Codex invocation carries one exact developer instruction that requires ordered Context7 use without changing the declared canary prompt."

patterns-established:
  - "Validated override vector: native Codex -c arguments are derived from the exact rendered TOML and rejected if any server is missing, extra, malformed, or unfronted."
  - "Evidence authority: only ordered MCP-side observations promote native use; model output remains diagnostic."

requirements-completed: [CAPA-01, CAPA-07]

coverage:
  - id: D1
    description: Codex has separate free discovery and costed ephemeral native invocation definitions.
    requirement: CAPA-01
    verification:
      - kind: unit
        ref: test/canary.test.ts#Codex discovery remains free while invocation uses the costed ephemeral exec surface
        status: pass
    human_judgment: false
  - id: D2
    description: A runtime-local Context7 registration crosses the alpha-AOS observation front and produces invoked/held native evidence.
    requirement: CAPA-01
    verification:
      - kind: integration
        ref: node dist/src/cli.js doctor --canary . --harness codex --capability CAPA-01 --json
        status: pass
    human_judgment: false
  - id: D3
    description: Codex authentication is reused without copying auth bytes while controlled configuration and write roots remain isolated.
    requirement: CAPA-07
    verification:
      - kind: unit
        ref: test/canary.test.ts#Codex authentication fallback preserves the platform home while every controlled write root stays runtime-local
        status: pass
      - kind: unit
        ref: test/isolation.test.ts#the Codex canary branch reuses authentication but carries only measured runtime MCP overrides
        status: pass
    human_judgment: false
  - id: D4
    description: Claude compatibility and ordinary non-canary Codex project isolation retain their previous contracts.
    requirement: CAPA-07
    verification:
      - kind: unit
        ref: test/isolation.test.ts#the ordinary Codex project-only branch remains byte-for-byte stable
        status: pass
      - kind: integration
        ref: node scripts/run-tests.mjs --files dist/test/canary.test.js dist/test/isolation.test.js
        status: pass
    human_judgment: false

duration: 5h 35m
completed: 2026-09-13
status: complete
---

# Phase 03 Plan 16: Native Codex CAPA-01 Tracer Summary

**Native Codex now proves version-scoped Context7 use through a runtime-local observation front while preserving authentication and isolation boundaries**

## Performance

- **Duration:** 5h 35m
- **Started:** 2026-09-13T02:30:46Z
- **Completed:** 2026-09-13T08:05:38Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Added a costed `codex exec --json --ephemeral` invocation surface without changing free `debug prompt-input` discovery or the existing Claude declaration.
- Derived exact runtime-local Context7 `-c` overrides from validated TOML and required every server command to cross this run's observation front.
- Proved authentication-by-reference, runtime-local controlled writes, and a live Codex-only `nativeUse: invoked` / `verdict.held: true` result with three observations.

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: Codex CAPA-01 tracer tests** - `8cde355`
2. **Task 1 GREEN: Native Codex CAPA-01 invocation** - `33c7d79`
3. **Task 2 RED: Codex auth/config boundary matrix** - `4462886`
4. **Task 2 GREEN: Codex auth/config boundary proof** - `96f9da4`
5. **Native-gate fix: deterministic Context7 routing under ignored rules** - `ce96d89`

## Files Created/Modified

- `catalog/canaries.yaml` - Declares the Codex CAPA-01 leg while retaining Claude.
- `src/adapters/capability-oracle.ts` - Separates costed invocation from free discovery and carries the isolated routing instruction.
- `src/adapters/isolation.ts` - Reuses Codex authentication by reference and applies exact runtime MCP overrides.
- `src/core/canary.ts` - Derives/validates overrides, accepts runtime-local readiness evidence, and launches Codex natively.
- `src/cli.ts` - Creates each canary runtime with only the declaration's required MCP servers.
- `test/canary.test.ts` - Covers selection, invocation, evidence, credentials, runtime roots, and refusal paths.
- `test/isolation.test.ts` - Covers Codex canary isolation and ordinary-path non-regression.

## Decisions Made

- Kept discovery and invocation as separate adapter contracts so a free discovery result cannot be mistaken for native use.
- Preserved user-managed authentication only as an environment reference; no auth file bytes are read, copied, rendered, journaled, or deleted.
- Added one exact Codex developer instruction because the required `--ignore-rules` isolation removes ambient routing instructions; the catalog prompt remains unchanged and MCP observations remain the sole proof authority.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Declared runtime server selection also required a CLI call-site change**
- **Found during:** Task 1
- **Issue:** The CLI created every canary runtime with the full MCP catalog, conflicting with the plan's exact declared-server boundary; `src/cli.ts` was absent from 03-16 frontmatter.
- **Fix:** Runtime creation now uses only `selection.declaration.requiresMcpServers`.
- **Files modified:** `src/cli.ts`
- **Verification:** Focused canary/isolation suite passed 120/120.
- **Committed in:** `33c7d79`

**2. [Rule 1 - Bug] Native Codex completed without selecting Context7**
- **Found during:** Final native verification
- **Issue:** `--ignore-rules` correctly removed ambient instructions, but the isolated turn then answered without calling the available Context7 tools, leaving zero observations.
- **Fix:** Added an exact `developer_instructions` override requiring ordered Context7 resolution/query for version-sensitive documentation, and made the boundary validator reject its omission or alteration.
- **Files modified:** `src/adapters/capability-oracle.ts`, `src/core/canary.ts`, `test/canary.test.ts`
- **Verification:** RED type check failed before implementation; focused suite passed 120/120; live Codex result reported `invoked`, `held: true`, and three observations.
- **Committed in:** `ce96d89`

---

**Total deviations:** 2 auto-fixed (1 blocking scope correction, 1 native verification bug)
**Impact on plan:** Both changes are required to make the declared isolation and observation contracts true; no additional capability or dependency was introduced.

## Issues Encountered

- The first executor exhausted its usage allowance after four commits but before SUMMARY creation. Work resumed from those commits without re-executing completed tasks.
- The first live Codex run returned cleanly but produced no MCP observations. Free prompt-input diagnostics isolated the missing routing instruction; the corrected second run passed.

## User Setup Required

None - the existing Codex login is reused by reference and no new credential or service configuration is required.

## Next Phase Readiness

- 03-17 can now enforce fail-closed explicit filtering against a real selectable Codex CAPA-01 leg.
- The final phase gate still requires the complete repository suite and the 03-17 negative CLI proof.

---
*Phase: 03-transactional-project-packs-and-native-optional-use*
*Completed: 2026-09-13*
