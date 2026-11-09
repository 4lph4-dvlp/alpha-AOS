# Phase 40: Local Official Release Updates - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-07
**Phase:** 40-Local Official Release Updates
**Areas discussed:** 설치·업데이트 명령과 대상 선택 방식, 프리뷰(Preview)와 적용(Apply)의 바인딩 계약, 릴리스 탐색 예외 및 플랫폼 지원 정책, Cua 공식 설치 어댑터와 아티팩트 검증 경계

---

## 설치·업데이트 명령과 대상 선택 방식

### Q1: `alpha-aos install`과 `alpha-aos update`의 기본 동작 차이

| Option | Description | Selected |
|--------|-------------|----------|
| `install`은 미설치·미인정 도구 신규 설치, `update`는 설치된 도구 업그레이드 | 동일한 로컬 라이프사이클 엔진을 공유하되, `install`은 미설치·미인정 도구를 최신 공식 릴리스로 설치하고 기존 정상 설치는 유지하며, `update`는 설치된 도구까지 최신 공식 릴리스로 업그레이드한다 | ✓ |
| 두 명령 모두 전체 도구를 항상 최신으로 수렴 | `install`과 `update` 모두 대상 범위의 모든 관리 도구를 항상 최신 공식 안정 릴리스 기준으로 조회·수렴시킨다 | |
| `install`은 전체 최신화, `update`는 설치된 도구만 업그레이드 | `install`은 미설치 설치 + 기존 도구 최신화를 모두 수행하고, `update`는 설치된 도구만 업그레이드한다 | |
| 에이전트 판단에 위임 | You decide | |

**User's choice:** `install`은 미설치·미인정 도구를 최신 공식 릴리스로 설치하되 이미 정상 설치·인정된 도구는 기존 버전을 유지하고, `update`는 설치된 도구까지 최신 공식 릴리스로 업그레이드한다 (동일한 로컬 라이프사이클 엔진 공유)
**Notes:** 없음

### Q2: 개별 도구(`--tool`)와 하네스(`--target`) 필터 지원

| Option | Description | Selected |
|--------|-------------|----------|
| `--tool`과 `--target` 모두 지원 + 공유 설치 파급 명시 | `install`과 `update` 모두 `--tool`(Phase 39와 동일한 관리 도구 ID)과 `--target`(하네스) 필터를 지원하되, 여러 하네스가 공유하는 설치가 변경될 때는 영향받는 다른 하네스도 프리뷰에 함께 명시한다 | ✓ |
| `--target`만 유지 | 하네스 필터만 유지하고 선택된 하네스의 모든 관리 도구를 항상 한 번에 설치·업데이트한다 | |
| `update`에서만 `--tool` 허용 | `update`에서만 개별 도구 선택을 허용하고 `install`은 하네스 단위로만 수행한다 | |
| 에이전트 판단에 위임 | You decide | |

**User's choice:** `install`과 `update` 모두 `--tool`(Phase 39와 동일한 관리 도구 ID)과 `--target`(하네스) 필터를 지원하되, Cua·전역 패키지처럼 여러 하네스가 공유하는 설치가 변경될 때는 영향받는 다른 하네스도 프리뷰에 함께 명시한다
**Notes:** 없음

### Q3: `alpha-aos update` 실행 시 미설치(`absent`) 도구 처리

| Option | Description | Selected |
|--------|-------------|----------|
| 기본 `update`는 미설치 건너뜀, `--tool`로 미설치 지정 시 거부 | 기본 `update`는 이미 설치된 도구만 업그레이드하고 미설치 도구는 `미설치 · 변경 없음`으로 표시하며, `--tool`로 미설치 도구를 직접 지정하면 `install`을 안내하며 거부한다 | ✓ |
| 미설치 도구도 함께 신규 설치 | `update` 실행 시 대상 범위에 미설치 도구가 있으면 최신 공식 릴리스로 신규 설치까지 함께 수행한다 | |
| 미설치 도구가 있으면 전체 거부 | 대상 범위에 미설치 도구가 포함되어 있으면 `update` 전체를 거부하고 먼저 `install`을 요구한다 | |
| 에이전트 판단에 위임 | You decide | |

**User's choice:** 기본 `update`는 이미 설치된 도구만 업그레이드 대상으로 삼고 미설치 도구는 건너뛰며(`미설치 · 변경 없음` 표시), `--tool`로 미설치 도구를 직접 지정하면 `install`을 사용하도록 명시적 안내와 함께 거부한다
**Notes:** 없음

