import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { inspectTaskIntake } from "../src/core/task-intake.js";
import { createOrdinaryRepository } from "./helpers/git-fixture.js";
import { createIsolatedSandbox } from "./helpers/packed-sandbox.js";

test("task intake evidence: positive simple push skips chooser (ENTRY-04, D-13, D-14)", async (context) => {
  const sandbox = await createIsolatedSandbox(context);
  const gitResult = await createOrdinaryRepository(sandbox.home, "push-repo");
  assert.equal(gitResult.ok, true);
  const projectDir = join(sandbox.home, "push-repo");

  const inputPayload = {
    schemaVersion: 1,
    projectRoot: projectDir,
    request: {
      text: "origin의 main 브랜치로 push",
      shortGoal: "Push to remote",
      shortScope: "push origin main",
    },
    operation: {
      type: "push",
      remote: "origin",
      branch: "main",
      localRef: "main",
    },
  };

  const decision = await inspectTaskIntake({
    input: inputPayload,
    stateRoot: sandbox.state,
  });

  assert.equal(decision.kind, "simple-operation");
  assert.equal(decision.nextAction, "execute-simple");
  assert.equal(decision.executionAuthorized, false);
  assert.equal(decision.chooser, undefined);
  assert.ok(decision.reasons.includes("bounded-simple-operation-exemption"));
  assert.ok(decision.reasons.includes("simple-operation-push"));
  assert.ok(decision.observations.some((o) => o.includes("origin")));
  assert.ok(decision.observations.some((o) => o.includes("Push authority not granted") || o.includes("push authority not granted")));
});

test("task intake evidence: force push complex twin is NOT exempt (ENTRY-04, D-13, D-14)", async (context) => {
  const sandbox = await createIsolatedSandbox(context);
  const gitResult = await createOrdinaryRepository(sandbox.home, "force-repo");
  assert.equal(gitResult.ok, true);
  const projectDir = join(sandbox.home, "force-repo");

  const inputPayload = {
    schemaVersion: 1,
    projectRoot: projectDir,
    request: {
      text: "origin main 브랜치로 force push",
      shortGoal: "Force push",
    },
    operation: {
      type: "push",
      remote: "origin",
      branch: "main",
      force: true,
    },
  };

  const decision = await inspectTaskIntake({
    input: inputPayload,
    stateRoot: sandbox.state,
  });

  assert.equal(decision.kind, "substantial-work");
  assert.equal(decision.nextAction, "choose-style");
  assert.ok(decision.chooser);
  assert.equal(decision.chooser.options.length, 6);
  assert.ok(decision.reasons.includes("complex-operation-requires-substantial-intake"));
});

test("task intake evidence: push missing target asks clarification (ENTRY-05, D-15)", async (context) => {
  const sandbox = await createIsolatedSandbox(context);
  const gitResult = await createOrdinaryRepository(sandbox.home, "missing-target-repo");
  assert.equal(gitResult.ok, true);
  const projectDir = join(sandbox.home, "missing-target-repo");

  const inputPayload = {
    schemaVersion: 1,
    projectRoot: projectDir,
    request: {
      text: "git push 실행해줘",
      shortGoal: "Push",
    },
    operation: {
      type: "push",
    },
  };

  const decision = await inspectTaskIntake({
    input: inputPayload,
    stateRoot: sandbox.state,
  });

  assert.equal(decision.kind, "clarification-needed");
  assert.equal(decision.nextAction, "ask-clarification");
  assert.ok(decision.clarification);
  assert.ok(decision.clarification.question.includes("원격 저장소"));
  assert.deepEqual(decision.clarification.missingFacts, ["remote", "branch"]);
});

test("task intake evidence: positive local rename skips chooser and preserves disk (ENTRY-04, D-13, D-14)", async (context) => {
  const sandbox = await createIsolatedSandbox(context);
  const projectDir = join(sandbox.home, "rename-project");
  await mkdir(join(projectDir, "src"), { recursive: true });
  const oldFilePath = join(projectDir, "src", "old.ts");
  const newFilePath = join(projectDir, "src", "new.ts");
  await writeFile(oldFilePath, "export const x = 1;\n", "utf8");

  const inputPayload = {
    schemaVersion: 1,
    projectRoot: projectDir,
    request: {
      text: "src/old.ts를 src/new.ts로 이름 변경",
      shortGoal: "Rename file",
    },
    operation: {
      type: "rename",
      oldPath: "src/old.ts",
      newPath: "src/new.ts",
      unchangedApiMeaning: true,
      scopedPaths: ["src/old.ts"],
    },
  };

  const decision = await inspectTaskIntake({
    input: inputPayload,
    stateRoot: sandbox.state,
  });

  assert.equal(decision.kind, "simple-operation");
  assert.equal(decision.nextAction, "execute-simple");
  assert.equal(decision.chooser, undefined);
  assert.ok(decision.reasons.includes("bounded-simple-operation-exemption"));
  assert.ok(decision.reasons.includes("simple-operation-local-rename"));

  // Verify intake did NOT perform actual rename
  assert.equal(existsSync(oldFilePath), true);
  assert.equal(existsSync(newFilePath), false);
});

