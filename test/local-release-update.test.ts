import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { gzipSync } from "node:zlib";
import {
  applyLocalReleasePlan,
  createLocalReleasePlan,
  decodeReviewedReleasePlan,
  encodeReviewedReleasePlan,
  resolveCuaStableRelease,
  resolveNpmStableRelease,
  revalidateLocalReleasePlan,
  synthesizeReleaseStackLock,
} from "../src/core/update.js";
import { ComponentPlanError, reviewedDigest } from "../src/core/component-session.js";
import { loadLock } from "../src/core/catalog.js";
import { packageRoot } from "../src/core/paths.js";
import { readToolRecordStore } from "../src/core/tool-records.js";
import {
  formatLocalReleasePreview,
  formatLocalReleaseApplyResult,
} from "../src/format.js";
import type {
  HarnessId,
  ManagedToolId,
  ReviewedReleasePlanPayload,
  ReviewedToolBinding,
} from "../src/types.js";

function mockFetch(responses: Record<string, unknown>): typeof fetch {
  return async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    for (const [key, body] of Object.entries(responses)) {
      if (url.includes(key)) {
        if (body instanceof Error) throw body;
        return new Response(JSON.stringify(body), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
    }
    return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
  };
}

async function createTempFixture(context: test.TestContext) {
  const root = await mkdtemp(join(tmpdir(), "alpha-aos-release-test-"));
  context.after(async () => rm(root, { recursive: true, force: true }));
  const packageRoot = join(root, "pkg");
  const stateRoot = join(root, "state");
  const home = join(root, "home");
  await mkdir(packageRoot, { recursive: true });
  await mkdir(stateRoot, { recursive: true });
  await mkdir(home, { recursive: true });
  return { root, packageRoot, stateRoot, home };
}

const DEFAULT_NPM_RESPONSES = {
  "%40opengsd%2Fgsd-core/latest": { version: "1.19.0", dist: { integrity: "sha512-gsd119==" } },
  "ecc-universal/latest": { version: "2.3.0", dist: { integrity: "sha512-ecc230==" } },
  "%40upstash%2Fcontext7-mcp/latest": { version: "1.1.0", dist: { integrity: "sha512-ctx110==" } },
  "exa-mcp-server/latest": { version: "1.2.0", dist: { integrity: "sha512-exa120==" } },
  "firecrawl-mcp/latest": { version: "1.3.0", dist: { integrity: "sha512-fc130==" } },
  "pi-mcp-adapter/latest": { version: "1.0.1", dist: { integrity: "sha512-pi101==" } },
  "repos/trycua/cua/releases": [
    {
      tag_name: "cua-driver-rs-v0.39.0",
      draft: false,
      prerelease: true,
      assets: [
        { name: "cua-driver-rs-0.39.0-windows-x86_64-binary.zip", browser_download_url: "https://github.com/trycua/cua/releases/download/cua-driver-rs-v0.39.0/cua-driver-rs-0.39.0-windows-x86_64-binary.zip" },
        { name: "SHA256SUMS", browser_download_url: "https://github.com/trycua/cua/releases/download/cua-driver-rs-v0.39.0/SHA256SUMS" },
        { name: "cua-driver-rs-0.39.0-windows-x86_64-binary.zip.sigstore.json", browser_download_url: "https://github.com/trycua/cua/releases/download/cua-driver-rs-v0.39.0/cua-driver-rs-0.39.0-windows-x86_64-binary.zip.sigstore.json" },
      ],
    },
  ],
};

test("token codec encodes to base64url and decodes losslessly, rejecting corrupted tokens", () => {
  const binding: ReviewedToolBinding = {
    toolId: "gsd",
    action: "update",
    oldVersion: "1.18.0",
    acceptedVersion: "1.18.0",
    release: "1.19.0",
    artifact: "opengsd-gsd-core-1.19.0.tgz",
    integrity: "sha512-abc123==",
    digest: "a".repeat(64),
    sourceId: "npm-registry",
    sourceUrl: "https://registry.npmjs.org/@opengsd/gsd-core/-/opengsd-gsd-core-1.19.0.tgz",
    platform: "windows",
    architecture: "x64",
  };
  const payload: ReviewedReleasePlanPayload = {
    v: 1,
    mode: "update",
    targets: ["claude", "codex"],
    selectedTools: ["gsd"],
    tools: [binding],
  };

  const token = encodeReviewedReleasePlan(payload);
  assert.ok(typeof token === "string" && token.length > 0);
  assert.match(token, /^[A-Za-z0-9_-]+$/, "token must be base64url characters only");

  const decoded = decodeReviewedReleasePlan(token);
  assert.deepEqual(decoded, payload);

  assert.throws(
    () => decodeReviewedReleasePlan("not-valid-base64-deflate-token!@#"),
    (err: unknown) => err instanceof ComponentPlanError && err.code === "plan-incomplete",
  );
});

test("createLocalReleasePlan in install mode respects SAFE-01 (writes nothing) and plans uninstalled tools as install", async (context) => {
  const fixture = await createTempFixture(context);
  const plan = await createLocalReleasePlan({
    mode: "install",
    packageRoot: fixture.packageRoot,
    stateRoot: fixture.stateRoot,
    home: fixture.home,
    fetchImpl: mockFetch(DEFAULT_NPM_RESPONSES),
    platform: "win32",
    architecture: "x64",
  });

  // SAFE-01: no files written
  assert.equal(readdirSync(fixture.packageRoot).length, 0, "packageRoot must remain empty");
  assert.equal(readdirSync(fixture.stateRoot).length, 0, "stateRoot must remain empty");
  assert.equal(readdirSync(fixture.home).length, 0, "home must remain empty");

  assert.equal(plan.mode, "install");
  assert.equal(plan.applyAllowed, true);
  assert.ok(plan.planDigest && /^[a-f0-9]{64}$/.test(plan.planDigest));
  assert.ok(plan.reviewedPlanToken && plan.reviewedPlanToken.length > 0);
  assert.ok(plan.applyCommand && plan.applyCommand.includes("--apply"));
  assert.ok(plan.applyCommand.includes(`--plan-digest ${plan.planDigest}`));
  assert.ok(plan.applyCommand.includes(`--reviewed-plan ${plan.reviewedPlanToken}`));

  // All absent tools should have action === "install" in install mode
  for (const item of plan.changedTools) {
    assert.equal(item.action, "install");
    assert.ok(item.newVersion);
    assert.ok(item.sourceUrl);
    assert.ok(item.recoveryScope);
  }
});

test("createLocalReleasePlan in update mode plans absent tools as skip-absent when default", async (context) => {
  const fixture = await createTempFixture(context);
  const isolatedEnv: NodeJS.ProcessEnv = {
    APPDATA: join(fixture.home, "AppData", "Roaming"),
    LOCALAPPDATA: join(fixture.home, "AppData", "Local"),
    PATH: "",
    npm_config_prefix: join(fixture.home, "npm"),
    USERPROFILE: fixture.home,
    HOME: fixture.home,
  };
  const plan = await createLocalReleasePlan({
    mode: "update",
    packageRoot: fixture.packageRoot,
    stateRoot: fixture.stateRoot,
    home: fixture.home,
    env: isolatedEnv,
    fetchImpl: mockFetch(DEFAULT_NPM_RESPONSES),
    platform: "win32",
    architecture: "x64",
  });

  assert.equal(plan.mode, "update");
  // Since all tools are absent in this fixture, unchangedTools should have skip-absent items
  for (const item of plan.unchangedTools) {
    assert.equal(item.action, "skip-absent");
  }
  assert.equal(plan.changedTools.length, 0);
});

test("createLocalReleasePlan in update mode with explicit --tool for absent tool rejects with absent-tool-in-update", async (context) => {
  const fixture = await createTempFixture(context);
  const isolatedEnv: NodeJS.ProcessEnv = {
    APPDATA: join(fixture.home, "AppData", "Roaming"),
    LOCALAPPDATA: join(fixture.home, "AppData", "Local"),
    PATH: "",
    npm_config_prefix: join(fixture.home, "npm"),
    USERPROFILE: fixture.home,
    HOME: fixture.home,
  };
  const plan = await createLocalReleasePlan({
    mode: "update",
    tools: ["gsd"],
    packageRoot: fixture.packageRoot,
    stateRoot: fixture.stateRoot,
    home: fixture.home,
    env: isolatedEnv,
    fetchImpl: mockFetch(DEFAULT_NPM_RESPONSES),
    platform: "win32",
    architecture: "x64",
  });

  assert.equal(plan.applyAllowed, false);
  assert.equal(plan.applyCommand, null);
  assert.ok(plan.blockedReasons.some((r) => r.includes("absent-tool-in-update") || r.includes("install")));
});

test("createLocalReleasePlan determinism: identical inputs produce identical planDigest and token", async (context) => {
  const fixture = await createTempFixture(context);
  const options = {
    mode: "install" as const,
    tools: ["gsd" as const, "ecc" as const],
    targets: ["claude" as const, "codex" as const],
    packageRoot: fixture.packageRoot,
    stateRoot: fixture.stateRoot,
    home: fixture.home,
    fetchImpl: mockFetch(DEFAULT_NPM_RESPONSES),
    platform: "win32",
    architecture: "x64",
  };

  const plan1 = await createLocalReleasePlan(options);
  const plan2 = await createLocalReleasePlan(options);

  assert.equal(plan1.planDigest, plan2.planDigest);
  assert.equal(plan1.reviewedPlanToken, plan2.reviewedPlanToken);
});

test("resolveNpmStableRelease rejects semantic prereleases with latest-is-prerelease (D-09)", async () => {
  const fetchBeta = mockFetch({
    "test-pkg/latest": { version: "1.19.0-beta.1", dist: { integrity: "sha512-abc==" } },
  });
  const res = await resolveNpmStableRelease("test-pkg", fetchBeta);
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.errorCode, "latest-is-prerelease");
    assert.match(res.message, /prerelease/);
  }
});

