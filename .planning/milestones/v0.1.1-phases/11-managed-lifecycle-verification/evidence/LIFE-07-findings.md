# LIFE-07 Findings

Transcript: `evidence/life07-external.txt` (probe `probes/life07-external.mjs`, win32, packed CLI, six sandboxes). It ends with `host-guard: unchanged (17 targets)`. Phase 6 suites: `evidence/suites-local.txt` (`suites.phase6 HOLDS`, 33/33) and CI run 35818198049 (`evidence/ci-35818198049-lifelines.txt`, `ci.ubuntu|macos|windows.phase6-titles HOLDS`).

## Contract

- [ ] **LIFE-07**: User is shown verified external package changes and component-specific recovery instructions when managed-file rollback cannot safely reverse GSD, ECC, npm-link, or Pi bridge state

(verbatim, `.planning/milestones/v0.1.0-REQUIREMENTS.md:83`)

## Clauses

| # | Clause | Evidence | Oracle audit (D-04) | Result |
|---|--------|----------|---------------------|--------|
| 1 | shown verified external package changes | `life07-external.txt`: **`life07.external.shown HOLDS`** (human output prints `External verified changes retained outside journal rollback: ecc:runtime` and JSON `externalChanges` contains `ecc:runtime`). **`life07.external.verified HOLDS`** (locked `ecc-universal` 2.2.0 is verified on disk in the sandbox prefix for both human and JSON twin sandboxes). **`life07.failure.names-external HOLDS`** (on induced failure after external install, stderr names `External verified changes retained: ecc:runtime`). **`life07.external.pi-bridge-shown NOT-OBSERVED`** (`pi install` in sandbox failed with `Unexpected end of JSON input`) | Phase 6 test `recovery receipt conforms strictly to schema and writes ahead durably (LIFE-07, D-13)` (ubuntu lines 32-36, macos 76-80, windows 120-124; suites-local.txt:21) tests schema serialization in memory, not runtime CLI install or failure reporting. The probe tests real packed CLI installation into a sandbox prefix | HOLDS (for external change reporting) |
| 2 | component-specific recovery instructions: ECC | `life07-external.txt`: **`life07.external.recovery-shown VIOLATED`** (success output names no recovery instruction for ECC runtime, 0 receipts written under `<state>/receipts`). **`life07.failure.component-instructions VIOLATED`** (induced failure output gives no ECC-specific recovery instructions). **`life07.failure.receipt-written OBSERVED`** (no receipt written under `<state>/receipts` on install failure). **`life07.compensation.ecc-package VIOLATED`** (uninstall compensation command in receipt is `npm uninstall -g @enterprise-coding-companion/companion`, whereas stable lock defines `ecc-universal`) | Phase 6 test `ECC runtime compensation generator outputs correct command for upgrade and fresh install` (ubuntu line 35, macos 79, windows 123) pins `npm uninstall -g @enterprise-coding-companion/companion`. This pins an obsolete package name, proving string formatting rather than correctness against the stable lock | VIOLATED (LIFE-07/C1, LIFE-07/C2) |
| 3 | component-specific recovery instructions: GSD | `life07-external.txt`: **`life07.compensation.gsd-path VIOLATED`** (uninstall compensation command in receipt is `rm -rf ~/.claude/get-shit-done ~/.codex/get-shit-done`, whereas actual seeded GSD install occupies `<config root>/gsd-core`, specifically `~/.codex/gsd-core` and `~/.pi/agent/gsd-core`, both of which remain untouched) | Phase 6 test `GSD compensation generator outputs correct command for upgrade and fresh install` (ubuntu line 34, macos 78, windows 122) tests `compensateGsd` returning `~/.claude/gsd-core`, but `src/core/uninstall.ts:417` hardcodes the legacy path `rm -rf ~/.claude/get-shit-done ~/.codex/get-shit-done` | VIOLATED (LIFE-07/C3) |
| 4 | component-specific recovery instructions: Pi bridge | `life07-external.txt`: **`life07.compensation.pi-bridge VIOLATED`** (receipt components are `gsd, ecc-runtime, npm-link`; no Pi bridge compensation command is generated in the receipt, despite Pi target being installed; lock defines `pi-mcp-adapter@2.31.0` via `pi install`) | Phase 6 test `Pi bridge and npm link compensation generators output honest instructions` (ubuntu line 36, macos 80, windows 124) pins `npm unlink @modelcontextprotocol/server-pi`, which matches neither the stable lock package (`pi-mcp-adapter`) nor the actual CLI installation method (`pi install npm:...`) | VIOLATED (LIFE-07/C4) |
| 5 | component-specific recovery instructions: npm-link | `life07-external.txt`: **`life07.compensation.npm-link HOLDS`** (receipt compensation command is `npm unlink -g alpha-aos`, matching package manifest name `alpha-aos`). **`life07.receipt.written HOLDS`** (uninstall --all writes 1 recovery receipt under `<state>/receipts` containing `npm-link`). Global link install path is not mutated in this phase, so install-path half is NOT-OBSERVED | Phase 6 test (ubuntu line 36, macos 80, windows 124) asserts `npm unlink -g alpha-aos`. The compensation command string matches the actual package name | HOLDS (compensation output) |

