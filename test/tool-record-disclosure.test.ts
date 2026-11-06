import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { planToolRecordOperation, runToolRecordOperation } from "../src/core/tool-record-store.js";

test("operation exception details never reach persisted files or CLI output", async () => {
  const root = await mkdtemp(join(tmpdir(), "aos-record-disclosure-"));
  const secret = "EXCEPTION_CANARY_5bc637a967";
  try {
    const stateRoot = join(root, "state"), checkout = join(root, "checkout");
    await mkdir(checkout);
    const request = { toolId: "cua-driver", selector: "1.2.3", exact: true };
    const plan = await planToolRecordOperation({ stateRoot, packageRoot: checkout, operationId: "disclosure", occurredAt: "2026-01-01T00:00:00Z", requests: [request] });
    const outcome = await runToolRecordOperation(plan, async () => { throw new Error(secret); });
    assert.equal(outcome.ok, false);
    const scan = async (dir: string): Promise<void> => {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) await scan(path);
        else if (entry.isFile()) assert.equal((await readFile(path)).includes(Buffer.from(secret)), false, path);
      }
    };
    await scan(stateRoot);
    const env = { ...process.env, HOME: join(root, "home"), USERPROFILE: join(root, "home"), LOCALAPPDATA: join(root, "local"), ALPHA_AOS_STATE_DIR: stateRoot };
    for (const args of [["inventory", "--operation", "disclosure"], ["inventory", "--tool", "cua-driver", "--history"]]) for (const json of [false, true]) {
      const output = execFileSync(process.execPath, [resolve("dist/src/cli.js"), ...args, ...(json ? ["--json"] : [])], { env, encoding: "utf8" });
      assert.doesNotMatch(output, new RegExp(secret));
      assert.match(output, /disclosure/);
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});
