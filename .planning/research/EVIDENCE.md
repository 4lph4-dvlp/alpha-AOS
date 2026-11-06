# v0.8.0 Evidence Inventory

Recorded 2026-11-06. Research only: no managed installation, deployment, global config, dependency manifest or external contract was changed. Outgoing research is preserved unchanged in [v0.7.0-research](../milestones/v0.7.0-research/).

## Method

Investigated release discovery/ownership, expected user behavior, integration architecture and failure/recovery risks inline. Used nine Exa discovery queries covering Cua, GSD, npm, MCP, ECC, Context7, Exa, Firecrawl and Pi adapter. Context7 /npm/cli supplied tag/metadata documentation. Bounded code reads and direct public metadata requests cross-checked current behavior.

Firecrawl successfully read Cua 0.38.0 release and MCP 2026-07-28 changelog. Other reads returned Not connected or Connection closed; no credential/quota/root cause was established. Official browser reads, Exa fetch and direct metadata supplemented these sources. Exa fetch initially rejected url; the reported required urls array succeeded on correction. Partial extraction is not a full-file audit.

## Local Findings

| Finding | Evidence | Confidence |
|---|---|---|
| Check/stage resolves npm latest; apply reconciles shipped stable lock | [CLI](../../src/cli.ts), update branch around 1562; [resolver](../../src/core/update.ts) | High |
| Cua excluded from npm resolution; changed ECC clears source/target hashes | resolveCandidate in [update.ts](../../src/core/update.ts) | High |
| Cua separately pins version/assets/files/vendored installer | [manifest](../../catalog/computer-use-runtime.json), [install](../../src/core/computer-use-install.ts) | High |
| Cua native verification and status reread bundled pin | [native](../../src/core/computer-use-native.ts), [command](../../src/core/computer-use-command.ts) | High |
| ECC rewrites exact headings/sections for deep research and Antigravity docs | renderEccSkill in [ecc-fixture.ts](../../src/core/ecc-fixture.ts) | High |
| GSD compatibility uses exact require text and helper paths | [gsd-compat.ts](../../src/core/gsd-compat.ts) | High |
| Owned skills/config rendering are separate policy mechanisms | [owned-skills](../../src/core/owned-skills.ts), [MCP](../../src/core/mcp.ts), [skill policy](../../src/core/skill-policy.ts) | High |
| External installer effects are not automatically rolled back | applyManagedInstall in [install.ts](../../src/core/install.ts), comments around 845-851 and result around 967 | High |
| Installed SDK lists protocols through 2025-11-25 | node_modules/@modelcontextprotocol/sdk/dist/esm/types.js, first four lines | High for checkout only |
| Alpha-AOS self-update handles checkout/build/package lock separately | [bootstrap.ts](../../src/core/bootstrap.ts) | High |
| CLI-Hub is a pinned prerequisite mentioned in a skill, not a current update resolver entry | [CLI-Anything skill](../../skills/cli-anything/SKILL.md), [catalog](../../catalog/stack.yaml) | High; inventory boundary, not provisioning authorization |

## Official Source Register

1. [npm distribution tags](https://docs.npmjs.com/cli/v11/commands/npm-dist-tag/) — publisher-selected aliases, not universal stability proof.
2. [npm cache](https://docs.npmjs.com/cli/v11/commands/npm-cache/) — cache integrity, not permanent recovery storage.
3. [npm signatures](https://docs.npmjs.com/about-registry-signatures/) — package/version/integrity binding, separate from compatibility.
4. [GitHub releases API](https://docs.github.com/en/rest/releases/releases) — public metadata and pagination.
5. [Cua 0.38.0 release](https://github.com/trycua/cua/releases/tag/cua-driver-rs-v0.38.0) — stable-tag convention and Linux preview distinction.
6. [Cua install.sh](https://raw.githubusercontent.com/trycua/cua/main/libs/cua-driver/scripts/install.sh) — official entrypoint and flags; mutable branch evidence.
7. [Cua Unix helper](https://raw.githubusercontent.com/trycua/cua/main/libs/cua-driver/scripts/_install-rust.sh) — versioned installs, artifact checks and platform differences.
8. [Cua Windows installer](https://raw.githubusercontent.com/trycua/cua/main/libs/cua-driver/scripts/install.ps1) — exact release, junction layout and native effects.
9. [GSD update documentation](https://github.com/open-gsd/gsd-core/blob/next/docs/how-to/update-gsd.md) — backup/restart and differing runtime recovery; next branch is not proof for npm release.
10. [ECC repository](https://github.com/affaan-m/ECC) — install scopes and duplicate-install cautions.
11. [Context7 repository](https://github.com/upstash/context7) — local/hosted MCP and CLI choices.
12. [Exa repository](https://github.com/exa-labs/exa-mcp-server) — local package source/hosted choices.
13. [Firecrawl repository](https://github.com/firecrawl/firecrawl-mcp-server) — npm server and tool/transport scope.
14. [Pi adapter](https://github.com/nicobailon/pi-mcp-adapter) — 7.x behavior and built-in MCP relationship; recheck exact artifact before changes.
15. [MCP 2025-11-25 lifecycle](https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle) — handshake-era negotiation.
16. [MCP 2026-07-28 changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog) — newer discovery model, not proof all observed servers require it.

Six registry metadata URLs and observed versions are in [STACK.md](STACK.md). At 00:57 UTC a bounded first page of 100 [Cua releases](https://api.github.com/repos/trycua/cua/releases?per_page=100) included eight plain stable driver tags through 0.38.0, all GitHub-prerelease-labelled. This confirms the documented convention within that page, not exhaustive latest selection.

## Evidence Limits

Registry integrity presence is not downloaded-artifact verification. No package tarballs/native binaries were installed or executed to prove new-version compatibility. Mutable docs can differ from selected releases. No real-host Cua permissions, native rollback, cross-platform matrix or full suite was run. Research does not complete v0.7.0 acceptance.
