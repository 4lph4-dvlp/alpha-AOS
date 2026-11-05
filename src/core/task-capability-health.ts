import { createRedactionContext, redactString, redactValue } from "./redaction.js";
import AjvModule from "ajv";
import Ajv2020Module from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";
import type { ValidateFunction } from "ajv";
import type { TaskContract } from "./task-contract.js";
import { createCapabilityReceipt, type CapabilityInvocationRequest, type TaskCapabilityPort } from "./task-capability-receipts.js";
import { evaluateStepObligations } from "./task-capability-obligations.js";

const Ajv = ((AjvModule as unknown as { default?: unknown }).default ?? AjvModule) as typeof import("ajv").default;
const Ajv2020 = ((Ajv2020Module as unknown as { default?: unknown }).default ?? Ajv2020Module) as typeof import("ajv/dist/2020.js").default;
const addFormats = ((addFormatsModule as unknown as { default?: unknown }).default ?? addFormatsModule) as typeof import("ajv-formats").default;
const schemaOptions = { strict: false, allErrors: true, addUsedSchema: false, coerceTypes: false, useDefaults: false, removeAdditional: false };
const draft7Arguments = new Ajv(schemaOptions);
const modernArguments = new Ajv2020(schemaOptions);
addFormats(draft7Arguments);
addFormats(modernArguments);
const toolValidators = new WeakMap<Record<string, unknown>, ValidateFunction>();

export type CapabilityFailureKind = "arguments" | "unavailable" | "authentication" | "quota" | "transport" | "service" | "evidence" | "unknown";

export function capabilityDiagnostic(value: unknown): string {
  const secrets = Object.entries(process.env).filter(([name]) => /key|token|secret|password|credential|auth/iu.test(name)).map(([, value]) => value ?? "");
  const context = createRedactionContext({ secrets });
  const raw = value instanceof Error ? value.message : typeof value === "string" ? value : JSON.stringify(redactValue(value, context));
  return redactString(raw ?? "Unknown capability failure", context).replace(/[\x00-\x1f\x7f]/gu, " ").slice(0, 1600);
}

export function classifyCapabilityFailure(value: unknown): CapabilityFailureKind {
  const text = capabilityDiagnostic(value);
  if (/\b(?:quota|rate.?limit|429|insufficient credits|payment required|402)\b/iu.test(text)) return "quota";
  if (/\b(?:unauthori[sz]ed|forbidden|401|403|invalid.?api.?key|authentication|missing.*(?:key|credential))\b/iu.test(text)) return "authentication";
  if (/invalid.?params|invalid.*(?:argument|schema)|schema.*(?:invalid|reject)|-32602|\b400\b/iu.test(text)) return "arguments";
  if (/not expose|not found|not configured|no native|missing.*(?:tool|adapter)|differs from.*pin/iu.test(text)) return "unavailable";
  if (/timeout|timed out|ECONN|ENOTFOUND|socket|transport|connection/iu.test(text)) return "transport";
  if (/empty|insufficient.*sources?|irrelevant|evidence/iu.test(text)) return "evidence";
  if (/\b5\d\d\b|service unavailable|server error/iu.test(text)) return "service";
  return "unknown";
}

export class CapabilityInvocationError extends Error {
  readonly failureKind: CapabilityFailureKind;
  constructor(readonly server: string, readonly tool: string, detail: unknown) {
    const diagnostic = capabilityDiagnostic(detail);
    const kind = classifyCapabilityFailure(diagnostic);
    super(`capability-${kind}: ${server}/${tool}: ${diagnostic}`);
    this.name = "CapabilityInvocationError";
    this.failureKind = kind;
  }
}

export class TaskCapabilityPreflightError extends Error {
  constructor(readonly status: "blocked" | "needs-input" | "stopped", detail: string, readonly contractDigest?: string) {
    super(`CAPABILITY_PREFLIGHT_FAILED: ${capabilityDiagnostic(detail)}. This preflight check did not create a new task run.`);
    this.name = "TaskCapabilityPreflightError";
  }
}

export function failedCapabilityInvocation(request: CapabilityInvocationRequest, error: unknown) {
  return createCapabilityReceipt({ runId: request.runId, step: request.step, capabilityId: request.obligation.capabilityId,
    obligationId: request.obligation.id, question: request.obligation.question, selected: true, attempted: true, invoked: false,
    outcome: "failed", toolName: "unconfirmed", harness: request.harness ?? "unknown", harnessVersion: request.harnessVersion ?? null,
    harnessExecutable: request.harnessExecutable ?? null, sessionId: request.sessionId ?? null, source: request.obligation.source,
    sourceVersion: request.obligation.version, skillActivationReceiptId: null, mcpObservationId: null, observationId: null,
    skillActivatedAt: null, mcpObservedAt: null, rawResultSha256: "", resultDigest: "", isReused: false, originalReceiptId: null,
    isError: true, errorMessage: capabilityDiagnostic(error) });
}

