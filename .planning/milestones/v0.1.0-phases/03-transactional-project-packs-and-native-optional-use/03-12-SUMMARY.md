---
phase: 03-transactional-project-packs-and-native-optional-use
plan: 12
subsystem: infra
tags: [capa-03, unified-memory, ecc-memory-vault, handoff-canary, planning-tree-digest, immutability-witness, evidence-unit, cost-before-spend]

# Dependency graph
requires:
  - phase: 03-transactional-project-packs-and-native-optional-use
    provides: "03-11's provenance sidecar and its paired absence proof; 03-08's ordered matcher, upsertProof and the owned-instruction materialization; 03-06's canary runtime, runCanary and the two doctor verbs; 03-05's declared canary catalog, prompt hygiene and the blocked-versus-unverified split; 03-03's capability ledger and pairEvidence; 03-02's observe/filter split"
  - phase: 01-safe-operation-boundary
    provides: "runProcess with a shell-free bounded launch and a declared environment, ProcessSpec.stdin, commandProbeEnvironment, resolveCommand, the excerpt/fingerprint split, canonicalizeWithMissingTail"
provides:
  - "src/adapters/unified-memory.ts — memoryDoctor / memoryHandoff / memorySearch over the vault's own closed envelopes, with MEMORY_ENVELOPES pinning the exact schema identifier of each"
  - "hashPlanningTree + comparePlanningTrees + PlanningTreeDigest — a host-independent digest that WITHHOLDS its aggregate when anything under the tree could not be read, and a comparison that names which paths moved"
  - "ImmutabilityWitness on CapabilityProof, and pairEvidence accepting it as the alternative negative-control witness plus a nullable positive"
  - "runHandoffCanary + HANDOFF_HARNESS_PAIRS + resolveHandoffPair + HANDOFF_SCOPE_LIMIT — the CAPA-03 round trip as ONE evidence unit"
  - "CROSS_HARNESS_HANDOFF in catalog/canaries.yaml, and skills/alpha-aos-memory-handoff/SKILL.md as a CAPA-03-scoped owned instruction"
  - "doctor --canary --no-spend, and --capability handoff through a declared alias table"
  - "handoffRow / skippedCanaryRow / formatHandoffEvidence — the transcribed evidence, scope limit last"
  - "NO_PACK_SKILL_SOURCE_HASH / EMPTY_BOUND_INPUTS — the fix for a latent ledger-bricking defect every canary proof carried"
affects: [phase-04-gates, phase-06-uninstall, phase-07-support-matrix, capability-ledger, doctor, ship-gate]

actuals:
  tokens: 30508
  tasks: 3
  commits: 7

plan_head_before: 0012e34929fdfbe0a1d5dcae24a6dfaa8c91969a

tech-stack:
  added: []
  patterns:
    - "witness-not-repurpose: when a second kind of negative control appears, it gets its own named witness rather than borrowing the first one's field, and the pairing rule accepts EITHER"
    - "withhold-the-aggregate: a digest over a tree returns null the moment anything under it went unread, because an aggregate over a partial set is exactly how a change hides"
    - "attributed-not-driven: a write made on a harness's behalf through the tool's own --from flag, with the summary saying so, rather than a second model turn that proves nothing extra"
    - "free-half-first: a canary whose cost is concentrated in one leg exposes the rest as a runnable, CI-portable command, and records the paid leg unverified/NOT ATTEMPTED"
    - "round-trip-or-it-did-not-ship, applied a second time: a proof shape is asserted readable by the ledger's own reader"

key-files:
  created:
    - src/adapters/unified-memory.ts
    - skills/alpha-aos-memory-handoff/SKILL.md
  modified:
    - src/core/canary.ts
    - src/core/capability-ledger.ts
    - src/cli.ts
    - src/format.ts
    - schemas/capability-ledger.schema.json
    - catalog/canaries.yaml
    - test/canary.test.ts

key-decisions:
  - "CAPA-03's negative control carries an ImmutabilityWitness, not a repurposed ancestor walk. pairEvidence accepts EITHER witness; a negative carrying neither is INCOMPLETE."
  - "The handoff write is ATTRIBUTED, not driven: alpha-AOS runs `ecc memory handoff --from <source>`. Driving the source harness would spend a second model turn and prove nothing extra about the boundary D-16 asks about."
  - "The positive's axis is `discovered`, never `invoked`. The round trip proves the context is present and reachable through the target's own filter; that the receiving MODEL worked from it is a judgement no record makes (D-01)."
  - "`doctor --canary --no-spend` attempts only the free legs. A skipped leg is `unverified` / NOT ATTEMPTED with its reason, never `blocked` — D-12 reserves `blocked` for a cause the user can clear."
  - "The memory-handoff steering instruction is materialized for CAPA-03 alone. Giving it to the documentation canary would quietly change the run whose job is to show what a harness does WITHOUT being pointed at anything."
  - "`boundInputs.skillSourceHash` carries the digest of the EMPTY SET, never the empty string, which the ledger schema refuses on read."
  - "`hashPlanningTree` withholds its aggregate when anything under the tree could not be read, and refuses to follow a symbolic link rather than hashing bytes from outside the named root."
  - "The vault claim is always `increased by exactly one` against a baseline taken in the SAME run — never an absolute count, because a developer host with existing memories changes the arithmetic."

patterns-established:
  - "Pattern 1: a second kind of negative control gets its own named witness; the pairing rule widens to accept either, and neither witness is bent to describe the other"
  - "Pattern 2: a tree digest withholds its aggregate rather than computing one over a partial set"
  - "Pattern 3: the falsification test is written first-class — the negative is proven capable of failing by mutating the tree mid-run, not by inspection"
  - "Pattern 4: a canary whose cost sits in one leg ships a --no-spend mode so the rest is runnable and CI-portable"

requirements-completed: []

