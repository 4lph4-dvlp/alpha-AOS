# Phase 13: Dependency Candidate Promotion - Context

**Gathered:** 2026-09-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Refresh dependency candidate PR #1 onto a green `main` baseline, execute 3-OS CI and component fixtures, and promote only the components with green, integrity-verified evidence into `catalog/stack.lock.json`. Deliver requirements DEP-01 and DEP-02.

In scope:
- Rebase and update dependency candidate PR #1 (`automation/dependency-candidate`) onto the green `main` commit.
- Confirm PR #1 passes the Red-Main Guard (`scripts/check-main-baseline.mjs`) unblocked.
- Local pre-flight fixture execution (`gsd-fixture`, `ecc-fixture`, `mcp-fixture`) and official GitHub Actions 3-OS CI execution for PR #1.
- Fine-grained per-component promotion: promote only verified components (among @opengsd/gsd-core 1.14.0, ecc-universal 2.2.1, @upstash/context7-mcp 4.1.1, firecrawl-mcp 3.25.2, pi-mcp-adapter 2.36.0) into `catalog/stack.lock.json`.
- Automatic derivation of ECC 2.2.1 pack skill hashes via `scripts/pin-pack-skills.mjs` and code literal updates.
- 4-harness full fixture verification for GSD Core 1.14.0 and compatibility adapter synchronization in `src/core/gsd-compat.ts`.
- Creation of dedicated promotion evidence record (`.planning/phases/13-dependency-candidate-promotion/PROMOTION-EVIDENCE.md`).
- Standardization of future component promotion protocol (`docs/how-to/promote-dependencies.md`) and maintainer automation (`scripts/promote-candidate.mjs`).
- Clean release architecture specification (Strategy B-1) to ensure `.planning/` and internal scratch files are excluded from public releases and clone distributions.

Out of scope:
- Adding new harness capabilities, skills, or packs beyond candidate promotion.
- Modifying `main` CI test suites or test runner fundamentals (completed in Phase 10).
- Promoting unverified candidate dependencies or candidate locks directly to end users.

</domain>

<decisions>
## Implementation Decisions

### Partial Promotion & Lock Management (DEP-01, DEP-02)
- **D-01:** Fine-grained independent component promotion. Components are evaluated and promoted independently. Only components that pass 3-tier verification (registry integrity, isolated fixtures, 3-OS CI) are promoted into `catalog/stack.lock.json`. Any failing component stays at its stable lock version with its failure reason recorded.
- **D-02:** Structured promotion evidence document. Per-component verification results, fixture outputs, and any hold-back reasons are recorded in `.planning/phases/13-dependency-candidate-promotion/PROMOTION-EVIDENCE.md` to preserve strict lock schema compliance while providing a complete, inspectable audit trail.
- **D-03:** Candidate lock reset on main. Once promotion is complete, `catalog/candidate.lock.json` on `main` is reset to `status: "empty"` with empty components (`{}`), ensuring the candidate channel stays clean until the next automated discovery cycle.
- **D-04:** 3-tier green criteria. A component is deemed "green" for promotion if and only if: (1) its SHA-512 integrity matches a fresh registry fetch, (2) its isolated fixture passes cleanly, and (3) the full 3-OS CI suite and packed release lifecycle pass.
- **D-05:** Release sanitation & repository privacy (Strategy B-1). During development, `.planning/` is maintained locally for GSD planning and evidence audits. However, for external distribution and public release (npm packaging and release branch/tag publication), `.planning/` and internal scratch files must be completely excluded and sanitized so external clone users receive only clean product code. — **Reversibility:** costly — establishes the release pipeline packaging contract and repository release hygiene.

