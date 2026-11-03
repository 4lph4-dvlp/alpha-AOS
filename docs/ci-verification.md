# Local and remote verification

Use `npm run build` followed by `npm run verify:push` before pushing. This runs type checks, the complete test suite with mandatory upstream MCP startup, build provenance validation, and package allowlist validation. A failure blocks the command. A focused test pass is not a full verification pass.

Enable the checked-in Git pre-push hook for each clone:

```sh
git config core.hooksPath .githooks
```

The hook requires the authenticated GitHub CLI (`gh`). Before a main push, it refuses unless this exact commit already has a successful three-OS CI run. It then builds and executes the local gate. Submit changes on a review branch and dispatch CI there before landing on main. Each clone must enable the hook; it is not a server-side branch protection rule. A successful Red-Main Guard means the guard processed CI results; it does not mean CI passed.

Monday's dependency workflow tests newly resolved versions, unlike a local test against the stable lock. The shared promotion gate retries an MCP fixture once only when its protocol reports a transient transport failure. Integrity failures, incompatible tools and a second transport failure remain failures. Wednesday still requires the verified artifact, cooldown and registry re-check. External outages and defective upstream releases cannot be guaranteed to pass.

## macOS panel failures and the 0.6.0 candidate

The earlier 0.5.0 attempts failed for different observed reasons:

- [Run 41302349585](https://github.com/4lph4-dvlp/alpha-AOS/actions/runs/41302349585) used Node 24.22.1 / bundled undici 7.30.1 and crashed in `setTypeOfService EINVAL`. The [upstream backport](https://github.com/nodejs/undici/pull/6076) confirms that HTTP/1 QoS marking could throw outside the fetch promise on macOS. Selecting a different Node patch without checking its bundled undici is not proof of remediation.
- [Run 41307974019](https://github.com/4lph4-dvlp/alpha-AOS/actions/runs/41307974019) passed Linux and Windows but failed macOS observer cancellation and public attach (`ECONNREFUSED`). Its child error/exit/signal were not retained, so the exact historical cause remains unconfirmed. The existing subsequent local fix installs shutdown handling before publishing readiness and gives test observers a finite 60-second lifetime including startup.

The panel regression clients now use test-only native `node:http` loopback requests with real response streams and abort handling. They retain server authentication, hostile-request rejection, live SSE/backpressure and strict process-reaping assertions. Browser fetch in the product is unchanged. A child-process regression injects the macOS QoS error at the socket boundary: built-in fetch fails the control, while the native client must work without entering that path or installing uncaught-exception handlers. A separate case cancels a ready observer before any HTTP request.

On each OS, CI builds and runs the focused HTTP and panel lifecycle checks before the full suite. A failure stops that candidate; no rerun or skip converts it to a pass. The `native-ci-diagnostics-<os>` artifact retains the Node/undici versions and focused/full logs for 14 days, including failed runs. Use the recorded exact candidate SHA and first failing assertion to choose the next experiment. The short preflight is additional evidence; only the full three-OS gate can establish native release acceptance.

Local results and historical receipts do not establish a successful 0.6.0 macOS run or registry publication. Those remain pending until the actual candidate is accepted.
