---
status: awaiting_human_verify
trigger: "p4 : 이전 0.5.0 배포 시도 때 여러번 ci에서의 실패로 같은 작업을 반복했어. Mac os의 ci 과정에서 문제가 발생했던 것 같은데, 아무리 수정과 재시도를 반복해도 실패하더라고. 이 문제를 말하은거면 해당 문제는 좀 더 효과적인 해결 방안으로 배포에 문제가 없도록 해봐. 야다른 안건은 좋아보여 통과"
created: 2026-11-03
updated: 2026-11-03
---

## Current Focus

hypothesis: The proven macOS QoS crash has a tested native-HTTP remediation. Native candidate acceptance is still unverified; an additional intermittent Windows worker-handshake failure remains a distinct concern.
test: After the existing explicit remote hold is resolved, use one exact committed candidate, standard pre-push gates and one three-OS CI attempt with retained native diagnostics.
expecting: The fixed QoS fault and prior panel lifetime/shutdown cases pass on actual macOS; any distinct Windows/startup failure remains a blocker with exact evidence rather than a blind rerun.
next_action: Present the prepared release/0.6.0 candidate and request the narrowly scoped candidate push/CI checkpoint. If authorized, let the unchanged pre-push hook run the full local gate once; push only on success, then dispatch and retain one exact-SHA native CI result. Independent final goal verification remains quota-pending.

## Symptoms

expected: A coherent 0.6.0 candidate passes native three-OS CI without repeated speculative release attempts.
actual: The three 0.5.0 candidate CI attempts failed. Last run 41307974019 passed package/Linux/Windows but failed two macOS task-cli panel cases.
errors: Run 41302349585: uncaught setTypeOfService EINVAL in internal undici writeH1. Run 41307974019: observer cleanup found failed instead of cancelled; public attach ECONNREFUSED.
reproduction: CI workflow on release/0.5.0, Node 24.22.1 / npm 11.19.1 on macos-latest; Windows local runtime is 24.13.1 and does not establish macOS acceptance.
started: 2026-11-01 release candidates, after the last known green 0.4.8 main.

## Scope and authority

Ordinary conversational GSD debugging extends the current Phase 31 task. User accepts P1 privacy/sandbox boundaries, P2 archival tier separation and P3 bilingual wording, replaces the version hold with target 0.6.0, and requests effective remediation of P4 macOS CI. Historical failures remain preserved. No paid canary, global installation or registry publication is authorized. The earlier explicit no-CI/push instruction is retained until a concrete prepared candidate is presented for its remote verification checkpoint; no blind reruns.

## Eliminated

- hypothesis: The additional Windows handshake failure proves worker module initialization alone exceeds five seconds and needs a production entrypoint rewrite.
  evidence: One bounded A/B job-start profile on the same code measured Node24.13.1 import259ms/ack1229ms and Node24.22.1 import308ms/ack1259ms; both jobs completed exit0. No production rewrite or timeout expansion is justified by these measurements. The intermittent failing receipt remains unresolved, not waived.
  timestamp: 2026-11-03
- hypothesis: Windows worker-startup timeout 261101-ww3 is the macOS CI failure.
  evidence: GitHub native macOS job logs identify task-cli panel transport/cancellation errors; Linux/Windows succeeded in 41307974019.
  timestamp: 2026-11-03
- hypothesis: Merely selecting Node 24.22.2 proves the undici defect fixed.
  evidence: Official 24.22.2 release notes list V8/stream changes and do not establish inclusion of undici PR 6076. Do not pin a speculative fix or downgrade Node security.
  timestamp: 2026-11-03

## Evidence

- timestamp: 2026-11-03
  checked: GitHub runs 41302349585 and 41307974019; bounded failure extracts saved under .planning/tmp/ci*-failed.log.
  found: First run has one uncaught undici setTypeOfService EINVAL. Last run has two different observer failures with no captured child error/exit/signal. Local commit f0ec2d9 already moves signal setup before handoff and extends test observer lifetime from 5s to 60s, but has no new macOS run.
  implication: Preserve f0ec2d9; add an enforced regression for the proven HTTP defect and native preflight/diagnostics rather than claiming a confirmed cause for all failures.
