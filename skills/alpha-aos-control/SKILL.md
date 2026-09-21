---
name: alpha-aos-control
description: "Autonomous controller and capability pack advisor for alpha-AOS. Automatically triggers when project environment setup (scaffolding, package manifests, dependency installation) completes, during GSD onboarding or Phase 01, or upon natural language requests for capability packs, directory tree exclusion (tree-off), diagnostics (status/doctor), rollback, or repair."
---

# alpha-AOS Unified Controller & Capability Pack Advisor

## Objective

Serve as the single authoritative, natural-language AI agent interface to alpha-AOS across all supported harnesses (Claude Code, Codex, Antigravity, Pi Agent, Hermes Agent). Eliminate manual CLI interaction for developers by autonomously evaluating capability packs, executing prompt-gated materialization, managing directory tree isolation policy (`off` / `inherit`), running system diagnostics, and triggering safe rollback or crash repairs within strict fail-closed boundaries.

---

## Automatic Checkpoint: Project Environment Setup Completion

### The 2 → 3 Trigger Gap Resolution
When working in any project—especially during GSD onboarding, Phase 01, or repository initialization—the AI agent **MUST** automatically trigger a capability check upon the completion of project environment setup:

1. **Setup Completion Signals**:
   - Project scaffolding finishes (e.g., Vite, Next.js, FastAPI, Rust, Go setup).
   - Package manifests are created or modified (e.g., `package.json`, `tsconfig.json`, `pyproject.toml`, `requirements.txt`, `Cargo.toml`, `go.mod`).
   - Dependency installations finish (e.g., `npm install`, `pnpm add`, `pip install`, `poetry install`, `cargo add`).
2. **Immediate Agent Action**:
   - Do **NOT** transition directly into writing application code without evaluating project capability packs.
   - Run **Domain 1: Workspace Inspection & Capability Advisory** immediately.
   - If project capability packs match (e.g. `WEB_REACT`, `WEB_BASE`, `NODE_WORKSPACE`), recommend them to the user before proceeding.

---

## Operational Domains

### Domain 1: Autonomous Capability Pack Advisory & Materialization

#### 1. Workspace Inspection
Execute the read-only plan and status inspection with JSON output:
```bash
alpha-aos project plan . --json
alpha-aos project status . --json
```
*(If `alpha-aos` is not yet globally linked on PATH, invoke via `node <path-to-dist/src/cli.js>`)*

Parse the resulting JSON objects:
- `plan.selected`: Array of matched pack IDs based on repository evidence.
- `plan.planDigest`: Exact 64-character SHA-256 hex string binding all inputs, manifest hashes, and safe inverses.
- `plan.why`: Explanations and repository facts that matched.
- `status.reconciliation.packs`: Existing materialization state in the workspace.

#### 2. Analysis & Comparison
- Check which packs in `plan.selected` are missing or not in `CURRENT` state.
- **If all packs are current**: Inform the user: *"Project capability packs are up to date."*
- **If unmaterialized packs exist**: Proceed to recommendation.

#### 3. Recommendation & Confirmation Request
Present a structured, evidence-backed summary to the user:
- **Pack Name & ID**: (e.g., `WEB_REACT`, `WEB_BASE`)
- **Capabilities Provided**: (e.g., project-specific testing tools, specialized MCP servers, targeted ECC skills)
- **Matched Evidence**: (e.g., detected `react` in `package.json` dependencies)

Ask for confirmation:
> *"Would you like me to install and configure these project capability packs? (e.g., reply 'Yes' or '응, 설치해줘')"*

**CRITICAL SAFETY REQUIREMENT:**
- **MUST NOT** execute `project approve` or `project sync` before receiving explicit confirmation from the user.

#### 4. Autonomous Materialization
Upon user approval:
1. Extract the exact 64-character SHA-256 string from `plan.planDigest`.
   - **INVARIANT**: NEVER guess, truncate, or fabricate the digest.
2. Execute plan approval:
   ```bash
   alpha-aos project approve . --plan-digest <PLAN_DIGEST> --apply
   ```
3. Execute capability synchronization:
   ```bash
   alpha-aos project sync . --apply
   ```

