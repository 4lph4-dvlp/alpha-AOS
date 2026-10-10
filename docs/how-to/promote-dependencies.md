# How-To: Dependency Promotion in alpha-AOS

Upstream releases of the pinned components (GSD Core, ECC Universal, Context7, Exa, Firecrawl, and the Pi MCP bridge) reach the authoritative `catalog/stack.lock.json` through an unattended weekly promotion. No approval click is needed; each gate below either passes or refuses, and a refusal leaves `main` untouched and triggers GitHub's workflow-failure notification.

---

## 1. Channels

| File | Channel | Purpose |
|---|---|---|
| `catalog/stack.lock.json` | `stable` | The only lock `alpha-aos install` and `alpha-aos update --apply` read. Exact versions, SHA-512 integrity, and ECC skill hashes. |
| `catalog/candidate.lock.json` | `candidate` | Transient staging written by `alpha-aos update --stage --apply`. Reset to `status: "empty"` by every promotion; never read by runtime commands. |

End-user machines never apply `candidate.lock.json`. A promotion is a commit that moves only these two files, so it never conflicts with feature work.

---

## 2. Weekly Timeline

```text
Monday 03:17 UTC            dependency-candidate.yml
  update --stage --apply    resolve registry "latest" for every pinned package
  auto-promote.mjs stage    verify integrity, write changed packages into stack.lock.json,
                            re-pin ECC source/target hashes if ECC moved, reset candidate
  push                      automation/dependency-candidate-<run-id> (one commit, two lock files)
  promotion-verify.yml      full CI (Linux/macOS/Windows) + real component fixtures
  record                    artifact "verified-candidate" = the verified commit SHA

Wednesday 03:17 UTC         auto-promote.yml
  find                      latest Monday run; only a successful run with an artifact
                            and matching run-specific branch is eligible
  rebase                    onto current main; refuses if files other than the locks change
  verify-registry           refuses unpublished, altered, or <36h-old versions
  promotion-verify.yml      full CI + fixtures again on the rebased commit
  land                      fast-forward main to exactly that commit
                            (refuses if main moved during verification)
```

The two-day gap is deliberate: malicious npm releases are usually unpublished within days, and Wednesday's registry re-check refuses any version that disappeared or changed.

---

## 3. What Verification Covers

`promotion-verify.yml` runs two jobs against the exact promotion commit:

1. **`ci`** — the same `ci.yml` suite that guards `main`: release package and tarball audit, `npm run check`, `npm test`, the upstream ECC integration step, build manifest check, and safety boundary suites on Linux, macOS, and Windows. With `ALPHA_AOS_REQUIRE_UPSTREAM_MCP=1`, the pinned MCP servers are started for real.
2. **`fixtures`** — on each OS, real installs into disposable fixture homes:
   - `alpha-aos fixture gsd <claude|codex|antigravity|pi> --apply`
   - `alpha-aos fixture ecc <claude|codex|antigravity|pi|hermes> --apply`
   - `alpha-aos fixture mcp <context7|exa|firecrawl> pi --apply`, which also installs the pinned Pi bridge through `pi install`.

Fixtures are credential-free and never touch real harness configuration.

---

## 4. When a Week Is Refused

All changed packages in a week are promoted together, so one failing package holds the rest back until it is fixed upstream or here. The failure email links the run; the failing step names the reason.

| Failing step | Meaning | What to do |
|---|---|---|
| `Promote changed packages into the stable lock` | Registry integrity mismatch, or an ECC release whose skills no longer render (for example the deep-research renderer's anchors moved) | Adapt the renderer or wait for the next release. |
| `ci` / `fixtures` | The new version breaks alpha-AOS or fails to install on some OS | Fix alpha-AOS on `main`; the next Monday run retries automatically. |
| `Re-verify promoted packages against the registry` | A version was unpublished, altered, or is too young | Nothing; the next Monday run resolves again. |
| `Push the verified commit to main` | `main` moved while the promotion was verified | Re-run `auto-promote.yml` with **Run workflow**. |

Either workflow can be started manually with **Run workflow** (`workflow_dispatch`). A failed Monday run cannot replace the candidate commit verified by another run.

---

## 5. Manual Promotion (fallback)

Use this only when a promotion must land outside the weekly cycle. It performs the same steps locally:

```bash
npm ci && npm run build
node dist/src/cli.js update --stage --apply
node scripts/auto-promote.mjs stage
npm run check && npm test
git switch -c promote/<date>
git add catalog/stack.lock.json catalog/candidate.lock.json
git commit -m "chore(deps): promote <summary>"
```

Open a pull request and merge it only after `ci.yml` passes on all three operating systems. `node scripts/promote-candidate.mjs --components <list> --verify-integrity --reset-candidate` remains available for promoting a subset.

---

## 6. Administrator Force Update

Repository administrators can use **Force latest dependency update** when they explicitly accept the risk of bypassing the weekly CI, real component fixtures, and 36-hour cooldown. Run it on `main`, type `FORCE_LATEST`, and provide an audit reason:

```sh
gh workflow run force-dependency-update.yml --ref main -f confirmation=FORCE_LATEST -f reason="<reason>"
```

The workflow checks the triggering user's repository `admin` permission through GitHub's collaborator API, including on a rerun. It resolves current registry versions, verifies their integrity, computes required ECC skill hashes when ECC moves, and commits only the two lock files directly to `main`. The commit records the actor, reason, and workflow URL. No three-OS CI, component fixture matrix, or cooldown check runs. If `main` moves meanwhile, it refuses and must be run again. Branch rules that block the workflow token also block this override; the workflow does not alter branch protection.

---

## 7. Release Hygiene

`catalog/candidate.lock.json`, `.planning/`, tests, and scratch files are excluded from release tarballs by `scripts/audit-tarball.mjs`, which every CI run executes before publication.
