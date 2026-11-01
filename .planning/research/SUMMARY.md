# Project Research Summary

**Project:** alpha-AOS v0.6.0 — Predictable Task Entry and Shared Project Policy
**Domain:** Cross-harness project policy and GSD task intake
**Researched:** 2026-11-02
**Confidence:** HIGH locally; MEDIUM for semantic boundaries and native activation

## Executive Summary

Implement one project authority for strict/flexible and a shared inspectable intake decision. Missing policy defaults to strict. Each independent substantial strict task receives a fresh six-style choice. The selected style is task-scoped and never a project preference. Flexible preserves adaptive intake; explicit commands, named styles and simple operations have defined precedence.

The existing stack is sufficient. Main gaps are fresh policy reads, reasoned classification, request-aware GSD initialization/resumption and actual quick-full propagation. Today native quick readiness checks planning/roadmap presence, while the controller invokes bare quick. A prompt-only or label-only change cannot satisfy the requested behavior.

Outgoing planning files and 13 phase directories were preserved under v0.2.0 archives. This planning rollover is not release completion: prior regression debt and release holds remain.

## Key Findings

### Recommended Stack

Reuse Node.js/TypeScript, schemas, transactions, CLI, native adapters and node:test. Keep GSD full 1.18.0 and dependency versions unchanged. No new package or third-party API is justified.

### Expected Features

- Safe project strict/flexible read/change/inspect with cross-harness consistency.
- Six Korean labels/descriptions, fresh strict choice per independent task and continuation without repeated questions.
- Explainable simple-operation exemptions, explicit-style precedence and direct-command control.
- Native GSD readiness, absent/partial-state guidance, initial-request reuse and single resumption.
- Real conversational/autopilot quick, quick-full and phase routing.
- Exact contract approval/start, model policy, isolated runner and GSD sole lifecycle ownership.
- Cross-harness behavioral receipts, packed integrity, bilingual docs and actual regression results.

### Architecture Approach

Stable harness guidance invokes live shared policy/intake services. GSD owns initialization and project lifecycle; the existing runtime owns autopilot contracts/processes. Backward-compatible quality metadata must connect quick-full selection to preview/digest, --full dispatch and additional evidence validation.

### Critical Pitfalls

1. Persisting a selected style: specifically rejected by the user.
2. Depending on startup-loaded instruction text for mode changes.
3. Exempting every rename by keyword or initializing every small request.
4. Treating placeholder files or PROJECT.md alone as readiness.
5. Renaming quick to quick-full without proving quality stages.
6. Reusing prior consent or creating a second GSD state writer.

## Implications for Roadmap

| Proposed phase | Outcome | Reason for order |
|---|---|---|
| 27 — Shared Project Behavior Policy | Canonical mode and safe CLI | Establish authority first |
| 28 — Predictable Strict/Flexible Intake | Chooser, exemptions and task scope | Consume policy |
| 29 — GSD Initialization and Request Continuity | Readiness, bootstrap/recovery and resumption | Connect selection to prerequisites |
| 30 — Six Execution Styles and Quality Binding | Actual native/contracted routes | Consume readiness and style |
| 31 — Cross-Harness Proof and Distribution | Behavioral receipts, docs and regressions | Prove composition |

These are proposals pending requirements and roadmap approval, not executable plans.

### Research Flags

Phase 28 needs task-boundary discussion. Phase 29 needs a minimal pending-request representation and partial-state recovery. Phase 30 needs contract compatibility and quality evidence. Phase 31 needs actual host evidence; fixtures are not native parity.

## Confidence Assessment

| Area | Confidence | Basis |
|---|---|---|
| Stack | HIGH | Existing primitives and inspected schemas |
| Requested behavior | HIGH | User scope and explicit correction |
| Architecture | HIGH locally / MEDIUM natively | Call paths inspected; host activation not tested |
| Task/exemption boundaries | MEDIUM | Shared criteria defined; adversarial checks pending |
| Six-route readiness | MEDIUM | Quick/phase exist; quick-full propagation absent |

### Gaps to Address

Final policy schema/location; continuation binding; GSD partial-state recovery; backward-compatible quick-full metadata; host-specific receipts; existing broader-regression debt.

## Sources

### Primary local evidence

package.json; catalog/stack.lock.json; project-stack.schema.json; task-contract.schema.json; project.ts; transaction.ts; task-contract.ts; task-gsd.ts; task-gsd-prompt.ts; task-run.ts; task-gsd-lifecycle.ts; alpha-aos-task/SKILL.md; task-skill.test.ts; task-governance-hierarchy.test.ts; installed quick.md/new-milestone.md; quick 261101-ww3 summary.

### Official external evidence

- [GSD quick](https://github.com/open-gsd/gsd-core/blob/next/commands/gsd/quick.md): full quality semantics; mutable next branch, not stable lock.
- [GSD new-project](https://github.com/open-gsd/gsd-core/blob/next/commands/gsd/new-project.md): initialization artifacts and GSD ownership.
- [Codex guidance](https://developers.openai.com/codex/guides/agents-md): per-run/session instruction discovery.
- [Claude memory](https://code.claude.com/docs/en/memory): contextual instruction behavior, not automatic enforcement.

## Methodology

Three focused Exa queries; four successful Firecrawl single-page extractions; bounded local source/schema/test/workflow reads. No crawl, dependency install, paid native model calls or product source edits. Research was inline: this invocation did not explicitly authorize subagents. Recommendations remain proposed; native behavior is unverified until implementation.

*Research completed: 2026-11-02. Requirements scoping and roadmap approval pending.*
