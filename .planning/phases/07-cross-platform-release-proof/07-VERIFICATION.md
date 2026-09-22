---
phase: 07-cross-platform-release-proof
verified: 2026-09-22T00:00:00Z
status: gaps_found
score: 4/5 must-haves verified
behavior_unverified: 0
overrides_applied: 0
decision_coverage:
  honored: 16
  total: 16
  not_honored: []
re_verification:
  previous_status: gaps_found
  previous_score: 5/5 (flagged with gap G-07-1)
  gaps_closed:
    - "G-07-1 structural component: src/core/support-matrix.ts no longer hardcodes `harnessId === \"claude\"` to a fixed RESIDUE tier. `activeSurfaces`'s type widened from `Exclude<HarnessId, \"claude\">` to the full `HarnessId` union; claude now carries four evidence-driven surfaces (GSD Core, Context7, Unified Memory, Project Packs) structured identically to codex's. The standalone fixed-tier claude entry was removed from `BASE_SUPPORT_MATRIX`. Independently re-verified: grep for `harnessId === \"claude\"` in src/core/support-matrix.ts returns zero matches; `npm run check` clean; support-matrix.test.js run standalone: 6/6 pass, including a new test proving claude reaches UNVERIFIED without a receipt and PROVEN with a real matching receipt, exactly like every other harness; docs/SUPPORT_MATRIX.md regenerated and confirmed byte-identical to source, with claude's four rows now UNVERIFIED (evidence-based) instead of a single fixed RESIDUE row; full suite independently re-run: 907 tests, 898 pass, 0 fail, 9 pre-existing skips (matches SUMMARY exactly). catalog/stack.yaml and catalog/canaries.yaml confirmed unmodified and already claude-inclusive (grep counts unchanged: 7 and 5 respectively); `policy.canaryHarness: codex` confirmed to gate only install-rollout pilot-harness sequencing (src/core/plan.ts, src/core/install.ts), not support-matrix evidence tiering — correctly left unchanged."
  gaps_remaining:
    - "G-07-2 (new, narrower than G-07-1): Claude Code itself has zero real-host discovery/invocation receipts. All four of claude's support-matrix cells evaluate to UNVERIFIED, not PROVEN — 07-08 deliberately did not run a real Claude Code canary invocation. Roadmap Success Criterion 2 / REL-02 requires 'current real-host native discovery and representative invocation evidence for every claimed harness and surface'; Claude is now a claimed harness under D-18 but does not yet meet that evidence bar. The structural impossibility (a harness that could never reach PROVEN regardless of evidence) is gone; the remaining gap is evidence-collection only, not a code defect."
  regressions: []
