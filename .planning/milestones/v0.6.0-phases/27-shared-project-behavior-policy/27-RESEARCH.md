# Phase 27: Shared Project Behavior Policy - Research

**Researched:** 2026-11-02
**Domain:** Local policy, canonical project identity, reviewed transactions, native intake
**Confidence:** MEDIUM — existing source is grounded; new coordination requires process fixtures.

<user_constraints>
## User Constraints (from CONTEXT.md)

The following decisions, discretion and deferred scope are copied verbatim. [VERIFIED: .planning/phases/27-shared-project-behavior-policy/27-CONTEXT.md decisions/deferred sections]

<!-- DATA_Q7K3M8V2_START -->
## Implementation Decisions

### 공통 정책 파일과 저장 범위

- **D-01:** 단일 권위 파일은 `<canonical-project-root>/.alpha-aos/behavior.json`으로 한다. pack/isolation manifest인 `.alpha-aos/stack.yaml`, GSD 소유 `.planning/config.json`, harness별 설정 또는 global registry에 mode를 중복 저장하지 않는다. 파일에는 절대 프로젝트 경로를 저장하지 않아 checkout 이동이 가능해야 한다.
- **D-02:** v1의 최소 스키마는 `{"schemaVersion":1,"mode":"strict"}`이며 mode의 다른 허용 값은 `flexible`이다. mode는 필수다. execution style, task 선택, 승인, model, budget은 이 문서에 넣지 않는다. 미지원 버전·필드·잘못된 타입·중복 JSON key는 명시적으로 진단하며 값을 추측하거나 자동 마이그레이션하지 않는다. 이후 schema 확장은 별도 검토한다.
- **D-03:** 정책 없는 조회는 strict를 반환하고 파일·디렉터리·journal·GSD 상태를 만들지 않는다. 사용자가 명시적으로 `set strict`를 적용하면 기본값과 같아도 프로젝트 선호를 저장한다. 이미 유효한 정책의 mode가 요청 값과 같으면 bytes를 재작성하거나 journal을 추가하지 않는 no-op이다.
- **D-04:** 이 정책은 task intake의 동작 선호다. policy-only 조회·변경은 GSD 초기화나 project-pack trust를 요구하거나 부여하지 않는다. tree-off, sandbox, 파일 권한과 root 경계는 그대로 적용한다. mode 설정만으로 기능 pack 설치, global harness 수정 또는 autopilot 시작을 하지 않는다.

### 실제 프로젝트 루트와 경계

- **D-05:** `src/core/evidence.ts`의 `resolveCanonicalRoot` 의미를 공통 기준으로 재사용한다. 명시적 project 대상이 우선하고, 없으면 시작 위치에서 가장 가까운 project declaration 또는 Git 경계를 한 번의 상향 탐색으로 찾으며, 둘 다 없으면 standalone 시작 디렉터리를 사용한다. Git 경계를 넘어 바깥 선언을 채택하지 않는다. 기존 declaration 목록과 다른 두 번째 루트 탐색기를 만들지 않는다.
- **D-06:** 선택된 canonical root의 정책만 읽는다. 중첩 project는 기존 root 규칙에 따라 독립된 설정을 가지며 부모·형제·global mode를 상속하지 않는다. Git worktree/submodule의 `.git` 파일도 경계다. worktree마다 자체 project 파일이 권위이며 다른 worktree의 로컬 변경이 자동 전파된다고 주장하지 않는다. 명시적 대상이 workspace root라면 그 선택을 존중한다.
- **D-07:** Git/GSD/pack manifest 없는 디렉터리도 명시적 경로나 standalone cwd로 policy-only 요청을 처리한다. 아무 표식 없는 non-Git 하위 디렉터리에서 부모 프로젝트를 추측하지 않는다. 여러 harness가 동일 프로젝트를 가리키려면 같은 명시적 root를 사용하게 하고 조회 결과로 이를 확인할 수 있어야 한다.
- **D-08:** root의 실제 경로와 판별 이유를 노출하고 기존 canonicalization/path proof를 사용한다. 정상 alias는 동일 identity로 해석하되 policy 경로의 symlink/junction 탈출, 파일을 root로 지정한 경우, 읽을 수 없는 root, task에 이미 묶인 project와 불일치는 actionable diagnostic으로 거부한다. 명시적 target 변경이 없는 한 다른 프로젝트로 fallback하지 않는다. preview 이후 경로 재지정도 적용 시 재검증한다.

### CLI와 자연어 모드 변경

- **D-09:** 공통 표면은 조회용 `alpha-aos project mode [path] [--json]`와 변경용 `alpha-aos project mode set strict|flexible [path] [--plan-digest <digest>] [--apply] [--json]`로 한다. 변경은 기본 dry-run이며 실제 적용은 검토한 digest와 `--apply`가 필요하다. rollback은 기존 `alpha-aos rollback <operation-id>`의 preview/apply 경로를 재사용한다. 별도 reset·global mode·session override는 추가하지 않는다.
- **D-10:** 모든 지원 harness의 owned `alpha-aos-task`가 명시적 프로젝트 mode 조회·변경 요청을 같은 CLI로 연결한다. 예: “이 프로젝트를 유연 모드로 바꿔줘”, “현재 strict/flexible 설정 보여줘”. agent가 직접 정책 JSON을 편집하거나 사용자가 명령·digest를 복사하도록 요구하지 않는다. root·요청 mode·변경과 digest를 검토 가능하게 제시하고 이미 받은 구체적 변경 권한 안에서 적용한다. target/mode가 불명확하면 그 누락만 확인한다.
- **D-11:** policy-only 요청에는 execution-style chooser, task contract, GSD new-project를 강제하지 않는다. 모드 변경과 substantial task가 섞인 요청에서는 먼저 명시적으로 승인된 설정 변경을 처리하고 최신 정책으로 task intake에 넘긴다. mode 변경 요청 자체가 나머지 작업이나 autopilot의 승인이라는 뜻은 아니다. six-style 선택·단순 요청 판단의 일반 규칙은 Phase 28 범위다.
- **D-12:** MODE-02의 최소 native routing은 Phase 27에서 완성한다. 공통 skill source와 다섯 target 렌더링/배포 경로, `catalog/stack.lock.json`의 source/target integrity를 함께 맞춘다. third-party GSD workflow를 수정하거나 현재 문서 작업에서 사용자 global 설치를 실행하지 않는다. 소스·fixture 증명과 실제 host 호출 증명을 구분하고 미검증 지원은 명시한다.

