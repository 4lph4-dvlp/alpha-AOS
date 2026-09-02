# Pitfalls Research

**Domain:** Cross-platform, multi-harness AI-agent configuration control plane
**Milestone:** alpha-AOS v0.1.0 completion
**Researched:** 2026-09-03
**Confidence:** MEDIUM — repository risks are directly evidenced; current harness behavior was cross-checked against primary documentation, but several harness surfaces still require live-host proof.

## Risk Model and Recommended Phase Names

This document separates **portable control-plane risks** from **harness-specific limitations**. The roadmap should use these phase labels (or equivalent boundaries):

1. **Filesystem and transaction safety** — canonical paths, ownership, atomic writes, locking, journals, redaction.
2. **Project evidence and pack lifecycle** — deterministic detection, project-root identity, apply/remove, stale evidence.
3. **Native harness adapters and optional routing** — native discovery, implicit low-risk invocation, MCP calls, honest support matrix.
4. **Mandatory GSD gates** — deterministic security, migration, release, and single-state-writer checks.
5. **Opt-out isolation and environment policy** — launcher adapters, environment allowlist, negative-sentinel tests.
6. **Uninstall and recovery** — external package pre-state, drift-aware removal, crash recovery and operator guidance.
7. **Cross-platform and live-harness release validation** — three-OS fixtures, real-host canaries, brownfield cycle, frozen support evidence.

The ordering is a safety dependency, not a feature preference: project sync and uninstall must not mutate files until Phase 1 boundaries and recovery invariants exist; implicit routing cannot be accepted as a gate; and parity claims must wait for Phase 7 live evidence.

## Critical Portable Pitfalls

### Pitfall 1: Lexical containment passes while the filesystem escapes the managed root

**Confidence:** HIGH for the repository exposure; MEDIUM for cross-filesystem edge behavior.

**What goes wrong:** A target string is lexically inside an allowed root, but an existing parent is a symlink, Windows junction/reparse point, bind mount, or replaced path component. Apply, rollback, cleanup, or uninstall then writes or deletes outside alpha-AOS ownership. A `realpath` check alone also leaves a check/use race if another process can swap a path after validation.

