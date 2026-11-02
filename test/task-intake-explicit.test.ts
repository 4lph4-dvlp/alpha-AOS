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
} from "../src/core/task-intake.js";
import {
  normalizeExplicitTaskIntent,
} from "../src/core/task-intake-explicit.js";

const cliPath = join(import.meta.dirname, "..", "src", "cli.js");

test("normalizeExplicitTaskIntent preserves exact direct GSD commands and distinguishes mentions (ENTRY-07, D-02, D-03)", () => {
  // 1. Direct standalone GSD commands
  const discuss = normalizeExplicitTaskIntent({
    request: { text: "$gsd-discuss-phase 28" },
  });
  assert.equal(discuss.kind, "command");
  assert.equal(discuss.commandRoute?.command, "gsd-discuss-phase");
  assert.equal(discuss.commandRoute?.workflow, "discuss-phase");
  assert.equal(discuss.commandRoute?.phase, "28");
  assert.equal(discuss.commandRoute?.stoppingPoint, "discuss:post");

  const plan = normalizeExplicitTaskIntent({
    request: { text: "/gsd:plan-phase 28 --text" },
  });
  assert.equal(plan.kind, "command");
  assert.equal(plan.commandRoute?.command, "gsd-plan-phase");
  assert.equal(plan.commandRoute?.phase, "28");
  assert.deepEqual(plan.commandRoute?.arguments, ["28", "--text"]);
  assert.equal(plan.commandRoute?.stoppingPoint, "plan:post");

  const execute = normalizeExplicitTaskIntent({
    request: { text: "$gsd-execute-phase 28 --no-transition" },
  });
  assert.equal(execute.kind, "command");
  assert.equal(execute.commandRoute?.command, "gsd-execute-phase");
  assert.deepEqual(execute.commandRoute?.arguments, ["28", "--no-transition"]);
  assert.equal(execute.commandRoute?.stoppingPoint, "execute:post");

  const quick = normalizeExplicitTaskIntent({
    request: { text: "$gsd-quick Fix typo in auth token validator" },
  });
  assert.equal(quick.kind, "command");
  assert.equal(quick.commandRoute?.command, "gsd-quick");
  assert.deepEqual(quick.commandRoute?.arguments, ["Fix", "typo", "in", "auth", "token", "validator"]);

  const debug = normalizeExplicitTaskIntent({
    request: { text: "gsd-debug connection timeout in pool" },
  });
  assert.equal(debug.kind, "command");
  assert.equal(debug.commandRoute?.command, "gsd-debug");

  // 2. Explicit metadata precedence
  const explicitMeta = normalizeExplicitTaskIntent({
    request: { text: "Run the phase planning" },
    explicit: {
      command: "plan-phase",
      phase: "28",
      arguments: ["28", "--auto"],
    },
  });
  assert.equal(explicitMeta.kind, "command");
  assert.equal(explicitMeta.commandRoute?.command, "gsd-plan-phase");
  assert.equal(explicitMeta.commandRoute?.phase, "28");
  assert.deepEqual(explicitMeta.commandRoute?.arguments, ["28", "--auto"]);

  // 3. Quoted / code / example mentions must NOT trigger command route
  const inDoubleQuotes = normalizeExplicitTaskIntent({
    request: { text: '"$gsd-discuss-phase 28"' },
  });
  assert.equal(inDoubleQuotes.kind, "none");

  const inSingleQuotes = normalizeExplicitTaskIntent({
    request: { text: "'$gsd-discuss-phase 28'" },
  });
  assert.equal(inSingleQuotes.kind, "none");

  const inBackticks = normalizeExplicitTaskIntent({
    request: { text: "`$gsd-discuss-phase 28`" },
  });
  assert.equal(inBackticks.kind, "none");

  const explanatory = normalizeExplicitTaskIntent({
    request: { text: "For example, you can run $gsd-quick to fix minor bugs" },
  });
  assert.equal(explanatory.kind, "none");

  const howDoes = normalizeExplicitTaskIntent({
    request: { text: "How does $gsd-discuss-phase 28 work?" },
  });
  assert.equal(howDoes.kind, "none");
});

