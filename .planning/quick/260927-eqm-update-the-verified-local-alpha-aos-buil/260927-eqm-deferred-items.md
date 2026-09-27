# Reproduced verification limits

The workstation update itself passed status, doctor, build provenance, and all-five-target reconciliation. The unchanged source has two failing installation fixture tests on this host, reproduced in sequential focused execution:

- test/lifecycle.test.ts: MCP plan proofs are re-established after an external installer rewrites the config target (fresh-install regression).
- test/owned-skills.test.ts: applyManagedInstall succeeds on combined codex and pi install without plan-drift on shared destination (G-11-1).

Both report the assertion from test/helpers/install-registry.ts that every fixture package must come from the loopback registry. Observed fetched packages are an empty set, with four packages expected for lifecycle and ECC expected for shared skills. The after-hook may obscure the original operation error; do not infer a timeout, concurrency issue, or source defect from this assertion alone. Next investigation should preserve the primary error separately from cleanup assertions and inspect the fixture subprocess's declared registry environment.

The full run passed 940 of 952 tests, failed two, and skipped ten. One focused sequential recheck failed both again; no blind retry or code repair was attempted in the machine-update task.
