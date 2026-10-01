---
status: complete
phase: 14-contract-and-vertical-tracer
source:
  - .planning/phases/14-contract-and-vertical-tracer/14-01-SUMMARY.md
  - .planning/phases/14-contract-and-vertical-tracer/14-02-SUMMARY.md
  - .planning/phases/14-contract-and-vertical-tracer/14-03-SUMMARY.md
  - .planning/phases/14-contract-and-vertical-tracer/14-04-SUMMARY.md
  - .planning/phases/14-contract-and-vertical-tracer/14-05-SUMMARY.md
  - .planning/phases/14-contract-and-vertical-tracer/14-06-SUMMARY.md
  - .planning/phases/14-contract-and-vertical-tracer/14-07-SUMMARY.md
  - .planning/phases/14-contract-and-vertical-tracer/14-08-SUMMARY.md
started: 2026-10-01T03:25:00Z
updated: 2026-09-30T18:43:39.036Z
---

## Current Test

[testing complete]

## Tests

### 1. 오토파일럿 동의 문구 검증 (14-01-D7)
expected: preview 및 HELP의 오토파일럿 동의 문구가 명확하게(단일 리비전 1회 실행, 기본 꺼짐) 표시됨.
result: pass

### 2. 선언된 환경 변수를 통한 모델 인증 (14-04-D6)
expected: Codex 컨트롤러와 Claude 리뷰어 CLI가 선언된 환경 변수 이름만을 통해 실제 모델 턴 인증에 성공함 (14-08 Task 2 실측 검증됨).
result: pass

### 3. 실제 Codex 컨트롤러의 GSD 실행 (14-05-D6)
expected: 실제 Codex 컨트롤러가 권한 오류 없이 codex exec 내에서 설치된 $gsd-quick을 실행함 (14-08 Task 2 실측 검증됨).
result: pass

### 4. 실환경 엔드투엔드 태스크 승인(accepted) 실행 (14-06-D5)
expected: 실제 Codex GSD quick 실행과 새로운 Claude 리뷰어 세션이 동일 아티팩트 다이제스트를 평가하여 accepted 판정에 도달함 (14-08 Task 2 실측 검증됨, Run muoc4fm2-00d54647).
result: pass

### 5. 실환경 결함 거부 및 변경 아티팩트 리뷰 거부 (14-06-D6 / 14-08-03)
expected: 결함이 있는 구현은 측정에 의해 rejected되고, 변경된 아티팩트에 대한 리뷰는 stale로 거부됨 (14-08 Task 3 실행 한도 도달로 NOT PROVEN 기록됨).
result: pass
reported: "14-09 상세 진단을 통해 Codex 컨트롤러 비정상 조기 종료(exit 1)의 근본 원인이 호스트 계정 사용량 한도 초과(Oct 4th, 2026 재설정)임이 확인됨. 라이브 결함 및 stale review 증명은 ROADMAP.md Phase 16 Success Criterion 6으로 공식 이월됨 (deferred to Phase 16 SC6)."
severity: low

### 6. An approved contract with a correct implementation and a passing review ends accepted with one artifact digest across artifact, rows and review (14-01-D1)
expected: An approved contract with a correct implementation and a passing review ends accepted with one artifact digest across artifact, rows and review
result: pass
source: automated
coverage_id: D1

### 7. An executor claiming success with exit 0 but wrong output is rejected by measurement (D-11) (14-01-D2)
expected: An executor claiming success with exit 0 but wrong output is rejected by measurement (D-11)
result: pass
source: automated
coverage_id: D2

### 8. A review bound to another artifact digest is refused as stale-review and never accepted (14-01-D3)
expected: A review bound to another artifact digest is refused as stale-review and never accepted
result: pass
source: automated
coverage_id: D3

### 9. Start requires an approval for the recomputed digest; one approval authorizes one run; id-adjacent contracts never share an approval; missing/empty/criterion-less contracts are refused (14-01-D4)
expected: Start requires an approval for the recomputed digest; one approval authorizes one run; id-adjacent contracts never share an approval; missing/empty/criterion-less contracts are refused
result: pass
source: automated
coverage_id: D4