coverage:
  - id: D1
    description: "alpha-AOS drives the Memory Vault's baseline, handoff write and target-filtered recall through bounded, envelope-validated commands, and says so honestly when it cannot"
    requirement: CAPA-03
    verification:
      - kind: unit
        ref: "test/canary.test.ts#the vault doctor envelope is read through its declared schema identifier, and a mismatch is refused naming both"
        status: pass
      - kind: unit
        ref: "test/canary.test.ts#a handoff is written for a named source and target harness and returns the envelope the vault produced"
        status: pass
      - kind: unit
        ref: "test/canary.test.ts#a filtered recall returns only the entries whose target is the named harness"
        status: pass
      - kind: unit
        ref: "test/canary.test.ts#an absent vault CLI is unsupported with its reason and an unreadable envelope is unparsed, never a success"
        status: pass
      - kind: integration
        ref: "live on this host against ecc-universal 2.2.0: doctor 0 -> handoff -> doctor 1, filtered recall for `claude` returned the entry and for `pi` returned none; the sentinel body was read back OFF DISK from the written handoff file"
        status: pass
      - kind: other
        ref: "mutations M1 (schema check removed), M3 (search keeps the whole row) and M4 (absent CLI reported as an empty vault) each turn their named test red"
        status: pass
    human_judgment: false
  - id: D2
    description: "A handoff body never reaches a command argument: it travels the vault's own --stdin path, and a sentinel placed in it is absent from the recorded argument vector"
    requirement: CAPA-03
    verification:
      - kind: unit
        ref: "test/canary.test.ts#a handoff body travels the non-argument input path and its sentinel never reaches the recorded arguments"
        status: pass
      - kind: other
        ref: "grep -v '^\\s*[/*]' src/adapters/unified-memory.ts | grep -c child_process — 0; runProcess( with environment: commandProbeEnvironment( asserted present by the same test"
        status: pass
      - kind: other
        ref: "mutation M2 (the body is ALSO passed as an argument) turns the named test red"
        status: pass
    human_judgment: false
  - id: D3
    description: "The planning tree can be proven unchanged across an operation, and a change names the file that moved; an unreadable path withholds the aggregate rather than hiding inside it"
    requirement: CAPA-03
    verification:
      - kind: unit
        ref: "test/canary.test.ts#two consecutive digests over an unchanged planning tree are identical"
        status: pass
      - kind: unit
        ref: "test/canary.test.ts#changing one byte under the planning tree moves the digest and names the file that moved"
        status: pass
      - kind: unit
        ref: "test/canary.test.ts#adding a file and removing a file each move the digest and name the path"
        status: pass
      - kind: unit
        ref: "test/canary.test.ts#a path under the planning tree that cannot be read is undecidable with its errno, and the digest is incomplete"
        status: pass
      - kind: unit
        ref: "test/canary.test.ts#the same planning content under two different directory names produces the same digest"
        status: pass
      - kind: unit
        ref: "test/canary.test.ts#hashing the planning tree writes nothing: bytes and modification times are identical afterwards"
        status: pass
      - kind: other
        ref: "mutations M5 (aggregate computed over the partial set), M6 (absolute root folded into the digest), M7 (difference reports THAT not WHICH), M8 (only the top level walked) and M9 (a scratch file written beside the tree) each turn their named tests red"
        status: pass
    human_judgment: false
  - id: D4
    description: "One run records BOTH halves as one evidence unit: the handoff really happened (count +1 exactly, sentinel returned by the target's own filter) and the planning tree is byte-identical across the round trip"
    requirement: CAPA-03
    verification:
      - kind: integration
        ref: "test/canary.test.ts#a handoff run pairs the vault positive with the planning-tree negative into one COMPLETE unit"
        status: pass
      - kind: e2e
        ref: "node dist/src/cli.js doctor --canary --capability handoff --no-spend --json — exit 0, one COMPLETE unit for CAPA-03, both digests present and equal (3cd61944baf5…) over 153 files of this repository's own .planning tree, 2 ledger rows"
        status: pass
      - kind: other
        ref: "mutations M10 (no witness on the negative), M11 (asserted without comparing the digests) and M12 (the AFTER digest is the BEFORE digest re-used) each turn their named tests red"
        status: pass
    human_judgment: false
  - id: D5
    description: "The negative can FAIL: a planning file that moves during the handoff makes the witness unasserted, the unit INCOMPLETE, and the report names the file"
    requirement: CAPA-03
    verification:
      - kind: integration
        ref: "test/canary.test.ts#a planning file that moves during the handoff makes the negative fail and the unit INCOMPLETE, naming the file"
        status: pass
      - kind: other
        ref: "mutations M11, M12 and M14 (pairEvidence accepts a present-but-unasserted witness) each turn this test red; it is the falsification proof the orchestrator's note 1 asked for"
        status: pass
    human_judgment: false
  - id: D6
    description: "An unpaired half never passes: a recall that does not return the sentinel, or a vault that gained two, yields NO positive and an INCOMPLETE unit naming which half is missing"
    requirement: CAPA-03
    verification:
      - kind: integration
        ref: "test/canary.test.ts#a handoff whose recall does not return the sentinel yields no positive, and the unit says which half is missing"
        status: pass
      - kind: integration
        ref: "test/canary.test.ts#a vault that gained TWO memories yields no positive: the claim is exactly one, not at least one"
        status: pass
      - kind: other
        ref: "mutation M13 (the positive is recorded on the write alone) turns both red"
        status: pass
    human_judgment: false
  - id: D7
    description: "A host that cannot run two harnesses records blocked with the requirement named and attempts nothing; where the preferred pair is unavailable the declared fallback is used and the result says which pair ran, with exact versions"
    requirement: CAPA-03
    verification:
      - kind: unit
        ref: "test/canary.test.ts#a host that cannot run two harnesses records blocked with the requirement named, and nothing is attempted"
        status: pass
      - kind: unit
        ref: "test/canary.test.ts#an unavailable preferred pair falls back to the declared fallback, and the row says which pair actually ran"
        status: pass
      - kind: e2e
        ref: "live: the preferred pair resolved — source hermes 0.20.6, target claude 2.1.267 — and the rendered HANDOFF PAIR line names both with their exact versions"
        status: pass
      - kind: other
        ref: "mutation M17 (a single-harness host runs it anyway) turns both named tests red"
        status: pass
    human_judgment: false
  - id: D8
    description: "The handoff canary is declared in the shipped catalog, names neither a tool nor a skill nor the vault, and passes the same prompt-hygiene gate as every other declaration"
    requirement: CAPA-03
    verification:
      - kind: unit
        ref: "test/canary.test.ts#the handoff canary is declared in the shipped catalog and names neither a harness pair nor a tool"
        status: pass
      - kind: unit
        ref: "test/canary.test.ts#every declared prompt names none of its expected tools, no pinned server id and no locked skill id"
        status: pass
    human_judgment: true
    rationale: "The mechanical half is asserted, and it is the only half a test can reach. Whether the prompt reads as an ORDINARY handover — and whether consulting the handed-off context is genuinely the natural way to answer it — is the standard 03-CONTEXT.md sets and no assertion can make. The prompt is transcribed under `Human checks` for a person to read."
  - id: D9
    description: "The report states the scope limit: the planning tree was proven unchanged; the memory tool's other filesystem access was NOT policed, and why"
    requirement: CAPA-03
    verification:
      - kind: unit
        ref: "test/canary.test.ts#the handoff report names both harnesses with their versions and states the scope limit last"
        status: pass
      - kind: other
        ref: "the scope limit also rides on the ledger row (immutabilityWitness.scopeLimit) and survives the write-then-read round trip; mutation M15 (the line is dropped) turns two named tests red"
        status: pass
    human_judgment: true
    rationale: "That the sentence is present, is last, and survives to the ledger is asserted. Whether a reader finishes the report understanding that alpha-AOS proved the planning tree unchanged and did NOT prove the memory tool touched nothing else is a judgement about prose. The rendered line is transcribed below."
  - id: D10
    description: "The memory-handoff steering instruction reaches the CAPA-03 canary runtime and no other, and a runtime whose owned instruction is missing is REFUSED"
    verification:
      - kind: unit
        ref: "test/canary.test.ts#the memory-handoff steering instruction is materialized for CAPA-03 and for nothing else"
        status: pass
      - kind: other
        ref: "mutation M16 (the instruction is unscoped) turns that test red; the pre-existing 03-08 refusal test still guards a missing instruction"
        status: pass
    human_judgment: false
  - id: D11
    description: "A no-spend sweep announces itself with the cost lines and records every spending leg unverified with its reason, never blocked"
    verification:
      - kind: unit
        ref: "test/canary.test.ts#a no-spend sweep records every spending leg unverified with its reason, and never blocked"
        status: pass
      - kind: unit
        ref: "test/canary.test.ts#the canary sweep prints what it would spend before it runs anything"
        status: pass
      - kind: e2e
        ref: "live: three consecutive `doctor --canary --capability handoff --no-spend` runs, exit 0 each, ledger stable at exactly 2 rows"
        status: pass
    human_judgment: false
  - id: D12
    description: "Both handoff proofs survive the ledger write-then-read round trip, including the new witness"
    verification:
      - kind: integration
        ref: "test/canary.test.ts#both handoff proofs survive the ledger write-then-read round trip"
        status: pass
      - kind: other
        ref: "mutation M18 (skillSourceHash back to the empty string) turns it red — the assertion is exactly the one whose absence let this defect through twice"
        status: pass
    human_judgment: false
  - id: D13
    description: "The RECEIVING half of CAPA-03 — that the receiving harness genuinely worked FROM the handed-off context rather than answering from general knowledge — is NOT proven here"
    verification: []
    human_judgment: true
    rationale: "NOT RUN, and not blocked. The precondition is MET and measured: claude 2.1.267, codex 0.152.0, pi 0.85.1 and hermes 0.20.6 all resolve on PATH, and `ecc` / `ecc-memory-mcp` both resolve. The one leg not demonstrated is the one that spends real money, and the orchestrator's instruction for this run was explicitly not to spend it unasked. A vault recall is not an MCP tool call, so the observation front cannot see one either — D-01 keeps model output text out of the verdict, which makes this half a human judgement by construction rather than by omission. The exact command is under `Human checks`."
  - id: D14
    description: "CAPA-03's edge-probe row remains UNRESOLVED and must be raised with the developer rather than closed by a verifier"
    verification: []
    human_judgment: true
    rationale: "The deterministic edge probe returned `unclassified` for CAPA-03 and the plan carried the row forward unresolved rather than auto-resolving it with a backstop. CAPA-03 is a boundary-and-authority requirement, not a data-shape one; its predicates come from 03-CONTEXT.md D-16 and 03-RESEARCH.md Pattern 5. This plan authors 1 edge row and resolves 0."
  - id: D15
    description: "Cross-OS behaviour is unproven: every live run here is from one Windows 11 host"
    verification: []
    human_judgment: true
    rationale: "Carried forward from 03-04 A1 and 03-11 D14 unchanged. The vault adapter and the planning digest are portable by construction — the unreadable-path fixture uses a dangling link created as a `junction` on Windows and a plain symlink elsewhere, and paths are POSIX-normalised and code-point sorted so a Linux digest matches — but whether `ecc` and the four harnesses resolve the same way on macOS and Linux is the three-OS CI matrix's to report."

