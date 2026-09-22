# Phase 3: Transactional Project Packs and Native Optional Use - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-10
**Phase:** 3-transactional-project-packs-and-native-optional-use
**Areas discussed:** Invocation evidence, sync --apply reach, Surface coverage, Pack lifecycle and absence proof

---

## Invocation Evidence

### Q1 — Primary source of proof that a harness natively selected and actually invoked a capability

| Option | Description | Selected |
|--------|-------------|----------|
| Non-interactive run + MCP-side observation | alpha-AOS drives the harness with a prompt that never names the tool; the proxy records the real call. Model output text is not evidence. | ✓ |
| Harness log / transcript parsing | Read each harness's tool-use log or session transcript. No proxy needed, but binds to per-harness log formats that can change silently. | |
| Guided canary + attestation ledger | alpha-AOS prints the prompt and pass criteria; an operator runs it and records the result. Covers GUI surfaces but trust rests on a person. | |

**User's choice:** Non-interactive run + MCP-side observation
**Notes:** Grounded in PROJECT.md's determinism constraint and the existing `src/core/mcp-proxy.ts` seam. → D-01

### Q2 — When is the observation proxy in the path?

| Option | Description | Selected |
|--------|-------------|----------|
| Canary runs only | Everyday config stays direct to upstream; the proxy appears only in an isolated canary runtime. | ✓ |
| Always proxied | All three MCP servers behind the alpha-AOS proxy permanently. Continuous observation, but every harness's research path depends on an alpha-AOS process. | |
| Per-harness policy | Proxy only harnesses that cannot otherwise be observed. | |

**User's choice:** Canary runs only
**Notes:** Direct collision was flagged between "always proxied" and the PROJECT.md Key Decision "Keep alpha-AOS as a control plane, not an invocation proxy for every tool call". → D-02

### Q3 — Where does the invocation evidence ledger live?

| Option | Description | Selected |
|--------|-------------|----------|
| Single ledger in the user state root | All evidence under `~/.alpha-aos/`, project pack evidence keyed by project id. Host facts are never committed. | ✓ |
| Project `.alpha-aos/` | Follows the Phase 2 D-10 precedent; team-visible and CI-readable, but host facts end up in a shared file. | |
| Split by scope | Global capabilities in the user state root, pack evidence in the project. | |

**User's choice:** Single ledger in the user state root
**Notes:** Deciding argument — evidence from one machine committed to a repository becomes false on a colleague's machine. → D-03

### Q4 — What is a proof bound to, and what demotes it?

| Option | Description | Selected |
|--------|-------------|----------|
| Inputs exact, harness at minor | Skill hash / MCP version / evidence hash bind exactly; harness version demotes only at a minor boundary. Exact proven version still recorded. | ✓ |
| Everything exact-version | Any harness patch bump demotes to `unverified`. Maximally strict, but auto-updating harnesses would keep the ledger permanently red. | |
| Never demote, report delta only | Record the proven version and show "proven on vX / now vY", leaving judgement to consumers. In tension with CAPA-07's ask that alpha-AOS distinguish states itself. | |

**User's choice:** Inputs exact, harness at minor
**Notes:** → D-04

---

## sync --apply Reach

### Q1 — How far does this phase's apply write?

| Option | Description | Selected |
|--------|-------------|----------|
| Skills only + `kind` seam | Write only wholly-owned SKILL.md files; add a `kind` discriminator to plan/receipt targets but implement only `skill`. Report project-scope MCP/policy as unsupported. | ✓ |
| Skills only, fully locked | No discriminator; keep the receipt schema exactly as it is. Simplest, but a later MCP target would be a breaking schema change. | |
| Open MCP now | Express item-level ownership inside shared files and reuse the mcp.ts merge renderer. Satisfies the ROADMAP Delivers sentence literally. | |

