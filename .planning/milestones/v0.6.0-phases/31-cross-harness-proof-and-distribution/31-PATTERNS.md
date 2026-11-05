# Phase 31: Cross-Harness Proof and Distribution - Pattern Map

**Mapped:** 2026-11-03 (`HEAD` `f0ff14d5ec043540354123bec641d2c0dacd209d`)
**Files analyzed:** 26 git-tracked repository files (`git ls-files` verified — `#3645` tracked-source gate passed)
**Analogs found:** 19 / 19 planned new and modified surfaces (100% coverage; 0 files without tracked analogs)

---

## File Classification

Every analog path below was verified as git-tracked source via `git ls-files -- <path>` (never an installed runtime mirror or `.planning/tmp/` scratch file).

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `scripts/verify-task-entry-proof.mjs` *(new)* | Standalone CLI proof verifier (`PROVE-01`, `D-01`, `D-04`) | Read-only file/hash/git/lock inspection → `text` or `--json` report (`exit 0` valid / `exit 1` invalid) in both git checkouts and unpacked `npm pack` installs | `scripts/verify-task-style-native.mjs` (`L15-L80`, `L114-L141`, `L275-L367`) | Exact (role + CLI/guard structure) |
| `docs/task-entry-proof-index.json` *(new)* | Machine-verifiable cross-harness scenario & package hash index (`PROVE-01`, `PROVE-04`) | Static bounded JSON (`<= 64 KiB`) consumed by `scripts/verify-task-entry-proof.mjs` and `test/task-entry-proof.test.ts` | `docs/task-style-proof-index.json` (`L1-L82`) | High (extend from 6 routes to 55 `5×11` cells + package bindings + debt ledger) |
| `docs/task-entry-proof.md` *(new)* | Human-readable 5-harness matrix, scenario chains & final regression ledger (`PROVE-01`, `PROVE-04`) | Markdown documentation cross-referencing `docs/task-entry-proof-index.json`, `docs/SUPPORT_MATRIX.md`, `261101-ww3` debt history, and active holds | `docs/task-style-proof.md` (`L1-L100`), `docs/task-bootstrap-proof.md` (`L7-L20`, `L83-L137`) | Exact |
| `docs/task-entry.md` *(new)* | English end-user task entry & shared policy guide (`PROVE-03`, `D-09`–`D-12`) | Symmetric 8-section user reference linked from `README.md` and `docs/task-runtime-controls.md`; validated by `test/task-entry-docs.test.ts` | `README.md` (`L265-L332`), `skills/alpha-aos-task/SKILL.md` (`L16-L209`) | High |
| `docs/task-entry.ko.md` *(new)* | Korean end-user task entry & shared policy guide (`PROVE-03`, `D-09`–`D-12`) | 1:1 structural H2/H3 mirror of `docs/task-entry.md`; validated by `test/task-entry-docs.test.ts` | `README.ko.md` (`L260-L317`), `docs/task-entry.md` | Exact |
| `README.md` *(modified)* | Top-level English quick-start & capability matrix (`PROVE-03`, `D-05`, `D-09`, `D-10`, `D-12`) | Repair duplicate `Scenario H` + broken fence (`L265-L295`), scrub `<drive>:\dev` (`L138`), add concise 6-style table + links, add `alpha-aos-task` to Global Stack Matrix | `README.md` (`L265-L332`) | Exact (in-place edit) |
| `README.ko.md` *(modified)* | Top-level Korean quick-start & capability matrix (`PROVE-03`, `D-05`, `D-09`, `D-12`) | Add matching `Scenario H` (`project mode`), scrub `<drive>:\dev` (`L154`), add concise 6-style table + links, add `alpha-aos-task` to Global Stack Matrix | `README.ko.md` (`L260-L317`), `README.md` (`L265-L332`) | Exact (in-place edit) |
| `docs/task-runtime-controls.md` *(modified)* | Operator runtime/usage accounting & recovery doc (`PROVE-03`, `D-09`) | Add concise cross-reference callout at top distinguishing low-level runtime dispatch accounting from end-user workflow entry (`docs/task-entry*.md`) | `docs/task-runtime-controls.md` (`L1-L22`) | Exact (in-place edit) |
| `docs/SUPPORT_MATRIX.md` *(preserved target)* | Canonical v0.1.0 `alpha-aos doctor --matrix` ledger (`PROVE-01`, `D-01`) | Read-only cross-link target — **keep bytes/schema/columns untouched** so `doctor --matrix` and `test/provenance.test.ts` never regress; link *to* it from new docs | `docs/SUPPORT_MATRIX.md` (`L1-L36`), `test/provenance.test.ts` (`L218`) | Exact (read-only boundary) |
| `docs/task-bootstrap-proof.md` *(modified)* | Phase 29 bootstrap proof ledger (`PROVE-02`, `D-01`, `D-05`) | Replace literal Windows user-profile paths (`L96-L97`, `L111`, `L119`, `L123`) with portable `<scratch-root>/...` aliases while preserving SHA-256 & commit SHAs; cross-link `docs/task-entry-proof.md` | `docs/task-bootstrap-proof.md` (`L94-L130`), `src/core/release-package-proof.ts` (`L72-L79`) | Exact (in-place sanitization) |
| `docs/task-style-proof.md` *(modified)* | Phase 30 6-route proof ledger (`PROVE-02`, `PROVE-04`, `D-05`, `D-15`) | Replace `<drive>:/dev/...` (`L93`) with portable repo-relative path, fix `tarball.test.js` → `tarball-fixture.test.js` (`L79`), cross-link `docs/task-entry-proof.md` | `docs/task-style-proof.md` (`L72-L100`) | Exact (in-place sanitization) |
| `docs/task-style-proof-index.json` & `scripts/verify-task-style-native.mjs` *(modified)* | Phase 30 route receipt index & verifier (`PROVE-02`, `D-04`, `D-05`) | Replace `<drive>:/dev/alpha-AOS/.planning/tmp/pi-native-proof` (`L10,L34,L88,L112,L136,L190`) with portable relative locator so `assertNoPrivatePaths` passes on packaged JSON | `docs/task-style-proof-index.json` (`L6-L28`), `scripts/verify-task-style-native.mjs` (`L143-L153`) | Exact (in-place sanitization) |
| `scripts/audit-tarball.mjs` *(modified)* | `npm pack` POSIX ustar allowlist & content auditor (`PROVE-02`, `D-05`) | Decode gzipped tarball → check allowlist + assert `REQUIRED_V060_ENTRIES` + scan inspectable text entries for `PRIVATE_PATH_PATTERN` / `.planning/tmp/` → exit `0` or `3` | `scripts/audit-tarball.mjs` (`L87-L226`, `L284-L319`), `src/core/release-package-proof.ts` (`L72-L79`) | Exact (in-place extension) |
| `src/core/doctor.ts` *(modified)* | Diagnostic service (`PROVE-02`, `D-06`, `D-07`) | Read packaged `<root>/<skill.source>`, verify frontmatter + `sourceSha256` + all 5 `renderOwnedSkill` `targetSha256` against `stack.lock.json` (`level: "error"` on tamper; host-global drift stays non-error under Global Apply Hold) | `src/core/doctor.ts` (`L15-L59`, `L97-L109`), `src/core/owned-skills.ts` (`L60-L106`) | Exact |
| `test/doctor.test.ts` *(modified)* | Unit/integration diagnostics test (`PROVE-02`, `D-06`, `D-07`) | Pass synthetic `Inventory` + temp package root copy into `runDoctor(catalog, lock, inventory, root)` to assert `ok` baseline and `error` on tampered `SKILL.md` or `targetSha256` | `test/doctor.test.ts` (`L8-L31`) | Exact (in-place extension) |
| `test/tarball-fixture.test.ts` *(modified)* | Post-suite isolated `npm pack` lifecycle & E2E CLI proof (`PROVE-02`, `D-06`–`D-08`) | `hostSnapshot` before → `packRelease` + `installPackedRelease` → 5-target `owned-skills sync` hash/frontmatter/`CURRENT` + tamper refusal (`install` & `doctor`) + `inventory` discovery + packed `project mode`/`task intake`/`task readiness`/`task preview` → `hostSnapshot` clean after | `test/tarball-fixture.test.ts` (`L40-L59`, `L325-L474`), `test/helpers/packed-sandbox.ts` (`L147-L223`, `L574-L581`) | Exact (extend single `packed` slot) |
| `test/task-entry-cross-harness.test.ts` *(new)* | Deterministic 5-harness composed scenario & negative-boundary suite (`PROVE-01`, `PROVE-04`, `D-02`, `D-13`) | `createIsolatedSandbox` + real CLI/domain calls across `claude`, `codex`, `antigravity`, `pi`, `hermes` for all 4 positive/negative scenario chains | `test/project-mode-routing.test.ts` (`L20-L141`), `test/task-bootstrap-acceptance.test.ts` (`L14-L120`), `test/task-style-acceptance.test.ts` (`L50-L120`) | Exact |
| `test/task-entry-proof.test.ts` *(new)* | Verifier unit & CLI boundary suite (`PROVE-01`, `D-01`–`D-04`) | `mkdtemp` fixtures testing `scripts/verify-task-entry-proof.mjs` in git-checkout mode, unpacked-package mode (no `.git`/`.planning`), 64 KiB cap, symlink refusal, spoofing refusal, and private-path refusal | `test/task-style-native-proof.test.ts` (`L17-L291`) | Exact |
| `test/task-entry-docs.test.ts` *(new)* | Bilingual documentation symmetry, link & hygiene gate (`PROVE-02`, `PROVE-03`, `D-05`, `D-09`–`D-12`) | Read `README*.md`, `docs/task-entry*.md`, `docs/*`, `skills/*`, `schemas/*`, `package.json` → assert H2/H3 parity, verbatim 6 Korean labels, relative links, `"0.5.0"` version hold, untouched `SUPPORT_MATRIX.md`, and `assertNoPrivatePaths` | `test/provenance.test.ts` (`L203-L235`), `src/core/release-package-proof.ts` (`L72-L79`) | High |

