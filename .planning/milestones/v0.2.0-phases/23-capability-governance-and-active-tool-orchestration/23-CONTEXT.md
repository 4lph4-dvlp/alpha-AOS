# Phase 23: Capability Governance and Active Tool Orchestration — Context

**Phase goal:** Establish top-priority task intake governance across all five harnesses without deleting native shortcuts, and enforce active invocation of Exa, Firecrawl, Context7, and ECC Unified Memory across the GSD lifecycle.

---

## 1. Background & Problem Statement

In milestone v0.2.0, alpha-AOS introduced `alpha-aos-task` to govern task intake, presenting users with an explicit choice between **Ordinary Conversational GSD** and **Autonomous Autopilot** (task contract with exact-digest approval). Additionally, Phase 18 established capability inventory and automatic tool selection mechanisms.

However, real-world execution revealed critical governance gaps:
1. **Shortcut Bypass**: When presented with natural task requests, agents (such as Codex) defaulted to bare `$gsd-quick` based on legacy instructions in `AGENTS.md` (`"Use these entry points: $gsd-quick for small fixes..."`), completely bypassing the `alpha-aos-task` intake interview and user choice.
2. **Passive Tool Neglect**: Although alpha-AOS manages Exa, Firecrawl, Context7, and ECC Universal, agents executed tasks with primitive terminal commands without actively invoking these specialized tools. For example, when asked to integrate an external repository, agents failed to use Firecrawl/Exa for deep repository crawling and analysis.
3. **Control Plane Meaning**: If the agent bypasses the intake interview and ignores the managed capability suite, the purpose of alpha-AOS as an intentional, high-capability AI working environment is undermined.

---

## 2. User Decisions & Design Principles (Discussion Results)

Based on direct interactive interview with the user on 2026-10-11:

### D-01: Hierarchy & Precedence over Removal
- **Decision:** Do NOT delete native shortcuts from `AGENTS.md` or harness-specific instruction files, as these shortcuts are required for native harness functionality and tool interoperability.
- **Principle:** Instead of removal, establish an explicit **precedence hierarchy**:
  - `alpha-aos-task` is the **highest-priority task intake authority**.
  - Any task request must first route through `alpha-aos-task` to determine scope and present the user with path selection (Conversational GSD vs Autopilot).
  - Native shortcuts (`$gsd-quick`, `$gsd-debug`, etc.) operate **under** the authority and boundaries established by `alpha-aos-task`, never as an ambient escape hatch.

### D-02: Mandatory Active Tool Invocation Rules
- **Decision:** Enforce active, verifiable invocation of specialized capabilities within GSD phases:
  1. **External URLs & Repositories**: Whenever a task references an external repository, documentation URL, or external tool, the research/planning phase **must** actively invoke **Firecrawl** (for page/doc extraction) and/or **Exa** (for web exploration).
  2. **Dependencies, Libraries & APIs**: Whenever a task modifies dependencies, imports new libraries, or changes framework APIs, the agent **must** produce verifiable **Context7** documentation lookup evidence.
  3. **Cross-Session & Cross-Agent Handoff**: Whenever a task completes, pauses, or hands off between harnesses (e.g. Codex ↔ Antigravity ↔ Claude), the agent **must** record a durable handoff entry in the **ECC Unified Memory Vault** (`unified-memory`).

### D-03: Bounded `quick` Downgrade Protection
- **Decision:** Prevent silent downgrades to bare `$gsd-quick` for non-trivial tasks.
- **Rule:** If a task touches architecture, external repositories, or package dependencies, the workflow must enforce research (`--research` or full phase) and cannot silently skip discussion and tool investigation.

---

## 3. Scope & Requirements

| Requirement ID | Summary |
|---|---|
| **GOV-01** | `AGENTS.md` and harness adapters declare `alpha-aos-task` as top-priority intake authority while preserving native shortcuts. |
| **GOV-02** | Natural language task requests in all five harnesses reliably trigger `alpha-aos-task` path selection before execution. |
| **GOV-03** | Non-trivial tasks are barred from bare `$gsd-quick` and require explicit research and evidence gates. |
| **ORCH-01** | GSD planning templates and planners enforce Firecrawl / Exa research on external URLs/repos. |
| **ORCH-02** | GSD execution and verification enforce Context7 documentation evidence on dependency/API work. |
| **ORCH-03** | Handoffs and task completions persist structured context into ECC Unified Memory vault. |

---

## 4. Work Breakdown & Waves

1. **Wave 1: Governance Precedence Hierarchy (GOV-01..03)**
   - Update `AGENTS.md` with explicit priority rules: `alpha-aos-task` precedence over native shortcuts.
   - Update harness-specific skill definitions (`skills/alpha-aos-task/SKILL.md`, `skills/alpha-aos-control/SKILL.md`).
   - Add invariant tests verifying that harness intake instructions enforce path selection and reject ambient bypass.

2. **Wave 2: Active Capability Orchestration in GSD Lifecycle (ORCH-01..03)**
   - Update GSD workflow templates and planning guidelines to mandate Firecrawl/Exa for external references and Context7 for APIs.
   - Integrate Unified Memory vault handoff as a required session boundary action.
   - Add capability ledger verification ensuring positive tool receipts are recorded rather than left `unverified`.

3. **Wave 3: End-to-End Tracer & Cross-Harness Verification**
   - Execute an end-to-end tracer demonstrating: natural request → `alpha-aos-task` intake → active Exa/Firecrawl research → Context7 lookup → Unified Memory handoff.
   - Full 3-OS suite check and verification documentation.
