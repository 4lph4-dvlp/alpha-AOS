# Feature Research

**Domain:** Local, cross-platform control plane for AI-agent workflow capabilities
**Project:** alpha-AOS v0.1.0
**Researched:** 2026-09-03
**Confidence:** MEDIUM

## Product Position

alpha-AOS should compete on reproducible capability boundaries, not on owning every agent invocation. The v0.1.0 product is complete when a user can install a small global baseline, let each harness natively select optional low-risk capabilities, deterministically add evidence-matched project packs, force risk-sensitive checks through GSD gates, opt a directory out of the global baseline, and remove everything alpha-AOS owns without disturbing user-owned configuration.

The confirmed activation model is hybrid:

| Capability class | Activation policy | Observable success |
|---|---|---|
| Optional, low-risk, read-oriented global capability | Installed globally and selected by the harness natively when intent matches | Fresh-session prompt causes the native skill loader and, where applicable, a meaningful read-only MCP call without naming the skill or MCP |
| Optional project capability | Deterministically provisioned from positive repository evidence, then selected by the harness natively | Detection evidence, project-local provenance, native discovery, and a relevant invocation trace all agree |
| Mandatory security, migration, or release check | Attached to an explicit GSD gate; one implementation is selected | Gate record exists and the phase fails closed when the check is missing or fails |
| Destructive, costly, credential-changing, or maintenance tool | Explicit-only | Harness cannot invoke it implicitly; user names the operation and sees a dry-run first |

Minimum v0.1.0 routing policy:

| Logical capability | Default route | Required control test |
|---|---|---|
| Current library documentation | Native implicit skill selection → Context7 read-only call | Version-sensitive question triggers it; unrelated coding prompt does not |
| Deep research | Native implicit skill selection only when the user asks for research; Exa discovers sources and bounded Firecrawl scrape reads selected pages | Research prompt produces cited source URLs; ordinary lookup does not fan out across every MCP |
| Unified memory | Native read when a handoff/recall task matches; writes are explicit or part of a named handoff | Memory never writes `.planning/` or governed docs and never becomes project authority |
| Project QA/pattern pack | Native implicit selection after deterministic project sync | Relevant fixture task loads the project-scoped skill; same prompt outside the project cannot see it |
| Security or migration obligation | Deterministic evidence → one GSD gate → one selected engine | Missing or failing result blocks verify/ship; no duplicate native/ECC run |
| Crawl, deployment, cleanup, removal, authentication change | Explicit-only with preview/approval appropriate to effect | Negative implicit-invocation test plus dry-run-before-apply test |

alpha-AOS therefore needs four distinct status concepts. They must never be collapsed into a single “installed” badge:

1. **Available:** locked bytes or configuration were deployed to an owned scope.
2. **Natively discovered:** the target harness lists the skill, extension, hook, or MCP tool with the expected provenance.
3. **Actually used:** a representative task produced a trace showing skill load and/or a meaningful read-only tool call.
4. **Mandatory when gated:** GSD recorded the required check and blocked progress when it was absent or failing.

## Feature Landscape

### Table Stakes (Users Expect These)

These are non-negotiable for a trustworthy installer/control plane. Missing any P1 item makes the v0.1.0 promise incomplete even if the underlying skills are present.

