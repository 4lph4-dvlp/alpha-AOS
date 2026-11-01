# Architecture Research

**Domain:** Cross-platform, cross-harness AI-agent workflow environment/control plane
**Milestone:** alpha-AOS v0.1.0 hybrid activation and lifecycle completion
**Researched:** 2026-09-03
**Confidence:** MEDIUM

## Executive Recommendation

Extend the existing declarative CLI into a **compile-and-materialize control plane**, not an invocation gateway. alpha-AOS should decide which capabilities may exist at global and project scope, compile that decision into a typed desired-state plan, and transactionally render the plan into each harness's native discovery surface. Once synced, optional skills and MCP tools are invoked directly by Claude Code, Codex, Antigravity, Pi, or Hermes. alpha-AOS should not sit on the prompt/tool-call path.

Use a separate enforcement plane for mandatory behavior. Evidence-selected security, migration, release, or other required checks should be installed as **project-scoped GSD capability bundles** and evaluated at GSD lifecycle points such as `plan:pre`, `execute:wave:post`, `verify:pre`, and ship/close. The check itself must return a machine-readable pass/block/error result, and an unavailable check must halt. A skill may explain or help remediate a gate, but model selection of that skill is never the enforcement mechanism.

Treat `project-only` and directory opt-out as **configuration isolation**, not a sandbox. Launch from a minimal, explicitly constructed environment; redirect or disable every user customization source supported by the target harness; render only allowlisted project capabilities; and verify the live process's resolved skills, MCP servers, hooks, and instructions. If an adapter cannot prove exclusion for a harness/version/surface, the launch must be reported as unsupported or blocked rather than described as isolated.

Preserve the current modules and transaction model. Extend `src/core/project.ts`, `src/core/isolation.ts`, `src/core/transaction.ts`, the existing component synchronizers, and `src/adapters/*`; do not create a second installer, state store, or configuration merger.

## Recommended Architecture

### System Overview

```text
                         user / GSD command
                                 |
                                 v
+------------------------- alpha-AOS CLI --------------------------+
| parse intent | dry-run/apply | status/doctor/remove/recover       |
+-------------------------------+----------------------------------+
                                |
                                v
+--------------------- Desired-State Compiler ---------------------+
| project evidence -> pack selection -> activation classes         |
| stable catalog/lock + manifest/trust + adapter support matrix     |
+-------------+------------------+------------------+---------------+
              |                  |                  |
              v                  v                  v
   Optional native plane   Mandatory GSD plane   Launch policy plane
   ---------------------   -------------------   -------------------
   project/global skills   project capability    clean config roots
   native MCP config       bundles + gates       env allowlist
   native instructions     agent_skills mapping  native disable flags
              |                  |                  |
              +------------------+------------------+
                                 |
                                 v
+---------------- Managed Apply / Recovery Coordinator ------------+
| existing file transactions | external-operation receipts         |
| snapshots + hashes          | compensating uninstall/recovery     |
+-------------------------------+----------------------------------+
                                |
                                v
+---------------------- Harness Adapter Layer ---------------------+
| Claude | Codex | Antigravity | Pi | Hermes                       |
| render | launch | probe | inspect | support/fail-closed contract  |
+-----------+---------+-------------+---------+--------------------+
            |         |             |         |
            v         v             v         v
       native skills, MCP, hooks, instructions, and child agents

GSD alone owns discuss -> plan -> execute -> verify -> ship and .planning/.
alpha-AOS owns selection, scope, materialization, gates-as-policy, and exclusion.
```

### Three Activation Classes

Every capability must be classified before rendering. Do not infer class from where a file happens to be installed.

| Class | Selection | Invocation/enforcement owner | Typical examples |
|-------|-----------|------------------------------|------------------|
| `optional-global` | Explicit catalog allowlist and stable lock | Native harness chooses implicitly from user scope | documentation lookup, deep research, unified memory |
| `optional-project` | Deterministic evidence plus reviewed project manifest | Native harness chooses implicitly from project scope | framework patterns, project-local test/eval skills, bounded project MCP |
| `mandatory-gsd-gate` | Deterministic evidence or explicit project policy | GSD lifecycle resolves and blocks on a deterministic check | migration safety, security review, release/API coverage |

