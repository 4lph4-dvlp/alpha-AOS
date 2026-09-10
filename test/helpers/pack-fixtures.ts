// The six CAPA-08 domain fixtures, as data.
//
// This module is NOT a test. It lives beside `git-fixture.ts`,
// `oracle-fixtures.ts` and `termination-oracle.ts` for the reason their headers
// give: `run-tests.mjs` reads `dist/test` without recursion and keeps only
// `entry.isFile()`, so `dist/test/helpers` is never enumerated as a suite.
//
// WHY SYNTHETIC. 03-CONTEXT.md D-15 chooses synthetic fixture repositories
// built by the tests, with near-miss negatives cut from the same scaffold,
// precisely because that is deterministic, offline and portable to the
// three-OS matrix. Every fixture below is a handful of small files under a
// caller-supplied temporary root. Nothing here reads the developer's home,
// nothing spawns a harness, and nothing requires a network — so the same six
// assertions mean the same thing on a laptop with five harnesses installed and
// on a CI runner with none.
//
// WHY MINIMAL. A fixture writes exactly the evidence its target pack's declared
// leaves require, plus an inert scaffold base that satisfies no declared fact.
// A fixture that accidentally satisfied a second pack's leaves would make its
// assertion about the wrong thing, which is why every positive asserts the
// EXACT selected set rather than mere membership.
//
// WHY THE TWIN IS ONE EDIT. `createNearMissFixture` differs from its positive
// twin by exactly one file or exactly one project-manifest key — never two.
// `describeFixture` exposes that difference structurally so a twin that drifts
// into differing by three things is a red test rather than a silent change of
// subject.

import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { stringify } from "yaml";

import type { PackStatus, ProjectStackManifest } from "../../src/types.js";
import { PROJECT_MANIFEST_PATH } from "../../src/core/evidence.js";

/** The six domains CAPA-08 names, in the order the requirement lists them. */
export type PackDomain = "web" | "api-data" | "infrastructure" | "agent-ai" | "security" | "scientific";

export const PACK_DOMAINS: readonly PackDomain[] = [
  "web",
  "api-data",
  "infrastructure",
  "agent-ai",
  "security",
  "scientific",
];

/** One file a fixture materializes, as a relative POSIX path plus its bytes. */
export interface FixtureFile {
  readonly path: string;
  readonly content: string;
}

/**
 * How the twin is cut from the positive: one file, or one manifest key.
 *
 * There is deliberately no third shape. A twin that could remove "a dependency"
 * or "a directory and its contents" would make the one-edit claim a matter of
 * interpretation, and the whole point of the twin is that the interpretation is
 * mechanical.
 */
export type NearMissEdit =
  | { readonly kind: "file"; readonly path: string }
  | { readonly kind: "manifestKey"; readonly key: string };

export interface DomainFixtureSpec {
  readonly domain: PackDomain;
  /** The one pack this domain is represented by. */
  readonly packId: string;
  /**
   * Why THIS pack, out of the domain's candidates. Recorded so the mapping is
   * reviewable rather than implicit: several domains have more than one
   * declared candidate, and a planner choice made in the open is one a reader
   * can disagree with.
   */
  readonly rationale: string;
  /** The skills the declared pack supplies. Non-empty for all six, by choice. */
  readonly skills: readonly string[];
  /** The EXACT set the positive fixture selects. Not a membership claim. */
  readonly selectsExactly: readonly string[];
  /** Which branch of the evaluator decides it. */
  readonly selectionBranch: "evidence-files" | "manifest-opt-in";
  /** Inert scaffold plus the evidence files, all relative POSIX paths. */
  readonly files: readonly FixtureFile[];
  /** The project manifest, or null when the fixture declares none. */
  readonly manifest: ProjectStackManifest | null;
  /** The single edit that turns the positive into its twin. */
  readonly nearMissEdit: NearMissEdit;
  /**
   * The leaf the edit leaves unsatisfied. The twin's evaluation must carry it
   * as a FAILED leaf with a reason, which is DETC-03's contract applied to the
   * six domains.
   */
  readonly nearMissLeafFactId: string;
  /**
   * A substring the twin's failed-leaf reason MUST contain.
   *
   * A non-empty reason is not enough to prove anything: the evaluator's
   * fallback sentence is non-empty too and says nothing. This records the
   * evidence the reason has to name — the removed directory, the removed
   * package, the removed literal, or the removed manifest key — so a reason
   * that degrades into a shrug is a red test rather than a passing one.
   */
  readonly nearMissReasonNames: string;
  /**
   * What the twin's pack classifies as.
   *
   * Recorded per domain rather than assumed uniform, because the declared
   * catalog does not make it uniform and pretending otherwise would hide a
   * real property. A pack whose predicate is `all` keeps a satisfied leaf when
   * one is removed and is a genuine `near-miss`. A pack whose predicate is
   * `any` over a single minimal leaf has nothing left and is `silent` — which
   * is the evaluator correctly saying "no declared evidence matched" rather
   * than pretending the repository came close. `SECURITY_REVIEW` is a third
   * case again: its eight change-risk leaves are declared and deferred to
   * GATE-01, so removing the manifest opt-in leaves the pack `unimplemented`.
   */
  readonly twinStatus: PackStatus;
}

