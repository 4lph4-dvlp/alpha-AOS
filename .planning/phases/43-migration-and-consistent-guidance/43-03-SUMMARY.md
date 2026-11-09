---
phase: 43-migration-and-consistent-guidance
plan: "03"
subsystem: format-and-cli
tags: [matrix, format, cli-guidance, 2-track, status-badges]

requires:
  - phase: 43-02
    provides: SSOT consumer transition and doctor alignment diagnostics
provides:
  - Component-harness outcome matrix table formatter (formatComponentHarnessMatrix)
  - Explicit status badges for all 5 lifecycle states (retained, updated, failed, recovered, unverified)
  - Strict 2-track update and deployment guidance in CLI HELP
  - Clean separation between external tool updates and alpha-AOS engine deployment
  - Granular multi-harness outcome reporting without collapsing into misleading universal success/failure
affects: [43-04]

actuals:
  tokens: 16800
  tasks: 2
  commits: 1

tech-stack:
  added: []
  patterns:
    - Structured matrix table output with Tool, Harness, Status, Shared Config Impact, and Action Required
    - Distinct status badges: UPDATED [OK], RETAINED [SKIP], RECOVERED [ROLLBACK], UNVERIFIED [PENDING], FAILED [ERR]
    - 2-track CLI mental model separating tool release updates (alpha-aos update) from engine deployment (npm run deploy:local / npm install -g)

key-files:
  created:
    - test/matrix-format.test.ts
    - test/migrate-cli-guidance.test.ts
  modified:
    - src/format.ts
    - src/types.ts
    - src/core/migrate.ts
    - src/cli.ts
    - test/migrate.test.ts

key-decisions:
  - "D-13: 명확한 2-트랙 분리 - alpha-aos update는 외부 관리 도구 릴리스 전용으로 한정하고, CLI 도움말/상태에서 alpha-AOS 자체 코드 업데이트(npm 배포 및 로컬 npm run deploy:local)와 엄격히 구분 안내"
  - "D-14: 컴포넌트·하네스 매트릭스 테이블 형식 - [도구 | 하네스 | 상태(retained/updated/failed/recovered/unverified) | 공유 설정 영향 | 필요 조치]를 구조화된 표와 5개 상태 뱃지로 출력하여 부분 상태를 명확히 공개"

patterns-established:
  - "Outcome Matrix: Multi-harness execution states are rendered as granular table rows, preventing boolean falsification"
  - "2-Track CLI Guidance: CLI help clearly isolates external tool updates from alpha-AOS engine deployment"

verification:
  - "npm run check: passes cleanly"
  - "node --test dist/test/matrix-format.test.js dist/test/migrate-cli-guidance.test.js: 8/8 tests pass"
  - "Regression suites (migrate, migrate-ownership, tool-bindings-ssot, doctor-migration, matrix-format, migrate-cli-guidance): 22/22 tests pass"
---

# Plan 43-03 Summary: Component-Harness Outcome Matrix Formatter and 2-Track CLI Guidance

Implemented the component/platform/harness outcome matrix table formatter in `src/format.ts` and enforced the strict 2-track update vs deployment guidance across CLI help and status commands in `src/cli.ts`.

## Accomplished Tasks

### 1. Component-Harness Outcome Matrix Formatter
- In [`src/format.ts`](file:///D:/dev/alpha-AOS/src/format.ts):
  - Defined and exported `ComponentHarnessMatrixRow` interface (`toolId`, `harness`, `status`, `sharedConfigImpact`, `actionRequired`).
  - Implemented `matrixStatusBadge` returning designated badges:
    - `"updated"` -> `"UPDATED [OK]"`
    - `"retained"` -> `"RETAINED [SKIP]"`
    - `"recovered"` -> `"RECOVERED [ROLLBACK]"`
    - `"unverified"` -> `"UNVERIFIED [PENDING]"`
    - `"failed"` -> `"FAILED [ERR]"`
  - Implemented `formatComponentHarnessMatrix(rows: ComponentHarnessMatrixRow[]): string` rendering aligned tables with columns `[ Tool | Harness | Status | Shared Config Impact | Action Required ]`.
  - Updated `formatOfflineStatus` to format matrix rows when present on `OfflineStatus`.
- In [`src/core/migrate.ts`](file:///D:/dev/alpha-AOS/src/core/migrate.ts):
  - Populated `matrix` rows on `MigrationPlan` and `MigrationApplyResult`.
  - Integrated `formatComponentHarnessMatrix` into `formatMigrationPreview` and `formatMigrationApplyResult`.
- Created [`test/matrix-format.test.ts`](file:///D:/dev/alpha-AOS/test/matrix-format.test.ts) verifying badge formats, column headers, empty-row handling, and mixed-outcome preservation.

### 2. 2-Track CLI Routing, HELP, and Status Guidance
- In [`src/cli.ts`](file:///D:/dev/alpha-AOS/src/cli.ts):
  - Updated `HELP` constant:
    - Added dedicated section `External Tool Updates:` clarifying that `alpha-aos update` updates managed external tools (Cua, GSD, ECC, MCP servers) and does not update the alpha-AOS engine.
    - Added legacy tool adoption pointer to `alpha-aos migrate`.
    - Added dedicated section `Engine Deployment (alpha-AOS code):` documenting personal workstation deployment (`npm run deploy:local`) and global package deployment (`npm install -g alpha-aos@latest`).
    - Verified zero mentions of background updates, scheduled promotions, or automated nightly updates remain.
  - Updated `status` command handler to check local accepted tool records and attach a populated status matrix to `OfflineStatus`.
- Created [`test/migrate-cli-guidance.test.ts`](file:///D:/dev/alpha-AOS/test/migrate-cli-guidance.test.ts) asserting CLI help sections, `alpha-aos migrate` documentation, absence of outdated terms, and matrix output rendering in preview, apply, and status.