### 조회·최신성·실패 진단

- **D-13:** text와 JSON 모두 canonical root, root 판별 이유, effective mode, source 종류(`project-policy` 또는 `builtin-default`), 정책 파일 경로, 존재 여부, revision을 제공한다. 서로 다른 harness의 결과를 같은 근거로 비교할 수 있어야 한다. 진단에서 임의 파일 내용이나 credential 값을 출력하지 않는다.
- **D-14:** 다음 task intake마다 root와 정책을 다시 읽는다. 이전 session의 memory/cache를 현재 mode의 권위로 사용하지 않는다. 다른 harness가 바꾼 mode는 다음 intake에 반영한다. 진행 중인 task의 선택 style, 승인 계약, 실행 계획은 자동 전환하거나 재시작하지 않으며 policy 변경은 추가 실행 동의를 주지 않는다.
- **D-15:** 유효 파일 revision은 원문 bytes의 SHA-256으로 식별하고 부재는 별도의 `missing` 상태로 표시한다. mtime, session 변수, 별도 project counter는 freshness 근거로 쓰지 않는다. 부재에서 파일 생성, 같은 mode의 byte 변경, 삭제도 검토 입력 변경으로 구분한다. hash는 정책 파일에 저장하지 않는다.
- **D-16:** malformed JSON, 중복 key, 미지원 스키마/필드, invalid mode, unreadable 파일, 디렉터리인 policy path, 잘못된 root는 해당 intake/변경을 막고 원인·경로·복구 방법을 제공한다. 이때 strict/flexible을 조용히 확정하거나 부모 정책을 대신 읽지 않는다. `ENOENT`에 해당하는 실제 정책 부재만 strict 기본값으로 처리한다. invalid 파일을 set으로 덮어쓰거나 자동 복구하지 않으며 사용자는 원본 보존 후 수정·명시적 rollback 등으로 복구한다.

### 검토·적용·동시 변경·복구

- **D-17:** preview에는 canonical root/identity, policy path, 현재 mode와 source/revision, 요청 mode, 변경 내용, plan digest를 포함한다. digest는 root identity·대상 경로·검토한 bytes revision 또는 부재·요청 변경에 묶는다. exact autopilot contract digest와는 별도의 설정 변경 digest이며 둘을 대체하지 않는다.
- **D-18:** `applyFileTransaction`과 기존 path-boundary 검증을 재사용해 policy 파일만 snapshot/journal 후 atomic 변경한다. `.alpha-aos`가 없다면 승인된 첫 적용에 필요한 디렉터리만 만든다. sibling 설정, `.alpha-aos/stack.yaml`, `.planning`, project manifest, 사용자 harness 설정은 건드리지 않는다. unrelated settings 보존은 별도 파일 소유권과 drift 거부로 보장하며 미지원 필드를 읽고 재직렬화해 없애지 않는다.
- **D-19:** 적용 직전 root/path proof와 이전 revision을 재검증한다. concurrent writer, missing-to-created, 검토 후 삭제, symlink/junction 재지정 등 stale 입력은 새 preview를 요구하며 덮어쓰지 않는다. 마지막 writer 우선이나 LLM 추정 merge를 사용하지 않는다. 동시 적용 시 검토한 선행 상태에 대한 하나의 변경만 성공하도록 보장하고 후속 입력은 stale로 진단한다. 구체적인 직렬화 방식은 연구·계획에서 검증한다.
- **D-20:** rollback은 이전 원문 bytes 또는 이전 부재를 복원한다. 최초 생성의 rollback은 소유 policy 파일만 제거하고 다른 설정이나 디렉터리 전체를 삭제하지 않는다. 적용 후 수동 편집이 있으면 기존 hash/drift guard로 rollback을 거부한다. 동일 mode no-op에는 허위 operation ID나 성공 journal을 만들지 않는다.

### Agent 재량

내부 모듈 구성, 타입/오류 code 명칭, text 출력 배열, 동시 적용의 직렬화 방식, 기존 검증 API에 연결하는 세부사항은 후속 연구·계획에 맡긴다. 위 사용자 관찰 동작, 파일 권위, 경계와 stale/rollback 보장은 유지한다. 신규 dependency·schema 호환 전략·공개 command 변경이 필요하면 기존 검증 gate를 거친다. 이 문서는 구현 방식을 검증했다는 증거가 아니다.

## Deferred Ideas

- Phase 28: six-style chooser, 명시적 style 처리, task별 선택 연속성, 단순 작업 면제의 공통 판정과 이유 출력.
- Phase 29: GSD runtime/project readiness, partial 초기화 복구와 원래 요청 재개.
- Phase 30: 각 execution style의 실제 conversational/autopilot 실행 연결.
- Phase 31: 최종 cross-host regression과 release proof. Phase 27의 최소 mode routing·검증은 여기에 이관하지 않는다.
- global/session mode override, parent cascade, 정책에 style 저장, 자동 schema migration은 추가하지 않는다.

관련 pending todo는 없었다. 이번 논의에서 새 milestone 범위는 추가하지 않았다.
<!-- DATA_Q7K3M8V2_END -->
</user_constraints>