- timestamp: 2026-11-03
  checked: Official nodejs/undici issues 5544/6075 and merged PR 6076 via Exa discovery and Firecrawl extraction; Node 24.22.2 HTTP/stream docs via Context7.
  found: Upstream confirms an uncaught macOS EINVAL in HTTP/1 QoS marking; PR 6076 guards best-effort marking on 7.x. node:http supports AbortSignal and native response streams without that undici request path.
  implication: A test-only native HTTP transport can keep the real panel server/auth/SSE/cancellation oracles without patching runtime prototypes, weakening assertions, new dependencies or major Node changes.

## Resolution

root_cause: Proven for 41302349585: bundled undici unguarded QoS write call on Node 24.22.1/macOS. Other historical observer failures remain unconfirmed pending native evidence.
fix: Test-only native node:http transport, bounded real response streams and AbortSignal cancellation; a real immediate-ready cancellation regression with POSIX-specific final cleanup; early native CI preflight/failure artifacts; coherent local 0.6.0 metadata and bilingual candidate documentation. No production runtime/network/timeout patch.
verification: HTTP3/3; panel18/18; integration13/13; progress15/15; proof/docs/provenance22pass1permission-skip. Exact preflight remains failed at a distinct Windows5000ms worker handshake; no full candidate/native acceptance claim. Package audit451 and build350inputs/690outputs pass. First failing controls/receipts are retained.
files_changed: [test/helpers/loopback-http.ts, test/loopback-http.test.ts, test/task-cli.test.ts, test/task-progress-panel.test.ts, test/task-progress-integration.test.ts, test/task-progress.test.ts, .github/workflows/ci.yml, docs/ci-verification.md, package.json, package-lock.json]

## Local platform correction

The first scoped run completed HTTP 3/3, panel 18/18, integration 13/13 and progress 15/15 successfully. CLI completed 43 tests: 42 passed and the newly added immediate-cancel case failed solely at its extra empty-directory assertion. The strict cancellation, actual child/worker reaping and all original CLI checks passed. The remaining launch spec is expected after Windows unconditional tree termination, where POSIX signal handlers/finally do not execute; official Node 24 process/child_process documentation confirms this. The extra directory-cleanup assertion is now scoped to POSIX, including the affected macOS platform. The real ready/cancel/reaping oracle remains unconditional. Keep `.planning/tmp/macos-ci-task-cli.log` as the contrary first-run receipt; do not label that full CLI receipt green. Proof/docs/provenance had not run because the finite driver stopped on the first failing file.

## Exact preflight outcome and additional Windows concern

The exact new Git Bash CI step was then run locally using Node24.22.1: HTTP3/3 passed; panel launch, immediate ready-cancel and observer refresh passed. Public attach failed **before panel launch**, in registered task dispatch's detached-worker handshake (`job-b30c8ee54f3c4ebf`, 5000ms). The prior full CLI run had passed this same case. `.planning/tmp/macos-ci-exact-preflight.log` and `.ci-diagnostics/panel-cli.log` retain this failure. It resembles the preserved Windows worker-startup debt, not the proven macOS undici crash. The A/B measurement above does not establish its transient cause. Do not describe the exact local preflight or candidate full gate as passed, or silently increase the handshake limit. Native CI on the prepared candidate is still required; the previous explicit remote hold has not yet been cleared.

## Environment checkpoint

After `npm version 0.6.0 --no-git-tag-version --ignore-scripts`, alpha-aos-control's read-only project plan/status were invoked. Existing evidence selected BROWNFIELD_INIT and MCP_SERVER; no packs are materialized and none is required for this scoped test/CI repair. No dependency versions or stable locks changed. Package and lock root metadata agree at0.6.0.

## Failing control

Portable Windows Node 24.22.1 was downloaded from nodejs.org and verified against its official SHA256 list: `d702daa815eabbff763c7d3808e235cf031cf2ca70211b56847bc72f51e240e5`. It reports bundled undici 7.30.1, matching the failed macOS runtime. No global runtime was changed. The new QoS-fault child regression was run first against a built-in-fetch baseline: **1 test / 0 passed / 1 failed**, exit 1, `.planning/tmp/macos-ci-red-qos.log`. It fails in the real injected setTypeOfService EINVAL path, not a mock server assertion. This establishes a deterministic boundary regression on Windows without claiming native macOS reproduction.
