# Stack Research

**Domain:** Cross-platform, cross-harness AI-agent workflow control plane
**Milestone:** alpha-AOS v0.1.0 completion and release
**Researched:** 2026-09-03
**Confidence:** MEDIUM

## Executive Recommendation

Keep alpha-AOS on its existing Node.js 24, TypeScript, ESM, npm-package architecture. The remaining work is not a reason to introduce a daemon, database, container runtime, native addon, alternative package manager, or a second workflow framework. Node 24 already provides stable globbing, process control, hashing, testing, and the filesystem primitives needed for deterministic project evidence, transaction journals, configuration isolation, and three-OS fixtures.

Add only two focused runtime dependencies for v0.1.0:

1. **Ajv 8.20.0** to compile and strictly validate the repository's existing JSON Schema draft 2020-12 contracts. Validation must not coerce values, insert defaults, or remove unknown properties.
2. **cross-spawn 7.0.6** to replace hand-built Windows `.cmd`/shebang execution and argument quoting in the process adapter. Keep `shell: false`, explicit timeouts, bounded output, environment allowlists, and redaction around it.

Everything else should use Node core. In particular, implement mutation serialization with an alpha-AOS-owned lock directory and journal state rather than adding a locking library; use `node:test` rather than another test framework; use `fs.promises.glob` rather than another glob library; and do not adopt a TOML serializer that rewrites a user's full configuration. Prefer a harness's version-probed native configuration command where it exists. Otherwise, mutate only an alpha-AOS-owned file or byte-bounded managed section and refuse ambiguous input.

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Node.js | `>=24.0.0 <25` for v0.1 release qualification | CLI runtime and portable OS API layer | Preserves the current runtime while providing stable `fs.promises.glob`, `node:test`, `AbortSignal`, `crypto`, and mature filesystem/process APIs. Qualify one Node major for v0.1 rather than claiming untested future-major support. |
| TypeScript | `5.9.3` exact, retain current pin | Strict domain types and adapter contracts | Already integrated with NodeNext/ES2024 and strict checking. A compiler upgrade is unrelated to the milestone and should go through the existing candidate-lock process. |
| npm | End users `>=10`; release job `>=11.5.1` | Dependency installation and tarball publication | Do not raise the workstation floor merely for publishing. npm trusted publishing requires npm 11.5.1 or later; enforce that only in the release job. |
| `yaml` | `2.9.0` exact, retain current pin | Existing YAML catalog and project-manifest parsing | Already locked and exercised. Continue using it for YAML only; schema validation belongs to Ajv. |
| `@modelcontextprotocol/sdk` | `1.30.0` exact, retain current pin | Existing MCP stdio client/server and Firecrawl policy proxy | No milestone evidence supports changing the MCP implementation. Promote updates only after the existing candidate fixtures pass. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `ajv` | `8.20.0` exact | JSON Schema draft 2020-12 validation | Validate stack catalog, lock, project manifest, install-state, journal, and evidence-plan boundaries before planning or applying. Import the draft-2020 class and compile schemas once per CLI invocation. Use `strict: true`, `allErrors: true`, `coerceTypes: false`, `useDefaults: false`, and `removeAdditional: false`. |
| `cross-spawn` | `7.0.6` exact | Cross-platform command, shebang, PATHEXT, and npm shim execution | Use only inside the process adapter. It replaces custom `cmd.exe /c` argument construction, especially for project paths and arguments containing spaces or shell metacharacters. Do not enable `shell`. |
| `@types/cross-spawn` | `6.0.6` exact, development only | Type declarations for `cross-spawn` | Add while the package does not ship its own TypeScript declarations. Keep it out of runtime dependencies. |

The Ajv version was verified from current npm registry metadata; Context7's version index lagged at 8.17.1, while official Ajv v8 documentation verified the API and draft-2020 behavior. Treat the new exact versions as candidates until alpha-AOS records their integrity and passes the normal dependency fixture/promotion gate.

### Development and Release Tools

