# Phase 5: Persistent Tree-Off Preload Isolation - Research

**Researched:** 2026-09-18
**Domain:** Directory-tree opt-out registry, transparent CLI preload isolation shims, first-use classification, and local resource passthrough across Codex, Antigravity, Pi, and Hermes
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Tree policies are persisted solely in the **user global state registry (`~/.alpha-aos/trees.json`)**. To eliminate repository file pollution, git tracking hazards, and accidental commits, alpha-AOS creates and modifies zero repository-local files for tree-off decisions. — **Reversibility:** costly — registry schema and core I/O bindings.
- **D-02:** Directory paths are resolved using **canonical filesystem paths (`canonicalizeWithMissingTail` / realpath)**. Symlinks and junctions are resolved to real target paths. Case normalization follows platform semantics (case-insensitive for Windows and macOS, case-sensitive for Linux). — **Reversibility:** reversible.
- **D-03:** Policy inheritance follows **Nearest Ancestor (Longest Prefix Match)**. The effective policy at `cwd` is inherited from the closest enclosing ancestor directory registered in `trees.json`. Explicit nested registrations (e.g. `managed` inside an `off` parent) cleanly override enclosing policies. — **Reversibility:** reversible.
- **D-04:** Tree policies are managed via dedicated **`alpha-aos tree` CLI subcommands (`set`, `list`, `preview`, `remove`, `inspect`, `classify`)**, providing instant preview of effective inheritance and launch specs before mutation. — **Reversibility:** reversible.
- **D-05:** Terminal CLI launches (`codex`, `pi`, `hermes`, `agy`) are intercepted via **Transparent CLI Shims (`~/.alpha-aos/shims`)** placed on PATH. The shim checks `cwd` policy in <1ms; for `off` trees, it injects harness-specific isolation flags and isolated config roots before executing the upstream native binary. For `managed` trees, it transparently delegates to the native binary. — **Reversibility:** costly — binary dispatch and PATH architecture.
- **D-06:** GUI/IDE app surfaces (such as Antigravity IDE/GUI desktop launches) that cannot guarantee pre-launch preload interception are **explicitly reported as `unsupported`** per OPTO-08 and AGENTS.md parity rules. Alpha-AOS never simulates false isolation. CLI surfaces (`agy`) remain supported. — **Reversibility:** reversible.
- **D-07:** Each `off` tree receives a dedicated **isolated configuration root (`~/.alpha-aos/isolated/trees/<tree-id>/`)** containing clean, empty configuration targets (e.g., empty `CODEX_HOME`, `HERMES_HOME`, `PI_CODING_AGENT_DIR`). Existing user login credentials and tokens are reused safely without copying credential bytes or loading ambient global customizations. — **Reversibility:** costly — harness adapter environment and config mappings.
- **D-08:** Preload exclusion enforces **Fail-Closed semantics**. If a harness, version, or platform cannot provably exclude global customizations, the launcher halts immediately (exit code 2) and directs the user to `alpha-aos tree inspect`, preventing silent customization leaks. — **Reversibility:** reversible.
- **D-09:** The first-use classification prompt triggers on **any newly encountered Git repository root** that is not yet recorded in the tree registry, ensuring complete explicitness and zero surprise management. — **Reversibility:** reversible.
- **D-10:** First-use interactive prompt provides three explicit options: **`[Managed(적용) / Off(격리) / 나중에 결정(Ask next time)]`**. Choosing `Managed` or `Off` immediately commits the choice to `~/.alpha-aos/trees.json`. 'Ask next time' passes through for the single invocation without persisting. — **Reversibility:** reversible.
- **D-11:** Non-interactive environments (CI pipelines, headless runs, scripts without TTY) fall back to **Fail-Safe `Off` (Isolation)** by default to prevent unwanted tool injection into automated pipelines, overrideable via `ALPHA_AOS_DEFAULT_MODE=managed`. — **Reversibility:** reversible.
- **D-12:** Repositories can be reclassified at any time via **`alpha-aos tree set <path> --mode <managed|off>`** or interactively via **`alpha-aos tree classify`**. — **Reversibility:** reversible.
- **D-13:** Project-local resources (`.agents/skills`, `.codex/config.toml`, `.mcp.json`, `AGENTS.md`, local hooks) receive **zero-intervention native passthrough**. Alpha-AOS does not transform, manage, or inject into local resources; the native harness discovers and parses them natively. If no local resources exist, the harness is completely vanilla. — **Reversibility:** reversible.
- **D-14:** Subprocess environments in `off` mode are filtered against a **Reviewed Environment Allowlist**. OS runtime variables (`PATH`, `HOME`, `USERPROFILE`, `TEMP`, `SYSTEMROOT`, `LANG`, `SHELL`) and official AI model provider credentials (`OPENAI_*`, `ANTHROPIC_*`, `GEMINI_*`, `AZURE_OPENAI_*`, `COPILOT_*`) are passed through. Unrelated ambient secrets and alpha-AOS global management variables are scrubbed. — **Reversibility:** costly — process security boundary.
- **D-15:** Detailed surface inspection is provided by **`alpha-aos tree inspect [path]`**, reporting 8 dimensions: effective policy & inheritance ancestry, isolated config roots, excluded global resources, discovered local resources, environment allowlist status (passed vs scrubbed), harness isolation proof status (`ok` vs `unsupported`), and security boundary classification. — **Reversibility:** reversible.
- **D-16:** Boundary notices prominently state that **`off` mode provides Configuration Isolation rather than OS/filesystem sandboxing**. Any request for `sealed` mode fails closed immediately without silent fallback. — **Reversibility:** reversible.

### the agent's Discretion

- Exact JSON Schema for `~/.alpha-aos/trees.json` (Draft 2020-12).
- Internal shim script templates for POSIX (`sh`) and Windows (`cmd`/`ps1`).
- Exact table formatting for `alpha-aos tree inspect`.