## Summary

Use one small behavior-policy service, the existing canonical root ladder, strict JSON parser, schema validator, transaction/session infrastructure and owned-skill renderer. Keep query and preview free of mutation sessions, directory creation, manifest trust and GSD initialization. No new dependency is needed. [VERIFIED: src/core/evidence.ts:146-168; src/core/validation.ts:302-319,866-877; src/core/transaction.ts:180-218; src/core/owned-skills.ts:60-104; CONTEXT.md D-03,D-04]

The difficult part is compare/apply/rollback correctness. Current transactions serialize only by state root and have no expected-before revision input. Public rollback does not acquire a writer session, performs drift checking separately from copy/removal, and sweeps empty parent directories. Merely invoking existing helpers unchanged does not prove D-19/D-20. [VERIFIED: src/core/transaction.ts:74-77,180-218,248-286,309-423]

**Primary recommendation:** Plan four dependent slices: read/schema/root; coordinated mutation and rollback; CLI; native routing/integrity and evidence. Settle target coordination and rollback metadata before mutation code.

## Project Constraints (from AGENTS.md)

These actionable directives come from the repository AGENTS.md and supplied Codex execution guidance. [VERIFIED: AGENTS.md Project, Conventions, Architecture, GSD Workflow sections; task-supplied instructions]

- GSD alone owns lifecycle/state. Preserve WIP, approved boundaries, checkpoints, verification and commit gates; research must not mutate STATE/ROADMAP or implementation.
- Use bounded reads and the installed gsd-context outline/slices when applicable. Delegate only with authority; preserve model/effort.
- Keep Windows/macOS/Linux portability, strict TypeScript, explicit relative .js imports, two-space indentation, double quotes, semicolons, named APIs and typed diagnostics.
- Keep core return-oriented and formatting at CLI boundaries; validate at boundaries, fail closed and propagate operational failures.
- Default mutations to dry-run; use canonical path proofs, explicit allowed roots, snapshots, transactions, deterministic digest evidence and drift-safe rollback.
- Do not patch third-party managed GSD files. GSD owns lifecycle; project mode cannot replace task consent, separate autopilot start, isolated runner or model policy.
- Never expose credential values in documents, plans, arguments, diagnostics, journals or repository files.
- Invoke managed docs/research tools when relevant; after dependency/scaffolding setup invoke alpha-aos-control. This phase needs no setup/install.
- Preserve governed continuity through the controller; this researcher owns only RESEARCH.md, so no separate memory/state/cache writes or commits.
- Use native bounded completion handles, no sleep/status/model loops; stop retries on quota and save a truthful handoff.
- During implementation run targeted tests, then full suite at the phase gate. Native discovery plus meaningful invocation is required; configuration presence alone is insufficient.
- Project skill discovery returned no local additions; agent-skills query returned no configured additions. This is session observation, not a claim about all global skills. [VERIFIED: session discovery; query agent-skills gsd-phase-researcher --skills-only]

<phase_requirements>
## Phase Requirements

Descriptions copied from REQUIREMENTS.md. [VERIFIED: .planning/REQUIREMENTS.md:22-26]

<!-- DATA_N9R4B6T1_START -->
| ID | Description | Research Support |
|----|-------------|------------------|
| MODE-01 | A user entering a project without a behavior policy receives strict intake by default, without an implicit configuration write. | Missing-only default, zero-write fingerprints |
| MODE-02 | A user can change the project's strict/flexible mode through a natural-language request in any supported harness or the CLI, including before GSD initialization, and all harnesses consume that one project setting. | CLI early branch; common skill and five hashes; separate fixture/native proof |
| MODE-03 | A user can inspect the resolved project root, effective mode and configuration source/revision; the next task intake re-reads current policy rather than relying on a stale session value. | Raw-byte revision, root/reason output, fresh intake read |
| MODE-04 | A user can preview, apply and roll back mode changes through bounded, snapshotted transactions that preserve unrelated project settings. | Digest, lock-before-compare, policy-only rollback |
| MODE-05 | A user receives an actionable diagnostic for invalid or unreadable policy instead of silently falling back to flexible or another project. | Strict closed schema, safe typed diagnostics, no parent fallback |
<!-- DATA_N9R4B6T1_END -->
</phase_requirements>

## Architectural Responsibility Map

Proposed responsibilities constrained by D-01–D-20; this is design advice, not current feature behavior.

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Fresh policy resolution | Local core | Filesystem | One read authority for every harness |
| Natural-language policy intent | Native owned skill | CLI | Skill invokes shared code, never edits JSON |
| Root/path enforcement | Existing canonical/path helpers plus policy boundary | Filesystem | Canonical root and target checked together |
| Schema and safe diagnostics | Core validation | CLI formatter | Untrusted bytes never become instructions or raw error output |
| Compare/write/rollback | Mutation/transaction layer | Filesystem coordination/journal | Comparison and restoration share exclusion |
| Workflow and task approval | Existing GSD/runner | Native harness | Policy owns preference only |

## Standard Stack

No installation or dependency update is recommended. These are existing pinned versions, not latest-registry claims. [VERIFIED: package.json:36-60]

<!-- DATA_H2W8C5S4_START -->
| Component | Verbatim current evidence | Use |
|-----------|---------------------------|-----|
| Runtime | '"node": ">=24.0.0"', '"npm": ">=10.0.0"' | Existing built-in fs/crypto/process APIs |
| TypeScript | '"typescript": "5.9.3"' | Existing strict build |
| Schema validation | '"ajv": "8.20.0"' | Existing validateAgainstSchema wrapper |
| JSON parsing | '"jsonc-parser": "3.3.1"' | Existing parseManagedDocument duplicate detection |
| Tests | '"test": "npm run build && node scripts/run-tests.mjs"' | Existing compiled node:test suites |
<!-- DATA_H2W8C5S4_END -->