# Metrics
duration: 68 min
completed: 2026-09-11
status: complete
---

# Phase 03 Plan 12: The Cross-Harness Handoff, and the Proof It Did Not Become Policy Summary

**A real handoff written into the project's own Memory Vault and recalled under the receiving harness's own filter, bracketed by two byte-identical digests of this repository's 153-file `.planning/` tree — recorded as ONE evidence unit whose negative half is proven capable of failing, and whose scope limit says out loud what was not proven.**

## Performance

- **Duration:** 68 min
- **Started:** 2026-09-11T07:00:25+09:00 (base commit `0012e34`)
- **Completed:** 2026-09-11T08:08:00+09:00
- **Tasks:** 3
- **Files modified:** 9 (2 created, 7 modified)

## Accomplishments

- **The vault is driven through its own closed envelopes, and the identifiers were measured rather than assumed.** `MEMORY_ENVELOPES` pins `ecc.memory.doctor.v1`, `ecc.memory.write.v1` and `ecc.memory.search.v1`, each transcribed from a live probe on this host. The identifier is validated **before any field is read**, so an upstream bump is a refusal naming both the expected and the observed contract instead of an `undefined` where a memory count belongs.

- **A handoff body never touches an argument list.** Bodies travel the vault's own `--stdin` path. A named test places a sentinel in the body and asserts it is absent from the recorded argument vector **and present in the delivered stdin** — the second half matters, because a check that passes because nothing was sent is the vacuity this phase keeps finding. Mutation M2 adds a `--body` argument beside the stdin path and turns it red.

