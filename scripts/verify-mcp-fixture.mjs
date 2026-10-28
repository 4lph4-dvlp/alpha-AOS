#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export function isTransientMcpFailure(stderr) {
  return /MCP protocol failed[\s\S]*(?:Request timed out|ETIMEDOUT|ECONNRESET|EAI_AGAIN)/u.test(stderr);
}

export function verifyMcpFixture(server, run = (args) => spawnSync(process.execPath, args, {
  encoding: "utf8", timeout: 600_000, maxBuffer: 8 * 1024 * 1024, windowsHide: true,
})) {
  if (!["context7", "exa", "firecrawl"].includes(server)) throw new Error("Unknown MCP fixture server");
  const cli = fileURLToPath(new URL("../dist/src/cli.js", import.meta.url));
  for (let attempt = 1; attempt <= 2; attempt++) {
    const result = run([cli, "fixture", "mcp", server, "pi", "--apply"]);
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    if (result.status === 0) return 0;
    if (attempt === 2 || result.error || !isTransientMcpFailure(result.stderr ?? "")) return result.status || 1;
    process.stderr.write(`Transient ${server} protocol failure; retrying once with a fresh isolated fixture.\n`);
  }
  return 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = verifyMcpFixture(process.argv[2]);
}
