# Phase 40 검증 결과 보고서 (G-40-9 해결 후 최종 재검증)

최종 판정: **자동화 검증 최종 PASS / 워크스테이션 라이브 검증 사용자 수동 게이트 (보류)**
검증 기준 커밋: `ffc1877a43720ca26cbbc5250b9a4cd6d72ace01`.
환경: Windows x64, Node.js v24.13.1, 2026-11-08.
사용자 요청에 따라 에이전트가 자체적으로 수행할 수 있는 모든 코드·타입·단위·통합·암호학적 검증을 직접 수행 완료했다.
실제 전역 설치, 하네스 재시작, GUI 권한 획득, 이전 Cua 버전 복구는 개발 머신 보호를 위해 에이전트가 임의로 실행하지 않고 사용자 검증 절차로 안내한다.

## 1. 에이전트 자율 수행 검증 결과

| 검사 항목 | 판정 | 세부 결과 |
|---|---|---|
| `npm run build` | **PASS** | 종료 코드 0, 빌드 아티팩트(774 outputs) 정상 생성 |
| `npm run check` | **PASS** | 종료 코드 0, TypeScript 엄격 타입 오류 0건 |
| 관련 타깃 테스트 7개 파일 | **PASS** | 57 pass / 0 fail / 0 skip / 0 cancelled (종료 코드 0, ~50초 소요) |
| Rekor 보안 프로브 (`40-REKOR-PROBE.mjs`) | **PASS** | 3개 적대적 프로브 모두 `rejected: true` (위조 SET, 시각 불일치, 불완전 tlog 차단) |
| 실제 `update --check` | **PASS** | 종료 코드 0, 4-tier 미리보기(버전·출처·영향 범위·부작용·복구 범위·토큰) 렌더링 |
| 타깃 지정 `update --tool gsd --target codex --check` | **PASS** | 종료 코드 0, GSD 및 Codex에 국한된 계획 및 공유 blast radius 표시 |
| 검토 인자 없는 `update --apply` | **PASS** | 종료 코드 1, `--plan-digest` 및 `--reviewed-plan` 요구하며 사전 차단 |
| 폐기된 `update --stage` | **PASS** | 종료 코드 1, 옵션 폐기 안내 메시지 출력 및 `candidate.lock.json` 불변 |
| `inventory --tool gsd --detail` | **PASS** | 종료 코드 0, 설치 관찰 및 기록 검증 |
| 저장소 catalog 파일 불변성 | **PASS** | `catalog/stack.yaml`, `catalog/stack.lock.json`, `catalog/computer-use-runtime.json` 불변 |

### G-40-9 Blocker 해결 검증
- **문제점 (이전)**: `verifyCuaSigstoreBundle`에서 Rekor SET 서명 및 tlog inclusion proof를 검증하지 않고, 인증된 `integratedTime`과 인증서 유효기간(`validFrom` ~ `validTo`)을 바인딩하지 않아 위조 입력이 통과됨.
- **해결 내역 (`40-04-PLAN.md`)**:
  - `canonicalizeRekorPayload` (RFC 8785 JSON 정규 직렬화) 구현.
  - `verifyRekorSignature` (ECDSA P-256 / SHA-256)를 통한 SET 서명 및 modern tlog `inclusionPromise`/`inclusionProof` 서명 검증.
  - Rekor `logId` 정규화 (hex 및 protobuf base64 상호 대응).
  - 인증된 `integratedTime`과 리프 인증서 체인의 유효기간(`validFrom` ~ `validTo`) 일치 바인딩.
  - 공식 Cua 0.38.0 픽스처(`test/fixtures/cua-0.38.0.sigstore.json`)를 공식 Fulcio CA 및 Rekor 키로 종단 간 검증 성공.

---

## 2. 사용자가 실제 환경에서 수행해야 하는 작업 가이드

개발 워크스테이션 환경을 훼손하지 않기 위해, 실제 전역 도구 설치·하네스 실행·데스크톱 권한 획득·이전 버전 복구는 사용자가 복원 가능한 격리 환경(VM 등)에서 수행해야 합니다.

### [A] 검증 환경 요구사항
- **대상 환경**: 복원 가능한 Windows 11 VM 또는 독립된 테스트용 워크스테이션
- **런타임 요건**: Node.js `>=24.0.0`, npm `>=10.0.0`, Git
- **하네스 요건**: Codex 또는 Claude Code 하네스 설치
- **네트워크**: npm Registry (`registry.npmjs.org`) 및 GitHub Releases 접근 가능

---

### [B] 수행 작업 1: GSD 공식 릴리스 설치 및 실제 하네스 연동 검증

