---
status: diagnosed
trigger: "Phase 3 native-use verification can run on Codex without requiring a Claude account. Expected CAPA-01 documentation canary to produce native Context7 selection, resolve-library-id before query-docs, and a version-scoped library identifier on Codex. Actual Claude canary exits 1 with Not logged in and zero tool observations; catalog canaries appear Claude-only."
created: 2026-09-13T02:12:31.3979687+09:00
updated: 2026-09-13T02:22:19.4976210+09:00
---

## Current Focus

bug_class: bohrbug
hypothesis: Phase 3's invocation-canary implementation hard-coded a Claude-only architecture from an overly narrow MCP-isolation premise; therefore Codex is omitted at selection, blocked at readiness/isolation, and driven with its free discovery command instead of a model invocation command.
test: execute the pure compiled selection/readiness/launch/prompt-vector functions for CAPA-01 on Codex, compare them with the installed Codex CLI help, and confirm the expectation matcher itself is harness-independent.
expecting: zero Codex selections, a pre-launch readiness or isolation refusal, `debug prompt-input` rather than `exec`, while the installed CLI exposes a real non-interactive isolated invocation surface and the existing matcher accepts the required observation sequence.
next_action: return the confirmed root cause and minimal Codex adapter direction without changing implementation.
reasoning_checkpoint:
  hypothesis: "The Phase 3 canary cannot run CAPA-01 on Codex because the implementation treats the free discovery oracle as the only Codex driver and encodes the earlier Claude-only isolation decision in catalog, readiness, runtime, and launch code."
  confirming_evidence:
    - "Pure compiled selection returns 0 for harness=codex, capability=CAPA-01 because the declaration names only claude."
    - "Pure compiled readiness returns MCP_SERVER_NOT_REGISTERED for context7 on Codex, and launch-spec construction independently returns a canary-observation-front blocked reason."
    - "Pure compiled prompt construction returns `codex debug prompt-input ...` and classifies the leg as free, while local Codex 0.154 documents `codex exec --json` plus `--ignore-user-config`, `--ignore-rules`, and `--ephemeral`."
    - "The existing matcher accepts resolve-library-id followed by query-docs with a version-scoped identifier, so the observation verdict is not the fault."
  falsification_test: "The hypothesis would be false if a Codex-filtered CAPA-01 selection were non-empty and produced an unblocked `codex exec` launch whose MCP calls crossed only the canary observation front. Every observed result is the opposite."
  fix_rationale: "A dedicated Codex invocation definition and proven Codex-specific observation-front isolation address the missing execution path; adding only a catalog target would leave three independent pre-launch/driver failures."
  blind_spots: "No paid Codex model turn was authorized, so the proposed current CLI flag combination still requires an implementation-time isolation/auth experiment before it may be claimed proven. Cross-platform behavior is also untested."
  candidate_causes:
    - "config: all shipped canary declarations, including DOCUMENTATION_VERSION_SCOPED, target only claude."
    - "code: Codex readiness lacks an MCP listing, CANARY_MCP_ISOLATION.codex is null, and invocation prompt/cost reuse ORACLE_DEFINITIONS' discovery-only `debug prompt-input` vector."
    - "environment: Claude is not logged in, exposing the absence of another declared runnable surface; local Codex is installed and logged in."
    - "data: the CAPA-01 ordered tool/identifier-shape expectations are valid and match synthetic qualifying observations."
  and_gate: "no for G-03-1's product defect: Codex native verification is impossible even if Claude is logged in; the Claude authentication failure is the trigger that exposed the missing Codex path, not a co-root-cause."

## Symptoms

expected: CAPA-01 documentation canary runs through the currently available Codex surface, natively selects Context7, invokes resolve-library-id before query-docs, and uses a version-scoped library identifier without requiring a Claude account.
actual: The official Claude canary connected all MCP servers but exited 1 because Claude was not logged in; it produced zero tool observations. The reported available surface is Codex, but catalog canaries appear declared only for Claude.
errors: "Not logged in · Please run /login"; canary exit code 1; zero tool observations.
reproduction: Phase 03 UAT Test 1.
started: Discovered during Phase 03 UAT.

## Eliminated

- hypothesis: The canary catalog schema prevents Codex declarations.
  evidence: `schemas/canary-catalog.schema.json` explicitly permits `codex`; only the shipped YAML declarations omit it.
  timestamp: 2026-09-13T02:22:19.4976210+09:00
