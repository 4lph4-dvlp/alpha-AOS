# BUG-06 — efficient waiting: verified local runtime and release audit

Status: **runtime and local release audit passed; unpublished**. Final local delivery is tracked by the same GSD quick `261021-mcn`.

Version **0.4.5** preserves original main **0.4.4** (`29619abaa10b250d745c1c4df2896cadd682aa53`), including deterministic model binding, promoted stable external locks, multi-phase behavior and safety fixes. The approved plan's 0.4.1 target from `54ecf50` remains historical; computer-use 0.4.0 evidence is retained. No external dependency promotion occurred in this task.

Implementation: `4dfe32182082c6dddcf66c3c0f933313dc470210`. The actual clean-main release invocation used `f5af5abe5d042ce73900f37a918cf3f51930c568`; its delta from the implementation is two GSD records only. These final documents change evidence text only. The final documentation package receives a separate source-bound build/audit/pack/provenance/Stage 1 receipt in GSD and the external Stage C audit; its checksum is not embedded in itself.

## Problem and resulting behavior

The original dogfooding report described repeated model sleep/status turns, growing context and rate-limit exhaustion. Its reported turn counts and 200k–300k context estimates motivate the fix; they are not measured billing or proof of a quota cause. The existing low-level process runner was event-driven. Missing completion primitives and controller guidance encouraged model-level polling, while task-start documentation overstated independent supervisor lifetime.

`alpha-aos job start/status/wait/cancel` provides exact durable job handles (`job-` plus sixteen lowercase hex characters), reconnect from another CLI process, explicit mutation previews, fenced ownership and private external state. Arguments remain an array without shell concatenation. Combined retained child output is bounded to 64 KiB; total process memory is not claimed to be 64 KiB. Credential/injection environment filtering, root checks and cancellation authentication remain enforced. CWD does not broaden caller OS or sandbox authority.

`alpha-aos task wait` pins contract/run/digest/revision and validates canonical records. Attempt scope stays pinned; explicit supervisor scope follows only proven journal/ownership links. Legacy records missing required proof remain unresolved/refused. Observer expiry leaves the child alive; process deadline, cancel request, confirmed close and orphan/unconfirmed close remain distinct. Completion does not grant GSD acceptance. `task start --apply` remains foreground and awaited; an explicit job wrapper provides detached lifetime.

The shared [operator guide](../../efficient-wait.md), generated task controller prompt and owned task skill use one finite runtime observation, exact IDs and bounded external logs. Waiting grants no process, delegation/model, project or GUI authority. A transport yield is not completion; reconnect to the same durable handle without a model-managed status loop.

## Actual verification

| Check | Actual result |
| --- | --- |
| `node scripts/release.mjs --dry-run` | Exit 0; `Release preview PASSED without publishing.`; 17 actual child starts and ends, all exit 0 |
| Ordinary group | 144 files; 1,810 total / 1,799 pass / 0 fail / 11 skip; child elapsed 629,171 ms |
| Packed group | Exact `tarball-fixture.test.js`; 10 total / 10 pass / 0 fail / 0 skip; child elapsed 480,117 ms |
| Combined disjoint groups | 1,820 total, 1,809 passed, 0 failed, 11 skipped; all 145 regular compiled test files exactly once, no cancelled/todo tests |
| Fresh JSON criteria | `completion` 7/7; `safety` 17/17; `integration` 4/4 actual named leaves; each real exit 0 and exact success stdout |
| Required gates | `execute:post`, `verify:pre`, strict status all passed at release source; refreshed after final docs in Stage C |
| Package | Prepack audit, `npm pack --ignore-scripts --json`, provenance write and verification, local tarball Stage 1 all exit 0 |
| Source reviews | CR-01/corrections and Stage B scoped independent review/re-review: no open actionable findings; unchanged runtime is not rereviewed for these docs |

Full-release tarball: `alpha-aos-0.4.5.tgz`, 1,300,773 bytes, SHA-256 `33830b5e81c58c2d6ffdcf9cf96c93dd97d1bce23bfa3f2e6efa4d8f8ecb7a12`. The `.sha256` bundle verifies tarball, `dist/build-artifact.json` and `catalog/stack.lock.json` bytes; it does not encode Git HEAD. The source commit is bound separately by the actual command/driver audit. Build manifest: 283 inputs, 552 outputs. The ordinary and packed runs are one release invocation, not separately selected passing fragments. Each group retains the existing 20-minute child bound and normal runner environment scrubbing; packed lifecycle retains its 15-minute oracle. No assertion, skip, timeout or environment boundary was weakened.