| Tool | Purpose | Prescriptive Use |
|------|---------|------------------|
| `node:test` and `node:assert/strict` | Unit, fault-injection, fixture, and tarball smoke tests | Retain the built-in runner. Add CLI-level and spawned-process tests; no Jest/Vitest migration for v0.1. |
| `fs.promises.glob` | Bounded evidence discovery | Use catalog-defined positive patterns and explicit excludes. Do not execute project scripts or recursively scan unrestricted trees. Revalidate every selected path before mutation. |
| GitHub Actions hosted runners | Required three-OS fixture matrix | Use explicit stable image labels for release qualification, currently `ubuntu-24.04`, `windows-2025`, and `macos-15-intel`. Keep a scheduled `*-latest` canary to detect upcoming image drift. Do not confuse hosted-fixture success with real harness validation. |
| `actions/setup-node` | Exact Node major on runners | Select Node 24 in every job. Pin the action and checkout action to reviewed full commit SHAs; a major tag is not immutable. |
| npm trusted publishing | Tokenless npm release | Publish from a GitHub-hosted runner with OIDC and minimum permissions (`contents: read`, `id-token: write`). Disable dependency caching in the release job. Qualifying public releases receive npm provenance automatically. |
| `npm pack --dry-run --json` / `npm pack --json` | Inspect and build the distributable | Make the dry-run file list a test assertion, then build one tarball, hash it, install those identical bytes on all OS jobs, and publish that tested tarball. |

## Portable Core vs OS-Specific Adapters

### Portable Node Core

These mechanisms should behave identically at the domain-contract level on Windows, macOS, and Linux:

- Canonicalize the project root once with `realpath`, derive a stable project ID from the canonical path, and represent evidence with normalized slash-separated relative paths.
- Parse project files as untrusted data with byte limits. Do not import configuration modules, run package-manager commands, source shell files, or follow project-authored executable hooks during detection.
- Sort evidence records, pack IDs, target paths, and operations before hashing or displaying a plan. Record the catalog digest, stable-lock digest, project-manifest digest, evidence digest, and expected pre-state hashes. Apply only that exact plan; if any digest changes, require a new preview.
- Use `lstat` on each existing path component and `realpath` on the nearest existing parent immediately before snapshot, write, rename, or removal. Reject symbolic-link/junction traversal and targets that do not remain under the canonical allowed root.
- Serialize all mutations under the alpha-AOS state root. Acquire a unique lock directory with non-recursive `mkdir`; write owner PID, operation ID, start time, and command metadata inside it. Never steal a lock based on age alone. `doctor` may classify it as abandoned, but removal requires an explicit recovery action.
- Write journals and snapshots before target mutation. Use same-directory random temporary files, `writeFile(..., { flush: true })` or `FileHandle.sync()`, close the handle, then rename. Record every completed checkpoint and hash the bytes read back from disk.
- Treat delete as a transaction operation, not `rm -rf`: verify the installed after-hash, move the target to a transaction-owned tombstone/snapshot where possible, and remove it only after commit. Remove directories only when alpha-AOS created them and they are empty.
- Cap captured stdout/stderr by bytes, redact known secret values and sensitive variable assignments before formatting or persistence, and store structured exit information instead of raw command transcripts.

Node documents that promise-based filesystem operations are not synchronized or threadsafe. The operation lock and strictly serialized write set are therefore correctness requirements, not performance options.

### OS Adapter Responsibilities

