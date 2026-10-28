import assert from "node:assert/strict";
import test from "node:test";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const { verifyMcpFixture } = await import(pathToFileURL(resolve("scripts/verify-mcp-fixture.mjs")).href);

test("MCP fixture retries only protocol transport failures and preserves exhausted failures", () => {
  let attempts = 0;
  assert.equal(verifyMcpFixture("firecrawl", () => {
    attempts++;
    return { status: attempts === 1 ? 2 : 0, stderr: "firecrawl MCP protocol failed: Request timed out" };
  }), 0);
  assert.equal(attempts, 2);
  attempts = 0;
  assert.equal(verifyMcpFixture("firecrawl", () => {
    attempts++;
    return { status: 2, stderr: "Integrity mismatch" };
  }), 2);
  assert.equal(attempts, 1);
  attempts = 0;
  assert.equal(verifyMcpFixture("firecrawl", () => {
    attempts++;
    return { status: 2, stderr: "firecrawl MCP protocol failed: Request timed out" };
  }), 2);
  assert.equal(attempts, 2);
});
