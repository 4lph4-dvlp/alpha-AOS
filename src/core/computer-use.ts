import { open, unlink, access } from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import { join } from "node:path";
import { ComputerAudit, safeComputerPath } from "./computer-use-audit.js";
import type { ComputerAnchor } from "./computer-use-audit.js";
import { authorizeComputerAction, computerHash, validateComputerAuthority } from "./computer-use-policy.js";
import type { ComputerAction, ComputerAuthority, ComputerRuntimeIdentity, ComputerTarget, ComputerPolicyState } from "./computer-use-policy.js";

export interface ComputerObservation { target: ComputerTarget; captureId: string; png: Buffer; width: number; height: number; state: string; safe: boolean; foreground: boolean }
export interface ComputerUseTransport {
  readonly identity: ComputerRuntimeIdentity;
  observe(signal: AbortSignal): Promise<ComputerObservation>;
  dispatch(action: ComputerAction, observation: ComputerObservation, signal: AbortSignal): Promise<void>;
  close(): Promise<void>;
}
export interface ComputerPostcondition { equals?: string; stateHash?: string; changed?: boolean }
export interface ComputerActionResult { outcome: "verified" | "not-verified" | "unknown" | "interrupted"; intent: number; anchor: ComputerAnchor; durations: { captureMs: number; dispatchMs: number; totalMs: number } }
export class ComputerSession {
  readonly authority: ComputerAuthority;
  readonly audit: ComputerAudit;
  readonly #transport: ComputerUseTransport;
  readonly #root: string;
  readonly #lease: FileHandle;
  readonly #abort = new AbortController();
  readonly #startedAt = Date.now();
  #lastActivityAt = Date.now();
  #actions = 0; #captures = 0; #bytes = 0; #busy = false; #closed = false;
  #used = new Set<string>();
  #monitor: NodeJS.Timeout;
  private constructor(authority: ComputerAuthority, transport: ComputerUseTransport, audit: ComputerAudit, root: string, lease: FileHandle) {
    this.authority = authority; this.#transport = transport; this.audit = audit; this.#root = root; this.#lease = lease;
    this.#monitor = setInterval(() => {
      void access(join(root, authority.runId, "STOP")).then(() => this.#cancel(), () => undefined);
      if (Date.now() >= authority.expiresAt || Date.now() - this.#startedAt >= authority.budget.durationMs || Date.now() - this.#lastActivityAt >= authority.idleMs) this.#cancel();
    }, 50);
    this.#monitor.unref();
  }
  static async open(value: unknown, transport: ComputerUseTransport, root: string): Promise<ComputerSession> {
    const authority = validateComputerAuthority(value);
    function freeze(value: object): void { for (const child of Object.values(value)) if (child && typeof child === "object") freeze(child); Object.freeze(value); }
    freeze(authority);
    if (computerHash(transport.identity) !== computerHash(authority.runtime)) throw new Error("Computer runtime authority mismatch");
    const audit = await ComputerAudit.open(root, authority.runId);
    try {
      const lease = await open(join(await safeComputerPath(root), "desktop.lock"), "wx", 0o600);
      return new ComputerSession(authority, transport, audit, root, lease);
    } catch (error) { await audit.close(); throw error; }
  }
  #cancel(): void { if (!this.#abort.signal.aborted) { this.#abort.abort(); void this.#transport.close().catch(() => undefined); } }
  #state(target: ComputerTarget): ComputerPolicyState {
    return { runId: this.authority.runId, contractDigest: this.authority.contractDigest, target, runtime: this.#transport.identity, now: Date.now(), startedAt: this.#startedAt, lastActivityAt: this.#lastActivityAt, actions: this.#actions, captures: this.#captures, bytes: this.#bytes, stopped: this.#closed || this.#abort.signal.aborted };
  }
  async #bounded<T>(operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const signal = AbortSignal.any([this.#abort.signal, AbortSignal.timeout(this.authority.budget.gestureMs)]);
    signal.throwIfAborted();
    return new Promise<T>((resolve, reject) => {
      const abort = () => { this.#cancel(); reject(new Error("Computer gesture interrupted or timed out")); };
      signal.addEventListener("abort", abort, { once: true });
      void operation(signal).then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
    });
  }
  async #observe(): Promise<ComputerObservation> {
    if (!this.authority.permissions.capture || !this.authority.permissions.publicData) throw new Error("Computer safe capture permission denied");
    const observation = await this.#bounded((signal) => this.#transport.observe(signal));
    if (!observation.safe || !Buffer.isBuffer(observation.png) || typeof observation.captureId !== "string" || !observation.captureId || observation.captureId.length > 256 || typeof observation.state !== "string" || observation.state.length > 1_000_000) throw new Error("Computer unsafe observation refused before persistence");
    if (computerHash(observation.target) !== computerHash(this.authority.target)) throw new Error("Computer observed target identity changed");
    if (observation.foreground && !this.authority.permissions.foreground) throw new Error("Computer foreground permission denied");
    if (this.authority.region.x + this.authority.region.width > observation.width || this.authority.region.y + this.authority.region.height > observation.height) throw new Error("Computer capture region mismatch");
    if (this.#captures >= this.authority.budget.captures || this.#bytes + observation.png.length > this.authority.budget.bytes) throw new Error("Computer capture budget exhausted");
    this.#captures++; this.#bytes += observation.png.length;
    return observation;
  }
  async action(action: ComputerAction, postcondition: ComputerPostcondition): Promise<ComputerActionResult> {
    if (this.#busy) throw new Error("Computer concurrent action refused; no action queue");
    if (!postcondition || Object.keys(postcondition).some((k) => !["equals", "stateHash", "changed"].includes(k)) || Object.keys(postcondition).length !== 1 || !(typeof postcondition.equals === "string" && postcondition.equals.length <= 1024 || typeof postcondition.stateHash === "string" && /^[a-f0-9]{64}$/.test(postcondition.stateHash) || postcondition.changed === true)) throw new Error("Computer explicit deterministic postcondition required");
    this.#busy = true; const started = performance.now(); let intent = 0; let dispatched = false; let completed = false; let captureMs = 0; let dispatchMs = 0;
    try {
      await this.#checkStop(); authorizeComputerAction(this.authority, this.#state(this.authority.target), action);
      const before = await this.#observe(); captureMs = performance.now() - started;
      const observedAt = Date.now();
      if (this.#used.has(before.captureId)) throw new Error("Computer stale/consumed capture");
      const capture = await this.audit.capture(before.png, before.width, before.height);
      const record = await this.audit.append("intent", { policyHash: computerHash(this.authority), contractDigest: this.authority.contractDigest, runtime: this.#transport.identity, target: this.authority.target, action: action.kind, actionDigest: computerHash(action), before: capture, stateHash: computerHash(before.state) });
      intent = record.sequence;
      await this.#checkStop(); authorizeComputerAction(this.authority, this.#state(before.target), action);
      if (Date.now() - observedAt > Math.min(1000, this.authority.budget.gestureMs)) throw new Error("Computer observation expired before dispatch");
      this.#used.add(before.captureId); this.#actions++; dispatched = true;
      const dispatchStart = performance.now(); await this.#bounded((signal) => this.#transport.dispatch(action, before, signal)); dispatchMs = performance.now() - dispatchStart;
      await this.#checkStop();
      const after = await this.#observe();
      if (after.captureId === before.captureId) throw new Error("Computer postcondition observation is stale");
      const afterCapture = await this.audit.capture(after.png, after.width, after.height);
      const verified = postcondition.equals !== undefined ? after.state === postcondition.equals : postcondition.stateHash !== undefined ? computerHash(after.state) === postcondition.stateHash : after.state !== before.state;
      const outcome = verified ? "verified" : "not-verified";
      await this.audit.append("result", { intent, outcome, after: afterCapture, stateHash: computerHash(after.state), postconditionDigest: computerHash(postcondition) });
      completed = true;
      this.#lastActivityAt = Date.now();
      return { outcome, intent, anchor: await this.audit.checkpoint(), durations: { captureMs, dispatchMs, totalMs: performance.now() - started } };
    } catch (error) {
      if (intent && !completed) await this.audit.append("result", { intent, outcome: this.#abort.signal.aborted ? "interrupted" : dispatched ? "unknown" : "refused" });
      if (dispatched) this.#cancel();
      throw error;
    } finally { this.#busy = false; }
  }
  async #checkStop(): Promise<void> {
    if (await access(join(this.#root, this.authority.runId, "STOP")).then(() => true, () => false)) this.#cancel();
    this.#abort.signal.throwIfAborted(); if (this.#closed) throw new Error("Computer session closed");
  }
  async stop(): Promise<void> { this.#cancel(); await stopComputerSession(this.#root, this.authority.runId); }
  async close(): Promise<void> {
    if (this.#busy) throw new Error("Computer action must settle before closing audit");
    if (this.#closed) return; this.#closed = true; clearInterval(this.#monitor); this.#cancel();
    await this.#transport.close(); await this.audit.close(); await this.#lease.close(); await unlink(join(this.#root, "desktop.lock"));
  }
}
export async function stopComputerSession(root: string, runId: string): Promise<void> {
  if (!/^[a-zA-Z0-9][\w-]{0,95}$/.test(runId)) throw new Error("Computer invalid stop run id");
  const path = await safeComputerPath(join(root, runId, "STOP"));
  const handle = await open(path, "wx", 0o600).catch((error: NodeJS.ErrnoException) => { if (error.code === "EEXIST") return null; throw error; });
  if (handle) { await handle.writeFile("stopped\n"); await handle.sync(); await handle.close(); }
}