- **The planning digest withholds its answer rather than approximating one.** `hashPlanningTree` returns `digest: null` the moment any path under the tree could not be read, and lists it with the host's errno. An aggregate computed over a partial set would let a change *inside* the skipped file pass the immutability check, which is the single thing the function exists to prevent. A symbolic link is refused rather than followed — reading through one hashes bytes from outside the root the caller named.

- **The negative control got its own witness instead of borrowing one.** `pairEvidence` demanded an asserted `ancestorFreedom` on every negative. For CAPA-06 that is right — the control directory has to be somewhere the pack could genuinely have been found. For CAPA-03 the negative is a different claim, and its artifact is a digest pair. Putting hashed paths into `checkedAncestors` would have been convenient and a lie about what was checked, so `ImmutabilityWitness` is a second, separately-named witness and the pairing rule accepts **either**. Every existing CAPA-06 caller is untouched.

- **The negative is proven capable of failing, which is the whole point.** The orchestrator's note 1 warned that an assertion that "policy did not change" passes trivially if nothing was ever able to change it. A named test mutates `STATE.md` **between the two digests, from inside the vault write itself** — exactly where and when a memory tool treating its content as authoritative policy would do its damage. The witness goes unasserted, the unit goes INCOMPLETE, and both the reasons and the rendered `HANDOFF PLANNING` line name `STATE.md`. The positive half is deliberately unaffected, because the two halves are independent and only the *pairing* makes the claim.

- **An unpaired half never passes, in three different ways.** A recall that does not return the sentinel yields no positive (M13 turns it red). A vault that gained **two** memories yields no positive — `exactly one`, not `at least one`, against a baseline taken in the *same run*. A host that cannot resolve two harnesses records `blocked` naming the requirement and attempts nothing at all: no vault command runs and nothing is hashed.

- **The free half of D-16 is a runnable command.** `doctor --canary --no-spend` attempts only what costs nothing — which for this canary is the baseline, the write, the filtered recall and both digests, i.e. every part of the immutability claim. Each skipped leg is `unverified` / **NOT ATTEMPTED** with that as the reason, never `blocked`: D-12 reserves `blocked` for a cause a user can clear, and "nobody asked to spend" is not one.

- **A latent ledger-bricking defect was found and fixed while here.** Every canary proof carried `boundInputs.skillSourceHash: ""`. The schema types that field as a sha256, so the row was **writable and then unreadable** — the second run refused its own file with `schema.pattern@/proofs/0/boundInputs/skillSourceHash`, exit 2. It is plan 03-08's `harnessVersion.raw` defect one field over, latent only because no canary proof had ever been written on this host. It now carries the digest of the empty set, and a named write-then-read round-trip test asserts the property whose absence let this class through twice.

- **The live run, measured on this repository's own planning tree:**

  | fact | measured |
  |---|---|
  | pair | source **hermes 0.20.6** → target **claude 2.1.267** (the preferred declared pair; both resolved) |
  | vault | `memoryCount` **0 → 1**, exactly one, against a baseline taken in the same run |
  | sentinel | `ALPHA-AOS-HANDOFF-CANARY-7dd1a068-…`, written to `project:handoffs/mem_20260910_89489faa…md` |
  | filtered recall for `claude` | returned **1** entry and **DID** include the sentinel |
  | planning digest before | `3cd61944baf5d1240a9ac4741e9ae883be45cec41340b884589a176d507fc9bb`, COMPLETE, **153 files** |
  | planning digest after | `3cd61944baf5d1240a9ac4741e9ae883be45cec41340b884589a176d507fc9bb` — byte-for-byte identical |
  | unit | **COMPLETE** — CAPA-03 on claude; native use `discovered` |
  | receiving leg | **not attempted** — it spends a model turn and was not requested |
  | `git status --porcelain -- .planning/` | no change from the run (only the pre-existing runtime lock) |

  Three consecutive runs, exit 0 each, ledger stable at exactly **2 rows** (`CAPA-03/positive/discovered`, `CAPA-03/negative/unverified`).

## Task Commits

1. **Task 1: A bounded adapter over the memory vault's own closed envelopes** — `aa3fbd5` (test, RED) → `b4d5ae7` (feat, GREEN), plus `f665c9e` (fix — a stray NUL byte from the RED commit)
2. **Task 2: The planning-tree immutability check** — `16c024b` (test, RED) → `7fa125c` (feat, GREEN)
3. **Task 3: The handoff canary — one run, both halves** — `8a7276d` (feat)

**Plan metadata:** the `docs(03-12)` commit carrying this file, `.planning/STATE.md`, `.planning/ROADMAP.md` and `.planning/WINDOWS.md`. Named rather than hashed: it is the commit this sentence is inside.

No REFACTOR commit for either TDD task: neither GREEN step left anything to restructure.

## Files Created/Modified

