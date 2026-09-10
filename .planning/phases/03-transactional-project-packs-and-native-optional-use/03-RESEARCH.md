# Phase 3: Transactional Project Packs and Native Optional Use - Research

**Researched:** 2026-09-10
**Domain:** Harness-native skill discovery/invocation evidence, transactional project-scope materialization, MCP observation
**Confidence:** HIGH for everything probed live on this host (claude / codex / pi / hermes / ecc-universal / Context7 / Exa / Firecrawl); MEDIUM–LOW for Antigravity and for cross-OS generalization

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Invocation Evidence**

- **D-01:** The primary source of proof that a harness natively selected a capability and
  actually invoked it is a **non-interactive harness run plus MCP-side observation**.
  alpha-AOS drives the harness with a scripted intent prompt that never names the skill or
  the tool, and the "a real call happened" half is recorded by an alpha-AOS-fronted MCP
  process. Model output text is never evidence — a transcript saying "I used Context7" does
  not satisfy CAPA-01. This is what keeps the proof off LLM judgment, per PROJECT.md's
  determinism constraint.
- **D-02:** The observation proxy is in the path **only during canary runs**. Everyday user
  configuration keeps talking to upstream MCP servers directly. Canaries run against an
  isolated configuration root/runtime that renders the same servers through the proxy.
  — **Reversibility:** reversible — the canary runtime is additive; the alternative
  (always-proxied) is what would be hard to withdraw once every harness config points at it.
  Rationale: PROJECT.md Key Decision "Keep alpha-AOS as a control plane, not an invocation
  proxy for every tool call".
- **D-03:** All discovery and invocation evidence lives in **one ledger under the user state
  root** (`userStateRoot()`, normally `~/.alpha-aos/`). Project pack evidence is keyed by
  project id and stored there too — not in the project. Rationale: "this harness on this
  machine discovered this skill" is a host fact. Committed into a repository it becomes false
  on a colleague's machine.
- **D-04:** A proof binds **exactly** to the skill source hash, the MCP server version, and
  the pack evidence hash — any of those moving demotes it immediately. The **harness version
  demotes only at a minor boundary**, because harnesses auto-update (Claude Code is at
  `2.1.252` today) and patch-level rebinding would leave the ledger permanently red. The
  ledger always records the exact version that was proven, so an audit can still see it.

**Materialization Reach**

- **D-05:** This phase's `sync --apply` writes **skill files only** — `SKILL.md` under the
  project skill roots, which alpha-AOS owns whole. Plan and receipt targets gain a `kind`
  discriminator, but only `skill` is implemented and verified now. Project-scope MCP and
  policy are reported **unsupported**, not silently absent. Grounding fact established during
  this discussion: **zero of the 15 declared packs request an MCP server or a policy** —
  every entry in `catalog/packs/*.yaml` declares only `skills: [...]`. The MCP servers packs
  rely on (Context7, Exa, Firecrawl) are already global.
  — **Reversibility:** reversible — the `kind` seam makes a later MCP target additive rather
  than a breaking change to `schemas/receipt.schema.json`.
- **D-06:** The **whole approved plan is one transaction**. Skill files and receipts are
  written inside it; any failure rolls everything back and leaves zero receipts. Partial
  application would produce a state that no approved plan describes, which contradicts
  Phase 2 D-12, and receipts written after the files would leave untracked bytes on a crash.
- **D-07:** `.alpha-aos/receipts/` is the authoritative provenance record. A **sidecar file
  beside the skill directory** is added on top of it, but **only on surfaces where research
  proves the harness ignores an unexpected file harmlessly**; before that proof, receipts
  alone. `SKILL.md` bytes are never modified — the design doc §5.3 forbids it and Phase 2
  already locked `PLAN_RENDERER_ID = "ecc-skill/identity"` (target hash equals source hash),
  so injecting a provenance header is not available.
- **D-08:** `project sync --apply` reads `.alpha-aos/plan.json` and materializes **only that
  artifact**. With no artifact it refuses and prints a runnable `approve` command; with a
  moved bound input it refuses through the Phase 2 D-13 drift path. `plan` / `approve` /
  `sync` stay preview / approve / materialize.
  — **Reversibility:** costly — the CLI verb split is what Phase 6's lifecycle contract and
  Phase 7's brownfield cycle both bind to; collapsing it later would rewrite both.

**Surface Coverage and Capability State**

- **D-09:** The phase pass bar is **claude must actually pass** CAPA-01, CAPA-02, CAPA-04,
  CAPA-05, and CAPA-06. `catalog/stack.yaml` already names claude as `policy.canaryHarness`.
  codex and pi are driven through the same runner and **auto-promote on success**, but a
  failure is recorded with its reason and does not block the phase. antigravity and hermes
  stay `unsupported`.
- **D-10:** Promotion from `unverified` to `supported` is decided by **two separate axes that
  are never merged**. Code and catalog own the **ceiling** — the product claim that a surface
  can structurally receive packs at all (antigravity has no project skill root; hermes is
  `gsdStrategy: worker-only`; both are pinned `unsupported`). The ledger owns whether it was
  **proven on this host**, and may only raise a surface within its ceiling.
  — **Reversibility:** costly — once support is resolved from two axes, every status
  renderer, JSON consumer, and Phase 4 gate reads through that resolution.
- **D-11:** CAPA-07's eight states are modelled as **orthogonal axes**, not one enum. Phase 2's
  existing `PackState` (`CURRENT | STALE | DRIFTED | CHANGED | CONFLICT | UNDECIDABLE`) stays
  as the deployment axis untouched; a native-use axis (`discovered` / `invoked` / `unverified`)
  and the support axis from D-10 are separate. JSON exposes the axes; human output summarises
  to one line. A single eight-value enum cannot say "deployed and discovered but not yet
  invoked", which is precisely the misleading single `installed` state CAPA-07 forbids.
  — **Reversibility:** costly — `reconcileProjectState` and every status consumer read it.
