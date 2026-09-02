---
last_mapped_commit: f1ce41504ea94b699e71670d8cf9f6c0b02c9c34
last_mapped_at: 2026-09-02
---
# Codebase Concerns

**Analysis Date:** 2026-09-02

## Tech Debt

**Project synchronization is a deliberate stub:**

- Issue: `project sync --apply` always throws, while `detect` and `plan` only report results. The project workflow cannot reconcile detected project files or harness configuration.
- Files: `src/cli.ts`, `src/core/project.ts`
- Impact: Users cannot complete the project-level workflow advertised by the CLI; only isolation subcommands can mutate project state.
- Fix approach: Define ownership and transaction boundaries for project files, add a dry-run diff model, then implement apply/rollback with the same journal and hash checks used by `src/core/transaction.ts`.

**Sealed isolation has no execution adapter:**

- Issue: `sealed` policies are accepted and rendered, but every launch is blocked because the adapter only supports process execution.
- Files: `src/adapters/isolation.ts`, `src/core/isolation.ts`, `src/cli.ts`
- Impact: The strongest isolation mode is unusable; callers must understand that `project-only` is not a security boundary.
- Fix approach: Add a platform-specific container/OS sandbox launcher and verify network, environment, filesystem, and process restrictions before allowing a sealed launch.

**Owned skill distribution is incomplete across harnesses:**

- Issue: The owned `alpha-aos-ship` skill declares only Claude support, and `destinationFor`/`renderOwnedSkill` throw for every other harness.
- Files: `catalog/stack.yaml`, `catalog/stack.lock.json`, `src/core/owned-skills.ts`
- Impact: Codex, Antigravity, Pi, and Hermes users cannot receive the repository-owned workflow skill even though the general installer supports those harnesses.
- Fix approach: Add and hash-verify native renderers only where invocation semantics are proven; otherwise keep the catalog target list explicit and surface the limitation in install plans.

**External package changes are not transactionally reversible:**

- Issue: GSD, ECC, and Pi bridge installers run before managed file writes and are retained when a later step fails.
- Files: `src/core/install.ts`, `src/core/gsd-fixture.ts`, `src/core/ecc-fixture.ts`, `src/core/mcp-fixture.ts`
- Impact: A partially failed install can leave globally installed packages or harness-managed files at the locked version while alpha-AOS-owned files are rolled back.
- Fix approach: Record verified pre-install versions and provide an explicit, package-manager-aware recovery operation; report each retained external change prominently.

## Known Bugs

**Update bootstrap mutates the source checkout during a dry-run:**

- Symptoms: `scripts/update.sh` and `scripts/update.ps1` pull, run `npm ci`, build, and run `npm link` even without `--apply`.
- Files: `scripts/update.sh`, `scripts/update.ps1`
- Trigger: Run either update wrapper without `--apply`.
- Workaround: Use the CLI directly or run the wrapper only when source checkout and global npm link changes are acceptable.

## Security Considerations

**Lexical path checks do not resolve symlinked parents:**

- Risk: `resolve()` plus `relative()` validates textual containment, but a symlinked directory under an allowed root can redirect atomic writes or rollback copies outside that root.
- Files: `src/core/transaction.ts`, `src/core/isolation.ts`, `src/core/owned-skills.ts`, `src/core/mcp.ts`
- Current mitigation: Writes are atomic, roots are checked, and rollback validates post-write hashes.
- Recommendations: Resolve existing parent directories with `realpath`, reject symlinked path components (or validate their realpath), and use file-descriptor-relative operations where supported before applying or deleting files.

**Project-only launches inherit the complete process environment:**

- Risk: `project run --apply` passes `{ ...process.env, ...launch.env }`; project processes can receive unrelated credentials and other user secrets even when configuration roots are isolated.
- Files: `src/cli.ts`, `src/adapters/isolation.ts`, `src/core/isolation.ts`
- Current mitigation: Harness-specific config roots and flags hide many user configuration files; sealed mode is fail-closed.
- Recommendations: Build an explicit environment allowlist for project-only mode, redact sensitive variables by default, and show the effective environment policy in the plan.

**Subprocess diagnostics can expose sensitive values:**

- Risk: installer and fixture failures concatenate child-process stderr/stdout into thrown errors, which the CLI can print to terminal or JSON output. A third-party package or harness may include credential material in diagnostics.
- Files: `src/core/install.ts`, `src/core/mcp-fixture.ts`, `src/core/gsd-fixture.ts`, `src/core/ecc-fixture.ts`, `src/cli.ts`
- Current mitigation: MCP rendered configs and transaction journals omit credential values, and plans hide the rendered document.
- Recommendations: Redact known credential values and sensitive environment names from all subprocess output before formatting errors or persisting evidence.

**CI automation trusts mutable action tags:**