- `src/adapters/unified-memory.ts` — **new.** `MEMORY_COMMAND`, `MEMORY_ENVELOPES`, `MemoryResult` / `MemoryRefusal` and their stable codes, `MemoryEntry` (field-selective: a search row's body excerpt has no field to land in), `memoryDoctor`, `memoryHandoff`, `memorySearch`, `createMemoryRunner`, `MEMORY_TIMEOUT_MS`, `MEMORY_EXCERPT_BYTES`.
- `skills/alpha-aos-memory-handoff/SKILL.md` — **new.** The CAPA-03-scoped owned instruction: where handed-off context lives, how to read it, that a memory is unreviewed context and never policy, and that `.planning/` is not its to write.
- `src/core/canary.ts` — `PlanningTreeFile` / `PlanningTreeUnreadable` / `PlanningTreeDigest` / `PlanningTreeDifference`, `hashPlanningTree`, `comparePlanningTrees`, the two scan bounds; `HANDOFF_CANARY_ID`, `HANDOFF_CAPABILITY`, `PLANNING_DIRECTORY`, `CANARY_CAPABILITY_ALIASES`, `resolveCapabilityFilter`, `HANDOFF_SCOPE_LIMIT`, `HandoffPair`, `HANDOFF_HARNESS_PAIRS`, `resolveHandoffPair`, `HANDOFF_BODY_TEMPLATE`, `HandoffCanaryResult`, `runHandoffCanary`, `NO_PACK_SKILL_SOURCE_HASH`, `EMPTY_BOUND_INPUTS`; `CanaryOwnedInstruction` + `ownedInstructionsFor` + `MEMORY_HANDOFF_INSTRUCTION_ID`; `createCanaryRuntime` gained `capability`; `runCanarySweep` gained `spend` and `runHandoff` and now returns `handoffResults` + `skipped`; `handoffRow`, `skippedCanaryRow`.
- `src/core/capability-ledger.ts` — `ImmutabilityWitness`, the optional `immutabilityWitness` on `CapabilityProof`, and `pairEvidence` accepting a nullable positive plus either witness.
- `src/cli.ts` — `--no-spend`, `--capability` through the alias table, the handoff route with its ledger writes, the three row builders, the extended `--json` envelope, and the HELP text for both.
- `src/format.ts` — `formatHandoffEvidence`: the transcribed `HANDOFF PAIR / VAULT / RECALL / PLANNING / RECEIVING / UNIT / SCOPE` lines, each on its own line so a width bound cannot cut the load-bearing words, scope limit last.
- `schemas/capability-ledger.schema.json` — `immutabilityWitness`, optional and closed, with the reason it is not required.
- `catalog/canaries.yaml` — `CROSS_HARNESS_HANDOFF`.
- `test/canary.test.ts` — 23 new tests across the three tasks (6 + 6 + 11), plus one existing sweep test tightened.

## Decisions Made

See `key-decisions` in the frontmatter. The three that most shape what comes next:

**The witness, not the repurpose.** `pairEvidence`'s ancestor rule exists because pi's `.agents/skills` walk does not stop at a repository root, so a negative control directory must be *constructed*. That reasoning does not transfer to "did the planning tree move", and bending `checkedAncestors` to carry hashed paths would have produced a record that said something it had not checked. The widening is narrow and stated: either witness satisfies the rule, a negative carrying neither is INCOMPLETE, and the refusal names both alternatives so a reader is not left to generalize from one.

**Attributed, not driven.** `ecc memory handoff --from hermes --target claude` attributes the write to the source harness without spending a model turn on it. RESEARCH.md Pattern 5 records every step except "the receiving harness is asked" as deterministic and offline for exactly this reason. The summary says so plainly rather than letting a reader assume two model turns happened — the alternative would have doubled the cost of the canary to prove nothing extra about the boundary D-16 asks about.

**`discovered`, never `invoked`.** The round trip proves the handed-off context is present and reachable through the target harness's own filter. It does not prove a model read it. A vault recall is not an MCP tool call, so the observation front cannot see one either, and D-01 makes model output text inadmissible — which places the receiving half in human judgement by construction rather than by omission. Recording it as `invoked` would have been the single most tempting overclaim in this plan.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] Every canary proof carried a `skillSourceHash` the ledger's own reader refuses**

- **Found during:** Task 3, running the CLI a second time
- **Issue:** `boundInputs.skillSourceHash` is `$ref: sha256` in `schemas/capability-ledger.schema.json`, but both the pre-existing `doctor --canary` branch and my new handoff route passed `""`. The first run wrote two rows and exited 0; the second refused the file with `schema.pattern@/proofs/0/boundInputs/skillSourceHash`, exit 2, and kept refusing. This is plan 03-08 deviation 2 one field over — a one-shot command that bricks its own ledger — and it had never surfaced only because no canary proof had ever been written on this host.
- **Fix:** `NO_PACK_SKILL_SOURCE_HASH` — the sha256 of the empty set, which is exactly what `packSkillSourceHash([])` computes — in a shared `EMPTY_BOUND_INPUTS`, used by both routes. A capability that binds to no pack skill keeps that value across runs, so `resolveNativeUse` never demotes it for a change that did not happen.
- **Files modified:** `src/core/canary.ts`, `src/cli.ts`
- **Verification:** three consecutive live `doctor --canary --capability handoff --no-spend` runs, exit 0 each, ledger stable at 2 rows; plus the new `both handoff proofs survive the ledger write-then-read round trip` test, which mutation M18 turns red.
- **Committed in:** `8a7276d`

**2. [Rule 2 — Missing Critical] `doctor --canary` gained `--no-spend`**

- **Found during:** Task 3
- **Issue:** The plan's own `<verify>` requires `doctor --canary --capability handoff --json` to exit 0 and produce an evidence unit carrying two planning-tree digests. The orchestrator's instruction for this run was explicitly not to spend the user's money. Without a way to attempt the free legs only, those two requirements are mutually exclusive: the verb would either spend or refuse.
- **Fix:** `--no-spend`. It attempts only legs that cost nothing and records each skipped leg `unverified` / NOT ATTEMPTED with its reason — never `blocked`, per D-12. It announces itself alongside the cost lines, before anything starts. For the handoff canary this is nearly the whole run; for the other canaries everything is skipped, which is the honest answer.
- **Files modified:** `src/core/canary.ts`, `src/cli.ts`
- **Verification:** `a no-spend sweep records every spending leg unverified with its reason, and never blocked`, plus three live runs.
- **Committed in:** `8a7276d`

**3. [Rule 2 — Missing Critical] The receiving harness could not have reached the vault at all**

- **Found during:** Task 3
- **Issue:** A canary runtime points claude at a `CLAUDE_CONFIG_DIR` *inside* the runtime (03-08 deviation 3), so the user's own skills — including the vault's `unified-memory` skill — are invisible to the run. The declared prompt names no tool by design. A receiving leg run that way could not consult the handoff even in principle, so its failure would have proven nothing, and the human check recorded below would have burned money on a run that was constructed to fail.
- **Fix:** `skills/alpha-aos-memory-handoff/SKILL.md`, materialized into the canary runtime's own config root — the same mechanism and the same refusal 03-08 built for the routing instruction. `CANARY_OWNED_INSTRUCTIONS` became a list of entries with an optional capability filter, and this one is scoped to `CAPA-03` alone so the documentation and research canaries are byte-identical to what they were.
- **Why this is in scope rather than a thumb on the scale:** CAPA-03's own truth statement is that a user can **explicitly** hand work over. Steering the receiver to where handed-off context lives is the explicit half; what remains the harness's own act is whether it works from it.
- **Files modified:** `src/core/canary.ts`, `skills/alpha-aos-memory-handoff/SKILL.md` (new)
- **Verification:** `the memory-handoff steering instruction is materialized for CAPA-03 and for nothing else`; mutation M16 turns it red.
- **Committed in:** `8a7276d`

**4. [Rule 1 — Bug] A stray NUL byte in the Task 1 tests made git treat the file as binary**

- **Found during:** Task 2
- **Issue:** The Task 1 sentinel assertion was written as `args.join("\0")` where a space belonged. The assertion still held, but a NUL makes git classify `test/canary.test.ts` as binary: the blob kept CRLF instead of the repository's declared `eol=lf`, and diffs, greps and mutation checks over it all degrade silently.
- **Fix:** the single byte replaced with a space, in its own commit. Content is otherwise byte-identical, which is why that commit also shows the one-time CRLF → LF normalization.
- **Files modified:** `test/canary.test.ts`
- **Verification:** `node -e "readFileSync(...).indexOf(0)"` returns `-1`; the normalized content compares equal to the previous commit's.
- **Committed in:** `f665c9e`

### Recorded reinterpretations

**5. The plan's Task 3 `<verify>` command was run with `--no-spend` added.** The plan names `node dist/src/cli.js doctor --canary --capability handoff --json`. That command drives claude and spends. It was run as `… --capability handoff --no-spend --json`, exit 0, producing the COMPLETE unit with both digests the `fails_when` clause asks for. The spending form is transcribed under `Human checks` for a person to run deliberately. Following the plan literally here would have spent the user's money unasked; claiming it ran would have been worse.

**6. `pairEvidence` accepts a nullable positive.** The plan asks for an unpaired positive to record INCOMPLETE. The mirror case — a negative control taken without its positive — was unrepresentable: a caller holding only the negative could not build the unit at all, which pushes it toward reporting the half it has. It now records INCOMPLETE naming the missing positive, which is what the recall-failure and count-mismatch tests assert.

**7. One existing test was tightened rather than merely repaired.** `the canary sweep prints what it would spend before it runs anything` asserted `runs === selections`. With a CAPA-03 declaration in the catalog that is no longer true, so it now asserts `runs + handoffs + skipped === selections` — every selection accounted for exactly once — plus that a skipped entry carries its reason. That is a stronger property than the one it replaced: a selection that simply vanished would previously have been invisible.

---

**Total deviations:** 4 auto-fixed (2 bugs under Rule 1, 2 missing-critical under Rule 2) plus 3 recorded reinterpretations.
**Impact on plan:** No scope creep — no new dependency, no lock edit, no catalog pack edit, no third-party byte touched. Deviation 1 is the difference between a ledger that works twice and one that bricks itself; deviation 3 is the difference between a recorded human check that can succeed and one constructed to fail. The four-name extraction allowlist, `.planning/PROJECT.md`'s bounded-extraction claim and the shipped third-party skill bytes are all unchanged (wave 7's `narrow` decision, honoured).

