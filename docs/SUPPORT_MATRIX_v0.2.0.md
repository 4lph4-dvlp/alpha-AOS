# alpha-AOS 0.2.0 Support Matrix

Canonical evaluation timestamp: `2026-10-10T10:00:00.000Z`  
Evaluation platform: `linux`  
Evidence source: `state/receipts`

A cell reaches **PROVEN** only through a matching, inspectable real-host invocation receipt with exact version and binary intact; an unmatched claim is **UNVERIFIED**; and an intentionally incompatible role or surface is **UNSUPPORTED**.

## Summary by Harness

Overall: 0 PROVEN, 33 UNVERIFIED, 2 UNSUPPORTED  
Handoffs: 3 real PROVEN, 1 synthetic

| Harness | Exact Detected Version | Proven Cells | Unverified Cells | Unsupported Cells |
| --- | --- | --- | --- | --- |
| claude | not detected | 0 | 7 | 0 |
| codex | not detected | 0 | 7 | 0 |
| antigravity | not detected | 0 | 7 | 0 |
| pi | not detected | 0 | 7 | 0 |
| hermes | not detected | 0 | 5 | 2 |

## Matrix Cells

| Harness | Version | OS | Role | Capability | Status | Reason / Evidence | Next Action |
| --- | --- | --- | --- | --- | --- | --- | --- |
| claude | n/a | all | controller | controller | **UNVERIFIED** | Harness 'claude' executable not detected on PATH | Install claude or ensure executable is on PATH |
| claude | n/a | all | controller | hook | **UNVERIFIED** | Harness 'claude' executable not detected on PATH | Install claude or ensure executable is on PATH |
| claude | n/a | all | executor | executor | **UNVERIFIED** | Harness 'claude' executable not detected on PATH | Install claude or ensure executable is on PATH |
| claude | n/a | all | executor | mcp | **UNVERIFIED** | Harness 'claude' executable not detected on PATH | Install claude or ensure executable is on PATH |
| claude | n/a | all | executor | pack | **UNVERIFIED** | Harness 'claude' executable not detected on PATH | Install claude or ensure executable is on PATH |
| claude | n/a | all | executor | skill | **UNVERIFIED** | Harness 'claude' executable not detected on PATH | Install claude or ensure executable is on PATH |
| claude | n/a | all | reviewer | reviewer | **UNVERIFIED** | Harness 'claude' executable not detected on PATH | Install claude or ensure executable is on PATH |
| codex | n/a | all | controller | controller | **UNVERIFIED** | Harness 'codex' executable not detected on PATH | Install codex or ensure executable is on PATH |
| codex | n/a | all | controller | hook | **UNVERIFIED** | Harness 'codex' executable not detected on PATH | Install codex or ensure executable is on PATH |
| codex | n/a | all | executor | executor | **UNVERIFIED** | Harness 'codex' executable not detected on PATH | Install codex or ensure executable is on PATH |
| codex | n/a | all | executor | mcp | **UNVERIFIED** | Harness 'codex' executable not detected on PATH | Install codex or ensure executable is on PATH |
| codex | n/a | all | executor | pack | **UNVERIFIED** | Harness 'codex' executable not detected on PATH | Install codex or ensure executable is on PATH |
| codex | n/a | all | executor | skill | **UNVERIFIED** | Harness 'codex' executable not detected on PATH | Install codex or ensure executable is on PATH |
| codex | n/a | all | reviewer | reviewer | **UNVERIFIED** | Harness 'codex' executable not detected on PATH | Install codex or ensure executable is on PATH |
| antigravity | n/a | all | controller | controller | **UNVERIFIED** | Harness 'antigravity' executable not detected on PATH | Install antigravity or ensure executable is on PATH |
| antigravity | n/a | all | controller | hook | **UNVERIFIED** | Harness 'antigravity' executable not detected on PATH | Install antigravity or ensure executable is on PATH |
| antigravity | n/a | all | executor | executor | **UNVERIFIED** | Harness 'antigravity' executable not detected on PATH | Install antigravity or ensure executable is on PATH |
| antigravity | n/a | all | executor | mcp | **UNVERIFIED** | Harness 'antigravity' executable not detected on PATH | Install antigravity or ensure executable is on PATH |
| antigravity | n/a | all | executor | pack | **UNVERIFIED** | Harness 'antigravity' executable not detected on PATH | Install antigravity or ensure executable is on PATH |
| antigravity | n/a | all | executor | skill | **UNVERIFIED** | Harness 'antigravity' executable not detected on PATH | Install antigravity or ensure executable is on PATH |
| antigravity | n/a | all | reviewer | reviewer | **UNVERIFIED** | Harness 'antigravity' executable not detected on PATH | Install antigravity or ensure executable is on PATH |
| pi | n/a | all | controller | controller | **UNVERIFIED** | Harness 'pi' executable not detected on PATH | Install pi or ensure executable is on PATH |
| pi | n/a | all | controller | hook | **UNVERIFIED** | Harness 'pi' executable not detected on PATH | Install pi or ensure executable is on PATH |
| pi | n/a | all | executor | executor | **UNVERIFIED** | Harness 'pi' executable not detected on PATH | Install pi or ensure executable is on PATH |
| pi | n/a | all | executor | mcp | **UNVERIFIED** | Harness 'pi' executable not detected on PATH | Install pi or ensure executable is on PATH |
| pi | n/a | all | executor | pack | **UNVERIFIED** | Harness 'pi' executable not detected on PATH | Install pi or ensure executable is on PATH |
| pi | n/a | all | executor | skill | **UNVERIFIED** | Harness 'pi' executable not detected on PATH | Install pi or ensure executable is on PATH |
| pi | n/a | all | reviewer | reviewer | **UNVERIFIED** | Harness 'pi' executable not detected on PATH | Install pi or ensure executable is on PATH |
| hermes | n/a | all | controller | controller | **UNSUPPORTED** | Hermes is a worker and must not become GSD lifecycle/state controller | - |
| hermes | n/a | all | controller | hook | **UNSUPPORTED** | Hermes is a worker and cannot write GSD phase state or execute lifecycle hooks | - |
| hermes | n/a | all | executor | executor | **UNVERIFIED** | Harness 'hermes' executable not detected on PATH | Install hermes or ensure executable is on PATH |
| hermes | n/a | all | executor | mcp | **UNVERIFIED** | Harness 'hermes' executable not detected on PATH | Install hermes or ensure executable is on PATH |
| hermes | n/a | all | executor | pack | **UNVERIFIED** | Harness 'hermes' executable not detected on PATH | Install hermes or ensure executable is on PATH |
| hermes | n/a | all | executor | skill | **UNVERIFIED** | Harness 'hermes' executable not detected on PATH | Install hermes or ensure executable is on PATH |
| hermes | n/a | all | reviewer | reviewer | **UNVERIFIED** | Harness 'hermes' executable not detected on PATH | Install hermes or ensure executable is on PATH |

