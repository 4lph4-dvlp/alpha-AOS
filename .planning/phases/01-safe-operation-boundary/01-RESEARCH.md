# Phase 1: Safe Operation Boundary - Research

**Researched:** 2026-09-03
**Domain:** 로컬 TypeScript CLI의 파일시스템·트랜잭션·검증·진단·프로세스 안전 경계
**Confidence:** MEDIUM-HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

### Unsupported Filesystem Handling
- **D-01:** If alpha-AOS cannot prove path-boundary, reparse-point, or filesystem safety, all mutations fail closed. Inspection and dry-run remain available, and no unsafe override is offered.
- **D-02:** Preflight covers every path involved in an operation: targets, state, journals, snapshots, temporary files, install sources, and the package root. All checks finish before any file or external-package mutation begins.
- **D-03:** Symlinks and junctions are allowed only when both configured and canonical paths remain inside the allowed boundary and stability is rechecked immediately before apply. Escaping links and unknown reparse-point kinds are rejected.

### Interrupted and Concurrent Operations
- **D-04:** Each alpha-AOS state root permits one mutating writer at a time. Read-only status, doctor, and dry-run operations remain available while a writer is active.
- **D-05:** A competing mutation fails immediately and reports the active operation ID, start time, PID, and retry guidance. It does not wait indefinitely or remove the lock.
- **D-06:** A lock that appears abandoned is never cleared solely because its PID is absent or a timeout elapsed. It blocks new mutations as `needs-repair` until the journal, operation token, and target hashes are inspected.
- **D-07:** Diagnosis may construct a safe recovery plan, but recovery never mutates automatically. Restoration requires an explicit `repair --apply` action.

### Schema Evolution
- **D-08:** Catalog, lock, manifest, evidence, receipt, and journal core fields use strict closed-world validation. Extensibility is permitted only under an explicit namespaced `extensions` area.
- **D-09:** Extension data affects planning or apply only when its namespace and schema are registered with a supported adapter. Unknown extension data may be preserved and displayed but remains inert.
- **D-10:** Supported older schema versions are interpreted read-only and receive a previewable migration plan that requires explicit apply. Unknown newer versions are rejected.
- **D-11:** Validation reports a bounded, deterministically sorted error list with stable error codes, document paths, expected forms, and redacted summaries of actual forms.

### Diagnostics and Redaction
- **D-12:** Failed subprocesses retain only bounded redacted excerpts, a whole-output fingerprint, exit code, and timeout metadata. Raw stdout or stderr is never persisted to plans, journals, JSON, CI evidence, or support artifacts.
- **D-13:** Redaction combines exact credential values, secret-bearing name patterns, URL userinfo and token parameters, and structural PEM, JWT, and API-key detection. Replacements use stable typed placeholders.
- **D-14:** Human, JSON, and CI output consistently alias home, user-identifying, temporary, and selected project roots while preserving useful repository-relative paths and environment-variable names.
- **D-15:** Diagnostic support material is an explicit local bundle with a dry-run manifest and redacted content preview. alpha-AOS never uploads it automatically; the user controls sharing.

### the agent's Discretion
- Select the locking primitive, lock-record encoding, and platform-specific filesystem probes that satisfy the decisions above on Windows, macOS, and Linux.
- Select strict schema-validation and migration implementation details while preserving deterministic output and extension inertness.
- Set bounded excerpt sizes, fingerprint algorithms, typed placeholder vocabulary, and support-bundle layout, provided raw secrets and raw subprocess output cannot escape.
- Define stable diagnostic error-code names and CLI formatting consistent with the repository's existing typed finding and plan/apply patterns.

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within Phase 1 scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SAFE-01 | User can preview any mutating alpha-AOS operation without changing source checkouts, global packages, configuration files, managed state, or harness resources | 공통 operation plan, 래퍼 무변이화, 트리 다이제스트 부정 테스트 |
| SAFE-02 | User is protected from writes or removals that escape an allowed root through symlinks, junctions, reparse points, aliases, or changed parent paths | canonical path proof, Windows reparse probe, 직전 안정성 재검사 |
| SAFE-03 | User receives serialized, hash-checked, journaled, and crash-diagnosable managed writes so concurrent or interrupted operations cannot silently lose data | operation-scoped writer session, write-ahead journal, fsync 순서, repair plan |
| SAFE-04 | User can inspect human output, JSON output, plans, journals, snapshots, subprocess failures, and CI evidence without credential values or secret-bearing URLs being exposed | 중앙 재귀 redactor, 경로 alias, opaque snapshot, 진단 bundle gate |
| SAFE-05 | User receives a clear refusal when catalogs, locks, manifests, evidence, receipts, or native configuration inputs are malformed, ambiguous, unsupported, or fail strict schema validation | strict parser → JSON Schema → domain validation 파이프라인 |
| SAFE-06 | User-launched external commands run without a shell, with bounded output and timeout behavior, and with only the environment variables allowed for that operation | 단일 async process adapter, executable normalization, bounded capture |
</phase_requirements>

## Summary

