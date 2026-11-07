# Phase 40 자동 검증 결과와 남은 확인

검증 환경: Windows x64, Node.js v24.13.1, `D:\dev\alpha-AOS` 소스 체크아웃.
실제 도구 업데이트는 수행하지 않았다. CLI 미리보기는 공식 원격 메타데이터를
조회했고, 적용·기록·거부 경로는 격리 테스트와 읽기 전용 부정 테스트로 확인했다.

## 통과한 항목

| 확인 | 결과와 범위 |
|---|---|
| 빌드 | `npm run build` 종료 0. TypeScript 컴파일 포함 |
| 대상 테스트 | 6개 테스트 파일, 40 pass / 0 fail / 0 skip |
| API coverage 사전 게이트 | 10개 항목, 6 INTEGRATE / 4 OPT-OUT, 통과 |
| 실제 `update --check` | 종료 0, 네 구역의 변경 계획·미설치 skip·검토 바인딩 명령 표시 |
| 실제 GSD/Codex 미리보기 필터 | 종료 0, GSD만 표시하고 다른 하네스의 공유 영향도 표시 |
| 검토 없는 `update --apply`, `install --apply` | 각각 종료 2, 두 검토 인자를 요구하며 거부 |
| `update --stage` | 종료 2, 폐기 안내 |
| CLI 전후 catalog 보존 | stack.lock.json / candidate.lock.json / computer-use-runtime.json SHA-256 동일 |
| 격리 fixture | 무변경 프리뷰, prerelease/불완전 조회 거부, 버전 고정 조회, 로컬 drift 거부, current no-op, 기록의 verified:null 및 accepted 보존 등 기존 테스트 통과 |

대상 테스트 재현:

```powershell
Set-Location D:\dev\alpha-AOS
npm run build
node scripts/run-tests.mjs --files dist/test/local-release-update.test.js dist/test/cua-release-update.test.js dist/test/update.test.js dist/test/computer-use-install.test.js dist/test/tool-inventory-cli.test.js dist/test/tool-inventory-compat.test.js
```

## 전체 회귀 실행의 한계와 실패

`node scripts/run-tests.mjs`도 실행했다. 10분 넘게 실행했으나 최종 요약을
얻지 못해, PID와 시작 시각을 검증한 이번 실행의 프로세스 트리를 종료했다.
runner 종료 코드는 1이며 **전체 회귀는 미완료**다. 종료 전후 로그에서 실패 표시
21개를 관찰했지만 이는 완료된 테스트 실행의 최종 fail 집계가 아니다.
Windows 별도 프로세스 테스트들과 packed fixture는 실행 완료를 입증하지 못했다.
종료 직전의 활성 테스트는 시간이 흐르며 바뀌었으므로 특정 테스트의 무한 정지를
확정한 것은 아니다.

추가로 원인을 확인한 항목:

- behavior-policy: 테스트가 invocationPath/stateRoot를 격리하지 않아 현재 저장소의
  tree-off가 invalid-json 등의 예상 오류보다 먼저 발생한다. 이 환경에서 작은
  malformed JSON fixture로 tree-off 응답을 재현했다. 제품의 저장소 제외 설정을
  해제하지 말고 테스트의 호출 위치/상태 격리를 보완해야 한다.
- computer-use-research: 연구 증거와 catalog의 자산 배열을 deep-equal 비교하는
  검사에서 installedFiles/installedEntrypoint/installerArchiveSha256 필드 불일치가
  발생한다. 독립 실행으로도 실패했다.
- path-literal-guard: test/tool-bindings.test.ts:44의 Windows 고정 경로가 검사에 걸린다.

그 밖에 offline status, entry 문서/패키지 증거, task progression 등에서도 실패
표시가 있었으며 원인은 미진단이다. 비교 기준 checkout 실행은 하지 않았으므로
이번 구현이 원인인지 기존 실패인지 단정하지 않는다. 전체 실패 이름은
40-AUTOMATED-EVIDENCE.json의 fullSuite.observedFailureLines에 보존했다.

전체 회귀 재실행은 동일한 Windows 환경에서 다음 명령으로 가능하다:

```powershell
node scripts/run-tests.mjs
```

예상 통과 기준은 정상 종료, 최종 fail 0, 취소 없음이다. host 권한/플랫폼 때문에
실행하지 못한 fixture는 skip 이유를 검토하고 통과와 구분해야 한다.

## 재현한 결함

| ID | 중요도 | 실제 관찰 | 필요한 보완 |
|---|---|---|---|
| G-40-7 | blocker | 자체 서명 테스트 인증서로 임의 payload에 서명한 번들을 `verified:true`로 수락. 인증서는 자기 키로 검증되고 투명성 로그 증거도 없음 | 신뢰 체인·인증된 서명 시점 증거·정확한 issuer/workflow 및 실제 번들 형식 검증. 자체 서명 거부 회귀 테스트 |
| G-40-5 | major | default preview의 skip-absent MCP 3개가 selectedTools에 남음. Context7-only 계획도 빈 Codex 설정에 Exa/Firecrawl을 포함 | changedTools만 오케스트레이션하고 MCP selected IDs를 계획·fixture·재계획·적용 전체에 전달 |
| G-40-8 | major | 실제 미리보기 토큰을 재검증하면서 exact-version 응답에 version만 주어도 성공 | dist.integrity 필수·형식·일치 검증 후에만 진행 |