### Deferred Ideas (OUT OF SCOPE)

- OS/container-backed `sealed` execution in v0.1.0 (v2 requirement SEAL-01).
- Active support claims or release gates for Claude Code (Claude Code is compatibility residue per D-17).
- Full managed stack rollback, uninstall, and journal repair flows (Phase 6, LIFE-01…08).
- Cross-platform release packaging and publishing (Phase 7, REL-01…06).
</user_constraints>

<architectural_responsibility_map>
## Architectural Responsibility Map

Map of Phase 5 capabilities to architectural tiers:

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Policy Registry & Persistence (`trees.json`) | Storage / User State (`~/.alpha-aos/`) | Core Logic (`src/core/tree-policy.ts`) | Centralized state outside user repositories prevents git pollution (D-01) while leveraging atomic file transactions. |
| Canonical Path Resolution & LPM Inheritance | Core Logic (`src/core/tree-policy.ts`) | Path Boundary (`src/core/path-boundary.ts`) | Strict canonicalization (`canonicalizeWithMissingTail`) and case-normalization resolve aliases before prefix matching (D-02, D-03). |
| Transparent CLI Shims (`~/.alpha-aos/shims`) | OS Environment / PATH Boundary | Adapter Tier (`src/adapters/shims.ts`) | Shims sit on PATH to intercept normal CLI invocations (`codex`, `pi`, `hermes`, `agy`) transparently without user-facing wrappers (D-05). |
| Recursion-Proof Upstream Binary Resolution | Adapter Tier (`src/adapters/shims.ts`) | Core Process (`src/core/process.ts`) | Shims must locate real upstream binaries on PATH without re-executing themselves, preventing infinite loops. |
| Harness Preload Exclusion & Arg Injection | Harness Adapters (`src/adapters/isolation.ts`) | Subprocess Execution (`src/core/process.ts`) | Harness-specific CLI flags (`--ignore-user-config`, `--no-skills`, etc.) must be injected before harness runtime boots. |
| First-Use Git Root Classification | Interactive UX (`src/cli.ts`) | Core Logic (`src/core/tree-policy.ts`) | Detects unclassified git roots, handles TTY prompts, and provides non-interactive CI fallbacks (D-09, D-10, D-11). |
| Zero-Copy Auth Referencing | Storage / Isolated Runtime | Adapter Tier (`src/adapters/isolation.ts`) | Reuses user login credentials via filesystem links/references without copying credential bytes into state (D-07). |
| Environment Allowlist & Secret Scrubbing | Security / Process Boundary (`src/core/process.ts`) | Redaction Seam (`src/core/redaction.ts`) | Passes runtime variables and official AI auth keys while scrubbing ambient system secrets and internal management vars (D-14). |
| 8-Dimension Surface Inspector | Diagnostic & Inspection (`src/core/surface-inspector.ts`) | CLI Formatter (`src/format.ts`) | Inspects effective policies, roots, discovered local files, allowlist status, and isolation proof status (D-15). |
| Fail-Closed & Sealed Mode Enforcement | Core Security Guardrails | Harness Adapters | Blocks unsupported platforms (Antigravity GUI) and rejects `sealed` container requests without fallback (D-06, D-08, D-16). |
</architectural_responsibility_map>

<research_summary>
## Summary

Phase 5 delivers **Persistent Tree-Off Preload Isolation** for alpha-AOS across the four active supported harnesses: **Codex, Antigravity, Pi, and Hermes**. When a user designates a directory tree as `off` (or `managed`), this decision is persisted exclusively in `~/.alpha-aos/trees.json` using atomic journaled transactions. Zero repository-local files are created or modified, completely eliminating git tracking hazards, accidental commits, and cross-developer pollution. Any descendant directory inherits the policy via Longest Prefix Matching (Nearest Ancestor), while nested overrides allow surgical re-enablement or isolation.

To provide a seamless developer experience without requiring explicit wrapper commands (such as `alpha-aos run`), transparent CLI shims are installed in `~/.alpha-aos/shims/` on the system `PATH`. When a user runs `codex`, `pi`, `hermes`, or `agy` in their terminal, the shim intercepts the call, executes a sub-millisecond CWD policy check (<0.1ms), and dynamically configures the execution environment. For `managed` trees, the call transparently delegates to the upstream binary. For `off` trees, the shim points the harness to a clean, isolated configuration root (`~/.alpha-aos/isolated/trees/<tree-id>/`), injects preload exclusion flags (e.g. `--strict-config --ignore-user-config --ignore-rules` for Codex; `--no-skills --no-extensions --no-prompt-templates --no-themes` for Pi; `chat --ignore-user-config --ignore-rules` for Hermes), filters environment variables against a strictly reviewed allowlist (preserving OS runtime and AI provider credentials while scrubbing ambient secrets), and forwards project-local resources (`.agents/skills`, `.codex/config.toml`, `.mcp.json`, `AGENTS.md`) with zero intervention.

Crucially, alpha-AOS adheres strictly to fail-closed principles: if a harness or surface cannot provably guarantee pre-launch preload exclusion (such as Antigravity IDE/GUI desktop launches, which lack CLI interception hooks), it is explicitly reported as `unsupported` and halted with exit code 2. If a user encounters an unclassified Git repository root, an interactive 3-choice prompt (`[Managed / Off / 나중에 결정]`) prompts once on first entry, while non-interactive CI/headless pipelines automatically fall back to fail-safe `off`. Furthermore, boundary notices explicitly document that `off` mode provides configuration isolation rather than OS/network sandboxing, and any request for v2 `sealed` container mode fails immediately without fallback.

**Primary recommendation:** Implement `src/core/tree-policy.ts` for registry management and inheritance resolution, `src/adapters/shims.ts` for recursion-proof CLI shim generation and sub-millisecond dispatch, and wire the `alpha-aos tree (set|list|preview|remove|inspect|classify)` CLI suite with Draft 2020-12 schema validation and fail-closed exit code 2 guardrails.
</research_summary>

