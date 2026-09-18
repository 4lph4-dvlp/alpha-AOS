# Phase 7: Cross-Platform Release Proof - Pattern Mapping

**Phase Directory:** `D:/dev/alpha-AOS/.planning/phases/07-cross-platform-release-proof`  
**Generated:** 2026-09-18  
**Status:** Complete  

---

## Executive Summary

Phase 7 executes the **Cross-Platform Release Proof** for the `alpha-AOS` v0.1.0 release milestone. The central architectural imperative of this phase is to qualify a single, authoritative, allowlisted, byte-identical package archive (`alpha-aos-0.1.0.tgz`) across Windows, macOS, and Linux without mutating or depending on real user shared roots. It establishes verifiable cryptographic provenance, enforces strict single-writer lock authority during brownfield multi-harness workflows, evaluates paired positive/negative acceptance controls, and publishes an honest, versioned support matrix where active claimed harnesses ([`Codex`](file:///D:/dev/alpha-AOS/src/types.ts#L14-L15), [`Antigravity`](file:///D:/dev/alpha-AOS/src/types.ts#L14-L15), [`Pi`](file:///D:/dev/alpha-AOS/src/types.ts#L14-L15), and [`Hermes`](file:///D:/dev/alpha-AOS/src/types.ts#L14-L15)) are proven on real hosts while Claude Code remains compatibility residue.

This document establishes the concrete code analogs, architectural patterns, data flows, interfaces, and test conventions required to implement requirements **REL-01 through REL-06** and implementation decisions **D-01 through D-16**.

---

## File Classification Matrix

| File Path | Role | Data Flow Summary | Existing Analog in Codebase | Key Invariants & Differences |
|-----------|------|-------------------|-----------------------------|------------------------------|
| [`package.json`](file:///D:/dev/alpha-AOS/package.json) *(modified)* | Package Manifest & Script Hub | Declares published `files` allowlist and lifecycle scripts -> excludes `catalog/candidate.lock.json` -> binds `prepack` to build and audit. | [`package.json`](file:///D:/dev/alpha-AOS/package.json) | Tightens `files` from `"catalog/"` to individual catalog files; adds `audit-tarball` script; hooks into `prepack`. |
| [`.npmignore`](file:///D:/dev/alpha-AOS/.npmignore) *(created)* | Archive Packaging Exclusion Filter | Filter applied during `npm pack` -> drops `catalog/candidate.lock.json`, `.planning/`, `test/`, `scratch/`, `*.ts`, `*.log`. | [`.gitignore`](file:///D:/dev/alpha-AOS/.gitignore) | Explicit secondary exclusion layer preventing accidental bundling of unverified candidate locks or dev files. |
| [`.github/workflows/ci.yml`](file:///D:/dev/alpha-AOS/.github/workflows/ci.yml) *(modified)* | Multi-Platform CI Workflow | Authoritative `package` job on Linux builds, audits, and packs `alpha-aos-0.1.0.tgz` -> uploads artifact -> 3-OS matrix (`test`) downloads identical tarball -> verifies SHA-256 -> runs fixture suite. | [`.github/workflows/ci.yml`](file:///D:/dev/alpha-AOS/.github/workflows/ci.yml#L13-L79) | Replaces per-runner build with single authoritative build + multi-OS artifact download; tests byte-identical tarball. |
| [`scripts/audit-tarball.mjs`](file:///D:/dev/alpha-AOS/scripts/audit-tarball.mjs) *(created)* | Packaging Safety Validator (Fail-Closed) | Reads `.tgz` -> decompresses via `node:zlib.gunzipSync` -> parses 512-byte tar headers -> extracts POSIX paths -> checks against forbidden patterns and allowlist -> exits 0 or 3. | [`scripts/build-artifact.mjs`](file:///D:/dev/alpha-AOS/scripts/build-artifact.mjs#L87-L123) (`check()`), [`scripts/run-tests.mjs`](file:///D:/dev/alpha-AOS/scripts/run-tests.mjs#L111-L144) | Zero external dependencies; fails closed on `candidate.lock.json`, `.planning/`, `.ts` files, or unallowlisted entries. |
| [`scripts/verify-provenance.mjs`](file:///D:/dev/alpha-AOS/scripts/verify-provenance.mjs) *(created)* | Cryptographic Provenance Validator | Accepts tarball path -> validates SHA-256 against `.sha256` file -> inspects internal `dist/build-artifact.json` -> audits `catalog/stack.lock.json` hashes -> exits 0 or 3. | [`scripts/build-artifact.mjs`](file:///D:/dev/alpha-AOS/scripts/build-artifact.mjs#L44-L59) (`hash`, `table`) | Provides single-command verification of downloaded release bundles for end users and CI runners. |
| [`scripts/smoke-test.mjs`](file:///D:/dev/alpha-AOS/scripts/smoke-test.mjs) *(created)* | Isolated Environment Smoke Tester | Creates isolated temp sandbox (`mkdtemp`) -> sets up clean prefix (`npm_config_prefix`) -> runs `npm install -g` -> resolves executable path (`.cmd` on win32) -> asserts `--version`, `status`, `doctor` exit 0. | [`scripts/run-tests.mjs`](file:///D:/dev/alpha-AOS/scripts/run-tests.mjs#L63-L72) (`scrubbedEnvironment`), [`test/lifecycle.test.ts`](file:///D:/dev/alpha-AOS/test/lifecycle.test.ts#L59-L96) | Supports Stage 1 (local tarball) and Stage 2 (live npm registry) verification; strictly zeroes host side effects. |
| [`scripts/release.mjs`](file:///D:/dev/alpha-AOS/scripts/release.mjs) *(created)* | Preview-First Release Orchestrator | Checks git branch/status -> runs `check`, `test`, `audit-tarball`, `pack`, `verify-provenance`, `smoke-test` -> non-mutating preview by default -> publishes to npm only with `--publish`. | [`scripts/build-artifact.mjs`](file:///D:/dev/alpha-AOS/scripts/build-artifact.mjs#L125-L133), [`src/cli.ts`](file:///D:/dev/alpha-AOS/src/cli.ts#L1358-L1438) (dry-run/apply flow) | Prevents premature or accidental publication; ensures complete verification gate passes before `npm publish`. |
| [`scripts/run-brownfield-proof.mjs`](file:///D:/dev/alpha-AOS/scripts/run-brownfield-proof.mjs) *(created)* | Executable E2E Cycle Runner | Standalone executable script for human auditors -> clones brownfield fixture -> exercises discuss -> plan -> execute -> verify -> ship -> asserts single-writer invariant -> prints audit summary. | [`scripts/audit-codex-usage.mjs`](file:///D:/dev/alpha-AOS/scripts/audit-codex-usage.mjs), [`test/brownfield-gsd-cycle.test.ts`](file:///D:/dev/alpha-AOS/test/brownfield-gsd-cycle.test.ts) | Provides direct terminal reproduction of the brownfield verification cycle outside the automated test harness. |
| [`src/core/support-matrix.ts`](file:///D:/dev/alpha-AOS/src/core/support-matrix.ts) *(created)* | Structured Support Matrix Engine | Declares immutable baseline matrix -> inspects host capability ledger and inventory -> evaluates 4-tier taxonomy (`PROVEN`, `RESIDUE`, `UNVERIFIED`, `UNSUPPORTED`) -> formats markdown table. | [`src/core/doctor.ts`](file:///D:/dev/alpha-AOS/src/core/doctor.ts#L15-L126), [`src/core/capability-ledger.ts`](file:///D:/dev/alpha-AOS/src/core/capability-ledger.ts#L78-L84), [`src/core/status.ts`](file:///D:/dev/alpha-AOS/src/core/status.ts#L1-L30) | Single source of truth for platform/surface support; renders for both CLI (`doctor --matrix`) and `docs/SUPPORT_MATRIX.md`. |
| [`src/core/worker-authority.ts`](file:///D:/dev/alpha-AOS/src/core/worker-authority.ts) *(verified/integrated)* | Single GSD Writer Enforcement Engine | Intercepts worker tasks via `witnessWorkerDelegation` -> snapshots `.planning/` -> executes worker action -> hashes `.planning/` -> rolls back immediately with `WorkerAuthorityError` on mutation. | [`src/core/worker-authority.ts`](file:///D:/dev/alpha-AOS/src/core/worker-authority.ts#L194-L260) | Prohibits Hermes from state controller role; protects `.planning/` state immutability during cross-harness handoffs. |
| [`src/cli.ts`](file:///D:/dev/alpha-AOS/src/cli.ts) *(modified)* | CLI Command Dispatcher | Dispatches `alpha-aos doctor --matrix [--json]` -> evaluates support matrix against host ledger -> outputs formatted ANSI/Unicode table or JSON envelope. | [`src/cli.ts`](file:///D:/dev/alpha-AOS/src/cli.ts#L820-L976) (`doctor --canary`, `doctor`) | Integrates versioned support matrix diagnostics without breaking existing doctor findings or discovery sweeps. |
| [`src/format.ts`](file:///D:/dev/alpha-AOS/src/format.ts) *(modified)* | Terminal UI & Table Formatter | Formats support matrix report into ANSI/Unicode table with status badges (`PROVEN` green, `RESIDUE` yellow, `UNVERIFIED` cyan, `UNSUPPORTED` red). | [`src/format.ts`](file:///D:/dev/alpha-AOS/src/format.ts#L35-L39) (`table`), [`src/format.ts`](file:///D:/dev/alpha-AOS/src/format.ts#L632-L686) (`formatCapabilityReport`) | Generates clean terminal tables respecting column width budgets; supports color-disabled output on `NO_COLOR`. |
| [`test/helpers/brownfield-fixture.ts`](file:///D:/dev/alpha-AOS/test/helpers/brownfield-fixture.ts) *(created)* | Git Fixture Synthesizer for Brownfield Tests | Creates realistic Git repository with commits, package.json (express dependency), tsconfig.json, auth routes (`src/auth/jwt.ts`), and pre-existing `.planning/` state. | [`test/helpers/git-fixture.ts`](file:///D:/dev/alpha-AOS/test/helpers/git-fixture.ts#L226-L289), [`test/helpers/pack-fixtures.ts`](file:///D:/dev/alpha-AOS/test/helpers/pack-fixtures.ts#L48-L60) | Fully offline, zero-network Git fixture; deterministic commit SHAs; matches node-web-api pack evidence and auth gates. |
| [`test/tarball-fixture.test.ts`](file:///D:/dev/alpha-AOS/test/tarball-fixture.test.ts) *(created)* | Multi-Platform Lifecycle Integration Suite | Tests packed tarball in isolated prefix sandbox: install -> second install (asserts `CURRENT`, 0 writes) -> status & doctor pass -> uninstall clean baseline restoration. | [`test/lifecycle.test.ts`](file:///D:/dev/alpha-AOS/test/lifecycle.test.ts#L59-L96), [`test/uninstall.test.ts`](file:///D:/dev/alpha-AOS/test/uninstall.test.ts#L21-L90) | Validates REL-01 & REL-05 across Windows, macOS, and Linux without touching user home or shared machine directories. |
| [`test/support-matrix.test.ts`](file:///D:/dev/alpha-AOS/test/support-matrix.test.ts) *(created)* | Support Matrix Ledger & Taxonomy Unit Suite | Asserts 4-tier taxonomy evaluation (`PROVEN`, `RESIDUE`, `UNVERIFIED`, `UNSUPPORTED`) -> validates canary receipt overlay -> asserts zero drift against `docs/SUPPORT_MATRIX.md`. | [`test/doctor.test.ts`](file:///D:/dev/alpha-AOS/test/doctor.test.ts), [`test/capability-ledger.test.ts`](file:///D:/dev/alpha-AOS/test/capability-ledger.test.ts) | Validates REL-02; guarantees markdown documentation stays in exact sync with structured code ledger. |
| [`test/release-controls.test.ts`](file:///D:/dev/alpha-AOS/test/release-controls.test.ts) *(created)* | Paired Positive/Negative Acceptance Suite | Evaluates 4 paired controls: Context7 invocation, project pack scope, auth gate blocking, and tree-off opt-out -> generates `docs/RELEASE_CONTROLS.md`. | [`test/gate-lifecycle.test.ts`](file:///D:/dev/alpha-AOS/test/gate-lifecycle.test.ts#L30-L92), [`test/tree-policy.test.ts`](file:///D:/dev/alpha-AOS/test/tree-policy.test.ts#L21-L80), [`test/mcp-proxy.test.ts`](file:///D:/dev/alpha-AOS/test/mcp-proxy.test.ts) | Validates REL-03; pairs positive execution with negative exclusion across all 4 key control surfaces. |
| [`test/brownfield-gsd-cycle.test.ts`](file:///D:/dev/alpha-AOS/test/brownfield-gsd-cycle.test.ts) *(created)* | E2E Brownfield GSD Cycle Integration Suite | Exercises complete discuss -> plan -> execute -> verify -> ship cycle with 5 benchmark elements and strict single-writer verification under `writer.lock`. | [`test/lifecycle.test.ts`](file:///D:/dev/alpha-AOS/test/lifecycle.test.ts), [`test/worker-authority.test.ts`](file:///D:/dev/alpha-AOS/test/worker-authority.test.ts#L81-L120), [`test/canary.test.ts`](file:///D:/dev/alpha-AOS/test/canary.test.ts#L60-L94) | Validates REL-04; proves cross-harness handoff between Codex and Antigravity while keeping `.planning/` immutable to workers. |
| [`test/provenance.test.ts`](file:///D:/dev/alpha-AOS/test/provenance.test.ts) *(created)* | Cryptographic Provenance & Lock Integrity Suite | Tests SHA-256 checksum verification -> asserts failure on tampered archive -> validates `dist/build-artifact.json` -> audits `catalog/stack.lock.json` integrity. | [`scripts/build-artifact.mjs`](file:///D:/dev/alpha-AOS/scripts/build-artifact.mjs#L87-L123), [`test/catalog.test.ts`](file:///D:/dev/alpha-AOS/test/catalog.test.ts) | Validates REL-06; ensures supply-chain integrity and bit-level immutability across releases. |
| [`docs/SUPPORT_MATRIX.md`](file:///D:/dev/alpha-AOS/docs/SUPPORT_MATRIX.md) *(created)* | Versioned Support Matrix Specification | Public markdown document detailing supported harnesses, surfaces, OS targets, 4-tier status badges, and notes. | [`docs/alpha-vibe-stack-codex.md`](file:///D:/dev/alpha-AOS/docs/alpha-vibe-stack-codex.md) | Synchronized automatically from `src/core/support-matrix.ts`; verified against drift in CI. |
| [`docs/RELEASE_CONTROLS.md`](file:///D:/dev/alpha-AOS/docs/RELEASE_CONTROLS.md) *(created)* | Acceptance Controls Evidence Ledger | Public markdown document recording paired positive/negative acceptance test receipts across the 4 critical control domains. | [`docs/codex-execution-validation.md`](file:///D:/dev/alpha-AOS/docs/codex-execution-validation.md) | Generated by `test/release-controls.test.ts`; serves as permanent release acceptance evidence. |
| [`docs/RELEASE_NOTES_v0.1.0.md`](file:///D:/dev/alpha-AOS/docs/RELEASE_NOTES_v0.1.0.md) *(created)* | Standardized Release Notes | Notes v0.1.0 capabilities: active harnesses (Codex, Antigravity, Pi, Hermes), compatibility residue (Claude Code), and known platform limitations. | [`CHANGELOG.md`](file:///D:/dev/alpha-AOS/CHANGELOG.md) | Documents Windows floor environment variable behavior and v2 deferred sealed container mode. |
| [`CHANGELOG.md`](file:///D:/dev/alpha-AOS/CHANGELOG.md) *(created/modified)* | Release History Log | Standardized changelog entry for v0.1.0 release. | N/A | Human-readable changelog following Keep a Changelog conventions. |

---

## Detailed Component & Pattern Analyses

### 1. Pure Node.js Tarball Inspection & Whitelist Audit (`scripts/audit-tarball.mjs`)

#### Pattern Description
`npm pack` creates a gzip-compressed tar archive (`.tgz`). To prevent `catalog/candidate.lock.json`, test files, `.planning/` state, or uncompiled TypeScript source files from entering the published release package (D-02, REL-05), an automated audit script inspects the archive stream in prepack and CI, failing closed on any unallowlisted or candidate file.
The inspection uses pure Node.js built-ins (`node:zlib.gunzipSync` and binary buffer slicing) to decode standard 512-byte POSIX tar header blocks without spawning external shell utilities (`tar`, `bsdtar`) or pulling external supply chain packages.

#### Existing Analog
- [`scripts/build-artifact.mjs`](file:///D:/dev/alpha-AOS/scripts/build-artifact.mjs#L24-L59): Iterates filesystem entries, computes SHA-256 digests, and validates table against manifest.
- [`scripts/run-tests.mjs`](file:///D:/dev/alpha-AOS/scripts/run-tests.mjs#L111-L144): Validates that expected files exist and fails closed with actionable diagnostics if unexpected or missing files occur.

#### Concrete Code Pattern
```js
#!/usr/bin/env node
import { readFileSync, existsSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { resolve } from "node:path";

/**
 * Decodes 512-byte POSIX ustar headers from a decompressed tar buffer.
 * Extracts clean relative POSIX paths (stripping the leading "package/").
 */
export function listTarballFiles(tarballPath) {
  const buffer = gunzipSync(readFileSync(tarballPath));
  const files = [];
  let offset = 0;

  while (offset + 512 <= buffer.length) {
    const header = buffer.subarray(offset, offset + 512);
    // End of archive indicator (two consecutive zero blocks)
    if (header.every((b) => b === 0)) break;

    let nameEnd = header.indexOf(0, 0);
    if (nameEnd === -1 || nameEnd > 100) nameEnd = 100;
    let name = header.subarray(0, nameEnd).toString("utf8");

    const sizeStr = header.subarray(124, 136).toString("utf8").trim().replace(/\0/g, "");
    const size = parseInt(sizeStr, 8) || 0;
    const typeFlag = String.fromCharCode(header[156]);

    // Handle ustar prefix expansion
    const magic = header.subarray(257, 263).toString("utf8");
    if (magic.startsWith("ustar")) {
      let prefixEnd = header.indexOf(0, 345);
      if (prefixEnd === -1 || prefixEnd > 500) prefixEnd = 500;
      const prefix = header.subarray(345, prefixEnd).toString("utf8");
      if (prefix) name = `${prefix}/${name}`;
    }

    // Standard file entry ("0" or null byte)
    if (typeFlag === "0" || typeFlag === "\0") {
      const cleanPath = name.startsWith("package/") ? name.slice(8) : name;
      files.push({ path: cleanPath, size });
    }

    offset += 512 + Math.ceil(size / 512) * 512;
  }
  return files;
}

export function auditTarballEntries(files) {
  const forbiddenPatterns = [
    /candidate\.lock\.json/i,
    /^\.planning\//i,
    /^test\//i,
    /\.ts$/i,
    /^\.git/i,
    /\.log$/i,
    /^scratch\//i,
  ];

  const allowedExact = new Set(["package.json", "README.md", "LICENSE"]);
  const allowedPrefixes = [
    "dist/src/",
    "catalog/",
    "schemas/",
    "scripts/",
    "skills/",
    "docs/",
  ];

  const violations = [];
  for (const { path } of files) {
    if (forbiddenPatterns.some((pattern) => pattern.test(path))) {
      violations.push(`Forbidden file detected: ${path}`);
      continue;
    }
    const isAllowed = allowedExact.has(path) || allowedPrefixes.some((p) => path.startsWith(p));
    if (!isAllowed) {
      violations.push(`Unallowlisted file detected: ${path}`);
    }
  }
  return violations;
}
```

---

### 2. Multi-OS Tarball Packaging & CI Pipeline (`.github/workflows/ci.yml`)

#### Pattern Description
CI builds and packs a single authoritative `alpha-aos-0.1.0.tgz` on `ubuntu-latest`. It generates the SHA-256 hash file (`alpha-aos-0.1.0.tgz.sha256`) and uploads both via `actions/upload-artifact@v4`.
The downstream matrix job (`test`) runs across `ubuntu-latest`, `macos-latest`, and `windows-latest`, downloading the exact same byte-identical tarball, verifying its SHA-256 checksum before running any tests, and executing the cross-platform lifecycle suite.

#### Existing Analog
- [`.github/workflows/ci.yml`](file:///D:/dev/alpha-AOS/.github/workflows/ci.yml#L13-L79): Existing 3-OS matrix job running `npm ci`, `npm run check`, `npm test`, `npm run build:check`, and safety boundary suites.

#### Concrete CI Excerpt
```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
  workflow_dispatch:

permissions:
  contents: read

jobs:
  package:
    name: Authoritative Build & Pack / Linux
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v6
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm run check
      - run: npm run build
      - run: npm run build:check
      - name: Audit tarball contents (fail-closed)
        run: node scripts/audit-tarball.mjs --prepack
      - name: Pack release tarball
        run: npm pack
      - name: Generate SHA-256 checksum
        run: sha256sum alpha-aos-0.1.0.tgz > alpha-aos-0.1.0.tgz.sha256
      - name: Audit packed tarball
        run: node scripts/audit-tarball.mjs alpha-aos-0.1.0.tgz
      - uses: actions/upload-artifact@v4
        with:
          name: release-tarball
          path: |
            alpha-aos-0.1.0.tgz
            alpha-aos-0.1.0.tgz.sha256

  test:
    name: ${{ matrix.os }} / Node 24 Matrix
    needs: package
    runs-on: ${{ matrix.os }}
    env:
      ALPHA_AOS_REQUIRE_UPSTREAM_MCP: "1"
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v6
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - uses: actions/download-artifact@v4
        with:
          name: release-tarball
      - name: Verify release tarball byte identity
        run: node scripts/verify-provenance.mjs alpha-aos-0.1.0.tgz
      - run: npm test
      - name: Cross-platform tarball fixture suite
        run: node scripts/run-tests.mjs --files dist/test/tarball-fixture.test.js
```

---

### 3. Cross-Platform Temp-Root Sandbox & Lifecycle Fixture (`test/tarball-fixture.test.ts`)

#### Pattern Description
To verify REL-01, fixture tests create an isolated sandbox environment via `mkdtemp`. All host root paths (`HOME`, `USERPROFILE`, `CODEX_HOME`, `ANTIGRAVITY_CONFIG_DIR`, `CLAUDE_CONFIG_DIR`, `PI_CODING_AGENT_DIR`, `HERMES_HOME`, `ALPHA_AOS_STATE_DIR`, and `npm_config_prefix`) are redirected into this temporary sandbox.
The test executes the complete sequential lifecycle:
1. `npm install -g <tarball> --prefix <prefixDir>`
2. Cross-platform executable resolution (`prefixDir/alpha-aos.cmd` on Windows vs `prefixDir/bin/alpha-aos` on POSIX)
3. Initial `install --apply`
4. Second `install` verifying `CURRENT` idempotency (0 writes, exit code 0)
5. `status` and `doctor` reporting clean passes
6. `uninstall --all --yes --apply` verifying clean restoration with zero lingering files in the sandbox.

#### Existing Analog
- [`test/lifecycle.test.ts`](file:///D:/dev/alpha-AOS/test/lifecycle.test.ts#L59-L96): `setupAppliedFixture` creating temporary `home`, `state`, `npm-prefix`, setting up environment overrides, and registering `context.after()` cleanup.
- [`test/uninstall.test.ts`](file:///D:/dev/alpha-AOS/test/uninstall.test.ts#L21-L90): Applying uninstalls and verifying clean baseline restoration.

#### Concrete Code Pattern
```ts
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";

export interface FixtureSandbox {
  readonly root: string;
  readonly home: string;
  readonly state: string;
  readonly prefix: string;
  readonly env: NodeJS.ProcessEnv;
  resolveCli(): string;
  runCli(args: readonly string[]): { status: number; stdout: string; stderr: string };
}

export async function createIsolatedSandbox(context: TestContext): Promise<FixtureSandbox> {
  const root = await mkdtemp(join(tmpdir(), "alpha-aos-fixture-"));
  context.after(async () => {
    await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  });

  const home = join(root, "home");
  const state = join(root, "state");
  const prefix = join(root, "prefix");

  await mkdir(home, { recursive: true });
  await mkdir(state, { recursive: true });
  await mkdir(prefix, { recursive: true });

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    HOME: home,
    USERPROFILE: home,
    ALPHA_AOS_STATE_DIR: state,
    CODEX_HOME: join(home, ".codex"),
    ANTIGRAVITY_CONFIG_DIR: join(home, ".gemini", "antigravity"),
    CLAUDE_CONFIG_DIR: join(home, ".claude"),
    PI_CODING_AGENT_DIR: join(home, ".pi", "agent"),
    HERMES_HOME: join(home, ".hermes"),
    npm_config_prefix: prefix,
  };

  const resolveCli = (): string => {
    if (process.platform === "win32") {
      const cmdPath = join(prefix, "alpha-aos.cmd");
      if (existsSync(cmdPath)) return cmdPath;
      return join(prefix, "bin", "alpha-aos.cmd");
    }
    return join(prefix, "bin", "alpha-aos");
  };

  const runCli = (args: readonly string[]) => {
    const exec = resolveCli();
    const result = spawnSync(exec, args, { env, encoding: "utf8", windowsHide: true });
    return {
      status: result.status ?? 1,
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
    };
  };

  return { root, home, state, prefix, env, resolveCli, runCli };
}
```

---

### 4. Versioned Support Matrix & 4-Tier Status Taxonomy (`src/core/support-matrix.ts`)

#### Pattern Description
The official support matrix is defined as structured data in `src/core/support-matrix.ts` (D-05). It acts as the single source of truth for all supported surfaces and harness combinations across Windows, macOS, and Linux.
Capabilities are classified into a 4-tier mutually exclusive status taxonomy (D-08, REL-02):
1. `PROVEN`: Verified by an inspectable real-host canary receipt in `~/.alpha-aos/capabilities/ledger.json`.
2. `RESIDUE`: Claude Code compatibility residue outside active v0.1.0 release bar.
3. `UNVERIFIED`: Harness detected on host, but canary has not been run.
4. `UNSUPPORTED`: Structurally incompatible on target OS, harness, or surface.

The engine powers `alpha-aos doctor --matrix` (CLI terminal table with ANSI colors) and exports the canonical table to `docs/SUPPORT_MATRIX.md`. A drift assertion test (`test/support-matrix.test.ts`) validates that `docs/SUPPORT_MATRIX.md` matches the code generator output byte-for-byte.

#### Existing Analog
- [`src/core/doctor.ts`](file:///D:/dev/alpha-AOS/src/core/doctor.ts#L15-L126): `runDoctor` collecting findings and diagnostic evidence.
- [`src/core/capability-ledger.ts`](file:///D:/dev/alpha-AOS/src/core/capability-ledger.ts#L78-L84): `readCapabilityLedger` resolving recorded proofs.
- [`src/format.ts`](file:///D:/dev/alpha-AOS/src/format.ts#L35-L39): `table` formatter with pad and align.

#### Concrete Code Pattern
```ts
import { readCapabilityLedger } from "./capability-ledger.js";
import { userStateRoot } from "./paths.js";
import type { Inventory, HarnessId } from "../types.js";

export type SupportTier = "PROVEN" | "RESIDUE" | "UNVERIFIED" | "UNSUPPORTED";

export interface SupportMatrixEntry {
  readonly harnessId: HarnessId;
  readonly surface: string;
  readonly platform: "win32" | "darwin" | "linux" | "all";
  readonly baselineTier: SupportTier;
  readonly notes: string;
}

export const BASE_SUPPORT_MATRIX: readonly SupportMatrixEntry[] = [
  // Codex
  { harnessId: "codex", surface: "gsd-core", platform: "all", baselineTier: "PROVEN", notes: "Full GSD lifecycle proven" },
  { harnessId: "codex", surface: "context7", platform: "all", baselineTier: "PROVEN", notes: "Documentation lookup verified" },
  { harnessId: "codex", surface: "unified-memory", platform: "all", baselineTier: "PROVEN", notes: "Handoff receiver and sender verified" },
  // Antigravity
  { harnessId: "antigravity", surface: "gsd-core", platform: "all", baselineTier: "PROVEN", notes: "GSD fixture and config hooks verified" },
  { harnessId: "antigravity", surface: "unified-memory", platform: "all", baselineTier: "PROVEN", notes: "Context handoff proven" },
  { harnessId: "antigravity", surface: "gui-preload", platform: "all", baselineTier: "UNSUPPORTED", notes: "GUI desktop lacks preload interception" },
  // Pi
  { harnessId: "pi", surface: "gsd-core", platform: "all", baselineTier: "PROVEN", notes: "Pi agent bridge verified" },
  // Hermes
  { harnessId: "hermes", surface: "worker-authority", platform: "all", baselineTier: "PROVEN", notes: "Worker-only delegation strictly enforced" },
  { harnessId: "hermes", surface: "state-controller", platform: "all", baselineTier: "UNSUPPORTED", notes: "Hermes prohibited from state writer role" },
  // Claude Code (Compatibility Residue)
  { harnessId: "claude", surface: "all", platform: "all", baselineTier: "RESIDUE", notes: "Compatibility residue outside active release bar" },
];

export async function evaluateMatrixCell(
  entry: SupportMatrixEntry,
  inventory: Inventory,
  stateRoot: string = userStateRoot()
): Promise<SupportTier> {
  if (entry.harnessId === "claude") return "RESIDUE";
  if (entry.baselineTier === "UNSUPPORTED") return "UNSUPPORTED";

  const harnessInfo = inventory.harnesses.find((h) => h.id === entry.harnessId);
  if (!harnessInfo?.detected) return "UNVERIFIED";

  const ledger = await readCapabilityLedger(stateRoot);
  const proofExists = ledger.proofs.some(
    (p) => p.harness === entry.harnessId && p.capability.includes(entry.surface) && p.outcome === "verified"
  );

  return proofExists ? "PROVEN" : "UNVERIFIED";
}
```

---

### 5. Automated Paired Positive/Negative Acceptance Controls (`test/release-controls.test.ts`)

#### Pattern Description
REL-03 and D-07 mandate paired positive and negative controls across four critical control domains:
1. **Optional Capability Invocation**:
   - *Positive*: Intent triggers Context7 MCP tool call (`resolve-library-id`, `query-docs`).
   - *Negative*: Unmatched task (e.g. pure algorithm code) never invokes Context7.
2. **Project Pack Scope**:
   - *Positive*: Within canonical project root, project pack tools are discoverable and available.
   - *Negative*: Outside project root or in non-matching repo, pack tools are undiscoverable.
3. **Mandatory Gate Blocking**:
   - *Positive*: Diff containing modifications to auth/security boundaries triggers mandatory gate obligation, blocking lifecycle progression until receipt is provided.
   - *Negative*: Low-risk or documentation diff passes silently (`silentPass: true`) with zero gate blocking.
4. **Tree-Off Opt-Out**:
   - *Positive*: Managed directory loads alpha-AOS shims, tools, and hooks.
   - *Negative*: Directory marked `off` in tree registry suppresses all customizations and returns vanilla harness configuration.

Results are written to an inspectable markdown artifact (`docs/RELEASE_CONTROLS.md`).

#### Existing Analog
- [`test/gate-lifecycle.test.ts`](file:///D:/dev/alpha-AOS/test/gate-lifecycle.test.ts#L30-L92): Paired testing of stale/current receipts and high-risk vs low-risk diffs.
- [`test/tree-policy.test.ts`](file:///D:/dev/alpha-AOS/test/tree-policy.test.ts#L21-L80): Registry evaluation of managed vs off directory trees.
- [`test/helpers/pack-fixtures.ts`](file:///D:/dev/alpha-AOS/test/helpers/pack-fixtures.ts#L48-L60): Positive fixtures paired with near-miss negative twins.

#### Concrete Code Pattern
```ts
export interface ControlPairResult {
  readonly domain: string;
  readonly positive: { name: string; passed: boolean; receipt: Record<string, unknown> };
  readonly negative: { name: string; passed: boolean; receipt: Record<string, unknown> };
}

test("Paired Control 3: Mandatory Gate Blocking (REL-03, D-07)", async (context) => {
  const root = await scratchRoot(context, "gate-controls");
  const repo = await createOrdinaryRepository(root, "repo");
  assert.ok(repo.ok);

  // 1. Positive: Auth diff triggers gate block
  await writeFile(join(repo.fixture.path, "src", "auth.ts"), "export const token = 'secret';\n");
  gitCommand(repo.fixture.path, ["add", "src/auth.ts"]);
  const posEval = await evaluateLifecycleGates({
    projectRoot: repo.fixture.path,
    lifecyclePoint: "execute:post",
    phaseNumber: 1,
  });
  assert.equal(posEval.blocked, true);
  assert.ok(posEval.blockingObligations.includes("security-review"));

  // 2. Negative: Low-risk doc diff results in silent pass
  gitCommand(repo.fixture.path, ["reset", "--hard", "HEAD"]);
  await writeFile(join(repo.fixture.path, "README.md"), "# Updated Docs\n");
  gitCommand(repo.fixture.path, ["add", "README.md"]);
  const negEval = await evaluateLifecycleGates({
    projectRoot: repo.fixture.path,
    lifecyclePoint: "execute:post",
    phaseNumber: 1,
  });
  assert.equal(negEval.blocked, false);
  assert.equal(negEval.silentPass, true);
});
```

---

### 6. Brownfield GSD Cycle Benchmark & Single-Writer Invariant (`test/brownfield-gsd-cycle.test.ts`)

#### Pattern Description
REL-04 and D-09..D-12 require an end-to-end benchmark exercising the full GSD cycle (discuss → plan → execute → verify → ship) on a brownfield repository (`test/fixtures/brownfield-gsd-cycle`) exercising 5 representative elements:
1. *1 Global Optional Capability*: Context7 version-sensitive documentation lookup.
2. *1 Project Pack*: Node/TypeScript Web API pack matched by repo evidence (`express` dependency).
3. *1 Mandatory Gate*: Authentication boundary security gate triggered by auth modification, blocking progress until receipt is recorded.
4. *1 Cross-Harness Handoff*: Context handoff from Codex to Antigravity via Unified Memory.
5. *Safe Cleanup*: `alpha-aos uninstall --project <path>` cleanly restoring original baseline.

Throughout this cycle, the **Single GSD Writer invariant** (D-11) is strictly enforced:
- `.planning/` state transitions require `acquireWriterLock`.
- Worker harness invocations run inside `witnessWorkerDelegation()`. Any attempt by a delegated worker (e.g. Hermes) to write to `.planning/` files is intercepted, throws `WorkerAuthorityError`, and immediately rolls back without touching valid planning documents.

#### Existing Analog
- [`src/core/worker-authority.ts`](file:///D:/dev/alpha-AOS/src/core/worker-authority.ts#L194-L260): `witnessWorkerDelegation` and `assertControllerRole`.
- [`test/worker-authority.test.ts`](file:///D:/dev/alpha-AOS/test/worker-authority.test.ts#L81-L120): Cryptographic witness validation and unauthorized worker mutation rollback.
- [`test/canary.test.ts`](file:///D:/dev/alpha-AOS/test/canary.test.ts#L58-L94): `runHandoffCanary` asserting `.planning/` tree immutability across cross-harness handoffs.

#### Concrete Code Pattern
```ts
test("Brownfield E2E Cycle: Single Writer Enforcement during Worker Delegation (REL-04, D-11)", async (context) => {
  const root = await scratchRoot(context, "brownfield-cycle");
  const fixture = await setupBrownfieldFixture(root);

  // 1. Controller holds writer lock during planning transitions
  const session = await acquireMutationSession({
    projectRoot: fixture.path,
    harnessId: "codex",
    role: "controller",
  });

  try {
    // 2. Delegate implementation work to Hermes inside witness wrapper
    await assert.rejects(
      () =>
        witnessWorkerDelegation({
          projectRoot: fixture.path,
          harnessId: "hermes",
          role: "worker",
          action: async () => {
            // Malicious or accidental worker mutation to .planning/
            await writeFile(join(fixture.path, ".planning", "STATE.md"), "tampered: true\n");
          },
        }),
      (err: unknown) => {
        assert.ok(err instanceof WorkerAuthorityError);
        assert.equal(err.code, "planning-mutation-detected");
        assert.equal(err.harnessId, "hermes");
        return true;
      }
    );

    // 3. Verify .planning/STATE.md was restored byte-for-byte
    const stateContent = await readFile(join(fixture.path, ".planning", "STATE.md"), "utf8");
    assert.doesNotMatch(stateContent, /tampered/);
  } finally {
    await session.release();
  }
});
```

---

### 7. Cryptographic Provenance, Two-Stage Smoke Testing & Release Automation

#### Pattern Description
Publishing v0.1.0 requires cryptographic release provenance (REL-06, D-13..D-16):
1. **Provenance Validator (`scripts/verify-provenance.mjs`)**: Verifies SHA-256 checksum of `alpha-aos-0.1.0.tgz`, audits internal `dist/build-artifact.json`, and asserts that `catalog/stack.lock.json` matches release records.
2. **Two-Stage Smoke Test (`scripts/smoke-test.mjs`)**:
   - *Stage 1 (Pre-publish)*: Installs local `alpha-aos-0.1.0.tgz` in a fresh temp directory, verifying `--version`, `status`, and `doctor`.
   - *Stage 2 (Post-publish)*: Installs `alpha-aos@0.1.0` from the public npm registry in a fresh sandbox and verifies identical exit-0 assertions.
3. **Release Orchestrator (`scripts/release.mjs`)**: Non-mutating by default (`--dry-run`), requiring explicit `--publish` to execute `npm publish`.

#### Existing Analog
- [`scripts/build-artifact.mjs`](file:///D:/dev/alpha-AOS/scripts/build-artifact.mjs#L44-L59): SHA-256 digest computation and manifest integrity validation.
- [`scripts/run-tests.mjs`](file:///D:/dev/alpha-AOS/scripts/run-tests.mjs#L63-L72): Process execution under scrubbed environments.

---

## Key Anti-Patterns & Don't Hand-Roll Table

| Anti-Pattern | Why It Fails | What to Use Instead |
|:-------------|:-------------|:--------------------|
| Spawning external `tar` executable | Platform flags diverge (`bsdtar` on macOS/Windows vs GNU `tar` on Linux); shell injection vulnerabilities | Node.js built-in `node:zlib.gunzipSync` + 512-byte POSIX tar block parser |
| Parsing platform `shasum` or `CertUtil` output | Output formats differ wildly across operating systems; parsing shell text is fragile | Node.js built-in `node:crypto.createHash("sha256")` |
| Comparing paths with `.startsWith(root)` | Vulnerable to symlink escapes, casing differences on Windows/macOS, and trailing separator bypasses | `canonicalizeWithMissingTail` and `withinTreeRoot` |
| Using `/tmp/` or Windows `C:\Temp` directly | Race conditions, multi-user file collision, and leftover dirty state | `node:fs/promises.mkdtemp(join(tmpdir(), "alpha-aos-release-"))` with `context.after()` cleanup |
| Hardcoding `prefix/bin/alpha-aos` | On Windows, npm creates `prefix/alpha-aos.cmd` directly under prefix, causing `ENOENT` failures | Cross-platform resolver checking `process.platform === "win32"` (`.cmd` vs `bin/`) |
| Allowing candidate lock in release tarball | Exposes end users to unverified upstream dependencies, violating REL-05 | Triple-gate: `package.json` `files` whitelist + `.npmignore` + fail-closed `audit-tarball.mjs` |
| Relying on prompt instructions to protect `.planning/` | LLM workers can fail instructions or hallucinate file writes to planning directory | Cryptographic witness wrapper `witnessWorkerDelegation` with automatic byte-level rollback |
| Merging CLI discovery and canary runs into one command | Canaries spend model turns and require credentials; discovery is free, offline, and universal | Strict separation: `doctor --discovery` (free) vs `doctor --canary` (explicit spend announcement) |

---

## Code Signatures & Concrete Excerpts

### 1. `scripts/verify-provenance.mjs`
```js
#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { listTarballFiles } from "./audit-tarball.mjs";

export function computeFileSha256(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

export function verifyProvenance(tarballPath, sha256Path) {
  if (!existsSync(tarballPath)) {
    process.stderr.write(`Tarball missing: ${tarballPath}\n`);
    return 3;
  }
  const expectedHash = readFileSync(sha256Path, "utf8").trim().split(/\s+/)[0];
  const actualHash = computeFileSha256(tarballPath);

  if (actualHash !== expectedHash) {
    process.stderr.write(`SHA-256 hash mismatch!\nExpected: ${expectedHash}\nActual:   ${actualHash}\n`);
    return 3;
  }

  const files = listTarballFiles(tarballPath);
  const filePaths = new Set(files.map((f) => f.path));

  // Must include build artifact manifest and stack lock
  if (!filePaths.has("dist/build-artifact.json")) {
    process.stderr.write("Tarball missing dist/build-artifact.json!\n");
    return 3;
  }
  if (!filePaths.has("catalog/stack.lock.json")) {
    process.stderr.write("Tarball missing catalog/stack.lock.json!\n");
    return 3;
  }

  process.stdout.write(`Provenance verified: ${tarballPath} matches SHA-256 ${actualHash.slice(0, 16)}...\n`);
  return 0;
}
```

### 2. `scripts/smoke-test.mjs`
```js
#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export async function runSmokeTest(target, isRegistry = false) {
  const sandbox = await mkdtemp(join(tmpdir(), "alpha-aos-smoke-"));
  const home = join(sandbox, "home");
  const prefix = join(sandbox, "prefix");
  const state = join(sandbox, "state");

  try {
    await mkdir(home, { recursive: true });
    await mkdir(prefix, { recursive: true });
    await mkdir(state, { recursive: true });

    const env = {
      ...process.env,
      HOME: home,
      USERPROFILE: home,
      ALPHA_AOS_STATE_DIR: state,
      npm_config_prefix: prefix,
    };

    // npm install -g
    const installArgs = ["install", "-g", target, "--prefix", prefix];
    const installRes = spawnSync("npm", installArgs, { env, encoding: "utf8", windowsHide: true });
    if (installRes.status !== 0) {
      process.stderr.write(`Smoke install failed:\n${installRes.stderr}\n`);
      return 1;
    }

    // Resolve CLI binary
    const binPath = process.platform === "win32"
      ? (existsSync(join(prefix, "alpha-aos.cmd")) ? join(prefix, "alpha-aos.cmd") : join(prefix, "bin", "alpha-aos.cmd"))
      : join(prefix, "bin", "alpha-aos");

    // Run smoke assertions: --version, status, doctor
    for (const cmd of [["--version"], ["status"], ["doctor"]]) {
      const res = spawnSync(binPath, cmd, { env, encoding: "utf8", windowsHide: true });
      if (res.status !== 0) {
        process.stderr.write(`Smoke check "alpha-aos ${cmd.join(" ")}" failed (exit ${res.status}):\n${res.stderr}\n`);
        return 1;
      }
    }

    process.stdout.write(`Smoke test PASSED for ${target}\n`);
    return 0;
  } finally {
    await rm(sandbox, { recursive: true, force: true, maxRetries: 5 });
  }
}
```

---

## Verification & Test Patterns

### Test Framework Alignment
- Framework: Native `node:test` runner executing compiled test suites in `dist/test/`.
- Execution: Always dispatched via `scripts/run-tests.mjs` to strip `npm_config_*` lifecycle injections and machine-scope Windows prefix bleed.
- Baseline: **867 tests** currently passing. All Phase 7 suites add to this baseline without regressions.

### Per-Wave Verification Commands

1. **Wave 1 (REL-01, REL-05): Packaging & Cross-Platform Fixtures**
   ```bash
   npm run check && npm run build
   node scripts/audit-tarball.mjs
   node scripts/run-tests.mjs --files dist/test/tarball-fixture.test.js
   ```

2. **Wave 2 (REL-02, REL-03): Support Matrix & Paired Acceptance Controls**
   ```bash
   npm run check && npm run build
   node scripts/run-tests.mjs --files dist/test/support-matrix.test.js dist/test/release-controls.test.js
   ```

3. **Wave 3 (REL-04): Brownfield GSD Cycle Benchmark**
   ```bash
   npm run check && npm run build
   node scripts/run-tests.mjs --files dist/test/brownfield-gsd-cycle.test.js
   node scripts/run-brownfield-proof.mjs
   ```

4. **Wave 4 (REL-05, REL-06): Provenance, Documentation & Smoke Verification**
   ```bash
   npm run check && npm run build
   node scripts/run-tests.mjs --files dist/test/provenance.test.js
   node scripts/smoke-test.mjs --local
   node scripts/release.mjs --dry-run
   npm test
   ```

---

*Pattern Mapping complete for Phase 07: Cross-Platform Release Proof.*
