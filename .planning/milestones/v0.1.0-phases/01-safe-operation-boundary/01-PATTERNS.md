# Phase 1: Safe Operation Boundary - Pattern Map

**Mapped:** 2026-09-03
**Files analyzed:** 51개 생성/수정 후보
**Primary analogs:** 5개 tracked pattern family
**Scope:** SAFE-01~SAFE-06의 기존 구현 gap closure. transaction/snapshot/hash journal/rollback/CLI fixture/adapter 기반은 보존한다.

## File Classification

아래의 기존 파일은 모두 `git ls-files`로 추적 여부를 확인했다. 새 파일의 analog도 오직 tracked source를 가리킨다. 기존 파일의 `self` 표시는 새 구조로 교체하지 않고 해당 파일의 현재 seam을 강화한다는 뜻이다.

| New/Modified File | Change | Role | Data Flow | Closest Analog / Foundation | Match Quality |
|---|---|---|---|---|---|
| `src/core/validation.ts` | create | utility | transform | `src/core/catalog.ts` | role-match |
| `src/core/redaction.ts` | create | utility | transform | `src/core/paths.ts` | role-match |
| `src/core/path-boundary.ts` | create | utility | file-I/O | `src/core/transaction.ts` | flow-match |
| `src/core/writer-lock.ts` | create | service | file-I/O / event-driven | `src/core/transaction.ts` | partial |
| `src/core/support-bundle.ts` | create (implied by D-15) | service | file-I/O / transform | — | no close analog |
| `src/core/transaction.ts` | modify | service | file-I/O / event-driven | self | exact foundation |
| `src/core/process.ts` | modify | service | request-response / streaming | self | exact foundation |
| `src/core/paths.ts` | modify | utility | transform | self | exact foundation |
| `src/core/catalog.ts` | modify | service | file-I/O / transform | self | exact foundation |
| `src/core/project.ts` | modify | service | file-I/O / transform | `src/core/catalog.ts` | role-match |
| `src/core/doctor.ts` | modify | service | request-response / transform | self | exact foundation |
| `src/core/install.ts` | modify | service | batch / file-I/O | `src/core/transaction.ts` | flow-match |
| `src/core/mcp-fixture.ts` | modify | service | streaming / request-response | `src/core/process.ts` | role-match |
| `src/core/gsd-fixture.ts` | modify | service | batch / request-response | `src/core/process.ts` | role-match |
| `src/core/ecc-fixture.ts` | modify | service | batch / request-response | `src/core/process.ts` | role-match |
| `src/core/gsd-compat.ts` | modify | service | batch / file-I/O | `src/core/transaction.ts` | flow-match |
| `src/core/ecc-skills.ts` | modify | service | file-I/O / transform | `src/core/transaction.ts` | flow-match |
| `src/core/isolation.ts` | modify | service | file-I/O / request-response | `src/core/transaction.ts` | flow-match |
| `src/core/mcp.ts` | modify | service | file-I/O / transform | `src/core/catalog.ts` + `src/core/transaction.ts` | partial |
| `src/core/owned-skills.ts` | modify | service | file-I/O / transform | `src/core/transaction.ts` | flow-match |
| `src/core/skill-policy.ts` | modify | service | file-I/O / transform | `src/core/transaction.ts` | flow-match |
| `src/core/inventory.ts` | modify | service | request-response | `src/core/process.ts` | role-match |
| `src/core/update.ts` | modify | service | file-I/O / request-response | `src/core/transaction.ts` | flow-match |
| `src/adapters/harnesses.ts` | modify | adapter | request-response | `src/core/process.ts` | flow-match |
| `src/adapters/isolation.ts` | modify | adapter | request-response | `src/core/process.ts` | flow-match |
| `src/cli.ts` | modify | controller | request-response / batch | self | exact foundation |
| `src/format.ts` | modify | utility | transform | `src/core/paths.ts` | role-match |
| `src/types.ts` | modify | model | transform | self | exact foundation |
| `package.json` | modify | config | batch | self | exact foundation |
| `package-lock.json` | modify | config | batch | self | generated lock |
| `schemas/stack.schema.json` | modify | config | transform | self | exact foundation |
| `schemas/lock.schema.json` | modify | config | transform | self | exact foundation |
| `schemas/project-stack.schema.json` | modify | config | transform | self | exact foundation |
| `schemas/install-state.schema.json` | modify | config | transform | self | exact foundation |
| `schemas/transaction-journal.schema.json` | create | config | transform | `schemas/project-stack.schema.json` | role-match |
| `schemas/writer-lock.schema.json` | create | config | transform | `schemas/project-stack.schema.json` | role-match |
| `schemas/evidence.schema.json` | create | config | transform | `schemas/project-stack.schema.json` | role-match |
| `schemas/receipt.schema.json` | create | config | transform | `schemas/project-stack.schema.json` | role-match |
| `scripts/install.ps1` | modify | route / config | batch / request-response | self + `src/cli.ts` | partial |
| `scripts/install.sh` | modify | route / config | batch / request-response | self + `src/cli.ts` | partial |
| `scripts/update.ps1` | modify | route / config | batch / request-response | self + `src/cli.ts` | partial |
| `scripts/update.sh` | modify | route / config | batch / request-response | self + `src/cli.ts` | partial |
| `test/validation.test.ts` | create | test | batch / transform | `test/transaction.test.ts` | test-style match |
| `test/redaction.test.ts` | create | test | batch / transform | `test/transaction.test.ts` | test-style match |
| `test/path-boundary.test.ts` | create | test | batch / file-I/O | `test/transaction.test.ts` | role+flow match |
| `test/process.test.ts` | create | test | batch / streaming | `test/transaction.test.ts` | test-style match |
| `test/transaction-crash.test.ts` | create | test | batch / event-driven | `test/transaction.test.ts` | role-match |
| `test/preview.test.ts` | create | test | batch / file-I/O | `test/transaction.test.ts` | test-style match |
| `test/transaction.test.ts` | modify | test | batch / file-I/O | self | exact foundation |
| `test/catalog.test.ts` | modify | test | batch / transform | self | exact foundation |
| `.github/workflows/ci.yml` | modify | config / test | batch | self | exact foundation |

