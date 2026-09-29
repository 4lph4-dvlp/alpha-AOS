# LIFE-08 Findings

Transcripts (written by probes under `evidence/probes/`, each ending with `host-guard: unchanged (17 targets)`):

- `evidence/life08-preview.txt` (`probes/life08-preview.mjs`). RESULT holds=7 violated=2 not-observed=0 observed=4. The probe covers two scenarios:
  - Scenario A: a packed sandbox holding an applied codex install.
  - Scenario B: a fixture checkout inside the same sandbox. A bare mirror of this repository serves as `origin`, and a clone of the mirror serves as the user's checkout. The checkout runs `npm ci` and its own `npm run build`, so `node scripts/build-artifact.mjs check` passes (`CHECK life08.preview.checkout-artifact HOLDS`).
- `evidence/life08-apply.txt` (`probes/life08-apply.mjs`). RESULT holds=6 violated=0 not-observed=0 observed=0.

Fingerprints record path, kind, size and sha256 for every entry, or size only for files over 1 MiB. The fingerprinted roots are:

- Scenario A: `<sandbox>/home` (harness configuration), `<sandbox>/state` (managed state) and `<sandbox>/prefix` (installed package and global bin links).
- Scenario B: the same three roots plus `<sandbox>/checkout`, the whole tree including `.git`, `node_modules` and `dist` (checkout, package set and build artifact).

Only three directories are excluded: `<sandbox>/npm-cache` and `<sandbox>/npm-logs` (npm writes debug logs and cache entries on every invocation) and `<sandbox>/temp` (fixture scratch). The transcript states each exclusion in a note line. The real repository is read once, as the source of the bare mirror. Every update surface runs with `cwd` `<sandbox>` or `<sandbox>\checkout` (the `note: cwd for the next step:` lines), and `git ls-remote` resolves against the sandbox mirror. The checkout runner refuses any `--apply` or `-Apply` argument.

## Contract

**LIFE-08**: User can run update preview with no checkout, package, global-link, configuration, or managed-state mutation, and update apply reconciles only a reviewed stable-lock promotion

(`.planning/milestones/v0.1.0-REQUIREMENTS.md:84`)

## Clauses

