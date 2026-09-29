# LIFE-02 Findings

Transcripts (both written by probes under `evidence/probes/`, both ending with `host-guard: unchanged (17 targets)`):

- `evidence/life02-status.txt` (`probes/life02-status.mjs`): packed release in a sandbox, populated by a packed Codex install. RESULT holds=9 violated=1 not-observed=0 observed=1.
- `evidence/life02-discovery.txt` (`probes/life02-discovery.mjs`): packed release, `doctor --discovery` and `doctor --canary --no-spend` run against a scratch clone of the repository with the real home and `ALPHA_AOS_STATE_DIR=<sandbox>/state`. RESULT holds=4 violated=7 not-observed=1 observed=4.

## Contract

**LIFE-02**: User can run offline `status` for fast inspection and an explicit `doctor` or canary mode for native discovery and meaningful read-only execution evidence with actionable coded findings

(`.planning/milestones/v0.1.0-REQUIREMENTS.md:78`)

## Clauses

| # | Clause | Evidence | Oracle audit (D-04) | Result |
|---|--------|----------|---------------------|--------|
| 1 | offline `status` | `evidence/life02-status.txt`: `CHECK life02.status.zero-subprocess HOLDS`, `CHECK life02.status.zero-network HOLDS`, both valid because `CHECK life02.status.trap-control-spawn HOLDS` (inventory logged `child_process.spawnSync x14`) and `CHECK life02.status.trap-control-network HOLDS` (loopback fetch logged `fetch x1`). New CI test `offline status spawns no child process and opens no network connection through the CLI (LIFE-02)` in `test/status-offline-verification.test.ts` (passes on Windows and under WSL). Phase 6 test `offline status strictly executes zero subprocesses (LIFE-02, D-14)`: `evidence/suites-local.txt:37`, CI jobs 107044319989 (ubuntu), 107044319988 (macOS), 107044319963 (windows) in `evidence/ci-35818198049-lifelines.txt` | The Phase 6 test patches `childProcess[method]` on the default export without `syncBuiltinESMExports()`, so an ESM named import would escape it. It runs `getOfflineStatus` in-process only, never through the CLI, which also loads the catalog and lock first (`src/cli.ts:422-424`). It traps no network API. **The Task 1 probe supplies the missing proof**: a `node --import` preload traps child_process, net, tls, dns, http, https and fetch, syncs named ESM exports, and runs on the packed entrypoint. Two positive controls show the trap records. | HOLDS |
| 2 | fast inspection | `evidence/life02-status.txt`: `CHECK life02.status.in-process-under-50ms HOLDS` (populated state root after a packed Codex install; note: median 2.35 ms of 10 in-process calls). `CHECK life02.status.cli-timing OBSERVED` (note: packed CLI `status --json` wall median 806.4 ms over 10 runs, including Node startup and catalog/lock load). Phase 6 test `offline status completes in under 50ms benchmark (LIFE-02, D-14)`: `evidence/suites-local.txt:38` and the same three CI jobs | The Phase 6 benchmark measures an **empty** state root in-process. **The probe supplies the missing proof** on a populated state root (journals, snapshots and lock from a real install), using the installed package's modules. The LIFE text gives no number. The 50 ms interpretation comes from Phase 6. CLI wall time is recorded as an observation and is not judged against 50 ms (D-09) | HOLDS |
| 3 | explicit `doctor` or canary mode | `evidence/life02-discovery.txt` steps 4-7: `doctor --discovery <project> [--json]` exit 0, `doctor --canary <project> --no-spend [--json]` exit 0. The canary prints its cost before running anything (`CHECK life02.canary.spend-legs OBSERVED`, cost lines in notes). `evidence/life02-status.txt` step 8: `doctor --json` exit 0 | These modes are opt-in commands, separate from `status`. Discovery states that it spent nothing, and the canary announces what would spend before it runs. The probe observed both behaviors directly | HOLDS |
| 4a | native discovery: claude | `CHECK life02.discovery.claude NOT-OBSERVED not executed (cost)`: the row says `driving claude spends a model turn, and this sweep spends nothing` | The Claude discovery oracle is `claude -p ...` (`src/adapters/capability-oracle.ts:259-260`), which spends a model turn. D-11 forbids running it. The cost-excluded leg belongs to **G-07-2 / REL-02** (D-10) | NOT-OBSERVED (cost; owned by G-07-2 / REL-02) |
| 4b | native discovery: codex | `CHECK life02.discovery.codex HOLDS`: COMPLETE evidence units for BROWNFIELD_INIT and MCP_SERVER | A COMPLETE unit means the paired positive run (scratch project) and negative run (a control directory proven free of ancestor skill roots) of the native oracle both parsed. The oracle is `codex debug prompt-input` (`capability-oracle.ts:266-270`). Native use reads `unverified` because the packs are not deployed in the scratch clone, which is an expected negative. Codex-native drift in `life02.harness-homes-unchanged` corroborates that codex actually ran | HOLDS |
| 4c | native discovery: antigravity | `CHECK life02.discovery.antigravity VIOLATED absent from discovery rows`; note: `harnesses with rows: claude, codex, hermes, pi` | Antigravity has no row at all. It is not reported as unsupported: the report omits it silently | VIOLATED (LIFE-02/C1) |
| 4d | native discovery: pi | `CHECK life02.discovery.pi HOLDS`: COMPLETE units for both packs | Oracle `pi --mode rpc --approve --no-session` with a `get_commands` request (`capability-oracle.ts:277-283`), paired positive/negative as for codex | HOLDS |
| 4e | native discovery: hermes | `CHECK life02.discovery.hermes VIOLATED`: rows `support=unsupported`, `no discovery oracle is defined for hermes, so there is nothing free to run` | The report states the absence honestly, but no discovery evidence exists for hermes | VIOLATED (LIFE-02/C2) |
| 5a | meaningful read-only execution evidence: claude | `CHECK life02.canary.claude.no-spend-execution VIOLATED`: CAPA-01, CAPA-02 (x2) and CAPA-05 are all `not attempted: this leg spends a model turn`. `CHECK life02.canary.spend-legs OBSERVED not executed (cost)` | Every Claude leg spends a model turn, so `--no-spend` cannot produce Claude execution evidence (D-11). Not executed (cost). The owning future requirement is G-07-2 / REL-02 | VIOLATED (LIFE-02/C3, owned by G-07-2 / REL-02) |
| 5b | meaningful read-only execution evidence: codex | The discovery leg is the read-only native invocation (`codex debug prompt-input`, row 4b). `CHECK life02.canary.codex.no-spend-execution VIOLATED`: the only no-spend canary legs are the CAPA-03 handoff free legs (COMPLETE, `nativeUse=discovered`), whose receiving leg (the codex launch) was `not attempted` (it would spend). `CHECK life02.harness-homes-unchanged OBSERVED` | **Argued as not failing the LIFE-02 text for codex.** The text asks for "an explicit `doctor` **or** canary mode" that produces native discovery and read-only execution evidence, and D-11 names `doctor --discovery` as a source of execution evidence. `doctor --discovery` launches the codex binary read-only and parses its prompt input in both halves of a COMPLETE unit. The canary check is VIOLATED because no **canary** leg launches codex without spending. That is recorded under Observations, not as a LIFE-02 gap for codex | HOLDS (via discovery) |
| 5c | meaningful read-only execution evidence: antigravity | `CHECK life02.canary.antigravity.no-spend-execution VIOLATED no canary leg is declared for this harness`, and no discovery row (4c) | No surface in either mode launches antigravity | VIOLATED (LIFE-02/C4) |
| 5d | meaningful read-only execution evidence: pi | The discovery leg is the read-only native invocation (`pi --mode rpc --no-session`, row 4d). `CHECK life02.canary.pi.no-spend-execution VIOLATED no canary leg is declared for this harness` | **Argued as not failing the LIFE-02 text for pi**, on the same "doctor or canary" reasoning as 5b. The pi RPC `get_commands` exchange in both halves of a COMPLETE unit is a read-only native execution. No pi canary is declared (the compiled doctor refuses `--harness pi`: `test/canary.test.ts` "compiled doctor refuses an undeclared Pi canary before creating managed state") | HOLDS (via discovery) |
| 5e | meaningful read-only execution evidence: hermes | `CHECK life02.canary.hermes.no-spend-execution VIOLATED`: hermes appears only as the CAPA-03 handoff source, and alpha-AOS writes the vault memory on hermes's behalf without launching it. There is no discovery oracle either (4e) | No surface in either mode runs hermes read-only | VIOLATED (LIFE-02/C5) |
| 5f | read-only: the invocations change no managed configuration | `CHECK life02.harness-homes-unchanged OBSERVED harness-native drift in codex, hermes`; `CHECK life02.repo-unchanged HOLDS`; `CHECK life02.canary.planning-unchanged HOLDS`; `CHECK life02.canary.vault-writes OBSERVED` | The real harness roots were fingerprinted immediately before the first doctor step and after the last canary step: 216 children, with every exclusion named and explained in note lines. Only harness-native entries drifted: codex `logs_2.sqlite-shm`, `models_cache.json`, `sqlite`, and hermes `state.db-shm`. No alpha-AOS-managed path drifted. The canary's vault writes land in the project it was given, as documented, and `.planning` stays byte-identical | HOLDS (no managed drift; harness-native drift itemized under Observations) |
| 6a | coded findings | `evidence/life02-status.txt`: `CHECK life02.doctor.coded HOLDS` (19 findings, all with a non-empty `code` and `level`) | Every `doctor --json` finding on the populated sandbox was checked for a string `code` and `level` | HOLDS |
| 6b | actionable findings for a needs-repair state | `CHECK life02.status.needs-repair HOLDS` (a corrupt journal makes `status` exit 1 with `needsRepair=true`, `corruptJournals=["p11-corrupt.json"]`); `CHECK life02.doctor.actionable HOLDS` (the **status** guidance names `alpha-aos repair`, and its dry-run exits 0); `CHECK life02.doctor.flags-corrupt-journal VIOLATED` (`doctor --json` exit 0, with no finding that names the journal). Phase 6 tests `corrupt journal flags needsRepair=true and records filename (LIFE-02, D-09)`, `incomplete transaction flags needsRepair=true (LIFE-02, D-09)` and `stale lock flags needsRepair=true and writerStatus=needs-repair (LIFE-02, D-09)`: `evidence/suites-local.txt:40-42` and the three CI jobs | The actionable surface (`status` guidance) carries no code: `status --json` has no `code` field, and the human line is prose. The coded surface (`doctor`) cannot see the condition. So neither surface is both coded and actionable. The Phase 6 tests assert `needsRepair` on `getOfflineStatus` only | VIOLATED (LIFE-02/C6) |

