---
phase: 11-managed-lifecycle-verification
plan: 05
subsystem: testing
tags: [verification, packed-cli, receipts, drift, refusal, external-packages, compensation, LIFE-04, LIFE-07]

requires:
  - phase: 11-managed-lifecycle-verification
    provides: "plan 11-01 packed-sandbox helper, probe-lib transcript vocabulary, host guard; plan 11-04 uninstall findings and baseline"
provides:
  - "evidence/life04-receipts.txt: receipt and applied-state evidence for uninstall: no-receipt removal, user-modified entries, edit-after-preview, syntactic tamper refusal"
  - "evidence/LIFE-04-findings.md: LIFE-04 clause table, D-13 citation, gap candidates LIFE-04/C1..C5"
  - "evidence/life07-external.txt: external change reporting, induced failure guidance, compensation commands versus stable lock"
  - "evidence/LIFE-07-findings.md: LIFE-07 clause table per component (GSD, ECC, npm-link, Pi bridge), gap candidates LIFE-07/C1..C4"
affects: [11-06, 11-07]

actuals:
  tokens: 135000
  tasks: 2
  commits: 4

tech-stack:
  added: []
  patterns:
    - "Receipt-less state root probe: user-authored MCP configs and skillsDerivation without alpha-AOS journal to test name-collision pruning"
    - "Induced failure staging: filesystem obstruction immediately following external package mutation to inspect recovery receipt emission"
    - "Lock-grounded compensation comparison: dynamic extraction of package names and routes from catalog/stack.lock.json"

key-files:
  created:
    - .planning/phases/11-managed-lifecycle-verification/evidence/probes/life04-receipts.mjs
    - .planning/phases/11-managed-lifecycle-verification/evidence/probes/life07-external.mjs
    - .planning/phases/11-managed-lifecycle-verification/evidence/life04-receipts.txt
    - .planning/phases/11-managed-lifecycle-verification/evidence/life07-external.txt
    - .planning/phases/11-managed-lifecycle-verification/evidence/LIFE-04-findings.md
    - .planning/phases/11-managed-lifecycle-verification/evidence/LIFE-07-findings.md
  modified: []

key-decisions:
  - "Provisional LIFE-04 verdict GAP: uninstall prunes MCP entries and skills by hardcoded names rather than checking receipts/journals, deleting user-authored resources on all five harnesses when no alpha-AOS install exists"
  - "Provisional LIFE-07 verdict GAP: external changes are detected and reported, but failure rollback writes no recovery receipt and uninstall compensation commands cite obsolete packages or wrong paths"
  - "Syntactic tampering refusal holds with zero changed bytes, but content drift between preview and apply does not trigger refusal"
  - "Cross-reference shared defects between LIFE-03 and LIFE-04 (C1 leftovers vs unremovable receipted bytes, C3 project deletion vs non-receipted deletion)"

requirements-completed: [LIFE-09]

coverage:
  - id: D1
    description: "LIFE-04 receipt, applied-state, and refusal evidence through packed CLI"
    requirement: LIFE-09
    verification:
      - kind: other
        ref: "node .planning/phases/11-managed-lifecycle-verification/evidence/probes/life04-receipts.mjs + Task 1 grep gate (15 no-receipt checks, 5 named single checks, host guard unchanged)"
        status: pass
    human_judgment: false
  - id: D2
    description: "LIFE-07 verified external changes and component-specific recovery instructions"
    requirement: LIFE-09
    verification:
      - kind: other
        ref: "node .planning/phases/11-managed-lifecycle-verification/evidence/probes/life07-external.mjs + Task 2 grep gate (11 named checks, host guard unchanged)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Findings files for LIFE-04 and LIFE-07 with D-13 host safety and gap candidates"
    requirement: LIFE-09
    verification:
      - kind: other
        ref: "findings grep gates (verdict headings, host safety citations, check citations >= 8, src untouched)"
        status: pass
    human_judgment: true
    rationale: "Provisional GAP verdicts and candidate classifications require confirmation during Phase 11 reconciliation"

duration: 45min
completed: 2026-09-24
status: complete
---

# Phase 11 Plan 05: LIFE-04 and LIFE-07 Evidence Summary

**The packed CLI was tested against receipt-less state roots, user-modified managed resources, post-preview drift, induced install failures, and full-stack uninstall compensation. Uninstall removes user-authored MCP entries and skills when names collide because it relies on hardcoded name lists rather than receipts. Content drift after preview is ignored during apply, and user-modified managed files are removed without refusal. Install failures report retained external changes but emit no durable recovery receipts, while compensation generators emit obsolete package names and invalid paths. Provisional verdicts: LIFE-04 GAP, LIFE-07 GAP.**

## Performance

- **Tasks:** 2
- **Files created:** 6
- **Probes executed:** `life04-receipts.mjs`, `life07-external.mjs`
- **Host guard status:** `unchanged (17 targets)` on both probes

---

## Accomplishments

### 1. Per-Harness No-Receipt Uninstall Outcome (`evidence/life04-receipts.txt`)

In sandboxes with no alpha-AOS journal and no prior alpha-AOS install, user-authored MCP servers (`context7`, `exa`, `firecrawl`) and skills (`unified-memory`, `documentation-lookup`, `deep-research`) were created:

| Harness | Planned Removals | User MCP Entries Kept? | User Skills Kept? | Result |
|---|---|---|---|---|
| claude | 4 planned | **VIOLATED** (all 3 removed) | **VIOLATED** (all 3 removed) | VIOLATED |
| codex | 4 planned | **VIOLATED** (all 3 removed, config deleted) | **VIOLATED** (all 3 removed) | VIOLATED |
| antigravity | 4 planned | **VIOLATED** (all 3 removed) | **VIOLATED** (all 3 removed) | VIOLATED |
| pi | 4 planned | **VIOLATED** (all 3 removed) | **VIOLATED** (all 3 removed) | VIOLATED |
| hermes | 4 planned | **VIOLATED** (all 3 removed) | **VIOLATED** (all 3 removed) | VIOLATED |

