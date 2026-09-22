---
phase: 02-evidence-bound-project-planning
reviewed: 2026-09-08T06:20:00Z
depth: standard
files_reviewed: 29
files_reviewed_list:
  - catalog/facts.yaml
  - catalog/packs/security.yaml
  - catalog/stack.lock.json
  - package.json
  - schemas/fact-vocabulary.schema.json
  - schemas/pack-catalog.schema.json
  - schemas/project-stack.schema.json
  - scripts/pin-pack-skills.mjs
  - src/cli.ts
  - src/core/ecc-fixture.ts
  - src/core/evidence.ts
  - src/core/ignore-list.ts
  - src/core/pack-catalog.ts
  - src/core/path-boundary.ts
  - src/core/project-plan.ts
  - src/core/project.ts
  - src/core/redaction.ts
  - src/core/validation.ts
  - src/format.ts
  - src/types.ts
  - test/catalog.test.ts
  - test/ecc-skills.test.ts
  - test/evidence.test.ts
  - test/helpers/git-fixture.ts
  - test/ignore-list.test.ts
  - test/pack-catalog.test.ts
  - test/preview.test.ts
  - test/project-plan.test.ts
  - test/project.test.ts
findings:
  critical: 4
  warning: 14
  info: 6
  total: 24
status: issues_found
---

# Phase 2: Code Review Report

**Reviewed:** 2026-09-08T06:20:00Z
**Depth:** standard
**Files Reviewed:** 29
**Status:** issues_found

## Summary

The module boundaries, the no-short-circuit evaluator, the fail-closed
managed-document route and the path-boundary proofs are genuinely careful work,
and the digest construction is clean of clocks and git refs. The defects are
concentrated where the *stated* invariants and the *executed* code diverge —
and in every case below the divergence is invisible to the test suite because
every fixture is a plain `mkdtemp` directory rather than a repository.

Four findings were reproduced against the compiled CLI (`dist/src/cli.js`) on
win32:

- `project plan` **never terminates** on any git-tracked npm/pnpm/cargo
  workspace (CR-01). Killed at 25 s with zero bytes of output; the byte-identical
  fixture with `.git` removed completes in under a second.
- A single in-tree directory symlink **silently deletes the real directory from
  the scan** and changes the pack selection (CR-02): `[BROWNFIELD_INIT, WEB_BASE,
  WEB_REACT]` collapses to `[WEB_REACT]`.
- An oversized `.gitignore` **containing only comment lines** makes the whole
  tree undecidable, and the plan reports a confident `No pack qualified on the
  evidence found.` with no trace of the refusal (CR-03). `ScanBound` and
  `ExcludedBoundary` are computed in full and then referenced nowhere outside
  `evidence.ts` — verified by grep.
- `project status` **crashes with a raw `TypeError`** on a hand-edited
  `.alpha-aos/plan.json` (CR-04), because that artifact is the one document in
  the phase that bypasses `validateManagedDocument`.

The recurring shape: `src/core/evidence.ts` builds a rich, honest record of
what it *could not* decide (`bounds`, `excludedBoundaries`, `dropped`,
`declarations`, `undecidable`), and `src/core/project-plan.ts` /
`src/format.ts` throw all of it away. The phase's own doctrine — "absence and
unreadability are different facts", "a truncated scan that looks complete is a
wrong answer that still looks like a decision" — is implemented one layer down
and then discarded one layer up.

## Critical Issues

### CR-01: `project plan` never terminates on a git-tracked workspace

**File:** `src/core/project-plan.ts:1104-1127`, `src/core/evidence.ts:97-107`
**Issue:** `planSubProject` (1104) and `describeSubProjects` (1117) recurse by
calling `planProjectCapabilities({ path: member.absolute })`. But
`resolveCanonicalRoot` (evidence.ts:97) walks *ancestors deepest-first looking
for a `.git` entry*, so from `/repo/packages/web` it resolves back to `/repo`.
The recursive call therefore re-scans the **same** canonical root, re-discovers
the **same** sub-projects, and calls `describeSubProjects` again — with no
narrowing and no termination condition. Each level performs a complete tree
scan plus full fact detection, so it hangs on I/O rather than overflowing the
stack.

