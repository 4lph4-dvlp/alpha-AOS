# Phase 27: Shared Project Behavior Policy - Discussion Log

> 감사 기록 전용. 연구·계획·실행 입력은 27-CONTEXT.md를 사용한다.

**Date:** 2026-11-02
**Mode:** 27 --auto; 사용자가 engineering user proxy로 모든 권장 선택을 위임했다.
**Scope:** MODE-01–MODE-05. 문서 커밋 직후 종료하며 plan-phase와 STATE 변경은 수행하지 않는다.
**Base commit:** e44ffbd19bd5d6ec3ed0f97f255df070c7f0e93c
**Run:** 2f3e81310887902c-295c40c4; step: discuss

## 공통 정책 파일과 저장 범위

| 질문 | 검토한 선택지 | 자동 선택한 권장안 |
|------|---------------|--------------------|
| 정책의 단일 권위는 어디에 둘 것인가? | .alpha-aos/behavior.json (recommended); .alpha-aos/stack.yaml 확장; harness별 설정 또는 .planning/config.json | .alpha-aos/behavior.json |
| v1 문서에 무엇을 저장할 것인가? | 최소 버전 스키마 (recommended); style 기본값 포함; 임의 설정을 검증 없이 허용 | schemaVersion: 1과 mode: strict\|flexible만 허용; style과 미지원 필드는 진단 |
| 정책가 없거나 explicit strict를 요청하면 어떻게 처리할 것인가? | 읽기 기본값과 명시적 저장 구분 (recommended); 기본값 자동 저장; strict 요청도 항상 무쓰기 | 읽기만 할 때 strict/무쓰기; 명시적 set strict는 정책 생성; 기존 동일 값은 no-op |
| 정책이 pack 신뢰나 실행 권한을 부여하는가? | 동작 선호와 권한 분리 (recommended); flexible을 포괄 승인으로 해석 | 아니오; mode만 공유하며 GSD, tree-off, 계약 승인과 model 정책 유지 |

**선택 근거:** 단일 project authority, 기존 canonical-root/transaction 재사용, pre-GSD 지원과 권한 경계 보존을 우선했다. 직접 사용자 응답이 아니라 명시적으로 위임받은 proxy의 선택이다.

## 실제 프로젝트 루트와 경계

| 질문 | 검토한 선택지 | 자동 선택한 권장안 |
|------|---------------|--------------------|
| 루트 판별은 어떤 기준을 재사용할 것인가? | 기존 canonical root 규칙 (recommended); 항상 repository 최상위; harness별 cwd 규칙 | resolveCanonicalRoot: 명시적 대상, 가장 가까운 프로젝트 선언 또는 Git 경계, standalone directory |
| 중첩 프로젝트와 worktree에서 부모 정책을 상속할 것인가? | 프로젝트별 단일 파일 (recommended); 부모 정책 cascade; worktree 간 global 공유 | 선택된 canonical root의 정책만 읽고 부모/형제/global 정책을 상속하지 않음 |
| GSD와 Git이 없는 디렉터리는 어떻게 지원할 것인가? | 독립 policy-only 지원 (recommended); GSD부터 초기화; Git 필수 | 명시적 경로 또는 standalone cwd로 읽기/설정 가능; GSD/pack 초기화 없음 |
| 잘못된 대상이나 경로 alias는 어떻게 처리할 것인가? | 경계 증명과 명시적 진단 (recommended); 가까운 다른 root로 자동 fallback | canonical root와 판별 이유 노출; 승인된 workspace와 불일치 또는 탈출은 거부; 유효한 alias는 같은 identity |

**선택 근거:** 단일 project authority, 기존 canonical-root/transaction 재사용, pre-GSD 지원과 권한 경계 보존을 우선했다. 직접 사용자 응답이 아니라 명시적으로 위임받은 proxy의 선택이다.

## CLI와 자연어 모드 변경

| 질문 | 검토한 선택지 | 자동 선택한 권장안 |
|------|---------------|--------------------|
| 공통 명령 표면은 무엇인가? | project mode 명령군 (recommended); task contract에 mode 저장; harness 전용 명령 | project mode [path] 조회와 project mode set strict\|flexible [path] 변경; --json 및 dry-run/--apply |
| 자연어 변경은 어떻게 실행할 것인가? | 공통 CLI 라우팅 (recommended); agent가 JSON을 직접 수정; 수동 터미널 명령만 제공 | owned alpha-aos-task가 명시적 프로젝트 mode 요청을 공통 CLI preview와 digest-bound apply로 연결 |
| policy-only 요청에 task style이나 GSD 초기화를 물을 것인가? | 설정 요청의 최소 경로 (recommended); 항상 chooser와 new-project 실행 | 묻지 않음; mode 변경 자체만 수행하고 실제 substantial task는 후속 phase 규칙에 맡김 |
| 다섯 harness 지원은 언제 연결할 것인가? | 현재 phase에서 최소 연결 (recommended); Phase 31까지 routing 보류 | Phase 27에서 공통 owned-skill 경로와 source/target integrity를 갱신; real-host 미검증은 명시 |

**선택 근거:** 단일 project authority, 기존 canonical-root/transaction 재사용, pre-GSD 지원과 권한 경계 보존을 우선했다. 직접 사용자 응답이 아니라 명시적으로 위임받은 proxy의 선택이다.

## 조회·최신성·실패 진단

