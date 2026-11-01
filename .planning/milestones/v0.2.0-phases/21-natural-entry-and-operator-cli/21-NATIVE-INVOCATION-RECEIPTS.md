# Phase 21: Native Invocation Receipts across Supported Harnesses

**Date:** 2026-10-10  
**Phase:** 21 (Natural Entry and Operator CLI)  
**Requirement:** UX-01  
**Skill:** `alpha-aos-task` (`skills/alpha-aos-task/SKILL.md`)  
**Locked Hash:** `db309c51342fcf2f52239c542c30e19824ed3028d869b4917b535f7d61905685`

---

## 1. Summary of Support Matrix

| Harness | Exact Detected Version | Installed Destination | File SHA-256 | Native Discovery / Invocation Status | Verification Evidence / Reason |
|---------|------------------------|-----------------------|--------------|--------------------------------------|--------------------------------|
| **Claude Code** | `2.1.291 (Claude Code)` | `C:\Users\alpha\.claude\skills\alpha-aos-task\SKILL.md` | `db309c5...` | **PROVEN / VERIFIED** | Live session invocation via `claude -p` successfully read the skill, explained decision rules (D-01..D-04), ordering invariant, and CLI verbs. |
| **Codex** | `codex-cli 0.161.0` | `C:\Users\alpha\.agents\skills\alpha-aos-task\SKILL.md` | `db309c5...` | **human_needed / unverified** | Skill file synced and verified on disk. Non-interactive model execution blocked by elevated Windows sandbox provisioning failure (`helper_unknown_error`). Handed off to Phase 22. |
| **Antigravity** | `1.3.2 (agy)` | `C:\Users\alpha\.gemini\config\skills\alpha-aos-task\SKILL.md` | `db309c5...` | **PROVEN / VERIFIED** | Active session startup automatically discovered and loaded `alpha-aos-task` skill from the config directory into session system prompts. |
| **Pi Agent** | `1.1.0` | `C:\Users\alpha\.agents\skills\alpha-aos-task\SKILL.md` | `db309c5...` | **PROVEN / VERIFIED** | Live session invocation via `"" | pi -p` with configured `freellmapi` endpoint successfully discovered and read `alpha-aos-task`, accurately explaining D-01..D-04 paths, preview/approval lifecycle, and boundary rules. |
| **Hermes Agent** | `v0.21.5+8825.g69d126b` | `C:\Users\alpha\AppData\Local\hermes\skills\alpha-aos-task\SKILL.md` | `db309c5...` | **PROVEN / VERIFIED** | Live session invocation via `hermes --oneshot` successfully read the skill, identified two-path routing, strict contract lifecycle, and safety boundaries. |

---

## 2. Detailed Invocation Transcripts & Diagnostic Records

### 1) Claude Code (`2.1.291`)
- **Invocation Command:**
  ```powershell
  claude -p "Explain the alpha-aos-task skill: what does it do and what are its paths?" --dangerously-skip-permissions
  ```
- **Observed Output:**
  ```text
  The alpha-aos-task skill is alpha-AOS's natural-language task entry and autonomous-workflow coordinator...
  Decision rules for task intake:
  - General task request (default, D-01/D-02): e.g. "Implement feature X" -> routes to ordinary conversational GSD in current session ($gsd-quick, $gsd-execute-phase, $gsd-debug). No contract, no background files.
  - Ambiguous autopilot request (D-03): refuses to guess and asks only clarifying questions needed.
  - Explicit autopilot request (D-04): goes straight to contract preview (path selection only, not execution permission).
  The enforced ordering invariant:
  Path Selection -> Read-Only Preview -> Exact Digest Approval -> Separate Start -> Status/Report Tracking
  ```
- **Outcome:** Complete native discovery, interpretation, and read-only protocol comprehension.

### 2) Codex (`codex-cli 0.161.0`)
- **Diagnostic Command:**
  ```powershell
  codex doctor
  ```
