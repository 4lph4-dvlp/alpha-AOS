# alpha-AOS Migration Guide: Local Tool Records (v0.8.0)

This guide provides instructions for migrating existing alpha-AOS installations and legacy static pins to the Single Source of Truth (SSOT) local tool-records architecture introduced in v0.8.0.

---

## 1. Overview: Local Tool Records Architecture

In earlier alpha-AOS versions, runtime components relied on static repository locks (`catalog/stack.lock.json`) and bundled runtime files (`catalog/computer-use-runtime.json`) to determine tool and MCP versions.

Starting with v0.8.0:
- **Local Tool Records as SSOT**: All runtime components (`mcp`, `isolation`, `install`, `doctor`, `recovery`) resolve active tool and driver versions strictly through immutable local records stored under `~/.alpha-aos/tool-records/v1/`.
- **Fail-Closed Principle**: Runtime consumers will fail closed with explicit actionable error guidance if accepted tool records are absent or uninitialized, rather than silently falling back to bundled or outdated versions.
- **Historical Seed Retention**: Legacy lockfiles (`catalog/stack.lock.json`, `catalog/computer-use-runtime.json`) are retained strictly as read-only historical seeds for the migration pipeline and are never accessed by runtime code.

---

## 2. Step-by-Step Migration Workflow

The migration pipeline adopts existing tool installations and configuration files non-destructively.

### Step 1: Generate a Read-Only Preview

Execute the migration preview to discover legacy installations and evaluate their readiness:

```bash
alpha-aos migrate
```

To limit migration to specific tools or harness targets:

```bash
alpha-aos migrate --tool cua-driver,mcp:context7 --target codex,antigravity
```

The preview inspects installed tools, legacy evidence, and harness configurations, printing a 64-character SHA-256 plan digest and a signed review token:

```text
alpha-aos migration preview
Plan digest: 1a2b3c4d...
Reviewed plan token: eyJhbGci...

Component and Harness Status Matrix:
Tool        Harness      Status           Shared Config Impact    Action Required
----------  -----------  ---------------  ----------------------  -----------------
cua-driver  codex        RETAINED [SKIP]  preserved               ready to migrate
mcp:context7 antigravity RETAINED [SKIP]  preserved               ready to migrate
```

### Step 2: Review Candidates and Shared Impacts

Review the candidate list:
- **Ready**: Tool matches recognized legacy evidence and can be adopted directly.
- **Modified**: User modifications detected on the harness configuration. A non-destructive `.user-backup` will be created automatically upon apply.
- **Ambiguous**: Ownership cannot be determined automatically. Supply `--resolve-ownership` as described below.

### Step 3: Apply the Migration Plan

Once satisfied with the preview, apply the migration by providing both the plan digest and reviewed plan token:

```bash
alpha-aos migrate --apply --plan-digest <DIGEST> --reviewed-plan <TOKEN>
```

Upon apply, alpha-AOS:
1. Validates that the plan digest exactly matches current machine state.
2. Creates non-destructive `.user-backup` snapshots for any modified files.
3. Commits an atomic `type: "migrate"` event to the local tool-record store.
4. Registers active accepted transitions for all adopted tools.

---

## 3. Ownership Resolution and Selective Marker Boundaries

### Resolving Ambiguous Candidates

If an existing installation lacks clear ownership provenance (for example, a global tool installed independently of alpha-AOS), the preview flags the candidate as `ambiguous` and halts fail-closed:

```text
Error: Ambiguous candidate ownership detected for cua-driver. Supply --resolve-ownership cua-driver=<alpha-aos|external> to proceed.
```

To resolve ownership explicitly:
- Use `alpha-aos` if alpha-AOS should manage and track the installation in local records.
- Use `external` if the tool is managed by the user or host package manager.

```bash
alpha-aos migrate --resolve-ownership cua-driver=alpha-aos,mcp:context7=external
```

### Selective Marker Boundaries

For shared configuration files such as Codex `config.toml`, alpha-AOS confines its management strictly within marker boundaries:

```toml
# alpha-aos:start mcp
[mcp_servers.context7]
command = "npx"
args = ["--yes", "@upstash/context7-mcp@0.3.0"]
# alpha-aos:end mcp
```

User custom server entries or harness settings outside these markers remain completely untouched.

---

## 4. Non-Destructive User Backups and Restoration

### Automatic `.user-backup` Snapshots

Before modifying any configuration file containing user customizations, alpha-AOS generates a timestamped backup:

```text
<config-path>.<timestamp>.user-backup
```

For example:
- `~/.codex/config.toml.20261109120000.user-backup`
- `~/.gemini/config/mcp_config.json.20261109120000.user-backup`

### Health and Hygiene Inspection

Run `alpha-aos doctor` to verify that retained backups are valid, readable, and properly isolated:

```bash
alpha-aos doctor
```

If backups are present, doctor outputs an informational finding:

```text
[info] USER_BACKUP_RETAINED: User backup retained at ~/.codex/config.toml.20261109120000.user-backup (readable)
Next action: Review or archive backup files if migration verification is complete.
```

### Manual Restoration Procedure

If you ever need to restore your pre-migration configuration:
1. Locate the `.user-backup` file in the harness configuration directory.
2. Copy the backup file over the active configuration file:
   ```bash
   cp ~/.codex/config.toml.<timestamp>.user-backup ~/.codex/config.toml
   ```
3. Run `alpha-aos doctor` to re-verify configuration alignment.

---

## 5. The 2-Track Update Model

alpha-AOS v0.8.0 establishes a strict separation between external tool updates and alpha-AOS engine deployment:

```text
Track 1: External Managed Tools                Track 2: alpha-AOS Engine Code
------------------------------------           -----------------------------------
Command: alpha-aos update                      Command: npm run deploy:local (workstation)
Scope:   Cua, GSD, ECC, MCP servers                     npm install -g alpha-aos@latest (global)
Source:  Official package/driver releases       Scope:   CLI dispatch, adapters, formats
```

### Track 1: Updating External Managed Tools

Use `alpha-aos update` to check for and apply updates to external tools:

```bash
# Check for available external tool updates
alpha-aos update --check

# Apply tool updates across all harnesses
alpha-aos update --apply --plan-digest <DIGEST> --reviewed-plan <TOKEN>

# Restrict update to specific tools
alpha-aos update --tool cua-driver --apply --plan-digest <DIGEST> --reviewed-plan <TOKEN>
```

*Note: `alpha-aos update` never modifies the alpha-AOS engine codebase.*

### Track 2: Deploying alpha-AOS Engine Updates

To update alpha-AOS itself:

- **Personal Workstation Development**:
  ```bash
  npm run deploy:local
  ```
  This builds the CLI, verifies startup, and links the local checkout directly.
- **Global Package Deployment**:
  ```bash
  npm install -g alpha-aos@latest
  ```

*Policy Note: All updates are explicit, user-initiated operations; automated external promotion routines are permanently removed.*

---

## 6. Harness-Specific Configuration Notes

### Claude Code
- Configuration file: `~/.claude.json`
- Manages stdio MCP server registrations and user-invocable skill overrides.

### Codex
- Configuration file: `~/.codex/config.toml` (or `$CODEX_HOME/config.toml`)
- Employs `# alpha-aos:start mcp` marker blocks. Custom TOML sections outside markers are preserved.

### Antigravity
- Configuration file: `~/.gemini/config/mcp_config.json`
- Registers MCP servers and owned skills for Antigravity GUI and CLI.

### Pi Agent
- Configuration file: `~/.pi/agent/mcp.json` (or `$PI_CODING_AGENT_DIR/mcp.json`)
- Uses `pi-mcp-adapter` bridge for stdio tool routing with lazy lifecycle.

### Hermes Agent
- Configuration file: `~/.hermes/config.yaml` (or `$HERMES_HOME/config.yaml`)
- YAML configuration with `alpha-aos-task` skill auto-load preservation.
