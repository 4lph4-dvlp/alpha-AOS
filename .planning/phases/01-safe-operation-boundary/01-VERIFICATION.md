---
phase: 01-safe-operation-boundary
verified: 2026-09-07T00:00:00Z
status: human_needed
score: 7/8 must-haves verified
behavior_unverified: 1
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 5/8
  gaps_closed:
    - "G-01-1 (three-OS acceptance gate) — CLOSED on CI run `34051628180`, head `25b5434`, `conclusion: success`. Verified by this verifier with `gh run view`: ubuntu-latest, macos-latest and windows-latest are each `success` on all four steps (`npm run check`, `npm test`, `npm run build:check`, `Safety boundary suites`) in that ONE run id. Per leg: `npm test` 208 tests / fail 0; `Safety boundary suites` 131 tests / fail 0. `grep -c '✖'` over the whole run log returns 0."
    - "RC-5 (entrypoint asymmetry) — REPAIRED AT ITS SOURCE. `.github/workflows/ci.yml:39-49` now runs `node scripts/run-tests.mjs --files <ten suites>`; the previously NOT_WIRED link ci.yml -> run-tests.mjs is now WIRED. `the test runner environment carries no npm lifecycle injection` passes on windows-latest in BOTH entrypoints (run log lines 1438 and 1615), which is the exact same-job asymmetry that was red in run 33984247757. Six new diagnostic lines report the names the bare invocation keeps and the routed one drops: `INIT_CWD, npm_config_prefix, npm_lifecycle_event`."
    - "01-21 must_haves truth 6 — no longer falsified. Two permanent suite assertions now guard it on every leg: `the CI safety-suite invocation scrubs an injected npm setting that a bare invocation keeps` (a differential test with a real negative control) and `the CI safety step reaches the suite through the scrubbing runner` (a region-scoped source control over the workflow). Both ✔ on all three legs in both entrypoints."
    - "Prior behavior_unverified item 2 (the non-ENOENT `unprovable-filesystem` branch, Broken Window #2) — now BEHAVIORALLY PROVEN, not structural. 01-25 added three unprivileged EACCES fixtures that actually execute on ubuntu-latest and macos-latest: `an allowed root that became unreadable is refused at the recheck rather than compared unresolved`, `an unreadable component is unprovable rather than unclassified`, `losing readability between preflight and apply refuses at the recheck` — all ✔ on both POSIX legs in both entrypoints. All three assert the exact code `unprovable-filesystem` (test/path-boundary.test.ts:784, :835, :890), never a generic non-ok refusal."
    - "Broken Window #4 (`commandProbeEnvironment` passthrough proven on Windows only) — closed. `a version probe answers under the probe environment on this platform` ✔ on darwin, linux and win32, each with real evidence (`npm`/`node`/`git` found with non-null versions and null unsupportedReason)."
    - "Ledger #7 (the invalidated descendant-liveness instrument) — closed. `test/process.test.ts` no longer judges liveness with a bare `process.kill(pid, 0)`. It judges through the shared oracle in `test/helpers/termination-oracle.ts` (terminal evidence polled to `CLOSE_TREE_DEADLINE_MS`) and additionally asserts `ProcessResult.treeTermination`, with a dedicated POSIX `direct` failure that fires BEFORE the liveness assertion. Six per-leg diagnostics (3 legs × 2 entrypoints) report `group` on POSIX / `windows-tree` on win32, all `evidence:\"esrch\"`, `terminated:true`, `advanced:false`, `heartbeatNonceMatches:true`."
    - "Prior spot-check SKIP `escape-file-link` — now OBSERVED on a real privileged Windows host. See the Verifier Ruling section: windows-latest actually RAN the fixture."
  gaps_remaining: []
  regressions: []
deferred: []
behavior_unverified_items:
  - truth: "SC2 — a write or removal that could escape an allowed root through an UNCLASSIFIED REPARSE POINT is refused with a stable code, and the outside sentinel remains untouched"
    test: "On a Windows host with the privileges `fsutil reparsepoint` requires, create a directory carrying an unclassified reparse tag inside an allowed root, then run an alpha-AOS dry-run and an apply against a path beneath it."
    expected: "A stable unsupported/refusal code, no mutation, outside sentinel hash unchanged, and the dry-run/inspection paths still useful (D-01)."
    why_human: "Re-confirmed this session from run 34051628180's own not-run ledger, not from a summary. windows-latest records `{\"fixture\":\"unknown-reparse\",\"reason\":\"fsutil reparsepoint is unavailable or unprivileged on this host\"}`; ubuntu and macos record `reparse points are a Windows-only concept`. No CI leg can produce this evidence. My local routed run reproduces the same skip. 01-VALIDATION.md:87 designates this the phase's single manual-only verification and 01-UAT.md item 2 is `result: skipped` — the human explicitly did not resolve it. The other five SC2 vectors (directory link, junction, FILE SYMLINK, alias, parent-path change) are all green on real hosts."
coincidental_reliance_items: []
human_verification:
  - test: "권한이 있는 Windows 호스트(관리자 셸 또는 `fsutil reparsepoint` 사용 가능 상태)에서 `node --test dist/test/path-boundary.test.js` 를 다시 돌린다."
    expected: "`an unclassified reparse point yields a stable unsupported refusal` 이 skip 이 아니라 실행되어 통과하고, `path-boundary not-run evidence` 배열에서 `unknown-reparse` 가 사라진다. 바깥 sentinel 해시는 변하지 않는다."
    why_human: "권한 게이트. 어떤 CI leg 도 이 증거를 만들 수 없다는 것이 이 run 의 not-run ledger 로 직접 확인됐다. 01-VALIDATION.md 가 지정한 phase 유일의 manual-only verification 이며 01-UAT.md item 2 는 아직 `skipped` 다."
  - test: "01-24..01-27 이 선언한 judgment-tier prohibition 20건에 대한 사람의 확인. verifier 의 판정은 비권위(non-authoritative)이며, 아래 'Prohibition Verification' 표의 근거를 읽고 승인하거나 이의를 제기한다."
    expected: "20건 모두 승인되거나, 이의가 제기된 항목이 진단으로 되돌아간다. 특히 01-26 P5 (manual-only canary 승격 금지)에 대한 verifier 의 판정 — `escape-file-link` 는 승격, `unknown-reparse` 는 미승격 — 을 사람이 명시적으로 수용/기각해야 한다."
    why_human: "fail-closed 정책. judgment-tier prohibition 은 절대 조용히 초록이 되지 않는다. 20건 중 3건(01-26 P2/P3, 01-27 P2)은 '무효한 계측기 교체가 assertion 완화인가'라는 실질적 판단을 포함한다."
  - test: "이 Windows 개발 호스트에서 라우팅된 10-파일 세트를 반복 실행하되, 이번에는 실패한 테스트 이름을 반드시 포착한다 (`node scripts/run-tests.mjs --files ... 2>&1 | tee`)."
    expected: "재현되면 실패한 테스트 이름과 진단이 남는다. 재현되지 않으면 '미재현'으로 기록을 이월한다 — '설명됨'으로 승격하지 않는다."
    why_human: "01-27 이 명시적으로 이월한 미해결 관측. 한 번의 `131 / pass 125 / fail 1 / skipped 5` 가 있었고 실패 이름이 포착되지 않았다. 이후 6회 + 이 verifier 의 1회 = 7회 연속 `fail 0`. 로컬 Windows 는 skipped 5, CI windows 는 skipped 4 라 두 호스트는 같은 131 총계 아래 다른 테스트 집합을 돌린다 — 따라서 windows-latest 의 초록이 로컬에서 실패한 것을 반드시 덮지는 않는다. 침묵은 원인 규명이 아니다."
