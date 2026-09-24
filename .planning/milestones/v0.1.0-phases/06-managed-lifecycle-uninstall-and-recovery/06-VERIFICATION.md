---
phase: 06-managed-lifecycle-uninstall-and-recovery
verified: 2026-09-24T03:30:00.000Z
verified_in: 11-managed-lifecycle-verification
status: gaps_found
score: 1/8 VERIFIED
phase13_gating: BLOCKED
completion: LIFE-09 criterion met (D-16)
gaps:
  - gap_id: G-11-1
    requirement: LIFE-01
    candidate_key: LIFE-01/C1
    clause: "install or reconcile the reviewed stable lock (combined codex and pi targets)"
    kind: failed
    missing: "A combined managed install for codex and pi (install --target codex,pi --apply or 5-harness install) refuses with 'plan-drift: owned-skill-sync changed between review and apply' because both share <home>/.agents/skills/alpha-aos-control/SKILL.md."
    close_condition: "A combined install over targets that share a destination completes in one operation, and a second combined plan reads CURRENT with a byte-identical second apply."
    reproduction: "npm run build && node .planning/phases/11-managed-lifecycle-verification/evidence/probes/life01-harnesses.mjs; evidence/life01-harnesses-reconcile.txt: CHECK life01.all.initial-apply VIOLATED exit=2; stderr: 'alpha-aos: plan-drift: owned-skill-sync changed between review and apply: reviewed <digest>, observed <digest>.'"
    related: []
    blocks_phase13: true
  - gap_id: G-11-2
    requirement: LIFE-02
    candidate_key: LIFE-02/C1
    clause: "native discovery (antigravity)"
    kind: failed
    missing: "doctor --discovery produces no antigravity row at all, silently omitting a supported harness from discovery output."
    close_condition: "doctor --discovery reports an antigravity row: a COMPLETE unit from a free native oracle, or an explicit unsupported/not-run row."
    reproduction: "npm run build && node .planning/phases/11-managed-lifecycle-verification/evidence/probes/life02-discovery.mjs; evidence/life02-discovery.txt: CHECK life02.discovery.antigravity VIOLATED absent from discovery rows"
    related: ["G-11-5"]
    blocks_phase13: false
  - gap_id: G-11-3
    requirement: LIFE-02
    candidate_key: LIFE-02/C2
    clause: "native discovery (hermes)"
    kind: failed
    missing: "No free discovery oracle is defined for hermes; both hermes discovery rows report unsupported."
    close_condition: "A hermes discovery oracle that runs read-only and yields a COMPLETE paired unit."
    reproduction: "npm run build && node .planning/phases/11-managed-lifecycle-verification/evidence/probes/life02-discovery.mjs; evidence/life02-discovery.txt: CHECK life02.discovery.hermes VIOLATED BROWNFIELD_INIT: completeness=null support=unsupported nativeUse=null notRun='no discovery oracle is defined for hermes, so there is nothing free to run'"
    related: ["G-11-6"]
    blocks_phase13: false
  - gap_id: G-11-4
    requirement: LIFE-02
    candidate_key: LIFE-02/C3
    clause: "meaningful read-only execution evidence (claude)"
    kind: failed
    missing: "Any Claude execution or discovery evidence that costs nothing; every Claude oracle and canary leg spends a model turn."
    close_condition: "The REL-02 / G-07-2 real-host invocation receipt (the existing future requirement that owns Claude's cost-excluded legs, D-10), or a deliberate spending canary run."
    reproduction: "npm run build && node .planning/phases/11-managed-lifecycle-verification/evidence/probes/life02-discovery.mjs; evidence/life02-discovery.txt: CHECK life02.canary.claude.no-spend-execution VIOLATED no no-spend leg launched this harness's own native surface; note: canary cost line: This run would drive 10 canary/harness pair(s): 10 spend a model turn, 0 do not"
    related: ["G-07-2"]
    blocks_phase13: false
  - gap_id: G-11-5
    requirement: LIFE-02
    candidate_key: LIFE-02/C4
    clause: "meaningful read-only execution evidence (antigravity)"
    kind: failed
    missing: "Every read-only execution path for antigravity: there is no discovery row (C1) and no declared canary leg."
    close_condition: "A free read-only antigravity invocation reachable from doctor --discovery or doctor --canary --no-spend that yields a COMPLETE unit or a launched, completed leg."
    reproduction: "npm run build && node .planning/phases/11-managed-lifecycle-verification/evidence/probes/life02-discovery.mjs; evidence/life02-discovery.txt: CHECK life02.canary.antigravity.no-spend-execution VIOLATED no canary leg is declared for this harness"
    related: ["G-11-2"]
    blocks_phase13: false
  - gap_id: G-11-6
    requirement: LIFE-02
    candidate_key: LIFE-02/C5
    clause: "meaningful read-only execution evidence (hermes)"
    kind: failed
    missing: "Every read-only execution path for hermes: there is no discovery oracle (C2), and in CAPA-03 handoff hermes is only the source, whose memory alpha-AOS writes without launching hermes."
    close_condition: "A free read-only hermes invocation, through a discovery oracle or a no-spend canary leg, that launches hermes and completes."
    reproduction: "npm run build && node .planning/phases/11-managed-lifecycle-verification/evidence/probes/life02-discovery.mjs; evidence/life02-discovery.txt: CHECK life02.canary.hermes.no-spend-execution VIOLATED no no-spend leg launched this harness's own native surface; legs: CAPA-03 handoff source"
    related: ["G-11-3"]
    blocks_phase13: false
  - gap_id: G-11-7
    requirement: LIFE-02
    candidate_key: LIFE-02/C6
    clause: "actionable coded findings (for a needs-repair state)"
    kind: failed
    missing: "A coded doctor finding for an unhealthy journal: status reports NEEDS-REPAIR with uncoded prose, while doctor --json exits 0 and names no journal problem."
    close_condition: "doctor emits an error- or warning-level finding with a stable code for corrupt or incomplete journals and stale writer locks, naming the runnable next action (alpha-aos repair), or status --json carries a code for needs-repair."
    reproduction: "npm run build && node .planning/phases/11-managed-lifecycle-verification/evidence/probes/life02-status.mjs; evidence/life02-status.txt: CHECK life02.doctor.flags-corrupt-journal VIOLATED doctor --json exit=0; no error- or warning-level finding names the journal problem"
    related: []
    blocks_phase13: false
  - gap_id: G-11-8
    requirement: LIFE-03
    candidate_key: LIFE-03/C1
    clause: "uninstall one target (all five harnesses) and uninstall the full managed stack"
    kind: failed
    missing: "The uninstall planner never removes the owned skills written by install: alpha-aos-control/SKILL.md stays on all five harnesses, alpha-aos-ship/SKILL.md stays on claude, and settings.json is left pruned to 3B rather than removed."
    close_condition: "After uninstall --target <h> --yes --apply, no file recorded as created for <h> remains; after uninstall --all --yes --apply, the leftover scan over every journal-recorded target is empty."
    reproduction: "npm run build && node .planning/phases/11-managed-lifecycle-verification/evidence/probes/life03-uninstall.mjs; evidence/life03-uninstall.txt: CHECK life03.all.leftovers VIOLATED 6 of 7 journal-recorded targets still present after uninstall --all; CHECK life03.target.claude.owned-removed VIOLATED"
    related: ["G-11-17"]
    blocks_phase13: false
  - gap_id: G-11-9
    requirement: LIFE-03
    candidate_key: LIFE-03/C2
    clause: "uninstall one target"
    kind: failed
    missing: "uninstall --target pi removes shared ECC skills from <home>/.agents/skills even though codex is still installed, dropping codex out of CURRENT."
    close_condition: "uninstall --target <h> removes a file from a shared root only when no other installed target still claims it."
    reproduction: "evidence/life03-uninstall.txt: CHECK life03.target.pi.sibling-codex-intact VIOLATED codex (still installed) ECC skills present under <sandbox>\\home\\.agents\\skills: none; codex plan step ecc:codex=create"
    related: []
    blocks_phase13: false
  - gap_id: G-11-10
    requirement: LIFE-03
    candidate_key: LIFE-03/C3
    clause: "remove a project pack (uninstall --project route), and without removing unrelated user resources"
    kind: failed
    missing: "uninstall --project deletes all files under <project>/.alpha-aos/ (including user files and stack.yaml), while leaving all materialized pack skill files and sidecars in harness skill directories."
    close_condition: "uninstall --project removes only receipted pack targets whose bytes still match receipts, leaving user files under .alpha-aos/ and the manifest intact."
    reproduction: "evidence/life03-project.txt: CHECK life03.project.pack-removed VIOLATED exit=0; receipted pack targets still present; CHECK life03.project.user-file-kept VIOLATED; CHECK life03.project.manifest-kept VIOLATED"
    related: ["G-11-16"]
    blocks_phase13: false
  - gap_id: G-11-11
    requirement: LIFE-03
    candidate_key: LIFE-03/C4
    clause: "remove a project pack (approve route); uninstall one target and full stack (directory residue)"
    kind: failed
    missing: "Approve-route pack removal leaves empty pack-created directories and keeps the pack receipt, causing project status to perpetually offer a removal that refuses; uninstall leaves empty skill directories."
    close_condition: "Pack removal sweeps empty pack directories and retires the receipt; uninstall --all sweeps empty skill directories."
    reproduction: "evidence/life03-project.txt: CHECK life03.pack.empty-dirs-swept VIOLATED empty pack-created directories left behind; CHECK life03.pack.removal-still-offered OBSERVED after the removal project status still offers a removal"
    related: []
    blocks_phase13: false
  - gap_id: G-11-12
    requirement: LIFE-03
    candidate_key: LIFE-03/C5
    clause: "uninstall the full managed stack (isolated runtimes)"
    kind: failed
    missing: "uninstall --all does not remove marked isolated runtimes under <state>/isolated/<project-id>."
    close_condition: "uninstall --all --yes --apply removes every marked isolated runtime through the marker-checked journaled clean path."
    reproduction: "evidence/life03-project.txt: CHECK life03.runtime.uninstall-all-isolated VIOLATED the p4 isolated runtime <state>/isolated/<project-id> survived uninstall --all --yes --apply"
    related: []
    blocks_phase13: false
  - gap_id: G-11-13
    requirement: LIFE-04
    candidate_key: LIFE-04/C1
    clause: "remove only receipted alpha-AOS-owned bytes or semantic entries"
    kind: failed
    missing: "Uninstall identifies managed MCP entries and skills by hardcoded name lists rather than verifying against journals/receipts, removing user-authored resources on all five harnesses when no alpha-AOS install exists."
    close_condition: "Uninstall consults transaction journals or state receipts before removing MCP servers and skill directories, preserving unreceipted entries."
    reproduction: "evidence/life04-receipts.txt: CHECK life04.no-receipt.claude.mcp-kept VIOLATED; CHECK life04.no-receipt.claude.skill-kept VIOLATED (and across all five harnesses)"
    related: []
    blocks_phase13: false
  - gap_id: G-11-14
    requirement: LIFE-04
    candidate_key: LIFE-04/C2
    clause: "user-modified resources cause a refusal"
    kind: failed
    missing: "User modifications to managed skill files or MCP configurations do not trigger refusal during uninstall; uninstall deletes them with exit 0."
    close_condition: "Uninstall verifies on-disk file and entry hashes against applied hashes in journals/receipts and refuses when user modifications are detected."
    reproduction: "evidence/life04-receipts.txt: CHECK life04.modified.skill VIOLATED user-modified skill deleted by uninstall with exit 0; CHECK life04.modified.mcp-entry VIOLATED"
    related: []
    blocks_phase13: false
  - gap_id: G-11-15
    requirement: LIFE-04
    candidate_key: LIFE-04/C3
    clause: "entries that still match their recorded applied state, while drifted ... cause a refusal"
    kind: failed
    missing: "Content modifications made after preview do not cause refusal during apply; currentHash in the uninstall plan is not re-checked against disk at apply time."
    close_condition: "applyUninstall checks current file hashes against the reviewed plan's currentHash and refuses on drift."
    reproduction: "evidence/life04-receipts.txt: CHECK life04.preview-hash.enforced VIOLATED config modified after preview was pruned during apply without refusal"
    related: []
    blocks_phase13: false
  - gap_id: G-11-16
    requirement: LIFE-04
    candidate_key: LIFE-04/C4
    clause: "remove only receipted alpha-AOS-owned bytes"
    kind: failed
    missing: "uninstall --project deletes non-receipted user files under <project>/.alpha-aos/."
    close_condition: "uninstall --project checks pack receipts before deleting any file and leaves non-receipted user files intact."
    reproduction: "evidence/life04-receipts.txt: CHECK life04.project.non-receipted VIOLATED uninstall --project deleted user file .alpha-aos/p11-user-notes.txt"
    related: ["G-11-10"]
    blocks_phase13: false
  - gap_id: G-11-17
    requirement: LIFE-04
    candidate_key: LIFE-04/C5
    clause: "remove only receipted alpha-AOS-owned bytes ... that still match their recorded applied state"
    kind: failed
    missing: "Receipted alpha-AOS-owned skills matching their applied journaled hashes are never removed by target or full stack uninstall."
    close_condition: "Uninstall planner includes receipted owned skills matching journaled hashes in planned removals."
    reproduction: "evidence/life04-receipts.txt: CHECK life04.receipted.owned-skill-removed VIOLATED receipted owned skill matching afterHash was not removed"
    related: ["G-11-8"]
    blocks_phase13: false
  - gap_id: G-11-18
    requirement: LIFE-05
    candidate_key: LIFE-05/C1
    clause: "preview ... rollback"
    kind: failed
    missing: "alpha-aos rollback preview checks only structural existence and LIFO ordering, omitting hash preflight against disk; on drifted targets preview prints RESTORE and promises a restore that apply immediately refuses."
    close_condition: "planManagedRollback checks target file hashes on disk against journal afterHash and indicates drift or refusal in the preview output."
    reproduction: "node .planning/phases/11-managed-lifecycle-verification/evidence/probes/life05-rollback.mjs; evidence/life05-rollback.txt: CHECK life05.preview.reflects-drift VIOLATED preview printed RESTORE and dry-run footer without reporting that target has drifted"
    related: []
    blocks_phase13: false
  - gap_id: G-11-19
    requirement: LIFE-06
    candidate_key: LIFE-06/C1
    clause: "restart-safe recovery guidance"
    kind: failed
    missing: "alpha-aos repair crash repair preview displays alpha-AOS Crash Repair Plan without instructing the user to pass --apply to execute it."
    close_condition: "formatCrashRepairPlan prints 'Pass --apply to execute this repair plan' or equivalent guidance."
    reproduction: "node .planning/phases/11-managed-lifecycle-verification/evidence/probes/life06-recovery.mjs; evidence/life06-recovery.txt: CHECK life06.guidance.names-apply VIOLATED repair preview does not instruct passing '--apply'"
    related: []
    blocks_phase13: false
  - gap_id: G-11-20
    requirement: LIFE-06
    candidate_key: LIFE-06/C2
    clause: "restart-safe recovery guidance"
    kind: failed
    missing: "Neither status nor repair advises the user to re-run the interrupted command after repair completes."
    close_condition: "formatCrashRepairResult or formatOfflineStatus includes a note advising the user to re-run their interrupted operation after successful repair."
    reproduction: "evidence/life06-recovery.txt: CHECK life06.guidance.says-rerun VIOLATED repair/status guidance does not instruct user to re-run the interrupted operation"
    related: []
    blocks_phase13: false
  - gap_id: G-11-21
    requirement: LIFE-06
    candidate_key: LIFE-06/C3
    clause: "restart-safe recovery guidance"
    kind: failed
    missing: "alpha-aos repair --apply re-invoked on an already-repaired clean state exits 2 with 'no writer lock is present' rather than exiting 0 or no-op."
    close_condition: "alpha-aos repair --apply on a clean state reports that no repair is needed and exits 0."
    reproduction: "evidence/life06-recovery.txt: CHECK life06.after-snapshot-sync.repair-idempotent VIOLATED exit=2, fingerprints unchanged=true"
    related: []
    blocks_phase13: false
  - gap_id: G-11-22
    requirement: LIFE-06
    candidate_key: LIFE-06/C4
    clause: "diagnose corrupt journals as needs-repair"
    kind: failed
    missing: "Incomplete journal missing files array causes planCrashRepair to throw unhandled TypeError, falling back to writer repair which plans none, leaving status permanently in needsRepair=true."
    close_condition: "planCrashRepair validates Array.isArray(journal.files) and treats a journal missing files as corrupt/unrecoverable, quarantining it."
    reproduction: "evidence/life06-recovery.txt: CHECK life06.p5.resolved VIOLATED repair planned action unknown; status after still needsRepair=true"
    related: []
    blocks_phase13: false
  - gap_id: G-11-23
    requirement: LIFE-07
    candidate_key: LIFE-07/C1
    clause: "component-specific recovery instructions when managed-file rollback cannot safely reverse"
    kind: failed
    missing: "When install fails after external package changes have been applied, CLI reports retained changes but emits no component recovery instructions and writes no recovery receipt under <state>/receipts."
    close_condition: "Install failure rollback writes a durable recovery receipt and prints actionable recovery commands naming the external package on disk."
    reproduction: "node .planning/phases/11-managed-lifecycle-verification/evidence/probes/life07-external.mjs; evidence/life07-external.txt: CHECK life07.failure.component-instructions VIOLATED; CHECK life07.failure.receipt-written OBSERVED"
    related: []
    blocks_phase13: false
  - gap_id: G-11-24
    requirement: LIFE-07
    candidate_key: LIFE-07/C2
    clause: "component-specific recovery instructions (ECC)"
    kind: failed
    missing: "ECC compensation command in uninstall receipt specifies obsolete package npm uninstall -g @enterprise-coding-companion/companion instead of locked ecc-universal."
    close_condition: "ECC compensation instructions derive package name directly from stable lock (components.ecc.package)."
    reproduction: "evidence/life07-external.txt: CHECK life07.compensation.ecc-package VIOLATED ECC compensation command: 'npm uninstall -g @enterprise-coding-companion/companion'"
    related: []
    blocks_phase13: false
  - gap_id: G-11-25
    requirement: LIFE-07
    candidate_key: LIFE-07/C3
    clause: "component-specific recovery instructions (GSD)"
    kind: failed
    missing: "GSD compensation command in uninstall receipt specifies legacy path rm -rf ~/.claude/get-shit-done ~/.codex/get-shit-done instead of actual installed path <config root>/gsd-core."
    close_condition: "GSD compensation commands reference actual installed paths <config root>/gsd-core and <config root>/.gsd-profile."
    reproduction: "evidence/life07-external.txt: CHECK life07.compensation.gsd-path VIOLATED GSD compensation command: 'rm -rf ~/.claude/get-shit-done ~/.codex/get-shit-done'"
    related: []
    blocks_phase13: false
  - gap_id: G-11-26
    requirement: LIFE-07
    candidate_key: LIFE-07/C4
    clause: "component-specific recovery instructions (Pi bridge)"
    kind: failed
    missing: "Uninstall recovery receipt omits Pi bridge entirely; compensatePiBridge specifies npm unlink @modelcontextprotocol/server-pi instead of pi remove or pi-mcp-adapter."
    close_condition: "Uninstall recovery receipt includes Pi bridge entry matching pi-mcp-adapter and its native Pi installation route."
    reproduction: "evidence/life07-external.txt: CHECK life07.compensation.pi-bridge VIOLATED Pi bridge compensation command: none"
    related: []
    blocks_phase13: false