### ECC-Universal 2.2.1 & Pack Skills Adaptation
- **D-06:** Automated pack skill derivation via `pin-pack-skills.mjs`. Update ECC version and integrity in lock, then execute `scripts/pin-pack-skills.mjs` to download the 2.2.1 tarball, verify integrity, extract 19 pack skills, and recompute `sourceSha256` and harness `targetSha256` maps atomically.
- **D-07:** Runtime/test literal synchronization with history preservation. Active constants and test assertions referencing `ecc-universal@2.2.0` (such as `src/core/mcp-proxy.ts`, `catalog/canaries.yaml`, and `test/*.test.ts`) are updated to `2.2.1`. Historical documentation (`docs/*-vibe-stack-*`) and archived phase summaries retain their historical `2.2.0` record.
- **D-08:** Skill diff inspection & safety check. Perform a semantic diff of the 19 pack skills between 2.2.0 and 2.2.1 to ensure no unauthorized tools or breaking policy changes were introduced upstream. If a violation is found, `ecc-universal` is held back at 2.2.0.
- **D-09:** CAPA-02 routing reconciliation re-evaluation. Re-evaluate `skills/deep-research/SKILL.md` from the 2.2.1 tarball against the Firecrawl 4-tool allowlist. If the upstream mismatch remains, retain the `narrow` finding updated to 2.2.1; if resolved upstream, update finding status.

### PR #1 Refresh & CI Verification Orchestration
- **D-10:** Linear rebase for PR #1. Rebase `automation/dependency-candidate` onto the latest green `main` and force-push to update PR #1, triggering 3-OS GitHub Actions CI automatically.
- **D-11:** Local pre-flight gate. Run candidate package fixtures and core tests locally on the development host before or alongside PR #1 push to identify obvious failures immediately and avoid burning redundant CI runs.
- **D-12:** Red-Main Guard cross-verification. Verify via GitHub CLI (`gh pr view 1`) and workflow logs that `check-main-baseline.mjs` evaluates `main` as green and PR #1 proceeds unblocked without the `promotion-blocked` label.
- **D-13:** Structured 3-OS matrix evidence. Capture PR #1's GitHub Actions run ID, commit SHA, and 3-OS (Ubuntu, macOS, Windows) matrix outcomes in `PROMOTION-EVIDENCE.md` following the Phase 10 `CI_RUN.md` format.

### GSD Core 1.14.0 Compatibility
- **D-14:** 4-harness full fixture verification. Execute `gsd-fixture` across all 4 supported harnesses (Claude, Codex, Antigravity, Pi) against `@opengsd/gsd-core@1.14.0` tarball, asserting global sentinels unchanged, skill counts consistent, and Codex stop-hook smoke test passes.
- **D-15:** Adapter & renderer hash synchronization. If GSD 1.14.0 updates Codex hook helpers (`hook-exit.js`, `cli-exit.js`, `exit-code-registry.js`) or workflows, verify the changes and synchronize compatibility renderer hashes in `src/core/gsd-compat.ts` and test expectations. If breaking defects exist, hold back GSD at 1.12.0.
- **D-16:** Standard profile spine invariant. Maintain `"profile": "standard"` in lock; custom or divergent profiles remain prohibited per the architecture constraint.
- **D-17:** Complete GSD evidence documentation. Record tarball SHA-512, 4-harness fixture metrics, and renderer diffs in `PROMOTION-EVIDENCE.md`.

### Future Promotion Architecture Standardization
- **D-18:** Category-specific verification gates. Future version promotions across any component must follow standardized gates: (1) MCP servers: stdio JSON-RPC & tool filtering, (2) Skills/packs: tarball extraction, policy diff, and `pin-pack-skills.mjs` hash pinning, (3) Harness bridges: CLI detection & native bridge verification, (4) Workflows: standard profile & 4-harness fixtures. — **Reversibility:** costly — defines the long-term promotion contract across all component classes.
- **D-19:** Official promotion guide. Establish `docs/how-to/promote-dependencies.md` documenting the end-to-end lifecycle (discovery, PR staging, red-main guard, local pre-flight, CI proof, partial promotion, release sanitation).
- **D-20:** Promotion helper tooling. Build `scripts/promote-candidate.mjs` to automate integrity checks, `stack.lock.json` updates, candidate lock cleanup, and lock schema validation to eliminate manual JSON editing errors.
- **D-21:** Automated release sanitation tooling. Code clean-release rules into release automation (`scripts/release.mjs` or `scripts/sanitize-release.mjs`) to guarantee that `.planning/` and scratch directories are excluded from release branches and distribution tarballs.

