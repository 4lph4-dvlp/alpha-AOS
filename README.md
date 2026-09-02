# alpha-AOS

Declarative, cross-platform installer and updater for a small, consistent AI-agent workflow stack.

alpha-AOS configures the supported harnesses already present on a machine: Claude Code, Codex, Antigravity, Pi Agent, and Hermes Agent. It uses GSD as the workflow/state spine, installs exactly three selected ECC skills, and registers Context7, Exa, and a four-tool Firecrawl surface. It does not install the harness applications themselves and does not install an ECC profile.

The installer is deterministic and dry-run first. It detects installed harnesses, compares them with the stable lock, runs isolated package fixtures only when a change is needed, applies targets sequentially, verifies the result, and journals alpha-AOS-owned file writes. It never applies `candidate.lock.json` on an end-user machine.

## Requirements

- Windows 11, current macOS, or a current Linux distribution
- Git
- Node.js 24 or newer
- npm 10 or newer
- One or more supported agent harnesses already installed and signed in

Optional MCP credentials are read from user environment variables. Exa needs `EXA_API_KEY` for normal calls. Context7 and Firecrawl may provide limited keyless use; set `CONTEXT7_API_KEY` and `FIRECRAWL_API_KEY` when your account or workload requires them. alpha-AOS stores only these variable names, never their values.

## Quick start

Clone the repository, then run the platform bootstrap from the repository root. The first command only builds the CLI and prints the detected-harness plan:

```sh
git clone https://github.com/4lph4-dvlp/alpha-AOS.git
cd alpha-AOS
```

```powershell
# Windows PowerShell
.\scripts\install.ps1

# Apply to every detected supported harness
.\scripts\install.ps1 -Apply

# Or restrict the run
.\scripts\install.ps1 -Apply -Target "claude,codex"
```

```sh
# macOS or Linux
sh ./scripts/install.sh

# Apply to every detected supported harness
sh ./scripts/install.sh --apply

# Or restrict the run
sh ./scripts/install.sh --apply --target claude,codex
```

After an apply, restart the affected harnesses and run:

```sh
alpha-aos doctor
alpha-aos install
```

The second command should report the selected components as `CURRENT`.

## What is installed

| Layer | Owner | Targets |
|---|---|---|
| Workflow and file-based project state | GSD Core `standard` | Claude, Codex, Antigravity, Pi |
| Cross-harness memory | ECC `unified-memory` | all five harnesses |
| Current library documentation | ECC `documentation-lookup` + Context7 | all five harnesses |
| Bounded multi-source research | ECC `deep-research` + Exa/Firecrawl | all five harnesses |
| Small-task review and simplification | each harness's native features | no duplicate global skill |
| Project-only isolation | alpha-AOS launch adapters | all five, with reported limitations |

Hermes is intentionally a worker and does not write GSD planning state. Claude keeps the three ECC skills `user-invocable-only` via native `skillOverrides`, without editing the hash-locked skill files.

## Updating

The updater refuses to pull over a dirty source checkout, uses `git pull --ff-only`, rebuilds the CLI, and reconciles only the release's verified stable lock.

```powershell
.\scripts\update.ps1          # download/build and show plan
.\scripts\update.ps1 -Apply   # download/build and reconcile
```

```sh
sh ./scripts/update.sh
sh ./scripts/update.sh --apply
```

Upstream GSD, ECC, and MCP releases first become an unverified candidate for maintainers. They require package-integrity checks and the Windows/macOS/Linux fixture matrix before a reviewed stable-lock promotion. Running `alpha-aos update --apply` reconciles the stable lock only.

## Rollback

List managed file transactions, preview one, then apply the rollback:

```sh
alpha-aos rollback
alpha-aos rollback <operation-id>
alpha-aos rollback <operation-id> --apply
```