| Feature | Why Expected | Complexity | Observable acceptance flow |
|---|---|---:|---|
| Read-only inventory and support report | Users need to know which harnesses, versions, roots, and adapters alpha-AOS will touch before any mutation | MEDIUM | **J1:** Run `alpha-aos inventory`; output identifies detected and unsupported targets, required runtime gaps, and redacted config roots without changing filesystem state |
| Deterministic, dry-run-first planning | A configuration manager must show the same ordered plan for the same inventory and stable lock | MEDIUM | **J1:** Run `alpha-aos install` twice against an unchanged fixture; normalized plans are identical, contain approvals/warnings, and produce no writes or package changes |
| Stable-lock install/reconcile | An end-user install must use reviewed exact versions and hashes, never a mutable candidate | HIGH | **J1:** Apply the plan; only selected targets change, deployed sources match the stable lock, and a second plan reports `CURRENT` |
| Native configuration preservation | The control plane must merge only owned entries and preserve unrelated user settings and comments where the native format permits | HIGH | **J1/J6:** Seed representative JSON, TOML, and YAML with unrelated entries; install and remove leave those bytes or semantic entries intact |
| Scope and provenance visibility | Users must be able to tell global, project-local, isolated-runtime, and user-owned resources apart | MEDIUM | **J2/J3:** `status --json` identifies owner, source scope, target harness, selected version/hash, discovery state, and any unsupported guarantee |
| Safe update flow | Preview must be truly non-mutating; apply must reconcile the reviewed stable lock only | HIGH | **J5:** Run the update wrapper without `--apply`; source checkout, global link, packages, and managed files remain unchanged. Apply a promoted lock and verify only the reviewed delta |
| Complete removal/uninstall flow | A public installer that cannot cleanly uninstall is operationally incomplete | HIGH | **J6:** Preview and apply project-pack removal and global target uninstall; only exact alpha-AOS-owned unchanged artifacts are removed and repeated removal is a no-op |
| Conservative rollback | Failed or regretted managed writes need a recoverable, inspectable path | HIGH | **J7:** List a transaction, preview restoration, apply it, and verify exact prior bytes. Modify a post-transaction file first and verify rollback refuses to overwrite it |
| Status and doctor with actionable findings | Users need a fast static view and a deeper diagnosis that distinguishes configuration, discovery, credentials, and execution | HIGH | **J8:** `status` performs local inspection; `doctor` reports coded findings; an explicit canary mode performs read-only native calls and records pass, fail, or blocked with remediation |
| Secret-safe plans, journals, and diagnostics | Configuration tooling must not expose credential values through normal or failure output | HIGH | **J1/J4/J8:** Inject sentinel secrets into the environment and subprocess output; terminal, JSON, lock, journal, and saved evidence contain neither value nor secret-bearing URL |
| Honest cross-platform support | Windows, macOS, and Linux are part of the product promise | HIGH | **J9:** The same fixture suite passes on all three hosted OS runners; release evidence names the exact runner images and adapter versions tested |
| Honest harness/surface support matrix | “Supported” must mean a proven native route, not a simulated parity layer | MEDIUM | **J9:** Every claimed harness/surface has at least one real-host canary; unproven native semantics are reported as unsupported or limited and fail closed where safety depends on them |
| Directory-level opt-out | A user must be able to work in a selected directory without inheriting the alpha-AOS-managed global stack | HIGH | **J4:** Create a trusted `project-only` policy, sync an external runtime, run its doctor, and launch a harness with global managed skills, MCPs, hooks, memory, and guidance absent |
| Clear boundary between configuration isolation and sandboxing | Users must not mistake process-level configuration isolation for host security | LOW | **J4:** Plan and doctor label `project-only` as configuration isolation; requesting `sealed` without an OS/container adapter exits non-zero and never falls back |

### Differentiators (Competitive Advantage)

These features realize the core value beyond a conventional dotfile installer.

