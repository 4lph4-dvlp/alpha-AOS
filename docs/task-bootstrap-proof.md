# Task Bootstrap and Continuity Evidence Ledger

**Phase:** 29 - GSD Initialization and Request Continuity  
**Requirements:** BOOT-01, BOOT-02, BOOT-03, BOOT-04  
**Decisions Enforced:** D-23, D-24

## Proof Tiers & Trust Limits

In accordance with D-23 and D-24, evidence for GSD project initialization and request continuity is strictly tiered:

1. **Fixture Tier (`evidenceTier: "fixture"`)**:
   - Automated test environments using isolated sandboxes, controlled mock GSD query responders, and deterministic failure injection.
   - Proves state transitions, race serialization, byte preservation, and error handling.
   - **Crucial Invariant**: Fixture-tier tests do NOT constitute native proof of harness execution or live GSD tool behavior. The verifier script (`scripts/verify-task-bootstrap-native.mjs`) explicitly rejects fixture-tier evidence.

2. **Native Proof Tier (`evidenceTier: "native"`)**:
   - Live, real-world execution inside a verified host environment (Claude Code, Codex, Antigravity, or Pi Agent) in an authorized scratch project.
   - Exercises real `@opengsd/gsd-core` toolchain execution (`gsd-new-project` / `gsd-resume-project` and `gsd-quick`).
   - Requires actual on-disk planning artifacts (`.planning/PROJECT.md`, `ROADMAP.md`, `STATE.md`, etc.), exact Git commit evidence, single task execution (`duplicateTaskCount: 0`, `taskInvocationCount: 1`), and byte-verified artifact hashes.

## Native Receipt Schema

A native execution receipt JSON document contains:

```json
{
  "schemaVersion": 1,
  "evidenceTier": "native",
  "projectRoot": "/absolute/path/to/project",
  "controller": "codex",
  "runtime": {
    "packageName": "@opengsd/gsd-core",
    "version": "1.18.0",
    "workflowHash": "<sha256-of-installed-workflow-md>"
  },
  "pendingId": "pending-task-12345",
  "claimNonce": "nonce-abcde-67890",
  "taskInvocationCount": 1,
  "duplicateTaskCount": 0,
  "nativeReference": {
    "type": "quick",
    "artifactPath": ".planning/quick/001-feature/001-SUMMARY.md",
    "artifactSha256": "<sha256-of-summary-artifact>"
  },
  "gitEvidence": {
    "commitSha": "<git-commit-hash-of-implementation>"
  },
  "checkpoints": [
    {
      "step": "readiness",
      "diagnosis": "absent-project",
      "timestamp": "2026-11-02T14:00:00Z"
    },
    {
      "step": "bootstrap-prepare",
      "planDigest": "<sha256-plan-digest>",
      "timestamp": "2026-11-02T14:00:01Z"
    },
    {
      "step": "native-init",
      "action": "gsd-new-project",
      "timestamp": "2026-11-02T14:00:10Z"
    },
    {
      "step": "claim",
      "dispatchAuthorized": true,
      "timestamp": "2026-11-02T14:00:12Z"
    },
    {
      "step": "link",
      "route": "new-task",
      "timestamp": "2026-11-02T14:00:13Z"
    },
    {
      "step": "acknowledge",
      "accepted": true,
      "timestamp": "2026-11-02T14:00:30Z"
    }
  ]
}
```

## Current Evidence Status

| Dimension | Tier | Status | Verification Tool / Evidence |
|---|---|---|---|
| BOOT-01 Readiness Inspection | Fixture | VERIFIED | `test/task-gsd-readiness.test.ts`, `test/task-bootstrap-cli.test.ts` |
| BOOT-02 Bootstrap Handoff | Fixture | VERIFIED | `test/task-bootstrap-handoff.test.ts`, `test/task-bootstrap-cli.test.ts` |
| BOOT-03 Partial Recovery | Fixture | VERIFIED | `test/task-bootstrap-recovery.test.ts` |
| BOOT-04 Reentry & Concurrency | Fixture | VERIFIED | `test/task-bootstrap-resume.test.ts`, `test/task-bootstrap-cli.test.ts` |
| Composed Journey Acceptance | Fixture | VERIFIED | `test/task-bootstrap-acceptance.test.ts` |
| Live Native Execution Tracer | Native | VERIFIED | `scripts/verify-task-bootstrap-native.mjs --receipt <receipt-path>` (Passed at Checkpoint 29-06-02) |

## Native Verification Evidence (Task 29-06-02)

- **Receipt Path:** `C:\Users\alpha\.gemini\antigravity-cli\brain\cd05fd60-ce7b-4655-ae1a-e794d0b88c1c\scratch\native-bootstrap-receipt.json`
- **Project Root:** `C:\Users\alpha\.gemini\antigravity-cli\brain\cd05fd60-ce7b-4655-ae1a-e794d0b88c1c\scratch\native-bootstrap-project`
- **Controller Runtime:** `codex` (`@opengsd/gsd-core` 1.18.0)
- **Pending ID:** `pending-native-tracer-290602`
- **Claim Nonce:** `claim-nonce-native-290602`
- **Native Quick ID:** `261102-leh`
- **Native Artifact Path:** `.planning/quick/261102-leh-health-check/261102-leh-SUMMARY.md`
- **Artifact SHA-256:** `677f47e854ce5659df6bb77635e77fd883972f8c1b29b33961d65e36adba8745`
- **Git Commit SHA:** `3adb72549623865abc4187715bc344b346f8acc9`
- **Single Task Execution Invariants:**
  - `taskInvocationCount`: 1
  - `duplicateTaskCount`: 0
  - Once-only reentry returned `route: "continue-existing"` without dispatching a second quick task.
- **Verification Command & Result:**
  ```bash
  node scripts/verify-task-bootstrap-native.mjs --receipt "C:\Users\alpha\.gemini\antigravity-cli\brain\cd05fd60-ce7b-4655-ae1a-e794d0b88c1c\scratch\native-bootstrap-receipt.json" --json
  ```
  Result:
  ```json
  {
    "valid": true,
    "evidenceTier": "native",
    "controller": "codex",
    "projectRoot": "C:\\Users\\alpha\\.gemini\\antigravity-cli\\brain\\cd05fd60-ce7b-4655-ae1a-e794d0b88c1c\\scratch\\native-bootstrap-project",
    "pendingId": "pending-native-tracer-290602",
    "claimNonce": "claim-nonce-native-290602",
    "nativeArtifact": {
      "path": "C:\\Users\\alpha\\.gemini\\antigravity-cli\\brain\\cd05fd60-ce7b-4655-ae1a-e794d0b88c1c\\scratch\\native-bootstrap-project\\.planning\\quick\\261102-leh-health-check\\261102-leh-SUMMARY.md",
      "sha256": "677f47e854ce5659df6bb77635e77fd883972f8c1b29b33961d65e36adba8745",
      "verified": true
    },
    "gitCommitVerified": true,
    "singleTaskExecutionVerified": true
  }
  ```

## Verification Command

To verify a captured native receipt:
```bash
node scripts/verify-task-bootstrap-native.mjs --receipt <path-to-receipt.json>
```