test("resolveNpmStableRelease rejects invalid metadata with invalid-metadata (D-09)", async () => {
  const fetchInvalid = mockFetch({
    "bad-pkg/latest": { version: "1.19.0", dist: { integrity: "not-sha512" } },
  });
  const res = await resolveNpmStableRelease("bad-pkg", fetchInvalid);
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.errorCode, "invalid-metadata");
  }
});

test("resolveCuaStableRelease rejects incomplete discovery after filtering draft, nightly, and 0.28.3 (D-10)", async () => {
  const fetchReleases = mockFetch({
    "repos/trycua/cua/releases": [
      { tag_name: "cua-driver-rs-v0.39.0", draft: true, prerelease: true, assets: [] },
      { tag_name: "nightly-cua-driver-rs-v0.40.0", draft: false, prerelease: true, assets: [] },
      { tag_name: "cua-driver-rs-v0.28.3", draft: false, prerelease: true, assets: [] },
    ],
  });
  const res = await resolveCuaStableRelease({ fetchImpl: fetchReleases, platform: "win32", architecture: "x64" });
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.errorCode, "incomplete-discovery");
  }
});

test("resolveCuaStableRelease rejects unsupported platform asset with unsupported-platform without fallback (D-10)", async () => {
  const fetchDarwinOnly = mockFetch({
    "repos/trycua/cua/releases": [
      {
        tag_name: "cua-driver-rs-v0.39.0",
        draft: false,
        prerelease: true,
        assets: [
          { name: "cua-driver-rs-0.39.0-darwin-universal-binary.tar.gz", browser_download_url: "https://example.com/darwin.tar.gz" },
          { name: "SHA256SUMS", browser_download_url: "https://example.com/SHA256SUMS" },
        ],
      },
    ],
  });
  const res = await resolveCuaStableRelease({ fetchImpl: fetchDarwinOnly, platform: "win32", architecture: "x64" });
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.errorCode, "unsupported-platform");
  }
});

