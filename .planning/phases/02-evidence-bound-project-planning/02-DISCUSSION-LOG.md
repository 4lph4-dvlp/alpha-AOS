# Phase 2: Evidence-Bound Project Planning - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-07
**Phase:** 02-evidence-bound-project-planning
**Areas discussed:** Project scope, Pack judgement, Approval surface, Change response

**Framing note:** The first two attempts to open this discussion were rejected by the user. The gray areas had been written in internal-mechanism language ("predicate authority", "plan binding", "fact vocabulary normalisation") and did not show where the decision would surface during development. The user also asked the agent to demonstrate that it understood the system before proposing questions, and separately corrected a scope error: the user initially read Phase 2 as covering both the project-scoped lane and tree-off isolation, when isolation is Phase 5. The accepted framing asks each question as a concrete situation whose outcome the user can feel.

---

## Project Scope

### Q1 — What counts as one project in a monorepo?

| Option | Description | Selected |
|--------|-------------|----------|
| Repository root only | Always the top of the repository; sub-folder evidence is merged. Simplest and most predictable, but web capabilities stay resident while working in `apps/api`. | |
| Nearest sub-project | Walk up from the current directory to the first project boundary. Precise scope, but the result depends on where the session started. | |
| Show both, user picks | Running at the root lists sub-projects and their per-project decisions; the user names the target. | ✓ |

**User's choice:** Show both and let the user pick.

### Q2 — How are sub-projects discovered?

| Option | Description | Selected |
|--------|-------------|----------|
| Workspace declaration first, else scan | Use `pnpm-workspace.yaml` / `package.json#workspaces` / `go.work` when present; otherwise scan for project-declaration files. | ✓ |
| Always scan declaration files | One rule, easy to explain, but example folders and test fixtures can be mistaken for projects. | |
| Only what the user lists | No false positives, but no monorepo benefit until the manifest is hand-written. | |

**User's choice:** Workspace declaration first, fall back to scanning.

### Q3 — Nested git repositories, submodules, vendored trees

| Option | Description | Selected |
|--------|-------------|----------|
| Stop and report | Borrow no evidence, but state "N separate repositories here — run inside them if needed." | |
| Exclude silently | Stop at the boundary and say nothing. Cleanest output. | ✓ |
| Offer as separate candidates | Add them to the D-01 selection list. Most flexible, but opens the door to writing into someone else's repository. | |

**User's choice:** Exclude silently; add a notice later if it proves needed.

**Notes:** The user first rejected this question, asking what "nested git repository" meant and whether alpha-AOS would have to be copied into every project directory. It does not: alpha-AOS is a globally installed CLI, and only rendered results (`.alpha-aos/`, and from Phase 3 the harness project-config paths) land in a target project. The question is about a user's own repository containing another repository, such as a submodule. Once the concrete `vendor/design-system` example was given, the user chose the quiet default and explicitly allowed a notice to be added later if the silence becomes confusing.

### Q4 — Does an uncommitted `Dockerfile` select CONTAINER?

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — ignore-list only | Exclude only `.gitignore`d paths; commit status is irrelevant. A file created moments ago is visible. Same rule outside git. | ✓ |
| No — git-tracked files only | Detection matches exactly what is version-controlled and is fastest, but a new file is invisible until `git add`. | |
| Yes, but flagged as uncommitted | Most precise, at the cost of a longer report and one more rule when judging plan validity. | |

**User's choice:** Yes — ignore-list only.

---

## Pack Judgement

**Facts presented before the questions:** `catalog/packs/*.yaml` declares 15 packs and no code reads it; the real rules are hardcoded in `src/core/project.ts:36-96` and have already diverged (`API` and `DEPLOYMENT` exist in YAML but not in code); pack skills come from the ECC package, not from this repository's `skills/`, which holds only `alpha-aos-ship`.

### Q1 — Where do the rules live when a pack must be added or corrected?

| Option | Description | Selected |
|--------|-------------|----------|
| YAML only | `catalog/packs/*.yaml` becomes the sole authority; code is the engine. No rebuild to add a pack, and the user can read the rule that judged them. Requires fixing the shape of the rule language now. | ✓ |
| TypeScript code | Unlimited expressiveness and type checking, but every pack costs a code change and the YAML/code divergence can recur. | |
| YAML default, code for exceptions | Pragmatic, but without a crisp rule for what belongs in code, judgement ends up smeared across both. | |

