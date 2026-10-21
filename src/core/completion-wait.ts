import { watch, type FSWatcher } from "node:fs";
import { dirname } from "node:path";

export const DEFAULT_OBSERVER_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
export const MAX_OBSERVER_TIMEOUT_MS = 24 * 60 * 60 * 1000; // 24 hours
export const DEFAULT_RECONCILIATION_INTERVAL_MS = 1000; // 1 second
export const MIN_RECONCILIATION_INTERVAL_MS = 10;

export type CompletionCheckResult<T> =
  | { readonly state: "terminal"; readonly value: T }
  | { readonly state: "pending" }
  | { readonly state: "refused"; readonly code: string; readonly reason: string }
  | { readonly state: "unresolved"; readonly code: string; readonly reason: string };

export type ObserverSettlement<T> =
  | { readonly status: "completed"; readonly value: T }
  | { readonly status: "timeout"; readonly elapsedMs: number }
  | { readonly status: "aborted"; readonly reason?: unknown }
  | { readonly status: "refused"; readonly code: string; readonly reason: string }
  | { readonly status: "unresolved"; readonly code: string; readonly reason: string };

export interface ObserverClock {
  now(): number;
  setTimeout(fn: () => void, ms: number): NodeJS.Timeout | number;
  clearTimeout(id: NodeJS.Timeout | number): void;
}

export interface ObserverWatcherHandle {
  close(): void;
}

export interface CompletionObserverOptions<T> {
  readonly targetPath?: string | undefined;
  readonly watchDir?: string | undefined;
  readonly watchDirs?: readonly string[] | undefined;
  readonly check: () => Promise<CompletionCheckResult<T>>;
  readonly timeoutMs?: number | undefined;
  readonly reconciliationIntervalMs?: number | undefined;
  readonly signal?: AbortSignal | undefined;
  readonly clock?: ObserverClock | undefined;
  readonly fsWatcher?: (
    dir: string,
    listener: (eventType: string, filename: string | null) => void,
  ) => ObserverWatcherHandle;
}

export function validateNumericFlag(value: unknown, flagName: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value)) {
    throw new Error(`${flagName} must be a finite integer: got ${String(value)}`);
  }
  if (value < min || value > max) {
    throw new Error(`${flagName} out of bounds: must be between ${min} and ${max}, got ${value}`);
  }
  return value;
}

const systemClock: ObserverClock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (id) => clearTimeout(id as NodeJS.Timeout),
};

function defaultFsWatcher(
  dir: string,
  listener: (eventType: string, filename: string | null) => void,
): ObserverWatcherHandle {
  try {
    const watcher: FSWatcher = watch(dir, { persistent: false }, listener);
    watcher.on("error", () => {
      // Handled through runtime reconciliation
    });
    return {
      close: () => {
        try {
          watcher.close();
        } catch {
          // Ignore close errors during disposal
        }
      },
    };
  } catch {
    // If the directory does not exist or watch fails, return no-op handle
    return { close: () => undefined };
  }
}

/**
 * Dependency-free event-driven completion observer.
 * Validated reread is authority; fs.watch is only a hint.
 * Parent directory is watched for rename/replacement visibility.
 * Registers then rechecks to close the lost-wakeup window.
 * Serializes and coalesces rereads, settling exactly once.
 * Cleans up watchers, timers, and listeners exactly once on every terminal path.
 */
