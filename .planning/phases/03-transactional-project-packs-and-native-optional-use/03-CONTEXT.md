# Phase 3: Transactional Project Packs and Native Optional Use - Context

**Gathered:** 2026-09-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Open `alpha-aos project sync --apply` so the packs Phase 2 already selects, explains, and
approves are actually written into one project's harness roots — transactionally, with
receipts, and reversibly. Then prove that optional capabilities are *used*, not merely
present: a harness must natively select a capability from task intent, without being told
its name, and complete a real call.

This phase owns CAPA-01 … CAPA-08. It is the phase where `ADAPTER_SUPPORT_EVIDENCE` in
`src/core/project-plan.ts` stops being a table of promises — its own comments say project
pack delivery "stays unsupported until a canary proves otherwise", and this phase builds
that canary.

Explicitly NOT this phase:

- Mandatory, fail-closed GSD gates (Phase 4, GATE-01…05). A capability may be reported
  `blocked` here; nothing here blocks a lifecycle transition.
- Directory-tree opt-out and preload isolation (Phase 5, OPTO-01…09).
- Uninstall, rollback, doctor, and update flows for the whole managed stack (Phase 6).
- The full three-OS × every-harness/surface support matrix (Phase 7, REL-02). This phase
  produces the evidence *mechanism* and one proven surface; Phase 7 owns the published matrix.

Phase 2 left the read and removal halves already built — `reconcileProjectState`,
`readPackReceiptsStrict`, `planPackRemoval`, `applyPackRemoval` all exist and work. The
only missing writer is the one that produces receipts in the first place.

</domain>

<decisions>
## Implementation Decisions

### Invocation Evidence

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

### Materialization Reach

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

### Surface Coverage and Capability State

- **D-09:** (D-09 is superseded by D-17 on 2026-09-14). Formerly: The phase pass bar is **claude must actually pass** CAPA-01, CAPA-02, CAPA-04,
  CAPA-05, and CAPA-06. `catalog/stack.yaml` already names claude as `policy.canaryHarness`.
  codex and pi are driven through the same runner and **auto-promote on success**, but a
  failure is recorded with its reason and does not block the phase. antigravity and hermes
  stay `unsupported`. Preserved for audit.
- **D-17:** (D-17 is superseded by D-18 on 2026-09-22). Formerly: On 2026-09-14, user decision established that Claude Code is outside active v0.1.0 development, support, verification, and release-gate scope; Claude implementation and prior verification evidence remain compatibility history only.
  The operative pass-bar rules are rebaselined around active non-Claude targets:
  - **Codex is the required active anchor** for CAPA-01, CAPA-02, and CAPA-05 because the repository already has a retained Codex CAPA-01 proof and a bounded Codex canary isolation path.
  - **CAPA-03 must use two distinct active non-Claude harnesses** (two-harness non-Claude handoff), preferring Hermes→Codex only when both entrypoints and the Codex receiving runtime are proven.
  - **Antigravity, Pi, and Hermes** promote only from their own deterministic/native evidence and otherwise remain visibly `unverified` or `unsupported`.
  - **Stable equal-proof ordering** is defined as an offline deterministic fixture obligation rather than a requirement for two paid live surfaces.
  Preserved for audit.