### Q4: 기존 `alpha-aos update` 하위 플래그(`--check`, `--stage`, `--apply`) 정리

| Option | Description | Selected |
|--------|-------------|----------|
| 기본/`--check`는 프리뷰, `--apply`는 적용, `--stage`는 폐기 거부 | `install`과 일관되게 기본 `alpha-aos update`(및 `--check`)는 읽기 전용 프리뷰로, `--apply`는 적용으로 동작하게 통일하고, 체크아웃 내 `catalog/candidate.lock.json`을 쓰던 `--stage`는 폐기 안내와 함께 거부한다 | ✓ |
| `--check`도 제거 | `alpha-aos update`와 `alpha-aos update --apply`만 허용하고 `--check`와 `--stage` 모두 오류 처리한다 | |
| `--stage`를 `userStateRoot()` 저장으로 재정의 | `--stage`를 유지하되 체크아웃 대신 사용자 상태 루트에 후보 정보를 기록하는 명령으로 재정의한다 | |
| 에이전트 판단에 위임 | You decide | |

**User's choice:** `install`과 일관되게 기본 `alpha-aos update`(및 호환 별칭 `--check`)는 읽기 전용 프리뷰로, `alpha-aos update --apply`는 적용으로 동작하게 통일하고, 체크아웃 내 `catalog/candidate.lock.json`을 쓰던 `--stage`는 폐기 안내와 함께 거부한다
**Notes:** 없음

---

## 프리뷰(Preview)와 적용(Apply)의 바인딩 계약

### Q1: 읽기 전용 프리뷰(SAFE-01)와 `--apply` 간의 바인딩 강제 여부

| Option | Description | Selected |
|--------|-------------|----------|
| 프리뷰가 바인딩된 `--apply` 명령 출력 + `--apply` 시 바인딩 필수 | 프리뷰는 디스크에 아무것도 쓰지 않는 대신 검토된 릴리스 식별 정보·다이제스트가 묶인 실행 명령을 출력하고, `--apply`는 이 검토 바인딩을 필수로 받아 최신 태그 재해석 없이 정확한 아티팩트와 로컬 사전 상태를 재검증한다 | ✓ |
| 바인딩 인자 선택적 허용 | 바인딩 인자가 주어지면 검증하고, 인자 없이 `--apply`만 실행하면 실행 시점에 최신 릴리스를 즉시 해석해 적용한다 | |
| JSON 파일 전달만 허용 | 사용자가 프리뷰 JSON 출력을 파일로 저장한 뒤 `--apply --reviewed-plan <파일>`로 전달하는 방식만 허용한다 | |
| 에이전트 판단에 위임 | You decide | |

**User's choice:** 프리뷰는 아무것도 디스크에 쓰지 않는 대신 검토된 릴리스 식별 정보·다이제스트가 묶인 실행 명령(예: `--plan-digest` 및 검토된 버전/다이제스트 바인딩)을 출력하고, `--apply`는 이 검토 바인딩을 필수로 받아 최신 태그 재해석 없이 정확한 아티팩트와 로컬 사전 상태를 재검증한다
**Notes:** 없음

### Q2: 움직이는 `latest` 태그 재조회 없이 검토된 릴리스 식별 정보를 전달하는 방식

| Option | Description | Selected |
|--------|-------------|----------|
| 복사·실행용 `--apply` 명령에 정확한 릴리스 식별 정보 + 계획 다이제스트 포함 | 컴팩트 바인딩 토큰(또는 `--reviewed-plan` 지원)으로 검토된 정확한 릴리스 식별 정보와 계획 다이제스트를 함께 전달해, `--apply`가 움직이는 `latest` 태그를 다시 조회하지 않고 해당 특정 버전 메타데이터·무결성·로컬 사전 상태만 재검증한다 | ✓ |
| `--plan-digest`만 전달하고 `latest` 재조회 비교 | `--plan-digest`만 전달하고 `--apply` 시점에 최신 안정 채널을 다시 조회해 다이제스트를 비교한다 | |
| 개별 플래그 수동 나열 | 사용자가 모든 도구의 `--tool-version`과 `--artifact-digest`를 개별 플래그로 직접 나열하도록 요구한다 | |
| 에이전트 판단에 위임 | You decide | |