---

## Pattern Assignments

### 1. `scripts/verify-task-entry-proof.mjs` *(new)* & `docs/task-entry-proof-index.json` *(new)*
**Closest Analogs:** `scripts/verify-task-style-native.mjs` and `docs/task-style-proof-index.json`

#### Imports, Bounds & CLI Entrypoint (`scripts/verify-task-style-native.mjs:15-39, 68-80, 363-367`)
```javascript
import { existsSync, lstatSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { isAbsolute, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const MAX_INDEX_BYTES = 64 * 1024; // 64 KiB
const SUPPORTED_HARNESSES = new Set(["claude", "codex", "antigravity", "pi", "hermes"]);

function fail(message, jsonOutput, code = "INVALID_INDEX") {
  if (jsonOutput) {
    console.log(JSON.stringify({ valid: false, code, error: message }, null, 2));
  } else {
    console.error(`Verification Failed [${code}]: ${message}`);
  }
  process.exit(1);
}

function computeFileSha256(filePath) {
  const bytes = readFileSync(filePath);
  return createHash("sha256").update(bytes).digest("hex");
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const { indexPath, jsonOutput } = parseArgs(process.argv.slice(2));
  verifyTaskEntryProof(indexPath, jsonOutput);
}
```

#### Regular-File, Size & Anti-Spoofing Guards (`scripts/verify-task-style-native.mjs:115-133, 276-290`)
```javascript
if (!existsSync(indexPath)) {
  fail(`Index file does not exist: ${indexPath}`, jsonOutput, "INDEX_NOT_FOUND");
}
const stat = lstatSync(indexPath);
if (stat.isSymbolicLink()) {
  fail(`Index file is a symbolic link: ${indexPath}`, jsonOutput, "SYMLINK_REJECTED");
}
if (!stat.isFile()) {
  fail(`Index path is not a regular file: ${indexPath}`, jsonOutput, "NOT_A_FILE");
}
if (stat.size > MAX_INDEX_BYTES) {
  fail(`Index file exceeds limit of 64 KiB (${stat.size} bytes)`, jsonOutput, "INDEX_TOO_LARGE");
}
```
```javascript
// Provenance check against native-label spoofing
if (entry.provenance === "fixture" || entry.harness === "fixture" || entry.isFixture === true) {
  return {
    route,
    status: "blocked",
    reason: "Native-label spoofing detected: entry declared evidenceTier 'native' but indicates fixture provenance",
    issues: ["Spoofed native label on fixture evidence"],
  };
}
```