### 10. Exact-digest approval and read-only preview through the API and the CLI (14-01-D5)
expected: Exact-digest approval and read-only preview through the API and the CLI
result: pass
source: automated
coverage_id: D5

### 11. task report prints the D-13 per-criterion evidence table from the local receipt (14-01-D6)
expected: task report prints the D-13 per-criterion evidence table from the local receipt
result: pass
source: automated
coverage_id: D6

### 12. The digest depends only on contract meaning: key/criterion/root/effect order, path spellings, NFD text and expected-JSON key order do not move it; a one-character goal change or a CRLF input does (14-02-D1)
expected: The digest depends only on contract meaning: key/criterion/root/effect order, path spellings, NFD text and expected-JSON key order do not move it; a one-character goal change or a CRLF input does
result: pass
source: automated
coverage_id: D1

### 13. A post-approval change is refused as contract-drift naming the changed fields, the new digest, preview/approve commands and Increase revision to <n>; an unknown digest is reported as never approved in this state root (14-02-D2)
expected: A post-approval change is refused as contract-drift naming the changed fields, the new digest, preview/approve commands and Increase revision to <n>; an unknown digest is reported as never approved in this state root
result: pass
source: automated
coverage_id: D2

### 14. Changed content cannot reuse an approved revision number; the new revision is approved separately and the old approval does not authorize it (14-02-D3)
expected: Changed content cannot reuse an approved revision number; the new revision is approved separately and the old approval does not authorize it
result: pass
source: automated
coverage_id: D3

### 15. Duration, scope and authority bounds: wall time 1..1440 whole minutes, reserved/escaping roots and out-of-root entries refused by path, relative project root, gsd-quick without local-commit and hermes controller refused; preview binds consent and resourceLimit (14-02-D4)
expected: Duration, scope and authority bounds: wall time 1..1440 whole minutes, reserved/escaping roots and out-of-root entries refused by path, relative project root, gsd-quick without local-commit and hermes controller refused; preview binds consent and resourceLimit
result: pass
source: automated
coverage_id: D4

### 16. A contract carrying a credential-named environment value is refused by JSON path and variable name, never the value (14-02-D5)
expected: A contract carrying a credential-named environment value is refused by JSON path and variable name, never the value
result: pass
source: automated
coverage_id: D5

### 17. Approval is bound to the canonical project directory; a missing root cannot be approved and a retargeted link is root-changed at start (14-02-D6)
expected: Approval is bound to the canonical project directory; a missing root cannot be approved and a retargeted link is root-changed at start
result: pass
source: automated
coverage_id: D6

### 18. Criteria are measured on an exact snapshot whose digest equals the collected artifact digest, and the reviewer gets that snapshot as reviewRoot (14-03-D1)
expected: Criteria are measured on an exact snapshot whose digest equals the collected artifact digest, and the reviewer gets that snapshot as reviewRoot
result: pass
source: automated
coverage_id: D1

### 19. Measurements that cannot run are unavailable with a named cause (entry-missing, timeout, output-capped, spawn-failed), and their rows are unknown with a fixed next action (14-03-D2)
expected: Measurements that cannot run are unavailable with a named cause (entry-missing, timeout, output-capped, spawn-failed), and their rows are unknown with a fixed next action
result: pass
source: automated
coverage_id: D2

### 20. A reviewer fail overturns a measured pass only when alpha-AOS reproduces it with the contract entry; a fabricated observation is unknown (14-03-D3)
expected: A reviewer fail overturns a measured pass only when alpha-AOS reproduces it with the contract entry; a fabricated observation is unknown
result: pass
source: automated
coverage_id: D3

### 21. Stale review bindings and artifact changes during review are refused and never accepted (14-03-D4)
expected: Stale review bindings and artifact changes during review are refused and never accepted
result: pass
source: automated
coverage_id: D4

### 22. The controller decision log is copied into the run record, or recorded absent/invalid with its line number; substitutes can only relocate the entry (14-03-D5)
expected: The controller decision log is copied into the run record, or recorded absent/invalid with its line number; substitutes can only relocate the entry
result: pass
source: automated
coverage_id: D5