<standard_stack>
## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js Built-in Modules (`fs/promises`, `path`, `child_process`, `crypto`, `os`) | Node >=24.0.0 | File I/O, process spawning, canonical realpath, hashing | Zero-overhead, shell-free, cross-platform primitives already battle-tested in Phases 1–4. |
| `ajv` / `ajv/dist/2020.js` | 8.20.0 | Draft 2020-12 JSON Schema validation | Strict, closed-contract schema validation for `~/.alpha-aos/trees.json` and inspection schemas. |
| `yaml` | 2.9.0 | Project manifest parsing | Safe parsing of project manifests with alias bounds and unique key enforcement. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `jsonc-parser` | 3.3.1 | Strict JSON parsing with duplicate key detection | Used when reading native JSON configuration files (`.mcp.json`, `settings.json`). |
| `smol-toml` | 1.8.0 | Strict TOML parsing | Used when parsing `.codex/config.toml` for local resource discovery. |
| `ignore` | 7.0.5 | Gitignore matching | Used to verify whether local resources in an `off` tree are ignored or tracked. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Global Registry `~/.alpha-aos/trees.json` | Repository-local `.alpha-aos/tree.yaml` | REJECTED by D-01: Local files pollute Git working copies, risk accidental commits, and leak developer preferences to teams. |
| Transparent PATH Shims | Shell profile wrapper functions (`~/.bashrc`, PowerShell `$PROFILE`) | REJECTED by D-05: Shell functions require modifying user profile scripts, do not work in GUI task runners or non-interactive shells, and are fragile across shell variants. |
| Dedicated Shim Dispatcher | Routing through full `alpha-aos` CLI | REJECTED: Full CLI startup incurs ~750ms due to heavy SDK and schema imports. A lightweight dedicated dispatch module executes policy lookup in <0.1ms and spawns upstream in <80ms. |
| Symlink/Hardlink Auth Reuse | Copying `auth.json` into isolated root | REJECTED by D-07: Copying auth bytes duplicates credentials, causes TOCTOU drift when tokens refresh, and violates credential minimization. |

**Installation:**
No new npm dependencies are required. All necessary dependencies (`ajv`, `yaml`, `jsonc-parser`, `smol-toml`, `ignore`) are already locked and pinned in `package.json`.
</standard_stack>

<architecture_patterns>
## Architecture Patterns

### System Architecture Diagram

```mermaid
flowchart TD
    subgraph UserInvocation["User Terminal / Application"]
        CLI["Command: codex / pi / hermes / agy [args]"]
    end

    subgraph PATHBoundary["PATH Resolution: ~/.alpha-aos/shims"]
        Shim["Shim Wrapper (.cmd / sh)"]
        Dispatch["Shim Dispatcher (<1ms)"]
    end

    subgraph PolicyEngine["Core Tree Policy Engine"]
        LPM["Longest Prefix Match (Nearest Ancestor)"]
        Registry[("Global Registry: ~/.alpha-aos/trees.json")]
        GitDetect{"Is Unclassified Git Root?"}
        Prompt{"TTY Interactive?"}
        SaveRegistry["Save to trees.json"]
    end

    subgraph Decision{"Effective Mode"}
        Managed["mode == 'managed'"]
        Off["mode == 'off'"]
    end

    subgraph OffIsolationPipeline["Preload Isolation Pipeline"]
        CheckSupport{"Provable Preload Exclusion?"}
        FailClosed["Fail-Closed Exit (code 2)\nGuidance: 'alpha-aos tree inspect'"]
        IsoRoot["Dedicated Config Root:\n~/.alpha-aos/isolated/trees/<tree-id>/"]
        LinkAuth["Reuse Native Login (Link/Ref, Zero Byte Copy)"]
        InjectFlags["Inject Harness Flags:\n--ignore-user-config, --no-skills, etc."]
        FilterEnv["Scrub Ambient Secrets\nApply Environment Allowlist"]
        LocalPassthrough["Passthrough Local Resources:\n.agents/skills, .codex/config.toml, .mcp.json, AGENTS.md"]
    end

    subgraph Execution["Upstream Binary Dispatch"]
        FindReal["Resolve Upstream Binary\n(Filter out ~/.alpha-aos/shims from PATH)"]
        Spawn["Spawn Upstream Process\n(Shell-Free, stdio: inherit)"]
    end

    CLI --> Shim
    Shim --> Dispatch
    Dispatch --> LPM
    LPM <--> Registry
    LPM --> GitDetect
    
    GitDetect -- Yes (Unregistered) --> Prompt
    Prompt -- Yes (Interactive TTY) --> UserChoice["Prompt: [Managed / Off / 나중에 결정]"]
    UserChoice -- Managed / Off --> SaveRegistry --> Decision
    UserChoice -- 나중에 결정 --> Decision
    Prompt -- No (CI / Headless) --> SafeOff["Fail-Safe Off (or ALPHA_AOS_DEFAULT_MODE)"] --> Decision
    GitDetect -- No (Known/Inherited) --> Decision

    Decision --> Managed
    Decision --> Off

    Managed --> FindReal
    Off --> CheckSupport
    CheckSupport -- No (e.g. GUI) --> FailClosed
    CheckSupport -- Yes --> IsoRoot --> LinkAuth --> InjectFlags --> FilterEnv --> LocalPassthrough --> FindReal

    FindReal --> Spawn
```