### 2. User Modification, Post-Preview Drift, and Tamper Outcomes

- **User-modified skill (P2):** `life04.modified.skill VIOLATED` — `deep-research/SKILL.md` written and journaled by `ecc-skills sync`, then edited with `p11 user edit`, was deleted by uninstall with exit 0 without refusal.
- **User-modified MCP entry:** `life04.modified.mcp-entry VIOLATED` — managed `exa` entry with argument changed to `p11-user-arg` inside intact markers was removed with exit 0.
- **Edit after preview (P4):** `life04.preview-hash.enforced VIOLATED` — `config.toml` modified after `uninstall --json` preview; apply proceeded without comparing `currentHash`, ignoring the content drift.
- **Syntactic tamper:** `life04.tamper.refuses HOLDS` (exit 2, stderr names drift) and `life04.tamper.zero-bytes-changed HOLDS` (byte fingerprints of home and state identical).
- **Receipted owned skill:** `life04.receipted.owned-skill-removed VIOLATED` — journaled `alpha-aos-control/SKILL.md` matching recorded `afterHash` is never removed.
- **Project non-receipted removal:** `life04.project.non-receipted VIOLATED` — `uninstall --project` deletes unreceipted user files in `.alpha-aos/`.

### 3. External Change Reporting & Induced Failure Outcomes (`evidence/life07-external.txt`)

- **External changes shown & verified:** `life07.external.shown HOLDS` and `life07.external.verified HOLDS` — `ecc-universal@2.2.0` installed into sandbox prefix is correctly reported in human output and JSON `externalChanges`, and verified on disk.
- **Success recovery guidance:** `life07.external.recovery-shown VIOLATED` — success output provides no instructions or receipts for reversing external package changes.
- **Induced failure:** An alpha-AOS-owned file target was blocked before apply; install failed with exit 2.
  - `life07.failure.names-external HOLDS` — stderr reports `External verified changes retained: ecc:runtime`.
  - `life07.failure.component-instructions VIOLATED` — stderr provides no package-specific reversal commands.
  - `life07.failure.receipt-written OBSERVED` — 0 recovery receipts written under `<state>/receipts`.
- **Pi bridge attempt:** `life07.external.pi-bridge-shown NOT-OBSERVED` — sandboxed `pi install` failed with unexpected JSON termination; `life07.pi-bridge.host-untouched HOLDS`.

### 4. Compensation Commands Against Stable Lock

`uninstall --all` was executed and the written recovery receipt was compared against `catalog/stack.lock.json`:

| Component | Receipt Command Generated | Expected Lock Value / Actual Path | Result |
|---|---|---|---|
| ECC runtime | `npm uninstall -g @enterprise-coding-companion/companion` | `ecc-universal` (`components.ecc.package`) | **VIOLATED** |
| Pi bridge | *None* (omitted from receipt) | `pi-mcp-adapter@2.31.0` via `pi install` | **VIOLATED** |
| GSD core | `rm -rf ~/.claude/get-shit-done ~/.codex/get-shit-done` | `<config root>/gsd-core` (`~/.codex/gsd-core`, etc.) | **VIOLATED** |
| npm-link | `npm unlink -g alpha-aos` | `alpha-aos` (`package.json name`) | **HOLDS** |

`life07.receipt.written HOLDS`: 1 recovery receipt written under `<state>/receipts`.

---

## Provisional Verdicts

- **LIFE-04: GAP (D-02)** — Uninstall does not verify receipts or applied hashes, pruning by fixed name lists. Drifted content and user modifications are not refused, while syntactic tampering correctly refuses with zero bytes changed.
- **LIFE-07: GAP (D-02)** — Retained external packages are reported, but no recovery receipts are written during install failure, and uninstall compensation commands reference incorrect package names and legacy directory paths.

---

## Gap Candidates Summary

- **LIFE-04/C1**: Uninstall removes MCP entries and skills by name with no receipt check on all five harnesses.
- **LIFE-04/C2**: User-modified skills and MCP entries are removed without refusal.
- **LIFE-04/C3**: Post-preview content drift does not trigger refusal during apply.
- **LIFE-04/C4**: Project uninstall deletes non-receipted user files in `.alpha-aos/` (cross-ref LIFE-03/C3).
- **LIFE-04/C5**: Receipted owned skills matching journaled state are never removed (cross-ref LIFE-03/C1).
- **LIFE-07/C1**: Install failure rollback writes no recovery receipt and provides no component recovery instructions.
- **LIFE-07/C2**: ECC compensation command names obsolete `@enterprise-coding-companion/companion` instead of `ecc-universal`.
- **LIFE-07/C3**: GSD compensation command targets legacy `get-shit-done` path rather than `<config root>/gsd-core`.
- **LIFE-07/C4**: Pi bridge compensation is omitted from uninstall receipt and specifies invalid `npm unlink`.

---

## Verification (plan level)

- Task 1 checks gate: pass (15 no-receipt checks, 5 single checks, host guard unchanged).
- Task 1 findings gate: pass (D-13 citation, 28 check citations, src untouched).
- Task 2 checks gate: pass (11 named checks, host guard unchanged).
- Task 2 findings gate: pass (4 components named, enterprise-coding-companion cited, 23 check citations, src untouched).
- `git status --porcelain -- src`: empty.

## Self-Check: PASSED

All 6 evidence artifacts and findings files exist. Host guard verified unchanged across all runs.
