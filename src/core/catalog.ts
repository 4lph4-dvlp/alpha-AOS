import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse } from "yaml";
import type { StackCatalog, StackLock } from "../types.js";

function requireObject(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
}

export async function loadCatalog(root: string): Promise<StackCatalog> {
  const value: unknown = parse(await readFile(join(root, "catalog", "stack.yaml"), "utf8"));
  requireObject(value, "catalog");
  if (value.schemaVersion !== 1 || value.name !== "alpha-aos") {
    throw new Error("Unsupported stack catalog schema");
  }
  requireObject(value.harnesses, "catalog.harnesses");
  requireObject(value.components, "catalog.components");
  requireObject(value.policy, "catalog.policy");
  return value as unknown as StackCatalog;
}

export async function loadLock(root: string, channel = "stable"): Promise<StackLock> {
  const filename = channel === "candidate" ? "candidate.lock.json" : "stack.lock.json";
  const value: unknown = JSON.parse(await readFile(join(root, "catalog", filename), "utf8"));
  requireObject(value, "lock");
  if (value.schemaVersion !== 1) throw new Error("Unsupported stack lock schema");
  requireObject(value.components, "lock.components");
  return value as unknown as StackLock;
}
