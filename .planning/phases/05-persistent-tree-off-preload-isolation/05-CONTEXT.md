# Phase 5: Persistent Tree-Off Preload Isolation - Context

**Gathered:** 2026-09-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver persistent directory opt-out registry and pre-launch preload isolation across supported harnesses (Codex, Antigravity, Pi, and Hermes). After one directory policy decision, users can invoke supported harness CLI commands normally inside that tree without running an `alpha-aos run` wrapper, with global customizations (skills, MCP servers, hooks, memory, workflow guidance) strictly excluded before load while repository-local user-owned resources remain available. Unclassified repositories prompt once on first entry, and unsupported or unprovable isolation surfaces fail closed.

This phase owns OPTO-01 through OPTO-09.

Explicitly NOT in this phase:
- OS-level or container sandboxing (`sealed` mode remains a fail-closed v2 requirement per OPTO-09).
- Active support claims or release gates for Claude Code (Claude Code is compatibility residue per D-17).
- Full managed stack rollback, uninstall, and journal repair flows (Phase 6, LIFE-01…08).
- Cross-platform release packaging and publishing (Phase 7, REL-01…06).
</domain>

<decisions>
## Implementation Decisions

### 1. Policy Registry & Inheritance (OPTO-01)
- **D-01:** Tree policies are persisted solely in the **user global state registry (`~/.alpha-aos/trees.json`)**. To eliminate repository file pollution, git tracking hazards, and accidental commits, alpha-AOS creates and modifies zero repository-local files for tree-off decisions. — **Reversibility:** costly — registry schema and core I/O bindings.
- **D-02:** Directory paths are resolved using **canonical filesystem paths (`canonicalizeWithMissingTail` / realpath)**. Symlinks and junctions are resolved to real target paths. Case normalization follows platform semantics (case-insensitive for Windows and macOS, case-sensitive for Linux). — **Reversibility:** reversible.
- **D-03:** Policy inheritance follows **Nearest Ancestor (Longest Prefix Match)**. The effective policy at `cwd` is inherited from the closest enclosing ancestor directory registered in `trees.json`. Explicit nested registrations (e.g. `managed` inside an `off` parent) cleanly override enclosing policies. — **Reversibility:** reversible.
- **D-04:** Tree policies are managed via dedicated **`alpha-aos tree` CLI subcommands (`set`, `list`, `preview`, `remove`, `inspect`, `classify`)**, providing instant preview of effective inheritance and launch specs before mutation. — **Reversibility:** reversible.

### 2. Ordinary Entrypoint Interception & Preload Isolation (OPTO-02, OPTO-04, OPTO-05, OPTO-08)
- **D-05:** Terminal CLI launches (`codex`, `pi`, `hermes`, `agy`) are intercepted via **Transparent CLI Shims (`~/.alpha-aos/shims`)** placed on PATH. The shim checks `cwd` policy in <1ms; for `off` trees, it injects harness-specific isolation flags and isolated config roots before executing the upstream native binary. For `managed` trees, it transparently delegates to the native binary. — **Reversibility:** costly — binary dispatch and PATH architecture.
- **D-06:** GUI/IDE app surfaces (such as Antigravity IDE/GUI desktop launches) that cannot guarantee pre-launch preload interception are **explicitly reported as `unsupported`** per OPTO-08 and AGENTS.md parity rules. Alpha-AOS never simulates false isolation. CLI surfaces (`agy`) remain supported. — **Reversibility:** reversible.
- **D-07:** Each `off` tree receives a dedicated **isolated configuration root (`~/.alpha-aos/isolated/trees/<tree-id>/`)** containing clean, empty configuration targets (e.g., empty `CODEX_HOME`, `HERMES_HOME`, `PI_CODING_AGENT_DIR`). Existing user login credentials and tokens are reused safely without copying credential bytes or loading ambient global customizations. — **Reversibility:** costly — harness adapter environment and config mappings.
- **D-08:** Preload exclusion enforces **Fail-Closed semantics**. If a harness, version, or platform cannot provably exclude global customizations, the launcher halts immediately (exit code 2) and directs the user to `alpha-aos tree inspect`, preventing silent customization leaks. — **Reversibility:** reversible.

### 3. First-Use Classification Flow (OPTO-03)
- **D-09:** The first-use classification prompt triggers on **any newly encountered Git repository root** that is not yet recorded in the tree registry, ensuring complete explicitness and zero surprise management. — **Reversibility:** reversible.
- **D-10:** First-use interactive prompt provides three explicit options: **`[Managed(적용) / Off(격리) / 나중에 결정(Ask next time)]`**. Choosing `Managed` or `Off` immediately commits the choice to `~/.alpha-aos/trees.json`. 'Ask next time' passes through for the single invocation without persisting. — **Reversibility:** reversible.
- **D-11:** Non-interactive environments (CI pipelines, headless runs, scripts without TTY) fall back to **Fail-Safe `Off` (Isolation)** by default to prevent unwanted tool injection into automated pipelines, overrideable via `ALPHA_AOS_DEFAULT_MODE=managed`. — **Reversibility:** reversible.
- **D-12:** Repositories can be reclassified at any time via **`alpha-aos tree set <path> --mode <managed|off>`** or interactively via **`alpha-aos tree classify`**. — **Reversibility:** reversible.