**Why it happens:** Current containment helpers use `resolve()` plus `relative()`. Node documents that `realpath` resolves symbolic links but also notes that canonical pathnames are not necessarily unique; Windows documents that junctions can cross local volumes and that reparse points change ordinary file-operation behavior. [`fs.rm`](https://nodejs.org/docs/latest-v24.x/api/fs.html#fsrmpath-options-callback) is deliberately equivalent to recursive removal and supplies no ownership boundary by itself. See [Node.js filesystem documentation](https://nodejs.org/docs/latest-v24.x/api/fs.html), [Microsoft junction guidance](https://learn.microsoft.com/en-us/windows/win32/fileio/hard-links-and-junctions), and [reparse-point behavior](https://learn.microsoft.com/en-us/windows/win32/fileio/reparse-points-and-file-operations).

**Prevention:** Resolve and validate the existing allowed root and every existing parent immediately before each mutation; reject symlink/reparse components for managed trees unless the exact resolved target is explicitly owned. Reject an unresolvable root rather than falling back to lexical validation. For deletion, require all of: canonical containment, a validated alpha-AOS ownership marker, expected project/operation identity, and current hash match. Serialize mutations per root and revalidate after acquiring the lock. Treat network filesystems and hostile concurrently writable directories as unsupported for automatic mutation unless an OS-specific handle-relative implementation is added.

**Warning signs:** A path passes `relative()` tests but `realpath()` leaves the root; a junction fixture changes a file outside the fixture; a root or parent changes identity between plan and apply; cleanup accepts an unmarked directory; a path containing a Windows drive-relative, UNC, device-prefix, or case-variant form reaches a mutation function.

**Verification evidence:** Tests must create a symlinked parent on Unix and a directory junction/reparse fixture on Windows, point them outside the allowed root, and prove plan/apply/remove/rollback all fail without changing an outside sentinel. Repeat with a swapped parent between plan and apply, broken/cyclic links, a different volume, and an unresolvable root. Record canonical roots and rejection reason without recording user-specific absolute paths.

**Phase to address:** Phase 1, before enabling project sync; re-run in Phases 6 and 7.

---

### Pitfall 2: Project evidence or installed packs leak across repository boundaries

**Confidence:** MEDIUM.

**What goes wrong:** Detection performed in one repository causes a pack to be installed in a parent workspace, sibling repository, nested repository, worktree, or user scope. Conversely, ancestor discovery makes a project appear to own a skill supplied by a parent. A stale positive signal can leave a now-inappropriate pack active; automatic cleanup based on disappeared evidence can delete user files.

**Why it happens:** Several harnesses intentionally search multiple scopes and ancestors. Codex has global and repo-scoped guidance and skills, with closer guidance taking precedence; Pi discovers project skills from the working directory through ancestors; Hermes gives project skills the highest precedence. A path-derived, lowercased project ID is not a portable repository identity for case-sensitive filesystems, renamed directories, symlink aliases, or worktrees. See [Codex customization](https://developers.openai.com/codex/concepts/customization), [Pi skill discovery](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/skills.md), and [Hermes project-local skills](https://hermes-agent.nousresearch.com/docs/user-guide/features/skills).

**Prevention:** Bind detection to an explicit canonical project root and record the root-selection reason (Git root, explicit override, or standalone directory). Never cross a nested VCS boundary. Normalize persisted relative paths to portable `/` form, but use native paths for filesystem calls. Store evidence with detector version, source file identity/hash, positive and negative reasons, selected pack, destination, and harness. Install only beneath an alpha-AOS-owned project subdirectory. Evidence disappearance marks a pack **stale**; only an explicit, hash-checked remove may delete it. Do not infer ownership from a matching filename or skill name.

**Warning signs:** The same plan changes when invoked from a subdirectory; two sibling repositories share a project ID or runtime root; `AGENTS.md` alone activates an agent-runtime pack; a nested repository sees parent packs; a pack destination is outside the selected Git root; detector output lacks negative evidence and root provenance.

**Verification evidence:** A fixture matrix must cover monorepos, nested repos, worktrees, symlink aliases, renamed roots, repositories with only generic agent instruction files, and removed evidence. `detect` and `plan` must be byte-stable across repeated runs and working subdirectories. Apply must modify only the selected project; stale evidence must produce no deletion; remove must preserve same-name user files and neighboring packs.

**Phase to address:** Phase 2, with boundary primitives from Phase 1.

---

### Pitfall 3: Model-selected invocation is mistaken for a mandatory guarantee

**Confidence:** MEDIUM, supported independently by current Claude, Codex, and Pi documentation.

**What goes wrong:** A security review, migration check, release check, or MCP lookup is considered complete because a skill was installed, its description matched, or the model often invoked it in demos. A different prompt, model, context pressure, compaction event, or harness silently skips the capability.

**Why it happens:** Implicit invocation is intentionally relevance-driven. Codex says clear descriptions improve triggering reliability; Pi explicitly says models do not always load a matching skill; Claude distinguishes guidance from permissions/hooks used when a guarantee is required. See [Codex customization](https://developers.openai.com/codex/concepts/customization), [Pi skills](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/skills.md), and [Claude configuration diagnostics](https://code.claude.com/docs/en/debug-your-config).

**Prevention:** Keep native implicit selection only for optional, low-risk global capabilities. Represent mandatory checks as explicit GSD gate records: gate ID, deterministic trigger evidence, selected engine, command/tool invocation, version/hash, exit status, timestamp, and artifact links. A gate is satisfied only by machine-checkable evidence; “skill available,” “agent said it reviewed,” or absence of findings is not evidence. Fail closed when the required engine is unsupported or unavailable, and allow a documented waiver rather than silent downgrade.

**Warning signs:** Acceptance tests assert only that a skill appears in a list; prompt wording changes pass/fail; no gate artifact names the engine or version; the same risky change can ship after the model answers without tool calls; multiple security engines run opportunistically and disagree; a mandatory check is encoded only in a skill description or `AGENTS.md`.

**Verification evidence:** Use positive and negative risky-change fixtures for authentication, command execution, schema migration, and release. Prove the explicit gate runs once even when the model never chooses the skill, blocks on non-zero/missing evidence, records a waiver when deliberately bypassed, and does not double-run a native and ECC engine. Separately run repeated paraphrase trials to measure optional invocation rate; report it as a rate, never a guarantee.

**Phase to address:** Phase 4; Phase 3 may measure optional invocation but must not certify mandatory behavior.

---

### Pitfall 4: Configuration merging corrupts, erases, or semantically changes user config

**Confidence:** HIGH for current custom-renderer risk; MEDIUM for future harness schema drift.

**What goes wrong:** JSON, YAML, or TOML remains parseable but comments, duplicate tables, quoting, ordering, unknown keys, platform-specific paths, or user-owned server entries are lost or changed. A partial parse error can reject an entire settings file or silently disable hooks. Concurrent harness writes can overwrite the plan-time version.

**Why it happens:** Native schemas and precedence rules differ, while current adapters contain hand-written format-specific merging. Claude documents that an invalid settings structure may reject the entire user/project/local settings file and make its hooks disappear. Codex uses TOML for MCP; Hermes uses a distinct YAML schema. See [Claude diagnostics](https://code.claude.com/docs/en/debug-your-config), [Codex MCP configuration](https://developers.openai.com/codex/mcp), and [Hermes MCP configuration](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/reference/mcp-config-reference.md).

**Prevention:** Use a real parser/AST for each format and change only the alpha-AOS-owned keys. Preserve unknown content and comments where the format library supports it; otherwise show the exact semantic diff and require approval. Validate both original and rendered documents against a harness/version schema. Re-read and compare the source hash immediately before write; abort on drift. After write, parse again, verify unrelated semantic content, and invoke the harness-native diagnostic. Never serialize the full rendered user config into JSON plans or journals.

**Warning signs:** Formatting churn far exceeds the managed stanza; comments disappear; a single-server sync removes other managed servers; unknown keys vanish; duplicate TOML tables collapse; `doctor` reports invalid settings; hooks or MCP entries disappear after an unrelated change; a planned source hash differs at apply.

**Verification evidence:** Golden fixtures must include empty, comments-heavy, Unicode, CRLF/LF, unusual quoting, duplicate/invalid keys, unknown future fields, legacy schemas, and user-owned entries for every harness. Assert semantic preservation, idempotence, source-hash compare-and-swap, parse validity, native diagnostics, and byte-for-byte rollback. Fuzz malformed inputs and require a no-write failure.

**Phase to address:** Phase 1 for transaction semantics; Phase 3 for every harness adapter; Phase 7 against installed versions.

---

### Pitfall 5: Partial install or unsafe uninstall leaves the machine worse than before

**Confidence:** HIGH for the current partial-rollback gap; MEDIUM for package-manager recovery details.

**What goes wrong:** External GSD/ECC/Pi package changes succeed, a later managed-file write fails, and rollback restores only alpha-AOS files. Uninstall then removes a pre-existing package, an upgraded user install, a drifted config stanza, or a directory containing user additions. A corrupt journal may disappear from normal status and strand an inconsistent state.

**Why it happens:** External installers are not part of the current file transaction. Package managers can remove what they installed for a named package, but they cannot infer whether alpha-AOS owns the pre-existing version or adjacent user configuration. See [npm uninstall](https://docs.npmjs.com/cli/v12/commands/npm-uninstall/) and the repository transaction/install implementation.

**Prevention:** Before external mutation, record package manager, exact command identity, resolved prefix, installed version/integrity, and whether alpha-AOS installed, upgraded, or merely adopted it. Recovery is an explicit compensating transaction: restore the exact verified prior version when known; otherwise retain the external change and emit a bounded manual recovery instruction. File uninstall must delete only journaled alpha-AOS-owned paths whose current hash matches the installed hash. Preserve drifted files and report them. Directory removal requires an ownership marker plus an empty-after-managed-removal check. Corrupt journals remain visible as `needs-recovery`, never silently excluded.

**Warning signs:** Install errors mention retained external changes without a recovery operation; uninstall proposes recursive deletion of a harness root; a package existed before install but no prior version is recorded; remove uses name matching instead of ownership/hash; rollback success is reported while external versions differ; corrupt journals vanish from status.

**Verification evidence:** Inject failures after every install step and process interruption between snapshot, write, journal append, and final status. Seed prior/newer package versions and user-modified managed files. Verify recovery restores known pre-state, refuses drift, preserves user additions, reports retained changes, and can resume or safely abandon an `applying` journal. Run install → update → remove → reinstall and prove the final machine state matches the initial snapshot where ownership permits.

**Phase to address:** Design invariants in Phase 1; complete user flows in Phase 6; power-loss and real-package canaries in Phase 7.

---

### Pitfall 6: `project-only` hides config files but still leaks ambient secrets or is marketed as a sandbox

**Confidence:** HIGH for current full-environment inheritance; MEDIUM for harness-specific residual sources.

**What goes wrong:** A launched harness cannot see global alpha-AOS config but still receives unrelated tokens, credential helpers, cloud profiles, proxy variables, debug flags, or secret-bearing paths from the parent environment. The child retains normal filesystem and network access, so users mistake configuration isolation for containment.

**Why it happens:** Node child processes use the supplied `env`; current launch code spreads the entire parent environment before applying adapter variables. Node also documents Windows environment-key case folding, making duplicate case variants dangerous. Hermes explicitly documents that ignoring user config still loads credentials from `.env`. See [Node child processes](https://nodejs.org/docs/latest-v24.x/api/child_process.html), [Hermes CLI flags](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/reference/cli-commands.md), and [Hermes environment variables](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/reference/environment-variables.md).

**Prevention:** Construct a reviewed environment allowlist from scratch. Include only execution essentials (for example executable search, temporary directory, locale, terminal) and explicit per-harness authentication entries required for the selected run; normalize environment-key comparison case-insensitively on Windows. Strip alpha-AOS, MCP, cloud, package-registry, telemetry-content, and unrelated credential variables by default. Show variable **names and provenance only**, never values, in the launch plan. Keep `project-only` labeled “configuration isolation, not a security boundary”; keep `sealed` fail-closed until an OS/container adapter proves filesystem, network, process, and environment restrictions.

**Warning signs:** Launch code contains `{ ...process.env }`; doctor reports `environment: inherited`; a canary secret is visible in the child; the harness finds an unrelated user MCP or skill; documentation uses “sandbox,” “secure,” or “sealed” for process-only launch; `sealed` silently falls back to process mode.

**Verification evidence:** Seed unique sentinel variable names for each forbidden category and unique sentinel skills/MCP/hooks/memory in global locations. Launch every harness through the adapter and use a read-only probe to show sentinels are absent, allowed essentials work, and required auth is explicitly selected. Attempt filesystem and network access and record that `project-only` still allows them. Request `sealed` and prove the command refuses to launch without a real adapter.

**Phase to address:** Phase 5, with redaction primitives from Phase 1.

---

### Pitfall 7: Plans, diagnostics, subprocess failures, or evidence artifacts disclose secrets

**Confidence:** HIGH for the repository subprocess-output exposure.

**What goes wrong:** Credentials absent from rendered config still appear in command arguments, inherited environment dumps, stderr/stdout, URLs, debug logs, snapshots, journals, CI artifacts, or JSON plan output. Redacting a fixed list of known variable names misses bearer strings and provider-specific formats.

**Why it happens:** Third-party installers and MCP servers control their diagnostic output. Snapshots legitimately contain user config. Error paths often concatenate complete subprocess output. Harness debug commands can print resolved configuration and server stderr.

**Prevention:** Centralize structured subprocess capture with bounded output and redaction before exceptions, logs, or persistence. Redact all current credential values plus conservative key-name, authorization-header, URL query, private-key, and token-shape patterns. Pass secrets through environment or native credential stores, never command arguments. Store snapshots outside the repository with restrictive permissions; record only opaque snapshot IDs and hashes. Make `--json` output a deliberately safe schema, not serialization of internal plan objects. Run a final artifact scanner over logs, plans, journals, snapshots metadata, test output, and release bundles.

**Warning signs:** Error constructors append raw stdout/stderr; plan objects retain enumerable rendered configs; URLs contain query credentials; CI uploads debug directories; tests cover only a single literal secret; snapshot paths or user home paths appear in repository files.

**Verification evidence:** Use synthetic canary values in every ingress (environment, URL, header, config, child stdout/stderr, thrown error). Force success and failure paths, JSON and human output, rollback and doctor. Assert neither exact nor encoded canaries occur in captured output or repository artifacts while diagnostics retain actionable non-secret context.

**Phase to address:** Phase 1; exercise again in Phases 5–7.

---

### Pitfall 8: Concurrent writers or multiple GSD controllers corrupt state

**Confidence:** HIGH for the missing concurrency coverage; MEDIUM for harness scheduling behavior.

**What goes wrong:** Two alpha-AOS processes plan from the same bytes and overwrite one another, or two harnesses update `.planning/` concurrently. Individual atomic renames prevent torn files but do not prevent lost updates or conflicting workflow transitions. On some filesystems, rename behavior and crash durability differ; Node’s API does not provide a cross-process transaction.

**Why it happens:** The current journal is single-process and has no per-root lock. Atomic file replacement is confused with a multi-file transaction. Linux documents atomic replacement for `rename()` on a filesystem but also records filesystem-specific caveats; Windows replacement has different ACL and open-file constraints. See [Linux `rename(2)`](https://man7.org/linux/man-pages/man2/rename.2.html) and [Windows MoveFileEx](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-movefileexw).

**Prevention:** Acquire an operation lock keyed by canonical managed root and project ID before snapshot or apply. Include source hashes in the plan and revalidate under the lock. Detect stale locks by owner PID/start identity plus journal state, not age alone. Serialize all shared-root writes. Enforce one active GSD state writer per project with a lease/owner marker; workers may read and hand off but cannot transition GSD state. Document unsupported network filesystems or add explicit durability checks.

**Warning signs:** Parallel applies both report success; journal ordering is the only coordination; final config lacks one writer’s change; `.planning/STATE.md` transitions backward or has conflicts; a stale lock is deleted only because its timestamp is old.

**Verification evidence:** Start two processes with barriers so both plan before either writes; require one to wait or fail and the second to re-plan. Kill the lock owner and prove safe recovery. Run two harness controllers against one fixture and prove only the elected controller can mutate `.planning/`. Include Windows locked-file behavior and Linux/macOS interruption cases.

**Phase to address:** Phase 1 for mutation locks; Phase 4 for GSD ownership; Phase 7 for OS behavior.

## Harness-Specific Limitations and False-Parity Traps

“Supported” must be a versioned tuple of **harness + surface + OS + capability**, backed by native discovery and a meaningful read-only invocation. File presence, a renderer unit test, or success in another surface does not transfer.

| Harness/surface | Failure mode and early warning | Prevention | Required verification evidence | Phase | Confidence |
|---|---|---|---|---|---|
| Claude Code | Settings from local/project/managed scopes override user policy; safe mode still retains managed policy; a project MCP may await approval; connected MCP may expose zero tools; an invalid settings object can suppress hooks. Warning: `/status`, `/hooks`, `/skills`, or `/mcp` disagrees with the plan. | Inspect resolved scopes, keep mutations narrow, use terminal `claude doctor`, and treat `--safe-mode` as a customization control—not a universal clean-room guarantee. | Record version, `/status`, `/context`, `/skills`, `/hooks`, `/mcp`, tool count, approval state, and one read-only call before/after/opt-out. [Official diagnostics](https://code.claude.com/docs/en/debug-your-config) | 3, 5, 7 | MEDIUM |
| Codex CLI/IDE/app host | Repo and user skills are both discoverable; closer `AGENTS.md` wins; project MCP requires trusted project scope; implicit selection is relevance-driven. Warning: CLI passes but another Codex host or working directory differs. | Use repo-local `.agents/skills`, inspect actual source/provenance, and test the same Codex host configuration across the claimed clients. Do not turn a skill description into a gate. | Native skill listing/trace, resolved guidance chain, trusted-project state, MCP tool inventory, one read-only call, and repeated implicit-invocation trials. [Customization](https://developers.openai.com/codex/concepts/customization), [MCP](https://developers.openai.com/codex/mcp) | 3, 4, 5, 7 | MEDIUM |
| Antigravity CLI | CLI project skills may be found in `.agents/skills`, but this does not prove GUI/IDE invocation or a common config-root override. Warning: only `agy` has live evidence or adapter guarantees use undocumented environment behavior. | Treat CLI, GUI, and IDE as separate surfaces; probe versioned native paths and fail closed for unsupported opt-out guarantees. | Per-surface skill list, MCP list/tool count, read-only call, effective config source, and opt-out negative sentinel. [Google Antigravity skill codelab](https://codelabs.developers.google.com/antigravity/how-to-create-agent-skills-for-antigravity-cli) | 3, 5, 7 | MEDIUM for CLI; LOW until GUI/IDE canaries |
| Pi Agent | Pi discovers skills from multiple global/project/ancestor roots; matching models do not always load them. Core Pi documents no native MCP and expects an extension for MCP support. Warning: Markdown exists but bridge/extension is absent, or ancestor packs appear. | Use native project skill layout, explicit `--no-skills`/`--no-extensions` plus allowlisted `--skill` for opt-out launches, and pin/fixture-test the MCP bridge as a distinct component. | `/skill:name` forced invocation, repeated implicit trials, extension inventory, MCP initialize + tools/list + read-only call, ancestor leakage negative test. [Pi README](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/README.md), [Pi skills](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/skills.md) | 3, 5, 7 | MEDIUM |
| Hermes Agent | `--ignore-user-config` leaves credentials in `.env`; project skills override local/external skills; `--ignore-rules` affects rules/memory/preloaded skills but is not an environment scrub. Warning: opt-out child still sees a canary credential or project skill. | Use a minimal environment and isolated `HERMES_HOME`; use official safe/ignore flags only for the surfaces they document; keep Hermes worker-only for GSD state. | `hermes --help`/version, config and skill provenance, MCP tool inventory + read-only call, absent environment/rule/skill sentinels, attempted GSD write denied. [CLI flags](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/reference/cli-commands.md), [skills](https://hermes-agent.nousresearch.com/docs/user-guide/features/skills) | 3, 4, 5, 7 | MEDIUM |
| MCP across all harnesses | “Configured” or “connected” is reported as success despite zero tools, missing auth, wrong working directory, schema mismatch, or a write-capable tool surface wider than policy. | Validate initialize, non-empty `tools/list`, exact allowlist, read-only annotations as hints rather than trust, authentication, timeout, and one meaningful read-only call. | Redacted trace containing harness/version, server/package integrity, transport, discovered tool names/count, selected tool, response classification, and no credential material. | 3, 7 | MEDIUM |

## Cross-Platform Failure Modes

| Platform concern | Failure mode | Early detection and prevention | Verification | Phase | Confidence |
|---|---|---|---|---|---|
| Windows paths | Drive-relative paths, UNC/device prefixes, case-insensitive comparison, long paths, junctions, alternate executable extensions, and locked destination files invalidate POSIX assumptions. | Reject device namespaces for managed targets; canonicalize drive/UNC roots; compare with Windows semantics; resolve commands without hard-coded extensions; retry only documented transient errors. [Microsoft path rules](https://learn.microsoft.com/en-us/windows/win32/fileio/naming-a-file) | Junction, case-variant, space/Unicode, long path, UNC (read-only), locked-file, and `PATHEXT` fixtures on a real Windows host. | 1, 7 | MEDIUM |
| macOS filesystems | Default installations are often case-insensitive, but case-sensitive volumes exist; executable bits and quarantine/signing behavior can differ from Linux CI assumptions. | Preserve exact case, never lower-case portable identity unconditionally, and run a case-sensitive-volume canary where possible. | Mixed-case skill filename and hash-key tests plus real executable launch on macOS. | 1, 7 | MEDIUM |
| Linux filesystems | Case sensitivity, executable permission bits, symlinks, bind mounts, overlay/container filesystems, and rename behavior on network filesystems expose assumptions hidden on Windows/macOS. | Test permission failures, links/mount aliases, and same-filesystem temp files; declare unsupported filesystems when durability cannot be proven. | Real-host permission and interruption tests; container/overlay tests only if the capability is claimed. | 1, 7 | MEDIUM |
| Persisted paths and hashes | Native separators and CRLF/LF create different lock keys or hashes for equivalent generated content. | Persist normalized relative `/` paths; keep filesystem paths native; define whether hashes cover exact installed bytes or canonical source bytes and never mix the two. | Cross-OS golden lock produced from the same fixture, plus exact post-install byte hashes per OS where rendering differs. | 1, 2, 7 | HIGH |
| Shell/wrapper behavior | Syntax-only checks pass while quoting, argument forwarding, exit codes, `--apply`, spaces, and Unicode fail at runtime; current update wrappers can mutate during a nominal dry run. | Treat wrappers as product code; keep preview side-effect free all the way through bootstrap; invoke executables with argument arrays rather than assembled shell strings. | Execute install/update/status/remove wrappers from spaced/Unicode paths on all three OSes; snapshot checkout, global links, and config before dry-run and prove no change. | 6, 7 | HIGH |

## CI-Only Validation Blind Spot

### Pitfall 9: A green three-OS fixture matrix is presented as live cross-harness parity

**Confidence:** HIGH for the repository gap; MEDIUM for hosted-image drift.

**What goes wrong:** Synthetic config renderers and filesystem tests pass on `ubuntu-latest`, `macos-latest`, and `windows-latest`, while actual harness binaries reject flags, discover different roots, require trust/approval, keep cached state, need GUI restart, or expose no MCP tools. Hosted images are fresh managed VMs and their included software changes regularly; they do not reproduce a user’s long-lived profile. See [GitHub matrix jobs](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/run-job-variations) and [GitHub-hosted runners](https://docs.github.com/en/actions/concepts/runners/github-hosted-runners).

**Prevention:** Keep CI fixtures as the portable invariant layer, then maintain a canary ledger where each claimed harness/surface is live-tested on at least one representative host and each OS has at least one real host. Pin the exact harness version in evidence, record resolved config roots and diagnostic output, and expire evidence when a version or adapter contract changes. Unsupported cells must be explicit—not inferred from a related surface. Run one brownfield GSD cycle with a single writer and routing traces before freezing the release lock.

**Warning signs:** Support tables say “all harnesses” but link only to unit tests; Antigravity CLI evidence is reused for GUI/IDE; only a Windows workstation has real calls; CI never installs a harness; native versions/trust/approval states are absent; canary evidence has no expiry or version key.

**Verification evidence:** CI: all deterministic detectors, config golden files, transactions, fault injection, redaction, wrappers, and OS path fixtures. Live ledger: every supported surface has native discovery plus one meaningful read-only capability invocation; every opt-out adapter has negative sentinels; every mandatory gate has an explicit pass/fail artifact; every OS has install/status/remove/rollback canary. Release must fail if any claimed cell lacks current evidence.

**Phase to address:** Phase 7, with contracts supplied by Phases 1–6.

## Moderate Pitfalls

| Pitfall | What goes wrong | Prevention and early detection | Phase | Confidence |
|---|---|---|---|---|
| “Connected” MCP with zero tools | Process startup is mistaken for functional capability. | Require non-empty tool inventory and a real read-only call; record auth and allowlist separately. | 3, 7 | MEDIUM |
| Over-broad project detector | Generic files such as `AGENTS.md` activate AI/agent packs. | Require product-specific dependency/config/runtime evidence and negative fixtures. | 2 | HIGH |
| Automatic deletion on stale evidence | A removed dependency causes user-authored or still-needed pack files to disappear. | Mark stale, explain why, and require explicit hash-aware remove. | 2, 6 | HIGH |
| Capability duplication | Native and ECC security/research engines both run, increasing cost and producing conflicting results. | Router selects exactly one engine and records the selection reason. | 3, 4 | MEDIUM |
| Scope-precedence surprise | Project/local/managed settings override the user policy alpha-AOS wrote. | Native resolved-scope diagnostics are part of `doctor`; status reports effective, not intended, state. | 3 | MEDIUM |
| Source/hash drift after approval | A mutable package or renderer changes between preview and apply. | Exact version, integrity, renderer hash, cached artifact identity, and source-hash compare under lock. | 1, 2, 6 | HIGH |
| Mutable CI actions | A tag moves and changes privileged CI behavior outside a reviewed commit. | Pin actions to reviewed commit SHAs, especially candidate-update automation. | 7 | HIGH |
| Performance-driven unsafe concurrency | Slow sequential discovery leads to parallel writes to shared roots. | Cache read-only probes and parallelize only independent reads; serialize shared-root writes. | 1, 3 | HIGH |

## “Looks Done But Isn’t” Checklist

- [ ] **Project sync:** `--apply` works only after root canonicalization, source-hash compare, journal, lock, fault injection, rollback, and explicit stale-evidence behavior pass.
- [ ] **Project-scoped pack:** Native listing shows the expected source; a sibling/nested project negative test does not see it; remove preserves user drift.
- [ ] **Implicit capability:** Repeated intent-matched live prompts show measured invocation behavior. This is acceptance evidence only for optional capabilities.
- [ ] **Mandatory gate:** A deterministic gate artifact exists and blocks when the engine is skipped, missing, unsupported, or fails.
- [ ] **MCP support:** `tools/list` is non-empty and a meaningful read-only call succeeds in the claimed harness surface.
- [ ] **Opt-out:** Global skill, MCP, hook, memory, workflow, and environment canaries are absent; documentation still states filesystem/network access is inherited.
- [ ] **Uninstall:** Pre-existing packages and user changes survive; owned unchanged files are removed; drift and corrupt journals are reported.
- [ ] **Rollback:** Fault injection after each mutation boundary restores exact bytes or yields an explicit recoverable state without overwriting drift.
- [ ] **Cross-platform:** Runtime wrapper tests, path/link tests, and config golden files pass on Windows, macOS, and Linux—not merely syntax checks.
- [ ] **Cross-harness parity:** Each support cell has a harness version, OS, native diagnostic, real call trace, and expiry condition.
- [ ] **Secret safety:** Synthetic canaries are absent from console, JSON, logs, journals, snapshots metadata, CI artifacts, and repository files.
- [ ] **GSD ownership:** Only the elected controller can change `.planning/`; Hermes and other workers can hand off but cannot transition state.

## Recovery Strategies

| Failure | Recovery cost | Recovery steps |
|---|---|---|
| Managed file write fails before apply completes | LOW–MEDIUM | Stop all writers, inspect the visible journal, verify current hashes, roll back recorded files in reverse order, preserve drift, rerun doctor, then re-plan from current bytes. |
| External package changed but later install step failed | MEDIUM | Read recorded pre-state; restore the exact prior verified version if known. Otherwise retain the installed version, mark `needs-recovery`, and provide package-manager-specific manual steps. Never guess a prior version. |
| Config was corrupted | MEDIUM | Stop the harness, preserve corrupt/current bytes, restore the last verified snapshot, run parser/schema checks and native doctor, then reapply only the managed semantic stanza. |
| Uninstall encounters user drift | LOW | Leave the file/package in place, remove only unchanged owned entries, and report the exact logical item needing manual review without printing sensitive content. |
| Journal is corrupt or stuck `applying` | MEDIUM–HIGH | Never hide or auto-delete it. Quarantine automatic mutation for that root, reconstruct from snapshots and on-disk hashes, emit a recovery report, and require explicit acknowledgment before new writes. |
| Opt-out sentinel leaks | HIGH | Terminate the child, revoke/rotate the synthetic or real affected credential as appropriate, disable that adapter’s opt-out claim, fix the environment/config source, and rerun every negative-sentinel test. |
| Live harness contract changed | MEDIUM | Mark the versioned support cell unsupported, stop automated mutation for that adapter, update probes/renderers, and recertify discovery, invocation, opt-out, and uninstall on a real host. |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention phase | Release-blocking verification |
|---|---|---|
| Symlink/junction/path escape | 1 | Outside sentinel unchanged for Unix symlink and Windows junction fixtures; TOCTOU swap rejected. |
| Secret-bearing output and snapshots | 1 | Canary scan of all human/JSON/error/artifact paths returns zero matches. |
| Concurrent lost update | 1 | Two-process barrier test serializes or rejects stale apply. |
| Scope leakage and stale evidence | 2 | Monorepo/nested/worktree/sibling matrix has stable plans and no cross-root writes/deletes. |
| Config corruption and native schema drift | 3 | Golden fixtures preserve unrelated semantics; native doctor and real read-only call pass per adapter. |
| False cross-harness parity | 3 and 7 | Versioned support ledger contains independent evidence for every claimed surface. |
| Probabilistic invocation used as guarantee | 4 | Risky-change fixture is blocked even when no skill is model-selected. |
| Multiple GSD state writers | 4 | Non-controller mutation is denied and recorded. |
| Opt-out config or environment leakage | 5 | Per-harness negative-sentinel suite passes; sealed remains fail-closed. |
| Unsafe uninstall/external partial rollback | 6 | Prior installs and user drift survive; known pre-state is restored; unknown pre-state is retained and reported. |
| Wrapper/dry-run mutation | 6 and 7 | Full machine/config/source snapshot is unchanged after every preview path on all OSes. |
| CI-only validation | 7 | Three-OS CI plus representative real-host canaries and one brownfield GSD cycle are current. |

## Sources

Primary/current documentation:

- [Node.js v24 filesystem API](https://nodejs.org/docs/latest-v24.x/api/fs.html)
- [Node.js v24 child process API](https://nodejs.org/docs/latest-v24.x/api/child_process.html)
- [Microsoft: naming files, paths, and namespaces](https://learn.microsoft.com/en-us/windows/win32/fileio/naming-a-file)
- [Microsoft: hard links and junctions](https://learn.microsoft.com/en-us/windows/win32/fileio/hard-links-and-junctions)
- [Microsoft: reparse points and file operations](https://learn.microsoft.com/en-us/windows/win32/fileio/reparse-points-and-file-operations)
- [Microsoft: MoveFileEx](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-movefileexw)
- [Linux man-pages: rename(2)](https://man7.org/linux/man-pages/man2/rename.2.html)
- [npm uninstall](https://docs.npmjs.com/cli/v12/commands/npm-uninstall/)
- [Claude Code: debug your configuration](https://code.claude.com/docs/en/debug-your-config)
- [Claude Code: skills](https://code.claude.com/docs/en/skills)
- [Claude Code: settings](https://code.claude.com/docs/en/settings)
- [Codex: customization](https://developers.openai.com/codex/concepts/customization)
- [Codex: MCP](https://developers.openai.com/codex/mcp)
- [Codex: advanced configuration](https://developers.openai.com/codex/config-advanced)
- [Google Antigravity CLI Agent Skills codelab](https://codelabs.developers.google.com/antigravity/how-to-create-agent-skills-for-antigravity-cli)
- [Pi coding-agent README](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/README.md)
- [Pi skills](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/skills.md)
- [Pi extensions](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/extensions.md)
- [Hermes skills](https://hermes-agent.nousresearch.com/docs/user-guide/features/skills)
- [Hermes CLI commands](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/reference/cli-commands.md)
- [Hermes MCP configuration](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/reference/mcp-config-reference.md)
- [GitHub Actions: matrix jobs](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/run-job-variations)
- [GitHub Actions: hosted runners](https://docs.github.com/en/actions/concepts/runners/github-hosted-runners)

Repository evidence reviewed:

- `.planning/PROJECT.md`
- `.planning/codebase/CONCERNS.md`
- `.planning/codebase/TESTING.md`
- `docs/alpha-vibe-stack-codex.md`
- `src/core/transaction.ts`, `src/core/project.ts`, `src/core/isolation.ts`, `src/core/mcp.ts`, `src/core/install.ts`
- `src/adapters/isolation.ts`
- `test/transaction.test.ts`, `test/isolation.test.ts`, `test/mcp.test.ts`
- `.github/workflows/ci.yml`

---
*Pitfalls research for alpha-AOS v0.1.0*
*Researched: 2026-09-03*