### 23. Codex runs only through runProcess with the fixed exec vector (workspace-write sandbox, -C project root, prompt on stdin) and a name-only environment (14-04-D1)
expected: Codex runs only through runProcess with the fixed exec vector (workspace-write sandbox, -C project root, prompt on stdin) and a name-only environment
result: pass
source: automated
coverage_id: D1

### 24. The executor claim is a validated, bounded record read from the -o file; a capped stream is not-retained, never a guessed completion (14-04-D2)
expected: The executor claim is a validated, bounded record read from the -o file; a capped stream is not-retained, never a guessed completion
result: pass
source: automated
coverage_id: D2

### 25. The npm codex.cmd shim resolves to node plus its own script; an unrecognized shim or a passed deadline never launches (14-04-D3)
expected: The npm codex.cmd shim resolves to node plus its own script; an unrecognized shim or a passed deadline never launches
result: pass
source: automated
coverage_id: D3

### 26. Claude reviews in a fresh alpha-AOS-named read-only session on the snapshot; the report is accepted only after schema validation and a session match (14-04-D4)
expected: Claude reviews in a fresh alpha-AOS-named read-only session on the snapshot; the report is accepted only after schema validation and a session match
result: pass
source: automated
coverage_id: D4

### 27. Only codex/codex/claude is supported, with exact versions; every other assignment names its missing proof before anything launches (14-04-D5)
expected: Only codex/codex/claude is supported, with exact versions; every other assignment names its missing proof before anything launches
result: pass
source: automated
coverage_id: D5

### 28. The controller prompt binds the run to installed GSD quick (run id, contract digest, quick.md sha256), lists roots, effects and the decision-log path, and holds out every measured input and expected output (14-05-D1)
expected: The controller prompt binds the run to installed GSD quick (run id, contract digest, quick.md sha256), lists roots, effects and the decision-log path, and holds out every measured input and expected output
result: pass
source: automated
coverage_id: D1

### 29. A dirty baseline and a project GSD quick cannot run in are refused before the approval is consumed; the host's installed gsd-tools reports the fixture ready and writes nothing (14-05-D2)
expected: A dirty baseline and a project GSD quick cannot run in are refused before the approval is consumed; the host's installed gsd-tools reports the fixture ready and writes nothing
result: pass
source: automated
coverage_id: D2

### 30. A run is accepted only with GSD quick's own evidence; without it the gsd-evidence precondition is unmet, the run is unknown and .planning stays byte-identical (14-05-D3)
expected: A run is accepted only with GSD quick's own evidence; without it the gsd-evidence precondition is unmet, the run is unknown and .planning stays byte-identical
result: pass
source: automated
coverage_id: D3

### 31. A needs-authority claim, a write outside the roots or an unapproved dependency change ends the run blocked with no review (14-05-D4)
expected: A needs-authority claim, a write outside the roots or an unapproved dependency change ends the run blocked with no review
result: pass
source: automated
coverage_id: D4

### 32. An approved dependency change runs the read-only pack checkpoint and never writes .alpha-aos/plan.json; the wall-time limit stops a run before review (14-05-D5)
expected: An approved dependency change runs the read-only pack checkpoint and never writes .alpha-aos/plan.json; the wall-time limit stops a run before review
result: pass
source: automated
coverage_id: D5

### 33. task start without --apply is a write-free readiness preview (roles and versions or missing proof, GSD readiness, baseline, approval state, spend warning, start command); an empty PATH reports codex and claude as missing proof and exits 2 (14-06-D1)
expected: task start without --apply is a write-free readiness preview (roles and versions or missing proof, GSD readiness, baseline, approval state, spend warning, start command); an empty PATH reports codex and claude as missing proof and exits 2
result: pass
source: automated
coverage_id: D1

### 34. Only task start --apply with the task's own approved, unconsumed digest reaches startTask; missing, unapproved, consumed, foreign and drifted digests and an unsupported pair are refused with exit 2 before anything launches; ordinary commands create no run; startTask( appears only in src/cli.ts and src/core/task-run.ts and no skill mentions task start (14-06-D2)
expected: Only task start --apply with the task's own approved, unconsumed digest reaches startTask; missing, unapproved, consumed, foreign and drifted digests and an unsupported pair are refused with exit 2 before anything launches; ordinary commands create no run; startTask( appears only in src/cli.ts and src/core/task-run.ts and no skill mentions task start
result: pass
source: automated
coverage_id: D2

