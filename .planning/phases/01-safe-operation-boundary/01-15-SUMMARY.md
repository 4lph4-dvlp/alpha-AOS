---
phase: 01-safe-operation-boundary
plan: 15
subsystem: cli
tags: [support-bundle, redaction, cli-routes, preview-first, mutation-session]

requires:
  - phase: 01-03
    provides: "Redactor, path aliases and the immutable support-bundle renderer"
  - phase: 01-09
    provides: "MutationSession, journal and the repair seam"
  - phase: 01-14
    provides: "createBootstrapOperationPlan and applyBootstrapOperation"
provides:
  - "planSupportBundleOperation / applySupportBundle: one local artifact under one session"
  - "collectSupportSources: the evidence a bundle may draw on, with snapshots kept opaque"
  - "One CLI output seam for human, JSON and error surfaces"
  - "repair, support-bundle and internal bootstrap install|update routes, preview-first"
affects: [01-16]

actuals:
  tokens: 24000
  tasks: 2
  commits: 1

tech-stack:
  added: []
  patterns:
    - "A surface that redacts says so, so a marker is legible as a withheld value rather than a defect"
    - "Human and JSON output share one context, so a value suppressed in one is suppressed in both"

key-files:
  created: []
  modified:
    - src/core/support-bundle.ts
    - src/cli.ts
    - src/core/doctor.ts
    - test/redaction.test.ts
    - test/preview.test.ts

key-decisions:
  - "collectSupportSources lives in support-bundle.ts rather than a new module, so the plan file list holds"
  - "A snapshot is listed for its metadata and labelled so the existing opaque rule keeps its bytes out"
  - "Doctor states the redaction contract as a finding: a reader who sees a marker needs to know what it means"
  - "The bootstrap CLI route delegates the whole reviewed plan; the CLI itself runs no external child and takes no lock"

patterns-established:
  - "A new mutating route is added to the preview enumeration in the same change that adds it"

requirements-completed: [SAFE-01, SAFE-02, SAFE-03, SAFE-04]

coverage:
  - id: D1
    description: "A support bundle preview creates nothing and offers no destination but the local one"
    requirement: SAFE-04
    verification:
      - kind: integration
        ref: "test/redaction.test.ts#a support bundle preview creates nothing and names no upload destination"
        status: pass
    human_judgment: false
  - id: D2
    description: "An applied bundle is written through the transaction under one session, and journal evidence carries no secret"
    requirement: SAFE-03
    verification:
      - kind: integration
        ref: "test/redaction.test.ts#a support bundle apply writes one local redacted artifact under a journal"
        status: pass
    human_judgment: false
  - id: D3
    description: "Snapshot sources contribute metadata only, never bytes"
    requirement: SAFE-04
    verification:
      - kind: integration
        ref: "test/redaction.test.ts#a support bundle apply writes one local redacted artifact under a journal"
        status: pass
    human_judgment: false
  - id: D4
    description: "Every observable surface redacts, and says so legibly"
    requirement: SAFE-04
    verification:
      - kind: integration
        ref: "test/redaction.test.ts#a removed secret leaves a visible typed placeholder, not a silent hole"
        status: pass
      - kind: integration
        ref: "test/redaction.test.ts#no observable CLI surface leaks a secret sentinel"
        status: pass
      - kind: integration
        ref: "test/redaction.test.ts#a thrown error never carries a secret into its message or stack"
        status: pass
    human_judgment: false
  - id: D5
    description: "The repair diagnosis is readable and mutates nothing"
    requirement: SAFE-03
    verification:
      - kind: integration
        ref: "test/redaction.test.ts#the repair diagnosis is readable and changes nothing"
        status: pass
    human_judgment: false
  - id: D6
    description: "Every new mutating route previews without touching any mutation surface or creating the state root"
    requirement: SAFE-01
    verification:
      - kind: integration
        ref: "test/preview.test.ts#every mutating CLI preview leaves all five mutation surfaces byte-identical"
        status: pass
      - kind: integration
        ref: "test/preview.test.ts#a preview never creates the managed state root or a writer lock"
        status: pass
    human_judgment: false
  - id: D7
    description: "The CLI performs no bootstrap mutation of its own and takes no second lock"
    requirement: SAFE-03
    verification: []
    human_judgment: true
    rationale: "Structurally true and typechecked: the bootstrap route builds a plan and hands it to applyBootstrapOperation, which owns the session. The route runs no child and calls no transaction directly. No test drives a full bootstrap apply through the CLI, because the underlying steps are npm ci, npm run build and npm link against the real checkout."

