# Phase 09: Unified Natural Language Controller (`alpha-aos-control`) and Capability Checkpoint Automation - Validation

## Validation Strategy

### 1. Static Invariants & Integrity
- `npm run check`: TypeScript type checking passes strictly with zero diagnostic errors across all source and test modules.
- `npm run build`: Compiles cleanly to `dist/`.
- `catalog/stack.yaml` and `catalog/stack.lock.json` match cryptographic source and rendered SHA-256 hashes for `alpha-aos-control` across all 5 harnesses (`claude`, `codex`, `antigravity`, `pi`, `hermes`).
- Character length check: `docs/codex-execution-policy.md` strictly adheres to `1 <= length <= 2000` characters without ownership markers.

### 2. Behavioral & Workflow Tests (`test/control.test.ts`)
- **Contract & Frontmatter**:
  - `skills/alpha-aos-control/SKILL.md` exists, has valid YAML frontmatter (`name: alpha-aos-control`, `description:`), and contains instructions for all 5 domains:
    1. Project plan/status inspection & 64-character SHA-256 digest extraction.
    2. Proactive capability checkpoint triggers on environment setup completion.
    3. Directory tree exclusion (`tree policy set . --mode off`) and inherit (`mode inherit`).
    4. Diagnostics (`alpha-aos status`, `alpha-aos doctor`).
    5. Rollback and crash repair (`alpha-aos rollback`, `alpha-aos repair`).
- **Autonomous Pack Discovery & Materialization**:
  - Validates `planProjectCapabilities` produces a 64-char hex digest.
  - Validates `approveProjectPlan` with matching digest succeeds.
  - Validates `applyProjectPackSync` brings packs to `CURRENT`.
  - Validates tampered digest and workspace drift cause immediate refusal.
- **Tree Policy Isolation**:
  - Validates setting tree policy to `off` via API/CLI updates tree policy registry without writing files to the project directory.
  - Validates setting tree policy to `inherit`.
- **System Doctor & Status**:
  - Validates status and doctor diagnostics run cleanly.
- **Transactional Rollback**:
  - Validates rollback rejects drifted targets and succeeds on unmutated preflight.

### 3. Full Regression Suite
- `npm test`: Runs all 900+ tests across the repository, ensuring zero regression in catalog, lock, installation, isolation, GSD gates, rollback, or doctor.
- `node dist/src/cli.js install --apply --target antigravity,codex,claude,pi`: Deploys `alpha-aos-control` directly to the active workstation harnesses.
