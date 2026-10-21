import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, realpath, rename, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import test from "node:test";
import {
  readBoundedFile, startCommandJob, writeAtomicPrivateFile,
  type CommandJobPathBarrier,
} from "../src/core/command-jobs.js";

async function fixture() {
  const base = await realpath(await mkdtemp(join(tmpdir(), "job-path-proof-")));
  const stateRoot = join(base, "state"), parent = join(stateRoot, "jobs", "owned");
  await mkdir(parent, { recursive: true });
  return { base, stateRoot, parent, cleanup: () => rm(base, { recursive: true, force: true }) };
}

test("command-job-paths: retained reader proof rejects regular ancestor replacement before bytes", async () => {
  const f = await fixture();
  try {
    const file = join(f.parent, "job.json");
    await writeFile(file, "original");
    let reachedBytes = false;
    const barrier: CommandJobPathBarrier = async (phase) => {
      if (phase === "read:before-open") {
        await rename(f.parent, f.parent + "-original");
        await mkdir(f.parent);
        await writeFile(file, Buffer.from([0xff]));
      }
      if (phase === "read:before-bytes") reachedBytes = true;
    };
    await assert.rejects(readBoundedFile(file, f.stateRoot, 1024, barrier), /JOB_PATH_CHANGED/);
    assert.equal(reachedBytes, false);
    assert.deepEqual(await readFile(file), Buffer.from([0xff]));
  } finally { await f.cleanup(); }
});

test("command-job-paths: retained reader proof rejects outside ancestor alias before bytes", async (context) => {
  const f = await fixture();
  try {
    const outside = join(f.base, "outside"), file = join(f.parent, "job.json");
    await mkdir(outside);
    await writeFile(file, "original");
    await writeFile(join(outside, "job.json"), Buffer.from([0xff]));
    let setupUnsupported = false, reachedBytes = false;
    const barrier: CommandJobPathBarrier = async (phase) => {
      if (phase === "read:before-open") {
        await rename(f.parent, f.parent + "-original");
        try { await symlink(outside, f.parent, process.platform === "win32" ? "junction" : "dir"); }
        catch (error) {
          if (!["EPERM", "EACCES", "ENOSYS"].includes((error as NodeJS.ErrnoException).code ?? "")) throw error;
          setupUnsupported = true;
          context.skip("Directory alias setup unavailable on this filesystem.");
          throw error;
        }
      }
      if (phase === "read:before-bytes") reachedBytes = true;
    };
    try {
      await assert.rejects(readBoundedFile(file, f.stateRoot, 1024, barrier), /JOB_PATH_CHANGED/);
    } catch (error) {
      if (!setupUnsupported) throw error;
    }
    if (setupUnsupported) return;
    assert.equal(reachedBytes, false);
    assert.deepEqual(await readFile(join(outside, "job.json")), Buffer.from([0xff]));
  } finally { await f.cleanup(); }
});

test("command-job-paths: descriptor refuses a replacement leaf before reading payload", async () => {
  const f = await fixture();
  try {
    const file = join(f.parent, "job.json");
    await writeFile(file, "original");
    await assert.rejects(readBoundedFile(file, f.stateRoot, 1024, async (phase) => {
      if (phase === "read:before-bytes") {
        await rename(file, file + ".original");
        await writeFile(file, Buffer.from([0xff]));
      }
    }), /JOB_PATH_CHANGED/);
    assert.deepEqual(await readFile(file), Buffer.from([0xff]));
  } finally { await f.cleanup(); }
});

test("command-job-paths: writer refuses regular ancestor swap before open and preserves foreign temp", async () => {
  const f = await fixture();
  try {
    const target = join(f.parent, "job.json");
    let foreignTemp = "", originalTemp = "";
    await assert.rejects(writeAtomicPrivateFile(target, "PRIVATE_PAYLOAD", 1024, f.stateRoot, {
      barrier: async (phase, path) => {
        if (phase === "write:before-open") {
          await rename(f.parent, f.parent + "-original");
          await mkdir(f.parent);
          foreignTemp = path;
          originalTemp = join(f.parent + "-original", basename(path));
          await writeFile(foreignTemp, "FOREIGN_TEMP");
        }
      },
    }), /JOB_PATH_CHANGED/);
    assert.equal(await readFile(foreignTemp, "utf8"), "FOREIGN_TEMP");
    assert.equal(existsSync(originalTemp), false, "No payload descriptor was opened in the replaced parent");
    assert.equal(existsSync(target), false);
  } finally { await f.cleanup(); }
});

