# Deferred Items

Out-of-scope discoveries made while executing this phase. Each is recorded rather
than fixed, because it was not caused by the task that found it (the executor
scope boundary). An entry is RESOLVED only when it carries an explicit
`status: resolved`.

- `doctor --discovery --json` renders `sweeps[].entries[].unit` as `[redacted:cycle]`
  status: open
  **Found during:** plan 03-11 Task 3, running the plan's own
  `node dist/src/cli.js doctor --discovery --json` verification.
  **What:** `DiscoverySweepEntry` carries `unit` as a convenience alias for
  `discovery.unit` — the same object reference. The observable-serialization seam
  detects the repeat and emits the second occurrence as the string
  `[redacted:cycle]`. The full evidence unit IS present in the output, under
  `sweeps[].entries[].discovery.unit`, because `discovery` is serialized first;
  only the redundant alias degrades.
  **Why it is not a correctness bug:** every actual evidence unit in the envelope
  carries its `completeness`, its `negative` and that negative's non-empty
  checked-ancestor list — verified over both `doctor --discovery --json` in this
  repository (4 units) and against a materialized fixture (2 units). Nothing is
  missing; a redundant field is unusable.
  **Why it was not fixed here:** the sweep shape and this CLI branch are plan
  03-08's, not this plan's, and no change in plan 03-11 caused or worsened it.
  **Suggested fix:** drop the redundant `unit` alias from the CLI's `--json`
  envelope (or from `DiscoverySweepEntry`), so the JSON surface has exactly one
  place an evidence unit lives.
