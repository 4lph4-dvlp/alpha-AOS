# Phase 11 Evidence

This directory holds the evidence behind `.planning/milestones/v0.1.0-phases/06-managed-lifecycle-uninstall-and-recovery/06-VERIFICATION.md`. Every verdict in that report cites a transcript here by file name and CHECK id. A reader can re-run the probe that wrote a transcript and compare the CHECK lines.

## Layout

```
evidence/
├── README.md                      this file: vocabulary, re-run recipe, findings template
├── probes/
│   ├── probe-lib.mjs              transcript writer, CHECK vocabulary, aliasing, sandbox containment, host guard
│   ├── life01-reconcile.mjs       LIFE-01 tracer: Codex idempotent reconcile through the packed CLI
│   ├── seed-selfcheck.mjs         five-harness prerequisite seeding self-check
│   ├── suites-and-ci.mjs          Phase 6 suites on this host + CI run 35818198049 per-OS log lines
│   └── <later probes>.mjs         one per LIFE cluster (plans 11-02..11-06)
├── life01-codex-reconcile.txt     transcript written by life01-reconcile.mjs
├── seed-selfcheck.txt             transcript written by seed-selfcheck.mjs
├── suites-local.txt               transcript written by suites-and-ci.mjs (local suites)
├── ci-35818198049-lifelines.txt   transcript written by suites-and-ci.mjs (CI corroboration)
└── LIFE-0N-findings.md            per-requirement findings (plans 11-02..11-06)
```

The packed-release mechanics (pack, install, seed, fingerprint) live in `test/helpers/packed-sandbox.ts`. Probes import its compiled form `dist/test/helpers/packed-sandbox.js`, so the CI lifecycle test in `test/tarball-fixture.test.ts` and these probes share one implementation.

## Transcript vocabulary

Every Phase 11 probe writes this format through `probe-lib.mjs`. Nothing else writes a transcript.

- Header lines: `probe: <id>`, `head: <40-hex>`, `dirty-tracked: <count of git status --porcelain lines, untracked excluded>`, `node: <version>`, `npm: <version>`, `platform: <process.platform> <process.arch>`, `tarball-sha256: <64-hex or n/a>`, `started: <ISO date>`.
- Step block: `## step <n>: <label>`, `$ <aliased command line>`, `env-overrides: <names only, comma-separated, or none>`, `exit: <code>`, `duration-ms: <n>`, `--- stdout (<bytes>B sha256=<12-hex>) ---`, aliased stdout (first 65536 bytes, then `[truncated: <n> bytes total]`), `--- stderr (<bytes>B sha256=<12-hex>) ---`, aliased stderr.
- Fingerprint comparison line: `fingerprint <label>: <12-hex before> -> <12-hex after>` followed by the `describeHostDrift` lines when they differ.
- Check line: `CHECK <check-id> <OUTCOME> <detail>` with OUTCOME one of `HOLDS` (the clause behavior was observed as required), `VIOLATED` (observed behavior contradicts the clause: a gap reproduction), `NOT-OBSERVED` (environment prevented observation; detail names why), `OBSERVED` (neutral fact).
- Host guard lines: `host-guard: unchanged (<n> targets)` on success; on drift the literal marker `HOST-DRIFT` followed by the drift description, and the process exits 3.
- Footer: `RESULT: holds=<n> violated=<n> not-observed=<n> observed=<n>`.
- Aliases (longest match first, case-insensitive on win32, applied to both the plain and the JSON-escaped double-backslash form and to forward-slash form): sandbox root to `<sandbox>`, repository root to `<repo>`, `os.homedir()` to `<home>`, `os.tmpdir()` to `<tmp>`.
- Exit codes: 0 completed (whatever the outcomes), 1 probe error or zero CHECK lines, 3 host drift.

Additional lines a probe may write: `note: <text>` (context such as what was seeded and why a root is excluded), `PROBE-ERROR: <message>` (the probe itself failed; the process exits 1). A second sandbox in one probe is aliased `<sandbox-2>`, a third `<sandbox-3>`, and the pack scratch directory `<pack>`.

