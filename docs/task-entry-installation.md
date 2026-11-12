# Persistent task-entry guidance (0.8.1)

Installing a skill does not ensure a host shows its description or that a model loads it. Managed GSD installation now also installs persistent entry guidance. It explicitly loads `alpha-aos-task` before implementation, uses the shared policy/intake decision, preserves owner opt-outs and approval boundaries, and requires checking actual results before claiming completion.

| Host | Native entry surface | Configuration override |
| --- | --- | --- |
| Claude Code | `~/.claude/CLAUDE.md` | `CLAUDE_CONFIG_DIR` |
| Codex | `~/.codex/AGENTS.md` | `CODEX_HOME` |
| Antigravity App / agy / IDE | `~/.gemini/GEMINI.md` | `ANTIGRAVITY_CONFIG_DIR` for a configured native rule root; confirm that the selected surface reads it |
| Pi | `~/.pi/agent/AGENTS.md` | `PI_CODING_AGENT_DIR` |
| Hermes | `skills.auto_load` includes `alpha-aos-task` in the native `config.yaml` | `HERMES_HOME`; existing Windows home resolution is preserved |

Hermes loads the full task skill through native auto-loading, independently of MCP selection. Its SOUL.md identity is unchanged. Other hosts receive the small shared [entry guidance](task-entry-policy.md) in an owned Markdown block. Existing user text, other managed blocks and native configuration are preserved. A project that explicitly excludes alpha-AOS keeps that choice.

## Upgrade or repair

After updating the alpha-AOS engine, preview the installed hosts (or replace `all` with one host ID):

```sh
alpha-aos entry-policy sync --target all --json
alpha-aos entry-policy sync --target all --apply --plan-digest <digest-from-preview> --json
alpha-aos doctor --json
```

`all` explicitly selects all five hosts; normal installation selects detected/explicit targets. Preview writes no files and exposes hashes/paths, not existing instruction text or config values. Apply checks the exact preview digest and file identity, snapshots mutations, and attempts reverse rollback if a batch fails. Existing transaction rollback remains available. Malformed ownership markers, unsafe paths and global `AGENTS.override.md` for Codex/Pi are refused for review instead of silently claiming success.

`doctor` reports `policy.task-entry.<host>` and missing deployed owned skills. Re-run sync to restore a removed/old managed block. Uninstall removes owned blocks or the managed Hermes auto-load entry while preserving user guidance and skills.

Restart or refresh each host, then inspect its loaded context. If skill descriptions are hidden, explicitly load `alpha-aos-task` once to check that its body is available. Tests of configuration/CLI behavior do not prove that an active model follows the instructions. Custom system prompts, disabled native context loading, provider conversion and context truncation still require host-level inspection; this release does not change context-window settings or promise native GSD controller parity.

## Native discovery references

- [Claude global instructions and CLAUDE_CONFIG_DIR](https://code.claude.com/docs/en/claude-directory)
- [Antigravity global rules across App, CLI and IDE](https://antigravity.google/docs/rules/)
- [Pi context files and agent directory](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/configuration.md)
- [Hermes native auto-load prompt assembly](https://github.com/nousresearch/hermes-agent/blob/main/agent/system_prompt.py)
- Codex uses the existing `CODEX_HOME/AGENTS.md` adapter; its separate execution guidance remains installed.
