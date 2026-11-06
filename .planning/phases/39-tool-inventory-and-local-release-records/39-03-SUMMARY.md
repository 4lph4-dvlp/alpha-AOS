---
phase: 39-tool-inventory-and-local-release-records
plan: "03"
status: complete
subsystem: tool-inventory
tags: [inventory, read-only, attribution, filesystem]
requires: [39-01, 39-02]
provides: [bounded-managed-tool-observation, harness-target-attribution]
affects: [39-04, 39-05]
tech-stack:
  added: []
  patterns: [bounded-read, evidence-based-attribution, sanitized-path-identifiers]
key-files:
  created: [src/core/tool-observers.ts, src/core/tool-bindings.ts, test/tool-observers.test.ts, test/tool-bindings.test.ts]
  modified: [src/core/tool-inventory.ts, src/format.ts]
key-decisions:
  - "Use stable path digests in inventory output to avoid exposing native configuration paths or command text."
  - "Require an exact manifest bin target to attribute a package to a native connection; wrapper and npx intent remains unresolved."
  - "Recognize managed Codex connections only when the marked block matches an applied journal; other unproven connection ownership remains unknown."
requirements-completed: [LOC-01]
duration: 27 min
completed: 2026-11-06
actuals:
  tokens: 10923
  tasks: 2
  commits: 9
  plan_head_before: 2fbe0bdc9e2ee76c4616f9a50e3337cc292c0800
  plan_head_after: 21f01ee26376fae352f6fa68ef526e842cdeb21d
coverage:
  - deliverable: "Seed and inspect the managed tool universe with bounded filesystem candidates"
    verification:
      - kind: command
        ref: "node scripts/run-tests.mjs --files dist/test/tool-bindings.test.js dist/test/tool-observers.test.js dist/test/tool-inventory-cli.test.js"
        status: pass
    human_judgment: false
  - deliverable: "Attribute exact native targets and preserve uncertainty and separate ownership"
    verification:
      - kind: command
        ref: "node scripts/run-tests.mjs --files dist/test/tool-bindings.test.js dist/test/tool-observers.test.js dist/test/tool-inventory-cli.test.js"
        status: pass
    human_judgment: false
---

# Phase 39 Plan 03: Managed tool observation and harness attribution Summary

Bounded filesystem observers now report seven managed tool identities, observed package and native candidates, and evidence-based harness connections without executing observed commands.

## Accomplishments

- Seeded Cua, GSD, ECC, three MCP servers, and the Pi bridge independently of observed installations; captured candidate scope, selected versions, unknown states, and multiple manual candidates.
- Added JSON/JSONC, TOML, and YAML native configuration attribution for five harnesses. Exact package manifest targets can be associated with a harness, shared targets and version splits remain informational, and unresolvable wrappers remain unverified.
- Kept installation ownership independent of connection ownership and masked paths with stable digests before returning the model. Added human-readable candidate, binding, and diagnostic output.
- Tested isolated native fixtures, malformed manifests, shared and split installations, target conflicts, a managed connection referencing an external package, secret canaries, bounded PATH targets, and a subprocess sentinel.

## Verification

- `npm run build` — passed, including the compiled observer and binding tests.
- `node scripts/run-tests.mjs --files dist/test/tool-bindings.test.js dist/test/tool-observers.test.js dist/test/tool-inventory-cli.test.js` — passed (8 tests).
- RED evidence: both JSON and TAP records accompany this summary. The classifier returned `RED_EVIDENCE_OK` for each target; each target failed on the intended missing inventory/binding assertion before its implementation.

## Discovery Limits

Candidate absence describes only the roots inspected. Unlisted manual installations, npx caches, proxy execution, protocol compatibility, live invocation, and host-specific behavior remain unverified. A filename-only PATH candidate has unknown identity and ownership. Managed connection ownership outside a proven Codex marked block remains unknown. The existing CLI routes the expanded collector through `inventory --tool cua-driver`; command selection and help remain for the adjacent CLI plan.

## Deviations from Plan

**1. [Rule 2 - Critical functionality] Extended the shared formatter and made observer platform injectable.** The formatter needed to present per-harness attribution, and injection keeps macOS fixture reads away from `/Applications`. These are narrow compatibility changes outside the declared file list; the targeted suite passed.

**2. [Rule 2 - Security] Returned stable path digests instead of raw paths.** Configuration-derived paths can contain sensitive values; digests retain relationship equality without exposing command paths.

## Self-Check: PASSED

The created source and test files exist, and the task commits are ancestors of the recorded `plan_head_after`.
