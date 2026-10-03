---
phase: 18-capability-fabric-and-automatic-invocation
plan: "04"
status: completed
completed_at: 2026-10-03T13:50:00+09:00
commits:
  - 204ca1e feat(18-04): record MCP tool-error, transport-error, and denial in capability ledger
  - 5c0fadd feat(18-04): validate linked skill and MCP capability receipts
artifacts:
  - schemas/task-capability-receipt.schema.json
  - src/core/mcp-proxy.ts
  - src/core/capability-ledger.ts
  - src/core/task-capability-receipts.ts
  - test/mcp-proxy.test.ts
  - test/capability-ledger.test.ts
  - test/task-capability-receipts.test.ts
requirements_addressed: [CAP-03, CAP-05]
---

# Plan 18-04 Summary: Skill-to-MCP Linked Receipts and Error Outcome Preservation

## Executive Overview

Plan 18-04 established the verifiable skill-to-MCP invocation chain, error/exception preservation across proxy and capability ledgers, closed receipt schema validation, and strict dual-evidence linking for task capability obligations.

## Delivered Capabilities

### 1. Faithful MCP Observation and Outcome Classification (`src/core/mcp-proxy.ts`, `src/core/capability-ledger.ts`)
- **D-15 (Outcome Classification):** Expanded MCP tool observation outcomes to `McpObservationOutcome = "ok" | "denied" | "tool-error" | "transport-error"`.
- **Pre-Invocation Attempt Tracking:** Allocated unique `attemptId` before tool dispatch, ensuring that even transport crashes or thrown exceptions capture an immutable observation record.
- **Error Inspection:** Checked `result.isError` to distinguish application-level tool failures (`tool-error`) from successful tool execution (`ok`), caught and recorded thrown transport errors (`transport-error`), and recorded policy rejections (`denied`).
- **Digest Preservation:** Computed SHA-256 digests (`rawResultSha256`) of raw result payloads without storing unbounded tool outputs or raw credentials.
- **CAP-05 Legacy Audit Compatibility:** Preserved read compatibility for older ledger records (`ok | denied`) while enforcing that legacy records lacking raw result digests or attempt IDs do not qualify as strict CAP-03 success proofs (`isStrictObservationSuccess`).

### 2. Closed Task Capability Receipt Schema (`schemas/task-capability-receipt.schema.json`)
- Defined a closed schema (`additionalProperties: false`) binding all required execution fields: `schemaVersion`, `kind`, `receiptId`, `obligationId`, `runId`, `step`, `capabilityId`, `question`, `sessionId`, `skillActivationReceiptId`, `mcpObservationId`, `source`, `sourceVersion`, `attempted`, `outcome`, `resultDigest`, and `receiptDigest`.
- Strictly enforced that any unknown property or credential payload triggers schema validation failure prior to persistence.

### 3. Dual Linked Evidence Verification (`src/core/task-capability-receipts.ts`)
- **D-14 (Dual Linked Evidence):** Requires both skill activation proof (`skillActivationReceiptId`) and actual MCP observation (`mcpObservationId`) for obligations that use MCP tools.
- **Crossed-ID and Inversion Rejection:** Validated that both identifiers match the same session and obligation, and rejected sequence inversions where skill activation post-dates tool observation (`skillActivatedAt > mcpObservedAt`).
- **Empty Response Guard:** Rejected empty or whitespace result digests (`resultDigest`), requiring meaningful output proof.
- **Error Audit Preservation:** Failed invocations (`tool-error`, `transport-error`, `denied`, `failed`) are safely preserved in external `stateRoot` for auditing, but `verifyRequiredCapabilityReceipts` places them in `failedReceipts` and prevents satisfaction of required obligations.
- **Helper Utilities:** Implemented `createLinkedCapabilityReceipt` to construct fully-linked receipts with canonical digests.

## Verification

- Automated test suites:
  - `test/task-capability-receipts.test.ts`: 10 passing tests verifying valid linked receipts, rejection of missing skill activation, rejection of missing MCP observation, crossed session ID rejection, sequence inversion rejection, empty response rejection, audit preservation of error outcomes (`tool-error`, `transport-error`, `denied`), closed schema enforcement, and credential/tamper rejection.
  - `test/mcp-proxy.test.ts`: 38 passing tests verifying tool execution observation, four outcome classifications with attempt IDs, bounded error redaction, and policy enforcement.
  - `test/capability-ledger.test.ts`: 38 passing tests verifying ledger serialization, outcome round-tripping, legacy format compatibility, and `isStrictObservationSuccess`.
  - Full test verification (`task-capability-receipts`, `mcp-proxy`, `task-cli`): All tests pass.
- Static type checking: `npm run check` with 0 errors across the entire codebase.
