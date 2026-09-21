---
name: alpha-aos-pack-advisor
description: "Autonomous advisor and materializer for alpha-AOS project capability packs. Inspects workspaces, explains matched packs with evidence, and applies approved plan digests without manual CLI intervention."
---

# alpha-AOS Project Pack Advisor & Materializer

## Objective

Autonomously discover, recommend, and materialize project-tailored capability packs (such as `BROWNFIELD_INIT`, `WEB_BASE`, `NODE_WORKSPACE`, and language/framework packs) in any workspace visited by the AI agent. Eliminate manual CLI copy-pasting for developers by programmatically inspecting evidence, requesting user confirmation, extracting exact plan digests, and applying approvals and synchronizations through alpha-AOS safe transactional boundaries.

## Activation Trigger

Activate this skill when:
- Starting work on a project or repository (e.g., during project onboarding, `/gsd-new-project`, initial session setup).
- Planning or executing a phase where external tooling, MCP servers, or project skills might be required.
- The user asks about available project packs, skills, tools, or environment configuration.

---

## Workflow Execution Steps

### 1. Workspace Inspection

Execute the read-only planning and status commands with JSON output:

```bash
alpha-aos project plan . --json
alpha-aos project status . --json
```

*(Note: If running in an environment where `alpha-aos` is not yet globally linked, invoke via `node <path-to-dist/src/cli.js> project plan . --json`)*

Parse the resulting JSON payloads:
- `plan`: holds `plan.selected` (array of matched pack IDs), `plan.planDigest` (64-character SHA-256 hex string), and `plan.why` / evidence details.
- `status`: holds `status.reconciliation.packs` (current materialization state of packs in the project).

---

### 2. Analysis & Comparison

1. Identify candidate packs in `plan.selected` that are not yet materialized or not in `CURRENT` state in `status.reconciliation.packs`.
2. **If no unmaterialized packs exist**:
   - Inform the user: *"Project capability packs are up to date."*
   - Stop here. No further action is required.
3. **If unmaterialized packs exist**:
   - Proceed to Step 3.

---

### 3. Recommendation & Confirmation Request

Present a concise, structured recommendation to the user:
- **Pack Name & Identifier** (e.g., `BROWNFIELD_INIT`, `WEB_BASE`)
- **What it provides** (e.g., project-specific conventions, targeted MCP tools, ECC skills)
- **Matched Evidence** (explain why it matched based on repository facts, e.g., existing codebase with absent conventions doc)

Ask the user for approval:
> *"Would you like me to install and configure these project packs? (e.g., reply 'Yes' or '응, 설치해줘')"*

**CRITICAL SAFETY REQUIREMENT:**
- **MUST NOT** run approval or sync commands before receiving clear user confirmation.
- Wait for the user's positive response before proceeding to Step 4.

---

### 4. Autonomous Materialization (Zero-Friction Flow)

Upon receiving user confirmation, execute the approval and synchronization pipeline autonomously:

1. **Extract Exact Plan Digest**:
   - Read the exact 64-character SHA-256 string from `plan.planDigest`.
   - **INVARIANT**: NEVER guess, construct, or truncate the digest. It MUST match the exact hex output from `alpha-aos project plan . --json`.

2. **Execute Plan Approval**:
   ```bash
   alpha-aos project approve . --plan-digest <PLAN_DIGEST> --apply
   ```

3. **Execute Capability Sync**:
   ```bash
   alpha-aos project sync . --apply
   ```

---

### 5. Verification & User Guidance

1. Re-verify project status:
   ```bash
   alpha-aos project status . --json
   ```
   Confirm that the newly installed packs report `status === "CURRENT"`.

2. Inform the user of successful completion:
   - Provide a brief summary of the materialized capabilities.
   - **Crucial Guidance**: Remind the user:
     > *"Project capability packs have been successfully materialized. To activate the newly installed MCP tools and skills in your current session, please reload tools or restart the agent session (e.g., restart `agy` or your IDE/CLI).*"

---

## Safety Invariants & Guardrails

- **No Blind Writes**: Never manually edit `.alpha-aos/stack.yaml` or harness configuration files directly. All modifications must be generated and transacted via `alpha-aos project approve` and `alpha-aos project sync`.
- **Digest Integrity**: If `project approve` refuses with a digest mismatch (e.g., due to repository file drift since the plan was computed), do not force. Re-run `alpha-aos project plan . --json`, explain the drift to the user, and request renewed confirmation.
- **Fail-Closed**: If any command fails with a non-zero exit code, halt immediately and report the diagnostic error to the user.