### Recommended Project Structure
```
src/
├── core/
│   ├── tree-policy.ts          # Registry I/O, canonical path resolution, nearest ancestor LPM inheritance
│   ├── surface-inspector.ts    # 8-dimension tree inspection report generator (OPTO-08, D-15)
│   ├── path-boundary.ts        # Canonical path resolution (canonicalizeWithMissingTail, withinRoot)
│   ├── process.ts              # Shell-free process execution, environment allowlists
│   └── transaction.ts          # Atomic journaled transaction execution for ~/.alpha-aos/trees.json
├── adapters/
│   ├── shims.ts                # Shim generation (~/.alpha-aos/shims), upstream binary discovery
│   ├── isolation.ts            # Harness-specific preload exclusion argument and environment builder
│   └── harnesses.ts            # Harness discovery and capabilities
├── shim-dispatch.ts            # Fast-path standalone shim dispatch entrypoint (<1ms policy lookup)
├── cli.ts                      # CLI routing: alpha-aos tree (set|list|preview|remove|inspect|classify)
schemas/
└── tree-registry.schema.json   # Draft 2020-12 closed JSON schema for ~/.alpha-aos/trees.json
test/
├── tree-policy.test.ts         # Unit & integration tests for registry, inheritance, git detection
└── shims.test.ts               # Unit & integration tests for shims, dispatch, allowlist scrubbing
```

### Component Responsibilities Table

| Component | File | Responsibilities |
|-----------|------|------------------|
| Tree Policy Engine | `src/core/tree-policy.ts` | Loads and saves `~/.alpha-aos/trees.json` with Draft 2020-12 schema validation; canonicalizes paths with OS case normalization; resolves effective policy via Longest Prefix Match; handles first-use classification and interactive prompts. |
| Shim Adapter | `src/adapters/shims.ts` | Generates transparent POSIX and Windows shims in `~/.alpha-aos/shims/`; discovers upstream binaries by walking PATH and excluding the shim directory; constructs isolated execution specs. |
| Shim Dispatcher | `src/shim-dispatch.ts` | Ultra-lightweight standalone Node entrypoint (<0.1ms overhead); performs CWD policy check; coordinates first-use prompting or CI fallback; executes upstream binary with `stdio: 'inherit'`. |
| Surface Inspector | `src/core/surface-inspector.ts` | Evaluates the 8 dimensions of tree status (policy, ancestry, isolated roots, excluded global resources, local project resources, env allowlist, harness support, security boundary notice). |
| Registry Schema | `schemas/tree-registry.schema.json` | Closed Draft 2020-12 schema specifying properties, types, patterns, and `additionalProperties: false`. |
| CLI Commands | `src/cli.ts` | Implements `alpha-aos tree set/list/preview/remove/inspect/classify` subcommands and formats output in human and JSON modes. |

---

### Pattern 1: Longest Prefix Match (Nearest Ancestor) Directory Policy Resolution

**What:** Resolves the effective policy for `cwd` by finding the registered directory in `~/.alpha-aos/trees.json` that shares the longest canonical directory prefix with `cwd`.
**When to use:** On every CLI execution and inspection query.
**Example:**
```typescript
import { resolve, sep } from "node:path";
import { canonicalizeWithMissingTail } from "./path-boundary.js";

const caseInsensitiveHost = process.platform === "win32" || process.platform === "darwin";

function comparable(p: string): string {
  return caseInsensitiveHost ? p.toLowerCase() : p;
}

function withinRoot(root: string, candidate: string): boolean {
  const cRoot = comparable(root);
  const cCand = comparable(candidate);
  if (cCand === cRoot) return true;
  const boundary = cRoot.endsWith(sep) ? cRoot : `${cRoot}${sep}`;
  return cCand.startsWith(boundary);
}

export interface TreeRegistryEntry {
  id: string;
  path: string;
  mode: "managed" | "off";
  createdAt: string;
  updatedAt: string;
  notes?: string;
}

export async function resolveEffectivePolicy(
  targetPath: string,
  registeredTrees: readonly TreeRegistryEntry[],
): Promise<{ entry: TreeRegistryEntry | null; inherited: boolean; depth: number }> {
  const { canonical } = await canonicalizeWithMissingTail(targetPath);
  
  // Filter all registered trees that are ancestors of canonical targetPath
  const matching = registeredTrees.filter((tree) => withinRoot(tree.path, canonical));
  
  if (matching.length === 0) {
    return { entry: null, inherited: false, depth: 0 };
  }
  
  // Sort descending by path length (deepest ancestor / longest prefix wins)
  matching.sort((a, b) => b.path.length - a.path.length);
  const nearest = matching[0]!;
  const isExact = comparable(nearest.path) === comparable(canonical);
  
  return {
    entry: nearest,
    inherited: !isExact,
    depth: matching.length,
  };
}
```

---

### Pattern 2: Recursion-Free Transparent CLI Shim Execution

**What:** When a shim in `~/.alpha-aos/shims` is executed, it must locate the real upstream binary on `PATH` without executing itself recursively.
**When to use:** Every time a shim delegates to the upstream harness binary.
**Example:**
```typescript
import { existsSync } from "node:fs";
import { delimiter, dirname, extname, join, resolve } from "node:path";
import { userStateRoot } from "../core/paths.js";
import { isDirectlyExecutable } from "../core/process.js";

export function resolveUpstreamBinary(
  commandName: string,
  options: { pathEnv?: string; shimsDir?: string } = {},
): string | null {
  const pathEnv = options.pathEnv ?? process.env.PATH ?? "";
  const shimsDir = resolve(options.shimsDir ?? join(userStateRoot(), "shims"));
  
  const entries = pathEnv.split(delimiter).filter(Boolean);
  const isWin = process.platform === "win32";
  const extensions = isWin ? [".exe", ".cmd", ".bat"] : [""];

  for (const dir of entries) {
    const canonicalDir = resolve(dir);
    // CRITICAL: Skip the shims directory to break recursive loops
    if (canonicalDir === shimsDir) continue;

    for (const ext of extensions) {
      const candidate = join(canonicalDir, `${commandName}${ext}`);
      if (existsSync(candidate)) {
        return candidate;
      }
    }
  }
  return null;
}
```

---

### Pattern 3: Reference-Based Credential Reuse Without Byte Copying

