import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const RELEASE_JOBS = [
  "Authoritative Release Package (Linux)",
  "ubuntu-latest / Node 24", "macos-latest / Node 24", "windows-latest / Node 24",
];

export function validateGithubRelease({ version, sha, runId, mainSha, repository, run, jobs, manifest }) {
  assert.match(version, /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/u, "A stable version is required");
  assert.match(sha, /^[a-f0-9]{40}$/u, "An exact source commit is required");
  assert.match(runId, /^[1-9][0-9]*$/u, "An exact CI run ID is required");
  assert.equal(mainSha, sha, "Release source must equal authoritative main");
  assert.equal(String(run.id), runId, "Wrong CI run");
  assert.equal(run.repository?.full_name, repository, "Wrong CI repository");
  assert.equal(run.head_repository?.full_name, repository, "Fork CI cannot authorize publication");
  assert.equal(run.path, ".github/workflows/ci.yml", "Wrong CI workflow");
  assert.equal(run.head_sha, sha, "CI source does not match release source");
  assert.equal(run.status, "completed", "CI is incomplete");
  assert.equal(run.conclusion, "success", "CI did not succeed");
  assert.ok(Array.isArray(jobs), "CI jobs are required");
  for (const name of RELEASE_JOBS) {
    const matches = jobs.filter((job) => job.name === name);
    assert.equal(matches.length, 1, `Missing or duplicate required job: ${name}`);
    assert.equal(matches[0].status, "completed", `Incomplete job: ${name}`);
    assert.equal(matches[0].conclusion, "success", `Unsuccessful job: ${name}`);
  }
  assert.equal(manifest.name, "alpha-aos", "Wrong package");
  assert.equal(manifest.version, version, "Packed version differs from requested version");
  return { schemaVersion: 1, repository, version, sourceCommit: sha, ciRunId: runId,
    ciUrl: run.html_url, jobs: RELEASE_JOBS.map((name) => {
      const job = jobs.find((entry) => entry.name === name);
      return { name, id: job.id, conclusion: job.conclusion, url: job.html_url };
    }) };
}

export function verifyReleaseChecksum(version, bytes, checksum) {
  const filename = `alpha-aos-${version}.tgz`;
  const match = /^([a-f0-9]{64}) {2}([^\r\n]+)\r?\n?$/u.exec(checksum);
  assert.ok(match && match[2] === filename, "Checksum must bind the exact release filename");
  const digest = createHash("sha256").update(bytes).digest("hex");
  assert.equal(digest, match[1], "Release tarball checksum mismatch");
  return { filename, sha256: digest, size: bytes.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const json = (path) => JSON.parse(readFileSync(path, "utf8"));
  const { RELEASE_VERSION: version, RELEASE_SHA: sha, CI_RUN_ID: runId, RELEASE_MAIN_SHA: mainSha, GITHUB_REPOSITORY: repository } = process.env;
  const evidence = validateGithubRelease({ version, sha, runId, mainSha, repository,
    run: json("release-run.json"), jobs: json("release-jobs.json").jobs, manifest: json("release-package.json") });
  const artifact = verifyReleaseChecksum(version, readFileSync(`alpha-aos-${version}.tgz`), readFileSync(`alpha-aos-${version}.tgz.sha256`, "utf8"));
  writeFileSync("release-evidence.json", JSON.stringify({ ...evidence, artifact }, null, 2) + "\n");
  console.log(`Verified ${artifact.filename} at ${sha} using CI ${runId}`);
}