---

# Phase 6: Managed Lifecycle, Uninstall, and Recovery - Verification Report

This report is produced by Phase 11 (LIFE-09). It judges each of LIFE-01..LIFE-08 against its requirement text using evidence produced in Phase 11 against the current code. Plan 11-01 seeded this skeleton and the LIFE-01 Codex rows; plan 11-07 compiles the remaining sections from the per-requirement findings in `.planning/phases/11-managed-lifecycle-verification/evidence/`.

## Evidence standard

Every verdict rests on evidence produced in Phase 11: the six Phase 6 suites re-run on this host, and each user-facing lifecycle behavior driven through the packed CLI (`npm pack` tarball installed into an isolated sandbox) with a host guard around every probe (D-01). Phase 6 SUMMARY coverage claims are leads, not evidence. Fresh evidence comes from the local Windows 11 developer host; POSIX coverage is corroborated by the same tests passing in `main` push run `35818198049` attempt 1 (ubuntu, macOS and windows jobs, D-03).

Verdicts are VERIFIED (every clause has passing evidence), PARTIAL (some clauses evidenced, each unmet clause a named gap) or GAP (the core promise is not met); a requirement with any unmet clause is never VERIFIED (D-02). Each cited test's oracle is audited against the clause it is cited for, and a weak oracle alone cannot carry VERIFIED (D-04). The LIFE requirement text is the contract, clause by clause; Phase 6 decisions are the implementation's interpretation, not the bar (D-09).

