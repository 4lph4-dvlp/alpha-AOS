# alpha-AOS

[English](./README.md) | [한국어 (Korean)](./README.ko.md)

Declarative, cross-platform installer and updater for a small, consistent AI-agent workflow stack.

alpha-AOS configures the supported harnesses already present on a machine: Claude Code, Codex, Antigravity, Pi Agent, and Hermes Agent. It uses GSD as the workflow/state spine, installs exactly three selected ECC skills, and registers Context7, Exa, and a four-tool Firecrawl surface. It does not install the harness applications themselves and does not install an ECC profile.

The installer is deterministic and dry-run first. It detects installed harnesses, compares them with the stable lock, runs isolated package fixtures only when a change is needed, applies targets sequentially, verifies the result, and journals alpha-AOS-owned file writes. It never applies `candidate.lock.json` on an end-user machine.

---

## Requirements

- Windows 11, current macOS, or a current Linux distribution
- Git
- Node.js 24 or newer
- npm 10 or newer
- One or more supported agent harnesses already installed and signed in

Optional MCP credentials are read from user environment variables:
- `EXA_API_KEY`: Required for authenticated Exa web searches.
- `CONTEXT7_API_KEY`: Optional; set if your Context7 account requires authentication.
- `FIRECRAWL_API_KEY`: Optional; set for authenticated Firecrawl scraping.

alpha-AOS stores only these variable names, never their values or secrets.

---

## Quick Start (Workstation Setup)

Clone the repository and run the platform bootstrap script from the repository root:

```sh
git clone https://github.com/4lph4-dvlp/alpha-AOS.git
cd alpha-AOS
```

### Windows (PowerShell)

```powershell
# Preview what would be configured across detected harnesses
.\scripts\install.ps1

# Apply to all detected supported harnesses
.\scripts\install.ps1 -Apply

# Or restrict to specific harnesses
.\scripts\install.ps1 -Apply -Target "claude,codex,antigravity"
```

### macOS / Linux (POSIX Shell)

```sh
# Preview what would be configured
sh ./scripts/install.sh

# Apply to all detected supported harnesses
sh ./scripts/install.sh --apply

# Or restrict to specific harnesses
sh ./scripts/install.sh --apply --target claude,codex
```

### Verification

After applying, restart the affected harnesses (or restart your terminal / IDE), then verify stack health:

```sh
alpha-aos doctor
alpha-aos status
alpha-aos install
```

All selected components should report `CURRENT` and health checks should pass.

---

## Architecture: Global Stack vs. Project-Specific Stack

alpha-AOS enforces a strict boundary between global baseline tools and project-specific capabilities:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        USER WORKSTATION (Global)                       │
│  • GSD Core standard (Lifecycle Spine)                                 │
│  • ECC Global Skills (unified-memory, documentation-lookup,            │
│                       deep-research)                                   │
│  • Curated MCP Servers (Context7, Exa, Firecrawl bounded proxy)        │
│  • Built-in Owned Skills (alpha-aos-control, alpha-aos-ship)           │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
       ┌────────────────────────────┴────────────────────────────┐
       ▼                                                         ▼