export function requireToolArguments(server: string, tool: { name: string; inputSchema: Record<string, unknown> }, args: Record<string, unknown>): void {
  try {
    const validator = /^https?:\/\/json-schema\.org\/draft-07\/schema#?$/u.test(String(tool.inputSchema.$schema ?? "")) ? draft7Arguments : modernArguments;
    let validate = toolValidators.get(tool.inputSchema);
    if (!validate) { validate = validator.compile(tool.inputSchema); toolValidators.set(tool.inputSchema, validate); }
    if (!validate(args)) throw new Error(`Invalid arguments for discovered input schema: ${(validate.errors ?? []).map((issue) => `${issue.keyword} at ${issue.instancePath || "/"}`).join(", ")}`);
  } catch (error) { throw new CapabilityInvocationError(server, tool.name, error); }
}

export function toolResultText(result: unknown): string {
  if (!result || typeof result !== "object") return "";
  const value = result as { content?: Array<{ type?: string; text?: string }>; structuredContent?: unknown };
  return (value.content ?? []).filter((part) => part.type === "text").map((part) => part.text ?? "").join("\n") || (value.structuredContent ? JSON.stringify(value.structuredContent) : "");
}

export function requireUsefulToolResult(server: string, tool: string, result: unknown): string {
  const value = result as { isError?: boolean; structuredContent?: { success?: boolean; error?: unknown } };
  const text = toolResultText(result);
  let data: { success?: boolean; error?: unknown } | undefined = value?.structuredContent;
  if (!data) { try { data = JSON.parse(text) as typeof data; } catch { /* Text output is a valid MCP result. */ } }
  if (value?.isError || data?.success === false || data?.error) throw new CapabilityInvocationError(server, tool, data?.error ?? text ?? "Tool execution failed");
  if (text.trim().length < 20 || /^(?:null|\{\}|\[\]|no (?:search )?results?\b|not found\.?)/iu.test(text.trim())) throw new CapabilityInvocationError(server, tool, "Empty or insufficient task evidence returned");
  return text;
}

export function requireRelevantToolResult(server: string, tool: string, text: string, question: string): void {
  const ignored = new Set(["that", "this", "with", "from", "have", "will", "what", "when", "which", "using", "must", "should", "documentation", "research", "question", "search", "lookup", "required", "implement", "project", "official", "recent", "current", "sources", "please", "consult"]);
  const tokens = [...new Intl.Segmenter(undefined, { granularity: "word" }).segment(question.toLowerCase())]
    .filter((part) => part.isWordLike && part.segment.length >= 3 && !ignored.has(part.segment)).map((part) => part.segment);
  if (tokens.length > 1 && !tokens.some((token) => text.toLowerCase().includes(token))) throw new CapabilityInvocationError(server, tool, "Returned evidence is irrelevant to the approved capability question");
}

export interface TaskCapabilityReadiness {
  capabilityId: string;
  step: string;
  ready: boolean;
  failureKind: CapabilityFailureKind | null;
  detail: string;
}

export async function inspectTaskCapabilities(contract: TaskContract, port: TaskCapabilityPort | undefined, runId: string): Promise<TaskCapabilityReadiness[]> {
  if (contract.category !== "development") return [];
  const results: TaskCapabilityReadiness[] = [];
  const seen = new Set<string>();
  for (const step of ["discuss", "plan", "execute", "review", "verify"] as const) {
    const decision = evaluateStepObligations({ contract, step, projectRoot: contract.scope.projectRoot });
    if (decision.status === "needs-input") {
      results.push({ capabilityId: "selection", step, ready: false, failureKind: "unknown", detail: decision.needsInputReason ?? "Capability selection needs input" });
    }
    for (const obligation of decision.obligations.filter((item) => item.required)) {
      const key = `${obligation.capabilityId}:${obligation.question}`;
      if (seen.has(key)) continue;
      seen.add(key);
      try {
        if (!port?.preflight) throw new Error("No native capability preflight adapter is configured");
        await port.preflight({ projectRoot: contract.scope.projectRoot, runId, step, obligation, harness: contract.agentPolicy.controller });
        results.push({ capabilityId: obligation.capabilityId, step, ready: true, failureKind: null, detail: "Actual native read-only invocation and useful output verified; not a reusable step receipt" });
      } catch (error) {
        results.push({ capabilityId: obligation.capabilityId, step, ready: false, failureKind: classifyCapabilityFailure(error), detail: capabilityDiagnostic(error) });
      }
    }
  }
  return results;
}
