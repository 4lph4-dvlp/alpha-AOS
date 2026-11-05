import assert from "node:assert/strict";
import test from "node:test";
import { capabilityDiagnostic, classifyCapabilityFailure, inspectTaskCapabilities, requireRelevantToolResult, requireToolArguments, requireUsefulToolResult } from "../src/core/task-capability-health.js";
import { selectStepObligations } from "../src/core/task-capability-obligations.js";
import { createTaskFixture, fixturePorts, inventorySummaryContract, passingReview, referenceControllerPort, startFixtureTask, staticReviewerPort, writeTaskContract } from "./helpers/task-fixture.js";
import { approveTaskContract, detectQuotaExhaustion, taskContractDigest } from "../src/core/task-contract.js";
import { readCapabilityReceipts } from "../src/core/task-capability-receipts.js";
import { createFreshSessionCapabilityPort, startFreshCapabilitySession } from "../src/adapters/task-agents.js";
import { codexControllerArgs } from "../src/adapters/task-codex.js";

test("managed product names do not create research obligations; explicit invocation does", () => {
  const projectRoot = process.cwd();
  const maintenance = inventorySummaryContract(projectRoot, { goal: "Update Exa, Context7 and Firecrawl packages to the latest compatible release." });
  assert.deepEqual(selectStepObligations({ contract: maintenance, step: "execute", projectRoot }), []);
  assert.deepEqual(selectStepObligations({ contract: { ...maintenance, goal: "Update Exa and Context7 version management, then update README documentation." }, step: "execute", projectRoot }), []);
  const research = { ...maintenance, goal: "Use Exa for web research and consult Context7 API documentation for compatible APIs." };
  assert.deepEqual(selectStepObligations({ contract: research, step: "execute", projectRoot }).map((item) => item.capabilityId), ["documentation-lookup", "deep-research"]);
});

test("capability preflight reports actual native failures without invoking the execution port", async () => {
  const contract = inventorySummaryContract(process.cwd(), { goal: "Use Exa for web research on native task completion." });
  let calls = 0;
  const result = await inspectTaskCapabilities(contract, {
    invoke: async () => { throw new Error("Execution must not run during preflight"); },
    preflight: async () => { calls++; throw new Error("401 unauthorized API key"); },
  }, "preflight-run");
  assert.equal(calls, 1, "the same question is checked once, not at all five workflow boundaries");
  assert.equal(result[0]?.ready, false);
  assert.equal(result[0]?.failureKind, "authentication");
  assert.match(result[0]!.detail, /401/u);
});

test("capability failure taxonomy retains unknowns and distinguishes useful remedies", () => {
  for (const [message, expected] of [["429 rate limit", "quota"], ["401 unauthorized", "authentication"], ["Invalid arguments", "arguments"], ["MCP -32602", "arguments"], ["Tool not found", "unavailable"], ["ECONNRESET", "transport"], ["HTTP 503", "service"], ["No useful explanation", "unknown"]]) assert.equal(classifyCapabilityFailure(message), expected);
});

test("a 429 embedded in a digest is not an HTTP quota response", () => {
  assert.equal(detectQuotaExhaustion("contract digest abc429def token_limit_exceeded"), false);
  assert.equal(detectQuotaExhaustion("HTTP 429 rate limit"), true);
});

test("tool errors preserve actionable content while scrubbing environment credentials", () => {
  const previous = process.env.ALPHA_AOS_TEST_SECRET;
  process.env.ALPHA_AOS_TEST_SECRET = "private-example-credential-123456789";
  try {
    assert.throws(() => requireUsefulToolResult("exa", "web_search_exa", { isError: true, content: [{ type: "text", text: "401 unauthorized private-example-credential-123456789" }] }), (error: unknown) => {
      assert.match(String(error), /capability-authentication/u);
      assert.ok(!String(error).includes(process.env.ALPHA_AOS_TEST_SECRET!));
      return true;
    });
    assert.ok(!capabilityDiagnostic({ error: process.env.ALPHA_AOS_TEST_SECRET }).includes(process.env.ALPHA_AOS_TEST_SECRET));
  } finally { if (previous === undefined) delete process.env.ALPHA_AOS_TEST_SECRET; else process.env.ALPHA_AOS_TEST_SECRET = previous; }
});

test("actual discovered input schema rejects invalid arguments before transport invocation", () => {
  const tool = { name: "web_search_exa", inputSchema: { type: "object", required: ["query"], properties: { query: { type: "string", maxLength: 20 } }, additionalProperties: false } };
  assert.throws(() => requireToolArguments("exa", tool, { query: "x".repeat(21) }), /capability-arguments/u);
  assert.throws(() => requireToolArguments("exa", tool, { query: 2 }), /capability-arguments/u);
  assert.doesNotThrow(() => requireToolArguments("exa", tool, { query: "native events" }));
});

