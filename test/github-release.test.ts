import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const checks = await import(pathToFileURL(resolve(import.meta.dirname, "../../scripts/github-release-check.mjs")).href);

function input() {
  const repository = "4lph4-dvlp/alpha-AOS";
  const sha = "a".repeat(40);
  return { version: "0.6.0", sha, runId: "123", mainSha: sha, repository,
    run: { id: 123, repository: { full_name: repository }, head_repository: { full_name: repository },
      path: ".github/workflows/ci.yml", head_sha: sha, status: "completed", conclusion: "success", html_url: "https://example.invalid/ci/123" },
    jobs: (checks.RELEASE_JOBS as string[]).map((name, id) => ({ name, id, status: "completed", conclusion: "success" })),
    manifest: { name: "alpha-aos", version: "0.6.0" } };
}

test("GitHub release accepts only the exact main source, package and complete four-job CI", () => {
  assert.equal(checks.validateGithubRelease(input()).sourceCommit, "a".repeat(40));
  const mutations = [
    (value: ReturnType<typeof input>) => { value.version = "0.6.0-rc.1"; },
    (value: ReturnType<typeof input>) => { value.mainSha = "b".repeat(40); },
    (value: ReturnType<typeof input>) => { value.run.head_sha = "b".repeat(40); },
    (value: ReturnType<typeof input>) => { value.run.id = 456; },
    (value: ReturnType<typeof input>) => { value.run.path = ".github/workflows/unrelated.yml"; },
    (value: ReturnType<typeof input>) => { value.run.head_repository.full_name = "someone/fork"; },
    (value: ReturnType<typeof input>) => { value.run.conclusion = "failure"; },
    (value: ReturnType<typeof input>) => { value.run.status = "in_progress"; },
    (value: ReturnType<typeof input>) => { value.jobs.pop(); },
    (value: ReturnType<typeof input>) => { value.jobs.push(value.jobs[0]!); },
    (value: ReturnType<typeof input>) => { value.jobs[1]!.conclusion = "skipped"; },
    (value: ReturnType<typeof input>) => { value.manifest.version = "0.4.8"; },
    (value: ReturnType<typeof input>) => { value.manifest.name = "other"; },
  ];
  for (const mutate of mutations) {
    const value = input();
    mutate(value);
    assert.throws(() => checks.validateGithubRelease(value));
  }
});

test("GitHub release checksum refuses changed bytes, substituted names and multiple entries", () => {
  const bytes = Buffer.from("a specific CI artifact");
  const digest = createHash("sha256").update(bytes).digest("hex");
  const checksum = `${digest}  alpha-aos-0.6.0.tgz\n`;
  assert.equal(checks.verifyReleaseChecksum("0.6.0", bytes, checksum).sha256, digest);
  assert.throws(() => checks.verifyReleaseChecksum("0.6.0", Buffer.from("changed"), checksum));
  assert.throws(() => checks.verifyReleaseChecksum("0.6.0", bytes, checksum.replace("0.6.0", "0.4.8")));
  assert.throws(() => checks.verifyReleaseChecksum("0.6.0", bytes, checksum + checksum));
});