const INERT_README = "# fixture\n\nA synthetic repository built by the alpha-AOS test suite. It carries no code.\n";

/** The scaffold base every fixture starts from. It satisfies no declared fact. */
const SCAFFOLD_BASE: readonly FixtureFile[] = [{ path: "README.md", content: INERT_README }];

function packageManifest(name: string, dependencies: Record<string, string>): FixtureFile {
  return {
    path: "package.json",
    content: `${JSON.stringify({ name, private: true, dependencies }, null, 2)}\n`,
  };
}

/**
 * The six domain fixtures.
 *
 * `selectsExactly` is stated rather than derived: a fixture whose evidence
 * silently starts qualifying a second pack must fail, and a derived expectation
 * would move with it.
 */
export const DOMAIN_FIXTURES: Readonly<Record<PackDomain, DomainFixtureSpec>> = {
  web: {
    domain: "web",
    packId: "WEB_BASE",
    rationale:
      "web has three declared candidates. WEB_REACT selects on a bare react/next dependency and WEB_FLOW_AUDIT is a " +
      "manifest opt-in already exercised by the security and scientific domains, so WEB_BASE is the one that proves " +
      "a browser-facing project from FILE evidence. It also supplies two skills (browser-qa, accessibility), and its " +
      "`all` predicate is what lets its twin be a genuine near-miss. The dependency is vue rather than react so the " +
      "fixture cannot also satisfy WEB_REACT's anyDependencies literals.",
    skills: ["accessibility", "browser-qa"],
    selectsExactly: ["WEB_BASE"],
    selectionBranch: "evidence-files",
    files: [
      ...SCAFFOLD_BASE,
      packageManifest("web-domain-fixture", { vue: "^3.4.0" }),
      { path: "public/index.html", content: "<!doctype html>\n<title>fixture</title>\n" },
    ],
    manifest: null,
    nearMissEdit: { kind: "file", path: "public/index.html" },
    nearMissLeafFactId: "browser-entrypoint",
    nearMissReasonNames: "public",
    twinStatus: "near-miss",
  },

  "api-data": {
    domain: "api-data",
    packId: "DB_POSTGRES",
    rationale:
      "the API/data domain's four candidates are API, DB_MIGRATION, DB_POSTGRES and CACHE_REDIS. API declares " +
      "`skills: []`, so a fixture built on it would exercise no materialization target at all — the reason the plan " +
      "asks for a pack that supplies at least one skill. DB_POSTGRES supplies postgres-patterns and selects on a " +
      "declared driver dependency, which is the data half of the domain stated as repository evidence.",
    skills: ["postgres-patterns"],
    selectsExactly: ["DB_POSTGRES"],
    selectionBranch: "evidence-files",
    files: [...SCAFFOLD_BASE, packageManifest("api-data-domain-fixture", { pg: "^8.13.0" })],
    manifest: null,
    nearMissEdit: { kind: "file", path: "package.json" },
    nearMissLeafFactId: "postgres-driver",
    nearMissReasonNames: "pg",
    twinStatus: "silent",
  },

  infrastructure: {
    domain: "infrastructure",
    packId: "CONTAINER",
    rationale:
      "infrastructure declares CONTAINER and DEPLOYMENT. DEPLOYMENT's leaves are conservative fileContent patterns " +
      "over .github/workflows, so a minimal fixture for it would have to encode a CI workflow's shape and would " +
      "silently stop selecting the moment that list is narrowed. CONTAINER selects on a literal Dockerfile through " +
      "the anyFiles operator — the only one of the five operators no other domain here exercises — and supplies " +
      "docker-patterns.",
    skills: ["docker-patterns"],
    selectsExactly: ["CONTAINER"],
    selectionBranch: "evidence-files",
    files: [
      ...SCAFFOLD_BASE,
      { path: "Dockerfile", content: "FROM scratch\n" },
    ],
    manifest: null,
    nearMissEdit: { kind: "file", path: "Dockerfile" },
    nearMissLeafFactId: "file:Dockerfile",
    nearMissReasonNames: "Dockerfile",
    twinStatus: "silent",
  },

  "agent-ai": {
    domain: "agent-ai",
    packId: "AI_EVAL",
    rationale:
      "agent/AI declares MCP_SERVER, AGENT_RUNTIME and AI_EVAL. AI_EVAL supplies two skills " +
      "(ai-regression-testing, eval-harness) and is the only one of the three whose predicate is `all`, so its twin " +
      "is a genuine near-miss rather than a repository with nothing left. AGENT_RUNTIME's own rule — that a generic " +
      "agent-instructions file never activates it — is not skipped by this choice: it is proven directly by its own " +
      "named test, on a repository built for exactly that question.",
    skills: ["ai-regression-testing", "eval-harness"],
    selectsExactly: ["AI_EVAL"],
    selectionBranch: "evidence-files",
    files: [
      ...SCAFFOLD_BASE,
      packageManifest("agent-ai-domain-fixture", { openai: "^4.104.0" }),
      { path: "evals/smoke.jsonl", content: '{"prompt":"fixture","expected":"fixture"}\n' },
    ],
    manifest: null,
    nearMissEdit: { kind: "file", path: "evals/smoke.jsonl" },
    nearMissLeafFactId: "eval-assets",
    nearMissReasonNames: "evals",
    twinStatus: "near-miss",
  },

  security: {
    domain: "security",
    packId: "SECURITY_REVIEW",
    rationale:
      "security declares exactly one pack. Its eight change-risk leaves carry deferredTo: GATE-01 and no detector " +
      "runs for them in this phase, so the manifest opt-in is the only operative branch — which is what makes this " +
      "one of the two domains that must assert the selection came from the manifest rather than from a file " +
      "heuristic. It supplies security-review.",
    skills: ["security-review"],
    selectsExactly: ["SECURITY_REVIEW"],
    selectionBranch: "manifest-opt-in",
    files: [...SCAFFOLD_BASE],
    manifest: { schemaVersion: 1, securityReview: true },
    nearMissEdit: { kind: "manifestKey", key: "securityReview" },
    nearMissLeafFactId: "manifest:securityReview",
    nearMissReasonNames: "securityReview",
    twinStatus: "unimplemented",
  },

  scientific: {
    domain: "scientific",
    packId: "RESEARCH_SCIENTIFIC",
    rationale:
      "scientific declares exactly one pack, reached through a manifest opt-in and supplying four skills — the " +
      "largest skill set of any declared pack, and the one whose four frontmatter names all disagree with their " +
      "directory names (03-RESEARCH.md Pitfall 2). Choosing it here is what binds the CAPA-08 scientific domain to " +
      "the per-harness name divergence recorded by plan 03-04.",
    skills: [
      "scientific-db-pubmed-database",
      "scientific-db-uspto-database",
      "scientific-thinking-literature-review",
      "scientific-thinking-scholar-evaluation",
    ],
    selectsExactly: ["RESEARCH_SCIENTIFIC"],
    selectionBranch: "manifest-opt-in",
    files: [...SCAFFOLD_BASE],
    manifest: { schemaVersion: 1, scientificResearch: true },
    nearMissEdit: { kind: "manifestKey", key: "scientificResearch" },
    nearMissLeafFactId: "manifest:scientificResearch",
    nearMissReasonNames: "scientificResearch",
    twinStatus: "silent",
  },
};

