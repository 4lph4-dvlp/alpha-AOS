---
phase: 31-cross-harness-proof-and-distribution
status: prepared-not-approved
source_head: ce38cb5fbab9cb134012d0c7bf7a7ba93bd71047
approval_recorded: false
scope: GitHub-only v0.6.0 release checkpoint proposals
---

# v0.6.0 최종 사용자 판단안

이 문서는 **승인 전 검토안**이다. BOOT-04 수정·독립 검증, 수정본의 최종 테스트·산출물·실제 CI가 준비된 뒤 root 담당자가 한 번에 제시한다. 아래 의미 승인이나 범위 변경은 결손 구현, 미실행 테스트, 없는 native 증거를 통과로 바꾸지 않는다. 현재 canonical VERIFICATION과 lifecycle 상태는 변경하지 않는다.

기준: 루트 소스 `ce38cb5`는 이미 통과한 `0261dfd`와 제품 소스가 같다. 기존 회귀는 2162개 중 2148 통과·실패 0·명시적 호스트 권한 skip 14개다. 이 문서를 작성하며 테스트·빌드·유료 호출을 새로 실행하지 않았다. 별도 BOOT-04 수정 worktree의 완료나 현재 CI 성공은 아직 이 문서의 주장에 포함되지 않는다.

## 1. 의미·사용자 안내 승인안 — 미해결 6건

승인 범위는 각 행의 구체적인 안내·동의 의미다. 증거는 기존 테스트가 다룬 경계이며, 모든 host의 실제 자연어 소비를 증명하지 않는다. BOOT-04와 관련된 행은 수정 후 소스·증거에 다시 묶어야 한다.

| 안정 ID | 정확한 계획 문구 / 출처 | 현재 확인된 동작 | 제안하는 승인 의미 |
|---|---|---|---|
| J27-1 | “MUST NOT treat flexible preference as execution consent, a style default, or permission to alter an active task.” — [27-05-PLAN.md](../27-shared-project-behavior-policy/27-05-PLAN.md):31 | `project-mode-routing.test.ts:143`, `task-style-routing.test.ts:342`: 정책 우선 처리·현재 task/contract 유지. | “flexible은 프로젝트의 접수 방식만 바꾼다. 실행 동의·스타일 기본값·진행 중 계약 변경 권한이 아니다”라는 의미를 승인. native 미확인 범위는 M27에 남긴다. |
| J28-1 | “A task style selection must not become implicit consent to run or expand another task.” — [28-06-PLAN.md](../28-predictable-strict-and-flexible-intake/28-06-PLAN.md):27–30 | `task-intake-acceptance.test.ts:13,172`, `task-intake-routing.test.ts:255`: 독립 작업은 새 선택, 선택 자체는 실행 권한 없음. | 선택은 현재 작업에만 유효하며 다른 작업·범위 확장의 실행 동의로 재사용하지 않는다는 의미를 승인. 실제 효과는 기존 권한·계약 절차를 계속 따른다. |
| J28-2 | “The system must not hide available styles or persist a task choice as a project default.” — [28-06-PLAN.md](../28-predictable-strict-and-flexible-intake/28-06-PLAN.md):31–34 | Journey A/B/D 및 `task-intake-routing.test.ts:66`: strict의 독립 substantial task는 6개 선택, UI 제한 시 전체 번호 목록, 완료·취소 뒤 기본값 없음. 명시적 partial-autopilot 질문은 이미 선택한 실행면에 맞는 3개 깊이만 묻는다. | 이 조건부 선택기와 작업별 선택 수명을 승인. **한글 라벨·이중언어 표현은 기존 P3 승인으로 확정**되어 재질문하지 않는다. 숨김/기본값 의미만 이번 행의 대상이다. |
| J29-1 | “P29-1: Transfer records must not become a second GSD lifecycle or project execution-style default.” — [29-04-PLAN.md](../29-gsd-initialization-and-request-continuity/29-04-PLAN.md):23 | transfer는 외부 상태에 요청·style·정확한 native 연결을 전달하는 보조 기록이다. GSD만 task/phase 완료를 소유한다. 현재 BOOT-04 claim/재시도/연결 결손은 별도 수정 중이다. | **수정·재검증 후**, transfer의 전달/수령 상태는 구현 작업 완료나 새 프로젝트 기본 스타일을 뜻하지 않는다는 의미를 승인. 현재 결손을 수용하는 승인이 아니다. |
| J29-2 | “P29-2: Known-fact reuse must not silently broaden a bounded change into a new product or imply native decision approval.” — [29-02-PLAN.md](../29-gsd-initialization-and-request-continuity/29-02-PLAN.md):23 | `task-bootstrap-handoff.test.ts:331`: 기존 사실·충돌을 native 대화 입력으로 전달하고 `--auto`나 답변 승인을 합성하지 않음. | 기존 요청·알려진 사실을 재사용하되 제품 범위 확대, 빠진 결정의 대리 승인, 필수 GSD 질문 생략을 허용하지 않는다는 의미를 승인. |
| J30-1 | “Style selection or completed bootstrap must not be presented as exact autopilot approval or separate start.” — [30-06-PLAN.md](../30-six-execution-styles-and-quality-binding/30-06-PLAN.md):23–25; [30-08-PLAN.md](../30-six-execution-styles-and-quality-binding/30-08-PLAN.md):86 | `task-style-routing.test.ts:136`: approval 실패/approval-only는 start 불가. `task-bootstrap-resume.test.ts:515`: autopilot 최초·같은 nonce pre-link·linked 재진입 모두 실행 권한 없음. | “style 선택/초기화 완료 → 구체적 계약 미리보기 → 정확한 digest 승인 → 별도 시작 지시”를 구분하는 안내를 승인. 역할·모델·허용 효과·격리 runner 조건은 그대로 유지. |

