# Dependency Candidate Promotion Evidence Ledger

- **Evaluated Timestamp**: 2026-09-25T04:14:17Z
- **Baseline Run ID (main)**: [36092161231](https://github.com/4lph4-dvlp/alpha-AOS/actions/runs/36092161231)
- **Baseline Head SHA**: `793a1ad6241c95ed4fe7da70908895273ef0bc38`
- **Candidate PR**: [#1 (chore: validate dependency candidate)](https://github.com/4lph4-dvlp/alpha-AOS/pull/1)
- **Candidate Branch**: `automation/dependency-candidate`
- **Candidate PR Run ID**: [36092908991](https://github.com/4lph4-dvlp/alpha-AOS/actions/runs/36092908991)
- **Candidate PR Head SHA**: `cd06f9d474ecb1a80b2681f85b235671c7cd8842`

---

## 1. Candidate Component Matrix

All 5 candidate components were validated locally in Wave 1 via isolated pre-flight fixtures prior to remote baseline execution. All cryptographic SRI digests have been confirmed against live npm registry manifests.

| Component | Channel | Version | SHA-512 SRI Hash | Isolated Fixture Status | Notes / Invariants |
|---|---|---|---|---|---|
| `@opengsd/gsd-core` | `gsd` | `1.14.0` | `sha512-e05sV2c8KlcQ2hoJ4U3U1OBjqswQOon4C29Cs75fEAr+tq7qJ/XyFYrN/nwblREWUkPUUoxmVzLVj4Im2KjQxQ==` | ✅ PASS | Preserves `profile: "standard"` invariant; 23 skills verified; Stop hook smoke passed |
| `ecc-universal` | `ecc` | `2.2.1` | `sha512-D8vFXQ++Aub1CD2RPyYfPEXVt51eEHzvImLd1XaOos/gUxYRWU+BRDXMDnmRrjDfWwX5+uFEJULYpqPYFPSGuw==` | ✅ PASS | 22 skills rendered; `deep-research` target hash invariant verified (`fdd97098a3a4...`) |
| `@upstash/context7-mcp` | `mcp.context7` | `4.1.1` | `sha512-fUARTIZGVKzlzQKDhKUg4aIQ3yEU/12STdfxJDDnLMSN7yyHiPvNHI05iFwxkv3vC8G76Wp27MwK6Jucl/C5pA==` | ✅ PASS | JSON-RPC stdio handshake passed (`resolve-library-id`, `query-docs`) |
| `firecrawl-mcp` | `mcp.firecrawl` | `3.25.2` | `sha512-Z0PWA9UD757p8w1ahAh6Fyqm28uDc8ng7OkTE3NE0x1F85vAeU4/MMmx1l+xtmDm8OSpybriMjNJZavca4ijfA==` | ✅ PASS | JSON-RPC stdio handshake passed (4 tools: scrape, map, crawl, check_crawl_status) |
| `pi-mcp-adapter` | `mcpBridges.pi` | `2.36.0` | `sha512-aX7Hf1FMGoHFjjx2Y4t12Hkue83CiBQmZaeQQ0mg+2wxOzbIOYdWzEkh1bmKlLHKiH6zRWlxWitsr+RaiXvoRQ==` | ✅ PASS | Clean Windows bridge install via normalized direct launch (`bridgeVersion=2.36.0`) |
| `exa-mcp-server` | `mcp.exa` | `3.4.1` | `sha512-X6g4J9LXLJZ0uK52G8KE/KCaxpaD+wkEHzjkoDTYkC+afxfm5xqWgih3i0hgTfyufl6PggkLeR0L6rDAxW6ETg==` | ✅ PASS | Pinned version unchanged; pre-existing locked component |

---

## 2. Red-Main Guard Baseline Verification

The Red-Main Guard (`scripts/check-main-baseline.mjs`) queried GitHub Actions for the remote `main` branch baseline after pushing Phase 10–12 and Wave 1 commits:

- **Query**: `node scripts/check-main-baseline.mjs --branch main --update-pr --pr-number 1`
- **Evaluated Baseline Run**:
  - Run ID: `36092161231`
  - URL: https://github.com/4lph4-dvlp/alpha-AOS/actions/runs/36092161231
  - Commit SHA: `793a1ad6241c95ed4fe7da70908895273ef0bc38`
  - Conclusion: `success`
- **Guard Verdict**: `eligible: true`
- **PR #1 Guard Action**:
  - Status banner updated to: `### ✅ Promotion Eligible: Main CI Baseline is Green`
  - `promotion-blocked` label: **REMOVED**
  - PR State: `OPEN`, unblocked for candidate verification

---

## 3. PR #1 GitHub Actions 3-OS CI Matrix Evidence

Following rebase of `automation/dependency-candidate` onto the verified green `main` baseline commit (`793a1ad`), GitHub Actions executed workflow run **#36092908991** across Linux, macOS, and Windows.

- **Workflow Run ID**: [36092908991](https://github.com/4lph4-dvlp/alpha-AOS/actions/runs/36092908991)
- **Head Commit SHA**: `cd06f9d474ecb1a80b2681f85b235671c7cd8842`
- **Overall Run Conclusion**: `success`

### Matrix Job Outcomes

| Job Name | Platform / Runner | Job ID | Duration | Status | Conclusion |
|---|---|---|---|---|---|
| Authoritative Release Package (Linux) | `ubuntu-latest` | `107938900266` | 29s | `completed` | `success` |
| Test on Linux (ubuntu-latest) | `ubuntu-latest` (Node 24) | `107939013994` | 2m 3s | `completed` | `success` |
| Test on macOS (macos-latest) | `macos-latest` (Node 24) | `107939013965` | 4m 28s | `completed` | `success` |
| Test on Windows (windows-latest) | `windows-latest` (Node 24) | `107939014000` | 9m 24s | `completed` | `success` |

All four matrix jobs passed with zero failures. Both standard unit tests (`npm test`) and safety boundary suites (`Safety boundary suites`) completed cleanly on every operating system.

---

## 4. GSD Core 1.14.0 4-Harness Fixture Receipt

GSD Core `1.14.0` was evaluated across all 4 supported harness targets (`codex`, `claude`, `antigravity`, `pi`) using `runGsdFixture` against the downloaded npm package tarball (`@opengsd/gsd-core-1.14.0.tgz`).

- **Package**: `@opengsd/gsd-core`
- **Version**: `1.14.0`
- **Integrity**: `sha512-e05sV2c8KlcQ2hoJ4U3U1OBjqswQOon4C29Cs75fEAr+tq7qJ/XyFYrN/nwblREWUkPUUoxmVzLVj4Im2KjQxQ==`
- **Lifecycle Profile Spine Invariant**: `profile: "standard"` strictly preserved across all harness targets.

### Per-Harness Fixture Metrics

| Harness Target | Profile | Skills Count | Sentinels Status | Codex Stop Hook Smoke | Overall Result |
|---|---|---|---|---|---|
| `codex` | `standard` | 23 skills | `clean` (global sentinels unchanged) | ✅ PASS (`exitCode: 0`) | ✅ PASS |
| `claude` | `standard` | 23 skills | `clean` (global sentinels unchanged) | N/A | ✅ PASS |
| `antigravity` | `standard` | 23 skills | `clean` (global sentinels unchanged) | N/A | ✅ PASS |
| `pi` | `standard` | 0 skills (delegates to adapter) | `clean` (global sentinels unchanged) | N/A | ✅ PASS |

### Codex Hook Helpers Byte-Identity Verification

Codex compatibility adapter helpers in `@opengsd/gsd-core@1.14.0` were extracted and compared bit-for-bit against the baseline 1.12.0 distribution:
- `hooks/lib/hook-exit.js`: **byte-identical**
- `hooks/lib/cli-exit.js`: **byte-identical**
- `hooks/lib/exit-code-registry.js`: **byte-identical**

No renderer adjustments or hash updates were required in `src/core/gsd-compat.ts`. All Codex compatibility stop-hook invocations exited cleanly with zero spurious output.

---

## 5. ECC 2.2.1 Skills Diff & Hash Pinning Receipt

The runtime component `ecc-universal@2.2.1` was unpacked and evaluated for all 22 declared skills (3 global skills + 19 project-pack skills).

- **Package**: `ecc-universal`
- **Version**: `2.2.1`
- **Integrity**: `sha512-D8vFXQ++Aub1CD2RPyYfPEXVt51eEHzvImLd1XaOos/gUxYRWU+BRDXMDnmRrjDfWwX5+uFEJULYpqPYFPSGuw==`

### Full Skill Hash Ledger (All 22 Skills)

All skill source SHA-256 digests were re-derived and written atomically to `catalog/stack.lock.json` via `scripts/pin-pack-skills.mjs write --all`:

| Skill Identifier | Category | Source SHA-256 (ECC 2.2.1) | Source Diff vs 2.2.0 |
|---|---|---|---|
| `unified-memory` | Global Skill | `a6eb9a96b92dfd4a700bceff15195ca1fd4b7fad2944bb014c08812d1a0dc8b0` | Identical |
| `documentation-lookup` | Global Skill | `81ad2b5b4acbe02259f4b6cbfd9111d81d5cfe51025051b6048959c45f6516c1` | Identical |
| `deep-research` | Global Skill | `72e184f5d0f31ca4d45286753409d8c8431b025e8ac3800dcc9f32d9e930f58a` | **Shifted** (upstream refinement) |
| `accessibility` | Pack: Web | `d8578fe750e7321658450386e2112a46ea1aedca0235fbf97f3db2457e599b3a` | Identical |
| `agent-harness-construction` | Pack: Infra | `e7fb390a6663b46ea5d3c2876753a5ce32ba3bad1889686b21a42894caa1742d` | Identical |
| `ai-regression-testing` | Pack: Eval | `83f2f5c4083af5762dd658f742d4a390eb3a6f969d835f69e8f47efba296c127` | Identical |
| `browser-qa` | Pack: Web | `c501257d2c9ca711342b56d7adfb04897f17c6946dc6cdb88a5c75c87e4aa951` | Identical |
| `click-path-audit` | Pack: Web | `662fc5d02483bcd8ff799d6d3109a38da673182341cfc14445e9076fcd920162` | Identical |
| `database-migrations` | Pack: Data | `ad7f2f04ca03e592a16e2a539d8c6e90bf4e08892408820ce99a53e9d07775de` | Identical |
| `deployment-patterns` | Pack: Infra | `b864abd1954570c4a469b7e1deb897e57858d25db2fd98d035ff7bca4a15b9b6` | Identical |
| `docker-patterns` | Pack: Infra | `2a880cf2f6401874151daa9bcc0eacd10cf79f5f48b97f98e93a877a8f3fd12b` | Identical |
| `eval-harness` | Pack: Eval | `9d3afbeca1479975c2575daa7467ca3666e7627fcebe02ea050f2db93917c4fd` | Identical |
| `frontend-a11y` | Pack: Web | `62afdfd4e616ed21bf9037d47f771f3504d21838c898b9e9de8ac0da9b0bf3f7` | Identical |
| `inherit-legacy-style` | Pack: Web | `14e7b20424f123b594d3ee3d6ac3e722b21e5a6816fe90bacf8a23e6c3af5b6d` | Identical |
| `mcp-server-patterns` | Pack: Infra | `eacb07c953e0440c758e3ee7d92984d2c9128e3444005ea7ad5da7bc0201d43d` | Identical |
| `postgres-patterns` | Pack: Data | `9c8c391ae9e9aa87faa7ca091e1d395c97766df14080d0bfbea8a97721776163` | Identical |
| `redis-patterns` | Pack: Data | `6cabb1cd03174a0584ff3538371c780aba90da156db15260691278ed3307d8fe` | Identical |
| `scientific-db-pubmed-database` | Pack: Research | `516c24ed8c74713191ec2424accf11f8f5518356b046561e5017f40687289838` | Identical |
| `scientific-db-uspto-database` | Pack: Research | `96849e8dc762df699fea11a283e9424660dd3b606e7e513617e4e9a9ce2011be` | Identical |
| `scientific-thinking-literature-review` | Pack: Research | `456e7ef6b33300bfefeeee46fc8dae55fec62e4a8b418ba2323e12779de70195` | Identical |
| `scientific-thinking-scholar-evaluation` | Pack: Research | `e9f8a3bce2bce769a96611a52804a2b3955f2796ee2749bc8275aea38a26cd2d` | Identical |
| `security-review` | Pack: Security | `fe6f9151fb15c1dffd47a55080c3ad147af7c95dd0ad3714735dec6824b060b7` | Identical |

### Deep-Research Semantic Diff & Target Hash Invariance

- **Source Diff**: In `skills/deep-research/SKILL.md`, upstream ECC 2.2.1 added minor research clarifying questions in Step 2.
- **Renderer Invariant**: `renderDeepResearchSkill` in `src/core/ecc-fixture.ts` deterministically strips upstream tool references, replacing Step 3 and Step 4 with the alpha-AOS allowlisted MCP tools contract.
- **Target Hash**:
  ```text
  fdd97098a3a4a02513baf0428faacbe390b42fd4f86362387938e3455c80d90c
  ```
  The rendered skill output across all 5 harnesses (`claude`, `codex`, `antigravity`, `pi`, `hermes`) produced this **exact byte-identical target hash**, proving complete rendering invariance despite upstream source shifts.
- **Policy Finding**: CAPA-02 routing reconciliation was re-evaluated per D-09. Upstream still references unpublished Exa tools and policy-denied Firecrawl search; the `narrow` finding in `src/core/mcp-proxy.ts` was retained and updated to `runtime: "ecc-universal@2.2.1"`.

---

## 6. MCP Servers & Pi Bridge Fixture Receipts

The external tool servers and native bridge adapters were verified through isolated child-process JSON-RPC handshakes and direct CLI installation.

### 1. `@upstash/context7-mcp@4.1.1`
- **Integrity**: `sha512-fUARTIZGVKzlzQKDhKUg4aIQ3yEU/12STdfxJDDnLMSN7yyHiPvNHI05iFwxkv3vC8G76Wp27MwK6Jucl/C5pA==`
- **Transport**: stdio JSON-RPC 2.0
- **Handshake**: Initialized cleanly with protocol version negotiation.
- **Published Tools (`tools/list`)**:
  - `resolve-library-id`
  - `query-docs`
- **Result**: ✅ PASS

### 2. `firecrawl-mcp@3.25.2`
- **Integrity**: `sha512-Z0PWA9UD757p8w1ahAh6Fyqm28uDc8ng7OkTE3NE0x1F85vAeU4/MMmx1l+xtmDm8OSpybriMjNJZavca4ijfA==`
- **Transport**: stdio JSON-RPC 2.0
- **Handshake**: Initialized cleanly behind the local policy proxy.
- **Published Tools (`tools/list`)**:
  - `firecrawl_scrape`
  - `firecrawl_map`
  - `firecrawl_crawl`
  - `firecrawl_check_crawl_status`
- **Filtering**: Proxied and enforced against alpha-AOS 4-tool allowlist.
- **Result**: ✅ PASS

### 3. `pi-mcp-adapter@2.36.0`
- **Integrity**: `sha512-aX7Hf1FMGoHFjjx2Y4t12Hkue83CiBQmZaeQQ0mg+2wxOzbIOYdWzEkh1bmKlLHKiH6zRWlxWitsr+RaiXvoRQ==`
- **Harness Environment**: Windows 11 & cross-platform runners.
- **Fixture Fixes Applied**:
  - `verifyPackage` buffer capacity expanded to 256 KB to parse the 23 KB manifest without truncation.
  - Command invocation normalized using `resolveDirectLaunch` to prevent Windows `spawn EINVAL`.
- **Command Output**: `pi install npm:pi-mcp-adapter@2.36.0` completed with exit code 0 (`bridgeVersion=2.36.0`).
- **Result**: ✅ PASS

### 4. `exa-mcp-server@3.4.1`
- **Integrity**: `sha512-X6g4J9LXLJZ0uK52G8KE/KCaxpaD+wkEHzjkoDTYkC+afxfm5xqWgih3i0hgTfyufl6PggkLeR0L6rDAxW6ETg==`
- **Status**: Pre-existing pinned version retained; verification confirmed.
- **Result**: ✅ PASS

---

## 7. Final Promotion Verdict & Candidate Channel Reset Confirmation

All five candidate components successfully satisfied the strict 3-tier promotion criteria:
1. **Tier 1 (SRI Verification)**: Live npm registry SHA-512 hashes matched candidate declarations bit-for-bit.
2. **Tier 2 (Isolated Fixtures)**: Pre-flight isolated execution passed across all 4 harnesses, 22 skills, and 3 MCP components.
3. **Tier 3 (3-OS CI Matrix)**: Baseline run #36092161231 and PR #1 run #36092908991 passed 100% across Ubuntu, macOS, and Windows.

### Promotion Execution Actions
- **Maintainer Automation**: Executed `node scripts/promote-candidate.mjs --verify-integrity --reset-candidate`.
- **Authoritative Lock (`catalog/stack.lock.json`)**: Updated to include all 5 verified candidate versions with updated `generatedAt` timestamp. Schema validity confirmed via `loadLock(root, "stable")`.
- **Candidate Channel (`catalog/candidate.lock.json`)**: Safely reset on `main` to:
  ```json
  {
    "schemaVersion": 1,
    "channel": "candidate",
    "generatedAt": null,
    "status": "empty",
    "components": {}
  }
  ```
- **Code & Test Synchronization**: Active constants in `src/core/mcp-proxy.ts`, `catalog/canaries.yaml`, `AGENTS.md`, and test assertions synchronized to `2.2.1` while preserving historical records.
- **Strategy B-1 Release Sanitation**: Executed `npm pack` followed by `node scripts/audit-tarball.mjs alpha-aos-0.1.0.tgz`. Proved that all 175 package entries conform to the positive allowlist, and that `.planning/` and `candidate.lock.json` are strictly excluded from distribution tarballs.

**Overall Promotion Verdict**: **PROMOTION COMPLETE AND AUTHORITATIVELY COMMITTED TO MAIN**.

