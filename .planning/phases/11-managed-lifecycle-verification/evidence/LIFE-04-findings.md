# LIFE-04 Findings

Transcript: `evidence/life04-receipts.txt` (probe `probes/life04-receipts.mjs`, win32, packed CLI, ten sandboxes). It ends with `host-guard: unchanged (17 targets)`. Phase 6 suites: `evidence/suites-local.txt` (`suites.phase6 HOLDS`, 33/33) and CI run 35818198049 (`evidence/ci-35818198049-lifelines.txt`, `ci.ubuntu|macos|windows.phase6-titles HOLDS`).

## Contract

- [ ] **LIFE-04**: User can remove only receipted alpha-AOS-owned bytes or semantic entries that still match their recorded applied state, while drifted or user-modified resources cause a refusal

(verbatim, `.planning/milestones/v0.1.0-REQUIREMENTS.md:80`)

## Clauses

| # | Clause | Evidence | Oracle audit (D-04) | Result |
|---|--------|----------|---------------------|--------|
| 1 | only receipted alpha-AOS-owned bytes | `life04-receipts.txt` steps 2-11, one sandbox per harness with no alpha-AOS install and no journal (`<state>/journal is absent`): **`life04.no-receipt.<h>.skills VIOLATED`** for claude, codex, antigravity, pi and hermes (the three user-authored ECC-named `SKILL.md` files, sha `7a77278a2219`, are `-> absent`). `life04.no-receipt.<h>.planned OBSERVED` shows the preview already plans the removal of every user-authored name. Step 24: **`life04.project.non-receipted VIOLATED`** (`uninstall --project` removes a user note under `.alpha-aos/` when no pack receipt exists) | Phase 6 has no test that runs an uninstall against a state root without receipts. `target-level uninstall removes managed MCP servers while preserving user servers and credentials (LIFE-03, D-01)` (ubuntu job 107044319989, macos 107044319988, windows 107044319963; Phase 6 titles `HOLDS 33/33` in each) uses differently-named user servers, so it cannot see name collisions. `planUninstall` consults no journal, receipt or lock hash: it selects by the fixed lists `MANAGED_SERVERS` and `MANAGED_SKILLS` (src/core/uninstall.ts:225-226) | VIOLATED (LIFE-04/C1, LIFE-04/C4) |
| 2 | or semantic entries | Entry-level pruning is real: in step 20 the user server `p11-user-server` added outside the managed markers `survived`, and plan 11-04 shows user MCP entries kept on all five harnesses (`life03.target.<h>.user-mcp-kept HOLDS`). The receipt condition fails: **`life04.no-receipt.<h>.entries VIOLATED`** for all five harnesses (`user-authored entries with no receipt removed: context7, exa, firecrawl`), in JSON (claude, antigravity, pi), TOML (codex, unmarked tables) and YAML (hermes) | `semantic pruning fidelity across TOML, JSON, YAML, and Markdown (LIFE-04, D-03)` (suites-local.txt:45; ci lines 55, 99, 143) asserts that user keys survive and managed names go. It never asks whether the removed entry was receipted: its "managed" entries are identified by name only, exactly like the product | VIOLATED (LIFE-04/C1) |
| 3 | that still match their recorded applied state | Step 15: **`life04.modified.skill VIOLATED`** (the `deep-research/SKILL.md` that `ecc-skills sync` wrote and journaled, `life04.modified.skill-receipted OBSERVED ... journals recording ...: 1`, then edited by the user, is removed with exit 0). Step 17: **`life04.modified.mcp-entry VIOLATED`** (the managed `exa` entry with one argument changed inside intact markers is removed). Step 20: **`life04.preview-hash.enforced VIOLATED`** (apply proceeds although `config.toml` no longer matches the previewed `currentHash`). Step 17: **`life04.receipted.owned-skill-removed VIOLATED`** (the receipted owned skill whose bytes still match the journal's `afterHash` is never removed) | No Phase 6 test compares the bytes to be removed with any recorded applied state. The plan records `currentHash` (src/core/uninstall.ts:320), but `applyUninstall` recomputes the prune from the current content (src/core/uninstall.ts:486-512) and the CLI re-plans at apply time (src/cli.ts:1408) | VIOLATED (LIFE-04/C2, LIFE-04/C3, LIFE-04/C5) |
| 4 | drifted resources cause a refusal | Syntactic drift refuses: step 22, `life04.tamper.refuses HOLDS exit=2; stderr: "alpha-aos uninstall: Malformed or tampered alpha-AOS Codex MCP block in config.toml: missing closing marker '# alpha-aos:end mcp'"` and `life04.tamper.zero-bytes-changed HOLDS` (home and state fingerprints `78b88fdf9a99 -> 78b88fdf9a99`). Content drift between preview and apply does not: **`life04.preview-hash.enforced VIOLATED`** | `tampering and missing closing markers safely refuse with SemanticPruneDriftError (LIFE-04, D-03)` (suites-local.txt:46; ci lines 56, 100, 144) is a sound oracle for syntax only: it calls the pruners directly on a missing end marker, doubled Markdown markers and invalid YAML, and asserts the error class and message. It asserts no byte state; the probe adds the zero-bytes proof at CLI level. A well-formed but changed file is never exercised | PARTIAL coverage: syntactic tamper HOLDS; drift VIOLATED (LIFE-04/C3) |
| 5 | user-modified resources cause a refusal | **`life04.modified.skill VIOLATED`**, **`life04.modified.mcp-entry VIOLATED`**; both exit 0 and neither names the modification | No Phase 6 test edits a managed resource before an uninstall | VIOLATED (LIFE-04/C2) |
| 6 | journals kept, purge (the Phase 6 D-04 reading of LIFE-04) | `life03-uninstall.txt`: `life03.all.journals-kept HOLDS`, `life03.all.purge-removes-state HOLDS` | `full stack uninstall preserves historical transaction journals by default (LIFE-04, D-04)` (suites-local.txt:48; ci lines 58, 102, 146) and `purge flag completely removes state directory (LIFE-04, D-04)` (suites-local.txt:49) are sound for what they check. The first also asserts that `snapshots/` is deleted, which is recorded under Observations. Neither is a LIFE-04 text clause | Not a LIFE-04 clause (observation) |

## Core clause

The core promise is: only receipted alpha-AOS-owned bytes or semantic entries that still match their recorded applied state are removed. Neither half is implemented. Removal is selected by fixed names and paths, not by receipt (clauses 1 and 2), and nothing compares the bytes to be removed with a recorded applied state (clause 3). The refusal half holds only for syntactic tamper (clause 4). Result: VIOLATED.

## Provisional verdict

GAP (D-02): the core promise is not met. Uninstall removes same-named user-authored MCP entries and skills on all five harnesses with no receipt, removes a journaled skill and a managed MCP entry after the user edited them, ignores the previewed hash, and does not remove the receipted owned skill that still matches its journal. Only the syntactic-tamper refusal holds, with zero changed bytes.

## Host safety (D-13)

Phase 10 classified the Windows `~/.alpha-aos` change in CI run 35762417138 as `classification: test-isolation leak` (`.planning/debug/ci02-windows-alpha-aos-host-leak.md`). A different test file running concurrently wrote the real host state root; the released lifecycle alone left no `.alpha-aos` in its scratch home. The fix was in test code only: commits `8f17c7e` (`fix(10-03): redirect mcp-proxy test state root out of the host home`) and `7a3ee28` (`fix(10-03): journal gate receipts into test-owned state roots`), pinned by the Phase 10 regression tests `pinned upstream startups keep their npx cache under the test-owned state root, never the host state root`, `writeGateReceipt writes an atomic receipt that readGateReceiptStrict validates (D-06, SAFE-03)` and `Execution of gate check passes when engine succeeds, creating receipt and unblocking lifecycle (GATE-02, GATE-03)`, which passed on all three legs of run 35818198049. That record names no product requirement violation, and this verdict names none for it either.

The fresh product judgment is the host guard around this probe: `life04-receipts.txt` ends with `host-guard: unchanged (17 targets)`. The probe ran eleven uninstall applies (five no-receipt target uninstalls, three codex target uninstalls after user edits, the refused tamper, and one `uninstall --project`), and none changed the real state root or any of the 16 managed harness paths.

## Gap candidates

### LIFE-04/C1

- clause: only receipted alpha-AOS-owned bytes or semantic entries
- missing: `uninstall --target <h>` removes MCP entries named `context7`, `exa` or `firecrawl` and skill files named `unified-memory`, `documentation-lookup` or `deep-research` whether or not alpha-AOS wrote them. In a state root with no journal and no alpha-AOS install, it removes user-authored entries and skills on every harness. For codex, the user-authored tables carry no alpha-AOS marker and are still stripped (`stripManagedToml` removes unmarked tables by id, src/core/mcp.ts:296-314).
- close condition: uninstall removes an entry or file only when a journal or receipt records alpha-AOS as its writer. Reproducing `life04.no-receipt.<h>.entries` and `life04.no-receipt.<h>.skills` as HOLDS for all five harnesses closes it.
- reproduction: `npm run build && node .planning/phases/11-managed-lifecycle-verification/evidence/probes/life04-receipts.mjs`; transcript `evidence/life04-receipts.txt`, steps 2-11 (`no-receipt <h>: uninstall --target <h> --json (preview)` and `... --yes --apply --json`):
  - `CHECK life04.no-receipt.claude.planned OBSERVED with no journal and no alpha-AOS install, the preview plans 4 removal(s): prune ~\.claude.json removing [context7, exa, firecrawl]; remove ~\.claude\skills\unified-memory\SKILL.md; remove ~\.claude\skills\documentation-lookup\SKILL.md; remove ~\.claude\skills\deep-research\SKILL.md`
  - `CHECK life04.no-receipt.claude.entries VIOLATED exit=0; user-authored entries with no receipt removed: context7, exa, firecrawl; changed: none; config file sha 7bd24084c8ef -> ca3d163bab05`
  - `CHECK life04.no-receipt.codex.entries VIOLATED exit=0; user-authored entries with no receipt removed: context7, exa, firecrawl; changed: none; config file sha c341ebc08086 -> absent`
  - `CHECK life04.no-receipt.antigravity.entries VIOLATED ...`, `CHECK life04.no-receipt.pi.entries VIOLATED ...`, `CHECK life04.no-receipt.hermes.entries VIOLATED exit=0; user-authored entries with no receipt removed: context7, exa, firecrawl; changed: none; config file sha 0e63302eacab -> ca3d163bab05`
  - `CHECK life04.no-receipt.codex.skills VIOLATED user-authored skills with no receipt removed or changed: <sandbox-2>\home\.agents\skills\unified-memory\SKILL.md 7a77278a2219 -> absent; ...` (same form for claude, antigravity, pi, hermes)
- research lead: P1 (reproduced here through the packed CLI for all five harnesses).

### LIFE-04/C2

- clause: user-modified resources cause a refusal; that still match their recorded applied state
- missing: a managed resource the user edited after alpha-AOS wrote it is removed without a refusal. An ECC skill that `ecc-skills sync` wrote and journaled, then edited by the user, is deleted. A managed `exa` entry with one argument changed inside intact alpha-AOS markers is deleted with the rest of the block.
- close condition: uninstall compares each file or entry it would remove with the journal's recorded `afterHash` (or entry value) and refuses, with zero changed bytes and a message naming the modified resource, when they differ. Reproducing `life04.modified.skill` and `life04.modified.mcp-entry` as HOLDS closes it.
- reproduction: same command; `evidence/life04-receipts.txt` steps 13-15 (P2) and 16-17:
  - `CHECK life04.modified.skill-receipted OBSERVED ecc-skills sync exit=0; operationId null (the seeded skills already match the lock, so nothing was written); journals recording <sandbox-6>\home\.agents\skills\deep-research\SKILL.md: 0; after removing the seeded files a second sync exit=0; operationId set; journals recording <sandbox-6>\home\.agents\skills\deep-research\SKILL.md: 1`
  - `CHECK life04.modified.skill VIOLATED exit=0; the user-edited (journaled) deep-research SKILL.md is removed; no refusal names the user modification`
  - `CHECK life04.modified.mcp-entry VIOLATED exit=0; the user-modified exa entry (argument changed to p11-user-arg) is removed; sandbox bytes changed; no refusal names the modification`
- research lead: P2 (reproduced here, with the skill journaled by alpha-AOS first).

### LIFE-04/C3

- clause: drifted resources cause a refusal; that still match their recorded applied state
- missing: the uninstall preview records `currentHash` for every file it will prune, but the apply never compares it. The CLI plans again at apply time and removes whatever the new plan selects. A file changed between the reviewed preview and the apply is pruned without a refusal.
- close condition: the apply refuses, with zero changed bytes, when any file's hash differs from the reviewed preview (for example by taking the preview's plan digest, as `project approve --plan-digest` does). Reproducing `life04.preview-hash.enforced` as HOLDS closes it.
- reproduction: same command; `evidence/life04-receipts.txt` steps 19-20:
  - `note: p4: added the user server p11-user-server to <sandbox-8>\home\.codex\config.toml outside the managed markers after the preview; planned currentHash a1b22227482b, pre-apply hash f627a6fcebb2` (per-run hashes, recorded as a note)
  - `CHECK life04.preview-hash.enforced VIOLATED exit=0; apply proceeded although config.toml no longer matched the previewed currentHash (planned differs from the pre-apply hash; prefixes in the note above); p11-user-server survived; managed entries left: none`
