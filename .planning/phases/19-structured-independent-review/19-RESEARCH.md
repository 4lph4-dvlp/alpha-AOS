# Phase 19 — Structured Independent Review Research

**Researched:** 2026-10-08  
**Confidence:** HIGH for repository behavior and approved scope; MEDIUM for proposed interfaces.  
**Question:** What must the plans know to implement REV-02..05 without duplicating GSD state?

## User Constraints

The following decisions are copied from `19-CONTEXT.md` and are binding.

- **D-01:** 차단 결함에는 정확한 파일·코드 또는 검사 위치, 확인 가능한 증거 참조, 재현 절차를 필수로 한다. 통과 판정은 실제 검사 기록을 참조하고, `unknown`에는 검증할 수 없는 이유를 명시한다.
- **D-02:** 명령으로 재현하기 어려운 아키텍처 결함은 위반한 승인 규칙과 해당 파일·코드 위치를 제시하고 독립적으로 직접 확인한다. 실행 재현이 가능하면 그 절차와 결과도 기록한다. 리뷰어의 설명만으로 결함을 확정하지 않는다.
- **D-03:** 한 기준이라도 필수 증거가 빠지거나 모호하면 보고서 전체를 거부하고 다시 요청한다. 다른 행의 통과 판정을 골라 수락하지 않는다.
- **D-04:** 보고서가 가리키는 파일 또는 검사 기록을 실제로 찾고 읽을 수 있는지 확인한다. 참조가 해소되지 않으면 보고서 전체를 유효한 판정으로 사용하지 않는다. 리비전 드리프트에 따른 기존 무효화 규칙도 유지한다.
- **D-05:** 필수 기능 누락이나 승인된 안전·아키텍처 제약 위반은 수락 차단 결함이다. 일반적인 유지보수 개선과 코드 스타일 차이는 권고로 분류한다. 차단 결함은 앞선 단계에서 정한 재현 또는 객관적 확인 절차를 거쳐야 GSD 수정 작업이 된다.
- **D-06:** 계약 범위 밖에서 발견된 기존 문제가 이번 결과 또는 필수 증거의 신뢰성을 훼손하면 차단한다. 이번 수락과 무관한 문제는 별도 제안으로 분리한다.
- **D-07:** 아키텍처 차단 판정의 근거는 승인된 계약, 요구사항, 설계 문서의 규칙과 확인 가능한 위반 위치·영향이다. 암묵적인 코드 스타일 선호만으로 차단하지 않는다.
- **D-08:** 차단 사유가 아닌 범위 밖 제안은 나중에 사람이나 에이전트가 검토할 수 있는 별도 임시 파일로 보관한다. 검토자는 공식 GSD 후속 작업으로 옮긴 뒤 파일을 정리하거나 제안을 폐기할 수 있다. 결론 전까지 파일을 유지하며, 현재 계약이나 GSD 작업을 자동 확장하지 않는다. 사람이 진행 상황을 물으면 에이전트는 대기 중인 제안 파일을 확인하고 그 존재를 답변에 알린다.
- **D-09:** 확인된 한 원인이 여러 필수 기준에 영향을 준다면 GSD 수정 작업 하나에 해당 기준을 모두 연결한다. 각 기준의 판정과 증거는 독립적으로 추적한다. 기존의 기준·실패 지문은 중복 후보 식별에 사용한다.
- **D-10:** 결함을 `resolved`로 표시하려면 원래 재현 절차 또는 직접 확인 가능한 규칙 위반을 새 산출물에서 다시 확인하고, 연결된 모든 기준의 새 판정을 기록한다. 앞서 결정된 전체 계약 기준 재검증과 새 리비전·새 세션 리뷰도 수행한다. GSD 수정 작업 완료만으로 해결을 선언하지 않는다.
- **D-11:** 해결된 결함은 새 리비전에서 같은 실패가 새로운 증거로 확인될 때만 다시 연다. 최초 발견, 수정, 재발의 리비전과 증거를 한 이력에 보존한다. 새 실패가 없으면 과거 결함을 재개하지 않는다.
- **D-12:** 유사한 오류 문구나 실패 지문은 중복 후보일 뿐이다. 서로 다른 원인으로 확인되면 결함과 수정 작업을 분리한다.
- **D-13:** 종합 리뷰는 계획과 필수 게이트를 마친 마일스톤 완료 후보에 대해 최종 수락 전에 수행한다. 개별 구현 리뷰와 필수 게이트는 계속 적용한다. 종합 리뷰 뒤 수정이 생기면 변경된 리비전에 대해 다시 검토한다.
- **D-14:** 모든 필수 요구사항에 대해 구현 위치와 자동 검사·독립 리뷰 증거를 확인한다. 빠진 항목은 확인되지 않은 상태 또는 확인된 결함으로 남기며 완료 기록만으로 통과시키지 않는다.
- **D-15:** Phase 사이의 실제 사용자 흐름과 승인, GSD 단일 상태 소유권, 리뷰어 독립성 등 승인된 핵심 제약을 코드와 실패 사례 검사로 확인한다. 최종 리뷰는 기능 누락, 통합, 아키텍처, 테스트 증거를 모두 다룬다.
- **D-16:** 터미널 최종 결과는 전체 판정과 함께 각 필수 기준의 자동 검사 결과, 리뷰어 신원, 증거 참조, 남은 `unknown` 및 다음 조치를 보여준다. 검토 대기 중인 범위 밖 제안 파일의 존재도 알린다.

