# Local and remote verification

Use `npm run build` followed by `npm run verify:push` before pushing. This runs type checks, the complete test suite with mandatory upstream MCP startup, build provenance validation, and package allowlist validation. A failure blocks the command. A focused test pass is not a full verification pass.

Enable the checked-in Git pre-push hook for each clone:

```sh
git config core.hooksPath .githooks
```

The hook requires the authenticated GitHub CLI (`gh`). Before a main push, it refuses unless this exact commit already has a successful three-OS CI run. It then builds and executes the local gate. Submit changes on a review branch and dispatch CI there before landing on main. Each clone must enable the hook; it is not a server-side branch protection rule. A successful Red-Main Guard means the guard processed CI results; it does not mean CI passed.

Monday's dependency workflow tests newly resolved versions, unlike a local test against the stable lock. The shared promotion gate retries an MCP fixture once only when its protocol reports a transient transport failure. Integrity failures, incompatible tools and a second transport failure remain failures. Wednesday still requires the verified artifact, cooldown and registry re-check. External outages and defective upstream releases cannot be guaranteed to pass.
