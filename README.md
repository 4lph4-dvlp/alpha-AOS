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

## Installation

Currently, alpha-AOS is installed from source. (Direct package manager installation such as `npm install -g alpha-aos` will be available upon official npm registry release).

### Installation from Source (Git Clone)

Clone the repository, install dependencies, and build the verified build artifact:

```sh
# 1. Clone repository and enter directory
git clone https://github.com/4lph4-dvlp/alpha-AOS.git
cd alpha-AOS

# 2. Install dependencies and build verified artifact (required)
npm ci
npm run build
```

#### Windows (PowerShell)

```powershell
# Preview what would be configured across detected harnesses
.\scripts\install.ps1

# Apply to all detected supported harnesses
.\scripts\install.ps1 -Apply

# Or restrict to specific harnesses
.\scripts\install.ps1 -Apply -Target "claude,codex,antigravity"
```

#### macOS / Linux (POSIX Shell)

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

### Scenario I: Structured Independent Milestone Final Review
- **Question**: *"How do I ensure a milestone or phase meets all mandatory criteria before declaring it complete?"*
- **Solution**: Run the independent final reviewer gate:
  ```sh
  # 1. Preview final review readiness (zero model turns, dry-run only)
  alpha-aos task final-review <contract.json>

  # 2. Execute independent review in a fresh, read-only session
  alpha-aos task final-review <contract.json> --contract-digest <digest> --apply
  ```
  The reviewer runs in a fresh, isolated session using one of the 5 native harnesses (Claude, Codex, Antigravity, Pi, Hermes). All mandatory criteria, automated test receipts, and cross-phase constraints (userFlow, approvalBoundaries, gsdStateOwnership, reviewerIndependence) are verified without implicit passes. Blocking defects route to GSD repair, while unrelated advisory proposals are deferred to `suggestions.json` without blocking the milestone.

---

## What is Installed (Global Stack Matrix)

For the complete 35-cell role & capability support evaluation and verified handoffs, see the [v0.2.0 Support Matrix](./docs/SUPPORT_MATRIX_v0.2.0.md) and [v0.2.0 Release Notes](./docs/RELEASE_NOTES_v0.2.0.md).

| Layer | Component / Package | Targets | Notes |
|---|---|---|---|
| **Workflow & State Spine** | GSD Core `standard` | Claude, Codex, Antigravity, Pi | Governs project planning, phase execution, and verification. |
| **Worker Harness** | Hermes Agent | Hermes | Configured as worker-only; does not write GSD planning state. |
| **Cross-Harness Memory** | ECC `unified-memory` | All five harnesses | Shared Memory Vault across agents. |
| **Library Documentation** | ECC `documentation-lookup` + Context7 | All five harnesses | Real-time docs via Context7 stdio MCP gateway. |
| **Multi-Source Research** | ECC `deep-research` + Exa/Firecrawl | All five harnesses | Multi-source web search & extraction. |
| **Filtered Web Scraping** | Firecrawl Proxy | All five harnesses | Local SDK proxy restricting upstream 25 tools to 4 safe extraction tools. |
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

alpha-AOS uses `git pull --ff-only`, rebuilds the CLI, and reconciles only the verified `catalog/stack.lock.json`. Unverified candidate releases (`candidate.lock.json`) are never applied on user workstations. `update --check` shows the registry's latest versions; an `update` status means the version has not been promoted into the stable lock yet, so `update --apply` will not install it until the weekly promotion lands.

### 3. Automated Weekly Dependency Promotion

Upstream tools (GSD Core, ECC Universal, Context7, Exa, Firecrawl, Pi MCP adapter) are promoted into the stable lock without manual approval, but only through verification gates:

- **Monday 03:17 UTC (12:17 KST)**: [`.github/workflows/dependency-candidate.yml`](.github/workflows/dependency-candidate.yml) resolves the registry's latest versions, checks their integrity, writes every changed package into `catalog/stack.lock.json` on the `automation/dependency-candidate` branch (re-pinning ECC skill hashes when ECC moves), and verifies that commit with the full CI suite plus real GSD, ECC, MCP server, and Pi bridge fixtures on Linux, macOS, and Windows.
- **Wednesday 03:17 UTC (12:17 KST)**: [`.github/workflows/auto-promote.yml`](.github/workflows/auto-promote.yml) takes the commit Monday verified, rebases it onto current `main`, re-checks the registry (a version that was unpublished, altered, or is younger than 36 hours is refused), verifies the rebased commit again, and fast-forwards `main` to exactly that commit.
- **Refusal is the safe default**: Any failure fails the workflow run, leaves `main` untouched, and triggers GitHub's failure notification. All packages in a week are promoted together, so one failing package holds the whole week back. The next Monday run starts over from the latest registry versions.
- **Pack Skill Drift Audit**: [`.github/workflows/pack-skill-drift.yml`](.github/workflows/pack-skill-drift.yml) runs weekly **every Monday at 04:17 UTC (13:17 KST)** to verify that catalog pack skills match pinned hashes.
- **Manual Trigger**: Either workflow can be started at any time with the GitHub Actions `workflow_dispatch` button, for example to retry Wednesday's promotion after `main` moved during verification.

### 4. Running Verification and Promotion Manually

You never have to do this for the weekly cycle. Run the two workflows by hand when you want a new upstream version sooner, or to retry after a refused run. The order is always the same:

1. **Verify** — run *Dependency candidate* (the Monday workflow).
2. **Promote** — run *Dependency auto-promotion* (the Wednesday workflow) after verification succeeded.
3. **Apply** — update your machine from `main`.

Two timing rules apply to step 2:

- It promotes only a commit that a successful *Dependency candidate* run verified within the last 7 days.
- Every newly promoted version must have been published at least 36 hours earlier. If one is younger, the run fails at *Re-verify promoted packages against the registry*; run it again after the 36 hours have passed.

#### Option A: Command line (GitHub CLI)

Requires the [GitHub CLI](https://cli.github.com/) logged in with write access to this repository (`gh auth status`). The commands work in PowerShell and POSIX shells.

```sh
# 0. See which upstream versions are newer than the stable lock
alpha-aos update --check

# 1. Verify: start the Monday workflow and follow it (about 15 minutes)
gh workflow run dependency-candidate.yml --ref main
# wait a few seconds so the new run is listed, then:
gh run watch "$(gh run list --workflow dependency-candidate.yml --limit 1 --json databaseId --jq '.[0].databaseId')" --exit-status

#    Verified if every job passed and the run lists the "verified-candidate" artifact.
#    The candidate commit message names the versions it will promote:
git fetch origin automation/dependency-candidate
git log -1 --format=%s FETCH_HEAD

# 2. Promote: start the Wednesday workflow and follow it
gh workflow run auto-promote.yml --ref main
gh run watch "$(gh run list --workflow auto-promote.yml --limit 1 --json databaseId --jq '.[0].databaseId')" --exit-status

#    Promoted if main now ends with "chore(deps): promote ...":
git fetch origin
git log -1 --format=%s origin/main
```

If step 1 prints `No dependency version changes.` in *Stage promotion commit* and skips the other jobs, there is nothing to promote. If step 2 finishes with *Verify* and *Fast-forward main* skipped, there was no verified commit to land (or it is already on `main`).

#### Option B: GitHub web

1. **Verify**
   - Open the repository's **Actions** tab and select **Dependency candidate** in the left sidebar.
   - Click **Run workflow**, keep **Branch: main**, and click the green **Run workflow** button.
   - Refresh and open the new run. It is verified when every job shows a green check and the **Artifacts** section at the bottom of the run's **Summary** lists `verified-candidate`. The *Stage promotion commit* job log names the promoted versions.
2. **Promote**
   - In **Actions**, select **Dependency auto-promotion**, then **Run workflow** → **Branch: main** → **Run workflow**.
   - It is promoted when every job, including **Fast-forward main**, shows a green check. The **Code** tab then shows the latest commit on `main` as `chore(deps): promote ...`.
3. **When a run fails**
   - Open the red run and click the job with the red mark. The failing step name tells you why; the [refusal table](docs/how-to/promote-dependencies.md#4-when-a-week-is-refused) explains each step and what to do.
   - To retry, click **Re-run all jobs** on the run page, or start the workflow again with **Run workflow**.

#### Apply the promoted versions on your machine

After `main` carries the promotion, use the bootstrap update from [section 1](#1-repository--global-cli-update-one-click-bootstrap) (`.\scripts\update.ps1 -Apply` or `sh ./scripts/update.sh --apply`), then confirm with `alpha-aos update --check`: every row should read `current`.

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
