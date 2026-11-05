# Phase 27: Shared Project Behavior Policy - Context

**Gathered:** 2026-11-02
**Status:** Ready for planning
**Discussion mode:** `27 --auto` — 사용자가 engineering user proxy에 권장 선택을 위임했다. 아래 결정은 자동 선택한 권장안이며 개별 질문에 대한 직접 사용자 답변을 의미하지 않는다.

<domain>
## Phase Boundary

MODE-01–MODE-05를 충족하는 프로젝트 공통 strict/flexible 정책을 제공한다. Claude Code, Codex, Antigravity, Pi Agent, Hermes Agent가 GSD 초기화 전에도 같은 프로젝트 정책을 조회·변경하고, 다음 task intake에서 최신 값을 읽을 수 있어야 한다. 정책 파일·실제 프로젝트 루트·최소 자연어 라우팅·조회 근거·검토 가능한 적용과 rollback이 이번 범위다.

이미 확정된 원칙: 정책 부재는 쓰기 없는 strict 기본값이다. 프로젝트에 저장하는 동작 선호는 strict/flexible뿐이며 선택한 execution style은 프로젝트 기본값이 될 수 없다. flexible도 autopilot 승인, 별도 start, isolated runner, model/effort 정책, GSD 단일 lifecycle/state 소유권을 바꾸지 않는다.

이번 산출물은 논의 문서다. 구현과 detailed plan을 시작하지 않으며 CONTEXT와 논의 기록을 커밋한 직후 종료한다. `--auto`의 기본 plan-phase 연결과 커밋 이후 STATE 변경은 사용자의 명시적 종료 지시로 수행하지 않는다.

</domain>

<decisions>
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

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 승인된 범위

- `.planning/PROJECT.md` — v0.6.0 목표, project mode만 지속한다는 수정된 결정, 안전 경계.
- `.planning/REQUIREMENTS.md` — MODE-01–MODE-05와 나머지 milestone 범위 구분.
- `.planning/ROADMAP.md` — Phase 27 목표·성공 기준·minimal native routing과 validation emphasis.

### 기존 root·validation·transaction

- `src/core/evidence.ts` — `resolveCanonicalRoot`, 기존 declaration와 Git 경계 규칙.
- `src/core/path-boundary.ts` — canonical path proof와 mutation 직전 재검증.
- `src/core/transaction.ts` — snapshot, atomic write, journal, drift-safe rollback.
- `src/core/validation.ts` — managed document 검증/진단 패턴.
- `src/core/project.ts` — `.alpha-aos/stack.yaml` 검증 책임; behavior 정책과 결합하지 않을 기준.
- `src/core/tree-policy.ts` — tree-off와 Git/worktree 경계; 별도 mode 권위로 사용하지 않는다.
- `src/cli.ts` — project 하위 명령, dry-run/apply, JSON 출력, rollback 연결.

### 다섯 harness의 공통 진입점

- `skills/alpha-aos-task/SKILL.md` — 자연어 요청 분기와 기존 승인/start 경계.
- `src/core/owned-skills.ts` — target별 렌더링·동기화와 integrity 검증.
- `catalog/stack.yaml` — owned skill의 다섯 target 선언.
- `catalog/stack.lock.json` — owned skill source/target SHA-256.
- `test/evidence.test.ts`, `test/path-boundary.test.ts`, `test/transaction.test.ts`, `test/owned-skills.test.ts`, `test/project.test.ts` — 재사용 가능한 root·경계·복구·skill 검증 사례.