Rollback is deliberately conservative. It proceeds only when every target still has the exact post-transaction hash. If you or another tool changed a file afterward, alpha-AOS stops instead of overwriting the newer edit. GSD/npm/Pi package-manager changes are reported separately and are not automatically reversed.

## Development and current validation

```powershell
npm ci
npm run build
npm test
node dist/src/cli.js inventory
node dist/src/cli.js plan
node dist/src/cli.js doctor
```

All mutation commands are dry-run by default. User-wide `install --apply` and stable `update --apply` now use the same reconcile engine. The engine rolls back its journaled file changes on failure and reports any verified external package-manager changes that remain.

Current rollout status: GSD Core `1.12.0` `standard` is installed and manifest-verified on Claude Code, Codex, Antigravity, and Pi; Hermes remains worker-only by policy. User-scope Context7, Exa, and the four-tool filtered Firecrawl proxy are synchronized to all five logical harness targets. Context7 passed real calls on Claude, Codex, Pi, and Antigravity GUI/CLI/IDE; Hermes discovers both Context7 tools but its model provider is quota-blocked. Exa passed authenticated searches on all five targets. Firecrawl passed keyless scrapes on Claude, Codex, Pi, and Antigravity GUI/CLI/IDE and native four-tool discovery on Hermes; only Hermes end-to-end execution remains blocked by Gemini free-tier quota. The Codex GSD `1.12.0` hook dependency omission is completed transactionally from the same integrity-verified tarball and its Stop hook smoke test passes. ECC `2.2.0` runtime is installed and Memory Vault doctor passes. Exactly three hash-locked skills are deployed to Claude, the generic `~/.agents/skills` root shared by Codex, Pi, and Antigravity CLI, Antigravity GUI/IDE's `~/.gemini/config/skills` root, and Hermes' native skill root. Claude's documentation and bounded deep-research traces passed, the Claude-to-Codex-to-Claude user-scope memory round trip succeeded, and Pi loaded the shared documentation skill and called Context7 successfully. Antigravity GUI, CLI, and IDE documentation lookup passed; the IDE target rendering uses its native `call_mcp_tool` gateway and does not fall back to web search. Hermes discovers all three ECC skills as local and enabled; its final live canary remains blocked by Gemini 429.

The standard surface intentionally omits GSD's broad utility cluster. The repository-owned `/alpha-aos-ship` skill exposes only the installed upstream ship workflow. Preview or synchronize it with:

```powershell
alpha-aos owned-skills sync alpha-aos-ship --target claude
alpha-aos owned-skills sync alpha-aos-ship --target claude --apply
```

The transaction layer snapshots existing bytes outside the repository, writes atomically, journals only paths and hashes, restricts writes to adapter-owned roots, and verifies byte-level restoration during rollback.

## Project isolation

Projects that must not inherit the user-wide alpha-AOS setup use the existing `.alpha-aos/stack.yaml` manifest and an external generated runtime. `project-only` isolates harness configuration and skills for normal accidental-leak prevention. `sealed` is reserved for an OS/container boundary and currently fails closed until such an adapter is available; it never silently falls back to process isolation.

```powershell
# Preview, then explicitly trust and write the project policy.
alpha-aos project isolate init D:\work\private-project --mode project-only --harness claude --trust
alpha-aos project isolate init D:\work\private-project --mode project-only --harness claude --trust --apply

# Preview and create the external runtime, verify it, then launch through it.
alpha-aos project isolate sync D:\work\private-project
alpha-aos project isolate sync D:\work\private-project --apply
alpha-aos project isolate doctor D:\work\private-project
alpha-aos project run claude D:\work\private-project
alpha-aos project run claude D:\work\private-project --apply
```

Generated state lives under `~/.alpha-aos/isolated/<project-id>/`, not in the repository. Authentication is never copied automatically. The same launcher contract exists for Claude Code, Codex, Antigravity CLI, Pi, and Hermes, with harness-specific fail-closed limitations reported by `doctor`.