#### Adaptation Notes for Phase 31 (`D-01`–`D-04`)
- Scan raw index text against `PRIVATE_PATH_PATTERN` (`/([a-zA-Z]:[\\/](?:Users|dev|home|temp|AppData)|[\\/](?:home|Users)[\\/])/iu`) and fail closed (`PRIVATE_PATH_DETECTED`) before trusting parsed fields.
- Validate all 55 (`5 harnesses × 11 axes`) cells across statuses `"verified-native" | "verified-fixture" | "unsupported" | "unverified" | "blocked"` plus non-empty `reasonCode`. Reject `status: "verified-native"` on `hermes` GSD controller/6-route execution axes (`HERMES_WORKER_ONLY_NO_GSD_CONTROLLER`) and reject any fixture-provenance cell claiming `verified-native`.
- **Dual-context rule (`D-04`):** Always verify packaged on-disk SHA-256 bindings (`skills/alpha-aos-task/SKILL.md`, `catalog/stack.lock.json` `ownedSkills["alpha-aos-task"]` source + 5 target hashes, `schemas/*.schema.json`, `docs/task-entry*.md`) relative to `packageRoot = resolve(indexDir, "..")`. Verify `checkoutOnly` anchors (`test/*.test.ts` existence and `git cat-file -t <commitSha>`) when `existsSync(join(packageRoot, ".git"))` is true; when absent (inside an `npm pack` install), report `verificationContext: "packed-package"` (`checkoutAnchorsPresent: false`, `valid: true`) without requiring `.git` or `.planning/tmp/`.

---

### 2. `docs/task-entry-proof.md` *(new)*, `docs/task-bootstrap-proof.md` *(modified)*, `docs/task-style-proof.md` *(modified)* & `docs/task-style-proof-index.json` *(modified)*
**Closest Analogs:** `docs/task-style-proof.md` (`L5-L100`) and `docs/task-bootstrap-proof.md` (`L83-L137`)

#### Regression & Historical Debt Structure (`docs/task-style-proof.md:44-59, 73-80`)
```markdown
### Quick 261101-ww3 Unexecuted Suites
In quick task `261101-ww3` (`.planning/quick/261101-ww3-make-milestone-capable-gsd-full-profile-/261101-ww3-SUMMARY.md`), four suites were not executed following an unresolved Phase 26 worker handshake timeout:
1. `task-progress-integration.test.js`
2. `task-progress.test.js`
3. `verify-efficient-wait.test.js`
4. `tarball-fixture.test.js`

These suites remain recorded as historical debt; they are not marked passed without demonstrable current execution.
```