이 단계는 기존 기반을 교체하는 단계가 아니다. 현재 트랜잭션에는 원자적 임시 파일 rename, snapshot, SHA-256, journal, rollback 전 drift 검사가 이미 있고, plan/apply 분리도 대부분 존재한다. 다만 containment가 `resolve()`/`relative()`의 lexical 검사뿐이고, 현재 journal 상태는 정확히 `"applying" | "applied" | "rolled-back" | "failed"`이며 대상 변경 뒤에 파일 항목을 기록한다. 따라서 링크 탈출·중단 창·동시 writer·journal 내구성 문제가 남는다. [VERIFIED: src/core/transaction.ts:19-25,32-40,43-109 — quoted values: `"applying" | "applied" | "rolled-back" | "failed"`]

계획의 중심은 하나의 `MutationSession`이다. CLI의 한 mutating command가 state root writer lock을 한 번 획득하고, 모든 대상·state·journal·snapshot·temporary·source·package-root proof를 만든 뒤, 동일 token/session을 여러 하위 트랜잭션과 외부 installer에 전달해야 한다. `applyFileTransaction`마다 별도 lock을 잡으면 전체 install의 외부-package 구간을 보호하지 못하고 중첩 lock도 생긴다. [VERIFIED: src/core/install.ts:262-351 — 현재 `applyManagedInstall`은 외부 installer 후 여러 개의 파일 트랜잭션을 순차 호출함]

**Primary recommendation:** `validation/redaction/process/path proof/writer session`을 공통 코어로 먼저 만들고, write-ahead durable transaction에 결합한 뒤, 마지막 wave에서 모든 apply·fixture·wrapper·출력 호출부를 그 경계로 이동한다. 프로젝트 감지, pack materialization, mandatory gate, tree-off, full uninstall은 건드리지 않는다. [VERIFIED: .planning/ROADMAP.md, .planning/phases/01-safe-operation-boundary/01-CONTEXT.md]

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| strict parse/schema/domain validation | CLI core | adapter boundary | 외부 문서를 typed domain으로 바꾸기 전에 한 번 거부 |
| canonical containment/reparse proof | filesystem safety core | transaction | 모든 writer/remover가 같은 proof를 소비 |
| writer serialization/durable journal | transaction core | CLI dispatcher | lock 수명은 전체 명령, byte mutation은 transaction이 소유 |
| centralized redaction/path aliases | presentation safety core | process adapter | persistence 이전과 human/JSON/CI 직렬화 직전에 동일 정책 적용 |
| subprocess policy | process core | harness adapter | adapter는 executable/argv/env names만 선언하고 실행 규칙은 중앙화 |
| zero-mutation verification | integration tests/CI | unit tests | 실제 CLI·shell-family wrapper를 byte digest로 검증 |

## Project Constraints (from AGENTS.md)