/**
 * A repository containing ONE generic agent-instructions file and nothing else.
 *
 * `agent-runtime-config` is declared `broad: true` precisely because this
 * repository is its own negative fixture — it carries a 21 KB AGENTS.md — so
 * presence alone must never activate an agent-runtime pack. This is the design
 * document's §5.2 rule stated as a repository.
 */
export const GENERIC_INSTRUCTIONS_FIXTURE: readonly FixtureFile[] = [
  {
    path: "AGENTS.md",
    content: "# Agent instructions\n\nBe careful. This file names no agent framework and declares no dependency.\n",
  },
];

/** Every pack id declared by an agent-runtime-shaped pack in catalog/packs/ai.yaml. */
export const AGENT_RUNTIME_PACK_ID = "AGENT_RUNTIME";

/** Code point order, never `localeCompare`: no locale may reorder an emitted array. */
function byCodePoint(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * The manifest, serialized exactly as the fixture writes it.
 *
 * `yaml.stringify` rather than a hand-rolled line join: the manifest is read
 * back by the same parser the shipped code uses, so producing it with anything
 * else would make the fixture's own encoding a second thing to keep true.
 */
function manifestBytes(manifest: ProjectStackManifest): string {
  return stringify(manifest);
}

/** The complete file set a spec materializes, manifest included, sorted. */
function filesOf(spec: DomainFixtureSpec): FixtureFile[] {
  const files = [...spec.files];
  if (spec.manifest !== null) {
    files.push({ path: PROJECT_MANIFEST_PATH, content: manifestBytes(spec.manifest) });
  }
  return files.sort((left, right) => byCodePoint(left.path, right.path));
}

/**
 * What a fixture IS, structurally: its sorted file paths and its sorted
 * project-manifest keys.
 *
 * This is the value the one-edit assertion compares. Comparing rendered bytes
 * would make a whitespace change look like a drifted twin; comparing only the
 * file list would miss a manifest key entirely.
 */
export interface FixtureShape {
  readonly files: readonly string[];
  readonly manifestKeys: readonly string[];
}

export function describeFixture(spec: DomainFixtureSpec): FixtureShape {
  return {
    files: filesOf(spec).map((file) => file.path),
    manifestKeys: spec.manifest === null ? [] : Object.keys(spec.manifest).sort(byCodePoint),
  };
}

/** The spec a twin materializes: the positive with exactly one thing removed. */
export function nearMissSpec(domain: PackDomain): DomainFixtureSpec {
  const spec = DOMAIN_FIXTURES[domain];
  const edit = spec.nearMissEdit;

  if (edit.kind === "file") {
    const remaining = spec.files.filter((file) => file.path !== edit.path);
    if (remaining.length === spec.files.length) {
      throw new Error(`${domain}: the near-miss edit removes ${edit.path}, which the positive fixture does not write`);
    }
    return { ...spec, files: remaining };
  }

  if (spec.manifest === null) {
    throw new Error(`${domain}: the near-miss edit removes the manifest key ${edit.key}, but the fixture writes no manifest`);
  }
  const manifest = { ...spec.manifest } as Record<string, unknown>;
  if (!Object.hasOwn(manifest, edit.key)) {
    throw new Error(`${domain}: the near-miss edit removes the manifest key ${edit.key}, which the fixture does not set`);
  }
  delete manifest[edit.key];
  return { ...spec, manifest: manifest as unknown as ProjectStackManifest };
}

/**
 * What one twin actually changed, relative to its positive.
 *
 * Both directions are reported. A twin that ADDS something to compensate for
 * what it removed is a different repository rather than a twin, and a
 * difference recorded only as a removal count would not say so.
 */
export interface FixtureDifference {
  readonly removedFiles: readonly string[];
  readonly addedFiles: readonly string[];
  readonly removedManifestKeys: readonly string[];
  readonly addedManifestKeys: readonly string[];
}

function missingFrom(before: readonly string[], after: readonly string[]): string[] {
  const present = new Set(after);
  return before.filter((entry) => !present.has(entry)).sort(byCodePoint);
}

/**
 * The structural difference between a domain's positive fixture and its twin.
 *
 * Computed from the two SHAPES rather than from the declared edit, so the
 * declared edit and the materialized one cannot drift apart: the caller
 * asserts that this difference is exactly one thing AND that it is the thing
 * the table declares. Deriving it from `nearMissEdit` would make that second
 * assertion tautological.
 */
export function nearMissDifference(domain: PackDomain): FixtureDifference {
  const positive = describeFixture(DOMAIN_FIXTURES[domain]);
  const twin = describeFixture(nearMissSpec(domain));
  return {
    removedFiles: missingFrom(positive.files, twin.files),
    addedFiles: missingFrom(twin.files, positive.files),
    removedManifestKeys: missingFrom(positive.manifestKeys, twin.manifestKeys),
    addedManifestKeys: missingFrom(twin.manifestKeys, positive.manifestKeys),
  };
}

async function materialize(spec: DomainFixtureSpec, root: string): Promise<string> {
  for (const file of filesOf(spec)) {
    const absolute = join(root, ...file.path.split("/"));
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, file.content, "utf8");
  }
  return root;
}

/**
 * Materializes one domain's POSITIVE fixture under `root`.
 *
 * `root` is supplied by the caller so ownership of the temporary directory —
 * and therefore its removal — stays with the test that created it.
 */
export async function createDomainFixture(domain: PackDomain, root: string): Promise<string> {
  return materialize(DOMAIN_FIXTURES[domain], root);
}

/** Materializes one domain's TWIN: the same scaffold, one leaf removed. */
export async function createNearMissFixture(domain: PackDomain, root: string): Promise<string> {
  return materialize(nearMissSpec(domain), root);
}

/** Materializes the generic-agent-instructions repository under `root`. */
export async function createGenericInstructionsFixture(root: string): Promise<string> {
  for (const file of GENERIC_INSTRUCTIONS_FIXTURE) {
    const absolute = join(root, ...file.path.split("/"));
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, file.content, "utf8");
  }
  return root;
}

/** Removes a materialized fixture. Retried, because Windows holds handles briefly. */
export async function removeFixture(root: string): Promise<void> {
  await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
}