기존 승인으로 닫힌 항목: P27-2의 “MUST NOT report source or fixture proof as successful native five-host policy routing.”([27-05](../27-shared-project-behavior-policy/27-05-PLAN.md):34)는 [31-PROHIBITION-RESOLUTION.md](31-PROHIBITION-RESOLUTION.md)의 **P2 증거 등급 분리 승인**과 동일한 의미이므로 재승인 대상이 아니다. P2는 아래 M27의 더 강한 five-host native 조건을 면제하지 않았다.

## 2. M27 — 실제 five-host MODE-02 증거 범위 선택

계획의 명시 조건: “missing native evidence prevents MODE-02 acceptance”([27-05](../27-shared-project-behavior-policy/27-05-PLAN.md):29), “Fixtures do not satisfy this host receipt condition”(:114), “fixture success, claimed memory or plain CLI invocation cannot satisfy it”(:121). 원래 수용 조건은 현재 revision을 로드한 5개 host의 자연어→CLI 호출과 실제 host A→B handoff다. 이는 단순 구현 존재와 다른 **미충족 증거 조건**이다.

| 선택 | 구체적인 처리와 함의 |
|---|---|
| **M27-A — 이번 릴리스의 증거 수용 범위를 명시적으로 수정(제안)** | “v0.6.0의 MODE-02 수용 증거는 공유 CLI의 실제 정책 변경/재조회와 다섯 target의 배포·호출 fixture로 제한한다. 5개 host의 현재 revision 자연어 소비와 native A→B handoff는 미검증으로 남긴다. 문서·matrix는 이를 native 성공으로 표시하지 않는다.”라는 변경을 명시 승인한다. root는 승인된 문구를 해당 계획/수용 조건·보고서에 출처와 함께 반영하고 다시 검증한다. 원래 native 테스트가 통과했다는 처리가 아니다. |
| **M27-B — 원래 native 조건 유지** | MODE-02/해당 phase를 미완료로 유지하고 실제 loaded-revision 5-host 및 A→B 영수증을 확보한다. 허용된 무과금 native 경로가 없으면 대기한다. 유료 호출이 필요하다면 대상 host·모델·예산·scratch root·정확한 효과를 별도 구체화해 승인받는다. 이 선택만으로 비용·전역 설치·모델 대체가 허용되지는 않는다. |

현재 새 유료 증명은 승인되지 않았다. GitHub-only 공식 릴리스 요청 자체도 M27-A의 범위 변경이나 M27-B의 유료 실행 승인이 아니다.

### 유지할 실제 지원/증거 등급

[docs/task-entry-proof-index.json](../../../docs/task-entry-proof-index.json)의 55개 cell은 **archival native 7 / fixture 19 / unsupported 7 / unverified 21 / blocked 1**이다. 이 등급은 기존 P2 승인 사항이며 새 model turn 성공이 아니다.

