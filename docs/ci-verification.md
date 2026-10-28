# Local and remote verification

Use `npm run build` followed by `npm run verify:push` before pushing. This runs type checks, the complete test suite with mandatory upstream MCP startup, build provenance validation, and package allowlist validation. A failure blocks the command. A focused test pass is not a full verification pass.

Enable the checked-in Git pre-push hook for each clone:

```sh
git config core.hooksPath .githooks
```

The hook builds first, then executes this gate. It does not replace the Linux, macOS and Windows GitHub Actions matrix. Submit changes on a review branch and confirm all matrix legs on the exact commit before landing on main. A successful Red-Main Guard means the guard processed CI results; it does not mean CI passed.

Monday's dependency workflow tests newly resolved versions, unlike a local test against the stable lock. The shared promotion gate retries an MCP fixture once only when its protocol reports a transient transport failure. Integrity failures, incompatible tools and a second transport failure remain failures. Wednesday still requires the verified artifact, cooldown and registry re-check. External outages and defective upstream releases cannot be guaranteed to pass.
