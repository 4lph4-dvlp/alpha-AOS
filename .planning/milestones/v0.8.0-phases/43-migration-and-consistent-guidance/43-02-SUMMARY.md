---
phase: 43-migration-and-consistent-guidance
plan: "02"
subsystem: ssot-and-diagnostics
tags: [ssot, doctor, alignment, fail-closed, tool-records, backup-hygiene]

requires:
  - phase: 43-01
    provides: legacy migration pipeline and resolveAcceptedToolRecord reader
provides:
  - Single Source of Truth (SSOT) transition for runtime consumers (mcp, isolation, install, doctor)
  - Fail-closed behavior on missing or uninitialized tool records without fallback to static bundle pins
  - Complete removal of direct runtime reads to catalog/computer-use-runtime.json
  - Doctor SSOT alignment diagnostics (diagnoseToolRecordsAlignment) detecting drift between harness configurations and accepted records
  - User backup hygiene diagnostics (USER_BACKUP_RETAINED)
  - Tool inventory modified tags ("modified (backup: .user-backup)")
affects: [43-03, 43-04]

actuals:
  tokens: 15600
  tasks: 2
  commits: 1

tech-stack:
  added: []
  patterns:
    - Unified Local Record Reader as Single Source of Truth (SSOT) across all consumers
    - Fail-closed error handling with explicit actionable remediation (alpha-aos migrate / alpha-aos install)
    - Harness configuration inspection and alignment verification against local accepted tool records
    - User backup retention inspection and readability validation

key-files:
  created:
    - test/tool-bindings-ssot.test.ts
    - test/doctor-migration.test.ts
  modified:
    - src/types.ts
    - src/core/tool-bindings.ts
    - src/core/mcp.ts
    - src/core/doctor.ts
    - src/core/tool-inventory.ts

key-decisions:
  - "D-08: doctor 및 inventory에 수정 상태 통합 진단 - inventory에 'modified (backup: .user-backup)' 태그를 표시하고, doctor에서 백업 보존 무결성 및 정돈 상태(USER_BACKUP_RETAINED)를 진단 항목으로 제공"
  - "D-09: Fail-closed 원칙 적용 - 소비자 모듈 실행 시 로컬 도구 기록이 없으면 숨겨진 핀으로 자동 폴백하지 않고, 명시적 install 또는 migrate 실행을 요구하며 즉시 중단"
  - "D-10: 단일 공통 로컬 기록 해석자(Unified Local Record Reader) 사용 - 모든 소비자 모듈이 tool-record-store의 최신 승인(accepted) 기록에서 버전·출처·무결성 해시를 조회하여 동적 유도"
  - "D-11: 런타임 코드의 catalog/computer-use-runtime.json 직접 참조를 완전 제거하고 로컬 도구 기록(cua-driver)을 통해 버전 결정"
  - "D-12: doctor에 단일 진실 공급원(SSOT) 일치 검사(diagnoseToolRecordsAlignment) 추가 - 하네스 설정이 로컬 accepted 기록과 일치하는지 종합 진단하고, 불일치 시 TOOL_RECORDS_MISALIGNED 경고 및 복구 가이드 제공"

patterns-established:
  - "Consumer SSOT: Consumers query resolveAcceptedToolRecord and fail closed when tool records are absent"
  - "Doctor SSOT alignment: Compares configured versions in harness files against immutable accepted local records"
  - "Backup hygiene: Retained .user-backup files are detected, verified readable, and reported with cleanup advice"

verification:
  - "npm run check: passes cleanly"
  - "node --test dist/test/tool-bindings-ssot.test.js dist/test/doctor-migration.test.js: 8/8 tests pass"
  - "Regression suites (tool-bindings, doctor, mcp): 24/24 tests pass"
---

# Plan 43-02 Summary: SSOT Consumer Migration and Doctor Alignment Diagnostics

Completed the transition of runtime consumers (`mcp`, `isolation`, `install`, `doctor`) to use `resolveAcceptedToolRecord` as the Single Source of Truth (SSOT), enforced fail-closed behavior on missing records, eliminated static lock reading from runtime code, and added comprehensive SSOT alignment and backup hygiene diagnostics to `alpha-aos doctor`.

## Accomplished Tasks

### 1. Consumer SSOT Migration & Fail-Closed Enforcement
- In [`src/core/tool-bindings.ts`](file:///D:/dev/alpha-AOS/src/core/tool-bindings.ts):
  - Enhanced `resolveAcceptedToolRecord` and `assertAcceptedToolRecord` to fail closed if local store status is not `current`, incomplete, or missing accepted records.
  - Implemented actionable error guidance directing users to run `alpha-aos migrate` or `alpha-aos install`.
- In [`src/core/mcp.ts`](file:///D:/dev/alpha-AOS/src/core/mcp.ts):
  - Replaced direct read of `catalog/computer-use-runtime.json` with `resolveAcceptedToolRecord("cua-driver")`.
  - Resolved versions for managed MCP servers (`context7`, `exa`, `firecrawl`) via `resolveAcceptedToolRecord`.
- Created [`test/tool-bindings-ssot.test.ts`](file:///D:/dev/alpha-AOS/test/tool-bindings-ssot.test.ts) verifying:
  - Active accepted tool record retrieval with verified metadata.
  - Fail-closed error handling when records are absent.
  - `planMcpSync` building `McpSyncPlan` using accepted record versions without accessing `computer-use-runtime.json`.

### 2. Doctor SSOT Alignment Diagnostics & Backup Hygiene
- In [`src/types.ts`](file:///D:/dev/alpha-AOS/src/types.ts):
  - Added optional `nextAction?: string` to `DoctorFinding`.
- In [`src/core/doctor.ts`](file:///D:/dev/alpha-AOS/src/core/doctor.ts):
  - Implemented `diagnoseToolRecordsAlignment(stateRoot?, packageRoot?, harnessConfigOverrides?)`.
  - Reports `TOOL_RECORDS_INITIALIZED` when local store is initialized.
  - Reports `TOOL_RECORDS_UNINITIALIZED` when local store is uninitialized/incomplete with guidance to run `alpha-aos migrate` or `alpha-aos install`.
  - Compares configured MCP server and CUA versions in harness configuration files (Claude, Codex, Antigravity, Pi, Hermes) against accepted tool records.
  - Emits `TOOL_RECORDS_MISALIGNED` with `nextAction: "Run 'alpha-aos sync' or 'alpha-aos update' to align configuration."` on version or path drift.
  - Emits `TOOL_RECORDS_ALIGNED` when harness configuration matches accepted record.
  - Scans harness configuration directories for `.user-backup` files, verifies readability, and reports `USER_BACKUP_RETAINED` with cleanup guidance.
  - Integrated `diagnoseToolRecordsAlignment` into the `runDoctor` pipeline.
- In [`src/core/tool-inventory.ts`](file:///D:/dev/alpha-AOS/src/core/tool-inventory.ts):
  - Attached `modifiedTag: "modified (backup: .user-backup)"` and `modified-backup-user-backup` diagnostic to `ToolObservation` when `acceptedResult.legacy?.userModificationEvidence === "modified"`.
- Created [`test/doctor-migration.test.ts`](file:///D:/dev/alpha-AOS/test/doctor-migration.test.ts) asserting all 5 scenarios (zero drift, uninitialized store, drift detection, backup retention, and inventory modified tags).
