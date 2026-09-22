---
phase: 01-safe-operation-boundary
plan: 05
subsystem: infra
tags: [ajv, jsonc-parser, smol-toml, yaml, json-schema, validation, migration]

requires:
  - phase: 01-01
    provides: "Nine-kind by seven-class document matrix that defines what must be rejected"
  - phase: 01-04
    provides: "Human approval of smol-toml@1.8.0 bound to its reviewed integrity"
provides:
  - "One strict pipeline: syntax, exact version route, closed-world schema, domain check"
  - "Deterministic bounded ValidationIssue lists with redacted shape summaries"
  - "Read-only migration plans and an inert extension registry"
affects: [01-06, 01-09, 01-10, 01-13, 01-14]

actuals:
  tokens: 13000
  tasks: 3
  commits: 1

tech-stack:
  added:
    - "ajv@8.20.0"
    - "jsonc-parser@3.3.1"
    - "smol-toml@1.8.0"
  patterns:
    - "Validation judges input; it never coerces, defaults, or strips"
    - "Version routing precedes schema evaluation"
    - "Extensions are split at the subtree alpha-AOS owns, not the document root"

key-files:
  created:
    - src/core/validation.ts
  modified:
    - package.json
    - package-lock.json
    - test/validation.test.ts

key-decisions:
  - "Core schemas live inline in validation.ts; the files under schemas/ still declare additionalProperties: true and are closed by plan 01-10"
  - "A migratable document is never implicitly converted to a current typed value — the caller must run a migration plan"
  - "Ajv is constructed once with coerceTypes, useDefaults and removeAdditional all false"

patterns-established:
  - "Every issue carries code, documentPath, expected and a redacted actualShape — never the raw value"
  - "Issue lists are sorted by path, code, expected and capped at 50 with truncation reported"

requirements-completed: [SAFE-05]

coverage:
  - id: D1
    description: "Malformed, ambiguous, closed-world-violating and unknown-newer documents are rejected before mutation across all nine managed kinds"
    requirement: SAFE-05
    verification:
      - kind: unit
        ref: "test/validation.test.ts#malformed, ambiguous, closed-world and newer-version documents are rejected before mutation"
        status: pass
    human_judgment: false
  - id: D2
    description: "Validation never coerces, defaults or strips the input it is judging"
    requirement: SAFE-05
    verification:
      - kind: unit
        ref: "test/validation.test.ts#validation never coerces, defaults, or strips the input it is judging"
        status: pass
    human_judgment: false
  - id: D3
    description: "Issues are deterministic, sorted and capped, with truncation reported rather than silent"
    requirement: SAFE-05
    verification:
      - kind: unit
        ref: "test/validation.test.ts#validating the same invalid document twice produces identical, bounded issues"
        status: pass
      - kind: unit
        ref: "test/validation.test.ts#a document with many faults is capped rather than allowed to flood output"
        status: pass
    human_judgment: false
  - id: D4
    description: "Only a registered namespace with a passing schema contributes typed data; every other extension is preserved and inert"
    requirement: SAFE-05
    verification:
      - kind: unit
        ref: "test/validation.test.ts#an unknown namespaced extension is preserved and never reaches an operation plan"
        status: pass
      - kind: unit
        ref: "test/validation.test.ts#only a registered namespace with a passing schema contributes typed data"
        status: pass
      - kind: unit
        ref: "test/validation.test.ts#a malformed namespace is rejected rather than treated as an inert extension"
        status: pass
    human_judgment: false
  - id: D5
    description: "Version routing separates current, migratable and unknown-newer, and produces a deterministic non-mutating migration plan"
    requirement: SAFE-05
    verification:
      - kind: unit
        ref: "test/validation.test.ts#version routing distinguishes current, migratable and newer, and plans without mutating"
        status: pass
    human_judgment: false
  - id: D6
    description: "Exact audited dependency versions resolve with the reviewed integrity"
    requirement: SAFE-05
    verification:
      - kind: integration
        ref: "npm ls ajv jsonc-parser smol-toml --depth=0"
        status: pass
    human_judgment: false

duration: 70min
completed: 2026-09-04
status: complete
---

# Phase 01 Plan 05: Strict multi-format validation engine