| Platform | Adapter Responsibilities | Primitive / Caveat |
|----------|--------------------------|--------------------|
| Windows | Case-fold path and environment-key comparisons; normalize `Path`/`PATH` duplicates; recognize `.exe`, `.cmd`, and `.ps1`; use `cross-spawn` for shims; set `windowsHide: true` for noninteractive checks; retry only documented transient `EPERM`/`EBUSY` failures with a short bound; test junctions, file locks, long paths, and spaces/metacharacters. | Win32 provides `ReplaceFileW` and `LockFileEx`, but Node does not promise identical durability semantics and Windows replacement can fail when another process holds the target. Do not add FFI/native bindings for v0.1; use flushed journal checkpoints and prove behavior with live fault tests. POSIX-style `0o600`/`0o700` modes are not a Windows ACL guarantee. |
| macOS | Use POSIX write/rename flow; fsync the file and best-effort fsync the containing directory; detect case-colliding target names; qualify both Intel and Apple Silicon across CI/canary coverage. | Default volumes are commonly case-insensitive, so do not infer case semantics from platform name. npm JavaScript packages do not require app notarization; a future standalone binary would. |
| Linux | Use POSIX write/rename flow; fsync the file and containing directory; use `O_NOFOLLOW` as an additional feature-probed defense when opening final components; test permissions and symlink races. | POSIX rename gives atomic namespace replacement on one filesystem, not automatic crash durability. Keep temporary, target, and tombstone paths on the same filesystem. |

Network and synchronized-folder filesystems are outside the v0.1 mutation guarantee. Node warns that exclusive creation can be unreliable on network filesystems. `doctor` should identify obvious remote/UNC state roots, warn or refuse mutation, and direct the user to a local state root.

## Deterministic Project-Scoped Capability Sync

Use the existing catalog/pack YAML as the rule source, but compile it into a typed, validated evidence program:

1. Load catalog, pack files, stable lock, and project manifest.
2. Validate each with Ajv before domain conversion. Defaults belong in explicit normalization code, not schema side effects.
3. Walk only declared evidence locations with Node glob/read APIs. Each detector emits `{ruleId, kind, relativePath, observedValueHash}`; it never emits absolute user paths in output.
4. Apply positive evidence thresholds from the catalog. Common files such as `AGENTS.md` remain insufficient for `AGENT_RUNTIME`; explicit manifest opt-ins remain distinct from inferred evidence.
5. Render a sorted desired-state manifest containing exact skill source version/hash, harness destination, ownership marker, and previous-state hash.
6. Re-read and re-hash all plan inputs under the mutation lock before applying.
7. Install project-scoped skills only through harness adapters whose native discovery location and invocation behavior have a passing capability probe. Report unsupported targets instead of copying files to guessed paths.

Do not add a generic rule engine. The current pack predicates (`all`, `any`, `anyFiles`, dependency membership, and manifest opt-in) are small enough for typed TypeScript discriminated unions and exhaustive switches.

## Safe Uninstall and Recovery

Extend the existing transaction journal rather than introducing a second state store. A v0.1 journal schema should additionally record:

- operation kind (`create`, `replace`, `remove`, `external-install`), component and harness IDs;
- canonical target and allowed-root identity;
- before/after byte hashes and source lock integrity;
- snapshot/tombstone location and created parent directories;
- checkpoint state (`planned`, `snapshotted`, `mutated`, `verified`, `committed`, `compensated`);
- external package pre-state and verified post-state, but never registry credentials or raw subprocess output.

Uninstall removes a managed file only when its current hash equals the recorded after-hash. A changed file becomes a conflict and is retained. A directory is removed only if the journal says alpha-AOS created it and it is empty. Stale detection evidence may stop future desired-state installation, but it must never independently authorize deletion; deletion comes from the last applied ownership manifest plus current hash verification.

Package-manager changes are compensating operations, not filesystem rollback. Record whether alpha-AOS introduced a package, upgraded an existing package, or merely reused it. On failure or uninstall:

- remove only a package introduced exclusively by alpha-AOS and still at the recorded version/integrity;
- restore a prior exact version only with explicit approval and a verified registry artifact;
- otherwise retain the external package and report the manual recovery command without exposing local paths.

## Configuration Isolation and Process Launching

Build a new environment object; never start with a spread of `process.env`.