## Verdict matrix

| Requirement | Verdict | Gaps | Primary evidence |
|---|---|---|---|
| LIFE-01 | PARTIAL | G-11-1 | `evidence/life01-codex-reconcile.txt` (`life01.codex.*`), `evidence/life01-harnesses-reconcile.txt` (`life01.all.initial-apply VIOLATED`) |
| LIFE-02 | PARTIAL | G-11-2, G-11-3, G-11-4, G-11-5, G-11-6, G-11-7 | `evidence/life02-status.txt` (`life02.status.*`, `life02.doctor.*`), `evidence/life02-discovery.txt` (`life02.discovery.*`, `life02.canary.*`) |
| LIFE-03 | GAP | G-11-8, G-11-9, G-11-10, G-11-11, G-11-12 | `evidence/life03-uninstall.txt` (`life03.target.*`, `life03.all.leftovers VIOLATED`), `evidence/life03-project.txt`, `evidence/life03-tty.txt` |
| LIFE-04 | GAP | G-11-13, G-11-14, G-11-15, G-11-16, G-11-17 | `evidence/life04-receipts.txt` (`life04.no-receipt.*`, `life04.modified.*`, `life04.preview-hash.enforced VIOLATED`) |
| LIFE-05 | PARTIAL | G-11-18 | `evidence/life05-rollback.txt` (`life05.apply.exact-bytes HOLDS`, `life05.drift.zero-writes HOLDS`, `life05.preview.reflects-drift VIOLATED`) |
| LIFE-06 | PARTIAL | G-11-19, G-11-20, G-11-21, G-11-22 | `evidence/life06-recovery.txt` (`life06.<fp>.no-false-success HOLDS`, `life06.guidance.*`, `life06.p5.resolved VIOLATED`) |
| LIFE-07 | GAP | G-11-23, G-11-24, G-11-25, G-11-26 | `evidence/life07-external.txt` (`life07.external.shown HOLDS`, `life07.failure.*`, `life07.compensation.* VIOLATED`) |
| LIFE-08 | VERIFIED | none | `evidence/life08-preview.txt` (`life08.preview.*`), `evidence/life08-apply.txt` (`life08.apply.* HOLDS`) |

Score: 1/8 VERIFIED

## Phase 13 gating

Phase 13 gating: BLOCKED (caused by open gap G-11-1 in LIFE-01; dependency candidate promotion cannot safely execute when multi-target reconciliation of shared skill files fails review/apply assertions. Gaps in LIFE-02 through LIFE-07 do not block Phase 13 per D-08).

## Evidence records

The Phase 11 verification suite executed packed-CLI probes in isolated sandboxes guarded by host-path checks, plus local test runs and cross-platform CI run 35818198049 on commit `35d4c15`:

| Transcript | Probe command | Head | Tarball SHA-256 | Summary / Key Result |
|---|---|---|---|---|
| `evidence/life01-codex-reconcile.txt` | `node probes/life01-reconcile.mjs` | `84bce0a` | `f0fa7585da81` | Codex tracer: holds=5, violated=0, not-observed=0, observed=3 |
| `evidence/life01-harnesses-reconcile.txt` | `node probes/life01-harnesses.mjs` | `320c234` | `6ae7e91eb704` | 5 harnesses reconcile: holds=25, violated=3, not-observed=15, observed=10 |
| `evidence/life02-status.txt` | `node probes/life02-status.mjs` | `ae10696` | `c02ce20dffb6` | Offline status & traps: holds=9, violated=1, not-observed=0, observed=1 |
| `evidence/life02-discovery.txt` | `node probes/life02-discovery.mjs` | `ae10696` | `c02ce20dffb6` | Native discovery/canary: holds=4, violated=7, not-observed=1, observed=4 |
| `evidence/life03-uninstall.txt` | `node probes/life03-uninstall.mjs` | `a9e9070` | `2d4223f668f4` | Uninstall 5 targets: holds=35, violated=6, not-observed=0, observed=9 |
| `evidence/life03-project.txt` | `node probes/life03-project.mjs` | `a9e9070` | `2d4223f668f4` | Pack & isolate clean: holds=10, violated=4, not-observed=0, observed=6 |
| `evidence/life03-tty.txt` | `node probes/life03-tty.mjs` | `a9e9070` | `2d4223f668f4` | WSL Linux TTY prompt: holds=4, violated=0, not-observed=0, observed=0 |
| `evidence/life04-receipts.txt` | `node probes/life04-receipts.mjs` | `afc94a4` | `25bc2b4857b6` | Receipts & refusal: holds=3, violated=17, not-observed=0, observed=0 |
| `evidence/life05-rollback.txt` | `node probes/life05-rollback.mjs` | `41dd0a7` | `ebf00373ad7f` | Rollback & drift: holds=7, violated=1, not-observed=0, observed=0 |
| `evidence/life06-recovery.txt` | `node probes/life06-recovery.mjs` | `41dd0a7` | `f10d0b88eb98` | 5 failpoints recovery: holds=34, violated=8, not-observed=0, observed=8 |
| `evidence/life07-external.txt` | `node probes/life07-external.mjs` | `afc94a4` | `25bc2b4857b6` | External packages: holds=4, violated=6, not-observed=1, observed=2 |
| `evidence/life08-preview.txt` | `node probes/life08-preview.mjs` | `320c234` | `6ae7e91eb704` | Update preview: holds=7, violated=2, not-observed=0, observed=4 |
| `evidence/life08-apply.txt` | `node probes/life08-apply.mjs` | `320c234` | `6ae7e91eb704` | Update apply reconcile: holds=6, violated=0, not-observed=0, observed=0 |
| `evidence/suites-local.txt` | `node scripts/run-tests.mjs --files ...` | `84bce0a` | n/a | Local Phase 6 suites: 33/33 pass, 0 fail (duration 2446.7 ms) |
| `evidence/ci-35818198049-lifelines.txt` | GitHub Actions run 35818198049 | `35d4c15` | n/a | Ubuntu (job 107044319989), macOS (107044319988), Windows (107044319963) |

POSIX corroboration comes from CI run 35818198049 on commit `35d4c15` (`ci.staleness` passes per D-03). The permanent test guards committed during Phase 11 (`test/status-offline-verification.test.ts` and `test/rollback-cli-verification.test.ts`) were executed and verified locally on Windows and under WSL Linux, and will be corroborated on POSIX runners on the next `main` CI push.

## LIFE-01

> **LIFE-01**: User can install or reconcile the reviewed stable lock idempotently, and a second unchanged plan reports `CURRENT`

"The plan" for LIFE-01 is `alpha-aos install` without `--apply`: it is the stateful plan that prints `CURRENT` step lines. The static `alpha-aos plan` table never reports `CURRENT`; it is recorded as an observation (`life01.plan-command-static`), and `life01.plan-command-docs` records whether README.md or docs/ direct users to `alpha-aos plan` for reconcile state.

| # | Clause | Evidence | Oracle audit (D-04) | Result |
|---|---|---|---|---|
| 1 | install or reconcile the reviewed stable lock (Codex) | `evidence/life01-codex-reconcile.txt` CHECK `life01.codex.initial-apply` (OBSERVED: exit 0, managed components applied and journaled from the packed release whose installed lock channel is `stable`) | Packed CLI in an isolated sandbox; the installed package carries no `catalog/candidate.lock.json` (asserted by `installPackedRelease`) | HOLDS |
| 2 | idempotently (Codex): a second apply changes nothing | `evidence/life01-codex-reconcile.txt` CHECK `life01.codex.second-apply-noop` (HOLDS) and `life01.codex.second-apply-byte-identical` (HOLDS) | Second `install --target codex --apply --json` returns no applied step, no operation id, every step current, journal file names unchanged; sandbox home, state and prefix byte fingerprints equal before and after | HOLDS |
| 3 | a second unchanged plan reports `CURRENT` (Codex) | `evidence/life01-codex-reconcile.txt` CHECK `life01.codex.preview-current` (HOLDS), `life01.codex.preview-json-current` (HOLDS) and `life01.codex.preview-no-mutation` (HOLDS) | The dry-run output the user reads: every step line starts with `CURRENT`, every JSON `steps[].action` is `current`, and the dry-run changes no sandbox byte | HOLDS |
| 4a | scope: claude | `evidence/life01-harnesses-reconcile.txt`: `life01.claude.*`, 5 HOLDS + initial apply OBSERVED | Judged at sandbox file level (D-10). The ship workflow seed is a precondition. Reconcile, preview and second apply verified byte-for-byte | HOLDS |
| 4b | scope: codex | `evidence/life01-codex-reconcile.txt`: `life01.codex.*`, 5 HOLDS + initial apply OBSERVED. CI packed lifecycle test passed on jobs 107044319989 / 107044319988 / 107044319963 (`ci-35818198049-lifelines.txt:53,97,141`) | Tracer and strengthened CI test run the same sequence | HOLDS |
| 4c | scope: antigravity | `evidence/life01-harnesses-reconcile.txt`: `life01.antigravity.*`, 5 HOLDS + initial apply OBSERVED | Judged at sandbox file level. Reconcile and second apply verified byte-for-byte | HOLDS |
| 4d | scope: pi | `evidence/life01-harnesses-reconcile.txt`: `life01.pi.*`, 5 HOLDS + initial apply OBSERVED | `mcp-bridge:pi` is current from the seeded manifest | HOLDS |
| 4e | scope: hermes | `evidence/life01-harnesses-reconcile.txt`: `life01.hermes.*`, 5 HOLDS + initial apply OBSERVED | Hermes has no GSD step; its 4 steps are owned skill, ECC runtime and skills, and MCP | HOLDS |
| 4f | scope: all five harnesses in one operation | `evidence/life01-harnesses-reconcile.txt`: `life01.all.initial-apply VIOLATED` and 5 NOT-OBSERVED; `life01.codex-pi.initial-apply VIOLATED` (`plan-drift: owned-skill-sync changed between review and apply`) | The failure is deterministic and product-caused: both harnesses render `alpha-aos-control` into `<home>/.agents/skills/alpha-aos-control/SKILL.md`. Rollback left no partial state | VIOLATED (G-11-1) |