**User's choice:** 프리뷰가 출력하는 복사·실행용 `--apply` 명령에 검토된 정확한 릴리스 식별 정보와 계획 다이제스트를 함께 담아(컴팩트 바인딩 토큰 또는 `--reviewed-plan` 지원), `--apply`는 움직이는 `latest` 태그를 다시 조회하지 않고 해당 특정 버전 메타데이터·무결성·로컬 사전 상태만 재검증한다
**Notes:** 없음

### Q3: 기본 텍스트 프리뷰 화면의 표시 항목과 순서

| Option | Description | Selected |
|--------|-------------|----------|
| 변경 도구 우선 + 4대 핵심 항목 구조화 + 무변경 도구 하단 요약 | 변경될 도구를 먼저 보여주고 각 도구별로 ① 기존→신규 버전·공식 출처·아티팩트 식별 요약, ② 영향받는 하네스(공유 설치 영향 포함), ③ 네이티브 설치 부수 효과, ④ 복구 범위(자동 롤백 vs 어댑터 복구·외부 잔여 효과)를 표시하며, 변경 없는 도구는 하단에 간결히 요약한다 | ✓ |
| 모든 도구의 전체 해시·URL·경로 나열 | 변경 여부와 무관하게 모든 도구의 전체 아티팩트 URL, 전체 해시값, 세부 경로 목록을 전부 펼쳐서 출력한다 | |
| 한 줄 요약만 표시 | 기본 텍스트 프리뷰에는 버전 변경과 대상 하네스만 한 줄로 표시하고 나머지는 `--json`에서만 제공한다 | |
| 에이전트 판단에 위임 | You decide | |

**User's choice:** 변경될 도구를 먼저 보여주고 각 도구별로 ① 기존→신규 버전·공식 출처·아티팩트 식별 요약, ② 영향받는 하네스(공유 설치 영향 포함), ③ 네이티브 설치 부수 효과, ④ 복구 범위(자동 롤백 vs 어댑터 복구·외부 잔여 효과)를 표시하며, 변경 없는 도구는 하단에 간결히 요약한다
**Notes:** 없음

### Q4: 전체 최신 상태(already current) 및 프리뷰 이후 로컬 드리프트 처리

| Option | Description | Selected |
|--------|-------------|----------|
| 최신이면 멱등(no-op), 드리프트 시 전체 변경 전 거부 및 새 프리뷰 안내 | 모든 도구가 이미 최신이면 프리뷰는 변경 없음으로 안내하고 적용 시에도 멱등(no-op)으로 처리하며, 프리뷰 이후 로컬 설치 상태·설정 파일·아티팩트 무결성 중 하나라도 달라지면 변경 전에 즉시 거부하고 구체적인 불일치 항목과 새 프리뷰 명령을 안내한다 | ✓ |
| 드리프트되지 않은 도구만 부분 적용 | 일부 도구의 로컬 상태만 바뀐 경우 나머지 도구만 부분 적용한다 | |
| 최신이어도 매번 새 기록 강제 작성 | 모든 도구가 이미 최신이더라도 `--apply` 실행 시 매번 새 로컬 기록 이벤트를 강제로 재작성한다 | |
| 에이전트 판단에 위임 | You decide | |

**User's choice:** 모든 도구가 이미 최신이면 프리뷰는 변경 없음으로 안내하고 적용 시에도 멱등(no-op)으로 처리하며, 프리뷰 이후 로컬 설치 상태·설정 파일·아티팩트 무결성 중 하나라도 달라지면 변경 전에 즉시 거부하고 구체적인 불일치 항목과 새 프리뷰 명령을 안내한다
**Notes:** 없음

---

## 릴리스 탐색 예외 및 플랫폼 지원 정책

### Q1: npm `latest` dist-tag가 시맨틱 프리릴리스일 때의 처리

| Option | Description | Selected |
|--------|-------------|----------|
| 명시적 거부(`latest-is-prerelease`) 및 기존 상태 유지 | npm `latest` dist-tag를 우선 조회하되, 그 버전이 시맨틱 프리릴리스(`-alpha`, `-beta`, `-rc` 등)이면 암묵적 구버전 폴백 대신 명시적 거부(`latest-is-prerelease`)로 처리하고 기존 설치 상태를 유지한다 | ✓ |
| 전체 버전 목록에서 이전 정식 버전 자동 선택 | 패키지 전체 버전 목록을 조회해 프리릴리스·deprecated를 제외한 가장 높은 정식 버전을 자동 선택한다 | |
| `latest` 무시하고 최고 semver 선택 | `latest` dist-tag를 무시하고 항상 전체 버전 중 가장 높은 정식 semver 버전을 선택한다 | |
| 에이전트 판단에 위임 | You decide | |

