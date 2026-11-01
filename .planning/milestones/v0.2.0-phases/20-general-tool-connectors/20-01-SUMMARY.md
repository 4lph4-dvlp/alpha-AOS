# Plan 20-01 Summary: Generic Fixture Connector End-to-End Execution & Closed Evidence

## 1. Overview
- **Phase**: 20-general-tool-connectors
- **Plan**: 20-01
- **Wave**: 1
- **Requirements Satisfied**: TOOL-01, TOOL-04
- **Objective**: Establish general non-code tool connector architecture with canonical manifests, outcome-based measurements, non-Git review evidence locators, and end-to-end execution from contract approval to independent verdict without fake Git SHAs or dummy test commands.

---

## 2. Key Changes Implemented

### Schemas
- [`schemas/task-connector.schema.json`](file:///D:/dev/alpha-AOS/schemas/task-connector.schema.json):
  - Created closed v1 schema for `ConnectorManifestV1` (`protocolVersion: 1`, `connectorId`, `adapterContractDigest`, `observedAt`, `items`).
  - Strict bounded arrays and properties (`maxItems: 256` for items, `minItems: 1` / `maxItems: 64` for `requiredFiles`, `additionalProperties: false`).
- [`schemas/task-contract.schema.json`](file:///D:/dev/alpha-AOS/schemas/task-contract.schema.json):
  - Added `category: ["development", "general"]` discriminant.
  - Added general contract properties: `connectorId`, `protocolVersion: 1`, `manifestDigest`.
  - Added `oneOf` measurement support: existing `cli-json` measurement alongside new `outcome` measurement (`itemId`, `expect.status`).
  - Added `external-download` to allowed effects.
- [`schemas/task-receipt.schema.json`](file:///D:/dev/alpha-AOS/schemas/task-receipt.schema.json):
  - Extended verdict row `review.locator` to support `connector-item` and `connector-file` alongside existing snapshot locators.
- [`schemas/task-review.schema.json`](file:///D:/dev/alpha-AOS/schemas/task-review.schema.json):
  - Added locator kinds `connector-item` and `connector-file` with optional `itemId`, `sourceIdentity`, and `fileReceiptId`.

### Core Modules
- [`src/core/task-connector.ts`](file:///D:/dev/alpha-AOS/src/core/task-connector.ts):
  - Defined `ConnectorV1`, `ConnectorManifestV1`, `ConnectorPort`, and file receipt interfaces.
  - Implemented `canonicalizeConnectorManifest()`, `connectorManifestDigest()`, and `connectorArtifactDigest()`.
  - Implemented `validateConnectorManifest()` enforcing protocol/schema versions, closed schema validation, max byte limits (256 KB), duplicate item/file ID rejection, and path traversal prevention.
  - Implemented `createGenericFixtureConnector()` providing deterministic `preview`, `perform`, `reconcile`, and `verify` port implementations.
- [`src/core/task-contract.ts`](file:///D:/dev/alpha-AOS/src/core/task-contract.ts):
  - Extended `TaskContract` with `category: "development" | "general"` and optional connector properties, maintaining complete backward compatibility with existing test suites.
  - Added `GeneralTaskContract` and `DevelopmentTaskContract` types.
  - Updated `assertContractAuthority()` and `digestableTaskContract()` to validate and digest connector properties and outcome measurements.
  - Updated `changedContractFields()` to track connector ID, protocol version, and manifest digest changes.
- [`src/core/task-run.ts`](file:///D:/dev/alpha-AOS/src/core/task-run.ts):
  - Added `startGeneralTask()` handling pure general connector execution without Git commits or GSD tools prerequisites.
  - Set `baseCommit: null` and passed non-Git review target revision SHA (`general-manifest:<digest>`).
  - Added `missing-connector` and `stale-manifest` error codes.
- [`src/core/task-review-evidence.ts`](file:///D:/dev/alpha-AOS/src/core/task-review-evidence.ts):
  - Added validation for `connector-item` and `connector-file` locators, verifying item ID resolution and artifact digest matching.
  - Bypassed Git HEAD drift checks for general category contracts while strictly maintaining them for development contracts.
- [`src/core/task-check.ts`](file:///D:/dev/alpha-AOS/src/core/task-check.ts) & [`src/format.ts`](file:///D:/dev/alpha-AOS/src/format.ts):
  - Safely handled outcome measurements without assuming `cli-json` structure.

### Test Coverage
- [`test/task-connector.test.ts`](file:///D:/dev/alpha-AOS/test/task-connector.test.ts):
  - Created 10 unit and integration tests:
    1. Tracer end-to-end: fixture item executes preview → perform → reconcile → verify → independent review to `accepted` on a non-Git temporary directory.
    2. Negative: altered manifest digest rejected before perform.
    3. Empty items array validated as valid empty manifest.
    4. Rejection of items with empty `requiredFiles`.
    5. Rejection of unknown protocol/schema versions.
    6. Rejection of duplicate `itemId` and duplicate `fileId`.
    7. Rejection of path traversal (`..` or absolute drive).
    8. Rejection of unknown `additionalProperties`.
    9. Canonicalization stability across item and file reordering.
    10. Review evidence validation accepting valid `connector-item` and rejecting mismatched digests and unapproved item IDs.

---

## 3. Verification
- `npm run build`: Success (manifest written with 221 inputs, 440 outputs).
- `node scripts/run-tests.mjs --files dist/test/task-connector.test.js dist/test/task-review-evidence.test.js`: All 20 tests pass (0 failures).
- `npm run check`: TypeScript static analysis clean (0 errors).
