# Phase 30 — Pattern Map

Baseline: `ff505f6c87bd6f3f4220f64d78832829842e4111`; inline mapping under explicit user instruction. These are tracked source analogs, not installed mirrors. New paths are intentionally marked new.

| Planned surface | Closest analog / role | Data flow and required reuse |
|---|---|---|
| `src/core/task-style.ts` (new) | `src/core/task-intake.ts` style catalog; `task-intake-explicit.ts` | Pure projection of selected identity/explicit route; never another chooser/state store. |
| intake/handoff and schema/text | `TaskIntakePublicDecision`, `TaskIntakeHandoff`; `schemas/task-intake.schema.json`; `src/format.ts` | Same bounded result goes to CLI and five-target instructions. Preserve executionAuthorized false. |
| quick/phase metadata | `src/core/task-contract.ts`; `schemas/task-contract.schema.json`, `schemas/task-receipt.schema.json` | Schema→load→canonical view→digest→preview→approval→start; conditional optional fields preserve old bytes. |
| `src/core/task-gsd-stages.ts` (new) | `src/core/task-capability-receipts.ts`; `task-journal.ts`; `task-hook-receipt.ts` | Closed bounded evidence + private atomic persistence + exact run IDs. Evidence is not GSD lifecycle. |
| `src/core/task-gsd-stage-observation.ts` (new) | `src/adapters/task-codex.ts`; `src/core/task-native-sessions.ts` | Native invocation/result correlation from actual retained event/session sources; unknown if not observable. |
| quick dispatch / full verdict | `src/core/task-gsd.ts`; `task-run.ts` | Build explicit full invocation; add precondition alongside existing artifact, measurement, effect and review gates. |
| exact recovery | `src/core/task-supervisor.ts`; `task-journal.ts`; `task-gsd-discovery.ts` | Retain native checkpoint/quick IDs, reconcile before dispatch, invalidate only stale evidence. |
| `src/core/task-phase-scope.ts` (new) | `task-contract.ts`; `task-gsd-lifecycle.ts` | Reviewed ordered phase selection and baseline binding; never authorize from live discovery alone. |
| owned guidance | `skills/alpha-aos-task/SKILL.md`; `src/core/owned-skills.ts`; `catalog/stack.lock.json` | Source and all five render hashes change together; no global apply. |
| proof validator (new) | `scripts/verify-task-bootstrap-native.mjs` | Read-only bounded receipt + git/artifact checks; strengthen against self-reported native tier. |
| behavioral tests (new and expanded) | `test/helpers/task-fixture.ts`, `test/task-contract.test.ts`, `test/task-gsd-adversarial.test.ts`, `test/task-bootstrap-acceptance.test.ts` | Temp roots, actual CLI invocations, deterministic ports, explicit fixture/native proof levels. |

## Concrete excerpts

`src/core/task-contract.ts:584` — existing default normalization:

```ts
scope: {
  projectRoot: resolve(contract.scope.projectRoot).normalize("NFC"),
  workflow: contract.scope.workflow ?? (contract.category === "development" ? "gsd-quick" : "generic-connector"),
  summary: contract.scope.summary.normalize("NFC"),
},
```

Insert full-only metadata conditionally; explicit standard and absent must produce this exact legacy shape. Update the closed changed-field vocabulary and approval reconstruction in the same slice.

`src/core/task-gsd.ts:42` — existing standard evidence contract:

```ts
export interface GsdEvidence {
  status: "verified" | "missing";
  quickId: string | null;
  planPath: string | null;
  summaryPath: string | null;
  stateRow: boolean;
  commits: Array<{ sha: string; subject: string }>;
  missing: string[];
}
```

Keep this standard meaning; add a separately typed full report and precondition. A full field inferred from SUMMARY text would have no observed native provenance.

`src/core/task-journal.ts:32` — existing durable envelope:

```ts
export interface TaskJournalEvent {
  sequence: number;
  timestamp: string;
  kind: TaskJournalEventKind;
  contractDigest: string;
  attemptIndex: number;
  payload: TaskJournalEventPayload;
}
```

Store bounded stage evidence references in the existing run/journal namespace; retain separate exact runId inside the evidence because a digest alone does not name one run.

`src/core/task-gsd-lifecycle.ts:902` — scope issue to replace:

```ts
if (options.phases && options.phases.length > 0) {
  candidatePhases = [...options.phases];
} else {
  const roadmapPath = join(options.projectRoot, ".planning", "ROADMAP.md");
```

Resolve candidates from approved phaseSelection or reconstructable approved baseline. Live ROADMAP remains observation, never a grant.

## Interface and pattern constraints

- Existing TaskPorts expose controller, reviewer, assess, capability and optional finalReview. Add an optional typed full-stage capability to this seam; do not create another launcher.
- Native adapter event semantics must be based on captured runtime output, not guessed event names. Session ancestry logic is a boundary analog; usage receipts themselves are not stage evidence.
- Schemas use closed objects and explicit validation. Reuse `validateManagedDocument` with the task-agent-output route for new evidence schemas rather than weakening validation globally.
- Named exports, .js TypeScript imports, double quotes and exactOptionalPropertyTypes apply. No new package installation.
- Plans touching shared task-contract/task-run/schema/format/skill-lock surfaces are sequential to keep producer/consumer revisions coherent.

## PATTERN MAPPING COMPLETE