| Feature | Value Proposition | Complexity | Observable acceptance flow |
|---|---|---:|---|
| Native implicit use of low-risk capabilities | Users get useful documentation/research behavior without learning a universal alpha-AOS command or naming an MCP | HIGH | **J2:** In a fresh harness session, ask a version-sensitive library question without naming any skill/tool; trace proves native skill selection and the appropriate read-only MCP call. A negative control prompt causes neither call |
| Deterministic project evidence and capability packs | Polyglot projects receive only relevant capabilities without model guesswork or repetitive manual setup | HIGH | **J3:** A fixture with positive framework plus entrypoint evidence selects the expected pack; a near-miss fixture does not. Evidence and pack order are stable in text and JSON output |
| Transactional project-local sync | Project packs become reproducible, isolated, and safely removable instead of ad hoc copied files | HIGH | **J3:** Preview `project sync`, apply from an exact version/hash allowlist, verify native project provenance, then interrupt or fail a write and confirm rollback restores the pre-sync state |
| Evidence-to-use proof chain | alpha-AOS can prove a capability was not merely copied but discovered and exercised | HIGH | **J2/J3/J8:** Status records `available`, `discovered`, and `canary` independently; a broken skill description or zero-tool MCP is visibly not promoted to “healthy” |
| Explicit GSD must-run gates | Risk-sensitive checks become deterministic while optional skills remain naturally selected | HIGH | **J10:** Introduce an auth or migration change; plan selects exactly one check engine, GSD verify cannot pass without its evidence, failure blocks the phase, and unrelated work does not acquire the gate |
| Single-engine de-duplication | Native and ECC checks do not both run for the same obligation, reducing cost and contradictory results | MEDIUM | **J10:** On a harness with native security review, policy selects native or ECC explicitly; trace contains one engine and one normalized gate result |
| Isolation with reviewed environment allowlist | Opt-out also prevents unrelated ambient credentials from leaking into `project-only` processes | HIGH | **J4:** Launch with harmless and secret sentinel variables; only named authentication/runtime variables required by the chosen harness are present, and the plan shows names/policy without values |
| Safe stale-evidence lifecycle | Repository changes do not cause surprise deletion or loss of a deliberately retained pack | MEDIUM | **J3/J6:** Remove the triggering dependency; status marks the pack `STALE`, makes no deletion, and requires an explicit removal preview and apply |
| Capability equivalence through native adapters | Users receive the same logical outcome across different harness mechanisms without pretending file layouts are identical | HIGH | **J2/J9:** Per-harness contract proves native discovery and use through `SKILL.md`, extension, plugin, or CLI adapter as appropriate; reports expose semantic differences |
| Cross-harness GSD ownership discipline | A single workflow/state writer prevents corrupt `.planning/` transitions while other harnesses remain useful workers | MEDIUM | **J11:** Start a brownfield cycle, switch workers through a file-based handoff, and verify only the active GSD controller writes phase state; Hermes never becomes a state writer |
| Representative real-host release evidence | The release claim covers actual signed-in harness behavior, not only synthetic filesystem fixtures | HIGH | **J9/J11:** CI artifacts plus real-host traces cover every supported surface at least once and a complete brownfield GSD cycle before the stable lock is frozen |

## User Journeys and Test Oracles

### J1 — First Install and Reconcile

1. User runs inventory and a dry-run install for a subset of detected harnesses.
2. Plan states target scope, exact stable versions/hashes, owned destinations, external package effects, approvals, and limitations.
3. User applies; alpha-AOS snapshots managed-file targets, serializes shared-root writes, verifies native configuration, and journals only non-secret metadata.
4. User restarts affected harnesses and runs status/doctor.
5. Repeating the plan reports no change.

**Pass oracle:** no mutation before apply; no candidate lock; no secret values; exact stable-lock match; unrelated settings survive; partial failure rolls back managed files and prominently reports external package changes that remain.

### J2 — Native Optional Capability Use

1. Start a fresh session in each supported surface.
2. Confirm the capability is listed at the intended global scope.
3. Ask a task-intent prompt without naming the skill or MCP.
4. Capture the native skill-load/tool trace and validate a meaningful read-only result.
5. Run a negative-control prompt and an explicit invocation control.

**Pass oracle:** relevant intent uses the harness-native route; irrelevant intent does not; explicit invocation still works when supported; unsupported implicit semantics are reported rather than emulated by a universal proxy.

### J3 — Detect, Sync, Use, and Retire a Project Pack

1. Open a representative fixture and run `alpha-aos project detect` and `project plan`.
2. Review sorted positive evidence and selected pack; ambiguous absence never counts as positive evidence.
3. Run `project sync` without apply, then apply only an allowlisted Markdown-only pack or explicitly approve higher-risk changes.
4. Verify project-local native discovery and invoke a representative task.
5. Remove the triggering evidence; observe `STALE`, not automatic deletion.
6. Preview and apply `alpha-aos project remove <pack>`.

