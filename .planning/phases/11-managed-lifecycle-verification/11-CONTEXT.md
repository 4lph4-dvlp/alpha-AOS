# Phase 11: Managed Lifecycle Verification - Context

**Gathered:** 2026-09-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Produce `.planning/milestones/v0.1.0-phases/06-managed-lifecycle-uninstall-and-recovery/06-VERIFICATION.md`: a verification report in which each of LIFE-01..08 carries a verdict backed by inspectable evidence (command + output, named test + result, or CI run id). Record every unmet clause as a named gap. Close or narrow the v0.1.0 "LIFE-01..08 unverified" known gap in the milestone record. This phase delivers LIFE-09.

This phase **verifies**. It does not repair the product. `src/` is not modified. Gaps are recorded and routed to later work.

Out of scope: fixing lifecycle defects found during verification, Claude Code real-host invocation receipts (G-07-2 / REL-02), dependency promotion (Phase 13), red-main guard (Phase 12).

</domain>

<decisions>
## Implementation Decisions

### Evidence standard and verdict grades
- **D-01:** Every verdict rests on evidence produced **in this phase** against the current code. Re-run the Phase 6 suites (`test/lifecycle`, `status`, `recovery-receipt`, `repair`, `rollback`, `uninstall`) and capture the command and its output. **In addition**, exercise each user-facing lifecycle behavior through the **packed CLI** (`npm pack` tarball installed into an isolated sandbox) with the sandbox env shape from `createIsolatedSandbox()` in `test/tarball-fixture.test.ts`. The behaviors are `install`/`plan` reconcile → `CURRENT`, `status`, `doctor`, `uninstall`, `rollback`, `repair`, and `update` preview/apply. Phase 6 SUMMARY `coverage:` blocks and `requirements-completed:` claims are **not** evidence. They are only leads for where to look.
- **D-02:** Verdict grades are **VERIFIED / PARTIAL / GAP**.
  - VERIFIED: every clause of the LIFE text has passing evidence.
  - PARTIAL: some clauses are evidenced. Each unevidenced or failing clause is listed as a named gap.
  - GAP: the core promise is not met.
  - A requirement with any unmet clause is never marked VERIFIED (SC3).
- **D-03:** OS scope. Fresh evidence is generated on the local Windows 11 developer host. POSIX coverage is corroborated by citing the same tests passing in `main` push run `35818198049` attempt 1 (ubuntu/macOS/windows all green, per `.planning/phases/10-three-os-ci-baseline/CI_RUN.md`). No new `workflow_dispatch` verification run is required.
- **D-04:** Audit the **oracles**, not just the pass/fail results. For each cited test, check that its assertions actually test the LIFE clause. Examples:
  - Is "<50ms" actually measured?
  - Is "zero writes" / "no mutation" proven by a filesystem snapshot or hash, not inferred?
  - Does "zero subprocesses" intercept the spawn API?
  - Does "refuses on drift" assert that no bytes changed?

  A passing test with a weak or mismatched oracle cannot alone support VERIFIED. That clause is downgraded to PARTIAL with a named gap, unless a packed-CLI probe from D-01 supplies the missing proof.

### Gap handling
- **D-05:** **Record only.** Phase 11 does not modify `src/` to close a gap. Every gap is recorded and routed to follow-up work. This keeps the verdicts independent (the verifier is not the fixer) and holds the roadmap SC3 boundary. — **Reversibility:** reversible — a later phase can fix gaps; nothing is foreclosed.
- **D-06:** Each named gap carries:
  - a stable ID (e.g. `G-11-N`)
  - the LIFE clause it fails
  - what is missing
  - what would close it
  - **a reproduction**: the command or probe and its observed output that demonstrate the defect

  A suspicion from code reading alone is not a confirmed gap. It must be reproduced, or it stays a lead.
- **D-07:** Named gaps are tracked in `06-VERIFICATION.md` **and** registered in the current `.planning/REQUIREMENTS.md` `## Future Requirements` section with their IDs. This follows the REL-02 / G-07-2 pattern already used there.
- **D-08:** Phase 13 gating. Only an open gap against **LIFE-01** (idempotent stable-lock reconcile) or **LIFE-08** (update preview non-mutation / stable-lock-only apply) blocks Phase 13 dependency promotion. Gaps in LIFE-02..07 do not block promotion. The report states explicitly whether Phase 13 is blocked.

### Requirement interpretation
- **D-09:** The **LIFE requirement text is the contract**. Every clause is judged. Examples:
  - LIFE-03: "clean an isolated runtime", "uninstall one target", "without removing harness applications, authentication, or unrelated user resources".
  - LIFE-04: "only **receipted** alpha-AOS-owned bytes or semantic entries **that still match their recorded applied state**".
  - LIFE-07: "shown **verified** external package changes".
  - LIFE-08: "no checkout, package, global-link, configuration, or managed-state mutation".

  Phase 6 decisions D-01..D-16 (`06-CONTEXT.md`) are consulted as the implementation's interpretation. Where an implementation satisfies a D-decision but falls short of the LIFE text, the verdict follows the LIFE text and the shortfall is a gap.
