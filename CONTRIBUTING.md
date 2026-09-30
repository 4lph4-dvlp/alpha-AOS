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
- A new external version reaches the stable lock only through the automated weekly promotion (`dependency-candidate.yml` on Monday, `auto-promote.yml` on Wednesday), which requires registry integrity, the full Windows/macOS/Linux CI suite, real component fixtures, and a registry re-check after a two-day cooldown. End-user machines never apply an unverified candidate. Do not edit pinned versions by hand, and do not restate them as literals in tests or docs; derive them from `catalog/stack.lock.json`.
- Preserve unrelated user settings when merging harness configuration.

Run `npm run check` and `npm test` before opening a pull request. Explain any platform that could not be tested and any external canary blocked by provider quota.
