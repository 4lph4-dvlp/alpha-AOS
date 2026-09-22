# alpha-AOS 0.1.0 Support Matrix

Canonical evaluation timestamp: `2026-09-18T00:00:00.000Z`  
Evaluation platform: `linux`  
Evidence source: `capabilities/ledger.json`

A cell reaches **PROVEN** only through a matching, inspectable real-host invocation receipt; an unmatched claim is **UNVERIFIED**; a surface offered only for legacy compatibility is **RESIDUE**; and a structurally incompatible surface is **UNSUPPORTED**.

| Harness | Surface | Platform | Status | Evidence / Notes |
| --- | --- | --- | --- | --- |
| claude | GSD Core | all | **UNVERIFIED** | Harness executable not detected |
| claude | Context7 | all | **UNVERIFIED** | Harness executable not detected |
| claude | Unified Memory | all | **UNVERIFIED** | Harness executable not detected |
| claude | Project Packs | all | **UNVERIFIED** | Harness executable not detected |
| codex | GSD Core | all | **UNVERIFIED** | Harness executable not detected |
| codex | Context7 | all | **UNVERIFIED** | Harness executable not detected |
| codex | Unified Memory | all | **UNVERIFIED** | Harness executable not detected |
| codex | Project Packs | all | **UNVERIFIED** | Harness executable not detected |
| antigravity | GSD Core | all | **UNVERIFIED** | Harness executable not detected |
| antigravity | Unified Memory | all | **UNVERIFIED** | Harness executable not detected |
| pi | GSD Core | all | **UNVERIFIED** | Harness executable not detected |
| pi | Context7 | all | **UNVERIFIED** | Harness executable not detected |
| hermes | Worker Authority | all | **UNVERIFIED** | Harness executable not detected |
| hermes | Unified Memory | all | **UNVERIFIED** | Harness executable not detected |
| antigravity | GUI Desktop Preload | all | **UNSUPPORTED** | The desktop GUI has no supported preload interception surface |
| hermes | GSD State Controller | all | **UNSUPPORTED** | Hermes is a worker and must not become the GSD lifecycle/state writer |

## Taxonomy

- **PROVEN** — a matching positive invocation receipt passed, retained observable evidence, and exited successfully.
- **RESIDUE** — compatibility-only behavior outside the active v0.1.0 release bar.
- **UNVERIFIED** — the executable or an inspectable matching invocation receipt is absent.
- **UNSUPPORTED** — the harness, platform, or surface is intentionally incompatible.

Run `alpha-aos doctor --matrix` on a host to evaluate its receipts. Run `alpha-aos doctor --matrix --json` for the structured report.
