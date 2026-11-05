# Local delivery and optional GitHub releases

The owner selected personal workstation delivery on 2026-11-05. This supersedes earlier mandatory CI release procedures.

- Push directly to main. No CI or tests run in the pre-push hook.
- Run `npm run deploy:local` to build, confirm CLI startup, and link the checkout. Managed harness configurations are not changed by this command.
- Full tests (`npm test`) and GitHub CI are optional manual operations. Scheduled dependency promotion is disabled.
- For an optional public release, set a new package version and dispatch `gh workflow run release.yml --ref main -f version=NEW_VERSION`. It builds, checks CLI startup, packages and publishes a checksum without tests or a CI run ID. Existing tags are refused. npm registry publication is separate.

Manual builds do not establish test success or compatibility with other operating systems. Historical release evidence describes the original release.
