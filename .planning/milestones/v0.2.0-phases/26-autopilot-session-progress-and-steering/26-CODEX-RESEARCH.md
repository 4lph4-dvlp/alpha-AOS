# Phase 26 Codex Session Delivery Feasibility

**Researched:** 2026-10-30  
**Decision refresh:** 2026-10-31; documentation-only reconciliation, with no new probes or external research.
**Scope:** Installed Codex CLI 0.165.0; stock CLI rendering, app-server ownership, non-inference delivery, and steering boundaries. Other harnesses are outside this supplement.  
**Confidence:** MEDIUM overall. The installed protocol fixture succeeded; real originating-terminal rendering is source-traced, not visually tested. Desktop app parity remains unverified.

## User Constraints

On 2026-10-31 the user approved the common passive progress panel, with Q&A and control remaining in the originating conversation. Native session alerts are optional only where verified; universal native transcript delivery is not an acceptance claim. No LLM polling, paid inference canaries, or status-command substitution is authorized. The unsandboxed Codex shell route is not needed or approved as delivery for this decision. [VERIFIED: 26-CONTEXT.md, Locked decisions; parent refresh task]

No phase CONTEXT.md was present at the original 2026-10-30 inspection. The current 26-CONTEXT.md and 26-RESEARCH.md were read for the 2026-10-31 refresh and now govern the product scope. This document remains a Codex feasibility supplement, not a replacement for those phase-wide decisions. [VERIFIED: original phase-directory inspection and refresh reads]

## Verdict

**Implement the approved shared passive progress panel; keep originating-conversation Q&A/control and enable native alerts only where verified.** The product-scope gate is resolved. Strict passive reporting into an arbitrary existing Codex chat remains unestablished, and the unsandboxed `thread/shellCommand` route is neither required nor approved for delivery. Its historical fixture/source findings below remain accurate evidence, not the selected implementation. [VERIFIED: 26-CONTEXT.md, Locked decisions and Feasibility gate; 26-RESEARCH.md, Product scope decision; parent refresh task]

### Product decision — resolved 2026-10-31

The common panel is the accepted automatic progress surface across hosts. Native Codex UI delivery remains unverified and optional; do not make shell execution or native transcript parity a prerequisite for the panel. The shell-command examples, candidate architecture and native validation cases below document the earlier investigation only and do not grant implementation or execution authority. [VERIFIED: 26-CONTEXT.md, Locked decisions and Acceptance cases; parent refresh task]