| Scope | Portable Policy | Platform Additions |
|------|-----------------|--------------------|
| Executable discovery | Resolve and version-probe the harness before reducing the environment. Store the canonical executable path in the plan and revalidate it at launch. | Windows adapter resolves PATHEXT/shims through `cross-spawn`; POSIX adapter requires an executable regular file. |
| Base environment | Carry only the minimum PATH, locale, terminal, and temporary-directory keys required by the harness. Replace HOME/config variables with external project runtime roots. | Windows needs reviewed `SystemRoot`, `ComSpec`, `PATHEXT`, `TEMP`/`TMP`, plus isolated `USERPROFILE`, `APPDATA`, and `LOCALAPPDATA`. POSIX uses isolated `HOME` and XDG config/data/cache/state roots plus `TMPDIR` where present. |
| Credentials | Inherit only manifest-allowlisted credential variable names at launch time. Values never enter plans, journals, fixtures, JSON output, or logs. | Normalize Windows names case-insensitively before allowlist comparison. |
| Subprocess | `shell: false`, explicit argv array, explicit cwd/env, bounded stdio, timeout/AbortSignal, deterministic exit mapping. | Use `windowsHide: true` for noninteractive processes. Keep interactive harness windows visible only when the user explicitly launches them. |

Prefer a harness's native, version-probed `add/remove/list` configuration command when it can target the generated runtime root. This avoids round-tripping an unowned JSON/TOML/YAML file. Where no native command or fragment mechanism exists, generate a complete alpha-AOS-owned isolated configuration. Do not parse and reserialize a user's entire TOML file for v0.1; parsers that do not retain comments and byte layout do not satisfy conservative merging.

`project-only` remains configuration and environment isolation, not a filesystem/network security sandbox. Keep `sealed` fail-closed until a real OS/container adapter exists.

## Packaging and Release Approach

Publish one platform-neutral npm tarball; do not ship separate OS binaries for v0.1.

1. Start from a clean, signed/tagged release commit and run `npm ci`, typecheck, tests, and dependency fixtures on Node 24.
2. Run `npm pack --dry-run --json` and assert an allowlisted file manifest. The current package pattern includes `catalog/candidate.lock.json`; narrow `package.json#files` so the public tarball contains the stable stack lock and pack catalog but not the candidate lock.
3. Run `npm pack --json` once on Linux, compute SHA-256, and retain the JSON file list and hash as release evidence.
4. Install that identical tarball into fresh temporary global prefixes on explicit Windows, macOS, and Linux hosted images. Verify the generated command shim, `--help`, `inventory`, dry-run planning, fixture mode, project-only environment isolation, and uninstall cleanup.
5. Run representative real-host canaries for every supported harness/surface. Record OS, architecture, harness version, adapter capability flags, redacted operation ID, and pass/fail—never credentials, full environment, absolute home paths, or prompts containing private source.
6. Publish the already-tested tarball from a protected GitHub-hosted job through npm trusted publishing. Use OIDC, no long-lived npm token, no release dependency cache, and full-SHA-pinned actions.
7. Verify the registry tarball integrity/provenance and install the published version in one fresh smoke environment before marking the GitHub release complete.

The required CI fixture matrix proves portable behavior, while live canaries prove harness semantics. A practical v0.1 release gate is:

| Layer | Windows | macOS | Linux |
|------|---------|-------|-------|
| Pure/unit and golden fixtures | Required | Required | Required |
| Symlink/junction, permission, locked-file, concurrent-writer, and injected-crash recovery | Junction/lock cases required | Symlink/case-collision required | Symlink/permission required |
| Install the same packed tarball and uninstall | Required | Required | Required |
| Real CLI harness canary | At least the already-proven workstation surfaces | At least one representative CLI surface | At least one representative CLI surface |
| GUI/IDE surface | Manual canary where supported | Manual canary where supported | Explicitly report unsupported/not tested |

Use explicit runner image labels in release gates because `*-latest` labels move. Keep a scheduled latest-image canary so the next explicit-image update is discovered before deprecation.

## Installation Changes

After candidate review and integrity locking:

```bash
npm install --save-exact ajv@8.20.0 cross-spawn@7.0.6
npm install --save-dev --save-exact @types/cross-spawn@6.0.6
```