## Primary Pattern Assignments

### `src/core/path-boundary.ts`, `src/core/writer-lock.ts`, `src/core/transaction.ts`

**Primary analog:** `src/core/transaction.ts` (tracked)

**Imports and local primitive style** (`src/core/transaction.ts:1-4`):

```typescript
import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { chmod, copyFile, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
```

Node built-ins, named exports, explicit relative `.js` imports를 유지한다. `path-boundary.ts`는 `lstat`/`realpath`, `writer-lock.ts`는 `open(..., "wx")`/`FileHandle.sync()`를 같은 방식으로 가져온다.

**현재 lexical guard — 이 API 위치를 canonical proof 소비로 교체** (`src/core/transaction.ts:32-40`):

```typescript
function inside(root: string, target: string): boolean {
  const rel = relative(resolve(root), resolve(target));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function requireAllowed(target: string, allowedRoots: string[]): void {
  if (!allowedRoots.some((root) => inside(root, target))) {
    throw new Error(`Transaction target is outside allowed roots: ${target}`);
  }
}
```

이 guard 자체는 fail-closed 경계 패턴이지만 lexical-only이므로 그대로 복사하지 않는다. 새 `PathProof`는 configured/canonical 관계, existing ancestor identity, reparse kind, source/state/journal/snapshot/temp/package-root까지 포함하고 apply 직전에 재검증한다.

**보존할 atomic-temp 구조** (`src/core/transaction.ts:43-55`):

```typescript
async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = join(dirname(path), `.${basename(path)}.${randomUUID()}.tmp`);
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, path);
}

async function writeTargetAtomic(target: string, content: Uint8Array): Promise<void> {
  await mkdir(dirname(target), { recursive: true });
  const temporary = join(dirname(target), `.${basename(target)}.${randomUUID()}.tmp`);
  await writeFile(temporary, content, { mode: 0o600 });
  await rename(temporary, target);
}
```

같은-directory temp + rename 구조를 유지하되 temp file sync → rename → parent directory sync를 추가한다. JSON 직렬화는 strict schema와 중앙 redactor를 통과한 값만 받는다.

