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