Reproduced (compiled CLI, win32):

```
# fixture: package.json {"workspaces":["packages/*"]}, packages/{api,web}/package.json, plus .git/
$ timeout -s KILL 25 node dist/src/cli.js project plan <root>
Killed   # 0 bytes written, exit 137

# identical fixture with .git removed
$ node dist/src/cli.js project plan <root>
2 sub-project(s) discovered; none selected. Name one with --project <path>.   # <1s
```

This is not an edge case: it is every real monorepo. `--project packages/web`
is affected identically, and because the inner plan's `scope.canonicalRoot` is
the repo root, `planSubProject` would report the *root's* evidence under a
sub-project label even if it did terminate.

The test suite never sees it because `workspaceFixture`
(`test/project-plan.test.ts:561`) builds a bare `mkdtemp` directory with no
`.git`.

Root cause is CR-01's twin, WR-11: `RootReason` declares a
`project-declaration` rung that `resolveCanonicalRoot` never produces.

**Fix:** Give the recursive call an explicit root so the ladder cannot climb
back out, and add a cycle guard so a future ladder change cannot silently
reintroduce the loop.

```ts
// src/core/project-plan.ts
export interface PlanProjectCapabilitiesOptions {
  path: string;
  packageRoot: string;
  subProject?: string | undefined;
  /** Pins the canonical root; set when planning a discovered sub-project. */
  explicitRoot?: string | undefined;
}

// in planProjectCapabilities:
const scope = await resolveCanonicalRoot(options.path, options.explicitRoot);

// in planSubProject / describeSubProjects:
const plan = await planProjectCapabilities({
  path: member.absolute,
  packageRoot: options.packageRoot,
  explicitRoot: member.absolute,   // <- the ladder can no longer climb to the repo root
});
```

Note `explicit-override` is already a declared `RootReason`; if reusing it
would muddy the reported reason, add `project-declaration` and produce it here.
Add a regression test that builds the workspace fixture with
`createOrdinaryRepository` from `test/helpers/git-fixture.ts` — the helper
already exists and is exactly the instrument this case needs.

---

### CR-02: a directory symlink erases the real directory from the scan and changes pack selection

**File:** `src/core/evidence.ts:382-395` (`identityKeys`), `src/core/evidence.ts:536-544`
**Issue:** The walk records identity keys at the moment an entry is **listed**,
in ascending name order (`entries.sort(...)`), and the canonical key is
`path:${proof.canonical}` — the *resolved* target. So for a directory holding
`aaa -> src` and `src`:

1. `aaa` is listed first, resolves to the canonical path of `src`, is marked
   visited under `path:<canonical src>`, and is pushed into `directories` as
   `"aaa"`.
2. `src` is listed second, produces the same canonical key, matches `visited`,
   and is excluded as `visited-identity` — it never enters `directories` and its
   files never enter `files`.

The de-duplication is correct in intent (it terminates link cycles), but it
keeps the *alias* and discards the *real* directory whenever the alias sorts
first. Every `kind: directory` fact then answers negatively.

Reproduced (compiled CLI, win32, junction):

```
# root/{package.json with react, src/index.ts}, no symlink
selected: [ 'BROWNFIELD_INIT', 'WEB_BASE', 'WEB_REACT' ]
SAT BROWNFIELD_INIT existing-source src
SAT WEB_BASE browser-entrypoint src

# same root + junction  aaa -> src
selected: [ 'WEB_REACT' ]
FAIL BROWNFIELD_INIT existing-source  none of the declared directories exists under the canonical root: src, lib, app, pkg, internal
FAIL WEB_BASE      browser-entrypoint none of the declared directories exists under the canonical root: app, pages, src, public
```