| # | Clause | Evidence | Oracle audit (D-04) | Result |
|---|--------|----------|---------------------|--------|
| 1 | no checkout mutation | `<sandbox>/checkout` (work tree, `.git`, `node_modules`, `dist`) is fingerprinted across every scenario B surface: `life08.preview.bootstrap-update.no-mutation HOLDS`, `life08.preview.bootstrap-update-human.no-mutation HOLDS`, `life08.preview.update-sh.no-mutation HOLDS`. For update.ps1, `life08.preview.update-ps1.drift-scope OBSERVED ... checkout, state and prefix drift: none`. The preview planned `git-merge-ff-only (checkout)` against a resolved target (`life08.preview.bootstrap-update.plan OBSERVED ... checkout target equals HEAD`), so the preview reached the checkout inspection (`git rev-parse`, `git status`, `git ls-remote`, `git cat-file`, `git merge-base`) and not an early refusal | This is a byte fingerprint of the whole checkout including `.git`. It replaces the Phase 6 `update.test.ts` preflight test, which asserts plan fields only. A setup `git status` settles the index stat cache before the baseline (note line), so a later index refresh would still show as drift | HOLDS |
| 2 | no package mutation | Scenario A: `life08.preview.update-default.no-mutation`, `life08.preview.update-check.no-mutation` and `life08.preview.update-stage.no-mutation`, all HOLDS on `<sandbox>/prefix`, which holds the installed package (the place `update --stage --apply` would write `catalog/candidate.lock.json`). Scenario B: the checkout's `node_modules` and `dist` are inside the checkout fingerprint (clause 1 checks) | Fingerprint, not journal count. `update --stage` without `--apply` fetched a candidate (`life08.preview.update-check.result OBSERVED`), so the no-write result reflects a real candidate and not an empty one | HOLDS |
| 3 | no global-link mutation | `<sandbox>/prefix` is the npm global prefix (`npm_config_prefix`) and holds the `alpha-aos` bin shims. It is unchanged across all three scenario A surfaces (clause 2 checks) and all four scenario B surfaces (`life08.preview.bootstrap-update.no-mutation`, `bootstrap-update-human`, `update-sh` HOLDS; `update-ps1.drift-scope` prefix drift none). The preview planned `npm-link (link)` without running it (`life08.preview.bootstrap-update.plan`) | The planned link step would target this prefix. The fingerprint shows it was not run | HOLDS |
| 4 | no configuration mutation | `<sandbox>/home` holds every harness configuration root (CODEX_HOME, CLAUDE_CONFIG_DIR, ANTIGRAVITY_CONFIG_DIR, PI_CODING_AGENT_DIR, HERMES_HOME). It is unchanged across `update`, `update --check`, `update --stage`, `bootstrap update` (JSON and human) and `update.sh` (the HOLDS checks above). **`life08.preview.update-ps1.no-mutation VIOLATED`**: `<sandbox>\home` gained `AppData/Local/Microsoft/PowerShell/StartupProfileData-NonInteractive` (and in one run `ModuleAnalysisCache-*`). `life08.preview.update-ps1.drift-scope OBSERVED ... every one under <sandbox>/home/AppData/Local/Microsoft/PowerShell: yes`. Control: `life08.preview.update-ps1.pwsh-control OBSERVED ... pwsh with the update.ps1 cmdlets and no alpha-AOS code added files: AppData/Local/Microsoft/PowerShell/StartupProfileData-NonInteractive`. `life08.preview.update-ps1-rerun.no-mutation VIOLATED ... every drifted entry under <sandbox>/home/AppData/Local/Microsoft/PowerShell: yes` | The strict byte oracle stays VIOLATED as recorded, and no root was excluded after the fact. The drift is the PowerShell engine's own startup and module-analysis cache under `LOCALAPPDATA`. A pwsh process running only the cmdlets update.ps1 uses writes the same file without any alpha-AOS code, and pwsh rewrites it on every start (the re-run shows `changed`). It is not harness, alpha-AOS or project configuration: no configuration root, checkout, prefix or state entry drifted | HOLDS for alpha-AOS and harness configuration; the strict update.ps1 byte check is VIOLATED by PowerShell engine cache writes only (see Observations, not a gap candidate) |
| 5 | no managed-state mutation | `<sandbox>/state` (journals, snapshots, writer lock) is unchanged across all seven surfaces: the scenario A checks, the scenario B checks, and `update-ps1.drift-scope` state drift none | The Phase 6 test compares `listManagedTransactions` counts. This is a byte fingerprint of the whole state root | HOLDS |
| 6 | update apply reconciles only a reviewed stable-lock promotion | `evidence/life08-apply.txt`, with an unreviewed `catalog/candidate.lock.json` (stable copy, `channel: candidate`, ECC `9.9.9`) written into the sandbox installed package before the baseline: `life08.apply.candidate-ignored HOLDS exit=0; applied=0; operationIds=0; current=6 of 6; "9.9.9" does not appear in stdout or stderr`, `life08.apply.no-new-journal HOLDS`, `life08.apply.byte-identical HOLDS` (the candidate file is part of the fingerprint), `life08.apply.message HOLDS`. Stable reconcile: after deleting the managed `<sandbox>/home/.codex/AGENTS.md`, `life08.apply.reconciles-stable HOLDS exit=0; applied=policy:codex-execution; operationIds=1; restored AGENTS.md sha256 equals the recorded one`, then `life08.apply.reconcile-idempotent HOLDS`. Supporting reading only: `src/cli.ts:1012-1026` (`update --apply` calls `applyManagedInstall` with the packaged `lock`), `src/core/catalog.ts:163-184` (`loadLockStrict` reads `stack.lock.json` for the stable channel, with `lockInvariants(channel)` taking authority from the caller, not from the file) | The probe drives the packed CLI with a real candidate file present. A candidate that were read would have planned ECC 9.9.9, which does not exist, so it would have failed or printed `9.9.9`. The printed message is static text (`src/cli.ts:1024`), so it is not detection evidence on its own. The detection evidence is the candidate-ignored and byte-identical checks. The CI packed lifecycle test now guards the candidate-ignored property (D-12) | HOLDS for codex; see LIFE-01/C1 for combined codex+pi targets |

