# 예측 가능한 작업 진입

[English](./task-entry.md) | [한국어](./task-entry.ko.md)

에이전트에게 원하는 작업을 말하면 공유 프로젝트 정책에 따라 실행 방식을 확인합니다. 계획·실행 상태·검증은 GSD가 관리합니다. 이 가이드는 패키지 버전 **0.5.0**의 소스 작업 흐름을 설명하며 v0.6.0 작업의 정식 배포는 보류 중입니다.

## 1. 공유 프로젝트 모드 (`strict` vs `flexible`)

다섯 하네스가 `<project-root>/.alpha-aos/behavior.json` 하나를 권위로 읽습니다. 빈 디렉터리나 정책 파일이 없는 프로젝트는 파일을 쓰지 않고 `strict`를 사용합니다. 다른 하네스는 다음 intake에서 변경을 확인하고, 진행 중인 작업은 기존 스타일을 유지합니다.

```sh
alpha-aos project mode . --json
alpha-aos project mode set flexible . --json
alpha-aos project mode set flexible . --plan-digest <digest-from-preview> --apply
alpha-aos rollback <operation-id> --apply
```

`set strict`로 되돌릴 수 있습니다. 미리보기를 검토한 뒤 정확한 다이제스트로 적용합니다. 롤백은 이전 바이트를 복원하거나 최초 생성한 정책 파일만 제거합니다. 오래된 다이제스트나 손상된 정책은 거부합니다. `flexible`은 진입 선호일 뿐 실행 동의, 오토파일럿 승인·시작 권한 또는 기본 실행 스타일을 부여하지 않습니다.

## 2. 6개 실행 스타일 (`1`–`6`)

아래 한국어 라벨은 실제 UI 라벨입니다. 번호·라벨·명시적인 스타일 요청으로 선택할 수 있습니다.

| 번호 | 고정 라벨 | Canonical ID | 동작 및 요청 예시 |
|---|---|---|---|
| 1 | 대화형-quick | `conversational-quick` | 현재 대화에서 범위가 한정된 GSD quick 실행: “이 함수 수정은 대화형 quick으로 해줘.” |
| 2 | 대화형-quick-full | `conversational-quick-full` | 연구·계획 검토를 포함한 GSD quick `--full`: “대화형 quick-full로 검증까지 해줘.” |
| 3 | 대화형-phase | `conversational-phase` | 현재 대화에서 discuss → plan → execute → verify: “31단계 남은 부분을 이 대화에서 이어줘.” |
| 4 | 오토파일럿-quick | `autopilot-quick` | 격리 러너에서 계약 기반 일반 quick: “이 수정의 오토파일럿 quick 계약을 준비해줘.” |
| 5 | 오토파일럿-quick-full | `autopilot-quick-full` | `scope.quickQuality: "full"`인 격리 full quick: “전체 품질 게이트를 갖춘 오토파일럿 quick-full 계약을 준비해줘.” |
| 6 | 오토파일럿-phase | `autopilot-phase` | 격리된 순차 단계 실행과 독립 리뷰: “이 단계들의 오토파일럿 계약을 준비해줘.” |

Full quick은 **discussion, research, planning, plan-check, implementation, verification, state-docs** 일곱 단계의 증거를 요구합니다. 일반 quick 증거로 대신할 수 없습니다. 모든 오토파일럿 경로는 정확한 계약 승인 후 별도 시작 지시가 필요합니다.

## 3. 예측 가능한 작업 진입 판정 순서

1. 일치하는 활성 작업의 연속성과 확정된 스타일을 유지합니다.
2. 문장 맨 앞의 직접 GSD 명령을 우선합니다.
3. 사용자의 명시적인 스타일 요청을 적용합니다. 충돌하는 요청은 거부합니다.
4. 구체적 증거로 단순 작업 면제를 판단합니다.
5. 새로운 본격 작업은 `strict`에서 6개 옵션을 질문하고 `flexible`에서 적응형 intake를 사용합니다. 구조화된 질문 UI가 없으면 동일한 **1–6 번호 텍스트 fallback**을 표시합니다.

진입 조회는 읽기 전용이며 `executionAuthorized: false`입니다. 스타일 선호만으로 워커가 시작되지 않으며 완료된 작업의 스타일은 다음 작업의 기본값이 아닙니다.

## 4. 단순 작업 면제 기준: 면제 예시 vs 비면제 반례

면제에는 영향 파일과 동작을 한정하는 근거가 필요합니다. 보호된 동작의 승인 게이트는 유지합니다.

| 증거가 있으면 단순 작업으로 진행 가능한 예시 | 일반 intake와 스타일 선택이 필요한 반례 |
|---|---|
| 파일 하나의 로컬 변수·helper rename | 하위 시스템·패키지에 걸친 공개 API rename |
| README 오타·번역·링크 수정 | 스키마·인증·릴리스 동작 수정 |
| 명시적으로 요청한 한정된 fast-forward git push | 충돌 해결 또는 force push |

영향 파일 근거 없이 “작은 수정”이라고만 말하면 충분하지 않습니다. 추상적인 push 예시가 단순 작업에 해당해도 현재 릴리스 push 보류는 유지합니다.

## 5. 작업 수명 경계와 독립 작업 재선택

| 새로운 독립 작업 | 같은 활성 작업의 후속 요청 |
|---|---|
| 오토파일럿-phase 릴리스 완료 뒤 별도의 버그 픽스를 요청하면 새 6개 스타일 chooser를 표시합니다. 예를 들어 5번을 새로 선택합니다. | 현재 구현 중 테스트가 실패했다면 기존에 확정된 스타일로 수리합니다. |
| 완료된 릴리스의 스타일을 기본값으로 상속하지 않습니다. | 다른 하네스의 모드 변경 때문에 활성 작업을 다시 시작하거나 스타일을 바꾸지 않습니다. |

