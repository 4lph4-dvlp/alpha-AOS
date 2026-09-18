# Phase 7: Cross-Platform Release Proof - Context

**Gathered:** 2026-09-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Qualify one allowlisted v0.1.0 release artifact with three-OS fixtures, real-host canaries, paired positive/negative acceptance controls, and a complete brownfield GSD cycle across active harnesses (Codex, Antigravity, Pi, and Hermes), while Claude Code remains compatibility residue.

This phase owns REL-01 through REL-06:
- REL-01: Identical packed release bytes install, reconcile, diagnose, and uninstall in Windows, macOS, and Linux fixture environments without touching real shared roots.
- REL-02: Versioned support matrix in which every active claimed harness has at least one current real-host discovery and invocation canary, while Claude Code remains compatibility residue and other unproven combinations remain visibly limited or unsupported.
- REL-03: Paired positive and negative controls proving native optional invocation, project-only capability scope, mandatory gate blocking, and tree-off opt-out exclusion.
- REL-04: Full brownfield GSD discuss → plan → execute → verify → ship cycle with one GSD writer exercising one global optional capability, one project pack, one mandatory gate, one cross-harness handoff, and safe cleanup.
- REL-05: Published v0.1.0 package excludes candidate locks and local state, contains only allowlisted release files, and matches the byte-identical tarball tested across all three operating systems.
- REL-06: Cryptographic release provenance, frozen stable lock, release notes, limitations, and fresh-install smoke test from the public registry.

Explicitly NOT in this phase:
- Adding new feature capabilities or changing GSD Core standard workflow semantics.
- Promoting Claude Code to an actively supported or gated harness.
- OS/container-level `sealed` sandboxing (v2 requirement SEAL-01).
</domain>

<decisions>
## Implementation Decisions

### 1. Cross-Platform Fixture Matrix & CI Packaging Pipeline (REL-01, REL-05)
- **D-01:** **Authoritative Single Tarball Build in CI**: CI builds and packs a single `alpha-aos-0.1.0.tgz` on an authoritative runner (e.g. ubuntu-latest), uploads it as a workflow artifact, and all three OS matrix jobs (Windows, macOS, Linux) download and test the exact same byte-identical tarball. — **Reversibility:** one-way — core release pipeline contract guaranteeing byte identity across operating systems.
- **D-02:** **Package Whitelist & Tarball Content Audit**: Update `package.json` `files` field and `.npmignore` to strictly exclude `catalog/candidate.lock.json` and local dev state. Introduce `scripts/audit-tarball.mjs` (called during prepack/CI) that unpacks and inspects the tarball manifest and fails closed if any unallowlisted or candidate file is present. — **Reversibility:** costly — packaging configuration and prepack verification hook.
- **D-03:** **Temp-Root & Environment Override Sandbox**: Fixture runs on each OS create a unique isolated temporary directory (`mkdtemp`) and redirect `ALPHA_AOS_STATE_DIR`, harness configuration directories (`CODEX_HOME`, `ANTIGRAVITY_CONFIG_DIR`, etc.), and `npm_config_prefix` into that sandbox, preserving 100% of the host machine's actual home directories and global packages. — **Reversibility:** reversible.
- **D-04:** **Full Lifecycle Fixture Suite**: The fixture test suite on Windows, macOS, and Linux executes the complete lifecycle sequentially: [Isolated Prefix Install] → [`install --apply`] → [Second `install` verifying `CURRENT` idempotency] → [`status` and `doctor` passing] → [`uninstall --all --yes` verifying clean baseline restoration]. — **Reversibility:** costly — multi-platform CI verification suite.

### 2. Versioned Support Matrix & Real-Host Canaries (REL-02, REL-03)
- **D-05:** **Structured Ledger Source with CLI & Doc Sync**: Define the official support matrix as structured data in `src/core/support-matrix.ts`, renderable via both `alpha-aos doctor --matrix` in the CLI and exported to `docs/SUPPORT_MATRIX.md`. — **Reversibility:** costly — cross-cutting public contract for CLI diagnostics and documentation.
- **D-06:** **Isolated Real-Host Canary Runner & Redacted Receipts**: Provide `alpha-aos doctor --canary [harness]` to run representative, cost-bounded native invocations on active harnesses (Codex, Antigravity, Pi, Hermes). Capture verified observations into redacted canary receipts while reporting uninstalled or unprobed harnesses honestly as `UNVERIFIED`. — **Reversibility:** costly — canary runner interface and receipt schemas.
- **D-07:** **Automated Paired Positive/Negative Controls**: Implement `test/release-controls.test.ts` covering 4 critical domains with explicit Positive and Negative control pairs:
  1. *Optional Capability Invocation*: Positive (intent triggers Context7) vs Negative (unmatched task does not invoke).
  2. *Project Pack Scope*: Positive (tools discoverable inside project root) vs Negative (undiscoverable outside project).
  3. *Mandatory Gate Blocking*: Positive (auth/migration risk blocks lifecycle) vs Negative (low-risk work bypasses gate).
  4. *Tree-Off Opt-Out*: Positive (managed repo activates alpha-AOS) vs Negative (tree marked `off` loads zero customizations).
  Output an inspectable report artifact (`docs/RELEASE_CONTROLS.md`). — **Reversibility:** costly — acceptance verification suite and evidence schema.