### Claude's Discretion
- Exact layout and styling of `PROMOTION-EVIDENCE.md`.
- Wave sequencing in `13-PLAN.md` (e.g. Wave 1: PR refresh + pre-flight + tooling, Wave 2: execution + promotion, Wave 3: verification + docs).
- Implementation details of `scripts/promote-candidate.mjs`.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope and requirements
- `.planning/ROADMAP.md` §"Phase 13: Dependency Candidate Promotion" — success criteria, planning note on ecc-universal 2.2.1 and GSD Core 1.14.0.
- `.planning/REQUIREMENTS.md` §"Dependency Promotion" — DEP-01, DEP-02 requirement text.
- `.planning/PROJECT.md` §"Constraints" — Supply Chain (stable lock only), Validation (native execution), Determinism (inspectable hashes).

### Catalog and lock specifications
- `catalog/stack.yaml` — Catalog policy and declared components.
- `catalog/stack.lock.json` — Authority stable lock.
- `catalog/candidate.lock.json` — Unverified candidate lock channel.
- `schemas/lock.schema.json` — Strict closed-world schema for locks.
- `catalog/canaries.yaml` — Declared canary prompts and tool expectations.

### Verification and guard scripts
- `scripts/check-main-baseline.mjs` — Red-Main Guard gate script.
- `scripts/red-main-guard.mjs` — Tracking issue automation.
- `scripts/pin-pack-skills.mjs` — Pack skills extractor and hash pinner.
- `scripts/audit-tarball.mjs` — Tarball allowlist auditor and packaging security guard.
- `.github/workflows/dependency-candidate.yml` — Automated candidate discovery and PR workflow.
- `.github/workflows/ci.yml` — 3-OS CI matrix workflow.

### Core implementation references
- `src/core/update.ts` — Candidate resolution and staging logic.
- `src/core/ecc-fixture.ts` — ECC runtime fixture.
- `src/core/gsd-fixture.ts` — 4-harness GSD fixture.
- `src/core/mcp-fixture.ts` — Stdio MCP server fixture.
- `src/core/gsd-compat.ts` — Codex GSD hooks and compatibility renderer.
- `src/core/mcp-proxy.ts` — Policy proxy and tool filtering.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `scripts/pin-pack-skills.mjs`: Already extracts skills and computes SHA256 hashes for all packs; ready to run for 2.2.1.
- `src/core/update.ts` (`resolveCandidate`, `renderCandidate`): Reusable candidate lock generation and formatting logic.
- `scripts/audit-tarball.mjs`: Positive allowlist enforcement that already forbids `.planning/` in release archives.
- `scripts/check-main-baseline.mjs`: Production-tested in Phase 12 to query `main` status via GitHub CLI.

### Established Patterns
- All scripts under `scripts/` use pure Node.js ES modules (`.mjs`) with built-in APIs (`node:fs`, `node:crypto`, `node:child_process`).
- Unit tests under `test/*.test.ts` compiled with strict TypeScript and run via `scripts/run-tests.mjs`.
- Evidence files formatted with raw command output and GitHub Actions Run IDs.

### Integration Points
- `catalog/stack.lock.json`: Primary target modified upon promotion.
- `catalog/candidate.lock.json`: Reset to empty on promotion.
- `scripts/promote-candidate.mjs`: New maintainer helper script.
- `docs/how-to/promote-dependencies.md`: New developer documentation.
- `src/core/mcp-proxy.ts`, `catalog/canaries.yaml`: Runtime constants updated for 2.2.1.

</code_context>

<specifics>
## Specific Ideas

- The user specifically raised concerns about repository distribution when users clone from GitHub, prompting the establishment of Strategy B-1 (clean release branch/tag without `.planning` leakage).
- All discussion conducted in Korean on 2026-09-24/2026-09-25.
- User explicitly confirmed: fine-grained partial promotion, 4-harness full GSD fixture, automated skill hash pinning, and standardization of future promotion architecture.

</specifics>

<deferred>
## Deferred Ideas

- None — discussion stayed strictly within the phase boundary and future maintenance scope.

</deferred>

---

*Phase: 13-dependency-candidate-promotion*
*Context gathered: 2026-09-25*
