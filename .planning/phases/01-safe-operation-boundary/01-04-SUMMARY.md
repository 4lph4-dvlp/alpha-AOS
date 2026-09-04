---
phase: 01-safe-operation-boundary
plan: 04
subsystem: infra
tags: [supply-chain, npm, toml, smol-toml, human-verify]

requires: []
provides:
  - "Explicit human approval record for smol-toml@1.8.0 bound to its exact integrity hash"
affects: [01-05, 01-06, 01-10]

actuals:
  tokens: 1500
  tasks: 1
  commits: 1

tech-stack:
  added: []
  patterns:
    - "A [SUS] package is approved against reviewed evidence, never against name or popularity"

key-files:
  created:
    - .planning/phases/01-safe-operation-boundary/01-04-SUMMARY.md
  modified: []

key-decisions:
  - "smol-toml@1.8.0 approved; approval is bound to sha512-kCZr2V3ch9i00x8zXRhjUNVcjG9ijES5dDudkXvUVCT5QlJNQWElSJdZqyPemffHoLNUYwOcou0Fy+ojN0uHSQ== and must be re-reviewed if that integrity changes"
  - "The [SUS] verdict was `too-new` and only `too-new`; no other supply-chain signal fired"

patterns-established:
  - "Registry metadata is cross-checked against the linked source repository before approval, not taken alone"

requirements-completed: [SAFE-05]

coverage:
  - id: D1
    description: "smol-toml@1.8.0 supply-chain identity reviewed and an explicit verdict recorded before any dependency mutation"
    requirement: SAFE-05
    verification:
      - kind: manual_procedural
        ref: "npm view smol-toml@1.8.0 name version dist.integrity repository.url scripts --json; gh api repos/squirrelchat/smol-toml"
        status: pass
    human_judgment: true
    rationale: "Package legitimacy is a human trust decision; the plan defines it as a blocking gate that no automated step may bypass."

duration: 10min
completed: 2026-09-04
status: complete
---

# Phase 01 Plan 04: smol-toml legitimacy checkpoint

**smol-toml@1.8.0 APPROVED for installation, bound to its exact reviewed integrity hash. No package, lock, or node_modules state was changed by this plan.**

## Verdict

**APPROVED** — user verdict recorded 2026-09-04.

Approval is bound to this exact artifact. If the version or integrity differs at install time, plan 01-05 must stop and this gate must be re-run.

| Field | Reviewed value |
|-------|----------------|
| Name | `smol-toml` |
| Version | `1.8.0` |
| Integrity | `sha512-kCZr2V3ch9i00x8zXRhjUNVcjG9ijES5dDudkXvUVCT5QlJNQWElSJdZqyPemffHoLNUYwOcou0Fy+ojN0uHSQ==` |
| Tarball | `https://registry.npmjs.org/smol-toml/-/smol-toml-1.8.0.tgz` |
| Shasum | `dc5e0936825f1fef37bdf2c569081f709d8a009f` |
| License | BSD-3-Clause (registry and repository agree) |
| Repository | `github:squirrelchat/smol-toml` |

## Evidence Reviewed

**Install scripts:** none. `preinstall`, `install` and `postinstall` are all absent; the only declared scripts are `test` and `update-gha`, which are development-time only. Nothing executes on install.

**Publisher chain:** published by GitHub Actions through npm's trusted-publisher OIDC flow, approved by the maintainer `cyyynthia <cynthia@cynthia.dev>`. The release was not pushed from a personal token.

**Source cross-check:** `gh api repos/squirrelchat/smol-toml` returns owner `squirrelchat`, created 2023-05-03, not archived, license BSD-3-Clause — matching the registry's declared repository and license rather than merely being named plausibly.

**History:** package created 2023-05-07 (~3.3 years); 34,053,544 downloads/week; a steady release cadence through 1.7.0 (2026-06-21), 1.7.1 (2026-07-26), 1.7.2 and 1.8.0 (both 2026-08-11).

## Why It Was Flagged, and What That Was Worth

The Phase 1 legitimacy seam returned `[SUS]` on a single signal: `too-new`. Release 1.8.0 was published 2026-08-11, roughly 3.5 weeks before this review. No other check fired — not ownership, not install scripts, not publisher provenance, not license mismatch, not download profile.

The gate did its job: it forced the reason to be stated rather than letting a name and a download count stand in for review. The reviewed evidence shows an established package with a verifiable publisher chain and no install-time execution, and the verdict reflects that.

## What This Plan Did Not Do

No dependency mutation occurred. `package.json`, `package-lock.json` and `node_modules` are unchanged. Installation happens in plan 01-05, which must verify the integrity above before writing the lock.

## Next Phase Readiness

Plan 01-05 (strict multi-format validation engine) is unblocked and must install `smol-toml@1.8.0` with `--save-exact`, verifying the reviewed integrity.

---
*Phase: 01-safe-operation-boundary*
*Completed: 2026-09-04*
