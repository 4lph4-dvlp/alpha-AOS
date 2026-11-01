---
phase: 24-autopilot-antigravity-routing-and-snapshot-resilience
plan: 2
status: complete
requirements-completed:
  - AUTO-FIX-02
---

# Summary: 24-02 Harness Role Receipt Re-Probing & CLI `--probe` Integration

## Completed Work

1. **Automated Receipt Re-Probing (`src/adapters/task-receipts.ts`)**:
   - Implemented `reprobeHarnessRoleReceipt(harness, role, receiptsRoot, options)` to resolve the host CLI binary, compute its SHA-256 digest (`computeBinarySha256`), probe its CLI version (`probeLaunchVersion`), and atomically persist the refreshed `HarnessRoleReceipt`.
   - Extended `readHarnessRoleReceipt` with `autoReprobeOnDrift` and `probeMissing` options so drifted receipts are automatically refreshed when the binary is healthy on `PATH` and responds cleanly to `--version`.
2. **Role Capability & Doctor Propagation (`src/adapters/task-agents.ts`, `src/core/task-doctor.ts`, `src/cli.ts`)**:
   - Propagated `reprobeOnDrift` and `probeMissing` through `verifyRoleCapabilities`, `probeTaskAgentPair`, `nativeTaskPorts`, `buildTaskDoctorReport`, and `diagnoseTargetedTask`.
   - Wired `--probe` into `alpha-aos task doctor [--probe]`, `alpha-aos task start <contract.json> [--probe]`, and `alpha-aos task resume <contract.json> [--probe]`, with automatic drift refresh enabled on `task start` and `task resume`.