test("command-job-paths: writer rejects an outside alias before rename without changing outside bytes", async (context) => {
  const f = await fixture();
  try {
    const outside = join(f.base, "outside"), target = join(f.parent, "job.json");
    await mkdir(outside);
    let setupUnsupported = false, foreignTemp = "";
    try {
      await assert.rejects(writeAtomicPrivateFile(target, "PRIVATE_PAYLOAD", 1024, f.stateRoot, {
        barrier: async (phase, path) => {
          if (phase === "write:before-rename") {
            await rename(f.parent, f.parent + "-original");
            try { await symlink(outside, f.parent, process.platform === "win32" ? "junction" : "dir"); }
            catch (error) {
              if (!["EPERM", "EACCES", "ENOSYS"].includes((error as NodeJS.ErrnoException).code ?? "")) throw error;
              setupUnsupported = true;
              context.skip("Directory alias setup unavailable on this filesystem.");
              throw error;
            }
            foreignTemp = join(outside, basename(path));
            await writeFile(foreignTemp, "FOREIGN_TEMP");
          }
        },
      }), /JOB_PATH_CHANGED/);
    } catch (error) {
      if (!setupUnsupported) throw error;
    }
    if (setupUnsupported) return;
    assert.equal(await readFile(foreignTemp, "utf8"), "FOREIGN_TEMP");
    assert.equal(existsSync(join(outside, "job.json")), false);
  } finally { await f.cleanup(); }
});

test("command-job-paths: failed exclusive temp open never cleans another creator's entry", async () => {
  const f = await fixture();
  try {
    const target = join(f.parent, "job.json");
    let foreignTemp = "";
    await assert.rejects(writeAtomicPrivateFile(target, "payload", 1024, f.stateRoot, {
      barrier: async (phase, path) => {
        if (phase === "write:before-open") {
          foreignTemp = path;
          await writeFile(path, "FOREIGN_TEMP");
        }
      },
    }), (error: NodeJS.ErrnoException) => error.code === "EEXIST");
    assert.equal(await readFile(foreignTemp, "utf8"), "FOREIGN_TEMP");
    assert.equal(existsSync(target), false);
  } finally { await f.cleanup(); }
});

test("command-job-paths: byte preflight and pretty launch bounds create no state artifacts", async () => {
  const f = await fixture();
  try {
    const writerRoot = join(f.base, "missing-writer-state");
    await assert.rejects(writeAtomicPrivateFile(join(writerRoot, "nested", "file"), "xx", 1, writerRoot), /JOB_PAYLOAD_TOO_LARGE/);
    assert.equal(existsSync(writerRoot), false);
    const launchRoot = join(f.base, "missing-launch-state"), cwd = join(f.base, "project");
    await mkdir(cwd);
    await assert.rejects(startCommandJob({
      stateRoot: launchRoot, cwd, executable: process.execPath, args: Array<string>(9000).fill(""),
    }), /JOB_PAYLOAD_TOO_LARGE/);
    assert.equal(existsSync(launchRoot), false);
  } finally { await f.cleanup(); }
});

test("command-job-paths: exclusive job directory collision preserves existing launch and record bytes", async () => {
  const f = await fixture();
  try {
    const cwd = join(f.base, "project");
    await mkdir(cwd);
    let collision = "";
    await assert.rejects(startCommandJob({
      stateRoot: f.stateRoot, cwd, executable: process.execPath, args: [],
    }, async (phase, path) => {
      if (phase === "start:before-job-mkdir") {
        collision = path;
        await mkdir(path);
        await writeFile(join(path, "job.json"), "FOREIGN_RECORD");
        await writeFile(join(path, "launch-spec.json"), "FOREIGN_LAUNCH");
      }
    }), (error: NodeJS.ErrnoException) => error.code === "EEXIST");
    assert.equal(await readFile(join(collision, "job.json"), "utf8"), "FOREIGN_RECORD");
    assert.equal(await readFile(join(collision, "launch-spec.json"), "utf8"), "FOREIGN_LAUNCH");
  } finally { await f.cleanup(); }
});

test("command-job-paths: initial file collision cleanup never deletes an uncreated foreign record or launch", async () => {
  for (const name of ["job.json", "launch-spec.json"]) {
    const f = await fixture();
    try {
      const cwd = join(f.base, "project");
      await mkdir(cwd);
      let collision = "";
      await assert.rejects(startCommandJob({
        stateRoot: f.stateRoot, cwd, executable: process.execPath, args: [],
      }, async (phase, path) => {
        if (phase === "start:after-job-mkdir") {
          collision = join(path, name);
          await writeFile(collision, "FOREIGN_ENTRY");
        }
      }), (error: NodeJS.ErrnoException) => name === "job.json"
        ? /exclusive initial creation refused/.test(error.message)
        : error.code === "EEXIST");
      assert.equal(await readFile(collision, "utf8"), "FOREIGN_ENTRY");
      if (name === "job.json") assert.equal(existsSync(join(dirname(collision), "launch-spec.json")), false);
    } finally { await f.cleanup(); }
  }
});