---

# Phase 01: Safe Operation Boundary 검증 보고서

**Phase Goal:** Users can trust alpha-AOS to preview changes, reject unsafe or ambiguous operations, preserve recoverable state, and keep secrets out of every observable surface.
**Verified:** 2026-09-07
**Status:** human_needed
**Re-verification:** Yes — 네 번째 패스. 2026-09-06 의 `gaps_found` 보고서를 대체한다.

## Executive Note

**G-01-1 은 닫혔다. 남은 것은 단 하나의 권한 게이트와, 사람이 소유한 판정들이다.**

지난 보고서가 막았던 것은 하나의 leg 과 하나의 테스트였다. 그것이 사라졌다. CI run `34051628180`(head `25b5434`, `conclusion: success`)은 **하나의 run id 안에서** ubuntu-latest, macos-latest, windows-latest 가 각각 네 스텝 전부 초록이다. 나는 이 run 을 `gh` 로 직접 읽었고, SUMMARY 에서 인용하지 않았다. 전체 run 로그에서 `✖` 는 **0건**이다.

이번 라운드가 한 일 중 가장 중요한 것은 초록 자체가 아니라 **초록의 이유가 기록됐다**는 점이다:

- **RC-5 는 근원에서 수리됐다.** `.github/workflows/ci.yml` 이 마침내 `scripts/run-tests.mjs` 를 통과한다. 지난 보고서가 `NOT_WIRED` 로 기록한 그 링크다. windows-latest 의 **같은 job 안에서** `the test runner environment carries no npm lifecycle injection` 이 두 진입점 모두 초록이다 — 지난 run 에서 정확히 이 조건이 빨갰다. 그리고 이 수리는 이제 **영구 assertion 두 개**로 지켜진다: 주입 환경에서 라우팅된 호출은 exit 0, 맨 호출은 non-zero 이며 `npm_config_prefix` 를 이름으로 지목해야 하는 차등 테스트, 그리고 워크플로 소스에 대한 region-scoped 통제. 둘 다 세 leg × 두 진입점 전부 초록이다.
- **`unprovable-filesystem` 은 이제 소스 판독이 아니라 픽스처가 증명한다.** 01-25 가 만든 비권한 EACCES 픽스처 3종이 ubuntu 와 macos 에서 **실제로 실행**되고, 세 곳 모두 `unprovable-filesystem` 이라는 **정확한 코드**를 단언한다. 지난 보고서의 `⚠️ STATIC (one branch)` 데이터 흐름 항목이 `✓ FLOWING` 이 됐다.
- **무효한 계측기가 교체됐다.** 01-27 은 `process.kill(pid, 0)` — zombie 에도 성공하는 프로브 — 를 terminal evidence 기반 오라클로 바꿨다. 나는 `git show --stat` 으로 01-27 의 여덟 커밋 전부를 확인했다: **`src/` 와 `.github/` 아래 파일은 단 하나도 수정되지 않았다.** 제품은 손대지 않고 계측기만 고쳤다는 주장은 사실이다.
- **초록 leg 도 말을 한다.** 여섯 줄의 `descendant termination evidence` 진단이 3 legs × 2 entrypoints 로 존재하며, 전부 `terminated:true` / `evidence:"esrch"` / `advanced:false`. pid 가 남아 있는 zombie 가 아니라 **완전히 사라진** 상태다.

**막지 못한 것도 그대로 적는다.** SC2 의 다섯 벡터 중 `unclassified reparse point` 하나는 어떤 leg 도 답할 수 없다 — 이것은 추정이 아니라 이 run 의 not-run ledger 가 직접 말하는 사실이다. 그리고 01-24..01-27 이 선언한 judgment-tier prohibition 20건은 verifier 가 조용히 초록으로 만들 수 없다. 그래서 `passed` 가 아니라 `human_needed` 다.

## Verifier Ruling — 01-27 이 넘긴 두 항목

### 판정 1: `escape-file-link` canary 는 관측으로 충족됐다 (승격)

**판정: 승격한다.** `unknown-reparse` 는 승격하지 않는다.

근거는 초록이 아니라 **not-run ledger 의 침묵**과 **실행 흔적**이다. `test/path-boundary.test.ts:169-170` 은 file symlink 를 만들지 못하면 `notRun.push({fixture:"escape-file-link", ...})` + `context.skip()` 을 반드시 기록한다. 그런데 windows-latest 는:

- `✔ a file link that escapes the allowed root is refused for both write and removal` 을 **실측 시간과 함께**(26.45ms / 32.70ms) 두 진입점 모두에서 보고했고,
- 그 leg 의 `path-boundary not-run evidence` 배열에 `escape-file-link` 가 **없다** (`unknown-reparse`, `eacces-recheck-root`, `eacces-component`, `eacces-recheck-component` 네 개뿐).

즉 GitHub 의 windows 이미지는 개발 호스트와 달리 file symlink 생성 권한을 가지며, 픽스처가 실제로 링크를 만들고 제품이 write 와 removal 을 모두 거부했으며 바깥 sentinel 해시가 불변임을 확인했다(테스트 본문 `test/path-boundary.test.ts:163-194`). 내 로컬 실행은 skipped 5, CI windows 는 skipped 4 이고 그 차이가 정확히 이 픽스처다.

**01-26 prohibition P5 와 충돌하지 않는다.** 그 금지는 "manual-only 검증을 자동 run 이 초록이라는 이유로 승격하지 말라 — **권한 있는 호스트가 실제로 돌릴 때까지**"이다. windows-latest 가 바로 그 권한 있는 호스트이고 실제로 돌렸다. 나는 초록에서 추론한 것이 아니라 픽스처 자신의 not-run 원장을 읽었다. 오히려 이 금지의 발동 조건이 충족된 사례다.