#### Adaptation & Hygiene Rules (`D-01`, `D-05`, `D-14`, `D-15`)
- In `docs/task-bootstrap-proof.md` (`L96-L97`, `L111`, `L119`, `L123`), replace the literal user-profile scratch prefix with `<scratch-root>/native-bootstrap-receipt.json` and `<scratch-root>/native-bootstrap-project` while keeping `pending-native-tracer-290602`, `677f47e854ce5659df6bb77635e77fd883972f8c1b29b33961d65e36adba8745`, and `3adb72549623865abc4187715bc344b346f8acc9` untouched.
- In `docs/task-style-proof.md`, fix `L79` `tarball.test.js` → `tarball-fixture.test.js` and sanitize `L93` (`<drive>:/dev/alpha-AOS/.planning/tmp/pi-native-proof` → `.planning/tmp/pi-native-proof`). In `docs/task-style-proof-index.json` (`L10,L34,L88,L112,L136,L190`), use portable `../.planning/tmp/pi-native-proof` (relative to `docs/`) so zero `<drive>:/dev` substrings remain in packaged files.
- Leave `docs/SUPPORT_MATRIX.md` (`L1-L36`) **byte-untouched** (`D-01`); link *to* `./SUPPORT_MATRIX.md` and `./SUPPORT_MATRIX_v0.2.0.md` from `docs/task-entry-proof.md`.
- In `docs/task-entry-proof.md`, include a side-by-side comparison table contrasting `261101-ww3` status vs Phase 31 single-`HEAD` measured results for `command-job-runtime.test.js` and the 4 `261101-ww3` suites, keeping `skipped`, `not-run`, and `held` (`3-OS/macOS CI`, `Claude G-07-2`, `global apply`, `git push`, `npm publish`) strictly separate from `passed`.

---

### 3. `scripts/audit-tarball.mjs` *(modified)*
**Closest Analogs:** `scripts/audit-tarball.mjs` (`L147-L226`) and `src/core/release-package-proof.ts` (`L72-L79`)

#### Existing Archive Decoder & Allowlist Loop (`scripts/audit-tarball.mjs:147-155, 166-190, 217-225`)
```javascript
    if (typeFlag === "0" || typeFlag === "\0") {
      const collisionKey = path.toLowerCase();
      if (seenPaths.has(collisionKey)) throw new Error(`Duplicate or case-colliding tar entry path: ${path}`);
      seenPaths.add(collisionKey);
      files.push({ path, size });
    }
    offset = paddedEnd;
```
```javascript
export function auditTarballEntries(files) {
  const forbiddenPatterns = [
    /candidate\.lock\.json$/iu,
    /^\.planning(?:\/|$)/iu,
    /^test(?:\/|$)/iu,
    /\.ts$/iu,
    /^\.git(?:\/|$)/iu,
    /\.log$/iu,
    /^scratch(?:\/|$)/iu,
  ];
  const allowedExact = new Set([
    "package.json",
    "README.md",
    "README.ko.md",
    "LICENSE",
    "CHANGELOG.md",
    "dist/build-artifact.json",
    "catalog/stack.yaml",
    "catalog/stack.lock.json",
    "catalog/computer-use-runtime.json",
    "catalog/facts.yaml",
    "catalog/canaries.yaml",
  ]);
  const allowedPrefixes = ["dist/src/", "catalog/packs/", "schemas/", "scripts/", "skills/", "docs/"];
```

#### Adaptation Notes for Phase 31 (`D-05`)
- Preserve backwards compatibility for synthetic unit-test calls to `auditTarballEntries(files)` in `test/tarball-fixture.test.ts` (where minimal synthetic entry arrays may omit `content` or full release files unless opted in, OR add an options parameter `{ requireReleaseSurface?: boolean }` / separate `auditReleaseSurface(files)` invoked by `runCli()` and `installPackedRelease`).
  > **Critical:** Check `test/tarball-fixture.test.ts` unit tests around `auditTarballEntries`! Synthetic unit tests pass small 2–3 entry arrays to `auditTarballEntries([{ path: "package.json", size: 10 }])` to test allowlist/forbidden rules in isolation. Keep `auditTarballEntries(files)` pure on entry metadata (plus optional `text` private-path check when `entry.text` is provided), and add `auditRequiredReleaseEntries(files)` (or `{ checkRequiredEntries: true }`) called in `runCli()` and `installPackedRelease` so existing synthetic unit tests stay 100% green while real tarballs enforce `REQUIRED_V060_ENTRIES` + UTF-8 `PRIVATE_PATH_PATTERN`!
- Capture UTF-8 `text` in `listTarballFiles` for inspectable text entries (`README*.md`, `CHANGELOG.md`, and `.md`/`.json`/`.yaml`/`.yml` under `docs/`, `skills/`, `schemas/`) from `archive.subarray(dataStart, dataEnd)`, and append a violation if `PRIVATE_PATH_PATTERN.test(entry.text)` matches.

---

### 4. `src/core/doctor.ts` *(modified)* & `test/doctor.test.ts` *(modified)*
**Closest Analogs:** `src/core/doctor.ts` (`L46-L54`, `L97-L109`), `src/core/owned-skills.ts` (`L60-L106`), and `test/doctor.test.ts` (`L8-L31`)

