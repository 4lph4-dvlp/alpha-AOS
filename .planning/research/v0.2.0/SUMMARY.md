# Project Research Summary: Universal Autonomous Work

*Generated 2026-09-29. This is v0.2.0 research; the parent directory's legacy files document v0.1.0.*

## Key Findings

The existing Node/TypeScript stack is sufficient. `runProcess`, `openProtocolProcess`, file transactions, writer locks, evidence ledgers and GSD hooks provide reusable primitives. None currently comprise a persistent multi-harness task supervisor. The new feature should compose those primitives and keep GSD Core as the only project lifecycle authority. See [stack](STACK.md) and [architecture](ARCHITECTURE.md).

Ordinary conversational GSD remains the default. Autopilot requires an explicit request or approved in-agent offer for each task. Its capability router must inventory every applicable global/project ECC skill, MCP tool, owned skill, project pack, native tool and hook, then prove required native calls at the matching GSD step. Configured or discovered does not mean invoked. The current `alpha-aos-control` pack checkpoint already requires exact plan-digest approval and a fresh agent session after sync; autopilot must preserve both gates.

All five target harnesses have documented candidates for machine invocation: Codex `exec`, Claude `-p`, Antigravity `-p`, Pi RPC, Hermes one-shot/stream JSON. Exact support still requires installed-version and native-use probes. Existing alpha-AOS invocation evidence does not establish universal role parity. [Codex](https://learn.chatgpt.com/docs/non-interactive-mode), [Claude Code](https://code.claude.com/docs/en/headless), [Antigravity](https://www.antigravity.google/docs/cli/headless/), [Pi](https://pi.dev/docs/latest/rpc), [Hermes](https://hermes-agent.nousresearch.com/docs/reference/cli-commands/).

Hermes controller eligibility conflicts with the existing D-10 code and project decision. To satisfy the user's all-combinations goal, replace harness-name restrictions with verified role capabilities while preserving an exclusive GSD writer. Rollout must fail closed for role/version pairs without a real receipt. The post-action planning-tree witness is insufficient as concurrent write prevention.

Task completion must be criterion-specific. Reviewer prose, process exit 0, a passing skill-only gate, or an old receipt cannot pass a changed artifact. The reviewer should be a fresh session and return an exact-digest report with evidence and abstentions. General external effects require stable operation keys and reconciliation after crashes. See [features](FEATURES.md) and [pitfalls](PITFALLS.md).

## Implications for Requirements

Define requirements for per-task autopilot opt-in, a user-approved goal contract, complete capability inventory and automatic GSD-step invocation, role capability probes, safe execution, GSD bridge, independent review, measurable acceptance, bounded or unbounded resource policies, recovery, connector protocol, CoursePilot exemplar, diagnostics and release proof. Keep role composition testable independently from a claim of live 125-triple validation. Distinguish a user's default review cadence from hard mandatory gates.

## Implications for Roadmap

Start with a default-off, explicitly approved production-quality tracer through contract approval, one executor, one reviewer and a deliberate failure. Then extend durability and GSD bridge, fill the five harness adapters, add a dedicated capability activation/routing phase, the review/repair loop, a general connector and CoursePilot, natural-language/CLI UX, and the three-OS and live-harness release matrix. Ensure every phase has a test that can falsify its most important claim.

## Sources

- Repository: `src/core/process.ts`, `src/core/worker-authority.ts`, `src/core/writer-lock.ts`, `src/core/gate.ts`, `src/core/gate-receipt.ts`, `src/core/capability-ledger.ts`, `src/core/project-pack-sync.ts`, `src/core/ecc-skills.ts`, `src/core/mcp.ts`, `src/adapters/capability-oracle.ts`, `.gsd/capabilities/alpha-aos/capability.json`, `skills/alpha-aos-control/SKILL.md`.
- Local task contract: `C:/Users/alpha/.codex/skills/coursepilot/SKILL.md` and `JSON_CONTRACT.md` (source-specific evidence rules; must be resolved at runtime).
- Official harness and Node references linked above and in [stack](STACK.md).

## Confidence and Gaps

High: repository ownership and process semantics, documented headless entry points. Medium: current installed binary compatibility and usable authentication. Unverified: full controller parity, cross-harness native skill/MCP delivery, real-host cancellation and role combination support; each needs milestone acceptance evidence.