behavior_unverified_items: []
gaps:
  - gap_id: G-07-2
    requirement: REL-02
    truth: "Observable Truth 2 / Roadmap Success Criterion 2: a versioned support matrix shows current real-host native discovery and representative invocation evidence for every claimed harness and surface, while every unproven combination is visibly limited or unsupported."
    status: failed
    reason: "D-18 (03-CONTEXT.md, 2026-09-22) reinstated Claude Code into the active v0.1.0 harness scope on equal footing with Codex, Antigravity, Pi, and Hermes, making Claude a 'claimed harness' under this truth's wording. 07-08 (commit d0f9795) correctly removed the code-level structural impossibility that prevented Claude from ever reaching PROVEN, but 07-08 explicitly did not run a real Claude Code canary invocation (Task 2, by design, mirroring 07-02/07-05 precedent of never spending a real model turn inside a deterministic gap-closure plan). As a result, every one of Claude's four support-matrix cells (GSD Core, Context7, Unified Memory, Project Packs) still evaluates to UNVERIFIED — honestly reported, not fabricated, but not evidence of real-host discovery/invocation either. The truth as literally worded is therefore not yet fully true for the currently-claimed harness set."
    severity: moderate
    test: "From a host with an authenticated Claude Code login, obtain a genuine inspectable receipt in capabilities/ledger.json for at least one of Claude's four claimed surfaces, then confirm src/core/support-matrix.ts promotes the matching cell to PROVEN under the identical evidence rule every other harness is judged by (that promotion path is already proven by test/support-matrix.test.ts's Claude-PROVEN assertion). As of 2026-09-22 this cannot be done by running the canary as shipped — see root_cause."
    root_cause: "TWO STACKED DEFECTS, BOTH NOW FIXED (2026-09-22/23). This supersedes the earlier reading that 'no further code change closes this gap — only running the real canary does': running it is what exposed them. (1) AUTHENTICATION. Claude keeps its login inside CLAUDE_CONFIG_DIR (`~/.claude/.credentials.json`), which the canary runtime replaces to isolate configuration, skills, hooks, memory and MCP — hiding the credential with it. Every isolated run therefore reached its init event, connected the fronted server, then died at `result: \"Not logged in · Please run /login\"` with exit 1, after spending a model turn. Fixed by hard-linking the existing login into the runtime (createCanaryRuntime): by reference, never reading or copying the credential, which is the claude-side equivalent of what the codex canary branch already does; a runtime that cannot obtain the link refuses before spending. (2) TOOL PERMISSION. Isolation also hides the caller's tool approvals, and `-p` cannot prompt for one, so fronted calls were denied before reaching the observation front. Measured once authentication worked: `permission_denials` named `mcp__context7__resolve-library-id` — the exact tool this canary expects — while observations.jsonl stayed empty. alpha-AOS scored that as the harness failing to route: a FALSE NEGATIVE against an integration that was working. Fixed by granting the runtime's fronted servers at launch, by server rather than by tool name so fan-out and forbidden-tool controls stay observable. A third issue remains open and is recorded in `missing`: readiness still probes the USER's environment rather than the isolated runtime, which is why it answered `ready: true` before a run that could not authenticate."
    artifacts:
      - path: "capabilities/ledger.json"
        issue: "No Claude Code invocation proof exists on any host yet (this file is user/host state, not checked into the repo)"
      - path: "src/adapters/isolation.ts"
        issue: "The claude canary branch replaces CLAUDE_CONFIG_DIR, which is also where the login lives; it now records HARNESS_ISOLATION_UNPROVEN before spending instead of spending a turn that cannot authenticate"
      - path: "src/core/canary.ts"
        issue: "READINESS_DEFINITIONS.claude's connection probe reports the user's own MCP connections, not the isolated runtime's — a readiness answer about a different environment than the one that runs"
    missing:
      - "CAPA-01's declared expectation is not yet met on claude. The measured run (2026-09-23) put ONE observation in the sink: the harness natively called `resolve-library-id`, then answered without `query-docs`, so the verdict is honestly `unverified` on `missing: [query-docs]` rather than on a mechanical failure. Whether the runtime's own `alpha-aos-research-routing` instruction is reaching the model is the first thing to check: the runtime materializes it into the isolated config root's instruction directory while the launch passes `--setting-sources project,local`, which excludes user-scope settings."
      - "Once a canary's expectation is actually held, its receipt promotes the matching cell and REL-02 can be reconciled in .planning/REQUIREMENTS.md (its body text still says Claude Code 'remains compatibility residue', stale under D-18 regardless of this gap)."
      - "Readiness honesty for claude: its connection probe measures the user's environment rather than the isolated runtime, so a `ready: true` answer does not describe the run that follows — it listed the user's own MCP servers before a run that used one fronted server and could not authenticate. Recorded rather than left unstated; not required to close this gap."
    diagnosis_note: "Running the canary is what found the defects that made running it impossible, and both are now fixed: a claude canary authenticates on the caller's existing login by reference, and reaches its own observation front. The measured state as of 2026-09-23 is a real result rather than a mechanical failure — `outcome: ready`, `launched: true`, `exitCode: 0`, one observation recorded, `matched: [resolve-library-id]`, `missing: [query-docs]`. Claude's cells stay UNVERIFIED because the declared expectation is not held, which is the honest answer and the thing left to investigate; nothing here needs a human decision to proceed."
