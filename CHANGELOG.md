# Changelog

All notable changes to alpha-AOS are documented in this file. The format follows Keep a Changelog, and the project uses Semantic Versioning.

## [Unreleased]

## [0.4.8] - 2026-10-28

### Fixed

- Contract validation now accepts the existing `gsd-multi-phase` and `gsd` runtime routes while rejecting unsupported workflows and preserving canonical digest validation.
- All three GSD routes require explicit local-commit authority, including the newly reachable full-workflow contracts.
- Job state reads tolerate bounded atomic record replacement under retained ancestor proofs, then revalidate schema, ownership and revision. Generic file reads still reject replacement.
- User home detection recognizes Windows short/long path aliases by physical directory identity. Strict job/task test fixtures use canonical temporary paths on macOS and portable paths across platforms.
- GSD verification uses the bounded process adapter and canonical query. The unused placeholder milestone reviewer refuses to certify a no-op.
- Weekly MCP fixtures retry transient protocol failures once. Live startup tests share a bounded connect/list deadline and retry transient handshakes once; integrity and compatibility failures remain blocking.
- Windows bootstrap fixture cleanup retries transient directory locks without suppressing persistent errors.
- Release consistency tests validate package/lock agreement and version syntax without pinning every future release to 0.4.7.
- Local release verification uses a private alpha-AOS state root so another session's job updates cannot invalidate the host-write boundary audit.

### Security

- Updated the MCP TypeScript SDK to 1.32.2 and smol-toml to 1.9.1 with patched transitive dependencies; npm audit reports zero known vulnerabilities for this lock.

### Added

- Full local push verification against a real release package, mandatory MCP/ECC integration, computer-use checks and build provenance. The optional Git hook refuses main pushes without a successful three-OS CI run for the exact commit.

## [0.4.6] - 2026-10-27

### Fixed

- **Autopilot Lifecycle Stage Gates (`BUG-07`)**:
  - Implemented strict 1:1 plan-to-summary execution gate (`hasExecutionSummaries`) preventing planning-summary collisions (`*-PLANNING-SUMMARY.md`) from prematurely skipping phase execution.
  - Enforced frontmatter verification status checking (`hasPassedVerification`) to fail closed on `status: gaps_found`, `human_needed`, `stale`, or `issues_found` in review, preventing failed or incomplete verification from advancing to subsequent phases.
  - Implemented strict validation gate (`hasNyquistValidation`) rejecting draft validations (`status: draft` or `nyquist_compliant: false`).
  - Integrated stage gates into `task-gsd-lifecycle.ts` and `task-gsd-discovery.ts` to prevent premature autopilot progression.

## [0.4.5] - 2026-10-27

### Added

- Detached command jobs (`alpha-aos job start`, `job wait`, `job status`, `job cancel`) for running long-running test suites and build processes with independent process lifetimes under the caller identity and sandbox authority, assigning exact IDs (`job-` plus 16 lowercase hex characters) and bounding combined retained child output to 64 KiB (`MAX_COMBINED_OUTPUT_BYTES`).
- Canonical task wait (`alpha-aos task wait`) supporting exact contract, run, digest, and revision observation with anti-forgery run record verification; manual task wait linkage for unsupported legacy supervisor records remains explicitly unresolved.
- Event-driven efficient wait guidance in `docs/efficient-wait.md` and five-harness support matrix across Claude Code, Codex, Antigravity, Pi Agent, and Hermes Agent.
- Explicit controller prompt directives and task skill updates discouraging repetitive model `sleep` or busy-wait polling loops.

### Fixed

- **Long-Running Process Polling Defect (`BUG-06`)**: Detached jobs and exact task observation replace model-driven polling on the runtime path. Local release audit at `f5af5ab` passed (1,820 total, 1,809 passed, 0 failed, 11 skipped; ordinary 1,810 and packed 10). Completion/safety/integration criteria passed 7/17/4 named tests; provenance and Stage 1 passed. Host wakeups, subscription savings and quota remediation are not guaranteed.
- Job startup defers unrelated installer imports. Release verification exhaustively partitions compiled tests into ordinary and packed groups with separate existing 20-minute child bounds; runner environment scrubbing and assertions remain intact. The historical 0.4.1 plan is delivered as 0.4.5 above original main 0.4.4.
- **Task Lifetime Documentation Correction**: Clarified that `alpha-aos task start --apply` is foreground and awaited by default; detached independent process lifetimes are managed via `alpha-aos job start --apply`.