**01-UAT.md item 3 의 상태도 이로써 개선된다.** 그 항목은 `result: pass, accepted_by: human` 이지만 `observation_note` 가 "fixture 가 실행되어 통과한 것이 아니라, 사람이 권한 게이트를 수용한 것이다. 실제 관측으로 승격하려면 권한 상승 셸 또는 Developer Mode 에서 재실행이 필요하다"고 스스로 적어 두었다. 그 재실행이 windows-latest 에서 일어났다. 항목은 이제 **관측된 pass** 다.

**단, `unknown-reparse` 는 그대로 미해소다.** windows-latest 조차 `fsutil reparsepoint is unavailable or unprivileged on this host` 로 not-run 을 기록한다. 두 canary 를 한 덩어리로 다루던 plan 의 전제는 절반만 거짓이었다.

### 판정 2: 설명되지 않은 단발 실패는 **미재현**이며, 차단 사유가 아니다 (경고로 이월)

**판정: gap 이 아니라 human verification / watch item 으로 이월한다.**

근거:

- 나는 이 호스트에서 CI 와 동일한 라우팅 명령으로 10-파일 세트를 한 번 돌렸다: `tests 131 / pass 126 / fail 0 / skipped 5`. 재현되지 않았다. 이로써 독립 관측은 **7회 연속 `fail 0`**, 실패는 1회다.
- 그 1회의 실패 테스트 **이름이 포착되지 않았다**. 이름 없는 실패는 원인으로 승격될 수 없고, 부재로도 승격될 수 없다.
- 01-27 의 자체 caveat 은 유효하다: 로컬 skipped 5 vs CI windows skipped 4 이므로 두 호스트는 같은 131 총계 아래 **다른 테스트 집합**을 돈다. windows-latest 의 초록이 로컬 실패를 자동으로 덮지는 않는다. 따라서 "CI 가 초록이니 해결됐다"는 결론은 쓰지 않는다.

이것을 blocker 로 올리지 않는 이유는 관측 비대칭이다: 세 OS × 두 진입점의 결정적 증거가 존재하고, 반대편에는 이름조차 없는 단발 관측 하나가 있다. 그러나 **설명됐다고 기록하지도 않는다** — 진짜 결함은 실패 이름을 남기지 않은 관측 절차 쪽이며, 사람 항목 3번이 그것을 요구한다.

## Goal Achievement

### Observable Truths

ROADMAP Success Criteria 1-5(로드맵 계약)와 G-01-1 acceptance gate 의 must-haves(6-8)를 병합했다.

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | **SC1** — 모든 mutating 커맨드가 checkout / package / native config / managed state / harness resource 를 byte-for-byte 불변으로 두고 preview 된다 | ✓ VERIFIED | 세 leg × 두 진입점 전부: `every mutating CLI preview leaves all five mutation surfaces byte-identical` ✔ (macos 5.5s/6.0s, ubuntu 8.5s/8.7s, windows 14.3s), `two concurrent previews neither collide nor create shared state` ✔, `a wrapper refuses without a verified build artifact and delegates with one` ✔, `the byte-identical entry points include both plan-builder callers` ✔, `wrapper families executed: 4; not-run: []` 세 leg 전부. 소스: `resolveGlobalNodeModulesRoot` (src/core/install.ts:291-303) 는 spawn 없이 파일시스템만 읽고, 읽을 수 없는 세 조건에서 `state:"unverified"` 를 반환한다(:318, :324, :328). |
| 2 | **SC2** — symlink / junction / reparse point / alias / parent-path change 를 통해 allowed root 를 벗어날 수 있는 write·removal 이 거부되고 바깥 sentinel 이 불변이다 | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | **다섯 벡터 중 넷이 실제 호스트에서 초록, 하나는 어떤 leg 도 답할 수 없다.** file symlink: windows-latest 에서 **실행되어** ✔ (판정 1). directory link/junction: ✔. parent-path change: `a parent swapped between preflight and mutation is caught by an immediate recheck` ✔ 세 leg. alias: `path aliases are segment-aware across roots, separators and case` ✔. **unclassified reparse point: 세 leg 전부 not-run** — POSIX 는 `reparse points are a Windows-only concept`, windows-latest 는 `fsutil reparsepoint is unavailable or unprivileged on this host`. 추가로 EACCES `unprovable-filesystem` 3벡터가 ubuntu/macos 에서 신규 초록. 사람에게 라우팅, 점수에 포함하지 않음. |
| 3 | **SC3** — 동시/중단된 managed write 가 안전하게 직렬화되고 hash-checked journal 증거를 남기며 실제 상태를 보고한다 | ✓ VERIFIED | `transaction-crash.test.js` 가 ci.yml:41 에 명명되어 세 leg × 두 진입점 모두 실행, `✖` 0건. 이번 라운드에서 손대지 않았고 회귀 없음. |
| 4 | **SC4** — 출력/plan/journal/snapshot/subprocess 실패/CI 증거가 credential 을 가리고, 실행 커맨드는 shell 없이 bounded capture·timeout·승인된 env 이름만 쓴다 | ✓ VERIFIED | 이번 라운드에 두 가지 실질적 강화. **(a) probe answerability**: `a version probe answers under the probe environment on this platform` ✔ darwin/linux/win32, 각 leg 이 `npm`/`node`/`git` 의 실제 버전을 non-null 로 보고 — Broken Window #4(`commandProbeEnvironment` 가 Windows 에서만 검증됨)를 닫는 증거. **(b) bounded termination**: `a timed-out command leaves no descendant process behind` 이 terminal evidence 로 판정되며 `treeTermination` 을 함께 단언(진실 8). `the platform environment floor is declared rather than discovered at runtime` 및 per-platform 분기 assertion 모두 세 leg 초록. |
| 5 | **SC5** — malformed / ambiguous / unsupported / schema-invalid 문서가 mutation 전에 거부된다 | ✓ VERIFIED | `validation.test.js` 세 leg × 두 진입점 초록. 로컬 실행에서도 `validation never coerces, defaults, or strips the input it is judging` ✔ 등 전부 초록. 회귀 없음. |
| 6 | **G-01-1** — gap 은 하나의 관측된 3-OS run id 위에서만 닫힌다; 세 leg 이 그 run 안에서 네 스텝 전부 초록이어야 한다 (01-23 T1+T3 / 01-26 T1 / 01-27 T8) | ✓ VERIFIED | `gh run view 34051628180` (내가 직접 실행): `conclusion: success`, head `25b5434`, event push. 세 job 전부 `success`, 각 job 의 `npm run check` / `npm test` / `Verify the build artifact manifest` / `Safety boundary suites` 전부 `success`. `npm test` 208/fail 0 × 3, `Safety boundary suites` 131/fail 0 × 3. **stitched 아님** — 하나의 run id. **stale 아님** — `git diff --name-only 25b5434..HEAD` 는 `.planning/` 네 파일뿐. |
| 7 | **G-01-1 / 01-21 T6 / RC-5** — `npm test` 와 CI 스텝이 테스트 프로세스에 같은 환경을 건넨다; 1차 게이트가 같은 파일을 도는 CI 스텝보다 초록일 수 없다 | ✓ VERIFIED | ci.yml:39-49 가 `node scripts/run-tests.mjs --files <10 suites>`. windows-latest **같은 job 안에서** 두 진입점 모두 `the test runner environment carries no npm lifecycle injection` ✔ (로그 1438, 1615). 진단 줄이 무엇이 제거되는지 명시: `INIT_CWD, npm_config_prefix, npm_lifecycle_event`. 영구 assertion 2종(차등 테스트 + 워크플로 소스 통제) 세 leg × 두 진입점 초록. loud-failure 경로는 내가 직접 실행: missing-file `EXIT=1` + 경로 지목, empty `--files` `EXIT=1`. |
| 8 | **G-01-1 / 01-27 T1-T5** — descendant liveness 가 signal 가능 여부가 아니라 positive terminal evidence 로 `CLOSE_TREE_DEADLINE_MS` 까지 판정되고, 하나의 공유 계측기가 두 스위트를 판정하며, `treeTermination` 이 단언된다 | ✓ VERIFIED *(behavior-dependent — 행위 테스트로 증명)* | 이 진실은 cancellation/cleanup invariant 이므로 심볼 존재만으로는 VERIFIED 가 될 수 없다. 행위 증거: `a timed-out command leaves no descendant process behind` ✔ 3 legs × 2 entrypoints (1.51s~1.72s), 그리고 계측기 자신의 통제 테스트 `the termination oracle distinguishes a running descendant from a terminated one` ✔ / `the termination classifier never reads a stalled heartbeat as a stopped process` ✔ 세 leg. 여섯 진단 줄 전부 `evidence:"esrch"` / `terminated:true` / `advanced:false` / `heartbeatNonceMatches:true`, `treeTermination` 은 POSIX `group` · win32 `windows-tree`. 소스: `test/process.test.ts:380-437` 이 `waitForTermination(probe, CLOSE_TREE_DEADLINE_MS)` 로 판정하고 POSIX `direct` 를 **liveness 단언보다 먼저** 자체 메시지로 실패시킨다. |