- research lead: P4 (reproduced here through the packed CLI). The user server itself survived, so the drift did not cost the user data in this case. The clause fails because the apply did not refuse.

### LIFE-04/C4

- clause: only receipted alpha-AOS-owned bytes (project scope)
- missing: `uninstall --project <p>` deletes every file under `<p>/.alpha-aos/` (src/core/uninstall.ts:385-404) with no receipt check. A user-authored note in a project where no pack was ever materialized is removed.
- close condition: `uninstall --project` removes only receipted pack targets whose bytes still match their receipts, and leaves or names every other file. Reproducing `life04.project.non-receipted` as HOLDS closes it.
- reproduction: same command; `evidence/life04-receipts.txt` steps 23-24 (`project: uninstall --project <project> --json (preview)`, `... --yes --apply --json`): `CHECK life04.project.non-receipted VIOLATED ...` (quoted in full in the transcript).
- adjacency: LIFE-03/C3 (`evidence/LIFE-03-findings.md`) records the same `uninstall --project` defect against LIFE-03's "without removing unrelated user resources" with a packed pack fixture (`life03.project.user-file-kept VIOLATED`, `life03.project.manifest-kept VIOLATED`). This is the LIFE-04 side: the files are not receipted. The two are kept separate and cross-referenced; plan 11-07 assigns one gap id per failed clause.