| Host | 정책/입력 연결 | 보유 native 기록 및 제한 |
|---|---|---|
| Claude | 정책 변경·다음 읽기·chooser/bootstrap는 fixture | 6개 style 중 5개 unverified, autopilot-phase는 G-07-2 isolated-auth hold로 blocked. 새 유료 실행 없음. |
| Codex | 정책/선택은 fixture | bootstrap native 기록 1건의 보존 영수증. 6개 style 및 controller 실호출은 unverified. 이 bootstrap 영수증은 정책 handoff의 native 증거가 아니다. |
| Antigravity | 현재 matrix의 정책/선택/bootstrap는 fixture | Phase27 ledger의 옛 `proven` 서술은 이전 skill hash에 관한 기록이며 현재 revision의 5-host 영수증을 대체하지 않는다. 6개 style은 unverified. |
| Pi | 정책/선택/bootstrap는 fixture | 6개 style의 archival native 기록. 현재 정책 변경을 실제 다른 host가 소비했다는 새 증명은 아님. |
| Hermes | 정책/선택/bootstrap 데이터 흐름은 fixture | GSD controller 및 6개 style 실행면은 unsupported(worker-only). 이를 native controller 성공으로 표시하지 않는다. |

다섯 host의 native question UI는 unverified이고, 전체 번호 목록 fallback은 fixture로 검증됐다. Phase27 옛 ledger에서 Claude/Codex/Pi/Hermes는 unavailable이며, 실제 native A→B handoff는 없다.

## 3. Phase27의 spec-less 분류 가정 — 추가 기능 승인을 만들지 않음

명시 요구사항인 MODE-01/03/05 자체는 여전히 검증 대상이다. 반면 `unclassified`는 probe가 요구 문장에서 추가 edge category를 분류하지 못했다는 **연구 분류 상태**로, 어떤 추가 동작이 실패했다는 진술이 아니다. 해당 계획은 이를 `must_haves.truths`의 구체적인 `verification: backstop` 진술이나 prohibition으로 정의하지 않았다.

| 보존 ID | 정확한 근거 | 이번 검토 분류 / 처리 |
|---|---|---|
| A27-M01 | [27-01-PLAN.md](../27-shared-project-behavior-policy/27-01-PLAN.md):77 — “the deterministic probe found no category from requirement wording” | 정책 없음→strict·쓰기 없음이라는 명시 요구는 기존 CLI/정책 테스트의 검증 대상. 미명시 미래 edge를 만들어 추가 차단 요건으로 삼지 않는다. `reviewed; classification unresolved; no extra acceptance predicate specified`로 기록할 검토안. |
| A27-M03 | [27-05-PLAN.md](../27-shared-project-behavior-policy/27-05-PLAN.md):75 — “no general edge category was inferred” | root/source/revision·다음 intake 재읽기·진행 task 유지의 명시 사례는 검증됨. 이 분류 미정 자체에 새로운 기능·무제한 테스트 승인을 요구하지 않는다. 같은 reviewed/unresolved 상태를 보존. |
| A27-M05 | [27-01-PLAN.md](../27-shared-project-behavior-policy/27-01-PLAN.md):77 — “Explicit default/error cases are covered” | malformed/unreadable/wrong-root의 명시 오류 행렬과 host 권한 skip 제한은 유지. 정의되지 않은 오류 전체를 새 hard gate로 확대하지 않는다. 같은 reviewed/unresolved 상태를 보존. |
| A27-A2 | [27-RESEARCH.md](../27-shared-project-behavior-policy/27-RESEARCH.md):414 — “A permitted native path can consume a current fixture skill revision without paid calls/global install.” | 무과금 native 로딩 경로가 있을 것이라는 실행 가능성 가정. 그 가정은 미확정이고 결과인 missing-native 조건은 **M27 한 건**에서 처리한다. 별도 연구 가정 승인이나 중복 native gate를 추가하지 않는다. |

[27-05](../27-shared-project-behavior-policy/27-05-PLAN.md):121의 “Review … the three unclassified probe assumptions” 및 :145의 “resolution/review”는 **검토·보존 의무**다. 위와 같이 검토해 미정 분류를 남기면 그 검토를 수행한 것이며, 알 수 없는 범위를 통과/면제했다고 기록하지 않는다. 구체적 미충족 동작이 새로 발견되면 해당 요구사항에 증거를 붙여 처리한다. 따라서 이 4행은 이번 사용자 질문을 늘리는 별도 승인 항목이 아니다. 문서 예제 비교(:105)도 담당 검증자의 실제 CLI/문서 대조 항목이며 새로운 기능 승인이 아니다.

## 4. T30 — 두 native prohibition 검사 연결은 기술 항목

