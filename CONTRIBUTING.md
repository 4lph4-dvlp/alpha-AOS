# Contributing

alpha-AOS is a declarative reconciler for a deliberately small, cross-harness workflow stack. Contributions should preserve deterministic routing, exact dependency locks, dry-run-first mutation, and one owner per workflow verb.

## Development setup

Requirements: Git, Node.js 24 or newer, and npm 10 or newer.

```sh
npm ci
npm run check
npm test
node dist/src/cli.js doctor
```

## Change rules

- Do not add an ECC profile or broad skill bundle. Select exact files and lock their source and rendered SHA-256 values.
- Do not patch upstream-managed GSD or ECC files in place.
- Do not put secrets or secret values in tests, fixtures, logs, plans, locks, examples, or journals.
- Keep detection deterministic. Repository files and declared dependencies may select a pack; an LLM must not decide installation state.
- Add tests for every new adapter path, renderer, ownership boundary, and rollback behavior.
- A new external version starts in `candidate.lock.json`, passes the Windows/macOS/Linux fixture matrix, and is promoted to the stable lock in a reviewed change. End-user machines never apply an unverified candidate.
- Preserve unrelated user settings when merging harness configuration.

Run `npm run check` and `npm test` before opening a pull request. Explain any platform that could not be tested and any external canary blocked by provider quota.
