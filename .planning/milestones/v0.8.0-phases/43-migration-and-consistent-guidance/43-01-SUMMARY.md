---
phase: 43-migration-and-consistent-guidance
plan: "01"
subsystem: migration
tags: [migrate, backup, ownership, legacy, ssot]

requires:
  - phase: 42-integration-verification-and-recovery
    provides: integration verification and recovery framework
provides:
  - Legacy tool migration pipeline (alpha-aos migrate)
  - Non-destructive .user-backup creation with boundary validation
  - Fail-closed ambiguous ownership resolution (--resolve-ownership)
  - Harness config marker boundary selective preservation
  - Single Source of Truth resolver resolveAcceptedToolRecord
affects: [43-02, 43-03, 43-04]

actuals:
  tokens: 14200
  tasks: 2
  commits: 1

tech-stack:
  added: []
  patterns:
    - Non-destructive .user-backup snapshot before modifying user configurations
    - Fail-closed ambiguous ownership isolation demanding explicit --resolve-ownership
    - Marker boundary (# alpha-aos:start mcp / # alpha-aos:end mcp) selective preservation
    - Atomic type: 'migrate' operation logging with LegacyToolEvidence in tool-record-store

key-files:
  created:
    - src/core/migrate.ts
    - test/migrate.test.ts
    - test/migrate-ownership.test.ts
  modified:
    - src/core/tool-bindings.ts
    - src/cli.ts

key-decisions:
  - "D-01: 전용 alpha-aos migrate 명령을 제공하고 install/update/doctor 실행 시 미입양 레거시 감지 안내를 연계 출력"
  - "D-03: SAFE-01 원칙 준수 - migrate는 기본적으로 읽기 전용 프리뷰를 출력하고 --apply 시 --plan-digest 및 --reviewed-plan 토큰 일치를 강제"
  - "D-04: 레거시 lockfile(catalog/stack.lock.json, catalog/computer-use-runtime.json)은 삭제하지 않고 읽기 전용 시드로 보존하며 로컬 스토어에 type: 'migrate' 원자적 기록 및 승인 상태 갱신"
  - "D-05: 사용자 수정 파일 감지 시 <filepath>.<timestamp>.user-backup 원본 복사본을 자동 생성"
  - "D-06: Codex config.toml 등 마커 영역(# alpha-aos:start mcp / # alpha-aos:end mcp) 외부의 사용자 커스텀 MCP 설정은 온전히 보존"
  - "D-07: 출처나 소유권이 불명확한 후보는 ambiguous로 격리하고 --resolve-ownership 플래그가 없을 경우 fail-closed로 중단"
  - "D-10: resolveAcceptedToolRecord를 제공하여 로컬 승인 기록이 없을 시 숨겨진 핀으로 폴백하지 않고 즉시 fail-closed"

patterns-established:
  - "Non-destructive adoption: previous locks preserved as seeds, modified configs backed up to .user-backup"
  - "Ambiguity barrier: multi-candidate or unverifiable candidates cannot be silently migrated without explicit ownership"

requirements-completed:
  - MIG-01

coverage:
  - id: MIG-01-A
    description: "Legacy tool migration pipeline, safe backup, and resolveAcceptedToolRecord"
    requirement: MIG-01
    verification:
      - kind: unit
        ref: "dist/test/migrate.test.js"
        status: pass
  - id: MIG-01-B
    description: "Ambiguous candidate ownership resolution and selective marker preservation"
    requirement: MIG-01
    verification:
      - kind: unit
        ref: "dist/test/migrate-ownership.test.js"
        status: pass
---

# Plan 43-01 Summary: Legacy Tool Migration Pipeline and Ownership Resolution

## Overview
Delivered the legacy migration pipeline (`alpha-aos migrate`), non-destructive `.user-backup` snapshot generation, selective marker boundary preservation, explicit ambiguous ownership resolution (`--resolve-ownership`), and the initial Single Source of Truth (SSOT) reader `resolveAcceptedToolRecord`.

## Accomplishments
1. **End-to-End Migration Pipeline (`src/core/migrate.ts`)**:
   - `createSafeUserBackup(filePath)`: Path-bounded `<filepath>.<timestamp>.user-backup` snapshotting ensuring non-destructive config adoption.
   - `planMigrationOperation(options)`: Discovers legacy tool candidates across requested tools, evaluates legacy evidence via `evaluateLegacyHandoff`, isolates ambiguous candidates, preserves historical locks as read-only seeds, and produces SHA-256 reviewed plan digest.
   - `applyMigrationOperation(options)`: Asserts reviewed plan token and digest match, creates user backups on modified files, executes within `withToolRecordSession`, commits atomic migration results bearing `LegacyToolEvidence`, and registers `acceptedTransitions`.
   - `formatMigrationPreview` and `formatMigrationApplyResult`: Human-readable formatted console outputs.
2. **SSOT Reader (`src/core/tool-bindings.ts`)**:
   - `resolveAcceptedToolRecord(toolId, options)`: Queries `readToolRecordStore`, finds latest accepted result for `toolId`, and returns `AcceptedToolRecord`. Fails closed with descriptive guidance if absent.
3. **CLI Integration (`src/cli.ts`)**:
   - Added subcommand `alpha-aos migrate` with `--tool`, `--target`, `--plan-digest`, `--reviewed-plan`, `--resolve-ownership`, `--apply`, `--json`.
   - Added `checkLegacyMigrationAdvisory` hooks to `install`, `update`, and `doctor` outputting guidance when unadopted legacy installations are detected.
4. **Automated Verification**:
   - `test/migrate.test.ts`: Verifies backup generation, fail-closed SSOT, end-to-end plan/apply pipeline, atomic store operations, and seed lock retention (3/3 passing).
   - `test/migrate-ownership.test.ts`: Verifies `--resolve-ownership` parsing, fail-closed handling of ambiguous candidates, and bit-for-bit marker boundary preservation (3/3 passing).