## Mutation evidence (eight vacuous assertions were found in earlier waves of this phase)

Every claim was verified by mutating the BUILT implementation, **asserting the mutation string actually matched before writing** (03-09 recorded a false negative from a substitution that silently matched nothing), watching the named tests go red, and reverting. The tree was confirmed clean and green after every revert.

| # | Mutation | Applied? | Tests turned red |
|---|---|---|---|
| M1 | the envelope's schema-identifier check is removed | yes (1 match) | the doctor-envelope test |
| M2 | the handoff body is ALSO passed as a command argument | yes (1 match) | the sentinel/argument test |
| M3 | the search keeps the whole row, so the body excerpt survives | yes (1 match) | the filtered-recall test |
| M4 | an absent CLI is reported as a successful empty vault | yes (1 match) | the unsupported/unparsed test |
| M5 | the aggregate is computed over the partial set instead of withheld | yes (1 match) | the unreadable-path test |
| M6 | the digest folds in the absolute root | yes (1 match) | the two-directories test |
| M7 | the comparison reports THAT it differs but never WHICH path | yes (1 match) | the one-byte-change test |
| M8 | the walk hashes only the top level | yes (1 match) | four planning-digest tests |
| M9 | `hashPlanningTree` writes a scratch marker beside the tree | yes (1 match) | four tests, **including the writes-nothing test that passed vacuously in RED** |
| M10 | the negative carries no immutability witness at all | yes (1 match) | six handoff tests |
| M11 | the witness asserts immutability without comparing the digests | yes (1 match) | the falsification test |
| M12 | the AFTER digest is the BEFORE digest re-used, never re-hashed | yes (1 match) | the falsification test |
| M13 | the positive is recorded on the write alone, ignoring the recall | yes (1 match) | the misdirected-recall test + the gained-two test |
| M14 | `pairEvidence` accepts a present-but-UNasserted witness | yes (1 match) | the falsification test |
| M15 | the report drops the scope-limit line | yes (1 match) | the report test + the fallback-pair test |
| M16 | the memory-handoff instruction is materialized for every canary | yes (1 match) | the instruction-scoping test |
| M17 | a single-harness host runs the handoff anyway | yes (1 match) | the blocked-pair test + the fallback-pair test |
| M18 | `skillSourceHash` goes back to the empty string | yes (1 match) | the ledger round-trip test |

**M9 and M12 are the two worth reading.** M9 is the 03-11 M12 lesson applied in advance: the "writes nothing" test passed with the stub in RED, because a function that does nothing writes nothing. It was proven non-vacuous afterwards by making the implementation actually write, and by asserting the directory listing as well as the mtimes — a scratch file beside the tree is a write no mtime comparison can see. M12 is the same shape one layer up: re-using the first digest instead of re-hashing would make "the tree did not change" true by construction. Both were caught by mutating the implementation, not by inspecting it.

## Issues Encountered