Discretion: internal report, evidence locator, finding-history representation and display order; the temporary suggestion file's name and format. Deferred ideas: none. [VERIFIED: `.planning/phases/19-structured-independent-review/19-CONTEXT.md`]

## Standard Stack

- Use the existing TypeScript/Node 24 code, `node:test`, strict type check, and the repository's Ajv-backed `validateManagedDocument`. Do not add a review framework or a second workflow engine. [VERIFIED: `package.json`; `src/core/task-run.ts:394-415`; `src/core/validation.ts`]
- Keep the structured report schema in `schemas/task-review.schema.json`, the run/witness envelopes in `schemas/task-receipt.schema.json` and `schemas/review-witness-receipt.schema.json`, and matching TypeScript types in `src/core/task-run.ts`. Five reviewer adapters all load the shared task-review schema. [VERIFIED: `schemas/task-review.schema.json`; `src/core/task-run.ts:135-174`; `src/adapters/task-claude.ts:279`; `src/adapters/task-codex.ts:639`; `src/adapters/task-antigravity.ts:311`; `src/adapters/task-pi.ts:328`; `src/adapters/task-hermes.ts:321`]
- Reuse `collectTaskArtifact`, `materializeTaskSnapshot`, `confirmReviewerReproduction`, `verifyReviewWitness`, `routeVerificationGap`, `requireFullContractReverification`, and the task journal/strategy modules. [VERIFIED: `src/core/task-check.ts:130-284,537-581`; `src/core/task-review-witness.ts:144-190`; `src/core/task-gap-router.ts:47-164`; `src/core/task-supervisor.ts:362-393`]

## Architecture Patterns

1. **The exact artifact is the review subject.** `startTask` materializes a snapshot, gives it to a fresh reviewer request, collects the artifact again before verdict, and compares the digest. Review-witness receipts additionally bind Git HEAD and artifact digest. Keep all evidence resolution inside the reviewed snapshot or immutable check receipts, then revalidate on final read. [VERIFIED: `src/core/task-run.ts:1182-1199,1262-1301`; `src/core/task-review-witness.ts:144-190`]
2. **Validate the report as one object before any row is trusted.** Current `assessTaskReview` checks request, contract, artifact, session and duplicate/unknown rows, but it permits missing criteria and unresolvable free-text evidence. `reduceTaskVerdict` converts a missing row to `unknown`; D-03 requires rejecting the whole report earlier. Make schema, semantic completeness, evidence location and identity a single fail-closed boundary. [VERIFIED: `src/core/task-verdict.ts:89-171,226-283`; `schemas/task-review.schema.json`]
3. **Confirmation is independent of reviewer prose.** Existing `confirmReviewerReproduction` reruns a contract entry on reviewer-provided input. It cannot prove a source-level architectural violation. Add a bounded, read-only rule/file/check-record verification path: named approved rule, location within the reviewed snapshot, and independently observed violation. Never execute a reviewer-supplied command. [VERIFIED: `src/core/task-check.ts:533-581`; `src/core/task-run.ts:1239-1257`; `docs/design/autonomous-work/README.md:39-45`]
4. **GSD owns repair lifecycle.** Existing `task-gap-router.ts` produces a gap-plan or new-phase decision and requires full-contract re-verification, but `routeVerificationGap` is not called by production task paths. Add a controller integration that emits one confirmed root-cause work item through native GSD routing; store alpha-AOS finding identity/history/receipts outside `.planning/`. [VERIFIED: `src/core/task-gap-router.ts:47-164`; `src/core/task-supervisor.ts:362-603`; repository search for `routeVerificationGap`]
5. **A final review is a distinct acceptance boundary.** The per-task reviewer checks a task snapshot; `task-doctor.ts` currently presents the most recent witness as a diagnostic. A milestone-final review must enumerate all required features and cross-phase constraints with implementation, automated-check and independent review references, and gate milestone acceptance on the current revision. Do not infer it from GSD completion or doctor output alone. [VERIFIED: `src/core/task-run.ts:1182-1301`; `src/core/task-doctor.ts:207-270`; `docs/design/autonomous-work/README.md:39-45`; `.planning/ROADMAP.md:259-276`]

## Don't Hand-Roll