- **D-12:** `blocked` and `unverified` have distinct, load-bearing meanings. **`blocked`** =
  the reason is known and actionable; the report names the credential *variable* and the next
  action (never the value — PROJECT.md's secrets constraint). **`unverified`** = not attempted,
  or no evidence. A canary that cannot finish because `EXA_API_KEY` is unset reports `blocked`.
  The phase pass bar is satisfied by one pass in a credentialed environment.

**Pack Lifecycle and Absence Proof**

- **D-13:** `lifecycle: one-shot-remove-after-output` (declared in
  `catalog/packs/brownfield.yaml`, present in no schema or code — Phase 2 explicitly deferred
  it here) is implemented as: when the ledger records `invoked` for a one-shot pack, `status`
  reports it as one-shot, already invoked, removal plan ready. **The removal itself still
  travels the approved `removalDigest` path.** No automatic deletion — Phase 2 D-14 and
  PROJECT.md's safety constraint both hold. The invocation ledger from D-01 is what makes
  "after output" observable at all.
- **D-14:** CAPA-06's absence is proven by running **the same canary outside the project** —
  in a temporary directory that is not a repository — and recording the negative result:
  the skill was not selected and the MCP proxy saw no corresponding call. **A positive and its
  negative are one evidence unit**; an unpaired positive does not satisfy CAPA-06. A static
  check that the file is absent is rejected as the mirror image of the "configuration-file
  presence is success" error PROJECT.md forbids.
- **D-15:** The six CAPA-08 domains (web, API/data, infrastructure, agent/AI, security,
  scientific) are exercised through **synthetic fixture repositories** built by the tests —
  minimal evidence sufficient to select each pack, plus near-miss negatives from the same
  scaffold. Deterministic, offline, and portable to the three-OS CI. Invocation proof is not
  run for all six; one representative pack is proven through the claude canary per D-09.
- **D-16:** CAPA-03's boundary is proven by a **handoff canary plus an immutability check**:
  harness A writes to Unified Memory, harness B reads it and works from that context, and
  `.planning/` is verified byte-for-byte unchanged across the round trip. This captures the
  positive (the handoff really happened) and the negative (memory did not become authoritative)
  in one run. alpha-AOS does not police the memory tool's filesystem access — that would
  require being an invocation proxy, contradicting D-02.

### Claude's Discretion

- The wording and storage of canary prompt scripts, and whether they live in the catalog or
  beside each pack — provided a script never names the skill or the MCP tool it is meant to
  elicit.
- The ledger record layout, file naming, and schema id under the user state root, consistent
  with the existing `schemas/` closed-world conventions and Phase 1 D-08.
- The judgement rule for CAPA-02's "an ordinary lookup does not fan out across the research
  stack" negative control — what call pattern counts as unwanted fan-out.
- The sidecar file's name and format under D-07.
- Stable code names for the new states and refusals, consistent with the repository's existing
  typed-finding and stable-error-code conventions (Phase 1 D-11).
- Whether the `kind` discriminator (D-05) lands in `schemas/receipt.schema.json`, in the plan
  schema, or both.

### Deferred Ideas (OUT OF SCOPE)

- **Project-scope MCP and policy synchronization** — raised while sizing D-05. No declared
  pack requests either today, and both would land as entries inside files the user co-owns
  (`.mcp.json`, `.agents/mcp_config.json`, `.pi/settings.json`, `.claude/settings.json`),
  which turns Phase 2 D-11's clean whole-file conflict rule into item-level ownership. The
  `kind` seam keeps it additive. Revisit when a pack actually declares one.
- **`ecc-pack-router`** — declared in `docs/alpha-vibe-stack-codex.md` §5.1 as a fourth global
  capability whose job is to stop the model inferring packs. It exists in no code today
  (`skills/` holds only `alpha-aos-ship`). Deterministic pack selection is already Phase 2's
  `project plan`; whether a router skill should also front it is a product question that did
  not need answering to materialize packs. Note for a later cycle.
- **Antigravity GUI/IDE and Hermes project-scope delivery** — pinned `unsupported` by D-10's
  ceiling. Reopening requires a documented project-local skill root, which is a research
  finding, not a decision this phase can make.
- **Telemetry and the common cross-harness metrics wrapper** (§9.2) — the ledger records
  proof, not usage volume or cost. Out of scope for v0.1.0 per PROJECT.md.
- **The full three-OS × every-harness/surface support matrix** — Phase 7 REL-02 owns it. This
  phase produces the mechanism and one proven surface.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CAPA-01 | Version-sensitive documentation question → each claimed surface natively selects the global documentation capability and makes a meaningful read-only Context7 call | Context7 4.0.4 probed live: exactly two tools `resolve-library-id`, `query-docs`; `resolve-library-id` returns a `Versions:` list, so a version-sensitive read-only call is available and works **without** `CONTEXT7_API_KEY`. `documentation-lookup/SKILL.md` names exactly those two tool ids — no drift. See *Meaningful Read-Only Calls* and *Pitfall 5*. |
| CAPA-02 | Multi-source research routes Exa → bounded Firecrawl without naming either; ordinary lookup does not fan out | Exa 3.4.1 probed live: exactly `web_search_exa`, `web_fetch_exa`. Firecrawl 3.24.0 probed live: **25 tools keyless / 27 with a key**, not 4. The shipped `deep-research/SKILL.md` names three tool ids that do not exist and one (`firecrawl_search`) the alpha-AOS allowlist denies. See *Pitfall 1* — this is the largest single risk to CAPA-02. |
| CAPA-03 | Cross-harness handoff through Unified Memory without Memory Vault content modifying `.planning/` | `ecc` and `ecc-memory-mcp` are both on PATH; `ecc memory handoff --from <h> --target <h>`, `ecc memory search --json`, `ecc memory doctor --json` all probed live and return closed `ecc.memory.*.v1` envelopes. Vault is currently empty (`memoryCount: 0`) — a clean canary baseline. See *Pattern 5*. |
| CAPA-04 | Preview and apply an evidence-matched exact-hash pack only inside the selected project | All 22 locked `sourceSha256` values verified byte-for-byte against installed `ecc-universal@2.2.0`; 21 of 22 skills are a single `SKILL.md`. `applyFileTransaction` already supplies D-06's all-or-nothing guarantee. See *Pattern 1* and *Pitfall 7*. |
| CAPA-05 | See the synced capability in the target harness with project-local provenance and exercise it | Three independent, zero-LLM-cost **native discovery oracles** found and proven (codex `debug prompt-input`, pi `--mode rpc` `get_commands`, claude `--output-format stream-json` init). Sidecar tolerance proven on claude and codex. See *Pattern 2* and *Pattern 3*. |
| CAPA-06 | Same task outside the project cannot discover or invoke the capability | Paired positive/negative proven live on codex and pi at zero LLM cost and on claude at one turn each. See *Pattern 3* and *Pitfall 3* (pi's ancestor walk is a real leak path). |
| CAPA-07 | Distinguish selected / deployed / discovered / invoked / blocked / stale / unsupported / unverified | Existing `PackState` and `SurfaceSupport` unions read verbatim; the new native-use axis has three distinct, independently observable sources (oracle, MCP proxy, readiness probe). `pi auth check --provider <p> --json` returns `{"status":"not_ready", "reason":"credentials_not_configured"}` — an off-the-shelf D-12 `blocked` reason. See *Pattern 4*. |
| CAPA-08 | Representative packs for web, API/data, infrastructure, agent/AI, security, scientific without global profiles | All 15 packs and their skills inventoried against the installed runtime. **All four scientific-pack skills have a frontmatter `name` that differs from their directory name**, and the three harnesses disagree about which one they advertise. See *Pitfall 2* — this is the largest single risk to CAPA-08. |
</phase_requirements>

## Summary

Three things changed between the discussion's assumptions and what this host actually reports, and each of them reshapes a plan.

**First, native discovery does not need an LLM call.** All three target harnesses expose a machine-readable listing of the skills they loaded, before any model turn: `codex debug prompt-input` renders the entire `<skills_instructions>` block with a skill-roots table; `pi --mode rpc` answers `{"type":"get_commands"}` with per-skill `sourceInfo.scope` of `"project"` or `"user"` and an absolute `path`; Claude Code's `--output-format stream-json` init event carries a `skills` array and an `mcp_servers` array. Two of the three cost nothing. That splits CAPA-05/CAPA-06's evidence cleanly: the **discovery** axis is a free, deterministic, offline-reproducible probe, and the expensive scripted-intent run is reserved for the **invocation** axis alone. It also makes D-14's paired negative practically free on codex and pi — I ran both pairs and both came back exactly as CAPA-06 requires.

**Second, two of the discussion's recorded support classifications are wrong in opposite directions.** Codex's `ADAPTER_SUPPORT_EVIDENCE` entry says "no documented project-scope discovery has been proven" — but codex 0.152.0 discovers **both** `<project>/.agents/skills` and `<project>/.codex/skills`, and I watched a fixture skill enter the model-visible prompt from each. Pi's project-scope discovery is documented in the shipped `docs/skills.md`. Meanwhile hermes's ceiling reason ("`gsdStrategy: worker-only`, which rules out project-scope pack delivery") is falsified by `hermes skills trust`, whose own help text reads "Trust a project so its repo-local skills (`./.hermes/skills`, `./.agents/skills`) load". Keeping hermes `unsupported` may still be the right *scope* decision, but the recorded *reason* must change or the ceiling is asserting a negative the harness contradicts.

**Third, the seam D-01 says it will extend is currently broken, and one shipped skill points the model at tools that do not exist.** `alpha-aos mcp-proxy firecrawl` fails to start on this Windows host — I reproduced it, and a falsification probe pins the cause: `upstreamEnvironmentPolicy` omits `APPDATA`/`LOCALAPPDATA`, so npx cannot find its own cache and dies before the handshake. Separately, `deep-research/SKILL.md` instructs the model to use `firecrawl_search` (denied by the alpha-AOS allowlist) and `web_search_advanced_exa` / `crawling_exa` (which do not exist in `exa-mcp-server@3.4.1`). CAPA-02 asks a model to route Exa→Firecrawl using a skill that describes a tool surface neither server has.

**Primary recommendation:** Build the free discovery oracles first as a separate `capability` verb (they are deterministic, offline, and testable in CI), fix the `mcp-proxy` environment defect and reconcile `deep-research`'s tool names before any invocation canary is attempted, and split the ledger's "discovered" key per harness because the three harnesses do not agree on what a skill is called.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Materialize pack `SKILL.md` into project skill roots | Transaction service (`src/core/transaction.ts`) | Pack writer (new, sibling of `ecc-skills.ts`) | D-06's all-or-nothing guarantee and the reversibility `alpha-aos rollback` needs already live in `applyFileTransaction`; a second write path would make both advisory. |
| Write and read receipts | Transaction service | Pack writer | Receipts must land inside the same transaction as the bytes they describe, or a crash leaves untracked files. |
| Decide *which* targets to write | Approved-plan artifact (`.alpha-aos/plan.json`) | CLI (`project sync --apply`) | D-08: `sync --apply` materializes the artifact and nothing else; it is not allowed to re-derive a plan. |
| Native discovery evidence | Harness adapter (`src/adapters/`) | Process adapter (`src/core/process.ts`) | Each harness has a different oracle command and a different output shape; branching that in a generic caller is the anti-pattern ARCHITECTURE.md already records. |
| Native invocation evidence | MCP observation proxy (`src/core/mcp-proxy.ts` extension) | Isolated runtime (`src/adapters/isolation.ts`) | D-01/D-02: the "a real call happened" half is an MCP-side fact, and the proxy is only in the path inside the canary runtime. |
| Canary process launch | Process adapter (`src/core/process.ts`) | Harness adapter | SAFE-06: shell-free, bounded, timeout-aware, explicit environment allowlist. No canary may bypass it. |
| Evidence ledger persistence | User state root (`userStateRoot()`) | Schema validator (`schemas/`) | D-03: host facts do not belong in the repository. Phase 1 D-08 closed-world schemas apply. |
| Capability-state resolution (the D-10/D-11 axes) | `classifyAdapterSupport` becomes a resolver | Catalog + ledger as the two inputs | The ceiling is a product claim (code/catalog); the proof is a host fact (ledger). Merging them is what CAPA-07 forbids. |
| Credential readiness / `blocked` reasons | Harness + MCP readiness probes | Redaction seam (`src/core/redaction.ts`) | D-12 names the variable, never the value; every rendering already leaves through the redaction seam. |
| One-shot lifecycle observation | Reconciliation (`reconcileProjectState`) | Ledger | D-13 reports a state with an offer; the removal still travels the approved `removalDigest` path. |

## Standard Stack

This phase adds **no new runtime dependency**. Everything it needs is already in
`package.json` and already pinned in `catalog/stack.lock.json`. That is a deliberate finding,
not an omission — see *Package Legitimacy Audit*.

### Core (already present, verified this session)

| Library / Tool | Version | Purpose | Why Standard |
|---|---|---|---|
| `@modelcontextprotocol/sdk` | 1.30.0 | MCP client/server, tool filtering, JSON-RPC message schema | Already the transport behind `src/core/mcp-proxy.ts`; Phase 1 deliberately delegated message validity to it rather than minting a project-local shape prohibition [VERIFIED: .planning/STATE.md accumulated-decision, read this session] |
| `ajv` | 8.20.0 | Closed-world schema validation | Every `schemas/*.json` is validated through it; the new ledger schema follows [VERIFIED: package.json:41, read this session] |
| `node:test` + `node:assert/strict` | Node 24.13.1 | Test runner | Repository convention: real temporary files, behaviour-focused negatives, no mocking framework [CITED: AGENTS.md ## Conventions] |
| `yaml` | 2.9.0 | Catalog parsing | `catalog/packs/*.yaml`, `catalog/stack.yaml` |
| `smol-toml` | 1.8.0 | Codex config rendering | Already used by `src/core/mcp.ts` for `config.toml` |

### Supporting (external processes this phase drives)

| Tool | Version observed on this host | Purpose | Non-interactive entrypoint (probed live) |
|---|---|---|---|
| Claude Code | `2.1.267 (Claude Code)` | Canary harness (`policy.canaryHarness: claude`) | `claude -p --output-format stream-json --verbose` [VERIFIED: live run, init event captured] |
| Codex CLI | `codex-cli 0.152.0` | Auto-promote target | `codex exec --json` for invocation; `codex debug prompt-input` for **free** discovery [VERIFIED: live run] |
| Pi Agent | `0.85.1` | Auto-promote target | `pi -p --mode json` for invocation; `pi --mode rpc` + `get_commands` for **free** discovery [VERIFIED: live run] |
| Hermes Agent | `Hermes Agent v0.20.6 (2026.8.27) · upstream 6e07eb48 · local 4209d371 (+1 carried commit)` | Ceiling-pinned `unsupported`; CAPA-03 handoff peer | `hermes -z PROMPT` (one-shot) [VERIFIED: `hermes --help`, read this session] |
| `ecc-universal` | `2.2.0` (global npm) | Pack skill source **and** Memory Vault runtime | `ecc memory handoff/search/read/doctor [--json]` [VERIFIED: live run] |
| `@upstash/context7-mcp` | `4.0.4` | CAPA-01 target | stdio; tools `resolve-library-id`, `query-docs` [VERIFIED: live MCP handshake] |
| `exa-mcp-server` | `3.4.1` | CAPA-02 discovery leg | stdio; tools `web_search_exa`, `web_fetch_exa` [VERIFIED: live MCP handshake] |
| `firecrawl-mcp` | `3.24.0` | CAPA-02 extraction leg | stdio; 25 tools keyless, 27 with a key [VERIFIED: live MCP handshake] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|---|---|---|
| Free discovery oracle + separate invocation canary | One scripted-intent run per surface that proves both at once | A single run conflates two facts, and it costs money: a bare `claude -p "hi"` in the fixture cost **$0.135** because the whole global skill/MCP surface is in the system prompt. Three surfaces × positive+negative × every CI leg is not affordable, and CI has no credentials at all. |
| MCP-side observation for invocation (D-01) | Harness-side tool-call events (`codex exec --json` tool events, claude `stream-json` tool_use blocks, pi `tool_execution_start`) | Harness-side events are richer and free, but they are the harness reporting on itself — one step removed from "a real call happened". D-01 already decided this; the harness event stream is still worth recording as **corroborating** evidence, because it is the only thing that can observe pi loading a `SKILL.md` via its `read` tool (pi's skills are not MCP tools at all). |
| `.claude/skills` sidecar for provenance (D-07) | Receipts only | Proven safe on claude and codex (below); pi is untested for the sidecar and should stay receipts-only until probed. |

**Installation:** none. `npm ci` against the existing lock is sufficient.

**Version verification performed this session:**

```
$ claude --version   → 2.1.267 (Claude Code)
$ codex --version    → codex-cli 0.152.0
$ pi --version       → 0.85.1
$ hermes --version   → Hermes Agent v0.20.6 (2026.8.27) · upstream 6e07eb48 · local 4209d371 (+1 carried commit)
$ cat "$(npm root -g)/ecc-universal/VERSION" → 2.2.0
```

## Package Legitimacy Audit

**This phase installs no external packages.** Every tool it drives is already pinned in
`catalog/stack.lock.json` and was verified on this host by a live protocol handshake, not by a
registry lookup. The legitimacy question that *does* apply is integrity of the pinned sources,
which was checked directly:

| Pinned artifact | Check performed this session | Result |
|---|---|---|
| `ecc-universal@2.2.0` — all 22 `sourceSha256` entries | sha256 of each installed `skills/<name>/SKILL.md` compared to `catalog/stack.lock.json` | **22 of 22 matched, zero mismatches** [VERIFIED: live hash comparison] |
| `@upstash/context7-mcp@4.0.4` | stdio MCP handshake + `tools/list` | Connected, 2 tools [VERIFIED: live] |
| `exa-mcp-server@3.4.1` | stdio MCP handshake + `tools/list` | Connected, 2 tools [VERIFIED: live] |
| `firecrawl-mcp@3.24.0` | stdio MCP handshake + `tools/list`, with and without a key | Connected both ways; keyless mode announced on stderr [VERIFIED: live] |

**Packages removed due to [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:** none.

If the plan later needs a JSONL reader for pi's RPC mode, **do not add a dependency** — see
*Pitfall 6*, which is a correctness constraint that rules out the obvious built-in as well.

## Architecture Patterns

### System Architecture Diagram

```text
                     ┌───────────────────────────────────────────────┐
   alpha-aos project │  plan  →  approve  →  sync --apply            │  (D-08 verb split)
                     └──────────────┬────────────────────────────────┘
                                    │ reads .alpha-aos/plan.json ONLY
                                    ▼
                    ┌───────────────────────────────┐
                    │  pack writer (new)            │
                    │  resolvePackSource(lock,…)    │──► exact bytes + sha256 from
                    │  render = identity            │    ecc-universal@2.2.0
                    └───────────────┬───────────────┘
                                    │ ONE list of FileWriteOperation
                                    ▼
                    ┌───────────────────────────────────────────┐
                    │  applyFileTransaction                     │  D-06: all-or-nothing
                    │   allowedRoots = [.claude/skills,         │
                    │                   .agents/skills,         │
                    │                   .pi/skills,             │
                    │                   .alpha-aos/receipts]    │
                    │   snapshot → journal → write → verify     │
                    └───────────────┬───────────────────────────┘
                       success      │      failure ─► rollback, ZERO receipts
                                    ▼
        ┌───────────────────────────────────────────────────────────┐
        │  project tree:  <root>/.claude/skills/<name>/SKILL.md      │
        │                 <root>/.alpha-aos/receipts/<pack>.json     │
        └───────────────────────────────────────────────────────────┘
                                    │
        ══════════════ evidence acquisition (separate verb) ══════════════
                                    │
              ┌─────────────────────┴───────────────────────┐
              ▼                                             ▼
   ┌──────────────────────┐                     ┌────────────────────────────┐
   │  DISCOVERY ORACLE    │  free, offline      │  INVOCATION CANARY         │  costs money,
   │  per harness         │  deterministic      │  scripted intent prompt    │  needs creds
   │                      │                     │                            │
   │ claude: -p           │                     │  isolated config root      │
   │   --output-format    │                     │  (D-02) renders the same   │
   │   stream-json        │                     │  servers through           │
   │   → init.skills[]    │                     │  alpha-aos mcp-proxy       │
   │ codex: debug         │                     │            │               │
   │   prompt-input       │                     │            ▼               │
   │   → skill roots + …  │                     │  ┌──────────────────────┐  │
   │ pi: --mode rpc       │                     │  │ observation proxy    │  │
   │   get_commands       │                     │  │ records tool name,   │  │
   │   → sourceInfo.scope │                     │  │ ts, server version   │  │
   └──────────┬───────────┘                     │  └──────────┬───────────┘  │
              │                                 └─────────────┼──────────────┘
              │  run twice: INSIDE project (+)                │
              │             OUTSIDE, non-repo (−)  ── D-14 ───┤
              ▼                                               ▼
        ┌──────────────────────────────────────────────────────────────┐
        │  evidence ledger under userStateRoot()  (D-03)               │
        │  key: projectId × harness × capability                       │
        │  binds: skillSourceHash, mcpServerVersion, evidenceHash,     │
        │         harnessVersion(exact) + harnessMinor(demotion key)   │
        │  an unpaired positive renders INCOMPLETE, never PASS         │
        └──────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure

```text
src/core/
├── project-pack-sync.ts    # NEW — the missing writer; sibling of ecc-skills.ts
├── capability-ledger.ts    # NEW — D-03 ledger read/write under userStateRoot()
├── canary.ts               # NEW — orchestrates discovery oracle + invocation canary
├── mcp-proxy.ts            # EXTEND — observation recording; FIX env policy first
├── project-plan.ts         # EXTEND — D-10 ceiling/resolver split, D-11 native-use axis
└── transaction.ts          # UNCHANGED — the single write path

src/adapters/
├── capability-oracle.ts    # NEW — per-harness discovery-oracle command + parser
└── isolation.ts            # EXTEND — D-02 canary runtime launch specs

schemas/
├── receipt.schema.json     # EXTEND — `kind` discriminator (D-05)
├── pack-catalog.schema.json# EXTEND — `lifecycle` (D-13)
└── capability-ledger.schema.json  # NEW (D-03)
```

### Pattern 1: The pack writer is a sibling of `ecc-skills.ts`, not a fork

**What:** A new module that binds source bytes and hash at review time, produces
`FileWriteOperation[]`, and hands them to `applyFileTransaction` with an explicit `allowedRoots`.

**When to use:** Every byte this phase writes into a project.

**Verified shapes (read this session):**

```ts
// src/core/transaction.ts — FileWriteOperation (verbatim)
export interface FileWriteOperation {
  target: string;
  content: Uint8Array | string | null;
}

// src/core/transaction.ts:119-131 — FileTransactionOptions (verbatim)
export interface FileTransactionOptions {
  stateRoot: string;
  allowedRoots: string[];
  operations: FileWriteOperation[];
  session?: MutationSession;
  failpoint?: TransactionFailpoint;
}
```

`content: null` is the removal form, which is why `applyPackRemoval` already works through the
same path. D-06 falls out for free: one `applyFileTransaction` call carrying **both** the
`SKILL.md` writes and the receipt writes is atomic by construction, and a failure rolls back
before any receipt exists. [VERIFIED: src/core/transaction.ts:119-131 and the
`FileWriteOperation` definition, both read this session]

**Do not** derive the target roots anywhere but `PROJECT_SKILL_ROOTS`:

```ts
// src/core/project-plan.ts:593-597 (verbatim)
export const PROJECT_SKILL_ROOTS: Readonly<Partial<Record<HarnessId, string>>> = {
  claude: ".claude/skills",
  codex: ".agents/skills",
  pi: ".pi/skills",
};
```

and the receipt directory is:

```ts
// src/core/project-plan.ts:570 (verbatim)
export const PROJECT_RECEIPT_DIRECTORY = ".alpha-aos/receipts";
```

[VERIFIED: src/core/project-plan.ts:570 and :593-597, read this session]

### Pattern 2: Three free discovery oracles — one per harness, three different shapes

This is the highest-leverage finding in this research. Each harness will tell you, without a
model turn, exactly which skills it loaded and from where.

**Codex — `codex debug prompt-input` (free, offline-capable, exit 0).** Renders the entire
model-visible prompt as JSON. The developer message contains a `<skills_instructions>` block
with a skill-roots table and one line per skill. Run from inside the fixture project:

```
### Skill roots
- `r0` = `.../probe/proj/.codex/skills`
- `r1` = `C:/Users/alpha/.agents/skills`
- `r2` = `C:/Users/alpha/.codex/skills/.system`
- `r7` = `.../probe/proj/.agents/skills`
### Available skills
- zzz-canary-widget: Use when the user asks to reticulate a splines manifest for the ZZZQ format. (file: r7/zzz-canary-widget/SKILL.md)
- zzz-codexlocal-widget: … (file: r0/zzz-codexlocal-widget/SKILL.md)
```

[VERIFIED: live `codex debug prompt-input` run, output pasted above]

Note the command takes **no** `-C/--cd`; it reads `process.cwd()`. Note also that the `rN`
labels are **positional and shift** — outside the project `r0` is `~/.agents/skills`. The
ledger must key on the resolved absolute path, never on the label.

**Pi — `pi --mode rpc` + `{"type":"get_commands"}` (free, one line of stdin, exit 0).** Returns
per-skill `sourceInfo` including an explicit project/user scope discriminator:

```json
{"name":"skill:zzz-pi-widget","description":"Use when the user asks to reticulate …",
 "source":"skill",
 "sourceInfo":{"path":"…\\probe\\proj\\.pi\\skills\\zzz-pi-widget\\SKILL.md",
               "source":"auto","scope":"project","origin":"top-level",
               "baseDir":"…\\probe\\proj\\.pi"}}
```

[VERIFIED: live `pi --mode rpc --approve --no-session` run, output pasted above]

`--approve` is required — pi gates project resources behind trust (see *Pitfall 4*). **The
shipped documentation is out of date here:** `docs/rpc.md` describes a flat `location` field
with values `"user" | "project" | "path"`, but 0.85.1 actually emits a nested
`sourceInfo.scope`. Code against the observed shape and assert it in a test, because the doc
would silently give you `undefined`.

**Claude Code — `claude -p --output-format stream-json --verbose` init event (costs one turn).**
The `system`/`init` line carries, among 27 keys, both of the arrays this phase needs:

```
KEYS: type, subtype, cwd, session_id, tools, mcp_servers, model, permissionMode,
      slash_commands, terminal_slash_commands, apiKeySource, claude_code_version,
      output_style, agents, skills, plugins, capabilities, …, memory_paths, …
skills      = ["alpha-aos-ship", …, "zzz-canary-widget", …]
mcp_servers = [{"name":"context7","status":"pending"}, {"name":"exa","status":"pending"},
               {"name":"firecrawl","status":"pending"}, …]
```

[VERIFIED: live `claude -p` run in the fixture, output pasted above]

Claude has no zero-cost variant: an empty prompt exits 1 with
`Error: Input must be provided either through stdin or as a prompt argument when using --print`
*before* the init event is emitted. [VERIFIED: live run, stderr pasted]

### Pattern 3: A CAPA-06 evidence unit is one probe run twice, from two directories

D-14 says a positive and its negative are one unit. Both free oracles make that literal —
same command, two working directories. Measured:

| Harness | Inside fixture project | Outside (empty non-repo temp dir) |
|---|---|---|
| codex | project roots `<proj>/.codex/skills` and `<proj>/.agents/skills` present; `zzz-canary-widget` + `zzz-codexlocal-widget` listed | **no project roots at all**; no `zzz-*` skill |
| pi | 30 skill commands, 3 with `sourceInfo.scope === "project"` | 27 skill commands, **0** project-scope; `scopes seen: ["user"]` |
| claude | `skills` length 46, includes `zzz-canary-widget` and `scientific-thinking-literature-review` | `skills` length 44, neither present |

[VERIFIED: six live runs this session, outputs pasted in the transcript above]

The pi row is the strongest form available anywhere: `scope` is the harness's own word for the
distinction CAPA-06 asks about, so the negative is not an inference from an absent name.

### Pattern 4: `blocked` reasons come from readiness probes, not from failed canaries

D-12 wants a `blocked` state that names the variable and the next action. Two off-the-shelf
probes already produce exactly that, and neither runs a model:

```
$ pi auth check --provider google --json
{"status":"not_ready","provider":"google","reason":"credentials_not_configured"}
```

[VERIFIED: live run for `google`, `anthropic`, `openai` — all three returned this shape]

```
$ claude mcp list
context7:  … --yes @upstash/context7-mcp@4.0.4 - ✔ Connected
exa:       … --yes exa-mcp-server@3.4.1 - ✔ Connected
firecrawl: … dist\src\cli.js mcp-proxy firecrawl - ✘ Failed to connect — CONNECTION_CLOSED: Connection closed
```

[VERIFIED: live run — and see *Pitfall 8*, this is a real defect, not a fixture artifact]

Run the readiness probe **before** the canary. A canary that fails because a credential is
missing produces a `blocked` record with a named cause; a canary that fails for an unknown
reason produces `unverified`. That split is what D-12 asks for, and deriving it from a
pre-probe is far more reliable than parsing a failed run's output.

### Pattern 5: CAPA-03's handoff has a closed, non-LLM evidence envelope

The Memory Vault CLI is present and returns versioned JSON:

```
$ ecc memory doctor --json
{"schemaVersion":"ecc.memory.doctor.v1","ok":true,"memoryCount":0,"invalidFiles":[], …}

$ ecc memory search --json --limit 2
{"schemaVersion":"ecc.memory.search.v1","query":"","results":[], "diagnostics":{…}}
```

[VERIFIED: live runs; both binaries `ecc` and `ecc-memory-mcp` resolved on PATH]

The write primitive D-16 needs is first-class:
`ecc memory handoff --from <harness> --target <harness> --title <text> (--stdin | --body-file <path>)`,
and recall is filterable with `--target-harness`. [VERIFIED: `ecc memory --help`, read this session]

So the D-16 canary is: `ecc memory doctor --json` baseline (currently `memoryCount: 0`) →
harness A writes a handoff → harness B is asked to resume that work → assert B's run read the
memory → `git status --porcelain .planning` and a recursive hash of `.planning/` unchanged.
Every step except "harness B is asked" is deterministic and offline.

### Anti-Patterns to Avoid

- **A single eight-value capability enum.** CAPA-07 explicitly names the failure. Keep the two
  existing unions untouched and add axes beside them:
  ```ts
  // src/core/project-plan.ts:1910 (verbatim)
  export type PackState = "CURRENT" | "STALE" | "DRIFTED" | "CHANGED" | "CONFLICT" | "UNDECIDABLE";
  // src/types.ts:401 (verbatim)
  export type SurfaceSupport = "supported" | "unsupported" | "unverified";
  ```
  [VERIFIED: src/core/project-plan.ts:1910 and src/types.ts:401, read this session]
- **Treating "the harness listed the skill" as invocation.** The discovery oracles prove
  loading, not selection. They satisfy the *discovered* axis and nothing more. Conflating them
  reintroduces exactly the "configuration-file presence is success" error PROJECT.md forbids,
  one layer up.
- **Rewording a canary prompt until it passes.** CONTEXT.md's `<specifics>` already rules this
  out; the plan should encode it as a prohibition with a named test, because it is the single
  easiest way to turn CAPA-01/02 into theatre.
- **Re-deriving the plan inside `sync --apply`.** D-08 is explicit and Phase 2 built the drift
  refusal for exactly this.
- **Opening a second write path for receipts.** `applyFileTransaction` or nothing.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---|---|---|---|
| All-or-nothing multi-file write with rollback | A bespoke "write skills then write receipts" sequence | `applyFileTransaction` with one operations list | Snapshots, hash-checked journals, path-boundary proofs, and drift-safe rollback already exist and are what `alpha-aos rollback` reads |
| Discovering what a harness loaded | Parsing `.claude/skills` off disk, or asking the model | The three oracles in *Pattern 2* | Disk contents are the input, not the outcome; model text is not evidence (D-01) |
| Deciding whether a project-scope skill is visible to pi | Comparing directory listings | `sourceInfo.scope` from `get_commands` | The harness's own classification, not an inference |
| Spawning any harness or MCP child | `child_process.spawn` directly | `src/core/process.ts` (`openProtocolProcess` / bounded adapter) | SAFE-06: shell-free, bounded output, timeout, explicit environment allowlist, descendant termination proven across three OSes in Phase 1 |
| Reading pi's RPC JSONL | `node:readline` | A `\n`-only splitter | pi's own docs: "Node `readline` is not protocol-compliant for RPC mode because it also splits on `U+2028` and `U+2029`, which are valid inside JSON strings" [CITED: pi 0.85.1 `docs/rpc.md` §Framing] |
| MCP JSON-RPC message validity | A project-local message shape check | `JSONRPCMessageSchema` from the SDK | Phase 1 decided this deliberately and recorded why |
| Redacting canary output | Ad-hoc string replacement | `src/core/redaction.ts` | Phase 1 D-12/D-13/D-14: subprocess output is bounded, redacted and fingerprinted; canary output is subprocess output |
| A skill-name canonicalizer | A rule mapping directory ⇄ frontmatter name | Record **both**, per harness | The three harnesses genuinely disagree (see *Pitfall 2*); a canonicalizer would pick a winner and be wrong on two of three |

**Key insight:** every mechanism this phase needs already exists in the repository or in the
harness. The work is composition and honest recording, not new machinery — which is also why
the *Package Legitimacy Audit* is empty.

## Runtime State Inventory

This phase writes into live harness roots and creates a new host-scoped state store, so the
inventory applies even though it is not a rename.

| Category | Items Found | Action Required |
|---|---|---|
| Stored data | New: the D-03 capability ledger under `userStateRoot()` (normally `~/.alpha-aos/`). Existing: `.alpha-aos/receipts/*.json` in each project — Phase 2 reads them, nothing writes them yet | New closed schema + a writer inside the same transaction as the bytes |
| Live service config | **Claude Code user MCP config currently registers `firecrawl` → `node D:\dev\alpha-AOS\dist\src\cli.js mcp-proxy firecrawl`, and that server is `✘ Failed to connect`.** Also present in Claude: `context7` ✔, `exa` ✔ | Fix `upstreamEnvironmentPolicy` (see *Pitfall 8*) — a Phase 3 canary that extends this proxy inherits a dead server |
| OS-registered state | None found. No scheduled task, service, or launch agent references alpha-AOS on this host | None — verified by absence from `claude mcp list`, `codex doctor`, and the harness config roots inspected |
| Secrets / env vars | `EXA_API_KEY` **set** (36 chars). `FIRECRAWL_API_KEY` **unset**. `CONTEXT7_API_KEY` **unset**. Pi: `credentials_not_configured` for google/anthropic/openai; the effective default is a keyless `nvidia` provider | Context7 works keyless and Firecrawl runs in keyless mode, so CAPA-01 is unblocked and CAPA-02's Firecrawl leg is degraded-but-runnable. Report each as a named D-12 `blocked` reason where it bites; never print a value |
| Build artifacts | `dist/` is current (`npm run build:check` baseline recorded in STATE.md as `56 inputs, 106 outputs`). `ecc-universal@2.2.0` is globally installed and its 22 skill files hash-match the lock | None. But note the pack writer must read from the **lock-pinned source**, not from whatever is globally installed, or a locally upgraded ECC would silently change pack bytes |
| Harness trust stores | Pi keeps trust decisions in `~/.pi/agent/trust.json`, keyed by canonical directory. Hermes keeps project-skill trust behind `hermes skills trust`. Claude Code skips the trust dialog entirely in `--print` mode | Canaries must pass `--approve` (pi); a *user's* first real use of a materialized pack in pi will prompt once — that belongs in the CAPA-05 report as an expected step, not a failure |

## Common Pitfalls

### Pitfall 1: `deep-research/SKILL.md` names tools that do not exist, and one the proxy denies

**What goes wrong:** CAPA-02 asks a model to route Exa→Firecrawl by following the
`deep-research` skill. That skill's own "MCP Requirements" section reads:

> - **firecrawl** — `firecrawl_search`, `firecrawl_scrape`, `firecrawl_crawl`
> - **exa** — `web_search_exa`, `web_search_advanced_exa`, `crawling_exa`

[CITED: `ecc-universal@2.2.0` `skills/deep-research/SKILL.md`, read this session]

Measured against the pinned servers:

- `exa-mcp-server@3.4.1` exposes exactly `web_search_exa`, `web_fetch_exa`. **`web_search_advanced_exa` and `crawling_exa` do not exist.** [VERIFIED: live `tools/list`]
- The alpha-AOS Firecrawl allowlist is `firecrawl_scrape`, `firecrawl_map`, `firecrawl_crawl`, `firecrawl_check_crawl_status` [VERIFIED: src/core/mcp-proxy.ts:17-22, read this session]. **`firecrawl_search` is not in it** — the proxy throws `MCP tool is not allowed by alpha-aos policy: firecrawl_search`.

So the skill directs discovery at Firecrawl's search (denied) and extraction at Exa tools that
do not exist. The skill's own header even warns it is "Drift-prone".

**Why it happens:** ECC skills are third-party text pinned by hash; the MCP servers move
independently. Nothing binds them.

**How to avoid:** Before any CAPA-02 canary, reconcile the three surfaces — the routing
contract in `docs/alpha-vibe-stack-codex.md` §4.2, the allowlist in `mcp-proxy.ts`, and the
skill body. D-07 forbids editing `SKILL.md` bytes, so the reconciliation must happen in the
allowlist and/or in an alpha-AOS-owned instruction, not by patching ECC. Record the mismatch
in the ledger as a named finding so a future ECC bump is visible.

**Warning signs:** a CAPA-02 canary where the model calls `firecrawl_search` and gets a policy
refusal, then "falls back" to native web search — which would look like a routing failure but
is actually a contract mismatch.

**Second-order note for the CAPA-02 negative control (Claude's Discretion item):** because Exa
itself ships `web_fetch_exa`, "Exa for discovery, Firecrawl for extraction" is not the only
two-tool path a reasonable model can take. The fan-out judgment rule should be written in terms
of *how many distinct research servers were touched for one ordinary lookup*, not in terms of a
specific tool sequence.

### Pitfall 2: the four scientific-pack skills have a frontmatter `name` ≠ directory name, and the three harnesses disagree about which one wins

**What goes wrong:** CAPA-08 requires a scientific pack. `RESEARCH_SCIENTIFIC` supplies four
skills, and every one of them is a name/directory mismatch:

| Catalog / directory name | Frontmatter `name` |
|---|---|
| `scientific-db-pubmed-database` | `pubmed-database` |
| `scientific-db-uspto-database` | `uspto-database` |
| `scientific-thinking-literature-review` | `literature-review` |
| `scientific-thinking-scholar-evaluation` | `scholar-evaluation` |

The other 18 locked skills match. [VERIFIED: frontmatter parsed from all 22 installed
`SKILL.md` files this session]

Then the harnesses split, measured with the identical file in a fixture:

- **Claude Code 2.1.267** advertises `scientific-thinking-literature-review` — the **directory** name. [VERIFIED: live `claude -p` init `skills` array]
- **Codex 0.152.0** advertises `literature-review` — the **frontmatter** name. [VERIFIED: live `codex debug prompt-input`]
- **Pi 0.85.1** advertises `skill:literature-review` — the **frontmatter** name, and documents the divergence deliberately: "Pi allows skill names to differ from their parent directory even though the standard disallows it; that rule is suboptimal for shared skill directories used across multiple agent harnesses." [CITED: pi 0.85.1 `docs/skills.md`]

Neither claude nor codex emitted any warning. [VERIFIED: stderr empty on both]

**Why it happens:** the Agent Skills specification requires `name` to equal the parent
directory; ECC ships four skills that violate it; each harness chose a different lenience.

**How to avoid:** the ledger's *discovered* key must be **per harness**, resolved from the
target path rather than from the pack catalog's skill id. Record both names. Do not "fix" the
mismatch by renaming the directory — the directory name is what `resolvePackSource` and the
lock's `sourceSha256` key on, and renaming would break the exact-hash contract CAPA-04 rests on.
Do not fix it by editing the frontmatter either — D-07 and design §5.3 forbid touching the bytes.

**Warning signs:** a CAPA-08 scientific-pack assertion that passes on claude and fails on codex
with "skill not discovered" when the file is demonstrably present.

### Pitfall 3: pi walks `.agents/skills` up through ancestors, so D-14's "outside" directory can still see the pack

**What goes wrong:** pi loads project skills from "`.agents/skills/` in `cwd` and ancestor
directories (up to git repo root, **or filesystem root when not in a repo**)". [CITED: pi 0.85.1
`docs/skills.md` §Locations]

D-14's negative runs in "a temporary directory that is not a repository" — which is precisely
the case where pi's walk does **not** stop at a repo root and continues to the filesystem root.
A `.agents/skills` anywhere on that path (a user's home, a parent temp dir) would make the
negative silently false.

**Why it happens:** the ancestor walk is a convenience feature whose stop condition inverts in
exactly the situation D-14 chose.

**How to avoid:** the negative-control directory must be constructed, not assumed — assert that
no ancestor from the temp dir to the filesystem root contains `.agents/skills`, and record that
assertion as part of the evidence unit. My own probe passed (`scopes seen: ["user"]`, zero
project-scope entries) but that is a property of this host's temp path, not a guarantee.

**Warning signs:** a CAPA-06 negative that passes on one machine and fails on another with no
code change.

### Pitfall 4: pi will not load project skills at all until the project is trusted

**What goes wrong:** pi's project skill roots are documented as "Project (**only after the
project is trusted**)". Trust defaults to `"ask"`, which requires UI. In `--print` /
`--mode rpc` there is no UI. [CITED: pi 0.85.1 `docs/skills.md`, `docs/security.md`]

**How to avoid:** every pi probe and canary passes `--approve` ("Trust project-local files for
this run"). I verified `--approve` is sufficient and produces no prompt. But note this is a
**per-run** trust: a real user who has never trusted the repository will see the prompt once.
That belongs in the CAPA-05 human-facing report as an expected step. Also note `--no-approve`
gives a clean way to build a *second* negative control — same directory, trust withheld —
which is arguably a better CAPA-06 negative for pi than a different directory.

### Pitfall 5: MCP servers are `pending` at claude's init event — a tools check there sees nothing

**What goes wrong:** the claude init event listed
`{"name":"context7","status":"pending"}` for all three upstream servers, and the `tools` array
contained **zero** `mcp__context7__*`, `mcp__exa__*` or `mcp__firecrawl__*` entries.
[VERIFIED: live run, filtered output pasted above]

The design doc's §4.3 rule — "`connected` with 0 tools is a failure" — cannot be evaluated at
init, because at init everything legitimately has 0 tools.

**How to avoid:** use `claude mcp list` / `claude mcp get <name>` as the connection oracle (it
health-checks synchronously and is free), and treat the init event's `mcp_servers` array as a
*registration* fact only. If a tool-count check is wanted, the documented escalation is
`claude --debug='mcp'` or `claude --debug-file <path>`, with secrets stripped before the log is
shared. [CITED: `docs/alpha-vibe-stack-codex.md` §4.3; `--debug-file` confirmed present in
`claude --help` at 2.1.267]

### Pitfall 6: hermes's `--version` string contains a value that changes without the install changing

**What goes wrong:** D-04 demotes a proof at a harness minor boundary, which requires parsing a
version. Three of four harnesses are plain semver:

```
claude  → 2.1.267 (Claude Code)      minor key = 2.1
codex   → codex-cli 0.152.0          minor key = 0.152   (note the "codex-cli " prefix)
pi      → 0.85.1                     minor key = 0.85
hermes  → Hermes Agent v0.20.6 (2026.8.27) · upstream 6e07eb48 · local 4209d371 (+1 carried commit)
```

The hermes string is not semver, and its `upstream <sha>` token **moved during this session**:
an early call reported `upstream 9e6c4100` and later calls reported `upstream 6e07eb48`, with
no install change in between (it tracks the remote head). Three consecutive calls afterwards
were identical, so it is stable within a window and unstable across one.
[VERIFIED: four live `hermes --version` calls, outputs pasted]

**How to avoid:** extract `v0.20.6` and bind only that; never fingerprint the whole line. Store
the full string as an audit note. The same discipline covers codex's `codex-cli ` prefix and
claude's ` (Claude Code)` suffix. A version that cannot be parsed is `unverified`, not an
error — record the raw string and say so.

### Pitfall 7: `security-review` ships a companion file the SKILL.md never references

**What goes wrong:** 21 of the 22 locked skills are a lone `SKILL.md`. `security-review` ships
two files: `SKILL.md` and `cloud-infrastructure-security.md`. D-05 materializes `SKILL.md` only,
so the companion is not written. [VERIFIED: file listing of all 22 skill directories]

I checked whether it matters: `security-review/SKILL.md` contains **no reference** to
`cloud-infrastructure-security.md`. [VERIFIED: grep over the file this session] So the
SKILL.md-only rule is safe *today* — but it is safe by coincidence, not by contract.

Separately, `mcp-server-patterns/SKILL.md` contains a link to `../../docs/capability-surface-selection.md`,
which resolves to `<project>/.claude/docs/…` once materialized and will not exist. That is a
dead link inside a pack skill, not a failure.

**How to avoid:** make "the pack skill is exactly one file" an asserted property of the plan
(count the files under each source skill directory and refuse or warn on >1), so the next ECC
bump that adds a `references/` directory is loud rather than silent.

### Pitfall 8: `alpha-aos mcp-proxy firecrawl` does not start on Windows — root cause found

**What goes wrong:** the seam CONTEXT.md calls "an already-working bounded stdio front for one
MCP server" does not work on this host:

```
$ claude mcp get firecrawl
  Status: ✘ Failed to connect
  Issue: CONNECTION_CLOSED: Connection closed

$ node dist/src/cli.js mcp-proxy firecrawl < /dev/null
alpha-aos: MCP error -32000: Connection closed
```

It is **not** the credential — `firecrawl-mcp@3.24.0` starts fine keyless, announcing on stderr:
"No FIRECRAWL_API_KEY or FIRECRAWL_API_URL set — running in keyless mode."
[VERIFIED: live direct MCP handshake, both with and without a dummy key]

**Falsification probe and its output.** I spawned `npx --yes firecrawl-mcp@3.24.0 --help` under
three environments built from the repository's own declarations:

```
--- floor-only  status= 4294963238
   stderr: npm error code ENOENT | npm error syscall open |
           npm error path C:\Users\alpha\npm-cache\_npx\db0efa1a1ed40fd1\package.json |
           npm error errno -4058 | npm error enoent Could not read package.json …
--- floor+APPDATA+LOCALAPPDATA  status= 0
   stderr: No FIRECRAWL_API_KEY or FIRECRAWL_API_URL set — running in keyless mode. …
--- floor+APPDATA+LOCALAPPDATA+PATHEXT+COMSPEC  status= 0
   stderr: No FIRECRAWL_API_KEY or FIRECRAWL_API_URL set — running in keyless mode. …
```

[VERIFIED: live probe run this session, output pasted verbatim]

**Root cause.** The proxy's child environment is:

```ts
// src/core/mcp-proxy.ts:29-33 (verbatim)
const UPSTREAM_ENVIRONMENT_NAMES: Record<McpServerId, readonly string[]> = {
  firecrawl: ["FIRECRAWL_API_KEY", "FIRECRAWL_API_URL", "FIRECRAWL_OAUTH_TOKEN"],
  exa: ["EXA_API_KEY", "ENABLED_TOOLS"],
  context7: ["CONTEXT7_API_KEY"],
};
```

plus `PLATFORM_FLOOR_ENVIRONMENT`, whose win32 branch is:

```ts
// src/core/process.ts:95-116 (verbatim, win32 case)
"HOMEDRIVE", "HOMEPATH", "LOGONSERVER", "PATH", "SYSTEMDRIVE", "SYSTEMROOT",
"TEMP", "USERDOMAIN", "USERNAME", "USERPROFILE", "WINDIR"
```

`APPDATA` and `LOCALAPPDATA` are absent, so npm falls back to a `%USERPROFILE%`-derived cache
that holds no `_npx` entry and the child dies before the JSON-RPC handshake. Contrast
`commandProbeEnvironment` at `src/core/process.ts:823-839`, which passes a much wider set
including `npm_config_prefix`, `npm_config_cache`-adjacent names and `PATHEXT`. The two lists
diverged. [VERIFIED: both lists read this session]

**How to avoid — and which fix to choose.** Do **not** simply add `APPDATA`/`LOCALAPPDATA` to
the passthrough. Plan 01-21's recorded decision is that "the names that decide where it writes
are pinned outside the user's home rather than inherited" [VERIFIED: .planning/STATE.md
accumulated decision, read this session]. The design-consistent repair is to pin
`npm_config_cache` (and, on win32, whatever else the probe shows is load-bearing) to a managed
location under `userStateRoot()`, and to add a regression test that starts each of the three
proxied servers and asserts a successful `tools/list`. That test is the thing that would have
caught this, and Phase 3 needs it anyway before it can layer observation on the same seam.

### Pitfall 9: a Windows libuv assertion on MCP transport close

**What goes wrong:** closing a stdio MCP client cleanly on this Windows host produced, after the
useful output:

```
Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), file src\win\async.c, line 76
```

[VERIFIED: live probe against `@upstash/context7-mcp@4.0.4`, output pasted]

**Why it matters:** an observation proxy that opens and closes an upstream client per canary
will hit close-path teardown far more often than the long-lived everyday proxy does. A crash at
close after the evidence was already recorded is survivable but will corrupt exit codes and can
truncate a journal.

**How to avoid:** route the close through `src/core/process.ts`'s bounded session `close()`,
which Phase 1 already hardened for descendant termination across three OSes, rather than through
the SDK transport's own close; and treat a non-zero exit *after* a complete evidence record as a
separate, named finding rather than as canary failure.

### Pitfall 10: a canary costs real money, and CI has no credentials

**What goes wrong:** a bare `claude -p "hi"` in an empty fixture project reported
`total_cost_usd = 0.13491` (and a second run `0.109881`, a third `0.11592`) — because the whole
global skill, agent and MCP surface is in the system prompt regardless of the prompt's size.
[VERIFIED: three live runs, `result` events parsed]

Six claude canary runs (three capabilities × positive/negative) is roughly $0.70 per execution,
per host — and GitHub-hosted CI has no Anthropic credential at all.

**How to avoid:** this is the structural argument for *Pattern 2*. Put the discovery axis in the
automated suite (free, offline, three-OS-portable) and make the invocation axis an explicit
`doctor`/canary mode — which is precisely what LIFE-02 already describes: "offline `status` for
fast inspection and an explicit `doctor` or canary mode for native discovery and meaningful
read-only execution evidence". Phase 3 should build to that shape now rather than retrofit it.

## Code Examples

### Free discovery oracle — codex

```bash
# Runs in cwd; there is no -C/--cd on this subcommand.
cd "$PROJECT" && codex debug prompt-input "placeholder" > prompt-input.json
```

```ts
// Parse: the developer message carries a <skills_instructions> block.
const messages = JSON.parse(raw) as Array<{ content?: Array<{ text?: string }> }>;
const text = messages.flatMap((m) => m.content ?? []).map((c) => c.text ?? "").join("\n");
const block = text.slice(
  text.indexOf("<skills_instructions>"),
  text.indexOf("</skills_instructions>"),
);
// Roots line shape:  - `r7` = `C:/…/proj/.agents/skills`
// Skill line shape:  - <name>: <description> (file: r7/<dir>/SKILL.md)
// Resolve rN -> absolute path BEFORE keying the ledger; the labels are positional.
```

### Free discovery oracle — pi

```bash
printf '{"id":"1","type":"get_commands"}\n' \
  | pi --mode rpc --approve --no-session
```

```jsonc
// One response line; skills are the entries with source === "skill".
{ "type": "response", "command": "get_commands", "success": true,
  "data": { "commands": [
    { "name": "skill:zzz-pi-widget",
      "description": "…",
      "source": "skill",
      "sourceInfo": { "path": "…\\proj\\.pi\\skills\\zzz-pi-widget\\SKILL.md",
                      "source": "auto", "scope": "project",
                      "origin": "top-level", "baseDir": "…\\proj\\.pi" } } ] } }
```

Split the stream on `\n` only — not with `node:readline`.

### Discovery oracle — claude (one turn)

```bash
claude -p "<scripted intent prompt>" \
  --output-format stream-json --verbose \
  --permission-prompts none --no-session-persistence
```

```ts
// The system/init line, emitted before the model turn, carries both arrays.
if (event.type === "system" && event.subtype === "init") {
  event.skills;       // string[] — DIRECTORY names on claude
  event.mcp_servers;  // [{ name, status }] — status is "pending" at init
  event.claude_code_version;
}
// The terminal `result` event carries total_cost_usd, num_turns, permission_denials.
```

For D-02's canary runtime, the two flags that isolate MCP are already present at 2.1.267:
`--mcp-config <configs...>` ("Load MCP servers from JSON files or strings") and
`--strict-mcp-config` ("Only use MCP servers from --mcp-config, ignoring all other MCP
configurations"). [VERIFIED: `claude --help`, read this session] `src/adapters/isolation.ts:47`
already constructs `--mcp-config` for claude.

### Meaningful read-only calls (CAPA-01 / CAPA-02)

```
Context7 4.0.4 — tools: resolve-library-id, query-docs        (no API key needed)
  resolve-library-id { libraryName: "Next.js", query: "app router route handlers" }
  → "- Context7-compatible library ID: /vercel/next.js
     - Versions: v14.3.0-canary.87, v13.5.11, v15.1.8, …, v16.2.9"
  query-docs { libraryId: "/vercel/next.js/v16.2.2", query: … }   ← version-scoped id
```

[VERIFIED: live MCP call, response excerpt pasted]

The `Versions:` list is what makes CAPA-01's "version-sensitive" concrete: a canary can assert
that the observed `query-docs` call carried a `/org/project/version` id, which is a structural
fact about the call, not a judgment about the answer. `documentation-lookup/SKILL.md` already
teaches exactly this: "You must obtain a Context7-compatible library ID (format `/org/project`
or `/org/project/version`) before querying docs." [CITED: ecc-universal 2.2.0
`skills/documentation-lookup/SKILL.md`]

```
Exa 3.4.1      — tools: web_search_exa, web_fetch_exa
Firecrawl 3.24 — 25 tools keyless / 27 with key; alpha-AOS allows exactly:
                 firecrawl_scrape, firecrawl_map, firecrawl_crawl, firecrawl_check_crawl_status
```

### Transaction call shape (D-06)

```ts
await applyFileTransaction({
  stateRoot,                       // userStateRoot() — journals and snapshots
  allowedRoots: [                  // resolved absolutes under the canonical project root
    join(root, ".claude", "skills"),
    join(root, ".agents", "skills"),
    join(root, ".pi", "skills"),
    join(root, ".alpha-aos", "receipts"),
  ],
  operations: [
    ...skillWrites,                // { target, content: <exact source bytes> }
    ...receiptWrites,              // { target, content: JSON.stringify(receipt) }
  ],
  session,                         // caller-supplied MutationSession
});
```

One call, both kinds of file. A throw rolls back and leaves zero receipts, which is D-06 stated
as code rather than as intent.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|---|---|---|---|
| Context7 tools `resolve-library-id` + `get-library-docs` | `resolve-library-id` + **`query-docs`** | by 4.0.4 (the pinned version) | Any code or prompt referring to `get-library-docs` is dead. `documentation-lookup` is already correct. [VERIFIED: live `tools/list`] |
| Firecrawl MCP as a small scrape/crawl surface | 25–27 tools including monitors, agents, research and developer search | by 3.24.0 | The alpha-AOS 4-tool allowlist is now a *substantial* narrowing and worth stating as a product claim, not an implementation detail |
| "Codex has no documented project-scope skill discovery" (Phase 2's recorded reason) | Codex 0.152.0 discovers `<project>/.agents/skills` **and** `<project>/.codex/skills` | ≤ 0.152.0 | `ADAPTER_SUPPORT_EVIDENCE`'s codex entry is now inaccurate; `PROJECT_SKILL_ROOTS` knows only one of the two codex roots |
| "Hermes cannot receive project-scope packs because `gsdStrategy: worker-only`" | `hermes skills trust` exists to "Trust a project so its repo-local skills (`./.hermes/skills`, `./.agents/skills`) load" | present at v0.20.6 | The ceiling's *reason* is falsified even if the *decision* stands. Recording a false reason is the failure mode Phase 2's discipline exists to prevent |
| Agent Skills: `name` must equal the parent directory | Pi deliberately relaxes it; codex and pi key on `name`, claude keys on the directory | — | The ledger needs a per-harness discovered-name key |

**Deprecated / outdated in this repository:**

- `src/core/ecc-skills.ts:55` resolves the antigravity global skill root to
  `ANTIGRAVITY_CONFIG_DIR || ~/.gemini/config` + `/skills`. On this host Antigravity's actual
  state root is `~/.gemini/antigravity/` (which contains `builtin/skills`, `mcp_config.json`,
  `settings.json`), and `~/.gemini/config` does not exist. [VERIFIED: directory listings this
  session] Out of scope for Phase 3's *project* roots, but it means any antigravity claim built
  on that path is currently pointing at nothing.
- pi `docs/rpc.md`'s flat `location` field for `get_commands` — 0.85.1 emits nested
  `sourceInfo.scope`.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|---|---|---|
| A1 | The three discovery oracles behave the same on macOS and Linux as on Windows 11 | Pattern 2 | The free-oracle strategy degrades to paid canaries on two of three CI legs; Phase 7's matrix would surface it late. Mitigation: assert the oracle output shape in the suite, so a platform difference is a test failure rather than a silent fallback |
| A2 | `codex debug prompt-input` is a stable, non-experimental surface | Pattern 2 | It is under `codex debug`, whose siblings are `models` and `app-server` ("Tooling: helps debug the app server"). A rename in a future codex release breaks the oracle. Mitigation: treat an unparseable oracle as `unverified` with the raw stderr recorded, never as "not discovered" |
| A3 | `claude -p`'s `init.skills` array is the complete set of skills the model can select, not a filtered view | Pattern 2 | A CAPA-06 negative could pass because the array is truncated rather than because the skill is absent. Mitigation: the paired positive from the same command shape is the control |
| A4 | Antigravity has no project-local skill root | D-10 ceiling | If one exists, the ceiling over-claims a negative — the same class of error as the hermes reason. What I could establish: `~/.gemini/antigravity/builtin/skills` holds five built-in skills; `app.asar` contains no `SKILL.md`, `.agents/skills` or `.antigravity/skills` literal; no `antigravity`/`agy` command is on PATH; `~/.gemini/antigravity/bin/agentapi.bat` shells to `language_server.exe agentapi` and is undocumented. That is strong absence-of-evidence, not evidence of absence |
| A5 | Pinning `npm_config_cache` under `userStateRoot()` fixes the proxy without breaking POSIX | Pitfall 8 | I falsified the *cause* on Windows and proved `APPDATA`+`LOCALAPPDATA` is *a* fix; I did not run the recommended pinned-cache variant, nor any variant on macOS/Linux. The repair needs its own probe in the plan |
| A6 | The alpha-AOS Firecrawl allowlist should be reconciled toward the design doc rather than toward the skill | Pitfall 1 | If the intended resolution is instead to admit `firecrawl_search`, the "bounded four-tool Firecrawl surface" claim in PROJECT.md's Validated list changes. This is a product call, not a research finding |
| A7 | pi's `nvidia/nemotron-3-super-120b-a12b` fallback is good enough to make an intent-driven selection | D-09 auto-promotion | pi reported `credentials_not_configured` for google/anthropic/openai and silently fell back to a free nvidia model. A weak model failing to select a skill is a finding about *the model*, not about pi's discovery. The plan must record which provider/model a pi canary actually ran on, or a `codex/pi auto-promote` result is uninterpretable |
| A8 | `.ai-style-rules.md` is a reliable D-13 "output" signal | Open Q7 answer | The skill writes it, but a user can decline the run partway; presence proves output, absence does not prove no-output |

## Open Questions

The eight questions CONTEXT.md handed to research are answered below. Four are fully settled,
three are settled with a caveat, one remains open.

1. **Non-interactive entrypoint per harness — SETTLED.** claude: `-p/--print` with
   `--output-format text|json|stream-json`. codex: `codex exec [--json] [-o FILE] [--sandbox read-only] [--ignore-user-config] [--skip-git-repo-check]`. pi: `-p/--print` with `--mode text|json|rpc`. hermes: `-z/--oneshot PROMPT`. antigravity: **none found** (no CLI on PATH; `agentapi.bat` is an undocumented lead). [VERIFIED: `--help` for all four, plus live runs of claude/codex/pi]

2. **Sidecar tolerance — SETTLED for claude and codex, UNTESTED for pi.** I placed
   `.alpha-aos-provenance.json` and `alpha-aos-receipt.yaml` inside a skill directory. Codex
   still listed the skill with an unchanged description, emitted nothing on stderr, and did not
   surface the sidecars as skills. Claude likewise listed the skill unchanged. [VERIFIED: live
   runs, stderr empty on both] Pi's documented rule is favourable — "Root Markdown files other
   than `SKILL.md` that do not look like skills are ignored silently" [CITED: pi `docs/skills.md`]
   — but I did not probe a non-Markdown sidecar in pi, and pi warns about several things it
   still loads. **Recommendation:** enable the D-07 sidecar for claude and codex; keep pi
   receipts-only until a probe exists.

3. **Project-scope discovery for codex `.agents/skills` and pi `.pi/skills` — SETTLED, both
   YES.** Codex proven empirically (and it discovers `<project>/.codex/skills` too, which
   `PROJECT_SKILL_ROOTS` does not know about). Pi documented **and** proven, with an explicit
   `scope: "project"` in the harness's own output. D-09's auto-promotion has real material to
   promote on both. The correct next step is to change `ADAPTER_SUPPORT_EVIDENCE`'s codex reason
   to cite the observation, and to decide whether `.codex/skills` becomes a second codex target
   or is deliberately left alone (leaving it alone is defensible: one root per harness keeps
   removal confinement simple, and `.agents/skills` is the shared-standard location).

4. **Can the proxy front Context7 and Exa, and what is a meaningful read-only call — SETTLED
   with a prerequisite.** Both servers are ordinary stdio children with tiny tool surfaces, so
   fronting them is the same shape as firecrawl — `allowedMcpTools` currently returns `null` for
   anything but firecrawl and `runMcpFilterProxy` throws for those ids, so the observation build
   must separate "observe" from "filter". Meaningful read-only calls: Context7
   `resolve-library-id` → `query-docs` with a `/org/project/version` id; Exa `web_search_exa`
   (bounded result count) → Firecrawl `firecrawl_scrape` on one returned URL. **Prerequisite:**
   Pitfall 8's environment defect must be fixed first, or the proxy cannot start at all.

5. **Version → minor boundary per harness — SETTLED.** See *Pitfall 6*. Three semver, one that
   needs a `v(\d+)\.(\d+)\.(\d+)` extraction from a decorated line whose other tokens drift.

6. **Antigravity surfaces and codex CLI/IDE keying — PARTIALLY SETTLED.** The design doc is
   explicit and authoritative on the codex half: "Codex CLI와 IDE extension은 같은 Codex host에서
   MCP 구성을 공유할 수 있다. 이것을 Antigravity나 다른 제품에도 그대로 적용된다고 가정하지 않고
   각 surface를 따로 검증한다." [CITED: `docs/alpha-vibe-stack-codex.md` §4.3] Codex CLI and its
   IDE extension share `$CODEX_HOME`, so one MCP proof plausibly covers both — but the doc's own
   rule says verify separately. For Antigravity, the two distinct roots on this host
   (`~/.antigravity/` holding VS Code-style extensions, `~/.gemini/antigravity/` holding agent
   state, `mcp_config.json` and `builtin/skills`) are positive evidence that GUI/IDE and the
   agent are **not** one state store, which argues for keying them separately. Not resolvable
   further without an Antigravity entrypoint.

7. **Does `inherit-legacy-style` produce a detectable output — SETTLED, YES.** The skill
   generates `.ai-style-rules.md` at the project root, "with commit fingerprint + scale tier in
   header", and optionally adds an `@.ai-style-rules.md` reference to `CLAUDE.md`. It also
   self-detects: "Silently check for `.ai-style-rules.md` at the project root" is its own
   first-run-vs-incremental branch. [CITED: ecc-universal 2.2.0
   `skills/inherit-legacy-style/SKILL.md`, read this session] So D-13 can key on a real artifact
   rather than on "invoked once" alone. **Two constraints:** the *agent* writes that file, not
   alpha-AOS, so it is outside Phase 2 D-10's `.alpha-aos/` write boundary and alpha-AOS may
   only observe it; and presence proves output while absence does not prove no-output (A8), so
   the ledger's `invoked` record stays the primary signal with the artifact as corroboration.

8. **What `ecc-universal@2.2.0` ships for the pack skills — SETTLED.** All 22 locked skills are
   present; all 22 `sourceSha256` values match byte-for-byte; 21 are a single `SKILL.md`;
   `security-review` has one unreferenced companion; four scientific skills have a name/directory
   mismatch (Pitfall 2); `mcp-server-patterns` has one dead relative link. `renderEccSkill` is
   the identity for every pack skill, which is exactly what `PLAN_RENDERER_ID = "ecc-skill/identity"`
   already asserts, so `targetSha256` for a pack skill is simply its `sourceSha256`.

**Still open, newly raised by this research:**

- Should `<project>/.codex/skills` join `PROJECT_SKILL_ROOTS`? Adding it widens
  `schemas/receipt.schema.json`'s reach without adding a harness; leaving it out means codex
  users with an existing `.codex/skills` see a shadow alpha-AOS does not report.
- Should the hermes ceiling reason be corrected (keeping `unsupported`) or should hermes be
  re-classified given `hermes skills trust`? A wrong reason recorded as evidence is the exact
  discipline failure Phase 2 hardened against.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|---|---|---|---|---|
| Node.js | everything | ✓ | v24.13.1 (>= 24 required) | — |
| npm | proxy launches upstream MCP via npx | ✓ | 11.8.0 | — |
| Claude Code | D-09 pass bar (CAPA-01/02/04/05/06) | ✓ | 2.1.267 | none — the phase bar is claude |
| Codex CLI | D-09 auto-promote | ✓ | 0.152.0 | record failure, do not block |
| Pi Agent | D-09 auto-promote | ✓ | 0.85.1 | record failure, do not block |
| Hermes Agent | CAPA-03 handoff peer | ✓ | v0.20.6 | claude↔codex handoff instead |
| Antigravity | ceiling `unsupported` | app installed, **no CLI on PATH** | Electron app + `~/.gemini/antigravity/` | stays `unsupported`; nothing to run |
| `ecc-universal` CLI (`ecc`, `ecc-memory-mcp`) | CAPA-03 | ✓ both on PATH | 2.2.0 | none — CAPA-03 requires the vault |
| `@upstash/context7-mcp` | CAPA-01 | ✓ via npx | 4.0.4 | none |
| `exa-mcp-server` | CAPA-02 | ✓ via npx | 3.4.1 | none |
| `firecrawl-mcp` | CAPA-02 | ✓ via npx **directly**; ✗ through `alpha-aos mcp-proxy` | 3.24.0 | keyless mode covers `firecrawl_scrape`; the proxy defect must be fixed |
| `EXA_API_KEY` | CAPA-02 discovery leg | ✓ set | — | none; unset ⇒ D-12 `blocked` |
| `CONTEXT7_API_KEY` | CAPA-01 | ✗ unset | — | **not needed** — verified working keyless |
| `FIRECRAWL_API_KEY` | CAPA-02 extraction leg | ✗ unset | — | keyless mode: `firecrawl_scrape` and `firecrawl_search` free/rate-limited; the other 23 tools require a key |
| Pi provider credentials | pi invocation canary | ✗ `credentials_not_configured` (google/anthropic/openai) | — | silent fallback to a free `nvidia` model — see A7 |
| Anthropic credential in CI | claude canary on CI | ✗ | — | **no fallback** — the invocation canary cannot run on GitHub-hosted CI |

**Missing dependencies with no fallback:**

- An Anthropic credential in CI. The invocation canary is a real-host-only operation. This is
  the structural reason the automated suite must own the discovery axis and the canary must be
  an explicit `doctor`-style mode (LIFE-02's shape).
- An Antigravity non-interactive entrypoint. Its ceiling stays `unsupported`.

**Missing dependencies with fallback:**

- `FIRECRAWL_API_KEY` → keyless mode still serves `firecrawl_scrape`, which is the only Firecrawl
  tool CAPA-02's extraction leg strictly needs.
- `CONTEXT7_API_KEY` → not required at all; verified.
- Pi provider credentials → free nvidia fallback runs, but the model identity must be recorded.

## Validation Architecture

### Test Framework

| Property | Value |
|---|---|
| Framework | Node.js built-in `node:test` + `node:assert/strict` (Node 24.13.1) |
| Config file | none — `tsconfig.json` compiles `test/**/*.ts` to `dist/test/` |
| Quick run command | `node scripts/run-tests.mjs --files dist/test/project-plan.test.js` |
| Full suite command | `npm test` (= `npm run build && node scripts/run-tests.mjs`) |

Never invoke `node --test dist/test/*.test.js` directly. `scripts/run-tests.mjs` exists because
npm's lifecycle injection and the machine-scope `npm_config_prefix` on the windows runner image
made the two entrypoints disagree, and a bare shell glob that expands to nothing exits 0.
[VERIFIED: `scripts/run-tests.mjs` header comment, read this session] Baselines carried forward
from Phase 1: `npm test` = 208 tests, routed `Safety boundary suites` = 131 tests, `npm run
build:check` = `56 inputs, 106 outputs`.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|---|---|---|---|---|
| CAPA-04 | `sync --apply` writes exactly the approved plan's targets and receipts in one transaction | unit | `node scripts/run-tests.mjs --files dist/test/project-pack-sync.test.js` | ❌ Wave 0 |
| CAPA-04 | A failure mid-apply rolls back and leaves **zero** receipts (failpoint-driven) | unit | same file | ❌ Wave 0 |
| CAPA-04 | Refuses with a runnable `approve` command when `.alpha-aos/plan.json` is absent | unit | same file | ❌ Wave 0 |
| CAPA-04 | Refuses through the Phase 2 D-13 drift path when a bound input moved | unit | `dist/test/project-plan.test.js` (extend) | ✅ exists |
| CAPA-05 | Discovery oracle parser: codex `<skills_instructions>` → resolved absolute paths | unit | `dist/test/capability-oracle.test.js` | ❌ Wave 0 |
| CAPA-05 | Discovery oracle parser: pi `get_commands` → `sourceInfo.scope` | unit | same file | ❌ Wave 0 |
| CAPA-05 | Discovery oracle parser: claude `system/init` → `skills[]` + `mcp_servers[]` | unit | same file | ❌ Wave 0 |
| CAPA-05 | pi RPC framing: a JSON string containing `U+2028` does not split a record | unit | same file | ❌ Wave 0 |
| CAPA-06 | Paired positive/negative renders INCOMPLETE when the negative is missing | unit | `dist/test/capability-ledger.test.js` | ❌ Wave 0 |
| CAPA-06 | The negative-control directory has no ancestor `.agents/skills` (asserted, not assumed) | integration | same file | ❌ Wave 0 |
| CAPA-07 | The three axes are independently settable and JSON exposes all three | unit | `dist/test/capability-ledger.test.js` | ❌ Wave 0 |
| CAPA-07 | Ledger demotes on skill-hash / MCP-version / evidence-hash change; **not** on a harness patch bump; **does** on a minor bump | unit | same file | ❌ Wave 0 |
| CAPA-07 | Harness version parsers: the four observed strings → minor keys; an unparseable string → `unverified` | unit | same file | ❌ Wave 0 |
| CAPA-07 | `blocked` renders the variable name and never a value (redaction seam) | unit | `dist/test/redaction.test.js` (extend) | ✅ exists |
| CAPA-08 | Six synthetic fixture repositories select their pack; six near-miss negatives do not | integration | `dist/test/project-plan.test.js` (extend) | ✅ exists |
| CAPA-08 | Every pack skill source directory contains exactly one file (Pitfall 7 guard) | unit | `dist/test/pack-catalog.test.js` (extend) | ✅ exists |
| CAPA-08 | Scientific pack: directory name and frontmatter name are both recorded, per harness | unit | `dist/test/capability-ledger.test.js` | ❌ Wave 0 |
| CAPA-01/02 | All three pinned MCP servers start through `alpha-aos mcp-proxy` and answer `tools/list` | integration | `dist/test/mcp-proxy.test.js` (extend) | ✅ exists — **this is the Pitfall 8 regression test** |
| CAPA-02 | The allowlist and the routing contract agree; a denied tool produces the stable policy refusal | unit | `dist/test/mcp-proxy.test.js` (extend) | ✅ exists |
| CAPA-03 | `.planning/` is byte-identical across a memory handoff round trip | integration | `dist/test/capability-ledger.test.js` | ❌ Wave 0 |
| CAPA-01/02/05 | Live invocation canary on a credentialed real host | manual-only | `alpha-aos doctor --canary` (new) | ❌ Wave 0 — **manual by necessity**: needs an Anthropic credential and costs ~$0.11–0.14 per run; CI has neither |

### Sampling Rate

- **Per task commit:** `node scripts/run-tests.mjs --files <the touched suites>`
- **Per wave merge:** `npm test` — must report 208 + the wave's additions, `fail 0`
- **Phase gate:** full suite green on all three OS legs **in one run id** (the Phase 1 closing
  rule), plus one recorded real-host canary transcript per claimed surface

### Wave 0 Gaps

- [ ] `test/project-pack-sync.test.js` — CAPA-04 writer, rollback, refusals
- [ ] `test/capability-oracle.test.js` — three oracle parsers + the U+2028 framing case
- [ ] `test/capability-ledger.test.js` — axes, demotion, paired evidence, version parsing, CAPA-03
- [ ] `schemas/capability-ledger.schema.json` + its validation test
- [ ] Fixture helper for the six CAPA-08 synthetic repositories and their near-miss twins
- [ ] Recorded oracle fixtures (captured JSON from this session) so parser tests run offline
- [ ] Extend `test/mcp-proxy.test.js` with the three-server startup regression (Pitfall 8)
- [ ] Framework install: **none needed** — `node:test` is already the runner

## Security Domain

`security_enforcement: true`, `security_asvs_level: 1` [VERIFIED: .planning/config.json, read
this session].

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---|---|---|
| V1 Encoding & Sanitization | yes | All canary/harness output leaves through `src/core/redaction.ts`; byte budgets are measured on UTF-8 with code-point-safe cuts (Phase 2 02-12) |
| V2 Validation & Business Logic | yes | Closed-world `ajv` schemas for the new ledger; unregistered extensions stay inert (Phase 1 D-08/D-09) |
| V3 Web Frontend Security | no | No web surface |
| V4 API & Web Service | no | No network service; MCP is stdio, local, child-process only |
| V5 File Handling | **yes — primary** | `applyFileTransaction` with proven path boundaries; `provePathBoundary`; no write outside declared `allowedRoots` |
| V6 Authentication | no | alpha-AOS authenticates nothing; harness auth stays user-managed |
| V7 Session Management | no | — |
| V8 Authorization | yes (local) | The approved-plan digest is the authorization token for a mutation; `sync --apply` accepts only what `approve` produced |
| V9 Self-contained Tokens | no | — |
| V10 OAuth / OIDC | no | Credentials are passed by *name* to child processes; alpha-AOS never handles a token value |
| V11 Cryptography | yes | sha256 only, via `node:crypto`. Never hand-roll. Used for source/target/plan/evidence digests |
| V12 Secure Communication | partial | stdio to local children; no TLS surface of its own. `NODE_EXTRA_CA_CERTS` is already in the probe environment allowlist |
| V13 Configuration | **yes — primary** | Environment allowlists per child (SAFE-06); `PLATFORM_FLOOR_ENVIRONMENT` documented as the floor no allowlist can suppress |
| V14 Data Protection | yes | Secrets constraint: names in plans/journals/diagnostics, values never |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---|---|---|
| A repository steering its own pack selection or write targets | Tampering / Elevation | Phase 2 already refuses an alias inside the canonical root unconditionally; targets derive from `PROJECT_SKILL_ROOTS`, never from repository content |
| A materialized `SKILL.md` is prompt-injection content the model then follows | Tampering | Exact-hash source from the pinned lock is the whole control — this is why CAPA-04 says "exact-hash" and why `renderEccSkill` is the identity. A pack skill whose hash is not in the lock is refused, never planned sourceless |
| Credential leaking into a canary transcript, ledger, or CI log | Information Disclosure | Every rendering through the redaction seam; bounded, fingerprinted excerpts; `blocked` names the variable only. **Specific hazard:** Firecrawl's key-bearing remote URL is itself a secret [CITED: `docs/alpha-vibe-stack-codex.md` §4.3] |
| An MCP child inheriting the ambient environment | Information Disclosure | `upstreamEnvironmentPolicy` declares names explicitly — but see Pitfall 8: the correct repair *narrows what npm decides* rather than widening the passthrough |
| A canary child outliving its deadline and holding a project path open | Denial of Service | `src/core/process.ts` bounded sessions with proven descendant termination (Phase 1 01-27, three legs green) |
| An observation proxy silently becoming the everyday path | Elevation of Privilege | D-02 makes the proxy canary-only; the isolated runtime is the enforcement, and a test should assert the user's real config is untouched by a canary run |
| A crash between writing skill bytes and writing receipts, leaving unowned files | Repudiation | D-06 — one transaction, journaled, hash-checked, rollback on throw |
| Redacted path segments producing an unrunnable copy-paste command | (usability, but security-adjacent) | Known open item from 02-VERIFICATION; canary outputs will hit it more often because temp/CI paths carry UUIDs |

## Project Constraints (from AGENTS.md and PROJECT.md)

`./CLAUDE.md` does not exist; `./AGENTS.md` is the project instruction file (GSD-managed) and
`.planning/config.json` sets `claude_md_path: "./.claude/CLAUDE.md"`, which is also absent.
Directives extracted from `AGENTS.md` and `PROJECT.md`:

**Workflow**

- Start work through a GSD command; no direct repo edits outside a GSD workflow.
- GSD Core `standard` is the only `.planning/` writer; Hermes stays worker-only.

**Code style (enforced by `npm run check`, `tsc --noEmit`)**

- Preserve `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
  `forceConsistentCasingInFileNames`, ES module settings.
- Double-quoted strings, semicolons, trailing commas in multiline constructs, two-space indent.
- Explicit relative imports with `.js` extensions; no path aliases.
- `camelCase` functions with action names; `PascalCase` types; string-literal unions for finite
  identifiers; `interface` for object contracts.
- Comments are sparse — only for non-obvious policy or safety constraints.

**Error handling**

- Validate at the boundary, then `throw new Error(...)` naming the operation, identifier and
  often the offending value.
- Assertion-style guards fail closed before any filesystem or external operation.
- Propagate async failures; optional cleanup only via explicitly scoped `.catch(() => undefined)`.
- Expected diagnostics are typed values (`DoctorFinding`), not exceptions.

**Architecture**

- Mutation commands are dry-run by default; `--apply` selects the apply function.
- All owned writes route through `applyFileTransaction` with explicit `allowedRoots`.
- Do not patch third-party managed files; render only native fragments or alpha-AOS-owned files.
- Harness-specific rules live in adapters, not in generic callers.
- `sealed` fails closed and must never silently use process isolation.
- Never print secrets or credential values.

**Anti-patterns explicitly recorded**

- Applying an unverified candidate lock (`catalog/candidate.lock.json` must never reach an
  end-user apply path).
- Directly mutating harness files.

**Phase-specific constraints inherited from earlier phases**

- Previews must not spawn package managers and must persist nothing (SAFE-01). A canary is not a
  preview and must not run on the plan path.
- Adding a harness to `schemas/receipt.schema.json`'s enum without first adding it to
  `PROJECT_SKILL_ROOTS` reopens a crash — a test asserts the two tables agree.
- Support classifications are recorded from documented evidence only and never upgraded on the
  strength of a plausible filename.

## Sources

### Primary (HIGH confidence — live probes on this host, 2026-09-10)

- `codex debug prompt-input` inside and outside a fixture project — skill roots table, per-skill
  file paths, sidecar tolerance, name/directory resolution
- `pi --mode rpc` + `{"type":"get_commands"}` inside and outside — `sourceInfo.scope`, absolute
  paths, project/user split
- `claude -p --output-format stream-json --verbose` × 3 runs — `init` keys, `skills`,
  `mcp_servers`, `result.total_cost_usd`; empty-prompt failure mode
- `claude mcp list` / `claude mcp get <name>` — connection oracle; the firecrawl failure
- Direct stdio MCP handshakes against `@upstash/context7-mcp@4.0.4`, `exa-mcp-server@3.4.1`,
  `firecrawl-mcp@3.24.0` — `tools/list` and a real `resolve-library-id` call
- npx-under-declared-environment falsification probe — the Pitfall 8 root cause, output pasted
- sha256 comparison of all 22 installed `ecc-universal@2.2.0` skill files against
  `catalog/stack.lock.json`
- Frontmatter parse of all 22 skill files — the four name/directory mismatches
- `ecc memory doctor --json`, `ecc memory search --json`, `ecc memory --help`
- `pi auth check --provider {google,anthropic,openai} --json`
- `--help` / `--version` for claude, codex, pi, hermes; `codex doctor`; `claude doctor`
- Repository files read this session: `src/core/project-plan.ts` (:570, :573, :584, :593-597,
  :652-676, :1910), `src/types.ts` (:401), `src/core/transaction.ts` (:119-131, `FileWriteOperation`),
  `src/core/process.ts` (:95-116, :753-762, :823-839), `src/core/mcp-proxy.ts` (:17-33, :165-215),
  `src/core/ecc-skills.ts` (:52-58), `src/cli.ts` (:575-660), `schemas/receipt.schema.json`,
  `catalog/stack.yaml`, `catalog/stack.lock.json`, all seven `catalog/packs/*.yaml`,
  `package.json`, `scripts/run-tests.mjs`, `.planning/config.json`

### Secondary (MEDIUM confidence — vendor documentation shipped with the installed package)

- pi 0.85.1 `docs/skills.md` — skill locations, trust gate, name/directory lenience, validation,
  collision rule
- pi 0.85.1 `docs/rpc.md` — `get_commands`, framing (`\n` only; `readline` is non-compliant)
- pi 0.85.1 `docs/json.md`, `docs/security.md`, `docs/sdk.md`
- `hermes skills --help`, `hermes skills trust --help` — repo-local skill roots
- ecc-universal 2.2.0 `skills/{documentation-lookup,deep-research,unified-memory,inherit-legacy-style,security-review}/SKILL.md`
- `docs/alpha-vibe-stack-codex.md` §4.2, §4.3, §4.4, §5.1, §5.2 — routing contract, connection
  contract, pack table, skill layout requirement

### Tertiary (LOW confidence — absence-of-evidence, flagged in the Assumptions Log)

- Antigravity project skill root: inferred absent from directory listings, a binary scan of
  `app.asar`, and no CLI on PATH. See A4 — this is not a positive falsification.

## Metadata

**Confidence breakdown:**

- Standard stack: **HIGH** — no new packages; every pinned artifact verified by live handshake or
  hash comparison
- Discovery oracles (Pattern 2/3): **HIGH** — six live runs, paired positive/negative on all
  three harnesses, outputs pasted
- Pitfall 8 root cause: **HIGH** — reproduced, then falsified with a three-arm environment probe
  whose failing output is pasted; the *recommended repair* is MEDIUM (A5)
- Pitfall 1 / Pitfall 2 (tool-name drift and skill-name divergence): **HIGH** — measured against
  the running servers and the three harnesses directly
- Antigravity classification: **LOW** — absence of evidence only (A4)
- Cross-OS generalization of every live finding: **LOW–MEDIUM** — everything here is Windows 11;
  Phase 7 owns the matrix (A1)
- Pi invocation-canary interpretability: **MEDIUM** — pi runs, but on an unconfigured free
  fallback model (A7)

**Research date:** 2026-09-10
**Valid until:** 2026-09-24 (14 days). Claude Code auto-updates (2.1.252 in the discussion →
2.1.267 today) and codex already advertises 0.154.0; the harness-version-dependent findings —
oracle command shapes, output keys, skill-name resolution — need re-probing before any canary
transcript is treated as current.