┌──────────────────────────────┐        ┌──────────────────────────────┐
│     Project A (Python CLI)   │        │     Project B (React Web)    │
│  • BROWNFIELD_INIT Pack      │        │  • WEB_BASE Pack             │
│  • Project-local conventions │        │  • WEB_REACT Pack            │
│  • Zero React/Node clutter   │        │  • frontend-a11y Skill       │
└──────────────────────────────┘        └──────────────────────────────┘
```

1. **Global Baseline**: Broadly useful, low-risk capabilities (GSD workflow, memory vault, documentation lookup, web research) are installed user-wide across Claude, Codex, Antigravity, Pi, and Hermes.
2. **Project Capability Packs**: Language/framework-specific tools (React, Python, Brownfield conventions, Database migrations) are **NEVER** installed globally. They are deterministically planned, evidence-matched, and materialized only in projects that require them.
3. **No Cross-Pollution**: Working in a Python repository never installs React skills, and working in a Go project never pollutes your agent with unrelated MCP servers.

---

## Using alpha-AOS in Your Projects

When working in any project directory (e.g. `D:\dev\my-project`), you can discover and materialize tailored capability packs, manage directory isolation, run diagnostics, and rollback changes using either an **Autonomous AI Agent Workflow** or a **Manual Developer CLI Workflow**.

### Mode 1: Autonomous AI Agent Workflow (Zero Friction with alpha-aos-control)

All supported harnesses (Antigravity, Claude Code, Codex, Pi, Hermes) come with the built-in `alpha-aos-control` skill. You never need to memorize commands or copy-paste 64-character hash digests manually.

#### 1. Proactive Capability Advisory (Environment Setup Checkpoint)
When you finish project scaffolding (e.g. creating Vite/Next.js/FastAPI apps), create/edit package manifests (`package.json`, `tsconfig.json`, `pyproject.toml`, `requirements.txt`, `Cargo.toml`), or finish dependency installs (`npm install`, `pnpm add`, `pip install`, `cargo add`), the agent **automatically invokes `alpha-aos-control`**:
- **Background Scan**: Runs `alpha-aos project plan . --json` and `alpha-aos project status . --json`.
- **Recommendation**: If unmaterialized capability packs match your repository evidence, the agent explains what it found:
  > *"This workspace contains an existing React codebase. I recommend installing the `WEB_REACT` capability pack (providing frontend-a11y skills and React testing tools). Would you like me to install it?"*
- **Simple Confirmation**: Simply reply:
  > **"Yes"** (or **"응, 설치해줘"**)
- **Automated Approval & Materialization**: The agent extracts the exact 64-character SHA-256 `planDigest`, approves the plan, and synchronizes capabilities automatically:
  - `alpha-aos project approve . --plan-digest <64-char-digest> --apply`
  - `alpha-aos project sync . --apply`
- **Reload & Ready**: The agent verifies that deployment is `CURRENT` and prompts you:
  > *"Project capability packs have been materialized. Please reload tools or restart your agent session to activate the new capabilities."*

#### 2. Natural Language Workspace Operations
In any repository or workspace, you can manage alpha-AOS entirely through natural language:
- **Directory Tree Exclusion (Tree-Off Policy)**:
  - User: *"이 프로젝트는 다른 팀원들과 사용하고 있으니 alpha-AOS 기능을 사용하지 못하게 격리시켜줘"* (or *"Disable alpha-AOS for this project"*)
  - Agent executes `alpha-aos tree set . --mode off` and verifies with `alpha-aos tree inspect .`. Global skills and MCPs are excluded without writing a single file to your repository.
- **Directory Tree Restoration (Inherit Policy)**:
  - User: *"alpha-AOS 다시 켜줘"* (or *"Re-enable alpha-AOS for this project"*)
  - Agent executes `alpha-aos tree remove .` (or `alpha-aos tree set . --mode managed`).
- **Diagnostics & Health**:
  - User: *"alpha-AOS 상태 점검해줘"* / *"닥터 실행해줘"*
  - Agent executes `alpha-aos status` / `alpha-aos doctor` and reports findings.
- **Safe Rollback & Recovery**:
  - User: *"방금 작업 롤백해줘"* / *"망가진 상태 수리해줘"*
  - Agent executes `alpha-aos rollback --apply` or `alpha-aos repair --apply`.

### Mode 2: Manual Developer CLI Workflow

If you prefer inspecting and running commands manually from your terminal:

```sh
# 1. Inspect evidence-based capability plan and explain why packs matched
alpha-aos project plan . --why

# 2. Check current project deployment and receipt status
alpha-aos project status .

# 3. Approve the reviewed plan using its exact 64-character planDigest
# (The digest is printed at the bottom of the plan preview)
alpha-aos project approve . --plan-digest <64-character-digest> --apply

# 4. Transactionally materialize the approved skills, MCP tools, and receipts
alpha-aos project sync . --apply

