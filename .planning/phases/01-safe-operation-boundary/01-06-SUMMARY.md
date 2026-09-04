---
phase: 01-safe-operation-boundary
plan: 06
subsystem: infra
tags: [json-schema, closed-world, catalog, lock, project-manifest, migration]

requires:
  - phase: 01-05
    provides: "Strict syntax, version routing, closed-world schema and extension registry"
provides:
  - "Closed contracts in schemas/*.json as the single source of truth"
  - "Strict catalog, lock and project-manifest loaders with typed refusals"
  - "Channel authority that a lock file cannot promote itself into"
affects: [01-10, 01-12, 01-13, 01-14]

actuals:
  tokens: 12000
  tasks: 3
  commits: 1

tech-stack:
  added: []
  patterns:
    - "Schemas are read from disk and passed to the engine, not duplicated in code"
    - "Domain invariants live beside the loader, expressed as ValidationIssue lists"
    - "A refusal raises a typed error carrying the issues and any migration plan"

key-files:
  created: []
  modified:
    - schemas/stack.schema.json
    - schemas/lock.schema.json
    - schemas/project-stack.schema.json
    - src/core/catalog.ts
    - src/core/project.ts
    - src/core/validation.ts
    - test/catalog.test.ts
    - test/project.test.ts

key-decisions:
  - "validateManagedDocument gained an optional schema parameter so schemas/*.json is authoritative rather than duplicated inline"
  - "The requested channel is authority input; a lock declaring a different channel is refused rather than promoted"
  - "An invalid manifest contributes nothing to detection rather than the parts that happened to parse"

patterns-established:
  - "Every alpha-AOS-owned object level is closed; namespaced extensions are split before validation"
  - "schemaVersion is typed as an integer in the schema so the engine's version router owns versioning"

requirements-completed: [SAFE-05]

coverage:
  - id: D1
    description: "Catalog refuses duplicate, multi-document, alias-bomb, unknown-core and unknown-newer input before returning a value"
    requirement: SAFE-05
    verification:
      - kind: unit
        ref: "test/catalog.test.ts#catalog refuses duplicate, multi-document and unknown-core input before returning a value"
        status: pass
      - kind: unit
        ref: "test/catalog.test.ts#catalog domain invariants are checked beyond what the schema can express"
        status: pass
    human_judgment: false
  - id: D2
    description: "An unregistered catalog extension round-trips but cannot change the install plan digest"
    requirement: SAFE-05
    verification:
      - kind: unit
        ref: "test/catalog.test.ts#an unregistered catalog extension round-trips but cannot alter the plan"
        status: pass
    human_judgment: false
  - id: D3
    description: "A candidate lock is never accepted as stable authority, and a non-exact version is not a lock"
    requirement: SAFE-05
    verification:
      - kind: unit
        ref: "test/catalog.test.ts#a lock is never promoted into a channel it does not declare"
        status: pass
      - kind: unit
        ref: "test/catalog.test.ts#a lock with a non-exact version is not a lock"
        status: pass
      - kind: unit
        ref: "test/catalog.test.ts#lock domain invariants reject missing integrity and duplicate packages"
        status: pass
    human_judgment: false
  - id: D4
    description: "A supported older lock is readable but not authoritative"
    requirement: SAFE-05
    verification:
      - kind: unit
        ref: "test/catalog.test.ts#a supported older lock is readable but not authoritative"
        status: pass
    human_judgment: false
  - id: D5
    description: "An invalid or migratable project manifest contributes no detection evidence, and an unregistered extension cannot select capabilities"
    requirement: SAFE-05
    verification:
      - kind: unit
        ref: "test/project.test.ts#an invalid manifest contributes no detection evidence at all"
        status: pass
      - kind: unit
        ref: "test/project.test.ts#a supported older manifest is inspection-only and yields a migration plan"
        status: pass
      - kind: unit
        ref: "test/project.test.ts#an unregistered manifest extension cannot select capabilities or change detection"
        status: pass
    human_judgment: false

duration: 60min
completed: 2026-09-04
status: complete
---

# Phase 01 Plan 06: Strict catalog, lock and project-manifest loaders

**The repository's primary policy documents now travel the strict engine against closed contracts in `schemas/*.json`, with channel authority a caller decides rather than a lock file claims.**

## Performance

- **Duration:** ~60 min
- **Completed:** 2026-09-04
- **Tasks:** 3
- **Files modified:** 8

## Accomplishments

- **`schemas/stack.schema.json`, `lock.schema.json` and `project-stack.schema.json` are closed at every owned level.** `additionalProperties: true` is gone; harness entries, component blocks, policy, channels, locked packages and isolation settings each enumerate their fields. The real catalog and both real locks validate against them unchanged.
- **`loadCatalog`/`loadLock` route through `validateManagedDocument`** and raise a typed `ManagedDocumentError` carrying the issue list and any migration plan. Domain invariants the schema cannot express — a `defaultChannel` absent from `/channels`, a canary harness that is not declared, duplicate owned-skill ids, duplicate locked packages, missing integrity — are checked beside the loader.
- **A lock cannot promote itself.** The requested channel is authority input; a lock whose `channel` differs is refused with `domain.channel-mismatch`. Placing the candidate bytes where the stable lock lives does not make them stable.
- **A version range is not a lock.** The `exactVersion` pattern rejects `^1.12.0` where an exact version is required.
- **`detectProject` consumes only a current, valid manifest.** An invalid one contributes nothing rather than the fields that happened to parse, a migratable one is inspection-only with a migration plan, and `sealed` isolation fails closed because no adapter exists.

## Task Commits

Tasks 1–3 share the engine seam and the schema files; see the wave 2 commit.

## Verification

`node --test dist/test/catalog.test.js` → 9/9. `node --test dist/test/project.test.js` → 8/8. Pre-existing suites unchanged.

## Decisions Made

- **`validateManagedDocument` gained an optional `schema` parameter.** Plan 01-05 baked core schemas inline, which would have forced this plan either to duplicate the whole pipeline inside `catalog.ts` or to leave `schemas/*.json` decorative. Passing the loaded schema keeps one pipeline and makes the repository files authoritative.
- **`schemaVersion` is an integer in the schemas, not `const: 1`.** Pinning it in the schema would have taken versioning away from the engine's router, which is what produces the migratable/unknown-newer distinction.

## Deviations from Plan

**`src/core/validation.ts` was modified although it is not in this plan's `files_modified`.** The change is a single optional parameter plus a compiled-validator cache. The alternative — duplicating syntax parsing, version routing and extension splitting inside `catalog.ts` — would have broken the "one pipeline" property SAFE-05 depends on. The root cause is a decision recorded in plan 01-05's summary (inline core schemas), not a gap in this plan.

## Next Phase Readiness

`01-10` can close the remaining operational and native schemas and wire their consumers; the `schema` parameter is the seam it will use.

---
*Phase: 01-safe-operation-boundary*
*Completed: 2026-09-04*
