import assert from "node:assert/strict";
import test from "node:test";
import {
  waitForCompletion,
  validateNumericFlag,
  type CompletionCheckResult,
  type ObserverClock,
} from "../src/core/completion-wait.js";

function createMockClock(initialTime = 1000): {
  clock: ObserverClock;
  advance: (ms: number) => void;
  timerCount: () => number;
} {
  let currentTime = initialTime;
  interface Timer {
    id: number;
    due: number;
    fn: () => void;
  }
  let nextId = 1;
  const timers = new Map<number, Timer>();

  const clock: ObserverClock = {
    now: () => currentTime,
    setTimeout: (fn, ms) => {
      const id = nextId++;
      timers.set(id, { id, due: currentTime + ms, fn });
      return id;
    },
    clearTimeout: (id) => {
      timers.delete(id as number);
    },
  };

  const advance = (ms: number) => {
    currentTime += ms;
    const ready = [...timers.values()]
      .filter((t) => t.due <= currentTime)
      .sort((a, b) => a.due - b.due);
    for (const t of ready) {
      if (timers.has(t.id)) {
        timers.delete(t.id);
        t.fn();
      }
    }
  };

  return { clock, advance, timerCount: () => timers.size };
}

test("completion-wait: already completed before attach resolves once immediately", async () => {
  let checkCount = 0;
  const { clock, timerCount } = createMockClock();

  const settlement = await waitForCompletion({
    clock,
    check: async () => {
      checkCount++;
      return { state: "terminal", value: { done: true, count: 42 } };
    },
  });

  assert.equal(settlement.status, "completed");
  if (settlement.status === "completed") {
    assert.deepEqual(settlement.value, { done: true, count: 42 });
  }
  assert.equal(checkCount, 1);
  // Watchers and timers disposed exactly once
  assert.equal(timerCount(), 0);
});

test("completion-wait: event-driven hint triggers check and completes", async () => {
  let checkCount = 0;
  let watcherListener: ((eventType: string, filename: string | null) => void) | null = null;
  let watcherClosed = false;

  let state: "pending" | "terminal" = "pending";

  const observerPromise = waitForCompletion({
    watchDir: "/mock/watch/dir",
    fsWatcher: (_dir, listener) => {
      watcherListener = listener;
      return {
        close: () => {
          watcherClosed = true;
        },
      };
    },
    check: async () => {
      checkCount++;
      if (state === "terminal") {
        return { state: "terminal", value: "event-completed" };
      }
      return { state: "pending" };
    },
  });

  // First check on attach finds pending
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(checkCount, 1);

  // Transition state and fire watcher event hint
  state = "terminal";
  const listener = watcherListener as ((eventType: string, filename: string | null) => void) | null;
  assert.ok(listener !== null);
  listener("change", "record.json");

  const settlement = await observerPromise;
  assert.equal(settlement.status, "completed");
  if (settlement.status === "completed") {
    assert.equal(settlement.value, "event-completed");
  }
  assert.equal(watcherClosed, true);
});

test("completion-wait: coalesces event bursts and serializes concurrent rereads", async () => {
  let checkCalls = 0;
  let concurrentChecks = 0;
  let maxConcurrent = 0;
  let watcherListener: ((eventType: string, filename: string | null) => void) | null = null;
  let iterationsBeforeComplete = 3;

  const observerPromise = waitForCompletion({
    watchDir: "/mock/watch/dir",
    fsWatcher: (_dir, listener) => {
      watcherListener = listener;
      return { close: () => undefined };
    },
    check: async () => {
      checkCalls++;
      concurrentChecks++;
      maxConcurrent = Math.max(maxConcurrent, concurrentChecks);
      await new Promise((r) => setTimeout(r, 20));
      concurrentChecks--;

      iterationsBeforeComplete--;
      if (iterationsBeforeComplete <= 0) {
        return { state: "terminal", value: "burst-coalesced" };
      }
      return { state: "pending" };
    },
  });

  await new Promise((r) => setTimeout(r, 5));
  // Fire 10 rapid events
  const listener = watcherListener as ((eventType: string, filename: string | null) => void) | null;
  assert.ok(listener !== null);
  for (let i = 0; i < 10; i++) {
    listener("change", "file.json");
  }

  const settlement = await observerPromise;
  assert.equal(settlement.status, "completed");
  assert.equal(maxConcurrent, 1, "Checks must be serialized, never overlapping");
});