- **D-18:** On 2026-09-22, user decision established that the Claude-account verification
  blocker underlying D-17 is resolved — a working Claude Code account now exists and is the
  active session driving this repository. D-17 is superseded and **Claude Code is reinstated
  into the active v0.1.0 harness scope** on equal footing with Codex, Antigravity, Pi, and
  Hermes. Reinstating the scope claim is not itself evidence: Claude remains subject to the
  same D-10 ceiling/ledger split and D-12 `blocked`/`unverified` distinction as every other
  harness, and promotion past `unverified`/RESIDUE to `supported`/PROVEN still requires its
  own real invocation-receipt evidence gathered the same way D-01 requires for any harness.
  The operative pass-bar rules restate as:
  - **Codex remains the currently proven anchor** for CAPA-01, CAPA-02, and CAPA-05 — not
    because Claude is excluded, but because Codex is the one surface with retained real
    evidence today. Claude may become an equally valid anchor once its own real evidence
    exists.
  - **CAPA-03's "two distinct active harnesses" requirement drops its "non-Claude"
    qualifier** — any two distinct active harnesses, including Claude, may satisfy it once
    both sides carry real evidence. The already-closed G-03-2 evidence (Hermes → Codex)
    remains valid and is not reopened by this decision.
  - **Antigravity, Pi, Hermes, and now Claude** all promote only from their own
    deterministic/native evidence and otherwise remain visibly `unverified` or
    `unsupported` — no special path for Claude.
  - **Stable equal-proof ordering** stays the D-17 offline deterministic fixture obligation,
    unaffected by this decision.

  **Not implemented by this decision (routed as follow-up):** this quick task does not
  implement (a) removing the `evaluateMatrixCell` `harnessId === "claude"` RESIDUE hardcode
  and the `Exclude<HarnessId, "claude">` type exclusion in `src/core/support-matrix.ts`,
  (b) restoring a Claude `canaryHarness` option and a Claude canary run path in
  `catalog/stack.yaml` / `catalog/canaries.yaml`, or (c) actually executing a real Claude
  Code canary invocation to generate genuine PROVEN-tier evidence. `src/core/support-matrix.ts`
  and the real-host canary ledger are owned by Phase 7 (REL-02), which is already marked
  `passed`/complete, so the correct next step is `/gsd-verify-work 7` to formally register
  the now-stale "every claimed harness/surface has current real-host evidence" truth (Claude
  re-entered the claimed set with none), followed by `$gsd-plan-phase 7 --gaps`. The named
  alternate route is `$gsd-plan-phase 3 --gaps`, if that verification instead finds the work
  better scoped to Phase 3's CAPA-01/02/03/05 canary mechanics. No gap ID is invented here.
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