[VERIFIED: package.json:43,46-60; src/core/validation.ts:1-10]
**Package Legitimacy Audit:** Not applicable: no external package installation. Do not install globally or make paid calls.

### Exact source value ledger

These definitions were opened this session. Proposed names later are design targets, not existing paths/APIs.

<!-- DATA_P3D7L4X9_START -->
- Root reason values: '"explicit-override"', '"project-declaration"', '"git-root"', '"standalone-directory"'. [VERIFIED: src/core/evidence.ts:39-47]
- Declaration filenames: '"package.json"', '"pyproject.toml"', '"go.mod"', '"Cargo.toml"'. Do not add policy presence as another marker. [VERIFIED: src/core/evidence.ts:732-737]
- Path roles: '"target"', '"state"', '"journal"', '"snapshot"', '"temp"', '"source"', '"package-root"'. [VERIFIED: src/core/path-boundary.ts:9-16]
- Lock construction: 'return join(stateRoot, "writer.lock");'; acquisition 'handle = await open(lockPath, "wx", 0o600);'. [VERIFIED: src/core/writer-lock.ts:88-90,191-200]
- Duplicate diagnostic: '"syntax.duplicate-key"'. JSON format: '"json"'. [VERIFIED: src/core/validation.ts:77,197-204]
- Transaction input: 'target: string;', 'content: Uint8Array | string | null;', 'session?: MutationSession;'. [VERIFIED: src/core/transaction.ts:74-77,180-190]
- Task skill declaration: '- id: alpha-aos-task', 'source: skills/alpha-aos-task/SKILL.md', 'targets: [claude, codex, antigravity, pi, hermes]', 'invocation: automatic'. [VERIFIED: catalog/stack.yaml:66-69]
- Current task source hash: '"sourceSha256": "17845b902caa83a7c62dfbed62d12820e0a6bf091d7cd7694c79a2f9cda35311"'. All five target hashes currently equal it; recalculate from actual rendering after source edits. [VERIFIED: catalog/stack.lock.json:130-138]
<!-- DATA_P3D7L4X9_END -->

## Architecture Patterns

### System Architecture Diagram

Proposed flow under the locked decisions:

~~~mermaid
flowchart TD
    A[CLI or task intake] --> B[Canonical root and directory validation]
    B --> C[Tree boundary and policy path proof]
    C --> D{Allowed and readable?}
    D -->|no| X[Safe actionable refusal]
    D -->|yes| E[Read raw policy]
    E --> F{Actually absent?}
    F -->|yes| G[Strict default with missing revision]
    F -->|no| H[Strict syntax and exact closed schema]
    H -->|invalid| X
    H -->|valid| I[Mode and byte SHA-256]
    G --> J[Read result or digest preview]
    I --> J
    J -->|authorized apply| K[Canonical target coordination and state session]
    K --> L[Recheck root tree paths revision digest]
    L -->|stale| X
    L -->|valid same mode| N[No-op without journal]
    L -->|change| M[Snapshot and atomic policy transaction]
    M --> O[Operation ID]
    O --> P[Existing rollback entry]
    P --> Q[Same coordination then LIFO and drift check]
    Q -->|clean| R[Exact bytes restored or only policy removed]
    Q -->|changed| X
~~~

### Minimal proposed structure/API

Add one policy service and one closed schema. Proposed files: src/core/behavior-policy.ts and schemas/behavior-policy.schema.json. These are planning destinations, not verified existing files. Keep text formatting with existing formatters.

| Proposed API | Contract |
|--------------|----------|
| resolveProjectBehavior(input) | Fresh canonical root, optional bound-task root match, tree/path checks, guarded raw read, strict validation, safe view |
| planProjectModeChange(input, requestedMode) | Read-only preview with root identity, path, current source/revision, requested mode/change and digest |
| applyProjectModeChange(input, requestedMode, reviewedDigest) | Target coordinator, state session, inside-lock reread/recompute, one-file transaction |
| Existing rollback integration | Identify policy journal, acquire same coordinator/session, repeat root/path/LIFO/drift checks, restore bytes or prior absence |

View fields should cover root/reason, project identity, policy path/existence, effective mode/source and revision. Invalid policy returns diagnostics without an effective mode. Missing revision is distinct from a hash. Proposed safe diagnostic fields: code, path, cause category and remediation.

**Root:** Call resolveCanonicalRoot; pass explicit target as its explicit argument. Then require an existing readable directory. The resolver intentionally canonicalizes missing tails and returns a projectId derived from path, not object identity. Re-run the same root resolution inputs at apply: declarations added after preview may change inferred ownership. Bind root component identity in addition to projectId/path. [VERIFIED: src/core/evidence.ts:61-67,102-107,146-168; src/core/path-boundary.ts:139-157,365-410]

**Query:** Do not acquire a writer session, create directories, call first-use classification, inspect manifest trust or bootstrap GSD. loadTreeRegistry/resolveEffectivePolicy are reusable read-only checks; missing registry returns a value without saving it. Check both invocation location and selected root so an off subtree cannot evade its boundary via an explicit ancestor target. Recommend actionable refusal on tree-off, not mode inheritance. [VERIFIED: src/core/tree-policy.ts:74-103,124-154; src/core/project.ts:163-185; CONTEXT.md D-03,D-04,D-16]

**Read:** Prove the target against canonical project root, lstat type/links, read raw bytes and catch errors narrowly. Only actual absent policy with intact readable root/ancestor chain earns the default. Directory, dangling link, unreadable path, ENOTDIR or root loss is failure. Recheck proof around read. New ordinary entries are intentionally accepted by PathProof, so raw revision comparison remains separately necessary. [VERIFIED: src/core/path-boundary.ts:274-325,365-399; CONTEXT.md D-08,D-15,D-16]