### 4. Local Resource Passthrough & Environment Boundaries (OPTO-06, OPTO-07, OPTO-08, OPTO-09)
- **D-13:** Project-local resources (`.agents/skills`, `.codex/config.toml`, `.mcp.json`, `AGENTS.md`, local hooks) receive **zero-intervention native passthrough**. Alpha-AOS does not transform, manage, or inject into local resources; the native harness discovers and parses them natively. If no local resources exist, the harness is completely vanilla. — **Reversibility:** reversible.
- **D-14:** Subprocess environments in `off` mode are filtered against a **Reviewed Environment Allowlist**. OS runtime variables (`PATH`, `HOME`, `USERPROFILE`, `TEMP`, `SYSTEMROOT`, `LANG`, `SHELL`) and official AI model provider credentials (`OPENAI_*`, `ANTHROPIC_*`, `GEMINI_*`, `AZURE_OPENAI_*`, `COPILOT_*`) are passed through. Unrelated ambient secrets and alpha-AOS global management variables are scrubbed. — **Reversibility:** costly — process security boundary.
- **D-15:** Detailed surface inspection is provided by **`alpha-aos tree inspect [path]`**, reporting 8 dimensions: effective policy & inheritance ancestry, isolated config roots, excluded global resources, discovered local resources, environment allowlist status (passed vs scrubbed), harness isolation proof status (`ok` vs `unsupported`), and security boundary classification. — **Reversibility:** reversible.
- **D-16:** Boundary notices prominently state that **`off` mode provides Configuration Isolation rather than OS/filesystem sandboxing**. Any request for `sealed` mode fails closed immediately without silent fallback. — **Reversibility:** reversible.

### the agent's Discretion
- Exact JSON Schema for `~/.alpha-aos/trees.json` (Draft 2020-12).
- Internal shim script templates for POSIX (`sh`) and Windows (`cmd`/`ps1`).
- Exact table formatting for `alpha-aos tree inspect`.

### Folded Todos
None.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Product and Phase Contract
- `.planning/PROJECT.md` — Declarative control plane, cross-platform constraints, secrets, and ownership.
- `.planning/REQUIREMENTS.md` — OPTO-01 through OPTO-09 verbatim.
- `.planning/ROADMAP.md` §Phase 5 — Goal, deliverables, and five success criteria.
- `.planning/phases/01-safe-operation-boundary/01-CONTEXT.md` — Shell-free process execution and secret redaction.
- `.planning/phases/04-mandatory-gsd-gates/04-CONTEXT.md` — Active harness scope under D-17 (Codex, Antigravity, Pi, Hermes) and fail-closed gate principles.

### Architecture & Isolation Code
- `src/adapters/isolation.ts` — `createIsolationLaunchSpec`, `CANARY_MCP_ISOLATION`, and harness launch construction.
- `src/adapters/harnesses.ts` — Harness command names, discovery probes, and authority checks.
- `src/core/isolation.ts` — Existing project isolation plan, runtime sync, and marker validation.
- `src/core/paths.ts` — User state root (`userStateRoot()`), package root resolution.
- `src/core/process.ts` — Bounded child process execution (`runProcess`, `commandProbeEnvironment`).
- `src/core/transaction.ts` — Atomic transactions for registry persistence.
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/adapters/isolation.ts` (`createIsolationLaunchSpec`): Existing harness argument vectors and env mappings (`CLAUDE_CONFIG_DIR`, `CODEX_HOME`, `PI_CODING_AGENT_DIR`, `HERMES_HOME`, `--strict-config`, `--no-skills`).
- `src/core/path-boundary.ts` (`canonicalizeWithMissingTail`): Robust cross-platform canonical path resolution supporting symlink and case normalization.
- `src/core/process.ts` (`commandProbeEnvironment`, `runProcess`): Clean environment scrubbing and shell-free subprocess execution.
- `src/core/transaction.ts` (`applyFileTransaction`): Atomic, journaled file writes for `~/.alpha-aos/trees.json`.
- `src/core/validation.ts` (`validateManagedDocument`): Strict JSON Schema validation for the tree registry.

### Established Patterns
- Separate pure planning (`plan*`) from transactional mutation (`apply*`).
- Strict fail-closed error handling when isolation cannot be proven.
- Typed `DoctorFinding` and structured inspection reports.
- Comprehensive unit tests under `test/` using Node built-in test runner.

### Integration Points
- New core module `src/core/tree-policy.ts` (registry reader/writer, inheritance resolver, first-use classification, allowlists).
- New adapter module or extension `src/adapters/shims.ts` (lightweight wrapper generation and dispatch).
- CLI extensions in `src/cli.ts` (`alpha-aos tree set|list|preview|inspect|classify|remove`).
- Tree registry schema `schemas/tree-registry.schema.json`.
</code_context>

<specifics>
## Specific Ideas

- Interactive discussion conducted in Korean on 2026-09-18.
- User clarified that alpha-AOS is a declarative control plane and ordinary harness CLIs are run natively.
- User selected all 4 core discussion areas and locked in 16 explicit architectural decisions.
- Strict honesty chosen for GUI: Antigravity GUI reports `unsupported` rather than claiming false preload isolation.
- First-use classification prompts once on every new Git repository root.
</specifics>

<deferred>
## Deferred Ideas

- None — all decisions stayed strictly within Phase 5 scope.
</deferred>

---

*Phase: 05-persistent-tree-off-preload-isolation*
*Context gathered: 2026-09-18*
