# Phase 40 재검증 결과

최종 판정: **보완 필요 — 최종 PASS 아님**.
검증 기준 커밋: `7cf6e40a6261f980306ecd95f815ba9d105a71b5`.
환경: Windows x64, Node.js v24.13.1, 2026-11-08.
사용자 요청에 따라 기존 UAT를 이어서 자동 실행 가능한 검사를 직접 수행했다.
실제 설치, 하네스 재시작, GUI 권한 변경, 이전 Cua 버전 재활성화는 수행하지 않았다.

## 직접 확인한 결과

| 검사 | 결과 |
|---|---|
| `npm run build` | PASS, 종료 0 |
| `npm run check` | PASS, 종료 0 |
| 관련 테스트 7개 파일 | 57 pass / 0 fail / 0 skip / 0 cancelled, 종료 0 |
| API coverage 사전 게이트 | PASS, 10개 항목: INTEGRATE 6 / OPT-OUT 4 |
| 실제 `update --check` | 종료 0, 변경 계획·영향 하네스·부작용·복구 범위·검토 인자 표시 |
| `update --tool gsd --target codex --check` | 종료 0, GSD만 계획하고 공유 영향 하네스 표시 |
| 검토 인자 없는 `update --apply`, `install --apply` | 각각 종료 2, 적용 전에 거부 |
| 폐기된 `update --stage` | 종료 2, 폐기 안내 |
| `inventory --tool gsd --detail` | 종료 0, 설치 관찰과 버전/검증 미확인을 구분 |
| CLI 실행 전후 catalog 3개 파일 | SHA-256 동일 |
| 추가 Rekor 부정 검사 | **FAIL: 거부해야 할 3개 입력 모두 verified:true** |

재현:

```powershell
Set-Location D:\dev\alpha-AOS
npm run build
npm run check
node scripts/run-tests.mjs --test-timeout=120000 --files dist/test/local-release-update.test.js dist/test/cua-release-update.test.js dist/test/install.test.js dist/test/computer-use-install.test.js dist/test/update.test.js dist/test/tool-inventory-cli.test.js dist/test/tool-inventory-compat.test.js
node .planning/phases/40-local-official-release-updates/40-REKOR-PROBE.mjs
```

현재 마지막 명령의 종료 1은 결함 재현 성공이다. 수정 후에는 세 입력이 모두
rejected:true이고 종료 0이어야 한다. 원래 테스트 57개 통과와 이 부정 검사의
실패는 서로 모순되지 않는다. 기존 테스트가 이 조건을 충분히 검사하지 않는다.

## 발견한 보완: G-40-9 (blocker)

`src/core/computer-use-install.ts`의 `verifyCuaSigstoreBundle`은 Rekor 공개 키로
SET 서명을 확인하지 않는다. 로그 ID/필드 일부만 검사하고, modern tlog 분기는
body 없는 항목도 허용하며, 로그 시각과 인증서 유효기간을 대조하지 않는다.

격리 재현은 저장소에 이미 있는 공개 테스트 CA/서명 키를 사용한다. 올바른
테스트 CA 체인과 payload 서명을 주되 다음 입력을 만들었다:

1. 임의의 SET 서명과 유효하지 않은 Rekor 공개 키 → verified:true.
2. 인증서 발급 전인 integratedTime=1 → verified:true.
3. body, 시각, promise/proof 없는 tlog → verified:true.

이는 운영 Fulcio 개인 키 위조나 임의 운영 바이너리 설치 성공을 입증한 것이
아니다. **투명성 로그 인증과 인증된 시각 바인딩이 구현되지 않았음**을 입증한다.
기존 self-signed 거부는 여전히 통과한다. 그 이전 결함을 재개방하지 않고
새 gap G-40-9로 분리했다.

추가로 기존의 'official bundle authenticates' 테스트는 CA 체인/로그 필드 검사와
잘못된 payload 거부를 확인한다. 실제 일치하는 공식 payload의 전체 검증 성공을
확인하지 않으므로 이를 보완 계획의 필수 양성 검사로 포함했다.

수정 계획: `40-04-PLAN.md`. 현재 에이전트가 코드·재현·계획의 대응을 검토했다.
독립 서브에이전트 검토 및 수정 실행은 수행하지 않았다.
다음 구현 경로: `$gsd-execute-phase 40 --gaps-only`, 이후 `$gsd-verify-work 40`.

## 사용자가 실제 환경에서 확인할 항목

필요한 이유: 실제 업데이트는 해당 환경에서 생성한 계획을 검토·적용해야 하고,
하네스 재시작 및 데스크톱 권한/호출, 이전 설치로의 복구를 관찰해야 한다.
현재 세션에서는 그 작업을 실행하지 않았다. 실제 Cua 적용은 G-40-9 수정과
음성/양성 회귀 통과 후에 진행한다.

### 환경 준비

복원 가능한 Windows 11 VM 또는 별도 사용자 환경. Node.js >=24, npm >=10,
Git, Codex, npm Registry/GitHub 접근이 필요하다. 실제 update를 확인하려면
구버전 GSD/Cua가 설치되어 있어야 한다. Cua 복구는 이전 정상 버전도 필요하다.
VM에서는 소스 체크아웃 실제 경로로 아래 Set-Location을 바꾼다.
ALPHA_AOS_STATE_DIR만 바꾸는 것은 전역 npm/하네스/PATH 격리가 아니다.