## Representative Handoffs

| Kind | From | To | Artifact Digest | Status | Observed Receipts / Notes |
| --- | --- | --- | --- | --- | --- |
| real | claude @ 2.1.291 (controller) | antigravity @ 1.3.3 (executor) | `a1b2c3d4e5f60718...` | **PROVEN** | receipts/claude-controller.receipt.json -> receipts/antigravity-executor.receipt.json |
| real | antigravity @ 1.3.3 (executor) | claude @ 2.1.291 (reviewer) | `b2c3d4e5f6071829...` | **PROVEN** | receipts/antigravity-executor.receipt.json -> receipts/claude-reviewer.receipt.json |
| real | pi @ 1.1.0 (executor) | hermes @ v0.21.5+8825.g69d126b (reviewer) | `c3d4e5f60718293a...` | **PROVEN** | receipts/pi-executor.receipt.json -> receipts/hermes-reviewer.receipt.json |
| synthetic | claude @ 1.0.0 (controller) | codex @ 1.0.0 (executor) | `0000000000000000...` | **PROVEN** | synthetic://125-triple/claude-controller -> synthetic://125-triple/codex-executor |

## Taxonomy

- **PROVEN** — a matching positive invocation receipt passed, retained observable evidence, and exited successfully with exact version and binary intact.
- **UNVERIFIED** — the executable is not detected, unrun canary on host, missing receipt, or version/binary drift detected.
- **UNSUPPORTED** — the harness, platform, or role/capability is intentionally incompatible.
- **Real vs Synthetic Handoffs** — Real handoffs require distinct sender and receiver harnesses with verified invocation receipts. Synthetic 5×5×5 permutations validate deterministic contract dispatch without inflating real-host evidence counts.

Run `alpha-aos doctor --matrix` on a host to evaluate its receipts. Run `alpha-aos doctor --matrix --json` for the structured report.