An item may have both an optional skill and a mandatory gate, but those are separate declarations. For example, a migration pack may expose a model-selected migration playbook while also installing a blocking `verify:pre` schema/migration check.

## Component Boundaries

| Component | Owns | Reuses / likely location | Must not own |
|-----------|------|--------------------------|--------------|
| CLI dispatcher | Command parsing, dry-run/apply selection, exit status, rendering | `src/cli.ts`, `src/format.ts` | Policy decisions, config-format branching |
| Catalog and lock loader | Reviewed pack metadata, versions, integrity, adapter compatibility | `src/core/catalog.ts`, `catalog/`, schemas | Runtime evidence or mutable machine state |
| Evidence detector | Pure, deterministic observations with provenance and freshness | Extend `src/core/project.ts` and pack definitions | File writes, deletions, LLM judgment |
| Desired-state compiler | Resolve evidence + manifest + lock + adapter support into one `ProjectCapabilityPlan` | New focused core module, using existing types/catalog | Native file rendering or subprocess launch |
| Native capability synchronizers | Project/global skill and MCP render/diff operations | Parameterize `src/core/ecc-skills.ts`, `src/core/owned-skills.ts`, `src/core/mcp.ts`, `src/core/skill-policy.ts` by scope | Pack selection and gate execution |
| GSD lifecycle bridge | Install/remove locked project-scoped GSD capability bundles; update agent-skill assignments through GSD-supported commands | New small core service invoking the locked GSD CLI | Direct writes to `.planning/` or GSD lifecycle transitions |
| Managed apply coordinator | Order stages, call transactions, record external operations, compensate on failure | Extend `src/core/install.ts` pattern and `src/core/transaction.ts` | Harness-specific path knowledge |
| Harness adapter | Declare native roots, renderers, flags, environment controls, introspection probes, supported versions/surfaces | Expand `src/adapters/harnesses.ts` and `src/adapters/isolation.ts` | Cross-harness policy |
| Launch policy compiler | Build a complete `LaunchEnvelope` from scratch for managed/project-only/off modes | Extend `src/core/isolation.ts` | Mutating user config or assuming exclusion |
| Runtime verifier | Prove positive availability and negative exclusion using native inventories and canaries | Extend doctor/fixture modules | Treating file presence as proof |
| Receipt/recovery service | Ownership ledger, before/after hashes, external-change receipts, resume/compensation | Extend transaction journals and state under the existing alpha-AOS state root | Deleting unowned or drifted data |

### Core Domain Contracts

Add types before adding command branches. The exact names may vary, but the boundaries should remain explicit.

```typescript
type ActivationClass =
  | "optional-global"
  | "optional-project"
  | "mandatory-gsd-gate";

type SurfaceSupport = "supported" | "unsupported" | "unverified";

interface ResolvedCapability {
  id: string;
  version: string;
  activation: ActivationClass;
  evidence: EvidenceRecord[];
  skills: LockedArtifact[];
  mcp: LockedMcpDefinition[];
  gsdCapability?: LockedGsdCapability;
  targetHarnesses: HarnessId[];
}

interface HarnessCapabilityContract {
  harness: HarnessId;
  surface: "cli" | "ide" | "gui";
  versionRange: string;
  projectSkills: SurfaceSupport;
  projectMcp: SurfaceSupport;
  projectHooks: SurfaceSupport;
  childCapabilityInheritance: SurfaceSupport;
  optOutExclusion: SurfaceSupport;
  render(plan: ProjectCapabilityPlan): ManagedFileOperation[];
  launch(policy: LaunchPolicy): LaunchEnvelope;
  inspect(envelope: LaunchEnvelope): Promise<ResolvedSurfaceEvidence>;
}
```

`supported` means a real harness/version probe has passed, not that an adapter contains a plausible filename. `unverified` blocks mandatory gates and opt-out guarantees. It may still allow a clearly labeled optional preview in dry-run output.

## Desired State and Ownership

### Authoritative Inputs

| Input | Authority | Notes |
|-------|-----------|-------|
| Stable catalog and lock | alpha-AOS | Exact versions, source hashes, target hashes, supported surfaces |
| Project manifest | Project/user decision | Trust, explicit pack overrides, allowed harnesses, isolation/off policy |
| Detected evidence | alpha-AOS detector | Reproducible observations with detector version and timestamp |
| GSD project config/state | GSD | alpha-AOS may invoke supported GSD configuration/capability commands; it must not hand-edit lifecycle state |
| Native harness user config | User + alpha-AOS-owned entries | Merge only namespaced/receipted entries; preserve unknown content |
| Transaction and external-operation receipts | alpha-AOS | Machine-local recovery truth; no secrets |