**현재 journal state와 write-order seam** (`src/core/transaction.ts:19-25`, `78-104`):

```typescript
export interface TransactionJournal {
  schemaVersion: 1;
  id: string;
  createdAt: string;
  status: "applying" | "applied" | "rolled-back" | "failed";
  allowedRoots: string[];
  files: JournalFile[];
}

for (const [index, operation] of options.operations.entries()) {
  // snapshot and target mutation happen here today
  if (content === null) await rm(target, { force: true });
  else await writeTargetAtomic(target, content);
  journal.files.push({
    target,
    existed,
    snapshot,
    beforeHash: before ? sha256(before) : null,
    afterHash: content === null ? null : sha256(content),
  });
  await writeJsonAtomic(journalPath, journal);
}
```

`journal.files.push`를 mutation 앞의 durable intent로 이동한다. 단계별 status와 operation token을 strict journal schema에 기록한다. 한 CLI mutation이 하나의 `MutationSession`을 획득하고 하위 apply 함수들은 session을 전달받아야 한다. 각 `applyFileTransaction`이 별도 lock을 잡는 패턴은 금지한다.

**반드시 보존할 hash-checked rollback preflight** (`src/core/transaction.ts:114-145`):

```typescript
for (const file of journal.files) {
  requireAllowed(file.target, allowedRoots);
  if (file.afterHash === null) {
    if (existsSync(file.target)) throw new Error(`Rollback blocked by post-transaction drift: ${file.target}`);
  } else {
    if (!existsSync(file.target)) throw new Error(`Rollback blocked because target is missing: ${file.target}`);
    const current = await readFile(file.target);
    if (sha256(current) !== file.afterHash) throw new Error(`Rollback blocked by post-transaction drift: ${file.target}`);
  }
}
// restore in reverse order, then verify beforeHash
```

`repair` preview도 before/after/neither hash 판정만 제공하고 자동 복구하지 않는다. `repair --apply`는 lock/journal 안전 경계 해제 또는 exact-byte restoration까지만 수행한다.

**Integration targets:** `install.ts`, `gsd-compat.ts`, `ecc-skills.ts`, `isolation.ts`, `mcp.ts`, `owned-skills.ts`, `skill-policy.ts`, `update.ts`. 모든 path/process를 plan에 먼저 열거하고 complete preflight가 끝난 뒤 writer lock을 최초 mutation으로 획득한다.

---

### `src/core/process.ts` 및 모든 subprocess caller

**Primary analog:** `src/core/process.ts` (tracked; central seam)

**보존할 verified npm/npx shim normalization** (`src/core/process.ts:18-27`):

```typescript
export function resolveNodePackageCli(command: "npm" | "npx"): { executable: string; argsPrefix: string[] } {
  const resolved = resolveCommand(command);
  if (!resolved) throw new Error(`${command} was not found`);
  if (process.platform === "win32" && resolved.toLowerCase().endsWith(".cmd")) {
    const script = join(dirname(resolved), "node_modules", "npm", "bin", `${command}-cli.js`);
    if (!existsSync(script)) throw new Error(`Could not locate ${command}-cli.js beside ${resolved}`);
    return { executable: process.execPath, argsPrefix: [script] };
  }
  return { executable: resolved, argsPrefix: [] };
}
```

일반 `.cmd`/`.bat` shell fallback으로 확장하지 않는다. 검증된 shim만 `node + known *-cli.js`로 정규화하고 나머지는 stable unsupported code로 거부한다.

**교체할 shell/raw-output seam** (`src/core/process.ts:76-100`):

```typescript
export function runCommandCapture(commandPath: string, args: string[], options: {
  cwd: string;
  env: NodeJS.ProcessEnv;
  timeout?: number;
}): { status: number; stdout: string; stderr: string } {
  // ... .cmd -> ComSpec fallback ...
  const result = spawnSync(executable, actualArgs, {
    cwd: options.cwd,
    env: options.env,
    encoding: "utf8",
    timeout: options.timeout ?? 120_000,
    windowsHide: true,
  });
  if (result.error) throw result.error;
  return { status: result.status ?? 1, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}
```