- Do not duplicate GSD ROADMAP/STATE transitions or write gap-plan files directly; invoke the established GSD route and retain operational evidence under `stateRoot`. [VERIFIED: `19-CONTEXT.md`; `src/core/task-gap-router.ts:88-108`]
- Do not accept report text as a file path or command without root confinement and deterministic parsing; use existing path-boundary and bounded process utilities. [VERIFIED: `src/core/task-check.ts:387-416`; `docs/design/autonomous-work/README.md:35-45`]
- Do not let a reviewer-generated suggestion update an approved task contract or create current-phase GSD work. [VERIFIED: `19-CONTEXT.md` D-08; `docs/design/autonomous-work/README.md:39-45`]

## Common Pitfalls

- The shared report schema's `evidence` is currently a plain string and `finding.reproduction` may be null. A schema-valid report can therefore carry only an assertion. Add typed locator and confirmation semantics, then update every adapter prompt and affected receipt schema together. [VERIFIED: `schemas/task-review.schema.json`; `src/adapters/task-claude.ts:106-154`]
- `computeFailureFingerprint` includes `criterionId` in its key. It cannot by itself merge one root cause across multiple criteria; a separate confirmed cause identity must link them. Similar error text must remain a candidate, never the merge proof. [VERIFIED: `src/core/task-strategy.ts:16-24,82-89`; `19-CONTEXT.md` D-09/D-12]
- Supervisor history is reconstructed from `rejected` journal events and currently uses one failing row. It does not preserve a multi-criterion finding's repair and recurrence history. [VERIFIED: `src/core/task-supervisor.ts:362-393,560-603`]
- `verifyReviewWitness` checks revision and artifact but not every criterion or report binding itself. A final gate needs validated report and requirement coverage alongside the receipt. [VERIFIED: `src/core/task-review-witness.ts:144-190`; `schemas/review-witness-receipt.schema.json`]
- `formatTaskRunReport` prints suggestions from the in-memory report; it does not retain a reviewable pending-suggestion file or surface that file during later status calls. [VERIFIED: `src/format.ts:1210-1220`; `19-CONTEXT.md` D-08/D-16]

## Validation Architecture

| Requirement | Positive proof | Adversarial proof |
|---|---|---|
| REV-02 | One complete report resolves every evidence locator and confirms a source or runtime finding on the exact request/session/artifact | Missing/duplicate criterion, unreadable or escaping locator, stale digest, vague pass evidence, unconfirmed architecture assertion reject the whole report or stay unknown |
| REV-04 | One confirmed cause maps to one GSD repair item, then new revision + new reviewer session + all criteria rechecked resolve it | Two affected criteria do not create duplicate work; same text with different causes stays separate; old resolved finding does not reopen without new failure; changed bytes invalidate witness |
| REV-05 | Current-scope defect blocks; unrelated suggestion persists outside the contract and appears in status | Suggestion does not create GSD work or widen approved scope; relevant out-of-scope reliability defect still blocks |
| REV-03 | Final review enumerates required features, implementation, automated checks, integration/architecture and independent reviewer evidence before milestone acceptance | Seed missing required feature and approved architecture violation; previous per-task pass or GSD complete cannot bypass final gate; a changed revision forces a fresh review |

Run focused compiled tests with `npm run build && node scripts/run-tests.mjs --files dist/test/<test>.test.js && npm run check`; run `npm test && npm run check` at the phase final gate. Existing task test scaffolds are in `test/task-verdict.test.ts`, `test/task-run.test.ts`, `test/task-review-witness.test.ts`, `test/task-gap-router.test.ts`, and `test/task-supervisor-recovery.test.ts`. [VERIFIED: `package.json`; prior Phase 18 `<automated>` commands; listed test files]

## Open Planning Decisions

- Define an additive report-schema version and explicit migration/read behavior for persisted v1 task runs. Current report uses `schemaVersion: 1`; old records may remain audit data but cannot satisfy new mandatory evidence rules. [VERIFIED: `src/core/task-run.ts:150-158`; `schemas/task-review.schema.json`]
- Choose a root-cause identity that is confirmed by objective evidence and links multiple criteria without merging by wording alone. Record first detection, repair and recurrence with revision/evidence pairs in external state. [VERIFIED: `19-CONTEXT.md` D-09..12]
- Keep final milestone review as a separate operation/record with an explicit acceptance gate; Phase 22 will supply release-level evidence, but Phase 19 must implement and adversarially test the gate. [VERIFIED: `.planning/ROADMAP.md:259-276,316-336`; `docs/design/autonomous-work/VALIDATION.md:30-33`]

## Codebase Drift Note

`gsd-tools verify codebase-drift` reports seven structural changes since the last map and action `warn`; it is non-blocking for this plan. The affected paths are mostly project metadata and CI, not the task review modules. Refresh with `$gsd-map-codebase --paths .github,.gsd,.npmignore,AGENTS.md,CHANGELOG.md,README.ko.md` when the full map is needed. [VERIFIED: tool output, 2026-10-08]