**Pass oracle:** only the intended project scope changes; lock records evidence/version/hash/targets; native provenance and invocation pass; user-modified or unowned files block removal; a second sync/remove is idempotent.

### J4 — Directory Opt-Out and Project-Only Launch

1. Preview and apply a trusted `project-only` manifest with explicit harness, skill, and MCP allowlists.
2. Sync the external generated runtime and run isolation doctor.
3. Launch through `alpha-aos project run <harness> <project> --apply`.
4. Query native skill, MCP, hook, workflow-guidance, and memory surfaces.
5. Test environment sentinels and an explicitly permitted harness authentication variable.

**Pass oracle:** global alpha-AOS customizations are absent; only allowlisted project resources are visible; unrelated environment secrets are absent; limitations are explicit. This does not claim filesystem, network, or hostile-code containment.

### J5 — Stable Update

1. Run the update preview from a clean source checkout.
2. Confirm the checkout, global CLI link, packages, and configuration are byte-for-byte unchanged.
3. Attempt update from a dirty checkout and verify refusal.
4. Apply a reviewed stable-lock promotion; candidate data remains maintainer-only.
5. Run doctor and canaries for changed components.

**Pass oracle:** preview is genuinely read-only; apply is fast-forward/reproducible; failed canaries stop rollout; unchanged targets remain untouched.

### J6 — Project Removal and Global Uninstall

1. Preview pack removal, isolated-runtime clean, single-target uninstall, and full managed-stack uninstall.
2. Review owned files, preserved user entries, non-reversible external package effects, and rollback availability.
3. Apply one scope at a time.
4. Run status/doctor and inspect native harness lists.

**Pass oracle:** only owned and unchanged resources disappear; shared user configuration remains valid; modified managed artifacts produce a refusal with remediation; authentication and harness applications are never removed; repeated apply is safe.

### J7 — Rollback and Recovery

1. List operation IDs and preview one rollback.
2. Apply when all targets still match recorded post-transaction hashes.
3. Repeat after editing one target.
4. Simulate process interruption and resume diagnosis.

**Pass oracle:** exact prior bytes return in the clean case; drift blocks all rollback writes before the first mutation; interrupted journals are diagnosed; retained package-manager changes get explicit recovery instructions.

### J8 — Status, Doctor, and Canary

1. Run `status` offline for a quick, non-mutating state summary.
2. Run `doctor` for adapter, root, hash, merge, bridge, hook, and credential-name checks.
3. Opt into a live canary for native discovery and meaningful read-only invocation.
4. Test blocked provider quota/auth separately from misconfiguration.

**Pass oracle:** output distinguishes selected, available, discovered, invoked, blocked, stale, unsupported, and mandatory-gate states; JSON is stable and redacted; exit codes separate warning from error.

### J9 — Cross-OS and Cross-Harness Verification

1. Run deterministic fixtures on Windows, macOS, and Linux with synthetic homes and every known config-root variable redirected.
2. Verify real shared roots are unchanged before and after fixtures.
3. Run representative real-host canaries so every supported harness/surface is exercised on at least one real host.
4. Publish a redacted coverage manifest with OS, harness/surface, adapter, locked version, and proof level.

**Pass oracle:** all three OS fixtures pass; every support claim has a real canary; missing combinations remain visibly unverified rather than inferred.

### J10 — Mandatory GSD Gate

1. Create a change with deterministic risk evidence, such as an auth boundary or database migration.
2. GSD planning attaches the matching gate and states its failing direction.
3. Execute the selected native or ECC engine once.
4. Verify success evidence, then repeat with missing and failing evidence.

**Pass oracle:** success advances; missing/failed evidence blocks; exactly one engine runs; a low-risk unrelated change receives no mandatory gate.

### J11 — Brownfield Release Proof

1. Run discuss → plan → execute → verify → ship on a real brownfield project.
2. Exercise one optional native capability, one project-local pack, one mandatory gate, and one cross-harness handoff.
3. Freeze only the exact versions, hashes, adapters, and behaviors that passed.