The negative record's reason is actively wrong: `src` *does* exist under the
canonical root. This is repository-controlled input, so a repository can steer
its own pack selection by adding one link.

**Fix:** Prefer the real directory over an alias. The cheapest correct rule is
to skip link-kind entries for `directories`/traversal rather than letting them
claim the identity, and to record identity only for entries that are their own
canonical path:

```ts
// after the boundary proof, before identity marking:
const isAlias = proof.canonical !== absolute;   // a link, junction, or bind alias
if (isAlias) {
  excluded.push({ path: relativePath, reason: "visited-identity",
                  detail: `alias of ${toPosixPath(relative(root.root, proof.canonical))}` });
  continue;
}
```

If aliases must remain traversable, at minimum defer them: collect non-alias
directories first, then admit an alias only if its canonical target was not
otherwise reached. Either way, the `visited-identity` reason must name what it
aliased, so the exclusion is explainable.

---

### CR-03: a refused scan is reported as a confident "No pack qualified"

**File:** `src/core/evidence.ts:440-560` (bounds/exclusions produced),
`src/core/project-plan.ts:926-1101` (dropped), `src/format.ts:74`,
`src/types.ts:473-534`
**Issue:** `scanProjectTree` carefully records `bounds` (`MAX_SCAN_DEPTH`,
`MAX_SCAN_ENTRIES`, `MAX_SUB_PROJECTS`) and `excludedBoundaries` with reasons,
under a module comment stating "a truncated scan that looks complete is a wrong
answer that still looks like a decision". `planProjectCapabilities` consumes
only `discovery.selected` and `discovery.subProjects`; `ProjectCapabilityPlan`
has no field for either; `formatProjectPlan` prints neither. Verified:

```
$ rg "\.bounds|excludedBoundaries" src/ | rg -v "^src/core/evidence.ts"
(no matches)
```

The result is a confident wrong answer. Reproduced with a 351 KB `.gitignore`
whose every line is a comment (i.e. **zero effective rules**):

```
$ node dist/src/cli.js project plan <root>
Project: ...\bigignore (standalone-directory)
No pack qualified on the evidence found.
NEAR-MISS BROWNFIELD_INIT: ...
```

`package.json` declares `react`, and `src/index.ts` exists. Neither was read:
`loadIgnoreRules` returned `over-cap` (`ignore-list.ts:157`) with
`patterns: []`, `decideOne` (`ignore-list.ts:230`) answered `undecidable` for
every entry, and `scanProjectTree` silently excluded the whole tree. Nothing in
the output — human or `--json` — says a byte cap fired. The same silence
applies to `MAX_SCAN_ENTRIES=50000` and `MAX_SCAN_DEPTH=12` on any large or
deep repository.

This defeats the phase's central guarantee. A `STALE` classification, a pack
drop and an approval can all be derived from a scan that read nothing.

**Fix:** Carry the scan's honesty into the plan value and the rendering, and
digest it so a bounded scan cannot be approved as if it were complete.

```ts
// src/types.ts — ProjectCapabilityPlan
/** Every scan bound reached. Empty means the scan was complete, not merely quiet. */
scanBounds: ScanBound[];
/** Boundary exclusions whose reason is "undecidable" or "unreadable". Sorted. */
undecidableBoundaries: ExcludedBoundary[];

// src/core/project-plan.ts — planProjectCapabilities
scanBounds: [...evidence.scan.bounds, ...discovery.bounds]
  .sort((l, r) => byCodePoint(l.bound, r.bound) || byCodePoint(l.at, r.at)),
undecidableBoundaries: evidence.scan.excludedBoundaries
  .filter((b) => b.reason === "undecidable" || b.reason === "unreadable"),

// digestablePlan — so an approval cannot be reused after the bound clears
scanBounds: plan.scanBounds.map((b) => [b.bound, b.limit, b.at]),
undecidableBoundaries: plan.undecidableBoundaries.map((b) => [b.path, b.reason, b.detail]),

// src/format.ts — before the "No pack qualified" branch
for (const bound of plan.scanBounds) {
  lines.push(`BOUNDED ${bound.bound}=${bound.limit} reached at ${bound.at}; the scan is INCOMPLETE and the selection below is not a complete answer`);
}
for (const entry of plan.undecidableBoundaries) {
  lines.push(`UNDECIDABLE-PATH ${entry.path} — ${entry.detail ?? entry.reason}; nothing under it was read`);
}
```