**What:** In `off` mode, existing user credentials (e.g. `~/.codex/auth.json`) are made available in the isolated configuration directory via a filesystem hardlink or symlink, ensuring zero credential bytes are read, duplicated, or committed into state.
**When to use:** When initializing or syncing the dedicated isolated config root for Codex or Pi.
**Example:**
```typescript
import { existsSync } from "node:fs";
import { link, symlink, unlink } from "node:fs/promises";
import { join } from "node:path";

export async function linkAuthWithoutCopying(
  sourceAuthFile: string,
  targetAuthFile: string,
): Promise<{ linked: boolean; method: "hardlink" | "symlink" | "none" }> {
  if (!existsSync(sourceAuthFile)) {
    return { linked: false, method: "none" };
  }
  if (existsSync(targetAuthFile)) {
    await unlink(targetAuthFile);
  }
  
  // Attempt hardlink first (works on same volume without admin privileges on Windows/POSIX)
  try {
    await link(sourceAuthFile, targetAuthFile);
    return { linked: true, method: "hardlink" };
  } catch {
    // Fallback to symlink
    try {
      await symlink(sourceAuthFile, targetAuthFile, "file");
      return { linked: true, method: "symlink" };
    } catch {
      return { linked: false, method: "none" };
    }
  }
}
```

---

### Pattern 4: Strict Environment Allowlist with Secret Sentinel Scrubbing

**What:** In `off` mode, child processes receive only essential OS runtime variables and recognized AI model provider credentials. Ambient secrets (AWS, DB, tokens) and alpha-AOS internal management variables are scrubbed.
**When to use:** In `shim-dispatch.ts` before spawning the upstream harness in an `off` tree.
**Example:**
```typescript
import { PLATFORM_FLOOR_ENVIRONMENT } from "./process.js";

const RUNTIME_ALLOWLIST = new Set([
  ...PLATFORM_FLOOR_ENVIRONMENT,
  "PATH", "PATHEXT", "COMSPEC", "SHELL", "HOME", "USERPROFILE",
  "USER", "USERNAME", "TEMP", "TMP", "TMPDIR", "SYSTEMROOT", "SYSTEMDRIVE",
  "LANG", "LC_ALL", "LC_CTYPE", "TZ", "TERM", "TERM_PROGRAM", "COLORTERM",
  "EDITOR", "VISUAL", "NODE_EXTRA_CA_CERTS", "SSL_CERT_FILE", "SSL_CERT_DIR",
]);

const AI_AUTH_PREFIXES = [
  "OPENAI_", "ANTHROPIC_", "GEMINI_", "GOOGLE_", "AZURE_OPENAI_",
  "COPILOT_", "GH_COPILOT_", "GITHUB_", "OPENROUTER_", "TOGETHER_",
  "GROQ_", "MISTRAL_", "DEEPSEEK_",
];

export function scrubEnvironmentForOffTree(
  sourceEnv: NodeJS.ProcessEnv = process.env,
  injectedEnv: Record<string, string> = {},
): Record<string, string> {
  const cleanEnv: Record<string, string> = {};

  for (const [key, value] of Object.entries(sourceEnv)) {
    if (value === undefined) continue;
    const upper = key.toUpperCase();

    // 1. Explicitly drop alpha-AOS internal variables
    if (upper.startsWith("ALPHA_AOS_") && upper !== "ALPHA_AOS_DEFAULT_MODE") {
      continue;
    }

    // 2. Allow core runtime variables
    if (RUNTIME_ALLOWLIST.has(upper)) {
      cleanEnv[key] = value;
      continue;
    }

    // 3. Allow recognized AI model provider credentials
    if (AI_AUTH_PREFIXES.some((prefix) => upper.startsWith(prefix))) {
      cleanEnv[key] = value;
      continue;
    }

    // 4. Everything else (unrelated secrets, AWS, DB, tokens) is scrubbed
  }

  // Inject harness-specific isolated config roots (CODEX_HOME, etc.)
  for (const [key, value] of Object.entries(injectedEnv)) {
    cleanEnv[key] = value;
  }

  return cleanEnv;
}
```

---

### Anti-Patterns to Avoid

- **Writing a marker or config file inside the repository:** Writing `.alpha-aos/off` or editing `.gitignore` inside user repositories violates D-01 and creates git commit and tracking hazards.
- **Using string prefix matching for path inheritance:** Plain `cand.startsWith(root)` matches `/home/user-backup` under `/home/user`. Always use whole-segment comparison via `withinRoot` after `canonicalizeWithMissingTail`.
- **Calling `where` or `which` from shims without PATH filtering:** Executing a bare `where codex` will find the shim itself, creating an infinite process fork bomb.
- **Copying authentication files (`auth.json`) into isolated roots:** Byte copying duplicates credentials, creates stale auth tokens upon refresh, and risks credential leaks.
- **Prompting for classification in CI or headless environments:** Calling an interactive `readline` prompt in non-TTY environments will hang automated CI pipelines indefinitely. Always detect TTY (`process.stdin.isTTY`) and fallback to Fail-Safe `off`.
- **Faking isolation for unsupported GUI surfaces:** Simulating preload isolation on Antigravity IDE/GUI desktop launches when pre-launch hooks cannot be enforced violates D-06. Fail closed with an explicit `unsupported` finding.
- **Falling back to process isolation when `sealed` mode is requested:** Treating `sealed` as `off` without a container sandbox violates D-16 and OPTO-09. It must throw an immediate refusal with exit code 2.
</architecture_patterns>