**Pass oracle:** one GSD state writer, traceable capability routing, green tests/gates, successful safe removal rehearsal, and a reproducible release artifact set.

## Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---|---|---|---|
| Universal invocation proxy | One apparent API for every harness | Overrides native selection, hides harness differences, creates a new single point of failure, and contradicts the confirmed hybrid model | Thin native adapters for discovery/provisioning; GSD integration only for mandatory gates |
| Install every ECC profile, rule pack, and MCP everywhere | Maximizes apparent capability count | Context bloat, routing collisions, duplicate workflow ownership, larger attack surface | Three global capabilities plus evidence-matched project packs |
| Treat file/config presence as success | Easy to automate | Does not prove native discovery, load, tool availability, or actual use | Four-level acceptance ladder with a representative canary |
| Make every capability mandatory | Predictable-looking execution | Wastes time/cost and destroys intent-driven native behavior | Optional native activation by default; narrow risk-based GSD gates |
| Let the LLM decide which pack to install | Feels adaptive | Non-reproducible, hard to audit, vulnerable to repository text, and impossible to lock | Positive file/dependency/config evidence evaluated by deterministic code |
| Automatically delete packs when evidence disappears | Keeps directories tidy | Stale or temporarily absent evidence can destroy intentional state or user edits | Mark `STALE`; require explicit dry-run removal |
| Silently downgrade unsupported harness parity | Avoids visible gaps | Creates false safety claims and brittle hidden behavior | Explicit `unsupported`/`limited` status with fail-closed policy |
| Call `project-only` a sandbox | Reassures users | Process configuration cannot guarantee host filesystem, network, or hostile-code isolation | Describe it as configuration isolation; keep `sealed` fail-closed until a real adapter exists |
| Copy authentication or inherit the full environment into isolated runs | Makes launch frictionless | Leaks unrelated secrets across project boundaries | Reviewed environment-name allowlist; user-managed authentication |
| Auto-remove or auto-downgrade external packages during rollback | Promises full reversibility | Package-manager state may be shared or changed after install | Roll back owned files; record verified external changes and provide explicit recovery steps |
| Run shared-root installers in parallel | Faster in theory | Multiple runtimes can touch the same global roots and corrupt fixtures or snapshots | Parallelize independent read-only checks; serialize shared-root mutation |
| Complete live 3 OS × every surface matrix for v0.1.0 | Maximum coverage | High operational cost delays closure without proportional evidence | Three-OS fixtures plus representative real hosts and one live proof per claimed surface |
| Install/authenticate harness applications | Turnkey onboarding | Expands scope into vendor account, licensing, and credential lifecycle | Inventory and configure already-installed, signed-in harnesses |
| Hosted control plane and centralized telemetry | Fleet visibility | Introduces accounts, secret custody, privacy policy, and operations unrelated to the local v0.1.0 thesis | Local redacted evidence artifacts and native diagnostics |

## Feature Dependencies

```text
Stable catalog + integrity lock
    └──> inventory
          └──> deterministic plan / dry-run
                └──> owned-root transaction + snapshot + journal
                      ├──> install/update
                      ├──> project sync/remove
                      └──> rollback/uninstall

Versioned harness capability contract
    ├──> native discovery proof ──> implicit-use canary
    ├──> project-scope renderer ──> project pack proof
    └──> opt-out launch adapter ──> isolation doctor

Positive evidence detector + project manifest + exact allowlist
    └──> project pack plan ──> transactional sync ──> native use ──> stale/remove lifecycle

Risk evidence + single-engine policy + GSD gate adapter
    └──> mandatory gate record ──> fail-closed verify/ship

Configuration-root isolation + environment allowlist + external generated runtime
    └──> project-only opt-out

Three-OS fixtures + real-host canaries + brownfield cycle
    └──> support claims ──> stable-lock freeze ──> v0.1.0 release
```

### Dependency Notes