---

### CR-04: `.alpha-aos/plan.json` is the one untrusted document that bypasses the strict route, and crashes `status`

**File:** `src/core/project-plan.ts:1306-1319` (`readApprovedProjectPlan`),
`src/core/project-plan.ts:1768-1771`, `1903-1918`
**Issue:** Every other repository-supplied document in this phase travels
`validateManagedDocument` with a schema — receipts (`readPackReceiptsStrict`,
line 1671), the project manifest, the pack catalog, the fact vocabulary. The
approved-plan artifact does not: `readApprovedProjectPlan` runs bare
`JSON.parse` and checks exactly three things (`approvedDigest` is a non-empty
string, `plan` is an object). Everything else is consumed on trust.

`.alpha-aos/` is designed to be committed and shared with a team, so this is
attacker-supplied input on every `git clone`. Two consequences:

1. **Crash.** `classifyInstalledPack` does
   `(approvedEvaluation?.satisfied ?? []).filter(...)` (line 1905). `?? []` only
   guards `null`/`undefined`, so a non-array `satisfied` reaches `.filter`.
   Reproduced:

   ```
   $ node dist/src/cli.js project status <root>
   alpha-aos: ((intermediate value) ?? []).filter is not a function
   ```

   `project status` — the only command that reports drift and staleness —
   becomes unusable, and the message is an internal JS error rather than a
   refusal naming the artifact.

2. **Attacker-authored justification for a deletion.** `StaleReason.sentence`
   is built from the approved plan's leaves and rendered verbatim as
   `STALE-FACT ...` (`src/format.ts`), and `unsupportedClaims` comes from
   `approved.applicable` cast with `as string[]` (line 1907-ish) with no element
   type check. A crafted `plan.json` plus a schema-valid receipt lets a
   repository put its own prose in front of a user who is being asked to approve
   a removal digest.

**Fix:** Route the artifact through the same door as everything else.

```ts
// add schemas/approved-plan.schema.json describing { schemaVersion, kind,
// approvedDigest, gitContext?, plan } with the plan's array fields typed.

let approvedPlanSchema: Record<string, unknown> | null = null;

export async function readApprovedProjectPlan(
  artifactPath: string,
  packageRoot: string,
): Promise<ApprovedProjectPlanArtifact | null> {
  if (!existsSync(artifactPath)) return null;
  let text: string;
  try { text = await readFile(artifactPath, "utf8"); } catch { return null; }
  approvedPlanSchema ??= JSON.parse(
    await readFile(join(packageRoot, "schemas", "approved-plan.schema.json"), "utf8"),
  ) as Record<string, unknown>;
  const result = validateManagedDocument<ApprovedProjectPlanArtifact>({
    text, format: "json", kind: "approved-plan", schema: approvedPlanSchema,
  });
  // A malformed artifact is "absent" for reconciliation purposes and is
  // REPORTED, never partially trusted.
  return result.ok && result.value !== null ? result.value : null;
}
```

Surface the refusal in `ProjectReconciliation` (e.g. `artifactState: "unreadable"`)
so `status` says *why* there is no approved plan instead of silently reporting
`absent`.

## Warnings

### WR-01: the plan digest depends on the reviewer's home directory

