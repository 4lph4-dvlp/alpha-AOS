# Stack Research

**Milestone:** v0.6.0 — Predictable Task Entry and Shared Project Policy
**Researched:** 2026-11-02
**Confidence:** HIGH for local integration; MEDIUM for native host behavior

## Recommended Stack

| Existing technology | Purpose | Decision |
|---|---|---|
| Node.js >=24, TypeScript | Policy reader, classifier and CLI | Reuse; no upgrade |
| Existing JSON/schema validation | Versioned policy and task selections | Reuse validators |
| applyFileTransaction | Preview, bounded writes, snapshot and rollback | Reuse transaction service |
| GSD full, stable lock 1.18.0 | Sole initialization and task lifecycle owner | Inspect installed workflow; do not patch upstream |
| node:test | Observable CLI, routing and boundary scenarios | Reuse test runner |

Versions: package.json and catalog/stack.lock.json. No new dependency or library API is required by the proposed design; no dependency install or Context7 lookup was needed.

## Integration Findings

- src/core/project.ts reads pack/isolation manifests. Intake policy must not imply pack trust or isolation authority.
- src/core/task-gsd.ts probes native query init.quick, checking planning_exists and roadmap_exists; this alone is not complete initialization proof.
- schemas/task-contract.schema.json accepts gsd-quick, gsd-multi-phase, gsd and generic-connector. There is no distinct quick-full quality binding.
- The quick controller prompt currently invokes bare $gsd-quick. Full mode requires contract, prompt and evidence changes.
- src/core/task-run.ts already routes quick and multi-phase work. Extend these paths with backward compatibility.

## Storage Recommendation

Use one versioned project-root policy accessible before .planning exists. Persist strict/flexible only. The filename and whether to extend .alpha-aos/stack.yaml are Phase 27 decisions. A separate policy avoids coupling bootstrap to pack manifests; extending the manifest reduces the number of project documents.

Read current policy at every task intake. Missing means strict without writing files; invalid means an actionable diagnostic, not silent flexible fallback. Expose effective mode, root, source and revision/digest.

## Alternatives Considered

| Avoid | Reason |
|---|---|
| Harness-local mode copies | Divergent authority and stale sessions |
| GSD config as sole mode storage | GSD-owned and unavailable before initialization |
| ECC memory as policy | Recall is context, not authoritative configuration |
| LLM-only workflow classification | Recreates unpredictable routing |
| New workflow framework | Duplicates GSD lifecycle ownership |

## Sources

- Local: package.json; catalog/stack.lock.json; project.ts; transaction.ts; task-contract.ts; task-gsd.ts; task-run.ts.
- [GSD quick](https://github.com/open-gsd/gsd-core/blob/next/commands/gsd/quick.md): quality semantics; mutable upstream next is not the locked runtime.
- [Codex instructions](https://developers.openai.com/codex/guides/agents-md): per-run/session discovery supports a live policy lookup.
