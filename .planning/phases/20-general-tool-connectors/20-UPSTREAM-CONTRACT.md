# Phase 20 CoursePilot materials contract prerequisite

**Decision:** On 2026-10-09 the user selected an upstream CoursePilot public-contract extension while retaining Phase 20 decisions D-01 through D-16. This document defines the acceptance boundary for that prerequisite; it is not a claim that the installed CoursePilot runtime already supports it.

## Repository and ownership

- Implement the CoursePilot source, tests, `skills/coursepilot/SKILL.md`, and `skills/coursepilot/JSON_CONTRACT.md` in the CoursePilot repository resolved from the installed skill at execution time. Do not hardcode a workstation path in alpha-AOS source or plans.
- Keep CoursePilot credentials, VOD, Notion, and other LMS families outside the change. Preserve unrelated dirty files in the CoursePilot working tree.
- Record the CoursePilot source commit, published contract version, skill/contract fingerprints, focused tests, and fixture result before alpha-AOS begins dependent integration. An unmerged or uninstalled worktree is not an available runtime contract.

## Required public behavior

1. Expose an explicit versioned `materials` JSON contract for coarse manifest, attachment inspection, and selected performance. A missing or unknown contract version fails closed. Keep legacy `materials` behavior compatible for existing callers.
2. Coarse manifest remains read-only and bounds course, week, module IDs, titles, and source identities. It must mark attachment completeness `unknown` until the source has been inspected; a planned path or LMS completion is not a saved file.
3. Attachment inspection can open an LMS module and may mark it viewed. Expose it as a separate operation requiring prior approval and an effect receipt. Return a complete attachment set with stable file IDs, names and source fingerprints only when enumeration is supported and complete; otherwise return `unknown` with a reason. Do not invent an empty or complete set from one observed link.
4. Selected performance accepts an exact course/module/file identity and the approved full-manifest digest. Immediately re-observe the source before any download. A missing, changed, new, or ambiguous attachment blocks only the affected selection and returns a reapproval action. Do not fall back to a whole-course/week download.
5. Invoke the existing downloader only for selected files. Return per-file status, current path, size, source identity, and error; a partial exit preserves prior successful file results. A fatal/config/schema error stops further effects and names the failed scope. Repeating a selection with verified source-bound local evidence must not redownload it.
6. The public JSON and CLI must bound item count, string length and output size, treat LMS text as data, and omit credential values. Alpha-AOS must verify actual files independently; CoursePilot status alone cannot satisfy an item.

## Proposed CLI shape for planning

The planner may refine flag names before publishing, but the three operations and selection guarantees are mandatory:

| Operation | Example shape | Effect |
|---|---|---|
| Coarse manifest | `materials --contract-version 1 --manifest --week all --json` | Read-only course-section listing |
| Attachment inspection | `materials --contract-version 1 --inspect --course ID --module-id ID --json` | May mark LMS viewed; requires approval |
| Selected download | `materials --contract-version 1 --perform --course ID --module-id ID --file-id ID --expect-digest SHA256 --json` | One approved file download |

Each JSON result must carry `contract_version`, `operation`, item/source identity, attachment-set completeness, and typed errors. A complete inspected manifest must include the whole observed file set in its digest, so an added sibling prevents stale approval from authorizing a download.

## Offline proof before alpha-AOS integration

- Fixture with two modules in one course/week: a new unapproved module does not prevent selected execution of an unchanged approved module and is never downloaded.
- Fixture with two files in one module: retry the failed file alone without touching a verified sibling; changed filename or added attachment rejects the stale digest before effects.
- Fixture with incomplete/ambiguous attachment enumeration: reports `unknown`, never claims full item satisfaction, and never silently selects one file as the complete set.
- Fixture with partial file failure, fatal result, malformed/unknown version, hostile LMS title, missing local file, and interrupted selected effect. Every success must remain source-bound and re-verifiable.
- No live LMS operation is required for planning. A real account run belongs to an explicitly approved task scope during execution.

## Alpha-AOS dependency gate

Phase 20 connector plans that call CoursePilot depend on the committed and installed public contract above. The executor must verify its exact version, CLI help/JSON canary, and local skill fingerprint. If any proof is missing, stop the CoursePilot branch with a named prerequisite action while independent generic-connector work may continue. Do not mark Phase 20 complete or claim TOOL-02/04 satisfied until the upstream contract and selected-file fixture pass.