### Pack Lifecycle and Absence Proof

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
  run for all six; one representative pack is proven through the Codex canary under D-17.
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

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Product and Phase Contract
- `.planning/PROJECT.md` — Note especially: the hybrid capability activation model; "Keep
  alpha-AOS as a control plane, not an invocation proxy for every tool call" (binds D-02 and
  D-16); the Validation constraint ("Native discovery plus a meaningful read-only invocation
  is required — configuration-file presence alone is insufficient", binds D-01 and D-14); the
  Secrets constraint (binds D-12); and the Safety constraint's no-automatic-deletion rule
  (binds D-13).
- `.planning/REQUIREMENTS.md` — CAPA-01 … CAPA-08 verbatim, plus the GATE/OPTO/LIFE/REL
  boundaries this phase must not absorb.
- `.planning/ROADMAP.md` §Phase 3 — Goal, deliverables, the five success criteria, and the
  planning note requiring targeted research and live probes.
- `.planning/phases/02-evidence-bound-project-planning/02-CONTEXT.md` — D-10 (`.alpha-aos/`
  write boundary), D-11 (conflict, never overwrite), D-12 (plan/approve/apply split — the
  contract D-08 completes), D-13 (drift refusal), D-14/D-15 (`STALE`, no auto-deletion), and
  its `<open_questions>` #3, which handed `BROWNFIELD_INIT`'s lifecycle to this phase. Its
  open question #1 (do the pack skills exist in `ecc-universal@2.2.0`) is now **settled** —
  `catalog/stack.lock.json` pins `sourceSha256` for all 22 skills.
- `.planning/phases/01-safe-operation-boundary/01-CONTEXT.md` — D-01 (fail closed when safety
  is unprovable), D-04/D-05 (one mutating writer per state root — the canary runner must not
  fight it), D-08/D-09 (closed-world schemas, inert unregistered extensions — binds D-05's
  `kind` seam), D-12/D-13/D-14 (subprocess output is bounded, redacted, and fingerprinted —
  binds every canary that captures harness output).

### Design Source (authoritative for capability semantics)
- `docs/alpha-vibe-stack-codex.md` §4.2 — The dedup routing contract Context7 → Exa →
  Firecrawl that CAPA-02 must prove, including the "an already-known URL goes straight to
  Firecrawl" case. §4.3 — "설치 완료 판정은 설정 파일 존재가 아니라 각 하네스에서 `list tools`와
  최소 1회 read-only 호출이 성공하는지로 한다" and the `connected + 0 tools` = failure rule.
  §5.1 — The three global capabilities, the `ecc-pack-router` adapter concept, and the
  `<skill-root>/<name>/SKILL.md` layout requirement. §5.2 — The 15-pack table with detection
  evidence and supplied skills, and the `AGENTS.md`-alone rule. §5.3 — Third-party ECC
  `SKILL.md` bytes must not be modified (binds D-07). §5.4 — The `--target claude-project`
  install shape this phase implements. §9.1 — `/context`, `/skills`, `/mcp`, `claude doctor`
  and the `claude --safe-mode` control group; relevant to D-14's negative control.
- `docs/alpha-vibe-stack-claude.md` — Parallel statement of the same semantics; consult when
  the two documents disagree.

### Existing Contracts to Extend
- `schemas/receipt.schema.json` — The receipt envelope this phase **writes** for the first
  time. Its `harness` enum is deliberately narrowed to `claude | codex | pi` and its own
  description warns that adding a harness here without adding it to `PROJECT_SKILL_ROOTS`
  reopens a crash. D-05's `kind` discriminator lands against this file.
- `schemas/approved-plan.schema.json` — The artifact `sync --apply` consumes under D-08.
- `schemas/pack-catalog.schema.json` — Where `lifecycle` (D-13) and `selectionPolicy` must be
  reconciled; `lifecycle: one-shot-remove-after-output` currently validates against nothing.
- `schemas/evidence.schema.json` — The evidence envelope whose hash binds a proof under D-04.
- `catalog/stack.lock.json` — `components.ecc.sourceSha256` pins all 22 skills;
  `targetSha256` records per-harness render hashes for the three global skills only.
- `catalog/stack.yaml` — `policy.canaryHarness: claude` (binds D-09),
  `policy.requireCanary: true`, `harnesses.pi.eccStrategy: bridge`,
  `harnesses.hermes.gsdStrategy: worker-only` (binds D-10's ceiling).
- `catalog/packs/*.yaml` — 7 files, 15 packs, every one declaring `skills: [...]` only. The
  two exceptional fields are `brownfield.yaml`'s `lifecycle` and `security.yaml`'s
  `selectionPolicy: prefer-native-single-engine` (the latter is Phase 4's).

### Existing Code
- `src/core/project-plan.ts` — `PROJECT_SKILL_ROOTS` (:593), `ADAPTER_SUPPORT_EVIDENCE` and
  `classifyAdapterSupport` (:652), `resolvePackSource` (:676), `PLAN_RENDERER_ID` (:584),
  `PROJECT_RECEIPT_DIRECTORY` (:570), `inspectTargetPreState`, `buildSafeInverse`,
  `readPackReceiptsStrict` (:2016), `reconcileProjectState` (:2203), `classifyInstalledPack`
  (:2302), `planPackRemoval` (:2628), `applyPackRemoval` (:2708). The removal and
  reconciliation halves are already built against receipts nothing writes yet.
- `src/cli.ts:623` — `if (subcommand === "sync" && hasFlag(args, "--apply")) throw` — the
  single line this phase replaces, and the surrounding `approve` / `status` branches D-08
  must stay consistent with.
- `src/core/mcp-proxy.ts` — Already starts Firecrawl over stdio and exposes exactly four
  tools. The existing seam D-01's observation extends.
- `src/core/mcp.ts` — Native MCP rendering per harness (`mcp_servers` for codex, `mcpServers`
  elsewhere, :398), credential names only, never values.
- `src/core/ecc-skills.ts` — `planEccSkillSync`/`applyEccSkillSync`, `renderEccSkill`, and the
  `EccSkillOperationSource` shape that binds source bytes and hash at review time.
- `src/core/isolation.ts` — `discoverSkillPaths` (:162), project MCP discovery at
  `.mcp.json` / `.agents/mcp_config.json` / `.pi/settings.json` (:197), `createIsolationPlan`,
  `syncIsolationRuntime`, and the canonical-project-path hash used as project id.
- `src/adapters/isolation.ts` — Per-harness launch spec construction, including
  `--mcp-config` for claude (:47). The natural home for D-02's canary runtime.
- `src/core/transaction.ts` — `applyFileTransaction` with explicit allowed roots, snapshots,
  hash-checked journals, and drift-safe rollback. D-06's single transaction is this.
- `src/core/process.ts` — Shell-free, bounded, timeout-aware process adapter with an explicit
  environment allowlist. Every canary launch goes through it.
- `.planning/codebase/ARCHITECTURE.md` — Plan/apply separation, adapter boundaries, the
  managed-file-transaction abstraction, and the two recorded anti-patterns.
- `.planning/codebase/INTEGRATIONS.md` — Exact MCP packages and versions, credential variable
  names, and the optional path-override environment variables.
- `.planning/codebase/CONCERNS.md` — Records `project sync --apply` as a deliberate stub and
  the missing dry-run diff model; this phase closes the apply half.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/core/transaction.ts` (`applyFileTransaction`): supplies D-06's all-or-nothing
  guarantee, including the snapshot that makes a materialized pack reversible with
  `alpha-aos rollback`. Do not open a second write path for receipts.
- `src/core/ecc-skills.ts`: already binds source bytes and hash at review time and accepts a
  caller-supplied `MutationSession`. The pack writer should be a sibling of this, not a fork
  of it — note the deliberate separation `resolvePackSource` documents (consulting the global
  skill list for a pack skill is one step from installing all of them everywhere).
- `src/core/mcp-proxy.ts`: an already-working bounded stdio front for one MCP server. D-01's
  observation is an extension of this shape, not a new mechanism.
- `src/adapters/isolation.ts` + `src/core/isolation.ts`: isolated configuration roots,
  per-harness launch specs, and an environment allowlist. This is how D-02 runs a canary
  against proxied servers without touching the user's real config, and how D-14 runs the same
  canary somewhere that is not the project.
- `src/core/process.ts`: bounded capture, timeouts, no shell, explicit environment names —
  required for any canary that launches a harness, and the reason raw harness output cannot
  leak into the ledger.
- `src/cli.ts` `repair` branch (:587) and the `approve` branch: the established
  print-a-digest / require-it-back pattern D-08 follows.

### Established Patterns
- Every mutating command splits plan from apply and defaults to dry-run.
- Managed writes go through `applyFileTransaction` with explicit allowed roots, snapshots, and
  hash-checked journals — which is what makes "no automatic deletion" (D-13) enforceable
  rather than aspirational.
- Tests use `node:test` against real temporary files with behaviour-focused negative cases and
  no mocking framework — the pattern D-15's synthetic fixtures follow.
- Previews must not spawn package managers (plan 01-21 removed an `npm root --global` probe
  that wrote into the user's home during a preview). A canary is not a preview, but it must
  not run on the plan path either.
- Support classifications are recorded from documented evidence only and never upgraded on the
  strength of a plausible filename — the discipline D-10 formalises into a ceiling.
- Stable lock is authoritative; `catalog/candidate.lock.json` must never reach an end-user
  apply path.

### Integration Points
- `src/cli.ts:623` loses the `sync --apply` refusal and gains the artifact-driven apply (D-08);
  a new verb or flag is needed for running canaries and reading the ledger.
- `schemas/receipt.schema.json` gains the `kind` discriminator (D-05); `schemas/` gains a
  ledger schema (D-03).
- `ADAPTER_SUPPORT_EVIDENCE` splits into a structural ceiling plus a ledger-resolved state
  (D-10); `classifyAdapterSupport` becomes the resolver rather than the source.
- `reconcileProjectState` gains the native-use axis alongside the existing `PackState` (D-11)
  without changing `PackState` itself.
- `catalog/packs/brownfield.yaml`'s `lifecycle` field needs a home in
  `schemas/pack-catalog.schema.json` before D-13 can act on it.
- `.planning/codebase/CONCERNS.md`'s "Transactional project sync" entry is closed by this phase.

</code_context>

<specifics>
## Specific Ideas

- The `blocked` report must read as an actionable state, naming the credential variable and
  the next step and never the value — e.g. "`EXA_API_KEY` is not set, so the Exa leg of the
  research canary could not complete." A user who reads it should know exactly what to do.
- The positive and negative canaries are **one evidence unit**. The ledger should make an
  unpaired positive visibly incomplete rather than letting it read as a pass, because a
  positive alone is exactly the claim CAPA-06 says is not enough.
- The one-shot report should read as a state with an offer, following the shape Phase 2 used
  for `STALE`: "`BROWNFIELD_INIT` — one-shot, invoked on <date>, removal plan ready" plus the
  runnable approve command. It must not read as a demand or imply anything was already deleted.
- A canary prompt is judged by whether a reasonable person would call it an ordinary request.
  If it has to hint at the tool to work, that is a finding about discovery, not a prompt to
  reword until it passes.

</specifics>

<deferred>
## Deferred Ideas

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

</deferred>

<open_questions>
## Verification Required Before Planning

These are facts this discussion could not establish and the researcher must settle. D-01,
D-07, D-09, and D-10 all depend on them.

1. **Does each harness have a non-interactive entrypoint suitable for a scripted canary, and
   what is it per surface?** claude, codex, and pi are the ones that matter for D-09. If a
   surface has none, D-01's mechanism cannot reach it and it stays `unverified` — that is an
   acceptable outcome, but it must be established rather than assumed.
2. **Does a harness tolerate an unexpected sidecar file inside a skill directory?** D-07 gates
   on this per surface. A harness that warns, or that misreads the sidecar as a skill, means
   receipts only for that surface.
3. **Is project-scope skill discovery documented for codex `.agents/skills` and pi
   `.pi/skills`?** Phase 2 recorded both as `unverified` precisely because it could not find
   documented discovery. This determines whether D-09's auto-promotion has anything to promote.
4. **Can the observation proxy front Context7 and Exa the way it already fronts Firecrawl, and
   what is a "meaningful read-only call" for each?** CAPA-01 needs a Context7 call that is
   version-sensitive; CAPA-02 needs Exa discovery followed by bounded Firecrawl extraction.
5. **How does each harness's version string map to a minor boundary?** D-04's demotion rule
   needs a per-harness answer; not every harness uses semver.
6. **Is Antigravity GUI / CLI / IDE one surface or three for ledger keying, and do Codex CLI
   and its IDE extension share enough state that one proof covers both?** §4.4 of the design
   doc warns against assuming shared configuration implies shared behaviour.
7. **Does `inherit-legacy-style` produce a detectable "output" that D-13 can key on**, or is
   "invoked once" the only observable signal? The lifecycle name promises more than the ledger
   may be able to see.
8. **What does `ecc-universal@2.2.0` actually ship for each of the 19 pack skills** — the lock
   pins hashes for all of them, but the render path (`renderEccSkill`) has only been exercised
   for the three global skills, and `targetSha256` records per-harness hashes for those three
   only.

</open_questions>

---

*Phase: 03-transactional-project-packs-and-native-optional-use*
*Context gathered: 2026-09-10*