### Materialized Project Layout

Prefer the shared Agent Skills convention where it is natively supported, and mirror only where a harness requires its own directory.

```text
project/
├── .alpha-aos/
│   └── stack.yaml                 # reviewed intent/trust, not generated runtime state
├── .agents/
│   ├── skills/<capability>/       # common native project skills: Codex, Antigravity, Pi, Hermes
│   └── mcp_config.json            # Antigravity-owned project MCP entries where supported
├── .claude/
│   ├── skills/<capability>/       # Claude-specific mirror where needed
│   └── settings.json              # only alpha-AOS-owned hook/policy entries merged
├── .codex/config.toml             # project MCP/hook entries where supported
├── .pi/settings.json              # project bridge/settings only; Pi has no native MCP client
├── .hermes/skills/<capability>/   # only if required by a proven Hermes adapter
└── .gsd/capabilities/<gate>/      # written through GSD's project capability installer
```

Do not create a second canonical copy of GSD state. The catalog/lock is the source package truth; materialized files are deployable projections tracked by receipts. For multi-harness skills, identical locked bytes may be copied to several native roots because Windows symlink behavior and cross-filesystem installs make symlink-only architecture fragile.

### Collision and Merge Rules

- Reserve an alpha-AOS namespace for managed skill, MCP, hook, and capability IDs.
- Never overwrite an existing unreceipted path, even when its name matches a desired capability.
- For JSON/TOML/YAML, own only the named subtree or table. Preserve all unknown keys and comments where the format adapter can do so.
- Store `beforeHash`, `afterHash`, artifact source hash, renderer version, and owning component for every projected file or subtree.
- A stale or failed evidence scan may add warnings, but cannot trigger removal. Removal requires an explicit user operation or a fresh successful reconciliation decision.

## Data Flow

### 1. Project Detect, Plan, and Sync

```text
filesystem/package manifests
        |
        v
detectors -> EvidenceRecord[] -> pack resolver -> ResolvedCapability[]
                                             + manifest decisions
                                             + stable lock
                                             + adapter support
                                                     |
                                                     v
                                          ProjectCapabilityPlan
                                                     |
                         +---------------------------+---------------------+
                         |                           |                     |
                         v                           v                     v
                  native file plan          GSD capability plan     launch plan
                         |                           |                     |
                         +------------- dry-run report -------------------+
                                                     |
                                                  --apply
                                                     |
                    stage -> validate -> transactional writes -> external ops
                                                     |
                                           post-apply verification
                                                     |
                                               committed receipt
```

The plan must be content-addressed. Apply must reject if the manifest, lock, evidence inputs, or current target hashes no longer match the plan. This prevents a reviewed dry run from authorizing a different mutation.

### 2. Optional Native Invocation

After sync, the steady-state path is deliberately short:

```text
task prompt -> native harness intent matching -> project/global skill metadata
                                           -> optional SKILL.md load
                                           -> native MCP tool selection/call
```

alpha-AOS is absent from this path. It may later diagnose the result, but it does not proxy prompts, select a skill for the model, or broker every MCP call.

### 3. Project Capabilities in GSD Subagents

Project-local capabilities reach GSD workers through two complementary native/GSD seams:

1. **Native discovery:** materialize the locked skill into the harness's actual project skill root. Codex, Antigravity, Pi, and current Hermes document `.agents/skills`; Claude Code uses `.claude/skills`. Child agents that inherit the parent's resolved skills/MCP configuration receive the same allowlisted surface without another alpha-AOS process.
2. **GSD `agent_skills` injection:** when a specific GSD agent must receive a project skill, configure the appropriate `agent_skills.<agent-type>` mapping using GSD's supported config command. GSD injects the project-relative skill reference into the spawned agent; its bootstrap self-loads the mapping on runtimes where orchestrator-side injection is not reliable.

This is an availability contract, not a mandatory-run contract. A child may still decline an optional skill. If a phase cannot be considered complete without a capability, enforce it with a GSD gate outside the child's model choice.