test("task intake evidence: rename affecting public API/schema is NOT exempt (ENTRY-04, D-14)", async (context) => {
  const sandbox = await createIsolatedSandbox(context);
  const projectDir = join(sandbox.home, "rename-api-project");
  await mkdir(join(projectDir, "src"), { recursive: true });
  await writeFile(join(projectDir, "src", "api.ts"), "export interface User {};\n", "utf8");

  const inputPayload = {
    schemaVersion: 1,
    projectRoot: projectDir,
    request: {
      text: "src/api.ts를 src/user-schema.ts로 변경하고 public API 변경",
      shortGoal: "Rename API",
    },
    operation: {
      type: "rename",
      oldPath: "src/api.ts",
      newPath: "src/user-schema.ts",
      unchangedApiMeaning: false,
    },
  };

  const decision = await inspectTaskIntake({
    input: inputPayload,
    stateRoot: sandbox.state,
  });

  assert.equal(decision.kind, "substantial-work");
  assert.equal(decision.nextAction, "choose-style");
  assert.ok(decision.chooser);
  assert.ok(decision.reasons.includes("complex-operation-requires-substantial-intake"));
  assert.ok(decision.reasons.includes("rename-affects-public-api-or-schema"));
});

test("task intake evidence: rename with ambiguous API impact asks discriminating question (ENTRY-05, D-15)", async (context) => {
  const sandbox = await createIsolatedSandbox(context);
  const projectDir = join(sandbox.home, "rename-ambiguous-project");
  await mkdir(join(projectDir, "src"), { recursive: true });
  await writeFile(join(projectDir, "src", "foo.ts"), "export const foo = 1;\n", "utf8");

  const inputPayload = {
    schemaVersion: 1,
    projectRoot: projectDir,
    request: {
      text: "src/foo.ts를 src/bar.ts로 rename",
      shortGoal: "Rename foo",
    },
    operation: {
      type: "rename",
      oldPath: "src/foo.ts",
      newPath: "src/bar.ts",
    },
  };

  const decision = await inspectTaskIntake({
    input: inputPayload,
    stateRoot: sandbox.state,
  });

  assert.equal(decision.kind, "clarification-needed");
  assert.equal(decision.nextAction, "ask-clarification");
  assert.ok(decision.clarification);
  assert.equal(
    decision.clarification.question,
    "파일명만 변경하나요, 아니면 공개 API/인터페이스도 변경하나요?",
  );
  assert.deepEqual(decision.clarification.missingFacts, ["api-impact"]);
});

test("task intake evidence: positive README translation skips chooser (ENTRY-04, D-13, D-14)", async (context) => {
  const sandbox = await createIsolatedSandbox(context);
  const projectDir = join(sandbox.home, "readme-project");
  await mkdir(projectDir, { recursive: true });
  await writeFile(join(projectDir, "README.md"), "# Project\n\nEnglish docs.\n", "utf8");

  const inputPayload = {
    schemaVersion: 1,
    projectRoot: projectDir,
    request: {
      text: "README.md를 한국어로 충실히 번역하여 README.ko.md 작성",
      shortGoal: "Translate README",
    },
    operation: {
      type: "readme-translation",
      sourcePath: "README.md",
      target: "README.ko.md",
      faithful: true,
    },
  };

  const decision = await inspectTaskIntake({
    input: inputPayload,
    stateRoot: sandbox.state,
  });

  assert.equal(decision.kind, "simple-operation");
  assert.equal(decision.nextAction, "execute-simple");
  assert.equal(decision.chooser, undefined);
  assert.ok(decision.reasons.includes("bounded-simple-operation-exemption"));
  assert.ok(decision.reasons.includes("simple-operation-readme-translation"));
});

test("task intake evidence: README redesign complex twin is NOT exempt (ENTRY-04, D-14)", async (context) => {
  const sandbox = await createIsolatedSandbox(context);
  const projectDir = join(sandbox.home, "readme-redesign-project");
  await mkdir(projectDir, { recursive: true });
  await writeFile(join(projectDir, "README.md"), "# Old README\n", "utf8");

  const inputPayload = {
    schemaVersion: 1,
    projectRoot: projectDir,
    request: {
      text: "README를 완전히 새로운 아키텍처와 기능으로 redesign",
      shortGoal: "Redesign README",
    },
    operation: {
      type: "readme-translation",
      sourcePath: "README.md",
      target: "README.md",
      redesign: true,
      newFeatureScope: true,
    },
  };

  const decision = await inspectTaskIntake({
    input: inputPayload,
    stateRoot: sandbox.state,
  });

  assert.equal(decision.kind, "substantial-work");
  assert.equal(decision.nextAction, "choose-style");
  assert.ok(decision.chooser);
  assert.ok(decision.reasons.includes("complex-operation-requires-substantial-intake"));
  assert.ok(decision.reasons.includes("readme-redesign-or-new-feature-not-exempt"));
});

