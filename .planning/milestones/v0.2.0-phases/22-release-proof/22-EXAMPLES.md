# Phase 22 End-to-End Examples: Development & CoursePilot Workloads

**Date:** 2026-10-10  
**Phase:** 22-release-proof  
**Release Target:** v0.2.0  
**Requirements Satisfied:** VER-04 (D-13, D-14, D-15, D-16)  
**Schema & Test Binding:** `src/core/release-examples.ts`, `test/release-examples.test.ts`, `test/fixtures/release-development-game.mjs`

---

## 1. Executive Summary

In accordance with VER-04, D-13..D-16, and the v0.2.0 release validation plan:
- **Comprehensive Criterion Accounting (D-13):** Every required behavioral and structural criterion is accounted for with automated input, observable outputs, and test results.
- **Identical Revision Reviewer Witness (D-14):** The development task links an independent reviewer witness receipt operating on the **exact same Git revision SHA and artifact digest**.
- **LMS Authentication Discipline (D-15):** The CoursePilot materials task verifies local file persistence, byte counts, and SHA-256 digests in an isolated fixture, while explicitly recording live LMS authentication status as **`UNVERIFIED`**. Fixture success is never misrepresented as live university LMS validation.
- **Obligatory Capability Receipt Gating (D-16):** Both workloads enumerate all applied capabilities (global/project ECC skills, MCP tools, project packs, mandatory lifecycle hooks). A task with missing required capability receipts is blocked from `completed` status.
- **Adjacency & Ordering Invariants (VER-04):** Identical filenames occurring in different modules (`CS101/W01/M01/syllabus.pdf` vs `CS101/W01/M02/syllabus.pdf`) preserve distinct identities and are never collapsed. All criteria and capabilities render in deterministic identifier order.

---

## 2. Development Task Example: CLI First-Person Game

### 1) Task Overview
- **Title:** CLI First-Person 3D Viewport Game Simulation
- **Revision SHA:** `c0ffee1234567890abcdef1234567890abcdef12`
- **Artifact Digest:** `d00d001234567890abcdef1234567890abcdef12`
- **Overall Status:** **`COMPLETED`**
- **Lifecycle Sequence:** GSD Task Intake (`alpha-aos-task`) → Contract Approval → Execution → Report Generation → Independent Review Witness

### 2) Criteria Verification Table

| Criterion ID | Mandatory | Status | Automated Inputs | Observable Output / Evidence | Notes / Rubric |
| --- | --- | --- | --- | --- | --- |
| `start_screen` | yes | **accepted** | `start` | `screen=first-person; player.health=100; player.x=0; player.y=0` | Viewport rendered and initial state initialized |
| `movement_inputs` | yes | **accepted** | `move:forward, move:back, turn:left, turn:right` | `player_moved_forward; player_moved_back; player_turned_left; player_turned_right` | Coordinate delta and heading orientation verified |
| `fire_input` | yes | **accepted** | `fire` | `weapon_fired; target_hit_and_destroyed; targetsRemaining=2` | Projectile calculation and hit registration functional |
| `collision_rules` | yes | **accepted** | `collide:hazard` | `collision_detected_hazard; player.health=0; screen=game_over` | Hazard collision triggers terminal failure state |
| `terminal_state` | yes | **accepted** | `fire, fire, fire` | `targetsRemaining=0; outcome=win; screen=game_over` | Objective completed; terminal win state reached |
| `subjective_fun` | no | **unknown** | `-` | `no agreed rubric defined` | Subjective engagement requires agreed rubric; kept as non-blocking finding |

### 3) Independent Reviewer Witness (D-14)
- **Reviewer Harness:** Claude Code (`2.1.291 (Claude Code)`)
- **Reviewer Target Revision SHA:** `c0ffee1234567890abcdef1234567890abcdef12` *(matches target revision)*
- **Reviewer Artifact Digest:** `d00d001234567890abcdef1234567890abcdef12` *(matches target digest)*
- **Reviewer Verdict:** **`accepted`**
- **Receipt Reference:** `receipts/witnesses/review-dev-01.json`

### 4) Applied Capability Invocations (D-16)