Adapters must record how inheritance was proven for each harness/surface:

- Codex documents that child settings such as MCP servers and skill configuration inherit from the parent unless overridden.
- Claude Code can preload named skills in custom subagents and lets subagents discover other project/user skills; GSD injection should be used for required worker context.
- Hermes documents project context inheritance and selected skill propagation for review/delegation flows, but each GSD agent surface still needs a canary.
- Pi intentionally leaves subagents to extensions/packages; the Pi GSD bridge must own any worker injection contract.
- Antigravity child-agent inheritance is insufficiently documented for a blanket guarantee; keep it `unverified` until a live canary passes.

### 4. Mandatory GSD Gate Flow

```text
fresh project evidence / explicit manifest policy
                    |
                    v
locked project-scoped GSD capability bundle
                    |
         GSD lifecycle registry resolves hook
                    |
 plan:pre / execute:wave:post / verify:pre / ship
                    |
                    v
 deterministic check executable
   -> { status, block, message, evidenceHash, checkVersion }
                    |
          pass -> continue GSD lifecycle
          block -> halt with remediation
          error/unavailable -> halt (fail closed)
```

Use GSD's project capability installer and consent/integrity mechanisms. alpha-AOS selects and invokes that interface; it should not copy a `capability.json` directly or patch GSD's built-in registry. This keeps GSD the lifecycle owner and lets GSD control when the gate executes.

Mandatory checks need these properties:

- Deterministic activation predicate based on resolved project evidence or an explicit manifest switch.
- Exact locked bundle/check version and content integrity.
- Structured output with distinct `pass`, `block`, and `error/unexamined` states. Never treat inability to inspect as a negative finding.
- `blocking: true` and `onError: halt` at the GSD lifecycle point.
- Evidence bound to the relevant inputs or Git revision so later edits invalidate stale results.
- Remediation instructions may call an optional skill, but a new check execution is required to clear the gate.

Harness-native hooks remain useful for immediate tool-level protection, such as blocking a dangerous write, but they are adapter-specific defense in depth. They do not replace the cross-harness GSD phase gate.

### 5. Project-Only and Opt-Out Launch

Build the child environment from an allowlist. Never use `{ ...process.env, ...launch.env }` for project-only/off launches.

```text
LaunchPolicy
  -> validate manifest trust + fresh sync receipt
  -> adapter version/capability probe
  -> minimal cross-platform environment
  -> synthetic/isolated config roots
  -> native disable/strict flags
  -> explicit allowlisted project resources
  -> preflight surface inspection
  -> launch only if exclusion proof passes
```

`LaunchEnvelope` should contain the resolved executable, argument array, working directory, complete environment, expected active surfaces, expected absent surfaces, adapter/version identity, and plan hash. Spawn with `shell: false` and separate argument tokens. Node's supplied `env` object becomes the child's environment; include a usable `PATH` explicitly. On Windows, normalize environment keys case-insensitively before allowlisting so duplicates such as `Path`/`PATH` cannot bypass filtering.

The environment allowlist should contain only OS/process essentials plus explicitly approved harness authentication/provider variables. Unrelated API keys and tokens are absent by default. Secret values must never appear in the plan, journal, diagnostics, or arguments. If a harness stores auth in the same redirected home as customizations, use a documented safe/bare mode that preserves auth when available; otherwise require a separate login in the isolated profile rather than copying credential files.

#### Adapter Strategy by Harness