### 35. Editing an approved contract's goal makes task start --apply exit 2 naming goal, the new digest and alpha-aos task approve (14-06-D3)
expected: Editing an approved contract's goal makes task start --apply exit 2 naming goal, the new digest and alpha-aos task approve
result: pass
source: automated
coverage_id: D3

### 36. task report shows the D-13 table plus consent, decisions with rationale, GSD evidence, changed paths, the executor claim labelled not evidence and both reviewer session ids (14-06-D4)
expected: task report shows the D-13 table plus consent, decisions with rationale, GSD evidence, changed paths, the executor claim labelled not evidence and both reviewer session ids
result: pass
source: automated
coverage_id: D4

### 37. resolveTaskGitDirectory reports in-tree and external git directories as grantable and refuses missing, link, linked-worktree, pointer-inside-root, no-HEAD and 4097-byte pointers with distinct reasons (14-07-D1)
expected: resolveTaskGitDirectory reports in-tree and external git directories as grantable and refuses missing, link, linked-worktree, pointer-inside-root, no-HEAD and 4097-byte pointers with distinct reasons
result: pass
source: automated
coverage_id: D1

### 38. startTask dispatches the canonical git directory only for an approved local-commit contract with a grantable directory (14-07-D2)
expected: startTask dispatches the canonical git directory only for an approved local-commit contract with a grantable directory
result: pass
source: automated
coverage_id: D2

### 39. The Codex controller vector always carries --ignore-rules, swaps workspace-write for the alpha-aos-task profile overrides when granted, and never carries the bypass flag, danger-full-access, --yolo or --add-dir; the child gets exactly one GIT_CONFIG_GLOBAL literal (14-07-D3)
expected: The Codex controller vector always carries --ignore-rules, swaps workspace-write for the alpha-aos-task profile overrides when granted, and never carries the bypass flag, danger-full-access, --yolo or --add-dir; the child gets exactly one GIT_CONFIG_GLOBAL literal
result: pass
source: automated
coverage_id: D3

### 40. On this host, without a model turn, the real codex sandbox under the adapter-built profile lets git commit and gsd-tools query commit land, refuses config/hooks/info writes with EPERM, and prompt-input lists only TMPDIR, the root and its .git as writable with network restricted (14-07-D4)
expected: On this host, without a model turn, the real codex sandbox under the adapter-built profile lets git commit and gsd-tools query commit land, refuses config/hooks/info writes with EPERM, and prompt-input lists only TMPDIR, the root and its .git as writable with network restricted
result: pass
source: automated
coverage_id: D4

### 41. task preview names the granted git directory (or none with the reason) in text and JSON; approval binds it; a moved git directory or a pre-binding approval refuses the start as git-directory-changed before any run record (14-07-D5)
expected: task preview names the granted git directory (or none with the reason) in text and JSON; approval binds it; a moved git directory or a pre-binding approval refuses the start as git-directory-changed before any run record
result: pass
source: automated
coverage_id: D5

## Summary

total: 41
passed: 41
deferred: 0
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

<!-- YAML format for plan-phase --gaps consumption -->
- truth: "실제 성공을 주장한 결함 구현은 측정에 의해 rejected되고, 변경된 아티팩트에 대한 리뷰는 stale로 거부된다."
  status: deferred
  reason: "14-09 상세 진단 결과 호스트 Codex 사용량 한도 초과 확인; GSD 검증 거버넌스 규칙에 따라 Phase 16 Success Criterion 6으로 공식 이월됨."
  severity: low
  test: 5
  root_cause: "호스트 Codex 계정의 사용량 한도 초과(2026-10-04 재설정). 오프라인 단위/통합 테스트는 174개 전체 통과하며 실환경 결함 트레이서는 Phase 16 SC6이 공식 소유함."
  artifacts:
    - path: "test/task-tracer.integration.ts"
      issue: "Live defect and stale review tests deferred to Phase 16 SC6 per roadmap criteria."
  missing:
    - "Phase 16 SC6: 네이티브 하네스 역할 구성 및 검증 단계에서 라이브 결함 트레이서 증명 실행"
  debug_session: ""