**Verdict**: PARTIAL (G-11-1). Idempotent reconcile and CURRENT reporting hold completely for each of the five harnesses individually and for three-target combinations without shared roots, on byte-fingerprint evidence. However, multi-target install across codex and pi in one operation refuses due to review/apply hash drift on shared owned-skill destinations (LIFE-01/C1, G-11-1).


## LIFE-02

> **LIFE-02**: User can run offline `status` for fast inspection and an explicit `doctor` or canary mode for native discovery and meaningful read-only execution evidence with actionable coded findings

| # | Clause | Evidence | Oracle audit (D-04) | Result |
|---|---|---|---|---|
| 1 | offline `status` | `evidence/life02-status.txt`: `CHECK life02.status.zero-subprocess HOLDS`, `CHECK life02.status.zero-network HOLDS`, both valid because `CHECK life02.status.trap-control-spawn HOLDS` (inventory logged `child_process.spawnSync x14`) and `CHECK life02.status.trap-control-network HOLDS` (loopback fetch logged `fetch x1`). New CI test in `test/status-offline-verification.test.ts`. Phase 6 test `offline status strictly executes zero subprocesses (LIFE-02, D-14)`: `evidence/suites-local.txt:37`, CI run 35818198049 jobs 107044319989 / 107044319988 / 107044319963 | The probe's `node --import` preload traps child_process, net, tls, dns, http, https and fetch with ESM sync exports, proving zero subprocesses and zero network across the packed CLI | HOLDS |
| 2 | fast inspection | `evidence/life02-status.txt`: `CHECK life02.status.in-process-under-50ms HOLDS` (median 2.35 ms of 10 in-process calls on populated state root). `CHECK life02.status.cli-timing OBSERVED` (packed CLI `status --json` median 806.4 ms wall time). Phase 6 test `offline status completes in under 50ms benchmark (LIFE-02, D-14)`: `evidence/suites-local.txt:38` | The probe verifies sub-50ms in-process inspection on a populated state root (journals, snapshots and lock from a real install). CLI wall time is recorded as an observation | HOLDS |
| 3 | explicit `doctor` or canary mode | `evidence/life02-discovery.txt` steps 4-7: `doctor --discovery <project>` exit 0, `doctor --canary <project> --no-spend` exit 0 (`CHECK life02.canary.spend-legs OBSERVED`). `evidence/life02-status.txt` step 8: `doctor --json` exit 0 | Explicit opt-in modes separate from status; canary announces spending before execution | HOLDS |
| 4a | native discovery: claude | `CHECK life02.discovery.claude NOT-OBSERVED not executed (cost)` | Driving claude spends a model turn; D-11 forbids spending turns in standard verification. Owned by G-07-2 / REL-02 (D-10) | NOT-OBSERVED (cost; G-11-4) |
| 4b | native discovery: codex | `CHECK life02.discovery.codex HOLDS`: COMPLETE units for BROWNFIELD_INIT and MCP_SERVER | Paired positive (scratch clone) and negative (control directory) runs of `codex debug prompt-input` both parsed | HOLDS |
| 4c | native discovery: antigravity | `CHECK life02.discovery.antigravity VIOLATED absent from discovery rows` | Antigravity is silently omitted from discovery rows | VIOLATED (G-11-2) |
| 4d | native discovery: pi | `CHECK life02.discovery.pi HOLDS`: COMPLETE units for both packs | Paired positive/negative runs of `pi --mode rpc --approve --no-session` with `get_commands` request both parsed | HOLDS |
| 4e | native discovery: hermes | `CHECK life02.discovery.hermes VIOLATED`: rows report `support=unsupported` | No discovery oracle defined for hermes | VIOLATED (G-11-3) |
| 5a | meaningful read-only execution evidence: claude | `CHECK life02.canary.claude.no-spend-execution VIOLATED`: CAPA-01, CAPA-02, CAPA-05 not attempted | Every Claude leg spends a model turn; no-spend canary cannot produce execution evidence without spend | VIOLATED (G-11-4) |
| 5b | meaningful read-only execution evidence: codex | `doctor --discovery` executes `codex debug prompt-input` read-only in a COMPLETE paired unit | Discovery satisfies read-only native execution for codex under the "doctor or canary" disjunction | HOLDS (via discovery) |
| 5c | meaningful read-only execution evidence: antigravity | `CHECK life02.canary.antigravity.no-spend-execution VIOLATED no canary leg is declared for this harness` | No discovery row and no declared canary leg | VIOLATED (G-11-5) |
| 5d | meaningful read-only execution evidence: pi | `doctor --discovery` executes `pi --mode rpc` read-only in a COMPLETE paired unit | Discovery satisfies read-only native execution for pi under the "doctor or canary" disjunction | HOLDS (via discovery) |
| 5e | meaningful read-only execution evidence: hermes | `CHECK life02.canary.hermes.no-spend-execution VIOLATED`: CAPA-03 handoff source writes memory without launching hermes | Hermes is never launched by either mode | VIOLATED (G-11-6) |
| 5f | read-only: invocations change no managed config | `CHECK life02.repo-unchanged HOLDS`, `CHECK life02.canary.planning-unchanged HOLDS`, `CHECK life02.harness-homes-unchanged OBSERVED` | No alpha-AOS managed path drifted; 17-target host guard unchanged | HOLDS |
| 6a | coded findings | `evidence/life02-status.txt`: `CHECK life02.doctor.coded HOLDS` (19 findings with stable `code` and `level`) | All findings carry stable string codes | HOLDS |
| 6b | actionable findings for a needs-repair state | `CHECK life02.status.needs-repair HOLDS`, `CHECK life02.doctor.actionable HOLDS`, `CHECK life02.doctor.flags-corrupt-journal VIOLATED` | Status guidance is actionable prose but uncoded; doctor is coded but blind to journal corruption | VIOLATED (G-11-7) |

**Verdict**: PARTIAL (G-11-2, G-11-3, G-11-4, G-11-5, G-11-6, G-11-7). Offline fast status and coded findings hold. Native discovery and read-only execution hold for codex and pi, but antigravity is omitted (G-11-2, G-11-5), hermes lacks an oracle (G-11-3, G-11-6), claude requires model spend (G-11-4), and doctor findings are blind to journal corruption (G-11-7).


## LIFE-03

> **LIFE-03**: User can preview and remove a project pack, clean an isolated runtime, uninstall one target, or uninstall the full managed stack without removing harness applications, authentication, or unrelated user resources

