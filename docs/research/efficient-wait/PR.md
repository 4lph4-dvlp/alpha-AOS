# Local PR draft — 0.4.5 efficient waiting (BUG-06)

Long builds and delegated work encouraged repeated model sleep/status turns. Exact task observation and detached command jobs now provide bounded local completion tracking with truthful foreground task lifetime, reconnectable handles, fenced ownership and separate observation/deadline/cancellation outcomes.

Version **0.4.5** preserves original main **0.4.4** (`29619abaa10b250d745c1c4df2896cadd682aa53`), including deterministic model binding, promoted stable external locks, multi-phase behavior and safety fixes. The approved plan's 0.4.1 target from `54ecf50` remains historical; computer-use 0.4.0 evidence is retained. No external dependency promotion occurred in this task.

Implementation: `4dfe32182082c6dddcf66c3c0f933313dc470210`. The actual clean-main release invocation used `f5af5abe5d042ce73900f37a918cf3f51930c568`; its delta from the implementation is two GSD records only. These final documents change evidence text only. The final documentation package receives a separate source-bound build/audit/pack/provenance/Stage 1 receipt in GSD and the external Stage C audit; its checksum is not embedded in itself.

The change preserves newer main's deterministic models, stable locks, multi-phase behavior and safety fixes. Five-harness guidance covers ordinary conversational GSD, quick and explicitly approved autopilot. An observation does not grant authority or task acceptance.

## Validation

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

## Scope and limits

No new Windows GUI run, macOS/Linux live GUI run, three-OS CI, public-registry Stage 2, remote PR, push, tag, publication, global install/configuration/sync, or external dependency promotion was performed. Historical computer-use 0.4.0 Windows evidence remains six actions, twenty audit events and ten validated captures. Portable fixtures and native CLI observations do not establish unrun platform parity.

The historical autopilot contract/run `7c176c2f5feeda16-8b4be419` remains authentication-blocked. This is the already authorized ordinary conversational GSD recovery; no native acceptance was forged. All product source/test/script/schema/docs changes used authenticated `agy.exe --model gemini-3.8-flash-high --effort high`. GPT-6.1 Sol high owns control, strong review, verification, GSD and commits. Final original-repository delivery and canonical goal verification are recorded in GSD after their actual checks.

Task-local TEMP/TMP, affinity 255 (eight available logical CPUs) and a resource guard were recorded for the successful full release. Minimum sampled available memory was about 2,415 MiB over 235 samples, with no resource abort. These controls do not prove a Windows kernel issue fixed, prevent a crash, or bound all processes/RAM. The previously denied `bug06-final-cwd-alias-vE9z2m` cleanup is retained without an alternate deletion attempt.

This is a local draft; no remote PR was created. [BUG-06](BUG-06.md) retains failures and the scoped native Codex comparison; no general cost or subscription savings claim is made.
