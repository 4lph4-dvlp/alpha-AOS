# How-To: Promote Dependency Candidates in alpha-AOS

This guide documents the official Standard Operating Procedure (SOP) for evaluating, verifying, and promoting upstream dependency candidates into the authoritative `catalog/stack.lock.json` in **alpha-AOS**.

---

## 1. Overview & Core Principles

alpha-AOS is a cross-platform control plane that establishes deterministic, secure AI-agent working environments across Claude Code, Codex, Antigravity, Pi Agent, and Hermes Agent. Because AI agents execute commands and manipulate tool environments with elevated privileges, external dependency updates must never be introduced automatically or blindly into production.

The dependency promotion lifecycle adheres to four core principles:

1. **Staged Continuous Discovery**: Upstream dependency releases are continuously discovered by automated workflows and staged in `catalog/candidate.lock.json` on dedicated branches (e.g., `automation/dependency-candidate`), completely isolated from the runtime stable lock.
2. **Independent 3-Tier Promotion Gates**: Promotion is never an "all-or-nothing" blanket merge. Every candidate component is evaluated independently across three verification tiers:
   - **Tier 1 (Cryptographic SRI)**: Subresource Integrity (SHA-512) verification against live npm registry manifests.
   - **Tier 2 (Isolated Component Fixtures)**: Pre-flight isolated execution across supported harnesses without credentials or user environment mutation.
   - **Tier 3 (Cross-Platform Matrix Proof)**: 100% green execution across the 3-OS GitHub Actions CI matrix (Ubuntu, macOS, Windows).
3. **Red-Main Guard Invariant**: Candidate PRs are gated against the health of `main`. If remote `main` CI is failing, promotion evaluation is strictly blocked to prevent conflating candidate regressions with existing baseline defects.
4. **Strategy B-1 Release Sanitation**: Development and planning artifacts (such as `.planning/`, `catalog/candidate.lock.json`, test fixtures, and scratch files) must be strictly excluded from production npm distribution tarballs and public release channels.

---

## 2. Channel Architecture & Boundaries