### Security

- Command jobs enforce a restricted environment allowlist (stripping provider credentials and `NODE_OPTIONS`), reject secret-bearing argument arrays, isolate state to `~/.alpha-aos/jobs/`, enforce owner fencing on cancel, and preserve exact argv arrays without shell concatenation.

## [0.4.4] - 2026-10-26

### Added

- **Multi-Phase GSD Autopilot Engine in `alpha-aos task start`**:
  - Integrated full multi-phase/multi-milestone progression (`startMultiPhaseTask`) directly into `alpha-aos task start` when `scope.workflow` is `"gsd-multi-phase"` or `"gsd"`.
  - Added `buildGsdStepWorkflowPrompt` and `resolveDefaultGsdHarnessCommand` in `src/core/task-gsd-lifecycle.ts` to automatically construct default harness command vectors (`agy`, `claude`, `codex`, `pi`, `hermes`) for all GSD lifecycle steps without requiring ad-hoc project runner scripts.
  - Automatically advances through `discuss`, `plan`, `execute`, and `verify` across all planned phases discovered in `.planning/ROADMAP.md` and generates final milestone review.

### Fixed

- **Autonomous Autopilot Inline Chat Execution Prevention (Fail-Closed Invariant)**:
  - Formulated and enforced a strict governance invariant in `AGENTS.md` and `skills/alpha-aos-task/SKILL.md`: chat UI agents are strictly prohibited from performing inline file writes (`write_file`, `edit_file`) for tasks operating in `mode: autopilot`.
  - Guarantees model policy integrity: inline chat execution binds model reasoning to whatever model the user has selected in the chat UI dropdown (e.g. Gemini Flash); running through the headless supervisor (`alpha-aos task start`) guarantees that contracted model flags (`--model`) are explicitly passed to isolated child processes.
- **Harness Argument Positioning and Windows Spawn Safety**:
  - Fixed argument ordering for `agy`: ensures `-p` / `--print` is placed immediately before the prompt string, and `--model` is inserted before `-p`.
  - Corrected role mapping in `executeGsdStep`: `discuss` and `plan` steps are correctly assigned to `"controller"` (resolving `controllerModel` such as Gemini 4 Argon) while `execute` is `"executor"` and `verify` is `"reviewer"`.
  - Fixed Windows child process spawning for `agy.exe` to avoid `cmd.exe` argument mangling.

## [0.4.3] - 2026-10-26

### Fixed

- **Weekly Automated Dependency Promotion on Windows CI Runners**:
  - `src/core/mcp-proxy.ts`: Passed explicit `DEFAULT_MCP_PROXY_TIMEOUT_MS = 180_000` (3 minutes) to `@modelcontextprotocol/sdk` `client.connect()`, `client.listTools()`, and `client.callTool()` calls. Prevents cold `npx` package downloads and initialization on slow Windows CI runners (`windows-latest`) from hitting the MCP SDK's default 60s timeout (`ErrorCode.RequestTimeout: Request timed out`, code `-32001`).
  - `src/core/mcp-fixture.ts`: Raised `discoverTools` awaited reply timeout from 150s to 180s to align with the proxy timeout ceiling.
  - Fixes Monday `dependency-candidate.yml` fixture failure and subsequent Wednesday `auto-promote.yml` aborts.
- **Cross-Platform Path Containment for Computer-Use Audit Evidence**:
  - `src/core/computer-use-audit.ts`: Allowed macOS system root symlinks (`/var`, `/tmp`, `/etc`) in `safeComputerPath`.
  - Normalized both parent and child paths via `realpath` before relative path containment verification in `verifyComputerAudit`, preventing false-positive root escape errors caused by Windows 8.3 short paths (`RUNNER~1`) on CI runners.

### Fixed

