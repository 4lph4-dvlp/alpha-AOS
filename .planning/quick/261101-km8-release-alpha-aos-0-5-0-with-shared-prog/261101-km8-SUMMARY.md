---
phase: quick-261101-km8
plan: "01"
status: in-progress
description: Release alpha-AOS 0.5.0 and install managed components for all five local agents
---

# Release 0.5.0 delivery record

## Delivered locally

- Package/root lock metadata, dated changelog and bilingual release documentation
  identify 0.5.0. Dependency versions and stable lock pins are unchanged.
- The ordinary local release gate at `137b142c7fc4902311e5e84e2a04c9320b3f651f`
  passed: 155 compiled test files, 1,938 tests, 1,926 passed, 12 skipped,
  zero failures/cancellations. Real upstream ECC, all four computer-use checks,
  package audit and build artifact verification passed. This is historical
  candidate evidence, not acceptance of a subsequent source change.
- Global bootstrap operation
  `2026-11-01T09-40-51-083Z-406d44b0-f280-4e29-8c5e-0156fd9ae26d`
  completed. PATH-resolved alpha-AOS reports 0.5.0. Managed install preview
  reports CURRENT components for Claude Code, Codex, Antigravity, Pi and Hermes.
  Doctor exited 0, with no error/warning findings; writer is free and no repair
  or incomplete transaction is reported.
- Read-only native commands succeeded: Claude Code 2.1.312, Codex 0.165.0,
  Antigravity 1.4.12, Pi 1.4.0 and Hermes 0.22.5. Agent applications were not
  upgraded. Existing sessions require reload/restart for updated capabilities.
- The read-only alpha-aos-control project checkpoint was invoked after setup.
  Project recommendations were not approved or materialized.

## Remote acceptance remains incomplete

`origin/release/0.5.0` received the historical candidate through ordinary hooks.
CI run [41294068087](https://github.com/4lph4-dvlp/alpha-AOS/actions/runs/41294068087)
passed packaging but failed Linux/macOS tests. The panel's credential check
misclassifies POSIX PWD, and several macOS fixtures retain noncanonical /var
paths. Scoped remediation and fresh exact-SHA validation are required before
main/tag publication. The original failed evidence is retained.

No npm registry publication, paid provider canary, original project resume,
model change, dependency promotion, hook bypass or force push was performed.
Unknown model usage and cost are unavailable, not zero.

## Evidence and resume

See `261101-km8-HANDOFF.md` for current handles, authority and ordered resume;
`261101-km8-REGRESSION.md` retains earlier contrary results. Verbose logs and
receipts are external under `.planning/tmp/release050-*`. This quick task must
remain incomplete until remote main/peeled v0.5.0 match an exact-SHA green
three-OS candidate and the final linked global installation is reverified.