**User's choice:** npm `latest` dist-tag를 우선 조회하되, 그 버전이 시맨틱 프리릴리스(`-alpha`, `-beta`, `-rc` 등)이면 암묵적 구버전 폴백 대신 명시적 거부(`latest-is-prerelease`)로 처리하고 기존 설치 상태를 유지한다
**Notes:** 없음

### Q2: Cua 안정 태그 판별, 제한된 페이지 탐색, OS/아키텍처 미지원 처리

| Option | Description | Selected |
|--------|-------------|----------|
| 정식 드라이버 태그 선택 + 미지원/탐색 한도 도달 시 구버전 폴백 없이 명시적 거부 | 제한된 페이지 한도 내에서 `cua-driver-rs-v<X.Y.Z>` 정식 태그(nightly·시맨틱 프리릴리스·draft 제외, GitHub prerelease 플래그는 허용) 중 최신 버전을 선택하되, 해당 최신 릴리스가 현재 OS/아키텍처를 지원하지 않거나 탐색 한도에 도달하면 구버전 폴백 없이 명시적 사유(`unsupported-platform` / `incomplete-discovery`)로 거부한다 | ✓ |
| 이전 버전 역순 폴백 | 최신 정식 Cua 릴리스에 현재 OS/아키텍처 에셋이 없으면 이전 릴리스 버전을 역순으로 찾아 자동 선택한다 | |
| 미지원 시 조용히 건너뜀 | 현재 OS/아키텍처 미지원 시 Cua만 조용히 설치 대상에서 제외한다 | |
| 에이전트 판단에 위임 | You decide | |

**User's choice:** 제한된 페이지 한도 내에서 `cua-driver-rs-v<X.Y.Z>` 정식 태그(nightly·시맨틱 프리릴리스·draft 제외, GitHub prerelease 플래그는 허용) 중 최신 버전을 선택하되, 해당 최신 릴리스가 현재 OS/아키텍처를 지원하지 않거나 탐색 한도에 도달하면 구버전 폴백 없이 명시적 사유(`unsupported-platform` / `incomplete-discovery`)로 거부한다
**Notes:** 없음

### Q3: 다중 도구 조회·업데이트 중 일부 도구 탐색/검증 실패 시 처리

| Option | Description | Selected |
|--------|-------------|----------|
| 전체 결과 수집 후 `--apply` 거부 + `--tool` 선택 안내 | 대상 범위에 포함된 모든 도구의 탐색 결과를 끝까지 수집해 함께 보여주되, 하나라도 탐색 실패·메타데이터 무결성 불충족·플랫폼 미지원이면 전체 계획의 `--apply`를 거부(기존 상태 유지)하고 `--tool`로 정상 도구만 선택할 수 있음을 안내한다 | ✓ |
| 실패 도구 자동 제외 후 나머지 계획 생성 | 탐색에 실패하거나 미지원인 도구는 자동으로 계획에서 제외하고 나머지 도구만으로 `--apply` 가능한 계획을 만든다 | |
| 첫 오류 발생 시 즉시 중단 | 첫 번째 오류가 발생하는 즉시 나머지 도구 조회를 중단하고 단일 오류만 출력한다 | |
| 에이전트 판단에 위임 | You decide | |

**User's choice:** 대상 범위에 포함된 모든 도구의 탐색 결과를 끝까지 수집해 함께 보여주되, 하나라도 탐색 실패·메타데이터 무결성 불충족·플랫폼 미지원이면 전체 계획의 `--apply`를 거부(기존 상태 유지)하고 `--tool`로 정상 도구만 선택할 수 있음을 안내한다
**Notes:** 없음

### Q4: Cua의 Linux(`x64`/`arm64`) 정식 에셋과 업스트림 Linux preview 구분