**User's choice:** YAML only.

### Q2 — Overriding a correct-but-unwanted match

| Option | Description | Selected |
|--------|-------------|----------|
| Force on and off | Any pack can be forced either way from the manifest; the human choice is recorded as evidence so "why did this attach?" can answer "the user said so". | ✓ |
| Force off only | Removing a wrong pack is always safe; forcing one on without evidence is not. Safe, but the user cannot open a case the rules do not know yet. | |
| No override — edit the rules | Fully reproducible, but one project's circumstances then pressure the global rule set. | |

**User's choice:** Force on and off.

### Q3 — How detailed is a recorded fact?

| Option | Description | Selected |
|--------|-------------|----------|
| Path + name + version | `apps/web/package.json → next@15.1.0`. Convincing to read and comparable later; an unrelated comment change does not disturb it. | ✓ |
| Name only | Simplest and rarely invalidated, but a major version bump looks identical and version-sensitive packs have nothing to stand on. | |
| Path + name + version + file hash | Strictest binding to reviewed bytes, but one unrelated dependency invalidates the approval. | |

**User's choice:** Path + name + version.

### Q4 — Fixing the source bytes of a pack skill

**Fact presented:** `catalog/stack.lock.json` carries `sourceSha256` for exactly three global skills. The 20+ pack skills have no entry, and `src/core/ecc-skills.ts:65` throws when a hash is missing — so planning a pack today would raise an exception. DETC-04 requires the plan to carry an exact source version and hash.

| Option | Description | Selected |
|--------|-------------|----------|
| Pre-pin all in the lock | Every pack skill hash is recorded ahead of time; `project plan` touches no network or package manager, consistent with Phase 1's zero-mutation preview rule. Cost is lock maintenance on every ECC bump. | ✓ |
| Resolve at plan time | Lighter lock, but previewing requires fetching the package — the exact class of problem plan 01-21 removed. | |
| Add incrementally | No unused hashes, but some packs plan and others fail with "not in the lock". | |

**User's choice:** Pre-pin all in the lock.

**Notes:** Flagged for the researcher: whether skills such as `frontend-a11y`, `click-path-audit`, and `inherit-legacy-style` actually exist in `ecc-universal@2.2.0` was never verified. Any absent skill leaves its pack without a source.

---

## Approval Surface

### Q1 — Default output volume

| Option | Description | Selected |
|--------|-------------|----------|
| Selected + near-miss | Full reasoning for selected packs, plus one line for each pack that satisfied part of its conditions. Unrelated packs stay silent. | ✓ |
| Selected only | Shortest, but a missing expected pack sends the user hunting for a flag. | |
| All 15 | Fully transparent, but the long screen buries what matters. | |

**User's choice:** Selected plus the near-misses.

### Q2 — Does the plan persist, and where?

| Option | Description | Selected |
|--------|-------------|----------|
| `~/.alpha-aos/` only | No repository files; approval history is private to one machine. | |
| Nowhere — recompute | No accumulated state at all, but no way to look back at what was approved. | |
| In-project `.alpha-aos/` | The team shares and can commit the plan; alpha-AOS then writes into the user's repository. | ✓ |

**User's choice:** In-project `.alpha-aos/`.

**Notes:** The user first rejected this question, then chose the in-project option while checking their understanding: that "writes into the user's repository" means `.alpha-aos/` content changing when skills, MCP, or harness versions change, and never the project's own source. The correction given was that it is not `.alpha-aos/` alone — from Phase 3, pack skills land in harness project-config paths such as `.claude/skills/<name>/SKILL.md`, because a harness can only discover a skill natively if it sits where the harness looks. Project source, `package.json`, tests, and build configuration remain read-only. On that basis the user considered the trade acceptable.

### Q3 — A user-authored file already occupies the target path

| Option | Description | Selected |
|--------|-------------|----------|
| Report and stop | Flag "a file alpha-AOS did not write is here" and drop that pack from the applicable set. Nothing hand-made is ever lost. | ✓ |
| Show bytes and let the user choose | Most flexible, but lengthens the approval screen and creates a path to overwriting by accident. | |
| Install under a different name | No collision, but two similar skills coexist and the harness may pick the wrong one. | |