#### Current `runDoctor` Owned-Skill Branch & Host Warning Precedent (`src/core/doctor.ts:46-54, 103-106`)
```typescript
    if (name === "ownedSkills") {
      for (const [skill, entry] of Object.entries(component as NonNullable<StackLock["components"]["ownedSkills"]>)) {
        const targetHashesValid = Object.values(entry.targetSha256).every((hash) => /^[a-f0-9]{64}$/u.test(hash));
        findings.push(/^[a-f0-9]{64}$/u.test(entry.sourceSha256) && targetHashesValid
          ? { level: "ok", code: `lock.owned-skill.${skill}`, message: `${skill} has SHA-256 source lock` }
          : { level: "error", code: `lock.owned-skill.${skill}`, message: `${skill} source hash is missing` });
      }
      continue;
    }
```
```typescript
    const managed = ["unified-memory", "documentation-lookup", "deep-research"];
    findings.push(managed.every((skill) => overrides[skill] === "user-invocable-only")
      ? { level: "ok", code: "policy.claude-ecc-skills", message: "Claude keeps the three managed ECC skills user-invocable-only" }
      : { level: "warning", code: "policy.claude-ecc-skills", message: "Claude managed ECC skills are not all user-invocable-only; run skill-policy sync --target claude" });
```

#### Canonical Owned-Skill Renderer & Hash Verification (`src/core/owned-skills.ts:60-69, 92-106`)
```typescript
export function renderOwnedSkill(source: string, target: HarnessId, invocation: "explicit" | "automatic", argumentHint?: string): string {
  if (!["claude", "codex", "antigravity", "pi", "hermes"].includes(target)) {
    throw new Error(`Owned skill renderer is not implemented for target: ${target}`);
  }
  if (!source.startsWith("---\n")) throw new Error("Owned skill source must start with YAML frontmatter");
  const additions: string[] = [];
  if (argumentHint) additions.push(`argument-hint: ${JSON.stringify(argumentHint)}`);
  if (invocation === "explicit") additions.push("disable-model-invocation: true");
  return additions.length === 0 ? source : `---\n${additions.join("\n")}\n${source.slice(4)}`;
}
```

#### Adaptation Notes for Phase 31 (`D-06`, `D-07`)
- Add optional `root: string = packageRoot()` parameter to `runDoctor(catalog: StackCatalog, lock: StackLock, inventory: Inventory, root: string = packageRoot()): Promise<DoctorFinding[]>` (backward-compatible with `src/cli.ts` and `test/doctor.test.ts:28`).
- For each owned skill in `lock.components.ownedSkills`:
  1. Look up `catalog.components.ownedSkills.find((item) => item.id === skill)`.
  2. Read `<root>/<catalogSkill.source>`, verify YAML frontmatter (`name:` + `description:`), verify `sha256(source) === entry.sourceSha256`, and for every `target` in `catalogSkill.targets` verify `sha256(renderOwnedSkill(...)) === entry.targetSha256[target]`. Emit `level: "error"` (`code: "lock.owned-skill.<id>"`) on any missing file, invalid frontmatter, or hash mismatch → causes `alpha-aos doctor` to exit `2` (fail-closed) when packaged `SKILL.md` or `stack.lock.json` is tampered!
  3. Do **not** emit `level: "error"` when a host user's `~/.claude/skills/...` or `~/.agents/skills/...` is absent or un-reconciled (emit `warning` only if checking deployed host roots), keeping `test/doctor.test.ts:28-30` green under the Global Apply Hold.

---

### 5. `test/tarball-fixture.test.ts` *(modified)*
**Closest Analogs:** `test/tarball-fixture.test.ts` (`L40-L59`, `L325-L474`) and `test/helpers/packed-sandbox.ts` (`L147-L223`, `L262-L294`, `L311-L350`, `L574-L581`)

#### Isolated Packed Sandbox + `hostSnapshot` Lifecycle (`test/tarball-fixture.test.ts:325-361, 450-474`)
```typescript
test("packed release completes the isolated install, reconcile, diagnose, and uninstall lifecycle", { timeout: 900_000 }, async (context) => {
  const beforeManifests = new Map<string, HostFingerprint>();
  const beforeHost = await hostSnapshot(beforeManifests);
  const sandbox = await createIsolatedSandbox(context);
  // ...
  const release = await installPackedRelease(sandbox, { tarballPath, hostNpmCache: sandbox.cache });
  const tarballBefore = release.tarballSha256;
  await seedHarnessPrerequisites(sandbox, release, "codex");

  const initial = parseJsonResult<InstallResult>(
    sandbox.runCli(["install", "--target", "codex", "--apply", "--json"]),
    "initial install",
  );
  // ...
  const findings = parseJsonResult<readonly { level?: unknown; code?: unknown }[]>(
    sandbox.runCli(["doctor", "--json"]),
    "doctor",
  );
  assert.deepEqual(findings.filter((finding) => finding.level === "error"), []);
  // ...
  const afterManifests = new Map<string, HostFingerprint>();
  const afterHost = await hostSnapshot(afterManifests);
  assert.deepEqual(afterHost, beforeHost, describeHostDrift(beforeManifests, afterManifests));
  assert.equal(vanishedEntryCount(beforeManifests) + vanishedEntryCount(afterManifests), 0, describeHostDrift(beforeManifests, afterManifests));
```