| # | Clause | Evidence | Oracle audit (D-04) | Result |
|---|---|---|---|---|
| 1a | preview (uninstall) | `evidence/life03-uninstall.txt`: `life03.preview.target.no-mutation HOLDS`, `life03.preview.all.no-mutation HOLDS`, `life03.preview.purge.no-mutation HOLDS`. `evidence/life03-project.txt`: `life03.project.preview-no-mutation HOLDS` | Byte fingerprints of whole sandbox prove zero mutation across dry-runs | HOLDS |
| 1b | preview (project pack and isolated runtime) | `life03.pack.removal-offered HOLDS`, `life03.pack.status-no-mutation HOLDS`, `life03.runtime.preview-no-mutation HOLDS` | Removal digest matches approved execution | HOLDS |
| 2a | remove a project pack: approve route | `life03.pack.approve-route HOLDS` (removed 10 paths), `life03.pack.user-files-kept HOLDS`, `life03.pack.reversible HOLDS`. Residue: `life03.pack.empty-dirs-swept VIOLATED` (5 empty directories), `life03.pack.receipt-after-removal OBSERVED` | Pack targets removed, but empty directories remain and receipt is unretired | HOLDS (targets removed; residue in G-11-11) |
| 2b | remove a project pack: `uninstall --project` route | `life03.project.pack-removed VIOLATED` (all 5 pack skill files remain), `life03.project.user-file-kept VIOLATED` (`p11-user-notes.txt` deleted), `life03.project.manifest-kept VIOLATED` (`stack.yaml` deleted) | `uninstall --project` deletes everything in `.alpha-aos/` (including user files) and leaves pack skill files | VIOLATED (G-11-10) |
| 3 | clean an isolated runtime | `life03.runtime.clean-removes HOLDS`, `life03.runtime.project-kept HOLDS`, `life03.runtime.journaled HOLDS` | Marked generated runtime removed and journaled cleanly | HOLDS |
| 4a | uninstall one target: claude | `life03.target.claude.managed-mcp-removed HOLDS`, `owned-removed VIOLATED` (`alpha-aos-control` and `alpha-aos-ship` remain) | Owned skills not removed | VIOLATED (G-11-8) |
| 4b | uninstall one target: codex | `life03.target.codex.managed-mcp-removed HOLDS`, `owned-removed VIOLATED` (`alpha-aos-control` remains) | Owned skill remains in `<home>/.agents/skills` | VIOLATED (G-11-8) |
| 4c | uninstall one target: antigravity | `life03.target.antigravity.managed-mcp-removed HOLDS`, `owned-removed VIOLATED` (`alpha-aos-control` remains) | Owned skill remains | VIOLATED (G-11-8) |
| 4d | uninstall one target: pi | `life03.target.pi.managed-mcp-removed HOLDS`, `owned-removed VIOLATED`; `life03.target.pi.sibling-codex-intact VIOLATED` | Removes shared ECC skills, breaking sibling codex install | VIOLATED (G-11-8, G-11-9) |
| 4e | uninstall one target: hermes | `life03.target.hermes.managed-mcp-removed HOLDS`, `owned-removed VIOLATED` (`alpha-aos-control` remains) | Owned skill remains | VIOLATED (G-11-8) |
| 5 | uninstall the full managed stack | `life03.all.leftovers VIOLATED` (6 of 7 journal-recorded targets still present after `uninstall --all`); `life03.runtime.uninstall-all-isolated VIOLATED` (isolated runtime survives) | Owned skills, `settings.json` stub, and isolated runtimes survive `uninstall --all` | VIOLATED (G-11-8, G-11-12) |
| 6 | without removing harness applications | `life03.all.harness-apps-kept HOLDS` (all 5 harness applications discoverable before and after) | Harness binaries outside sandbox are untouched | HOLDS |
| 7 | without removing authentication | `life03.target.<h>.auth-kept HOLDS` for all five, `life03.all.auth-kept HOLDS`, `life03.all.purge-auth-kept HOLDS` | Synthetic sentinels across all five harness auth paths untouched | HOLDS |
| 8a | without removing user MCP entries | `life03.target.<h>.user-mcp-kept HOLDS` for all five, `life03.all.user-mcp-kept HOLDS` | User-authored MCP entries preserved | HOLDS |
| 8b | without removing user skills | `life03.target.<h>.user-skill-kept HOLDS` for all five, `life03.all.user-skill-kept HOLDS` | User-authored skills preserved | HOLDS |
| 8c | without removing user project files | Approve route: `life03.pack.user-files-kept HOLDS`. Uninstall route: `life03.project.user-file-kept VIOLATED`, `life03.project.manifest-kept VIOLATED` | `uninstall --project` deletes user note and manifest | VIOLATED (G-11-10) |
| 9 | interactive confirmation | `life03.tty.prompt-shown HOLDS`, `life03.tty.no-aborts HOLDS`, `life03.tty.yes-proceeds HOLDS` (WSL pty); `life03.guard.non-tty-refuses HOLDS` | TTY prompt and non-interactive refusal verified | HOLDS |

### Host safety (D-13)

Phase 10 classified the Windows `~/.alpha-aos` change in CI run 35762417138 as `classification: test-isolation leak` (`.planning/debug/ci02-windows-alpha-aos-host-leak.md`). A different test file running concurrently wrote the real host state root; the released lifecycle alone left no `.alpha-aos` in its scratch home. The fix was in test code only: commits `8f17c7e` (`fix(10-03): redirect mcp-proxy test state root out of the host home`) and `7a3ee28` (`fix(10-03): journal gate receipts into test-owned state roots`), pinned by Phase 10 regression tests which passed on all three legs of run 35818198049. That record names no product requirement violation, and this verdict names none for it either.
The fresh product judgment is the host guard around every LIFE-03 probe: `life03-uninstall.txt`, `life03-project.txt`, and `life03-tty.txt` all end with `host-guard: unchanged (17 targets)`.

**Verdict**: GAP (G-11-8, G-11-9, G-11-10, G-11-11, G-11-12). `uninstall --project` removes user files while leaving pack skills in place (G-11-10); target and full-stack uninstalls fail to remove alpha-AOS-owned skills and isolated runtimes (G-11-8, G-11-12); target uninstall of pi deletes codex's shared ECC skills (G-11-9); and pack removal leaves empty directory residue (G-11-11).


## LIFE-04

> **LIFE-04**: User can remove only receipted alpha-AOS-owned bytes or semantic entries that still match their recorded applied state, while drifted or user-modified resources cause a refusal

| # | Clause | Evidence | Oracle audit (D-04) | Result |
|---|---|---|---|---|
| 1a | remove only receipted semantic entries (no-receipt state) | `evidence/life04-receipts.txt`: `CHECK life04.no-receipt.<h>.mcp-kept VIOLATED` across all five harnesses (`claude`, `codex`, `antigravity`, `pi`, `hermes`) | In sandboxes with no alpha-AOS install and no receipts/journals, uninstall removed user-authored MCP servers matching managed names (`context7`, `exa`, `firecrawl`) | VIOLATED (G-11-13) |
| 1b | remove only receipted owned bytes (no-receipt skills) | `CHECK life04.no-receipt.<h>.skill-kept VIOLATED` across all five harnesses | User-authored skill directories with matching names (`deep-research`, `documentation-lookup`, `unified-memory`) removed without receipt check | VIOLATED (G-11-13) |
| 1c | remove only receipted owned bytes (project uninstall) | `CHECK life04.project.non-receipted VIOLATED` (`.alpha-aos/p11-user-notes.txt` deleted) | `uninstall --project` deletes unreceipted user files in `.alpha-aos/` | VIOLATED (G-11-16) |
| 2 | still match their recorded applied state | `CHECK life04.receipted.owned-skill-removed VIOLATED` (`alpha-aos-control/SKILL.md` matching recorded `afterHash` is never removed by uninstall) | Journaled owned skills matching applied state are preserved as leftovers | VIOLATED (G-11-17) |
| 3 | user-modified resources cause a refusal | `CHECK life04.modified.skill VIOLATED` (user-edited `deep-research/SKILL.md` removed with exit 0); `CHECK life04.modified.mcp-entry VIOLATED` (user-edited `exa` MCP argument removed with exit 0) | User-modified skills and MCP entries are silently pruned without refusal | VIOLATED (G-11-14) |
| 4a | post-preview drift causes refusal | `CHECK life04.preview-hash.enforced VIOLATED` (`config.toml` modified between preview and apply; apply pruned without checking `currentHash` or refusing) | Content drift between preview and apply does not trigger refusal | VIOLATED (G-11-15) |
| 4b | syntactic tampering causes refusal | `CHECK life04.tamper.refuses HOLDS` (exit 2, stderr reports semantic prune drift); `CHECK life04.tamper.zero-bytes-changed HOLDS` (home and state fingerprints byte-identical) | Corrupted markers in configuration files trigger refusal before mutation | HOLDS |

### Host safety (D-13)

Phase 10 classified the Windows `~/.alpha-aos` change in CI run 35762417138 as `classification: test-isolation leak` (`.planning/debug/ci02-windows-alpha-aos-host-leak.md`). A different test file running concurrently wrote the real host state root; the released lifecycle alone left no `.alpha-aos` in its scratch home. The fix was in test code only: commits `8f17c7e` (`fix(10-03): redirect mcp-proxy test state root out of the host home`) and `7a3ee28` (`fix(10-03): journal gate receipts into test-owned state roots`), pinned by Phase 10 regression tests which passed on all three legs of run 35818198049. That record names no product requirement violation, and this verdict names none for it either.
The fresh product judgment is the host guard around `life04-receipts.mjs`: `evidence/life04-receipts.txt` ends with `host-guard: unchanged (17 targets)`.

**Verdict**: GAP (G-11-13, G-11-14, G-11-15, G-11-16, G-11-17). Uninstall prunes resources by fixed name lists rather than verifying receipts or applied states, removing user files upon name collision (G-11-13, G-11-16); user edits and post-preview content drift do not trigger refusal (G-11-14, G-11-15); and receipted owned skills matching applied state are not removed (G-11-17). Only syntactic marker tampering triggers refusal.


## LIFE-05

> **LIFE-05**: User can preview and apply rollback to restore exact prior bytes, and any post-transaction drift prevents all rollback writes before mutation begins

| # | Clause | Evidence | Oracle audit (D-04) | Result |
|---|---|---|---|---|
| 1 | preview ... rollback | `evidence/life05-rollback.txt`: `life05.preview.no-mutation HOLDS` (fingerprints identical), `life05.preview.lists-targets HOLDS`. `life05.preview.reflects-drift VIOLATED` (preview displays RESTORE lines without indicating that apply will refuse due to target drift). CI guard test in `test/rollback-cli-verification.test.ts` | Process-level CLI preview verified to perform zero writes, but dry-run omits hash checks against disk | PARTIAL (preview mutates nothing, but fails to reflect drift; G-11-18) |
| 2 | apply rollback to restore exact prior bytes | `life05.apply.exact-bytes HOLDS` (restored target sha256 byte-for-byte identical to pre-state `b50218c344e0...`), `life05.apply.created-removed HOLDS`. Guard test passes locally and in WSL | Replaces Phase 6 directory-only assertion with byte-level restoration proof through the packed CLI | HOLDS |
| 3 | post-transaction drift prevents all rollback writes | `life05.drift.refuses HOLDS` (exit 2, JSON `ok: false`, stderr diff output), `life05.drift.zero-writes HOLDS` (fingerprints of home and whole state root, including journal and snapshots, unchanged). Guard test passes | Extends Phase 6 target-only check (`test/rollback.test.ts:61-63`) to fingerprint the whole state root | HOLDS |
| 4 | before mutation begins | `life05.drift.zero-writes HOLDS` (preflight aborts before touching any file), `life05.lifo.enforced HOLDS` (non-head rollback refused with exit 2 naming LIFO ordering; zero bytes changed) | Verifies preflight check and head-of-chain enforcement through the packed CLI | HOLDS |

