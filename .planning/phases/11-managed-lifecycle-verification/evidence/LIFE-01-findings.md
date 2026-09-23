# LIFE-01 Findings

Transcripts (written by probes under `evidence/probes/`, each ending with `host-guard: unchanged (17 targets)`):

- `evidence/life01-codex-reconcile.txt` (`probes/life01-reconcile.mjs`, plan 11-01): Codex tracer. RESULT holds=5 violated=0 not-observed=0 observed=3.
- `evidence/life01-harnesses-reconcile.txt` (`probes/life01-harnesses.mjs`, this plan): claude, antigravity, pi and hermes in one fresh sandbox each, then all five harnesses in one sandbox, then diagnostics that narrow the five-target failure. RESULT holds=25 violated=3 not-observed=15 observed=10.

Every group runs the tracer sequence through the packed CLI (`npm pack` tarball installed into `<sandbox>/prefix`):

1. initial `install --target <t> --apply --json`
2. a fingerprint of `<sandbox>/home`, `<sandbox>/state` and `<sandbox>/prefix`
3. a human dry-run `install --target <t>`, where every step line must read `CURRENT`
4. a second fingerprint
5. a JSON dry-run, where every `steps[].action` must be `current`
6. a second apply, with empty `applied` and `operationIds` and unchanged journal names
7. a last fingerprint, compared with the post-initial one

The fingerprint excludes only `<sandbox>/temp`, `<sandbox>/npm-cache` and `<sandbox>/npm-logs`, each with its reason in the transcript.

## Contract

**LIFE-01**: User can install or reconcile the reviewed stable lock idempotently, and a second unchanged plan reports `CURRENT`

(`.planning/milestones/v0.1.0-REQUIREMENTS.md:77`)

### Which command is "the plan"

"The plan" is `alpha-aos install` without `--apply`. It is the stateful plan that prints one `<ACTION> <step id> - <note>` line per step and reads `CURRENT` for a reconciled step (`src/cli.ts:489-500`). `alpha-aos plan` is a static table of the catalog. `evidence/life01-codex-reconcile.txt`: `CHECK life01.plan-command-static OBSERVED alpha-aos plan exit=0, CURRENT line absent; plan --json exit=0, a "current" value absent; the stateful plan for LIFE-01 is install without --apply`. No README or docs line tells users to run `alpha-aos plan` for reconcile state: `CHECK life01.plan-command-docs OBSERVED README.md and docs/ lines containing "alpha-aos plan": none`. **No gap candidate is raised for the plan command.**

### Seeding precondition (research Pitfall 5)

Every group starts from prerequisites seeded at the locked values. The Phase 7 packed lifecycle and the CI packed lifecycle test (`test/tarball-fixture.test.ts`) do the same. The seeded state is:

- GSD `gsd-core/VERSION`, `gsd-core/.gsd-runtime` and `.gsd-profile` for claude, codex, antigravity and pi (hermes gets no GSD from the stable lock)
- the three ECC skills, pre-rendered by the packed `ecc-fixture` module and matched to the lock target hashes
- each harness's MCP config, pre-rendered by the packed `renderMcpConfig`
- the Pi `pi-mcp-adapter` bridge manifest at the locked version
- the locked ECC runtime installed into the sandbox prefix from the host npm cache
- for claude only, `gsd-core/workflows/ship.md`, copied from the locked `@opengsd/gsd-core@1.12.0` package

The claude workflow file is needed because the `alpha-aos-ship` owned skill declares it as `upstreamWorkflow` (`catalog/stack.lock.json:118`). `applyOwnedSkillSync` refuses when that file is absent (`src/core/owned-skills.ts:238-240`). A real GSD install for claude writes it.

Because of this seeding, the external steps (`gsd:*`, `ecc:runtime`, `mcp-bridge:pi`) are already current before the first apply. The evidence proves reconcile and idempotence of the alpha-AOS-owned steps and the current-detection of the external steps. It does not prove a cold network install of GSD, ECC or the Pi bridge (`seed-selfcheck.txt`: every external step reads `current` after seeding alone).

## Clauses

