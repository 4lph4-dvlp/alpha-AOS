---
quick_id: 260930-k4r
status: complete
date: 2026-09-30
---

# Summary

Added README section "4. Running Verification and Promotion Manually" with
Option A (gh CLI: workflow run, run watch --exit-status, commit checks) and
Option B (Actions tab: Run workflow, success signals, artifacts, re-run), the
7-day verified-run and 36-hour cooldown rules, no-op signals, and the local
apply step via the section 1 bootstrap update.

Commands and job/step names were checked against the merged workflows and the
first real dispatch (run 36671406380). STATE.md intentionally not updated
(another session owns v0.2.0 Phase 14).
