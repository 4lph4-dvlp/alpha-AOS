---
phase: 14-contract-and-vertical-tracer
plan: 02
subsystem: autonomous-work
tags: [task-contract, digest, canonicalization, drift, revision, authority, secret-guard, path-boundary, node-test]

requires:
  - phase: 14-01
    provides: "loadTaskContract, digestableTaskContract, approveTaskContract, assertTaskStartable, readTaskApprovals, taskApproveCommand and the TaskContractError code union"
provides:
  - "Canonical contract digest: NFC text, one path spelling for roots and measurement entries, a resolved project root and key-sorted expected JSON (inputText stays byte-exact)"
  - "changedContractFields, canonicalJsonValue and taskPreviewCommand exports"
  - "contract-drift refusals naming the changed fields, the current digest, the preview and approve commands and `Increase revision to <n>`"
  - "revision-reused refusal: one revision number names one approved content"
  - "Load-time authority bounds: project-relative roots only, entries inside allowed roots, gsd-quick needs local-commit, whole-minute limits, hermes cannot be controller"
  - "secret-in-contract refusal for credential-named environment values, naming the path and variable only"
  - "Approval bound to canonicalizeWithMissingTail of an existing project root; root-changed at start"
  - "previewTaskContract consent and resourceLimit fields"
affects: [14-03, 14-04, 14-05, 14-06]

actuals:
  tokens: 9700
  tasks: 2
  commits: 5
plan_head_before: df48e85f105ae32947ae95cf65f377b25625e2c3

tech-stack:
  added: []
  patterns:
    - "Closed changed-field vocabulary: a new contract field must be added to changedContractFields together with the schema"
    - "Authority checks run in loadTaskContract after schema validation and before digesting, so preview, approve and start all refuse the same contracts"
    - "Refusals name document paths and variable names and never values; an object key that carries a credential is reported at its parent"

key-files:
  created:
    - test/task-contract.test.ts
  modified:
    - src/core/task-contract.ts

key-decisions:
  - "The next revision is max(approved revisions, current revision) + 1 rather than r+1, so the suggested number is never itself already approved"
  - "Allowed roots also refuse dot-only and empty segments (`.`, `./`, `a//b`), and compare .git/.planning/.alpha-aos case-insensitively without Windows trailing dots and spaces"
  - "root-changed also fires when the approved root no longer exists as a directory; the message offers restoring the directory or raising the revision, because the same digest would only report already-approved"
  - "The never-approved drift message keeps the exact approve command so the 14-01 approve-refusal test and CLI guidance are unchanged"

patterns-established:
  - "Drift explanation looks up the supplied digest's approval record and diffs digestable views, so the user sees what changed since the approval"

requirements-completed: [CON-01, CON-03, AUTO-02]

coverage:
  - id: D1
    description: "The digest depends only on contract meaning: key/criterion/root/effect order, path spellings, NFD text and expected-JSON key order do not move it; a one-character goal change or a CRLF input does"
    requirement: CON-03
    verification:
      - kind: unit
        ref: "test/task-contract.test.ts#permuting key, criterion, allowedRoots and allowedEffects order keeps the digest"
        status: pass
      - kind: unit
        ref: "test/task-contract.test.ts#equivalent spellings of an allowed root and a measurement entry keep the digest"
        status: pass
      - kind: unit
        ref: "test/task-contract.test.ts#a goal in NFD form digests like its NFC form and one changed character does not"
        status: pass
      - kind: unit
        ref: "test/task-contract.test.ts#expected JSON is compared by meaning while inputText is compared byte for byte"
        status: pass
    human_judgment: false
  - id: D2
    description: "A post-approval change is refused as contract-drift naming the changed fields, the new digest, preview/approve commands and Increase revision to <n>; an unknown digest is reported as never approved in this state root"
    requirement: CON-03
    verification:
      - kind: integration
        ref: "test/task-contract.test.ts#an edited goal after approval is refused with the changed field, the new digest and the re-approval path"
        status: pass
      - kind: integration
        ref: "test/task-contract.test.ts#each changed authority field is named in the drift refusal"
        status: pass
      - kind: integration
        ref: "test/task-contract.test.ts#a digest that was never approved is reported as unknown to this state root"
        status: pass
    human_judgment: false
  - id: D3
    description: "Changed content cannot reuse an approved revision number; the new revision is approved separately and the old approval does not authorize it"
    requirement: CON-03
    verification:
      - kind: integration
        ref: "test/task-contract.test.ts#changed content cannot reuse an approved revision number"
        status: pass
    human_judgment: false
  - id: D4
    description: "Duration, scope and authority bounds: wall time 1..1440 whole minutes, reserved/escaping roots and out-of-root entries refused by path, relative project root, gsd-quick without local-commit and hermes controller refused; preview binds consent and resourceLimit"
    requirement: AUTO-02
    verification:
      - kind: unit
        ref: "test/task-contract.test.ts#the wall-time limit loads at 1 and 1440 minutes and is refused outside them"
        status: pass
      - kind: unit
        ref: "test/task-contract.test.ts#an absent wall-time limit loads and the preview binds consent and reports no overall limit"
        status: pass
      - kind: unit
        ref: "test/task-contract.test.ts#a fractional wall-time limit is refused rather than rounded"
        status: pass
      - kind: unit
        ref: "test/task-contract.test.ts#an allowed root outside the project or inside reserved state is refused by index"
        status: pass
      - kind: unit
        ref: "test/task-contract.test.ts#a measurement entry outside every allowed root is refused by criterion index"
        status: pass
      - kind: unit
        ref: "test/task-contract.test.ts#a relative project root is refused"
        status: pass
      - kind: unit
        ref: "test/task-contract.test.ts#a gsd-quick contract without the local-commit effect is refused"
        status: pass
      - kind: unit
        ref: "test/task-contract.test.ts#a hermes controller is refused and every other controller loads"
        status: pass
    human_judgment: false
  - id: D5
    description: "A contract carrying a credential-named environment value is refused by JSON path and variable name, never the value"
    requirement: AUTO-02
    verification:
      - kind: unit
        ref: "test/task-contract.test.ts#a contract carrying a credential environment value is refused by path and variable name only"
        status: pass
    human_judgment: false
  - id: D6
    description: "Approval is bound to the canonical project directory; a missing root cannot be approved and a retargeted link is root-changed at start"
    requirement: CON-01
    verification:
      - kind: integration
        ref: "test/task-contract.test.ts#approval records the canonical project root and refuses a project root that does not exist"
        status: pass
      - kind: integration
        ref: "test/task-contract.test.ts#a project root retargeted after approval is refused as root-changed"
        status: pass
    human_judgment: false