새 API는 `ProcessSpec`(absolute executable, argv, canonical cwd, env-name allowlist, timeout, byte cap, stdio mode)와 async `spawn(..., { shell: false })`를 사용한다. stdout/stderr raw bytes는 streaming SHA-256에만 공급하고 반환/예외에는 bounded redacted head/tail, fingerprint, exit/timeout metadata만 둔다.

**직접 spawn을 중앙 adapter로 흡수할 seam** (`src/core/mcp-fixture.ts:71-120`):

```typescript
const env: NodeJS.ProcessEnv = {
  ...process.env,
  CONTEXT7_API_KEY: "alpha-aos-fixture-not-a-real-key",
  EXA_API_KEY: "alpha-aos-fixture-not-a-real-key",
  FIRECRAWL_API_KEY: "alpha-aos-fixture-not-a-real-key",
};
const child = spawn(command.command, command.args, {
  env,
  stdio: ["pipe", "pipe", "pipe"],
  windowsHide: true,
});
// current timeout error includes captured stderr
throw new Error(`${server} MCP protocol timed out. stderr: ${stderr || "<empty>"}`);
```

protocol-session mode도 같은 cap/deadline/env allowlist/redaction 계약을 사용한다. `process.env` 전체 상속과 raw stderr 결합은 제거한다.

**Apply to:** `src/adapters/harnesses.ts`, `src/adapters/isolation.ts`, `src/core/inventory.ts`, `src/core/install.ts`, `src/core/gsd-compat.ts`, `src/core/gsd-fixture.ts`, `src/core/ecc-fixture.ts`, `src/core/mcp-fixture.ts`, `src/cli.ts`의 interactive launch.

---

### `src/core/validation.ts`, loaders, strict schemas

**Primary analog:** `src/core/catalog.ts` (tracked)

**Boundary-guard style** (`src/core/catalog.ts:1-10`):

```typescript
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse } from "yaml";
import type { StackCatalog, StackLock } from "../types.js";

function requireObject(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
}
```

**현재 loader seam** (`src/core/catalog.ts:12-30`):

```typescript
export async function loadCatalog(root: string): Promise<StackCatalog> {
  const value: unknown = parse(await readFile(join(root, "catalog", "stack.yaml"), "utf8"));
  requireObject(value, "catalog");
  if (value.schemaVersion !== 1 || value.name !== "alpha-aos") {
    throw new Error("Unsupported stack catalog schema");
  }
  requireObject(value.harnesses, "catalog.harnesses");
  requireObject(value.components, "catalog.components");
  requireObject(value.policy, "catalog.policy");
  return value as unknown as StackCatalog;
}
```

이 named-loader/error-boundary 모양은 유지하되 구현은 strict syntax/duplicate detection → exact schema-version router → Ajv 2020 closed schema → domain invariants 순서로 이동한다. Ajv는 `strict/allErrors`를 켜고 coercion/default/removal은 끈다. 오류는 raw value 대신 redacted shape summary를 가진 bounded/sorted `ValidationIssue[]`로 만든다.

**Schema closure precedent** (`schemas/project-stack.schema.json:24-49`):

```json
"inherit": {
  "type": "object",
  "required": ["globalConfig", "globalSkills", "globalMcp", "globalMemory", "globalHooks"],
  "properties": {
    "globalConfig": { "type": "boolean" },
    "globalSkills": { "type": "boolean" }
  },
  "additionalProperties": false
}
```

`stack.schema.json`과 `lock.schema.json`의 현재 top-level `additionalProperties: true`는 제거한다. core는 closed-world이고 `extensions`만 namespaced map으로 연다. unknown namespace는 보존/표시하되 planning/apply에는 inert해야 한다.

**Apply to loaders:** `catalog.ts`, `project.ts`, `mcp.ts`, `isolation.ts`, `transaction.ts` journal/lock reads, 향후 evidence/receipt reads. 사용자 소유 native config의 전체 unknown field를 삭제하지 말고 alpha-AOS가 소비/소유하는 subtree만 엄격히 검증한다.