- **D-10:** Harness scope is all **five** active harnesses (Claude Code, Codex, Antigravity, Pi, Hermes). Claude Code became active under D-18 after Phase 6 was built. Its managed config/skill removal and rollback are judged at **sandbox file level** (e.g. `pruneClaudeConfig`, `pruneClaudeSettings`). A Claude Code real-host invocation receipt is **not** required (roadmap planning note; G-07-2 / REL-02 remains future).
- **D-11:** LIFE-02 execution evidence comes from actually running `alpha-aos doctor --discovery` and `alpha-aos doctor --canary --no-spend` locally. Spending (model-turn) canary legs are **not** run, and the report marks them "not executed (cost)". If the no-spend legs do not amount to "meaningful read-only execution evidence" for a harness, LIFE-02 is PARTIAL with a named gap. It is not stretched to VERIFIED.
- **D-12:** Test additions are **allowed under `test/`**. A passing verification probe that fills a weak or missing oracle (e.g. a packed-CLI lifecycle assertion) may be committed as a test so CI keeps guarding it. A **failing** probe that demonstrates a gap is **not** committed as a test, because it would turn `main` red. It lives in the verification record (command + output) and, if useful, in a scratch script referenced by the report. `src/` stays untouched (D-05).

### Phase 10 carry-forward (SC2)
- **D-13:** Phase 10 classified the Windows `~/.alpha-aos` change as a **test-isolation leak**, not a product isolation leak (`.planning/debug/ci02-windows-alpha-aos-host-leak.md`). The LIFE-03/LIFE-04 verdicts cite that record, stating that the host-safety violation was in test code and was fixed and pinned by regression tests (Phase 10 SC4). They do not name a product requirement violation. Host-safety of the product itself is still judged afresh through the packed-CLI probes (D-01).

### Milestone record update
- **D-14:** `.planning/MILESTONES.md` v0.1.0 Known Gaps: **keep the original LIFE line verbatim** as the audit record. Append a dated resolution note (`Closed` or `Narrowed to G-11-…`) pointing to `06-VERIFICATION.md`. The note also records that the windows-latest lifecycle red half of that line was resolved in Phase 10 (debug record + `CI_RUN.md`).
- **D-15:** `.planning/milestones/v0.1.0-REQUIREMENTS.md` updates:
  - Traceability status for each LIFE row becomes `Verified`, `Partial (G-11-…)`, or `Gap (G-11-…)`, each with a pointer to `06-VERIFICATION.md`.
  - The `[ ]` checkbox flips to `[x]` **only** for VERIFIED requirements.
  - The Phase 6 entry in `.planning/milestones/v0.1.0-ROADMAP.md` gains a link to the report.

  Editing these archived records is pre-approved (roadmap planning note, 2026-09-23).
- **D-16:** LIFE-09 is complete when all eight LIFE requirements carry evidence-backed verdicts and every gap is recorded and tracked per D-06/D-07, **even if gaps remain**. Zero gaps is not the bar.
- **D-17:** Independent confirmation: the Phase 11 `gsd-verifier` re-executes a sample of the commands cited in `06-VERIFICATION.md` and confirms the outputs match. This mirrors how Phase 10's verifier re-checked the CI run by id.

### Claude's Discretion
- Report layout: per-requirement clause tables, evidence formatting, and whether to include a summary verdict matrix.
- Gap ID scheme details (`G-11-N` suggested).
- How the packed-CLI probes are orchestrated (one scripted scratch harness vs. per-requirement probes), provided the commands and outputs are captured verbatim and secrets are never printed.
- Plan split and wave ordering (e.g. evidence-collection plans per LIFE group, then report + record updates).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope and requirements
- `.planning/ROADMAP.md` §"Phase 11: Managed Lifecycle Verification": success criteria and the planning note (report location, archive edits approved, no Claude Code real-host receipt)
- `.planning/REQUIREMENTS.md`: LIFE-09, and the `## Future Requirements` section where gaps are registered (D-07)
- `.planning/milestones/v0.1.0-REQUIREMENTS.md`: LIFE-01..08 verbatim text (the contract, D-09) and the traceability rows to update (D-15)
- `.planning/MILESTONES.md` §v0.1.0 Known Gaps: the line to annotate (D-14)
- `.planning/milestones/v0.1.0-ROADMAP.md` §"Phase 6": success criteria and the entry to link (D-15)