Release audit and raw output: `D:/alpha-aos-verify-20261027/development-final-release-20261027` (`release-exit.json`, `commands.jsonl`, `11-stdout.log`, `12-stdout.log`, `15-stdout.log`, `16-stdout.log`, `17-stdout.log`, tarball and bundle). Stage C independently parsed the raw groups and bundle in `stage-c-audit/release-facts.json`. Fresh criteria authority: `D:/alpha-aos-verify-20261027/stage-c-criteria-v2/results.json` plus per-selection raw stdout/stderr and exact durable handles. Each criterion uses one direct built-candidate CLI start, one finite wait and zero status queries; the existing 5-second stdin, 20-second test and 25-second total verifier bounds remain unchanged. An initial external driver launch refused a state root inside its CWD before executing any tests; the corrected sibling-state fixture is separately retained.

## Native Codex evidence and limits

The managed Codex task adapter invokes a fresh ephemeral native execution with an explicit model/effort and consumes the generated GSD controller prompt. The project-local owned AGENTS block matches the candidate policy; original global npm links still resolve to original D until final verified local integration and rebuild. Candidate criteria use the direct built CLI, not an assumed updated global installation.

Historical matched short pair: fresh same-model/high Codex sessions, same 12-second child and sixty progress records, both real child exit 0. An explicit three-status-query baseline recorded six responses, input 125,572 and cached input 96,512; one runtime start/wait with zero status queries recorded two responses, input 38,265 and cached input 26,112. This single short comparison establishes those recorded counts only. Prompt/cache/scheduling differ; no broad cost, subscription/quota, long-transport or cross-harness savings rate follows. Audit: `C:/Users/alpha/AppData/Local/Temp/alpha-aos-041/codex-wait-ab-20261027/comparison.json`.

A historical 175-response session grew per-request input from 27,833 to 356,832; this does not isolate wasted input. Stage A's real delegated review and criteria used one start/one wait/zero status queries per job, but the host forced continuation of the same native handle. Actual transport evidence therefore provides no universal zero-wakeup or zero-token guarantee. Stage A completion 7/7 and safety 17/17, and Stage B integration 4/4, remain separate historical receipts, not substitutes for the three fresh Stage C criteria above.

## Preserved failure history

Historical targeted 67/67 at `0320c27` preceded broader 69 total/63 pass/6 fail and independent review blockers. Those findings were corrected and rereviewed; no worker is currently claimed to be repairing them. Earlier full gates at `56adf7c` (1,791 total/1,753 pass/27 fail/11 skip) and `7940081` (1,807/1,790/6/11) failed. The later `0a04c96` ordinary group passed 1,807/1,796/0/11 before packed work exceeded its enclosing child bound: the whole release failed. Prior Stage B release `job-e905b4a5b2964087` passed ordinary 1,810/1,799/0/11 but failed packed 10/9/1/0 with a real Windows UNKNOWN file-open error; it is not the successful release root. Logs and other targeted failed receipts remain retained in GSD/external audits. They are not summed into current passing results or overwritten.

The final verified runtime includes reviewed startup/import and fixture corrections, exhaustive ordinary/packed release orchestration and deterministic default file concurrency capped at four. Explicit concurrency flags, every enumerated file and all assertions remain intact. No further full suite is repeated for evidence-only docs; their final package gets affected build, audit, pack, provenance and Stage 1 checks.

## Authority, platform and delivery limits

No new Windows GUI run, macOS/Linux live GUI run, three-OS CI, public-registry Stage 2, remote PR, push, tag, publication, global install/configuration/sync, or external dependency promotion was performed. Historical computer-use 0.4.0 Windows evidence remains six actions, twenty audit events and ten validated captures. Portable fixtures and native CLI observations do not establish unrun platform parity.

The historical autopilot contract/run `7c176c2f5feeda16-8b4be419` remains authentication-blocked. This is the already authorized ordinary conversational GSD recovery; no native acceptance was forged. All product source/test/script/schema/docs changes used authenticated `agy.exe --model gemini-3.8-flash-high --effort high`. GPT-6.1 Sol high owns control, strong review, verification, GSD and commits. Final original-repository delivery and canonical goal verification are recorded in GSD after their actual checks.

Task-local TEMP/TMP, affinity 255 (eight available logical CPUs) and a resource guard were recorded for the successful full release. Minimum sampled available memory was about 2,415 MiB over 235 samples, with no resource abort. These controls do not prove a Windows kernel issue fixed, prevent a crash, or bound all processes/RAM. The previously denied `bug06-final-cwd-alias-vE9z2m` cleanup is retained without an alternate deletion attempt.