**Verdict**: PARTIAL (G-11-18). Apply restores exact prior bytes byte-for-byte, post-transaction drift refusal performs zero writes across both target roots and the entire internal state root, and strict LIFO ordering is enforced. However, rollback preview omits drift preflight and promises an unfulfillable restore on drifted targets (LIFE-05/C1, G-11-18).


## LIFE-06

> **LIFE-06**: User can diagnose corrupt or interrupted journals as `needs-repair` and receive restart-safe recovery guidance instead of a false success state

| # | Clause | Evidence | Oracle audit (D-04) | Result |
|---|---|---|---|---|
| 1 | diagnose corrupt journals as `needs-repair` | `evidence/life06-recovery.txt`: `life06.corrupt.flagged HOLDS` (syntax error flags `needsRepair: true`), `life06.corrupt.resolved HOLDS` (quarantined to unblock). `life06.p5.flagged HOLDS` (journal missing `files` array flags needsRepair). `life06.p5.resolved VIOLATED` (planCrashRepair throws unhandled TypeError, falls back to writer repair planning none, repair fails with exit 2) | Phase 6 tested syntax errors only; P5 structural corruption crashes the crash repair planner | PARTIAL (syntax quarantined; missing files array unhandled; G-11-22) |
| 2 | diagnose interrupted journals as `needs-repair` | `life06.after-snapshot-sync.status-needs-repair OBSERVED`, `after-intent-journal-sync`, `after-target-rename`, `after-step-sync`, `after-final-sync` all exit 1 with `needsRepair: true` | Real interruptions at all five durable boundaries diagnosed as needs-repair via packed CLI | HOLDS |
| 3 | restart-safe recovery guidance | `life06.guidance.names-repair-command HOLDS` (`Run 'alpha-aos repair'`). `life06.guidance.names-apply VIOLATED` (preview omits instruction to pass `--apply`). `life06.guidance.says-rerun VIOLATED` (omits rerun instruction). `life06.<fp>.restart-succeeds HOLDS` across all 5 failpoints. `life06.<fp>.repair-idempotent VIOLATED` (second repair exits 2) | Restarts succeed safely across all 5 failpoints, but guidance text omits `--apply` and rerun advice, and repeat repair exits 2 | PARTIAL (G-11-19, G-11-20, G-11-21) |
| 4 | instead of a false success state | `life06.after-snapshot-sync.no-false-success HOLDS`, `after-intent-journal-sync`, `after-target-rename`, `after-step-sync`, `after-final-sync` all HOLDS. `life06.<fp>.target-consistent HOLDS` (targets match pre- or post-state, never corrupted) | Zero false success states observed across any durable boundary | HOLDS |

### Open Question 2 resolution

Research open question 2 asked whether real command paths can produce a `failed` journal that leaves targets in an inconsistent state. Per the plan rule, two bounded attempts were made in `life06-recovery.mjs`: Attempt A (pre-created blocker directory) and Attempt B (obstructed rollback path). Both completed cleanly or rolled back without producing a `failed` journal (`life06.p6.real-failed-journal OBSERVED not produced`). In accordance with the rule, the `failed`-journal behavior remains an unconfirmed lead under Leads (not reproduced).

**Verdict**: PARTIAL (G-11-19, G-11-20, G-11-21, G-11-22). Every durable boundary is diagnosed as `needs-repair` without false success, repair restores pre-state or releases locks, target consistency is maintained, and restarts succeed cleanly. Syntax-corrupted journals are quarantined. However, crash repair preview omits `--apply` instructions (G-11-19), neither status nor repair advises command re-run (G-11-20), repeat repair exits 2 (G-11-21), and malformed journals missing `files` crash repair planning (G-11-22).


## LIFE-07

> **LIFE-07**: User is shown verified external package changes and component-specific recovery instructions when managed-file rollback cannot safely reverse GSD, ECC, npm-link, or Pi bridge state

| # | Clause | Evidence | Oracle audit (D-04) | Result |
|---|---|---|---|---|
| 1 | shown verified external package changes | `evidence/life07-external.txt`: `life07.external.shown HOLDS`, `life07.external.verified HOLDS`, `life07.failure.names-external HOLDS`. `life07.external.pi-bridge-shown NOT-OBSERVED` | External package changes are faithfully detected and reported during installation and failure reporting | HOLDS |
| 2 | component-specific recovery instructions: ECC | `life07.external.recovery-shown VIOLATED`, `life07.failure.component-instructions VIOLATED`, `life07.failure.receipt-written OBSERVED` (0 receipts on failure). `life07.compensation.ecc-package VIOLATED` (`@enterprise-coding-companion/companion` instead of `ecc-universal`) | Phase 6 test pinned obsolete package name; recovery instructions and failure receipts are missing | VIOLATED (G-11-23, G-11-24) |
| 3 | component-specific recovery instructions: GSD | `life07.compensation.gsd-path VIOLATED` (command instructs `rm -rf ~/.claude/get-shit-done ~/.codex/get-shit-done` instead of actual path `<config root>/gsd-core`) | Hardcoded legacy directory paths do not match actual installation | VIOLATED (G-11-25) |
| 4 | component-specific recovery instructions: Pi bridge | `life07.compensation.pi-bridge VIOLATED` (Pi bridge omitted from recovery receipt; `compensatePiBridge` emits invalid `npm unlink`) | Omitted from uninstall receipt | VIOLATED (G-11-26) |
| 5 | component-specific recovery instructions: npm-link | `life07.compensation.npm-link HOLDS` (`npm unlink -g alpha-aos`), `life07.receipt.written HOLDS` (1 receipt written containing npm-link) | Command matches package name | HOLDS |

**Verdict**: GAP (G-11-23, G-11-24, G-11-25, G-11-26). External package changes are reported, but component-specific recovery instructions fail across three components: install failures persist no recovery receipts (G-11-23), ECC compensation cites an obsolete package name (G-11-24), GSD compensation targets non-existent legacy paths (G-11-25), and Pi bridge compensation is omitted (G-11-26).

## LIFE-08

> **LIFE-08**: User can run update preview with no checkout, package, global-link, configuration, or managed-state mutation, and update apply reconciles only a reviewed stable-lock promotion

| # | Clause | Evidence | Oracle audit (D-04) | Result |
|---|---|---|---|---|
| 1 | no checkout mutation | `life08.preview.bootstrap-update.no-mutation HOLDS`, `bootstrap-update-human.no-mutation HOLDS`, `update-sh.no-mutation HOLDS`, `update-ps1.drift-scope OBSERVED` (0 checkout drift) | Byte fingerprint of the entire checkout work tree and `.git` | HOLDS |
| 2 | no package mutation | `life08.preview.update-default.no-mutation HOLDS`, `update-check.no-mutation HOLDS`, `update-stage.no-mutation HOLDS` on `<sandbox>/prefix` | Prefix holding installed package unchanged | HOLDS |
| 3 | no global-link mutation | `<sandbox>/prefix` bin shims unchanged across all preview surfaces | Global bin link prefix completely untouched | HOLDS |
| 4 | no configuration mutation | `<sandbox>/home` configuration roots unchanged across all CLI and shell update preview surfaces | The strict byte check on update.ps1 drifted only for PowerShell's own engine cache (`StartupProfileData-NonInteractive`) under `LOCALAPPDATA`, reproduced by a no-alpha-AOS control; no harness or alpha-AOS config changed | HOLDS |
| 5 | no managed-state mutation | `<sandbox>/state` unchanged across all seven preview surfaces | Byte fingerprints of journals, snapshots, and writer lock equal | HOLDS |
| 6 | update apply reconciles only reviewed stable-lock promotion | `evidence/life08-apply.txt`: `life08.apply.candidate-ignored HOLDS` (unreviewed `candidate.lock.json` with 9.9.9 ignored byte-for-byte), `life08.apply.no-new-journal HOLDS`, `life08.apply.reconciles-stable HOLDS` | Packed CLI with real candidate file present ignores candidate and reconciles stable lock | HOLDS |

**Verdict**: VERIFIED (none). All seven preview surfaces mutate zero checkout, package, global-link, configuration, or managed-state bytes. The only strict byte difference observed on `update.ps1` is PowerShell engine startup caching under `LOCALAPPDATA`, which is external to the product and reproduced by a no-alpha-AOS control. Update apply ignores unreviewed candidate locks and reconciles the stable lock.


## Gap register

