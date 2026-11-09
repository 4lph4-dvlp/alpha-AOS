---
phase: 43-migration-and-consistent-guidance
plan: "04"
subsystem: docs-and-skills
tags: [migration-guide, bilingual, 2-track, skills-sync, readmes, consistency-tests]

requires:
  - phase: 43-03
    provides: Component-harness outcome matrix formatter and 2-track CLI routing guidance
provides:
  - Bilingual migration guides (docs/guides/migration.md, docs/guides/migration.ko.md) with 6 symmetric sections
  - Updated READMEs documenting alpha-aos migrate and 2-track update model
  - Synchronized skills (alpha-aos-control Domain 6, alpha-aos-task local tool records SSOT)
  - Automated documentation and skill consistency test suite (test/migrate-docs-consistency.test.ts)
affects: [milestone-verification]

actuals:
  tokens: 18200
  tasks: 2
  commits: 1

tech-stack:
  added: []
  patterns:
    - Symmetric bilingual technical documentation (EN/KO) with identical section hierarchies and portable path aliases
    - Automated doc consistency testing asserting balanced code fences, zero private path leakage, and absence of deprecated promotion terms
    - Explicit 2-track mental model reinforced across user documentation, agent management skills, and CLI output

key-files:
  created:
    - docs/guides/migration.md
    - docs/guides/migration.ko.md
    - test/migrate-docs-consistency.test.ts
  modified:
    - README.md
    - README.ko.md
    - skills/alpha-aos-control/SKILL.md
    - skills/alpha-aos-task/SKILL.md

key-decisions:
  - "D-15: 대칭형 이중 언어 마이그레이션 가이드 - docs/guides/migration.md 및 migration.ko.md를 6개 대칭 섹션(Overview, CLI Workflow, Conflict & Ownership Resolution, Safe Rollback & Hygiene, The 2-Track Update Model, Harness Configuration Notes)으로 구성하고 일체의 로컬 절대 경로 누출 방지"
  - "D-16: 스킬 및 README의 2-트랙 모델 일관성 동기화 - alpha-aos-control에 마이그레이션 및 2-트랙 운영 도메인을 추가하고, alpha-aos-task에 SSOT 불변 규칙을 추가하며, README의 기존 주간 자동 승격 설명을 제거하고 명시적 2-트랙 모델로 통일"

patterns-established:
  - "Bilingual Documentation Symmetry: Technical guides maintain identical section numbering and topics between English and Korean"
  - "Continuous Doc Proofing: Automated tests verify code fence parity, absence of deprecated automation terms, and zero private path strings"

verification:
  - "npm run check: passes cleanly"
  - "node --test dist/test/migrate-docs-consistency.test.js: 4/4 tests pass"
  - "Full Phase 43 test suite: 26/26 tests pass across 7 test files"
---

# Plan 43-04 Summary: Bilingual Migration Guides, README Updates, and Skills Synchronization

Authored complete bilingual migration guides in English and Korean, updated project READMEs with the 2-track update model and `alpha-aos migrate` references, synchronized agent control and task skills, and validated all documentation and skills via automated consistency tests.

## Accomplished Tasks

### 1. Bilingual Migration Guides
- Created [`docs/guides/migration.md`](file:///D:/dev/alpha-AOS/docs/guides/migration.md) (English) and [`docs/guides/migration.ko.md`](file:///D:/dev/alpha-AOS/docs/guides/migration.ko.md) (Korean):
  - **Section 1: Overview & Why Migrate**: Explains the shift from static bundled lockfiles to dynamic, immutable local tool records under `~/.alpha-aos/tool-records/v1/`.
  - **Section 2: Step-by-Step CLI Migration Workflow**: Step 1 (`alpha-aos doctor` / `status`), Step 2 (`alpha-aos migrate` preview with SHA-256 digest), Step 3 (`alpha-aos migrate --apply`), Step 4 (`alpha-aos doctor` verification).
  - **Section 3: Conflict & Ownership Resolution**: Handling shared config markers, unmanaged tools, and ambiguous ownership via `--resolve-ownership <tool>=<alpha-aos|external>`.
  - **Section 4: Safe Rollback & Hygiene**: Details non-destructive `.user-backup` timestamped backups, doctor hygiene checks, and manual restoration steps.
  - **Section 5: The 2-Track Update Model**: Clarifies Track 1 (`alpha-aos update` for external tools) vs Track 2 (`npm run deploy:local` / `npm install -g alpha-aos@latest` for engine code).
  - **Section 6: Harness-Specific Configuration Notes**: Details Claude Code, Codex, Antigravity, Pi Agent, and Hermes Agent configuration files and marker blocks.
  - Ensured balanced code fences and zero private path occurrences matching `assertNoPrivatePaths`.

### 2. README and Skill Synchronization
- Updated [`README.md`](file:///D:/dev/alpha-AOS/README.md) and [`README.ko.md`](file:///D:/dev/alpha-AOS/README.ko.md):
  - Added `alpha-aos migrate` to the quickstart commands and linked to the migration guides.
  - Replaced the deprecated Section 2 (automated weekly dependency promotion workflows) with the clear 2-Track Update Model.
  - Permanently removed obsolete references to scheduled background promotions, auto-promote actions, and nightly updates.
- Synchronized Agent Skills:
  - [`skills/alpha-aos-control/SKILL.md`](file:///D:/dev/alpha-AOS/skills/alpha-aos-control/SKILL.md): Added Domain 6 covering `alpha-aos migrate`, `--resolve-ownership`, and 2-track guidance.
  - [`skills/alpha-aos-task/SKILL.md`](file:///D:/dev/alpha-AOS/skills/alpha-aos-task/SKILL.md): Added rule 4 mandating local tool records as SSOT, fail-closed enforcement when records are absent, and `.user-backup` preservation.
- Created [`test/migrate-docs-consistency.test.ts`](file:///D:/dev/alpha-AOS/test/migrate-docs-consistency.test.ts):
  - Verifies code fence parity, section matching, zero private paths, README links, absence of deprecated terms, and skill completeness.