**User's choice:** Skills only + `kind` seam
**Notes:** Established during the discussion by inspecting `catalog/packs/*.yaml` — **zero of the 15 declared packs request an MCP server or a policy**; every pack declares only `skills: [...]`. The only exceptional fields are `brownfield.yaml`'s `lifecycle` and `security.yaml`'s `selectionPolicy` (Phase 4's). Also noted: a skill is a whole file alpha-AOS owns, so Phase 2 D-11's conflict rule and the receipt's `targetHash` fit cleanly; a project MCP entry lives inside a file the user co-owns and does not. → D-05

### Q2 — Atomicity unit on apply failure

| Option | Description | Selected |
|--------|-------------|----------|
| Whole approved plan is one transaction | Skill files and receipts written together; any failure rolls everything back and writes zero receipts. | ✓ |
| Per pack | Independent transaction and receipt per pack; partial success reported. | |
| Per harness | Transaction per harness root; a permission problem on one does not block the others. | |

**User's choice:** Whole approved plan is one transaction
**Notes:** Partial application would produce a state no approved plan describes, contradicting Phase 2 D-12. → D-06

### Q3 — Where does the user see project-local provenance?

| Option | Description | Selected |
|--------|-------------|----------|
| Sidecar only on proven surfaces | Receipts are authoritative; a sidecar beside the skill directory is added only where research proves the harness ignores an unexpected file harmlessly. | ✓ |
| Receipts only | Nothing but SKILL.md in the harness tree; `project status` renders provenance for humans. | |
| Sidecar everywhere | Sidecar in all three project skill roots. Consistent, but a harness that warns or misreads it means alpha-AOS broke harness behaviour. | |

**User's choice:** Sidecar only on proven surfaces
**Notes:** Injecting a provenance header into SKILL.md was ruled out before the question was asked — design doc §5.3 forbids modifying third-party ECC bytes and Phase 2 already locked `PLAN_RENDERER_ID = "ecc-skill/identity"`. → D-07

### Q4 — Command contract for `project sync --apply`

| Option | Description | Selected |
|--------|-------------|----------|
| Approved artifact only | Reads `.alpha-aos/plan.json` and materializes only that; refuses with a runnable approve command when absent, and through the D-13 drift path when a bound input moved. | ✓ |
| `approve --apply` also materializes | One fewer verb, but reviewing and applying become one act again, undoing what Phase 2 D-12 deliberately split. | |
| Apply by digest without an artifact | `sync --apply --plan-digest <d>`. Convenient for CI, but creates an apply path that leaves no shareable approval record. | |

**User's choice:** Approved artifact only
**Notes:** → D-08

---

## Surface Coverage

### Q1 — Which surfaces are this phase's pass bar?

| Option | Description | Selected |
|--------|-------------|----------|
| claude required, automatable surfaces attempted | Build the runner, ledger, and state model; claude must actually pass CAPA-01/02/04/05/06. codex and pi auto-promote on success; a failure is recorded, not fatal. antigravity and hermes stay unsupported. Full matrix is Phase 7's. | ✓ |
| All three skill-root harnesses required | claude, codex and pi must all pass. Leaves no reachable surface behind, but hostages the phase to an external fact Phase 2 already recorded as undocumented. | |
| claude only | Mechanism plus claude, nothing else attempted. Smallest, but leaves whether the runner generalises unknown until Phase 7. | |
| All five harnesses required | CAPA-01 read literally. Antigravity GUI has no non-interactive entrypoint, colliding with D-01, and largely duplicates Phase 7 REL-02. | |

**User's choice:** claude required, automatable surfaces attempted
**Notes:** `catalog/stack.yaml` already sets `policy.canaryHarness: claude`. Asymmetry noted during discussion: CAPA-01/02/03 target all five harnesses, but CAPA-04/05/06 can only ever target the three with project skill roots. → D-09

### Q2 — What decides promotion from `unverified` to `supported`?

| Option | Description | Selected |
|--------|-------------|----------|
| Code is the ceiling, ledger promotes | Code/catalog owns the structural product claim (antigravity and hermes pinned unsupported); the ledger owns host-proven state and may only raise within the ceiling. | ✓ |
| Ledger is the only basis | Hardcoded map becomes a default; support computed entirely from evidence. Closest to Phase 2 D-05, but one local ledger line could mark a structurally impossible surface supported. | |
| Code constant only | Promotion by code change, gated by review. Auditable, but a user who proves codex on their own machine still sees `unverified` until a release. | |

**User's choice:** Code is the ceiling, ledger promotes
**Notes:** Two kinds of fact were separated explicitly — structural (antigravity has no project skill root; hermes is `worker-only`) versus host (codex/pi are structurally possible but unproven here). → D-10

### Q3 — How are CAPA-07's eight states modelled?

| Option | Description | Selected |
|--------|-------------|----------|
| Orthogonal axes | Phase 2's `PackState` stays as the deployment axis; native-use and support axes are separate. JSON exposes axes, humans get one summary line. | ✓ |
| Staged progression plus reason | selected → deployed → discovered → invoked, plus why it stopped. Readable, but non-monotonic situations must be folded to one point. | |
| Single eight-value enum | One field, priority-collapsed. Cannot express "deployed and discovered but not yet invoked" — reproducing the misleading single state CAPA-07 forbids. | |

**User's choice:** Orthogonal axes
**Notes:** Reuses `reconcileProjectState` rather than rewriting it. → D-11

### Q4 — What is reported when a canary cannot finish for lack of a credential?

| Option | Description | Selected |
|--------|-------------|----------|
| `blocked` plus credential name | `blocked` = reason known and actionable; `unverified` = not attempted or no evidence. The report names the variable and the next action, never the value. | ✓ |
| `unverified` only | Reserve `blocked` for Phase 4 gate blocking. Shorter vocabulary, but "just add a key" and "this surface was never tried" become the same word. | |
| Design a keyless canary | Context7 and Firecrawl have limited keyless operation; Exa requires a key for authenticated calls, so CAPA-02 could not be fully covered and the proof would diverge from the real user path. | |

**User's choice:** `blocked` plus credential name
**Notes:** → D-12

---

## Pack Lifecycle and Absence Proof

### Q1 — How is the one-shot pack lifecycle implemented?

| Option | Description | Selected |
|--------|-------------|----------|
| Observe invocation, then offer a removal plan | Ledger records `invoked`; status reports one-shot, already invoked, removal plan ready. Removal still travels the approved `removalDigest`. | ✓ |
| Auto-remove after invocation | Literal `remove-after-output`. Breaks PROJECT.md's no-automatic-deletion constraint and creates an exception path. | |
| Declare only, no behaviour | Recognise `lifecycle` in the schema but act on nothing (Phase 1 D-09 inert extension). Smaller scope, but the design doc's promise stays unimplemented. | |

**User's choice:** Observe invocation, then offer a removal plan
**Notes:** Phase 2 explicitly handed this here via its `<open_questions>` #3 — `lifecycle: one-shot-remove-after-output` exists in `catalog/packs/brownfield.yaml` and in no schema or code. The invocation ledger from D-01 is what makes "after output" observable at all. → D-13

### Q2 — What proves absence outside the project?

| Option | Description | Selected |
|--------|-------------|----------|
| Same canary outside, as a negative control | Run the identical intent prompt in a temporary non-repository directory; record that the skill was not selected and the proxy saw no call. Positive and negative are one evidence unit. | ✓ |
| Static check only | Confirm the skill file is absent from global and outside-project roots. Fast and free, but proves "no file", not "not discovered". | |
| Query the harness skill list | Use a harness diagnostic such as `/skills` to confirm absence. Stronger than static, but not every harness has one. | |

**User's choice:** Same canary outside, as a negative control
**Notes:** Flagged during discussion that a static-only check is the mirror image of the "configuration-file presence is success" error PROJECT.md forbids. Phase 7 REL-03 already uses the paired-control language. → D-14

### Q3 — How are the six CAPA-08 domain repositories sourced?

| Option | Description | Selected |
|--------|-------------|----------|
| Synthetic fixture repositories | Tests build minimal evidence per domain plus near-miss negatives from the same scaffold. Deterministic, offline, portable to three-OS CI. | ✓ |
| Vendor real repositories at pinned commits | Realistic evidence distribution, but size, licensing and network problems, and friction with the REL-05 package allowlist. | |
| Synthetic fixtures plus alpha-AOS itself | Adds one real-repository sanity check (MCP_SERVER / AGENT_RUNTIME candidate), but tests would depend on the repository's own contents and self-break easily. | |

**User's choice:** Synthetic fixture repositories
**Notes:** Matches the existing `node:test` + real-temp-files, no-mocking pattern. Invocation proof runs for one representative pack per D-09, not all six. → D-15

### Q4 — How is CAPA-03's memory boundary proven?

| Option | Description | Selected |
|--------|-------------|----------|
| Handoff canary plus immutability check | Harness A writes to memory, harness B reads and works from it; `.planning/` verified byte-for-byte unchanged across the round trip. Captures positive and negative in one run. | ✓ |
| Document the boundary only | State it in skill descriptions and docs without checking. Light, but the same class of unproven claim PROJECT.md rejects. | |
| Block memory's access to `.planning/` | Strongest enforcement, but requires alpha-AOS to proxy every tool call, colliding head-on with D-02 and the Key Decision. | |

**User's choice:** Handoff canary plus immutability check
**Notes:** Phase 1 already established the byte-for-byte unchanged verification pattern. → D-16

---

## Claude's Discretion

- Wording and storage of canary prompt scripts, provided a script never names the skill or MCP tool it is meant to elicit.
- Ledger record layout, file naming, and schema id under the user state root.
- The judgement rule for CAPA-02's "an ordinary lookup does not fan out across the research stack" negative control.
- The sidecar file's name and format (D-07).
- Stable code names for the new states and refusals.
- Whether the `kind` discriminator lands in the receipt schema, the plan schema, or both.

## Deferred Ideas

- **Project-scope MCP and policy synchronization** — no declared pack requests either today; the `kind` seam keeps it additive. Revisit when a pack declares one.
- **`ecc-pack-router`** — a fourth global capability declared in design doc §5.1, present in no code. A product question for a later cycle.
- **Antigravity GUI/IDE and Hermes project-scope delivery** — pinned unsupported by D-10's ceiling; reopening needs a research finding.
- **Telemetry and the cross-harness metrics wrapper** (§9.2) — out of scope for v0.1.0.
- **The full three-OS × every-harness/surface matrix** — Phase 7 REL-02 owns it.

## Areas Raised but Not Discussed

Offered at the end of each area and declined; recorded so a later cycle knows they were considered:

- Canary prompt authorship and the CAPA-02 fan-out judgement threshold.
- Shared ownership when several packs require the same skill.
- Re-apply handling when a user hand-edits a materialized SKILL.md (`DRIFTED`).
- Whether Antigravity GUI / CLI / IDE are one ledger surface or three, and whether Codex CLI and its IDE extension share a proof. *(Carried into CONTEXT.md `<open_questions>` #6 as a research item.)*