**Validation:** Use parseManagedDocument then validateAgainstSchema on the original unsplit object. Exact version const, required mode, enum and additionalProperties false enforce v1. Generic validateManagedDocument unchanged is unsuitable: it splits namespaced extension fields and registers version zero as migratable. Alternatively register a dedicated kind only if extension/migration behavior is narrowly disabled for it; preserve existing generic semantics. [VERIFIED: src/core/validation.ts:182-224,302-319,581-591,631-643,740-761,815-829,866-877]

### D-19 coordination: required design

Existing acquireMutationSession excludes callers sharing one state root. Existing applyFileTransaction accepts no expected-before hash; its lock is too late to protect a caller's earlier comparison. Reuse a held MutationSession and compare/recompute after acquiring it. [VERIFIED: src/core/writer-lock.ts:88-90,166-200; src/core/transaction.ts:74-77,180-218; src/core/component-session.ts:134-166]

Critical section: canonical-target coordinator → state session → re-resolve root/tree → prove paths → validate current raw bytes/missing → compare reviewed digest/revision → snapshot → immediate path/content recheck → atomic write/journal → release. Rollback must acquire the same coordination in the same order; rerun LIFO and drift inside it.

Two harnesses may use separate state-root overrides while sharing one project. Recommend a target lock independent of caller stateRoot, reusing/extending existing exclusive-create ownership rather than introducing a lock library. A transient sibling coordination artifact can be a reviewed temp path, not another persistent policy authority. Finalize its exact location, stale-lock repair and root binding in the mutation plan. Never create it on query/preview/no-op; never remove locks based only on age/PID. [VERIFIED: src/core/writer-lock.ts:129-157,166-200; src/core/owned-skills.ts:161; CONTEXT.md D-18,D-19]

The current lock is fail-fast: an overlapping loser receives contention. A bounded explicit retry using the old digest must become stale after the winner commits. Decide whether the acceptance oracle requires immediate contention or stale wording; do not add unbounded polling. [VERIFIED: src/core/writer-lock.ts:161-164,195-200]

