---
status: partial
phase: 40-local-official-release-updates
source: [40-01-SUMMARY.md, 40-02-SUMMARY.md, 40-03-SUMMARY.md]
started: 2026-11-07T18:05:59.1541138Z
updated: 2026-11-08T04:01:53.393Z
---

## Current Test

[testing complete]

## Tests

### 1. 공식 릴리스 업데이트 미리보기
expected: `node dist/src/cli.js update --check`는 버전·출처, 영향 범위, 설치 부작용, 복구 범위를 포함한 계획을 표시합니다. 최신/미설치 도구와 조회 실패를 구분하고, 적용 가능하면 두 검토 인자가 포함된 명령을 표시하며 실제 설치는 수행하지 않습니다.
result: pass
source: automated

### 2. 도구와 하네스 선택
expected: `node dist/src/cli.js update --tool gsd --target codex --check`는 선택한 도구와 하네스 기준으로 계획을 표시하고 공유 설치가 다른 하네스에도 영향을 주면 그 범위를 알립니다. GSD가 미설치라면 install --tool gsd 안내로 거부합니다.
result: pass
source: automated

### 3. 검토 없는 적용 거부
expected: `node dist/src/cli.js update --apply`와 `node dist/src/cli.js install --apply`는 --plan-digest와 --reviewed-plan을 요구하며 실제 변경 전에 거부됩니다.
result: pass
source: automated

### 4. 폐기된 stage 옵션 안내
expected: `node dist/src/cli.js update --stage`는 옵션 폐기 안내와 함께 실패하고 candidate.lock.json을 생성하거나 변경하지 않습니다.
result: pass
source: automated

### 5. 검토한 계획 적용과 재실행
expected: 미리보기에서 제시된 적용 명령은 검토한 버전과 대상만 적용합니다. 검토 후 로컬 상태나 릴리스 메타데이터가 바뀌면 plan-drift로 거부하며, 이미 최신이면 변경 없이 종료합니다. 실제 적용을 원하지 않거나 전제조건을 마련할 수 없으면 이유와 함께 skip으로 응답할 수 있습니다.
result: pass
source: automated

### 6. 적용 기록과 복구 정보
expected: 실제 적용 후 inventory의 해당 도구 상세/이력에서 작업 기록과 설치 상태를 확인할 수 있습니다. 호스트 검증을 하지 않은 결과는 검증 완료로 승격되지 않으며 저장소 catalog 파일은 바뀌지 않습니다. Cua 변경 시 이전 정상 버전 보존과 복구 범위가 안내됩니다. 해당 변경을 수행하지 않았다면 이유와 함께 skip으로 응답할 수 있습니다.
result: blocked
blocked_by: other
reason: "격리 테스트의 tool-records/accepted 보존은 통과했으나 실제 워크스테이션 설치·호스트 호출·이전 Cua 버전 복원은 미수행. live workstation install은 정책상 수동 항목으로 보존."

### 7. Cua 공식 서명 신뢰 검증
expected: 자체 서명 인증서와 투명성 로그 증거가 없는 번들은 공식 배포자로 인정하지 않고 변경 전에 거부합니다.
result: pass
source: automated

### 8. 누락된 npm 무결성 메타데이터 거부
expected: 정확한 버전 재조회 응답의 dist.integrity가 없거나 유효하지 않으면 변경 전에 plan-drift로 거부합니다.
result: pass
source: automated

### 9. Rekor 증거의 암호학적 인증과 인증서 시각 바인딩
expected: 위조 SET, 인증서 유효기간 밖의 로그 시각, body/포함 증거가 없는 tlog를 변경 전에 거부합니다.
result: issue
source: automated
reported: "40-REKOR-PROBE.mjs: 테스트 CA로 서명한 payload에 위조 SET와 유효하지 않은 Rekor 공개 키를 주어도 verified:true. integratedTime=1 및 body/proof/time 없는 tlog도 verified:true. 운영 Fulcio 키 위조를 입증한 것은 아니며, 로그 인증 검증 누락을 재현함."
severity: blocker

## Summary

total: 9
passed: 7
issues: 1
pending: 0
skipped: 0
blocked: 1

## Gaps

- gap_id: G-40-5
  truth: "검토한 변경 도구와 선택한 MCP 서버만 적용한다"
  status: resolved
  resolved_by: 40-03-PLAN.md
  resolved_at: 2026-11-08
  severity: major
  test: 5
  reason: "Automated probe: skip-absent IDs remain selected; Context7-only plan includes Exa and Firecrawl"
  root_cause: "applyLocalReleasePlan forwards payload.selectedTools instead of changedTools; managed MCP planning omits selected server IDs"
  artifacts: [src/core/update.ts, src/core/install.ts]
  missing: [changed-tool orchestration, MCP server selection through plan and apply]
  resolution: "applyLocalReleasePlan passes only revalidated changed tools; createManagedInstallPlan, createManagedInstallOperationPlan, and applyManagedInstall propagate selectedMcpServers to planMcpSync, canary fixtures, and apply."
- gap_id: G-40-7
  truth: "공식 신뢰 체인과 증거가 없는 Cua 서명을 거부한다"
  status: resolved
  resolved_by: 40-03-PLAN.md
  resolved_at: 2026-11-08
  severity: blocker
  test: 7
  reason: "Automated probe: self-signed certificate without transparency evidence accepted"
  root_cause: "verifyCuaSigstoreBundle trusts a supplied leaf key and matches issuer bytes/SAN text without validating the certificate trust chain or transparency evidence"
  artifacts: [src/core/computer-use-install.ts, test/cua-release-update.test.ts]
  missing: [trusted issuer verification, structured identity checks, untrusted-certificate negative regression]
  resolution: "verifyCuaSigstoreBundle verifies certificate against embedded Fulcio Root/Intermediate CA, rejects self-signed certificates, validates Rekor log ID and entry hash, and checks structured OIDC issuer and SAN URI extensions."
- gap_id: G-40-8
  truth: "누락되거나 변경된 npm integrity를 적용 전에 거부한다"
  status: resolved
  resolved_by: 40-03-PLAN.md
  resolved_at: 2026-11-08
  severity: major
  test: 8
  reason: "Automated probe: exact-version metadata without dist.integrity accepted"
  root_cause: "Integrity comparison only runs when dist.integrity is already a string"
  artifacts: [src/core/update.ts]
  missing: [mandatory integrity validation, missing and invalid metadata regressions]
  resolution: "revalidateLocalReleasePlan requires data.dist.integrity to be a valid sha512 SRI string and equal tool.integrity, throwing plan-drift on missing dist, absent/null/non-string integrity, malformed integrity, or drifted integrity."
- gap_id: G-40-9
  truth: "Rekor 로그 증거와 인증서 유효 시각을 인증한 뒤에만 Cua를 verified로 판정한다"
  status: failed
  severity: blocker
  test: 9
  reason: "위조 SET, 유효기간 밖 integratedTime, body/proof/time 없는 tlog가 모두 verified:true로 수락됨"
  root_cause: "verifyCuaSigstoreBundle은 Rekor ID 및 일부 필드만 검사한다. rekorPublicKeyPem으로 SET 서명을 검증하지 않고, tlog 분기는 body를 선택적으로 검사하며, 인증된 integratedTime과 X.509 유효기간을 대조하지 않는다."
  artifacts: [src/core/computer-use-install.ts, test/cua-release-update.test.ts, 40-REKOR-PROBE.mjs]
  missing: [cryptographic Rekor evidence verification, certificate time binding, body/signature/certificate binding, complete official positive fixture, negative regressions]
