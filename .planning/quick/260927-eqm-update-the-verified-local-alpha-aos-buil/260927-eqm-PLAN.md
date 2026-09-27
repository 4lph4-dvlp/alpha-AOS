---
id: 260927-eqm
type: execute
autonomous: true
---
# Update all installed harnesses on Windows

Baseline: clean main at 64e2ce2, matching origin/main observed through git ls-remote. All five supported harnesses are detected. Source is newer than the existing build artifact. GSD roles execute inline. Planning evidence stays in an external operation folder until bootstrap completes, because bootstrap update requires a clean checkout.

## Task 1 - Prepare and review
- files: generated dist artifact; private operation logs and this plan; no executable source changes.
- action: Rebuild the existing source. Review verified bootstrap update for claude,codex,antigravity,pi,hermes and its managed component steps. Use only the stable lock.
- verify: Build provenance verified; origin/main matches the checkout; no blocked reasons; all five targets selected.
- done: Concrete update plan and logs exist before applying changes.

## Task 2 - Apply and validate
- files: currently observed alpha-AOS-managed configurations, skills, runtimes, transaction journals and snapshots through native services.
- action: Apply bootstrap update, reinstall locked local dependencies, build/link the CLI and reconcile all targets. Evaluate capability plan/status after dependency setup; keep optional project pack activation outside the global update scope.
- verify: Bootstrap evidence records success; status/doctor and native discovery pass or accurately identify limits; final managed install preview is current. Run the full repository suite at the final gate.
- done: All five harnesses consume the current stable alpha-AOS configuration.

## Task 3 - Record
- files: .planning/quick/260927-eqm-update-the-verified-local-alpha-aos-buil/ plan and summary, .planning/STATE.md.
- action: Copy this pre-existing plan into GSD tracking after bootstrap; record actual results and any remaining limits; commit only task records.
- verify: No secrets enter records; source remains unchanged; no remote push.
- done: User receives results and reload guidance.
