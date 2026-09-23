# Requirements: alpha-AOS v0.1.1 CI Green & Dependency Promotion

**Defined:** 2026-09-23
**Core Value:** A user can enter any supported project on any supported operating system and get the same intentional AI-agent workflow, capability boundaries, and safety guarantees without manually rebuilding each harness configuration.

## v0.1.1 Requirements

### CI Baseline

- [x] **CI-01**: User running the suite on ubuntu or macOS sees `destinationFor resolves destinations across all five harnesses` pass, because its fixture root is built with the host platform's path APIs, and no test in `test/` asserts against a platform-specific absolute path literal
- [x] **CI-02**: User running the packed release lifecycle (install, reconcile, diagnose, uninstall) on Windows leaves every real host managed path, including `~/.alpha-aos`, byte-identical; the root cause is classified as a product isolation leak, a test-oracle defect, or a test-isolation leak (another test file writing the real host state during the lifecycle's snapshot window), recorded, and pinned by a regression test
- [x] **CI-03**: User sees `main` CI pass on ubuntu-latest, macos-latest, and windows-latest in a single run id
- [ ] **CI-04**: User sees a red `main` CI surfaced as an opened or refreshed tracking issue that closes when `main` is green again

### Lifecycle Verification

- [ ] **LIFE-09**: User can consult a verification report for the Phase 6 managed lifecycle in which each of LIFE-01..08 carries inspectable evidence, and any requirement not met is recorded as a named gap

### Dependency Promotion

- [ ] **DEP-01**: User can see dependency candidate PR #1 refreshed onto a green `main` and run through the three-OS CI and fixtures, with a per-component result recorded
- [ ] **DEP-02**: User receives the candidate versions (GSD Core 1.14.0, ecc-universal 2.2.1, context7-mcp 4.1.1, firecrawl-mcp 3.25.2, pi-mcp-adapter 2.36.0) in `catalog/stack.lock.json` only after green evidence and verified integrity hashes
- [ ] **DEP-03**: User sees the dependency candidate workflow mark promotion blocked, naming the failing run, whenever the `main` baseline CI is red

## Future Requirements

- **REL-02 / G-07-2**: Claude Code real-host invocation receipt promoting its support-matrix cells from UNVERIFIED
- Codex first-class native-verification driver (debug session `codex-native-verification-gap`)
- Widen `PathProof.inode` beyond a JS double for Windows file indexes above 2^53
- Publish the v0.1.0 release artifacts and documentation

## Out of Scope

| Feature | Reason |
|---------|--------|
| New harness capabilities or packs | This milestone restores a trustworthy baseline; feature work waits for green CI |
| Loosening the host-path immutability assertion without a root cause | The assertion encodes the Safety constraint; it may change only if the investigation proves the oracle wrong |
| Promoting any candidate component that fails its fixture | Supply-chain constraint: end users receive only the reviewed stable lock |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| CI-01 | Phase 10 | Complete |
| CI-02 | Phase 10 | Complete |
| CI-03 | Phase 10 | Complete |
| CI-04 | Phase 12 | Pending |
| LIFE-09 | Phase 11 | Pending |
| DEP-01 | Phase 13 | Pending |
| DEP-02 | Phase 13 | Pending |
| DEP-03 | Phase 12 | Pending |

**Coverage:**

- v0.1.1 requirements: 8 total
- Mapped to phases: 8
- Unmapped: 0

---
*Requirements defined: 2026-09-23*
*Last updated: 2026-09-23 after v0.1.1 roadmap creation (Phases 10-13)*
