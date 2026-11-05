# Phase 28 Pattern Map

**Mapped:** 2026-11-02 against `dbb29ac`; inline, read-only source inspection.

| New/modified file | Role and closest tracked analogue | Reuse / deliberate difference |
|---|---|---|
| `src/core/task-intake.ts` (new) | read-only decision service; `src/core/behavior-policy.ts` | `resolveProjectBehavior(input): Promise<ProjectBehaviorView>` supplies canonicalRoot/projectId/rootReason/effectiveMode/source/revision; retain structured errors, add task decision without writes |
| `schemas/task-intake.schema.json` (new) | closed versioned input; `schemas/behavior-policy.schema.json`, `src/core/validation.ts` | `additionalProperties:false`, duplicate-aware parse and `validateAgainstSchema`; no policy-schema extension |
| `src/core/task-intake-explicit.ts` (new) | bounded intent normalization; `src/core/task-gsd-lifecycle.ts:154` and task skill | preserve workflow + args as data; unlike `executeGsdStep`, never launch a harness |
| `src/core/task-intake-continuity.ts` (new) | exact read adapter; `src/core/task-read.ts:113`, `src/core/task-gsd.ts` | require exact run ID, root/digest/revision; GSD exact bounded artifact reads, never latest-run or full transcript |
| `src/core/task-intake-evidence.ts` (new) | read-only evidence; `src/core/evidence.ts`, `src/core/task-gsd.ts:84`, `src/core/path-boundary.ts` | root-contained finite paths and Git reads; reuse common path/probe rules; no broad detector scan/network operation |
| `src/cli.ts` | closed task verb + redacted render | add `intake` allowlist/early branch, `parseClosedFlags`, bounded input and `print` |
| `src/format.ts` | display domain result; `formatProjectBehavior` at line 433 | one typed decision drives both text/JSON; omit original request/file payloads |
| `skills/alpha-aos-task/SKILL.md` | actual user route; policy-only path already precedes intake | preserve mode-only/mixed requests; replace unconditional two-path chooser with common decision, use native/text capability honestly |
| `catalog/stack.lock.json` | source + five rendered skill hashes; `src/core/owned-skills.ts:95–109` | recompute only alpha-aos-task, no package-version/integrity drift |
| `test/task-intake-*.test.ts` (new) | real CLI fixture; `test/project-mode-cli.test.ts`, `test/project-mode-routing.test.ts` | spawn compiled CLI in `createIsolatedSandbox`, fixture homes; test positive/negative behavior, no paid native agent |
| `docs/task-runtime-controls.md` | existing mode/authority user contract | document intake read-only surface and six exact labels without claiming Phase 29/30 pipelines |

## Concrete seams

```ts
// src/core/behavior-policy.ts
export interface ProjectBehaviorInput {
  readonly invocationPath?: string | undefined;
  readonly projectRoot?: string | undefined;
  readonly boundProjectRoot?: string | undefined;
  readonly stateRoot?: string | undefined;
}
```

```ts
// src/core/owned-skills.ts
const rendered = renderOwnedSkill(sourceContent, target, skill.invocation, skill.argumentHint);
const expectedHash = locked.targetSha256[target];
```

```ts
// src/cli.ts: use the existing seam, not a new JSON writer
const envelope = serializeObservable(value, context);
if (envelope.truncated) throw new Error(describeOverBudgetEnvelope(envelope));
```

```ts
// src/core/task-read.ts: optional latest selection exists; intake MUST supply runId
export async function selectTaskExecution(options: {
  stateRoot: string;
  contractId: string;
  runId?: string | undefined;
  packageRoot?: string | undefined;
}): Promise<TaskSelectedExecution>
```

All existing paths above were checked against the tracked source tree. New files are explicitly proposed, not asserted to exist. `dist/`, installed skill mirrors and third-party workflow files are not edit targets. The codebase map is stale location guidance only.
