# Phase 09: Unified Natural Language Controller (`alpha-aos-control`) and Capability Checkpoint Automation - Context

## 1. Executive Summary

alpha-AOS provides a deterministic, cross-platform control plane for AI agent environments across Windows, macOS, and Linux. In Phase 08, we introduced `alpha-aos-pack-advisor` to automate project capability pack discovery, prompt approval, and transactional sync.

However, two major usability frontiers remained:
1. **The 2 → 3 Trigger Gap**: When a developer finishes project environment setup (scaffolding a new framework, generating `package.json`/`pyproject.toml`, or installing dependencies), the agent often transitions to coding without realizing it should proactively check and recommend newly matched project capability packs (e.g. `WEB_REACT`, `WEB_BASE`, `NODE_WORKSPACE`).
2. **Scattered Natural Language Control**: Users working across various project workspaces want to give high-level natural language instructions (e.g. "이 프로젝트는 팀원들과 쓰니 alpha-AOS를 쓰지 못하게 격리시켜줘", "상태 점검해줘", "방금 설치한 거 롤백해줘", "망가진 상태 수리해줘") without having to know or type exact CLI commands like `alpha-aos tree policy set . --mode off`, `alpha-aos doctor`, `alpha-aos rollback --apply`, or `alpha-aos repair --apply`.

To solve this comprehensively with zero routing ambiguity and minimal token overhead, Phase 09 creates a single authoritative, cross-harness skill: **`alpha-aos-control`**. It replaces `alpha-aos-pack-advisor` by subsuming its automated pack planning, prompt approval, and 64-char digest materialization, while adding natural language directory tree policy (tree-off), diagnostics (status & doctor), safe rollback, and crash repair. Furthermore, it institutes an explicit **Capability Checkpoint** in agent instructions and frontmatter triggers so agents proactively recommend capability packs at the exact moment project environment setup completes.

## 2. Core Operational Domains of `alpha-aos-control`

1. **Autonomous Capability Pack Advisory & Materialization**:
   - Inspect workspace: `alpha-aos project plan . --json` + `alpha-aos project status . --json`.
   - Identify unmaterialized candidate packs.
   - Present concise evidence-backed recommendations to the user.
   - Wait for explicit user confirmation.
   - Extract exact 64-char SHA-256 `plan.planDigest`.
   - Run `alpha-aos project approve . --plan-digest <digest> --apply` and `alpha-aos project sync . --apply`.
   - Re-verify `CURRENT` deployment status and instruct user on tool reloading/session restart.

2. **Directory Tree Exclusion (Tree-Off Policy)**:
   - Natural language request: e.g. "이 프로젝트는 다른 팀원과 함께 작업하니 alpha-AOS를 배제/격리해줘", "alpha-aos 꺼줘".
   - Run: `alpha-aos tree policy set . --mode off`.
   - Verify: `alpha-aos tree status .`.
   - Explain fail-closed isolation: no repo files modified, inherited by subdirectories, global MCP/skills/memory excluded.

3. **Directory Tree Policy Restoration (Tree-Inherit Policy)**:
   - Natural language request: e.g. "alpha-AOS 다시 활성화해줘", "격리 풀어줘".
   - Run: `alpha-aos tree policy set . --mode inherit`.
   - Verify: `alpha-aos tree status .`.

4. **Diagnostics & Health (Status & Doctor)**:
   - Natural language request: e.g. "상태 점검해줘", "닥터 실행해줘", "진단해줘".
   - Run: `alpha-aos status` (fast offline check) and/or `alpha-aos doctor` (full diagnostic canary check).
   - Format actionable findings for the user.

5. **Safe Rollback & Crash Recovery**:
   - Natural language request: e.g. "방금 작업/설치 되돌려줘/롤백해줘".
   - Run: `alpha-aos rollback --apply` (or with `--target <harness>` / `--journal <id>`).
   - Natural language request: e.g. "크래시 복구해줘", "손상된 상태 수리해줘".
   - Run: `alpha-aos repair --apply`.

## 3. Resolving the 2 → 3 Trigger Gap (3-Layer Strategy)

1. **Layer 1: Semantic Frontmatter in `alpha-aos-control`**:
   - The skill's `description` explicitly declares activation when project environment setup completes (scaffolding, package manifests created, dependency installs), during GSD onboarding/Phase 01, and upon natural language control requests.
2. **Layer 2: Explicit Capability Checkpoint in Execution Guidance**:
   - In `docs/codex-execution-policy.md` (which syncs to `AGENTS.md`):
     Add an explicit checkpoint rule:
     "At project setup completion (manifests, dependencies, or scaffolding), run `alpha-aos-control` to evaluate project capability packs before continuing."
3. **Layer 3: GSD Phase 01 / Onboarding Checkpoint Practice**:
   - In GSD onboarding and Phase 01 scaffolding workflows, prompt the agent to run the capability check immediately after package installation.

## 4. Invariants & Safety Guardrails

- **Single Authoritative Skill**: `alpha-aos-control` replaces `alpha-aos-pack-advisor` in `catalog/stack.yaml` and `catalog/stack.lock.json`, targeting all 5 harnesses with `invocation: automatic`.
- **Exact Digest Binding**: Plan approval MUST use the exact 64-character SHA-256 string from `project plan . --json`. No truncating or guessing.
- **Fail-Closed Operations**: If any command exits non-zero or detects drift, stop and report immediately.
- **Tree-Off Non-Invasiveness**: `tree policy set . --mode off` records state in the external user registry (`~/.alpha-aos/tree-policy.json`); zero files are created or edited in the user repository.