duration: 27min
completed: 2026-09-30
status: complete
---

# Phase 14 Plan 02: Contract Authority Boundary Summary

**The approved contract digest now depends only on what the contract means. Any edit after approval is refused with the changed field names, the new digest and the exact re-approval path, and changed content must use a new revision. At load time a contract is refused if it asks for authority this phase cannot bound, carries a live credential value, or (at start) its project root has moved since approval.**

## Performance

- **Duration:** 27 min (about 14 min of that was two full-suite runs)
- **Started:** 2026-09-30T04:04:13Z
- **Completed:** 2026-09-30T04:31:14Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- The digestable view now normalizes:
  - goal, summary and criterion text to NFC
  - `scope.projectRoot` to its resolved form
  - measurement entries like allowed roots (`bin\x`, `./bin/` and `bin/` all become `bin/x` or `bin`)
  - `stdoutJson`/`stderrJson` through `canonicalJsonValue`, which sorts object keys recursively and keeps array order

  `inputText` is left byte-exact.
- `changedContractFields(before, after)` compares two views over a closed vocabulary of 15 leaves plus one `criterion[<id>]` entry per criterion.
- Drift refusals come in two forms:
  - Approved digest: `task <id>: the approved contract (digest <12 hex>) changed: <fields>. Current digest <hex>.`, then the `alpha-aos task preview` command, the approve command, and `Increase revision to <n>` when the revision was not raised.
  - Unknown digest: `was never approved in this state root`, with the current digest and both commands.
- `approveTaskContract` throws `revision-reused` when an approval already exists for the same revision with a different digest. The message names the changed fields and the next free revision.
- `loadTaskContract(path, { source })` refuses the following with `contract-invalid` and a document path:
  - absolute roots, drive roots, UNC roots, `..` segments, dot-only or empty segments, `.git` anywhere, and `.planning` or `.alpha-aos` as the first segment
  - measurement entries outside every allowed root (`binary/x` is not inside `bin`)
  - a relative project root
  - gsd-quick without `local-commit`
  - a non-integer wall time

  It also refuses a hermes controller (`unsupported-controller`, through `assertControllerRole`) and credential-named environment values of 8+ characters in any string or key (`secret-in-contract`).
- Approval records `canonicalizeWithMissingTail(resolve(projectRoot))` and refuses a root that is missing or is not a directory. `assertTaskStartable` recomputes the path and throws `root-changed` if it differs or the root is gone.
- `previewTaskContract` also returns `consent: { mode, grant, scope, revision }` and `resourceLimit`.

## Task Commits

1. **Task 1: Refuse a changed contract with its changed fields, a new digest and a required new revision**
   - `b8a185e` (test, RED: 8/8 failing on assertions; RED_EVIDENCE_OK)
   - `cd42f66` (feat, GREEN: 16/16 with task-run)
2. **Task 2: Bound contract authority, keep it credential-free and bind it to the approved project root**
   - `dd8491e` (test, RED: 9 failing on assertions, 2 already-green guards; RED_EVIDENCE_OK)
   - `f620cee` (feat, GREEN: 36/36 across task-contract, task-run and task-cli)
3. **Refactor:** `57fdadc` removes the RED-phase casts from the suite. Behavior is unchanged.

**Plan metadata:** recorded in the docs commit that adds this SUMMARY.

