import { createHash } from "node:crypto";
import { lstat, mkdir, open, readFile, realpath, unlink } from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import { dirname, join, parse, relative, resolve, sep } from "node:path";
import { inflateSync } from "node:zlib";
import { canonicalComputerJson, computerHash } from "./computer-use-policy.js";

export interface ComputerCapture { hash: string; bytes: number; width: number; height: number }
export interface ComputerAuditEvent { sequence: number; previous: string; runId: string; at: number; kind: "intent" | "result" | "decision" | "tombstone"; data: Record<string, unknown>; hash: string }
export interface ComputerAnchor { runId: string; count: number; hash: string }
const ZERO = "0".repeat(64);
export async function safeComputerPath(path: string): Promise<string> {
  const absolute = resolve(path);
  const root = parse(absolute).root;
  let current = root;
  for (const part of absolute.slice(root.length).split(sep).filter(Boolean)) {
    current = join(current, part);
    const stat = await lstat(current).catch((error: NodeJS.ErrnoException) => { if (error.code === "ENOENT") return null; throw error; });
    if (stat?.isSymbolicLink()) throw new Error("Computer evidence symlink path refused");
  }
  return absolute;
}
function runName(runId: string): void { if (!/^[a-zA-Z0-9][\w-]{0,95}$/.test(runId)) throw new Error("Computer audit invalid run id"); }
function sha(bytes: Buffer): string { return createHash("sha256").update(bytes).digest("hex"); }
function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
}
export function validateComputerPng(png: Buffer, width: number, height: number): void {
  if (png.length > 16 * 1024 * 1024 || png.length < 45 || png.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") throw new Error("Computer capture invalid PNG");
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width * height > 16_777_216) throw new Error("Computer capture invalid geometry");
  let offset = 8; let header = false; let end = false; const compressed: Buffer[] = []; let channels = 0; let depth = 0;
  while (offset + 12 <= png.length) {
    const length = png.readUInt32BE(offset); const type = png.toString("ascii", offset + 4, offset + 8);
    if (length > png.length - offset - 12 || crc32(png.subarray(offset + 4, offset + 8 + length)) !== png.readUInt32BE(offset + 8 + length)) throw new Error("Computer capture PNG CRC invalid");
    const data = png.subarray(offset + 8, offset + 8 + length);
    if (!header && type !== "IHDR") throw new Error("Computer capture missing PNG header");
    if (type === "IHDR") {
      if (header || length !== 13 || data.readUInt32BE(0) !== width || data.readUInt32BE(4) !== height) throw new Error("Computer capture PNG geometry mismatch");
      header = true; depth = data[8]!; channels = ({ 0: 1, 2: 3, 4: 2, 6: 4 } as Record<number, number>)[data[9]!] ?? 0;
      if (![8, 16].includes(depth) || !channels || data[10] !== 0 || data[11] !== 0 || data[12] !== 0) throw new Error("Computer capture unsupported PNG encoding");
    } else if (type === "IDAT") compressed.push(data);
    else if (type === "IEND") { if (length !== 0 || offset + 12 !== png.length) throw new Error("Computer capture PNG trailing bytes"); end = true; }
    else if (!/^[a-z]/.test(type)) throw new Error("Computer capture unknown critical PNG chunk");
    offset += length + 12;
  }
  if (!end || offset !== png.length || !compressed.length) throw new Error("Computer capture truncated PNG");
  const row = width * channels * depth / 8 + 1;
  const raw = inflateSync(Buffer.concat(compressed), { maxOutputLength: row * height });
  if (raw.length !== row * height) throw new Error("Computer capture PNG undecodable geometry");
  for (let i = 0; i < height; i++) if (raw[i * row]! > 4) throw new Error("Computer capture PNG invalid filter");
}
export class ComputerAudit {
  readonly directory: string;
  readonly runId: string;
  #journal: FileHandle;
  #lock: FileHandle;
  #count = 0;
  #hash = ZERO;
  #closed = false;
  #busy = false;
  private constructor(directory: string, runId: string, journal: FileHandle, lock: FileHandle) { this.directory = directory; this.runId = runId; this.#journal = journal; this.#lock = lock; }
  static async open(root: string, runId: string): Promise<ComputerAudit> {
    runName(runId); const base = await safeComputerPath(root); await mkdir(base, { recursive: true, mode: 0o700 });
    const directory = join(base, runId); await safeComputerPath(directory); await mkdir(directory, { recursive: true, mode: 0o700 });
    const lock = await open(join(directory, "writer.lock"), "wx", 0o600);
    try { const journal = await open(join(directory, "events.jsonl"), "wx", 0o600); return new ComputerAudit(directory, runId, journal, lock); }
    catch (error) { await lock.close(); await unlink(join(directory, "writer.lock")); throw error; }
  }
  async capture(png: Buffer, width: number, height: number): Promise<ComputerCapture> {
    if (this.#closed) throw new Error("Computer audit closed");
    validateComputerPng(png, width, height);
    const hash = sha(png); const path = join(this.directory, `${hash}.png`); await safeComputerPath(path);
    const handle = await open(path, "wx", 0o600).catch(async (error: NodeJS.ErrnoException) => {
      if (error.code !== "EEXIST" || sha(await readFile(path)) !== hash) throw error;
      return null;
    });
    if (handle) { try { await handle.writeFile(png); await handle.sync(); } finally { await handle.close(); } }
    return { hash, bytes: png.length, width, height };
  }
  async append(kind: ComputerAuditEvent["kind"], data: Record<string, unknown>): Promise<ComputerAuditEvent> {
    if (this.#closed || this.#busy) throw new Error("Computer audit closed or concurrent append");
    this.#busy = true;
    try {
      await safeComputerPath(join(this.directory, "events.jsonl"));
      const body = { sequence: this.#count + 1, previous: this.#hash, runId: this.runId, at: Date.now(), kind, data };
      const event = { ...body, hash: computerHash(body) }; const line = canonicalComputerJson(event) + "\n";
      if (Buffer.byteLength(line) > 32_768 || this.#count >= 5000) throw new Error("Computer audit record budget exceeded");
      await this.#journal.writeFile(line); await this.#journal.sync(); this.#count++; this.#hash = event.hash; return event;
    } finally { this.#busy = false; }
  }
  async checkpoint(): Promise<ComputerAnchor> { await this.#journal.sync(); return { runId: this.runId, count: this.#count, hash: this.#hash }; }
  async close(): Promise<void> {
    if (this.#closed) return; this.#closed = true; await this.#journal.close(); await this.#lock.close(); await unlink(join(this.directory, "writer.lock"));
  }
}
export async function verifyComputerAudit(root: string, runId: string, anchor: ComputerAnchor): Promise<{ events: ComputerAuditEvent[]; pending: number[]; expired: string[] }> {
  runName(runId); const directory = await safeComputerPath(join(root, runId));
  if (relative(await realpath(dirname(directory)), directory).startsWith("..")) throw new Error("Computer evidence root escape");
  const journal = await safeComputerPath(join(directory, "events.jsonl"));
  const stat = await lstat(journal); if (!stat.isFile() || stat.size > 16 * 1024 * 1024) throw new Error("Computer audit file budget");
  const bytes = await readFile(journal, "utf8"); if (bytes && !bytes.endsWith("\n")) throw new Error("Computer audit truncated record");
  const events: ComputerAuditEvent[] = []; const intents = new Set<number>(); const expired = new Set<string>(); let previous = ZERO;
  for (const line of bytes.split("\n").filter(Boolean)) {
    if (Buffer.byteLength(line) > 32_768) throw new Error("Computer audit oversized record");
    const event = JSON.parse(line) as ComputerAuditEvent; const { hash, ...body } = event;
    if (event.sequence !== events.length + 1 || event.previous !== previous || event.runId !== runId || computerHash(body) !== hash || canonicalComputerJson(event) !== line) throw new Error("Computer audit integrity/hash/order failure");
    if (!["intent", "result", "decision", "tombstone"].includes(event.kind)) throw new Error("Computer audit unknown event");
    if (event.kind === "intent") intents.add(event.sequence);
    if (event.kind === "result") { if (!intents.delete(Number(event.data.intent))) throw new Error("Computer audit result without unique intent"); }
    if (event.kind === "tombstone") {
      if (typeof event.data.captureHash !== "string" || !/^[a-f0-9]{64}$/.test(event.data.captureHash) || event.data.reviewed !== true) throw new Error("Computer audit invalid tombstone");
      expired.add(event.data.captureHash);
    }
    events.push(event); previous = hash;
  }
  if (anchor.runId !== runId || anchor.count !== events.length || anchor.hash !== previous) throw new Error("Computer audit trusted anchor mismatch");
  for (const event of events) {
    for (const key of ["capture", "before", "after"]) {
      const capture = event.data[key] as ComputerCapture | undefined; if (!capture) continue;
      if (!/^[a-f0-9]{64}$/.test(capture.hash)) throw new Error("Computer capture hash invalid");
      if (expired.has(capture.hash)) continue;
      const blob = await readFile(await safeComputerPath(join(directory, `${capture.hash}.png`)));
      if (sha(blob) !== capture.hash || blob.length !== capture.bytes) throw new Error("Computer capture integrity failure");
      validateComputerPng(blob, capture.width, capture.height);
    }
  }
  return { events, pending: [...intents], expired: [...expired] };
}