## Safe GSD deployment fixtures

GSD runtimes can write shared `~/.agents/skills` and `~/.gsd` paths in addition to a runtime config root. Never test multiple runtime installers in parallel. The fixture command injects a synthetic HOME plus every known runtime config-root variable, checks the real shared roots before and after, and removes the temporary tree on success.

```powershell
alpha-aos fixture gsd codex
alpha-aos fixture gsd codex --apply
alpha-aos fixture gsd antigravity --apply
alpha-aos fixture gsd pi --apply
```

Live user-wide installation remains a separate, explicitly approved operation and must snapshot shared roots first.
Every generated live GSD command includes `--no-legacy-cleanup`; legacy artifact removal is a separate inventoried operation, never an installer side effect.

GSD `1.12.0` installs `gsd-context-monitor.js` for Codex without the helper closure it now requires. alpha-AOS detects that exact condition, fills only the missing byte-identical files from the locked tarball, and verifies that a synthetic `Stop` event exits silently:

```powershell
alpha-aos gsd compat codex
alpha-aos gsd compat codex --apply
```

ECC `--skills unified-memory,documentation-lookup,deep-research` is intentionally blocked: in `2.2.0` it expands `platform-configs` and the multi-skill `research-apis` module, and Hermes silently skips the latter. alpha-AOS will install the CLI runtime separately and distribute only hash-pinned skill sources through its own exact-file adapter.

```powershell
alpha-aos fixture ecc claude
alpha-aos fixture ecc claude --apply
alpha-aos fixture ecc codex --apply
```

Claude keeps the three third-party ECC skills explicit-only without editing their hash-locked files. Preview and transactionally merge the native `skillOverrides` policy with:

```powershell
alpha-aos skill-policy sync --target claude
alpha-aos skill-policy sync --target claude --apply
```

The fixture verifies npm tarball integrity, extracts with lifecycle scripts disabled, renders exactly three files, checks source and target hashes, and removes its temporary directory.

## MCP deployment

Context7, Exa, and Firecrawl are rendered into each harness's native user configuration from exact versions in `catalog/stack.lock.json`. A plan never prints the merged config document or a credential value. The configurations refer only to `CONTEXT7_API_KEY`, `EXA_API_KEY`, and `FIRECRAWL_API_KEY`; Exa needs its key for real local-stdio searches, while Context7 and Firecrawl have limited keyless behavior.

```powershell
# Protocol and package-integrity fixtures; these do not touch user config.
alpha-aos fixture mcp context7 claude --apply
alpha-aos fixture mcp exa claude --apply
alpha-aos fixture mcp firecrawl claude --apply
alpha-aos fixture mcp context7 pi --apply

# Native config merge preview. Actual apply remains a separate approval.
alpha-aos mcp sync --target claude
alpha-aos mcp sync --target codex --server context7
```

Pi has no native MCP core, so the stack locks `pi-mcp-adapter@2.31.0` as a separate bridge and fails closed if the bridge is absent. Antigravity GUI, IDE, and CLI share `~/.gemini/config/mcp_config.json` according to the installed Antigravity customization contract, but each surface still needs a native smoke test after deployment.

Firecrawl `3.24.0` exposes 25 tools upstream. alpha-AOS starts it behind a local SDK proxy that exposes only `firecrawl_scrape`, `firecrawl_map`, `firecrawl_crawl`, and `firecrawl_check_crawl_status`. Search, autonomous agent, monitoring, scientific research, and developer-search surfaces stay with Exa, governed research sources, or explicit future packs.

The proxy resolves its catalog from the installed module path before consulting the current working directory. It therefore starts from a home directory or an unrelated project as well as from this repository; a compiled-depth regression test protects this contract.

## Planning history

The original planning and cross-verification records are retained unchanged under [`docs/`](./docs/).

## License

Licensed under the [Apache License 2.0](./LICENSE).