## Core clause

The core promise is native discovery with meaningful read-only execution evidence, through an explicit `doctor` or canary mode (clauses 4 and 5). It **holds for codex and pi** only. Their free discovery sweep launches the native binary read-only in a paired positive/negative COMPLETE unit. Claude is cost-excluded (not executed (cost); G-07-2 / REL-02). Antigravity is absent from discovery and has no canary. Hermes has no discovery oracle and is never launched. No `--no-spend` canary leg launches any harness: 10 of 10 declared canary/harness pairs spend a model turn. Result: 2 of 5 harnesses evidenced.

## Provisional verdict

PARTIAL (D-02, D-11): offline status, fast inspection, explicit modes and coded findings hold on the packed CLI with stronger oracles than Phase 6. Native discovery and read-only execution evidence exist for codex and pi only, and a needs-repair state is not both coded and actionable. D-11 directs PARTIAL with named gaps rather than stretching to VERIFIED.

## Gap candidates

### LIFE-02/C1

- clause: native discovery (antigravity)
- missing: a discovery row for antigravity. `doctor --discovery` produces no antigravity row at all, not even an `unsupported` or `NOT-RUN` row, so the report omits a supported harness silently.
- close condition: `doctor --discovery` reports an antigravity row: a COMPLETE unit from a free native oracle, or at least an explicit `unsupported`/`not-run` row naming why.
- reproduction: `npm run build && node .planning/phases/11-managed-lifecycle-verification/evidence/probes/life02-discovery.mjs`; transcript `evidence/life02-discovery.txt` step 4 (`node <sandbox>\prefix\node_modules\alpha-aos\dist\src\cli.js doctor --discovery <sandbox>\project --json`, exit 0). Observed:
  - `note: discovery JSON: exit=0; packs=BROWNFIELD_INIT, MCP_SERVER; 8 rows; harnesses with rows: claude, codex, hermes, pi`
  - `CHECK life02.discovery.antigravity VIOLATED absent from discovery rows`

  Root cause (code reading, consistent with the reproduction): `SWEEP_HARNESSES = ["claude", "codex", "pi", "hermes"]` (`src/core/canary.ts:3393`), and `ORACLE_DEFINITIONS.antigravity` is `null` (`src/adapters/capability-oracle.ts:276`).