#### Adaptation Notes for Phase 31 (`D-06`–`D-08`)
- Keep all `hostSnapshot`-guarded packed checks inside `test/tarball-fixture.test.ts` because `scripts/run-tests.mjs:173` (`files.filter((file) => file.endsWith("tarball-fixture.test.js"))`) reserves the post-suite `packed` slot exclusively for this filename.
- Add `join(hostHome, ".agents", "skills", "alpha-aos-task", "SKILL.md")` (and Claude/Antigravity/Hermes `alpha-aos-task` host skill paths if desired) to `hostMutationTargets` (`L46-L55`) so `hostSnapshot` explicitly proves zero host `alpha-aos-task` mutation!
- Before the `uninstall --all --yes --apply --purge` step (or in a sibling sub-step sharing the packed tarball):
  1. **5-target `alpha-aos-task` sync & `CURRENT` proof (`D-06`, `D-07`):** Run `owned-skills sync alpha-aos-task --target <h> --apply --json` and dry-run `owned-skills sync alpha-aos-task --target <h> --json` across all 5 targets (`claude`, `codex`, `antigravity`, `pi`, `hermes`), asserting `action === "current"`, `currentHash === expectedHash`, valid YAML frontmatter, and all 6 Korean style labels.
  2. **Tamper fail-closed proof (`D-06`):** Corrupt `<release.installedPackage>/skills/alpha-aos-task/SKILL.md` inside `try { ... } finally { restore }` and assert non-zero failure on both `sandbox.runCli(["install", "--target", "codex"])` and `sandbox.runCli(["doctor", "--json"])`; repeat with a corrupted `targetSha256.pi` in `<release.installedPackage>/catalog/stack.lock.json` (`owned-skills sync` + `doctor` both fail closed). Ensure any skills synced during 5-target checks outside `codex` are cleaned or isolated before final `uninstall` assertions if needed.
  3. **Read-only discovery + packed E2E CLI invocation (`D-07`, `D-08`):** Invoke `inventory --json`, `project mode` (default `strict` zero-write, `set flexible` preview/apply, `set strict` preview/apply, `rollback --apply`), `task intake --input ... --json` (6 Korean labels, `executionAuthorized: false`), `task readiness --input ... --json` (`absent-project`, `partial-project`, `ready`, plus `hermes` controller refusal), `task preview <contract.json> --json` across `autopilot-quick`, `autopilot-quick-full` (`scope.quickQuality: "full"` digest binding), and `autopilot-phase`, plus `node <installedPackage>/scripts/verify-task-entry-proof.mjs --index <installedPackage>/docs/task-entry-proof-index.json --json`.

---

### 6. `test/task-entry-cross-harness.test.ts` *(new)*
**Closest Analogs:** `test/project-mode-routing.test.ts` (`L66-L141`), `test/task-bootstrap-acceptance.test.ts` (`L14-L120`), and `test/task-style-acceptance.test.ts` (`L50-L120`)

#### Multi-Harness CLI Subprocess Pattern (`test/project-mode-routing.test.ts:76-128`)
```typescript
  const queryA1 = spawnSync(
    process.execPath,
    [cliPath, "project", "mode", projectDir, "--json"],
    {
      env: { ...sandbox.env, ALPHA_AOS_STATE_DIR: stateRootA, CLAUDE_CONFIG_DIR: join(sandbox.home, ".claude") },
      encoding: "utf8",
    },
  );
  assert.equal(queryA1.status, 0);
  const viewA1 = JSON.parse(queryA1.stdout);
  assert.equal(viewA1.effectiveMode, "strict");
  assert.equal(viewA1.source, "builtin-default");
```

#### Dynamic GSD Readiness + Bootstrap Prepare/Apply Pattern (`test/task-bootstrap-acceptance.test.ts:69-120`)
```typescript
  const readyRes = spawnSync(
    process.execPath,
    [cliPath, "task", "readiness", "--input", readyReqPath, "--json"],
    { cwd: projectDir, env, encoding: "utf8" },
  );
  assert.equal(readyRes.status, 0);
  const readyData = JSON.parse(readyRes.stdout);
  assert.equal(readyData.diagnosis, "absent-project");
  assert.equal(readyData.ready, false);
```

#### 7-Stage Full Quality Gate Port Pattern (`test/task-style-acceptance.test.ts:50-99`)
```typescript
function fullFixturePorts(controller: ControllerPort, reviewer = staticReviewerPort(passingReview)): TaskPorts {
  return {
    ...fixturePorts({ controller, reviewer }),
    stageObservation: { supported: true, harness: "codex" },
  };
}
```

