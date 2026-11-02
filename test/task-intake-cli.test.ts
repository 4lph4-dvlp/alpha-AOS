import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import {
  createIsolatedSandbox,
  fingerprintManifest,
} from "./helpers/packed-sandbox.js";
import {
  TASK_EXECUTION_STYLES,
  renderTaskStyleQuestion,
  resolveTaskStyleAnswer,
} from "../src/core/task-intake.js";

const cliPath = join(import.meta.dirname, "..", "src", "cli.js");

test("task intake CLI tracer: classifies strict task, shows exact 6 ordered choices, zero writes (ENTRY-01, ENTRY-05, D-01, D-05, D-06, D-18)", async (context) => {
  const sandbox = await createIsolatedSandbox(context);
  const projectDir = join(sandbox.home, "tracer-project");
  await mkdir(projectDir, { recursive: true });

  const inputPayload = {
    schemaVersion: 1,
    request: {
      text: "Implement user authentication with JWT tokens and database storage",
      shortGoal: "Add user auth",
      shortScope: "Full auth module",
    },
  };
  const inputPath = join(projectDir, "task-request.json");
  await writeFile(inputPath, JSON.stringify(inputPayload, null, 2), "utf8");

  // Take baseline AFTER creating input file to verify zero writes from intake
  const homeBefore = await fingerprintManifest(sandbox.home);
  const stateBefore = await fingerprintManifest(sandbox.state);
  const projectBefore = await fingerprintManifest(projectDir);

  // 1. Text mode query running in project directory
  const textQuery = spawnSync(
    process.execPath,
    [cliPath, "task", "intake", "--input", inputPath],
    {
      cwd: projectDir,
      env: sandbox.env,
      encoding: "utf8",
    },
  );
  assert.equal(textQuery.status, 0, `text intake query failed: ${textQuery.stderr}`);
  assert.match(textQuery.stdout, /Effective mode: strict/u);
  assert.match(textQuery.stdout, /Decision: substantial-work/u);
  assert.match(textQuery.stdout, /Next action: choose-style/u);
  assert.match(textQuery.stdout, /Execution authorized: false/u);

  // Verify all 6 Korean labels and descriptions in exact order
  const lines = textQuery.stdout.split("\n");
  assert.ok(lines.some((l) => l.includes("1. 대화형-quick: 현재 대화에서 작은 작업을 간소화된 GSD 절차로 처리")));
  assert.ok(lines.some((l) => l.includes("2. 대화형-quick-full: 작은 작업에 토론·조사·계획 검사·구현·검증 적용")));
  assert.ok(lines.some((l) => l.includes("3. 대화형-phase: 로드맵과 Phase를 따라 필요한 사항을 질문하며 진행")));
  assert.ok(lines.some((l) => l.includes("4. 오토파일럿-quick: 승인된 계약과 별도 실행기로 작은 작업 처리")));
  assert.ok(lines.some((l) => l.includes("5. 오토파일럿-quick-full: 승인된 범위에서 작은 작업의 전체 품질 절차 수행")));
  assert.ok(lines.some((l) => l.includes("6. 오토파일럿-phase: 승인된 로드맵 범위의 Phase들을 자율 진행")));

  // 2. JSON mode query
  const jsonQuery = spawnSync(
    process.execPath,
    [cliPath, "task", "intake", "--input", inputPath, "--json"],
    {
      cwd: projectDir,
      env: sandbox.env,
      encoding: "utf8",
    },
  );
  assert.equal(jsonQuery.status, 0, `json intake query failed: ${jsonQuery.stderr}`);
  const parsed = JSON.parse(jsonQuery.stdout);

  assert.equal(parsed.schemaVersion, 1);
  assert.equal(parsed.kind, "substantial-work");
  assert.equal(parsed.nextAction, "choose-style");
  assert.equal(parsed.executionAuthorized, false);
  assert.equal(parsed.policy.effectiveMode, "strict");
  assert.equal(parsed.policy.source, "builtin-default");
  assert.equal(parsed.policy.revision, "missing");
  assert.equal(typeof parsed.policy.canonicalRoot, "string");
  assert.equal(typeof parsed.policy.projectId, "string");

  // Chooser verification in JSON
  assert.ok(parsed.chooser);
  assert.equal(parsed.chooser.rendering, "numbered-text");
  assert.equal(parsed.chooser.options.length, 6);
  assert.equal(parsed.chooser.options[0].id, "conversational-quick");
  assert.equal(parsed.chooser.options[0].label, "대화형-quick");
  assert.equal(parsed.chooser.options[0].description, "현재 대화에서 작은 작업을 간소화된 GSD 절차로 처리");
  assert.equal(parsed.chooser.options[1].id, "conversational-quick-full");
  assert.equal(parsed.chooser.options[2].id, "conversational-phase");
  assert.equal(parsed.chooser.options[3].id, "autopilot-quick");
  assert.equal(parsed.chooser.options[4].id, "autopilot-quick-full");
  assert.equal(parsed.chooser.options[5].id, "autopilot-phase");

  // Verify private originalRequest is NOT leaked into JSON
  assert.equal(parsed.originalRequest, undefined);
  assert.equal(parsed.handoff, undefined);

  // 3. Zero-write assertion
  const homeAfter = await fingerprintManifest(sandbox.home);
  const stateAfter = await fingerprintManifest(sandbox.state);
  const projectAfter = await fingerprintManifest(projectDir);

  assert.equal(homeBefore.digest, homeAfter.digest, "sandbox home must be untouched");
  assert.equal(stateBefore.digest, stateAfter.digest, "sandbox state must be untouched");
  assert.equal(projectBefore.digest, projectAfter.digest, "project directory must be untouched");
});