**File:** `src/core/project-plan.ts:1049-1056`, `722-740`
**Issue:** `discoverPersonalSkillNames()` reads `~/.claude/skills`,
`~/.agents/skills`, `$ANTIGRAVITY_CONFIG_DIR/skills` and `$HERMES_HOME/skills`
on the preview path. A hit appends a `SKILL_SHADOWED` approval, and `approvals`
is folded into `digestablePlan` (line 864). Two people reviewing the identical
commit of the identical repository therefore compute **different**
`planDigest` values, and a digest reviewed on a laptop cannot be approved on
CI. That contradicts the phase's byte-stability property.
**Fix:** Keep the collision report — it is genuinely useful — but move it out of
the digest. Either emit it as a rendered `NOTE`/`SHADOWED` line derived outside
`approvals`, or add a `hostNotes: string[]` field that `digestablePlan`
deliberately omits, with a comment stating why (mirroring how `createdAt` and
`gitContext` are already kept out).

### WR-02: one malformed receipt blocks plan approval, contradicting the tolerant path

**File:** `src/cli.ts:671`, `src/core/project-plan.ts:1671-1712`, `659-695`
**Issue:** `approveProjectPlan` deliberately tolerates an unreadable receipt via
`readReceiptClaims`, which records it and emits a `RECEIPT_UNREADABLE` approval.
But the CLI runs `planPackRemoval(await reconcileProjectState(planOptions))`
*first* on every `--apply`, and that path uses `readPackReceiptsStrict`, which
**throws** on any receipt that fails the schema. So a single corrupt receipt
makes plan approval impossible even though the approval flow was written to
handle it.
**Fix:** Only consult the removal set when the supplied digest is not the plan
digest, and degrade gracefully:

```ts
if (reviewed !== (await revalidateProjectPlan({ ...planOptions, stateRoot })).plan.planDigest) {
  let removal: RemovalPlan | undefined;
  try {
    removal = planPackRemoval(await reconcileProjectState(planOptions))
      .find((entry) => entry.removalDigest === reviewed);
  } catch (error) {
    throw new Error(`the digest is not the current plan digest, and the removal set could not be computed: ${String(error)}`);
  }
  ...
}
```

### WR-03: a schema-valid receipt can crash the removal path

**File:** `src/core/project-plan.ts:2212-2222`
**Issue:** `schemas/receipt.schema.json` permits `harness` values
`antigravity` and `hermes`, but `PROJECT_SKILL_ROOTS` only carries
`claude`/`codex`/`pi`. `removalAllowedRoots` throws a bare `Error` for the other
two — an uncaught crash driven by repository content that passed validation.
**Fix:** Either narrow the receipt schema's `harness` enum to the three harnesses
that have a project-local root, or turn the throw into a `ComponentPlanError`
that names the receipt and refuses the removal rather than aborting the command.

### WR-04: `buildSafeInverse` fabricates the guard hash for an unreadable target

**File:** `src/core/project-plan.ts:801-814`
**Issue:** For an `update` whose `currentHash` is `null` (the file exists but
could not be read — `inspectTargetPreState:770-779`), the inverse is
`{ operation: "restore", guard: { expectedHash: target.expectedHash } }`. That
guard asserts the pre-existing bytes hash to the *source* hash, which is
precisely the thing that was not observed. A restore guarded by an invented
hash either refuses confusingly or, worse, "restores" content that was never
there.
**Fix:** Model the unknown honestly and refuse the inverse rather than guessing:

```ts
if (target.currentHash === null) {
  return { packId: target.packId, operation: "restore",
           guard: { path: target.path, expectedHash: null } };  // widen SafeInverse.guard
}
```
and add a `TARGET_UNREADABLE` approval so a reviewer sees that this pack's undo
is not guarded.

### WR-05: one over-long pattern discards an entire `.gitignore`