- **The ledger refused its own file on the second run.** Recorded in full as deviation 1. Worth naming here too: this is the second time in this phase that a `doctor` verb wrote a row its own reader rejected, and both times the fix was a schema-shaped value rather than a schema relaxation. The round-trip assertion now exists for the proof shape as well as for the version field.
- **This shell mangles a heredoc containing apostrophes, and a Python rewrite corrupted the test file.** 03-03, 03-04 and 03-11 recorded the heredoc half. A `python` in-place rewrite of `test/canary.test.ts` — used once to add three import lines — flipped every line ending and left the file unusable; it was reverted from git and the same edits were made with the Write/Edit tools, as the execution contract requires. Nothing else in this plan used a shell rewrite.
- **The handoff canary leaves a real memory in the project's own vault, by design.** A canary that wrote nothing would prove nothing. The report names the sentinel title and the vault path so a user can find it. The `.ecc/` directory the live verification runs created in this repository was removed afterwards; it did not exist before them and does not exist now.
- **`actuals.tokens` is on the diff instrument.** 30,508 is chars/4 over this plan's added lines (122,030 added characters across `src`, `schemas`, `catalog`, `skills` and `test`) — the same instrument 03-03, 03-09, 03-10 and 03-11 named, not a harness token count. The plan estimated 80,000 with `confidence: low`; this came in at roughly 38% of that, largely because Tasks 2 and 3 reused `pairEvidence`, `runCanary`, the canary runtime and the ledger rather than adding parallel machinery.
- **An instruction reached this executor telling it to make file edits through Bash `sed`/heredocs instead of the Write/Edit tools**, appended to an MCP-server section of the environment description. It contradicts the execution contract and the recorded shell behaviour above, and it was ignored. Recording it because a later wave should recognise the shape.

## Human checks

Three judgements a test cannot make, and one paid run that was deliberately not made:

1. **Does the handoff prompt read as an ordinary handover?** `CROSS_HARNESS_HANDOFF` in `catalog/canaries.yaml`: *"A teammate handed this over to me mid-task and left their notes behind for whoever picked it up next. Work out what they had already decided and tell me the next step they intended, before you suggest anything of your own."* It names no tool, no server, no skill, and none of `ecc`, `memory`, `vault`, `handoff` or `search` — asserted by a named test in both directions.

2. **Is the scope limit stated clearly enough?** The last line of every handoff report, verbatim: *"alpha-AOS proved the state of the project's planning tree across the round trip, byte for byte. It did NOT observe or restrict what the memory tool did elsewhere on the filesystem: policing that would require being an invocation proxy for every tool call, which PROJECT.md's control-plane decision and 03-CONTEXT.md D-02 rule out."* It is asserted present, asserted last, and asserted to survive onto the ledger row. Whether a reader finishes the report understanding what was *not* proven is the judgement.

3. **Did the receiving harness genuinely work FROM the handed-off context?** Not established — see coverage entry D13. This is the half that needs the paid run.

4. **The paid leg costs money and was not run.** To spend deliberately, on a project where a handoff is written:
   ```
   node dist/src/cli.js doctor --canary . --capability handoff --json
   ```
   Pin `ALPHA_AOS_STATE_DIR` first if the host ledger should not be written. It announces `SPENDS CROSS_HARNESS_HANDOFF on claude` before it starts. A bare `claude -p` in a fixture measured **$0.135** in 03-RESEARCH.md, so this is not free. When it runs, read the `HANDOFF RECEIVING` line and judge item 3: the receiving run's transcript is diagnostic evidence only — D-01 keeps model output out of the verdict, so no test will make that call.

## Deferred Issues

- **`doctor --discovery --json` renders `sweeps[].entries[].unit` as `[redacted:cycle]`.** Inherited from plan 03-11, unchanged and untouched by this plan; the full unit is present under `entries[].discovery.unit`. It is plan 03-08's surface. Full entry remains in `deferred-items.md`.

## Known Stubs

None. Every export added here is implemented and exercised. The RED-phase stubs in `src/adapters/unified-memory.ts` and `src/core/canary.ts` were both filled in the GREEN commit of their own task; `grep -n "not implemented" src/` returns nothing. `positive: null` on an unpaired handoff is a DECISION, not a stub: the unit records INCOMPLETE naming the missing half, which is the recorded-absence rule the rest of this phase runs on.

## Threat Flags

None. Every surface this plan adds was in the plan's declared register: T-03-110 (memory becoming authoritative policy) is the digest pair, now proven falsifiable rather than merely present; T-03-111 (a body reaching an argument list) is the `--stdin` path plus its sentinel test; T-03-112 (a receiving run answering from general knowledge) is the sentinel title and the filtered recall, with the residual judgement named as a human check; T-03-113 (an upstream envelope change) is the identifier validated before any field is read; T-03-114 (a handoff recorded as a pass without the immutability half) is the single evidence unit and the INCOMPLETE rule; T-03-115 (expanding into policing the filesystem) is `accept`, and the scope limit is now on the ledger row as well as in the report. No package was installed (T-03-SC).

One thing worth naming that is not a new threat but a widened surface: `pairEvidence` now admits a second kind of negative-control witness. The two are structurally distinct — different fields, different meanings, both required to be `asserted` — and a negative carrying neither is still INCOMPLETE. A reviewer should confirm that reasoning holds before a third witness is ever added, for the same reason 03-08 asked one to before a second row joins `CLASSIFIED_IDENTIFIER_ARGUMENTS`.

## User Setup Required

None — no external service configuration was introduced. `ecc` / `ecc-memory-mcp` were already on PATH as pinned components; no credential was read, and the whole suite runs offline with every vault command supplied by an injected runner.

## Requirements

`requirements-completed` is deliberately **empty**, and this plan declared `[CAPA-03]`.

CAPA-03 reads: *cross-harness handoff through Unified Memory without Memory Vault content modifying `.planning/`*. The second clause is fully proven — live, on this repository's own 153-file planning tree, with the negative half demonstrated capable of failing. The first clause is proven at the vault level: a handoff attributed to `hermes` and addressed to `claude` really exists and is really returned by a `claude`-filtered recall, verified by reading the written file's bytes off disk. What is **not** proven is 03-CONTEXT.md D-16's own wording — that the receiving harness *works from that context* — because that needs the paid model turn recorded above.