| Gap | Requirement | Clause | Kind | Missing | Closes when | Reproduction |
|---|---|---|---|---|---|---|
| G-11-1 | LIFE-01 | install or reconcile the reviewed stable lock (combined codex and pi targets) | failed | Combined install for targets sharing a destination (`<home>/.agents/skills/alpha-aos-control/SKILL.md`) fails with plan-drift | Combined install over targets sharing a destination completes in one operation, second plan is CURRENT, second apply byte-identical | `evidence/life01-harnesses-reconcile.txt`: `CHECK life01.all.initial-apply VIOLATED exit=2; stderr: "alpha-aos: plan-drift: owned-skill-sync changed between review and apply: reviewed <digest>, observed <digest>."` |
| G-11-2 | LIFE-02 | native discovery (antigravity) | failed | `doctor --discovery` produces no antigravity row at all, silently omitting a supported harness | `doctor --discovery` reports an antigravity row: a COMPLETE unit from a free native oracle or explicit unsupported/not-run row | `evidence/life02-discovery.txt`: `CHECK life02.discovery.antigravity VIOLATED absent from discovery rows` |
| G-11-3 | LIFE-02 | native discovery (hermes) | failed | No free discovery oracle is defined for hermes; both hermes discovery rows report unsupported | A hermes discovery oracle that runs read-only and yields a COMPLETE paired unit | `evidence/life02-discovery.txt`: `CHECK life02.discovery.hermes VIOLATED BROWNFIELD_INIT: completeness=null support=unsupported nativeUse=null notRun="no discovery oracle is defined for hermes, so there is nothing free to run"` |
| G-11-4 | LIFE-02 | meaningful read-only execution evidence (claude) | failed | Any Claude execution or discovery evidence that costs nothing; every Claude oracle and canary leg spends a model turn | The REL-02 / G-07-2 real-host invocation receipt (future requirement owning Claude cost-excluded legs, D-10), or deliberate spending canary run | `evidence/life02-discovery.txt`: `CHECK life02.canary.claude.no-spend-execution VIOLATED no no-spend leg launched this harness's own native surface; note: canary cost line: This run would drive 10 canary/harness pair(s): 10 spend a model turn, 0 do not` |
| G-11-5 | LIFE-02 | meaningful read-only execution evidence (antigravity) | failed | Every read-only execution path for antigravity: no discovery row (C1) and no declared canary leg | A free read-only antigravity invocation reachable from doctor --discovery or doctor --canary --no-spend that yields a COMPLETE unit or launched leg | `evidence/life02-discovery.txt`: `CHECK life02.canary.antigravity.no-spend-execution VIOLATED no canary leg is declared for this harness` |
| G-11-6 | LIFE-02 | meaningful read-only execution evidence (hermes) | failed | Every read-only execution path for hermes: no discovery oracle (C2), and in CAPA-03 handoff hermes is only the source, written by alpha-AOS without launching hermes | A free read-only hermes invocation, through a discovery oracle or a no-spend canary leg, that launches hermes and completes | `evidence/life02-discovery.txt`: `CHECK life02.canary.hermes.no-spend-execution VIOLATED no no-spend leg launched this harness's own native surface; legs: CAPA-03 handoff source` |
| G-11-7 | LIFE-02 | actionable coded findings (for a needs-repair state) | failed | Coded doctor finding for unhealthy journal: status reports NEEDS-REPAIR with uncoded prose, while doctor --json exits 0 and names no journal problem | doctor emits error/warning finding with stable code for corrupt/incomplete journals and stale writer locks, naming runnable next action (alpha-aos repair), or status carries code | `evidence/life02-status.txt`: `CHECK life02.doctor.flags-corrupt-journal VIOLATED doctor --json exit=0; no error- or warning-level finding names the journal problem` |
| G-11-8 | LIFE-03 | uninstall one target (all five harnesses) and uninstall the full managed stack | failed | Uninstall planner never removes owned skills written by install: alpha-aos-control/SKILL.md stays on all 5 harnesses, alpha-aos-ship stays on claude, settings.json pruned to 3B | After uninstall --target <h> --yes --apply, no file recorded as created for <h> remains; after uninstall --all --yes --apply, leftover scan is empty | `evidence/life03-uninstall.txt`: `CHECK life03.all.leftovers VIOLATED 6 of 7 journal-recorded targets still present after uninstall --all; CHECK life03.target.claude.owned-removed VIOLATED` |
| G-11-9 | LIFE-03 | uninstall one target | failed | uninstall --target pi removes shared ECC skills from <home>/.agents/skills even though codex is still installed, dropping codex out of CURRENT | uninstall --target <h> removes a file from a shared root only when no other installed target still claims it | `evidence/life03-uninstall.txt`: `CHECK life03.target.pi.sibling-codex-intact VIOLATED codex (still installed) ECC skills present under <sandbox>\\home\\.agents\\skills: none; codex plan step ecc:codex=create` |
| G-11-10 | LIFE-03 | remove a project pack (uninstall --project route), and without removing unrelated user resources | failed | uninstall --project deletes all files under <project>/.alpha-aos/ (including user files and stack.yaml), while leaving all materialized pack skill files and sidecars | uninstall --project removes only receipted pack targets whose bytes match receipts, leaving user files under .alpha-aos/ and manifest intact | `evidence/life03-project.txt`: `CHECK life03.project.pack-removed VIOLATED exit=0; receipted pack targets still present; CHECK life03.project.user-file-kept VIOLATED; CHECK life03.project.manifest-kept VIOLATED` |
| G-11-11 | LIFE-03 | remove a project pack (approve route); uninstall one target and full stack (directory residue) | failed | Approve-route pack removal leaves empty pack-created directories and keeps pack receipt, causing status to perpetually offer an unapprovable removal; uninstall leaves empty skill directories | Pack removal sweeps empty pack directories and retires receipt; uninstall --all sweeps empty skill directories | `evidence/life03-project.txt`: `CHECK life03.pack.empty-dirs-swept VIOLATED empty pack-created directories left behind; CHECK life03.pack.removal-still-offered OBSERVED after the removal project status still offers a removal` |
| G-11-12 | LIFE-03 | uninstall the full managed stack (isolated runtimes) | failed | uninstall --all does not remove marked isolated runtimes under <state>/isolated/<project-id> | uninstall --all --yes --apply removes every marked isolated runtime through the marker-checked journaled clean path | `evidence/life03-project.txt`: `CHECK life03.runtime.uninstall-all-isolated VIOLATED the p4 isolated runtime <state>/isolated/<project-id> survived uninstall --all --yes --apply` |
| G-11-13 | LIFE-04 | remove only receipted alpha-AOS-owned bytes or semantic entries | failed | Uninstall identifies managed MCP entries and skills by hardcoded name lists rather than verifying against journals/receipts, removing user-authored resources on all 5 harnesses when no alpha-AOS install exists | Uninstall consults transaction journals or state receipts before removing MCP servers and skill directories, preserving unreceipted entries | `evidence/life04-receipts.txt`: `CHECK life04.no-receipt.claude.mcp-kept VIOLATED; CHECK life04.no-receipt.claude.skill-kept VIOLATED (and across all five harnesses)` |
| G-11-14 | LIFE-04 | user-modified resources cause a refusal | failed | User modifications to managed skill files or MCP configurations do not trigger refusal during uninstall; uninstall deletes them with exit 0 | Uninstall verifies on-disk file and entry hashes against applied hashes in journals/receipts and refuses when user modifications are detected | `evidence/life04-receipts.txt`: `CHECK life04.modified.skill VIOLATED user-modified skill deleted by uninstall with exit 0; CHECK life04.modified.mcp-entry VIOLATED` |
| G-11-15 | LIFE-04 | entries that still match their recorded applied state, while drifted ... cause a refusal | failed | Content modifications made after preview do not cause refusal during apply; currentHash in the uninstall plan is not re-checked against disk at apply time | applyUninstall checks current file hashes against the reviewed plan's currentHash and refuses on drift | `evidence/life04-receipts.txt`: `CHECK life04.preview-hash.enforced VIOLATED config modified after preview was pruned during apply without refusal` |
| G-11-16 | LIFE-04 | remove only receipted alpha-AOS-owned bytes | failed | uninstall --project deletes non-receipted user files under <project>/.alpha-aos/ | uninstall --project checks pack receipts before deleting any file and leaves non-receipted user files intact | `evidence/life04-receipts.txt`: `CHECK life04.project.non-receipted VIOLATED uninstall --project deleted user file .alpha-aos/p11-user-notes.txt` |
| G-11-17 | LIFE-04 | remove only receipted alpha-AOS-owned bytes ... that still match their recorded applied state | failed | Receipted alpha-AOS-owned skills matching their applied journaled hashes are never removed by target or full stack uninstall | Uninstall planner includes receipted owned skills matching journaled hashes in planned removals | `evidence/life04-receipts.txt`: `CHECK life04.receipted.owned-skill-removed VIOLATED receipted owned skill matching afterHash was not removed` |
| G-11-18 | LIFE-05 | preview ... rollback | failed | alpha-aos rollback preview checks only structural existence and LIFO ordering, omitting hash preflight against disk; on drifted targets preview prints RESTORE and promises a restore apply immediately refuses | planManagedRollback checks target file hashes on disk against journal afterHash and indicates drift or refusal in preview output | `evidence/life05-rollback.txt`: `CHECK life05.preview.reflects-drift VIOLATED preview printed RESTORE and dry-run footer without reporting that target has drifted` |
| G-11-19 | LIFE-06 | restart-safe recovery guidance | failed | alpha-aos repair crash repair preview displays alpha-AOS Crash Repair Plan without instructing the user to pass --apply to execute it | formatCrashRepairPlan prints 'Pass --apply to execute this repair plan' or equivalent guidance | `evidence/life06-recovery.txt`: `CHECK life06.guidance.names-apply VIOLATED repair preview does not instruct passing '--apply'` |
| G-11-20 | LIFE-06 | restart-safe recovery guidance | failed | Neither status nor repair advises the user to re-run the interrupted command after repair completes | formatCrashRepairResult or formatOfflineStatus includes a note advising user to re-run interrupted operation after successful repair | `evidence/life06-recovery.txt`: `CHECK life06.guidance.says-rerun VIOLATED repair/status guidance does not instruct user to re-run the interrupted operation` |
| G-11-21 | LIFE-06 | restart-safe recovery guidance | failed | alpha-aos repair --apply re-invoked on an already-repaired clean state exits 2 with 'no writer lock is present' rather than exiting 0 or no-op | alpha-aos repair --apply on a clean state reports that no repair is needed and exits 0 | `evidence/life06-recovery.txt`: `CHECK life06.after-snapshot-sync.repair-idempotent VIOLATED exit=2, fingerprints unchanged=true` |
| G-11-22 | LIFE-06 | diagnose corrupt journals as needs-repair | failed | Incomplete journal missing files array causes planCrashRepair to throw unhandled TypeError, falling back to writer repair which plans none, leaving status permanently in needsRepair=true | planCrashRepair validates Array.isArray(journal.files) and treats a journal missing files as corrupt/unrecoverable, quarantining it | `evidence/life06-recovery.txt`: `CHECK life06.p5.resolved VIOLATED repair planned action unknown; status after still needsRepair=true` |
| G-11-23 | LIFE-07 | component-specific recovery instructions when managed-file rollback cannot safely reverse | failed | When install fails after external package changes have been applied, CLI reports retained changes but emits no component recovery instructions and writes no recovery receipt under <state>/receipts | Install failure rollback writes a durable recovery receipt and prints actionable recovery commands naming external package on disk | `evidence/life07-external.txt`: `CHECK life07.failure.component-instructions VIOLATED; CHECK life07.failure.receipt-written OBSERVED` |
| G-11-24 | LIFE-07 | component-specific recovery instructions (ECC) | failed | ECC compensation command in uninstall receipt specifies obsolete package npm uninstall -g @enterprise-coding-companion/companion instead of locked ecc-universal | ECC compensation instructions derive package name directly from stable lock (components.ecc.package) | `evidence/life07-external.txt`: `CHECK life07.compensation.ecc-package VIOLATED ECC compensation command: 'npm uninstall -g @enterprise-coding-companion/companion'` |
| G-11-25 | LIFE-07 | component-specific recovery instructions (GSD) | failed | GSD compensation command in uninstall receipt specifies legacy path rm -rf ~/.claude/get-shit-done ~/.codex/get-shit-done instead of actual installed path <config root>/gsd-core | GSD compensation commands reference actual installed paths <config root>/gsd-core and <config root>/.gsd-profile | `evidence/life07-external.txt`: `CHECK life07.compensation.gsd-path VIOLATED GSD compensation command: 'rm -rf ~/.claude/get-shit-done ~/.codex/get-shit-done'` |
| G-11-26 | LIFE-07 | component-specific recovery instructions (Pi bridge) | failed | Uninstall recovery receipt omits Pi bridge entirely; compensatePiBridge specifies npm unlink @modelcontextprotocol/server-pi instead of pi remove or pi-mcp-adapter | Uninstall recovery receipt includes Pi bridge entry matching pi-mcp-adapter and its native Pi installation route | `evidence/life07-external.txt`: `CHECK life07.compensation.pi-bridge VIOLATED Pi bridge compensation command: none` |

