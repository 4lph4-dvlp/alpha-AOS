import { isAbsolute } from "node:path";
import { createHash } from "node:crypto";

export const computerActions = ["launch_app", "click", "right_click", "drag", "type_text", "press_key"] as const;
export type ComputerActionKind = typeof computerActions[number];
export interface ComputerTarget { executable: string; executableHash: string; pid: number; processGeneration: string; windowId: string; windowGeneration: string }
export interface ComputerRuntimeIdentity { executableHash: string; schemaHash: string }
export interface ComputerAuthority {
  version: 1; runId: string; contractDigest: string; expiresAt: number; idleMs: number;
  target: ComputerTarget; runtime: ComputerRuntimeIdentity;
  region: { x: number; y: number; width: number; height: number };
  permissions: { actions: ComputerActionKind[]; capture: boolean; publicData: boolean; foreground: boolean };
  budget: { actions: number; captures: number; bytes: number; durationMs: number; gestureMs: number };
}
export interface ComputerAction { kind: ComputerActionKind; x?: number; y?: number; toX?: number; toY?: number; text?: string; key?: string; classification?: "public" | "secret" }
export interface ComputerPolicyState {
  runId: string; contractDigest: string; target: ComputerTarget; runtime: ComputerRuntimeIdentity;
  now: number; startedAt: number; lastActivityAt: number; actions: number; captures: number; bytes: number; stopped: boolean;
}
export function canonicalComputerJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalComputerJson).join(",")}]`;
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalComputerJson((value as Record<string, unknown>)[key])}`).join(",")}}`;
  }
  throw new Error("Computer authority requires plain finite JSON");
}
export function computerHash(value: unknown): string { return createHash("sha256").update(canonicalComputerJson(value)).digest("hex"); }
export function computerObject(value: unknown, keys: readonly string[], label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new Error(`Computer authority ${label} must be a plain object`);
  const object = value as Record<string, unknown>;
  for (const key of Object.keys(object)) if (!keys.includes(key) || ["__proto__", "constructor", "prototype"].includes(key)) throw new Error(`Computer authority ${label} unknown key`);
  for (const key of keys) if (!Object.hasOwn(object, key)) throw new Error(`Computer authority ${label} missing ${key}`);
  return object;
}
function finite(value: unknown, min: number, max: number, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) throw new Error(`Computer authority ${label} must be finite within bounds`);
  return value;
}
function text(value: unknown, label: string, pattern = /^[\w.:-]{1,128}$/): string {
  if (typeof value !== "string" || !pattern.test(value)) throw new Error(`Computer authority invalid ${label}`);
  return value;
}
export function validateComputerAuthority(value: unknown): ComputerAuthority {
  const a = computerObject(value, ["version", "runId", "contractDigest", "expiresAt", "idleMs", "target", "runtime", "region", "permissions", "budget"], "root");
  if (a.version !== 1) throw new Error("Computer authority version must be 1");
  text(a.runId, "runId", /^[a-zA-Z0-9][\w-]{0,95}$/); text(a.contractDigest, "digest", /^[a-f0-9]{64}$/);
  finite(a.expiresAt, 1, Number.MAX_SAFE_INTEGER, "expiresAt"); finite(a.idleMs, 100, 300_000, "idleMs");
  const target = computerObject(a.target, ["executable", "executableHash", "pid", "processGeneration", "windowId", "windowGeneration"], "target");
  if (typeof target.executable !== "string" || !isAbsolute(target.executable) || target.executable.length > 4096 || /[\x00-\x1f]/.test(target.executable)) throw new Error("Computer authority requires absolute executable");
  text(target.executableHash, "executableHash", /^[a-f0-9]{64}$/); finite(target.pid, 1, 2 ** 32 - 1, "pid");
  if (!Number.isInteger(target.pid)) throw new Error("Computer authority pid must be integer");
  for (const key of ["processGeneration", "windowId", "windowGeneration"]) text(target[key], key);
  const runtime = computerObject(a.runtime, ["executableHash", "schemaHash"], "runtime");
  for (const key of Object.keys(runtime)) text(runtime[key], key, /^[a-f0-9]{64}$/);
  const region = computerObject(a.region, ["x", "y", "width", "height"], "region");
  for (const key of ["x", "y"]) finite(region[key], 0, 32768, key);
  for (const key of ["width", "height"]) finite(region[key], 1, 32768, key);
  const permissions = computerObject(a.permissions, ["actions", "capture", "publicData", "foreground"], "permissions");
  if (!Array.isArray(permissions.actions) || permissions.actions.length > computerActions.length || new Set(permissions.actions).size !== permissions.actions.length || permissions.actions.some((v) => !computerActions.includes(v))) throw new Error("Computer authority invalid actions");
  for (const key of ["capture", "publicData", "foreground"]) if (typeof permissions[key] !== "boolean") throw new Error(`Computer authority invalid ${key}`);
  const budget = computerObject(a.budget, ["actions", "captures", "bytes", "durationMs", "gestureMs"], "budget");
  const maxima: Record<string, number> = { actions: 1000, captures: 2002, bytes: 256 * 1024 * 1024, durationMs: 300_000, gestureMs: 30_000 };
  for (const key of Object.keys(budget)) { finite(budget[key], 1, maxima[key]!, key); if (!Number.isInteger(budget[key])) throw new Error("Computer authority budgets must be integers"); }
  return structuredClone(value) as ComputerAuthority;
}
export function decideComputerVerification(input: { mode: "ordinary" | "autopilot"; deterministic: boolean; reversible: boolean; covered: boolean }): { mode: "offer" | "automatic" | "manual"; choices: string[]; reason: string } {
  if (!input.deterministic || !input.reversible || !input.covered) return { mode: "manual", choices: ["manual"], reason: "Human judgment or new authority required" };
  if (input.mode === "ordinary") return { mode: "offer", choices: ["automatic", "manual"], reason: "Choose automatic or manual GUI verification" };
  return { mode: "automatic", choices: ["automatic"], reason: "Approved reversible deterministic check" };
}
export function authorizeComputerAction(a: ComputerAuthority, s: ComputerPolicyState, action: ComputerAction): void {
  validateComputerAuthority(a);
  if (s.stopped) throw new Error("Computer session stopped");
  if (s.runId !== a.runId || s.contractDigest !== a.contractDigest) throw new Error("Computer authority run/digest mismatch");
  if (computerHash(s.target) !== computerHash(a.target) || computerHash(s.runtime) !== computerHash(a.runtime)) throw new Error("Computer target/runtime identity changed");
  if (![s.now, s.startedAt, s.lastActivityAt, s.actions, s.captures, s.bytes].every(Number.isFinite) || s.now < s.startedAt || s.now < s.lastActivityAt) throw new Error("Computer invalid clock/counters");
  if (s.now >= a.expiresAt || s.now - s.startedAt >= a.budget.durationMs || s.now - s.lastActivityAt >= a.idleMs) throw new Error("Computer authority expired");
  if (s.actions >= a.budget.actions || s.captures + 2 > a.budget.captures || s.bytes >= a.budget.bytes) throw new Error("Computer budget exhausted");
  if (!a.permissions.capture || !a.permissions.publicData || !a.permissions.actions.includes(action.kind)) throw new Error("Computer permission denied");
  const allowed: Record<ComputerActionKind, string[]> = { click: ["kind", "x", "y"], right_click: ["kind", "x", "y"], drag: ["kind", "x", "y", "toX", "toY"], type_text: ["kind", "text", "classification"], press_key: ["kind", "key"], launch_app: ["kind"] };
  const keys = allowed[action.kind]; if (!keys) throw new Error("Computer action refused");
  computerObject(action, keys, "action");
  if (["click", "right_click", "drag"].includes(action.kind)) {
    for (const [xKey, yKey] of action.kind === "drag" ? [["x", "y"], ["toX", "toY"]] : [["x", "y"]]) {
      const x = action[xKey as "x"]; const y = action[yKey as "y"];
      finite(x, a.region.x, a.region.x + a.region.width - 1, "x"); finite(y, a.region.y, a.region.y + a.region.height - 1, "y");
      if (!Number.isInteger(x) || !Number.isInteger(y)) throw new Error("Computer screenshot pixels must be integers");
    }
  }
  if (action.kind === "type_text" && (action.classification !== "public" || typeof action.text !== "string" || action.text.length < 1 || action.text.length > 1024 || /[\x00-\x1f]/.test(action.text))) throw new Error("Computer secret or invalid text denied");
  if (action.kind === "press_key" && (typeof action.key !== "string" || !/^(Tab|Enter|Escape|Backspace|Delete|Space|Arrow(Up|Down|Left|Right)|[a-zA-Z0-9])$/.test(action.key))) throw new Error("Computer key denied");
}