## Core clause

The core promise is: the user is shown verified external package changes and component-specific recovery instructions when managed-file rollback cannot safely reverse GSD, ECC, npm-link, or Pi bridge state. The "shown verified external package changes" half holds for runtime installs and failure reporting. The "component-specific recovery instructions" half fails across GSD, ECC, and Pi bridge: install failures write no recovery receipts, ECC compensation names the wrong package (`@enterprise-coding-companion/companion` instead of `ecc-universal`), GSD compensation names legacy non-existent paths (`get-shit-done` instead of `gsd-core`), and Pi bridge compensation is omitted entirely. Result: VIOLATED.

## Provisional verdict

GAP (D-02): the core promise is not met. While external package changes are faithfully detected and reported during installation, component-specific recovery instructions are missing or incorrect when managed-file rollback cannot reverse external state. Install failures do not persist recovery receipts, and the compensation commands produced by uninstall name mismatched package names (`enterprise-coding-companion` instead of `ecc-universal`), wrong directories (`get-shit-done` instead of `gsd-core`), or omit components (Pi bridge).

## Host safety (D-13)

Phase 10 classified the Windows `~/.alpha-aos` change in CI run 35762417138 as `classification: test-isolation leak` (`.planning/debug/ci02-windows-alpha-aos-host-leak.md`). A different test file running concurrently wrote the real host state root; the released lifecycle alone left no `.alpha-aos` in its scratch home. The fix was in test code only: commits `8f17c7e` (`fix(10-03): redirect mcp-proxy test state root out of the host home`) and `7a3ee28` (`fix(10-03): journal gate receipts into test-owned state roots`), pinned by Phase 10 regression tests which passed on all three legs of run 35818198049. That record names no product requirement violation, and this verdict names none for it either.

The fresh product judgment is the host guard around this probe: `life07-external.txt` ends with `host-guard: unchanged (17 targets)`. The probe ran external installs, induced failure rollbacks, sandboxed Pi bridge operations, and full uninstall compensation generation without changing the real state root or any of the 16 managed harness paths. Furthermore, **`life07.pi-bridge.host-untouched HOLDS`** confirms that real-host Pi agent configuration files remained byte-identical.

## Gap candidates

### LIFE-07/C1

