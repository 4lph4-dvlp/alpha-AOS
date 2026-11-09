# Phase 40: API Coverage Matrix

Phase 40 queries two public, unauthenticated official release metadata HTTP endpoints to resolve and revalidate stable external tool releases locally (`LOC-02`, `LOC-03`): the npm Registry metadata/tarball endpoints (`https://registry.npmjs.org`) and the GitHub Releases API / release asset endpoints for `trycua/cua` (`https://api.github.com/repos/trycua/cua/releases` and `https://github.com/trycua/cua/releases/download/`).

Cua release assets use `GET /trycua/cua/releases/download/cua-driver-rs-v<X.Y.Z>/{SHA256SUMS,*.sigstore.json,<archive>}`.

| capability | decision | reason |
|---|---|---|
| npm Registry `GET /<pkg>/latest` dist-tag metadata | INTEGRATE | Used during read-only preview (`alpha-aos install`, `alpha-aos update`) to resolve the official `latest` release and reject semantic prereleases (`D-09`). |
| npm Registry `GET /<pkg>/<version>` exact version metadata | INTEGRATE | Used during `--apply` to revalidate the exact bound release version and `dist.integrity` without re-querying moving `latest` tags (`D-06`, `D-08`). |
| npm Registry `GET /<pkg>/-/<tarball>.tgz` archive download | INTEGRATE | Used to verify `ecc-universal` tarball `sha512` integrity in memory and compute `sourceSha256` / `targetSha256` for selected ECC skills without mutating `catalog/stack.lock.json` (`D-16`). |
| npm Registry full package packument `GET /<pkg>` | OPT-OUT | `D-09` forbids falling back to older versions when `latest` is a prerelease, so enumerating all historical versions is unnecessary and avoided. |
| npm Registry search / publish / dist-tag mutation endpoints | OPT-OUT | Out of scope; alpha-AOS only consumes official published package releases read-only (`LOC-02`). |
| GitHub Releases `GET /repos/trycua/cua/releases?per_page=100&page=<1..10>` | INTEGRATE | Used during preview to discover the highest non-draft `cua-driver-rs-v<X.Y.Z>` release within bounded pagination (`D-10`, `D-12`). |
| GitHub Releases `GET /repos/trycua/cua/releases/tags/cua-driver-rs-v<X.Y.Z>` | INTEGRATE | Used during bound `--apply` revalidation to verify the exact reviewed Cua release tag without re-running moving channel discovery (`D-06`). |
| Cua release assets: SHA256SUMS, Sigstore bundle, archive | INTEGRATE | Verifies archive SHA-256 and Sigstore workflow attestation, then derives installed file hashes locally (`D-13`, `D-14`). |
| GitHub Releases `GET /repos/trycua/cua/releases/latest` | OPT-OUT | Upstream marks `cua-driver-rs-v*` releases with GitHub `prerelease: true` and shares the repo with Python/Lume releases, so `/releases/latest` does not return `cua-driver-rs` (`D-10`). |
| GitHub authenticated mutation / repo write / workflow dispatch APIs | OPT-OUT | `LOC-02` and `D-16` require zero repository write permission and no remote lock promotion. |