| Harness | Project-local optional surface | Opt-out/project-only strategy | v0.1.0 posture |
|---------|--------------------------------|-------------------------------|----------------|
| Claude Code | `.claude/skills`, project `.mcp.json`, project settings/hooks | Prefer `--safe-mode` for full off; for allowlisted project-only use isolated `CLAUDE_CONFIG_DIR`, constrained setting sources, and strict explicit MCP config | Strongest documented introspection (`/context`, `/skills`, `/hooks`, `/mcp`, `/status`); still verify managed-policy effects |
| Codex | `.agents/skills`, trusted `.codex/config.toml`, project agents/hooks | Isolated `CODEX_HOME` and synthetic home; mark project untrusted or disable project config as policy requires; explicitly disable receipted project skills and project guidance for full off | Do not assume `CODEX_HOME` hides `.agents/skills` or repository instructions; prove each absent surface |
| Antigravity | `.agents/skills`, `.agents/mcp_config.json`, workspace rules/plugins | Synthetic global home plus an adapter-specific workspace-disable mechanism | Block a claimed opt-out if workspace skills/rules/MCP cannot be suppressed and inspected on that surface/version |
| Pi | `.agents/skills`/`.pi/skills`, project settings/extensions; MCP only through an extension/bridge | Isolated Pi directory plus `--no-skills`, `--no-extensions`, `--no-prompt-templates`, `--no-themes`, and `--no-context-files`; add back only allowlisted resources | Good CLI controls; keep MCP bridge explicit and separately verified |
| Hermes | Trusted `.agents/skills`/`.hermes/skills`; current documented MCP config is user/profile scoped | Fresh `HERMES_HOME`, project discovery disabled for full off, ignore user config/rules where supported | Project-local skills are viable; project-local MCP must remain unsupported until documented and canary-proven |

### Verifying Opt-Out Instead of Assuming It

Exclusion needs a four-layer proof:

1. **Static envelope proof:** show that no disallowed environment name, user config root, managed skill path, MCP definition, hook, or GSD guidance appears in the launch envelope. Validate real paths, not only lexical paths.
2. **Native resolved-surface proof:** run a read-only preflight that lists active setting sources, skills, MCP servers, hooks, agents, and instruction files. Parse a versioned machine-readable form when available; otherwise use a strict adapter parser with golden fixtures.
3. **Paired canary proof:** install harmless, uniquely named global alpha-AOS probe skill/MCP/hook artifacts in a fixture profile. Confirm they are present in a normal managed launch and absent in the opt-out launch. The positive control prevents a broken inspector from producing a false pass.
4. **Behavior proof:** issue a bounded prompt that would naturally select the probe skill and a read-only call to the probe MCP. Managed launch must show the expected trace; off launch must show neither discovery nor invocation, and the hook sentinel must remain untouched.

Persist only redacted evidence: harness/version, surface names, hashes, timestamps, exit codes, and probe IDs. Opt-out verification expires when the harness version, adapter renderer, launch policy, or managed surface changes.

## Trust Boundaries

| Boundary | Untrusted input | Required handling |
|----------|-----------------|-------------------|
| Repository -> detector | package files, manifests, skill text, MCP definitions, symlinks | Bounded reads, schema validation, realpath containment, no execution during detect |
| Evidence -> policy | detected filenames/dependencies | Typed detector output with version/provenance; no raw prose-driven activation |
| Catalog/lock -> renderer | external package metadata and artifacts | Stable reviewed lock, integrity validation, fixtures before apply |
| Project capability -> GSD | third-party `capability.json`, hooks/check executables | Use GSD install/consent/integrity path; never direct-copy into active registry |
| Renderer -> native config | existing user/project configuration | Format-aware merge, namespaced ownership, before/after hashes, collision refusal |
| Launcher -> child process | ambient environment and executable lookup | Explicit allowlist, normalized keys, exact executable/args, `shell: false`, redaction |
| MCP -> model/check | remote or local server output | Treat as data; mandatory decision logic must validate structured check results |
| Unified Memory -> GSD | remembered handoff/context | Advisory only; repository/GSD state remains authoritative |

Project trust is consent to load project-defined capabilities, not proof that the repository is safe. `sealed` continues to fail closed until a real OS/container adapter enforces filesystem, network, environment, and process boundaries.

## Transaction, Uninstall, and Recovery

### Extend the Existing Transaction Model

Keep `applyFileTransaction` as the filesystem primitive, but add an operation-level coordinator around it:

```text
planned
  -> staged
  -> applying-files
  -> applying-external-ops
  -> verifying
  -> committed

failure -> compensating -> rolled-back
                       -> needs-repair (if an external change cannot be reversed)
```

The coordinator receipt should record:

- Plan hash and input hashes.
- Every managed file/subtree with owner, before hash, after hash, snapshot, and allowed real root.
- Every external operation, such as a GSD capability install or package-manager change, with the verified prior state, exact requested version/integrity, result, and compensating command contract.
- Verification evidence and the harness/adapter versions that produced it.
- Final state and a recovery hint, without captured stdout/stderr secrets.