test("createLocalReleasePlan on Linux selects Linux asset, records unverified note and Wayland side effects (D-12)", async (context) => {
  const fixture = await createTempFixture(context);
  const linuxResponses = {
    ...DEFAULT_NPM_RESPONSES,
    "repos/trycua/cua/releases": [
      {
        tag_name: "cua-driver-rs-v0.39.0",
        draft: false,
        prerelease: true,
        assets: [
          { name: "cua-driver-rs-0.39.0-linux-x86_64-binary.tar.gz", browser_download_url: "https://example.com/linux.tar.gz" },
          { name: "SHA256SUMS", browser_download_url: "https://example.com/SHA256SUMS" },
          { name: "cua-driver-rs-0.39.0-linux-x86_64-binary.tar.gz.sigstore.json", browser_download_url: "https://example.com/linux.sigstore.json" },
        ],
      },
    ],
  };

  const plan = await createLocalReleasePlan({
    mode: "install",
    tools: ["cua-driver"],
    packageRoot: fixture.packageRoot,
    stateRoot: fixture.stateRoot,
    home: fixture.home,
    fetchImpl: mockFetch(linuxResponses),
    platform: "linux",
    architecture: "x64",
  });

  assert.equal(plan.applyAllowed, true);
  const cuaItem = plan.changedTools.find((t) => t.toolId === "cua-driver");
  assert.ok(cuaItem);
  assert.ok(cuaItem.verificationNote?.includes("unverified") || cuaItem.verificationNote?.includes("verification"));
  assert.ok(cuaItem.nativeSideEffects.some((e) => e.includes("Wayland")));
});