**File:** `src/core/ignore-list.ts:225-233`
**Issue:** `decideOne` checks `ruleSet.undecidable.length > 0` *before*
`ruleSet.patterns.length === 0`, so a `.gitignore` with 500 valid patterns and
one line over `IGNORE_PATTERN_LENGTH_CAP` (1024) makes **every** path beneath
that directory `undecidable`. Fail-closed, but total: the subtree becomes
unscannable and — per CR-03 — invisibly so.
**Fix:** Distinguish "this file could not be read at all" (byte cap, unreadable,
pattern-count cap — genuinely undecidable) from "one line was too long to
compile" (the rest of the file is still a valid rule set). Only the former
should poison the set; the latter should be reported as a bounded note while
the remaining patterns still answer.

### WR-06: `--json` can emit silently truncated, unparseable JSON with exit 0

**File:** `src/cli.ts:163-172`, `src/core/redaction.ts:245-256`
**Issue:** `serializeObservable` returns `{ text, truncated }` explicitly so the
byte budget is "observable to the caller instead of silently dropping the tail"
— and `print()` writes `.text` and discards `.truncated`. Over
`LIMITS.totalBytes` (256 KiB) the JSON is cut mid-token and shipped as a
successful result. `project status --json` on a repo with many installed packs
is the realistic trigger.
**Fix:**

```ts
if (json) {
  const envelope = serializeObservable(value, context);
  if (envelope.truncated) {
    throw new Error(`the JSON envelope exceeds the ${256 * 1024}-byte observable budget (sha256=${envelope.sha256}); narrow the scope with --project or use the human rendering`);
  }
  process.stdout.write(`${envelope.text}\n`);
  return;
}
```

### WR-07: `redactDocument` measures its cap in bytes and slices in code units

**File:** `src/core/redaction.ts:156-161` (and the same shape at `245-256`)
**Issue:** `Buffer.byteLength(result, "utf8") > LIMITS.totalBytes` guards, then
`result.slice(0, LIMITS.totalBytes)` cuts by UTF-16 code units. For multi-byte
text the retained value can be up to ~3x the declared byte bound, so the bound
is not actually enforced; the cut can also split a surrogate pair and emit a
lone half.
**Fix:**

```ts
const buffer = Buffer.from(result, "utf8");
if (buffer.byteLength <= LIMITS.totalBytes) return result;
// toString on a Buffer slice replaces a split code point rather than emitting half of one
return `${buffer.subarray(0, LIMITS.totalBytes).toString("utf8")}…[truncated]`;
```

### WR-08: dropped workspace members and read declarations are never surfaced

**File:** `src/core/evidence.ts:960-1080`, `src/core/project-plan.ts:934-938`
**Issue:** `discoverSubProjects` builds a precise `DroppedMember[]` — "the entry
resolves outside the canonical root", "the entry sits behind a boundary: ...",
"the pattern matched no scannable directory" — and a `declarations` list, and
`planProjectCapabilities` reads neither. A typo'd or stale `workspaces` entry,
a member behind a submodule boundary, and a hostile `["../../.."]` all vanish
identically and silently. This is fully-written diagnostic work that no code
path can reach.
**Fix:** Carry `dropped` into the plan alongside the CR-03 fields and render one
`DROPPED-MEMBER <ecosystem> <declared> — <reason>` line each.

### WR-09: two different package roots decide two different catalogs

**File:** `src/core/project.ts:36-63`, `src/core/project-plan.ts:927-930`,
`src/core/project-plan.ts:1690`
**Issue:** `loadDeclaredPackIds()` and `loadManifestSchema()` resolve the
package root from `findPackageRoot(moduleDirectory) ?? findPackageRoot(cwd)`
and memoize it in module state, while `planProjectCapabilities` loads the pack
catalog and vocabulary from the caller-supplied `options.packageRoot`. The
`domain.unknown-pack-override` check can therefore be validated against a
different catalog than the one that evaluates the packs — and because
`declaredPackIds` / `manifestSchema` / `receiptSchema` are process-wide caches
keyed on nothing, the first caller wins for the lifetime of the process.
**Fix:** Thread `packageRoot` through `inspectProjectManifest` and
`readPackReceiptsStrict` (the latter already takes it, so only the schema cache
key needs fixing) and key the caches by root:
`const cache = new Map<string, ReadonlySet<string>>()`.