### Safe Remove / Uninstall

Removal is reconciliation against receipts, not directory deletion:

1. Re-read and validate the target's real path and ownership receipt.
2. Refuse automatic removal if current bytes/subtree differ from `afterHash`; report the drift and preserve the file.
3. For composed native config, remove only the alpha-AOS-owned named entry and preserve sibling keys/comments.
4. Invoke GSD's capability uninstall interface for project gate bundles; do not delete `.gsd/capabilities` directly.
5. Restore a preexisting file from snapshot only if the post-install bytes still match the receipt.
6. Remove an empty alpha-AOS-created directory only after proving every descendant is receipted and unchanged.
7. Verify that the capability is absent from native resolved-surface inspection.

External package changes cannot be made atomically with filesystem transactions. Record them as compensatable operations. If compensation is impossible or would overwrite a newer user version, stop at `needs-repair` and give an exact, redacted recovery plan rather than pretending rollback succeeded.

Use a single-writer lock per state root/project/harness target. On startup, `status`/`doctor` should detect incomplete receipts and offer resume or compensate after revalidating every target hash.

## Cross-Platform and Adapter Drift

### Versioned Adapter Contract

Do not label a harness globally supported. Support is a tuple:

```text
(harness, surface, harness version, operating system, capability surface)
```

Each adapter should publish a capability matrix for skill discovery, MCP, hooks, project trust, child inheritance, clean launch, and introspection. Probe actual flags/config schemas at runtime where possible. When the harness falls outside a validated range, downgrade affected surfaces to `unverified`; mandatory gates and opt-out launches fail closed.

### Validation Matrix

- Unit/golden tests: JSON/TOML/YAML merges, comments, malformed inputs, duplicate keys, paths with spaces/non-ASCII, Windows path casing.
- Three-OS fixtures: render, transaction, rollback, environment filtering, executable/argument projection.
- Adapter contract tests: positive/negative discovery and exclusion against fixture harness shims.
- Real-host canaries: at least one real host for every supported harness/surface; representative Windows, macOS, and Linux coverage.
- Candidate-lock gate: a harness/package update cannot enter the stable lock until its affected adapter canaries pass.

Windows-specific requirements include case-insensitive environment normalization, `.cmd`/executable resolution without constructing shell strings, path separator/case normalization, and no dependency on symlink privileges. macOS/Linux requirements include realpath validation through symlinked parents, executable permission checks, and explicit `PATH`/locale/temp variables in sanitized environments.

## Recommended Project Structure Changes

Keep new behavior aligned with existing module boundaries:

```text
src/
├── core/
│   ├── project.ts                 # extend deterministic evidence records
│   ├── project-plan.ts            # desired-state compiler (new focused module)
│   ├── project-sync.ts            # plan/apply/remove coordinator
│   ├── gsd-capabilities.ts        # supported GSD install/config/uninstall bridge
│   ├── isolation.ts               # policy + launch planning, not adapter flags
│   ├── verification.ts            # positive availability / negative exclusion evidence
│   ├── transaction.ts             # realpath hardening + existing byte transactions
│   ├── recovery.ts                # external-op receipts and compensation
│   ├── ecc-skills.ts              # add explicit global/project scope parameter
│   ├── mcp.ts                     # add explicit scope and owned-subtree merge
│   └── process.ts                 # sanitized env, redaction, shell-free spawn
├── adapters/
│   ├── harnesses.ts               # version/surface probes and support matrix
│   ├── capabilities.ts            # native render/inspect contracts
│   └── isolation.ts               # launch-envelope projection per harness
└── types.ts                       # desired state, adapter support, receipts, evidence

catalog/
├── stack.yaml                     # activation class and target declarations
├── stack.lock.json                # locked skill/MCP/GSD-bundle hashes
└── packs/                         # evidence predicates and capability membership
```

This is a logical split, not a mandate to create every file immediately. Prefer extracting a new module only when the current file would otherwise mix selection, rendering, launch, and verification responsibilities.

## Patterns to Follow

### Pattern 1: Control Plane / Native Data Plane

**What:** alpha-AOS compiles and installs desired state; native harnesses perform optional selection and tool calls.

**Why:** Preserves the natural intent-matching behavior already proven on Codex and avoids a fragile universal proxy that must emulate every harness protocol.

