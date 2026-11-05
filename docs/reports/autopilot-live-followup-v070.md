# Native autopilot follow-up

Date: 2026-11-06. Follow-up to [the implementation report](autopilot-reliability-v070.md), requested by the owner to resolve the remaining worker-start failure and verify the real native recovery journey. Repository development continues through native Codex tools. Product contracts below operate only in allocated disposable Git repositories and isolated task state.

## Failures found with actual processes and services

### Native MCP schemas

An actual native capability preflight succeeded for Context7 but failed for deep research with `no schema with key or ref "http://json-schema.org/draft-07/schema#"`. The discovered Exa schema uses draft-07; the existing managed-document validator only understood 2020-12.

MCP tool arguments now use the declared schema dialect, with independent draft-07 and 2020-12 validators and standard format checks. The managed-document validator remains separate. Input validation never coerces types, fills defaults or removes properties. Repeated discovery of a schema ID cannot reuse a different compiled tool schema. Actual Context7 lookup, Exa search and Firecrawl extraction all passed after the fix. This establishes a reproduced current bug, not the unknown precise cause of the discarded historical Exa error.

### Worker startup

Instrumented real Node worker launches recorded about 2.1 seconds to acknowledge an ordinary command and 4.9 seconds to acknowledge a registered task. Registered tasks perform native approval, launch and runtime preparation before publishing child acknowledgement. The old fixed 5-second window was too close to observed preparation time.

The timing reproduction used a controlled registered-route fixture with Node as the native child; it establishes real startup/acknowledgement timing, not successful execution by a live model. The live contract runs below provide the separate model and acceptance evidence.

Startup now has a finite 30-second window, consistently used for pending-state diagnosis. A successful start still requires the actual child and immutable worker identity. A pre-child rejection reports its real error immediately. Observer expiry retains the launch payload while the spawned worker has not exited and identifies the exact job for reconnect, instead of deleting inputs that a still-starting worker may need. A real worker delayed by six seconds passed; the previously failing public attach test also passed under concurrent verification.

### Codex usage across midnight

The first live corrective model closed successfully but the task stopped with `telemetry_unavailable`. The native usage file was in the following local-date directory, while discovery inspected only UTC dates. The exact session was found one directory day later, with matching project identity. After fixing discovery, the same native session yielded six observed model calls and 213,242 tokens, matching the native dispatch total.

Discovery now checks adjacent date directories while retaining exact session identity, project binding, ancestry and existing scan bounds. A regression test includes an unrelated same-project session and confirms it is excluded. Usage spent repairing preflight is checked again before creating an execution run or consuming its approval.

The first fixture's 150,000-token limit was below that actual usage. Its stopped outcome was retained, replayed to the real originating session and acknowledged. Later independent test contracts explicitly use 1,500,000 tokens with the same configured model/effort, a 12-minute wall limit, six cycles and at most two corrections. Old fixture budgets and outcomes were not reset.

### Credentials and partial proposals

The second live corrective model resolved the documentation question, but reported HTTP 401 from its own Exa call. The parent native MCP adapter had succeeded; the Codex child environment omitted `EXA_API_KEY`.

Native Codex environments now add credential **names** only for capabilities required by the reviewed task: Context7 credentials for documentation, and Exa/Firecrawl credentials for deep research. Ordinary tasks and ordinary command jobs retain their existing restricted environments. Registered task workers receive the selected task environment in memory. Credential values never become contract fields, CLI arguments, launch payloads or literal policy settings. Controller, reviewer, final-review and GSD/native-job invocation paths use the same selection.

Question correction now receives existing questions, proposes only the failing question from the manifest, and leaves actual native MCP verification to the runtime. Partial proposals merge with existing questions, so correcting documentation cannot remove an approved research question. Execution-time capability exceptions are retained as redacted failed receipts, with unconfirmed invocation represented honestly. The failure reason remains available to recovery and reports.

The actual generated controller prompt also contained the older single-observation/handoff wording. It now retains the exact native completion handle through transport yields and restricts terminal handoff to demonstrated boundaries.

## Reproducible live check

The manual [verification script](../../scripts/verify-autopilot-live.mjs) uses the public CLI and real native model/MCP adapters, existing verified native-role receipts and the installed GSD workflow. It contains no fake controller, reviewer, capability success, GSD result or delivery event. A seeded temporary project is test input; acceptance requires newly produced GSD evidence and actual measured output.

```text
node scripts/verify-autopilot-live.mjs --prepare
node scripts/verify-autopilot-live.mjs --apply <returned-packet.json>
```

Preparation writes a reviewable contract in a new temporary Git repository. Apply approves that test contract, starts it through the foreground public CLI, then follows and acknowledges its exact original-session outcome. An intentionally incorrect documentation question requires real model correction and actual native preflight before execution. The script preserves private stdout, stderr, task state and bounded result evidence in the allocated temporary root. It uses the configured model and effort, without selecting a cheaper replacement.

The native JSONL/structured-output approach is also described in the [official Codex iterative-repair example](https://developers.openai.com/cookbook/examples/codex/build_iterative_repair_loops_with_codex). Process exit, independent measurements, GSD acceptance and origin delivery remain separate evidence.

## Validation scope

- Schema/startup/prompt selection: 34 tests passed.
- Native session date boundary, recovery and runtime controls: 27 tests passed.
- An additional 84-test runtime run initially had 83 passes and one cancellation-observer expiry. Its reconnect observer was shorter than the declared child deadline; the helper now observes the ten-second child bound plus final state settlement without weakening cancellation/closure assertions.
- The third live contract corrected its documentation question, passed real native MCP preflight, and started two actual attempts. The first controller requested authority for `.gsd/dispatch-isolation-sentinel.json` and `.gsd/.gitignore`; the product's audit already recognized the sentinel, but its controller prompt failed to describe this GSD-owned runtime state. The prompt and audit allowlist now name both files and atomic temporary siblings explicitly.
- The second actual attempt ended after the provider returned a usage-limit error. Its final chain outcome was `stopped`, process closure was confirmed, and the actual originating Codex session replayed and acknowledged the result. It did **not** achieve GSD acceptance. The observed result is preserved in [the live terminal evidence](evidence/v070-native-live-stopped.json). No further live model retry was made after provider quota exhaustion.
- The second recorded question correction did not address the first attempt's GSD runtime-authority misunderstanding. The corrected prompt is covered by local tests, but effective repair of that actual failed attempt and a subsequent accepted task have not been demonstrated.
- During review, the generic quota classifier also matched the digits `429` inside unrelated strings such as digests. It now requires a standalone HTTP status number. This correction does not change the classification of the provider's explicit usage-limit response in the live run.
- Final targeted regression after the source fixes: 93 tests passed, zero failed. The checks cover real process startup, native adapter environments, failed capability diagnostics, recovery grants, date-boundary usage and GSD prompt/evidence behavior. A prior broader run had 83 passes and one cancellation-observer timeout; its targeted rerun passed with actual process-closure assertions.

Only awaited foreground origin delivery is supported. This work does not add idle or closed-app injection, claim other-host parity, restart the old latest-tools task, or publish/synchronize global installations.
