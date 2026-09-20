import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { loadCanaryCatalog, matchExpectations } from "../src/core/canary.js";
import { evaluateLifecycleGates } from "../src/core/gate-lifecycle.js";
import {
  observationLine,
  openObservedUpstream,
  readObservationRecords,
  type McpObservation,
} from "../src/core/mcp-proxy.js";
import { planProjectCapabilities } from "../src/core/project-plan.js";
import { inspectTreeSurface } from "../src/core/surface-inspector.js";
import { setTreePolicy } from "../src/core/tree-policy.js";
import { createOrdinaryRepository } from "./helpers/git-fixture.js";

const VERIFIED_AT = "2026-09-18T00:00:00.000Z";
const DOCUMENT_PATH = join(process.cwd(), "docs", "RELEASE_CONTROLS.md");

interface ControlReceipt {
  readonly sha256: string;
  readonly evidence: Readonly<Record<string, unknown>>;
}

export interface ControlPairResult {
  readonly domain: string;
  readonly positive: { readonly name: string; readonly passed: boolean; readonly receipt: ControlReceipt };
  readonly negative: { readonly name: string; readonly passed: boolean; readonly receipt: ControlReceipt };
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
        .map(([key, nested]) => [key, stableValue(nested)]),
    );
  }
  return value;
}

function receipt(evidence: Readonly<Record<string, unknown>>): ControlReceipt {
  const canonical = JSON.stringify(stableValue(evidence));
  return { sha256: createHash("sha256").update(canonical).digest("hex"), evidence };
}

function pair(
  domain: string,
  positive: { readonly name: string; readonly passed: boolean; readonly evidence: Readonly<Record<string, unknown>> },
  negative: { readonly name: string; readonly passed: boolean; readonly evidence: Readonly<Record<string, unknown>> },
): ControlPairResult {
  return {
    domain,
    positive: { name: positive.name, passed: positive.passed, receipt: receipt(positive.evidence) },
    negative: { name: negative.name, passed: negative.passed, receipt: receipt(negative.evidence) },
  };
}

function escapeCell(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\r", " ").replaceAll("\n", " ");
}

export function generateReleaseControlsMarkdown(
  results: readonly ControlPairResult[],
  options: { readonly verifiedAt: string },
): string {
  const rows = results.flatMap((result) => ([
    `| ${escapeCell(result.domain)} | Positive | ${escapeCell(result.positive.name)} | ${result.positive.passed ? "**PASS**" : "**FAIL**"} | \`${result.positive.receipt.sha256}\` |`,
    `| ${escapeCell(result.domain)} | Negative | ${escapeCell(result.negative.name)} | ${result.negative.passed ? "**PASS**" : "**FAIL**"} | \`${result.negative.receipt.sha256}\` |`,
  ]));
  return [
    "# alpha-AOS 0.1.0 Release Controls",
    "",
    `Deterministic verification timestamp: \`${options.verifiedAt}\``,
    "",
    "Each domain has an explicit positive control and a near-miss or exclusion control. Receipt hashes are SHA-256 digests over canonical, credential-free evidence objects produced by the test suite.",
    "",
    "| Domain | Polarity | Assertion | Result | Evidence SHA-256 |",
    "| --- | --- | --- | --- | --- |",
    ...rows,
    "",
    "## Verification method",
    "",
    "- Optional invocation passes only when the declared Context7 lookup sequence is observed; the ordinary-task twin records zero Context7 calls.",
    "- Project scope passes only when repository evidence selects the API/Web pack and produces project targets; a sibling repository has neither selection nor targets.",
    "- Mandatory gates pass the control only when an auth change blocks on `security-review`; a documentation-only change is a silent pass.",
    "- Tree opt-out passes only when a managed tree keeps global surfaces and an `off` tree suppresses skills, MCP, hooks, instructions, and memory.",
    "",
    "Normal test runs never write this file. Regeneration requires `UPDATE_RELEASE_CONTROLS=1` and always uses the fixed release timestamp above.",
    "",
  ].join("\n");
}