test("createLocalReleasePlan with partial failure blocks apply and gives --tool filter advice (D-11)", async (context) => {
  const fixture = await createTempFixture(context);
  const mixedResponses = {
    ...DEFAULT_NPM_RESPONSES,
    "%40opengsd%2Fgsd-core/latest": { version: "1.19.0-beta.1", dist: { integrity: "sha512-beta==" } },
  };

  const plan = await createLocalReleasePlan({
    mode: "install",
    tools: ["gsd", "ecc"],
    packageRoot: fixture.packageRoot,
    stateRoot: fixture.stateRoot,
    home: fixture.home,
    fetchImpl: mockFetch(mixedResponses),
    platform: "win32",
    architecture: "x64",
  });

  assert.equal(plan.applyAllowed, false);
  assert.equal(plan.applyCommand, null);
  assert.ok(plan.toolFilterAdvice && plan.toolFilterAdvice.includes("--tool"));
  const gsdItem = plan.allTools.find((t) => t.toolId === "gsd");
  assert.equal(gsdItem?.action, "blocked");
  assert.equal(gsdItem?.blockedReason?.code, "latest-is-prerelease");
  const eccItem = plan.allTools.find((t) => t.toolId === "ecc");
  assert.equal(eccItem?.action, "install");
});

function createTarGz(files: Record<string, string | Uint8Array>): Buffer {
  const blocks: Buffer[] = [];
  for (const [name, content] of Object.entries(files)) {
    const dataBuf = Buffer.isBuffer(content) ? content : Buffer.from(content);
    const header = Buffer.alloc(512);
    header.write(name, 0, 100, "utf8");
    header.write(dataBuf.length.toString(8).padStart(11, "0") + " ", 124, 12, "utf8");
    header.write("0", 156, 1, "utf8");
    header.write("ustar\0", 257, 6, "utf8");
    header.write("00", 263, 2, "utf8");

    header.fill(32, 148, 156);
    let sum = 0;
    for (let i = 0; i < 512; i++) sum += header[i] ?? 0;
    header.write(sum.toString(8).padStart(6, "0") + "\0 ", 148, 8, "utf8");

    blocks.push(header, dataBuf);
    const pad = (512 - (dataBuf.length % 512)) % 512;
    if (pad > 0) blocks.push(Buffer.alloc(pad));
  }
  blocks.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(blocks));
}