- Windows 11, current macOS/Linux에서 같은 의미를 유지하고 Node.js `>=24.0.0`, npm `>=10.0.0`, Git을 기준으로 한다. 저장소의 선언도 정확히 `"node": ">=24.0.0"`, `"npm": ">=10.0.0"`이다. [VERIFIED: package.json:34-37]
- 지원 harness 식별자는 정확히 `"claude" | "codex" | "antigravity" | "pi" | "hermes"`이고, MCP 식별자는 `"context7" | "exa" | "firecrawl"`이다. [VERIFIED: src/types.ts:1-2 — quoted values verbatim]
- GSD Core `standard`만 lifecycle/state spine을 소유하며 Phase 1 코드는 `.planning/` transition을 만들지 않는다. mutation은 previewable, root-bounded, snapshotted, rollback-aware여야 한다. [VERIFIED: AGENTS.md]
- 비밀 값은 manifest, lock, plan, journal, diagnostic, command argument, repository file에 들어가면 안 된다. 외부 프로세스 환경은 reviewed allowlist가 기본이다. [VERIFIED: AGENTS.md]
- TypeScript는 strict NodeNext ESM, 상대 import의 `.js`, double quotes, semicolon, 2-space indentation을 유지한다. 검증은 `npm run check`, 전체 테스트는 `npm test`다. [VERIFIED: AGENTS.md; package.json:27-32; tsconfig.json:3-16]
- 모든 파일 변경은 GSD workflow 안에서 수행한다. 이 RESEARCH는 `$gsd-plan-phase`가 시작한 Phase 1 research 산출물이다. [VERIFIED: AGENTS.md]

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js built-ins | 24.x (`24.13.1` available) | fs/crypto/path/child_process | `realpath`, `lstat`, exclusive `open`, `FileHandle.sync`, direct `spawn` 제공 [CITED: https://nodejs.org/docs/latest-v24.x/api/fs.html] |
| `ajv` | `8.20.0` (2026-04-24) | JSON Schema 2020-12 compiled validation | strict/allErrors와 structured error를 한 경계에서 제공 [VERIFIED: npm registry + official Ajv docs] |
| `jsonc-parser` | `3.3.1` (2026-07-16) | strict JSON syntax/duplicate-key 위치 탐지 | parser error offset와 visitor property callback을 제공 [VERIFIED: npm registry + https://github.com/microsoft/node-jsonc-parser] |
| `yaml` | existing `2.9.0` (2026-05-11) | YAML parse/AST/error/alias limit | `parseDocument`, 기본 duplicate-key 검사, alias limit을 이미 설치된 의존성으로 제공 [VERIFIED: npm registry; CITED: https://github.com/eemeli/yaml]
| `smol-toml` | `1.8.0` (2026-08-11) | Codex TOML 문법/중복 정의 거부 | regex renderer 전에 전체 문법을 검증하는 후보. **[WARNING: flagged as suspicious — verify before using.]** [CITED: https://github.com/squirrelchat/smol-toml] |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| TypeScript | pinned `5.9.3` | strict contracts | 새 safety value objects와 discriminated results [VERIFIED: package.json:42-45] |
| `node:test` + `node:assert/strict` | Node 24 | unit/integration/crash tests | 기존 test style 유지 [VERIFIED: .planning/codebase/TESTING.md] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| OS exclusive create (`open(..., "wx")`) | `proper-lockfile` | timeout/PID 기반 stale removal 모델은 D-06의 명시적 repair-only 규칙과 맞지 않아 사용하지 않는다. [ASSUMED] |
| Ajv | handwritten validators | 현재 최소 검사가 nested unknown fields를 놓치므로 금지. [VERIFIED: src/core/catalog.ts:6-30; schemas/stack.schema.json:5-14]
| TOML parser | current regex-only table scan | comments, quoted/dotted keys, duplicate tables의 ambiguity를 안전하게 판정할 수 없다. [VERIFIED: src/core/mcp.ts:211-261; src/core/isolation.ts:190-196]

**Installation:**

```bash
npm install --save-exact ajv@8.20.0 jsonc-parser@3.3.1 smol-toml@1.8.0
```

`smol-toml`은 human verification checkpoint 전 설치하지 않는다. `yaml@2.9.0`은 이미 exact dependency다. [VERIFIED: package.json:38-41]

## Package Legitimacy Audit

| Package | Registry | Age / publish signal | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|----------------------|-----------|-------------|---------|-------------|
| `ajv` | npm | latest 2026-04-24 | 377,544,216/wk | github.com/ajv-validator/ajv | OK | Approved |
| `jsonc-parser` | npm | latest 2026-07-16 | 65,174,980/wk | github.com/microsoft/node-jsonc-parser | OK | Approved |
| `yaml` | npm | latest 2026-05-11 | 202,359,392/wk | github.com/eemeli/yaml | OK | Existing/approved |
| `smol-toml` | npm | package created 2023; latest 2026-08-11 | 34,053,544/wk | github.com/squirrelchat/smol-toml | SUS (`too-new`) | Flagged — planner must add checkpoint |

모든 검사 대상은 postinstall script가 없었다. [VERIFIED: npm registry/package-legitimacy seam]

**Packages removed due to [SLOP] verdict:** none

**Packages flagged as suspicious [SUS]:** `smol-toml` — install 전 `checkpoint:human-verify` 필수.

## Architecture Patterns

### System Architecture Diagram

```text
argv / catalog / lock / manifest / native config
                     |
                     v
 strict syntax parser -> schema-version router -> closed schema -> domain invariants
                     | invalid: bounded redacted ValidationIssue[] -> human/JSON/CI
                     v
 read-only OperationPlan (all paths, sources, commands, env-name allowlists, hashes)
                     |
             --apply decision
                     v
 non-mutating complete preflight -> acquire one state-root writer session
                     | conflict: active metadata / needs-repair, no wait/no unlock
                     v
 canonical proof recheck -> durable write-ahead journal -> snapshot sync
                     v
 direct process calls and/or canonical temp-write + sync + rename + parent sync
                     v
 per-step journal sync -> final journal sync -> release lock
                     |
                     v
 centralized redacted serializer / explicit local support-bundle preview
```

### Recommended Project Structure

```text
src/core/
├── validation.ts       # syntax/schema/domain/version router and stable issues
├── redaction.ts        # exact-value, structural, URL, path alias policies
├── path-boundary.ts    # canonical proof and platform reparse probes
├── writer-lock.ts      # one state-root writer session and repair diagnosis
├── process.ts          # single shell-free bounded async adapter
└── transaction.ts      # durable write-ahead state machine (existing file)
schemas/
├── transaction-journal.schema.json
├── writer-lock.schema.json
├── evidence.schema.json
└── receipt.schema.json
test/
├── validation.test.ts
├── redaction.test.ts
├── path-boundary.test.ts
├── process.test.ts
├── transaction-crash.test.ts
└── preview.test.ts
```

### Pattern 1: Parse → Schema → Domain

1. JSON/YAML/TOML syntax와 duplicate/alias ambiguity를 먼저 거부한다.
2. `schemaVersion`만 최소 안전 추출해 exact-version validator를 선택한다.
3. core object마다 `additionalProperties: false` 또는 composition이 필요하면 `unevaluatedProperties: false`를 적용하고, `extensions`만 별도 namespace map으로 연다. [CITED: https://ajv.js.org/json-schema.html]
4. schema 성공 후 cross-field invariant와 registered extension adapter를 실행한다. unknown extension은 원문 보존·표시만 하고 plan/apply input에서 제외한다.
5. 오류는 raw value가 아니라 type/length/shape summary만 담아 `(documentPath, code, expected)` 순으로 정렬하고 50개에서 자른다. 50은 설계 권고값이다. [ASSUMED]

현재 stack/lock schema는 각각 top-level `additionalProperties: true`이고 nested object가 거의 열려 있으므로 D-08을 충족하지 않는다. [VERIFIED: schemas/stack.schema.json:5-14; schemas/lock.schema.json:5-12]

### Pattern 2: Canonical Path Proof

- configured root와 target을 absolute-normalize한 뒤, 각 path component를 `lstat`으로 검사한다. 존재하지 않는 target은 가장 가까운 existing ancestor를 `realpath`하고 나머지 suffix를 붙여 canonical candidate를 만든다. `realpath`는 symbolic link를 해결한 canonical pathname을 계산한다. [CITED: https://nodejs.org/docs/latest-v24.x/api/fs.html#fsrealpathpath-options-callback]
- configured 관계와 canonical 관계가 모두 같은 allowed root 안이어야 한다. root 자체, state/journal/snapshot/temp/source/package root도 같은 proof set에 포함한다.
- Windows에서 junction은 reparse point이며 다른 volume으로 연결될 수 있다. known symlink/junction은 final path를 검증하고, reparse attribute가 있으나 종류를 신뢰할 수 없으면 D-01에 따라 apply를 거부한다. [CITED: https://learn.microsoft.com/en-us/windows/win32/fileio/hard-links-and-junctions; CITED: https://learn.microsoft.com/en-us/windows/win32/fileio/reparse-points]
- proof에는 existing ancestor들의 canonical path와 stable identity tuple을 저장하고 lock 획득 후, 각 rename/remove 직전에 다시 비교한다. Node path 기반 API만으로 모든 hostile TOCTOU를 제거할 수 있다는 근거는 확인하지 못했으므로, 지원 filesystem별 adversarial test를 통과하지 못하면 mutation support를 명시적으로 거부해야 한다. [ASSUMED]

### Pattern 3: Operation-Scoped Writer Session

- state root의 고정 lock record를 `open(path, "wx", 0o600)`으로 atomic claim한다. record에는 operation ID, random operation token, PID, start time, journal path, plan digest를 저장하고 `FileHandle.sync()` 후 사용한다. `FileHandle.sync()`는 file data/metadata flush API다. [CITED: https://nodejs.org/docs/latest-v24.x/api/fs.html#filehandlesync]
- lock이 있으면 읽기만 하고 즉시 실패한다. PID나 나이만으로 제거하지 않는다. journal/token/schema/target hashes가 완전히 진단되기 전 상태는 `needs-repair`다.
- `repair` preview는 가능한 전이와 hash evidence만 출력한다. `repair --apply`가 lock session을 다시 검증한 뒤에만 복구/정리를 수행한다. 이는 stale-lock gap만 닫으며 Phase 6의 full uninstall/external compensation을 구현하지 않는다.
- lock 획득은 첫 mutation이므로 그 전에 모든 비변이 preflight가 끝나야 한다. 이후 source/target stability recheck 실패 시 journal target 변경 없이 lock을 durable failure/repair evidence로 남긴다.

### Pattern 4: Write-Ahead Durable Transaction

현재 구현은 snapshot과 target mutation 뒤 `journal.files.push(...)`를 수행한다. 그 사이 중단되면 journal이 실제 변경을 설명하지 못한다. [VERIFIED: src/core/transaction.ts:78-104]

권고 순서는 다음과 같다.

1. 모든 target의 before bytes/hash, desired after hash, canonical proof를 읽고 전체 preflight 완료.
2. snapshot write + file sync.
3. per-file intent와 before/after hash를 journal에 먼저 기록하고 journal temp file sync → rename → parent directory sync.
4. canonical proof를 직전 재검사.
5. target과 같은 canonical directory에 temp file을 쓰고 sync → rename → parent directory sync. remove도 intent가 durable한 뒤 실행.
6. file step status를 journal에 durable update.
7. 모든 step 후 final status를 durable update한 다음 lock 해제와 lock-directory sync.

각 중단 지점에서 current hash가 before/after/neither 중 무엇인지로만 진단하고 자동 복구하지 않는다. directory fsync 또는 filesystem semantics를 확인할 수 없는 플랫폼에서는 내구성을 과장하지 말고 apply를 fail closed해야 한다. [ASSUMED]

### Pattern 5: Central Redaction and Opaque Recovery Bytes

- `redact(value, context)`는 문자열뿐 아니라 Error, object, array를 재귀 처리하고 circular/depth/size limits를 둔다. CLI의 `print`, top-level catch, plan/journal serializer, process result, CI evidence, support bundle이 모두 이 함수만 사용한다.
- 순서는 exact known credential values → secret-bearing key/name context → URL userinfo/query token → PEM/JWT/API-key 구조 → path aliases다. typed placeholder는 `<redacted:credential>`, `<redacted:url-userinfo>`, `<redacted:url-token>`, `<redacted:pem>`, `<redacted:jwt>`, `<redacted:api-key>`로 고정하는 것을 권고한다. [ASSUMED]
- snapshot은 rollback을 위한 byte-identical opaque blob이므로 내용을 human/JSON/support bundle에 내보내지 않는다. inspector는 alias path, size, SHA-256, permissions만 제공한다. OWASP는 access token, password, connection string, encryption key 등을 log에 직접 기록하지 말 것을 권고한다. [CITED: https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html]
- `~`, `<temp>`, `<project>` alias는 segment-aware canonical comparison으로 적용하고 단순 substring replace를 쓰지 않는다. repository 내부 경로는 project-relative로 유지한다.

### Pattern 6: One Shell-Free Process Adapter

- `ProcessSpec`는 resolved executable, argv array, canonical cwd, operation-specific env-name allowlist, timeout, output byte limit, stdin/stdio mode를 요구한다. custom env 전달 시 Node는 그 env의 `PATH`로 executable을 찾고 Windows env names는 case-insensitive하므로, key case를 normalize하고 충돌을 거부한다. [CITED: https://nodejs.org/docs/latest-v24.x/api/child_process.html]
- async `spawn(executable, args, { shell: false, ... })`로 실행하고 stdout/stderr raw bytes를 SHA-256에 streaming update한다. 각 stream은 redaction 후 head 4 KiB + tail 4 KiB만 결과에 남기고, 합계 byte ceiling 초과나 timeout이면 child를 종료하고 metadata를 기록한다. 크기는 권고값이다. [ASSUMED]
- `.cmd`/`.bat`은 Windows에서 직접 실행할 수 없고 `cmd.exe`가 필요하므로 일반 fallback을 금지한다. npm/npx처럼 검증된 shim은 이미 하듯 `node` + known `*-cli.js`로 normalize하고, 다른 script shim은 adapter가 exact executable mapping을 제공하지 않으면 unsupported로 거부한다. [CITED: https://nodejs.org/docs/latest-v24.x/api/child_process.html#spawning-bat-and-cmd-files-on-windows; VERIFIED: src/core/process.ts:18-27]
- 현재 `readCommandVersion`, `runCommandInteractive`, `runCommandCapture`는 `.cmd`를 `ComSpec`에 넘기고 capture는 raw stdout/stderr 전체를 반환한다. 이를 모두 새 adapter로 교체한다. [VERIFIED: src/core/process.ts:29-100]
- `mcp-fixture.ts`의 직접 `spawn`도 protocol-session mode로 흡수해 stderr cap, absolute deadline, env allowlist를 공통 적용한다. 현재는 `process.env` 전체와 credential sentinel을 전달한다. [VERIFIED: src/core/mcp-fixture.ts:71-120,150-158]

### Anti-Patterns to Avoid

- **Per-file/per-module lock:** 전체 install의 외부 mutation 사이가 열리고 nested apply가 deadlock될 수 있다.
- **PID/mtime stale unlock:** D-06 위반이며 PID reuse·clock drift·느린 작업을 구분하지 못한다.
- **Mutation 후 journal intent 기록:** crash가 실제 변경을 숨긴다.
- **Lexical-only containment:** 현재 `resolve`/`relative`처럼 symlinked parent를 따라가지 않는다. [VERIFIED: src/core/transaction.ts:32-40]
- **Redaction only at CLI:** raw subprocess text가 exception이나 journal/support artifact에 먼저 들어갈 수 있다.
- **Ajv coercion/default/removal:** validation이 입력을 몰래 수정하면 migration/preview 경계가 사라진다. `coerceTypes`, `useDefaults`, `removeAdditional`은 끈다. [CITED: https://ajv.js.org/options.html]
- **Shell quoting:** quote/escape를 개선하지 말고 shell 자체를 사용하지 않는다.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JSON Schema engine | recursive property/type checker | Ajv 2020 | refs/composition/unevaluated fields/error paths |
| JSON syntax/CST | regex duplicate detector | `jsonc-parser` visitor + error list | offsets, comments/trailing-comma policy, duplicate context |
| YAML syntax/alias safety | string parsing | existing `yaml.parseDocument` | duplicate keys, multi-doc errors, alias limit |
| TOML syntax | table-header regex | reviewed TOML parser | quoted/dotted keys, duplicate tables, arrays/comments |
| hashing/random token | custom checksum/ID | `node:crypto` SHA-256 + `randomUUID`/random bytes | existing pattern and cryptographic primitive |
| shell escaping | platform-specific quote builder | direct executable + argv | command/data separation |
| stale lock guessing | PID/age heuristic | journal/token/hash repair state machine | locked explicit-repair semantics |

**Key insight:** custom code는 policy orchestration(어떤 root·env·redaction class가 허용되는가)에만 쓰고, 문법·암호·프로세스 분리는 표준 primitive에 맡긴다.

## Runtime State Inventory

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| Stored data | 기본 user state root가 현재 존재하지 않음 | migration 없음; 새 journal/lock schema를 처음부터 strict하게 생성 [VERIFIED: 2026-09-03 local read-only probe]
| Live service config | repository는 harness-native JSON/TOML/YAML 파일을 읽고 병합하지만 외부 service DB를 소유하지 않음 | syntax/owned-subtree validation만 추가하고 user-owned unknown fields 보존 [VERIFIED: src/core/mcp.ts:90-98,114-162,207-295]
| OS-registered state | alpha-aos global npm link 존재; alpha-aos 이름의 Windows scheduled task는 0개 | implementation 후 link/build 재검증만 필요; task migration 없음 [VERIFIED: 2026-09-03 local read-only probe]
| Secrets/env vars | `HERMES_HOME`, `EXA_API_KEY` 이름이 현재 환경에 존재; 값은 조사/기록하지 않음 | exact-value redactor context와 operation별 env allowlist tests에 이름만 사용 [VERIFIED: 2026-09-03 presence-only probe]
| Build artifacts | `dist/` 존재 | source 변경 후 normal build; stale compiled CLI로 wrapper preview를 실행하지 않도록 명확한 refusal 제공 [VERIFIED: 2026-09-03 local read-only probe; package.json:15-25]

## Common Pitfalls

### Pitfall 1: Preflight가 state/journal/temp/source를 빼먹음
**What goes wrong:** target은 안전하지만 snapshot 또는 temp가 링크 밖으로 나가거나 외부 installer가 먼저 실행된다.
**Why it happens:** 현재 `applyManagedInstall`은 외부 installers를 먼저 실행한다. [VERIFIED: src/core/install.ts:287-305]
**How to avoid:** operation plan이 모든 경로와 external step을 열거하지 못하면 apply 불가.
**Warning signs:** apply 함수 내부에서 새 path를 계산하거나 새 process를 발견함.

### Pitfall 2: Windows junction을 일반 directory로 봄
**What goes wrong:** lexical child가 다른 volume으로 연결된다.
**How to avoid:** component-by-component reparse detection + final canonical containment; unknown tag는 refusal. [CITED: https://learn.microsoft.com/en-us/windows/win32/fileio/reparse-points-and-file-operations]
**Warning signs:** junction sentinel test에서 outside file이 생성/삭제됨.

### Pitfall 3: Journal은 atomic하지만 durable하지 않음
**What goes wrong:** rename 성공 후 crash/power loss에서 journal 또는 directory entry가 사라질 수 있다.
**Why it happens:** 현재 `writeJsonAtomic`은 write→rename만 하고 sync하지 않는다. [VERIFIED: src/core/transaction.ts:43-48]
**How to avoid:** temp file sync, rename, supported parent directory sync와 단계별 failpoint tests.

### Pitfall 4: Secret이 chunk 경계를 넘음
**What goes wrong:** stream 단위 regex만 쓰면 token 일부가 두 chunk로 갈라져 노출된다.
**How to avoid:** bounded overlap 또는 최종 bounded buffer에 대한 redaction; raw chunk를 Error/string result에 넣지 않음.
**Warning signs:** 1-byte chunk fuzz test가 typed placeholder로 완전히 치환되지 않음.

### Pitfall 5: JSON Schema만 통과하면 안전하다고 간주
**What goes wrong:** duplicate keys가 parse 단계에서 덮어써지고 cross-field invariant가 빠진다.
**How to avoid:** syntax ambiguity → schema → semantic domain의 세 단계와 negative fixture matrix.

### Pitfall 6: Dry-run wrapper가 bootstrap을 수행
**What goes wrong:** 현재 install wrapper는 apply 여부와 무관하게 `npm ci`, build, 기본 `npm link`를 실행하고 update wrapper는 `git pull`, `npm ci`, build, `npm link`를 실행한다. [VERIFIED: scripts/install.sh:35-44; scripts/install.ps1:20-29; scripts/update.sh:21-30; scripts/update.ps1:10-25]
**How to avoid:** dry-run은 existing verified CLI artifact로 read-only plan만 실행하고, artifact가 없으면 변경 없이 정확한 prerequisite를 출력한다.

## Code Examples

### Exclusive writer acquisition (권고 skeleton)

```typescript
// Source basis: Node.js 24 fsPromises.open/FileHandle.sync docs.
// Proposed field names and error codes are [ASSUMED] until implemented and locked.
const handle = await open(lockPath, "wx", 0o600);
try {
  await handle.writeFile(`${JSON.stringify(lockRecord)}\n`, "utf8");
  await handle.sync();
} finally {
  await handle.close();
}
```

### Strict validation configuration (권고 skeleton)

```typescript
// Source basis: Ajv official strict/options/JSON Schema docs.
const validator = new Ajv2020({
  strict: true,
  allErrors: true,
  coerceTypes: false,
  useDefaults: false,
  removeAdditional: false,
});
```

### Shell-free process launch (권고 skeleton)

```typescript
// Source basis: Node.js 24 child_process.spawn docs.
const child = spawn(spec.executable, spec.args, {
  cwd: spec.cwd,
  env: buildAllowedEnvironment(spec.envNames, sourceEnvironment),
  shell: false,
  stdio: [spec.stdin, "pipe", "pipe"],
  windowsHide: true,
  signal: abortController.signal,
});
```

## Implementation Sequencing for the Planner

1. **Wave 0 — safety characterization:** add test helpers for tree digest, outside sentinel, junction/symlink creation capability, subprocess chunking, deterministic crash stages. Record unsupported platform cases explicitly; never silently skip a claimed guarantee.
2. **Wave 1 — pure boundaries:** implement central redaction/path aliases and strict parser/schema/domain/version router; close schemas and add strict journal/lock/evidence/receipt contracts without implementing later workflows.
3. **Wave 2 — OS boundary:** implement `PathProof`, Windows reparse probe, operation-scoped exclusive writer session, write-ahead durable journal and diagnosis-only repair plan.
4. **Wave 3 — process boundary:** replace resolver/version/capture/interactive/direct MCP spawn paths with one adapter and explicit per-operation env allowlists, deadlines, output limits, fingerprints and redacted excerpts.
5. **Wave 4 — integration:** move every existing apply/removal under one `MutationSession`, preflight the full install before external packages, centralize CLI serialization, and make four bootstrap/update wrappers truly non-mutating without apply.
6. **Wave 5 — adversarial verification:** three-OS link/junction outside-sentinel, competing writers, crash after every durable boundary, malformed/duplicate/newer schema fixtures, secret corpus across every output surface, process timeout/output/env tests, wrapper tree-digest tests.

Phase 1의 `repair --apply`는 writer/journal 안전 경계를 해제하거나 exact-byte restoration하는 최소 기능만 계획한다. package-manager compensation, full uninstall, general lifecycle recovery는 Phase 6에 남긴다. [VERIFIED: .planning/ROADMAP.md Phase 6 boundary]

## State of the Art

| Old Approach (current repo) | Current Phase-1 Approach | Impact |
|-----------------------------|--------------------------|--------|
| `resolve`/`relative` lexical containment | configured + canonical component proof + recheck | SAFE-02 link/parent defense |
| mutation then `journal.files.push` | durable write-ahead intent then mutation | interruption diagnosis |
| independent transactions | one operation-scoped writer session | external and managed mutations serialize |
| raw `stdout`/`stderr` strings | streaming fingerprint + bounded redacted excerpt | SAFE-04/06 |
| `ComSpec` fallback for `.cmd` | known shim normalization or refusal | shell-free execution |
| casts/minimal object checks | strict parser + Ajv + domain validation | deterministic refusal |
| CLI-only home redaction | recursive centralized redaction and aliases | all observable surfaces |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Node path-based recheck plus identity proof can meet accepted race-resistance on supported local filesystems | Path Proof | hostile TOCTOU could require a native handle-relative helper or unsupported verdict |
| A2 | proposed 50 validation issues, 4 KiB head + 4 KiB tail per stream are useful bounds | Validation/Process | diagnostics may be too sparse or memory policy too loose |
| A3 | proposed typed placeholder vocabulary is complete enough | Redaction | inconsistent output or missed secret family |
| A4 | parent-directory sync is supportable with the required durability semantics on each OS/filesystem | Transaction | Windows/filesystem-specific refusal or adapter required |
| A5 | `smol-toml@1.8.0` is acceptable after human review despite seam SUS verdict | Standard Stack | dependency must be replaced or TOML mutation kept unsupported |

## Open Questions

1. **Can Node-only pathname APIs close the tested parent-swap race on all claimed filesystems?**
   - What we know: `realpath` resolves links and Windows exposes reparse/final-path concepts. [CITED: Node/Microsoft docs above]
   - What's unclear: Node does not provide a verified cross-platform handle-relative rename contract in the researched API surface. [ASSUMED]
   - Recommendation: make a Wave 0 adversarial swap test a hard planning gate; if it fails, implement a narrow platform helper or mark that filesystem mutation unsupported rather than weaken D-01.

2. **Which TOML parser is approved?**
   - What we know: `smol-toml` is widely downloaded and official docs claim TOML 1.1 support, but the legitimacy seam returned SUS because the selected release is new.
   - Recommendation: planner inserts `checkpoint:human-verify`; no custom regex fallback.

3. **What durability level can be proven per filesystem?**
   - What we know: Node exposes file sync; directory-sync behavior must be probed across CI/fixture filesystems. [CITED: Node fs docs]
   - Recommendation: document support as a capability result and fail closed where operation ordering cannot be proven.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Node.js | build/tests/runtime | ✓ | 24.13.1 | — |
| npm | exact dependency install | ✓ | 11.8.0 | — |
| Git | repository/wrapper tests | ✓ | 2.55.0.windows.3 | — |
| PowerShell 7 | Windows wrapper tests | ✓ | installed | Windows PowerShell also installed |
| POSIX `sh` | shell wrapper syntax/behavior | ✓ | Git for Windows | CI Ubuntu/macOS |
| `fsutil.exe` | optional Windows reparse probe | ✓ | Windows system binary | if query cannot prove result, fail closed |

Current `fsutil fsinfo volumeinfo` probe returned access denied while `reparsepoint query` returned the documented non-reparse error for the repository root; therefore do not depend on volume-info privileges. [VERIFIED: 2026-09-03 local probe]

**Missing dependencies with no fallback:** none for research/build. `smol-toml` approval is a planning checkpoint, not an environment absence.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Node.js 24 built-in `node:test` + `node:assert/strict` |
| Config file | `package.json`, `tsconfig.json`; no separate runner config |
| Quick run command | `npm run build && node --test dist/test/<focused>.test.js` |
| Full suite command | `npm test` |

Existing tests use real temp directories and behavior assertions; current transaction tests cover byte restoration, lexical outside-root refusal, post-transaction drift refusal, and removal restoration, but not symlinked parents, concurrent writers, interruption, or permission failures. [VERIFIED: test/transaction.test.ts:8-82; .planning/codebase/TESTING.md]

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SAFE-01 | every CLI/wrapper dry-run leaves checkout/package/config/state/harness tree digest unchanged | cross-platform integration | `npm run build && node --test dist/test/preview.test.js` | ❌ Wave 0 |
| SAFE-02 | symlink/junction/unknown reparse/parent swap cannot touch outside sentinel | filesystem integration | `npm run build && node --test dist/test/path-boundary.test.js` | ❌ Wave 0 |
| SAFE-03 | competing writer fails fast; crash stages remain diagnosable; repair is explicit | subprocess + filesystem integration | `npm run build && node --test dist/test/transaction-crash.test.js` | ❌ Wave 0; extend `transaction.test.ts` |
| SAFE-04 | secret corpus absent from human/JSON/journal/process/support outputs | unit + CLI integration | `npm run build && node --test dist/test/redaction.test.js` | ❌ Wave 0 |
| SAFE-05 | malformed/duplicate/unknown field/newer version/inert extension behavior | table-driven unit | `npm run build && node --test dist/test/validation.test.js` | ❌ Wave 0; extend `catalog.test.ts` |
| SAFE-06 | no shell, env sentinel absent, cap/timeout/kill metadata deterministic | subprocess integration | `npm run build && node --test dist/test/process.test.js` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `npm run check` plus focused compiled test file
- **Per wave merge:** `npm test`
- **Phase gate:** Windows/macOS/Linux CI full suite green, outside sentinels unchanged, no unsupported case counted as pass

### Wave 0 Gaps

- [ ] `test/preview.test.ts` — byte-for-byte dry-run matrix including four wrappers
- [ ] `test/path-boundary.test.ts` — symlink/junction/reparse/alias/parent-swap controls
- [ ] `test/transaction-crash.test.ts` — writer contention and deterministic interruption stages
- [ ] `test/redaction.test.ts` — exact/URL/PEM/JWT/API-key/chunk/path corpus across surfaces
- [ ] `test/validation.test.ts` — each document type, duplicate keys, extensions, old/new versions, error bounds/order
- [ ] `test/process.test.ts` — argv injection, `.cmd` refusal/normalization, timeout, byte cap, env case collisions
- [ ] CI wrapper behavior execution; current CI only syntax-checks shell families. [VERIFIED: .github/workflows/ci.yml:29-37]

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | harness authentication remains external/pre-existing |
| V3 Session Management | no | no web/session state in Phase 1 |
| V4 Access Control | yes | allowed-root ownership, writer lock, explicit apply and repair |
| V5 Input Validation | yes | strict syntax + Ajv closed schema + domain invariants |
| V6 Cryptography | yes | Node `crypto` SHA-256 and random operation tokens; no custom crypto |
| V7 Error Handling/Logging | yes | bounded structured errors and centralized redaction |

ASVS is a web-application standard, so V2/V3 are non-applicable to this local CLI; V4/V5/V6/V7 controls are adapted to the actual local trust boundaries rather than claiming web compliance. [CITED: https://owasp.org/www-project-application-security-verification-standard/]

### Known Threat Patterns for Node.js CLI

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| symlink/junction path escape | Tampering/Elevation | canonical component proof, recheck, outside sentinel |
| concurrent writer/lost update | Tampering/Repudiation | exclusive operation lock, token-bound durable journal |
| command/argument injection | Tampering/Elevation | direct executable+argv, allowlisted command specs, no shell |
| ambient credential inheritance | Information Disclosure | operation-specific env-name allowlist, Windows key normalization |
| stdout/stderr secret disclosure | Information Disclosure | bounded capture, pre-persistence redaction, fingerprint only |
| malformed/ambiguous configuration | Tampering/DoS | strict parser, duplicate rejection, closed schema, bounded errors |

OWASP recommends early syntactic and semantic input validation, parameterized OS execution, command/argument allowlists, and excluding tokens/passwords/keys from logs. [CITED: https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html; CITED: https://cheatsheetseries.owasp.org/cheatsheets/OS_Command_Injection_Defense_Cheat_Sheet.html; CITED: https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html]

## Sources

### Primary / repository (HIGH confidence)

- `.planning/phases/01-safe-operation-boundary/01-CONTEXT.md` — D-01..D-15 and phase boundary
- `.planning/REQUIREMENTS.md` — SAFE-01..SAFE-06
- `.planning/ROADMAP.md` — Phase 1 success criteria and later-phase exclusions
- `src/core/transaction.ts`, `src/core/process.ts`, `src/core/catalog.ts`, `src/core/isolation.ts`, `src/core/install.ts`, `src/core/mcp.ts`, `src/cli.ts` — actual gaps/call seams
- `scripts/install.*`, `scripts/update.*`, `test/transaction.test.ts`, `.github/workflows/ci.yml` — preview/test gaps

### Official documentation (MEDIUM confidence per research seam)

- https://nodejs.org/docs/latest-v24.x/api/fs.html — realpath, lstat, open, FileHandle.sync
- https://nodejs.org/docs/latest-v24.x/api/child_process.html — spawn, env, shell, timeout, Windows scripts
- https://ajv.js.org/json-schema.html and https://ajv.js.org/options.html — 2020-12/strict/errors/options
- https://github.com/microsoft/node-jsonc-parser — syntax errors and visitor API
- https://github.com/eemeli/yaml — parseDocument, uniqueKeys, alias limits
- https://learn.microsoft.com/en-us/windows/win32/fileio/reparse-points — reparse model
- https://learn.microsoft.com/en-us/windows/win32/fileio/hard-links-and-junctions — junction semantics
- OWASP ASVS and Input Validation/OS Command Injection/Logging cheat sheets — security controls

### Tertiary / needs confirmation

- `smol-toml@1.8.0` selection — official repository reviewed, but legitimacy seam SUS due recent release; human checkpoint required.

## Metadata

**Confidence breakdown:**
- Standard stack: MEDIUM — exact registry versions and official docs checked; TOML choice remains gated.
- Architecture: HIGH for repository gaps and locked sequencing; MEDIUM for cross-filesystem durability/TOCTOU feasibility pending adversarial probes.
- Pitfalls: HIGH — most are directly visible in current source; platform edge semantics cite Node/Microsoft.
- Validation: HIGH — existing runner/CI patterns read directly; new files are explicit Wave 0 gaps.

**Research date:** 2026-09-03
**Valid until:** 2026-10-03 for stable architecture; re-check package versions and Windows/Node behavior immediately before implementation.