- **Deterministic Cross-Harness Model Enforcement**:
  - Full model CLI argument injection (`--model` / `-m`) across all 5 supported harnesses: `antigravity`, `claude`, `codex`, `pi`, and `hermes`.
  - Universal role-model resolution engine (`resolveHarnessRoleModel` in `task-agent-launch.ts`) with strict precedence ladder: direct options > contract `agentPolicy` (`controllerModel`, `executorModel`, `reviewerModel`) > project `.planning/config.json`.
  - `canonicalModelToAntigravityTier`: normalizes canonical model IDs (`gemini-4-argon-high`, `gemini-3.8-flash-high`, `claude-3-5-sonnet`, etc.) into native Antigravity subagent Model enums (`"pro"`, `"flash"`, `"flash_lite"`, `"inherit"`).
  - Subagent dispatch guard (`validateAntigravitySubagentDispatch` / `assertAntigravitySubagentDispatch`): prevents silent parent-model inheritance downgrades when Antigravity `invoke_subagent` is invoked with `typeName: "self"`.
  - `assertModelCompliance`: fail-closed guard throwing `MODEL_ENFORCEMENT_VIOLATION` on model mismatch or missing model.
  - GSD lifecycle step model injection in `executeGsdStep`: automatically detects AI harness CLI commands and injects the contracted model for discuss/plan/execute/verify steps.
  - Cross-harness delegation: guarantees that when Controller in Harness A delegates Review/Reasoning to Harness B, Harness B is invoked with its exact contracted model.
  - Comprehensive test suite: `test/task-cross-harness-models.test.ts` covering precedence, sanitization, argument vectors, cross-delegation, and subagent dispatch guards.
- **Promoted Upstream Tool Dependencies**:
  - `@opengsd/gsd-core`: `1.16.0` -> `1.18.0`
  - `@upstash/context7-mcp`: `4.3.0` -> `4.4.4`
  - `firecrawl-mcp`: `3.29.1` -> `3.34.1`
  - `pi-mcp-adapter`: `5.2.0` -> `6.0.0`
  - Verified live SRI registry integrity and reconciled across all 5 harnesses.

## [0.4.0] - 2026-10-21

### Added

- Optional task-bound computer-use CLI/MCP broker with closed digest-bound authority, exact target/runtime checks, finite budgets, persistent emergency stop and fresh observed postconditions.
- Immutable validated PNG captures, durable chained intents/results, trusted-anchor replay, interrupted/unknown evidence and reviewed retention tombstones.
- Explicit COMPUTER_USE pack/guidance, five harness routing, inventory and mandatory GUI security-review surfaces; old task contracts retain their digest and grant no GUI access.
- Host-free production checks, adversarial coverage, a controlled Windows CLI/MCP run with six actions and twenty replay-verified audit events, verified optional Cua 0.37.0 provenance and explicit platform evidence. macOS/Linux live actions remain untested here.

### Security

- No new external npm runtime dependency or stable dependency promotion. Raw native tools, secret typing, arbitrary launch arguments and full-desktop fallback are denied. Public-data capture is an explicit reviewed classification, not a secret-detection guarantee.

## [0.3.1] - 2026-10-18

### Fixed

- **Antigravity Model Tier Routing (`BUG-01`)**: Antigravity adapter now passes `--model <model-id>` to avoid falling back to exhausted default quota tiers. Models resolve from `adapterModel` -> `contract.agentPolicy.{controllerModel,executorModel,reviewerModel}` -> `.planning/config.json` (`model_profile_overrides` / `review.cross_ai_command`).
- **Antigravity Subagent Inheritance Guardrails (`BUG-05`)**: Added fail-closed `INCOMPATIBLE_SUBAGENT_MODEL` check and controller prompt guardrails when Antigravity `invoke_subagent` is called with `typeName: "self"` and explicit model overrides.
- **Harness Role Receipt Drift Recovery (`BUG-02`)**: Host binary updates causing `binarySha256` or CLI version mismatch can now be automatically re-probed and atomically updated via `reprobeHarnessRoleReceipt` and CLI `--probe` flag (`alpha-aos task doctor --probe`, `task start --probe`, `task resume --probe`).
- **Snapshot `.planning` Read-Only Mirroring (`BUG-03`)**: `materializeTaskSnapshot` mirrors regular files under `<projectRoot>/.planning` (`ROADMAP.md`, `STATE.md`, etc.) into isolated snapshots without altering the artifact manifest hash, enabling criterion measurements and reviewers to read planning state.
- **GSD Quick Retry Resilience (`BUG-04`)**: `verifyGsdEvidence` now accepts `allowExistingClaimedQuick` so contract retries and revisions > 1 can verify pre-existing claimed `.planning/quick/<id>` directories and their `docs(quick-<id>)` commits across git history.