테스트 40개 통과가 이 세 결함의 부재를 의미하지 않는다. 별도 부정 테스트로
기존 테스트의 사각지대를 확인했다. 근거는 `40-AUTOMATED-EVIDENCE.json`에 보존했다.
수정 실행 계획은 `40-03-PLAN.md`이며, 아직 실행하지 않았다. 계획은 현재 에이전트가
진단과 대조해 검토했으며 독립 서브에이전트 검토는 수행하지 않았다.

표시 개선 후보: 설치는 관찰했으나 버전을 확인할 수 없는 GSD/ECC/Cua가
`Current/Accepted: none`으로 표시됐다. 미설치와 버전 미확인을 구분하는 문구가 필요하다.

## 사람이 실제 환경에서 확인할 항목

현재의 세 결함을 수정하고 회귀 검증한 다음 실제 설치 검증을 진행한다.
그 전에는 아래 미리보기·조회 명령까지만 실행한다.

환경은 Windows 11의 별도 사용자 또는 복원 가능한 VM이 적합하다. Node.js >=24,
npm >=10, Git, Codex 등 선택한 하네스, npm Registry/GitHub 네트워크 접근이 필요하다.
실제 하네스 설정·사용자 PATH·설치 디렉터리를 변경하는 확인이므로 단순히
ALPHA_AOS_STATE_DIR만 바꾸는 것으로 전체 설치 환경이 격리되지는 않는다.

### 1. 미리보기와 설치 대상 확인

```powershell
Set-Location D:\dev\alpha-AOS
npm run build
node dist/src/cli.js inventory --tool gsd --detail
node dist/src/cli.js update --tool gsd --target codex --check
```

예상: 선택한 도구만 계획되며 요청한 Codex와 공유 설치의 다른 영향 범위가
표시된다. 미설치 도구에는 `install --tool gsd` 안내가 나온다. 미설치 설치를
확인할 때는 `node dist/src/cli.js install --tool gsd --target codex`로 새 미리보기를
만든다. 구버전 도구가 있어야 실제 update 경로를 관찰할 수 있다.

### 2. 검토한 변경 적용과 기록

결함 수정 후 1번 미리보기가 출력한 적용 명령 전체를 그대로 실행한다.
`--plan-digest`와 `--reviewed-plan`은 그 환경에서 새로 생성된 값을 사용한다.
이 보고서의 오래된 토큰을 재사용하지 않는다.

```powershell
node dist/src/cli.js inventory --tool gsd --detail
node dist/src/cli.js inventory --tool gsd --history
node dist/src/cli.js update --tool gsd --target codex --check
git diff -- catalog/stack.lock.json catalog/candidate.lock.json catalog/computer-use-runtime.json
```

예상: 검토한 버전만 설치되고 작업 ID/결과 이력이 남는다. 호스트 호출을
검증하지 않은 상태는 accepted/verified 완료로 승격되지 않는다. catalog diff는
없어야 한다. 설치 버전이 실제로 식별되는 환경에서는 재조회가 current여야 한다.
버전이 unknown으로 남으면 멱등성 통과로 간주하지 말고 별도 관찰 결과로 기록한다.

Codex를 새로 열어 해당 테스트 프로젝트에서 GSD 명령 검색과 읽기 전용
`$gsd-help`를 실행한다. 예상: 명령이 발견되고 도움말이 정상 표시된다.
이 단계는 파일 존재 확인보다 실제 하네스 로딩을 확인하는 증거다.

### 3. Cua 실제 호출·권한·복구

복원 가능한 Windows 데스크톱 세션에서 다음을 실행한다.

```powershell
node dist/src/cli.js inventory --tool cua-driver --detail
node dist/src/cli.js update --tool cua-driver --target codex --check
```

결함 수정 후 검토한 적용 명령을 실행하고 Codex를 재시작한다. GUI 접근을
명시적으로 허용한 테스트에서 Cua로 데스크톱 상태 조회와 테스트 창의 단순 클릭을
수행한다. 예상: 권한 요청을 정상 처리하고 올바른 창에서 상태 조회/클릭이 성공한다.
스크린샷 또는 클릭을 수행하지 않은 상태는 GUI 통합 성공으로 기록하지 않는다.

이전 정상 버전이 존재하는 환경에서 새 버전 적용 후 그 디렉터리가 보존되는지
확인하고, 미리보기의 adapter recovery 안내와 공식 설치 도구의 해당 버전 복원
절차로 이전 버전을 다시 활성화한 뒤 같은 호출을 반복한다. 이전 버전이 없는
신규 설치는 복구 검증 증거가 될 수 없다. 이 저장소는 여기서 사용할 단일 복구
명령을 보장하지 않으므로 임의의 junction/PATH 변경 명령을 사용하지 않는다.

macOS 권한과 Linux Wayland는 현재 Windows에서 실증하지 못했다. 지원 범위를
확인하려면 각 OS의 실제 데스크톱/VM과 해당 아키텍처에서 같은 미리보기·실제
Cua 호출·이전 버전 복구를 수행하고, macOS 접근성/화면 권한 및 Linux 디스플레이
세션에서 요청이 정상 처리되는지 기록해야 한다.

## 상태와 근거

UAT: 8개 중 자동 통과 4, 결함 3, 실제 호스트 확인 blocked 1. `40-UAT.md`는
partial이며 단계 완료로 승격하지 않았다. 정식 `40-VERIFICATION.md`도 아직 없다.
SUMMARY들은 커밋 측정 기준점이 없는 legacy 형식이라 커밋 수의 엄밀한 대조는
불가능하며, 이는 테스트 실패와 별개의 증거 제한이다.

상세 터미널 로그 위치는 `40-AUTOMATED-EVIDENCE.json`의 logs 필드에 기록했다.