test("Exa draft-07 schemas validate in their declared dialect without weakening managed 2020 schemas", () => {
  const schema = { $schema: "http://json-schema.org/draft-07/schema#", $id: "https://example.invalid/exa-input", type: "object", required: ["query"],
    properties: { query: { type: "string" }, bounds: { type: "array", items: [{ type: "integer" }, { type: "integer" }], additionalItems: false } }, additionalProperties: false };
  assert.doesNotThrow(() => requireToolArguments("exa", { name: "web_search_exa", inputSchema: schema }, { query: "Node.js official docs", bounds: [1, 2] }));
  assert.doesNotThrow(() => requireToolArguments("exa", { name: "web_search_exa", inputSchema: { ...schema } }, { query: "repeat connection" }));
  assert.throws(() => requireToolArguments("exa", { name: "web_search_exa", inputSchema: schema }, { query: 42 }), /capability-arguments/u);
  assert.throws(() => requireToolArguments("exa", { name: "web_search_exa", inputSchema: schema }, { query: "query", bounds: [1, "2"] }), /capability-arguments/u);
  assert.throws(() => requireToolArguments("context7", { name: "query-docs", inputSchema: { $schema: "https://json-schema.org/draft/2020-12/schema", type: "object", required: ["query"], properties: { query: { type: "string" } } } }, {}), /capability-arguments/u);
  const urlTool = { name: "firecrawl_scrape", inputSchema: { $schema: schema.$schema, type: "object", properties: { url: { type: "string", format: "uri" } }, required: ["url"] } };
  assert.doesNotThrow(() => requireToolArguments("firecrawl", urlTool, { url: "https://nodejs.org/api/fs.html" }));
  assert.throws(() => requireToolArguments("firecrawl", urlTool, { url: "not a URI" }), /capability-arguments/u);
});

test("empty, embedded-error and irrelevant output cannot satisfy a capability", () => {
  assert.throws(() => requireUsefulToolResult("exa", "search", { content: [] }), /capability-evidence/u);
  assert.throws(() => requireUsefulToolResult("exa", "search", { content: [{ type: "text", text: "No search results found for this query" }] }), /capability-evidence/u);
  assert.throws(() => requireUsefulToolResult("firecrawl", "scrape", { content: [{ type: "text", text: JSON.stringify({ success: false, error: "HTTP 503 service unavailable" }) }] }), /capability-service/u);
  assert.throws(() => requireRelevantToolResult("exa", "search", "A long article about tropical birds and fishing.", "Codex completion notification protocol"), /irrelevant/u);
  assert.doesNotThrow(() => requireRelevantToolResult("exa", "search", "Codex emits native turn completion events.", "Codex completion notification protocol"));
});

test("fresh discovery without a real invoker cannot manufacture a successful receipt", async () => {
  const session = await startFreshCapabilitySession({ harness: "codex", projectRoot: process.cwd(), probeDiscovery: () => ({ skills: ["deep-research"], mcpTools: ["web_search_exa"] }) });
  const contract = inventorySummaryContract(process.cwd(), { goal: "Use Exa for web research about native task completion" });
  const obligation = selectStepObligations({ contract, projectRoot: process.cwd(), step: "execute" })[0]!;
  const result = await createFreshSessionCapabilityPort({ session }).invoke({ projectRoot: process.cwd(), runId: "fresh-run", step: "execute", obligation });
  assert.equal(result.receipt.invoked, false);
  assert.equal(result.receipt.outcome, "failed");
  assert.equal(result.receipt.isError, true);
});

test("question-only native repair launches Codex read-only even if a Git write grant exists", () => {
  const args = codexControllerArgs({ projectRoot: process.cwd(), outputSchemaPath: "schema.json", lastMessagePath: "message.json", gitDirectory: process.cwd(), readOnly: true });
  assert.equal(args[args.indexOf("--sandbox") + 1], "read-only");
  assert.ok(!args.includes("workspace-write"));
});

test("an execute-time capability exception persists a failed receipt and its actionable diagnostic", async (context) => {
  const fixture = await createTaskFixture(context);
  const contract = inventorySummaryContract(fixture.projectRoot, { goal: "Use Exa for web research on CSV parsing, then implement the inventory summary CLI." });
  await writeTaskContract(fixture.contractPath, contract);
  const digest = taskContractDigest(contract);
  await approveTaskContract({ contractPath: fixture.contractPath, expectedDigest: digest, stateRoot: fixture.stateRoot });
  const ports = fixturePorts({ controller: referenceControllerPort("correct"), reviewer: staticReviewerPort(passingReview) });
  ports.capability = { invoke: async () => { throw new Error("capability-arguments: exa/web_search_exa: invalid query schema"); } };
  const { run } = await startFixtureTask(fixture, { ports, expectedDigest: digest });
  const receipts = await readCapabilityReceipts(fixture.stateRoot, run.runId);
  assert.equal(receipts.length, 1);
  assert.equal(receipts[0]?.outcome, "failed");
  assert.equal(receipts[0]?.invoked, false);
  assert.match(receipts[0]!.errorMessage!, /invalid query schema/u);
  assert.match(run.stopReason!, /invalid query schema/u);
});