test("normalizeExplicitTaskIntent normalizes six styles, handles partial autopilot, and flags conflicts (ENTRY-02, D-04)", () => {
  // 1. All six canonical IDs and labels
  for (const entry of TASK_EXECUTION_STYLES) {
    const fromId = normalizeExplicitTaskIntent({
      request: { text: `Please execute using ${entry.id}` },
    });
    assert.equal(fromId.kind, "style");
    assert.equal(fromId.selectedStyle, entry.id);

    const fromLabel = normalizeExplicitTaskIntent({
      request: { text: `${entry.label} 방식으로 진행해 주세요` },
    });
    assert.equal(fromLabel.kind, "style");
    assert.equal(fromLabel.selectedStyle, entry.id);

    const fromMeta = normalizeExplicitTaskIntent({
      request: { text: "Some generic request" },
      explicit: { style: entry.id },
    });
    assert.equal(fromMeta.kind, "style");
    assert.equal(fromMeta.selectedStyle, entry.id);
  }

  // 2. Partial autopilot intent
  const partialText = normalizeExplicitTaskIntent({
    request: { text: "오토파일럿으로 진행해줘" },
  });
  assert.equal(partialText.kind, "partial");
  assert.equal(partialText.partialAutopilot, true);
  assert.deepEqual(partialText.candidateStyles, [
    "autopilot-quick",
    "autopilot-quick-full",
    "autopilot-phase",
  ]);

  const partialMeta = normalizeExplicitTaskIntent({
    request: { text: "Implement new service" },
    explicit: { style: "autopilot" },
  });
  assert.equal(partialMeta.kind, "partial");
  assert.equal(partialMeta.partialAutopilot, true);

  // 3. Conflicting explicit styles
  const conflictingStyles = normalizeExplicitTaskIntent({
    request: { text: "대화형-quick과 오토파일럿-phase 둘 다 적용해줘" },
  });
  assert.equal(conflictingStyles.kind, "conflict");
  assert.match(conflictingStyles.conflictReason!, /Multiple conflicting/u);

  // 4. Conflicting explicit command and style
  const conflictingCmdStyle = normalizeExplicitTaskIntent({
    request: { text: "$gsd-discuss-phase 28" },
    explicit: { style: "autopilot-phase" },
  });
  assert.equal(conflictingCmdStyle.kind, "conflict");
  assert.match(conflictingCmdStyle.conflictReason!, /conflicts with/u);

  // 5. Compatible command and style
  const compatible = normalizeExplicitTaskIntent({
    request: { text: "$gsd-quick Quick patch" },
    explicit: { style: "conversational-quick" },
  });
  assert.equal(compatible.kind, "command");
  assert.equal(compatible.selectedStyle, "conversational-quick");
  assert.equal(compatible.commandRoute?.command, "gsd-quick");

  // 6. Negative style mention ("don't use autopilot")
  const negative = normalizeExplicitTaskIntent({
    request: { text: "오토파일럿은 쓰지 말고 대화형-quick으로 해줘" },
  });
  assert.equal(negative.kind, "style");
  assert.equal(negative.selectedStyle, "conversational-quick");
});

test("CLI direct GSD invocation preserves command data without chooser or writes (ENTRY-07, D-02, D-03)", async (context) => {
  const sandbox = await createIsolatedSandbox(context);
  const projectDir = join(sandbox.home, "gsd-direct-project");
  await mkdir(projectDir, { recursive: true });

  const inputPayload = {
    schemaVersion: 1,
    request: {
      text: "$gsd-discuss-phase 28",
    },
  };
  const inputPath = join(projectDir, "req.json");
  await writeFile(inputPath, JSON.stringify(inputPayload, null, 2), "utf8");

  const homeBefore = await fingerprintManifest(sandbox.home);
  const stateBefore = await fingerprintManifest(sandbox.state);
  const projectBefore = await fingerprintManifest(projectDir);

  // 1. Text mode inspection
  const textQuery = spawnSync(
    process.execPath,
    [cliPath, "task", "intake", "--input", inputPath],
    { cwd: projectDir, env: sandbox.env, encoding: "utf8" },
  );
  assert.equal(textQuery.status, 0, `text query failed: ${textQuery.stderr}`);
  assert.match(textQuery.stdout, /Decision: explicit-command/u);
  assert.match(textQuery.stdout, /Next action: execute-explicit/u);
  assert.match(textQuery.stdout, /Command route: gsd-discuss-phase/u);
  assert.match(textQuery.stdout, /Stopping point: discuss:post/u);
  assert.match(textQuery.stdout, /Execution authorized: false/u);
  // Must NOT include the 6-style chooser
  assert.ok(!textQuery.stdout.includes("작업을 진행할 방식을 선택해 주세요"));

  // 2. JSON mode inspection
  const jsonQuery = spawnSync(
    process.execPath,
    [cliPath, "task", "intake", "--input", inputPath, "--json"],
    { cwd: projectDir, env: sandbox.env, encoding: "utf8" },
  );
  assert.equal(jsonQuery.status, 0, `json query failed: ${jsonQuery.stderr}`);
  const parsed = JSON.parse(jsonQuery.stdout);

  assert.equal(parsed.kind, "explicit-command");
  assert.equal(parsed.nextAction, "execute-explicit");
  assert.equal(parsed.executionAuthorized, false);
  assert.ok(parsed.commandRoute);
  assert.equal(parsed.commandRoute.command, "gsd-discuss-phase");
  assert.equal(parsed.commandRoute.workflow, "discuss-phase");
  assert.equal(parsed.commandRoute.phase, "28");
  assert.equal(parsed.commandRoute.stoppingPoint, "discuss:post");
  assert.equal(parsed.chooser, undefined);

  // Zero writes verification
  const homeAfter = await fingerprintManifest(sandbox.home);
  const stateAfter = await fingerprintManifest(sandbox.state);
  const projectAfter = await fingerprintManifest(projectDir);

  assert.equal(homeBefore.digest, homeAfter.digest);
  assert.equal(stateBefore.digest, stateAfter.digest);
  assert.equal(projectBefore.digest, projectAfter.digest);
});