- **Native implicit use requires a versioned harness capability contract:** installation paths alone cannot establish discovery or invocation semantics.
- **Project sync requires transactions before apply:** implementing copy operations first would create a second, weaker mutation path and make removal unsafe.
- **Removal requires ownership and provenance:** alpha-AOS can delete only what it can prove it owns and what still matches the applied result.
- **Mandatory gates require deterministic risk evidence and single-engine selection:** otherwise the gate is probabilistic or duplicated.
- **Project-only opt-out requires both config-root exclusion and environment filtering:** either half alone leaves a major inheritance channel.
- **Release claims require fixtures and canaries:** hosted runner success proves portable filesystem/config logic; real-host traces prove native harness behavior.

## MVP Definition

### Launch With (v0.1.0)

- [ ] Deterministic inventory, stable-lock plan, dry-run, apply, idempotent reconcile, status, and redacted doctor.
- [ ] Safe stable update with a genuinely non-mutating preview and candidate/stable separation.
- [ ] Project evidence detection plus transactional project-local sync for representative WEB, API/data, infrastructure, agent/AI, security, and scientific fixtures.
- [ ] Native discovery and actual-use proof for global optional capabilities and synced project packs on every claimed surface.
- [ ] Explicit GSD security/migration-sensitive gates with missing/failing checks blocking and single-engine de-duplication.
- [ ] Directory `project-only` opt-out that excludes global alpha-AOS skills, MCPs, hooks, memory, and workflow guidance and filters the environment through a reviewed allowlist.
- [ ] Project pack removal, isolated-runtime clean, target/global uninstall, conservative rollback, drift refusal, and external-package recovery reporting.
- [ ] Windows/macOS/Linux fixture matrix, representative real-host canaries, one live validation per supported surface, and one complete brownfield GSD cycle.
- [ ] Honest support/limitation matrix and fail-closed `sealed` behavior.

### Add After Validation (v0.1.x)

- [ ] Resumable long-running operations with progress persistence — add if real fixture/install timing makes interruption recovery a routine user problem.
- [ ] Additional repository-owned skills on targets whose native invocation semantics become proven — add surface by surface, never by simulated parity.
- [ ] More project packs — add only when concrete repositories supply unambiguous positive evidence and a representative invocation oracle.
- [ ] Optional machine-readable release attestation bundle — add after the first support coverage manifest stabilizes.

### Future Consideration (v0.2+)

- [ ] OS/container-backed `sealed` execution — requires real filesystem, environment, network, and process enforcement plus platform-specific threat validation.
- [ ] Additional harness families — defer until current adapter, removal, and proof contracts are frozen.
- [ ] Organization policy/fleet management — defer until a local product proves demand; do not centralize credentials as a side effect.
- [ ] Common cross-harness telemetry — defer until native metrics can be normalized without capturing prompts, responses, or tool content.

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---|---:|---:|---:|
| Deterministic dry-run/install/reconcile | HIGH | HIGH | P1 |
| Transactional project sync | HIGH | HIGH | P1 |
| Native discovery and use proof | HIGH | HIGH | P1 |
| Mandatory GSD gates | HIGH | HIGH | P1 |
| Directory opt-out plus environment allowlist | HIGH | HIGH | P1 |
| Safe remove/uninstall/rollback | HIGH | HIGH | P1 |
| Status/doctor state separation | HIGH | HIGH | P1 |
| Three-OS fixtures and real-host canaries | HIGH | HIGH | P1 |
| Additional owned-skill surfaces | MEDIUM | MEDIUM | P2 |
| Resumable operation progress | MEDIUM | HIGH | P2 |
| True sealed isolation | HIGH | HIGH | P3, post-v0.1.0 |
| Fleet/hosted management | LOW for current scope | HIGH | P3 |

## Native Harness Capability Baseline

This is not a promise that every surface behaves identically. It establishes why alpha-AOS must preserve native semantics and test each target.

