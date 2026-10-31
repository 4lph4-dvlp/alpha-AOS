# Phase 26: Session-store recovery decision

Date: 2026-10-31. Scope: unreleased progress projection only.

## Evidence and problem

The first prototype's event append scanned and rewrote its complete history.
The 251-event fixture took 26.7 seconds. A bounded tail plus immutable records
removed growing history scans but added three guarded atomic publications per
event; the same fixture took 220.4 seconds. The publication lock also survives a
writer crash. PID absence cannot authorize deleting it. These are measured
prototype limitations, not production acceptance results. Preserve the checkpoint
and the TDD-history deviation in 26-01-HANDOFF.md; do not fabricate RED evidence.

## Decision for narrow independent review

Use Node's built-in `node:sqlite` for the **new session projection store only**,
with prepared statements, an atomic transaction and indexed source identity.
Do not replace telemetry, command jobs, controller leases, runtime dispatch
observations, GSD artifacts, checkpoints or execution fences. No dependency or
global setup is needed. The existing exported session/event APIs stay stable.

The installed Node v24.13.1 successfully created an in-memory DatabaseSync,
inserted a bound row and read it back. The installed @types/node is 24.7.2.
This proves local API availability, not crash recovery, performance or security.
The v24 API is Stability 1.1/active development and emits an ExperimentalWarning.
Load it lazily only for this opted-in feature; detached execution/help must remain
usable without it. An unavailable/disabled module must yield an honest observer
capability error, not substitute a model or break the original task.

## Required implementation boundaries

- One guarded private database per digest/run. Store and compare the entire
  contract ID/digest/revision/run/host/logical-origin binding transactionally.
  A different origin/revision must map to the same run identity and be rejected,
  rather than create a second independently accepted binding.
- Allocate monotone sequence and unique source identity in one transaction.
  Duplicate identical input returns the existing record; conflicting input is
  refused. Immutable event evidence remains retained. Replay queries use indexes,
  bounded rows/bytes and an explicit gap, without scanning full history per event.
- Use the minimal v24 API, bound parameters only, extensions disabled, short
  finite busy timeout and explicit close. Preserve existing field validation,
  redaction, event-byte limits and no arbitrary file/SQL/browser-write surface.
- Retain private-file creation and path/identity guards. Validate fixed database
  and native journal/sidecar paths against symlink/junction substitutions. Do not
  weaken shared command-job helpers to improve projection performance.
  As calibrated in the scoped review, this means static unsafe-path refusal and
  supported observed pre/post identity checks with deterministic persistent-race
  detection, consistent with existing command-job helpers. It is not an OS
  sandbox against arbitrary same-user swap-back, whole-namespace replacement or
  races entirely inside SQLite's native open/recovery. A postcheck detects a
  change; it cannot prove that no earlier native I/O occurred. Do not require a
  no-follow/file-descriptor DatabaseSync constructor that Node does not expose,
  and do not advertise that stronger guarantee.
- Native transactional recovery may restore its own journal after a confirmed
  fixture process crash; no PID-only deletion or takeover of alpha-AOS fences is
  permitted. Live writers remain protected by native transactions. Failure to
  prove safe filesystem identity/refused access stays an explicit observer error.
- This store is a rebuildable observation projection, not a lifecycle authority.
  Recovering it never starts/resumes a model, changes a contract, clears execution
  locks or promotes a task to accepted. Read-only HTTP semantics remain unchanged.
- The prototype was never installed or run on the original project. Its synthetic
  format is not a released migration contract. Retain old prototype evidence;
  refuse an unknown legacy store rather than silently discard user data.

## Required focused verification

Preserve earlier binding/HTTP regressions. Add real credential-free child-process
transaction interruption and confirmed closure, then reopen/replay/append with
no false event or duplicate. Exercise concurrent publication, duplicate/conflict,
foreign binding, busy timeout, bounded replay/gap, private paths and file/journal
replacement. Run the 251-event comparison once after the correction settles;
do not repeat the long benchmark after every small patch. Browser and all
remaining plan 01 gates still apply. No acceptance or performance pass is claimed.

## Primary documentation checked

- [Node v24.13.1 SQLite API](https://nodejs.org/download/release/v24.13.1/docs/api/sqlite.html): DatabaseSync, prepared parameters, timeout (v24.0+), readOnly, allowExtension and close. Context7 lookup was cross-checked against this exact version rather than current main API examples.
- [SQLite atomic commit and hot rollback journals](https://sqlite.org/atomiccommit.html): native recovery validates journal/lock state and rolls back incomplete transactions. This is distinct from a controller deleting a file because a PID disappeared.

The parent performed Exa discovery, Firecrawl extraction, Context7 lookup and the
local in-memory API probe. Implementation and its filesystem proof remain pending.
