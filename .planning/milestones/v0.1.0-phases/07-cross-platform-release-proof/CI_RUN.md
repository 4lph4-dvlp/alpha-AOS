# Cross-Platform CI Run Evidence: alpha-AOS v0.1.0

This document records the inspectable, multi-OS GitHub Actions CI execution and byte-identical archive verification for the `alpha-AOS` v0.1.0 release as required by `REL-01`, `REL-05`, and `D-01`.

## 1. Run Metadata

| Field | Value |
|---|---|
| **Run ID** | `35496805483` |
| **Workflow URL** | https://github.com/4lph4-dvlp/alpha-AOS/actions/runs/35496805483 |
| **Workflow File** | `.github/workflows/ci.yml` |
| **Trigger** | `push` |
| **Commit SHA** | `f5c87084534ef03dc82b8cae6403c617ebbc1736` |
| **Branch** | `main` |
| **Status** | **Completed Successfully (100% Pass across all jobs)** |

## 2. Authoritative Release Package

The authoritative release package was packed and audited in the `Authoritative Release Package (Linux)` job on `ubuntu-latest`:

- **Tarball Filename**: `alpha-aos-0.1.0.tgz`
- **File Size**: `574,409` bytes
- **SHA-256 Digest**: `ce176c364fdaaa736343fca3656248e12fed673d20b0cab426b5d0da831e47b4`
- **Artifact Name**: `release-tarball`

## 3. Matrix Job Verification & Execution Summary

Each OS runner independently downloaded the `release-tarball` artifact, computed and verified the SHA-256 checksum against the uploaded `alpha-aos-0.1.0.tgz.sha256`, and executed the full validation suite.

| Job Name | Platform / OS | Node.js | Duration | Job ID | SHA-256 Verification | Test Suite Result | Status |
|---|---|---|---|---|---|---|---|
| **Authoritative Release Package** | Ubuntu Linux (`ubuntu-latest`) | Node 24 | 31s | `106041167092` | Built & Computed (`ce176c36...`) | Pack & Audit Allowlist Passed | **PASS** |
| **ubuntu-latest / Node 24** | Ubuntu Linux (`ubuntu-latest`) | Node 24 | 2m43s | `106041247804` | Match (`ce176c36...`) | 894 tests pass (0 fail, 0 skip) | **PASS** |
| **macos-latest / Node 24** | Apple macOS (`macos-latest`) | Node 24 | 3m37s | `106041247803` | Match (`ce176c36...`) | 894 tests pass (0 fail, 0 skip) | **PASS** |
| **windows-latest / Node 24** | Microsoft Windows (`windows-latest`) | Node 24 | 7m6s | `106041247797` | Match (`ce176c36...`) | 894 tests pass (0 fail, 0 skip) | **PASS** |

## 4. Verification Steps Executed on Each Platform

Every platform runner verified the following steps in order:
1. `actions/checkout@v6`
2. `actions/setup-node@v6` with Node.js 24
3. `npm ci`
4. `actions/download-artifact@v4` (downloading `release-tarball`)
5. Verify release tarball checksum with Node.js crypto (`crypto.createHash('sha256')`)
6. `npm run check` (strict TypeScript `tsc -p tsconfig.json --noEmit`)
7. `npm test` (full 894-test suite via compiled Node test runner)
8. `Verify the build artifact manifest` (`node scripts/build-artifact.mjs check`)
9. `Safety boundary suites` (isolation, paths, transactions, process redactions)
10. Shell wrapper syntax verification:
    - POSIX wrapper syntax check (`bash -n scripts/*.sh`) on Ubuntu & macOS
    - PowerShell wrapper syntax check (`pwsh -Command "..."`) on Windows

## 5. Conclusion

The authoritative release package `alpha-aos-0.1.0.tgz` is cryptographically identical across all runners (`ce176c364fdaaa736343fca3656248e12fed673d20b0cab426b5d0da831e47b4`) and satisfies all requirements of `REL-01`, `REL-05`, and `D-01` across Linux, macOS, and Windows.