**Score:** 7/8 truths verified (1 present, behavior-unverified; 0 failed)

### Deferred Items

없음. 지난 보고서의 유일한 잔여 gap(G-01-1)은 이월이 아니라 **종료**됐다. Phase 7 SC1(release-artifact 3-OS fixture)로 미룬 항목은 없으며, 미룰 근거도 없다.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `.github/workflows/ci.yml` | 3-OS 매트릭스가 10개 Phase 1 스위트를 명명하고, safety 스텝이 scrubbing runner 를 통과 | ✓ VERIFIED | :39-49 가 `node scripts/run-tests.mjs --files` + 10개 파일(preview, path-boundary, transaction-crash, redaction, validation, process, protocol-session, mcp-proxy, install, update) — **순서와 개수 모두 이전과 동일**. `fail-fast: false`, 3-OS 매트릭스 유지. 주석이 RC-5 회귀 시 무슨 일이 벌어지는지 run id 와 함께 기록. |
| `scripts/run-tests.mjs` | npm lifecycle 주입 제거 + 명시적 `--files` 부분집합 + 빈/미빌드 세트 loud failure | ✓ VERIFIED (이제 WIRED) | `INJECTED_PREFIX = /^npm_(config\|package\|lifecycle)_/iu` + exact-name 4종(**`init_cwd` 추가됨**), `namedTestFiles()` 가 terminal `--files` 로 분할, 미빌드 경로는 전부 이름을 찍고 exit 1, 빈 `--files` 도 exit 1. 두 경로 모두 **내가 직접 실행해 exit 1 확인**. `--files` 부재 시 기존 self-enumeration 유지. 소비자가 이제 둘: `package.json:32` 와 `ci.yml:39`. |
| `test/preview.test.ts` | runner-environment invariant + RC-5 차등 회귀 테스트 + 워크플로 라우팅 소스 통제 | ✓ VERIFIED (강화됨, 약화 아님) | invariant 은 삭제·skip·완화되지 않았고 `init_cwd` 를 case-folded lookup 으로 **추가**하여 엄격해졌다. :375 차등 테스트는 라우팅 호출 status 0 + 맨 호출 non-zero **그리고 출력이 `npm_config_prefix` 를 지목**할 것까지 요구하는 진짜 negative control. :450 은 `- name: Safety boundary suites` 줄 전체에 anchor 된 region-scoped 소스 통제라 rename 으로 빠져나갈 수 없다. |
| `test/path-boundary.test.ts` | EACCES `unprovable-filesystem` 픽스처 3종 + 자가 프로브 not-run 게이트 | ✓ VERIFIED | :784 / :835 / :890 세 곳이 **정확히 `unprovable-filesystem`** 을 단언하고 관측된 코드를 실패 메시지에 포함. 호스트가 traversal 을 실제로 막는지 자가 프로브 후 못 막으면 not-run 기록(:759, :807, :875). ubuntu·macos 실행/통과, windows 정직한 not-run. |
| `test/process.test.ts` | terminal evidence 기반 descendant 단언 + `treeTermission` 단언 + probe answerability | ✓ VERIFIED | :342-437 이 `registerProbe` → `waitForTermination(probe, CLOSE_TREE_DEADLINE_MS)` 로 판정하고, POSIX `direct` 를 별도 메시지로 먼저 실패시킨 뒤 `treeTermination` 정확값과 `terminated:true` 를 단언. :394 이 leg 마다 coded 진단 1줄(D-12 준수, 보간된 산문 아님). :636 이 probe answerability. |
| `test/helpers/termination-oracle.ts` | 이 저장소의 유일한 termination 계측기 | ✓ VERIFIED (신규, 360줄) | `heartbeatSource`, `mintHeartbeat`, `parseHeartbeatLine`, `ProcessSample`, `LivenessVerdict`, `classifyProcessSample`, `registerProbe`, `waitForTermination`, `waitForHeartbeatAdvance`, `describeTermination` 전부 export. `test/helpers/` 하위 디렉터리라 두 진입점 어느 쪽도 테스트 파일로 오인하지 않는다(`*.test.js` glob·명시 목록 모두 비대상). |
| `test/protocol-session.test.ts` | 네 probe site 와 오라클 자체 통제 테스트가 추출된 계측기를 통해 판정 | ✓ VERIFIED (이동이지 재작성 아님) | `git show --stat 4df09ba`: +376 / -318, 테스트 개수 변동 없음(총계 208/131 불변이 이를 뒷받침). 두 통제 테스트가 세 leg 초록 — 이동이 조용히 판정을 바꿨다면 여기서 빨개진다. |
| `src/core/install.ts` | spawn-free global-root 해석, `npm_config_prefix` 는 여전히 제품 INPUT | ✓ VERIFIED (이번 라운드 미수정) | :294 `const configured = source.npm_config_prefix` — 01-24 P3 금지 준수. runner 의 scrub 은 **테스트 자식 환경에만** 적용되고 제품 해석에는 닿지 않는다. |
| `src/core/process.ts` | platform floor, `CLOSE_TREE_DEADLINE_MS`, `treeTermination`, `close()` 계약 | ✓ VERIFIED (이번 라운드 미수정) | :690-699 의 `close()` 계약이 "liveness must be judged by terminal evidence rather than by whether a pid can still be signalled" 를 명시 — 01-27 이 계측기를 고친 근거가 제품 자신의 문서다. `git show --stat` 으로 01-27 여덟 커밋 중 `src/` 수정 0건 확인. |
| `.planning/WINDOWS.md` | 관측된 leg 증거에만 근거한 ledger 처분 | ✓ VERIFIED | `open 2, waived 1, fixed 4, total 7`. #2 는 ubuntu/macos 가 실제로 픽스처를 돌린 leg 증거로, #4 는 세 leg 전부의 probe evidence 로, #3 은 macos floor 로, #7 은 여섯 진단 줄로 fixed. **not-run 인 leg 을 근거로 fixed 처리된 항목 없음** (01-26 P4 준수). #5·#6 은 열려 있고 아래 경고에 기록. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| **`.github/workflows/ci.yml`** | **`scripts/run-tests.mjs`** | **safety 스텝이 scrubbing runner 를 통과한다** | **✓ WIRED (지난 보고서의 NOT_WIRED 가 해소)** | ci.yml:39 `node scripts/run-tests.mjs --files`. RC-5 의 근원. |
| `package.json` | `scripts/run-tests.mjs` | `test` 스크립트 | ✓ WIRED | :32 — 두 진입점이 이제 같은 seam 을 공유 |
| `test/preview.test.ts` | `scripts/run-tests.mjs` | 차등 회귀 테스트가 runner 를 주입 환경으로 spawn | ✓ WIRED | :375, 세 leg 초록 |
| `test/preview.test.ts` | `.github/workflows/ci.yml` | region-scoped 소스 통제가 라우팅을 고정 | ✓ WIRED | :436 스위트 목록 + :450 anchor |
| `test/process.test.ts` | `test/helpers/termination-oracle.ts` | descendant 단언이 공유 classifier 로 판정 | ✓ WIRED | `registerProbe` / `waitForTermination` / `describeTermination` import 및 :380-436 사용 |
| `test/protocol-session.test.ts` | `test/helpers/termination-oracle.ts` | 네 probe site + 두 통제 테스트 | ✓ WIRED | 통제 테스트 세 leg 초록 |
| `test/process.test.ts` | `src/core/process.ts` | timeout site 가 `ProcessResult.treeTermination` 을 읽고 단언 | ✓ WIRED | :414-431 |
| `test/path-boundary.test.ts` | `src/core/path-boundary.ts` | EACCES 가 `unprovable-filesystem` 를 세 site 에서 구동 | ✓ WIRED | :784 / :835 / :890 |
| `test/process.test.ts` | `src/core/process.ts` | probe answerability 가 `commandProbeEnvironment` 를 실행 플랫폼에서 구동 | ✓ WIRED | :636, 세 플랫폼 실증거 |
| `src/core/install.ts` | 자신 | `npm_config_prefix` 가 global root 를 결정 | ✓ WIRED | :294 |
| `src/core/path-boundary.ts` | 자신 | containment 양쪽 피연산자 모두 `canonicalizeWithMissingTail` | ✓ WIRED | 회귀 없음 |
| `test/path-boundary.test.ts` | 자신 | not-run reporter 가 파일 최하단 | ✓ WIRED | :896-911, 모든 not-run 이 reason 을 갖는지 단언 |