- **Observed Findings:**
  - `CODEX_HOME`: `C:\Users\alpha\.codex`
  - `state DB`, `logs DB`, `queue DB`: healthy and verified.
  - `auth`: `chatgpt` mode configured.
  - `✗ sandbox`: `elevated Windows sandbox provisioning recorded a structured failure: helper_unknown_error`.
- **Reason for Unverified Status:**
  Automated non-interactive execution requires working sandbox privilege elevation or interactive OAuth browser authentication on Windows. Kept transparently as `human_needed / unverified` for Phase 22's cross-platform proof matrix.

### 3) Antigravity (`1.3.2`)
- **Discovery Mechanism:**
  Native configuration lookup at `C:\Users\alpha\.gemini\config\skills\alpha-aos-task\SKILL.md`.
- **Observed Discovery Evidence:**
  The active runtime environment system prompt loaded the skill descriptor at launch:
  ```text
  alpha-aos-task (C:\Users\alpha\.gemini\config\skills\alpha-aos-task\SKILL.md):
  Natural-language task entry and autonomous workflow coordinator for alpha-AOS.
  Automatically triggers on natural task requests, new task intents, or requests for autonomous autopilot execution...
  ```
- **Outcome:** Direct native registration and operational availability in session.

### 4) Pi Agent (`1.1.0`)
- **Invocation Command:**
  ```powershell
  "" | pi -p "Explain the alpha-aos-task skill: what does it do and what are its paths?"
  ```
- **Observed Output:**
  ```text
  ## alpha-aos-task Skill
  Location: C:\Users\alpha\.agents\skills\alpha-aos-task\SKILL.md

  ### What It Does
  The alpha-aos-task skill is the natural-language task entry and autonomous workflow coordinator for alpha-AOS.
  It serves as the coordination interface across all supported harnesses (Claude Code, Codex, Antigravity, Pi Agent, Hermes Agent).
  Its core job is to guide users between two modes of operation and enforce strict authorization boundaries:
  - Ordinary Conversational GSD (default)
  - Autonomous Autopilot

  ### Decision Paths (D-01 through D-04)
  | Path | Trigger | Behavior |
  | D-01/D-02: General Task Request | User expresses a general task | Clarify goal, present two-path choice. |
  | D-03: Ambiguous Autopilot Request | Unclear criteria/boundaries | Ask clarifying questions only. |
  | D-04: Explicit Autopilot Request | Explicitly asks for autopilot | Direct to read-only contract preview. |

  ### Contract Review & Execution Protocol (D-05, D-08–D-10)
  1. Read-Only Contract Preview
  2. Exact-Digest Approval
  3. Separate Execution Start
  4. Status/Report Tracking
  ```
- **Outcome:** Complete native discovery, interpretation, and read-only protocol comprehension via configured local `freellmapi` endpoint with piped EOF stdin handling.

### 5) Hermes Agent (`v0.21.5+8825.g69d126b`)
- **Invocation Command:**
  ```powershell
  hermes --oneshot "What is alpha-aos-task skill?"
  ```
- **Observed Output:**
  ```text
  **alpha-aos-task** is the natural-language task entry and autonomous workflow coordinator for alpha-AOS.
  Key behavior:
  1. Two-path routing: Ordinary Conversational GSD (default) vs Autonomous Autopilot.
  2. Explicit autopilot requests: skips two-path prompt and proceeds to read-only contract preview.
  3. Strict contract lifecycle: Read-only preview -> Exact-digest approval -> Separate start -> Status/report tracking.
  4. Safety rules: Autopilot consent for Task A never extends to Task B; environment checks never authorize task execution; empty requests rejected.
  ```
- **Outcome:** Full native discovery and accurate functional distillation.

---

## 3. Residual Gap Handoff

In accordance with Phase 21 constraints (AGENTS.md and 21-VALIDATION.md):
- Real live-host invocation receipts are proven for **Claude Code**, **Antigravity**, **Hermes Agent**, and **Pi Agent**.
- Host-level sandbox prerequisites on Windows currently limit headless execution for **Codex**, which remains explicitly documented as `human_needed / unverified`.
- This single Codex host cell is carried as an open validation target into Phase 22's dedicated three-OS live-host matrix.