- hypothesis: The Claude login error alone is the root cause.
  evidence: Independent pure execution of the Codex selection/readiness/launch seams fails before any Claude state is consulted; logging Claude in would not make a Codex canary exist.
  timestamp: 2026-09-13T02:22:19.4976210+09:00
- hypothesis: The CAPA-01 expectation matcher cannot express the required Codex proof.
  evidence: `matchExpectations` is harness-independent and returns held=true for resolve-library-id then query-docs with identifierShape=version-scoped.
  timestamp: 2026-09-13T02:22:19.4976210+09:00
- hypothesis: `catalog/stack.yaml` policy.canaryHarness is what filters `doctor --canary` to Claude.
  evidence: The CLI passes the explicit optional harness filter to `runCanarySweep`, which selects only from `catalog/canaries.yaml`; `policy.canaryHarness` is used by install/fixture ordering, not this invocation path.
  timestamp: 2026-09-13T02:22:19.4976210+09:00
- hypothesis: A recent regression removed a previously working Codex invocation canary.
  evidence: Git blame shows the Claude-only catalog and Codex isolation null were present in the original Phase 03-05/03-06 feature commits; there is no known-good Codex canary boundary for a meaningful bisect.
  timestamp: 2026-09-13T02:22:19.4976210+09:00

## Evidence

- timestamp: 2026-09-13T02:15:00+09:00
  checked: `.planning/debug/knowledge-base.md`
  found: No knowledge-base file exists.
  implication: There is no prior resolved-session candidate to test first.
- timestamp: 2026-09-13T02:15:00+09:00
  checked: Phase 03 headings and keyword locations
  found: UAT G-03-1 explicitly requires Codex execution, while STATE records the earlier Phase 03 decision that only Claude can host invocation canaries because only Claude was believed to offer both isolated MCP-config and strict-config controls.
  implication: The leading candidate spans policy/config (Claude-only declarations) and code (runner support seams), and must be tested against implementation.
- timestamp: 2026-09-13T02:22:00+09:00
  checked: `catalog/canaries.yaml` and `schemas/canary-catalog.schema.json`
  found: All five shipped canaries declare `harnesses: [claude]`, including `DOCUMENTATION_VERSION_SCOPED`; the schema itself permits `codex`.
  implication: `selectCanaries(..., { harness: "codex" })` necessarily returns no selections. The schema is not the limiting seam; shipped declaration data is.
- timestamp: 2026-09-13T02:22:00+09:00
  checked: `src/adapters/isolation.ts` canary launch construction
  found: Codex is hard-coded as `CANARY_MCP_ISOLATION.codex = null`, producing a blocked reason before launch, even though the ordinary project-only branch already sets isolated `CODEX_HOME`, `HOME`, and `USERPROFILE` roots and passes `--strict-config`.
  implication: Adding Codex to the catalog alone cannot work; `runCanary` will refuse it at the launch-spec isolation gate.
- timestamp: 2026-09-13T02:22:00+09:00
  checked: `src/adapters/capability-oracle.ts` and `src/core/canary.ts` prompt construction
  found: Codex's only measured oracle vector is `codex debug prompt-input`, which costs no model turn. `canaryPromptArgs` reuses that vector for invocation canaries.
  implication: Even if isolation were unblocked, the current Codex vector would only render prompt input/discovery metadata; it would not execute a native model turn or MCP calls.
- timestamp: 2026-09-13T02:22:00+09:00
  checked: `src/core/canary.ts` runtime instruction placement
  found: `CANARY_INSTRUCTION_ROOT.codex` is explicitly null because Codex launches were expected to be blocked.
  implication: CAPA-01 does not require an owned steering instruction, but general Codex canary parity would also need runtime-local Agent Skills placement for routed/steered canaries.
- timestamp: 2026-09-13T02:22:19.4976210+09:00
  checked: Phase 1.25 spectrum-based fault localization applicability
  found: No automated failing test reproduces G-03-1 and no per-test failing/passing coverage spectrum exists; current tests encode the Claude-only behavior as expected.
  implication: SBFL is inapplicable. The deterministic Bohrbug was localized by direct pure-function reproduction and working backwards from the empty/blocked Codex path.