| # | Clause | Evidence | Oracle audit (D-04) | Result |
|---|--------|----------|---------------------|--------|
| 1 | install or reconcile the reviewed stable lock | `life01-codex-reconcile.txt`: `CHECK life01.codex.initial-apply OBSERVED exit=0; applied=2`. `life01-harnesses-reconcile.txt`: `life01.claude.initial-apply` (applied 3), `life01.antigravity.initial-apply`, `life01.pi.initial-apply` and `life01.hermes.initial-apply` (applied 1 each), all OBSERVED exit=0. `life01.claude-antigravity-hermes.initial-apply OBSERVED exit=0; applied=5`. **`life01.all.initial-apply VIOLATED`**, **`life01.codex-pi.initial-apply VIOLATED`** and **`life01.all-retry.initial-apply VIOLATED`**, each `plan-drift: owned-skill-sync changed between review and apply`. Every installed lock reads `channel: stable` (transcript notes) | The packed CLI is driven against the tarball's own `catalog/stack.lock.json`, and `installPackedRelease` asserts the channel is `stable` and that no candidate lock exists. The single-target and three-target installs succeed. An install that selects codex **and** pi in one operation fails with no environmental cause, and a retry fails the same way | VIOLATED for any target set containing both codex and pi (LIFE-01/C1); HOLDS for each harness alone and for claude+antigravity+hermes |
| 2 | idempotently: no writes, no journals, byte identity | Codex: `life01.codex.second-apply-noop HOLDS`, `life01.codex.second-apply-byte-identical HOLDS`, `life01.codex.preview-no-mutation HOLDS`. For each of claude, antigravity, pi, hermes and claude-antigravity-hermes: `life01.<group>.second-apply-noop HOLDS` (applied=0, operationIds=0, all steps current, journal file names unchanged), `life01.<group>.second-apply-byte-identical HOLDS` and `life01.<group>.preview-no-mutation HOLDS`. After a serial codex-then-pi install: `life01.codex-then-pi.combined-apply OBSERVED exit=0; applied=0; operationIds=0; current=11 of 11` | Byte identity is a full fingerprint of sandbox home, state and prefix (path, kind, size and sha256 per entry). It is compared, not inferred from journal counts. The five-target group could not be observed, because its initial apply never completed (`life01.all.second-apply-*` NOT-OBSERVED). Once codex and pi are installed one at a time, the combined codex,pi apply is a no-op. That check is OBSERVED, with no fingerprint | HOLDS per harness and for claude+antigravity+hermes; NOT-OBSERVED for all five together (blocked by clause 1) |
| 3 | a second unchanged plan reports `CURRENT` | `life01.<group>.preview-current HOLDS` (every human step line `CURRENT`) and `life01.<group>.preview-json-current HOLDS` for codex (6 steps), claude (7), antigravity (5), pi (6), hermes (4) and claude-antigravity-hermes (14). After the serial codex-then-pi install: `life01.codex-then-pi.combined-plan OBSERVED ... owned-skill:alpha-aos-control:codex=current, owned-skill:alpha-aos-control:pi=current` | The plan is the real `install` dry-run after a real apply. It is not a synthetic plan with forced actions. The human and JSON forms are both checked. The CI packed lifecycle test guards the codex human form (plan 11-01) | HOLDS per harness; NOT-OBSERVED for all five together (blocked by clause 1) |
| 4a | scope: claude | `life01-harnesses-reconcile.txt`: `life01.claude.*`, 5 HOLDS + initial apply OBSERVED | Judged at sandbox file level (D-10). No real-host Claude invocation receipt is required. The ship workflow seed is a precondition (see above) | HOLDS |
| 4b | scope: codex | `life01-codex-reconcile.txt`: `life01.codex.*`, 5 HOLDS + initial apply OBSERVED. CI packed lifecycle test passed on jobs 107044319989 / 107044319988 / 107044319963 (`ci-35818198049-lifelines.txt:53,97,141`). That run is at 35d4c15 and covered the codex install and second apply. Plan 11-01 added the dry-run CURRENT and byte-identity assertions afterwards, so only the next `main` run can corroborate them | The tracer and the strengthened CI test run the same sequence | HOLDS |
| 4c | scope: antigravity | `life01.antigravity.*`, 5 HOLDS + initial apply OBSERVED | as 4a | HOLDS |
| 4d | scope: pi | `life01.pi.*`, 5 HOLDS + initial apply OBSERVED | `mcp-bridge:pi` is current from the seeded manifest | HOLDS |
| 4e | scope: hermes | `life01.hermes.*`, 5 HOLDS + initial apply OBSERVED | Hermes has no GSD step. Its 4 steps are the owned skill, the ECC runtime and skills, and MCP | HOLDS |
| 4f | scope: all five harnesses in one operation | `life01.all.initial-apply VIOLATED` and 5 NOT-OBSERVED; `life01.all-failure.owned-skills OBSERVED` (every owned skill is back to `create`: the failed apply rolled back, and the note reads `5 journal file(s) with status: rolled-back` five times); `life01.all-retry.initial-apply VIOLATED` (same error on retry) | The failure is deterministic and product-caused (a `plan-drift` refusal, with no network, registry or detection cause). Rollback left no partial state. So the gap is the refusal itself, not corruption | VIOLATED (LIFE-01/C1) |

