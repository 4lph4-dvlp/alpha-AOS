---
name: computer-use
description: Use optional task-bound GUI verification when an application CLI or API cannot satisfy the task. Requires reviewed authority and an exact verified runtime.
---

# Computer use

GSD owns task lifecycle and state. Prefer an application CLI/API. For ordinary
GSD and quick, offer automatic or manual GUI verification. Autopilot may choose
automatic only for approved reversible deterministic checks; record the choice.
Human judgment remains manual. A pack or installed guide grants no desktop access.

Run `alpha-aos computer-use doctor --json` first. Configuration presence is not
native discovery. Use a task-local reviewed Cua Driver 0.37.0 archive, executable,
publisher verification receipt and exact discovered tools/list hash. Never run a
moving installer, arbitrary native tool, shell/eval, full-desktop capture,
clipboard, secret entry, foreground retry or a global daemon.

`computer-use plan --authority <file> --contract <file>` previews the exact
digest-bound authority. `action` and `mcp` additionally require `--apply` and
`--runtime <reviewed-receipt>`. An action reads `--request <JSON-file>` with
`action` and an explicit deterministic `postcondition`. Do not put private text
or secrets in arguments, files, captures or logs. Public-data capture authority
is an explicit human classification of the target; uncertain content must refuse.

The broker checks exact executable/process/window identity, fresh capture,
regions, permitted actions, lifetime/idle/gesture/action/capture/byte bounds and
stop before each effect. Backend delivery alone never proves success. Inspect a
fresh observed state and immutable before/after capture evidence. Never retry an
unknown result. Reconnect requires new authorization; no stale action queue.

Use `computer-use stop --evidence <root> --run <id>` to persistently revoke only
that run, including in-flight work. Report/replay require the retained trusted
`--anchor` and cannot execute native effects. Keep anchors outside the journal;
same-user whole-history replacement is outside a locally writable anchor's proof.

Retain failed/pending evidence for review. Expiry removes only reviewed capture
blobs with durable tombstones; it cannot erase the action journal. Read
`docs/computer-use.md` for setup, privacy, platform refusals and actual live limits.