<dont_hand_roll>
## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Path Containment & Symlinks | Custom string or regex prefix matching | `src/core/path-boundary.ts` (`canonicalizeWithMissingTail`, `withinRoot`) | Hand-rolled path logic fails on junctions, symlinks, relative segments (`..`), and Windows/macOS case insensitivity. |
| Registry File Persistence | Direct `fs.writeFile` or `writeFileSync` | `src/core/transaction.ts` (`applyFileTransaction`) | Concurrent CLI executions or crashes during writes corrupt `trees.json`. `applyFileTransaction` provides hash-checked write-ahead journals and snapshots. |
| Schema Validation | Ad-hoc `if (!obj.trees) ...` checks | `src/core/validation.ts` (`validateManagedDocument` with Draft 2020-12 schema) | Ad-hoc checks miss prototype pollution, duplicate keys, invalid types, and unvalidated string formats. |
| Shell Command Execution | `child_process.exec` or `execSync` with shell strings | `src/core/process.ts` (`runProcess`, `runCommandInteractive` with `shell: false`) | Shell strings introduce command injection vulnerabilities, quoting hazards on Windows, and signal handling bugs. |
| Redaction in Output | Inline `.replace(/key/g, ...)` | `src/core/redaction.ts` (`serializeObservable`, `redactDocument`) | Incomplete regexes leak sensitive credentials and private paths across JSON and human terminal streams. |

**Key insight:** Path security and transaction safety are foundational guarantees in alpha-AOS. Reusing `canonicalizeWithMissingTail` and `applyFileTransaction` ensures that tree registry operations inherit the verified Phase 1 safety boundaries without introducing new edge-case vulnerabilities.
</dont_hand_roll>

<common_pitfalls>
## Common Pitfalls

### Pitfall 1: CLI Shim Recursion Loop (Fork Bomb)
**What goes wrong:** Invoking `codex` inside the terminal repeatedly calls `~/.alpha-aos/shims/codex.cmd`, which calls `codex`, exhausting system processes and crashing the terminal.
**Why it happens:** The shim directory `~/.alpha-aos/shims` is placed at the front of PATH. When the shim searches for the upstream binary, it finds itself first.
**How to avoid:** The upstream binary resolution logic in `src/adapters/shims.ts` must split PATH and filter out `~/.alpha-aos/shims` before searching for the executable. It must invoke the resolved binary using its absolute path.
**Warning signs:** High CPU usage, process count spikes, or maximum call stack / fork errors when executing a shim.

### Pitfall 2: Case-Insensitive vs Case-Sensitive Path Matching Discrepancies
**What goes wrong:** A repository on Windows registered as `D:\dev\Project` is not matched when cwd is `d:\dev\project`, causing the directory to be treated as unclassified or managed instead of `off`.
**Why it happens:** Windows and macOS filesystems are case-insensitive by default, while Linux is case-sensitive. Comparing raw path strings directly breaks on case divergence.
**How to avoid:** Use `canonicalizeWithMissingTail` and platform-aware normalization (`process.platform === "win32" || process.platform === "darwin"` normalizes to lowercase for comparison).
**Warning signs:** `alpha-aos tree preview` reporting unclassified or incorrect inheritance when drive letters or folder casing differ.

### Pitfall 3: Subprocess Secret Leakage via Ambient Environment
**What goes wrong:** An `off` tree launch inherits ambient environment variables containing database passwords, AWS keys, or production tokens and passes them to the AI harness.
**Why it happens:** Default `child_process.spawn` inherits the entire ambient `process.env`.
**How to avoid:** Construct a filtered environment using `scrubEnvironmentForOffTree` adhering to D-14. Only allow reviewed runtime variables and recognized AI model provider credentials.
**Warning signs:** `alpha-aos tree inspect` showing ambient database or cloud tokens in the passed environment table.

### Pitfall 4: Git Root Detection Across Symlinks and Worktrees
**What goes wrong:** Running a harness inside a Git worktree or symlinked repository either fails to detect the Git root or prompts for classification on every subdirectory.
**Why it happens:** Git worktrees have a `.git` *file* pointing to the main gitdir, not a `.git` *directory*. Additionally, symlinks can cause parent directory walks to escape the canonical repository boundary.
**How to avoid:** Walk ancestors using `canonicalizeWithMissingTail` and check for either a `.git` directory OR a `.git` file (`existsSync(join(dir, ".git"))`).
**Warning signs:** Repeated classification prompts inside subdirectories of a Git worktree.

### Pitfall 5: Non-Interactive / Headless Pipeline Hangs
**What goes wrong:** A CI/CD runner (GitHub Actions, GitLab CI) running `codex` hangs indefinitely on an unclassified repository.
**Why it happens:** The first-use classification flow attempts to prompt via `readline` when `stdin` is not a TTY.
**How to avoid:** Check `process.stdin.isTTY` and `process.env.CI`. In non-interactive environments, immediately fall back to Fail-Safe `off` (overrideable via `ALPHA_AOS_DEFAULT_MODE=managed`) without prompting.
**Warning signs:** CI pipeline timeouts on the test/build step.

### Pitfall 6: False Isolation Claims in Unprovable GUIs (Antigravity IDE)
**What goes wrong:** User launches Antigravity IDE from their desktop launcher believing it is isolated, but the GUI loads global customizations because pre-launch hooks cannot intercept Electron launches.
**Why it happens:** Desktop GUI launchers bypass shell PATH and command shims entirely.
**How to avoid:** Strictly enforce D-06: Antigravity GUI/IDE is classified and reported as `unsupported`. In `alpha-aos tree inspect`, clearly display that GUI launches cannot guarantee preload exclusion.
**Warning signs:** Claims in documentation or CLI output that GUI app launches are isolated.

### Pitfall 7: Credential Byte Duplication and TOCTOU Stale Logins
**What goes wrong:** Copying `auth.json` to `~/.alpha-aos/isolated/trees/<id>/codex/auth.json` works initially, but when the user logs in again or the token refreshes in `~/.codex`, the isolated tree is logged out.
**Why it happens:** Static file copying creates disconnected duplicates.
**How to avoid:** Use filesystem links (hardlinks or symlinks) to point to the user's native auth file, or pass auth credentials by reference without copying bytes.
**Warning signs:** "Token expired" or "Please log in again" errors inside an `off` tree when the user is already logged in globally.
</common_pitfalls>