### LIFE-02/C2

- clause: native discovery (hermes)
- missing: a free discovery oracle for hermes. Both hermes rows are `unsupported`.
- close condition: a hermes discovery oracle that runs read-only and yields a COMPLETE paired unit.
- reproduction: same command and transcript, step 4. Observed: `CHECK life02.discovery.hermes VIOLATED BROWNFIELD_INIT: completeness=null support=unsupported nativeUse=null notRun="no discovery oracle is defined for hermes, so there is nothing free to run"; MCP_SERVER: completeness=null support=unsupported nativeUse=null notRun="no discovery oracle is defined for hermes, so there is nothing free to run"`

### LIFE-02/C3

- clause: meaningful read-only execution evidence (claude). Native discovery for claude is also unevidenced (row 4a).
- missing: any Claude execution or discovery evidence that costs nothing. Every Claude oracle and canary leg spends a model turn.
- close condition: the REL-02 / G-07-2 real-host invocation receipt (the existing future requirement that owns Claude's cost-excluded legs, D-10), or a deliberate spending canary run (deferred in 11-CONTEXT.md). Plan 11-07 should map this candidate onto G-07-2 / REL-02 rather than mint a duplicate gap id.
- reproduction: same command and transcript, steps 4 and 6 (`... doctor --canary <sandbox>\project --no-spend --json`, exit 0). Observed:
  - `CHECK life02.discovery.claude NOT-OBSERVED not executed (cost): BROWNFIELD_INIT: completeness=null support=supported nativeUse=null notRun="driving claude spends a model turn, and this sweep spends nothing; ...`
  - `CHECK life02.canary.claude.no-spend-execution VIOLATED no no-spend leg launched this harness's own native surface; legs: CAPA-01 (DOCUMENTATION_VERSION_SCOPED): evidence=- nativeUse=unverified (not attempted: this leg spends a model turn and the run was asked not to spend. ...`
  - `note: canary cost line: This run would drive 10 canary/harness pair(s): 10 spend a model turn, 0 do not.`

### LIFE-02/C4

- clause: meaningful read-only execution evidence (antigravity)
- missing: every read-only execution path for antigravity. There is no discovery row (C1) and no declared canary.
- close condition: a free read-only antigravity invocation reachable from `doctor --discovery` or `doctor --canary --no-spend` that yields a COMPLETE unit or a launched, completed leg.
- reproduction: same command and transcript, step 6. Observed: `CHECK life02.canary.antigravity.no-spend-execution VIOLATED no canary leg is declared for this harness, so no no-spend leg launched its native surface`, plus the C1 lines.

### LIFE-02/C5

- clause: meaningful read-only execution evidence (hermes)
- missing: every read-only execution path for hermes. There is no discovery oracle (C2), and in the CAPA-03 handoff hermes is only the source, whose memory alpha-AOS writes without launching hermes.
- close condition: a free read-only hermes invocation, through a discovery oracle or a no-spend canary leg, that launches hermes and completes.
- reproduction: same command and transcript, step 6. Observed:
  - `note: handoff 1: CAPA-03 (CROSS_HARNESS_HANDOFF) source hermes, target codex; free legs completeness=COMPLETE, recalled=true; receiving leg not attempted`
  - `CHECK life02.canary.hermes.no-spend-execution VIOLATED no no-spend leg launched this harness's own native surface; legs: CAPA-03 handoff source: alpha-AOS writes the vault memory on this harness's behalf; this harness is not launched`

### LIFE-02/C6

- clause: actionable coded findings (for a needs-repair state)
- missing: a coded `doctor` finding for an unhealthy journal. With a corrupt journal in the state root, `status` reports NEEDS-REPAIR with an uncoded prose line, while `doctor --json` exits 0 and names no journal problem. The coded surface is blind and the actionable surface is uncoded.
- close condition: `doctor` emits an error- or warning-level finding with a stable `code` for corrupt or incomplete journals and stale writer locks, and the finding names the runnable next action (`alpha-aos repair`). Alternatively, `status --json` carries a code for the needs-repair condition.
- reproduction: `npm run build && node .planning/phases/11-managed-lifecycle-verification/evidence/probes/life02-status.mjs`; transcript `evidence/life02-status.txt` steps 9-12 (the probe writes `<sandbox>/state/journal/p11-corrupt.json` with the bytes `{not json`, then runs `status`, `status --json` and `doctor --json` through the packed CLI). Observed:
  - `note: status guidance line (verbatim): STATUS: NEEDS-REPAIR (Run 'alpha-aos repair' to recover from interrupted operation)`
  - `CHECK life02.status.needs-repair HOLDS status exit=1; status --json exit=1, needsRepair=true, corruptJournals=["p11-corrupt.json"]`
  - `CHECK life02.doctor.flags-corrupt-journal VIOLATED doctor --json exit=0; no error- or warning-level finding names the journal problem; error/warning findings present: warning:policy.claude-ecc-skills`

  Code reading agrees: `runDoctor` (`src/core/doctor.ts`) never reads the state root's journals or writer lock.

## Leads (not reproduced)

- None beyond the root-cause notes attached to C1 and C6. Those notes explain reproduced gaps; they are not gaps in themselves.

## Observations

- **Claude cost-excluded legs.** Claude discovery (`claude -p ...`) and all four Claude canary legs spend a model turn. They are recorded "not executed (cost)" and belong to G-07-2 / REL-02 (D-10). A spending canary run is deferred (11-CONTEXT.md Deferred Ideas). No model turn was spent: the runner allowlist admits only `doctor --discovery <project>` and `doctor --canary <project> --no-spend`, and step 6/7 stderr lists every spend leg as announced, not run.
- **No-spend canary legs launch no harness.** All 10 declared canary/harness pairs spend (`CHECK life02.canary.spend-legs OBSERVED not executed (cost): ...`). The only no-spend canary work is the CAPA-03 handoff free legs: two handoffs, hermes source to codex target, each a COMPLETE unit with `nativeUse=discovered`, the sentinel recalled, and `.planning` byte-identical. For codex and pi, the read-only execution evidence comes from `doctor --discovery` (rows 5b and 5d). `life02.canary.codex.no-spend-execution` and `life02.canary.pi.no-spend-execution` are VIOLATED only in the canary-specific sense.
- **Harness-home drift, harness-native (`CHECK life02.harness-homes-unchanged OBSERVED harness-native drift in codex, hermes`).** Drifted entries in the committed run: `codex/logs_2.sqlite-shm`, `codex/models_cache.json`, `codex/sqlite`, `hermes/state.db-shm` (metadata-only drift lines in the transcript). Earlier runs drifted a subset of the same entries (`codex/logs_2.sqlite-shm`, `hermes/state.db-shm`). The codex entries come from the codex binary the discovery oracle launches. The hermes entry is consistent with the `hermes --version` probe or a running Hermes process. No alpha-AOS-managed child drifted, and the 17-target host guard is unchanged.
- **Excluded harness-home entries (not judged), each with its reason as written in the transcript note lines:**
  - Every root: `sessions` (session transcripts), `log`/`logs` (log output), `history.jsonl` (prompt history), `cache` (harness cache), where present.
  - claude: `projects`, `todos`, `shell-snapshots`, `statsig`, `debug`, `file-history`, `session-env`, `ide` (state the executing Claude Code session rewrites, where present).
  - codex: `.tmp` (scratch, thousands of transient entries), `tmp` and `thread-writer-locks` (lock files a running Codex holds open; EBUSY on read).
  - Credential material by name rule (auth, credential, token, oauth): codex/`auth.json`; claude/`.credentials.json`, `.credentials.lock`, `mcp-needs-auth-cache.json`; pi/`auth.json`; hermes/`auth.json`, `auth.lock`.
  - Credential material by explicit entry: hermes/`.env`, codex/`.sandbox-secrets`.
  - hermes/`hermes-agent`: the Hermes application install tree (about 137k entries), excluded because one fingerprint pass took more than 10 minutes on this host. It is a harness application, not an alpha-AOS-managed path.
  - `<home>/.claude.json` lies outside these roots and stays unfingerprinted, for the reason plan 11-01 records.

  No exclusion names an alpha-AOS-managed path. The probe throws before spawning anything if one does.
- **Redaction seam in the canary `--json` envelope** (`CHECK life02.canary.json-cycle-markers OBSERVED`): the envelope carries 21 `"[redacted:cycle]"` markers. A shared object that appears a second time is printed as the marker: the canary declaration selected for both claude and codex, and the handoff pair used by both handoff canaries. So `skipped[].selection` for codex and `handoffResults[1].pair` are unreadable in JSON. `rows[]` keeps harness and capability. The probe classifies legs from `rows[]` for this reason. This is not a LIFE-02 clause failure. It limits machine consumers of `skipped`/`handoffResults`.
- **Canary vault writes** (`CHECK life02.canary.vault-writes OBSERVED`): two canary runs wrote `.ecc/memory/project/.gitignore` and four `handoffs/mem_<id>.md` into the scratch clone. This is documented product behavior (help text: "leaves ONE memory in the project's own vault" per handoff). The real repository's porcelain is unchanged (`CHECK life02.repo-unchanged HOLDS`).
- **`repair` on a corrupt journal** plans `quarantine` (dry-run exit 0, `evidence/life02-status.txt` step 12). The repair plan itself is judged under LIFE-06 (plan 11-06).
- **Timing notes** (not judged beyond row 2): `doctor --discovery --json` took about 29-41 s and `doctor --canary --no-spend` about 8 s in the committed run. The packed CLI `status --json` wall median is 806.4 ms, dominated by Node startup and catalog/lock loading; in-process `getOfflineStatus` takes 2.35 ms.