- Risk: `actions/checkout@v6` and `actions/setup-node@v6` are tag references rather than immutable commit SHAs, so a tag change can alter code executed with repository write permissions.
- Files: `.github/workflows/ci.yml`, `.github/workflows/dependency-candidate.yml`
- Current mitigation: CI declares read-only contents permission; the candidate workflow scopes write permissions to its job.
- Recommendations: Pin third-party actions to reviewed commit SHAs and review dependency-candidate workflow changes as supply-chain-sensitive code.

## Performance Bottlenecks

**Repeated external discovery and fixture execution:**

- Problem: Install planning invokes package and harness inspection repeatedly, and applying MCP changes can run a fixture for every server before writing each target configuration.
- Files: `src/core/install.ts`, `src/core/mcp-fixture.ts`, `src/core/process.ts`
- Cause: Planning and apply paths independently re-read manifests and spawn command discovery processes; fixture gating is repeated per server.
- Improvement path: Cache immutable inventory/command resolution within one operation and expose a combined fixture capability check where the protocol permits it.

## Fragile Areas

**Hand-rolled configuration renderers:**

- Files: `src/core/mcp.ts`, `src/core/skill-policy.ts`, `src/core/isolation.ts`
- Why fragile: JSON, TOML, and YAML are merged with custom parsing/regex/string rendering. Comments, unusual TOML table forms, duplicate keys, or schema changes can be misclassified or rewritten unexpectedly.
- Safe modification: Add golden fixtures for representative native configs and parse/compare with format-aware libraries; preserve unknown sections byte-for-byte where possible.
- Test coverage: `test/mcp.test.ts` covers common JSON/Codex cases, but no broad malformed, comments-heavy, duplicate-key, or versioned-config matrix is present.

**Harness launch adapters encode undocumented behavior:**

- Files: `src/adapters/isolation.ts`, `src/adapters/harnesses.ts`
- Why fragile: Antigravity has no documented config-root override, Hermes skill allowlisting is blocked, and command names/flags are assumed by static adapter code.
- Safe modification: Keep each guarantee and warning tied to a versioned harness capability probe, and fail closed when a flag or executable contract changes.
- Test coverage: `test/isolation.test.ts` validates generated specs but does not launch real harness binaries on the supported OS matrix.

## Scaling Limits

**Single-process, sequential installation:**

- Current capacity: `src/core/install.ts` applies every selected harness sequentially and runs synchronous child processes.
- Limit: Large harness/skill/MCP selections block the CLI for fixture and package-manager timeouts, with no progress persistence beyond transaction journals.
- Scaling path: Introduce resumable operation phases and bounded concurrency only for independent read-only checks; retain serialized writes for shared roots.

## Dependencies at Risk

**Unpinned GitHub Action refs:**

- Risk: Mutable CI action tags can change behavior independently of a repository commit.
- Impact: Build and dependency-candidate jobs can execute unreviewed code, with the candidate job able to push branches and open pull requests.
- Migration plan: Replace action tags in `.github/workflows/ci.yml` and `.github/workflows/dependency-candidate.yml` with immutable SHAs and renovate them through reviewed updates.

## Missing Critical Features

**OS/container-backed sealed execution:**

- Problem: No adapter enforces the declared `container`, `allowlist` network, or `allowlist` environment semantics.
- Blocks: Secure execution of untrusted project repositories.

**Transactional project sync:**

- Problem: The main `project sync --apply` path is explicitly disabled.
- Blocks: Applying project detection/plan results and managing project-local stack configuration.

## Test Coverage Gaps

**CLI and wrapper behavior:**

- What's not tested: Argument parsing, JSON output redaction, exit codes, `project sync` behavior, and shell/PowerShell wrapper semantics.
- Files: `src/cli.ts`, `scripts/install.sh`, `scripts/install.ps1`, `scripts/update.sh`, `scripts/update.ps1`
- Risk: User-facing commands can regress while core unit tests remain green.
- Priority: High

**Filesystem boundary and crash recovery:**

- What's not tested: Symlinked parent directories, concurrent writers, process interruption between journal writes and rename, and permissions failures during rollback.
- Files: `src/core/transaction.ts`, `src/core/isolation.ts`
- Risk: A path escape or incomplete recovery could modify unrelated user files or leave an installation inconsistent.
- Priority: High

**Real harness and platform matrix:**

- What's not tested: Actual Claude, Codex, Antigravity GUI/CLI/IDE, Pi, and Hermes launches across Windows, macOS, and Linux.
- Files: `src/adapters/isolation.ts`, `src/adapters/harnesses.ts`, `.github/workflows/ci.yml`
- Risk: Adapter flags, executable resolution, config roots, and native schema assumptions may fail outside synthetic fixtures.
- Priority: Medium

---

*Concerns audit: 2026-09-02*