test("completion-wait: bounded reconciliation triggers check when no watcher events arrive", async () => {
  let checkCount = 0;
  const { clock, advance } = createMockClock();

  let isReady = false;

  const observerPromise = waitForCompletion({
    clock,
    reconciliationIntervalMs: 500,
    check: async () => {
      checkCount++;
      if (isReady) {
        return { state: "terminal", value: "reconciled" };
      }
      return { state: "pending" };
    },
  });

  // Initial check
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(checkCount, 1);

  // Ready on next tick
  isReady = true;
  advance(500);
  await new Promise((r) => setTimeout(r, 0));

  const settlement = await observerPromise;
  assert.equal(settlement.status, "completed");
  if (settlement.status === "completed") {
    assert.equal(settlement.value, "reconciled");
  }
  assert.ok(checkCount >= 2);
});

test("completion-wait: timeout fires deadline and disposes all handles", async () => {
  const { clock, advance, timerCount } = createMockClock();
  let watcherClosed = false;

  const observerPromise = waitForCompletion({
    clock,
    timeoutMs: 5000,
    watchDir: "/mock/watch/dir",
    fsWatcher: () => ({
      close: () => {
        watcherClosed = true;
      },
    }),
    check: async () => ({ state: "pending" }),
  });

  advance(5000);
  const settlement = await observerPromise;

  assert.equal(settlement.status, "timeout");
  if (settlement.status === "timeout") {
    assert.equal(settlement.elapsedMs, 5000);
  }
  assert.equal(watcherClosed, true);
  assert.equal(timerCount(), 0);
});

test("completion-wait: pre-aborted signal settles immediately without running check", async () => {
  const controller = new AbortController();
  controller.abort("already-stopped");

  let checkRan = false;
  const settlement = await waitForCompletion({
    signal: controller.signal,
    check: async () => {
      checkRan = true;
      return { state: "pending" };
    },
  });

  assert.equal(settlement.status, "aborted");
  if (settlement.status === "aborted") {
    assert.equal(settlement.reason, "already-stopped");
  }
  assert.equal(checkRan, false);
});

test("completion-wait: mid-flight abort disposes resources and settles aborted", async () => {
  const controller = new AbortController();
  let watcherClosed = false;

  const observerPromise = waitForCompletion({
    signal: controller.signal,
    watchDir: "/mock/watch/dir",
    fsWatcher: () => ({
      close: () => {
        watcherClosed = true;
      },
    }),
    check: async () => ({ state: "pending" }),
  });

  await new Promise((r) => setTimeout(r, 10));
  controller.abort("user-cancelled");

  const settlement = await observerPromise;
  assert.equal(settlement.status, "aborted");
  if (settlement.status === "aborted") {
    assert.equal(settlement.reason, "user-cancelled");
  }
  assert.equal(watcherClosed, true);
});

test("completion-wait: refused and unresolved outcomes settle cleanly", async () => {
  const refusedSettlement = await waitForCompletion({
    check: async () => ({
      state: "refused",
      code: "FORGED_IDENTITY",
      reason: "Digest does not match",
    }),
  });
  assert.equal(refusedSettlement.status, "refused");
  if (refusedSettlement.status === "refused") {
    assert.equal(refusedSettlement.code, "FORGED_IDENTITY");
  }

  const unresolvedSettlement = await waitForCompletion({
    check: async () => ({
      state: "unresolved",
      code: "OWNER_DEAD",
      reason: "Worker process is no longer running",
    }),
  });
  assert.equal(unresolvedSettlement.status, "unresolved");
  if (unresolvedSettlement.status === "unresolved") {
    assert.equal(unresolvedSettlement.code, "OWNER_DEAD");
  }
});

test("completion-wait: validateNumericFlag rejects non-integers, negative, NaN, and overflow", () => {
  assert.throws(() => validateNumericFlag(NaN, "timeout", 1, 100), /must be a finite integer/);
  assert.throws(() => validateNumericFlag(Infinity, "timeout", 1, 100), /must be a finite integer/);
  assert.throws(() => validateNumericFlag(3.14, "timeout", 1, 100), /must be a finite integer/);
  assert.throws(() => validateNumericFlag(-5, "timeout", 1, 100), /out of bounds/);
  assert.throws(() => validateNumericFlag(0, "timeout", 1, 100), /out of bounds/);
  assert.throws(() => validateNumericFlag(150, "timeout", 1, 100), /out of bounds/);
  assert.equal(validateNumericFlag(50, "timeout", 1, 100), 50);
});

