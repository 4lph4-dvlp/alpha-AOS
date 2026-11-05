# Autopilot completion and bounded recovery

An agent-originated task keeps its native process/tool completion handle awaited. `task start` is foreground. A transport yield means resume that exact handle; it does not mean the task finished or should be handed to the next user request.

## Review the recovery grant

Include the optional grant in the contract before reviewing and approving its digest:

```json
{
  "recoveryPolicy": {
    "maxRepairs": 2,
    "allowWorkspaceRepair": true,
    "allowQuestionRepair": true
  },
  "capabilityQuestions": {
    "research": "Find official sources about the specific API being implemented"
  }
}
```

The grant is part of the reviewed digest. Omit it to retain explicit approval for changed contracts. Only the named task, permitted workspace effects and corrections to existing capability questions are delegated. Goal, criteria, project root, allowed roots/effects, models, efforts and cumulative resource policy stay fixed. New revisions record their parent digest, explicit root approval and repair index. Expanding any other field requires user approval.

Recovery diagnoses a failure, performs a relevant correction and verifies it before another execution. Workspace correction must pass approved CLI measurements on a fresh artifact snapshot. Question correction must restore actual native read-only capability invocation. No-change claims, synthetic receipts, stronger prompts and dropped obligations are not repairs. Authentication, quota, unsupported adapters and changes outside the grant require a specific intervention. Question-only native repair is supported with a read-only Codex controller; other unverified harness paths fail closed.

## Start from the actual session

After approval and separate start authorization, the agent invokes:

```text
alpha-aos task start <contract.json> --contract-digest <approved-digest> --delivery foreground --origin-host codex --origin-session <actual-native-session-id> --apply --json
```

Codex's `CODEX_THREAD_ID` or `CODEX_SESSION_ID` is detected when present. Other hosts pass an actual session identity explicitly. Never invent an identity. `--progress panel` is optional and does not own the origin binding.

The foreground JSON stream first identifies the registered origin, then returns the final result. Failed attempts and final recovery outcomes are separate: inspect `supervision.status`, `recovery` and `delivery.outcome`, not just the latest attempt's status. Process closure and accepted work are separate evidence fields. The caller must retain its native tool handle through yields and consume the terminal result without asking the user to request status.

## Reconnect without re-executing work

Use the exact tuple from the delivery binding; its origin run can differ from the final attempt:

```text
alpha-aos task follow <contract-id> --run <origin-run-id> --contract-digest <origin-digest> --revision <origin-revision> --origin-host codex --origin-session <actual-native-session-id> --timeout-ms 300000 --json
alpha-aos task acknowledge <contract-id> --run <origin-run-id> --contract-digest <origin-digest> --revision <origin-revision> --origin-host codex --origin-session <actual-native-session-id> --outcome-id <returned-outcome-id> --apply --json
```

`follow` is a bounded runtime observer and never launches a task or model. Observer timeout is not task success or failure. `acknowledge` returns `firstAcknowledgement: true` to only one concurrent consumer; later consumers must not repeat outcome-driven actions. Checkpoints and effect reconciliation remain authoritative for work. A reporting reconnect does not rerun completed phases or an accepted task.

`task resume` with a recovery grant uses the same chain and cumulative limits and registers a new origin observation. It still needs the exact current digest and existing root/state/stop checks. An accepted chain cannot be resumed as another execution.

## Host boundary

Awaited foreground return reaches an active caller retaining a native tool/process handle. It does not inject a new turn into an idle or closed Codex app conversation. Readiness reports `automaticIdleWakeup: false`; a panel or status file does not prove otherwise. Hosts unable to retain or reconnect a completion handle must disclose that limit before advertising agent-session autopilot.

Notes may preserve evidence while recovery continues. A terminal handoff must name a real user, authority, resource or external boundary and the precise missing action. A recoverable rejected attempt alone is not such a boundary.