No other runtime package is recommended for v0.1.0.

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Node core filesystem transaction plus owned lock directory | `proper-lockfile` or native `flock`/`LockFileEx` binding | Reconsider only if real multi-process/network-filesystem requirements appear after v0.1. A local workstation control plane benefits more from a visible journal/recovery contract than another stale-lock abstraction. |
| Ajv strict validation | More hand-written validators | Hand-written refinement remains appropriate after schema validation for cross-file invariants, but not as a replacement for the repository's declared JSON Schemas. |
| `cross-spawn` inside one adapter | Custom `cmd.exe /c` quoting | Keep custom spawning only for a harness with a documented, tested platform contract that cross-spawn cannot represent. Never concatenate project-controlled argv into a shell command string. |
| Native harness config command or alpha-owned config | General TOML parse/serialize merge | Add a comment-preserving TOML concrete-syntax-tree library only if a supported harness forces in-place user TOML mutation and golden fixtures prove exact preservation. |
| npm tarball | Single-executable bundler or per-OS installer | Revisit after v0.1 if users need Node-free installation. That would introduce code-signing, notarization, antivirus, native-asset, and update-channel obligations. |
| GitHub-hosted three-OS fixtures plus real-host canaries | Full authenticated harness matrix in CI | A full matrix becomes appropriate only when harness vendors provide stable headless authentication and test contracts. Do not place workstation credentials in CI to simulate it now. |

## What NOT to Introduce for v0.1.0

| Avoid | Why | Use Instead |
|------|-----|-------------|
| SQLite, daemon, or hosted control plane | Adds lifecycle, migration, locking, and credential scope without solving a v0.1 requirement. | Versioned JSON journals and manifests under the existing state root. |
| Docker/Podman as a baseline dependency | `sealed` is deferred and container availability is not uniform on user workstations. | Keep project-only honest and sealed fail-closed. |
| Jest, Vitest, `fast-glob`, `rimraf`, `execa` | Duplicates stable Node 24 capabilities or overlaps the narrowly selected process fix. | `node:test`, `fs.promises.glob`, `fs.promises.rm`, and `cross-spawn`. |
| `proper-lockfile` | The local state lock/recovery semantics are simple, product-visible, and should be journal-aware. | Atomic lock-directory acquisition with explicit doctor/recovery. |
| `smol-toml` or another whole-document serializer for user configs | Semantic parse/stringify can erase comments, ordering, and formatting and makes conservative uninstall harder. | Native harness commands, owned files, or a future comment-preserving CST adapter. |
| Native FFI/addons for `ReplaceFileW`, `LockFileEx`, `openat2`, or sandboxing | Multiplies build/signing/platform risk and still does not produce a complete security boundary. | Portable Node checks, OS fault canaries, and fail-closed limits. |
| Mutable GitHub Action tags in release jobs | GitHub states only a full commit SHA is immutable. | Reviewed full SHAs, updated through dependency review. |
| Shipping `catalog/candidate.lock.json` | End users must receive the reviewed stable lock, not an update candidate. | Publish only the stable lock and pack definitions; generate candidates in repository automation. |

## Version Compatibility

| Component | Compatible With | Notes |
|-----------|-----------------|-------|
| alpha-AOS v0.1.0 | Node `>=24.0.0 <25` qualified | Keep the package's runtime error explicit. Broaden to Node 25/26 only after the same tarball matrix passes. |
| `fs.promises.glob` | Node 24.0.0+ | Marked stable in Node 24.0. Avoid depending on the newer `followSymlinks` option unless the engine floor is raised to Node 24.16. Detection should not follow symlinks regardless. |
| `writeFile({flush:true})` / `FileHandle.sync()` | Node 24 | Flush file data before rename/journal checkpoints; POSIX directory fsync remains an adapter concern. |
| `ajv@8.20.0` | JSON Schema draft 2020-12 | Use `ajv/dist/2020`; do not combine older drafts in the same validator instance. Current schemas declare draft 2020-12. |
| `cross-spawn@7.0.6` | Node 24; `@types/cross-spawn@6.0.6` | Run with `shell: false`; its documented shebang support is limited, so retain live Windows shim tests. |
| npm trusted publishing | npm 11.5.1+, Node 22.14+ in release job | Node 24 meets the Node requirement. This does not require raising the end-user npm engine floor. |