test("completion-wait: register/recheck race resolves immediately without waiting for reconciliation timer", async () => {
  let checkCount = 0;
  let watcherRegistered = false;

  const start = Date.now();
  const settlement = await waitForCompletion({
    watchDir: "/mock/watch/dir",
    reconciliationIntervalMs: 10000,
    fsWatcher: () => {
      watcherRegistered = true;
      return { close: () => undefined };
    },
    check: async () => {
      checkCount++;
      return { state: "terminal", value: "race-closed" };
    },
  });

  const duration = Date.now() - start;
  assert.equal(settlement.status, "completed");
  if (settlement.status === "completed") {
    assert.equal(settlement.value, "race-closed");
  }
  assert.equal(watcherRegistered, true);
  assert.equal(checkCount, 1);
  assert.ok(duration < 1000, `Must complete immediately via recheck, took ${duration}ms`);
});

test("completion-wait: watcher creation failure or error event is non-fatal and reconciliation completes", async () => {
  let checkCount = 0;
  let isDone = false;

  const observerPromise = waitForCompletion({
    watchDir: "/mock/unwatchable/dir",
    reconciliationIntervalMs: 20,
    fsWatcher: () => {
      throw new Error("EACCES: permission denied to watch directory");
    },
    check: async () => {
      checkCount++;
      if (isDone) {
        return { state: "terminal", value: "recovered-via-reconciliation" };
      }
      return { state: "pending" };
    },
  });

  await new Promise((r) => setTimeout(r, 40));
  isDone = true;

  const settlement = await observerPromise;
  assert.equal(settlement.status, "completed");
  if (settlement.status === "completed") {
    assert.equal(settlement.value, "recovered-via-reconciliation");
  }
  assert.ok(checkCount >= 2);
});

test("completion-wait: null, dropped, or rename event hints trigger check safely", async () => {
  let checkCount = 0;
  let watcherListener: ((eventType: string, filename: string | null) => void) | null = null;
  let state: "pending" | "terminal" = "pending";

  const observerPromise = waitForCompletion({
    watchDir: "/mock/watch/dir",
    reconciliationIntervalMs: 5000,
    fsWatcher: (_dir, listener) => {
      watcherListener = listener;
      return { close: () => undefined };
    },
    check: async () => {
      checkCount++;
      if (state === "terminal") {
        return { state: "terminal", value: "rename-and-null-safe" };
      }
      return { state: "pending" };
    },
  });

  await new Promise((r) => setTimeout(r, 10));
  const listener = watcherListener as ((eventType: string, filename: string | null) => void) | null;
  assert.ok(listener !== null);

  listener("rename", null);
  listener("change", null);
  listener("rename", "replaced.json.tmp");

  state = "terminal";
  listener("rename", "replaced.json");

  const settlement = await observerPromise;
  assert.equal(settlement.status, "completed");
  if (settlement.status === "completed") {
    assert.equal(settlement.value, "rename-and-null-safe");
  }
});

test("completion-wait: two concurrent observers on same target settle independently without cross-talk", async () => {
  let watcher1Closed = false;
  let watcher2Closed = false;
  let sharedState: "pending" | "terminal" = "pending";

  let listener1: ((eventType: string, filename: string | null) => void) | null = null;
  let listener2: ((eventType: string, filename: string | null) => void) | null = null;

  const obs1 = waitForCompletion({
    watchDir: "/mock/shared/dir",
    fsWatcher: (_d, l) => {
      listener1 = l;
      return { close: () => { watcher1Closed = true; } };
    },
    check: async () => {
      if (sharedState === "terminal") return { state: "terminal", value: "obs1-done" };
      return { state: "pending" };
    },
  });

  const obs2 = waitForCompletion({
    watchDir: "/mock/shared/dir",
    fsWatcher: (_d, l) => {
      listener2 = l;
      return { close: () => { watcher2Closed = true; } };
    },
    check: async () => {
      if (sharedState === "terminal") return { state: "terminal", value: "obs2-done" };
      return { state: "pending" };
    },
  });

  await new Promise((r) => setTimeout(r, 10));
  sharedState = "terminal";

  listener1!("change", "event.json");
  listener2!("change", "event.json");

  const [settlement1, settlement2] = await Promise.all([obs1, obs2]);

  assert.equal(settlement1.status, "completed");
  if (settlement1.status === "completed") {
    assert.equal(settlement1.value, "obs1-done");
  }

  assert.equal(settlement2.status, "completed");
  if (settlement2.status === "completed") {
    assert.equal(settlement2.value, "obs2-done");
  }

  assert.equal(watcher1Closed, true);
  assert.equal(watcher2Closed, true);
});

