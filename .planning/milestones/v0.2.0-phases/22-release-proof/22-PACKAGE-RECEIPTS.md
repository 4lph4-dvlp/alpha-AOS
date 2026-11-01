# Phase 22 Package Receipts: v0.2.0 Packed Lifecycle & Host Boundary Proof

## 1. Overview & Verification Verdict

- **Tarball SHA-256:** `30bbfc57d4268427549529bf9872ed75c1279e7d7da25d953272dc30c57d1ed5`
- **Overall Status:** **`PASSED`**
- **Lock Channel:** `stable`
- **Lock Identifier:** `sha256:41939545460a5c4d1cd5e366a78a71fcd9520f9765eea2550f60cd2dad7f7beb`
- **Candidate Lock Refused:** `true`

---

## 2. Package Lifecycle & Supply Chain Gates (D-09, D-12)

| Lifecycle Step / Gate | Expected | Observed Exit | Result | Tarball SHA-256 | Notes |
|---|---|---|---|---|---|
| `install` | `exit 0` | `0` | `PASSED` | `30bbfc57d426...` | Installed packed release into isolated prefix; verified dist/src/cli.js and stable lock |
| `doctor` | `exit 0` | `0` | `PASSED` | `30bbfc57d426...` | Diagnosed managed environment: zero errors, status.needsRepair = false |
| `uninstall` | `exit 0` | `0` | `PASSED` | `30bbfc57d426...` | Complete uninstall applied with --purge; removed sandbox state, restored config and skills |
| `candidate-lock-gate` | `refused` | `exit 0` | `PASSED` | `30bbfc57d426...` | Unreviewed candidate lock ignored; zero journals added |

---

## 3. Real Host Path Categories & Zero-Mutation Boundary (D-09, D-10, VER-03)

| Category | Description | Before Digest | After Digest | Added | Removed | Changed | Vanished | Category Status |
|---|---|---|---|---|---|---|---|---|
| `managed_state` | Alpha-AOS user operational state and transaction journals | `4a6b2978a101...` | `4a6b2978a101...` | 0 | 0 | 0 | 0 | `CLEAN` |
| `harness_config` | Native harness configuration files (config.toml, mcp_config.json, mcp.json, config.yaml) | `9f23719bcae8...` | `9f23719bcae8...` | 0 | 0 | 0 | 0 | `CLEAN` |
| `harness_policy` | Native harness agent policy documents (AGENTS.md) | `bc94819a84f0...` | `bc94819a84f0...` | 0 | 0 | 0 | 0 | `CLEAN` |
| `skills` | Native harness ECC skills directories (unified-memory, documentation-lookup, deep-research) | `c90823908490...` | `c90823908490...` | 0 | 0 | 0 | 0 | `CLEAN` |
| `gsd_workflow` | GSD core workflow runtime and profile markers (gsd-core, .gsd-profile) | `d19824908129...` | `d19824908129...` | 0 | 0 | 0 | 0 | `CLEAN` |

---

## 4. Observation Boundary & Unclassified Probe (VER-03)

> [!NOTE]
> **VER-03 Observation Scope Notice:** Absence of drift is proven strictly for the monitored host categories above. Zero-modification is not claimed for unmonitored host directories outside this observed boundary.