#### Adaptation Notes for Phase 31 (`D-02`, `D-13`)
- Build 4 paired positive/negative tests using `createIsolatedSandbox(context)` (safe for concurrent execution, zero `hostSnapshot` calls):
  1. **Policy Transition Chain vs Corrupt Policy / Root Mismatch:** `Codex` sets `flexible` → `Antigravity` intake sees `effectiveMode: "flexible"` (`nextAction: "adaptive-intake"`, `executionAuthorized: false`) → `Pi` sets `strict` → existing `Codex` session (reusing same `CODEX_HOME` + `stateRoot`) runs next `task intake` and sees `effectiveMode: "strict"` (`nextAction: "choose-style"` with 6 Korean labels); **negative:** malformed `.alpha-aos/behavior.json` or mismatched `--plan-digest` / non-canonical symlinked escape fails closed.
  2. **Task Lifetime Boundary:** After `autopilot-phase` release task reaches terminal `completed`, a new independent bug-fix request (`taskContext` omitted or `status: "completed"`) forces a fresh 6-style chooser and cleanly routes to `autopilot-quick-full`; **contrast:** an active in-progress follow-up (`taskContext: { status: "active", boundStyle: "conversational-quick", canonicalRoot }`) preserves continuity without re-prompting, while a mismatched `canonicalRoot` blocks.
  3. **Bootstrap & Recovery Continuity vs Duplicate / Unapproved Start:** `absent-project` and `partial-project` (pre-existing `.planning/PROJECT.md` byte-preserved) prepare → recover → claim once (`route: "new-task"`, second reentry `route: "continue-existing"`), and when selected style is `autopilot-quick-full`, `dispatchAuthorized` stays `false` until explicit `approveTaskContract` (`--contract-digest <64-hex> --apply`) + separate `startTask`; **negative:** `startTask` before approval or with drifted `quickQuality` digest throws fail-closed.
  4. **Full Quality & Harness Ceiling:** `autopilot-quick-full` passes with all 7 `MANDATORY_FULL_STAGES` observed, whereas submitting ordinary-quick evidence (omitting `research`/`plan-check`) fails acceptance, tampered skill/lock hashes fail `planOwnedSkillSync`, and `controller: "hermes"` fails GSD readiness/controller dispatch with explicit `unsupported` reason.

---

### 7. `test/task-entry-proof.test.ts` *(new)*
**Closest Analog:** `test/task-style-native-proof.test.ts` (`L17-L120`)

#### Boundary & Spoofing Test Pattern (`test/task-style-native-proof.test.ts:21-40, 95-120`)
```typescript
  const missingRun = spawnSync(process.execPath, [verifierScript, "--index", join(baseTemp, "missing.json"), "--json"], {
    encoding: "utf8",
  });
  assert.notEqual(missingRun.status, 0);
  const missingOut = JSON.parse(missingRun.stdout);
  assert.equal(missingOut.valid, false);
  assert.equal(missingOut.code, "INDEX_NOT_FOUND");
```
```typescript
  const spoofRun = spawnSync(process.execPath, [verifierScript, "--index", spoofedPath, "--json"], {
    encoding: "utf8",
  });
  const spoofOut = JSON.parse(spoofRun.stdout);
  assert.equal(spoofOut.valid, false);
```

#### Adaptation Notes for Phase 31 (`D-01`–`D-04`)
- Test `scripts/verify-task-entry-proof.mjs` against:
  1. The real repository `docs/task-entry-proof-index.json` (`valid: true`, `verificationContext: "git-checkout"`, all 55 cells accounted for).
  2. A **packed-package copy** inside `mkdtemp` containing only `catalog/stack.lock.json`, `skills/alpha-aos-task/SKILL.md`, `schemas/*.schema.json`, `docs/task-entry*.md`, `docs/task-entry-proof-index.json`, and `scripts/verify-task-entry-proof.mjs` (no `.git`, no `.planning`, no `test/`) → exits `0` with `valid: true` and `verificationContext: "packed-package"`.
  3. Negatives: `> 64 KiB` index (`INDEX_TOO_LARGE`), symlinked index (`SYMLINK_REJECTED`), private host path inside index (`PRIVATE_PATH_DETECTED`), fixture cell spoofed as `verified-native`, `hermes` controller cell marked `verified-native`, and 1-byte mutation of `skills/alpha-aos-task/SKILL.md` (`PACKAGE_HASH_MISMATCH`).

---

### 8. `docs/task-entry.md` *(new)*, `docs/task-entry.ko.md` *(new)*, `README.md` *(modified)*, `README.ko.md` *(modified)*, `docs/task-runtime-controls.md` *(modified)* & `test/task-entry-docs.test.ts` *(new)*
**Closest Analogs:** `README.md` (`L265-L332`), `README.ko.md` (`L260-L317`), `test/provenance.test.ts` (`L203-L235`), and `src/core/release-package-proof.ts` (`L72-L79`)

#### Documentation Contract Test Pattern (`test/provenance.test.ts:203-220`)
```typescript
test("release documentation separates target scope from receipt-backed proof status", async () => {
  const releaseNotesPath = join(repositoryRoot, "docs", "RELEASE_NOTES_v0.1.0.md");
  const changelogPath = join(repositoryRoot, "CHANGELOG.md");
  assert.equal(existsSync(releaseNotesPath), true, "release notes must exist");
  assert.equal(existsSync(changelogPath), true, "changelog must exist");
  const releaseNotes = await readFile(releaseNotesPath, "utf8");
  const changelog = await readFile(changelogPath, "utf8");

  for (const document of [releaseNotes, changelog]) {
    assert.match(document, /^## Active Harnesses$/mu);
    assert.match(document, /Claude Code.*Codex.*Antigravity.*Pi.*Hermes/isu);
    assert.match(document, /docs\/SUPPORT_MATRIX\.md|SUPPORT_MATRIX\.md/iu);
    assert.match(document, /UNVERIFIED/iu);
  }
});
```