test("completion-wait: all watcher handles, timers, and abort listeners disposed across all settlement kinds", async () => {
  const outcomes: Array<{
    name: string;
    check: () => Promise<CompletionCheckResult<string>>;
    expectedStatus: string;
    abortAfter?: boolean;
    timeout?: boolean;
  }> = [
    {
      name: "terminal",
      check: async () => ({ state: "terminal", value: "done" }),
      expectedStatus: "completed",
    },
    {
      name: "refused",
      check: async () => ({ state: "refused", code: "REFUSED_CODE", reason: "Refused" }),
      expectedStatus: "refused",
    },
    {
      name: "unresolved",
      check: async () => ({ state: "unresolved", code: "UNRESOLVED_CODE", reason: "Unresolved" }),
      expectedStatus: "unresolved",
    },
    {
      name: "timeout",
      check: async () => ({ state: "pending" }),
      expectedStatus: "timeout",
      timeout: true,
    },
    {
      name: "aborted",
      check: async () => ({ state: "pending" }),
      expectedStatus: "aborted",
      abortAfter: true,
    },
  ];

  for (const outcome of outcomes) {
    let closed = false;
    const { clock, advance, timerCount } = createMockClock();
    const ac = new AbortController();

    const p = waitForCompletion({
      clock,
      watchDir: "/mock/dir",
      signal: ac.signal,
      timeoutMs: outcome.timeout ? 100 : 5000,
      reconciliationIntervalMs: 50,
      fsWatcher: () => ({
        close: () => {
          closed = true;
        },
      }),
      check: outcome.check,
    });

    if (outcome.timeout) {
      advance(100);
    } else if (outcome.abortAfter) {
      await new Promise((r) => setTimeout(r, 0));
      ac.abort("test-abort");
    }

    const s = await p;
    assert.equal(s.status, outcome.expectedStatus, `Outcome ${outcome.name} had unexpected status`);
    assert.equal(closed, true, `Watcher must be closed for outcome ${outcome.name}`);
    assert.equal(timerCount(), 0, `All timers must be cleared for outcome ${outcome.name}`);
  }
});

test("completion-wait: abort during watcher registration closes newly returned watcher exactly once and stops subsequent registration", async () => {
  const ac = new AbortController();
  const createdDirs: string[] = [];
  const closedDirs: string[] = [];
  let closeCount = 0;

  const settlement = await waitForCompletion({
    watchDirs: ["/mock/dir1", "/mock/dir2", "/mock/dir3"],
    signal: ac.signal,
    fsWatcher: (dir) => {
      createdDirs.push(dir);
      if (dir === "/mock/dir1") {
        ac.abort("synchronous-abort-in-factory");
      }
      return {
        close: () => {
          closedDirs.push(dir);
          closeCount++;
        },
      };
    },
    check: async () => ({ state: "pending" }),
  });

  assert.equal(settlement.status, "aborted");
  assert.equal(createdDirs.length, 1);
  assert.equal(createdDirs[0], "/mock/dir1");
  assert.equal(closedDirs.length, 1);
  assert.equal(closedDirs[0], "/mock/dir1");
  assert.equal(closeCount, 1);
});

test("completion-wait: check-induced abort during registration cleans up all handles and timers", async () => {
  const ac = new AbortController();
  let watcherCloseCount = 0;
  const { clock, timerCount } = createMockClock();

  const settlement = await waitForCompletion({
    clock,
    watchDirs: ["/mock/dir1", "/mock/dir2"],
    signal: ac.signal,
    fsWatcher: () => ({
      close: () => {
        watcherCloseCount++;
      },
    }),
    check: async () => {
      ac.abort("abort-inside-check");
      return { state: "pending" };
    },
  });

  assert.equal(settlement.status, "aborted");
  assert.equal(watcherCloseCount, 2);
  assert.equal(timerCount(), 0);
});