### Oracle audit of the Phase 6 LIFE-01 tests (D-04)

- `stable-lock reconciliation against already-applied stack is idempotent and executes zero writes (LIFE-01, D-15)` (`test/lifecycle.test.ts:161-220`). The test builds a real plan, then replaces it with a **synthetic** all-current plan (`steps: plan.steps.map((s) => ({ ...s, action: "current" as const }))`, `test/lifecycle.test.ts:189-192`) and passes `digest: "synthetic-digest"` with empty components to `applyManagedInstall`. It proves only the short-circuit: an apply given an all-current plan writes nothing. It does **not** prove that a real second plan comes out current, which is the LIFE-01 promise. It passes locally (`evidence/suites-local.txt:19`) and on all three CI jobs (`ci-35818198049-lifelines.txt:28,72,116`).
- `idempotent repetition produces identical results without accumulating journals or snapshots (LIFE-01)` (`test/lifecycle.test.ts:222-270`). It hands a hand-written all-current `mockPlan` to `applyManagedInstall` twice. The weakness is the same: the plan is not computed from the applied state. It compares journal counts, not bytes (`suites-local.txt:20`; CI lines 29, 73, 117).
- **The missing proof comes from the probe checks**, not from these tests. `life01.<harness>.preview-current` and `preview-json-current` show that a real second plan is CURRENT. `second-apply-noop` shows that a real second apply writes and journals nothing. `second-apply-byte-identical` and `preview-no-mutation` show byte identity by fingerprint. Together they cover codex, claude, antigravity, pi and hermes individually, plus claude+antigravity+hermes combined.

## Core clause

The core promise is idempotent reconcile of the reviewed stable lock: a second plan is CURRENT and a second apply changes nothing. It **holds for every harness individually** and for the three-harness combination without a shared destination, on byte-fingerprint evidence. It **cannot be exercised** for a target set containing both codex and pi, because the first combined install of the stable lock refuses. That set is the default selection on any machine where both are detected (`selectInstallTargets` returns every detected harness when `--target` is omitted, `src/core/install.ts:145-159`).

## Provisional verdict

PARTIAL (D-02): the reconcile and CURRENT clauses hold for each of the five harnesses alone and for claude+antigravity+hermes, with packed-CLI byte-fingerprint evidence. However, the stable lock cannot be installed in one operation for any target set that includes both codex and pi (LIFE-01/C1). That is an unmet clause of "install or reconcile the reviewed stable lock", so LIFE-01 is not VERIFIED.

## Gap candidates

### LIFE-01/C1