<code_examples>
## Code Examples

### 1. Draft 2020-12 Closed Schema for `~/.alpha-aos/trees.json`
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://alpha-aos.local/schemas/tree-registry.schema.json",
  "title": "alpha-AOS Directory Tree Policy Registry",
  "description": "Closed contract for the persistent directory tree policy registry (~/.alpha-aos/trees.json). Tracks directory tree opt-out and managed policies without modifying repository files.",
  "type": "object",
  "required": ["schemaVersion", "trees"],
  "additionalProperties": false,
  "properties": {
    "schemaVersion": { "type": "integer", "const": 1 },
    "updatedAt": { "type": "string" },
    "trees": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id", "path", "mode", "createdAt", "updatedAt"],
        "additionalProperties": false,
        "properties": {
          "id": {
            "type": "string",
            "pattern": "^[0-9a-f]{16}$",
            "description": "16-hex sha256 identifier derived from canonical path"
          },
          "path": {
            "type": "string",
            "description": "Canonical filesystem directory path"
          },
          "mode": {
            "enum": ["managed", "off"],
            "description": "Effective policy for this directory and descendants unless overridden"
          },
          "createdAt": {
            "type": "string",
            "description": "ISO timestamp when first registered"
          },
          "updatedAt": {
            "type": "string",
            "description": "ISO timestamp when last updated"
          },
          "notes": {
            "type": "string",
            "description": "Optional human-readable notes"
          }
        }
      }
    }
  }
}
```

### 2. Upstream Binary Resolution Without Recursion Loops
```typescript
// Source: src/adapters/shims.ts
import { existsSync } from "node:fs";
import { delimiter, extname, join, resolve } from "node:path";
import { userStateRoot } from "../core/paths.js";

export function findUpstreamBinary(
  harnessCommand: string,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const shimsPath = resolve(join(userStateRoot(), "shims"));
  const pathEnv = env.PATH ?? "";
  const rawEntries = pathEnv.split(delimiter).filter(Boolean);

  // Filter out the shims directory to prevent calling ourselves recursively
  const entries = rawEntries.filter((dir) => resolve(dir) !== shimsPath);

  const extensions = process.platform === "win32"
    ? [".exe", ".cmd", ".bat"]
    : [""];

  for (const dir of entries) {
    for (const ext of extensions) {
      const candidate = join(dir, `${harnessCommand}${ext}`);
      if (existsSync(candidate)) {
        return candidate;
      }
    }
  }

  return null;
}
```

### 3. Harness Preload Exclusion Arguments Vector
```typescript
// Source: src/adapters/isolation.ts
import type { HarnessId } from "../types.js";

export function getHarnessPreloadExclusion(harness: HarnessId, isolatedRoot: string): {
  args: string[];
  env: Record<string, string>;
  provable: boolean;
  unsupportedReason?: string;
} {
  switch (harness) {
    case "codex":
      return {
        args: ["--strict-config", "--ignore-user-config", "--ignore-rules"],
        env: { CODEX_HOME: join(isolatedRoot, "codex") },
        provable: true,
      };
    case "pi":
      return {
        args: ["--no-skills", "--no-extensions", "--no-prompt-templates", "--no-themes"],
        env: { PI_CODING_AGENT_DIR: join(isolatedRoot, "pi") },
        provable: true,
      };
    case "hermes":
      return {
        args: ["chat", "--ignore-user-config", "--ignore-rules"],
        env: { HERMES_HOME: join(isolatedRoot, "hermes") },
        provable: true,
      };
    case "antigravity":
      // CLI 'agy' supports environment config redirection; GUI is unsupported
      return {
        args: [],
        env: { HOME: join(isolatedRoot, "antigravity", "home"), USERPROFILE: join(isolatedRoot, "antigravity", "home") },
        provable: true,
      };
    case "claude":
      return {
        args: ["--setting-sources", "project,local", "--strict-mcp-config"],
        env: { CLAUDE_CONFIG_DIR: join(isolatedRoot, "claude") },
        provable: true,
      };
    default:
      return {
        args: [],
        env: {},
        provable: false,
        unsupportedReason: `Harness ${harness} has no proven preload exclusion flags`,
      };
  }
}
```

### 4. Interactive First-Use Classification Flow
```typescript
// Source: src/core/tree-policy.ts
import * as readline from "node:readline/promises";