test("task intake evidence: positive README doc link skips chooser (ENTRY-04, D-14)", async (context) => {
  const sandbox = await createIsolatedSandbox(context);
  const projectDir = join(sandbox.home, "readme-link-project");
  await mkdir(join(projectDir, "docs"), { recursive: true });
  await writeFile(join(projectDir, "README.md"), "# Project\n", "utf8");
  await writeFile(join(projectDir, "docs", "arch.md"), "# Architecture\n", "utf8");

  const inputPayload = {
    schemaVersion: 1,
    projectRoot: projectDir,
    request: {
      text: "README.md에 docs/arch.md 링크 추가",
      shortGoal: "Add doc link",
    },
    operation: {
      type: "readme-link",
      sourcePath: "README.md",
      targetLink: "docs/arch.md",
    },
  };

  const decision = await inspectTaskIntake({
    input: inputPayload,
    stateRoot: sandbox.state,
  });

  assert.equal(decision.kind, "simple-operation");
  assert.equal(decision.nextAction, "execute-simple");
  assert.equal(decision.chooser, undefined);
  assert.ok(decision.reasons.includes("bounded-simple-operation-exemption"));
  assert.ok(decision.reasons.includes("simple-operation-readme-link"));
});

test("task intake evidence: scope expansion stops before expanded work and preserves WIP (ENTRY-04, ENTRY-05, D-16)", async (context) => {
  const sandbox = await createIsolatedSandbox(context);
  const projectDir = join(sandbox.home, "scope-exp-project");
  await mkdir(projectDir, { recursive: true });

  const inputPayload = {
    schemaVersion: 1,
    projectRoot: projectDir,
    request: {
      text: "다단계 구현과 추가 조사가 필요해진 확장 작업",
      shortGoal: "Expanded scope",
    },
    scopeChange: {
      previousOperationId: "op-initial-rename",
      expandedScope: true,
      requiresInvestigation: true,
      wipBytesPreserved: true,
      isTaskRepair: false,
      reason: "Unexpected cross-module dependencies discovered",
    },
  };

  const decision = await inspectTaskIntake({
    input: inputPayload,
    stateRoot: sandbox.state,
  });

  assert.equal(decision.kind, "substantial-work");
  assert.equal(decision.nextAction, "choose-style");
  assert.ok(decision.chooser);
  assert.ok(decision.reasons.includes("scope-expansion-reclassified"));
  assert.ok(decision.reasons.includes("wip-bytes-preserved"));
  assert.ok(decision.observations.some((o) => o.includes("preserves dirty WIP")));
});

test("task intake evidence: active task repair retains style and preserves WIP (ENTRY-03, ENTRY-04, D-10, D-16)", async (context) => {
  const sandbox = await createIsolatedSandbox(context);
  const projectDir = join(sandbox.home, "task-repair-project");
  await mkdir(projectDir, { recursive: true });

  const inputPayload = {
    schemaVersion: 1,
    projectRoot: projectDir,
    request: {
      text: "활성 작업 변경으로 실패한 테스트 수리",
      shortGoal: "Repair failed tests",
    },
    currentTask: {
      taskId: "task-build-123",
      selectedStyle: "conversational-quick",
    },
    scopeChange: {
      previousOperationId: "op-test-fix",
      expandedScope: true,
      requiresInvestigation: false,
      wipBytesPreserved: true,
      isTaskRepair: true,
      reason: "Repairing broken tests from active task",
    },
  };

  const decision = await inspectTaskIntake({
    input: inputPayload,
    stateRoot: sandbox.state,
  });

  assert.equal(decision.kind, "continuation");
  assert.equal(decision.nextAction, "continue-task");
  assert.equal(decision.selectedStyle, "conversational-quick");
  assert.equal(decision.taskReference, "task-build-123");
  assert.ok(decision.reasons.includes("active-task-repair-retains-style"));
  assert.ok(decision.reasons.includes("wip-bytes-preserved"));
});

test("task intake evidence: explicit style outranks simple exemption (ENTRY-02, D-02)", async (context) => {
  const sandbox = await createIsolatedSandbox(context);
  const projectDir = join(sandbox.home, "explicit-outranks-project");
  await mkdir(projectDir, { recursive: true });
  await writeFile(join(projectDir, "README.md"), "# Project\n", "utf8");

  const inputPayload = {
    schemaVersion: 1,
    projectRoot: projectDir,
    request: {
      text: "대화형-quick-full로 README.md 번역",
      shortGoal: "Translate README with full rigor",
    },
    operation: {
      type: "readme-translation",
      sourcePath: "README.md",
      target: "README.ko.md",
      faithful: true,
    },
  };

  const decision = await inspectTaskIntake({
    input: inputPayload,
    stateRoot: sandbox.state,
  });

  // Explicit style outranks simple exemption!
  assert.equal(decision.kind, "explicit-style");
  assert.equal(decision.selectedStyle, "conversational-quick-full");
  assert.equal(decision.nextAction, "execute-explicit");
});