지난 보고서의 16개 링크 전부 재확인, 회귀 없음. **NOT_WIRED 였던 1건이 WIRED 로 전환됐고, 새로 끊어진 링크는 없다.**

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `path-boundary.ts` refusal `detail` | `reason` | 호스트가 실제로 반환한 errno | **Yes — non-ENOENT 분기가 이제 ubuntu/macos 에서 실제 EACCES 로 구동됨** | ✓ FLOWING *(지난 보고서 `⚠️ STATIC` 에서 승격)* |
| `path-boundary.ts` `PathProof.canonical` | `canonical` | 양쪽 피연산자 realpath + missing tail | Yes — junction·file symlink 픽스처가 링크를 타고 해석되고 escape 는 여전히 거부 | ✓ FLOWING |
| `process.ts` `ProcessResult.treeTermination` | `treeDelivery` | `killTree` 가 실제로 탄 분기 | Yes — 여섯 진단 줄이 POSIX `group` / win32 `windows-tree` 를 보고, fallback `direct` 아님 | ✓ FLOWING |
| `termination-oracle.ts` `LivenessVerdict` | `evidence` | 실제 `/proc` stat · signal probe · atomically renamed heartbeat | Yes — 여섯 줄 전부 `esrch` + `advanced:false` + `heartbeatNonceMatches:true` | ✓ FLOWING |
| `process.ts` command probe | `version` | 실행 플랫폼에서 실제 실행된 `npm`/`node`/`git` | Yes — darwin `11.19.0`/`v24.20.0`, win32 `11.17.0`/`v24.19.0` 등 실측값 | ✓ FLOWING |
| `run-tests.mjs` child `env` | `scrubbedEnvironment(process.env)` | 실제 프로세스 환경에서 제거 후 전달 | Yes — 진단이 제거된 이름 3종을 실명으로 보고 | ✓ FLOWING |
| `install.ts` runtime state | `runtime.state` | `<globalRoot>/<pkg>/package.json` 파일 읽기, 자식 없음 | Yes — unverified 세 경로, unverified 는 install 을 계획 | ✓ FLOWING |

### Behavioral Spot-Checks