| 질문 | 검토한 선택지 | 자동 선택한 권장안 |
|------|---------------|--------------------|
| 사용자에게 무엇을 조회 가능하게 할 것인가? | 동일한 text/JSON 근거 (recommended); mode만 출력; harness session 값만 출력 | canonical root, root reason, effective mode, source/path, 존재 여부와 byte-hash revision |
| 다른 session의 변경을 언제 반영할 것인가? | intake마다 재조회 (recommended); session 시작 시 캐시; 활성 task 즉시 재시작 | 모든 다음 task intake에 정책 재조회; 활성 실행 중 자동 workflow 전환이나 동의 변경 없음 |
| revision은 무엇으로 표현할 것인가? | content hash와 missing 구분 (recommended); mtime만 사용; 별도 project revision counter | 파일 원문 bytes SHA-256; 부재는 별도 missing sentinel; timestamp나 저장 counter 불필요 |
| invalid 또는 unreadable 정책은 어떻게 처리할 것인가? | 명시적 fail-closed 진단 (recommended); strict로 조용히 fallback; flexible 또는 다른 root로 fallback | 해당 intake/변경을 막고 root/path/원인/복구 경로 진단; missing만 strict 기본값 허용 |

**선택 근거:** 단일 project authority, 기존 canonical-root/transaction 재사용, pre-GSD 지원과 권한 경계 보존을 우선했다. 직접 사용자 응답이 아니라 명시적으로 위임받은 proxy의 선택이다.

## 검토·적용·동시 변경·복구

| 질문 | 검토한 선택지 | 자동 선택한 권장안 |
|------|---------------|--------------------|
| 검토와 적용은 무엇에 묶을 것인가? | reviewed digest를 apply에서 재검증 (recommended); mode 값만 확인; 마지막 writer가 무조건 덮어쓰기 | root identity, 대상 경로, 이전 revision 또는 missing, 요청 mode와 변경 내용의 plan digest |
| 실제 쓰기의 안전 경계는 무엇인가? | 기존 transaction 재사용 (recommended); 직접 writeFile; stack/GSD 설정도 함께 초기화 | 기존 path proof와 snapshotted transaction 재사용; policy 파일만 atomic 변경; 다른 project/GSD/harness 설정 보존 |
| 동시 변경 또는 검토 후 경로 변경은 어떻게 처리할 것인가? | stale 입력 거부 (recommended); 자동 merge; 후속 변경 덮어쓰기 | missing-to-created 포함 stale review와 경로 drift를 거부하고 새 preview 요청; 자동 덮어쓰기 없음 |
| rollback과 동일 값 설정은 어떻게 처리할 것인가? | drift-safe rollback과 no-op (recommended); 매번 재작성; rollback 시 디렉터리 전체 삭제 | 기존 rollback 명령으로 이전 bytes/부재 복원; 후속 변경 시 drift 거부; 동일 현재 mode는 journal 없는 no-op |

**선택 근거:** 단일 project authority, 기존 canonical-root/transaction 재사용, pre-GSD 지원과 권한 경계 보존을 우선했다. 직접 사용자 응답이 아니라 명시적으로 위임받은 proxy의 선택이다.

## 기존 결정과 사전 점검

- 설치된 GSD runtime identity: @opengsd/gsd-core 1.18.0. discuss_mode=discuss, commit_docs=true, response_language=ko.
- Phase 27 directory/context/spec/plan/checkpoint가 없었다. 저장소는 시작 시 clean이며 packet의 currentSha와 일치했다. 보존할 dirty WIP나 재개할 부분 논의가 없었다.
- Phase 24–26 CONTEXT에서 exact approval, model/effort, isolated runtime, GSD 단일 소유권과 검증된 지원만 주장한다는 원칙을 계승했다. 현재 실행의 role/model은 approved packet이 우선한다.
- pending todo match: 0. advisor profile 없음. discuss:pre hook 없음. project-local spike/sketch findings 없음.
- 기존 codebase map은 2026-09-02 자료이므로 핵심 root/manifest/owned-skill 연결은 현재 source로 확인했다. 외부 API 통합이나 dependency 변경은 이번 논의 범위가 아니다.
- Unified Memory recall 시도: ecc memory search가 node spawnSync EPERM으로 실패했다. 결과를 빈 검색으로 해석하지 않았다. 이번 승인 범위 밖 vault 쓰기는 하지 않고 canonical GSD 문서에 결정을 보존했다.
- 이 문서는 결정을 기록한다. 구현, 실제 다섯 host 동작, rollback 성공 또는 테스트 통과를 주장하지 않는다.

## Agent 재량

내부 모듈 이름, 오류 code 이름, output formatting, bounded fixture 배치는 후속 연구·계획에서 정한다. 프로젝트 mode를 execution style/approval로 확장하는 재량은 없다.

## Deferred Ideas

- Phase 28 intake chooser/exemptions; Phase 29 initialization recovery; Phase 30 execution-style binding; Phase 31 final cross-host release proof

## Commit checkpoint — blocked

- CONTEXT.md와 이 논의 기록은 작성되었으나 커밋되지 않았다.
- git add가 .git/index.lock 생성 시 Permission denied로 실패했다. 기존 index.lock은 없었다.
- GSD query commit도 committed=false, reason=staging_failed를 반환했다. HEAD 성공 변경을 주장하지 않는다.
- 권한 우회, lock 삭제, 재시도 루프 또는 plan-phase 진입을 하지 않았다. STATE와 ROADMAP도 변경하지 않았다.
- 두 문서에 대한 git diff --no-index --check에서 whitespace 오류 출력은 없었다. 코드 변경과 구현 테스트는 수행하지 않았다.
- 재개점: Git index 쓰기가 허용되는 실행 환경에서 이 두 문서만 검토·stage하고 GSD query commit "docs(27): capture phase context" --files <27-CONTEXT.md> <27-DISCUSSION-LOG.md>로 커밋한 뒤 종료한다. 논의를 다시 수행하거나 후속 phase를 시작하지 않는다.
