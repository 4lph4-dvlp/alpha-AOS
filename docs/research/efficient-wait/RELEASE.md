# Release Notes: alpha-AOS v0.4.1 (Local Pre-Release Documentation)

**Version**: `0.4.1`

**Task Base**: `54ecf5042a5cc969004716484f85c0b91b013505` (local v0.4.0); remote `origin/main` last seen at `3a4e632` is v0.3.1 (does not contain v0.4.0). No current v0.4.1 final implementation hash known yet.

**Release Scope**: Local build and documentation pre-release. No remote git push, tagging, or npm registry publication performed.

---

## Highlights

### 1. Efficient Wait & Reactive Completion (BUG-06)
- Introduces `alpha-aos job start`, `alpha-aos job wait`, `alpha-aos job status`, and `alpha-aos job cancel` for managing long-running processes (tests, builds) without active terminal locking or model polling.
- Assigns exact job handles (`job-` plus 16 lowercase hex characters, not UUID) and bounds combined retained child output to 64 KiB (`MAX_COMBINED_OUTPUT_BYTES`, distinct from larger record bounds and total runtime memory).
- Introduces `alpha-aos task wait` for observing canonical autonomous task runs; manual task wait linkage for unsupported legacy supervisor records remains explicitly unresolved.
- Replaces repetitive LLM `sleep` loops with a single finite observation model to avoid model-driven polling on its execution path; cannot promise preventing host rate-limit exhaustion or quantify token savings.

### 2. Foreground vs. Detached Lifetime Clarification
- Corrects documentation regarding `alpha-aos task start --apply`: task execution is foreground and awaited by default.
- Detached independent process lifetimes are explicitly managed via `alpha-aos job start --apply` under the same user identity and sandbox authority.

### 3. Preserved Retained Evidence from v0.4.0
- Retains verified task-bound computer-use CLI/MCP broker and visual replay evidence on Windows (6 actions, 20 events, 10 captures).
- Preserves honest platform status: macOS and Linux GUI actions remain unrun; full 3-OS CI remains unrun.

---

## Release Quality & Verification Gates

| Gate | Target | Status | Notes |
| :--- | :--- | :--- | :--- |
| **Historical Targeted Slice** | 67 tests | **PASSED** | 67/67 pass, 0 failures at historical commit `0320c27` |
| **Broader Test Suite** | 69 tests | **IN PROGRESS** | 63 pass, 6 fail across broader cases |
| **Independent Review Resolution** | 5 blockers, 2 warnings | **IN PROGRESS** | Active repairs underway by Worker D and Worker E; no final closure |
| **Model Ready (Host Context)** | `MODEL_READY` | **VERIFIED** | Host-user context functional; native sandbox auth remains blocked |
| **Independent Re-Review Gate** | Architecture/Code | **PENDING** | Awaiting completion of worker repairs and final independent re-review |
| **Verifier Release Gate** | `verify-efficient-wait` | **PENDING** | To be executed by controller in subsequent packet |