test("task intake on flexible mode returns adaptive-intake with no mandatory 6-item chooser (ENTRY-06, D-17)", async (context) => {
  const sandbox = await createIsolatedSandbox(context);
  const projectDir = join(sandbox.home, "flexible-project");
  const alphaAosDir = join(projectDir, ".alpha-aos");
  await mkdir(alphaAosDir, { recursive: true });
  await writeFile(
    join(alphaAosDir, "behavior.json"),
    JSON.stringify({ schemaVersion: 1, mode: "flexible" }, null, 2),
    "utf8",
  );

  const inputPayload = {
    schemaVersion: 1,
    request: {
      text: "Refactor database query optimization",
    },
  };
  const inputPath = join(projectDir, "req.json");
  await writeFile(inputPath, JSON.stringify(inputPayload, null, 2), "utf8");

  const jsonQuery = spawnSync(
    process.execPath,
    [cliPath, "task", "intake", "--input", inputPath, "--json"],
    {
      cwd: projectDir,
      env: sandbox.env,
      encoding: "utf8",
    },
  );
  assert.equal(jsonQuery.status, 0, `flexible query failed: ${jsonQuery.stderr}`);
  const parsed = JSON.parse(jsonQuery.stdout);

  assert.equal(parsed.policy.effectiveMode, "flexible");
  assert.equal(parsed.nextAction, "adaptive-intake");
  assert.equal(parsed.executionAuthorized, false);
  assert.ok(!parsed.chooser, "Flexible mode must not force a 6-option chooser");
});

test("question capability rendering and answer resolution (D-05, D-06, D-07)", () => {
  // Native rendering only when observed capability supports 6 options and style is native
  const nativeQ = renderTaskStyleQuestion(TASK_EXECUTION_STYLES, {
    supportsSixOptions: true,
    style: "native",
  });
  assert.equal(nativeQ.rendering, "native");

  const limitedQ = renderTaskStyleQuestion(TASK_EXECUTION_STYLES, {
    supportsSixOptions: false,
    style: "native",
  });
  assert.equal(limitedQ.rendering, "numbered-text");

  const unknownQ = renderTaskStyleQuestion(TASK_EXECUTION_STYLES, {
    supportsSixOptions: true,
    style: "unknown",
  });
  assert.equal(unknownQ.rendering, "numbered-text");

  const defaultQ = renderTaskStyleQuestion(TASK_EXECUTION_STYLES);
  assert.equal(defaultQ.rendering, "numbered-text");

  // Exact number resolution
  for (let i = 1; i <= 6; i++) {
    const res = resolveTaskStyleAnswer(String(i));
    assert.equal(res.resolved, true);
    assert.equal(res.style, TASK_EXECUTION_STYLES[i - 1]!.id);
  }

  // Exact canonical ID resolution
  for (const entry of TASK_EXECUTION_STYLES) {
    const res = resolveTaskStyleAnswer(entry.id);
    assert.equal(res.resolved, true);
    assert.equal(res.style, entry.id);
  }

  // Exact Korean label resolution
  for (const entry of TASK_EXECUTION_STYLES) {
    const res = resolveTaskStyleAnswer(entry.label);
    assert.equal(res.resolved, true);
    assert.equal(res.style, entry.id);
  }

  // Out of range numbers
  assert.equal(resolveTaskStyleAnswer("0").resolved, false);
  assert.equal(resolveTaskStyleAnswer("7").resolved, false);
  assert.equal(resolveTaskStyleAnswer("99").resolved, false);

  // Ambiguous answers
  const quickAns = resolveTaskStyleAnswer("quick");
  assert.equal(quickAns.resolved, false, "quick is ambiguous between conversational and autopilot");
  assert.match(quickAns.reason!, /Ambiguous/u);

  const convAns = resolveTaskStyleAnswer("대화형");
  assert.equal(convAns.resolved, false, "대화형 is ambiguous between quick, quick-full, phase");

  const autoAns = resolveTaskStyleAnswer("오토파일럿");
  assert.equal(autoAns.resolved, false, "오토파일럿 is ambiguous between quick, quick-full, phase");

  // Invalid / empty answers
  assert.equal(resolveTaskStyleAnswer("").resolved, false);
  assert.equal(resolveTaskStyleAnswer("   ").resolved, false);
  assert.equal(resolveTaskStyleAnswer(null).resolved, false);
  assert.equal(resolveTaskStyleAnswer(undefined).resolved, false);
  assert.equal(resolveTaskStyleAnswer("invalid-string").resolved, false);
});