### Phase 6 artifacts under verification
- `.planning/milestones/v0.1.0-phases/06-managed-lifecycle-uninstall-and-recovery/06-CONTEXT.md`: D-01..D-16 implementation interpretation (reference, not the bar)
- `.planning/milestones/v0.1.0-phases/06-managed-lifecycle-uninstall-and-recovery/06-0{1,2,3}-SUMMARY.md`: claimed coverage (leads only, not evidence)
- `.planning/milestones/v0.1.0-phases/06-managed-lifecycle-uninstall-and-recovery/06-VALIDATION.md`: per-task test map and the manual-only TTY confirmation check
- `.planning/milestones/v0.1.0-phases/06-managed-lifecycle-uninstall-and-recovery/06-RESEARCH.md`: background on the lifecycle design

### Phase 10 evidence carried forward
- `.planning/debug/ci02-windows-alpha-aos-host-leak.md`: test-isolation leak classification (D-13)
- `.planning/phases/10-three-os-ci-baseline/CI_RUN.md`: run `35818198049` attempt 1, 3-OS green (D-03)
- `.planning/phases/10-three-os-ci-baseline/10-VERIFICATION.md`: example of evidence-backed verification format and re-check style (D-17)

### Format conventions
- `.planning/milestones/v0.1.0-phases/07-cross-platform-release-proof/CI_RUN.md`: evidence record convention

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `createIsolatedSandbox()` in `test/tarball-fixture.test.ts`: reference isolated env (HOME/USERPROFILE/APPDATA/`ALPHA_AOS_STATE_DIR`/harness roots/npm prefix and cache/TEMP) for the packed-CLI probes (D-01)
- `fingerprintManifest` / `hostSnapshot` / `describeHostDrift` in `test/tarball-fixture.test.ts`: byte-level before/after oracle, usable to prove "no mutation" clauses (LIFE-08, LIFE-05 refusal, LIFE-03 preservation)
- The packed release lifecycle test in `test/tarball-fixture.test.ts` already runs install → reconcile → diagnose → uninstall on the packed CLI. It is a starting point for LIFE-01/03 evidence, and its oracle must be audited (D-04)
- Phase 6 suites: `test/lifecycle.test.ts`, `test/status.test.ts`, `test/recovery-receipt.test.ts`, `test/repair.test.ts`, `test/rollback.test.ts`, `test/uninstall.test.ts`

### Leads observed during scouting (unconfirmed; must be reproduced per D-06 before becoming gaps)
- `src/core/uninstall.ts` prunes managed MCP servers by fixed name (`["context7", "exa", "firecrawl"]`) in the Claude/Antigravity/Pi/Hermes pruners. Check whether removal is conditioned on a receipt / recorded applied state as LIFE-04 requires, or whether a user-modified entry of the same name would be removed.
- `createRecoveryReceipt` / `writeRecoveryReceipt` are referenced only from `src/core/uninstall.ts` (outside `recovery-receipt.ts`). Check whether install/update external package changes (GSD, ECC, npm-link, Pi bridge) produce receipts and "verified" change reports as LIFE-07 requires.
- Phase 6 LIFE-02 coverage cites only `status` tests. `doctor --discovery` / `--canary` evidence must come from D-11.
- `src/core/uninstall.ts` shows no reference to isolation runtime cleanup. Check how LIFE-03's "clean an isolated runtime" is reachable (e.g. via `src/core/isolation.ts` `cleanIsolationRuntime` and its CLI route).
- The LIFE-03 interactive TTY `[y/N]` confirmation is marked manual-only in `06-VALIDATION.md`. Decide how to evidence it (e.g. pseudo-TTY probe) or record it as PARTIAL.

### Integration Points
- `src/cli.ts`: routes for `status`, `doctor --discovery|--canary [--no-spend]`, `uninstall [--target|--project|--all] [--purge] [--yes]`, `rollback`, `repair`, `update [--check|--apply]`, `install`/`plan`
- `scripts/run-tests.mjs`: test runner. New `test/` probes (D-12) are picked up automatically

</code_context>

<specifics>
## Specific Ideas

- The report's value is that a reader can re-run any cited command and get the same answer. Evidence is captured verbatim, not paraphrased.
- Never print file contents or credential values in evidence. Use hashes, sizes, and paths, following the Phase 10 drift-report convention.
- Discussion conducted in Korean on 2026-09-23. The user accepted the recommended option on every question.

</specifics>

<deferred>
## Deferred Ideas

- Fixing any LIFE gap found here belongs in a follow-up phase or future requirement (D-05/D-07). It is not folded into Phase 11.
- A spending (model-turn) canary run for LIFE-02 execution evidence is deferred. It can be added later if the no-spend evidence leaves LIFE-02 PARTIAL.

</deferred>

---

*Phase: 11-managed-lifecycle-verification*
*Context gathered: 2026-09-23*