Rules the vocabulary enforces:

- CHECK lines are written in step execution order. Each check id appears exactly once per transcript (`check()` throws on a duplicate or an outcome outside the four words).
- CHECK details carry no timing, temp path or hash that varies between runs, so a re-run can be compared line-for-line.
- A step that could not run for an environmental reason is `NOT-OBSERVED` with the verbatim output, never `HOLDS`.
- A transcript with zero CHECK lines is a probe error (exit 1), not a completed run.
- Transcripts contain CLI output, exit codes, durations and metadata (path, kind, size, hash prefix). They never contain file contents or environment variable values; `env-overrides` lists names only. Any 64-hex value inside verbatim CLI output is a lock or repository-owned digest the CLI prints itself, not a digest of a user file.

## Safety

- Sandbox containment: `runCli` refuses to spawn unless `HOME`, `USERPROFILE`, `APPDATA`, `LOCALAPPDATA`, `XDG_CONFIG_HOME`, `ALPHA_AOS_STATE_DIR`, `CODEX_HOME`, `CLAUDE_CONFIG_DIR`, `ANTIGRAVITY_CONFIG_DIR`, `PI_CODING_AGENT_DIR`, `HERMES_HOME` and `npm_config_prefix` all resolve inside the sandbox root, and every path-valued override and the working directory do too.
- Host guard: `withHostGuard` fingerprints the real host state root, the eight `hostMutationTargets` of the CI lifecycle test, `<home>/.agents/skills/alpha-aos-control/SKILL.md`, the Claude skill files for the three ECC skills plus `alpha-aos-control` and `alpha-aos-ship`, the Pi `mcp.json`, the Hermes `config.yaml` and the Antigravity `mcp_config.json`, before and after the probe. `<home>/.claude.json` is not a target: the executing Claude Code session rewrites it continuously.

## Re-run recipe (D-17)

```bash
npm run build
node .planning/phases/11-managed-lifecycle-verification/evidence/probes/<probe>.mjs --out <scratch file>
diff <(grep '^CHECK' .planning/phases/11-managed-lifecycle-verification/evidence/<transcript>.txt) <(grep '^CHECK' <scratch file>)
```

`--out <path>` writes the transcript to a scratch file and leaves the committed transcript untouched. A probe that writes more than one transcript (`suites-and-ci.mjs`) takes `--out-dir <dir>` instead and writes each transcript under its committed file name into that directory. `--keep` keeps the sandbox directories for inspection. `ALPHA_AOS_P11_TARBALL=<path>` reuses an existing tarball instead of packing (its path is aliased to `<pack>`). The diff prints nothing when the evidence reproduces.

## Findings file template (`LIFE-0N-findings.md`)

Plans 11-02..11-06 write one findings file per requirement with exactly these headings, in this order:

```markdown
## Contract

<the verbatim LIFE-0N text from .planning/milestones/v0.1.0-REQUIREMENTS.md>

## Clauses

| # | Clause | Evidence | Oracle audit (D-04) | Result |
|---|--------|----------|---------------------|--------|
| 1 | ... | <transcript path + CHECK id, test name, or CI job id> | <does the assertion actually test the clause?> | HOLDS / VIOLATED / NOT-OBSERVED / UNEVIDENCED |

## Core clause

<which clause is the core promise, and its result>

## Provisional verdict

<VERIFIED | PARTIAL | GAP> (D-02): <one line of reasoning>

## Gap candidates

### LIFE-0N/C<k>

- clause: <the LIFE clause that fails>
- missing: <what is missing>
- close condition: <what would close it>
- reproduction: <the command, the transcript path, the CHECK id, and the observed lines quoted verbatim>

## Leads (not reproduced)

<suspicions from code reading that no probe reproduced (D-06); they are not gaps>

## Observations

<neutral facts worth recording>
```

Failing reproductions live only in these findings files and in transcripts, never in `test/` (D-12): a failing test would turn `main` red. Only passing oracle-strengthening assertions are committed as tests.
