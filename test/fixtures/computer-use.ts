export const authorityFixture = () => ({
  version: 1, runId: "test-run", contractDigest: "a".repeat(64), expiresAt: Date.now() + 60_000, idleMs: 10_000,
  target: { executable: process.execPath, executableHash: "b".repeat(64), pid: 42, processGeneration: "start-42", windowId: "window-42", windowGeneration: "1" },
  runtime: { executableHash: "c".repeat(64), schemaHash: "d".repeat(64) }, region: { x: 0, y: 0, width: 1, height: 1 },
  permissions: { actions: ["click", "right_click", "drag", "type_text", "press_key", "launch_app"], capture: true, publicData: true, foreground: false },
  budget: { actions: 5, captures: 12, bytes: 1_000_000, durationMs: 30_000, gestureMs: 2000 },
});
export const pngFixture = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==", "base64");