- clause: component-specific recovery instructions when managed-file rollback cannot safely reverse
- missing: when an installation fails after external package changes have been applied (e.g. `ecc:runtime`), the CLI reports `External verified changes retained: ecc:runtime` but emits no component-specific recovery instructions and writes no recovery receipt to `<state>/receipts`.
- close condition: install failure rollback writes a durable recovery receipt and prints actionable recovery commands naming the external package on disk. Reproducing `life07.failure.component-instructions` as HOLDS closes it.
- reproduction: `npm run build && node .planning/phases/11-managed-lifecycle-verification/evidence/probes/life07-external.mjs`; transcript `evidence/life07-external.txt`, step 2:
  - `CHECK life07.failure.names-external HOLDS attempt 2: exit=2; stderr names "External verified changes retained" with ecc:runtime; ecc-universal@2.2.0 is on disk in the sandbox prefix`
  - `CHECK life07.failure.component-instructions VIOLATED stderr and receipts name ecc-universal: false; name a recovery action: false; the failure output gives no ECC-specific recovery instruction`
  - `CHECK life07.failure.receipt-written OBSERVED no recovery receipt under <state>/receipts after the failed install (the directory does not exist)`

### LIFE-07/C2

- clause: component-specific recovery instructions (ECC)
- missing: ECC compensation command generated during uninstall (`compensateEcc`) specifies `npm uninstall -g @enterprise-coding-companion/companion` instead of the locked package `ecc-universal`.
- close condition: ECC compensation instructions and commands derive the package name directly from the stable lock (`components.ecc.package`). Reproducing `life07.compensation.ecc-package` as HOLDS closes it.
- reproduction: same command; `evidence/life07-external.txt`, step 4:
  - `CHECK life07.compensation.ecc-package VIOLATED ECC compensation command(s): "npm uninstall -g @enterprise-coding-companion/companion"; the lock's components.ecc.package is ecc-universal`

### LIFE-07/C3

- clause: component-specific recovery instructions (GSD)
- missing: GSD compensation command in `src/core/uninstall.ts:417` instructs the user to run `rm -rf ~/.claude/get-shit-done ~/.codex/get-shit-done`, which points to legacy directory paths that do not exist; the actual GSD core installation path is `<config root>/gsd-core`.
- close condition: GSD compensation commands reference the actual installed paths `<config root>/gsd-core` and `<config root>/.gsd-profile`. Reproducing `life07.compensation.gsd-path` as HOLDS closes it.
- reproduction: same command; `evidence/life07-external.txt`, step 4:
  - `CHECK life07.compensation.gsd-path VIOLATED GSD compensation command(s): "rm -rf ~/.claude/get-shit-done ~/.codex/get-shit-done"; the seeded GSD install occupies <config root>/gsd-core for codex (~/.codex/gsd-core) and pi (~/.pi/agent/gsd-core), both still present after uninstall --all`

### LIFE-07/C4

- clause: component-specific recovery instructions (Pi bridge)
- missing: when uninstalling a stack where the Pi bridge was installed, the generated recovery receipt omits the Pi bridge entirely (`receipt components: gsd, ecc-runtime, npm-link`). Furthermore, `compensatePiBridge` emits `npm unlink @modelcontextprotocol/server-pi` rather than `pi remove` or removing `pi-mcp-adapter`.
- close condition: uninstall recovery receipt includes the Pi bridge entry with commands matching `pi-mcp-adapter` and its native Pi installation route. Reproducing `life07.compensation.pi-bridge` as HOLDS closes it.
- reproduction: same command; `evidence/life07-external.txt`, step 4:
  - `CHECK life07.compensation.pi-bridge VIOLATED Pi bridge compensation command(s): none (receipt components: gsd, ecc-runtime, npm-link); the lock's components.mcpBridges.pi is pi-mcp-adapter@2.31.0, installed by pi install npm:pi-mcp-adapter@2.31.0 into the Pi agent directory`

## Observations

- `writeRecoveryReceipt` is called only in `src/core/uninstall.ts:427`. The install failure path in `src/core/install.ts` logs retained external changes but never creates or writes a `RecoveryReceipt`.
- The Phase 6 recovery-receipt unit tests in `test/recovery-receipt.test.ts` hardcoded outdated package names (`@enterprise-coding-companion/companion` and `@modelcontextprotocol/server-pi`), so passing unit tests mask divergence from `catalog/stack.lock.json`.
- In `life07.external.recovery-shown`, successful installation does not mention reversing external changes or create a receipt, which is expected for success but highlights that recovery guidance is only surfaced during uninstall or failure.