**User's choice:** Report and stop.

### Q4 — What is the act of approving?

| Option | Description | Selected |
|--------|-------------|----------|
| Separate approve command | `project plan` previews and writes nothing; a separate command writes the plan artifact; Phase 3 executes only that artifact. "Looked at" and "approved" stay distinct. | ✓ |
| Auto-save on every plan | One command fewer, but a casual look mutates the file and a colleague's view can diverge from what was approved. | |
| Human fills in an approval field | A PR-like review trail, but heavy for solo use. | |

**User's choice:** Separate approve command.

---

## Change Response

**Locked by requirement, not discussed:** DETC-05 already mandates that apply is refused once evidence, manifest, stable lock, renderer, adapter capability, or target bytes have changed. Only the user-facing consequence was open.

### Q1 — What the user sees when apply is refused

| Option | Description | Selected |
|--------|-------------|----------|
| Show the diff and re-approve in place | "`lodash` was added. Pack selection is unchanged." Refusal is preserved while the friction is not. | ✓ |
| Refuse and restart | One simple rule, but re-reading from scratch after every trivial change breeds rubber-stamping. | |
| Warn earlier in status | Catches it before the wall, but only reaches people who run a status command. | |

**User's choice:** Show what changed and re-approve on the spot.

### Q2 — Evidence for an installed pack disappeared

| Option | Description | Selected |
|--------|-------------|----------|
| Report + removal plan | Show `STALE` with the missing evidence named, and offer a removal plan that still requires approval. Discovery and remedy in one flow. | ✓ |
| Report only | Keeps Phase 2 small, but leaves the user to find the next command. | |
| Report + allow a deliberate keep | Silences repeat warnings, but an unevidenced file can then sit in a project indefinitely. | |

**User's choice:** Report and offer the removal plan.

### Q3 — A branch switch removed the evidence

| Option | Description | Selected |
|--------|-------------|----------|
| `STALE` with the situation shown | State the fact and the circumstance: "`STALE` — branch differs from the approved one (main → experiment)." | ✓ |
| Plain `STALE` | One rule, self-resolving on switching back, but frequent branch work means constant warnings. | |
| Not `STALE` when the branch differs | Quietest, but a genuine dependency removal on another branch gets buried. | |

**User's choice:** `STALE`, with the branch situation shown alongside.

### Q4 — Do approved plans accumulate?

| Option | Description | Selected |
|--------|-------------|----------|
| Latest only | Overwrite on each approval; git carries history for anyone who commits it. | ✓ |
| Accumulate history | Dated files preserve "when and what" without git, but the folder grows and pruning becomes a new question. | |
| Latest + one-line log | Two files and a trail, but the log alone cannot reconstruct a past plan. | |

**User's choice:** Latest only.

---

## Claude's Discretion

The user did not select a "you decide" option anywhere. The following were assigned to Claude's discretion by the agent because they are implementation shape rather than user-visible outcome, and are recorded as such in CONTEXT.md:

- The concrete shape of the YAML predicate language.
- The definition of "partially matched" for the near-miss line, and how many such lines print.
- Whether `API` and `DEPLOYMENT` ship in this phase or are declared unimplemented.
- Derivation of the evidence envelope's 16-hex `projectId`.
- Whether unreadable evidence reports as `STALE` or as undecidable.
- Artifact layout and formatting under `.alpha-aos/`.

## Deferred Ideas

- **Isolating a project while giving it independent skills, MCP, and harness configuration** — the user proposed this as a Phase 2 question. Materialization is Phase 3 (CAPA-01..08) and tree-off isolation is Phase 5 (OPTO-01..09).
- **"N separate repositories were excluded" notice** — deliberately not built (Q3, Project Scope). Revisit if the silence becomes confusing.
- **Reviewing the pack list itself** — whether the 15 declared packs are the right 15, and the fate of `API`/`DEPLOYMENT`, was raised in a follow-up option the user did not take. Partly delegated to Claude's discretion; a deliberate product review belongs to a later cycle.