### Per-surface matrix (preview)

| Surface | Checkout | Package | Global link | Configuration | Managed state | Check |
|---|---|---|---|---|---|---|
| `update` (defaults to `--check`) | n/a (packed) | HOLDS | HOLDS | HOLDS | HOLDS | `life08.preview.update-default.no-mutation` |
| `update --check --json` | n/a (packed) | HOLDS | HOLDS | HOLDS | HOLDS | `life08.preview.update-check.no-mutation` |
| `update --stage` (no `--apply`) | n/a (packed) | HOLDS | HOLDS | HOLDS | HOLDS | `life08.preview.update-stage.no-mutation` |
| `bootstrap update --json` | HOLDS | HOLDS | HOLDS | HOLDS | HOLDS | `life08.preview.bootstrap-update.no-mutation` |
| `bootstrap update` | HOLDS | HOLDS | HOLDS | HOLDS | HOLDS | `life08.preview.bootstrap-update-human.no-mutation` |
| `sh scripts/update.sh` | HOLDS | HOLDS | HOLDS | HOLDS | HOLDS | `life08.preview.update-sh.no-mutation` |
| `pwsh -File scripts/update.ps1` | HOLDS | HOLDS | HOLDS | HOLDS (pwsh engine cache drift only) | HOLDS | `life08.preview.update-ps1.no-mutation` VIOLATED, `update-ps1.drift-scope` |

### Oracle audit of the Phase 6 LIFE-08 tests (D-04)

- `pure read-only update preview performs zero filesystem writes or package mutations (LIFE-08, D-16)` (`test/lifecycle.test.ts:272-292`). It calls `planCandidateStage` in-process, not the `update` CLI, and compares `listManagedTransactions` counts before and after. It proves that no journal was added. It does not prove zero filesystem writes, and it checks no package, checkout, link or configuration bytes. It passes locally (`evidence/suites-local.txt:21`) and in CI (`ci-35818198049-lifelines.txt:30,74,118`). The `life08.preview.*.no-mutation` fingerprint checks supply the missing proof.
- `an update preflight binds the exact resolved remote commit without touching the checkout` (`test/update.test.ts:181-199`). It asserts plan fields (`head`, `dirty`, `targetOid`, `fastForward`, `blockedReasons`) and digest stability. The phrase "without touching the checkout" is not asserted on bytes. `life08.preview.bootstrap-update.no-mutation` and `bootstrap-update-human.no-mutation` supply the missing proof on a real checkout, including `.git`.
- `candidate locks are strictly rejected by stable lock reconciliation (LIFE-08, D-16)` (`test/lifecycle.test.ts:294-310`). It checks a plan note string. It never places a candidate file where the CLI could read it. `life08.apply.candidate-ignored` and `life08.apply.byte-identical` supply the missing proof through the packed CLI, and the CI packed lifecycle test now asserts it.

## Core clause

The core promise is that preview mutates nothing and apply reconciles only the reviewed stable lock. On the alpha-AOS side it holds on every surface:

- All seven preview surfaces leave the checkout (with `.git`), the package, the global link prefix, the harness configuration roots and the managed state byte-identical.
- `update --apply` ignores an unreviewed candidate lock byte-for-byte and restores a removed managed file from the stable lock.

The one strict byte violation is the PowerShell engine cache that pwsh itself writes. A no-alpha-AOS control reproduces it.

## Provisional verdict

VERIFIED (D-02), on condition that plan 11-07 accepts the update.ps1 attribution. Every LIFE-08 clause holds on packed-CLI byte-fingerprint evidence that is stronger than the Phase 6 oracles. The only VIOLATED preview checks (`life08.preview.update-ps1.no-mutation`, `life08.preview.update-ps1-rerun.no-mutation`) are PowerShell engine cache writes under `LOCALAPPDATA`. The `update-ps1.pwsh-control` check reproduces them with no alpha-AOS code, and they touch none of the five named mutation classes. If 11-07 judges the PowerShell cache to be "configuration", the verdict becomes PARTIAL with LIFE-08/C1 below.