## Confidence Assessment

| Area | Confidence | Basis / Remaining Risk |
|------|------------|------------------------|
| Existing Node/TypeScript architecture | MEDIUM | Confirmed by repository code and Node 24 official API docs; real filesystem behavior still varies by volume and OS. |
| Ajv and cross-spawn additions | MEDIUM | Versions verified from npm registry metadata and behavior from primary repositories/docs; both still require candidate integrity lock and project fixtures. |
| npm packaging and trusted publishing | MEDIUM | Verified against current npm and GitHub docs and a local pack dry-run; package-name availability and trusted-publisher setup must be rechecked at release time. |
| Windows/macOS/Linux durability | MEDIUM | Primary OS specifications document primitives, but Node abstracts them and crash semantics depend on filesystem and locks; live fault canaries are mandatory. |
| Harness-native configuration | MEDIUM | A current local Codex capability probe supports native MCP add/remove, but every harness/version still needs its own documented or live-probed contract. Unsupported parity must be reported. |

## Sources

- [Node.js 24 file-system documentation](https://nodejs.org/docs/latest-v24.x/api/fs.html) — `fs.promises`, glob stability, lstat/realpath, exclusive flags, `O_NOFOLLOW`, flush/sync, rename/remove, and concurrency caveats. **MEDIUM** via confidence seam.
- [Node.js 24 child-process documentation](https://nodejs.org/docs/latest-v24.x/api/child_process.html) — explicit environment, stdio, timeout/cancellation, and Windows command behavior. **MEDIUM**.
- [Node.js 24 test-runner documentation](https://nodejs.org/docs/latest-v24.x/api/test.html) — built-in test runner and fixture support. **MEDIUM**.
- [Ajv JSON Schema versions](https://ajv.js.org/json-schema.html#draft-2020-12) and [Ajv options](https://ajv.js.org/options.html) — draft-2020 class, strict mode, and input-mutating options. Exact 8.20.0 release metadata was verified through the npm registry. **MEDIUM**.
- [cross-spawn primary repository](https://github.com/moxystudio/node-cross-spawn) and [cross-spawn 7.0.6 on npm](https://www.npmjs.com/package/cross-spawn/v/7.0.6) — Windows PATHEXT, shim, shebang, and escaping behavior. **MEDIUM**.
- [npm package.json documentation](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/) and [`npm pack`](https://docs.npmjs.com/cli/v11/commands/npm-pack/) — `files`, `bin`, and tarball inspection. **MEDIUM**.
- [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/) and [npm provenance](https://docs.npmjs.com/generating-provenance-statements/) — OIDC requirements, release npm floor, hosted-runner constraints, provenance, and release-cache guidance. **MEDIUM**.
- [GitHub secure-use reference](https://docs.github.com/en/actions/reference/security/secure-use) and [hosted-runner reference](https://docs.github.com/en/actions/reference/runners/github-hosted-runners) — full-SHA action pinning, ephemeral runners, explicit/latest labels, and image drift. **MEDIUM**.
- [Win32 `ReplaceFileW`](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-replacefilew) and [`LockFileEx`](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-lockfileex) — Windows replacement and locking semantics/caveats. **MEDIUM**.
- [POSIX `rename`](https://pubs.opengroup.org/onlinepubs/9799919799/functions/rename.html) and [`fsync`](https://pubs.opengroup.org/onlinepubs/9799919799/functions/fsync.html) — atomic namespace replacement and synchronization primitives. **MEDIUM**.
- Repository evidence: existing exact dependency locks, transaction/project/process adapters, three-OS CI, and `npm pack --dry-run --json` package contents were inspected on 2026-09-03. **HIGH for current repository state; not an ecosystem claim.**

---
*Stack research for: alpha-AOS v0.1.0 completion and release*
*Researched: 2026-09-03*