duration: 70min
completed: 2026-09-04
status: complete
---

# Phase 01 Plan 15: Session-bound support bundle and CLI output closure

**The support bundle is now a reviewed, journaled, session-owned local write, and every byte the CLI emits — human, JSON or error — leaves through one redaction seam that says what it withheld.**

## Performance

- **Duration:** ~70 min
- **Completed:** 2026-09-04
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- **`planSupportBundleOperation` binds the whole artifact.** Every diagnostic source's hash, size and permissions; the local destination; the state, journal, snapshot, temp and package-root roles; and the exact bytes the write would produce, all folded into one digest. It reads only — and there is no upload destination anywhere in the module, which the plan states rather than leaving a reader to infer from the absence of a network call.
- **`applySupportBundle` rechecks before it reads.** Each source proof and the destination proof are re-read immediately before use, the rendered bytes must still hash to what review saw, and the write goes through `applyFileTransaction` under one session — its own when standalone, the caller's when nested.
- **`collectSupportSources` says what a bundle may draw on.** The writer lock, install state, every journal and bootstrap record, the catalog and lock — and snapshot payloads, listed so their metadata is reviewable but labelled `snapshots/...` so the existing opaque rule keeps their bytes out. A snapshot is a verbatim copy of a user's file; only its shape is shareable.
- **One output seam.** `print` serializes JSON through `serializeObservable` and passes human text through `redactString` with the same context, so a value suppressed in one surface is suppressed in the other. The top-level error handler goes through it too. Credential-shaped environment values are registered with the redactor, so an echo becomes a typed placeholder instead of a leak.
- **Redaction is legible.** Doctor now states the contract as a finding: a withheld value appears as `[redacted:<kind>]` and a private root as an alias. Without that, a reader cannot tell a suppressed value from a bug — which is exactly what the Wave 0 corpus asserted and what the last remaining `todo` in the suite was holding open. **The suite now has zero todos.**
- **Three preview-first routes.** `repair` renders `planWriterRepair`'s diagnosis and applies only the one transition the evidence proves; `support-bundle` previews the artifact and writes it only on explicit apply; `bootstrap install|update` builds the reviewed plan and hands it to the core service. The CLI itself runs no external child and takes no lock. All three were added to the preview enumeration in the same change.

## Verification

`node --test dist/test/redaction.test.js` → 14/14, **0 todo**.
`node --test dist/test/preview.test.js dist/test/transaction-crash.test.js` → 16 tests, 15 pass, 1 fail.
Full suite: 174 tests, 171 pass, 1 fail, 2 skipped, 0 todo.

The one failure is `preview.test.ts#install and update wrappers preview without mutating either shell family`. The shell wrappers still run `npm ci`, `npm run build` and `npm link` before printing anything; `scripts/*.{sh,ps1}` are `01-16`'s files, and the core service they must call now exists. It stays red until 01-16 switches them over.

## Deviations from Plan

- **`collectSupportSources` lives in `src/core/support-bundle.ts`.** A separate `support-sources.ts` would have been cleaner to read but is not in this plan's file list, and the function is small.
- **The bootstrap CLI route passes the managed inputs twice.** `createBootstrapOperationPlan` embeds the managed plan and `applyBootstrapOperation` needs the same catalog, lock and inventory to run it. Threading them through the plan object instead would mean serializing a catalog into a digest; passing them alongside is the smaller seam.

## Open Gaps

- **No CLI-level bootstrap apply test.** The route is exercised in preview form only. Applying it runs `npm ci`, `npm run build` and `npm link` against a real checkout, which a unit suite must not do; `test/install.test.ts` covers the same apply path directly against a fixture repository instead.
- **The human formatter is redacted as text, not as structure.** `redactString` applies the exact-secret, structural and URL rules to formatted output, but path aliasing only applies to whole path-shaped values. A path embedded mid-sentence in a human line is left intact, which is the documented behaviour of the aliaser rather than a new gap — the JSON surface, where paths are their own values, aliases correctly.

## Next Phase Readiness

`01-16` is the last plan: write `scripts/build-artifact.mjs` so a real bootstrap plan can verify an artifact instead of blocking on a missing manifest, rewrite the four wrapper scripts to preview through `alpha-aos bootstrap` and apply through it, and add the three-OS CI gate. That is what turns the last failing test green.

---
*Phase: 01-safe-operation-boundary*
*Completed: 2026-09-04*