## Leads (not reproduced)

The following items were identified during research and investigation but were not reproduced as actionable gap candidates under the criteria of this phase (D-06):

- **Shared ECC skill roots promotion drift (LIFE-01 / LIFE-08 findings)**: Codex and Pi share `<home>/.agents/skills`. A stable-lock promotion that updates ECC skill bytes would plan `replace` steps for both targets in one operation, which could trigger review/apply plan drift similar to G-11-1. Not reproduced in Phase 11 because seeded ECC skills were already current.
- **Default install target selection (LIFE-01 findings)**: Running `alpha-aos install` without `--target` on a machine where both Codex and Pi are detected defaults to selecting both targets (`src/core/install.ts:156-158`), which would trigger G-11-1. The verification probes executed explicit target lists.
- **CLI rollback writer session locking (LIFE-05 findings)**: CLI `rollback` does not acquire `withWriterSession`, allowing theoretical race conditions with concurrent writers. In single-user developer workstation workflows, no concurrent drift was observed.
- **Unconfirmed failed journal handling (LIFE-06 findings, Open Question 2 / P6)**: Step 70 of `life06-recovery.mjs` showed that a synthetically constructed journal with status `"failed"` causes `status --json` to report `needsRepair: false`. However, real CLI transaction failures consistently trigger compensating reverse rollbacks that either clean up or mark the transaction rolled back. Real CLI execution did not produce a persistent `failed` journal with intermediate bytes (`life06.p6.real-failed-journal OBSERVED not produced`).
- **Pi config key deletion on uninstall (LIFE-03 findings)**: `prunePiConfig` unconditionally strips keys such as `hostConfigDiscovery`, `directTools`, and `outputGuard`. Unexercised because the test fixture added only MCP servers.
- **Codex MCP table naming collision (LIFE-03 findings)**: `stripManagedToml` strips tables matching managed names even if they were authored outside alpha-AOS. Exercised and evidenced under LIFE-04 (G-11-13).

## Observations

- **Diff redaction in committed evidence (LIFE-05 findings)**: In compliance with threat model T-11-23, unified diff bodies produced during rollback drift diagnostics were redacted in transcripts to metadata lines `[diff body redacted: <n> lines, sha256=<12-hex>]`, ensuring no fixture or system file contents leaked into git history.
- **Fast status timing benchmarks (LIFE-02 findings)**: Packed CLI `status --json` wall clock execution averaged ~800 ms, dominated by Node.js process initialization and catalog/lock YAML/JSON parsing. In-process `getOfflineStatus` executed in 2.35 ms on a populated state root, well within the 50 ms benchmark.
- **PowerShell engine startup caching (LIFE-08 findings)**: `scripts/update.ps1` exhibited minor file additions under `<sandbox>/home/AppData/Local/Microsoft/PowerShell/` (`StartupProfileData-NonInteractive`). A clean control probe running bare `pwsh` with identical non-alpha-AOS cmdlets reproduced the exact same caching behavior. This is engine-level infrastructure, not application configuration.
- **JSON cycle markers in canary output (LIFE-02 findings)**: `doctor --canary --json` emitted 21 `"[redacted:cycle]"` markers in cycle output envelopes. While not a contract violation, it restricts automated downstream consumers of `skipped` and `handoffResults` arrays.
- **Canary vault memory creation (LIFE-02 findings)**: `doctor --canary` creates one memory file per handoff in the target project vault, matching documented behavior. The root repository remained completely clean (`life02.repo-unchanged HOLDS`).
- **Bootstrap update JSON byte budget (LIFE-08 findings)**: `bootstrap update --json` exits 2 when the plan envelope exceeds 256 KiB, emitting an observable byte budget refusal message, while human-readable bootstrap preview succeeds.

## Re-run index (D-17)

Every finding in this report is backed by deterministic, automated probe scripts that can be independently re-run against a built package to confirm the exact check outcomes. The sample commands below run each probe family to a scratch location and diff the resulting CHECK assertions against committed evidence:

| Probe family | Re-run command | Committed transcript | Comparison |
|---|---|---|---|
| life01-reconcile | `npm run build && node .planning/phases/11-managed-lifecycle-verification/evidence/probes/life01-reconcile.mjs --out /tmp/rerun-life01.txt` | `.planning/phases/11-managed-lifecycle-verification/evidence/life01-codex-reconcile.txt` | `diff <(grep '^CHECK' .planning/phases/11-managed-lifecycle-verification/evidence/life01-codex-reconcile.txt) <(grep '^CHECK' /tmp/rerun-life01.txt)` |
| life02-status | `npm run build && node .planning/phases/11-managed-lifecycle-verification/evidence/probes/life02-status.mjs --out /tmp/rerun-life02.txt` | `.planning/phases/11-managed-lifecycle-verification/evidence/life02-status.txt` | `diff <(grep '^CHECK' .planning/phases/11-managed-lifecycle-verification/evidence/life02-status.txt) <(grep '^CHECK' /tmp/rerun-life02.txt)` |
| life03-uninstall | `npm run build && node .planning/phases/11-managed-lifecycle-verification/evidence/probes/life03-uninstall.mjs --out /tmp/rerun-life03.txt` | `.planning/phases/11-managed-lifecycle-verification/evidence/life03-uninstall.txt` | `diff <(grep '^CHECK' .planning/phases/11-managed-lifecycle-verification/evidence/life03-uninstall.txt) <(grep '^CHECK' /tmp/rerun-life03.txt)` |
| life05-rollback | `npm run build && node .planning/phases/11-managed-lifecycle-verification/evidence/probes/life05-rollback.mjs --out /tmp/rerun-life05.txt` | `.planning/phases/11-managed-lifecycle-verification/evidence/life05-rollback.txt` | `diff <(grep '^CHECK' .planning/phases/11-managed-lifecycle-verification/evidence/life05-rollback.txt) <(grep '^CHECK' /tmp/rerun-life05.txt)` |
| life06-recovery | `npm run build && node .planning/phases/11-managed-lifecycle-verification/evidence/probes/life06-recovery.mjs --out /tmp/rerun-life06.txt` | `.planning/phases/11-managed-lifecycle-verification/evidence/life06-recovery.txt` | `diff <(grep '^CHECK' .planning/phases/11-managed-lifecycle-verification/evidence/life06-recovery.txt) <(grep '^CHECK' /tmp/rerun-life06.txt)` |
| life07-external | `npm run build && node .planning/phases/11-managed-lifecycle-verification/evidence/probes/life07-external.mjs --out /tmp/rerun-life07.txt` | `.planning/phases/11-managed-lifecycle-verification/evidence/life07-external.txt` | `diff <(grep '^CHECK' .planning/phases/11-managed-lifecycle-verification/evidence/life07-external.txt) <(grep '^CHECK' /tmp/rerun-life07.txt)` |
| life08-apply | `npm run build && node .planning/phases/11-managed-lifecycle-verification/evidence/probes/life08-apply.mjs --out /tmp/rerun-life08.txt` | `.planning/phases/11-managed-lifecycle-verification/evidence/life08-apply.txt` | `diff <(grep '^CHECK' .planning/phases/11-managed-lifecycle-verification/evidence/life08-apply.txt) <(grep '^CHECK' /tmp/rerun-life08.txt)` |

*Note*: Pseudo-terminal confirmation probe `probes/life03-tty.mjs` requires a Linux environment (or WSL) with `util-linux` (`script` command): `wsl.exe node .planning/phases/11-managed-lifecycle-verification/evidence/probes/life03-tty.mjs --out /tmp/rerun-life03-tty.txt`.

## LIFE-09 completion

This verification report fulfills the LIFE-09 requirement: every lifecycle requirement from LIFE-01 through LIFE-08 carries an evidence-backed verdict (1 VERIFIED, 4 PARTIAL, 3 GAP) grounded in deterministic packed-CLI execution in isolated sandboxes, host-path immutability verifications, and audited unit/integration test suites. Every observed contract deviation is registered as a unique gap (`G-11-1` through `G-11-26`) detailing the failed clause, the missing functionality, the necessary close condition, and a reproducible test citation. All 26 gaps are tracked in `.planning/REQUIREMENTS.md` under Future Requirements, providing a complete and transparent baseline for subsequent development milestones.