| 안정 ID / 계획 | 실제 runtime 검사 증거 | 추가로 요구됐지만 없는 검사 연결 |
|---|---|---|
| T30-FULL — [30-04-PLAN.md](../30-six-execution-styles-and-quality-binding/30-04-PLAN.md):23–25, “A full task must not be accepted as ordinary quick when full-stage evidence is missing.”(`verification: test`) | `task-gsd-full-run.test.ts:198,238,268`: ordinary-only/fake-full/missing-stage 수용 거부. `task-run.ts`의 full-quality precondition은 실제 연결됨. | 해당 prohibition을 GSD enforcement 생산자에 연결하는 descriptor, subject를 실제로 소비하는 음성 검사, known-bad RED/known-clean GREEN의 생산자 영수증. |
| T30-PHASE — [30-05-PLAN.md](../30-six-execution-styles-and-quality-binding/30-05-PLAN.md):23–25, “A phase run must not add unapproved phases or bypass a blocked phase.”(`verification: test`) | `task-phase-scope.test.ts:453` 및 lifecycle/multi-phase 테스트: 승인 밖 추가 거부·실패 phase 뒤 진행 중단. | 위와 같은 descriptor/subject 소비 검사/양·음 대조 생산자 영수증. |

계획의 추가 명령은 [30-07](../30-six-execution-styles-and-quality-binding/30-07-PLAN.md):69의 “A normal passing negative test … is insufficient”와 [30-08](../30-six-execution-styles-and-quality-binding/30-08-PLAN.md):86의 “retain gaps_found until that evidence exists”다. 따라서 이 추가 증명을 **“의미에 동의하니 테스트 통과”로 바꿀 수 없다**. 현재 verifier의 fail-closed 정책상 descriptor/증거가 없으면 flagged-unverified로 보존하며, 이는 원래 계획의 더 강한 증명을 완료했다는 뜻이 아니다.

빠진 것은 제품의 full/phase runtime gate 전체가 아니라 **추가 검사/검증 연결 구현**이다. 설치된 GSD `references/prohibition-probe.md:154–189`의 형식은 `check_kind: node-test`, 실제 `check_target`, `check_violation_fixture`, `check_clean_fixture`다. 소비 검사는 `GSD_PROHIB_SUBJECT`가 지정한 실제 subject를 평가해야 한다. 환경변수가 있다는 이유만으로 실패하거나, 단순히 “나쁜 결과를 거절하는 테스트가 통과했다”는 사실만으로는 RED 인과 증명이 아니다. 해당 문서 :141–146도 node-test convention에 live consumer가 없고 synthetic fixture만 있다는 제한을 명시한다.

**무과금으로 가능:** test-owned 임시 root에 잘못된 동작 subject(예: full 누락 수용 또는 승인 밖 phase 진행)와 정상 subject를 두고 같은 검사를 GSD의 기존 `check prohibition-enforcement` 생산자로 각각 실행한다. 위반 subject에서 검사 RED, 정상 subject에서 GREEN, 정상 제품 경로에서 비공허 pass를 기록한다. 새 LLM turn·전역 GSD 파일 수정·패키지 설치는 필요조건이 아니다. 다만 소비 검사와 연결·controls는 실제로 만들어 검증해야 하며, 이 문서는 그 작업을 실행하거나 영수증을 발행하지 않았다.

**담당자에게 제안:** 원래 계획을 유지한다면 T30 두 건은 기술 소유자가 구현·기계 증명한 뒤 최종 사용자 질문에서 제거한다. 이번 릴리스에서 그 추가 연결을 후속으로 옮기려면, root는 다음과 같은 **별도의 명시적 범위 변경안**을 제시해야 한다: “기존 full-quality/승인 phase runtime gate와 테스트는 유지한다. 두 prohibition의 추가 native descriptor/subject/control 증명은 미구현 후속 작업으로 남기며 green/native-enforced로 표시하지 않는다.” 이는 검사 연결 요구의 연기이며 테스트 통과 승인이나 J30-1의 의미 승인과 다르다. 미정의 범위의 포괄 면제는 제안하지 않는다.

## 5. 최종 제시 전 root 확인

- BOOT-04 네 결손은 승인 대상이 아니라 수정·독립 검증 대상. 이 문서의 의미 승인으로 닫지 않는다.
- 수정된 정확한 source/산출물/테스트 및 실제 CI 결과를 붙이고, root만 판단 결과·범위 변경·canonical 보고서·lifecycle을 갱신한다.
- 사용자에게 제시할 판단은 J27-1/J28-1/J28-2/J29-1/J29-2/J30-1의 구체적 의미와 M27 선택이다. T30은 먼저 기술적으로 해결하거나, 유지할 미구현 범위를 정확히 드러낸 별도 변경안으로 제시한다.
- 기존 P2/P3를 다시 묻지 않는다. 어떤 승인도 유료 호출·모델 교체·전역 rollout·npm 배포를 포함하지 않는다. GitHub-only 릴리스 권한과 실제 게시 완료 여부는 root가 따로 소유한다.
- **현재 승인 기록: 없음.** 현재 보고서의 `human_needed/gaps_found`를 이 초안 때문에 `passed`로 바꾸지 않는다.

