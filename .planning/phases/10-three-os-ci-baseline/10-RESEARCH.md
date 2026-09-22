# Phase 10: Three-OS CI Baseline - Research

**Researched:** 2026-09-23
**Domain:** Cross-platform Node.js test hygiene (path semantics, test-process isolation of host state), GitHub Actions evidence capture
**Confidence:** HIGH (both red legs reproduced locally this session; root cause of CI-02 reproduced with the exact CI signature)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### CI-02 root-cause taxonomy
- **D-01:** The root-cause classification has **three** classes, not two: `product isolation leak` (alpha-AOS product code ignores the sandbox env and writes the real home), `test-oracle defect` (the snapshot/assertion itself is wrong), and `test-isolation leak` (a different test file, running in parallel under `node --test`, writes the real host `~/.alpha-aos` during the fixture's snapshot window). This phase updates the CI-02 wording in `.planning/REQUIREMENTS.md` and Phase 10 success criterion 3 in `.planning/ROADMAP.md` to name all three classes.
- **D-02:** If the cause is a **test-isolation leak**, fix the leaking test itself (redirect `ALPHA_AOS_STATE_DIR` / home / harness roots into its own sandbox). The `hostSnapshot()` assertion in `test/tarball-fixture.test.ts` stays unchanged. Do not serialize the fixture or add a suite-wide host guard as the fix.
- **D-03:** If the cause is a **product isolation leak**, fix the discovered path **and** audit `src/` for the same pattern (for example direct `homedir()` / default-root resolution that bypasses `ALPHA_AOS_STATE_DIR` or the harness env overrides) and fix every instance found. Each fixed instance gets regression coverage. — **Reversibility:** costly — the audit may touch many path-resolution call sites across `src/core/`.
- **D-04:** If the cause is a **test-oracle defect**, an assertion change is allowed after the evidence is recorded (D-07) and goes through normal commit review. No separate user approval checkpoint is needed. The change may only make the oracle more *precise*, never narrower in what host mutation it catches. `~/.alpha-aos` stays in `hostMutationTargets`.

#### CI-02 evidence collection
- **D-05:** Reproduce locally on the Windows developer host first. In the same work, improve the fingerprint failure output so that a mismatch reports *which* entries changed (relative path, kind, size, per-entry hash), not just two opaque hashes. After that, a future CI failure can be diagnosed from the log alone. Never print file contents, because they may carry secrets.
- **D-06:** If local reproduction fails, push temporary instrumentation to a separate branch and run the Windows leg with `workflow_dispatch` to collect evidence. The instrumentation is **not** merged to `main`. Do not upload the host `~/.alpha-aos` tree as a CI artifact.
- **D-07:** Record the root cause in a `.planning/debug/` session file, following the existing `.planning/debug/*.md` convention. The record gives the classification, the bytes and entries that changed, which lifecycle step (or which foreign test) wrote them, and the evidence that decided it. Phase 11 (LIFE-03/LIFE-04 verdicts) references this file.
- **D-08:** The regression test for the diagnosed cause must be observed **failing against the unfixed code** and passing against the fix (success criterion 4). Record the red observation (command plus output excerpt) in the debug file.

#### CI-01 path-literal guard
- **D-09:** Enforce the rule with a source-scanning test. It reads `test/*.ts` and fails when it finds a platform-specific absolute path literal (drive-letter `X:\…` or POSIX home/root paths such as `/Users/…`, `/home/…`) used in an assertion expectation. An intentional use is allowed only with an inline marker comment on that line that states the reason. A new violation fails on every OS.
- **D-10:** Guard scope is **assertion-bound literals only**, matching the CI-01 wording: literals that are compared against a path produced by host path operations (`join`/`resolve`/product path functions). Opaque input data, such as redaction sample strings, win32 path-parsing inputs, or literals fed to `path.win32`/`path.posix` explicitly, is out of scope and does not need a marker. There are currently about 51 absolute-path literal hits across 14 test files. Most are expected to be inputs, not violations.
- **D-11:** `destinationFor` test fixture roots (the custom root, fake home, and fake env roots) are built with `join(tmpdir(), …)`. These are string-only paths; no files are created.

#### CI-03 proof run and record
- **D-12:** The accepted proof is the `main` **push-triggered** CI run for the fix commit(s). A `workflow_dispatch` run is not accepted as the proof.
- **D-13:** If a leg is red only because of a transient upstream fault in the three registry-touching MCP tests (`ALPHA_AOS_REQUIRE_UPSTREAM_MCP=1`), record the failure cause and use GitHub **"Re-run all jobs"** on the same run. That is accepted when all three legs are green in one attempt. Record the run id together with the attempt number. Re-running only the failed jobs is never accepted.
- **D-14:** Record the green proof in `.planning/phases/10-three-os-ci-baseline/CI_RUN.md`, following the Phase 7 `CI_RUN.md` convention: run id, attempt, commit SHA, and per-leg conclusion, retrieved with `gh run view` rather than transcribed. Reference it from `10-VERIFICATION.md`.

### Claude's Discretion
- Whether to bisect the Windows failure across 638d3cc (last green) .. f1ca570 (first red) to establish when it began, as a supporting line of evidence.
- The exact marker syntax for D-09 exceptions and the literal-detection heuristic.
- Plan split (CI-01 and CI-02 are independent and may be separate plans or waves).

### Deferred Ideas (OUT OF SCOPE)
- Suite-wide host-path guard in `scripts/run-tests.mjs` (snapshot of real host roots before and after the entire suite). This was considered as a stronger backstop for test-isolation leaks and deferred as scope growth. It is a candidate for a later hardening phase.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CI-01 | ubuntu/macOS `destinationFor resolves destinations across all five harnesses` passes with host-path fixture roots; no test asserts against a platform-specific absolute path literal | Root cause reproduced on WSL (Finding 1). Guard heuristic prototyped against the real `test/` tree: exactly 8 violations in 2 files (Finding 2). `ecc-skills.test.ts:75-80` is a second violation that passes on POSIX today only by accident, and the guard will flag it. |
| CI-02 | Windows packed lifecycle leaves every real host managed path byte-identical; root cause classified, recorded, pinned by a regression test | Classified as a **test-isolation leak** (D-01 class 3). `test/mcp-proxy.test.ts` pinned-upstream startup tests write the npx cache into the real `~/.alpha-aos/mcp-cache/npm-cache`. Reproduced locally with the exact CI signature; the fixture run alone writes nothing (Findings 3-6). Two more leaking files, `gate-engine` and `gate-lifecycle`, belong to the same class. |
| CI-03 | One `main` push run id green on all three legs | `gh run view --json attempt,headSha,event,conclusion,jobs` returns every field that D-14 needs (verified). Use `gh run rerun <id>` without `--failed` for D-13 (Finding 8). |
</phase_requirements>

## Project Constraints (from AGENTS.md)

No `CLAUDE.md` exists. `AGENTS.md` is the project instruction file. Directives that apply to this phase:

- Node.js `>=24.0.0`, npm `>=10.0.0`, Git. The toolchain is locked. **No new dependencies are needed or allowed**, because `typescript@5.9.3` is already a devDependency.
- TypeScript style: double quotes, semicolons, trailing commas, 2-space indent, explicit relative imports with `.js` extensions, and no path aliases.
- Preserve the `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` and `esModuleInterop` settings in `tsconfig.json`.
- Tests use `node:test` with `node:assert/strict`. They compile to `dist/test/` and run through `scripts/run-tests.mjs`. The runner enumerates only top-level `dist/test/*.test.js`, so helpers live in `test/helpers/` and are never mistaken for suites.
- Comments stay sparse. Use them only for non-obvious policy or safety constraints.
- **Safety:** mutations must be root-bounded, and stale evidence never triggers automatic deletion. Do not delete the developer's real `~/.alpha-aos/mcp-cache`, even though earlier test runs probably polluted it.
- **Secrets:** credential values must not enter diagnostics. D-05 already forbids printing file contents.
- **Validation:** real invocation is required, not configuration presence. The memory rule "verification은 직접 실행" also applies: the executor runs the repro and CI checks itself rather than handing them to the user.
- GSD workflow enforcement: work happens inside `$gsd-execute-phase`.

## Summary

**CI-01 is a pure test defect in `test/owned-skills.test.ts:52-53`.** The test sets `const custom = "C:\\test\\custom-root"`, and `destinationFor()` (`src/core/owned-skills.ts:54`) calls `resolve(customHome)`. On POSIX a drive-letter string is relative, so `resolve` prefixes the cwd. The result is `'/home/runner/work/alpha-AOS/alpha-AOS/C:\\test\\custom-root/skills/my-skill/SKILL.md'` against the expected `'C:\\test\\custom-root/skills/my-skill/SKILL.md'`. This failure was reproduced this session on the developer host's WSL Arch distro, byte-for-byte the same as the CI ubuntu log. The literal was introduced by c36f380, which is inside the 638d3cc..f1ca570 red window. A TypeScript-AST prototype of the D-09/D-10 guard flags exactly 8 literals: 5 in `owned-skills.test.ts` and 3 in `ecc-skills.test.ts`. The `ecc-skills` literals pass on POSIX today only because `globalEccSkillRoot` uses `join` without `resolve`, but they are the same defect class and must be converted in the same plan.

**CI-02 is a test-isolation leak, not a product leak and not an oracle defect.** `test/mcp-proxy.test.ts` has three tests that launch the pinned upstream servers: "the context7/exa/firecrawl proxy starts…". They build the child environment through `upstreamEnvironmentPolicy()`. That function calls `proxyCacheRoot()` with no argument, which resolves `userStateRoot()`. The test file never sets `ALPHA_AOS_STATE_DIR`, so npx downloads the MCP packages into the **real host** `~/.alpha-aos/mcp-cache/npm-cache` (`_npx`, `_cacache`, `_update-notifier-last-checked`), about 20,000 entries on a cold cache. On windows-latest those cold downloads take 38-116 s each. In run 35762417138 the firecrawl startup (17:45:36.6 to 17:47:32.4) overlapped the start of the packed-lifecycle fixture (17:47:05.5 to 17:49:35.3) by about 27 s. In the last green Windows run (35662102311) the gap was 47 s with no overlap. The local reproduction ran `mcp-proxy.test.js` and `tarball-fixture.test.js` concurrently against one redirected home. It failed with the exact CI signature: only `.alpha-aos` changes hash, and all seven other targets stay `absent`. The fixture run alone passed and wrote nothing. Two more files write the real host state root through `writeGateReceipt`, which hard-codes `stateRoot: userStateRoot()`: `gate-engine.test.ts` (direct call) and `gate-lifecycle.test.ts` (spawned CLI `gate check`). They did not overlap in the failing run, but they are the same class and must be fixed.

**The Windows onset is not in 638d3cc..f1ca570.** The Windows leg was green on f1ca570, 92b0de7 and f5bb05f, and first red on c6415a2, the only CI run after f5bb05f. None of the code changes between f5bb05f and c6415a2 touches `mcp-proxy`, `gate-*` or the fixture. The onset is a scheduling and network-latency race: firecrawl cold startup took 63 s in the green run and 116 s in the red one. **A bisect is not useful**, because the leak predates the window (4cf9eaa, Phase 03-02) and the failure depends on timing.

**Primary recommendation:** Run two independent Wave-1 plans. The CI-01 plan adds a TS-AST guard and converts the owned-skills and ecc-skills fixtures to `join(tmpdir(), …)`. The CI-02 plan adds per-entry fingerprint diagnostics, reproduces locally on a redirected home, writes the debug record, adds RED regression tests, and then redirects the state root in the three leaking test files. A Wave-2 plan pushes to `main`, captures the green run with `gh run view`, and writes `CI_RUN.md`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Host-path-independent fixture roots (CI-01) | Test suite (`test/*.test.ts`) | — | `destinationFor` already takes explicit `env`/`home`/`customHome`, so the defect and the fix are both test-side (D-11). |
| Path-literal guard (CI-01) | Test suite (new `test/*.test.ts` plus a `test/helpers/` scanner) | Dev toolchain (`typescript` compiler API) | A source scan over `test/*.ts` runs on every OS leg (D-09). |
| Host-state isolation of leaking tests (CI-02) | Test suite (`mcp-proxy`, `gate-engine`, `gate-lifecycle` tests) | — | D-02 says to fix the leaking test. The product honors `ALPHA_AOS_STATE_DIR` via `userStateRoot()`. |
| Oracle diagnostics (D-05) | Test suite (`test/tarball-fixture.test.ts` `fingerprint`/`hostSnapshot`) | — | Reporting only. The comparison stays unchanged (D-02/D-04). |
| Root-cause record (D-07) | Planning docs (`.planning/debug/*.md`) | — | Phase 11 consumes it. |
| Proof run (CI-03) | CI (`.github/workflows/ci.yml`, unchanged) | `gh` CLI | D-12/D-14. The workflow file needs no edit. |

## Evidence Collected This Session

### Finding 1 — CI-01 reproduced on a local POSIX leg (WSL)
`[VERIFIED: local run]` In WSL Arch (Node v26.8.2) the command `node --test --test-name-pattern="destinationFor resolves" dist/test/owned-skills.test.js` produced:
```
+ '/mnt/d/dev/alpha-AOS/C:\\test\\custom-root/skills/my-skill/SKILL.md'
- 'C:\\test\\custom-root/skills/my-skill/SKILL.md'
```
The CI ubuntu log for run 35762417138 is identical except for the cwd prefix: `+ '/home/runner/work/alpha-AOS/alpha-AOS/C:\\test\\custom-root/skills/my-skill/SKILL.md'`.

The cause is quoted verbatim from `[VERIFIED: src/core/owned-skills.ts:52-57]`:
```ts
export function destinationFor(target: HarnessId, id: string, customHome?: string, env: NodeJS.ProcessEnv = process.env, home = homedir()): string {
  if (customHome) {
    return join(resolve(customHome), "skills", id, "SKILL.md");
  }
  return join(globalEccSkillRoot(target, env, home), id, "SKILL.md");
}
```
The literal came in with c36f380 (`git log -G'custom-root'`), which is inside the red window 638d3cc..f1ca570. WSL is therefore a usable local POSIX observation route. It runs Node 26, not 24, so the authoritative POSIX evidence is still the CI legs.

### Finding 2 — Guard heuristic prototyped against the real tree
`[VERIFIED: local run of a scratchpad prototype using typescript@5.9.3 compiler API]` The heuristic flags a string literal when it matches a platform-absolute pattern **and** reaches an unqualified host path call. That means either (a) the literal is a direct argument to `join`/`resolve`/`normalize`/`relative`/`dirname`/`basename` (or `path.<fn>`), or (b) the literal initializes a `const` identifier that is later passed to one of those calls. Calls through `path.win32.*`/`path.posix.*` are excluded (D-10). The prototype output against today's tree:
```
ecc-skills.test.ts:76 "C:\\profiles\\claude" via direct host-path arg
ecc-skills.test.ts:75 "C:\\Users\\fixture" via binding home
ecc-skills.test.ts:79 "C:\\profiles\\antigravity" via direct host-path arg
owned-skills.test.ts:53 "C:\\test\\custom-root" via binding custom
owned-skills.test.ts:69 "C:\\env\\claude" via direct host-path arg
owned-skills.test.ts:59 "C:\\Users\\fakeuser" via binding fakeHome
owned-skills.test.ts:77 "C:\\env\\gemini" via direct host-path arg
owned-skills.test.ts:85 "C:\\env\\hermes" via direct host-path arg
total 8
```
A plain grep finds 58 absolute-literal hits across 14 files. The heuristic flags 8 of them and leaves the rest alone as inputs, which is what D-10 predicts. Examples of what it correctly leaves alone:
- redaction samples (`redaction.test.ts:382`)
- env passthrough values (`process.test.ts:623-636`, `tree-inspect.test.ts:17-34`)
- win32-only case-folding inputs (`tree-policy.test.ts:136-140`)
- echoed command strings (`tree-classify.test.ts:262-268`)
- product inputs (`isolation.test.ts:106-124`, `shims.test.ts:91,162-164`, `project-plan.test.ts` `/tmp/...`)

Line 52 of the current source is the `test(...)` header. Line 53 holds the literal.

### Finding 3 — The CI-02 writer: `mcp-proxy.test.ts` upstream startups write the real `~/.alpha-aos`
The code chain is quoted verbatim:
- `[VERIFIED: src/core/paths.ts:93-97]`
  ```ts
  export function userStateRoot(): string {
    const override = process.env.ALPHA_AOS_STATE_DIR?.trim();
    if (override) return resolve(override);
    return join(homedir(), ".alpha-aos");
  }
  ```
- `[VERIFIED: src/core/mcp-proxy.ts:199-201]` `export function proxyCacheRoot(stateRoot: string = userStateRoot()): string {` / `  return join(stateRoot, "mcp-cache");`
- `[VERIFIED: src/core/mcp-proxy.ts:226-230,246]` `export function upstreamEnvironmentPolicy(` … `  source: NodeJS.ProcessEnv = process.env,` … `  const writeRoot = proxyCacheRoot();` … `      npm_config_cache: join(writeRoot, "npm-cache"),`. The write root comes from the **ambient** `process.env`, not from `source`.
- `[VERIFIED: test/mcp-proxy.test.ts:702-716]` `startPinnedServer(fixture, server, source = process.env)` builds `environment: upstreamEnvironmentPolicy(server, source)`. The three startup tests (`:812`, `:824`, `:834`) never set `ALPHA_AOS_STATE_DIR`. Only the later test "a proxy launch writes nothing into the user's home" (`:932-972`) redirects it, for itself.

Per-file probe `[VERIFIED: local run]`. Each of the 52 compiled test files ran alone with `USERPROFILE`/`HOME` redirected to a fresh scratch home and `ALPHA_AOS_STATE_DIR`/harness roots unset. The home was never the real one. The results:

| Test file | Entries written under redirected home | Paths |
|-----------|---------------------------------------|-------|
| `mcp-proxy.test.js` (36/36 pass) | 20,447 | `.alpha-aos/mcp-cache/npm-cache/{_npx (18,116), _cacache (2,328), _update-notifier-last-checked}` |
| `gate-lifecycle.test.js` (pass) | 9 | `.alpha-aos/journal/*.json` (3), `.alpha-aos/snapshots/*` (3) |
| `gate-engine.test.js` (9/9 pass) | 5 | `.alpha-aos/journal/*.json` (1), `.alpha-aos/snapshots/*` (1) |
| `capability-oracle.test.js` | 7 | `.alpha-aos/mcp-cache/npm-cache` (empty dirs) and `.pi/agent/{auth.json,models-store.json}`. This is a **dev-host-only** observation: the `pi`/`codex` binaries are on this host's PATH, and 6 tests failed under the redirect. Not attributed to one test. |
| `preview.test.js` | 4 | `AppData/Local/Microsoft/PowerShell` (pwsh startup cache; not an alpha-AOS managed path) |
| `tarball-fixture.test.js` (pass, 109 s) | **0** | — |
| all 46 others | 0 | — |

### Finding 4 — Exact CI signature reproduced locally
`[VERIFIED: local run]` The reproduction command was `node --test --test-concurrency=2 dist/test/mcp-proxy.test.js dist/test/tarball-fixture.test.js` with one shared redirected home and `ALPHA_AOS_REQUIRE_UPSTREAM_MCP=1`. Result: `tests 43 / pass 42 / fail 1`. The failure was `packed release completes the isolated install, reconcile, diagnose, and uninstall lifecycle`, with `AssertionError: the packed lifecycle must not change any real managed host path`. Only `<home>\.alpha-aos` changed (`6b9fc8df…` → `d143f8be…`), and all seven other targets stayed `'absent'`. After the run the home contained only `.alpha-aos/mcp-cache/npm-cache/{_cacache,_npx,_update-notifier-last-checked}`. That signature matches run 35762417138 exactly:
```
+   'C:\\Users\\runneradmin\\.alpha-aos' => 'cc1257172fc970d1a7cb26f8a75f6fc66bd6e7e7e6b029fba86fa8299ca56546',
-   'C:\\Users\\runneradmin\\.alpha-aos' => 'c0ec2afd7f1ff1012fd32bd2ed635caa78c05bd7159611023c8ee3e583f12c4d',
```
The "before" hash was not `absent` on CI either. Earlier writers (gate tests, context7/exa startups) had already created `~/.alpha-aos` before the fixture's snapshot.

### Finding 5 — CI timing: the overlap is present in the red run and absent in the green run
`[VERIFIED: gh run view --job … --log]` Test completion timestamps are streamed. Start = end − the reported duration.

| Run | Leg | firecrawl startup (start→end) | packed lifecycle fixture (start→end) | Overlap |
|-----|-----|------------------------------|--------------------------------------|---------|
| 35762417138 (c6415a2, red) | windows | 17:45:36.6 → 17:47:32.4 (115.8 s) | 17:47:05.5 → 17:49:35.3 (149.8 s) | **~27 s** |
| 35662102311 (f5bb05f, green) | windows | 22:23:20.8 → 22:24:24.0 (63.2 s) | 22:25:11.4 → 22:26:47.4 (96.0 s) | none (47 s gap) |
| 35762417138 | ubuntu | 17:43:23.0 → 17:43:30.2 (7.3 s) | 17:44:05.0 → 17:44:22.0 (17.0 s) | none |
| 35762417138 | macos | 17:43:47.2 → 17:43:55.0 (7.8 s) | 17:45:12.1 → 17:45:47.8 (35.7 s) | none |

There is corroborating evidence that the npx cache lives in the real host root. In green run 35662102311 the `npm test` step's context7 startup was cold (32.6 s), while the later `Safety boundary suites` step's startup was warm (1.9 s). The cache survived between steps. Every `createProxyFixture` root is a fresh `mkdtemp`, so the only persistent location is `userStateRoot()/mcp-cache` on the real runner home.

### Finding 6 — Onset: the Windows red began at c6415a2, not in 638d3cc..f1ca570
`[VERIFIED: gh run list / gh run view]`
| Run | SHA | ubuntu | macos | windows |
|-----|-----|--------|-------|---------|
| 35498899974 | 638d3cc | success | success | success |
| 35558021216 | f1ca570 | failure (npm test) | failure | **success** |
| 35566562841 | 92b0de7 | failure | failure | **success** |
| 35662102311 | f5bb05f | failure | failure | **success** |
| 35762417138 | c6415a2 | failure | failure | **failure** |

`git diff --stat f5bb05f c6415a2` touches `src/adapters/isolation.ts`, `src/core/canary.ts`, `src/core/support-matrix.ts`, `test/isolation.test.ts`, `test/provenance.test.ts` and `test/support-matrix.test.ts`. None of these is on the writer path. The leak predates all of them: `git log -S` puts the three startup tests at 4cf9eaa (Phase 03-02), `writeGateReceipt(root, receipt)` at 3f77c5f (Phase 04-02), and the fixture at f15ad5c (Phase 07-01). **Recommendation for the discretion item: do not bisect.** The failure depends on timing, so a bisect would measure latency, not code. Record the onset table above in the debug file instead.

### Finding 7 — Gate receipts: a second write path into the host state root
- `[VERIFIED: src/core/gate-receipt.ts:106-108]` `const journal = await applyFileTransaction({` / `    stateRoot: userStateRoot(),` / `    allowedRoots: [join(projectRoot, ".alpha-aos")],`. `writeGateReceipt(projectRoot, receipt)` has **no** `stateRoot` option, unlike every other writer (`options.stateRoot ?? userStateRoot()` in `mcp.ts:608`, `owned-skills.ts:160`, `install.ts:566`, and elsewhere).
- `test/gate-engine.test.ts:184` calls `writeGateReceipt(root, receipt)` directly with no redirect.
- `[VERIFIED: test/gate-lifecycle.test.ts:20]` `const probeEnv = commandProbeEnvironment({ source: process.env });` is the environment of the spawned `dist/src/cli.js gate check`. `[VERIFIED: src/core/process.ts:922-958]` `commandProbeEnvironment` passes `"HOME"` and `"USERPROFILE"` through and does **not** list `ALPHA_AOS_STATE_DIR`. The CLI child therefore always resolves the real home, even if the test sets `process.env.ALPHA_AOS_STATE_DIR`. The fix must add a `literal` entry (the `EnvironmentPolicy.literal` map is `Readonly<Record<string, string>>`, `[VERIFIED: src/core/process.ts:32-44]`).

Classification rationale (D-01): the product is correct under its contract, because `userStateRoot()` honors `ALPHA_AOS_STATE_DIR`. The released lifecycle run alone writes nothing (Finding 3). The oracle is right: the bytes really did change on the real host. The writer is a different test file running concurrently. This is **class 3, test-isolation leak**, so D-02 applies and D-03's `src/` audit is **not triggered**. The `writeGateReceipt` missing-option observation is recorded under Open Questions as a hardening candidate. It is not in this phase's scope.

### Finding 8 — CI-03 tooling
`[VERIFIED: gh 2.100.0 local]` `gh run view <id> --json attempt,headSha,event,conclusion,databaseId,url,jobs` returns `attempt`, `event`, and per-job `name`/`conclusion`/`databaseId`. `gh run rerun <id>` re-runs **all** jobs. `--failed` re-runs only failed jobs, which D-13 forbids. `gh run view <id> --attempt <n> --json …` reads a specific attempt.

## Standard Stack

### Core (already present — no installs)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `node:test` + `node:assert/strict` | Node 24 (CI), 24.13.1 local | Test framework | Project convention (AGENTS.md) |
| `typescript` compiler API (`ts.createSourceFile`, `ts.forEachChild`, `ts.isStringLiteralLike`, `ts.isCallExpression`) | 5.9.3 (devDependency) `[VERIFIED: node -e require('typescript/package.json').version]` | AST-based path-literal guard | A real parser avoids regex false positives from comments, strings inside strings, and multiline calls. It is already installed by `npm ci` on every leg. `esModuleInterop: true` allows `import ts from "typescript";`. |
| `node:os` `tmpdir()` / `homedir()`, `node:path` `join` | built-in | Host-native fixture roots | D-11 |
| `gh` CLI | 2.100.0 | Run evidence retrieval (D-14) | Already used in Phase 1/7 records |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| TS AST scanner | Regex line scan (the existing convention in `process.test.ts:584`, `install.test.ts:437`) | Regex cannot tell "argument of `join`" from "argument of a product function" or follow a `const` binding. That produces either too many markers or missed violations. Keep regex only for the literal *pattern*. |
| Per-file `mkdtemp` state root for `mcp-proxy.test.ts` | A stable `join(tmpdir(), "alpha-aos-test-mcp-proxy-state")` | `mkdtemp` is cleanest, but it makes the three startups cold in **both** CI test steps. On windows that adds about 3.5 min, and every cold fetch is extra exposure to the registry faults D-13 has to absorb. A stable tmp path keeps the second step warm and never touches the host. **Recommend the stable tmp path.** |

**Installation:** none.

## Package Legitimacy Audit

No external packages are installed in this phase. `typescript@5.9.3` is an existing, lock-pinned devDependency and is not newly introduced.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| (none new) | — | — | — | — | — | — |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram (CI-02 failure mechanism and fix)

```
node scripts/run-tests.mjs  ──► node --test (process isolation, concurrency = availableParallelism-1)
      │
      ├── worker A: mcp-proxy.test.js
      │     startPinnedServer("firecrawl")
      │        └─► upstreamEnvironmentPolicy() ─► proxyCacheRoot() ─► userStateRoot()
      │               ALPHA_AOS_STATE_DIR unset ─► <REAL HOME>/.alpha-aos/mcp-cache/npm-cache
      │                                             ▲  npx writes _npx/_cacache (cold: 38–116 s on windows)
      │                                             │
      ├── worker B: tarball-fixture.test.js          │  overlap window (27 s in run 35762417138)
      │     hostSnapshot() BEFORE ───────────────────┤
      │     install ─► reconcile ─► status/doctor ─► uninstall --purge   (all inside sandbox: writes 0 host bytes)
      │     hostSnapshot() AFTER ────────────────────┘  ─► hash(~/.alpha-aos) differs ─► assert.deepEqual FAILS
      │
      └── (earlier) gate-engine / gate-lifecycle ─► writeGateReceipt ─► applyFileTransaction(stateRoot: userStateRoot())
                                                     ─► <REAL HOME>/.alpha-aos/journal, snapshots

FIX (D-02): each leaking file sets its own state root BEFORE any call that resolves userStateRoot():
      mcp-proxy.test.ts   process.env.ALPHA_AOS_STATE_DIR = <tmp test state>      (module scope; per-process)
      gate-engine.test.ts process.env.ALPHA_AOS_STATE_DIR = <scratch>/state        (per test, restored in after())
      gate-lifecycle.test.ts CLI child env literal { ALPHA_AOS_STATE_DIR: <scratch>/state }
```

### Recommended Plan / File Structure
```
test/
├── helpers/path-literal-scan.ts      # NEW: pure scanner (source text -> violations); no fs, unit-testable
├── path-literal-guard.test.ts         # NEW: self-tests on inline samples + scan of test/*.ts == []
├── owned-skills.test.ts               # EDIT: lines 52-86 roots from join(tmpdir(), ...)
├── ecc-skills.test.ts                 # EDIT: lines 74-81 roots from join(tmpdir(), ...)
├── tarball-fixture.test.ts            # EDIT (D-05): manifest-based fingerprint + per-entry diff message
├── mcp-proxy.test.ts                  # EDIT (D-02): module-scope state-root redirect + regression test
├── gate-engine.test.ts                # EDIT (D-02): state-root redirect + regression assertion
└── gate-lifecycle.test.ts             # EDIT (D-02): CLI child env literal + regression assertion
.planning/debug/ci02-windows-alpha-aos-host-leak.md   # NEW (D-07/D-08)
.planning/REQUIREMENTS.md, .planning/ROADMAP.md       # EDIT (D-01 wording: three classes)
.planning/phases/10-three-os-ci-baseline/CI_RUN.md    # NEW (D-14)
```

Suggested split (Claude's discretion). The file sets do not overlap, so these can run in parallel:
- **Plan 10-01 (Wave 1, CI-01):** scanner, guard test, owned-skills and ecc-skills conversion.
- **Plan 10-02 (Wave 1, CI-02):** D-05 diagnostics, local repro with per-entry output, debug record, RED regression tests, fixes for the 3 files, D-01 wording updates.
- **Plan 10-03 (Wave 2, CI-03):** push, observe the push-triggered run, `CI_RUN.md`, and the `10-VERIFICATION.md` reference.

### Pattern 1: Host-native fixture roots (CI-01, D-11)
```ts
// Replace Windows literals; strings only — nothing is created on disk.
const base = join(tmpdir(), "alpha-aos-destination-fixture");
const custom = join(base, "custom-root");
const fakeHome = join(base, "home");
const fakeEnv: NodeJS.ProcessEnv = {
  CLAUDE_CONFIG_DIR: join(base, "env", "claude"),
  CODEX_HOME: join(base, "env", "codex"),
  ANTIGRAVITY_CONFIG_DIR: join(base, "env", "gemini"),
  HERMES_HOME: join(base, "env", "hermes"),
};
assert.equal(destinationFor("claude", "test-skill", undefined, fakeEnv, fakeHome),
  join(fakeEnv.CLAUDE_CONFIG_DIR!, "skills", "test-skill", "SKILL.md"));
```
Under `noUncheckedIndexedAccess`, `fakeEnv.X` is `string | undefined`. Prefer named consts (`const claudeRoot = join(base, "env", "claude")`) over `!`.

### Pattern 2: AST path-literal scanner (D-09/D-10)
```ts
// Source: typescript compiler API (ts.createSourceFile / forEachChild); heuristic verified this session
import ts from "typescript";
const ABSOLUTE = /^(?:[A-Za-z]:[\\/]|\\\\|\/(?:Users|home|root|tmp|var|private|opt|usr|etc|mnt|Volumes|bin)(?:\/|$))/u;
const HOST_PATH_FNS = new Set(["join", "resolve", "normalize", "relative", "dirname", "basename"]);
export const PATH_LITERAL_MARKER = /\/\/\s*path-literal-ok:\s*\S.{3,}/u; // reason required

export function scanPathLiterals(fileName: string, text: string): string[] {
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.ES2022, true);
  const lines = text.split(/\r?\n/u);
  const bindings = new Map<string, ts.StringLiteralLike>();
  // pass 1: const X = "<absolute literal>"
  // pass 2: host path call (Identifier callee in HOST_PATH_FNS, or path.<fn>; NOT path.win32/path.posix)
  //         whose argument is an absolute literal, or an identifier bound in pass 1
  // report `${fileName}:${line}` unless PATH_LITERAL_MARKER matches that literal's own line
  ...
}
```
Guard test shape:
1. Self-tests on inline sample sources. The `owned-skills` pre-fix shape must be flagged. A `path.win32.join("C:\\x")` input must not be flagged. A marked line must not be flagged, and a marker without a reason must still be flagged.
2. `for (const name of readdirSync(join(repositoryRoot, "test")).filter(f => f.endsWith(".ts")))`, then assert that the collected violations equal `[]`, and name every violation in the message. Compute `repositoryRoot` as `resolve(import.meta.dirname, "..", "..")` (the compiled file lives in `dist/test`), the same way as `tarball-fixture.test.ts:40`.

### Pattern 3: Test-local state root (D-02)
```ts
// mcp-proxy.test.ts — module scope, BEFORE any upstreamEnvironmentPolicy()/upstreamProcessSpec() call.
// node --test runs each file in its own process, so this cannot leak into another file.
const hostStateRootAtLoad = resolve(process.env.ALPHA_AOS_STATE_DIR?.trim() || join(homedir(), ".alpha-aos"));
const testStateRoot = join(tmpdir(), "alpha-aos-test-mcp-proxy-state");
process.env.ALPHA_AOS_STATE_DIR = testStateRoot;

// gate-lifecycle.test.ts — the CLI child never sees process.env.ALPHA_AOS_STATE_DIR (not in the probe allowlist)
function gateEnvironment(root: string): EnvironmentPolicy {
  return { ...probeEnv, literal: { ...probeEnv.literal, ALPHA_AOS_STATE_DIR: join(root, "state") } };
}
```
Existing tests at `mcp-proxy.test.ts:854-930` compute the expected root through `userStateRoot()` dynamically, so they stay green. The test at `:932` saves and restores `ALPHA_AOS_STATE_DIR` around its own synthetic root, which stays compatible.

### Pattern 4: D-05 manifest fingerprint (reporting only)
- Walk exactly as today: `lstat`, `link:` for symlinks, sorted `readdir`, `size`, and content hashed only if ≤ 1 MiB. Record each entry as `{ path: relative, kind: "dir"|"file"|"link", size, sha256 | null }`, where `null` means over 1 MiB and size-only, same as today.
- Keep the aggregate digest computed from the same byte stream, so `assert.deepEqual(afterHost, beforeHost, …)` at `tarball-fixture.test.ts:547` compares the same `Map<path, digest>` and its verdict is unchanged. Keep the `before` manifests. On mismatch, build a message listing added, removed and changed entries with kind, size and hash prefix. **Bound the listing** (for example the first 50 sorted entries plus totals per target), because a cold npx cache adds about 20,000 entries.
- Never read content into the message. Relative paths only.

### Anti-Patterns to Avoid
- **Loosening or narrowing `hostMutationTargets`** is forbidden by D-02 and D-04. So are removing `~/.alpha-aos`, running the fixture with `concurrency: false`, and running it last. Serializing the fixture hides the leak; it does not remove it.
- **Setting `ALPHA_AOS_STATE_DIR` in `.github/workflows/ci.yml`.** It would redirect `hostStateRoot` itself (`tarball-fixture.test.ts:43`), so the oracle would stop watching the real `~/.alpha-aos`. That is an oracle narrowing in disguise.
- **Fixing only `mcp-proxy.test.ts`.** `gate-engine` and `gate-lifecycle` write the same root and will reproduce the red whenever scheduling shifts.
- **Asserting "host state root unchanged" inside a unit test.** Other files run concurrently, so that assertion is itself racy. Assert the **positive** location instead: the journal or cache landed in the test's own root.
- **Running the repro or probe against the real developer home.** The developer's real `~/.alpha-aos` holds live `journal`, `snapshots`, `capabilities`, `mcp-cache` and other data. Always redirect `USERPROFILE`/`HOME` to a scratch dir and unset `ALPHA_AOS_STATE_DIR`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Parsing TS sources for call arguments | Regex over lines / hand tokenizer | `typescript` compiler API (already a devDependency) | Handles multiline calls, comments, template literals, and nested strings |
| Per-test home isolation | New sandbox framework | Shape of `createIsolatedSandbox()` (`tarball-fixture.test.ts:80-146`) or a single `ALPHA_AOS_STATE_DIR` redirect | `userStateRoot()` already honors the override |
| Run evidence | Manual transcription of the Actions UI | `gh run view <id> --json attempt,headSha,event,conclusion,jobs` | D-14 requires retrieval, not transcription |

## Common Pitfalls

### Pitfall 1: The guard flags its own self-test samples
**What goes wrong:** `path-literal-guard.test.ts` contains sample sources with `"C:\\test\\…"` in them.
**How to avoid:** Keep the samples as *contents* of an outer string or template literal. The outer literal's text starts with `const`/`join(`, so it does not match the anchored `ABSOLUTE` pattern. The alternative is to exclude the guard file by name, but that weakens the guard. Add a self-test proving that the real-tree scan includes the guard file and finds nothing there.

### Pitfall 2: Name-level binding resolution false positives
**What goes wrong:** The prototype tracks `const` bindings by name for the whole file. `home` in one test and `join(home, …)` in another test could collide.
**How to avoid:** This fails closed, so the result is a marker or a rename, never a missed violation, and the current tree has zero false positives. For scope-correctness, resolve bindings with `ts.createProgram` plus `checker.getSymbolAtLocation`. That costs more complexity. Recommendation: stay name-level and document it.

### Pitfall 3: `fingerprint()` throws while another process writes the tree
**What goes wrong:** npx creates and removes temp entries under `_cacache/tmp`. `lstat`/`readdir` then raise `ENOENT` mid-walk, so the test *errors* instead of reporting a diff. Once the leak is fixed this should not happen on CI, but it can on a dev host.
**How to avoid:** In the D-05 walk, record `ENOENT` during traversal as a `vanished` entry (which still counts as a change) instead of throwing. Only `ENOENT` should be tolerated. Other errno values propagate, per the project's fail-closed convention.

### Pitfall 4: Cold npx downloads in both CI steps after the fix
**What goes wrong:** With a per-run `mkdtemp` state root, both `npm test` and `Safety boundary suites` (which includes `mcp-proxy.test.js`) download the packages cold. On windows that adds about 3.5 min and doubles registry exposure (D-13 re-runs).
**How to avoid:** Use a stable, test-owned tmp state root (`join(tmpdir(), "alpha-aos-test-mcp-proxy-state")`). It is never the host root and it stays warm across steps.

### Pitfall 5: A green matrix proves CI-02 only weakly
**What goes wrong:** The failure depends on timing, so a single green run does not prove the leak is gone.
**How to avoid:** The regression tests (D-08) must be deterministic and must not depend on timing. They assert *where* the cache or journal lands, not that the host stayed unchanged. The red observation is the new assertion run against the unfixed test code. Separately, re-run the local pair repro after the fix and expect `pass`. Also re-run the per-file probe and expect the rows for `mcp-proxy`/`gate-*` to be 0 entries.

### Pitfall 6: Local full `npm test` on the dev host can fail the fixture for dev-host-only reasons
**What goes wrong:** The developer's real `~/.alpha-aos` exists, and `capability-oracle.test.ts` can create `mcp-cache/npm-cache` directories under the home when `codex`/`pi` are on PATH. That was not attributed to a single test, so a local unredirected `npm test` may go red for reasons CI does not share.
**How to avoid:** Run local verification with a redirected home (see Code Examples). Treat the capability-oracle row as an open audit item, not a Phase 10 blocker, unless it reproduces on CI.

### Pitfall 7: `ecc-skills.test.ts` is currently green on POSIX
**What goes wrong:** A planner scoping only the failing test leaves `ecc-skills.test.ts:75-80`, and the new guard fails every leg.
**How to avoid:** Convert both files in the same plan. The prototype run above is the list of violations.

## Code Examples

### Local CI-02 reproduction on a redirected home (non-mutating to the real host)
```bash
# Verified this session: reproduces the exact CI signature in ~3.5 min on the Windows dev host.
S="<scratch dir>"; H="$S/repro-home"; rm -rf "$H"; mkdir -p "$H"; WH=$(cygpath -w "$H")
cd D:/dev/alpha-AOS && npm run build
env -u ALPHA_AOS_STATE_DIR -u CODEX_HOME -u CLAUDE_CONFIG_DIR -u HERMES_HOME -u PI_CODING_AGENT_DIR -u ANTIGRAVITY_CONFIG_DIR \
  USERPROFILE="$WH" HOME="$WH" ALPHA_AOS_REQUIRE_UPSTREAM_MCP=1 \
  node --test --test-concurrency=2 dist/test/mcp-proxy.test.js dist/test/tarball-fixture.test.js
# expected before fix: fail 1 (packed release ...), only <home>\.alpha-aos differs
# expected after fix:  fail 0; find "$H" shows no .alpha-aos
```
On Windows, `os.homedir()` follows `USERPROFILE`. This session verified it: `gate-engine` wrote into the redirected home, not the real one.

### Per-file home-write probe (audit, run before and after the fix)
The script is the same shape as the repro above, but runs each `dist/test/*.test.js` alone with its own fresh redirected home, 4 in parallel, and lists `find <home> -mindepth 1` per file. Expected after the fix: the `mcp-proxy`, `gate-engine` and `gate-lifecycle` rows are empty.

### CI-01 local POSIX observation (WSL)
```bash
wsl.exe -e sh -c 'cd /mnt/d/dev/alpha-AOS && node --test --test-name-pattern="destinationFor resolves" dist/test/owned-skills.test.js'
```

### CI-03 evidence capture
```bash
gh run list --branch main --event push --workflow CI --limit 1 --json databaseId,headSha,status,conclusion
gh run watch <id> --exit-status
gh run view <id> --json databaseId,attempt,headSha,event,conclusion,url,jobs \
  --jq '{databaseId,attempt,headSha,event,conclusion,url,jobs:[.jobs[]|{name,conclusion,databaseId}]}'
# D-13 only: gh run rerun <id>        (never --failed); then gh run view <id> --attempt 2 --json ...
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Opaque aggregate hash per host target | Manifest with bounded per-entry diff on mismatch (D-05) | This phase | The next red windows leg can be diagnosed from the log alone |
| Test files inherit the real `userStateRoot()` | Each writer-touching test file owns its state root | This phase | Closes the test-isolation leak class for known files; a suite-wide guard is deferred |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The stable tmp state root keeps the `Safety boundary suites` step warm, as the host root did | Pitfall 4 | Only cost and time; correctness is unaffected |
| A2 | `capability-oracle`'s empty `mcp-cache` directories do not occur on CI runners, because no `codex`/`pi` binaries are on PATH there | Finding 3 / Pitfall 6 | If it does occur on CI, directory entries still move the fingerprint (`dir:` lines are hashed), so a future overlap could go red. Planner should add it to the probe audit. |
| A3 | Name-level `const` binding tracking is precise enough for the current tree | Pitfall 2 | False positives cost only a marker or a rename |
| A4 | The exact bytes that changed on the CI runner in run 35762417138 were `mcp-cache/npm-cache/*` entries. This is inferred from the local repro and timing; CI logged only aggregate hashes. | Finding 4/5 | If the CI change was something else, the regression tests still pin the proven local mechanism. D-06 instrumentation would be the fallback. |

## Open Questions (RESOLVED)

1. **Does the debug record need per-entry evidence from the CI runner itself?** — RESOLVED: No. Plan 10-02 lands D-05 first (Task 1) and captures the per-entry diff from the local pair repro on a redirected home (Task 2 step 1, up to three runs). The D-06 branch run happens only if all three local runs report `fail 0` (Task 2 step 2), which is D-06's own condition; otherwise it is not run. The CI-runner bytes stay inferred (Assumption A4), and 10-02 Task 2 step 5 records that under the debug record's `## Follow-ups (outside Phase 10)`.
   - What we know: the local repro gives per-entry evidence once D-05 lands. CI gave only hashes, plus timing that fits the leak.
   - What's unclear: whether the verifier will accept local per-entry evidence together with CI timing as "which bytes changed".
   - Recommendation: land D-05 first and capture the per-entry diff from the local pair repro. D-06 is conditioned on local reproduction *failing*, and it did not fail, so D-06 is not triggered. The planner may optionally keep a D-06 branch run as corroboration, but it is not required.
2. **Product hardening candidates (out of scope; do not expand Phase 10):** — RESOLVED: Recorded as follow-ups, not fixed in Phase 10. Plan 10-02 Task 2 step 5 writes both items (plus the capability-oracle audit item, A2) into the debug record's `## Follow-ups (outside Phase 10)` section. Plan 10-03 carries the prohibition `MUST NOT change product code under src/`, so neither the `writeGateReceipt` `stateRoot` option nor the `upstreamEnvironmentPolicy` ambient write root changes in this phase.
   - `writeGateReceipt(projectRoot, receipt)` has no `stateRoot` option (`gate-receipt.ts:106-108`), unlike every other writer. STATE.md 02-09 names this exact convenience-default hazard.
   - `upstreamEnvironmentPolicy(server, source)` derives its write root from ambient `process.env`, not from `source`.

   Recommendation: record both in the debug file as follow-ups for a later hardening phase, alongside the deferred suite-wide guard.
3. **Marker syntax.** — RESOLVED: Plan 10-01 Task 2 adopts `// path-literal-ok:` followed by a reason of at least four characters, on the literal's own line (`PATH_LITERAL_MARKER` in `test/helpers/path-literal-scan.ts`). A marker without a reason is still flagged, and a marker on an adjacent line does not exempt the literal (10-01 must_haves, adjacency edge). Recommended: `// path-literal-ok: <reason>` on the literal's own line, with a non-empty reason (at least 4 characters). The planner confirms it.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | build/test | ✓ | v24.13.1 | — |
| npm | build/test | ✓ | 11.8.0 | — |
| gh CLI (authenticated) | CI-03 evidence, log retrieval | ✓ | 2.100.0 | — |
| typescript | guard scanner | ✓ | 5.9.3 | — |
| WSL (Arch) with node | local POSIX observation of CI-01 | ✓ | node v26.8.2 | the CI ubuntu/macos legs (authoritative) |
| npm registry network | repro and `mcp-proxy` upstream tests | ✓ (repro succeeded) | — | none for the repro; D-13 re-run-all on CI |

**Missing dependencies with no fallback:** none.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `node:test` (Node 24) with `node:assert/strict`; compiled by `tsc` 5.9.3 |
| Config file | `tsconfig.json`; runner `scripts/run-tests.mjs` (enumerates top-level `dist/test/*.test.js`, refuses an empty set) |
| Quick run command | `npm run build && node --test dist/test/path-literal-guard.test.js dist/test/owned-skills.test.js dist/test/ecc-skills.test.js dist/test/gate-engine.test.js dist/test/gate-lifecycle.test.js` |
| Full suite command | `npm test` (on the dev host, run it with a redirected home, per Pitfall 6) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CI-01 | `destinationFor` roots are host-native and pass on POSIX | unit | `node --test --test-name-pattern="destinationFor resolves" dist/test/owned-skills.test.js` (Windows) plus the WSL command above | ✅ (edit) |
| CI-01 | No assertion-bound platform-absolute literal in `test/*.ts`; a new one fails every OS | unit (source scan) | `node --test dist/test/path-literal-guard.test.js` | ❌ Wave 0 |
| CI-01 | Scanner detects the pre-fix shape (red observation) | unit (self-test) | same file; also run once before the fixture conversion and expect 8 violations | ❌ Wave 0 |
| CI-02 | `mcp-proxy` startups write only into the test-owned state root | unit (deterministic, no network) | `node --test --test-name-pattern="state root" dist/test/mcp-proxy.test.js` | ✅ (add test) |
| CI-02 | `writeGateReceipt` in `gate-engine` journals into the test's state root | unit | `node --test dist/test/gate-engine.test.js` | ✅ (add assertion) |
| CI-02 | `gate check` CLI child journals into the test's state root | integration | `node --test dist/test/gate-lifecycle.test.js` | ✅ (add assertion) |
| CI-02 | The packed lifecycle leaves the host byte-identical with the leaking file running concurrently | integration (repro) | pair repro command above, on a redirected home: expect `fail 0` | manual-run script, executor-run |
| CI-02 | Fingerprint mismatch names changed entries without content | unit | new test in `tarball-fixture.test.ts` feeding two synthetic temp trees to the manifest diff | ❌ Wave 0 |
| CI-03 | One push run id with all three legs green | CI | `gh run view <id> --json attempt,headSha,event,conclusion,jobs` | n/a |

### Sampling Rate
- **Per task commit:** the quick run command.
- **Per wave merge:** `npm test` under a redirected home, plus the pair repro (CI-02 plan).
- **Phase gate:** a push-triggered `main` run green on all three legs, recorded in `CI_RUN.md`, before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `test/helpers/path-literal-scan.ts` — scanner (CI-01)
- [ ] `test/path-literal-guard.test.ts` — self-tests plus a real-tree scan (CI-01)
- [ ] Manifest-diff unit coverage in `test/tarball-fixture.test.ts` (D-05)
- [ ] RED regression assertions in `mcp-proxy`/`gate-engine`/`gate-lifecycle`, observed failing before the redirect lands (D-08)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — |
| V3 Session Management | no | — |
| V4 Access Control | no | Workflow `permissions: contents: read` stays unchanged |
| V5 Input Validation | limited | The scanner reads repo-owned sources only, and parses them without executing them |
| V6 Cryptography | no | The existing `node:crypto` sha256 fingerprint is reused; nothing is hand-rolled |
| V7 Error Handling and Logging | yes | The D-05 diff prints relative paths, kinds, sizes and hash prefixes, and never content. Listings are bounded. |
| V14 Configuration | yes | No CI artifact upload of `~/.alpha-aos` (D-06). Test sandboxes stay root-bounded. |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Diagnostic output leaks credential bytes from host state (journals and snapshots can hold managed config bytes) | Information disclosure | Metadata-only diff; never `readFile` into a message |
| A test pollutes or corrupts the developer's real managed state (journals, writer lock) | Tampering | Per-file state-root redirect. Never delete real host state to "clean up" (stale evidence never triggers deletion). |
| Weakening the host-immutability oracle to get green | Repudiation of the safety claim | D-02/D-04; the assertion at `tarball-fixture.test.ts:547` stays byte-unchanged |

## Sources

### Primary (HIGH confidence)
- Local runs this session: WSL CI-01 repro, the 52-file per-file home-write probe, the pair repro of CI-02, and the guard-heuristic prototype.
- `gh run view`/`gh run list` for runs 35762417138, 35662102311, 35566562841, 35558021216, 35498899974 (job logs for windows, ubuntu, macos).
- Repository files read this session: `src/core/paths.ts`, `src/core/mcp-proxy.ts`, `src/core/gate-receipt.ts`, `src/core/owned-skills.ts`, `src/core/process.ts`, `test/tarball-fixture.test.ts`, `test/owned-skills.test.ts`, `test/ecc-skills.test.ts`, `test/mcp-proxy.test.ts`, `test/gate-engine.test.ts`, `test/gate-lifecycle.test.ts`, `scripts/run-tests.mjs`, `.github/workflows/ci.yml`, `tsconfig.json`, `package.json`.
- Context7 `/websites/nodejs_latest-v24_x_api`: `--test-isolation` defaults to `process` (one child per file), and `concurrency: true` means `os.availableParallelism() - 1` files in parallel.

### Secondary (MEDIUM confidence)
- `.planning/debug/uat-safety-boundary-parallel.md` (debug-file convention); Phase 7 `CI_RUN.md` (record convention).

## Metadata

**Confidence breakdown:**
- CI-01 root cause and fix: HIGH. Reproduced locally on POSIX, and the guard prototype ran against the real tree.
- CI-02 classification: HIGH for the mechanism, which was reproduced with the exact signature and backed by timing and warm-cache corroboration. MEDIUM for "these were the exact bytes on the CI runner" (A4) until D-05 output exists.
- Pitfalls: HIGH for the observed ones (3, 4, 6, 7); MEDIUM for 2.

**Research date:** 2026-09-23
**Valid until:** 2026-10-23, or until a runner-image, lock or `mcp-proxy`/`gate-receipt` change