## Files Created/Modified
- `src/core/task-contract.ts`:
  - hardened digest
  - the `changedContractFields`, `canonicalJsonValue` and `taskPreviewCommand` exports
  - drift and revision explanations
  - the authority, secret and root-binding guards
  - the new preview fields
- `test/task-contract.test.ts` (new): 19 tests, 8 for Task 1 and 11 for Task 2.

## Decisions Made
See `key-decisions` in the frontmatter. No 14-01 export was renamed or removed. `loadTaskContract` gained an optional second parameter, and `TaskContractPreview` gained two fields. `src/cli.ts` and `src/format.ts` compile unchanged because they only read the preview.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Security] Dot-only segments and Windows name aliasing in allowed roots**
- **Found during:** Task 2
- **Issue:** `.` as a root would grant the whole project, including `.git` and `.planning`. On Windows and macOS, `.GIT` or `.planning.` name the same directory as the reserved names.
- **Fix:** Segments that are empty or contain only dots and spaces are refused. Reserved names are compared lowercased, with trailing dots and spaces removed.
- **Files modified:** src/core/task-contract.ts
- **Commit:** f620cee

**2. [Rule 2 - Security] Credential values in object keys**
- **Found during:** Task 2
- **Issue:** Keys inside `stdoutJson`/`stderrJson` are free text. Putting the key in the reported path would echo the credential value.
- **Fix:** Keys are scanned too, and a hit is reported at the parent path with "(an object key)".
- **Files modified:** src/core/task-contract.ts
- **Commit:** f620cee

**3. [Rule 1 - Correctness] Re-approval guidance for a moved root**
- **Found during:** Task 2
- **Issue:** The root is not part of the digest's identity once it is resolved, so the same contract re-approved after a link retarget would only return `already-approved` and could never recover.
- **Fix:** The `root-changed` message offers two paths: restore the approved directory, or raise the revision to the next free number. A missing root also counts as root-changed.
- **Files modified:** src/core/task-contract.ts
- **Commit:** f620cee

**4. [Rule 1 - Correctness] Next revision is the next free number**
- **Found during:** Task 1
- **Issue:** `r+1` can already be approved when older revisions are edited.
- **Fix:** `nextRevision` = max(approved revisions, current) + 1. In the planned scenario this equals `r+1`.
- **Files modified:** src/core/task-contract.ts
- **Commit:** cd42f66

---

**Total deviations:** 4 auto-fixed (2 Rule 2, 2 Rule 1)
**Impact on plan:** All four tighten the authority boundary or keep the refusal actionable. No exported signature changed beyond the planned optional parameter and preview fields.

## TDD Gate Compliance
Both tasks have a `test(14-02)` RED commit before their `feat(14-02)` GREEN commit, and one `refactor(14-02)` commit follows them. `gsd check tdd-red-evidence` returned `RED_EVIDENCE_OK` for both RED runs, with target tests "an edited goal after approval is refused with the changed field, the new digest and the re-approval path" and "a project root retargeted after approval is refused as root-changed". In the Task 2 RED run, two boundary tests ("the wall-time limit loads at 1 and 1440 minutes and is refused outside them" and "a fractional wall-time limit is refused rather than rounded") were already green. The 14-01 schema already enforces `integer 1..1440`. They stay in the suite as regression guards, and the new domain check backs up the schema.

## Issues Encountered
- In the full suite (`node scripts/run-tests.mjs`: 988 tests, 977 pass, 1 fail, 10 skipped), the one failure was `tarball-fixture` "packed release completes the isolated install, reconcile, diagnose, and uninstall lifecycle". It reported drift in the real `~/.alpha-aos/mcp-cache/npm-cache` during its 10-minute run. That cache is written by `src/core/mcp-proxy.ts` for the Firecrawl proxy that live harness sessions on this host run, and this plan does not touch that code path. Re-running `dist/test/tarball-fixture.test.js` alone passed 10/10. This is host drift, not a regression.
- Compatibility: an approval record written by 14-01 whose snapshot had non-canonical expected-JSON key order or NFD text no longer re-digests to its recorded digest. It is refused as tampered, which fails closed. Phase 14 is not released, so there are no such records outside test scratch roots.

## Verification
- `npm run build && node scripts/run-tests.mjs --files dist/test/task-contract.test.js dist/test/task-run.test.js dist/test/task-cli.test.js`: 36 pass, 0 fail, 0 skipped.
- `npm run check`: exit 0, no `error TS`.
- Acceptance greps:
  - the export count is 3
  - `Increase revision to` appears once
  - `"revision-reused"` appears twice
  - `assertControllerRole(` appears once
  - `canonicalizeWithMissingTail(` appears once
  - `"secret-in-contract"` appears twice
  - the secret test asserts `message.includes(value) === false`
- The directory-link test ran on this Windows host with a junction and was not skipped.

## User Setup Required
None.

## Next Phase Readiness
- 14-03 and 14-04 call `assertTaskStartable`/`loadTaskContract` through unchanged signatures. Starting now additionally refuses a moved root, a credential-bearing contract and out-of-bound authority.
- Any future contract field must be added to `changedContractFields` in the same change that adds it to the schema.

## Self-Check: PASSED
