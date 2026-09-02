import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { detectProject } from "../src/core/project.js";

test("project detector selects packs only from positive repository evidence", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "alpha-aos-project-"));
  context.after(async () => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "src"));
  await mkdir(join(root, "prisma", "migrations"), { recursive: true });
  await writeFile(join(root, "Dockerfile"), "FROM node:24-alpine\n", "utf8");
  await writeFile(join(root, "package.json"), JSON.stringify({ dependencies: { next: "15.0.0", pg: "8.0.0" } }), "utf8");

  const result = await detectProject(root);
  assert.deepEqual(result.packs, ["CONTAINER", "DB_MIGRATION", "DB_POSTGRES", "WEB_BASE", "WEB_REACT"]);
  assert.equal(result.packs.includes("AGENT_RUNTIME"), false);
  assert.equal(result.packs.includes("SECURITY_REVIEW"), false);
});

test("AGENTS.md alone does not activate agent runtime", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "alpha-aos-project-"));
  context.after(async () => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, "AGENTS.md"), "# Instructions\n", "utf8");
  const result = await detectProject(root);
  assert.equal(result.packs.includes("AGENT_RUNTIME"), false);
});
