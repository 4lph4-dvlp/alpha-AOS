---
phase: 10-three-os-ci-baseline
plan: 01
subsystem: testing
tags: [ci, cross-platform, typescript-compiler-api, node-test, path-handling, wsl]

requires:
  - phase: 07-cross-platform-release-proof
    provides: three-OS CI matrix whose ubuntu/macOS legs went red on CI-01 (run 35762417138)
provides:
  - host-native destinationFor and global ECC-root fixture roots built from join(tmpdir(), ...)
  - pure TypeScript-AST path-literal scanner (test/helpers/path-literal-scan.ts)
  - suite guard that fails on every OS when a test/*.ts literal with a platform-specific absolute path reaches a host path call
affects: [10-04 proof run preflight, any future test that builds fixture paths]

actuals:
  tokens: 3800
  tasks: 2
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Fixture roots for path assertions are built with join(tmpdir(), \"alpha-aos-<name>-fixture\", ...) and never created on disk"
    - "Intentional platform-absolute literal reaching a host path call needs `// path-literal-ok: <reason>` (reason >= 4 chars) on the literal's own line"

key-files:
  created:
    - test/helpers/path-literal-scan.ts
    - test/path-literal-guard.test.ts
  modified:
    - test/owned-skills.test.ts
    - test/ecc-skills.test.ts

key-decisions:
  - "Marker syntax is `// path-literal-ok:` plus a reason whose trimmed length is at least 4 characters, on the literal's own line only"
  - "const bindings resolve by name across the whole file (fail closed); a shadowing name can only add a violation, never hide one"
  - "Violations and file enumeration sort by plain code-unit comparison, not localeCompare, so guard output is byte-identical on every OS"

patterns-established:
  - "Host-native fixture roots: join(tmpdir(), fixture-name, ...) for any root fed to resolve/join and asserted against"
  - "Source-scan guard shape: sorted readdir of test/*.ts, self-inclusion and minimum-count assertions against a vacuous pass, every violation named in the failure message"

requirements-completed: [CI-01]

coverage:
  - id: D1
    description: "destinationFor and global ECC-root fixtures use host-native roots and pass on Windows and on a POSIX host (WSL)"
    requirement: CI-01
    verification:
      - kind: unit
        ref: "test/owned-skills.test.ts#destinationFor resolves destinations across all five harnesses"
        status: pass
      - kind: unit
        ref: "test/ecc-skills.test.ts#global ECC roots preserve native roots and share Agent Skills between Codex and Pi"
        status: pass
      - kind: other
        ref: "wsl.exe --cd <repo> -e sh -c 'node --test --test-name-pattern=\"destinationFor resolves|global ECC roots\" dist/test/owned-skills.test.js dist/test/ecc-skills.test.js'"
        status: pass
    human_judgment: false
  - id: D2
    description: "AST path-literal scanner flags assertion-bound platform-absolute literals and leaves opaque inputs alone"
    requirement: CI-01
    verification:
      - kind: unit
        ref: "test/path-literal-guard.test.ts#the path-literal scanner flags the pre-fix destinationFor fixture shape"
        status: pass
      - kind: unit
        ref: "test/path-literal-guard.test.ts#the path-literal scanner leaves win32/posix-qualified inputs and opaque strings alone"
        status: pass
      - kind: unit
        ref: "test/path-literal-guard.test.ts#a path-literal-ok marker exempts only its own line and only with a reason"
        status: pass
      - kind: unit
        ref: "test/path-literal-guard.test.ts#the path-literal scanner matches POSIX roots on whole path segments only"
        status: pass
      - kind: unit
        ref: "test/path-literal-guard.test.ts#the path-literal scanner reports nothing for an empty source"
        status: pass
      - kind: other
        ref: "c6415a2 one-off scan: owned-skills 5, ecc-skills 3, total 8"
        status: pass
    human_judgment: false
  - id: D3
    description: "Real test/*.ts tree scans clean on Windows and WSL, and a newly added violation fails the suite naming file:line:column"
    requirement: CI-01
    verification:
      - kind: unit
        ref: "test/path-literal-guard.test.ts#no test under test/ asserts against a platform-specific absolute path literal"
        status: pass
      - kind: other
        ref: "wsl.exe --cd <repo> -e sh -c 'node --test dist/test/path-literal-guard.test.js'"
        status: pass
    human_judgment: false

duration: 6min
completed: 2026-09-23
status: complete
---

# Phase 10 Plan 01: CI-01 host-native fixture roots and path-literal guard Summary

**destinationFor and ECC-root fixtures rebuilt on join(tmpdir(), ...) (observed red-to-green under WSL), plus a TypeScript-AST guard that fails every OS leg when a test/*.ts drive-letter, UNC or POSIX-root literal reaches join/resolve/normalize/relative/dirname/basename**

## Performance

- **Duration:** 6 min
- **Started:** 2026-09-22T23:31:06Z
- **Completed:** 2026-09-22T23:37:00Z
- **Tasks:** 2
- **Files modified:** 4 (2 created, 2 modified)

## Accomplishments

- `destinationFor resolves destinations across all five harnesses` now passes on a POSIX host: its custom root, fake home and four env roots are `join(tmpdir(), "alpha-aos-destination-fixture", ...)`, so `resolve(custom)` returns the root unchanged instead of prefixing the cwd.
- `global ECC roots preserve native roots and share Agent Skills between Codex and Pi` builds home and all four profile roots from `join(tmpdir(), "alpha-aos-ecc-root-fixture", ...)`, so it passes on POSIX because of how it is built, not by the accident of `join` without `resolve`.
- New `scanPathLiterals` (TS compiler API, no fs) plus a 6-test guard: it scans every `test/*.ts` (53 files, including itself), refuses to pass if the scan found nothing to check, and names every violation as `FILE:LINE:COLUMN "LITERAL" via VIA`.

## Evidence

POSIX observation: WSL red-to-green

Pre-change WSL run (`wsl.exe --cd <repo> -e sh -c 'node --test --test-name-pattern="destinationFor resolves|global ECC roots" dist/test/owned-skills.test.js dist/test/ecc-skills.test.js'`, WSL node v26.8.2):

```
✔ global ECC roots preserve native roots and share Agent Skills between Codex and Pi (1.616479ms)
✖ destinationFor resolves destinations across all five harnesses (5.217956ms)
ℹ pass 1
ℹ fail 1
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  + '/mnt/d/dev/alpha-AOS/C:\\test\\custom-root/skills/my-skill/SKILL.md'
  - 'C:\\test\\custom-root/skills/my-skill/SKILL.md'
```

Post-change, same WSL command:

```
✔ global ECC roots preserve native roots and share Agent Skills between Codex and Pi (1.713458ms)
✔ destinationFor resolves destinations across all five harnesses (2.133573ms)
ℹ tests 2
ℹ pass 2
ℹ fail 0
```

WSL guard run (`node --test dist/test/path-literal-guard.test.js`): tests 6, pass 6, fail 0.

c6415a2 pre-fix scan (plan verify command, exit 0):

```
owned-skills 5
  owned-skills.test.ts:53:18 "C:\\test\\custom-root" via binding custom
  owned-skills.test.ts:59:20 "C:\\Users\\fakeuser" via binding fakeHome
  owned-skills.test.ts:69:10 "C:\\env\\claude" via direct host-path argument
  owned-skills.test.ts:77:10 "C:\\env\\gemini" via direct host-path argument
  owned-skills.test.ts:85:10 "C:\\env\\hermes" via direct host-path argument
ecc-skills 3
  ecc-skills.test.ts:75:16 "C:\\Users\\fixture" via binding home
  ecc-skills.test.ts:76:104 "C:\\profiles\\claude" via direct host-path argument
  ecc-skills.test.ts:79:119 "C:\\profiles\\antigravity" via direct host-path argument
total 8
```

This matches 10-RESEARCH Finding 2 literal-for-literal.

Temporary violation probe: added `assert.equal(join("C:\\probe\\root", "x"), join("C:\\probe\\root", "x"));` at test/ecc-skills.test.ts:87, rebuilt, ran the guard on Windows and WSL. Both reported pass 5 / fail 1:

```
✖ no test under test/ asserts against a platform-specific absolute path literal
  AssertionError [ERR_ASSERTION]: platform-specific absolute path literals reach a host path call:
  ecc-skills.test.ts:87:21 "C:\\probe\\root" via direct host-path argument
  ecc-skills.test.ts:87:51 "C:\\probe\\root" via direct host-path argument
  Build the root with host path APIs (join(tmpdir(), ...)), or add `// path-literal-ok: <reason>` on the literal's own line.
```

Reverted with `git checkout -- test/ecc-skills.test.ts`; guard back to pass 6 / fail 0.

Plan-level verification: `npm run check && npm run build && node --test dist/test/path-literal-guard.test.js dist/test/owned-skills.test.js dist/test/ecc-skills.test.js` gave tests 20, pass 20, fail 0. `git diff --quiet 58130e1 HEAD -- package.json package-lock.json` exits 0 (no dependency change).

## Task Commits

1. **Task 1: Tracer, host-native destinationFor and ECC-root fixtures** - `f6b7c8f` (fix)
2. **Task 2: AST path-literal scanner and suite guard** - `b79611b` (test, RED: guard fails to compile without the helper), `a906426` (feat, GREEN: scanner)

## Files Created/Modified

- `test/helpers/path-literal-scan.ts` - Pure AST scanner: `ABSOLUTE_PATH_LITERAL`, `HOST_PATH_FUNCTIONS`, `PATH_LITERAL_MARKER`, `PathLiteralViolation`, `scanPathLiterals`, `formatPathLiteralViolation`
- `test/path-literal-guard.test.ts` - Five scanner self-tests plus the scan of the real `test/*.ts` tree
- `test/owned-skills.test.ts` - destinationFor fixture roots from `join(tmpdir(), "alpha-aos-destination-fixture", ...)` with named `claudeRoot`/`codexRoot`/`geminiRoot`/`hermesRoot`
- `test/ecc-skills.test.ts` - ECC-root fixture roots from `join(tmpdir(), "alpha-aos-ecc-root-fixture", ...)`

## Decisions Made

- The marker regex is `/\/\/\s*path-literal-ok:\s*\S.{2,}\S/u`. The reason must start and end with a non-space character and be at least 4 characters long, so trailing spaces cannot pad a short reason up to the minimum.
- Name-level const binding resolution (10-RESEARCH Pitfall 2), documented in one comment line; it fails closed.
- Sorting uses code-unit comparison rather than `localeCompare`, so ordering does not depend on the host locale.
- Template expressions whose head is an absolute root (for example `` `/tmp/${name}` ``) count as direct host-path arguments.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- The first try at the temporary-violation probe used a shell `printf` append. The shell collapsed `\\` to `\`, so the probe literal became `"C:\probe\root"`, which evaluates to `C:probe<CR>oot`. That is not a drive-letter path, and the guard was right not to flag it. The probe was redone with an exact file edit. The observation above comes from the corrected probe.

## TDD Gate Compliance

Task 2 has a RED commit `b79611b` (`test(10-01)`; `npm run check` failed with TS2307 because the helper did not exist yet) followed by a GREEN commit `a906426` (`feat(10-01)`). Task 1's RED was the observed WSL failure of the existing test. Its fix is a test-side change, committed as `fix(10-01)`.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- CI-01 holds locally on Windows and on WSL. The authoritative ubuntu-latest/macos-latest observation comes in the 10-04 push-triggered proof run.
- WSL runs Node 26.8.2, not the CI Node 24, so the CI legs are still the authoritative POSIX evidence.

## Self-Check: PASSED

- FOUND: test/helpers/path-literal-scan.ts, test/path-literal-guard.test.ts, test/owned-skills.test.ts, test/ecc-skills.test.ts
- FOUND commits: f6b7c8f, b79611b, a906426

---
*Phase: 10-three-os-ci-baseline*
*Completed: 2026-09-23*