**Dependency note:** `ajv@8.20.0`, `jsonc-parser@3.3.1`는 research-approved exact dependencies다. `smol-toml@1.8.0`은 `[SUS]` human-verification checkpoint 전에는 설치하거나 lock을 변경하지 않는다.

---

### `src/core/redaction.ts`, `src/core/paths.ts`, output surfaces

**Primary foundation:** `src/core/paths.ts` (tracked)

**현재 path alias seam** (`src/core/paths.ts:31-45`):

```typescript
export function userStateRoot(): string {
  const override = process.env.ALPHA_AOS_STATE_DIR?.trim();
  if (override) return resolve(override);
  return join(homedir(), ".alpha-aos");
}

export function redactHome(value: string): string {
  const home = resolve(homedir());
  const normalized = resolve(value);
  if (normalized.toLowerCase() === home.toLowerCase()) return "~";
  if (normalized.toLowerCase().startsWith(`${home.toLowerCase()}${process.platform === "win32" ? "\\" : "/"}`)) {
    return `~${normalized.slice(home.length)}`;
  }
  return value;
}
```

이를 recursive central redactor의 segment-aware alias policy로 확장한다. 순서는 exact credentials → secret-bearing key/name context → URL userinfo/token params → PEM/JWT/API-key structures → `~`/`<temp>`/`<project>` alias다. Error/object/array/circular/depth/size를 모두 bounded하게 처리하고 stable typed placeholder를 사용한다.

**모든 human/JSON의 단일 출력 seam** (`src/cli.ts:102-104`, `562-565`):

```typescript
function print(value: unknown, json: boolean, formatted: string): void {
  process.stdout.write(json ? `${JSON.stringify(value, null, 2)}\n` : `${formatted}\n`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`alpha-aos: ${message}\n`);
  process.exitCode = 2;
});
```

두 경계 모두 중앙 serializer/redactor를 통과시킨다. `format.ts`가 environment value, executable path, project root를 문자열로 합치는 경우도 formatter 호출 전후 같은 context를 사용한다. snapshot bytes는 절대 출력하지 않고 alias path/size/hash/permissions만 표시한다.

**Typed diagnostic precedent** (`src/types.ts:105-109`, `src/core/doctor.ts:59-73`):

```typescript
export interface DoctorFinding {
  level: "ok" | "info" | "warning" | "error";
  code: string;
  message: string;
}

findings.push(smoke.ok
  ? { level: "ok", code: "gsd.codex-stop-hook", message: "Codex GSD Stop hook exits silently with valid protocol behavior" }
  : { level: "error", code: "gsd.codex-stop-hook", message: `Codex GSD Stop hook failed (${smoke.status}): ${smoke.stderr || smoke.stdout}` });
```

stable `level/code/message` 패턴은 유지하되 raw subprocess output을 message에 넣지 않는다. active-lock/needs-repair/validation/process/support-bundle 결과는 typed code와 bounded redacted metadata로 표현한다.

---

### `src/cli.ts`, install orchestration, four wrappers

**Primary local pattern:** `src/cli.ts`의 dry-run/apply branch

**Plan/apply split to copy** (`src/cli.ts:164-186`):

```typescript
if (command === "install") {
  const installOptions = { root, catalog, lock, inventory, ...(requestedTargets ? { requestedTargets } : {}) };
  if (!hasFlag(args, "--apply")) {
    const plan = await createManagedInstallPlan(installOptions);
    print(plan, json, [
      `alpha-AOS managed install (${plan.selection})`,
      ...plan.steps.map((step) => `${step.action.toUpperCase().padEnd(7)} ${step.id} - ${step.note}`),
      "Dry-run only. Pass --apply to fixture, apply, and verify the selected stack.",
    ].join("\n"));
  } else {
    const result = await applyManagedInstall(installOptions);
    print(result, json, [/* applied result */].join("\n"));
  }
}
```

모든 mutation과 최소 `repair`에 이 branch 형태를 적용한다. plan은 state root/checkout/global package/config/harness를 포함해 byte mutation이 없어야 하고, apply만 complete preflight 후 `MutationSession`을 연다. `repair` dry-run은 recovery plan만 보여준다.