test("applyLocalReleasePlan never invokes /latest endpoint on apply and queries exact bound version (D-06)", async (context) => {
  const fixture = await createTempFixture(context);
  const requestedUrls: string[] = [];

  const preview = await createLocalReleasePlan({
    mode: "update",
    tools: ["gsd"],
    packageRoot: fixture.packageRoot,
    stateRoot: fixture.stateRoot,
    home: fixture.home,
    fetchImpl: mockFetch({
      "%40opengsd%2Fgsd-core/latest": { version: "1.18.0", dist: { integrity: "sha512-gsd118==" } },
    }),
    platform: "win32",
    architecture: "x64",
  });

  const spyFetch: typeof fetch = async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    requestedUrls.push(url);
    if (url.includes("/latest") || url.includes("releases?")) {
      throw new Error(`Forbidden endpoint called during apply: ${url}`);
    }
    if (url.includes("%40opengsd%2Fgsd-core/1.18.0") || url.includes("@opengsd/gsd-core/1.18.0")) {
      return new Response(JSON.stringify({
        version: "1.18.0",
        dist: { integrity: "sha512-gsd118==" },
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
  };

  const result = await applyLocalReleasePlan({
    planDigest: preview.planDigest!,
    reviewedPlanToken: preview.reviewedPlanToken!,
    packageRoot: fixture.packageRoot,
    stateRoot: fixture.stateRoot,
    home: fixture.home,
    fetchImpl: spyFetch,
    platform: "win32",
    architecture: "x64",
  });

  assert.equal(result.applied, false);
  assert.equal(requestedUrls.some((u) => u.includes("/latest")), false, "/latest must never be called on apply");
});

test("revalidateLocalReleasePlan throws ComponentPlanError('plan-drift') when pre-state drifts (D-08)", async (context) => {
  const fixture = await createTempFixture(context);
  const payload: ReviewedReleasePlanPayload = {
    v: 1,
    mode: "update",
    targets: ["codex"],
    selectedTools: ["gsd"],
    tools: [
      {
        toolId: "gsd",
        action: "update",
        oldVersion: "999.0.0", // Drifts from actual local version
        acceptedVersion: "999.0.0",
        release: "1000.0.0",
        artifact: "opengsd-gsd-core-1000.0.0.tgz",
        integrity: "sha512-gsd1000==",
        digest: "b".repeat(64),
        sourceId: "npm-registry",
        sourceUrl: "https://registry.npmjs.org/@opengsd/gsd-core/-/opengsd-gsd-core-1000.0.0.tgz",
        platform: "windows",
        architecture: "x64",
      },
    ],
  };

  const planDigest = reviewedDigest("local-update-plan", {
    v: 1,
    mode: "update",
    targets: ["codex"],
    selectedTools: ["gsd"],
    tools: payload.tools,
  });
  const reviewedPlanToken = encodeReviewedReleasePlan(payload);

  await assert.rejects(
    async () => {
      await revalidateLocalReleasePlan({
        planDigest,
        reviewedPlanToken,
        packageRoot: fixture.packageRoot,
        stateRoot: fixture.stateRoot,
        home: fixture.home,
        fetchImpl: mockFetch({}),
        platform: "win32",
        architecture: "x64",
      });
    },
    (err: unknown) => {
      assert.ok(err instanceof ComponentPlanError);
      assert.equal(err.code, "plan-drift");
      assert.match(err.message, /pre-state drifted/);
      assert.match(err.message, /alpha-aos update/);
      return true;
    },
  );
});

test("applyLocalReleasePlan is a no-op when all tools are current (D-08)", async (context) => {
  const fixture = await createTempFixture(context);
  const preview = await createLocalReleasePlan({
    mode: "update",
    tools: ["gsd"],
    packageRoot: fixture.packageRoot,
    stateRoot: fixture.stateRoot,
    home: fixture.home,
    fetchImpl: mockFetch({
      "%40opengsd%2Fgsd-core/latest": { version: "1.18.0", dist: { integrity: "sha512-gsd118==" } },
    }),
    platform: "win32",
    architecture: "x64",
  });
  assert.equal(preview.changedTools.length, 0);

  const result = await applyLocalReleasePlan({
    planDigest: preview.planDigest!,
    reviewedPlanToken: preview.reviewedPlanToken!,
    packageRoot: fixture.packageRoot,
    stateRoot: fixture.stateRoot,
    home: fixture.home,
    fetchImpl: mockFetch({}),
    platform: "win32",
    architecture: "x64",
  });

  assert.equal(result.applied, false);
  assert.equal(result.operationId, null);
  assert.equal(result.changedTools.length, 0);
  assert.match(result.message, /No changes applied/);
});

test("synthesizeReleaseStackLock derives ECC skill hashes in memory without disk writes (D-16)", async () => {
  const skillFiles: Record<string, string> = {
    "package/skills/unified-memory/SKILL.md": "unified-memory mock markdown content\n",
    "package/skills/documentation-lookup/SKILL.md": "description: old\n# Documentation Lookup (Context7)\n\ndoc lookup content\n",
    "package/skills/deep-research/SKILL.md": `## MCP Requirements\n\n- **exa**\n- **firecrawl**\n\n## Workflow\n### Step 3: Execute Multi-Source Search\nsearch\n### Step 4: Deep-Read Key Sources\nread\n### Step 5: Synthesize and Write Report\nreport\n## Parallel Research with Subagents\nparallel\n## Quality Rules\nquality\n`,
  };
  const tarball = createTarGz(skillFiles);
  const tarballIntegrity = `sha512-${createHash("sha512").update(tarball).digest("base64")}`;

  const fetchTarball: typeof fetch = async (input: RequestInfo | URL) => {
    return new Response(new Uint8Array(tarball), {
      status: 200,
      headers: { "content-type": "application/gzip" },
    });
  };

  const baseLock = await loadLock(packageRoot(), "stable");
  const originalEccVersion = baseLock.components.ecc?.version;

  const toolBinding: ReviewedToolBinding = {
    toolId: "ecc",
    action: "update",
    oldVersion: originalEccVersion ?? "2.2.0",
    acceptedVersion: originalEccVersion ?? "2.2.0",
    release: "2.3.0",
    artifact: "ecc-universal-2.3.0.tgz",
    integrity: tarballIntegrity,
    digest: createHash("sha256").update("ecc-universal@2.3.0").digest("hex"),
    sourceId: "npm-registry",
    sourceUrl: "https://registry.npmjs.org/ecc-universal/-/ecc-universal-2.3.0.tgz",
    platform: "windows",
    architecture: "x64",
  };

  const synthesized = await synthesizeReleaseStackLock(baseLock, [toolBinding], fetchTarball);

  assert.equal(synthesized.components.ecc?.version, "2.3.0");
  assert.equal(synthesized.components.ecc?.integrity, tarballIntegrity);
  assert.ok(synthesized.components.ecc?.sourceSha256["unified-memory"]);
  assert.equal(
    synthesized.components.ecc?.sourceSha256["unified-memory"],
    createHash("sha256").update(skillFiles["package/skills/unified-memory/SKILL.md"]!).digest("hex"),
  );
  assert.ok(synthesized.components.ecc?.targetSha256["documentation-lookup"]?.["antigravity"]);
  assert.equal(baseLock.components.ecc?.version, originalEccVersion, "baseLock must remain unmodified in memory");
});

test("applyLocalReleasePlan records tool-records with verified: null and leaves checkout catalog/*.json untouched (D-02, D-16)", async (context) => {
  const fixture = await createTempFixture(context);
  const repoRoot = packageRoot();
  const stackLockPath = join(repoRoot, "catalog", "stack.lock.json");
  const computerUsePath = join(repoRoot, "catalog", "computer-use-runtime.json");
  const beforeStackLock = await readFile(stackLockPath);
  const beforeComputerUse = await readFile(computerUsePath);

  const preview = await createLocalReleasePlan({
    mode: "install",
    tools: ["mcp:context7"],
    targets: ["codex"],
    packageRoot: repoRoot,
    stateRoot: fixture.stateRoot,
    home: fixture.home,
    fetchImpl: mockFetch({
      "%40upstash%2Fcontext7-mcp/latest": {
        version: "4.4.4",
        dist: { integrity: "sha512-T2DkjhweDnC2mRAclDiTrPG3KI1zYKhhjgY2SMKD9PVrbEaGD8x35VsIOqpwwDc2qiKBvfYCF/jqr+jQMu5PUA==" },
      },
    }),
    platform: "win32",
    architecture: "x64",
  });

  assert.equal(preview.applyAllowed, true);

  const mockResponses = {
    "%40upstash%2Fcontext7-mcp/4.4.4": {
      version: "4.4.4",
      dist: { integrity: "sha512-T2DkjhweDnC2mRAclDiTrPG3KI1zYKhhjgY2SMKD9PVrbEaGD8x35VsIOqpwwDc2qiKBvfYCF/jqr+jQMu5PUA==" },
    },
  };

  const result = await applyLocalReleasePlan({
    planDigest: preview.planDigest!,
    reviewedPlanToken: preview.reviewedPlanToken!,
    packageRoot: repoRoot,
    stateRoot: fixture.stateRoot,
    home: fixture.home,
    fetchImpl: mockFetch(mockResponses),
    platform: "win32",
    architecture: "x64",
  });

  assert.equal(result.applied, true);
  assert.ok(result.operationId);
  assert.deepEqual(result.changedTools, ["mcp:context7"]);

  // 1. Tool records verification
  const store = await readToolRecordStore({ stateRoot: fixture.stateRoot, packageRoot: repoRoot });
  assert.equal(store.status, "current");
  assert.equal(store.events.length, 3);
  const startEvent = store.events.find((e) => e.kind === "started");
  const resultEvent = store.events.find((e) => e.kind === "tool-result");
  const finishEvent = store.events.find((e) => e.kind === "finished");
  assert.ok(startEvent, "started event must exist");
  assert.ok(resultEvent, "tool-result event must exist");
  assert.equal(resultEvent?.result?.verified, null, "verified must be null (D-16)");
  assert.ok(finishEvent, "finished event must exist");
  assert.deepEqual(finishEvent?.acceptedTransitions, [], "acceptedTransitions must be empty (D-16)");
  assert.equal(store.accepted, null, "accepted must not advance without host invocation checks");

  // 2. Checkout catalog/*.json byte invariance
  const afterStackLock = await readFile(stackLockPath);
  const afterComputerUse = await readFile(computerUsePath);
  assert.ok(beforeStackLock.equals(afterStackLock), "catalog/stack.lock.json must be byte-identical");
  assert.ok(beforeComputerUse.equals(afterComputerUse), "catalog/computer-use-runtime.json must be byte-identical");
});

function runCli(args: string[], env: NodeJS.ProcessEnv = process.env, cwd: string = packageRoot()) {
  const cliEntry = join(packageRoot(), "dist", "src", "cli.js");
  const result = spawnSync(process.execPath, [cliEntry, ...args], {
    cwd,
    env,
    encoding: "utf8",
    timeout: 30_000,
    windowsHide: true,
  });
  return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

test("formatLocalReleasePreview renders 4-tier structured release preview with changed tools first (D-03, D-07)", async (context) => {
  const fixture = await createTempFixture(context);
  const plan = await createLocalReleasePlan({
    mode: "install",
    tools: ["gsd", "ecc"],
    targets: ["claude", "codex"],
    packageRoot: fixture.packageRoot,
    stateRoot: fixture.stateRoot,
    home: fixture.home,
    fetchImpl: mockFetch(DEFAULT_NPM_RESPONSES),
    platform: "win32",
    architecture: "x64",
  });

  const formatted = formatLocalReleasePreview(plan);
  assert.ok(formatted.includes("=== CHANGED TOOLS ==="));
  assert.ok(formatted.includes("Tool: gsd (install)"));
  assert.ok(formatted.includes("1. Release Identity & Artifact:"));
  assert.ok(formatted.includes("Current/Accepted: none"));
  assert.ok(formatted.includes("Planned Release: 1.19.0"));
  assert.ok(formatted.includes("Official Source: npm-registry"));
  assert.ok(formatted.includes("2. Affected Harnesses:"));
  assert.ok(formatted.includes("Requested: claude, codex"));
  assert.ok(formatted.includes("Affected (including shared blast radius):"));
  assert.ok(formatted.includes("3. Native Installer Side Effects:"));
  assert.ok(formatted.includes("4. Recovery Scope:"));
  assert.ok(formatted.includes("Transactional rollback:"));
  assert.ok(formatted.includes("Adapter recovery:"));
  assert.ok(formatted.includes(`Plan digest: ${plan.planDigest}`));
  assert.ok(formatted.includes(`Reviewed plan token: ${plan.reviewedPlanToken}`));
  assert.ok(formatted.includes(plan.applyCommand!));

  const applyResult = {
    mode: "install" as const,
    applied: true,
    operationId: "op-12345",
    changedTools: ["gsd" as const, "ecc" as const],
    unchangedTools: [],
    appliedSteps: ["gsd:claude", "ecc:claude"],
    externalChanges: ["gsd:claude"],
    message: "Successfully applied 2 tool update(s).",
  };
  const applyFormatted = formatLocalReleaseApplyResult(applyResult);
  assert.ok(applyFormatted.includes("alpha-AOS local release install complete"));
  assert.ok(applyFormatted.includes("Operation ID: op-12345"));
  assert.ok(applyFormatted.includes("Changed tools: gsd, ecc"));
});

test("alpha-aos update --stage is rejected with deprecation guidance and leaves candidate.lock.json untouched (D-04)", async (context) => {
  const fixture = await createTempFixture(context);
  const candidateLock = join(fixture.packageRoot, "catalog", "candidate.lock.json");
  const result = runCli(["update", "--stage"], {
    ...process.env,
    ALPHA_AOS_STATE_DIR: fixture.stateRoot,
    HOME: fixture.home,
    USERPROFILE: fixture.home,
  }, fixture.packageRoot);

  assert.notEqual(result.status, 0);
  const out = `${result.stdout}\n${result.stderr}`;
  assert.ok(out.includes("The --stage option has been retired"));
  assert.ok(out.includes("alpha-aos update"));
  assert.equal(existsSync(candidateLock), false, "candidate.lock.json must not be created or modified (D-04)");
});

test("alpha-aos update --tool <absent> refuses with install guidance instead of implicitly installing (D-03)", async (context) => {
  const fixture = await createTempFixture(context);
  const result = runCli(["update", "--tool", "mcp:context7"], {
    ...process.env,
    ALPHA_AOS_STATE_DIR: fixture.stateRoot,
    HOME: fixture.home,
    USERPROFILE: fixture.home,
  }, fixture.packageRoot);

  assert.notEqual(result.status, 0);
  const out = `${result.stdout}\n${result.stderr}`;
  assert.ok(
    out.includes('Tool "mcp:context7" is not installed. Use "alpha-aos install --tool mcp:context7" to install it.'),
    `output should include absent tool guidance: ${out}`,
  );
});

test("alpha-aos install --apply and update --apply without plan tokens refuse before changes (D-05)", async (context) => {
  const fixture = await createTempFixture(context);
  const isolatedEnv: NodeJS.ProcessEnv = {
    ...process.env,
    ALPHA_AOS_STATE_DIR: fixture.stateRoot,
    HOME: fixture.home,
    USERPROFILE: fixture.home,
  };

  const installResult = runCli(["install", "--apply"], isolatedEnv, fixture.packageRoot);
  assert.notEqual(installResult.status, 0);
  const installOut = `${installResult.stdout}\n${installResult.stderr}`;
  assert.ok(
    installOut.includes('Applying install requires both --plan-digest and --reviewed-plan. Run "alpha-aos install" to preview and obtain a reviewed plan.'),
    `install apply output: ${installOut}`,
  );

  const updateResult = runCli(["update", "--apply"], isolatedEnv, fixture.packageRoot);
  assert.notEqual(updateResult.status, 0);
  const updateOut = `${updateResult.stdout}\n${updateResult.stderr}`;
  assert.ok(
    updateOut.includes('Applying update requires both --plan-digest and --reviewed-plan. Run "alpha-aos update" to preview and obtain a reviewed plan.'),
    `update apply output: ${updateOut}`,
  );
});


