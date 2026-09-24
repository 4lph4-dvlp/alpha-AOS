# Requirements: alpha-AOS v0.1.1 CI Green & Dependency Promotion

**Defined:** 2026-09-23
**Core Value:** A user can enter any supported project on any supported operating system and get the same intentional AI-agent workflow, capability boundaries, and safety guarantees without manually rebuilding each harness configuration.

## v0.1.1 Requirements

### CI Baseline

- [x] **CI-01**: User running the suite on ubuntu or macOS sees `destinationFor resolves destinations across all five harnesses` pass, because its fixture root is built with the host platform's path APIs, and no test in `test/` asserts against a platform-specific absolute path literal
- [x] **CI-02**: User running the packed release lifecycle (install, reconcile, diagnose, uninstall) on Windows leaves every real host managed path, including `~/.alpha-aos`, byte-identical; the root cause is classified as a product isolation leak, a test-oracle defect, or a test-isolation leak (another test file writing the real host state during the lifecycle's snapshot window), recorded, and pinned by a regression test
- [x] **CI-03**: User sees `main` CI pass on ubuntu-latest, macos-latest, and windows-latest in a single run id
- [x] **CI-04**: User sees a red `main` CI surfaced as an opened or refreshed tracking issue that closes when `main` is green again

### Lifecycle Verification

- [ ] **LIFE-09**: User can consult a verification report for the Phase 6 managed lifecycle in which each of LIFE-01..08 carries inspectable evidence, and any requirement not met is recorded as a named gap

### Dependency Promotion

- [ ] **DEP-01**: User can see dependency candidate PR #1 refreshed onto a green `main` and run through the three-OS CI and fixtures, with a per-component result recorded
- [ ] **DEP-02**: User receives the candidate versions (GSD Core 1.14.0, ecc-universal 2.2.1, context7-mcp 4.1.1, firecrawl-mcp 3.25.2, pi-mcp-adapter 2.36.0) in `catalog/stack.lock.json` only after green evidence and verified integrity hashes
- [x] **DEP-03**: User sees the dependency candidate workflow mark promotion blocked, naming the failing run, whenever the `main` baseline CI is red

## Future Requirements

- **REL-02 / G-07-2**: Claude Code real-host invocation receipt promoting its support-matrix cells from UNVERIFIED
- Codex first-class native-verification driver (debug session `codex-native-verification-gap`)
- Widen `PathProof.inode` beyond a JS double for Windows file indexes above 2^53
- Publish the v0.1.0 release artifacts and documentation
- **G-11-1** (LIFE-01): install or reconcile the reviewed stable lock (combined codex and pi targets) — A combined managed install for codex and pi (install --target codex,pi --apply or 5-harness install) refuses with 'plan-drift: owned-skill-sync changed between review and apply' because both share <home>/.agents/skills/alpha-aos-control/SKILL.md; closes when A combined install over targets that share a destination completes in one operation, and a second combined plan reads CURRENT with a byte-identical second apply. See .planning/milestones/v0.1.0-phases/06-managed-lifecycle-uninstall-and-recovery/06-VERIFICATION.md.
- **G-11-2** (LIFE-02): native discovery (antigravity) — doctor --discovery produces no antigravity row at all, silently omitting a supported harness from discovery output; closes when doctor --discovery reports an antigravity row: a COMPLETE unit from a free native oracle, or an explicit unsupported/not-run row. See .planning/milestones/v0.1.0-phases/06-managed-lifecycle-uninstall-and-recovery/06-VERIFICATION.md.
- **G-11-3** (LIFE-02): native discovery (hermes) — No free discovery oracle is defined for hermes; both hermes discovery rows report unsupported; closes when A hermes discovery oracle that runs read-only and yields a COMPLETE paired unit. See .planning/milestones/v0.1.0-phases/06-managed-lifecycle-uninstall-and-recovery/06-VERIFICATION.md.
- **G-11-4** (LIFE-02): meaningful read-only execution evidence (claude) — Any Claude execution or discovery evidence that costs nothing; every Claude oracle and canary leg spends a model turn; closes when The REL-02 / G-07-2 real-host invocation receipt (the existing future requirement that owns Claude's cost-excluded legs, D-10), or a deliberate spending canary run. See .planning/milestones/v0.1.0-phases/06-managed-lifecycle-uninstall-and-recovery/06-VERIFICATION.md.
- **G-11-5** (LIFE-02): meaningful read-only execution evidence (antigravity) — Every read-only execution path for antigravity: there is no discovery row (C1) and no declared canary leg; closes when A free read-only antigravity invocation reachable from doctor --discovery or doctor --canary --no-spend that yields a COMPLETE unit or a launched, completed leg. See .planning/milestones/v0.1.0-phases/06-managed-lifecycle-uninstall-and-recovery/06-VERIFICATION.md.
- **G-11-6** (LIFE-02): meaningful read-only execution evidence (hermes) — Every read-only execution path for hermes: there is no discovery oracle (C2), and in CAPA-03 handoff hermes is only the source, whose memory alpha-AOS writes without launching hermes; closes when A free read-only hermes invocation, through a discovery oracle or a no-spend canary leg, that launches hermes and completes. See .planning/milestones/v0.1.0-phases/06-managed-lifecycle-uninstall-and-recovery/06-VERIFICATION.md.
- **G-11-7** (LIFE-02): actionable coded findings (for a needs-repair state) — A coded doctor finding for an unhealthy journal: status reports NEEDS-REPAIR with uncoded prose, while doctor --json exits 0 and names no journal problem; closes when doctor emits an error- or warning-level finding with a stable code for corrupt or incomplete journals and stale writer locks, naming the runnable next action (alpha-aos repair), or status --json carries a code for needs-repair. See .planning/milestones/v0.1.0-phases/06-managed-lifecycle-uninstall-and-recovery/06-VERIFICATION.md.
- **G-11-8** (LIFE-03): uninstall one target (all five harnesses) and uninstall the full managed stack — The uninstall planner never removes the owned skills written by install: alpha-aos-control/SKILL.md stays on all five harnesses, alpha-aos-ship/SKILL.md stays on claude, and settings.json is left pruned to 3B rather than removed; closes when After uninstall --target <h> --yes --apply, no file recorded as created for <h> remains; after uninstall --all --yes --apply, the leftover scan over every journal-recorded target is empty. See .planning/milestones/v0.1.0-phases/06-managed-lifecycle-uninstall-and-recovery/06-VERIFICATION.md.
- **G-11-9** (LIFE-03): uninstall one target — uninstall --target pi removes shared ECC skills from <home>/.agents/skills even though codex is still installed, dropping codex out of CURRENT; closes when uninstall --target <h> removes a file from a shared root only when no other installed target still claims it. See .planning/milestones/v0.1.0-phases/06-managed-lifecycle-uninstall-and-recovery/06-VERIFICATION.md.
- **G-11-10** (LIFE-03): remove a project pack (uninstall --project route), and without removing unrelated user resources — uninstall --project deletes all files under <project>/.alpha-aos/ (including user files and stack.yaml), while leaving all materialized pack skill files and sidecars in harness skill directories; closes when uninstall --project removes only receipted pack targets whose bytes still match receipts, leaving user files under .alpha-aos/ and the manifest intact. See .planning/milestones/v0.1.0-phases/06-managed-lifecycle-uninstall-and-recovery/06-VERIFICATION.md.
- **G-11-11** (LIFE-03): remove a project pack (approve route); uninstall one target and full stack (directory residue) — Approve-route pack removal leaves empty pack-created directories and keeps the pack receipt, causing project status to perpetually offer a removal that refuses; uninstall leaves empty skill directories; closes when Pack removal sweeps empty pack directories and retires the receipt; uninstall --all sweeps empty skill directories. See .planning/milestones/v0.1.0-phases/06-managed-lifecycle-uninstall-and-recovery/06-VERIFICATION.md.
- **G-11-12** (LIFE-03): uninstall the full managed stack (isolated runtimes) — uninstall --all does not remove marked isolated runtimes under <state>/isolated/<project-id>; closes when uninstall --all --yes --apply removes every marked isolated runtime through the marker-checked journaled clean path. See .planning/milestones/v0.1.0-phases/06-managed-lifecycle-uninstall-and-recovery/06-VERIFICATION.md.
- **G-11-13** (LIFE-04): remove only receipted alpha-AOS-owned bytes or semantic entries — Uninstall identifies managed MCP entries and skills by hardcoded name lists rather than verifying against journals/receipts, removing user-authored resources on all five harnesses when no alpha-AOS install exists; closes when Uninstall consults transaction journals or state receipts before removing MCP servers and skill directories, preserving unreceipted entries. See .planning/milestones/v0.1.0-phases/06-managed-lifecycle-uninstall-and-recovery/06-VERIFICATION.md.
- **G-11-14** (LIFE-04): user-modified resources cause a refusal — User modifications to managed skill files or MCP configurations do not trigger refusal during uninstall; uninstall deletes them with exit 0; closes when Uninstall verifies on-disk file and entry hashes against applied hashes in journals/receipts and refuses when user modifications are detected. See .planning/milestones/v0.1.0-phases/06-managed-lifecycle-uninstall-and-recovery/06-VERIFICATION.md.
- **G-11-15** (LIFE-04): entries that still match their recorded applied state, while drifted ... cause a refusal — Content modifications made after preview do not cause refusal during apply; currentHash in the uninstall plan is not re-checked against disk at apply time; closes when applyUninstall checks current file hashes against the reviewed plan's currentHash and refuses on drift. See .planning/milestones/v0.1.0-phases/06-managed-lifecycle-uninstall-and-recovery/06-VERIFICATION.md.
- **G-11-16** (LIFE-04): remove only receipted alpha-AOS-owned bytes — uninstall --project deletes non-receipted user files under <project>/.alpha-aos/; closes when uninstall --project checks pack receipts before deleting any file and leaves non-receipted user files intact. See .planning/milestones/v0.1.0-phases/06-managed-lifecycle-uninstall-and-recovery/06-VERIFICATION.md.
- **G-11-17** (LIFE-04): remove only receipted alpha-AOS-owned bytes ... that still match their recorded applied state — Receipted alpha-AOS-owned skills matching their applied journaled hashes are never removed by target or full stack uninstall; closes when Uninstall planner includes receipted owned skills matching journaled hashes in planned removals. See .planning/milestones/v0.1.0-phases/06-managed-lifecycle-uninstall-and-recovery/06-VERIFICATION.md.
- **G-11-18** (LIFE-05): preview ... rollback — alpha-aos rollback preview checks only structural existence and LIFO ordering, omitting hash preflight against disk; on drifted targets preview prints RESTORE and promises a restore that apply immediately refuses; closes when planManagedRollback checks target file hashes on disk against journal afterHash and indicates drift or refusal in the preview output. See .planning/milestones/v0.1.0-phases/06-managed-lifecycle-uninstall-and-recovery/06-VERIFICATION.md.
- **G-11-19** (LIFE-06): restart-safe recovery guidance — alpha-aos repair crash repair preview displays alpha-AOS Crash Repair Plan without instructing the user to pass --apply to execute it; closes when formatCrashRepairPlan prints 'Pass --apply to execute this repair plan' or equivalent guidance. See .planning/milestones/v0.1.0-phases/06-managed-lifecycle-uninstall-and-recovery/06-VERIFICATION.md.
- **G-11-20** (LIFE-06): restart-safe recovery guidance — Neither status nor repair advises the user to re-run the interrupted command after repair completes; closes when formatCrashRepairResult or formatOfflineStatus includes a note advising the user to re-run their interrupted operation after successful repair. See .planning/milestones/v0.1.0-phases/06-managed-lifecycle-uninstall-and-recovery/06-VERIFICATION.md.
- **G-11-21** (LIFE-06): restart-safe recovery guidance — alpha-aos repair --apply re-invoked on an already-repaired clean state exits 2 with 'no writer lock is present' rather than exiting 0 or no-op; closes when alpha-aos repair --apply on a clean state reports that no repair is needed and exits 0. See .planning/milestones/v0.1.0-phases/06-managed-lifecycle-uninstall-and-recovery/06-VERIFICATION.md.
- **G-11-22** (LIFE-06): diagnose corrupt journals as needs-repair — Incomplete journal missing files array causes planCrashRepair to throw unhandled TypeError, falling back to writer repair which plans none, leaving status permanently in needsRepair=true; closes when planCrashRepair validates Array.isArray(journal.files) and treats a journal missing files as corrupt/unrecoverable, quarantining it. See .planning/milestones/v0.1.0-phases/06-managed-lifecycle-uninstall-and-recovery/06-VERIFICATION.md.
- **G-11-23** (LIFE-07): component-specific recovery instructions when managed-file rollback cannot safely reverse — When install fails after external package changes have been applied, CLI reports retained changes but emits no component recovery instructions and writes no recovery receipt under <state>/receipts; closes when Install failure rollback writes a durable recovery receipt and prints actionable recovery commands naming the external package on disk. See .planning/milestones/v0.1.0-phases/06-managed-lifecycle-uninstall-and-recovery/06-VERIFICATION.md.
- **G-11-24** (LIFE-07): component-specific recovery instructions (ECC) — ECC compensation command in uninstall receipt specifies obsolete package npm uninstall -g @enterprise-coding-companion/companion instead of locked ecc-universal; closes when ECC compensation instructions derive package name directly from stable lock (components.ecc.package). See .planning/milestones/v0.1.0-phases/06-managed-lifecycle-uninstall-and-recovery/06-VERIFICATION.md.
- **G-11-25** (LIFE-07): component-specific recovery instructions (GSD) — GSD compensation command in uninstall receipt specifies legacy path rm -rf ~/.claude/get-shit-done ~/.codex/get-shit-done instead of actual installed path <config root>/gsd-core; closes when GSD compensation commands reference actual installed paths <config root>/gsd-core and <config root>/.gsd-profile. See .planning/milestones/v0.1.0-phases/06-managed-lifecycle-uninstall-and-recovery/06-VERIFICATION.md.
- **G-11-26** (LIFE-07): component-specific recovery instructions (Pi bridge) — Uninstall recovery receipt omits Pi bridge entirely; compensatePiBridge specifies npm unlink @modelcontextprotocol/server-pi instead of pi remove or pi-mcp-adapter; closes when Uninstall recovery receipt includes Pi bridge entry matching pi-mcp-adapter and its native Pi installation route. See .planning/milestones/v0.1.0-phases/06-managed-lifecycle-uninstall-and-recovery/06-VERIFICATION.md.

## Out of Scope

| Feature | Reason |
|---------|--------|
| New harness capabilities or packs | This milestone restores a trustworthy baseline; feature work waits for green CI |
| Loosening the host-path immutability assertion without a root cause | The assertion encodes the Safety constraint; it may change only if the investigation proves the oracle wrong |
| Promoting any candidate component that fails its fixture | Supply-chain constraint: end users receive only the reviewed stable lock |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| CI-01 | Phase 10 | Complete |
| CI-02 | Phase 10 | Complete |
| CI-03 | Phase 10 | Complete |
| CI-04 | Phase 12 | Complete |
| LIFE-09 | Phase 11 | Pending |
| DEP-01 | Phase 13 | Pending |
| DEP-02 | Phase 13 | Pending |
| DEP-03 | Phase 12 | Complete |

**Coverage:**

- v0.1.1 requirements: 8 total
- Mapped to phases: 8
- Unmapped: 0

---
*Requirements defined: 2026-09-23*
*Last updated: 2026-09-23 after v0.1.1 roadmap creation (Phases 10-13)*