아래 모든 항목은 내가 내 프로세스에서 실행했거나 `gh` 로 run 로그를 직접 읽은 것이다. SUMMARY 에서 인용한 것은 없다.

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| 종료 증거 run 의 정체 | `gh run view 34051628180 --json conclusion,headSha,jobs` | `conclusion: success`, head `25b5434`; ubuntu/macos/windows 세 job 전부 `success` | ✓ PASS |
| 네 스텝 per-leg | (같은 호출, steps 전개) | 세 leg 각각 `npm run check`, `npm test`, `Verify the build artifact manifest`, `Safety boundary suites` 전부 `success` | ✓ PASS |
| run 전체 실패 건수 | `grep -c "✖" <run log>` | **0** | ✓ PASS |
| per-leg 총계 | run 로그 | `npm test` 208/fail 0 × 3 leg; `Safety boundary suites` 131/fail 0 × 3 leg | ✓ PASS |
| run 이 현재 소스를 덮는가 | `git diff --name-only 25b5434..HEAD` | `.planning/` 4개 파일뿐 — `src/`·`test/`·`.github/`·`scripts/` 변경 0 | ✓ PASS |
| 01-27 이 제품을 손댔는가 | `git show --stat` × 8 commits | `test/helpers/termination-oracle.ts`(신규), `test/process.test.ts`, `test/protocol-session.test.ts`, `.planning/*` 뿐. **`src/`·`.github/` 0건** | ✓ PASS |
| RC-5 동일 job 비대칭 해소 | run 로그 windows leg | `the test runner environment carries no npm lifecycle injection` ✔ at 1438 (npm test) **and** ✔ at 1615 (routed safety step) | ✓ PASS |
| RC-5 영구 가드 | run 로그 | 차등 테스트 + 소스 통제 각각 3 legs × 2 entrypoints ✔ (12줄) | ✓ PASS |
| descendant 종료 증거 | run 로그 | 6줄, 전부 `terminated:true` / `esrch` / `advanced:false`; `group`(POSIX) · `windows-tree`(win32) | ✓ PASS |
| 계측기 자체 통제 | run 로그 | `the termination oracle distinguishes a running descendant from a terminated one` ✔, `...never reads a stalled heartbeat as a stopped process` ✔ | ✓ PASS |
| EACCES `unprovable-filesystem` | run 로그 | 3 픽스처 × ubuntu·macos × 2 진입점 = 12줄 ✔; windows 는 정직한 not-run 3줄 | ✓ PASS |
| probe answerability | run 로그 | 세 플랫폼 ✔ + 실측 버전 evidence | ✓ PASS |
| **file-symlink escape canary** | run 로그 windows leg | `a file link that escapes the allowed root is refused for both write and removal` **✔ 26.45ms / 32.70ms**, 그리고 그 leg 의 not-run 배열에 `escape-file-link` 없음 | ✓ PASS *(신규 관측)* |
| unknown-reparse canary | run 로그 3 leg | 세 leg 전부 not-run, 사유 명시 | ? SKIP → human |
| `--files` 미빌드 경로 loud failure | `node scripts/run-tests.mjs --files dist/test/does-not-exist.test.js` | 경로를 이름으로 지목, `EXIT=1` | ✓ PASS |
| `--files` 빈 세트 loud failure | `node scripts/run-tests.mjs --files` | `EXIT=1` | ✓ PASS |
| 로컬 라우팅 10-파일 세트 | `node scripts/run-tests.mjs --files <ten>` | `tests 131 / pass 126 / fail 0 / skipped 5` | ✓ PASS |
| 로컬 vs CI skip 차이 | 로컬 not-run 배열 | 로컬 5건(escape-file-link 포함) vs CI windows 4건 — 판정 1 의 근거이자 판정 2 의 caveat | ℹ INFO |
| 로컬 단발 실패 재현 시도 | 위 실행 | **재현되지 않음** (누적 7회 중 6회는 이전 세션, 1회는 이 verifier) | ? 미재현 → human |
| `npm_config_prefix` 제품 보존 | `grep -rn npm_config_prefix src/` | `src/core/install.ts:294` 가 여전히 INPUT | ✓ PASS |

### Probe Execution

N/A — 이 프로젝트는 `scripts/*/tests/probe-*.sh` 를 선언하지 않는다. 실행 가능한 검증은 Node 스위트와 3-OS CI 매트릭스이며, 둘 다 위에서 실행/판독했다.

### Requirements Coverage

| Requirement | Source Plans | Status | Evidence |
|-------------|--------------|--------|----------|
| **SAFE-01** | 01-01, 01-13..01-16, 01-21, 01-23, **01-24**, **01-26**, **01-27** | ✓ SATISFIED | 지난 보고서에서 "substantively met and procedurally unclosed" 였다. 절차가 닫혔다: 진실 6·7 이 모두 VERIFIED 이고, byte-identity 는 세 OS 에서 행위로 증명되며, 이제 두 진입점이 하나의 환경을 공유한다는 것이 **영구 assertion 으로** 지켜진다. |
| **SAFE-02** | 01-02, 01-07, 01-09, 01-12..01-16, 01-19, 01-23, **01-25**, **01-26** | ? NEEDS HUMAN | 다섯 벡터 중 넷이 실제 호스트에서 초록(file symlink 가 이번에 windows-latest 관측으로 합류). `unprovable-filesystem` 분기는 소스 판독에서 **행위 증명**으로 승격. 남은 것은 `unclassified reparse point` 하나이며 이는 권한 게이트라 어떤 leg 도 답할 수 없다. |
| **SAFE-03** | 01-02, 01-09, 01-12..01-16 | ✓ SATISFIED | SC3 세 leg × 두 진입점 초록, 회귀 없음. |
| **SAFE-04** | 01-01, 01-03, 01-08..01-18, **01-26** | ✓ SATISFIED | 모든 표면의 redaction 절 초록. 진단 줄은 전부 coded metadata(D-12)이며 보간된 산문이 아님을 소스에서 확인. |
| **SAFE-05** | 01-01, 01-04..01-06, 01-10, 01-13, 01-15, 01-16, **01-26** | ✓ SATISFIED | SC5 초록. Ajv `strict: true, coerceTypes: false, useDefaults: false, removeAdditional: false` 유지. |
| **SAFE-06** | 01-02, 01-08, 01-11..01-18, 01-20..01-23, **01-24**, **01-25**, **01-26**, **01-27** | ✓ SATISFIED | 지난 보고서의 잔여 두 건이 모두 닫혔다: (a) Broken Window #4(`commandProbeEnvironment` 가 Windows 전용 검증) → 세 플랫폼 answerability 실증거, (b) 01-23 gate 가 SAFE-06 도 실었으므로 gate 종료가 이것도 해제. 추가로 termination 판정이 zombie 와 running 을 분리하는 계측기 위에 재구축됐다. |