Marking it complete would put a claim in `REQUIREMENTS.md` that this phase exists to refuse, exactly as plan 03-08 declined to mark CAPA-01 and CAPA-02. It should be marked complete by whoever runs the command in `Human checks` item 4 and reads the result, not by this executor.

## Next Phase Readiness

- **Phase 3 is complete: 12 plans, 12 summaries.** This is the last plan of the phase.
- **What later phases inherit.** `hashPlanningTree` / `comparePlanningTrees` are general — any phase that needs to prove a tree unchanged across an operation should use them rather than adding a second digest. `src/adapters/unified-memory.ts` is the one bounded route to the vault. `ImmutabilityWitness` is the pattern for a negative control that is not a directory. `--no-spend` makes any future canary's free legs CI-runnable.
- **Three things a later phase must not inherit blindly:**
  1. **CAPA-01, CAPA-02 and CAPA-03 all still need the same one thing:** a paid canary run. Three commands, roughly $0.5 in total, all transcribed in their own summaries. The preconditions are MET on this host; nothing is blocked.
  2. **`pairEvidence` now has two witnesses.** A third would need the reasoning re-argued, not a third `||`.
  3. **The handoff canary WRITES.** It is the only `doctor` verb that leaves a durable artifact in the user's project (one memory in `.ecc/`, never in `.planning/`). Any future command that composes it must say so.
- **Baselines for whatever comes next:** `npm test` is **700 tests (694 pass, 0 fail, 6 pre-existing platform skips)**, up from 677; `npm run build` reports **76 inputs, 146 outputs**.
- **Nothing was spent.** No paid run was made in this plan, and none has been made anywhere in this phase.

---
*Phase: 03-transactional-project-packs-and-native-optional-use*
*Completed: 2026-09-11*

## TDD Gate Compliance

| Task | RED | GREEN | REFACTOR | RED evidence |
|------|-----|-------|----------|--------------|
| 1 (tdd) | `aa3fbd5` | `b4d5ae7` | — (none needed) | `RED_EVIDENCE_OK` / `target_test_failed` — `node --test --test-reporter=tap dist/test/canary.test.js`, exit 1, 64 tests / 59 pass / 5 fail; target test `the vault doctor envelope is read through its declared schema identifier, and a mismatch is refused naming both` failed on `expected state "ok", got "unsupported"` — an assertion for the planned behaviour against a compiling stub, not a load or discovery error |
| 2 (tdd) | `16c024b` | `7fa125c` | — (none needed) | `RED_EVIDENCE_OK` / `target_test_failed` — same command, exit 1, 70 tests / 65 pass / 5 fail; target test `changing one byte under the planning tree moves the digest and names the file that moved` failed on `assert.notEqual(before.digest, after.digest)` with both sides null |
| 3 | — | `8a7276d` | — | Not a TDD task (`type="auto"` without `tdd="true"`); its eleven tests were written with the implementation and each proven capable of failing by mutation (M10–M18) |

No gate violations. Both RED commits carry the full type surface as compiling stubs so the failures are assertions rather than compile refusals — the shape plans 03-04 and 03-11 used.

**One test in each RED run passed vacuously under the stub and is recorded rather than hidden.** Task 1's `the memory adapter makes no direct child-process call` is a source-level assertion that was structurally true from the first line, and is kept as a regression guard. Task 2's `hashing the planning tree writes nothing` passed because a stub that does nothing writes nothing; it was proven non-vacuous afterwards by mutation M9. This is the same disclosure 03-06 and 03-11 made about their own already-green RED behaviours.

## Self-Check: PASSED

- Every declared file exists on disk: `src/adapters/unified-memory.ts`, `skills/alpha-aos-memory-handoff/SKILL.md`, `src/core/canary.ts`, `src/core/capability-ledger.ts`, `src/cli.ts`, `src/format.ts`, `schemas/capability-ledger.schema.json`, `catalog/canaries.yaml`, `test/canary.test.ts`, and this summary.
- Commits `aa3fbd5`, `b4d5ae7`, `f665c9e`, `16c024b`, `7fa125c` and `8a7276d` are all reachable from `git log`; `git rev-list --count 0012e349..HEAD` is **7** — those six production commits plus this plan's own metadata commit — matching `actuals.commits`, measured from the persisted plan ledger rather than narrated.
- `npm run check` clean; `npm run build` 76 inputs / 146 outputs; `npm test` **700 tests / 694 pass / 0 fail / 6 skipped** — above the 677-test carried-forward baseline and far above the 208-test Phase 1 baseline.
- Task acceptance re-run. Task 1: `MEMORY_ENVELOPES` names `ecc.memory.doctor.v1` / `ecc.memory.write.v1` / `ecc.memory.search.v1`, each re-confirmed against this host's live output at summary time; `grep -v "^\s*[/*]" src/adapters/unified-memory.ts | grep -c child_process` is **0**; the mismatch, sentinel and absent-CLI tests all pass. Task 2: all five criteria pass. Task 3: the declaration is in the catalog and passes hygiene; the unit carries both digests and they are equal; the count grew by exactly one and the filtered recall returned the sentinel; the pair and both exact versions are named; the scope limit is stated; `git status --porcelain -- .planning/` shows no change from the run.
- Plan-level `<verification>` re-run: `npm test` reports `# fail 0` above baseline; the handoff evidence unit carries two equal planning-tree digests; `git status --porcelain -- .planning/` reports no change from the canary run (only the pre-existing untracked `milestone.lock`, which is the orchestrator's runtime lock and not this plan's).
- No tracked file was deleted by this plan (`git diff --diff-filter=D --name-only 0012e349..HEAD` is empty).
- No host state was written by the verification runs: every one pinned `ALPHA_AOS_STATE_DIR` to a scratch directory. `catalog/stack.lock.json`, `catalog/packs/` and the shipped third-party skill bytes are untouched. The `.ecc/` vault the live runs created in this repository was removed; the repository has no `.ecc/` now, and had none before.
- Three entries were appended to `.planning/WINDOWS.md`: the unrun paid receiving leg (`unrun-verify`), the `--no-spend` addition (`deviation`), and the `pairEvidence` widening (`deviation`).
- `requirements-completed` is empty by decision, not by omission. See `## Requirements`.