**Trade-off:** Native behavior varies, so adapter tests and explicit unsupported states are mandatory.

### Pattern 2: Policy as Typed Desired State

**What:** Convert evidence and manifest decisions into an immutable plan before any renderer runs.

**Why:** Keeps deterministic selection separate from harness-specific formats and makes the reviewed dry run bindable to apply.

**Trade-off:** Requires more domain types and migrations as the policy grows, but prevents branching policy across five adapters.

### Pattern 3: Mandatory Gate as GSD Capability

**What:** Package deterministic checks as locked project-scoped GSD capabilities with lifecycle contributions/gates.

**Why:** GSD remains the sole lifecycle owner and can block phase progression consistently across harnesses.

**Trade-off:** Gate authoring must follow GSD's capability contract and version compatibility; it is intentionally less ad hoc than dropping a hook into each harness.

### Pattern 4: Capability-Negotiated Adapter

**What:** Resolve support per surface/version/OS, and carry `supported`, `unsupported`, or `unverified` into planning.

**Why:** Harness CLIs and GUI/IDE products drift independently. A static harness ID is too coarse to justify safety claims.

**Trade-off:** More canaries and fixture maintenance, but failures become local and comprehensible.

### Pattern 5: Paired Positive/Negative Verification

**What:** Every exclusion test includes a managed positive control; every installation test includes a meaningful native invocation.

**Why:** Prevents false success from broken inspectors, silently skipped configuration, or file-presence-only checks.

## Anti-Patterns to Avoid

### Routing Every Invocation Through alpha-AOS

This couples the product to prompt/tool protocols, adds a failure point, and defeats native implicit invocation. Compile and sync; then leave the request path.

### Enforcing Mandatory Work With a Skill Description

Skill activation is model-mediated and therefore probabilistic. Use a GSD lifecycle gate with deterministic check output and fail-closed error handling.

### Treating a Blank Config Root as Proof of Opt-Out

Harnesses may still scan repository roots, common skill directories, managed policy, parent instructions, environment variables, or GUI-specific stores. Inspect the live resolved surface and run paired canaries.

### A Universal Lowest-Common-Denominator Adapter

Pi has no native MCP client, Antigravity surfaces can differ, and Hermes project MCP parity is not established. Express unsupported capability surfaces rather than hiding differences behind generic `mcp` or `isolated` booleans.

### Deleting Because Evidence Disappeared

A failed/stale scan is not evidence that a capability is no longer wanted. Require a fresh successful plan and explicit removal, then honor receipts and drift checks.

### Whole-File Rewrites of Native Configuration

They destroy comments, unknown keys, user ordering, and later edits. Own namespaced subtrees and preserve the rest through format-aware adapters.

## Dependency-Ordered Build Sequence

1. **Safety and contract foundation**
   - Harden realpath/symlink boundaries, environment redaction, and shell-free subprocess execution.
   - Define desired-state, evidence, support-matrix, launch-envelope, and receipt types.
   - Add versioned adapter probes before expanding mutations.

2. **Deterministic project planning**
   - Upgrade `detectProject()` to structured, versioned evidence.
   - Compile evidence + manifest + stable lock into a content-addressed dry-run plan.
   - Surface unsupported/unverified harness capabilities explicitly.

3. **Transactional project-local optional capabilities**
   - Parameterize existing skill/MCP/policy synchronizers for project scope.
   - Implement collision-safe, namespaced rendering and project sync/apply.
   - Add ownership receipts, remove, rollback, and incomplete-operation recovery in the same phase; do not ship sync without a safe inverse.

4. **GSD subagent and mandatory-gate integration**
   - Wire project skills to GSD `agent_skills` through supported GSD commands.
   - Package security/migration checks as locked project-scoped GSD capabilities.
   - Prove lifecycle blocking, stale-evidence invalidation, and error-as-halt across at least two harnesses before broad rollout.

5. **Project-only and directory opt-out launch**
   - Replace ambient environment spreading with explicit allowlist construction.
   - Implement per-harness off/project-only strategies and isolated auth posture.
   - Block adapters that cannot prove exclusion.

6. **Resolved-surface verification and doctor/status UX**
   - Add native inspectors, paired canaries, meaningful read-only invocation traces, and receipt-aware status.
   - Report availability, activation, gate status, isolation confidence, and recovery actions separately.