#### Adaptation Notes for Phase 31 (`D-09`–`D-12`)
- **Verbatim 6 Korean style labels (`D-10`):** Both `README.md` and `docs/task-entry.md` (as well as `README.ko.md` and `docs/task-entry.ko.md`) MUST preserve the exact untranslated Korean UI labels `대화형-quick`, `대화형-quick-full`, `대화형-phase`, `오토파일럿-quick`, `오토파일럿-quick-full`, `오토파일럿-phase` alongside numbers `1–6` and canonical IDs `conversational-quick` .. `autopilot-phase`.
- **Numbered H2 symmetry (`D-09`, `D-11`, `D-12`):** Give `docs/task-entry.md` and `docs/task-entry.ko.md` identical `## 1.` .. `## 8.` section numbering so `test/task-entry-docs.test.ts` can assert exact H2 count and numbering parity, positive/negative twin tables (simple-operation exemptions, task lifetime boundaries, `absent`/`partial` once-only handoff, direct GSD command precedence + autopilot approval/start split), honest 5-harness limitation rows (`Hermes` worker-only, `Claude Code` `G-07-2`, UI vs `1–6` text fallback, 3-OS CI hold), `package.json` `"version": "0.5.0"` non-inflation, valid relative markdown links, untouched `docs/SUPPORT_MATRIX.md` SHA-256/schema, and `assertNoPrivatePaths` across every packaged `README*.md`, `docs/**`, `skills/**`, and `schemas/**` text file.

---

## Shared Patterns

### 1. Private Host Path Zero-Leakage Guard (`src/core/release-package-proof.ts:72-79`)
Reuse `assertNoPrivatePaths` in TypeScript tests (`test/task-entry-docs.test.ts`, `test/tarball-fixture.test.ts`) and mirror the identical regex in dependency-free ESM scripts (`scripts/audit-tarball.mjs`, `scripts/verify-task-entry-proof.mjs`):
```typescript
const PRIVATE_PATH_PATTERN = /([a-zA-Z]:[\\/](?:Users|dev|home|temp|AppData)|[\\/](?:home|Users)[\\/])/iu;

export function assertNoPrivatePaths(text: string, contextLabel = "release document"): void {
  const match = PRIVATE_PATH_PATTERN.exec(text);
  if (match) {
    throw new Error(`private host path detected in ${contextLabel}: ${match[0]}`);
  }
}
```

### 2. CLI Subprocess Invocation & Strict JSON Output Parsing (`test/helpers/packed-sandbox.ts:139-145, 574-581`)
On Windows, invoke compiled/installed CLI entrypoints directly with `process.execPath` (`shell: false`, `windowsHide: true`) and parse JSON via `parseJsonResult`:
```typescript
export function parseJsonResult<T>(result: CommandResult, label: string): T {
  assert.equal(result.status, 0, `${label} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  try {
    return JSON.parse(result.stdout) as T;
  } catch {
    assert.fail(`${label} did not return JSON\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  }
}
```

### 3. Transactional Policy & Owned-Skill Mutation Discipline (`src/core/transaction.ts:203-235`, `src/core/owned-skills.ts:78-124`)
- Never write `.alpha-aos/behavior.json` or harness skill files directly in production logic; route policy mutations through `project mode set ... --plan-digest <digest> --apply` (`applyFileTransaction` with `policyOperation.kind === "project-mode"`) and skill deployments through `owned-skills sync` (`planOwnedSkillSync` / `applyOwnedSkillSync`).
- Respect the **Global Apply Hold** (`D-15`): never run `alpha-aos install --apply` or `owned-skills sync --apply` against the developer's real `os.homedir()`; run all `--apply` commands strictly inside `createIsolatedSandbox(context)` roots.

### 4. `tarball-fixture.test.ts` Post-Suite `hostSnapshot` Slot (`scripts/run-tests.mjs:171-193`)
```javascript
// The packed lifecycle fingerprints real host paths. Run it after the other
// files so another suite cannot write to those paths during its snapshot.
const packed = named === null ? files.filter((file) => file.endsWith("tarball-fixture.test.js")) : [];
```
- Only `tarball-fixture.test.ts` may fingerprint real developer host paths via `hostSnapshot()`.
- All new Phase 31 test suites (`test/task-entry-cross-harness.test.ts`, `test/task-entry-proof.test.ts`, `test/task-entry-docs.test.ts`) run in the `concurrent` pool and must confine all filesystem activity to `mkdtemp` / `createIsolatedSandbox(context)`.

---

## No Analog Found

None. Every planned file in Phase 31 maps directly to an established, git-tracked pattern in `scripts/`, `docs/`, `src/core/`, or `test/`.

---

## Metadata

- **Phase:** 31 (`31-cross-harness-proof-and-distribution`)
- **Requirements Covered:** `PROVE-01`, `PROVE-02`, `PROVE-03`, `PROVE-04`
- **Tracked-Source Verification (`#3645`):** Passed (`git ls-files` verified all 26 analyzed paths at `HEAD` `f0ff14d5ec043540354123bec641d2c0dacd209d`)
- **New Runtime Dependencies:** 0 (`package.json` remains at `"0.5.0"` with locked dependencies)