deferred: []
---

# Phase 7: Cross-Platform Release Proof Verification Report

**Phase Goal:** Users receive one v0.1.0 package whose behavior, contents, provenance, support claims, and complete brownfield workflow are proven against the same frozen bytes.
**Verified:** 2026-09-22T00:00:00Z
**Status:** gaps_found
**Re-verification:** Yes — re-verification of gap `G-07-1` after gap-closure plan 07-08 executed (commit `d0f9795`).

## Goal Achievement

Plan 07-08 closed the structural half of gap `G-07-1`: `src/core/support-matrix.ts` no longer hardcodes Claude Code to a fixed compatibility-only tier, and `activeSurfaces` now types over the full `HarnessId` union so Claude is judged by the identical evidence-based rule (unsupported → undetected → no-ledger → no-receipt → matching-receipt) as Codex, Antigravity, Pi, and Hermes. This was independently re-verified in this session, not taken on the SUMMARY's word: `npm run check` and `npm run build` ran clean, the six support-matrix tests were run standalone and all pass, a grep for the removed hardcode returns zero matches, `docs/SUPPORT_MATRIX.md` was read directly and confirmed to show Claude's four surfaces as evidence-based `UNVERIFIED` rows (no `RESIDUE` anywhere), the full 907-test suite was re-run once and matches the SUMMARY's reported 898 pass / 0 fail / 9 skipped exactly, and `catalog/stack.yaml` / `catalog/canaries.yaml` were confirmed unmodified with unchanged claude-occurrence counts.

However, Truth 2 / REL-02 is not fully re-satisfied. The truth requires "current real-host native discovery and representative invocation evidence for every claimed harness and surface." Claude Code is now a claimed harness under D-18, but 07-08 deliberately did not run a real Claude Code canary invocation (an explicit, reasoned deferral, not an oversight — see 07-08-SUMMARY.md and the gap record below). Every one of Claude's four cells therefore evaluates to `UNVERIFIED`: honestly reported, no longer structurally impossible to promote, but still not evidence. This is registered as a new, narrower gap `G-07-2`, superseding the closed `G-07-1`. Truths 1, 3, 4, 5 and Requirements REL-01, REL-03, REL-04, REL-05, REL-06 were not touched by 07-08 (confirmed via `git show d0f9795 --stat`, which shows only `src/core/support-matrix.ts`, `test/support-matrix.test.ts`, and `docs/SUPPORT_MATRIX.md` changed) and remain exactly as verified on 2026-09-20.

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | The same packed bytes pass the complete isolated lifecycle on Windows, macOS, and Linux. | ✓ VERIFIED (unchanged) | GitHub Actions CI run `35496805483`; SHA-256 `ce176c364fdaaa736343fca3656248e12fed673d20b0cab426b5d0da831e47b4`; not touched by 07-08. |
| 2 | Every claimed harness/surface has current real-host native discovery and representative invocation evidence. | ✗ FAILED (re-scoped: G-07-1 structural component closed; G-07-2 evidence component open) | `evaluateMatrixCell` and `activeSurfaces` independently confirmed to judge Claude identically to every other harness (no hardcode, 6/6 tests pass, grep clean). But Claude has zero real invocation receipts on any host — all four Claude cells are `UNVERIFIED` per `docs/SUPPORT_MATRIX.md` and `test/support-matrix.test.ts`. The code defect is gone; the evidence is still missing. See gap `G-07-2`. |
| 3 | Paired controls prove native optional invocation, project scope, mandatory gating, and tree-off exclusion. | ✓ VERIFIED (unchanged) | `test/release-controls.test.ts` / `src/core/release-controls.ts`; not touched by 07-08. |
| 4 | A real brownfield GSD lifecycle completes with one writer and all five representative elements. | ✓ VERIFIED (unchanged) | `src/core/brownfield-proof.ts` / `scripts/run-brownfield-proof.mjs`; not touched by 07-08. |
| 5 | The published package is the three-OS-qualified artifact and has verifiable provenance plus a public-registry fresh-install smoke proof. | ✓ VERIFIED (unchanged) | `scripts/release.mjs --dry-run`, tarball allowlist, Stage 1 local smoke; not touched by 07-08. |