**Orphans:** 없음. REQUIREMENTS.md 는 Phase 1 에 정확히 SAFE-01..SAFE-06 을 매핑하고, 6개 ID 전부가 어느 plan 의 `requirements` frontmatter 에 등장한다(01-24 SAFE-01/06; 01-25 SAFE-02/06; 01-26 여섯 개 전부; 01-27 SAFE-01/06). 어느 것도 계상 누락 없음.

**Bookkeeping:** `.planning/REQUIREMENTS.md` 는 여전히 SAFE-01..06 을 `Pending`/`Gaps Found` 로 둔다. **이 verifier 는 체크박스를 바꾸지 않는다.** 상태가 `human_needed` 이므로 전이는 `/gsd-verify-work 01` 이 소유한다. 커밋 `62a4444` 가 정확히 이 조기 표기를 되돌린 이력이 있으므로 이 절제는 의도적이다.

### Prohibition Verification

01-24..01-27 이 선언한 **judgment-tier prohibition 20건**은 전부 `status: unverified, verification: null, flagged: true` 로 도착했다. 아래는 각 항목을 소스 또는 명명된 통과 테스트에 대고 확인한 **비권위(non-authoritative)** 판정이다. **어느 것도 조용히 초록이 되지 않았다** — 20건 전부 위 `human_verification` 항목 2번으로 사람에게 라우팅된다.

| Plan | Prohibition (요지) | Verifier 판정 (비권위) | 근거 |
|------|-------------------|----------------------|------|
| 01-24 P1 | 스위트 제거·not-run 표시·assertion 완화로 red leg 을 초록화 금지 | 준수 | ci.yml 이 10개 스위트를 **같은 순서로** 유지; 스텝 총계가 125 → **131 로 증가**; 이번 라운드에 not-run 으로 전환된 테스트 0건 |
| 01-24 P2 | runner-environment invariant 약화·skip·삭제 금지 | 준수 | invariant 존속하고 `init_cwd` + case-folding 으로 **엄격해짐**; 세 leg 초록 |
| 01-24 P3 | `npm_config_prefix` 를 제품 global-root 해석에서 제거 금지 | 준수 | `src/core/install.ts:294` 가 여전히 INPUT 으로 사용 |
| 01-24 P4 | 미빌드 named file 을 조용히 수용 금지 | 준수 | **내가 직접 실행: exit 1 + 경로 지목** |
| 01-24 P5 | 다른 이유로 실패하는 테스트를 injection 축소로 우회 금지 | 준수 | scrub 세트가 축소가 아니라 **확대**됨(`init_cwd` 추가) |
| 01-25 P1 | gated 픽스처를 실행하지 않고 pass 로 보고 금지 | 준수 | windows leg 이 `﹣` skip + not-run 원장에 사유 기록 |
| 01-25 P2 | EACCES 픽스처를 아무 non-ok 코드로 초록화 금지 | 준수 | 세 site 전부 정확히 `unprovable-filesystem` 단언(:784/:835/:890), 관측 코드를 메시지에 포함 |
| 01-25 P3 | 발견된 커맨드가 version 도 reason 도 없이 침묵하는 것을 수용 금지 | 준수 | answerability 테스트가 이를 실패로 규정; 세 leg 실측 evidence 는 전부 non-null version |
| 01-25 P4 | 새 픽스처가 환경적 이유로 leg 을 red 로 만들면 안 됨 | 준수 | windows 가 자가 프로브 후 not-run 기록; 세 leg 초록 |
| 01-26 P1 | 로컬·2-of-3·stitched 로 G-01-1 종료 금지 | 준수 | 하나의 run id `34051628180`, 세 leg 이 그 run 안에서 초록 |
| 01-26 P2 | red leg 을 제거·완화로 종료 금지 | **준수 (판단 포함)** | 01-27 은 제품을 손대지 않았고(`src/` 0건) 계측기를 교체했다. 새 assertion 은 **더 강하다**: 이전에 없던 `treeTermination` 단언과 POSIX `direct` 전용 실패가 추가됐다 |
| 01-26 P3 | meta-test 만 실패했다며 red leg 을 무해하다고 설명 금지 | 준수 | 01-26 은 실제로 red 를 열어 두고 halt 했고, 01-27 이 진단 후 계측기 결함을 ledger #7 로 등록한 뒤 수리 |
| 01-26 P4 | 픽스처가 not-run 인 leg 을 근거로 Broken Window fixed 금지 | 준수 | #2 는 픽스처가 **실행된** ubuntu/macos 근거로, #4 는 세 leg 전부, #3 은 macos 근거로 처분 |
| 01-26 P5 | 자동 run 이 초록이라는 이유로 manual-only canary 승격 금지 | **준수 (판정 1 참조)** | `escape-file-link` 는 초록이 아니라 **권한 있는 호스트가 실제로 픽스처를 실행했다는 not-run 원장의 침묵**을 근거로 승격 — 이 금지의 발동 조건("until a privileged host actually runs them")이 충족된 사례. `unknown-reparse` 는 미승격 |
| 01-27 P1 | 01-24 라우팅 되돌리기 / 맨 `node --test` 복귀 금지 | 준수 | ci.yml:39 라우팅 유지 |
| 01-27 P2 | red leg 을 제거·완화로 초록화 금지 (계측기 교체는 완화 아님) | **준수 (판단 포함)** | 제품 자신의 `close()` 계약(`src/core/process.ts:690-699`)이 01-27 **이전부터** 옛 프로브를 무효라고 명시하고 있었다 — 교체 근거가 사후 합리화가 아니다 |
| 01-27 P3 | zombie 와 still-running 을 하나의 결과로 붕괴 금지 | 준수 | `classifyProcessSample` 이 구별된 evidence 코드를 반환하고 stall 은 `indeterminate`(red); 통제 테스트 2종이 세 leg 초록 |
| 01-27 P4 | POSIX `treeTermination: direct` 를 성공으로 수용 금지 | 준수 | `test/process.test.ts:414-421` 이 liveness 단언보다 **먼저** 자체 메시지로 실패 |
| 01-27 P5 | 로컬·2-of-3·stitched 로 G-01-1 종료 금지 | 준수 | 01-26 P1 과 동일 근거 |
| 01-27 P6 | timing 가설을 확립된 원인으로 기록 금지 | 준수 | 01-27-SUMMARY 가 "여전히 가설"로 명시; 이 보고서도 판정 2 에서 동일하게 취급 |

### Anti-Patterns Found