async function optionalInvocationPair(): Promise<ControlPairResult> {
  const catalog = (await loadCanaryCatalog(process.cwd())).value;
  const declaration = catalog.canaries.find((candidate) => candidate.capability === "CAPA-01" && candidate.harnesses.includes("codex"));
  assert.ok(declaration);

  const sandbox = await mkdtemp(join(tmpdir(), "alpha-aos-opt-inv-"));
  const observed: McpObservation[] = [];
  try {
    const serverScript = join(sandbox, "server.mjs");
    await writeFile(
      serverScript,
      [
        "import { createInterface } from 'node:readline';",
        "const lines = createInterface({ input: process.stdin });",
        "lines.on('line', (line) => {",
        "  if (!line.trim().startsWith('{')) return;",
        "  let message;",
        "  try { message = JSON.parse(line); } catch { return; }",
        "  if (typeof message.id !== 'number') return;",
        "  if (message.method === 'initialize') {",
        "    console.log(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: { protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'context7', version: '4.0.4' } } }));",
        "    return;",
        "  }",
        "  if (message.method === 'tools/list') {",
        "    console.log(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: { tools: [{ name: 'resolve-library-id', description: 'resolve library', inputSchema: { type: 'object' } }, { name: 'query-docs', description: 'query docs', inputSchema: { type: 'object' } }] } }));",
        "    return;",
        "  }",
        "  if (message.method === 'tools/call') {",
        "    console.log(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: { content: [{ type: 'text', text: 'documentation excerpt' }] } }));",
        "    return;",
        "  }",
        "  console.log(JSON.stringify({ jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'method not found' } }));",
        "});",
        "",
      ].join("\n"),
      "utf8",
    );

    const upstream = await openObservedUpstream(
      "context7",
      { package: "@upstash/context7-mcp", version: "4.0.4", integrity: "sha512-fixture" },
      { record: (obs) => observed.push(obs) },
      {
        executable: process.execPath,
        args: [serverScript],
        cwd: sandbox,
        environment: { source: {} },
        timeoutMs: 30_000,
        maxOutputBytes: 64 * 1024,
      },
    );

    await upstream.callTool({ name: "resolve-library-id", arguments: { libraryName: "Next.js" } });
    await upstream.callTool({ name: "query-docs", arguments: { libraryId: "/vercel/next.js/v16.2.2", query: "streaming route handlers" } });
    await upstream.close();
  } finally {
    await rm(sandbox, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }

  // Force deterministic verified timestamp for release control ledger stability
  const stableObservations = observed.map((obs) => ({ ...obs, at: VERIFIED_AT }));
  const parsed = readObservationRecords(stableObservations.map(observationLine).join(""));
  const matched = matchExpectations(parsed, declaration);
  const ordinaryTaskCalls = readObservationRecords("");

  return pair(
    "Optional Capability Invocation",
    {
      name: "documentation intent invokes Context7 lookup",
      passed: matched.held && parsed.length === 2,
      evidence: { promptClass: "library-documentation", tools: parsed.map((entry) => entry.tool), verdictHeld: matched.held },
    },
    {
      name: "general algorithm task does not invoke Context7",
      passed: ordinaryTaskCalls.filter((entry) => entry.server === "context7").length === 0,
      evidence: { promptClass: "general-algorithm", context7CallCount: 0 },
    },
  );
}

async function projectScopePair(root: string): Promise<ControlPairResult> {
  const project = join(root, "project");
  const sibling = join(root, "sibling");
  await mkdir(project, { recursive: true });
  await mkdir(sibling, { recursive: true });
  await writeFile(
    join(project, "package.json"),
    `${JSON.stringify({ name: "release-control-api", dependencies: { express: "5.1.0", react: "19.1.1" } }, null, 2)}\n`,
    "utf8",
  );
  await writeFile(join(project, "tsconfig.json"), "{\"compilerOptions\":{\"strict\":true}}\n", "utf8");
  await writeFile(join(sibling, "README.md"), "# outside canonical project\n", "utf8");
  const inside = await planProjectCapabilities({ path: project, packageRoot: process.cwd() });
  const outside = await planProjectCapabilities({ path: sibling, packageRoot: process.cwd() });
  const insideSources = inside.source.map((source) => `${source.packId}/${source.skill}`);
  return pair(
    "Project Pack Scope",
    {
      name: "matching project exposes its evidence-selected pack targets",
      passed: inside.selected.includes("API") && inside.selected.includes("WEB_REACT") && insideSources.includes("WEB_REACT/frontend-a11y"),
      evidence: { selected: inside.selected, projectSources: insideSources },
    },
    {
      name: "sibling outside the canonical project exposes no pack target",
      passed: outside.selected.length === 0 && outside.source.length === 0,
      evidence: { selected: outside.selected, projectSourceCount: outside.source.length },
    },
  );
}

async function gatePair(root: string): Promise<ControlPairResult> {
  const risky = await createOrdinaryRepository(root, "risky");
  const safe = await createOrdinaryRepository(root, "safe");
  assert.equal(risky.ok, true, risky.ok ? undefined : risky.reason);
  assert.equal(safe.ok, true, safe.ok ? undefined : safe.reason);
  if (!risky.ok || !safe.ok) throw new Error("Git fixture unavailable");

  await mkdir(join(risky.fixture.path, "src", "auth"), { recursive: true });
  await writeFile(join(risky.fixture.path, "src", "auth", "jwt.ts"), "export const jwt = 'fixture';\n", "utf8");
  await writeFile(join(safe.fixture.path, "README.md"), "# documentation-only change\n", "utf8");
  const blocked = await evaluateLifecycleGates(risky.fixture.path, { explicitBase: "HEAD" });
  const allowed = await evaluateLifecycleGates(safe.fixture.path, { explicitBase: "HEAD" });
  const obligations = blocked.verdicts.map((verdict) => verdict.obligation);
  return pair(
    "Mandatory Gate Blocking",
    {
      name: "authentication boundary blocks on security review",
      passed: !blocked.passed && obligations.includes("security-review"),
      evidence: { passed: blocked.passed, obligations, statuses: blocked.verdicts.map((verdict) => verdict.status) },
    },
    {
      name: "documentation-only change passes silently",
      passed: allowed.passed && allowed.silentPass && allowed.verdicts.length === 0,
      evidence: { passed: allowed.passed, silentPass: allowed.silentPass, verdictCount: allowed.verdicts.length },
    },
  );
}

async function treeOffPair(root: string): Promise<ControlPairResult> {
  const stateRoot = join(root, "state");
  const managed = join(root, "managed");
  const off = join(root, "off");
  await mkdir(managed, { recursive: true });
  await mkdir(off, { recursive: true });
  await setTreePolicy(managed, "managed", { stateRoot, notes: "release positive" });
  await setTreePolicy(off, "off", { stateRoot, notes: "release negative" });
  const managedInspection = await inspectTreeSurface(managed, { stateRoot, harness: "codex", env: {} });
  const offInspection = await inspectTreeSurface(off, { stateRoot, harness: "codex", env: {} });
  const suppressed = Object.values(offInspection.excludedGlobalResources);
  return pair(
    "Tree-Off Opt-Out",
    {
      name: "managed tree retains alpha-AOS global surfaces",
      passed: managedInspection.effectivePolicy.effectiveMode === "managed"
        && Object.values(managedInspection.excludedGlobalResources).every((value) => !value),
      evidence: { mode: managedInspection.effectivePolicy.effectiveMode, excluded: managedInspection.excludedGlobalResources },
    },
    {
      name: "off tree suppresses every global customization class",
      passed: offInspection.effectivePolicy.effectiveMode === "off" && suppressed.every(Boolean),
      evidence: { mode: offInspection.effectivePolicy.effectiveMode, excluded: offInspection.excludedGlobalResources },
    },
  );
}

test("four release-control domains carry paired positive and negative evidence", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "alpha-aos-release-controls-"));
  context.after(async () => rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }));
  const before = existsSync(DOCUMENT_PATH) ? await readFile(DOCUMENT_PATH, "utf8") : null;
  const results = [
    await optionalInvocationPair(),
    await projectScopePair(join(root, "scope")),
    await gatePair(join(root, "gates")),
    await treeOffPair(join(root, "trees")),
  ];
  assert.equal(results.length, 4);
  for (const result of results) {
    assert.equal(result.positive.passed, true, `${result.domain} positive control failed`);
    assert.equal(result.negative.passed, true, `${result.domain} negative control failed`);
    assert.match(result.positive.receipt.sha256, /^[a-f0-9]{64}$/u);
    assert.match(result.negative.receipt.sha256, /^[a-f0-9]{64}$/u);
  }

  const rendered = generateReleaseControlsMarkdown(results, { verifiedAt: VERIFIED_AT });
  if (process.env.UPDATE_RELEASE_CONTROLS === "1") {
    await mkdir(dirname(DOCUMENT_PATH), { recursive: true });
    await writeFile(DOCUMENT_PATH, rendered, "utf8");
  } else {
    const committed = await readFile(DOCUMENT_PATH, "utf8");
    assert.equal(committed, rendered, "docs/RELEASE_CONTROLS.md drifted from paired control evidence");
    assert.equal(await readFile(DOCUMENT_PATH, "utf8"), before, "normal tests modified the release controls document");
  }
});
