import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile, rm, readdir, access, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { planToolRecordOperation, withToolRecordSession, beginToolOperation, appendToolResult, finishToolOperation } from "../src/core/tool-record-store.js";
import type { ToolResult } from "../src/core/tool-records.js";

test("inventory rejects history without a tool", () => {
  const result = spawnSync(process.execPath, [resolve("dist/src/cli.js"), "inventory", "--history"], { encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /--history.*--tool/);
});

test("inventory validates selection and reports both sides of a recorded operation", async () => {
  const root = await mkdtemp(join(tmpdir(), "aos-history-cli-"));
  try {
    const stateRoot = join(root, "state"), checkout = join(root, "checkout");
    await mkdir(checkout);
    const requests = ["gsd", "ecc"].map((toolId) => ({ toolId, selector: "1.2.3", exact: true }));
    const plan = await planToolRecordOperation({ stateRoot, packageRoot: checkout, operationId: "op-mixed", occurredAt: "2026-01-01T00:00:00Z", requests });
    await withToolRecordSession(plan, async (session) => {
      await beginToolOperation(plan, session);
      for (const [i, request] of requests.entries()) {
        const result: ToolResult = { toolId: request.toolId, requested: request, resolved: null, installed: null, verified: null, evidence: [], outcome: i ? "failed" : "succeeded" };
        await appendToolResult(plan, session, result);
      }
      await finishToolOperation(plan, session);
    });
    const snapshot = async () => {
      const entries = await readdir(root, { recursive: true, withFileTypes: true });
      return Promise.all(entries.filter((entry) => entry.isFile()).map(async (entry) => { const file = join(entry.parentPath, entry.name); return `${file}:${createHash("sha256").update(await readFile(file)).digest("hex")}`; })).then((items) => items.sort());
    };
    const before = await snapshot();
    const env = { ...process.env, HOME: join(root, "home"), USERPROFILE: join(root, "home"), LOCALAPPDATA: join(root, "local"), ALPHA_AOS_STATE_DIR: stateRoot, PATH: "" };
    const cli = (...args: string[]) => spawnSync(process.execPath, [resolve("dist/src/cli.js"), "inventory", ...args], { encoding: "utf8", env });
    const operation = JSON.parse(cli("--operation", "op-mixed", "--json").stdout) as { lookup: string; events: Array<{ results?: ToolResult[] }> };
    assert.equal(operation.lookup, "found");
    assert.deepEqual(operation.events.find((event) => event.results)?.results?.map((result) => result.outcome), ["succeeded", "failed"]);
    const human = cli("--operation", "op-mixed").stdout;
    for (const value of ["op-mixed", "gsd", "ecc", "succeeded", "failed"]) assert.ok(human.includes(value));
    const history = JSON.parse(cli("--tool", "gsd", "--history", "--json").stdout) as { toolId: string; events: unknown[] };
    assert.equal(history.toolId, "gsd"); assert.ok(history.events.length);
    const overview = JSON.parse(cli("--json").stdout) as { observations: Array<{ toolId: string }>; categorySummaries: unknown[]; components?: unknown[] };
    const detail = JSON.parse(cli("--detail", "--json").stdout) as { observations: Array<{ toolId: string }>; components: Array<{ category: string }> };
    assert.equal(overview.components, undefined); assert.ok(overview.categorySummaries.length);
    assert.deepEqual(overview.observations.map((item) => item.toolId), detail.observations.map((item) => item.toolId));
    assert.ok(detail.components.some((component) => component.category === "bundled-library"));
    assert.match(cli("--detail").stdout, /bundled-library/);
    assert.equal((JSON.parse(cli("--operation", "missing", "--json").stdout) as { lookup: string }).lookup, "not-found");
    for (const args of [["--operation", "../escape"], ["--tool", "bogus"], ["--tool", "gsd", "--operation", "op-mixed"], ["--history", "--operation", "op-mixed"], ["--tool"], ["--unknown"]]) assert.notEqual(cli(...args).status, 0, args.join(" "));
    assert.deepEqual(await snapshot(), before);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("tool inventory observes installed Cua separately from selected pin", async () => {
  const root = await mkdtemp(join(tmpdir(), "aos-inventory-"));
  try {
    const home = join(root, "home");
    const local = join(root, "local");
    // macOS uses a fixed /Applications path; the isolated child exercises the
    // same observer with its Linux path rather than touching the host install.
    const nodeArgs = process.platform === "darwin" ? ["--import", `data:text/javascript,${encodeURIComponent('Object.defineProperty(process,"platform",{value:"linux"})')}`] : [];
    const executable = process.platform === "win32" ? join(local, "Programs", "Cua", "cua-driver", "bin", "cua-driver.exe") : join(home, ".local", "bin", "cua-driver");
    await mkdir(resolve(executable, ".."), { recursive: true });
    await writeFile(executable, "fixture executable");
    const output = execFileSync(process.execPath, [...nodeArgs, resolve("dist/src/cli.js"), "inventory", "--tool", "cua-driver", "--json"], {
      env: { ...process.env, HOME: home, USERPROFILE: home, LOCALAPPDATA: local, ALPHA_AOS_STATE_DIR: join(root, "state") }, encoding: "utf8",
    });
    const result = JSON.parse(output) as { observations?: Array<{ installation?: string; selected?: { version?: string } }> };
    assert.equal(result.observations?.[0]?.installation, "installed");
    assert.ok(result.observations?.[0]?.selected?.version);
    assert.deepEqual(await readdir(root), [process.platform === "win32" ? "local" : "home"]);
    await assert.rejects(access(join(root, "state")));
    const human = execFileSync(process.execPath, [...nodeArgs, resolve("dist/src/cli.js"), "inventory", "--tool", "cua-driver"], {
      env: { ...process.env, HOME: home, USERPROFILE: home, LOCALAPPDATA: local, ALPHA_AOS_STATE_DIR: join(root, "state") }, encoding: "utf8",
    });
    assert.match(human, /installation=installed/);
    assert.match(human, /integrity=unverified/);
    assert.match(human, /accepted=none; latest operation=none/);
    assert.match(human, /handoff=needs-evidence/);
    await rm(executable);
    const absent = JSON.parse(execFileSync(process.execPath, [...nodeArgs, resolve("dist/src/cli.js"), "inventory", "--tool", "cua-driver", "--json"], {
      env: { ...process.env, HOME: home, USERPROFILE: home, LOCALAPPDATA: local, ALPHA_AOS_STATE_DIR: join(root, "state") }, encoding: "utf8",
    })) as { observations: Array<{ installation: string; installed: unknown }> };
    assert.equal(absent.observations[0]?.installation, "absent");
    assert.equal(absent.observations[0]?.installed, null);
    await assert.rejects(access(join(root, "state")));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("inventory exposes adaptersSummary in default view and full adapter metadata in --detail / --tool (ADAPT-01, ADAPT-02)", async () => {
  const root = await mkdtemp(join(tmpdir(), "aos-inventory-adapters-"));
  try {
    const home = join(root, "home");
    const local = join(root, "local");
    const stateRoot = join(root, "state");
    const env = {
      ...process.env,
      HOME: home,
      USERPROFILE: home,
      LOCALAPPDATA: local,
      ALPHA_AOS_STATE_DIR: stateRoot,
    };
    const cli = (...args: string[]) =>
      spawnSync(process.execPath, [resolve("dist/src/cli.js"), "inventory", ...args], {
        encoding: "utf8",
        env,
      });

    // 1. Default inventory text output includes adaptersSummary lines
    const defaultOut = cli();
    assert.equal(defaultOut.status, 0);
    assert.ok(defaultOut.stdout.includes("adapters:"), "Default inventory text must show adapters summary line");
    assert.ok(defaultOut.stdout.includes("ecc:deep-research-routing@v2"));
    assert.ok(defaultOut.stdout.includes("ecc:antigravity-doc-lookup@v2"));

    // 2. Default --json output preserves overview.components === undefined and provides adaptersSummary/adapters
    const jsonOut = cli("--json");
    assert.equal(jsonOut.status, 0);
    const parsedJson = JSON.parse(jsonOut.stdout) as {
      observations: Array<{
        toolId: string;
        adaptersSummary?: { activeCorrectionCount: number; retiredCorrectionCount: number; policyInterfaceCount: number; text: string };
        adapters?: Array<{ adapterId: string; rationale: string; applicability: string }>;
      }>;
      components?: unknown;
    };
    assert.equal(parsedJson.components, undefined, "Default inventory --json must not expose components");
    assert.ok(parsedJson.observations.length > 0);

    const eccObs = parsedJson.observations.find((o) => o.toolId === "ecc");
    assert.ok(eccObs);
    assert.ok(eccObs.adaptersSummary);
    assert.equal(eccObs.adaptersSummary.activeCorrectionCount, 2);
    assert.equal(eccObs.adaptersSummary.policyInterfaceCount, 1);
    assert.ok(Array.isArray(eccObs.adapters));
    assert.equal(eccObs.adapters.length, 3);
    assert.ok(eccObs.adapters.some((a) => a.adapterId === "ecc:deep-research-routing"));
    assert.ok(eccObs.adapters.some((a) => a.adapterId === "ecc:antigravity-doc-lookup"));
    assert.ok(eccObs.adapters.some((a) => a.adapterId === "policy:claude-skill-overrides"));

    const cuaObs = parsedJson.observations.find((o) => o.toolId === "cua-driver");
    assert.ok(cuaObs);
    assert.ok(cuaObs.adaptersSummary);
    assert.equal(cuaObs.adaptersSummary.activeCorrectionCount, 0);
    assert.deepEqual(cuaObs.adapters, []);

    // 3. Detail text output includes Compatibility Adapters & Policy Interfaces and full metadata
    const detailOut = cli("--detail");
    assert.equal(detailOut.status, 0);
    assert.ok(detailOut.stdout.includes("Compatibility Adapters & Policy Interfaces:"));
    assert.ok(detailOut.stdout.includes("rationale:"));
    assert.ok(detailOut.stdout.includes("applicability:"));
    assert.ok(detailOut.stdout.includes("verificationMethod:"));
    assert.ok(detailOut.stdout.includes("removalCondition:"));

    // 4. Detail --json output includes components
    const detailJson = cli("--detail", "--json");
    assert.equal(detailJson.status, 0);
    const parsedDetailJson = JSON.parse(detailJson.stdout) as {
      observations: unknown[];
      components: unknown[];
    };
    assert.ok(Array.isArray(parsedDetailJson.components));

    // 5. Explicit --tool ecc outputs adapter details
    const eccToolOut = cli("--tool", "ecc");
    assert.equal(eccToolOut.status, 0);
    assert.ok(eccToolOut.stdout.includes("Compatibility Adapters & Policy Interfaces:"));
    assert.ok(eccToolOut.stdout.includes("ecc:deep-research-routing"));
    assert.ok(eccToolOut.stdout.includes("ecc:antigravity-doc-lookup"));

    // 6. Explicit --tool gsd outputs gsd adapter details
    const gsdToolOut = cli("--tool", "gsd");
    assert.equal(gsdToolOut.status, 0);
    assert.ok(gsdToolOut.stdout.includes("gsd:claude-ship-skill"));
    assert.ok(gsdToolOut.stdout.includes("gsd:codex-stop-hook-helpers"));
    assert.ok(gsdToolOut.stdout.includes("policy:codex-execution-guidance"));

    // 7. Explicit --tool cua-driver outputs none cleanly
    const cuaToolOut = cli("--tool", "cua-driver");
    assert.equal(cuaToolOut.status, 0);
    assert.ok(cuaToolOut.stdout.includes("Compatibility Adapters: none"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