Combined codex+pi targets for `update --apply` share the LIFE-01/C1 defect (the same `applyManagedInstall` path). That defect is recorded and gated under LIFE-01, not duplicated here.

## Gap candidates

None raised. The contingent candidate below is listed so that 11-07 can decide it explicitly.

### LIFE-08/C1 (contingent: raise only if the PowerShell engine cache counts as configuration)

- clause: update preview with no configuration mutation (`scripts/update.ps1` surface)
- missing: a byte-identical user home across `pwsh -NoProfile -File scripts/update.ps1`
- close condition: not closable in alpha-AOS without changing how the script is launched. PowerShell writes its startup profile cache on every start, so closing it would mean documenting the PowerShell cache as outside LIFE-08.
- reproduction: `npm run build && node .planning/phases/11-managed-lifecycle-verification/evidence/probes/life08-preview.mjs`; `evidence/life08-preview.txt` step `B: pwsh -NoProfile -File scripts/update.ps1`, exit 0, drift `added AppData/Local/Microsoft/PowerShell/StartupProfileData-NonInteractive - -> file/<size>/<hash>`; `CHECK life08.preview.update-ps1.no-mutation VIOLATED`; control `CHECK life08.preview.update-ps1.pwsh-control OBSERVED ... added files: AppData/Local/Microsoft/PowerShell/StartupProfileData-NonInteractive`

## Leads (not reproduced)

- `update --apply` after a real stable-lock promotion that changes ECC skill bytes would plan `ecc:codex` and `ecc:pi` replacements of the same `.agents/skills` files in one operation. That could hit the review/apply drift of LIFE-01/C1 on the Phase 13 path. No probe promoted a lock, so this remains a lead (see `LIFE-01-findings.md` Leads).

## Observations

- `bootstrap update --json` exits 2 and prints no plan document. Its stderr reads `Refusing to print a JSON envelope over the observable byte budget of 262144 bytes. The envelope was built and hashed but not written` (`life08.preview.bootstrap-update.plan`). The JSON preview surface is therefore unusable for review, while the human preview works (exit 0, four planned external steps, `Preview only.`). This is not a mutation, so it is outside LIFE-08. Plan 11-07 may route it as a usability finding.
- `update --check` on 2026-09-23 reported the candidate `gsd=@opengsd/gsd-core@1.14.0, ecc=ecc-universal@2.2.1, mcp.context7=@upstash/context7-mcp@4.1.1, mcp.exa=exa-mcp-server@3.4.1, mcp.firecrawl=firecrawl-mcp@3.25.4, bridge.pi=pi-mcp-adapter@2.37.0` (`life08.preview.update-check.result`). These are the promotions Phase 13 would review. The versions come from the registry, so a re-run may report newer ones.
- `Unverified candidate.lock.json was not applied.` is printed on every `update --apply`, whether or not a candidate exists (`src/cli.ts:1024`). It documents the policy but does not detect a candidate.
- Copying `<repo>/dist` into the clone did not give a verified artifact. On this host the working tree holds CRLF bytes for files that the index stores as LF (`.gitattributes` `* text=auto eol=lf`). The fixture checkout therefore builds its own `dist`, and `life08.preview.checkout-artifact HOLDS`. Previewing the unverified copy also changed no bytes: an earlier run recorded the same no-mutation outcomes for a blocked preview.
- The number of PowerShell cache files varies between runs: `ModuleAnalysisCache-*` appears in some runs and not others. The `update-ps1.drift-scope` detail therefore varies, while its conclusion does not.

## Phase 13 gating

LIFE-08 blocks Phase 13: no. There is no open LIFE-08 gap candidate: the only strict violation is PowerShell engine cache, reproduced by a no-alpha-AOS control. If plan 11-07 raises LIFE-08/C1, it still would not block promotion, because promotion runs `update --apply` and never `update.ps1`. Phase 13 is nevertheless blocked by LIFE-01/C1 (`LIFE-01-findings.md`), which also affects `update --apply` for combined codex+pi targets.