7. **Cross-platform drift validation and stable release**
   - Run three-OS fixtures, real-host canaries for every declared surface, brownfield GSD cycle, uninstall/reinstall recovery, and opt-out negative tests.
   - Freeze the stable lock only after the adapter evidence matrix is complete.

The first three phases form the minimum safe base. Mandatory gates depend on stable project materialization and recovery. Opt-out depends on adapter capability contracts and complete receipts, because exclusion cannot be proven without knowing every installed alpha-AOS surface.

## Open Questions / Research Flags

- **Antigravity opt-out:** official docs establish workspace/global locations, but a universal CLI/GUI/IDE switch that disables every workspace customization was not established. This phase needs real-host research before claiming support.
- **Hermes project-local MCP:** current user documentation clearly establishes profile-level MCP and project skills; project-local MCP should remain unsupported until an official stable contract and live canary agree.
- **Codex full-off project skill suppression:** `CODEX_HOME` does not itself hide repository `.agents/skills`. Validate path-based skill disabling and untrusted-project behavior for every local client surface.
- **GSD third-party gate packaging:** the installed GSD version exposes project capability install, consent, contributions, and blocking gates. Before locking an alpha-AOS bundle, validate its public compatibility/version contract against the exact stable GSD version.
- **Authentication separation:** determine per harness whether auth can be reused independently of custom configuration. Never solve this by copying auth/session stores into generated runtimes.

## Sources

External findings were obtained through the prescribed research-plan provider seam and cross-checked against current official pages or upstream repositories. Provider confidence classification was **MEDIUM** even after verification, so harness-specific claims remain adapter-canary gated.

- [Claude Code: directory and configuration sources](https://code.claude.com/docs/en/claude-directory) — official; project/user customization locations.
- [Claude Code: skills](https://code.claude.com/docs/en/skills) — official; implicit selection, project discovery, subagent preload/discovery.
- [Claude Code: debug configuration](https://code.claude.com/docs/en/debug-your-config) — official; resolved-surface inspection, safe mode, clean config testing.
- [Claude Code: feature overview](https://code.claude.com/docs/en/features-overview) — official; skills are model-mediated while hooks are deterministic.
- [OpenAI Codex: skills](https://developers.openai.com/codex/skills) — official; `.agents/skills`, progressive disclosure, implicit invocation.
- [OpenAI Codex: subagents](https://developers.openai.com/codex/subagents) — official; parent configuration inheritance and project-scoped agents.
- [OpenAI Codex: advanced configuration](https://developers.openai.com/codex/config-advanced) — official; project trust, config precedence, `CODEX_HOME`.
- [OpenAI Codex: environment variables](https://developers.openai.com/codex/environment-variables) — official; Codex state-root behavior.
- [Google Antigravity: skills](https://antigravity.google/docs/skills/) — official; workspace/global discovery and implicit skill selection.
- [Google Antigravity: MCP](https://antigravity.google/docs/mcp/) — official; global/workspace MCP files and product surfaces.
- [Google Antigravity: rules and workflows](https://antigravity.google/docs/rules-workflows) — official; model-decision versus explicit workflow activation.
- [Pi coding agent README](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/README.md) — upstream; trust, scopes, disable flags, and extension-based MCP posture.
- [Pi skills documentation](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/skills.md) — upstream; project discovery and implicit loading.
- [Hermes skills documentation](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/skills.md) — upstream official docs; project skill trust and precedence.
- [Hermes delegation documentation](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/delegation.md) — upstream official docs; child context/tool inheritance.
- [Hermes MCP documentation](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/mcp.md) — upstream official docs; profile-level native MCP configuration.
- [Node.js 24 child process API](https://nodejs.org/docs/latest-v24.x/api/child_process.html) — official; explicit environment, command lookup, shell-free spawn.
- Installed GSD Core capability registry, lifecycle dispatcher, agent-skills bootstrap, and config command implementation — local source inspection; high confidence for the locked installed version, not a promise about later versions.
- Existing alpha-AOS architecture, integrations, concerns, project/isolation, transaction, and adapter modules — repository source inspection; high confidence for current implementation.

---
*Architecture research for alpha-AOS v0.1.0 hybrid activation*
*Researched: 2026-09-03*