외부 spec은 없다. 현재 승인 범위와 위 repository source가 기준이며 codebase map은 오래된 참고 자료이므로 현행 source를 우선한다. 과거 Phase 24–26의 approval/model/runtime 경계는 유지하되 이번 role/model 선택은 approved bounded runtime packet을 따른다.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- `resolveCanonicalRoot`는 명시적 root, 중첩 선언, Git/worktree 경계와 standalone 경로를 이미 구분한다. pack 설치 없이 호출할 수 있는 공통 root 기준이다.
- `provePathBoundary`/`recheckPathProof`와 `applyFileTransaction`/`rollbackManagedTransaction`은 안전한 설정 변경의 기존 기반이다. concurrent compare/apply 보장이 현재 구현만으로 충분한지는 후속 연구에서 확인한다.
- `inspectProjectManifest`는 pack/isolation manifest의 독립 검증 경로다. behavior 설정은 해당 manifest의 유무·trust·유효성에 종속되지 않는다.
- `renderOwnedSkill`, `planOwnedSkillOperation`, `applyOwnedSkillSync`와 catalog의 다섯 target 선언을 통해 공통 라우팅을 배포할 수 있다.

### Established Patterns

- 기본 dry-run, digest 검토 후 apply, allowed roots, snapshot과 drift-safe rollback.
- schema 오류를 typed diagnostic으로 노출하고 CLI 경계에서 사용자에게 설명한다.
- GSD가 lifecycle/state를 소유하며 alpha-AOS의 mode 설정은 GSD 초기화나 acceptance를 흉내 내지 않는다.

### Integration Points

- `src/cli.ts`의 project 분기에 mode 조회/설정 명령을 연결한다.
- `skills/alpha-aos-task/SKILL.md`의 일반 task 경로 앞에서 명시적 policy-only 요청과 최신 mode 조회를 연결한다. chooser 전체를 이번 phase로 끌어오지 않는다.
- 새 정책 스키마와 검증은 기존 validation 구조를 따르며, owned-skill 변경 시 lock integrity와 관련 fixture를 함께 갱신한다.

</code_context>

<specifics>
## Specific Ideas and Acceptance Examples

| 요구사항 | 후속 구현에서 증명할 관찰 결과 |
|------------|--------------------------------|
| MODE-01 | 미초기화·정책 없는 디렉터리 조회가 strict를 반환하고 project/state 양쪽에 새 파일을 남기지 않는다. |
| MODE-02 | harness A의 “유연 모드로 바꿔줘”가 공통 CLI를 통해 적용되고 harness B가 같은 root에서 flexible을 읽는다. policy-only 요청은 GSD 초기화·style 선택을 묻지 않는다. |
| MODE-03 | 출력에 root/reason/source/revision이 있고 기존 session도 다음 intake에서 다른 harness의 변경을 읽는다. |
| MODE-04 | missing에서 최초 생성, 명시적 strict 저장, 동일 값 no-op, concurrent/stale 거부, byte-preserving rollback을 증명한다. unrelated 파일은 그대로다. |
| MODE-05 | malformed/unreadable/미지원 정책, 중첩 프로젝트, 잘못된 root와 경로 탈출을 진단하며 flexible·부모 정책으로 fallback하지 않는다. |

CLI 및 paid-call-free fixture 증명과 실제 host 호출 증명을 구분한다. Phase 27에서 다섯 harness의 최소 연결을 구현·검증하고 Phase 31의 최종 release proof까지 미룬다는 이유로 MODE-02를 생략하지 않는다. 현재 discuss 문서는 어떤 구현이나 실제 host 검증도 완료로 표시하지 않는다.

</specifics>

<deferred>
## Deferred Ideas

- Phase 28: six-style chooser, 명시적 style 처리, task별 선택 연속성, 단순 작업 면제의 공통 판정과 이유 출력.
- Phase 29: GSD runtime/project readiness, partial 초기화 복구와 원래 요청 재개.
- Phase 30: 각 execution style의 실제 conversational/autopilot 실행 연결.
- Phase 31: 최종 cross-host regression과 release proof. Phase 27의 최소 mode routing·검증은 여기에 이관하지 않는다.
- global/session mode override, parent cascade, 정책에 style 저장, 자동 schema migration은 추가하지 않는다.

관련 pending todo는 없었다. 이번 논의에서 새 milestone 범위는 추가하지 않았다.

</deferred>

---

*Phase: 27-shared-project-behavior-policy*
*Context gathered: 2026-11-02*
