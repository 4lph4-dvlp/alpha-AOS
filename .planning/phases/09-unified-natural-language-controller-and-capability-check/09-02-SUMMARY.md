# Phase 09 Plan 02 Summary: Policy Embedding, Control Tests, Bilingual Documentation & Live Materialization

## 1. Outcome
- **Execution Policy Checkpoint (CTRL-02)**:
  - Updated `docs/codex-execution-policy.md` with the capability checkpoint rule:
    `- At project setup completion (manifests, dependencies, or scaffolding), run alpha-aos-control to evaluate project capability packs before continuing.`
  - Tightened phrasing to ensure the document size is 1,857 characters, strictly under the 2,000-character native Codex prompt ceiling.
- **Comprehensive Control Test Suite (CTRL-01, CTRL-02, CTRL-03)**:
  - Authored `test/control.test.ts` (6 comprehensive test suites covering all 5 operational domains):
    1. Skill definition completeness & multi-domain instruction coverage.
    2. Catalog and stack lock declaration across all 5 harnesses with `invocation: automatic`.
    3. Autonomous pack advisory lifecycle (plan -> exact 64-character SHA-256 approval -> sync -> `CURRENT` verification).
    4. Anti-tampering & security invariants (tampered digest rejection, unapproved sync refusal, workspace drift detection).
    5. Directory Tree Policy via external registry (tree-off without touching target repo files, and tree-inherit restoration).
    6. System diagnostics (`status` & `doctor`) and safety mechanisms (transactional rollback with drift rejection and crash recovery).
  - Cleanly removed deprecated `test/pack-advisor.test.ts`.
  - Updated `test/install.test.ts` to assert `alpha-aos-control` across harnesses.
- **Bilingual Documentation (CTRL-01, CTRL-03)**:
  - Updated `README.md` and `README.ko.md` with complete documentation for `alpha-aos-control`:
    - Natural language control scenarios for external project repositories.
    - Automatic 2 → 3 checkpoint trigger upon environment setup completion.
    - Directory tree exclusion (`tree-off`), restoration (`tree-inherit`), diagnostics (`status`/`doctor`), rollback, and repair.
- **GSD Codex Compatibility Fix**:
  - Identified and fixed 4096-byte process excerpt truncation in `src/core/gsd-compat.ts` during `npm pack --json` parsing.
  - Replaced stream excerpt JSON parsing with `soleArchive` and `tarballIntegrity` (matching the proven pattern from `src/core/ecc-fixture.ts`), ensuring robust multi-kilobyte package handling across all platforms.
- **Full Verification & Live Materialization**:
  - `npm test`: 906 tests, 897 passed, 0 failed, 9 skipped (100% green).
  - Materialized `alpha-aos-control` via `node dist/src/cli.js install --apply --target antigravity,codex,claude,pi` to user harness skill directories on disk:
    - Antigravity: `~/.gemini/config/skills/alpha-aos-control/SKILL.md` (8,231 bytes)
    - Claude: `~/.claude/skills/alpha-aos-control/SKILL.md` (8,231 bytes)
    - Codex & Pi: `~/.agents/skills/alpha-aos-control/SKILL.md` (8,231 bytes)

## 2. Invariants Maintained
- **Fail-Closed Verification**: Digest verification strictly requires 64-character SHA-256 strings.
- **Zero-Pollution Isolation**: Tree-off policy mutates only the external user registry, leaving project repositories completely untouched.
- **Cross-Platform & Cross-Harness Parity**: All 5 AI harnesses (Claude, Codex, Antigravity, Pi, Hermes) are natively supported.