| Harness | Official native baseline | alpha-AOS v0.1.0 use |
|---|---|---|
| Codex | Agent Skills use `SKILL.md`; automatic selection is default and can be disabled in skill UI/policy metadata; project and repository-ancestry roots participate in precedence | Keep optional low-risk skills native; verify both implicit and explicit controls; record source scope |
| Claude Code | Skills can be model- and user-invoked by default; frontmatter and `skillOverrides` can restrict model invocation; safe mode provides a customization-disabled control | Use native policy rather than patching third-party skill bytes; compare configured and safe-mode behavior where useful |
| Antigravity | Global and workspace skill scopes use progressive discovery; project MCP configuration exists; GUI/IDE and CLI surfaces have separately documented customization paths | Treat each surface as a distinct canary target even where config is shared |
| Pi Agent | Global and trusted-project skills are discovered natively; descriptions are exposed progressively; explicit skill invocation and skill-disabling controls exist | Use Pi's native skill/extension mechanisms and explicit project paths, not a copied Markdown assumption |
| Hermes Agent | Project skills have visible provenance and high precedence; project discovery is trust-controlled; native list/audit/uninstall facilities exist | Keep Hermes worker-only for GSD state; verify native project skill visibility/use separately from provider quota |

## Sources

Primary project contract:

- [Project definition and v0.1.0 requirements](../PROJECT.md) — HIGH confidence, current milestone authority.
- [Authoritative stack decision](../../docs/alpha-vibe-stack-codex.md) — HIGH confidence for confirmed product decisions and acceptance boundaries.
- [Current product behavior](../../README.md) — HIGH confidence for implemented baseline; current limitations cross-checked against codebase concerns.
- [Codebase concerns](../codebase/CONCERNS.md) — HIGH confidence for known gaps as mapped on 2026-09-02.

Current primary ecosystem sources:

- [OpenAI Codex repository: skill invocation policy and root resolution](https://github.com/openai/codex) — MEDIUM confidence via Context7, cross-checked against current repository sources.
- [Claude Code skills documentation](https://code.claude.com/docs/en/skills) and [CLI reference](https://code.claude.com/docs/en/cli-reference) — MEDIUM confidence via Context7, official documentation.
- [GSD Core installation/profile documentation](https://github.com/open-gsd/gsd-core/blob/next/docs/how-to/install-minimal-and-add-skills.md) and [installer source](https://github.com/open-gsd/gsd-core/blob/next/bin/install.js) — MEDIUM confidence via Context7, official repository.
- [Pi Skills documentation](https://pi.dev/docs/latest/skills) — MEDIUM confidence via web discovery, official documentation.
- [Hermes Agent Skills documentation](https://hermes-agent.nousresearch.com/docs/user-guide/features/skills) — MEDIUM confidence via web discovery, official documentation.
- [Google Antigravity Skills documentation](https://www.antigravity.google/docs/skills/) and [MCP documentation](https://antigravity.google/docs/mcp/) — MEDIUM confidence via web discovery, official documentation.
- [GitHub Actions matrix documentation](https://docs.github.com/actions/writing-workflows/choosing-what-your-workflow-does/running-variations-of-jobs-in-a-workflow) and [Node.js CI documentation](https://docs.github.com/en/actions/tutorials/build-and-test-code/nodejs) — MEDIUM confidence via web discovery, official documentation.

## Confidence and Gaps

Overall confidence is **MEDIUM**. The product contract and current implementation gaps are high-confidence local evidence. Native skill scope and invocation claims are grounded in current official documentation, but harness behavior is version-sensitive and documentation does not prove installed real-host behavior. That gap is intentionally converted into v0.1.0 canary requirements.

Open questions for phase-specific research:

- Which exact native trace or machine-readable event is reliable for implicit skill load on each supported surface?
- Which Antigravity guarantees are shared across GUI, IDE, and CLI, and which require separate configuration/rendering adapters?
- Which minimal environment variables are necessary for each harness to remain authenticated in `project-only` mode without inheriting unrelated secrets?
- How should package-manager recovery be expressed per GSD, ECC runtime, and Pi bridge when managed-file rollback succeeds but an external version remains changed?
- Which project-pack features are safe for unattended exact-hash Markdown-only sync on every target, and which targets lack an enforceable manual-only policy?

---
*Feature research for: alpha-AOS v0.1.0*
*Researched: 2026-09-03*