#### 1) 상태 및 미리보기 확인
```powershell
Set-Location <alpha-AOS-체크아웃-경로>
npm run build
node dist/src/cli.js inventory --tool gsd --detail
node dist/src/cli.js update --tool gsd --target codex --check
```
- **기대 결과**:
  - `inventory`: 현재 GSD 설치 상태 및 이력 표시.
  - `update --check`: GSD 1.20.1(또는 최신 공식 버전)을 계획하고, Codex 요청 시 공유 설치의 영향 범위(claude, codex, antigravity 등)를 명시.
  - 하단에 고유한 `--plan-digest` 및 `--reviewed-plan` 토큰이 포함된 적용 명령 제시.
  - 미설치 상태라면 `alpha-aos install --tool gsd` 안내와 함께 거부됨. (미설치 테스트 시 `install --tool gsd --target codex`로 미리보기 수행)

#### 2) 검토된 계획 적용 (Apply)
터미널에 출력된 실제 적용 명령어를 복사하여 실행합니다 (과거 토큰 사용 금지):
```powershell
node dist/src/cli.js update --apply --plan-digest <출력된-digest> --reviewed-plan <출력된-token> --tool gsd --target codex
```
- **기대 결과**:
  - npm registry에서 서명/무결성을 확인하고 글로벌 npm 설치 및 하네스 설정 구성 완료.
  - `catalog/` 내부 파일(`stack.lock.json` 등)은 전혀 수정되지 않음 (작업 디렉터리 클린 유지).

#### 3) 적용 결과 확인 및 하네스 재시작 검증
```powershell
node dist/src/cli.js inventory --tool gsd --detail
node dist/src/cli.js inventory --tool gsd --history
node dist/src/cli.js update --tool gsd --target codex --check
git diff -- catalog/
```
- **기대 결과**:
  - `inventory`: 방금 실행된 작업 ID와 설치된 GSD 버전이 기록됨 (호스트 검증 전이므로 verified는 null/미확인 유지).
  - `update --check`: 이미 설치된 버전과 일치하므로 `skip-unchanged` / 변경 없음으로 표시.
  - `git diff`: 변경 사항 없음(Clean).
- **실제 하네스 연동 확인**:
  1. Codex(또는 타깃 하네스)를 완전히 종료 후 재실행합니다.
  2. 별도의 테스트 프로젝트에서 하네스를 열고 `$gsd-help`를 입력합니다.
  3. GSD 도움말 및 서브커맨드 목록이 정상 출력되는지 확인합니다.

---

### [C] 수행 작업 2: Cua 드라이버 설치, GUI 데스크톱 권한 획득, 이전 버전 복구(Rollback) 검증

#### 1) Cua 릴리스 미리보기 및 적용
```powershell
node dist/src/cli.js inventory --tool cua-driver --detail
node dist/src/cli.js update --tool cua-driver --target codex --check
```
- **기대 결과**:
  - Cua 공식 GitHub Releases 출처, Sigstore 번들 검증, 설치 경로(`%LOCALAPPDATA%\Programs\Cua\cua-driver\bin`, `~/.cua-driver/packages/current`), 이전 버전 보존 정책(`CUA_DRIVER_RS_KEEP_VERSIONS: 2`)이 표시됨.
  - 출력된 `--plan-digest`와 `--reviewed-plan`을 포함하여 `update --apply` 실행.

#### 2) 실제 데스크톱 화면 캡처 및 제어 권한 검증
1. Codex를 재실행하고 Cua 컴퓨터 사용(GUI 권한)이 활성화된 세션을 시작합니다.
2. 스크린샷 조회 및 임의의 테스트 창 클릭 명령을 수행합니다.
- **기대 결과**:
  - Windows UAC 또는 데스크톱 캡처 권한이 정상 수락되고, 실제 화면 스크린샷 획득 및 마우스 포인터 클릭이 성공함.
  - 파일 존재 확인에 그치지 않고 실제 드라이버 호출이 정상 동작해야 함.

#### 3) 이전 버전 보존 확인 및 복구(Rollback) 검증
```powershell
Get-ChildItem -Path "$env:USERPROFILE\.cua-driver\packages\releases"
```
- **기대 결과**:
  - 새 버전 외에도 이전 정상 버전 디렉터리가 보존되어 있음 (`KEEP_VERSIONS: 2`).
  - Cua 드라이버의 이전 버전 패키지로의 심볼릭 링크/정션 전환 또는 재활성화 후 다시 스크린샷/클릭을 수행했을 때 정상 작동함을 확인.

---

## 3. 종합 판정 요약

1. **에이전트 자율 검증 범위**:
   - 코드 구현, 엄격 타입체크, 57개 타깃 테스트, 암호학적 Rekor 보안 프로브, 읽기 전용 CLI 동작, 카탈로그 불변성: **모두 PASS (결함 0건, 완료)**.
2. **사용자 환경 필수 검증 범위**:
   - 독립 VM 환경에서의 실제 전역 설치, 하네스 실행 및 `$gsd-help` 호출, 실제 데스크톱 GUI 제어 권한 획득, 이전 Cua 드라이버 복원: **사용자 매뉴얼 가이드 제공 (수동 게이트 대기)**.