- **D-08:** **Four-Tier Status Taxonomy**: Harness/surface capabilities are classified into 4 mutually exclusive states: `PROVEN` (real-host canary passed), `RESIDUE` (Claude Code compatibility residue only), `UNVERIFIED` (detected on host but canary not run), and `UNSUPPORTED` (incompatible on target OS/version). False success states are strictly prohibited. — **Reversibility:** costly — system-wide diagnostic status taxonomy.

### 3. Brownfield E2E GSD Full Lifecycle Verification (REL-04)
- **D-09:** **Self-Contained Brownfield Git Fixture Workspace**: Create a realistic brownfield repository under `test/fixtures/brownfield-gsd-cycle` containing existing code and `.planning/` state. Tests clone this fixture into a temporary sandbox and drive the full GSD cycle: discuss → plan → execute → verify → ship. — **Reversibility:** costly — complex integration test fixture.
- **D-10:** **Representative 5-Element Benchmark Set**: The brownfield E2E cycle exercises:
  1. *1 Global Optional Capability*: Context7 version-sensitive documentation lookup.
  2. *1 Project Pack*: Node/TypeScript Web API pack matched by repository evidence.
  3. *1 Mandatory Gate*: Authentication boundary security gate blocking progress until passed.
  4. *1 Cross-Harness Handoff*: Unified Memory context handoff between Codex and Antigravity.
  5. *Safe Cleanup*: `alpha-aos uninstall --project <path>` cleanly restoring the project baseline. — **Reversibility:** costly — end-to-end integration benchmark specifications.
- **D-11:** **Single GSD Writer Enforcement**: Verify that `.planning/` state transitions strictly maintain `writer.lock` under a single GSD controller. Worker harnesses and memory handoffs are forbidden from directly mutating `.planning/` files, verified via file integrity watchers and lock assertions. — **Reversibility:** one-way — core GSD architectural invariant.
- **D-12:** **Dual Execution Vector (CI + Standalone Script)**: Implement the cycle as both an automated CI regression suite (`test/brownfield-gsd-cycle.test.ts` with deterministic harness drivers) and an executable CLI script (`scripts/run-brownfield-proof.mjs`) for manual auditor reproduction. — **Reversibility:** reversible.

### 4. Release Provenance, Publish Gates & Smoke Verification (REL-05, REL-06)
- **D-13:** **Cryptographic Provenance Bundle**: Generate SHA-256 checksums (`alpha-aos-0.1.0.tgz.sha256`), include build manifest (`dist/build-manifest.json`), and verify `catalog/stack.lock.json` integrity. Provide `scripts/verify-provenance.mjs` for one-click verification of downloaded release tarballs. — **Reversibility:** one-way — published release provenance format.
- **D-14:** **Standardized Release Notes & Known Limitations**: Structure `CHANGELOG.md` and `docs/RELEASE_NOTES_v0.1.0.md` with explicit sections for [Active Harnesses: Codex, Antigravity, Pi, Hermes], [Compatibility Residue: Claude Code], and [Known Platform Limitations: Windows floor environment variables, v2 deferred sealed container mode]. — **Reversibility:** reversible.
- **D-15:** **Two-Stage Smoke Verification Gate**:
  - *Stage 1 (Pre-publish)*: Install local `alpha-aos-0.1.0.tgz` in a clean temporary environment via `scripts/smoke-test.mjs`, asserting `--version`, `status`, and `doctor` exit 0.
  - *Stage 2 (Post-publish)*: Verify fresh public registry install (`npm install -g alpha-aos@0.1.0`) against the same smoke assertions before declaring the release complete. — **Reversibility:** costly — release gate pipeline.
- **D-16:** **Preview-First Release Script (`scripts/release.mjs --dry-run`)**: Default to a non-mutating preview that validates Git clean state, tests, tarball contents, and SHA-256 hashes, entering the actual publish step only when an explicit `--publish` flag is supplied. — **Reversibility:** costly — release orchestration tooling.