test("CLI explicit style selection skips chooser and preserves full style (ENTRY-02, D-04)", async (context) => {
  const sandbox = await createIsolatedSandbox(context);
  const projectDir = join(sandbox.home, "explicit-style-project");
  await mkdir(projectDir, { recursive: true });

  const inputPayload = {
    schemaVersion: 1,
    request: {
      text: "README 한국어 번역 작업입니다. 대화형-quick-full 방식으로 진행해 주세요.",
    },
  };
  const inputPath = join(projectDir, "req.json");
  await writeFile(inputPath, JSON.stringify(inputPayload, null, 2), "utf8");

  const jsonQuery = spawnSync(
    process.execPath,
    [cliPath, "task", "intake", "--input", inputPath, "--json"],
    { cwd: projectDir, env: sandbox.env, encoding: "utf8" },
  );
  assert.equal(jsonQuery.status, 0, `query failed: ${jsonQuery.stderr}`);
  const parsed = JSON.parse(jsonQuery.stdout);

  assert.equal(parsed.kind, "explicit-style");
  assert.equal(parsed.selectedStyle, "conversational-quick-full");
  assert.equal(parsed.nextAction, "execute-explicit");
  assert.equal(parsed.executionAuthorized, false);
  assert.equal(parsed.chooser, undefined, "Explicit style must skip the chooser");
});

test("CLI partial autopilot request presents only the three autopilot choices (D-04)", async (context) => {
  const sandbox = await createIsolatedSandbox(context);
  const projectDir = join(sandbox.home, "partial-autopilot-project");
  await mkdir(projectDir, { recursive: true });

  const inputPayload = {
    schemaVersion: 1,
    request: {
      text: "새로운 검색 필터 기능을 오토파일럿으로 구현해줘",
    },
  };
  const inputPath = join(projectDir, "req.json");
  await writeFile(inputPath, JSON.stringify(inputPayload, null, 2), "utf8");

  const jsonQuery = spawnSync(
    process.execPath,
    [cliPath, "task", "intake", "--input", inputPath, "--json"],
    { cwd: projectDir, env: sandbox.env, encoding: "utf8" },
  );
  assert.equal(jsonQuery.status, 0, `query failed: ${jsonQuery.stderr}`);
  const parsed = JSON.parse(jsonQuery.stdout);

  assert.equal(parsed.kind, "substantial-work");
  assert.equal(parsed.nextAction, "choose-style");
  assert.equal(parsed.executionAuthorized, false);

  assert.ok(parsed.chooser);
  assert.equal(parsed.chooser.options.length, 3, "Partial autopilot must offer only 3 choices");
  assert.equal(parsed.chooser.options[0].id, "autopilot-quick");
  assert.equal(parsed.chooser.options[1].id, "autopilot-quick-full");
  assert.equal(parsed.chooser.options[2].id, "autopilot-phase");
});

test("CLI conflicting explicit intent requests clarification without choosing default (D-04)", async (context) => {
  const sandbox = await createIsolatedSandbox(context);
  const projectDir = join(sandbox.home, "conflict-project");
  await mkdir(projectDir, { recursive: true });

  const inputPayload = {
    schemaVersion: 1,
    request: {
      text: "$gsd-discuss-phase 28",
    },
    explicit: {
      style: "autopilot-phase",
    },
  };
  const inputPath = join(projectDir, "req.json");
  await writeFile(inputPath, JSON.stringify(inputPayload, null, 2), "utf8");

  const jsonQuery = spawnSync(
    process.execPath,
    [cliPath, "task", "intake", "--input", inputPath, "--json"],
    { cwd: projectDir, env: sandbox.env, encoding: "utf8" },
  );
  assert.equal(jsonQuery.status, 0, `query failed: ${jsonQuery.stderr}`);
  const parsed = JSON.parse(jsonQuery.stdout);

  assert.equal(parsed.kind, "clarification-needed");
  assert.equal(parsed.nextAction, "ask-clarification");
  assert.equal(parsed.executionAuthorized, false);
  assert.ok(parsed.clarification);
  assert.match(parsed.clarification.question, /직접 호출한 명령/u);
  assert.equal(parsed.chooser, undefined);
  assert.equal(parsed.selectedStyle, undefined);
});