| Option | Description | Selected |
|--------|-------------|----------|
| 공식 검증 에셋 인정 + Linux 네이티브 제약 명시 + 연동 `미검증` 구분 | 정식 `cua-driver-rs-v<X.Y.Z>` 릴리스에 현재 Linux 아키텍처(`x64`/`arm64`)의 공식 검증 가능한 아카이브가 존재하면 유효한 릴리스 에셋으로 선택하되, 프리뷰에 Linux 네이티브 부수 효과·제약(Wayland helper 등)을 명시하고 호스트 연동 검증은 `미검증`으로 구분한다 | ✓ |
| Linux 전체 거부 | 업스트림 릴리스 노트에서 Linux가 preview로 분류되는 한 Linux에서는 Cua를 `unsupported-platform`으로 거부한다 | |
| 별도 구분 없이 동일 표시 | Linux 플랫폼에 대한 별도 제약이나 부수 효과 안내 없이 Windows·macOS와 동일하게 표시한다 | |
| 에이전트 판단에 위임 | You decide | |

**User's choice:** 정식 `cua-driver-rs-v<X.Y.Z>` 릴리스에 현재 Linux 아키텍처(`x64`/`arm64`)의 공식 검증 가능한 아카이브가 존재하면 유효한 릴리스 에셋으로 선택하되, 프리뷰에 Linux 네이티브 부수 효과·제약(Wayland helper 등)을 명시하고 호스트 연동 검증은 `미검증`으로 구분한다
**Notes:** 없음

---

## Cua 공식 설치 어댑터와 아티팩트 검증 경계

### Q1: 체크아웃 고정 핀 없이 최신 Cua 릴리스 아카이브·설치 파일 무결성 검증

| Option | Description | Selected |
|--------|-------------|----------|
| 검토된 Cua 신뢰 정책(서명된 체크섬/Sigstore 증빙) 검증 후 파일 해시 로컬 도출 | 저장소에 검토된 Cua 공식 출처 신뢰 정책(공식 서명된 체크섬 목록·Sigstore 증빙·허용된 발행 워크플로 식별자)으로 새 릴리스 아카이브를 검증한 뒤, 검증된 아카이브에서 설치 파일 해시를 로컬 도출해 설치 검증과 로컬 기록에 사용한다 | ✓ |
| 다운로드 직후 SHA-256만 신뢰 | 별도 서명/체크섬 증빙 없이 다운로드 직후 계산한 SHA-256을 그대로 신뢰한다 | |
| `catalog/computer-use-runtime.json` 등록 버전만 허용 | 체크아웃에 파일 해시가 사전 등록된 버전만 설치를 허용한다 | |
| 에이전트 판단에 위임 | You decide | |

**User's choice:** 저장소에 검토된 Cua 공식 출처 신뢰 정책(공식 서명된 체크섬 목록·Sigstore 증빙·허용된 발행 워크플로 식별자)으로 새 릴리스 아카이브를 검증한 뒤, 검증된 아카이브에서 설치 파일 해시를 로컬 도출해 설치 검증과 로컬 기록에 사용한다 (증빙 누락·불일치 시 거부)
**Notes:** 없음

### Q2: Cua 공식 설치 스크립트(`install.ps1` / `install.sh`) 및 실행 인자 관리

| Option | Description | Selected |
|--------|-------------|----------|
| 해시 검증된 공식 설치 어댑터 + 정확한 버전/아티팩트 고정 전달(`main` 브랜치 런타임 다운로드 금지) | 해시가 검증된 공식 설치 어댑터(검토된 벤더 설치 스크립트 또는 해당 릴리스 태그에 서명·검증된 공식 설치기)에 검토된 정확한 버전(`-Release` / `CUA_DRIVER_RS_VERSION`)과 검증된 아티팩트를 고정 전달해 실행하고, 검증되지 않은 `main` 브랜치 스크립트의 런타임 다운로드 실행은 금지한다 | ✓ |
| GitHub `main` 브랜치 스크립트 실시간 다운로드 실행 | 업데이트 시마다 GitHub `main` 브랜치에서 최신 `install.ps1` / `install.sh`를 내려받아 그대로 실행한다 | |
| 공식 설치 스크립트 미사용 | 공식 설치 스크립트를 사용하지 않고 자체 파일 복사만으로 모든 플랫폼의 Cua 설치를 대체한다 | |
| 에이전트 판단에 위임 | You decide | |