**Score:** 4/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `src/core/support-matrix.ts` | Evidence-based `evaluateMatrixCell`/`activeSurfaces` covering all five `HarnessId` values, claude included | ✓ VERIFIED | Independently re-read; `harnessId === "claude"` grep returns zero matches; `activeSurfaces` typed `Readonly<Record<HarnessId, ...>>` with a claude entry mirroring codex's four rows. |
| `test/support-matrix.test.ts` | Assertions proving claude reaches UNVERIFIED without a receipt and PROVEN with a real matching receipt | ✓ VERIFIED | New test "inspectable matching invocation receipt promotes Claude active cell to PROVEN" present and passing; "support taxonomy refuses false PROVEN states" now asserts claude/Context7 is UNVERIFIED both undetected and detected-without-receipt. Ran standalone: 6/6 pass. |
| `docs/SUPPORT_MATRIX.md` | Regenerated, byte-identical-to-source support matrix reflecting Claude's evidence-based rows | ✓ VERIFIED | Read directly: claude's four rows now `UNVERIFIED` with evidence-based notes; no `RESIDUE` row anywhere in the file; "byte-identical" test passes. |
| `capabilities/ledger.json` (host state, not a repo artifact) | A real Claude invocation receipt | ✗ MISSING | Not checked into the repo (user/host state by design); no host has produced one. This is the substance of gap `G-07-2`. |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `support-matrix.ts activeSurfaces.claude` | `evaluateMatrixCell` → `matchingReceipt` → `capabilities/ledger.json` | Identical evidence path already used by codex, antigravity, pi, hermes | ✓ WIRED | Confirmed by reading the source: no branch short-circuits claude before `matchingReceipt` runs. Proven functionally by the new Claude-PROVEN test, which passes with a synthetic matching receipt. |
| `catalog/stack.yaml harnesses.claude` / `catalog/canaries.yaml` | Canary readiness/invocation machinery (`src/core/canary.ts`, `src/adapters/capability-oracle.ts`) | Pre-existing, unedited by this plan | ✓ WIRED (structurally) / ✗ NOT EXERCISED | Wiring confirmed present and unedited (grep counts match plan baseline). Not exercised: no real invocation has actually run through this path for Claude yet — this is exactly `G-07-2`. |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Claude no longer hardcoded to a fixed tier | `grep -c 'harnessId === "claude"' src/core/support-matrix.ts` | `0` | ✓ PASS |
| Type check clean after the widened `HarnessId` coverage | `npm run check` | exit 0, no diagnostics | ✓ PASS |
| Support-matrix test suite proves the fix without granting a free pass | `node scripts/run-tests.mjs --files dist/test/support-matrix.test.js` | 6/6 pass (incl. new Claude-PROVEN test) | ✓ PASS |
| Regenerated docs match source and show no RESIDUE | Read `docs/SUPPORT_MATRIX.md` directly | Claude's 4 rows: `UNVERIFIED`; zero `RESIDUE` rows | ✓ PASS |
| Full suite has zero regressions from the widened type | `npm test` (run once) | 907 tests, 898 pass, 0 fail, 9 skipped | ✓ PASS (matches SUMMARY exactly) |
| Catalog files unmodified, claude-inclusive as claimed | `grep -c claude catalog/canaries.yaml` / `catalog/stack.yaml` | `5` / `7` (matches plan's recorded baseline) | ✓ PASS |
| A real Claude Code canary invocation exists | n/a — deliberately not run by 07-08 | No receipt in any ledger | ✗ FAIL (expected; this is `G-07-2`) |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| REL-01 | 07-01, 07-07 | Same packed bytes complete lifecycle on three OSes without host mutation | ✓ SATISFIED (unchanged) | CI run `35496805483`. |
| REL-02 | 07-02, 07-05, 07-08 | Current real-host discovery and invocation evidence for every active claim | ✗ BLOCKED (re-scoped) | Structural blocker removed and independently re-verified (Task 1 of 07-08). Real Claude evidence still outstanding — see gap `G-07-2`. Codex, Antigravity, Pi, Hermes evidence paths unaffected and remain as previously verified. |
| REL-03 | 07-02, 07-05 | Paired native optional, project, gate, and opt-out controls | ✓ SATISFIED (unchanged) | `test/release-controls.test.ts`; not touched by 07-08. |
| REL-04 | 07-03, 07-06 | Real full brownfield GSD cycle with five representative elements | ✓ SATISFIED (unchanged) | `src/core/brownfield-proof.ts`; not touched by 07-08. |
| REL-05 | 07-01, 07-04, 07-07 | Published package is allowlisted and equals the three-OS artifact | ✓ SATISFIED (unchanged) | Not touched by 07-08. |
| REL-06 | 07-04, 07-07 | Published provenance, frozen lock, notes, limitations, Stage 1 smoke | ✓ SATISFIED (unchanged) | Not touched by 07-08. |

Note: `.planning/REQUIREMENTS.md`'s REL-02 body text still reads "...while Claude Code remains compatibility residue..." and its coverage table still marks REL-02 `Complete`. Both are now stale under D-18 (Claude is reinstated, and the code no longer treats it as fixed residue) but were deliberately left untouched by 07-08, per the original gap's own instruction not to edit that wording until real evidence exists. This verifier did not edit `.planning/REQUIREMENTS.md` either, for the same reason — that reconciliation is correctly sequenced to land together with (or immediately after) the real Claude canary evidence, not before it.

### Anti-Patterns Found

None. `src/core/support-matrix.ts`, `test/support-matrix.test.ts`, and `docs/SUPPORT_MATRIX.md` were scanned for `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER`/"not yet implemented" patterns — zero matches.

### Human Verification Required

None required to reach a decision on this re-verification — the remaining gap (`G-07-2`) is a deterministic, objectively-checkable evidence gap (a receipt either exists in the ledger or it doesn't), not a judgment call needing human interpretation. What a human does need to decide is a product/release choice, not a verification question: whether to (a) trigger the real Claude canary invocation now (`alpha-aos doctor --canary --harness claude --no-spend` then `--capability CAPA-01`) and close `G-07-2` with genuine evidence, or (b) explicitly accept the current state via an `overrides:` entry in this file's frontmatter if the project chooses to ship v0.1.0 with Claude's evidence deferred to a documented post-release follow-up.

### Gaps Summary

`G-07-1` is closed: the code-level structural impossibility that made Claude Code incapable of ever reaching `PROVEN` regardless of evidence has been removed from `src/core/support-matrix.ts`, independently re-verified by this session (clean typecheck, standalone test run, grep, regenerated docs, full-suite regression run, and unedited-catalog confirmation).

A new, narrower gap `G-07-2` is registered in its place: Claude Code itself still has no real-host invocation receipt anywhere, so Truth 2 / REL-02's literal claim ("current real-host native discovery and representative invocation evidence for every claimed harness") is not yet true for the full currently-claimed harness set (Codex, Antigravity, Pi, Hermes, and now Claude per D-18). This is an evidence-gathering gap, not a code defect — closing it requires a real, human-triggered, cost-bearing canary invocation, exactly as 07-08's own execution summary states. Truths 1, 3, 4, 5 and Requirements REL-01, REL-03, REL-04, REL-05, REL-06 are unaffected and remain fully verified.

---

_Verified: 2026-09-22T00:00:00Z_
_Verifier: Claude (gsd-verifier)_
