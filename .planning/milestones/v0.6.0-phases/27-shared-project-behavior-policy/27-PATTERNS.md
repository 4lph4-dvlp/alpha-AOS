# Phase 27: Shared Project Behavior Policy - Pattern Map

**Mapped:** 2026-11-02
**Files classified:** 19 proposed new/modified files, including conditional prerequisites
**Analogs found:** 19 / 19 have reusable structural patterns; target-wide coordination and native invocation have no complete behavioral analog

Scope follows `27-CONTEXT.md` D-01–D-20 and `27-RESEARCH.md`. Destination names below are proposals, not implementation claims. All analogs were verified with `git ls-files`; none are installed/runtime mirrors. Five primary pattern families are sufficient: canonical roots, strict validation, reviewed transactions, CLI presentation, and owned-skill distribution.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/core/behavior-policy.ts` (new) | service | file-I/O, request-response | `src/core/evidence.ts:146`; `src/core/owned-skills.ts:152` | role-match, composite |
| `schemas/behavior-policy.schema.json` (new) | config | transform | `schemas/project-stack.schema.json:1`; `schemas/transaction-journal.schema.json:6` | role-match |
| `src/cli.ts` | controller | request-response | Same file:1567,1710,1878 | exact |
| `src/format.ts` | utility | transform | Same file:262,402,417 | exact |
| `src/core/writer-lock.ts` (target coordinator extension) | service | file-I/O | Same file:88,129,166 | role-match; current exclusion is state-wide |
| `src/core/transaction.ts` (policy apply/rollback metadata) | service | file-I/O | Same file:180,193,309,399 | role-match; policy rollback needs adaptation |
| `schemas/transaction-journal.schema.json` (if metadata added) | config | transform | Same file:6–8,23–39 | exact |
| `src/core/validation.ts` (journal metadata; policy kind only if necessary) | utility | transform | Same file:302,401,866 | exact |
| `src/core/path-boundary.ts` (identity prerequisite if exact identity claimed) | utility | file-I/O | Same file:30,365,407 | exact |
| `skills/alpha-aos-task/SKILL.md` | config | request-response | Same file:14–42,63–78,161–173 | exact |
| `catalog/stack.lock.json` | config | transform | Same file:130–138 | exact |
| `test/behavior-policy.test.ts` (new) | test | file-I/O, request-response | `test/transaction.test.ts:8`; `test/evidence.test.ts:137`; `test/validation.test.ts:72` | role-match |
| `test/project-mode-cli.test.ts` (new) | test | request-response, file-I/O | `test/rollback-cli-verification.test.ts:15` | role-match |
| `test/project-mode-routing.test.ts` (new) | test | request-response, transform | `test/owned-skills.test.ts:198` | role-match; fixture only |
| `test/project-mode-concurrency.test.ts` (new) | test | event-driven, file-I/O | `test/transaction-crash.test.ts:181,222,503` | role-match |
| `test/owned-skills.test.ts` | test | transform, file-I/O | Same file:198–240 | exact |
| `test/transaction.test.ts` | test | file-I/O | Same file:8–50 | exact |
| `test/rollback.test.ts` | test | file-I/O, transform | Same file:66–113 | exact |
| `test/transaction-crash.test.ts` (if coordinator/recovery changes) | test | event-driven, file-I/O | Same file:181–249,503–529 | exact |

`catalog/stack.yaml:66–69` already declares the automatic task skill for all five targets; reuse it unless routing metadata actually changes. `src/core/owned-skills.ts`, `src/core/evidence.ts`, `src/core/tree-policy.ts`, and `src/core/project.ts` are reuse/integration references, not blanket edit assignments. No manifest, dependency, GSD workflow or lifecycle-state changes are implied.

## Pattern Assignments

### `src/core/behavior-policy.ts`: canonical read, reviewed plan, one-file apply

**Primary analogs:** `src/core/evidence.ts:146–168` and `src/core/owned-skills.ts:152–219,252–271`.

Root API to call, not duplicate (`src/core/evidence.ts:146–150`):

```typescript
export async function resolveCanonicalRoot(
  inputPath: string,
  explicit?: string,
  pin: RootPin = "caller",
): Promise<CanonicalRoot> {
```

The resolver walks declaration and Git boundaries together, prefers a declaration at the same directory, and recognizes `.git` files. Its declaration list is `src/core/evidence.ts:732–737`. Pass a user-specified path as `explicit`; keep cwd/inference separate. Policy presence must not become a new declaration marker. `CanonicalRoot.projectId` is path-derived (`:61–67`), not filesystem object identity. Canonicalization accepts missing tails (`src/core/path-boundary.ts:139–157`); independently reject nonexistent, unreadable or non-directory roots and bound-task mismatches.

Import conventions from `src/core/owned-skills.ts:1–20`: Node built-ins first, `import type`, then explicit relative `.js` imports; named exported APIs, no path aliases. Useful imports already exist:

```typescript
import { applyFileTransaction } from "./transaction.js";
import { proveOperationPaths, type OperationPathInput, type OperationPathProofSet } from "./path-boundary.js";
import type { MutationSession } from "./writer-lock.js";
```

Digest convention (`src/core/component-session.ts:65–67`):

```typescript
export function reviewedDigest(kind: string, content: unknown): string {
  return createHash("sha256").update(`${kind}\n${JSON.stringify(content)}`, "utf8").digest("hex");
}
```

Adapt `planOwnedSkillOperation`'s explicit reviewed inputs (`src/core/owned-skills.ts:188–204`) to root path/reason/component identity, policy target, original-byte SHA-256 or distinct missing revision, requested mode and resulting change. Do not digest raw policy text into observable plan fields. Keep query/preview free of mutation sessions, mkdir and journals.

Inner write pattern (`src/core/owned-skills.ts:264–271`):

```typescript
const targetProof = plannedProof(reviewed, "target", reviewed.sync.destination);
await assertUnchangedSincePlan(reviewed, targetProof);
const journal = await applyFileTransaction({
  stateRoot: reviewed.stateRoot,
  allowedRoots: [reviewed.skillRoot],
  operations: [{ target: reviewed.sync.destination, content }],
  session,
});
```

For policy, use only the policy parent as the transaction's target root, while independently proving containment against the canonical project root. Acquire target coordination and the state session **before** rereading policy/recomputing the digest. The analog's pre-session revalidation at `:246–247` is insufficient for D-19. Revalidate reviewed bytes even for same-mode no-op, then return no operation ID and open no transaction. Missing→explicit strict is a create.

### `schemas/behavior-policy.schema.json` and `src/core/validation.ts`

Schema layout: `$schema`/`$id`/`type`/`required`/`properties` in `schemas/project-stack.schema.json:1–15`; explicit closed-world property in `schemas/transaction-journal.schema.json:6–8`. Adapt to exactly `schemaVersion: { const: 1 }`, required mode enum strict/flexible, and `additionalProperties: false`. No extensions, version-zero migration, absolute root, style, approval or budget fields.

Parser API (`src/core/validation.ts:302–305`):

```typescript
export function parseManagedDocument(options: {
  text: string;
  format: ManagedFormat;
}): { ok: boolean; value: unknown; issues: ValidationIssue[]; issuesTruncated: boolean } {
```

Then validate the **original unsplit value** using `validateAgainstSchema(value, schema)` (`:866–877`). Strict JSON rejects duplicate decoded property names and disallows comments/trailing commas (`:182–224`). Only narrow the value after both checks succeed.

**Conflict:** generic `schemaRoutesFor` registers a migratable older version (`:581–591`); `splitExtensions` removes namespaced keys before closed-world validation (`:631–643`). Reusing generic `validateManagedDocument` unchanged would violate D-02. Preserve its existing extension/migration behavior elsewhere; use the two lower-level APIs or a narrowly specialized policy route. Do not emit raw parser input or arbitrary property names from invalid policy in diagnostics; adapt bounded issue codes/shape to safe path/cause/remediation.

### `src/core/writer-lock.ts`: project-target coordination

**Analog:** existing exclusive-create ownership, not a ready-made policy coordinator.

Current scope (`:88–90`):

```typescript
export function writerLockPath(stateRoot: string): string {
  return join(stateRoot, "writer.lock");
}
```

Atomic acquisition (`:193–200`):

```typescript
let handle;
try {
  // `wx` is the exclusive-create flag: this is the atomic step that decides
  // which of two racing writers owns the root.
  handle = await open(lockPath, "wx", 0o600);
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  throw new WriterConflictError(await inspectWriterState(stateRoot));
}
```

Reuse ownership tokens, durable record, fail-fast contention and conservative repair (`:129–157,180–211`). `withComponentSession` accepts an already-held matching state session and closes only what it acquires (`src/core/component-session.ts:134–166`). Current session serialization does not coordinate two distinct state roots writing one project. Plan a canonical-target coordinator independent of caller stateRoot; define location, proof, token release, crash recovery and one lock order shared by apply and rollback. No target lock on query/preview/no-op; no age/PID-only lock deletion. No target coordinator was found in the searched project mutation paths.

### `src/core/transaction.ts`, journal schema, and policy rollback

Reuse `FileTransactionOptions`'s caller session (`:180–190`), snapshots/write-ahead before/after hashes (`:248–271`), path recheck (`:274–285`) and durable atomic replacement (`:152–163`):

```typescript
await handle.writeFile(content);
await handle.sync();
// handle is closed in finally before replacement
```

The actual replacement is `await rename(temporary, path);` followed by directory sync (`:162–163`). Current operation input has only target/content (`:74–77`), so it supplies no expected-before comparison. Hold the coordinator/session around policy reread, digest comparison and transaction.

Policy metadata must be additive, validated and sufficient for the common `rollback <operation-id>` path to recover the same target/root/coordinator. Keep old journals compatible. Update `TransactionJournal` (`:89–99`), closed external journal schema (`schemas/transaction-journal.schema.json:6–8,23–39`) and generic journal core route (`src/core/validation.ts:401–408`) together if metadata is introduced. Current rollback/list readers use JSON.parse/casts (`transaction.ts:311,401,433`); a new schema field alone does not validate metadata at consumption. Avoid inventing a second journal authority.

Required adaptations to current rollback:

- `rollbackManagedTransaction` simply plans then restores (`:421–423`), with no writer session; acquire the same target/state ownership and repeat LIFO/path/drift checks inside it.
- Existing restoration is `copyFile(snapshot, target)` (`:378–383`); policy restore needs durable atomic replacement of exact original bytes, including CRLF/Unicode.
- Creation rollback calls `sweepReverseDirectories` (`:384–387`). Its stop condition is the allowed root (`:47–69`); the policy parent boundary must preserve `.alpha-aos` and siblings. Do not trust a redirected parent as its own containment anchor.
- Current drift collection reads manual content and builds `unifiedDiff` (`:322–364`), which CLI prints (`src/cli.ts:1900–1906`). Policy operations need safe hash/path/remediation without arbitrary content; preserve generic diff behavior for other operations.
- Failure rollback runs while apply may still own its session (`:297–305`). Pass/reuse held ownership; do not recursively reacquire the lock.

### `src/core/path-boundary.ts`: identity prerequisite

Reuse `provePathBoundary({ path, allowedRoots, role })` (`:251–255`), `proveOperationPaths` (`:425–450`) and immediate `recheckPathProof` (`:365–417`). Missing components that become ordinary files/directories are intentionally accepted (`:376–399`); this is not byte freshness or missing-to-created protection. Keep raw-byte revision comparison separate.

`PathComponentIdentity.device` and `.inode` are `number | null` (`:30–40`), compared with numeric equality (`:407–410`). `.planning/PROJECT.md:62` records the Windows >2^53 precision gap. Plan a narrow exact-identity prerequisite and compatible serialization/tests, or explicitly bound the guarantee; a canonical path/projectId cannot substitute for replacement identity. Do not advertise exact replacement detection while this gap remains.

### `src/cli.ts` and `src/format.ts`

Insert `project mode` before the existing project command allowlist (`cli.ts:1567–1569,1643`). Keep it independent of project pack planning, manifest trust and GSD readiness. Reuse positional/value-flag parsing (`:173–189`), but validate the new exact grammar: query versus `set strict|flexible`, optional single path, `--plan-digest`, `--apply`, `--json`; reject malformed/extra operands and invalid mutation flags.

Preview/apply precedent (`cli.ts:1710–1728`) reads `--apply` and `--plan-digest`, prints a preview without applying, and refuses apply without the reviewed digest. Mode changes use their own setting digest; do not reuse autopilot contract approval. Route text/JSON through the existing print/redaction seam (`:1660,1673`). Extend HELP at `:57–62`; retain common rollback at `:1878–1911`.

Formatter pattern (`src/format.ts:417–428`, selected original lines):

```typescript
export function formatProjectApproval(result: ProjectApprovalResult): string {
  const approved = result.plan.applicable;
  return [
    `Project: ${result.plan.scope.canonicalRoot}`,
    `Approved packs: ${approved.join(", ") || "none"} (${approved.length})`,
    `Plan digest: ${result.plan.planDigest}`,
    `Artifact: ${result.artifactPath}`,
    `Transaction: ${result.operationId ?? "none"}`,
```

Adapt the return-oriented array/join style, not pack semantics. Query and preview both show canonical root/reason, mode/source, path/existence and revision; preview adds requested change, root identity and digest. Already-current text must agree with null operation ID and unchanged bytes (`format.ts:425–426`).

### Task skill and integrity: `skills/alpha-aos-task/SKILL.md`, lock and owned-skill tests

Insert explicit policy-only intent **before** the general two-path prompt (`SKILL.md:14–29`). Route preview/apply/query through the common CLI, show the concrete root/mode/change/digest, and reuse already-granted concrete setting authority. Freshly query each subsequent task intake; mixed requests handle the setting first then resume the original request. Preserve exact autopilot approval/start (`:63–78`) and no-inline execution/model boundaries (`:161–173`). Do not implement Phase 28 chooser or Phase 29 bootstrap.

Renderer pattern (`src/core/owned-skills.ts:64–68`):

```typescript
if (!source.startsWith("---\n")) throw new Error("Owned skill source must start with YAML frontmatter");
const additions: string[] = [];
if (argumentHint) additions.push(`argument-hint: ${JSON.stringify(argumentHint)}`);
if (invocation === "explicit") additions.push("disable-model-invocation: true");
return additions.length === 0 ? source : `---\n${additions.join("\n")}\n${source.slice(4)}`;
```

`catalog/stack.yaml:66–69` already sets automatic invocation for all five targets. Recompute the task source and every rendered target hash in `catalog/stack.lock.json:130–138` using the real renderer. Source and target hashes are separately enforced (`owned-skills.ts:94–104`). No global sync or third-party GSD edit is required for source/fixture proof.

### Test assignments: meaningful fixtures to reuse

Use `node:test`, `node:assert/strict`, isolated temp roots and `context.after` cleanup (`test/transaction.test.ts:1–17`). All new cases should name MODE IDs.

| Destination | Concrete reusable source | Required adaptation/oracle |
|---|---|---|
| `test/behavior-policy.test.ts` | `test/transaction.test.ts:8–34`; `test/evidence.test.ts:137–151`; `test/validation.test.ts:72–83` | Root ladder/real Git-file boundaries, missing strict, closed schema, duplicate/escaped duplicate keys, read/path/off failure, exact raw revisions; reverse generic extension/version-zero acceptance for this policy only |
| `test/project-mode-cli.test.ts` | `test/rollback-cli-verification.test.ts:15–56,59–92` | Spawn compiled CLI with isolated env; fingerprint project/home/state around query/preview/refusal; exact grammar/digest/no-op; no manifest/GSD dependency; rollback safe text/JSON |
| `test/project-mode-concurrency.test.ts` | `test/transaction-crash.test.ts:181–249,503–529` | Real independent children, observable ready/barrier with bounded deadline; one winner, fail-fast contention then stale on retry; repeat separate state roots and aliases; both apply/rollback orderings |
| `test/project-mode-routing.test.ts` and `test/owned-skills.test.ts` | `test/owned-skills.test.ts:198–240` | Replace sample-skill-only evidence with real task source/catalog/lock/render/plan/apply in five temp target homes; early settings route and fresh cross-target read; no global install |
| `test/transaction.test.ts`, `test/rollback.test.ts` | `test/transaction.test.ts:8–34`; `test/rollback.test.ts:66–113` | Original-byte restoration; first-create removes only policy; preserve parent/siblings; drift/link refusal; policy secret marker absent from both output formats; retain generic unified-diff expectations |
| `test/transaction-crash.test.ts` | Same file:222–249,503–529 | Preserve existing state-lock exclusion and repair behavior when adding target coordination/metadata; bounded child cleanup |

Zero-write assertion excerpt (`test/rollback-cli-verification.test.ts:43–46`):

```typescript
const homeAfterPreview = await fingerprintManifest(sandbox.home);
const stateAfterPreview = await fingerprintManifest(sandbox.state);
assert.equal(homeBefore.digest, homeAfterPreview.digest);
assert.equal(stateBefore.digest, stateAfterPreview.digest);
```

The reusable helper is tracked `test/helpers/packed-sandbox.ts:147–224,443–489`. It isolates env roots and fingerprints directory/link entries as well as file bytes. Its file content hashing is capped at 1 MiB (`:474–481`); keep these fixtures small or add explicit byte assertions. Since it precreates sandbox state, add an absent-state-root case to prove missing read/preview creates nothing.

Five-target deployment excerpt (`test/owned-skills.test.ts:204–209`):

```typescript
const stateRoot = join(tempRoot, "state");
const fakeHarnessRoots = join(tempRoot, "harnesses");

for (const target of ALL_HARNESSES) {
  const targetHome = join(fakeHarnessRoots, target);
  const plan = await planOwnedSkillSync(tempRoot, catalog, lock, "sample-skill", target, { targetHome, stateRoot });
```

Adapt the skill ID/source; retain actual renderer/integrity/transaction assertions, not string checks alone. Capability skips must remain explicit not-run evidence (`test/path-boundary.test.ts:904–911`). A CLI invocation, rendered skill or fixture transcript does not prove native host selection/invocation; record actual loaded-revision host/tool receipts separately or retain the checkpoint as unverified.

## Shared Patterns

- **Authority/guards:** Existing OS/sandbox/root/tree boundaries are the authority; this CLI feature has no HTTP authentication layer. Read-only `loadTreeRegistry` defaults without saving on ENOENT (`src/core/tree-policy.ts:124–138`); `resolveEffectivePolicy` resolves tree boundaries (`:74–103`). Check invocation location and selected root so an explicit ancestor does not evade tree-off. Do not invoke first-use classification or mutate registry.
- **Separate policy ownership:** `inspectProjectManifest` loads packs/schema/trust/migration (`src/core/project.ts:163–185`). It is a counterexample to coupling: behavior reads must work independently of that manifest and `.planning`.
- **Validation/errors:** Absent policy alone earns builtin strict. Invalid/unreadable/root failure gives no effective mode and no fallback. Expected diagnostics are return values or typed errors; core does not log. Keep safe cause/path/remediation and reject stale inputs before policy/journal mutation.
- **Mutation:** Canonical target ownership → state session → re-resolve/recheck/re-read/digest comparison → one-file transaction; rollback uses the same order. No LLM merge, timestamp authority, cache authority, global inheritance or second root ladder.

## No Complete Analog Found

| Concern | Closest structural analog | Missing behavior |
|---|---|---|
| Cross-state-root project-target coordinator | `src/core/writer-lock.ts:166–211` | Canonical-target scope, shared apply/rollback locking, stale-plan comparison and crash-repair policy must be designed/proven |
| Closed v1 behavior authority | `src/core/validation.ts:302,866` | No existing behavior schema/service; generic extensions/migrations deliberately differ |
| Policy-aware safe rollback | `src/core/transaction.ts:309–423` | Held ownership, validated root metadata, atomic exact restoration, no parent sweep or raw content diagnostics |
| Native five-host policy request proof | `test/owned-skills.test.ts:198–240` | Fixture deployment cannot demonstrate real native invocation/selection or loading of the edited revision |

These are explicit adaptations, not missing structural file matches. Use RESEARCH.md for proposed API/design and preserve native capability limits.

## Metadata

**Coverage:** 11 exact file-role matches; 8 role/composite matches; 0 files without a structural analog.
**Analog scope:** tracked `src/core`, `src/cli.ts`, `src/format.ts`, `schemas`, `skills/alpha-aos-task`, `catalog`, focused `test` files and sandbox helper.
**Files read for pattern extraction:** 25 tracked source/config/test files, plus phase/project scope documents; bounded slices used for large files.
**Project skills:** `.codex/skills` and `.agents/skills` discovery returned no local skill entries.
**Verification:** Source/track checks only. No implementation, test execution/pass, native invocation, global sync, commit or lifecycle transition claimed.