**현재 install ordering gap** (`src/core/install.ts:287-305`):

```typescript
try {
  // External installers run first.
  for (const target of plan.targets.filter(/* ... */)) {
    if (await installGsd(target, options.catalog, options.lock)) {
      externalChanges.push(`gsd:${target}`);
    }
  }
  if (await installEccRuntime(options.lock)) externalChanges.push("ecc:runtime");
  if (plan.targets.includes("pi")) await installPiBridge(options.lock);
  // managed file transactions follow later
}
```

외부 installer보다 먼저 모든 target/state/journal/snapshot/temp/source/package-root와 process spec을 비변이 preflight한다. 이후 하나의 writer session 아래 외부 변경과 기존 하위 transaction을 직렬화한다. package-manager compensation/full uninstall은 Phase 6에 남긴다.

**Wrapper gaps to reverse without changing shell conventions:**

- `scripts/install.ps1:20-40` / `scripts/install.sh:35-60`: 현재 dry-run에서도 `npm ci`, build, 기본 `npm link`를 먼저 수행한다.
- `scripts/update.ps1:21-37` / `scripts/update.sh:27-45`: 현재 dry-run에서도 `git pull`, `npm ci`, build, `npm link`를 수행한다.
- dry-run은 이미 존재하고 검증된 CLI artifact로 read-only plan만 실행한다. artifact가 없거나 stale이면 변경 없이 prerequisite/refusal을 출력한다.
- apply 경로만 bootstrap/update mutation을 수행한다. PowerShell/POSIX의 현재 argument parsing과 명시적 `-Apply`/`--apply` 형태는 유지한다.

---

### Wave 0 and regression tests

**Primary analog:** `test/transaction.test.ts` (tracked)

**Real temporary filesystem setup** (`test/transaction.test.ts:1-17`):

```typescript
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

test("transaction restores existing bytes and removes files it created", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "alpha-aos-transaction-"));
  context.after(async () => rm(root, { recursive: true, force: true }));
  // exercise real files, then assert observable bytes
});
```

mock framework를 추가하지 않는다. OS temp 아래 실제 files/processes와 `context.after` cleanup을 사용한다.

**Fail-closed negative assertion** (`test/transaction.test.ts:37-50`):

```typescript
await assert.rejects(
  () => applyFileTransaction({
    stateRoot: join(root, "state"),
    allowedRoots: [allowed],
    operations: [{ target: join(root, "outside.txt"), content: "blocked" }],
  }),
  /outside allowed roots/u,
);
```

새 tests는 error text만 확인하지 말고 outside sentinel/tree digest/hash/absence of secrets/lock evidence까지 관찰한다. unavailable privileged reparse fixture는 pass로 세지 말고 명시적으로 not-run/unsupported evidence를 낸다.

**Drift preservation assertion** (`test/transaction.test.ts:52-68`):

```typescript
await writeFile(target, "user edit\n");
await assert.rejects(() => rollbackManagedTransaction(stateRoot, journal.id), /post-transaction drift/u);
assert.equal(await readFile(target, "utf8"), "user edit\n");
```

이 invariant는 crash/repair tests에서도 유지한다: unknown current hash는 자동 overwrite/lock removal을 절대 유발하지 않는다.

**CI precedent and required extension** (`.github/workflows/ci.yml:12-37`):

```yaml
strategy:
  fail-fast: false
  matrix:
    os: [ubuntu-latest, macos-latest, windows-latest]
steps:
  - run: npm ci
  - run: npm run check
  - run: npm test
```

3-OS matrix는 유지한다. syntax-only wrapper steps를 실제 preview behavior/tree-digest 실행으로 확장한다.

## Shared Patterns

### Mutation ownership and session lifetime

**Source:** `src/core/transaction.ts:57-76`, `src/cli.ts:164-186`

**Apply to:** 모든 apply/removal/external install/repair 경로.