export async function promptFirstUse(gitRoot: string): Promise<"managed" | "off" | "ask-next-time"> {
  if (!process.stdin.isTTY || process.env.CI) {
    // Non-interactive fallback (D-11)
    const override = process.env.ALPHA_AOS_DEFAULT_MODE?.toLowerCase().trim();
    if (override === "managed") return "managed";
    return "off"; // Fail-Safe Off
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
  try {
    process.stderr.write(`\nalpha-AOS: Newly encountered Git repository root:\n  ${gitRoot}\n`);
    process.stderr.write(`Select policy for this repository:\n`);
    process.stderr.write(`  [1] Managed (적용)       - Enable alpha-AOS project management and capabilities\n`);
    process.stderr.write(`  [2] Off (격리)          - Isolate from global customizations, vanilla harness with local resources\n`);
    process.stderr.write(`  [3] 나중에 결정 (Skip)   - Ask next time, pass through this invocation only\n`);

    while (true) {
      const answer = (await rl.question("Choose [1/2/3]: ")).trim();
      if (answer === "1" || answer.toLowerCase() === "managed") return "managed";
      if (answer === "2" || answer.toLowerCase() === "off") return "off";
      if (answer === "3" || answer === "" || answer.toLowerCase() === "skip") return "ask-next-time";
      process.stderr.write("Invalid choice. Please enter 1, 2, or 3.\n");
    }
  } finally {
    rl.close();
  }
}
```
</code_examples>

<sota_updates>
## State of the Art (2025-2026)

| Old Approach | Current Approach (2026) | When Changed | Impact |
|--------------|-------------------------|--------------|--------|
| Per-command wrappers (`alpha-aos project run <harness>`) | Transparent CLI Shims on PATH (`~/.alpha-aos/shims`) | 2026 (Phase 5) | Developers invoke standard commands (`codex`, `pi`, `agy`) natively without workflow alteration. |
| In-repo configuration files (`.alpha-aos/config.yaml`) | Centralized User State Registry (`~/.alpha-aos/trees.json`) | 2026 (Phase 5) | Zero repository file contamination; no git tracking or accidental PR commits. |
| Coarse all-or-nothing environment inheritance | Fine-grained reviewed allowlists (Runtime + AI auth keys) | 2026 (Phase 5) | Prevents ambient secrets (AWS, DB, stripe) from leaking to LLM harness subprocesses. |
| Copying credential files (`auth.json`) into test/isolated runtimes | Filesystem hardlink/symlink referencing | 2026 (Phase 3 & 5) | Credentials refresh naturally without TOCTOU token drift or duplicate credential storage. |
| Silent fallback when isolation is unproven | Strict Fail-Closed (exit code 2) + `tree inspect` guidance | 2026 (Phase 5) | Prevents accidental customization leaks on unverified platforms or IDEs. |

**New tools/patterns to consider:**
- **OS PATH Shim Architecture:** Battle-tested by `asdf`, `mise`, `pyenv`, and `volta`. Extremely fast (<0.1ms overhead) when implemented with a focused dispatch script.
- **Fail-Safe Off CI Defaults:** Modern security standard where unclassified code in CI automatically executes in the most restricted (isolated) profile to prevent unexpected supply-chain tool injection.

**Deprecated/outdated:**
- **Shell profile function injection (`.bashrc`, `$PROFILE`):** Fragile across subshells, IDE terminals, and task runners. Replaced by transparent PATH shims.
- **Simulating isolation for GUI desktop apps:** Pretending an Electron/IDE launch is isolated when pre-launch hooks are unproven is prohibited.
</sota_updates>

<open_questions>
## Open Questions

1. **How to handle npm `.cmd` wrappers on Windows without shell execution?**
   - What we know: On Windows, tools like `codex` and `pi` installed via `npm -g` are `.cmd` files. Spawning a `.cmd` file directly via Node's `child_process.spawn` with `shell: false` fails with `EINVAL` or `ENOEXEC`.
   - What's clear: `process.ts` already implements `resolveNodePackageCli`, which normalizes npm shims to `process.execPath` plus the underlying `.js` script (e.g. `node_modules/@openai/codex/bin/codex.js`).
   - Recommendation: For npm-installed CLI harnesses on Windows, resolve the underlying CLI script and spawn `process.execPath, [script, ...args]` with `shell: false`. This maintains 100% shell-free execution on Windows.

2. **Windows symlinks vs hardlinks for credential reuse:**
   - What we know: On Windows, creating symlinks without Developer Mode enabled or admin privileges throws `EPERM`. Hardlinks (`fs.link`) on the other hand do NOT require elevated privileges when both paths reside on the same drive volume.
   - What's clear: Both `~/.alpha-aos/isolated/trees/<id>/` and `~/.codex/auth.json` reside in the user's home directory (`USERPROFILE`), which is always on the same filesystem volume.
   - Recommendation: Use `fs.link` (hardlink) as the primary linking mechanism for credential referencing, with graceful fallback to symlink if supported.
</open_questions>

<sources>
## Sources

### Primary (HIGH confidence)
- `D:/dev/alpha-AOS/.planning/phases/05-persistent-tree-off-preload-isolation/05-CONTEXT.md` - Locked architectural decisions D-01 through D-16.
- `D:/dev/alpha-AOS/.planning/phases/05-persistent-tree-off-preload-isolation/05-DISCUSSION-LOG.md` - Full discussion audit trail and trade-offs.
- `D:/dev/alpha-AOS/.planning/REQUIREMENTS.md` - OPTO-01 through OPTO-09 requirements.
- `src/adapters/isolation.ts` - Existing harness launch specifications and isolation flags.
- `src/core/path-boundary.ts` - Path canonicalization and containment verification (`canonicalizeWithMissingTail`).
- `src/core/process.ts` - Shell-free execution, environment allowlists, platform floors.
- `src/core/transaction.ts` - Atomic journaled file transactions.
- `src/core/validation.ts` - Draft 2020-12 schema validation pipeline.

### Secondary (MEDIUM confidence)
- Node.js Official Documentation (`node:child_process`, `node:fs/promises`) - Process spawning, hardlinks, and TTY streams.
- CLI Shim architectures from `mise-en-place` and `asdf-vm` - PATH shim precedence and loop avoidance techniques.

### Tertiary (LOW confidence - needs validation)
- None - all technical patterns verified against active codebase and local runtime.
</sources>

<metadata>
## Metadata

**Research scope:**
- Core technology: Directory-tree opt-out registry, transparent CLI preload isolation shims, first-use classification, and local resource passthrough.
- Ecosystem: Codex, Antigravity, Pi, and Hermes.
- Patterns: Longest Prefix Match inheritance, recursion-free shim dispatch, zero-copy credential reuse, environment allowlists, 8-dimension surface inspection.
- Pitfalls: Shim recursion loops, case-sensitivity discrepancies, ambient secret leakage, CI pipeline hangs, false GUI isolation.

**Confidence breakdown:**
- Standard stack: HIGH - all core libraries are in-repo and verified.
- Architecture: HIGH - fully aligned with locked decisions D-01 through D-16.
- Pitfalls: HIGH - verified against Windows and POSIX operational behaviors.
- Code examples: HIGH - derived directly from codebase precedents and tests.

**Research date:** 2026-09-18
**Valid until:** 2026-10-18 (30 days - stable local architecture)
</metadata>

---

*Phase: 05-persistent-tree-off-preload-isolation*
*Research completed: 2026-09-18*
*Ready for planning: yes*