이번 라운드에 수정된 파일(`scripts/run-tests.mjs`, `.github/workflows/ci.yml`, `test/preview.test.ts`, `test/path-boundary.test.ts`, `test/process.test.ts`, `test/protocol-session.test.ts`, `test/helpers/termination-oracle.ts`)을 대상으로 스캔했다.

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | `TBD` / `FIXME` / `XXX` | — | **0건.** debt-marker gate 통과 |
| — | — | 빈 구현 / console.log-only / hardcoded empty | — | 0건. `return null` 은 전부 타입된 도메인 값(`{root: null, reason: ...}`) 이며 스텁이 아님 |
| `test/helpers/termination-oracle.ts` | 232 | `process.kill(pid, 0)` | ℹ INFO | **결함 아님.** 이제 `ProcessSample.signalProbe` 라는 **한 입력**일 뿐이며 판정 자체가 아니다. 주석 :105 가 "'may I signal this pid' 를 답하지 '살아 있는가' 를 답하지 않는다"고 스스로 기록 |
| `test/mcp-proxy.test.ts` | 211 | `process.kill(pid, 0)` | ⚠️ WARNING | 이 site 는 공유 오라클로 전환되지 않았다. 01-27 의 `files_modified` 밖이고 CI 는 세 leg 초록이지만, "이 저장소에 termination 계측기는 하나"라는 진실 8 의 주장에 대한 **부분적 예외**다. 후속 phase 에서 정리 대상 |
| `src/core/writer-lock.ts` | 95 | `process.kill(pid, 0)` | ℹ INFO | 제품 코드의 **stale lock owner 탐지**용이며 termination 판정이 아니다. 별개 관심사 |

### Open Broken Windows (차단 아님, 인지 필요)

`.planning/WINDOWS.md` 는 `open 2` 다. 둘 다 gap 이 아니라 정직하게 등록된 커버리지 사실이다.

- **#5** — `scripts/run-tests.mjs` 의 `--files` loud-failure 경로(빈 세트·미빌드 경로)를 지키는 **영구 스위트 테스트가 없다**. 01-24 는 커맨드 실행으로 증명했고 **나도 이 세션에서 직접 재실행해 exit 1 을 확인**했다. 따라서 행위는 참이지만 모든 leg 에서 회귀를 잡아 주지는 않는다. `/gsd-ship` 이 `windows_enforce` 를 켜고 있다면 이 항목이 ship 을 막는다.
- **#6** — `provePathBoundary:296-299` 는 공개 API 로 도달 불가능한 방어적 대칭 분기다. 도달 불가 유도가 01-25-PLAN/SUMMARY 에 기록돼 있고, 행위적 쌍둥이(`recheckPathProof:352-355`)는 **커버됨**. dead code 가 아니라 순서상 배제된 코드이며, 이 판단은 사람이 한 번 읽어 볼 가치가 있다.

### Human Verification Required

#### 1. Windows unknown-reparse canary (SC2 의 마지막 벡터)

**Test:** `fsutil reparsepoint` 권한이 있는 Windows 호스트에서 허용 루트 안에 미분류 reparse tag 디렉터리를 만들고, 그 아래 경로에 대해 alpha-AOS dry-run 과 apply 를 실행한다. 또는 그 호스트에서 `node --test dist/test/path-boundary.test.js` 를 다시 돌린다.
**Expected:** `an unclassified reparse point yields a stable unsupported refusal` 이 skip 이 아니라 실행되어 통과하고, `path-boundary not-run evidence` 에서 `unknown-reparse` 가 사라진다. mutation 없음, 바깥 sentinel 해시 불변, dry-run/inspection 경로는 계속 유용해야 한다(D-01).
**Why human:** 권한 게이트. **어떤 CI leg 도 이 증거를 만들 수 없다는 것을 이번 run 의 not-run 원장으로 직접 확인**했다 — windows-latest 조차 `fsutil reparsepoint is unavailable or unprivileged on this host` 를 기록한다. 01-VALIDATION.md:87 이 지정한 phase 유일의 manual-only verification 이고 01-UAT.md item 2 는 `result: skipped` 다.

#### 2. judgment-tier prohibition 20건 사람 승인

**Test:** 위 `Prohibition Verification` 표의 근거를 읽고 20건을 승인하거나 이의를 제기한다. 특히 판단이 개입된 세 건을 명시적으로 처리한다: **01-26 P2 / 01-27 P2**(무효한 계측기 교체가 assertion 완화인가) 와 **01-26 P5**(`escape-file-link` 승격 / `unknown-reparse` 미승격 이라는 verifier 의 분리 판정).
**Expected:** 20건 승인, 또는 이의가 제기된 항목이 진단으로 복귀.
**Why human:** fail-closed 정책 — judgment-tier prohibition 은 절대 조용히 초록이 되지 않는다. verifier 의 판정은 비권위다.

#### 3. 설명되지 않은 단발 로컬 실패 — 이름 포착

**Test:** 이 Windows 개발 호스트에서 라우팅된 10-파일 세트를 반복 실행하되, 이번에는 출력을 저장해 실패한 테스트 **이름**을 반드시 포착한다.
**Expected:** 재현되면 이름과 진단이 남는다. 재현되지 않으면 '미재현'으로 이월한다 — **'설명됨'으로 승격하지 않는다**.
**Why human:** 01-27 이 명시적으로 이월한 항목. 한 번의 `131 / pass 125 / fail 1 / skipped 5` 가 있었고 이름이 포착되지 않았다. 이후 누적 7회(이 verifier 의 1회 포함) 연속 `fail 0`. 로컬은 skipped 5, CI windows 는 skipped 4 이므로 두 호스트는 같은 총계 아래 **다른 집합**을 돈다 — windows-latest 의 초록이 로컬 실패를 반드시 덮지 않는다. 진짜 결함은 실패 이름을 남기지 않은 관측 절차 쪽일 가능성이 높다.

### Gaps Summary

**gap 없음.** 지난 보고서의 두 실패 진실(7, 8)은 근원에서 수리됐고, 남은 유일한 미검증 항목은 **권한 게이트 하나**(unclassified reparse point)와 **사람이 소유한 판정들**이다. 코드가 없거나, 스텁이거나, 연결되지 않은 항목은 하나도 발견되지 않았다.

`passed` 가 아닌 이유는 단 하나다: Step 9 결정 트리상 human verification 항목이 하나라도 존재하면 `passed` 는 유효하지 않다. SC2 의 다섯 번째 벡터는 실제로 미검증이고, 20건의 judgment-tier prohibition 은 사람의 서명을 기다린다. 그 두 가지가 해소되면 이 phase 는 `passed` 다.

---

_Verified: 2026-09-07_
_Verifier: Claude (gsd-verifier)_