Cooperative locks exclude alpha-AOS writers, not arbitrary editors ignoring locks. The reviewed APIs do not establish hostile-process OS-level compare-and-swap. Node explicitly warns its promise filesystem operations are unsynchronized and exclusive-create can be unreliable on network filesystems. Restrict claims to tested capabilities and immediate rechecks; do not promise arbitrary shared-mount safety. [CITED: https://nodejs.org/docs/latest-v24.x/api/fs.html]

### D-20 rollback: required integration

Current public rollback has no writer acquisition/canonical proof; after drift preflight it copies snapshots and removes created files, then sweeps empty parents. Plan a policy-aware path using common rollback entry and existing journals rather than a separate rollback command. [VERIFIED: src/core/transaction.ts:309-423]

Use the policy parent as narrow transaction allowed root so the existing sweep stops at that directory; independently prove containment against the canonical project root, including rollback, so a redirected parent cannot become its own trust anchor. Persist minimal validated operation/root-identity metadata if needed for generic rollback to recover the same coordinator and proof. Any additive journal metadata requires schema/fixture compatibility checks. Restore existing policy bytes by durable atomic replacement, preserving the original byte snapshot; no partially copied policy should be visible. Reuse held session in failure rollback instead of reacquiring it recursively. [VERIFIED: src/core/transaction.ts:47-69,151-167,297-305,378-395]

Generic rollback diagnostics currently include raw unified diffs from manual edits and CLI emits them in text/JSON. Policy rollback must provide hash/path/remediation without arbitrary content; preserve generic diff behavior outside policy operations. [VERIFIED: src/core/transaction.ts:322-364; src/cli.ts:1900-1906; test/rollback.test.ts:66-113; CONTEXT.md D-13,D-16]

### Native routing and integrity

Insert policy-only intent before the existing general two-path prompt and reread policy at every new intake. Clear settings requests use common CLI preview, display root/mode/change/digest and apply under already-granted concrete authority. Mixed requests apply only the setting first, then re-enter ordinary task intake with fresh policy and original task. Preserve exact autopilot approval/start/model constraints; do not implement Phase 28 chooser or Phase 29 bootstrap. [VERIFIED: skills/alpha-aos-task/SKILL.md:14-41,63-78,161-173; CONTEXT.md D-09–D-14]

Renderer supports five targets; automatic invocation without hint returns unchanged source. Both source and target hashes are checked before sync. Recompute all task-skill source/target hashes with the real renderer and add actual task-skill routing coverage; the existing sample-skill loop alone is insufficient. [VERIFIED: src/core/owned-skills.ts:60-68,86-104; test/owned-skills.test.ts:198-240]

### Plan slicing recommendation

| Slice | Proposed work | Required proof |
|-------|---------------|----------------|
| 27-01 | Policy read/schema/root service and tests | Missing zero writes; closed v1; root/off/invalid boundaries |
| 27-02 | Preview/apply, target coordination, policy rollback integration | Cross-process/state-root winner, stale refusal, exact restore, no-op |
| 27-03 | CLI project mode branch/help/text/JSON and rollback safe errors | Exact grammar, required digest, no manifest/GSD coupling |
| 27-04 | Shared task skill, rendered lock hashes, five-target scenarios and bounded host evidence | Policy-only early routing, fresh cross-target read, fixture/native distinction |

Keep dependencies sequential where transaction/CLI/skill-lock files overlap. These slices are recommendations, not execution authority.

## Don't Hand-Roll

| Problem | Reuse | Evidence |
|---------|-------|----------|
| Root ladder | resolveCanonicalRoot and existing declaration list | [VERIFIED: src/core/evidence.ts:146-168,732-737] |
| Duplicate detection/schema | parseManagedDocument + validateAgainstSchema | [VERIFIED: src/core/validation.ts:182-224,302-319,866-877] |
| Digest convention | reviewedDigest | [VERIFIED: src/core/component-session.ts:61-67] |
| Path/recheck | proveOperationPaths / recheckPathProof | [VERIFIED: src/core/path-boundary.ts:251-417,425-469] |
| Snapshot/journal/atomic write | applyFileTransaction with caller session | [VERIFIED: src/core/transaction.ts:151-167,193-305] |
| Five target deployment | renderOwnedSkill + owned-skill plans | [VERIFIED: src/core/owned-skills.ts:60-104,152-219] |

## Common Pitfalls

- Canonicalization alone accepts missing tails; explicitly reject file/missing/unreadable roots. [VERIFIED: src/core/path-boundary.ts:139-157]
- Generic extensions/migration conflict with the closed policy; reject namespaced keys and version zero too. [VERIFIED: src/core/validation.ts:581-591,631-643; CONTEXT.md D-02]
- Content comparison before a lock permits two accepted overwrites; tests need independent processes, including separate state roots. [VERIFIED: src/core/transaction.ts:180-218,248-285]
- Path freshness is not byte freshness; missing-to-created plain files pass generic recheck. [VERIFIED: src/core/path-boundary.ts:376-399]
- Same valid mode is no-op only after exact reviewed-input checks; missing-to-explicit-strict is create. [VERIFIED: CONTEXT.md D-03,D-15,D-19,D-20]
- Current rollback can race, sweep policy parent or leak edited contents; use the integration above. [VERIFIED: src/core/transaction.ts:309-396]
- PathProof device/inode are numeric; PROJECT explicitly records the Windows >2^53 identity gap. A path-derived ID cannot hide this. Plan a narrow prerequisite fix or truthful capability limit where exact identity is required. [VERIFIED: src/core/path-boundary.ts:30-40,407-410; .planning/PROJECT.md:62]
- Skill text/hash/CLI fixture proof is not native selection/invocation proof. [VERIFIED: test/owned-skills.test.ts:198-240; CONTEXT.md D-12]

## Code Examples

Existing signatures and literal values are quoted in the source value ledger. Variables policySchema/policyDirectory/policyPath/serializedPolicy below are proposed local bindings.

<!-- DATA_Z5F1A8U6_START -->
~~~typescript
const parsed = parseManagedDocument({ text, format: "json" });
if (!parsed.ok) return { ok: false, issues: parsed.issues };
const issues = validateAgainstSchema(parsed.value, policySchema);
if (issues.length > 0) return { ok: false, issues };
// Narrow only after syntax and the exact closed schema pass.
~~~
[VERIFIED: src/core/validation.ts:77,302-319,866-877]

~~~typescript
const journal = await applyFileTransaction({
  stateRoot,
  allowedRoots: [policyDirectory],
  operations: [{ target: policyPath, content: serializedPolicy }],
  session,
});
~~~
[VERIFIED: src/core/transaction.ts:74-77,180-190]
<!-- DATA_Z5F1A8U6_END -->

The second example is the inner write only: caller must hold target coordination/session and revalidate project containment, tree, revision and digest.

## State of the Art

This is a local change, not a dependency migration: add early policy-only routing to the current task skill, add closed v1 validation instead of generic extension/migration semantics, and extend state-root serialization to encompass policy compare/apply/rollback. [VERIFIED: skills/alpha-aos-task/SKILL.md:16-29; src/core/validation.ts:581-591,631-643; src/core/writer-lock.ts:88-90,166-200]

## Runtime State Inventory

New policy feature; narrow existing transaction/routing changes require no automatic migration.

| Category | Observation | Action |
|----------|-------------|--------|
| Stored data | Existing journals/snapshots carry before/after hashes. [VERIFIED: src/core/transaction.ts:222-269] | Preserve old journal compatibility; validate additive policy metadata |
| Live service config | Native skill sync destinations exist; live user configs were not inspected. [VERIFIED: src/core/owned-skills.ts:53-57,107-109] | Source/hash fixtures only; no global sync |
| OS-registered state | Reviewed transaction path performs filesystem operations, no OS registration; no machine-wide registration inventory was performed. [VERIFIED: src/core/transaction.ts:193-305] | No install/re-registration |
| Secrets/env vars | Harness/state-root overrides affect sync/lock scope; values were not read. [VERIFIED: src/core/owned-skills.ts:43-49,161; src/core/writer-lock.ts:88-90] | Separate-state-root tests; no values logged |
| Build artifacts | Build compiles and writes artifact metadata. [VERIFIED: package.json:38] | Rebuild during implementation; no stale CLI proof |

## Environment Availability

Observed probes: Node v24.13.1, npm 11.8.0, Git 2.55.0.windows.3; local TypeScript file present. Get-Command found Claude/Codex/Pi/Hermes; no antigravity command entry was returned. This does not establish GUI/IDE absence or any host invocation. [VERIFIED: session version/Get-Command/Test-Path outputs]

Context7 resolve/query worked. Exa returned 401 missing EXA_API_KEY; Firecrawl returned approval required under never approval policy. Official web reader was the fallback for ASVS. No paid calls, dependency installs or global changes occurred. Native host availability/authentication/current skill loading remains an execution checkpoint.

## Validation Architecture

Enabled by workflow.nyquist_validation true; security_enforcement true. [VERIFIED: .planning/config.json workflow]

### Test Framework

<!-- DATA_C8V6J2R5_START -->
| Property | Actual evidence |
|----------|-----------------|
| Framework | 'import test from "node:test";', 'import assert from "node:assert/strict";' [VERIFIED: test/transaction.test.ts:1-6] |
| Build | '"build": "tsc -p tsconfig.json && node scripts/build-artifact.mjs write"' [VERIFIED: package.json:38] |
| Check | '"check": "tsc -p tsconfig.json --noEmit"' [VERIFIED: package.json:41] |
| Full suite | '"test": "npm run build && node scripts/run-tests.mjs"' [VERIFIED: package.json:43] |
| Targeted runner | Terminal '--files' names compiled files, missing files fail; runner invokes '"--test"' with scrubbed environment [VERIFIED: scripts/run-tests.mjs:101-105,130-158] |
<!-- DATA_C8V6J2R5_END -->

Use npm run check, npm run build, then runner commands. New paths below are proposed files; implementation must add them and include MODE IDs in test names. Under-30-second execution is a target to measure, not a researched guarantee. Run complete new files at least once to prevent zero-match filter passes.

### Phase Requirements → Test Map

| Req | Behavior | Type | Command after build | Status |
|-----|----------|------|---------------------|--------|
| MODE-01 | Default and zero-write fingerprint | Unit/CLI | node scripts/run-tests.mjs --test-name-pattern=MODE-01 --files dist/test/behavior-policy.test.js dist/test/project-mode-cli.test.js | New proposed files |
| MODE-02 | Five-target policy-only routing | Fixture/CLI | node scripts/run-tests.mjs --test-name-pattern=MODE-02 --files dist/test/project-mode-routing.test.js dist/test/owned-skills.test.js | New routing file; modify owned-skills tests |
| MODE-03 | Root/source/revision and fresh reread | Unit/CLI | node scripts/run-tests.mjs --test-name-pattern=MODE-03 --files dist/test/behavior-policy.test.js dist/test/project-mode-cli.test.js dist/test/project-mode-routing.test.js | New files |
| MODE-04 | Preview/apply/stale/no-op/rollback | Integration/process | node scripts/run-tests.mjs --test-name-pattern=MODE-04 --files dist/test/behavior-policy.test.js dist/test/project-mode-cli.test.js dist/test/project-mode-concurrency.test.js | New files |
| MODE-05 | Invalid/root/read/path/off failure | Unit/CLI | node scripts/run-tests.mjs --test-name-pattern=MODE-05 --files dist/test/behavior-policy.test.js dist/test/project-mode-cli.test.js | New files |
| MODE-02 | Actual native selection/call then second host read | Native checkpoint | No fixture command proves native selection; retain actual host/tool receipt | Separate, no paid/global install |

Existing regression command: node scripts/run-tests.mjs --files dist/test/validation.test.js dist/test/evidence.test.js dist/test/path-boundary.test.js dist/test/transaction.test.js dist/test/rollback.test.js dist/test/rollback-cli-verification.test.js dist/test/owned-skills.test.js dist/test/project.test.js

Process/repair gate: node scripts/run-tests.mjs --files dist/test/transaction-crash.test.js

### Required behavior matrix

| Area | Cases / oracle |
|------|----------------|
| Missing/read-only | Empty existing root with no GSD/manifest/policy; query AND preview change no project/home/state bytes, directories or journals |
| Create/no-op | Missing→explicit strict creates; missing→flexible creates; same valid mode preserves bytes and no operation ID/journal; old digest after same-mode whitespace change refuses |
| Exact schema | Missing fields, null/array/wrong types, version zero/newer, ordinary/namespaced unknown fields, duplicate/escaped duplicate keys, malformed/comments/trailing comma; no auto-repair |
| Read/path | Unreadable policy/root, directory policy, dangling link, escaping symlink/junction, missing/non-directory root; no fallback or raw content |
| Root ladder | Explicit, nearest declaration, Git stop, same-dir declaration priority, .git file worktree/submodule, standalone, alias, unmarked non-Git child |
| Bound target | Active task root mismatch refuses; mode change does not alter active style/contract/task |
| Digest | Root identity/path, target, bytes/missing, requested change; no mtime/cache authority |
| Stale | Create/delete/format-only edit/root replacement/ancestor retarget after preview; reject before policy/journal mutation |
| Processes | Independent processes same digest: one winner; loser contention then stale; repeat separate state roots and aliases |
| Apply/rollback races | Barriers test both orderings; same coordinator; recheck LIFO/drift inside; no lost bytes |
| Rollback | CRLF/Unicode original bytes exact; first-create removes only policy; preserve parent/siblings/manifest/.planning; drift/delete/link swap refusal; no secret marker in diagnostics |
| Tree-off | Off invocation/root plus explicit ancestor; no classification prompt/registry mutation/inheritance |
| Five targets | Real renderer/plan/apply to temp homes and integrity verification; current policy shared across target contexts; settings branch precedes general intake |
| Evidence | Capability skips explicitly not-run; CLI/render fixtures not called host invocation; unsupported native proof stays open |

Reusable fixtures: fingerprint project/home/state before/after previews; real child writer exclusion; not-run capability recording; five fake target homes. [VERIFIED: test/rollback-cli-verification.test.ts:15-56,59-92; test/transaction-crash.test.ts:251-284,503-529; test/path-boundary.test.ts:904-911; test/owned-skills.test.ts:198-240]

### Sampling Rate and Wave 0 Gaps

- Per task: check/build and relevant new targeted file plus changed existing regressions.
- Per wave: all new phase files and affected validation/path/transaction/rollback/owned-skill tests.
- Phase gate: npm test and npm run build:check; truthful native/fixture receipts before GSD verification. No test pass is claimed here.
- Add proposed test/behavior-policy.test.ts, test/project-mode-cli.test.ts, test/project-mode-routing.test.ts, test/project-mode-concurrency.test.ts.
- Add deterministic child-ready/barrier helpers with bounded deadlines; avoid timing-only sleeps.
- Extend actual task-skill integrity/routing tests and existing rollback/transaction tests. No framework install.

## Security Domain

Use ASVS 5.0.0 categories rather than the template's older numbering. ASVS is a web-application standard; this is a scoped local-CLI control mapping, not certification or a new compliance requirement. [CITED: https://asvs.owasp.org/; https://github.com/OWASP/ASVS/tree/v5.0.0/5.0/en]

| Category | Applies | Proposed control |
|----------|---------|------------------|
| V2 Validation and Business Logic | Yes | Exact schema, ordered preview/apply, digest/revision and serialized transition |
| V5 File Handling | Yes, adapted | Constructed filename, canonical containment and file type checks |
| V6 Authentication / V7 Session Management | No new feature | Existing OS permissions and runner consent preserved |
| V8 Authorization | Local ownership only | Bound root/tree/sandbox; mode grants no execution authority |
| V11 Cryptography | Integrity hash only | Existing Node SHA-256; no custom crypto |
| V16 Security Logging and Error Handling | Yes, scoped | Safe path/hash/remediation; no arbitrary policy text |

Official chapter/control sources: [CITED: https://raw.githubusercontent.com/OWASP/ASVS/v5.0.0/5.0/en/0x11-V2-Validation-and-Business-Logic.md; https://raw.githubusercontent.com/OWASP/ASVS/v5.0.0/5.0/en/0x14-V5-File-Handling.md; https://raw.githubusercontent.com/OWASP/ASVS/v5.0.0/5.0/en/0x25-V16-Security-Logging-and-Error-Handling.md]

| Threat | STRIDE | Mitigation |
|--------|--------|------------|
| Repointed root/parent | Tampering/elevation | Canonical proof + immediate identity recheck on apply/rollback |
| Competing reviewed plans | Tampering | Target coordination + inside-lock revision comparison |
| Flexible treated as consent | Elevation | Preference-only view; unchanged runner/GSD authority |
| Invalid/manual-edit secret echoed | Disclosure | Shape-only errors, no policy unified diff |
| Invalid policy becomes default | Tampering | Absence-only fallback, no parent/global cascade |

Threat mapping is a recommendation derived from D-04/D-08/D-13–D-20 and the reviewed transaction paths, not an observed exploit.

## Risks and Open Implementation Questions

1. Finalize target-lock location independent of state-root override, ownership token, lock order, crash repair and path proof. Do not defer separate-state-root race testing.
2. Choose minimal additive validated policy-operation/root metadata for the common rollback path. Preserve old journals, generic sweep/diff behavior and held-session failure recovery.
3. Define immediate collision diagnostic (contention versus stale); after the winner, old digest must be stale. Keep the guarantee honest for uncooperative editors/network filesystems. [CITED: https://nodejs.org/docs/latest-v24.x/api/fs.html]
4. Address numeric Windows identity precision where root replacement proof depends on it. PROJECT already calls this out; do not silently assert exact identity. [VERIFIED: src/core/path-boundary.ts:30-40,407-410; .planning/PROJECT.md:62]
5. Record an actual loaded-revision native invocation separately from five-target source/fixture proof. Missing paid-call-free host path remains an explicit verification checkpoint, not a reason to omit MODE-02 routing.

## Assumptions Log

| # | Claim | Risk / confirmation |
|---|-------|---------------------|
| A1 | [ASSUMED] A reviewed transient canonical-target lock is allowed internal coordination under D-18 rather than a forbidden second persistent setting. | Validate at plan review; no lock on query/preview/no-op |
| A2 | [ASSUMED] A permitted native path can consume a current fixture skill revision without paid calls/global install. | If unavailable retain fixture evidence and explicit native checkpoint |
| A3 | [ASSUMED] New targeted groups can meet short feedback budget. | Measure, then split groups without dropping cases |

Other future API/file names and slice assignments above are proposals, not claims of existing implementation.

## Sources and Research Method

All canonical references were opened: full CONTEXT including canonical_refs; REQUIREMENTS MODE-01–05; ROADMAP Phase 27; PROJECT current scope; bounded STATE headings; evidence/path-boundary/transaction/validation/tree-policy/project/owned-skills/CLI and referenced tests. Additional writer-lock/component-session and rollback/crash test slices grounded concurrency findings.

Research-plan selected Context7 for the Node exclusive-create question; resolve/query succeeded with /websites/nodejs_latest-v24_x_api. Official Node source: https://nodejs.org/docs/latest-v24.x/api/fs.html. Official ASVS source links are above.

classify-confidence returned MEDIUM for Context7 with verified flag; LOW for unrecognized codebase provider. The seam classifies external provider/package authority, not repository code; repository VERIFIED tags denote directly opened authoritative definitions. Overall confidence remains MEDIUM. No package is registry-verified or recommended for installation. [VERIFIED: session research-plan/classify-confidence output; installed research-provider.cjs authorityOf/classifyConfidence]

Exa returned 401 missing key; Firecrawl required unavailable approval. Official web reads were explicit fallback. Two guessed ASVS raw filenames failed 404 before opening the real chapter tree and fetching correct chapters; failed lookups are not absence evidence. Graph status reported disabled. No research-store cache/memory write or commit was made because parent restricted ownership; research-plan input was temporary only. [VERIFIED: session tool output and parent scope]

## Metadata

**Standard stack:** MEDIUM — exact existing versions read, no latest-release claim.
**Architecture:** MEDIUM — reusable paths verified; new target coordination/rollback design needs process proof.
**Pitfalls:** MEDIUM — source behavior cross-checked with existing tests and locked decisions.
**Native support:** Not proven by this research.
**Valid until:** Re-read touched sources at planning/execution; external citations after 30 days/version change.
**Scope:** Research only; no implementation, test pass, lifecycle transition, global sync, paid call or release claimed.