연속성에는 canonical 프로젝트 루트와 활성 작업 식별자가 일치해야 합니다. 다른 루트 또는 충돌하는 바인딩은 거부합니다.

## 6. GSD 초기화 상태 진단, 비파괴 복구 및 원래 요청 1회 인계

진단은 런타임 없음, `absent-project`(계획 설정 없음), `partial-project`(아티팩트 일부만 존재), `ready`를 구분합니다. 런타임 누락은 가짜 계획 상태를 만들 권한이 아닙니다. Hermes는 GSD 컨트롤러로 선택할 수 없습니다.

| 원래 요청을 보존하는 복구 | 거부하거나 보류하는 동작 |
|---|---|
| absent/partial 상태를 진단하고 복구 미리보기를 검토한 뒤 네이티브 GSD 초기화·복구 경로를 실행합니다. 기존 `.planning/PROJECT.md`와 다른 파일의 바이트를 그대로 보존합니다. | 임시 placeholder 계획 파일 합성, 부분 작업 삭제, 취소된 복구 또는 미승인 워커 실행. |
| 원래 요청과 선택 스타일을 한 번만 인계합니다. 첫 claim은 `new-task`, 재진입은 `continue-existing`입니다. | 재진입 때 같은 원래 요청을 중복 실행하는 동작. |

오토파일럿 bootstrap claim은 `dispatchAuthorized: false`를 유지합니다. GSD 준비 상태 복구는 정확한 계약 승인과 별도 시작을 대체하지 않습니다. [복구 증명 원장](./task-bootstrap-proof.md)을 참고하세요.

## 7. 직접 GSD 명령 우선순위와 오토파일럿 승인·시작 경계

| 직접 호출 | 설명 문장 속 언급 |
|---|---|
| 문장 맨 앞의 `/gsd-quick`, `/gsd-plan-phase`, `$gsd-quick`은 명시적인 GSD 경로로 연결되어 chooser를 생략합니다. | “`/gsd-quick`이 무슨 뜻이야?” 같은 설명 요청이나 인용 예문은 경로 선택이 아닙니다. 일반 intake를 적용합니다. |

오토파일럿 요청에는 루트·범위·역할별 모델·수용 기준·제한이 담긴 구체적 계약을 준비합니다. 사용자가 64자리 SHA-256 다이제스트를 검토한 다음 승인과 시작을 각각 실행합니다.

```sh
alpha-aos task preview <contract.json> --json
alpha-aos task approve <contract.json> --contract-digest <64-hex-digest> --apply
alpha-aos task start <contract.json> --contract-digest <64-hex-digest> --apply
```

에이전트가 다이제스트를 명령에 전달할 수 있습니다. 승인만으로 워커는 시작하지 않습니다. 범위 또는 `scope.quickQuality`를 바꾸면 다이제스트가 달라져 기존 승인이 무효가 됩니다. 오토파일럿 구현은 승인된 격리 러너에서 수행하며 수명 주기는 GSD가 관리합니다.

## 8. 5대 하네스 실제 지원 한계, 검증 방법 및 배포 상태

| 하네스 | 컨트롤러 / 워커 | 증거 및 질문 전달 한계 |
|---|---|---|
| Claude Code | GSD 컨트롤러·워커 | **G-07-2** 격리 유료 카나리는 인증 보류이며 새 유료 실기 증거로 간주하지 않습니다. 구조화 질문 UI가 없으면 1–6 fallback을 사용합니다. |
| Codex | GSD 컨트롤러·워커 | 네이티브 bootstrap 보존 영수증이 있습니다. Windows `.CMD` 발견과 실행을 구별합니다. 질문 UI는 호스트 세션 지원에 따릅니다. |
| Antigravity | GSD 컨트롤러·워커 | 기존 네이티브 intake·정책 세션 관측이 있으며 재현 가능한 결합 테스트는 fixture 검증입니다. CLI 테스트는 네이티브 UI를 입증하지 않습니다. |
| Pi Agent | GSD 컨트롤러·워커 | Phase 30에서 6개 경로의 네이티브 영수증을 보존했습니다. Windows `.CMD` 발견만으로 실행 증명이 되지 않습니다. 필요하면 번호 텍스트를 사용합니다. |
| Hermes Agent | **worker-only** | 공유 정책·intake를 지원합니다. GSD controller/state-writer 실행은 **unsupported**입니다. 번호 텍스트 fallback을 사용할 수 있습니다. |

[55셀 증명 원장](./task-entry-proof.md)과 [JSON 인덱스](./task-entry-proof-index.json)는 verified-native, verified-fixture, unsupported, unverified, blocked를 구분합니다. 모델 호출 없이 다시 검사할 수 있습니다.

```sh
node scripts/verify-task-entry-proof.mjs --index docs/task-entry-proof-index.json --json
```

패키지 검증기는 `.git`, `.planning`, checkout 테스트 없이 패키지 해시와 보존 증거를 확인합니다. 네이티브 모델 턴을 다시 실행하지 않습니다. 소스 복제 개발용 패키지 버전은 **0.5.0**입니다. 정식 npm publish·버전 증가·git push·글로벌 재적용·Claude G-07-2·**3-OS/macOS CI**는 보류 중입니다. Windows 로컬 테스트 통과로 해제되지 않습니다.

관련 문서: [런타임 운영 제어](./task-runtime-controls.md), [지원 매트릭스](./SUPPORT_MATRIX.md), [과거 매트릭스](./SUPPORT_MATRIX_v0.2.0.md), [실행 스타일 증거](./task-style-proof.md).