#### 5. Verification & Activation Guidance
1. Re-verify project status:
   ```bash
   alpha-aos project status . --json
   ```
   Confirm that all deployed packs report `status === "CURRENT"`.
2. Advise the user:
   > *"Project capability packs have been successfully materialized. To activate the newly installed MCP tools and skills in your current session, please reload tools or restart your agent session (e.g., restart `agy` or your IDE/CLI).*"

---

### Domain 2: Directory Tree Isolation (Tree-Off Policy)

When collaborating on shared codebases or when the user wants to ensure alpha-AOS does not touch or affect a workspace:
- **Natural Language Triggers**:
  - *"이 프로젝트는 다른 팀원들과 사용하고 있으니 alpha-AOS 기능을 사용하지 못하게 격리시켜줘"*
  - *"이 폴더는 alpha-AOS 기능 제외해줘 / 꺼줘"*
  - *"Disable alpha-AOS for this repository / exclude this folder"*

#### Execution:
1. Apply the directory tree exclusion:
   ```bash
   alpha-aos tree policy set . --mode off
   ```
2. Verify policy state:
   ```bash
   alpha-aos tree status .
   ```
3. Explain to the user:
   - Mode is now set to `off` for this directory tree and all its descendants.
   - Global skills, MCP servers, hooks, and memory are excluded when starting agents in this tree.
   - **Zero Repository Footprint**: Policy is recorded in the external user registry (`~/.alpha-aos/tree-policy.json`). Zero files are created or modified in the user repository.

---

### Domain 3: Directory Tree Restoration (Tree-Inherit Policy)

When the user wants to re-enable alpha-AOS in a previously excluded directory:
- **Natural Language Triggers**:
  - *"alpha-AOS 다시 켜줘"*
  - *"이 프로젝트 격리 해제해줘"*
  - *"Re-enable alpha-AOS for this project"*

#### Execution:
1. Reset policy to inherit:
   ```bash
   alpha-aos tree policy set . --mode inherit
   ```
2. Verify policy state:
   ```bash
   alpha-aos tree status .
   ```
3. Inform the user that alpha-AOS capabilities and global settings are restored for the workspace.

---

### Domain 4: Diagnostics & Health (Status & Doctor)

When the user requests a health check or troubleshooting:
- **Natural Language Triggers**:
  - *"alpha-AOS 상태 점검해줘"*
  - *"닥터 실행해줘 / 진단해줘"*
  - *"Check alpha-AOS health and diagnostics"*

#### Execution:
1. Run fast offline check:
   ```bash
   alpha-aos status
   ```
2. If detailed harness canaries or discovery checks are requested:
   ```bash
   alpha-aos doctor
   ```
3. Summarize findings, active harnesses, and actionable recovery recommendations if any drift or failures are detected.

---

### Domain 5: Safe Rollback & Crash Recovery

When an operation needs to be undone or an interrupted transaction repaired:
- **Natural Language Triggers (Rollback)**:
  - *"방금 작업/설치 롤백해줘"*
  - *"되돌려줘"*
  - *"Roll back the last alpha-AOS operation"*
  - Command:
    ```bash
    alpha-aos rollback --apply
    ```
    *(Optionally specify `--target <harness>` or `--journal <id>` if targeting a specific component)*

- **Natural Language Triggers (Repair)**:
  - *"망가진 상태 수리해줘 / 복구해줘"*
  - *"크래시 복구해줘"*
  - *"Repair broken alpha-AOS state"*
  - Command:
    ```bash
    alpha-aos repair --apply
    ```

---

## Safety Invariants & Guardrails

1. **Digest Integrity**: Plan approvals strictly validate the exact 64-character SHA-256 digest. If file drift occurs after planning, re-run `alpha-aos project plan . --json` and present the updated plan before asking for approval.
2. **No Blind Mutations**: Never edit `.alpha-aos/stack.yaml`, harness settings, or skills manually. All writes must go through safe alpha-AOS transactional boundaries (`project approve`, `project sync`, `tree policy`, `rollback`, `repair`).
3. **Fail-Closed**: If any command fails with a non-zero exit code, halt execution immediately and explain the error finding to the user.
4. **External Isolation State**: Tree-off policy is strictly recorded in external user state and never commits or creates files in the user workspace.