**User's choice:** 해시가 검증된 공식 설치 어댑터(검토된 벤더 설치 스크립트 또는 해당 릴리스 태그에 서명·검증된 공식 설치기)에 검토된 정확한 버전(`-Release` / `CUA_DRIVER_RS_VERSION`)과 검증된 아티팩트를 고정 전달해 실행하고, 검증되지 않은 `main` 브랜치 스크립트의 런타임 다운로드 실행은 금지한다
**Notes:** 없음

### Q3: Cua 기존 버전 보존(`CUA_DRIVER_RS_KEEP_VERSIONS`) 및 네이티브 부수 효과 선언

| Option | Description | Selected |
|--------|-------------|----------|
| 직전 정상 버전 보존 + OS별 네이티브 부수 효과·복구 범위 명시 | Cua 업데이트 시 이전 버전을 즉시 삭제(`KEEP_VERSIONS=0`)하지 않고 직전 정상 버전을 보존하도록 실행 구성을 조정하며, OS별 네이티브 설치 부수 효과(Windows 정션/바이너리, macOS 앱 번들, Linux 바이너리/Wayland helper)와 복구 범위를 프리뷰·계획에 명시한다 | ✓ |
| `KEEP_VERSIONS=0` 유지 | 기존처럼 이전 버전을 즉시 삭제하고 실패 시 재다운로드만 안내한다 | |
| 프리뷰에서 생략 | Cua의 네이티브 설치 경로·부수 효과는 프리뷰에서 생략하고 Phase 42에서만 다룬다 | |
| 에이전트 판단에 위임 | You decide | |

**User's choice:** Cua 업데이트 시 이전 버전을 즉시 삭제(`KEEP_VERSIONS=0`)하지 않고 직전 정상 버전을 보존하도록 실행 구성을 조정하며, OS별 네이티브 설치 부수 효과(Windows 정션/바이너리, macOS 앱 번들, Linux 바이너리/Wayland helper)와 복구 범위를 프리뷰·계획에 명시한다
**Notes:** 없음

### Q4: `--apply` 결과의 Phase 39 로컬 기록(`tool-records`) 반영과 체크아웃 불변성

| Option | Description | Selected |
|--------|-------------|----------|
| 체크아웃 `catalog/*.json` 불변 + `userStateRoot()/tool-records` 기록 + 미수행 호출 검증 `unverified` 유지 | `--apply`는 체크아웃 내 `catalog/*.json`을 수정하지 않고 `userStateRoot()/tool-records`에 `requested`·`resolved`·`installed` 식별 정보와 실제 수행된 발견·무결성 증거를 기록하며, 미수행 호스트 호출 검증은 `unverified`로 남겨 이전 인정(`accepted`) 상태를 허위 완료로 덮어쓰지 않는다 | ✓ |
| 설치만으로 `acceptedTransitions` 강제 완료 | 호스트 호출 검사를 수행하지 않았더라도 설치만 끝나면 `acceptedTransitions`를 강제 기록해 연동 검증 완료로 표시한다 | |
| 체크아웃 `catalog/*.json`도 함께 덮어쓰기 | 로컬 상태 루트 기록과 더불어 패키지 체크아웃 내부의 `catalog/stack.lock.json`과 `catalog/computer-use-runtime.json` 파일도 함께 덮어쓴다 | |
| 에이전트 판단에 위임 | You decide | |

**User's choice:** `--apply`는 체크아웃 내 `catalog/*.json`을 수정하지 않고 `userStateRoot()/tool-records`에 `requested`·`resolved`·`installed` 식별 정보와 실제 수행된 발견·무결성 증거를 기록하며, 미수행 호스트 호출 검증은 `unverified`로 남겨 이전 인정(accepted) 상태를 허위 완료로 덮어쓰지 않는다
**Notes:** 없음

---

## the agent's Discretion

사용자가 판단을 위임한 영역은 없다. 세부 바인딩 토큰 인코딩 형식, GitHub 릴리스 페이지네이션 상한, 내부 모듈 분리와 세부 오류 코드 명칭은 위 결정을 만족하는 범위에서 연구·계획 단계에서 정한다.

## Deferred Ideas

논의 중 제기된 범위 외 기능은 없었다. 호환성 어댑터 단순화(Phase 41), 실제 프로토콜·호출 검증 및 사후 복구(Phase 42), 기존 설치 이관 및 전체 소비자·문서 전환(Phase 43)은 승인된 로드맵 단계에서 다룬다.