**Do not use `thread/inject_items` as the visible-delivery implementation.** Its documented contract is model-visible history; the TUI explicitly ignores raw-response completion notifications. The isolated fixture accepted injection but emitted no corresponding item event before the shell request. [CITED: https://learn.chatgpt.com/docs/app-server] [CITED: https://github.com/openai/codex/blob/rust-v0.165.0/codex-rs/tui/src/chatwidget/protocol.rs#L362-L403] [VERIFIED: isolated installed-0.165.0 fixture below]

**Do not advertise universal Codex surface support.** The full shell-command event-to-render path was established for the open-source CLI, not this desktop app conversation. A desktop app connection must earn its own capability result and rendering evidence before the adapter enables delivery. An inaccessible embedded CLI thread also fails closed; launching another server against the same history is not established as a way to update its existing UI. [CITED: https://github.com/openai/codex/blob/rust-v0.165.0/codex-rs/tui/src/app/app_server_thread_ownership.rs#L60-L82] [CITED: https://github.com/openai/codex/blob/rust-v0.165.0/codex-rs/tui/src/lib.rs#L1056-L1092] [ASSUMED: desktop rendering and embedded-session external attachment have not been established]

## Architectural Responsibility Map

| Capability | Owner | Required boundary |
|---|---|---|
| Task transitions and approval checkpoints | Existing GSD/task runtime | Report transitions already committed by that owner; reporting never advances lifecycle state. |
| Event durability, deduplication and bounded retries | Deterministic local runtime | Event-driven transport; no LLM timer, status loop, or monitor agent. |
| Origin identification | Launch/session binding adapter | Bind exact harness, backend endpoint, thread identifier, run and approved capability. Never select the latest thread or infer the origin from a working directory. |
| Approved visible progress | Shared passive panel | Keep native Codex alerts optional and disabled until verified; no unsandboxed shell delivery is approved. |
| User Q&A | Existing interactive conversation | User messages retain native chat handling. Q&A model requests are distinct from reporting. |
| Control changes to autopilot | Task control port | Route explicit user controls to the existing task runtime with task identity and authority; do not equate chat history injection with runner steering. |

These are implementation recommendations, not claims that such adapter modules already exist. [ASSUMED: proposed architecture]

## Supported / Unsupported Capability Matrix

| Surface or operation | Evidence-based status | Planner disposition |
|---|---|---|
| Installed CLI protocol version | `codex --version` returned `codex-cli 0.165.0`. [VERIFIED: local CLI invocation] | Pin fixture expectations to this version and negotiate runtime compatibility. |
| Same-daemon CLI, exact loaded origin thread, native command output | Installed isolated fixture emitted shell command item lifecycle; release source routes those items to transcript redraw. Actual existing terminal was not touched. [VERIFIED: isolated fixture] [CITED: https://github.com/openai/codex/blob/rust-v0.165.0/codex-rs/tui/src/chatwidget/protocol.rs#L644-L684] | Conditionally supported; require opt-in, backend binding and native rendering acceptance before marking supported end to end. |
| `thread/inject_items` as immediate stock-CLI notification | History update is supported; immediate visible output is not provided by this path. The raw response notifications have an explicit no-op TUI match arm. [CITED: https://github.com/openai/codex/blob/rust-v0.165.0/codex-rs/tui/src/chatwidget/protocol.rs#L362-L403] | Reject as delivery implementation. |
| A generated assistant bubble without model inference | No supported stock-CLI API route established; raw response events are explicitly ignored. [CITED: https://github.com/openai/codex/blob/rust-v0.165.0/codex-rs/tui/src/chatwidget/protocol.rs#L362-L403] | Do not promise; report via clearly labeled command result, or require a host extension. |
| Existing CLI with embedded backend / `--no-daemon` | CLI supports embedded and daemon/remote backend targets; no external attach path for the embedded running instance was established. [CITED: https://github.com/openai/codex/blob/rust-v0.165.0/codex-rs/tui/src/lib.rs#L328-L337] [ASSUMED: external attachment limitation] | Adapter reports unsupported unless an explicit usable endpoint was captured; never create a second live owner as fallback. |
| Desktop app / this existing app thread | Protocol documentation alone does not establish the app's actual backend access or rendering. [ASSUMED: app feasibility remains unverified] | Disabled until a dedicated host capability and rendering fixture passes; do not substitute CLI status output. |
| Shell report during active regular turn | Release integration test verifies the same active turn remains in progress, shell output completes, and no extra turn start/completion occurs. This test was inspected, not executed locally. [CITED: https://github.com/openai/codex/blob/rust-v0.165.0/codex-rs/app-server/tests/suite/v2/thread_shell_command.rs#L303-L365] | Supported by release source/tests; require a local no-inference fixture for active-turn behavior before broad enablement. |
| Shell report while idle | Isolated fixture emitted a shell-only turn and command execution items, with zero provider traffic. [VERIFIED: isolated installed-0.165.0 fixture] | Supported protocol operation; brief native turn-busy state is expected. |
| `turn/steer` | Documented to append input to an active turn, requiring matching `expectedTurnId`. [CITED: https://learn.chatgpt.com/docs/app-server] | Use only for an explicitly authorized active Codex turn, not as a passive progress notification or substitute task control channel. |
| Multi-agent v2 child direct injection | Release guard rejects direct input to parent-owned v2 subagents. [CITED: https://github.com/openai/codex/blob/rust-v0.165.0/codex-rs/app-server/src/request_processors/thread_input.rs#L8-L36] | Bind the originating root chat; do not bypass ownership restrictions. |
| Reopen/resume showing all shell command cards | Release tests explicitly exclude command-execution items from thread/read, turns/list and fork history responses. [CITED: https://github.com/openai/codex/blob/rust-v0.165.0/codex-rs/app-server/tests/suite/v2/thread_shell_command.rs#L129-L166] | Keep canonical task-event history separately; live delivery is not a durable transcript guarantee. |

## Exact Source Trace

### History injection

1. `thread_inject_items_response_inner` loads the target thread, applies direct-input policy, parses Responses items, calls `inject_response_items`, and returns an empty response. [CITED: https://github.com/openai/codex/blob/rust-v0.165.0/codex-rs/app-server/src/request_processors/turn_processor.rs#L995-L1024]
2. `inject_response_items_for_turn` records client history context and invokes `inject_client_response_items`. [CITED: https://github.com/openai/codex/blob/rust-v0.165.0/codex-rs/core/src/codex_thread.rs#L831-L877]
3. The session queues items into active work, or records them in conversation history when idle. This is a prompt-history path. [CITED: https://github.com/openai/codex/blob/rust-v0.165.0/codex-rs/core/src/session/inject.rs#L74-L103]
4. The CLI explicitly ignores `RawResponseItemCompleted` and `RawResponseCompleted` in its notification match. This is positive source evidence against treating raw item events as automatic transcript rendering. [CITED: https://github.com/openai/codex/blob/rust-v0.165.0/codex-rs/tui/src/chatwidget/protocol.rs#L362-L403]

### Visible shell report

1. The shell-command processor validates timeout and nonempty command, loads the thread, applies direct-input policy, requires the local environment, and submits the shell operation. [CITED: https://github.com/openai/codex/blob/rust-v0.165.0/codex-rs/app-server/src/request_processors/thread_processor.rs#L2606-L2655]
2. The user-shell task executes its command and returns without a model response; it emits a standalone turn lifecycle only when idle. [CITED: https://github.com/openai/codex/blob/rust-v0.165.0/codex-rs/core/src/tasks/user_shell.rs#L83-L127]
3. It emits command-item start, executes the command, then emits command-item completion with captured output and user-shell provenance. [CITED: https://github.com/openai/codex/blob/rust-v0.165.0/codex-rs/core/src/tasks/user_shell.rs#L184-L245] [CITED: https://github.com/openai/codex/blob/rust-v0.165.0/codex-rs/core/src/tasks/user_shell.rs#L289-L318]
4. The app routes notifications only to threads it owns or tracks. The widget dispatches command completion into the command renderer, which updates or inserts a history cell and requests redraw. Model interpretation is not in this rendering path. [CITED: https://github.com/openai/codex/blob/rust-v0.165.0/codex-rs/tui/src/app/app_server_events.rs#L507-L525] [CITED: https://github.com/openai/codex/blob/rust-v0.165.0/codex-rs/tui/src/chatwidget/protocol.rs#L644-L684] [CITED: https://github.com/openai/codex/blob/rust-v0.165.0/codex-rs/tui/src/chatwidget/command_lifecycle.rs#L419-L450]

## Installed Binary Fixture

**Observed locally, without inference:** A temporary isolated Codex home, sanitized environment, temporary working directory, ephemeral thread, and a localhost provider fixture denying all provider requests were used. The native installed binary was launched as app-server over stdio. No existing chat, existing socket, auth file, `turn/start`, or `model/list` was used. [VERIFIED: this session's isolated fixture invocation and output]

The exact observations were:

```text
initializeOk: true
startOk: true
injectResponse: {}
eventsBeforeShell: remoteControl/status/changed, thread/started
shellResponse: {}
completion.shellComplete: true
events after shell:
  turn/started
  item/started       type=commandExecution source=userShell status=inProgress
  item/commandExecution/outputDelta
  item/completed     type=commandExecution source=userShell status=completed
completed output included: AOS_ISOLATED_REPORT_MARKER
providerRequests: []
```

This is fixture-produced evidence, not a quotation of external source material. [VERIFIED: local fixture output]

**Evidence location:** This document's Installed Binary Fixture section is the durable bounded evidence artifact; no separate verbose fixture log was persisted. Original tool completion handle: exec session `19870`, initial output chunk `49ba2e`, final exit chunk `a812cc`. [VERIFIED: this session's tool results]

The empty provider-request list describes this isolated idle-report fixture only. Shell output is also recorded or injected into model-visible conversation context, so later normal Q&A can consume it and incur ordinary inference costs. Zero report-triggered inference is not a promise of zero cost for subsequent user questions or continuing active work. [VERIFIED: isolated fixture] [CITED: https://github.com/openai/codex/blob/rust-v0.165.0/codex-rs/core/src/tasks/user_shell.rs#L440-L467]

**What the fixture does not prove:** It did not attach a real TUI, test app rendering, test an active model turn, test multi-client daemon delivery, or observe the final standalone turn-completed notification before terminating. The command-completion event triggered fixture teardown. [VERIFIED: inspected fixture invocation this session]

**Important shell side effect:** Despite isolated HOME/USERPROFILE, the shell loaded the OS PowerShell profile, and profile diagnostics appeared alongside the marker. The release code deliberately derives execution with login-shell mode enabled. A fixed emitter does not eliminate profile execution. [VERIFIED: local fixture output] [CITED: https://github.com/openai/codex/blob/rust-v0.165.0/codex-rs/core/src/tasks/user_shell.rs#L143-L147]

**Cleanup limitation:** The fixture server was terminated; the enclosing exec session exited with code 1 because temporary-directory cleanup encountered EBUSY. A bounded cleanup attempt with a literal resolved temp-root check was then rejected by automatic approval review with `blocked by policy`. On 2026-10-31 the user authorized deleting this exact fixture, but the parent's cleanup retry was again rejected with `blocked by policy`; cleanup remains incomplete. The remaining temporary directory is `C:/Users/alpha/AppData/Local/Temp/aos-codex-no-inference-7dAGfz`. No deletion workaround is authorized or attempted in this refresh. [VERIFIED: original process and cleanup tool outputs; 26-CONTEXT.md, Locked decisions; parent refresh task]

## Protocol Contract and Code Examples

The installed schema defines required `threadId` and `command`, plus optional nullable integer `timeoutMs`. The schema describes command execution as unsandboxed and full access, preserving shell syntax. Timeout defaults to one hour; zero means immediate timeout. [VERIFIED: locally opened generated ThreadShellCommandParams schema] [CITED: https://github.com/openai/codex/blob/rust-v0.165.0/codex-rs/app-server-protocol/src/protocol/v2/thread.rs#L1197-L1215]

Use this conceptual wire shape; uppercase tokens are proposed integration placeholders, not repository constants:

```json
{"id":1,"method":"initialize","params":{"clientInfo":{"name":"alpha-aos-session-reporter","version":"IMPLEMENTATION_VERSION"},"capabilities":{"experimentalApi":true}}}
{"method":"initialized"}
{"id":2,"method":"thread/shellCommand","params":{"threadId":"EXACT_BOUND_ORIGIN_THREAD","command":"AUDITED_PLATFORM_SPECIFIC_EMITTER_INVOCATION","timeoutMs":5000}}
```

The initialization sequence is documented; the method fields are in the installed schema. The reporter identity, emitter design and five-second bound above are proposals, not existing project API values or vendor requirements. [CITED: https://learn.chatgpt.com/docs/app-server] [VERIFIED: locally opened generated InitializeParams and ThreadShellCommandParams schemas] [ASSUMED: proposed reporter identity and timeout policy]

Local CLI help exposes `app-server proxy --sock <SOCKET_PATH>` for stdio-to-running-control-socket proxying, `--remote` for TUI remote endpoints, and `--no-daemon`. The matching release supports embedded, local-daemon and remote backend targets, including fallback to embedded for some implicit local-daemon connection failures. Therefore a socket's mere presence is not proof the originating CLI uses it. [VERIFIED: local CLI help invocations] [CITED: https://github.com/openai/codex/blob/rust-v0.165.0/codex-rs/tui/src/lib.rs#L328-L337] [CITED: https://github.com/openai/codex/blob/rust-v0.165.0/codex-rs/tui/src/lib.rs#L587-L608]

The initialize response includes `codexHome`, `platformFamily`, `platformOs`, and `userAgent`; do not invent a serverVersion field. Record the actual negotiated server identity and compare against the tested compatibility policy. No live daemon-version command was executed during this research because that would connect to an existing socket. [VERIFIED: locally opened generated InitializeResponse schema and this session's invocations]

## Historical Shell-Delivery Candidate — Not Selected

The following candidate was documented before the common panel was approved. Preserve it as research evidence only; do not implement it under the current panel decision. [VERIFIED: 26-CONTEXT.md, Locked decisions; parent refresh task]

1. Capture an explicit origin binding at task launch. Require the same backend that owns the live origin thread. Prove that the exact thread is already loaded on that backend through a read-only bounded query; never resume it on a new backend merely to make a capability check pass.
2. Keep task progress as deterministic events from the existing task runner. Commit each event before delivery, with task/run/event identity and a monotonic sequence. Trigger one finite delivery attempt when a stage changes; deduplicate unchanged state in code.
3. For the supported CLI binding, invoke only a fixed, installed, audited emitter through the shell-command method. Use an absolute executable/script path, platform-specific shell quoting, and a validated base64 JSON data argument. Decode only as data; emit bounded plain text. Strip terminal control characters and never put raw user text into executable shell syntax. Do not allow an arbitrary command option on the report API.
4. Declare the shell capability explicitly in opt-in settings. It executes outside the thread sandbox and can load shell profiles. If that capability is unacceptable, use a host extension/custom UI that renders local task events; do not quietly fall back to paid model calls or pretend history injection rendered a report.
5. Correlate RPC response and item completion separately. An empty RPC response means accepted submission; delivery should require matching command completion and exit success. Use one bounded runtime timeout. Record protocol acceptance separately from actual surface-rendering verification.
6. Preserve native Q&A. Do not hold a chat-turn wait open to display progress. Reports use their own tiny finite shell execution. Do not promise zero transient task-busy state or guaranteed ordering against a simultaneous user submit without a concurrency fixture.
7. Keep live steering a separate authorized task-control port. User pause/answer/stop commands target exact task/run ownership; a chat-side text notification cannot acknowledge task control or mutate GSD state by itself.
8. If disconnected or unsupported, expose that delivery state honestly and preserve the event cursor for explicit reconnect. A CLI status command or status file does not count as successful in-chat delivery. Never replay an unbounded backlog into a newly discovered chat.

These are proposed controls, not implemented behavior. [ASSUMED: implementation recommendation]

## Common Pitfalls / Don't Hand-Roll

| Pitfall | Required planning response |
|---|---|
| Confusing protocol history with UI rendering | Require the notification-to-renderer trace and a real surface acceptance check. Raw-response events explicitly do not render in this TUI. [CITED: https://github.com/openai/codex/blob/rust-v0.165.0/codex-rs/tui/src/chatwidget/protocol.rs#L362-L403] |
| Treating another server over the same disk as the live thread owner | Capture backend identity and verify exact loaded thread; TUI ownership filters exist. [CITED: https://github.com/openai/codex/blob/rust-v0.165.0/codex-rs/tui/src/app/app_server_thread_ownership.rs#L60-L82] |
| Claiming the report transport is passive or sandboxed | Shell-command API is an unsandboxed escape hatch with login-shell behavior. [CITED: https://github.com/openai/codex/blob/rust-v0.165.0/codex-rs/app-server/src/request_processors/thread_processor.rs#L2631-L2655] [CITED: https://github.com/openai/codex/blob/rust-v0.165.0/codex-rs/core/src/tasks/user_shell.rs#L143-L147] |
| Polling with the model to discover stage changes | Emit deterministic runner events and runtime-owned bounded delivery; this is a task constraint. [VERIFIED: delegated user constraints] |
| Replacing a native client with transcript/SQLite manipulation | Use the native app-server protocol and exact ownership; direct harness-file mutation contradicts project rules. [VERIFIED: AGENTS.md:237] |
| Assuming successful reports remain native command cards after resume | Release tests explicitly exclude command execution history items from several history responses. [CITED: https://github.com/openai/codex/blob/rust-v0.165.0/codex-rs/app-server/tests/suite/v2/thread_shell_command.rs#L129-L166] |
| Using steering to wake the model for reporting | Steering is active-turn user input; keep it separate from non-inference reporting. [CITED: https://learn.chatgpt.com/docs/app-server] |

## Project Constraints (from AGENTS.md)

- Keep GSD as lifecycle/state owner; no second lifecycle authority. Preserve root-bounded, previewable, rollback-aware mutations, credential redaction, deterministic evidence, and native meaningful invocation checks. [VERIFIED: AGENTS.md:17-25]
- Keep platform support across Windows, macOS and Linux; maintain the existing runtime/toolchain requirements and harness-specific adapters. [VERIFIED: AGENTS.md:17-20,163-165]
- Do not patch third-party managed files directly; route alpha-AOS-owned writes through the transaction boundary. [VERIFIED: AGENTS.md:163,237]
- Use Exa discovery, Firecrawl extraction and Context7 for API research. Parent performed these required capability calls and shared bounded findings; these tools were not exposed in this child runtime. [VERIFIED: AGENTS.md:284-288 and parent messages this session]
- Do not simulate autopilot inline. Explicit task contract approval and separate start remain required for actual autonomous execution. [VERIFIED: AGENTS.md:290-295]
- Preserve existing TypeScript strictness, explicit relative `.js` imports, specific boundary errors, side-effect-explicit core services and secret-free logs. [VERIFIED: AGENTS.md:101-121]
- Use finite native completion handles; no LLM timer/status loop; disclose transport yields; run targeted checks and the full suite at the final gate. [VERIFIED: AGENTS.md:308-318]

## Security Domain

These are recommended adapter controls, not a claim of ASVS certification or exact-version ASVS category conformance. [ASSUMED: proposed security design]

| Area | Applicability and control |
|---|---|
| Authentication / session binding | Exact local backend and origin identity; do not retrieve user credentials for reporting. |
| Access control | Root chat binding, task/run ownership, opt-in unsandboxed command capability; honor native child direct-input rejection. |
| Input validation | Bounded event schema, base64 data-only envelope, independent platform shell quoting, terminal escape stripping and no arbitrary commands. |
| Cryptography | Use existing platform/runtime integrity primitives if a binding token is required; no custom crypto. |
| Audit and recovery | Durable event acceptance separate from transport acceptance, item completion and UI verification; bounded reconnect and dedupe. |

Native policy evidence: direct input to v2 subagents is explicitly rejected, and shell commands intentionally run outside normal sandbox policy. [CITED: https://github.com/openai/codex/blob/rust-v0.165.0/codex-rs/app-server/src/request_processors/thread_input.rs#L8-L36] [CITED: https://github.com/openai/codex/blob/rust-v0.165.0/codex-rs/app-server/src/request_processors/thread_processor.rs#L2631-L2655]

## Validation Architecture

This supplement adds no packages, installs, source implementation or lifecycle mutations. No package legitimacy audit is necessary for the research itself. The phase planner must use the repository's existing test infrastructure and include these focused cases before enabling the adapter. [VERIFIED: this session's mutations and authorized scope]

| Required case | Kind | Current evidence |
|---|---|---|
| Injection does not count as visible delivery | Isolated protocol fixture | Passed locally: accepted injection, no item event before shell. |
| Shell report emits command completion without provider request | Isolated protocol fixture | Passed locally against installed 0.165.0; providerRequests was empty. |
| Actual originating CLI shows report while idle | Native rendering acceptance | Source trace only; real TUI fixture still required. |
| Second client on same daemon reports to already-attached exact origin | Multi-client fixture | Not run; required. |
| Active user Q&A is not interrupted; shell report belongs to existing active turn | Isolated concurrency fixture with non-inference/mock provider | Matching release test inspected; local fixture required. |
| Desktop app shows report | Surface-specific acceptance | Unverified; do not enable app parity. |
| Wrong backend, wrong thread, parent-owned child, stale task/run | Negative integration | Required, fail closed. |
| Shell metacharacters, Unicode, newlines, ANSI/OSC controls, space/quote-bearing paths | Unit + isolated execution | Required for fixed emitter and shell quoting. |
| Duplicate events, disconnect, timeout, accepted-RPC/no-completion, reconnect | Runtime transport tests | Required; assert no extra model invocation and no unbounded retry. |
| Persisted task history survives reconnect without claiming native shell-card replay | Durability fixture | Required; native history limitation source-confirmed. |

No existing production chat injection or GUI action was performed. [VERIFIED: this session's tool invocations]

## Assumptions Log / Open Decisions

| ID | Unverified claim or proposed decision | Consequence / gate |
|---|---|---|
| C1 | Desktop app can expose a compatible writable backend and render command events in the origin chat. [ASSUMED] | Keep unsupported until dedicated proof; CLI evidence does not cover the app. |
| C2 | Existing embedded CLI exposes no usable external attach path. [ASSUMED] | Adapter can fail closed on lack of a proven endpoint without claiming vendor-wide impossibility. |
| C3 | Resolved: the user approved the common passive progress panel with originating-conversation Q&A/control; native alerts are optional only where verified. [VERIFIED: 26-CONTEXT.md, Locked decisions] | Plan against the panel; native shell-result acceptance is not required or implied. |
| C4 | Resolved for current scope: unsandboxed Codex shell/login-profile delivery is not needed and is not approved. [VERIFIED: parent refresh task; 26-CONTEXT.md, Locked decisions] | Do not implement or execute the historical shell-delivery candidate. |
| C5 | Proposed runtime event/binding/control-port architecture and five-second timeout suit the project. [ASSUMED] | Planner selects concrete policy without weakening task authority or reporting semantics. |
| C6 | Same-daemon second-client delivery renders correctly on an attached TUI with concurrent Q&A. [ASSUMED: source-supported but not locally rendered] | Required end-to-end non-paid fixture and native acceptance check. |

## Sources and Method

- Official app-server documentation fetched this session: https://learn.chatgpt.com/docs/app-server — initialization, shell command, history injection, steering and event semantics. [CITED: https://learn.chatgpt.com/docs/app-server]
- Official repository release source pinned to `rust-v0.165.0`; files were fetched and read at the linked line ranges. Relevant integration tests were read, not executed. [CITED: https://github.com/openai/codex/tree/rust-v0.165.0]
- Parent's required Exa/Firecrawl/Context7 work: parent reported official README extraction and `/openai/codex` documentation lookup; this child did independent pinned source tracing and an installed-binary isolated fixture. [VERIFIED: parent messages this session]
- Confidence seam calls returned MEDIUM for Context7 (including `--verified`) and Firecrawl `--verified`; generic `webfetch`/`official` provider IDs returned LOW and were not used to manufacture a higher confidence tier. This supplement uses official-source `[CITED]` claims and distinct local-fixture `[VERIFIED]` claims. [VERIFIED: local classify-confidence outputs]

**Optional native-delivery evidence gap:** Same-daemon attached CLI rendering and desktop-app-specific delivery remain unverified. These gaps do not block the approved shared panel, and no further native shell probes are authorized by this refresh. The original zero-provider-request idle fixture remains evidence only for that isolated protocol test. [VERIFIED: original idle fixture; 26-CONTEXT.md, Locked decisions; parent refresh task]
