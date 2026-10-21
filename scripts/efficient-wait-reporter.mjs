import { basename } from "node:path";

// Structured Node 24 test reporter for verify-efficient-wait.
// Emits authenticated, bounded event lines distinguishing leaf tests, suites,
// skips, todos, and cancellations. Child stdout/stderr (test:stdout/stderr)
// are intentionally ignored to prevent event stream spoofing.

const EVENT_PREFIX = "@@VERIFIER_EVENT@@:";

export default async function* reporter(source) {
  for await (const event of source) {
    if (!event || typeof event.type !== "string") continue;

    // Only process pass and fail test lifecycle events
    if (event.type === "test:pass" || event.type === "test:fail") {
      const data = event.data;
      if (!data) continue;

      const detailsType = data.details?.type ?? null;
      const isSuite = detailsType === "suite";
      const isSkip = data.skip !== undefined && data.skip !== false;
      const isTodo = data.todo !== undefined && data.todo !== false;
      const isCancelled =
        data.cancelled === true ||
        (event.type === "test:fail" &&
          (data.details?.error?.failureType === "cancelled" ||
            (data.details?.error?.code === "ERR_TEST_FAILURE" &&
              String(data.details?.error?.message).includes("cancelled"))));

      const name = typeof data.name === "string" ? data.name : "";
      const file = typeof data.file === "string" ? data.file : "";
      const line = typeof data.line === "number" ? data.line : null;
      const column = typeof data.column === "number" ? data.column : null;
      const nesting = typeof data.nesting === "number" ? data.nesting : 0;

      const fileBase = file ? basename(file) : "";
      const isFileWrapper =
        line === 1 &&
        nesting === 0 &&
        (name.endsWith(".js") ||
          name.endsWith(".mjs") ||
          name.endsWith(".ts") ||
          (fileBase !== "" && (name === fileBase || name === file || file.endsWith(name))));

      const errorMsg =
        event.type === "test:fail"
          ? String(data.details?.error?.message || data.details?.error || "test failed").slice(0, 512)
          : null;

      const payload = {
        type: event.type,
        name,
        file,
        line,
        column,
        nesting,
        isSuite,
        isFileWrapper,
        isSkip,
        isTodo,
        isCancelled,
        detailsType,
        error: errorMsg,
      };

      yield `${EVENT_PREFIX}${JSON.stringify(payload)}\n`;
    }
  }
}

export { EVENT_PREFIX };
