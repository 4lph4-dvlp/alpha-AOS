# Follow-up: preserve user TOML below the GSD marker during uninstall

Confirmed on this workstation with installed GSD 1.14.0. Its `stripGsdFromCodexConfig` uses the marker-to-EOF span as the managed block. A user-owned `tui` table written later by Codex was inside that span and removed by official uninstall. Cleanup preservation checks detected the loss; the table was restored from the private verified backup.

Future correction should prune known managed tables/assignments while preserving unrelated trailing tables, with a round-trip regression containing a user table below the marker. Coordinate with upstream or implement a reviewed alpha-AOS uninstall adapter. This is not fixed in source by the machine-cleanup task and should be considered before asserting complete uninstall preservation guarantees.
