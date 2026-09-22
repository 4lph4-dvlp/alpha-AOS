---
phase: 05-persistent-tree-off-preload-isolation
plan: 01
subsystem: core
tags: [tree-policy, registry, canonical-paths, longest-prefix-match, lpm-inheritance, atomic-transaction]

# Dependency graph
requires:
  - phase: 04-mandatory-gsd-gates
    provides: "applyFileTransaction, canonicalizeWithMissingTail, validateManagedDocument"
provides:
  - "schemas/tree-registry.schema.json — Draft 2020-12 closed JSON schema for ~/.alpha-aos/trees.json"
  - "src/types.ts — TreePolicyMode, TreeRegistryEntry, TreeRegistry, EffectiveTreePolicy"
  - "src/core/tree-policy.ts — canonicalizeTreePath, computeTreeId, withinTreeRoot, resolveEffectivePolicy, loadTreeRegistry, saveTreeRegistry, setTreePolicy, removeTreePolicy, listTreePolicies"
  - "test/tree-policy.test.ts — Unit and integration tests for registry persistence, canonical paths, and LPM inheritance"
affects: [shims, tree-classify, surface-inspector, cli]

actuals:
  tokens: 45000
  tasks: 3
  commits: 1
plan_head_before: 4e5262e

tech-stack:
  added: []
  patterns:
    - "Centralized global state persistence in ~/.alpha-aos/trees.json with zero repository file modifications (D-01)"
    - "Canonical filesystem path resolution using canonicalizeWithMissingTail, symlink/junction resolution, and platform-specific case folding (D-02)"
    - "Nearest Ancestor (Longest Prefix Match) inheritance engine with whole-path segment boundary checks (D-03)"
    - "Nested overrides allowing surgical opt-out or management of subdirectories (D-03)"
    - "Closed-world Draft 2020-12 schema validation via validateManagedDocument and atomic journaled writes via applyFileTransaction (D-01)"

key-files:
  created:
    - schemas/tree-registry.schema.json
    - src/core/tree-policy.ts
    - test/tree-policy.test.ts
  modified:
    - src/types.ts
    - src/core/validation.ts

key-decisions:
  - "Tree registry document adheres to a strict, closed Draft 2020-12 schema disallowing unknown fields and enforcing 16-hex deterministic IDs"
  - "Path comparison uses whole segment boundaries (withinTreeRoot) to prevent false prefix matches (e.g. /repo-fork matching /repo)"
  - "Host case sensitivity is respected: Windows and macOS fold case to lowercase, while Linux preserves case"
  - "applyFileTransaction is used exclusively for all trees.json writes, guaranteeing atomic updates with journaled recovery and zero repo pollution"

requirements-completed: [OPTO-01]

coverage:
  - id: D-01
    description: "Tree policies are persisted solely in ~/.alpha-aos/trees.json, creating and modifying zero repository-local files"
    requirement: "OPTO-01"
    verification:
      - kind: integration
        ref: "test/tree-policy.test.ts#setting a tree policy creates entry in trees.json without modifying target repo files"
        status: pass
  - id: D-02
    description: "Directory paths are resolved using canonical filesystem paths with symlink resolution and platform case normalization"
    requirement: "OPTO-01"
    verification:
      - kind: unit
        ref: "test/tree-policy.test.ts#symlinks and relative paths resolve to identical canonical path and tree ID"
        status: pass
      - kind: unit
        ref: "test/tree-policy.test.ts#case normalization matches on case-insensitive platforms"
        status: pass
  - id: D-03
    description: "Nearest Ancestor (Longest Prefix Match) inheritance and nested directory overrides"
    requirement: "OPTO-01"
    verification:
      - kind: unit
        ref: "test/tree-policy.test.ts#nearest ancestor (LPM) inheritance and nested overrides"
        status: pass
---

# Plan 05-01 Summary: Tree Policy Registry & Nearest Ancestor Inheritance Engine

## Accomplishments
1. **Tree Registry Closed JSON Schema (`schemas/tree-registry.schema.json`)**:
   - Created a Draft 2020-12 closed schema for `~/.alpha-aos/trees.json` with strict property validation, 16-hex sha256 prefix IDs, and `additionalProperties: false`.
   - Wired `"tree-registry"` into `ManagedDocumentKind`, `OWNED_SUBTREE`, and `CORE_SCHEMAS` in `src/core/validation.ts`.
2. **Canonical Path & Longest Prefix Match Engine (`src/core/tree-policy.ts`)**:
   - Implemented `canonicalizeTreePath` leveraging `canonicalizeWithMissingTail` for cross-platform symlink and relative path normalization.
   - Implemented `computeTreeId` generating deterministic 16-character hexadecimal identifiers invariant to platform case differences.
   - Implemented `withinTreeRoot` enforcing whole-path segment boundary checks.
   - Implemented `resolveEffectivePolicy` determining the effective mode via Longest Prefix Matching across registered directory roots, supporting nested overrides.
3. **Atomic Transaction Persistence & Test Suite**:
   - Implemented `loadTreeRegistry`, `saveTreeRegistry`, `setTreePolicy`, `removeTreePolicy`, and `listTreePolicies` with atomic transactions via `applyFileTransaction`.
   - Guaranteed zero repository-local files are created or modified when setting, updating, or removing policies (D-01).
   - Created comprehensive test suite in `test/tree-policy.test.ts` (7 passing tests, 0 failures).
