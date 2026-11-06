---
phase: 39-tool-inventory-and-local-release-records
reviewed: 2026-11-06T11:35:00Z
depth: deep
files_reviewed: 16
files_reviewed_list:
  - catalog/tool-handoff-policy.json
  - docs/tool-handoff-evidence.md
  - package.json
  - schemas/tool-release-record.schema.json
  - scripts/audit-tarball.mjs
  - src/cli.ts
  - src/core/tool-bindings.ts
  - src/core/tool-handoff-loader.ts
  - src/core/tool-handoff.ts
  - src/core/tool-inventory.ts
  - src/core/tool-observers.ts
  - src/core/tool-record-store.ts
  - src/core/tool-records.ts
  - src/core/transaction.ts
  - src/core/validation.ts
  - src/format.ts
findings:
  critical: 1
  warning: 0
  info: 0
  total: 1
status: issues_found
---

# Phase 39: Code Review Report

## Narrative Findings (AI reviewer)

### CR-02: Partial file fingerprints promote whole-tool verification (BLOCKER)

**File:** `src/core/tool-inventory.ts:59`, `src/core/tool-inventory.ts:88`

**Issue:** The fix fingerprints only `package.json` for npm packages and `VERSION` for GSD, but then promotes matching historical integrity and invocation evidence into the top-level `integrity=verified` and `integration=verified` states. For example, after a successful Exa invocation, replacing its `cli.js` while retaining the manifest and binding leaves both states verified even though the invoked code has changed. The `fingerprintScope` label does not bind the historical proof to the actual current runtime or cover the remaining installation files. The same problem applies to GSD code changes that leave `VERSION` intact.

**Fix:** Keep aggregate current integrity and integration unverified unless the current fingerprint covers the exact subject and scope of the recorded proof, including the invoked code or a properly linked transformation. Represent manifest/version-only matches as scoped historical evidence. Add regression cases that modify an executable or runtime file without changing the manifest or VERSION.

CR-01 and CR-03 are resolved as described in the accompanying disposition. CR-02's original inability to fingerprint directories and Cua is addressed, but its new partial-file verification promotion remains open.

The reviewed npm policy has no trusted keys by default; synthetic signing keys in tests do not establish real-host registry trust. The full test suite was not run by this reviewer.

_Reviewer: gsd-code-reviewer_