export async function waitForCompletion<T>(options: CompletionObserverOptions<T>): Promise<ObserverSettlement<T>> {
  const clock = options.clock ?? systemClock;
  const timeoutMs = options.timeoutMs !== undefined
    ? validateNumericFlag(options.timeoutMs, "timeoutMs", 1, MAX_OBSERVER_TIMEOUT_MS)
    : DEFAULT_OBSERVER_TIMEOUT_MS;

  const reconciliationIntervalMs = options.reconciliationIntervalMs !== undefined
    ? validateNumericFlag(options.reconciliationIntervalMs, "reconciliationIntervalMs", MIN_RECONCILIATION_INTERVAL_MS, timeoutMs)
    : Math.min(DEFAULT_RECONCILIATION_INTERVAL_MS, timeoutMs);

  const watchDirectories: string[] = [];
  if (options.watchDirs && options.watchDirs.length > 0) {
    for (const d of options.watchDirs) {
      if (d && !watchDirectories.includes(d)) watchDirectories.push(d);
    }
  } else if (options.watchDir) {
    watchDirectories.push(options.watchDir);
  } else if (options.targetPath) {
    watchDirectories.push(dirname(options.targetPath));
  }
  const watcherFactory = options.fsWatcher ?? defaultFsWatcher;

  return new Promise<ObserverSettlement<T>>((resolvePromise) => {
    let settled = false;
    let runningCheck = false;
    let pendingReread = false;

    const watchers: ObserverWatcherHandle[] = [];
    let timeoutTimer: NodeJS.Timeout | number | null = null;
    let reconcileTimer: NodeJS.Timeout | number | null = null;
    let abortListener: (() => void) | null = null;

    const startTime = clock.now();

    const dispose = (): void => {
      while (watchers.length > 0) {
        const w = watchers.pop();
        if (w) {
          try {
            w.close();
          } catch {
            // Ignore disposal errors
          }
        }
      }
      if (timeoutTimer !== null) {
        clock.clearTimeout(timeoutTimer);
        timeoutTimer = null;
      }
      if (reconcileTimer !== null) {
        clock.clearTimeout(reconcileTimer);
        reconcileTimer = null;
      }
      if (abortListener !== null && options.signal) {
        try {
          options.signal.removeEventListener("abort", abortListener);
        } catch {
          // Ignore removal errors
        }
        abortListener = null;
      }
    };

    const settle = (settlement: ObserverSettlement<T>): void => {
      if (settled) return;
      settled = true;
      dispose();
      resolvePromise(settlement);
    };

    const scheduleReconciliation = (): void => {
      if (settled) return;
      reconcileTimer = clock.setTimeout(() => {
        triggerCheck();
        scheduleReconciliation();
      }, reconciliationIntervalMs);
    };

    const triggerCheck = (): void => {
      if (settled) return;
      if (runningCheck) {
        pendingReread = true;
        return;
      }

      runningCheck = true;
      (async () => {
        while (!settled) {
          pendingReread = false;
          let result: CompletionCheckResult<T>;
          try {
            result = await options.check();
          } catch (err: unknown) {
            settle({
              status: "unresolved",
              code: "CHECK_ERROR",
              reason: err instanceof Error ? err.message : String(err),
            });
            return;
          }

          if (settled) return;

          if (result.state === "terminal") {
            settle({ status: "completed", value: result.value });
            return;
          }
          if (result.state === "refused") {
            settle({ status: "refused", code: result.code, reason: result.reason });
            return;
          }
          if (result.state === "unresolved") {
            settle({ status: "unresolved", code: result.code, reason: result.reason });
            return;
          }

          if (!pendingReread) {
            break;
          }
        }
      })()
        .catch((err) => {
          settle({
            status: "unresolved",
            code: "UNEXPECTED_ERROR",
            reason: err instanceof Error ? err.message : String(err),
          });
        })
        .finally(() => {
          runningCheck = false;
          if (pendingReread && !settled) {
            triggerCheck();
          }
        });
    };

    // 1. Fast check for pre-aborted signal
    if (options.signal?.aborted) {
      settle({ status: "aborted", reason: options.signal.reason });
      return;
    }

    // 2. Register abort listener
    if (options.signal) {
      abortListener = () => {
        settle({ status: "aborted", reason: options.signal?.reason });
      };
      options.signal.addEventListener("abort", abortListener, { once: true });
    }

    // 3. Register deadline timer
    timeoutTimer = clock.setTimeout(() => {
      settle({ status: "timeout", elapsedMs: clock.now() - startTime });
    }, timeoutMs);

    // 4. Register directory watchers (hint only)
    for (const dir of watchDirectories) {
      try {
        const handle = watcherFactory(dir, (_eventType, _filename) => {
          triggerCheck();
        });
        watchers.push(handle);
      } catch {
        // Watcher failure is non-fatal; runtime reconciliation carries the load
      }
    }

    // 5. Register bounded runtime reconciliation timer
    scheduleReconciliation();

    // 6. Register then recheck: immediate check closes the lost-wakeup window
    triggerCheck();
  });
}