## [0.4.1] - 2026-10-22

### Changed

- Claude Code returns to the active harness scope alongside Codex, Antigravity, Pi, and Hermes (decision D-18). It had been excluded as compatibility residue only because no account was available to produce evidence with, which was never a statement about the integration.
- The support matrix judges Claude Code by the same evidence rule as every other harness. `evaluateMatrixCell` no longer fixes a Claude tier ahead of the evidence, and the active-surface table covers every harness id, so a matching inspectable receipt promotes a Claude cell and the absence of one leaves it `UNVERIFIED`.

### Fixed

- A Claude canary can authenticate. Claude Code keeps its login inside `CLAUDE_CONFIG_DIR`, which a canary runtime replaces, so every isolated run started logged out and ended at `Not logged in` after spending a model turn. The runtime now hard-links the existing login into itself — by reference, never reading or copying the credential, the same treatment the Codex canary already gives the caller's login — and refuses before spending when no link can be made.
- A Claude canary can reach its own observation front. Isolation hides the caller's tool approvals and `-p` cannot prompt for one, so fronted calls were denied before the proxy ever saw them: a measured run recorded `permission_denials` naming the exact tool the canary expects while the observation sink stayed empty, which alpha-AOS scored as the harness failing to route. Canary launches now grant the servers the runtime fronts, by server rather than by tool name, so fan-out and forbidden-tool controls stay observable.

### Documentation

- `docs/RELEASE_NOTES_v0.1.0.md` no longer states that Claude Code is excluded from support claims and release gates, and carries a dated amendment recording why the earlier exclusion existed.
- The handoff pair table's rationale describes the list it actually declares: codex-receiving pairs lead on retained evidence, and the claude-receiving fallbacks trail because of the credential constraint above rather than because of a superseded scope decision.

## [0.1.0] - 2026-09-20

### Added

- Declarative, preview-first installation and reconciliation for supported agent harnesses.
- Evidence-matched project capability packs and native optional capability routing.
- Mandatory GSD quality gates for security- and migration-sensitive work.
- Persistent directory tree-off policy that keeps opted-out trees free of alpha-AOS-managed global customization.
- Transactional managed lifecycle operations covering status, doctor, rollback, repair, and uninstall.
- One authoritative allowlisted release tarball, cross-platform fixture verification, and cryptographic provenance records.

### Security

- Release archives exclude candidate locks, planning state, tests, sources, and other unreviewed local artifacts.
- Provenance verification binds the archive SHA-256, `dist/build-artifact.json`, `catalog/stack.lock.json`, and every packaged `dist` output recorded by the build artifact manifest.
- Preview remains the default; public publication requires the explicit `--publish` release flag after all verification gates pass.

## Active Harnesses

Claude Code, Codex, Antigravity, Pi, and Hermes are the active target scope. “Active” identifies product scope; it does not itself mean a live capability is **PROVEN**. The committed [support matrix](docs/SUPPORT_MATRIX.md) is authoritative and currently reports live rows as **UNVERIFIED** until a matching, inspectable invocation receipt exists. Antigravity remains **UNVERIFIED** where the closed host ledger cannot represent its invocation proof.

## Claude Code Status

Claude Code is judged by the same evidence rule as every other harness: the support matrix no longer fixes its tier ahead of the evidence. No invocation receipt exists for it yet, so its cells read **UNVERIFIED** rather than **PROVEN**. Earlier revisions of this file described Claude Code as compatibility **RESIDUE** outside support and release gates; that exclusion was made when no account was available to produce evidence with, and decision D-18 (2026-09-22) ended it.

A Claude canary runs on the login you already have: the runtime hard-links it in by reference, never reading or copying the credential, and refuses before spending when no such link can be made.

## Known Platform Limitations

- Windows supplies floor environment names including `USERPROFILE` and `APPDATA` to child processes. alpha-AOS redirects relevant values inside fixtures and redacts diagnostics; it does not promise those OS-provided names are absent.
- OS/container-backed `sealed` isolation (`SEAL-01`) is deferred to v2. v0.1.0 `project-only` mode is configuration isolation, not a security sandbox, and `sealed` continues to fail closed without an adapter.

[0.1.0]: https://github.com/4lph4-dvlp/alpha-AOS/releases/tag/v0.1.0