alpha-AOS separates dependency states into two distinct channels governed by [`schemas/lock.schema.json`](file:///D:/dev/alpha-AOS/schemas/lock.schema.json):

```text
                  +-----------------------------------+
                  |  Scheduled Discovery Workflow     |
                  |  (.github/workflows/candidate.yml)|
                  +-----------------+-----------------+
                                    |
                                    v
                     [catalog/candidate.lock.json]
                     Channel: "candidate"
                     (Unverified staging, PR-only)
                                    |
            +-----------------------+-----------------------+
            |                       |                       |
            v                       v                       v
     [Tier 1: SRI]          [Tier 2: Fixtures]       [Tier 3: 3-OS CI]
     Registry Hash Match    4-Harness / Stdio RPC    Linux / macOS / Windows
            |                       |                       |
            +-----------------------+-----------------------+
                                    |
                    Maintainer Promotion CLI
                    (scripts/promote-candidate.mjs)
                                    |
                                    v
                     [catalog/stack.lock.json]
                     Channel: "stable"
                     (Authoritative runtime source)
                                    |
                        +-----------+-----------+
                        |                       |
                        v                       v
               alpha-aos install       alpha-aos update --apply
```

| Channel File | Target Channel | Purpose | Consumption Contract |
|---|---|---|---|
| [`catalog/stack.lock.json`](file:///D:/dev/alpha-AOS/catalog/stack.lock.json) | `stable` | The authoritative, immutable dependency lock for end users. Contains exact versions, package names, and SHA-512 SRI digests. | Consumed by `alpha-aos install`, `alpha-aos update --apply`, harness adapters, and core tests. |
| [`catalog/candidate.lock.json`](file:///D:/dev/alpha-AOS/catalog/candidate.lock.json) | `candidate` | Staging channel populated by automated candidate discovery. Contains proposed version bumps under evaluation. | Never consumed by runtime commands. Once promotion lands on `main`, this file is reset to `status: "empty"` with empty components (`{}`). |

---

## 3. Red-Main Guard Baseline Gating

Before evaluating candidate PRs, verify that the remote `main` baseline is green using [`scripts/check-main-baseline.mjs`](file:///D:/dev/alpha-AOS/scripts/check-main-baseline.mjs).

### Why the Guard Exists
If remote `main` is red due to an infrastructure glitch, network timeout, or test failure, evaluating a candidate PR against that baseline will yield false negatives or mask new regressions introduced by the candidate.

### Guard Operations
Run the guard against the target PR:
```powershell
node scripts/check-main-baseline.mjs --branch main --update-pr --pr-number 1
```

- **When `main` is Green**:
  - Reports `eligible: true`.
  - Automatically updates the PR description banner to `### ✅ Promotion Eligible: Main CI Baseline is Green`.
  - Automatically removes the `promotion-blocked` label if present.
- **When `main` is Red or In-Progress**:
  - Reports `eligible: false` with the failure reason.
  - Automatically updates the PR description banner to `### ❌ Promotion Blocked: Main CI Baseline is Red`.
  - Applies the `promotion-blocked` label to prevent merging.

---

## 4. The 3-Tier Promotion Gate Sequence

Every candidate package must pass through three verification tiers before inclusion in `catalog/stack.lock.json`:

### Tier 1: Registry Integrity Verification (SRI)
- The promotion automation queries `https://registry.npmjs.org/<package>` over HTTPS using Node's built-in `fetch`.
- It retrieves the published package manifest for the candidate version and extracts `dist.integrity`.
- The live SRI digest must match the staged digest in `catalog/candidate.lock.json` bit-for-bit.

### Tier 2: Isolated Component Fixtures
Candidate components are executed locally within disposable, synthetic sandbox environments:
- Runs with no external cloud API credentials required.
- Does not modify any user harness configuration (`~/.claude`, `~/.codex`, etc.).
- Verifies package extraction, protocol handshakes, and harness rendering.

### Tier 3: Cross-Platform Matrix Proof
The candidate branch must trigger a full run of the GitHub Actions CI workflow across all four matrix jobs:
1. **Authoritative Release Package** (`ubuntu-latest`): Validates build artifacts, schema conformance, and clean release packaging.
2. **Linux Test Suite** (`ubuntu-latest`, Node 24): Runs `npm test` and safety boundary test suites.
3. **macOS Test Suite** (`macos-latest`, Node 24): Runs `npm test` and safety boundary test suites.
4. **Windows Test Suite** (`windows-latest`, Node 24): Runs `npm test` and safety boundary test suites.

All jobs must reach conclusion `success` with 0 test failures.

---

## 5. Category-Specific Verification Gates

Different classes of components require specialized verification criteria during Tier 2 pre-flight testing:

### 1. Workflow Lifecycle Engines (`@opengsd/gsd-core`)
- **4-Harness Fixture**: Execute `runGsdFixture` across `claude`, `codex`, `antigravity`, and `pi`.
- **Profile Spine Invariant**: Must preserve `profile: "standard"` in `catalog/stack.lock.json`. Custom or divergent profiles are prohibited.
- **Sentinel Invariant**: Global lifecycle sentinels must report `status: "clean"`.
- **Codex Stop Hook Compatibility**: Check `hooks/lib/hook-exit.js`, `cli-exit.js`, and `exit-code-registry.js`. Verify compatibility helpers run cleanly with exit code 0 and zero spurious output.

### 2. Prompt & Skill Runtimes (`ecc-universal`)
- **Tarball Extraction & Inventory**: Unpack the runtime tarball into temporary storage and catalog all declared skills (global + project-pack).
- **Semantic Diff Inspection**: Perform a line-by-line diff of all 22 skills against the baseline release. Confirm that upstream changes do not introduce unauthorized tool requests, security policy bypasses, or broken instructions.
- **Target Hash Invariance**: For skills modified upstream (such as `deep-research`), run `renderDeepResearchSkill` to confirm that the deterministic alpha-AOS allowlist filter produces identical target hashes across all 5 harnesses (`claude`, `codex`, `antigravity`, `pi`, `hermes`).
- **Cryptographic Pinner**: Run `node scripts/pin-pack-skills.mjs write --all` to recompute and write `sourceSha256` for all 22 skills atomically into `catalog/stack.lock.json`. Verify with `node scripts/pin-pack-skills.mjs check`.

### 3. Model Context Protocol (MCP) Servers (`context7`, `firecrawl`, etc.)
- **Stdio JSON-RPC Handshake**: Launch the server as a child process with standard streams connected. Send `initialize` and negotiate protocol version.
- **Tool Listing (`tools/list`)**: Request published tools and compare against expected signatures.
- **Allowlist & Policy Proxy**: For servers fronted by the local proxy (e.g., `firecrawl-mcp`), verify that the 4-tool allowlist (`firecrawl_scrape`, `firecrawl_map`, `firecrawl_crawl`, `firecrawl_check_crawl_status`) correctly filters unapproved tools (e.g., `firecrawl_search`).

### 4. Native Harness Bridges (`pi-mcp-adapter`)
- **Command Resolution**: On Windows, ensure execution resolves through `resolveDirectLaunch` to avoid `spawn EINVAL` on `.cmd` wrappers.
- **Buffer Safety**: Ensure `verifyPackage` configures `excerptBytes: 256 * 1024` so large package manifests (>20 KB) do not trigger JSON truncation.
- **Installation Verification**: Execute `pi install npm:<bridge>@<version>` in a synthetic fixture home, verifying exit code 0 and reported bridge version.

---

## 6. Step-by-Step Maintainer Runbook

Follow this runbook when promoting verified candidate dependencies:

### Step 1: Pre-Flight & Baseline Health Check
Ensure your local tree is clean and on `main`:
```powershell
git checkout main
git pull origin main
node scripts/check-main-baseline.mjs --branch main
```
Confirm the baseline CI is green before proceeding.

### Step 2: Rebase Candidate Branch & Await CI
Rebase the staging branch onto latest `main`:
```powershell
git checkout automation/dependency-candidate
git rebase main
git push --force-with-lease origin automation/dependency-candidate
```
Unblock the PR and monitor GitHub Actions CI:
```powershell
node scripts/check-main-baseline.mjs --branch main --update-pr --pr-number 1
gh run watch <run-id>
```
Ensure all 4 matrix jobs pass cleanly.

### Step 3: Execute Candidate Promotion CLI
Switch back to `main` and execute the maintainer promotion CLI:
```powershell
git checkout main
node scripts/promote-candidate.mjs --verify-integrity --reset-candidate
```

This command will:
1. Fetch live SRI digests from the npm registry for candidate components.
2. Selectively update `catalog/stack.lock.json` with candidate versions and digests.
3. Update `generatedAt` timestamp on the stable lock.
4. Reset `catalog/candidate.lock.json` to `status: "empty"` with empty components.
5. Validate both lockfiles against `schemas/lock.schema.json`.

### Step 4: Re-Pin Pack Skill Hashes
If `ecc-universal` was updated, re-derive skill source hashes:
```powershell
node scripts/pin-pack-skills.mjs write --all
node scripts/pin-pack-skills.mjs check
```

### Step 5: Synchronize Code Constants & Test Assertions
If runtime versions changed, update active code literals:
1. In `src/core/mcp-proxy.ts`, update `ROUTING_CONTRACT_MISMATCH.runtime` (e.g. to `"ecc-universal@2.2.1"`).
2. In `catalog/canaries.yaml`, update version comments.
3. In `AGENTS.md`, update runtime version references.
4. In `test/catalog.test.ts` and `test/mcp-proxy.test.ts`, update version assertions.

> [!IMPORTANT]
> **Preserve Historical Documentation**: Do NOT edit historical release notes or documentation (such as `docs/alpha-vibe-stack-*`) when synchronizing active code constants.

Rebuild and verify tests:
```powershell
npm run check
npm run build
node --test dist/test/catalog.test.js dist/test/mcp-proxy.test.js
```

### Step 6: Verify Strategy B-1 Release Sanitation
Verify that distribution packaging excludes development planning files:
```powershell
npm pack --ignore-scripts
node scripts/audit-tarball.mjs alpha-aos-0.1.0.tgz
Remove-Item alpha-aos-0.1.0.tgz
```
Confirm the audit reports `PASSED` with 0 forbidden entries.

### Step 7: Record Formal Promotion Evidence
Open `.planning/phases/<phase>/PROMOTION-EVIDENCE.md` and record:
- The baseline CI run ID and commit SHA.
- The candidate PR CI run ID and commit SHA.
- The 3-OS matrix job duration and status breakdown.
- Pre-flight fixture receipts and skill hash ledger.
- Confirmation of candidate lock reset.

### Step 8: Commit & Push to Main
Commit all modified files atomically:
```powershell
git add catalog/stack.lock.json catalog/candidate.lock.json src/core/mcp-proxy.ts catalog/canaries.yaml AGENTS.md test/catalog.test.ts test/mcp-proxy.test.ts .planning/ docs/
git commit -m "feat(promotion): promote candidate dependencies to stable lock and synchronize code constants"
git push origin main
```

---

## 7. Strategy B-1 Release Hygiene Reference

Under **Strategy B-1**, internal GSD planning artifacts (`.planning/`) are maintained on `main` for full context and development auditability, but are **strictly excluded** from public release packages and distribution tarballs.

### Tarball Content Allowlist
The release packaging pipeline enforces an explicit allowlist in [`scripts/audit-tarball.mjs`](file:///D:/dev/alpha-AOS/scripts/audit-tarball.mjs):
- `dist/src/**` (compiled JavaScript and source maps)
- `catalog/**` (except `candidate.lock.json`)
- `schemas/**` (JSON Schema specifications)
- `scripts/**` (platform installation and verification scripts)
- `skills/**` (alpha-AOS owned skills)
- `docs/**` (public user documentation)
- `package.json`, `README.md`, `LICENSE`

### Forbidden Artifacts
The following directories and files are forbidden from release tarballs:
- `.planning/**` (planning documents, roadmap, state, research)
- `catalog/candidate.lock.json` (unverified candidate staging)
- `test/**` and `dist/test/**` (test files)
- `*.ts` (uncompiled TypeScript files)
- `.git/**`, `.github/**`, `.gitignore`
- Logs, temporary artifacts, and scratch directories (`scratch/`, `*.log`, `*.tmp`)

Every release build executes `scripts/audit-tarball.mjs` as a mandatory pre-publication gate. Any allowlist breach aborts the release immediately.