### LIFE-04/C5

- clause: user can remove receipted alpha-AOS-owned bytes that still match their recorded applied state
- missing: the owned skill `alpha-aos-control/SKILL.md` that `install --apply` writes and journals is never removed by `uninstall --target codex`, though its bytes still match the journal's recorded `afterHash`. The uninstall planner does not know the owned skills (src/core/uninstall.ts:345 names a claude-only `gsd-code-review` instead).
- close condition: every file an alpha-AOS journal records as created, whose bytes still match that journal's `afterHash`, is removed by the matching uninstall scope. Reproducing `life04.receipted.owned-skill-removed` as HOLDS closes it.
- reproduction: same command; `evidence/life04-receipts.txt` step 17: `CHECK life04.receipted.owned-skill-removed VIOLATED after uninstall --target codex the owned skill <sandbox-7>\home\.agents\skills\alpha-aos-control\SKILL.md is still present; journaled by ...` (quoted in full in the transcript).
- adjacency: LIFE-03/C1 records the same leftover against LIFE-03's "uninstall one target" and "uninstall the full managed stack" on all five harnesses. This is the LIFE-04 side: receipted, still-matching bytes are not removable. Kept separate and cross-referenced.

## Leads (not reproduced)

- Pi `prunePiConfig` deletes the `settings` keys `hostConfigDiscovery`, `directTools`, `toolPrefix`, `notifyOnStartupConnect` and `outputGuard` whatever their value (src/core/uninstall.ts:169-181). A user-set value for one of them would be removed without a receipt. The user-authored Pi fixture here carries only `mcpServers`, so this was not exercised (also listed in LIFE-03-findings.md).
- `pruneClaudeSettings` deletes `skillOverrides` for the three ECC skill names whatever their value (src/core/uninstall.ts:99-119). Not exercised.

## Observations

- `uninstall --all` without `--purge` deletes `<state>/snapshots` (src/core/uninstall.ts:566-568), and the Phase 6 test `full stack uninstall preserves historical transaction journals by default` asserts that deletion. The preserved journals then refer to snapshots that no longer exist, so they are an audit record rather than a rollback path. LIFE-04 does not ask for rollback after uninstall, so this is not a clause failure.
- Each pruned or removed file is its own transaction (one journal per file). That is why the P2 uninstall journals the removal of the user-edited skill; the removal is recorded, but it is not refused.
- The preview JSON prints home paths through the redaction seam as `~\...` (for example `~\.codex\config.toml`). The probe matches planned entries by their home-relative suffix for that reason.
- Every no-receipt target uninstall reduced the user-authored JSON and YAML configs to an empty document (`-> ca3d163bab05`) and deleted the codex `config.toml` outright (`-> absent`), because nothing but the colliding names was in them.