| Capability ID | Category | Tool / Component | Required | Invoked | Outcome | Receipt Reference / Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `skill_entry` | skill | `alpha-aos-task` | yes | yes | **ok** | `receipts/capabilities/cap-skill-task.json` |
| `mcp_tools` | mcp | `context7` | yes | yes | **ok** | `receipts/capabilities/cap-mcp-context7.json` |
| `pack_materialization` | pack | `project-pack-dev` | yes | yes | **ok** | `receipts/capabilities/cap-pack-dev.json` |
| `hook_verify` | hook | `gsd-hook` | yes | yes | **ok** | `receipts/hooks/hook-execute-post.json` |

---

## 3. CoursePilot Task Example: Materials Acquisition

### 1) Task Overview
- **Title:** CoursePilot Multi-Level Materials Download & Verification
- **Revision SHA:** `c0ffee1234567890abcdef1234567890abcdef12`
- **Artifact Digest:** `d00d001234567890abcdef1234567890abcdef12`
- **Overall Status:** **`COMPLETED`**
- **Lifecycle Sequence:** Manifest Intake → Scope Approval → Connector Execution (`perform`) → File Persistence Verification → Report

### 2) Material Items Verification (Multi-Level Identity Preserved)

In accordance with VER-04 edge adjacency rules, files sharing identical names across different courses, weeks, or modules are kept distinct and never merged.

| Course ID | Week ID | Module ID | File ID | Filename | Status | On Disk | Source Identity Verified | Local Path / SHA-256 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `CS101` | `W01` | `M01` | `f01` | `syllabus.pdf` | **downloaded** | yes | yes | `materials/CS101/W01/M01/syllabus.pdf` (`aaaaaaaa...`) |
| `CS101` | `W01` | `M02` | `f02` | `syllabus.pdf` | **downloaded** | yes | yes | `materials/CS101/W01/M02/syllabus.pdf` (`bbbbbbbb...`) |
| `CS101` | `W01` | `M02` | `f03` | `lecture01.mp4` | **downloaded** | yes | yes | `materials/CS101/W01/M02/lecture01.mp4` (`cccccccc...`) |

### 3) LMS Authentication Boundary (D-15)
- **Fixture Verification Status:** **`PROVEN`** (All items downloaded, verified against expected SHA-256, and validated on filesystem).
- **Live LMS Verification Status:** **`UNVERIFIED`**
- **Reason:** Real university LMS credentials (e.g. Canvas/Blackboard OAuth API token) are not configured on this host.
- **Next Action:** Supply authenticated university LMS credentials to verify live interactive download.
- **Safety Guarantee:** Fixture test results are never passed off as live authenticated LMS success.

### 4) Applied Capability Invocations (D-16)

| Capability ID | Category | Tool / Component | Required | Invoked | Outcome | Receipt Reference / Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `skill_entry` | skill | `alpha-aos-task` | yes | yes | **ok** | `receipts/capabilities/cap-skill-cp.json` |
| `mcp_connector` | mcp | `coursepilot` | yes | yes | **ok** | `receipts/capabilities/cap-mcp-cp.json` |
| `pack_materials` | pack | `coursepilot-pack` | yes | yes | **ok** | `receipts/capabilities/cap-pack-cp.json` |
| `hook_verify` | hook | `gsd-hook` | yes | yes | **ok** | `receipts/hooks/hook-cp-post.json` |

---

## 4. Verification & Audit Invariants

1. **Mandatory Criteria Falsifiability:**
   - Turning any mandatory criterion (`start_screen`, `movement_inputs`, `fire_input`, `collision_rules`, `terminal_state`, `materials_download`) to `unknown` or `rejected` causes `evaluateReleaseExample` to immediately return `overallStatus: "failed"`.
2. **Reviewer Witness Alignment:**
   - Providing a review witness with a stale Git commit SHA or a mismatched artifact digest immediately halts completion.
3. **Capability Gating:**
   - Removing any required capability call (or providing an unrun/failed outcome) halts completion.
4. **Adjacency Containment:**
   - Multi-module duplicate filenames are tracked as independent entries via composite key `${courseId}:${weekId}:${moduleId}:${fileId}`.