# 5. Verify that all matched packs report CURRENT
alpha-aos project status .
```

---

## Practical Scenarios & Common Questions (FAQ)

### Scenario A: Onboarding an Existing Codebase (Brownfield)
- **Situation**: You open an existing repository that already contains code (e.g. Python, TypeScript, Go).
- **Behavior**: alpha-AOS detects existing source directories (`src`, `lib`, etc.) and the absence of conventions, selecting `BROWNFIELD_INIT`.
- **Outcome**: The agent gains project-specific legacy style inheritance, conventions alignment, and brownfield GSD lifecycle awareness without modifying your project git history.

### Scenario B: Frontend & Web Development (React / Next.js)
- **Situation**: You enter a project whose `package.json` declares `react` or `next`.
- **Behavior**: alpha-AOS detects web framework dependencies and selects `WEB_BASE` and `WEB_REACT`.
- **Outcome**: The agent gains accessibility auditing (`frontend-a11y`) and web testing tools scoped strictly to that project directory.

### Scenario C: Starting a Brand-New Project (Greenfield)
- **Situation**: You start in an empty directory and run `/gsd-new-project`.
- **Behavior**: alpha-AOS detects no pre-existing code (`fileAbsent`), classifying it as greenfield. Only global baseline capabilities are active until project files or dependencies are added.

### Scenario D: Enterprise Confidential Project Opt-Out (Tree-Off Policy)
- **Question**: *"What if a proprietary or NDA project must NEVER have AI agent integration or alpha-AOS active?"*
- **Solution**: Set an explicit tree policy with `--mode off`:
  ```sh
  # Block alpha-AOS from inspecting or managing this directory tree
  alpha-aos tree set /path/to/confidential-project --mode off
  ```
  Once set, alpha-AOS fails closed on that directory and leaves zero state or files inside it.

### Scenario E: Isolated / Sandboxed Project Runtime
- **Question**: *"What if a project needs an isolated runtime without inheriting user-global skills or configs?"*
- **Solution**: Use `project isolate`:
  ```sh
  # Initialize and trust isolated project policy
  alpha-aos project isolate init /path/to/project --mode project-only --harness claude --trust --apply
  
  # Sync isolated runtime and launch through it
  alpha-aos project isolate sync /path/to/project --apply
  alpha-aos project run claude /path/to/project --apply
  ```
  Generated state lives under `~/.alpha-aos/isolated/<project-id>/` outside the repository, preventing accidental leakage.

### Scenario F: Mandatory Quality Gates (Pre-Commit / Pre-Release)
- **Question**: *"How do I ensure security reviews, database migrations, and release checks are not bypassed?"*
- **Solution**: Run alpha-AOS gate verification:
  ```sh
  alpha-aos gate check
  alpha-aos gate check --apply
  ```
  If changes touch authentication, payment paths, or database schemas, the gate engine deterministically enforces gate receipts before allowing lifecycle transitions.

### Scenario G: Safe Rollback & Crash Recovery
- **Question**: *"What if an installation or sync was interrupted or made an unwanted change?"*
- **Solution**: Every file modification made by alpha-AOS is snapshotted and journaled under `~/.alpha-aos/journal/`:
  ```sh
  # List recent transactions
  alpha-aos rollback
  
  # Preview rollback for a specific operation
  alpha-aos rollback <operation-id>
  
  # Apply byte-exact rollback
  alpha-aos rollback <operation-id> --apply
  ```
  If a crash occurred during an operation:
  ```sh
  # Inspect and recover from interrupted writer lock or transaction
  alpha-aos repair
  alpha-aos repair --apply
  ```

### Scenario H: Shipping Verified GSD Phases
- **Question**: *"How do I ship my completed work after finishing a GSD phase?"*
- **Solution**: Use the repository-owned `/alpha-aos-ship` skill:
  ```sh
  # In Claude Code or supported harness:
  /alpha-aos-ship <phase-number>
  ```
  This cleanly triggers the GSD ship workflow (clean tree check, branch verification, push, PR creation) without enabling GSD's broader utility clutter.

---

## What is Installed (Global Stack Matrix)

| Layer | Component / Package | Targets | Notes |
|---|---|---|---|
| **Workflow & State Spine** | GSD Core `standard` (`1.14.0`) | Claude, Codex, Antigravity, Pi | Governs project planning, phase execution, and verification. |
| **Worker Harness** | Hermes Agent | Hermes | Configured as worker-only; does not write GSD planning state. |
| **Cross-Harness Memory** | ECC `unified-memory` | All five harnesses | Shared Memory Vault across agents. |
| **Library Documentation** | ECC `documentation-lookup` + Context7 | All five harnesses | Real-time docs via Context7 stdio MCP gateway. |
| **Multi-Source Research** | ECC `deep-research` + Exa/Firecrawl | All five harnesses | Multi-source web search & extraction. |
| **Filtered Web Scraping** | Firecrawl Proxy (`3.25.2`) | All five harnesses | Local SDK proxy restricting upstream 25 tools to 4 safe extraction tools. |
| **Autonomous Controller** | `alpha-aos-control` | All five harnesses | Unifies autonomous capability pack advisory, directory tree-off policy, diagnostics, and rollback/repair. |
| **GSD Shipping Workflow** | `alpha-aos-ship` | Claude Code | User-invocable PR & branch shipping skill. |
| **Project Isolation** | alpha-AOS launch adapters | All five harnesses | Isolated runtime with fail-closed bounds. |

---

## Updating

The updater ensures your system stays on verified, immutable releases:

### 1. Repository & Global CLI Update (One-Click Bootstrap)

```powershell
# Windows (PowerShell)
.\scripts\update.ps1          # check and preview update plan
.\scripts\update.ps1 -Apply   # git ff-only, npm ci, rebuild, link, and reconcile
```

```sh
# macOS / Linux (POSIX Shell)
sh ./scripts/update.sh
sh ./scripts/update.sh --apply
```

### 2. Direct Harness Reconcile via CLI

You can also reconcile installed AI harness configurations directly using the CLI:

```sh
# Preview component changes across detected harnesses
alpha-aos update --check

