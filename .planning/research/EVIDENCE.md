# v0.7.0 Research Evidence

**Inspected:** 2026-11-05
**Method:** Bounded source reads, read-only historical records, three Exa discovery queries, one official-domain web search, and five primary-page Firecrawl fetches. Research ran inline under the skill's no-automatic-subagent fallback. No tests, builds, fixtures, GUI actions, external task starts or global configuration mutations.

## Historical Task

Contract id: unified-latest-tools-261105, revision 3.
Digest: 5d79d25692b049d1c2cb795ae27cec15c24d49dbad1c39b13a6aac4e033461ec.

Sources are external user state under ~/.alpha-aos, or ALPHA_AOS_STATE_DIR when set:
- contracts/unified-latest-tools-261105-r3.json
- tasks/unified-latest-tools-261105/runs/<run-id>.json
- runs/<digest>/journal.jsonl and checkpoint.json
- receipts/capabilities/<run-id>-discuss-<obligation-id>.json

Credential values, full private contracts and raw tool results are not copied into this report.

| Run | Verified identity | Recorded result |
|---|---|---|
| 5d79d25692b049d1-c2cb795a | Contract revision/digest from run | Rejected; Phase 32 stopped at discuss; 07:39:37.465Z to 07:39:39.162Z |
| mw39i0bc-8e6adb7e | Same contract digest | Rejected; missing satisfactory capability evidence at discuss |
| mw39j2bl-42c4ee8c | Same contract digest | Same |
| mw39jets-2ff633f4 | Same contract digest | Same |
| mw39jqd9-62132237 | Same contract digest | Same |

Each of the four later run IDs has paired receipts: documentation-lookup outcome ok; deep-research outcome failed, isError true, errorMessage identifying exa/web_search_exa returning an error.

The digest checkpoint is blocked, attemptIndex 4, stopReason no_progress_exhausted. Journal rejection events at attempts 3 and 4 repeat the missing-capability summary. Blocking is recorded at 08:08:14.515Z and again at 08:17:16.520Z.

This proves an Exa tool error in those later attempts, not its original payload or underlying authentication/argument/service cause. It also proves recovery attempts existed; it would be incorrect to say there was no supervisor or no automatic retry at all.

## Source Anchors and Confidence

| Finding | Local symbol/file | Classification |
|---|---|---|
| Native default supplies real capability adapter | nativeTaskPorts in src/adapters/task-agents.ts | Confirmed current code |
| Tool error content discarded before calls are retained | nativeCapabilityPort connect/call in src/adapters/task-native-capability.ts | Confirmed current code |
| Fixed URL host filter plus two-URL threshold | nativeCapabilityPort deep-research branch | Confirmed code; historical causal role unproven |
| Goal/criterion regex selection can make Exa a required obligation | extractQuestionFromContract and evaluateStepObligations in task-capability-obligations.ts | Confirmed code; appropriateness is task-specific |
| Port existence preflight is shallower than real service readiness | assertTaskCapabilityPorts in task-run.ts; readTaskStartReadiness in cli.ts | Confirmed code |
| Missing binding returns without publication | publishTaskSessionEvent in task-session.ts | Confirmed code |
| Optional panel start creates origin binding | start callback in cli.ts; hydrateTaskProgress in task-progress-launch.ts | Confirmed inspected start path |
| Native delivery/wakeup not proven | readTaskSessionPacket in task-read.ts; taskPanelCapabilities in task-progress-panel.ts | Explicit unknown/disabled in source |
| Prompt escalation then blocked after four identical failures | selectRepairStrategy in task-strategy.ts | Confirmed code and matching checkpoint |
| Synthetic successful fallback exists | createFreshSessionCapabilityPort in task-agents.ts | Confirmed code; production reachability unproven |
| Guidance encourages a single wait and permits handoff | docs/codex-execution-policy.md; skills/alpha-aos-task/SKILL.md | Confirmed wording; behavioral causality is a hypothesis |

createCapabilityReceipt derives activation and observation linkage defaults. Omitted explicit IDs in nativeCapabilityPort alone do NOT establish a receipt linkage bug; the factory was traced before drawing conclusions.

## External Primary Sources

- [Codex app-server](https://learn.chatgpt.com/docs/app-server) — terminal notifications and thread lifecycle for connected clients.
- [Codex non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode) — exec JSONL terminals and initialization behavior.
- [Exa MCP](https://exa.ai/docs/get-started/exa-mcp) — actual tool selection, local/hosted setup and authentication differences.
- [Antigravity headless mode](https://antigravity.google/docs/cli/headless/) — streaming and terminal result interface.
- [MCP tools](https://modelcontextprotocol.io/specification/2025-11-25/server/tools) — discovery schemas, result content and error taxonomy.

Public docs were fetched, not only search snippets. Exa and Firecrawl calls worked in this research session; no claim is made about the old pinned runner's current live readiness. The older MCP specification page is used for established tools semantics; no dependency migration to a newer SDK or protocol is implied.

## Remaining Unknowns

- The discarded Exa error's precise root cause.
- The supported way to wake and continue the user's current Codex app session from an independently supervised task.
- The exact mechanism behind the user's successful Antigravity experience.
- Whether each packaged/global installed version matches this checkout on every active surface.
- Which repair changes can be delegated under a pre-approved bounded grant; current exact-digest requirements remain intact until a reviewed design exists.