### the agent's Discretion
- Terminal color formatting and layout for `alpha-aos doctor --matrix`.
- Internal helper structure of `scripts/audit-tarball.mjs` and `scripts/verify-provenance.mjs`.
- Exact test repo mock data for `test/fixtures/brownfield-gsd-cycle`.

### Folded Todos
None.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Product Specifications and Core Architecture
- `.planning/PROJECT.md` — Control plane values, cross-platform constraints, safe mutation invariants, and secrets handling.
- `.planning/REQUIREMENTS.md` §Cross-Platform Release Proof — REL-01 through REL-06 requirements verbatim.
- `.planning/ROADMAP.md` §Phase 7 — Goals, success criteria, and deliverables for Phase 7.
- `.planning/phases/01-safe-operation-boundary/01-CONTEXT.md` — Safe preview, platform environment floors, and bounded processes.
- `.planning/phases/03-transactional-project-packs-and-native-optional-use/03-CONTEXT.md` — Project capability packs and canary evidence projection.
- `.planning/phases/04-mandatory-gsd-gates/04-CONTEXT.md` — Single GSD writer principle and mandatory gate triggers.
- `.planning/phases/05-persistent-tree-off-preload-isolation/05-CONTEXT.md` — Directory opt-out and preload isolation.
- `.planning/phases/06-managed-lifecycle-uninstall-and-recovery/06-CONTEXT.md` — Full lifecycle reconciliation, status/doctor, rollback, and uninstall.

### Packaging, CI, and Automation
- `package.json` — Package metadata, files allowlist, scripts (`build`, `test`, `prepack`), dependencies.
- `.github/workflows/ci.yml` — Multi-OS CI matrix (ubuntu-latest, macos-latest, windows-latest) and test jobs.
- `catalog/stack.yaml` — Stack catalog definition.
- `catalog/stack.lock.json` — Pinned stable dependency versions and hashes.
- `scripts/build-artifact.mjs` — Build artifact manifest generation and verification.
- `scripts/run-tests.mjs` — Environment-isolated test runner.
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `scripts/build-artifact.mjs`: Established pattern for deterministic build manifest creation and verification.
- `scripts/run-tests.mjs`: Existing mechanism for running tests with controlled, stripped environment variables.
- `src/core/doctor.ts`: Structured diagnostic findings and health checks extensible for support matrix rendering.
- `src/core/writer-lock.ts`: Safe writer locking mechanisms protecting `.planning/` state transitions.
- `src/core/transaction.ts`: Atomic transactional file modifications and uninstall engines.

### Established Patterns
- Pure preview/dry-run by default before mutating operations.
- Fail-closed on any schema violation, missing evidence, or unexpected file drift.
- Isolated test sandboxes using `mkdtemp` and cleanup hooks.
- Exact hash verification for all stable lock dependencies and release artifacts.

### Integration Points
- `.github/workflows/ci.yml`: Extend CI with authoritative packaging job, artifact upload, and 3-OS tarball fixture matrix.
- `src/cli.ts`: Wire `alpha-aos doctor --matrix` and support commands.
- `scripts/audit-tarball.mjs`: New tarball content validator hooked into prepack/CI.
- `scripts/smoke-test.mjs`: New clean environment smoke test runner.
- `scripts/release.mjs`: New dry-run-first release orchestration script.
- `test/release-controls.test.ts`: New test suite for paired positive/negative acceptance controls.
- `test/brownfield-gsd-cycle.test.ts`: New E2E test suite for the brownfield GSD lifecycle.
</code_context>

<specifics>
## Specific Ideas

- Discussion conducted in Korean on 2026-09-18.
- User selected all 4 proposed gray areas and unanimously endorsed the builder-recommended architectural defaults.
- Candidate lock (`catalog/candidate.lock.json`) and local state are strictly prevented from entering the release tarball via both `files` filtering and a dedicated audit script.
- Single GSD writer invariant is strictly proven and defended during cross-harness handoffs.
- Claude Code is explicitly categorized as `RESIDUE` in the support matrix, while Codex, Antigravity, Pi, and Hermes are the actively claimed release targets.
</specifics>

<deferred>
## Deferred Ideas

- OS/container-level `sealed` sandbox mode deferred to v2 (SEAL-01).

### Reviewed Todos (not folded)
None — discussion stayed within phase scope.
</deferred>

---

*Phase: 07-Cross-Platform Release Proof*
*Context gathered: 2026-09-18*