# Reconcile all detected harnesses against the stable lock
alpha-aos update --apply

# Or restrict reconciliation to specific harnesses
alpha-aos update --apply --target codex,claude
```

alpha-AOS uses `git pull --ff-only`, rebuilds the CLI, and reconciles only the reviewed `catalog/stack.lock.json`. Unverified candidate releases (`candidate.lock.json`) are never applied on user workstations.

### 3. Automated Upstream Version Check Cadence

Upstream tools (GSD Core, ECC Universal, Context7, Exa, Firecrawl, Pi MCP adapter) are tracked through automated GitHub Actions workflows:

- **Weekly Check Schedule**: [`.github/workflows/dependency-candidate.yml`](.github/workflows/dependency-candidate.yml) runs automatically **every Monday at 03:17 UTC (12:17 KST)**.
- **Automated PR Staging**: When newer upstream versions appear in the npm registry, the workflow automatically creates/refreshes an `automation/dependency-candidate` branch and opens a candidate PR.
- **Pack Skill Drift Audit**: [`.github/workflows/pack-skill-drift.yml`](.github/workflows/pack-skill-drift.yml) runs weekly **every Monday at 04:17 UTC (13:17 KST)** to verify that catalog pack skills match pinned hashes.
- **3-Tier Verification Gate**: The candidate must pass credential-free isolated fixtures, comprehensive regression test suites across Linux/macOS/Windows, and red-main guard validation before maintainers promote it into `catalog/stack.lock.json`.
- **Manual Trigger**: Maintainers can trigger an immediate upstream version check at any time via the GitHub Actions `workflow_dispatch` button.

---

## Development and Testing

```sh
# Install dependencies
npm ci

# Typecheck and build
npm run check
npm run build
npm run build:check

# Run test suite
npm test

# Audit tarball allowlist
npm run audit-tarball
```

All mutation commands are dry-run by default. Mutation requires passing `--apply`.

---

## License

Licensed under the [Apache License 2.0](./LICENSE).