### WR-10: `unsupportedClaims` compares `applicable` against `selected`

**File:** `src/core/project-plan.ts:1907-1909` (approx.)
**Issue:** `claimed` is `approved.applicable` (selected **minus** D-11 target
conflicts) and it is filtered against `selectedNow = new Set(plan.selected)`
(before conflicts). A pack that is still selected but newly conflicted is
therefore reported as supported, and the two nouns the type comments carefully
distinguish are mixed at the one place it matters.
**Fix:** Compare like with like — `new Set(plan.applicable)` — or, if the intent
is "the evidence no longer supports this", compare `approved.selected` against
`plan.selected` and report conflicts separately.

### WR-11: three declared `RootReason` rungs are unreachable

**File:** `src/core/evidence.ts:28-34`, `88-107`
**Issue:** `RootReason` declares `worktree-root`, `submodule-root` and
`project-declaration`; `resolveCanonicalRoot` can only ever return
`explicit-override`, `git-root` or `standalone-directory`. The doc comment still
says the missing rungs "land with the boundary walk in a later plan of this
phase" — but this is the phase's delivered code. The value is digested
(`digestablePlan` → `scope.rootReason`), so the vocabulary is part of the
contract while three of its six members are dead. This is the direct cause of
CR-01.
**Fix:** Implement the `project-declaration` rung (a directory carrying a
`PROJECT_DECLARATION_FILES` entry stops the ladder before the git root), or
remove the unreachable members from the union and update the comment. Leaving a
digested enum with dead members invites exactly the mis-scoping CR-01 exhibits.

### WR-12: the ECC fixture temp root leaks on every failure

**File:** `src/core/ecc-fixture.ts:333`, `371`, `382-388`
**Issue:** `retain` is initialised to `true` and only set to
`options.keep ?? false` on the success path, so any throw between them skips the
`rm` in `finally` and leaves the extracted `node_modules` tree and the packed
tarball in `tmpdir()` forever. Nothing reports the retained path, so it is a
silent leak rather than a diagnostic retention.
**Fix:** If retention-on-failure is intended, say so and surface it —
`throw new Error(\`${message} (fixture retained at ${fixtureRoot})\`)`. If it is
not, initialise `let retain = options.keep ?? false;` and set it to `true` only
where diagnosis genuinely needs the tree.

### WR-13: `IGNORE_PATTERN_COUNT_CAP` is off by one

**File:** `src/core/ignore-list.ts:128-137`
**Issue:** `patterns.push(line)` happens before
`if (patterns.length > IGNORE_PATTERN_COUNT_CAP)`, so 5001 patterns are accepted
before the file is refused, and the reported `cap=5000` does not describe the
behaviour. `MAX_NEAR_MISS_LINES` / `MAX_TARGET_ROWS` use `slice`, so the caps in
this codebase are not consistent with one another.
**Fix:** `if (patterns.length >= IGNORE_PATTERN_COUNT_CAP) { ...refuse... }` before
the push, or document the boundary as "more than N".

### WR-14: `approvalCommand` quotes only on whitespace

**File:** `src/core/project-plan.ts:1238-1242`
**Issue:** The command is documented as "ready to paste" and is what every
refusal ends with, but quoting is applied only when `/\s/u` matches. A path
containing `"` produces a command that does not parse; a path containing shell
metacharacters (`$`, backtick, `;`) is emitted bare and would be interpreted by
the user's shell on paste. The path is user-supplied, so this is a
foot-gun rather than a privilege boundary — but it is presented as a safe next
step.
**Fix:** Quote unconditionally and escape the quote character, or emit the
argument vector as a list the user copies rather than a single shell line:

```ts
const quote = (value: string): string =>
  process.platform === "win32"
    ? `"${value.replace(/"/gu, '""')}"`
    : `'${value.replace(/'/gu, `'\\''`)}'`;
const target = /[\s"'$`;&|<>()]/u.test(parts.path) ? quote(parts.path) : parts.path;
```

## Info

### IN-01: the fact-vocabulary schema contradicts the evaluator

**File:** `schemas/fact-vocabulary.schema.json` (`description`),
`src/core/project-plan.ts:122-126`
**Issue:** The schema says `description` is "Read by humans reviewing the
vocabulary, **never by the evaluator**". `declaredPhrase()` renders every leaf
phrase — and therefore every `SELECT`, `NEAR-MISS` and `STALE-FACT` line — from
its first sentence.
**Fix:** Update the schema description to state that the first sentence is the
rendered phrase, so an editor knows the field is load-bearing output.

### IN-02: `x-*` extensions are allowed on facts but forbidden on packs

**File:** `schemas/pack-catalog.schema.json` (pack item
`additionalProperties: false`), `schemas/fact-vocabulary.schema.json`
(`patternProperties` for `^x-...`)
**Issue:** Two sibling contracts written in the same commit disagree about
whether a nested object may carry a namespaced extension.
**Fix:** Add the same `patternProperties` block to the pack item, or drop it
from the fact item, and state the rule once.

### IN-03: `globToRegExp` uses control-character sentinels

**File:** `src/core/evidence.ts:723-770`
**Issue:** The three sentinels `LEADING_GLOBSTAR` (U+0001), `TRAILING_GLOBSTAR`
(U+0002) and `INNER_GLOBSTAR` (U+0003) are spliced into the pattern string
before compilation, on the stated assumption that they "cannot occur in a path
segment". They can on POSIX, where any byte except `/` and NUL is a legal
filename character. A declaration entry containing one of the three would be
mis-compiled into a wildcard.
**Fix:** Reject any entry containing U+0001..U+0003 with a named `DroppedMember`
reason before the marking step, or tokenise the pattern into an array of parts
instead of splicing sentinels into the string.

### IN-04: `deploy-workflow` patterns can match across lines

**File:** `catalog/facts.yaml` (`deploy-workflow`, `release-workflow`)
**Issue:** `"^\\s{2,}environment:\\s*\\S"` is compiled with the `m` flag, and
`\s` matches `\n`. `^\s{2,}` can therefore straddle a blank line and match an
`environment:` key at column 0 of the next line. The file comment claims the
patterns are "anchored or literal", which this one is not in the intended sense.
**Fix:** Use `[^\S\r\n]` for horizontal whitespace: `"^[^\\S\\r\\n]{2,}environment:[^\\S\\r\\n]*\\S"`.

### IN-05: the built-in `project-manifest` core schema was not kept in step

**File:** `src/core/validation.ts:322-329`
**Issue:** `schemas/project-stack.schema.json` gained `packOverrides` and
`securityReview`; `CORE_SCHEMAS["project-manifest"]` did not. It is
closed-world (`additionalProperties: false`), so any caller that validates a
manifest without passing the external schema now rejects valid documents.
`inspectProjectManifest` always passes it, so nothing breaks today.
**Fix:** Mirror the two fields into `CORE_SCHEMAS`, or delete the built-in
manifest route now that `schemas/project-stack.schema.json` is the single source
of truth.

### IN-06: `.gitignore` escaped-comment lines are not handled

**File:** `src/core/ignore-list.ts:116-118`
**Issue:** gitignore(5) allows `\#` to escape a leading `#` for a file literally
named `#foo`. `parsePatterns` drops any line starting with `#` and does not
unescape `\#`, so `\#foo` is passed through to the matcher with its backslash.
**Fix:** `if (line.startsWith("#")) continue;` then
`patterns.push(line.startsWith("\\#") ? line.slice(1) : line);` — or note the
deviation explicitly, since the module claims to match `git check-ignore`.

---

_Reviewed: 2026-09-08T06:20:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