test("CLI rejects unsafe input, invalid syntax, extra flags and authority claims (ENTRY-05, D-01, D-18, D-19)", async (context) => {
  const sandbox = await createIsolatedSandbox(context);
  const projectDir = join(sandbox.home, "negative-project");
  await mkdir(projectDir, { recursive: true });

  // 1. Refuse --apply
  const applyRes = spawnSync(
    process.execPath,
    [cliPath, "task", "intake", "--input", "foo.json", "--apply"],
    { cwd: projectDir, env: sandbox.env, encoding: "utf8" },
  );
  assert.notEqual(applyRes.status, 0);
  assert.match(applyRes.stderr, /has no --apply/u);

  // 2. Refuse missing --input
  const missingInputRes = spawnSync(
    process.execPath,
    [cliPath, "task", "intake"],
    { cwd: projectDir, env: sandbox.env, encoding: "utf8" },
  );
  assert.notEqual(missingInputRes.status, 0);
  assert.match(missingInputRes.stderr, /requires --input/u);

  // 3. Refuse positional operands
  const surplusRes = spawnSync(
    process.execPath,
    [cliPath, "task", "intake", "extra-operand", "--input", "foo.json"],
    { cwd: projectDir, env: sandbox.env, encoding: "utf8" },
  );
  assert.notEqual(surplusRes.status, 0);
  assert.match(surplusRes.stderr, /does not accept positional operands/u);

  // 4. Non-existent file
  const nonExistentPath = join(projectDir, "does-not-exist.json");
  const missingFileRes = spawnSync(
    process.execPath,
    [cliPath, "task", "intake", "--input", nonExistentPath, "--json"],
    { cwd: projectDir, env: sandbox.env, encoding: "utf8" },
  );
  assert.notEqual(missingFileRes.status, 0);
  const missingFileJson = JSON.parse(missingFileRes.stdout);
  assert.equal(missingFileJson.status, "failed");
  assert.equal(missingFileJson.code, "unreadable-input");

  // 5. Empty file
  const emptyPath = join(projectDir, "empty.json");
  await writeFile(emptyPath, "", "utf8");
  const emptyRes = spawnSync(
    process.execPath,
    [cliPath, "task", "intake", "--input", emptyPath, "--json"],
    { cwd: projectDir, env: sandbox.env, encoding: "utf8" },
  );
  assert.notEqual(emptyRes.status, 0);
  const emptyJson = JSON.parse(emptyRes.stdout);
  assert.equal(emptyJson.code, "empty-input");

  // 6. Malformed JSON
  const malformedPath = join(projectDir, "malformed.json");
  await writeFile(malformedPath, "{ invalid json content ", "utf8");
  const malformedRes = spawnSync(
    process.execPath,
    [cliPath, "task", "intake", "--input", malformedPath, "--json"],
    { cwd: projectDir, env: sandbox.env, encoding: "utf8" },
  );
  assert.notEqual(malformedRes.status, 0);
  const malformedJson = JSON.parse(malformedRes.stdout);
  assert.equal(malformedJson.code, "invalid-json");
  // Ensure raw file content is not echoed in reason
  assert.ok(!malformedJson.reason.includes("{ invalid json content "));

  // 7. Duplicate JSON keys
  const duplicatePath = join(projectDir, "duplicate.json");
  await writeFile(
    duplicatePath,
    '{\n  "schemaVersion": 1,\n  "request": { "text": "task 1" },\n  "schemaVersion": 1\n}\n',
    "utf8",
  );
  const duplicateRes = spawnSync(
    process.execPath,
    [cliPath, "task", "intake", "--input", duplicatePath, "--json"],
    { cwd: projectDir, env: sandbox.env, encoding: "utf8" },
  );
  assert.notEqual(duplicateRes.status, 0);
  const duplicateJson = JSON.parse(duplicateRes.stdout);
  assert.equal(duplicateJson.code, "duplicate-key");

  // 8. Caller claiming unauthorized authority (extra schema fields: mode, approved, simple)
  const authorityClaimPath = join(projectDir, "authority.json");
  await writeFile(
    authorityClaimPath,
    JSON.stringify({
      schemaVersion: 1,
      mode: "flexible", // Forbidden extra property
      simple: true,     // Forbidden extra property
      approved: true,   // Forbidden extra property
      request: { text: "Some task" },
    }),
    "utf8",
  );
  const authRes = spawnSync(
    process.execPath,
    [cliPath, "task", "intake", "--input", authorityClaimPath, "--json"],
    { cwd: projectDir, env: sandbox.env, encoding: "utf8" },
  );
  assert.notEqual(authRes.status, 0);
  const authJson = JSON.parse(authRes.stdout);
  assert.equal(authJson.code, "schema-validation");

  // 9. Oversized file (> 16 KiB)
  const oversizedPath = join(projectDir, "oversized.json");
  const bigText = "A".repeat(17000);
  await writeFile(
    oversizedPath,
    JSON.stringify({ schemaVersion: 1, request: { text: bigText } }),
    "utf8",
  );
  const oversizedRes = spawnSync(
    process.execPath,
    [cliPath, "task", "intake", "--input", oversizedPath, "--json"],
    { cwd: projectDir, env: sandbox.env, encoding: "utf8" },
  );
  assert.notEqual(oversizedRes.status, 0);
  const oversizedJson = JSON.parse(oversizedRes.stdout);
  assert.equal(oversizedJson.code, "input-too-large");

  // 10. Malformed UTF-8 multibyte sequence
  const badUtf8Path = join(projectDir, "bad-utf8.json");
  const badBuffer = Buffer.from([0x7b, 0x22, 0xff, 0xfe, 0x7d]); // invalid UTF-8 bytes
  await writeFile(badUtf8Path, badBuffer);
  const badUtf8Res = spawnSync(
    process.execPath,
    [cliPath, "task", "intake", "--input", badUtf8Path, "--json"],
    { cwd: projectDir, env: sandbox.env, encoding: "utf8" },
  );
  assert.notEqual(badUtf8Res.status, 0);
  const badUtf8Json = JSON.parse(badUtf8Res.stdout);
  assert.equal(badUtf8Json.code, "invalid-input");

  // 11. Directory passed as input path
  const dirPath = join(projectDir, "is-a-dir");
  await mkdir(dirPath, { recursive: true });
  const dirRes = spawnSync(
    process.execPath,
    [cliPath, "task", "intake", "--input", dirPath, "--json"],
    { cwd: projectDir, env: sandbox.env, encoding: "utf8" },
  );
  assert.notEqual(dirRes.status, 0);
  const dirJson = JSON.parse(dirRes.stdout);
  assert.equal(dirJson.code, "not-a-file");

  // 12. Bound-root mismatch error propagation
  const boundMismatchPath = join(projectDir, "bound-mismatch.json");
  await writeFile(
    boundMismatchPath,
    JSON.stringify({
      schemaVersion: 1,
      boundProjectRoot: join(sandbox.home, "some-other-project-root"),
      request: { text: "Mismatch test" },
    }),
    "utf8",
  );
  const mismatchRes = spawnSync(
    process.execPath,
    [cliPath, "task", "intake", "--input", boundMismatchPath, "--json"],
    { cwd: projectDir, env: sandbox.env, encoding: "utf8" },
  );
  assert.notEqual(mismatchRes.status, 0);
  const mismatchJson = JSON.parse(mismatchRes.stdout);
  assert.equal(mismatchJson.code, "bound-root-mismatch");
});