### GSD 설치·기록·실제 하네스 호출

```powershell
Set-Location D:\dev\alpha-AOS
npm run build
node dist/src/cli.js inventory --tool gsd --detail
node dist/src/cli.js update --tool gsd --target codex --check
```

기대: GSD만 계획하고 버전·출처·공유 영향 범위를 표시한다. 미설치라면
`install --tool gsd` 안내로 거부한다. 미설치 경로를 확인하려면 아래로 미리본다:

```powershell
node dist/src/cli.js install --tool gsd --target codex
```

출력한 계획을 검토한 뒤 **그 환경에서 새로 출력된 적용 명령 전체**를 실행한다.
`--plan-digest`와 `--reviewed-plan`을 임의 값이나 이 보고서의 과거 값으로 대체하지
않는다. alpha-aos 실행 파일 대신 `node dist/src/cli.js`를 사용해도 된다.

```powershell
node dist/src/cli.js inventory --tool gsd --detail
node dist/src/cli.js inventory --tool gsd --history
node dist/src/cli.js update --tool gsd --target codex --check
git diff -- catalog/stack.lock.json catalog/candidate.lock.json catalog/computer-use-runtime.json
```

기대: 검토한 버전만 설치, 작업 ID/결과 이력 생성, catalog diff 없음.
실제 호스트 검증 전 verified/accepted 승격 없음. 설치 버전이 식별되면 재미리보기는
current/변경 없음이어야 한다. 버전 unknown이면 멱등성 PASS로 간주하지 않는다.
Codex를 종료 후 다시 열고 **별도 테스트 프로젝트**에서 `$gsd-help`를 실행한다.
기대: 명령이 발견되고 도움말이 정상 출력된다. 결과와 설치 버전/작업 ID를 기록한다.

### Cua 호출·권한·이전 버전 복구

G-40-9 수정 검증 후, 복원 가능한 실제 데스크톱 세션에서:

```powershell
node dist/src/cli.js inventory --tool cua-driver --detail
node dist/src/cli.js update --tool cua-driver --target codex --check
```

새로 표시된 계획과 복구 범위를 검토하고 적용 명령을 실행한다. Codex를 재시작하고
GUI 접근을 허용한 테스트에서 Cua로 데스크톱 상태/스크린샷 조회와 테스트 창의
단순 클릭을 수행한다. 기대: 권한 처리가 정상이고 지정 창에서 조회/클릭 성공.
파일 존재나 CLI 도움말만으로 GUI 통합 PASS를 기록하지 않는다.

업데이트 전후 `~/.cua-driver/packages/releases/` 목록과 inventory를 비교해 이전
정상 버전 디렉터리 보존을 확인한다. 계획의 adapter recovery와 공식 설치 도구의
해당 버전 복원 절차로 이전 버전을 재활성화하고 같은 조회/클릭을 반복한다.
기대: 이전 바이너리 버전이 실제 활성화되고 호출이 성공한다. 저장소가 보장하는
단일 복원 명령은 없으므로 임의의 junction/PATH 변경 명령을 제시하지 않는다.
신규 설치만으로 이전 버전 복구 PASS를 얻을 수는 없다.

macOS/Linux 네이티브 동작까지 확인하려면 각 OS의 실제 데스크톱/VM에서 같은
미리보기·적용·상태 조회·클릭·이전 버전 재활성화를 반복한다. macOS는 화면 기록/
접근성 권한, Linux는 실제 Wayland/X11 세션이 필요하다. Windows의 tar.gz/계획
fixture 통과를 해당 OS의 실제 호출 성공으로 확대하지 않는다.

## 상태와 검증 범위

UAT 9개: **7 PASS / 1 issue / 1 blocked**. 상태 partial, 단계 완료로 승격하지 않음.
정식 `40-VERIFICATION.md`에는 gaps_found를 기록했다. 기존 STATE의 '완료' 주장은
이번 결과와 일치하지 않아 현재 상태를 보완 필요로 갱신한다.

전체 회귀는 이번에 재실행하지 않았다. 앞선 전체 실행은 미완료 및 실패 관찰이
있으며 그 역사적 증거는 `40-AUTOMATED-EVIDENCE.json`에 남아 있다. 새 결과는
`40-REVERIFY-EVIDENCE.json`이다. 전체 통과를 주장하지 않는다. 필요 시 별도 실행:

```powershell
node scripts/run-tests.mjs
```

기대: 최종 fail 0, cancelled 0, 정상 종료. 플랫폼 skip은 이유를 별도로 검토한다.
기존 실패의 이번 변경 귀속은 비교 기준 실행 없이 단정하지 않는다.
SUMMARY 3개는 coverage/plan_head_before/after 없는 legacy 형식이며 커밋 수를
정밀 대조할 수 없다. 이는 증거 제한으로 기록하고 임의의 PASS를 생성하지 않았다.
웹 UI 산출물/UI-SPEC은 없어 브라우저 시각 UAT는 해당 없음이다.
'Current/Accepted: none'으로 버전 미확인 설치를 표시하는 문구 개선 후보는 남아 있다.