- plan에서 operation 전체의 paths, source hashes, process specs, env-name allowlists를 결정한다.
- complete read-only preflight 후 state-root writer lock을 한 번 획득한다.
- 동일 token/session을 모든 하위 transaction과 installer에 전달한다.
- canonical proof를 각 rename/remove 직전에 재검증한다.
- durable write-ahead journal 후 bytes를 변경한다.
- competing writer는 active operation ID/start/PID/retry guidance로 즉시 실패한다. stale로 보여도 자동 삭제하지 않는다.

### Validation and extension inertness

**Source:** `src/core/catalog.ts:6-30`, `schemas/project-stack.schema.json:24-49`

**Apply to:** catalog, stable/candidate lock, project manifest, native owned subtree, journal, writer lock, evidence, receipt.

- syntax ambiguity를 schema validation 전에 거부한다.
- exact version validator만 선택한다. 지원되는 old version은 read-only + migration plan, unknown newer는 refusal이다.
- core objects are closed; only namespaced `extensions` is open.
- registered adapter가 없는 extension data는 preserved/displayed but inert다.

### Redacted observability

**Source:** `src/core/paths.ts:31-45`, `src/cli.ts:102-104`, `src/types.ts:105-109`

**Apply to:** human/JSON/CI, plans, journals, process results/errors, doctor, support bundle.

- credential values와 raw subprocess stdout/stderr는 persistence/formatting 이전에 차단한다.
- support bundle은 dry-run manifest와 redacted preview를 먼저 제공하고 local explicit apply만 생성한다. upload 기능은 없다.
- snapshots remain opaque recovery bytes.

### Error handling

기존의 boundary guard + specific `Error` 패턴을 유지하되, 예상되는 안전 거부는 stable code를 가진 typed result/finding으로 노출한다. top-level catch나 rollback error aggregation에서 raw values/output을 문자열 결합하지 않는다.

### Authentication

해당 없음. 이 저장소는 local CLI이며 Phase 1에 새로운 auth/session surface를 추가하지 않는다.

## No Exact Analog Found

| File | Role | Data Flow | Reason / Planner Direction |
|---|---|---|---|
| `src/core/writer-lock.ts` | service | file-I/O / event-driven | state-root 단일 writer와 explicit repair state machine이 현재 없음. `transaction.ts`의 operation ID/hash journal primitives를 재사용하되 PID/age unlock heuristic은 만들지 않는다. |
| `src/core/path-boundary.ts`의 Windows reparse probe | utility | file-I/O | lexical `inside()`만 존재한다. Node/Microsoft research skeleton과 Wave 0 adversarial test를 사용하고 증명 불가 filesystem은 fail closed한다. |
| `src/core/support-bundle.ts` | service | file-I/O / transform | 현재 support artifact 계층이 없다. central redactor + plan/apply + transaction을 조합하며 자동 upload를 추가하지 않는다. |
| strict multi-format duplicate/version router | utility | transform | 현재 YAML/JSON cast 기반 loader만 있다. `RESEARCH.md`의 Ajv/jsonc/yaml 및 gated TOML parser 지침을 따른다. |

## Scope Guardrails

- Phase 1은 기존 transaction, snapshot, SHA-256 journal, rollback drift guard, fixture, harness adapter를 강화한다. 대체 아키텍처를 만들지 않는다.
- project-pack detection/materialization, mandatory GSD gates, tree-off/opt-out, full uninstall, release qualification, sealed-isolation 확장은 Phase 2+로 미룬다.
- `repair --apply`는 abandoned writer/journal의 hash-proven recovery에만 한정한다. 외부 package compensation/general lifecycle recovery는 포함하지 않는다.
- `smol-toml`은 human verification checkpoint 전 의존성에 추가하지 않는다.

## Metadata

**Analog search scope:** `src/core`, `src/adapters`, `src/cli.ts`, `src/format.ts`, `src/types.ts`, `test`, `schemas`, `scripts`, `.github/workflows`
**Tracked-source gate:** 모든 명명된 existing source/analog는 repository root에서 `git ls-files` 결과가 non-empty임을 확인함
**Primary analog families (5):** transaction, process, catalog/validation, path/redaction, node:test filesystem tests
**Target-local seams inspected:** CLI, install orchestration, MCP protocol fixture, wrappers, schemas, diagnostics/types/format, CI
**Pattern extraction date:** 2026-09-03
