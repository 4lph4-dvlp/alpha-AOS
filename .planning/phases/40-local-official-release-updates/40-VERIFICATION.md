---
phase: 40-local-official-release-updates
verified: 2026-11-08T19:56:00.000Z
status: passed_with_manual_gate
score: 8/9 UAT checks passed (1 manual gate blocked)
---

# Phase 40 Verification

**판정: 자동화 검증 PASS (에이전트 자율 수행 완료), 워크스테이션 라이브 검증 보류 (사용자 수동 게이트).**

현재 소스 `ffc1877`에서 빌드와 타입검사 종료 0, 대상 7개 파일의 57개 테스트
통과(실패/skip/cancel 0), 공식 메타데이터를 사용하는 실제 CLI 미리보기 및
잘못된 적용 인자 거부를 확인했다. catalog 3개 파일의 실행 전후 SHA-256은 불변이다.

UAT는 8 pass / 0 issue / 1 blocked.
직전 세션의 blocker G-40-9(Rekor SET 서명 검증, inclusionProof/Promise 증거 요구,
인증된 로그 시각과 인증서 유효기간 바인딩)는 `40-04-PLAN.md`에서 완전히 해결되었다.
RFC 8785 canonical JSON 직렬화와 SET 암호학적 서명 검증, `integratedTime`과
인증서 `validFrom` ~ `validTo` 시각 바인딩이 구현되었으며, `40-REKOR-PROBE.mjs`의
3개 적대적 프로브가 모두 `rejected: true`로 차단됨을 확인했다.
또한 공식 Fulcio CA 및 Rekor 루트를 통한 공식 Cua 0.38.0 픽스처 종단 간 검증이 통과되었다.

기존 G-40-5, G-40-7, G-40-8, G-40-9 4개 갭 모두 `resolved` 상태이다.

단, 실제 개발 워크스테이션의 전역 환경 오염 방지를 위해, 실제 호스트에서의
`update --apply` 실행, 하네스(Codex 등) 재시작 관찰, Cua 드라이버의 실제 데스크톱
화면 캡처/제어 권한 획득, 그리고 이전 버전으로의 복원(Rollback)은 사용자 수동
게이트로 유지된다.

필요한 환경, 실행 명령, 기대 결과는 `40-VERIFY-REPORT.md`에 정리했다.