**One pipeline — strict syntax, exact version route, closed-world schema, domain check — over nine managed document kinds in JSON, YAML and TOML, with bounded deterministic issues and read-only migration plans.**

## Performance

- **Duration:** ~70 min
- **Completed:** 2026-09-04
- **Tasks:** 3
- **Files created:** 1 · **modified:** 3

## Accomplishments

- **Dependencies fixed to the audited versions.** `ajv@8.20.0`, `jsonc-parser@3.3.1` and `smol-toml@1.8.0` installed with `--ignore-scripts` and `--save-exact`. The smol-toml lock entry resolves to `sha512-kCZr2V3ch9i00x8zXRhjUNVcjG9ijES5dDudkXvUVCT5QlJNQWElSJdZqyPemffHoLNUYwOcou0Fy+ojN0uHSQ==`, byte-identical to the hash approved at the 01-04 gate.
- **Syntax ambiguity is rejected before schema evaluation.** `jsonc-parser`'s visitor catches duplicate JSON properties that `JSON.parse` silently collapses to the last value; YAML enforces unique keys, exactly one document, and a 100-expansion alias budget; TOML uses the approved parser, which rejects duplicate and dotted/quoted key collisions.
- **Validation does not repair its input.** Ajv 2020 is constructed once with `strict` and `allErrors` on and `coerceTypes`, `useDefaults`, `removeAdditional` all off. A string `"1"` where an integer version is required is a rejection, not a coercion.
- **Issues are bounded and legible.** Every issue carries a stable `code`, a `documentPath`, an `expected` and a redacted `actualShape` (type, length, key count) — never the raw value, which may be a secret. Lists sort by path → code → expected and cap at 50 with `issuesTruncated` set.
- **Version routing precedes schema.** Current yields a typed value; a supported older version stays read-only and produces a deterministic migration plan with source and target hashes; an unknown newer version refuses with its own code and has no migration path.
- **Extensions are inert unless registered.** An `x-*` namespace is preserved verbatim, excluded from the normalized core, and provably unable to change the operation plan digest. A registered adapter contributes typed data only when the data passes the adapter's own schema. Malformed namespaces (`x-`, `x`, `-x-vendor`, `X-VENDOR`, `x-Vendor`) are rejected as unknown core fields rather than waved through.

## Task Commits

1. **Tasks 1–3** — `749aae4` (feat). The three tasks share `src/core/validation.ts` and its test file; the dependency install is inseparable from the code that imports it, so splitting the commit would have produced non-building intermediates.

## Verification

`npm run check && npm run build && node --test dist/test/validation.test.js` → exit 0 (9 tests, 9 pass).
`npm ls ajv jsonc-parser smol-toml --depth=0` → all three at the exact audited versions.
Pre-existing suites: 38/38. Redaction and path-boundary suites: still exit 0.

## Decisions Made

- **Core schemas are inline rather than read from `schemas/`.** The files under `schemas/` still declare `additionalProperties: true`, which defeats closed-world validation. Closing them is plan 01-10 and those files are outside this plan's `files_modified`, so the engine carries its own closed core schemas for now.
- **The Wave 0 matrix now runs against the engine.** It was written against `loadCatalog`/`readProjectManifest`/`listManagedTransactions` because those were the only surfaces that existed. Routing the legacy loaders through the engine is plan 01-06.

## Issues Encountered

**Extensions were split at the wrong root.** `native-config` nests the alpha-AOS-owned data under an `alphaAos` key, but extension splitting ran at the document root, so `x-editor` inside that subtree was rejected as an unknown core field. Each kind now declares the subtree alpha-AOS actually governs — `null` for documents this tool owns entirely, `alphaAos` for native configuration whose outer document belongs to the harness. This also keeps the rest of a user's native config untouched, which is the D-09 requirement.

## Deviations from Plan

The plan's three tasks were committed as one commit rather than three, for the build-integrity reason given above.

## Next Phase Readiness

Wave 2 is unblocked. `01-06` can route the catalog, lock and project-manifest loaders through `validateManagedDocument`; `01-10` can close the `schemas/` files and wire the operational and native schemas.

---
*Phase: 01-safe-operation-boundary*
*Completed: 2026-09-04*
