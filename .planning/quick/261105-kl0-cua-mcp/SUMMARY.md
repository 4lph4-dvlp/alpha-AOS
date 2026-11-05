# Official Cua installation correction

Replaced alpha-AOS private archive extraction with unchanged upstream installers and all executable sibling helpers, pinned to source commit 85e2b1318bd77ccf3cfa88ccdf875a4bb7eaed19 and local SHA256 manifest. Native installer process is declared in aggregate plan, runs under the writer session with an environment allowlist, exact 0.38.0 release, telemetry off, GC disabled and Windows autostart disabled. Official native PATH/layout changes are external; failures report possible retained state rather than verified rollback. Legacy layouts requiring native deletion are blocked for explicit migration review.

Discovery prefers official locations and preserves macOS CuaDriver.app. Plain MCP replaces forced --direct. Installed manifests match official layout, including the macOS app archive validated against the retained signed checksum list. Private alpha-AOS files were preserved.

Evidence: 27 focused installer/native/lifecycle tests passed; PowerShell installer parses; npm pack dry-run includes all five upstream scripts and MIT license. Existing Windows official 0.38.0 installation was verified/reused (changed:false), and its actual CLI --help succeeded. deploy:local passed. Build and eight focused Cua tests passed again after final writer/legacy guards. Full suite, new-machine official installer execution, macOS/Linux native execution and GUI input were not run. Verbose local evidence: %TEMP%/alpha-aos-cua-official-review. Capability plan inspected without materialization.

Official references: https://cua.ai/docs/cua-driver/quickstart and https://cua.ai/docs/cua-driver/concepts/how-cua-driver-works .