- clause: install or reconcile the reviewed stable lock (a target set containing both codex and pi, including the default `install --apply` on a machine where both are detected)
- missing: a combined managed install for codex and pi. `install --target codex,pi --apply` (and the five-target install) refuses with `plan-drift: owned-skill-sync changed between review and apply`. Both harnesses render the `alpha-aos-control` owned skill into the same file, `<home>/.agents/skills/alpha-aos-control/SKILL.md` (`destinationFor` via `globalEccSkillRoot`, `src/core/owned-skills.ts:52-57`). Both steps are reviewed as `create` with no current file. Once the codex step writes the file, the pi step's re-plan observes a current hash, so its digest no longer matches the reviewed one. `applyOwnedSkillSync` then refuses (`assertPlanUnchanged`, `src/core/owned-skills.ts:246-247`). The whole operation rolls back, so a retry hits the same refusal. The two renders are byte-identical: installed one at a time, both steps read `current`.
- close condition: a combined install over targets that share a destination completes in one operation, and a second combined plan reads CURRENT with a byte-identical second apply. One way is to deduplicate identical owned-skill writes to the same destination, or to re-plan dependent steps after an earlier step in the same session. Reproducing `life01.all.*` and `life01.codex-pi.*` as HOLDS closes it.
- reproduction: `npm run build && node .planning/phases/11-managed-lifecycle-verification/evidence/probes/life01-harnesses.mjs`; transcript `evidence/life01-harnesses-reconcile.txt`:
  - step `all: initial install --target claude,codex,antigravity,pi,hermes --apply` (`node <sandbox-5>\prefix\node_modules\alpha-aos\dist\src\cli.js install --target claude,codex,antigravity,pi,hermes --apply --json`), exit 2, stderr `alpha-aos: plan-drift: owned-skill-sync changed between review and apply: reviewed <12-hex>, observed <12-hex>.`
  - `CHECK life01.all.initial-apply VIOLATED exit=2; the initial apply failed for a non-environmental reason; stderr: "alpha-aos: plan-drift: owned-skill-sync changed between review and apply: reviewed <digest>, observed <digest>."`
  - `note: all: after the failed five-target apply the sandbox state holds 5 journal file(s) with status: rolled-back, rolled-back, rolled-back, rolled-back, rolled-back`
  - `CHECK life01.all-retry.initial-apply VIOLATED` (same stderr)
  - `CHECK life01.codex-pi.owned-skill-plan OBSERVED owned-skill steps before any apply: owned-skill:alpha-aos-control:codex=create, owned-skill:alpha-aos-control:pi=create; codex and pi both render alpha-aos-control into <sandbox-6>/home/.agents/skills ...`
  - `CHECK life01.codex-pi.initial-apply VIOLATED exit=2; ... plan-drift: owned-skill-sync changed between review and apply ...`
  - control: `CHECK life01.claude-antigravity-hermes.initial-apply OBSERVED exit=0; applied=5`, followed by five HOLDS for the same group (no shared destination, same combined-operation code path)
  - convergence: `CHECK life01.codex-then-pi.serial-apply OBSERVED codex apply exit=0; pi apply exit=0, applied=none`, `CHECK life01.codex-then-pi.combined-plan OBSERVED ... codex=current, ... pi=current`, `CHECK life01.codex-then-pi.combined-apply OBSERVED exit=0; applied=0; operationIds=0; current=11 of 11`

## Leads (not reproduced)

- The ECC skills for codex and pi also share `<home>/.agents/skills` (`harnessPaths`, `seed-selfcheck.txt` note). A stable-lock promotion that changes ECC skill bytes would plan `ecc:codex` and `ecc:pi` as `replace` against the same files in one operation. That may hit the same review/apply drift as LIFE-01/C1 on exactly the `update --apply` path Phase 13 uses. This was not reproduced: the seeded ECC skills are already current, so no probe exercised an ECC replace for both targets.
- `install` without `--target` on a host with both codex and pi selects both (code reading of `selectInstallTargets`, `src/core/install.ts:156-158`), so the default command would hit LIFE-01/C1. The probes pass explicit `--target` lists, and no probe ran the default selection.

## Observations

- An earlier run of `life01-harnesses.mjs`, before the claude ship-workflow seed existed, failed the claude initial apply with `Required GSD workflow is missing: <sandbox>\home\.claude\gsd-core\workflows\ship.md`, while the claude dry-run planned `owned-skill:alpha-aos-ship:claude` as `create` without warning (`seed-selfcheck.txt`: `seed.claude.preview` lists it as `create`). With GSD seeded only as version files, `gsd:claude` reads `current` even though the GSD workflows are absent. A real GSD install writes them, so this is recorded as a seeding precondition, not a gap. The committed transcript is the run with the complete seed.
- A failed combined apply rolls back every journal it opened (`rolled-back` x5). No partial alpha-AOS state survives the LIFE-01/C1 refusal.
- `life01.<harness>.initial-apply` is OBSERVED rather than HOLDS by design, following the tracer: it records what the first apply did, and the LIFE-01 clauses are judged on the later checks.

## Phase 13 gating

LIFE-01 blocks Phase 13: yes. Cause: LIFE-01/C1 (D-08: an open LIFE-01 gap blocks dependency promotion). The per-harness reconcile evidence holds for all five harnesses, but the reviewed stable lock cannot be installed or reconciled in one operation for a target set that includes both codex and pi. That set includes the default selection on a machine where both are detected.