- timestamp: 2026-09-13T02:22:19.4976210+09:00
  checked: installed Codex CLI surface without launching a model turn
  found: `codex-cli 0.154.0` is installed and `codex login status` reports `Logged in using ChatGPT`. `codex exec --help` exposes non-interactive `exec`, `--json`, `--ephemeral`, `--ignore-user-config`, `--ignore-rules`, read-only sandbox, and `-c key=value` overrides. Phase 03 research had already verified `codex exec --json` and `--ignore-user-config` on 0.152.0.
  implication: Codex has a current native invocation surface independent of Claude authentication; the implementation never modeled it as an invocation canary driver or proved an equivalent Codex observation-front isolation composition.
- timestamp: 2026-09-13T02:22:19.4976210+09:00
  checked: pure compiled CAPA-01 Codex selection, prompt-cost, and launch-spec construction
  found: `selectCanaries` returned 0; `canaryPromptArgs` returned `debug prompt-input`; `canaryCosts` returned costsModelTurn=false; `createIsolationLaunchSpec` returned HARNESS isolation blocked despite resolving the Codex executable.
  implication: Adding `codex` to YAML alone would still not run a meaningful invocation and would either block or misclassify its cost.
- timestamp: 2026-09-13T02:22:19.4976210+09:00
  checked: pure compiled Codex readiness for the documentation declaration
  found: Readiness returned `ready=false` with `MCP_SERVER_NOT_REGISTERED/context7` because Codex has no connection listing and the CLI does not supply the runtime's declared servers as readiness evidence.
  implication: Readiness is a third independent pre-launch Codex seam that must be reconciled with runtime-local MCP configuration.
- timestamp: 2026-09-13T02:22:19.4976210+09:00
  checked: pure compiled CAPA-01 matcher with qualifying observations
  found: Ordered Context7 observations (`resolve-library-id`, then `query-docs`) with `identifierShape=version-scoped` produced `held=true`, one distinct server, and a satisfied `query-docs.libraryId` pattern.
  implication: The existing observer/verdict machinery already expresses the UAT truth; the missing work is Codex selection, invocation, readiness, and isolation plumbing.
- timestamp: 2026-09-13T02:22:19.4976210+09:00
  checked: Git history for the limiting seams
  found: `e885519` introduced Claude-only canary declarations and `d71e25d` introduced `CANARY_MCP_ISOLATION.codex = null` plus reuse of `ORACLE_DEFINITIONS` for canary prompts.
  implication: This is an original design gap, not a later regression; git bisect has no working Codex-canary baseline.

## Resolution

root_cause: "Phase 3 implemented invocation canaries as Claude-only despite Phase 3 research already identifying `codex exec --json`. That single-harness assumption is duplicated across declaration selection (`catalog/canaries.yaml`), readiness (`READINESS_DEFINITIONS.codex` has no MCP connection oracle and the CLI supplies no runtime registrations), launch isolation (`CANARY_MCP_ISOLATION.codex = null`), runtime steering (`CANARY_INSTRUCTION_ROOT.codex = null`), and prompt/cost construction (invocation reuses Codex's free `debug prompt-input` discovery oracle and reports costsModelTurn=false). Therefore a Codex CAPA-01 request selects zero legs; if force-declared it still blocks before launch or runs the wrong non-model command. Claude's missing login merely exposed this pre-existing gap."
fix: "Minimal direction: add a separate, costed Codex invocation definition using `codex exec --json --ephemeral` (not `ORACLE_DEFINITIONS`), prove a Codex-specific observation-front isolation composition using the current `--ignore-user-config`/`--ignore-rules` and reviewed `-c` MCP overrides or another measured equivalent while preserving user-managed auth without copying secrets, make readiness reason over that runtime-local configuration, then declare CAPA-01 for Codex. Add a refusal when an explicit harness filter selects zero declarations. Do not change the harness-independent matcher."
verification: "Diagnose-only. Reproduced zero Codex selection, false free-cost classification, discovery-only prompt vector, readiness refusal, and isolation refusal through pure compiled functions; independently confirmed installed/logged-in Codex 0.154 exposes the required non-interactive/current isolation-oriented flags; confirmed the existing CAPA-01 matcher accepts the required ordered/version-scoped observations. No model turn, source edit, or fix verification was performed."
files_changed: []
