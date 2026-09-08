// `RootReason` is declared beside the ladder that produces it, so the reason
// vocabulary and the resolver can never drift apart. The scan-completeness
// records are imported for the same reason: `ScanBound` and `ExcludedBoundary`
// are produced by the walk, so the plan carries the walk's own vocabulary
// rather than a restatement that could drift from it.
import type { DroppedMember, ExcludedBoundary, RootReason, ScanBound } from "./core/evidence.js";

export type HarnessId = "claude" | "codex" | "antigravity" | "pi" | "hermes";
export type McpServerId = "context7" | "exa" | "firecrawl";
export type Channel = "stable" | "candidate" | "pinned";
export type IsolationMode = "managed" | "project-only" | "sealed";

export interface HarnessConfig {
  displayName: string;
  gsdTarget?: string;
  gsdStrategy?: string;
  eccTarget?: string;
  eccStrategy?: string;
}

export interface OwnedSkillConfig {
  id: string;
  source: string;
  targets: HarnessId[];
  invocation: "explicit" | "automatic";
  argumentHint?: string;
  requires: { component: "gsd"; workflow: string };
}

export interface StackCatalog {
  schemaVersion: 1;
  name: "alpha-aos";
  defaultChannel: Channel;
  channels: Record<string, { lock?: string; description: string }>;
  harnesses: Record<HarnessId, HarnessConfig>;
  components: {
    gsd: { package: string; profile: string; targets: HarnessId[] };
    ecc: { package: string; globalSkills: string[]; profileInstallAllowed: boolean };
    mcp: { rolloutOrder: McpServerId[]; targets: HarnessId[] };
    ownedSkills: OwnedSkillConfig[];
  };
  policy: {
    mutationDefault: "dry-run";
    requireSnapshot: boolean;
    requireCanary: boolean;
    canaryHarness: HarnessId;
    forbidManagedFilePatches: boolean;
    autoApplyMarkdownOnly: boolean;
    requireApprovalFor: string[];
  };
}

export interface LockedPackage {
  package: string;
  version: string;
  integrity: string;
}

export interface StackLock {
  schemaVersion: 1;
  channel: Channel;
  generatedAt: string | null;
  status?: string;
  components: {
    gsd?: LockedPackage & { profile: string };
    ecc?: LockedPackage & {
      skills: string[];
      sourceSha256: Record<string, string>;
      targetSha256: Record<string, Partial<Record<HarnessId, string>>>;
    };
    mcp?: Record<string, LockedPackage>;
    mcpBridges?: Partial<Record<HarnessId, LockedPackage>>;
    ownedSkills?: Record<string, {
      sourceSha256: string;
      targetSha256: Partial<Record<HarnessId, string>>;
      upstreamWorkflow: string;
    }>;
  };
}

export interface HarnessInventory {
  id: HarnessId;
  displayName: string;
  command: string | null;
  version: string | null;
  configRoots: string[];
  detected: boolean;
  notes: string[];
}

export interface Inventory {
  schemaVersion: 1;
  generatedAt: string;
  platform: NodeJS.Platform;
  architecture: string;
  tools: Record<string, { version: string | null; command: string | null }>;
  harnesses: HarnessInventory[];
}

export interface PlanAction {
  id: string;
  phase: number;
  component: string;
  target: string;
  operation: "check" | "install" | "register" | "bridge" | "verify";
  command: string | null;
  writes: boolean;
  approval: boolean;
  note: string;
}

export interface DoctorFinding {
  level: "ok" | "info" | "warning" | "error";
  code: string;
  message: string;
}

export interface ProjectIsolationPolicy {
  mode: IsolationMode;
  allowedHarnesses: HarnessId[];
  exclusive: boolean;
  inherit: {
    globalConfig: boolean;
    globalSkills: boolean;
    globalMcp: boolean;
    globalMemory: boolean;
    globalHooks: boolean;
  };
  allowedSkills: string[];
  allowedMcp: string[];
  execution: {
    isolation: "process" | "container";
    network: "inherited" | "disabled" | "allowlist";
    environment: "inherited" | "allowlist";
  };
}

export interface ProjectStackManifest {
  schemaVersion: 1;
  trusted?: boolean;
  packs?: string[];
  criticalUserFlows?: string[];
  scientificResearch?: boolean;
  securityReview?: boolean;
  /** D-06: force any declared pack on or off. The override is recorded as evidence. */
  packOverrides?: Record<string, PackOverride>;
  isolation?: ProjectIsolationPolicy;
}

export interface IsolationLaunchSpec {
  projectId: string;
  projectRoot: string;
  harness: HarnessId;
  mode: IsolationMode;
  runtimeRoot: string;
  executable: string | null;
  args: string[];
  env: Record<string, string>;
  guarantees: string[];
  warnings: string[];
  blockedReasons: string[];
}

export interface IsolationPlan {
  schemaVersion: 1;
  projectId: string;
  projectRoot: string;
  manifestPath: string;
  runtimeRoot: string;
  policy: ProjectIsolationPolicy;
  launches: IsolationLaunchSpec[];
  generatedFiles: string[];
}

export interface PathAliases {
  roots: Array<{ alias: string; root: string }>;
}

export interface RedactionContext {
  exact: Set<string>;
  aliases: PathAliases;
}

export interface ObservableEnvelope {
  value: unknown;
  text: string;
  truncated: boolean;
  sha256: string;
}

export interface RedactedExcerpt {
  excerpt: string;
  capped: boolean;
  totalBytes: number;
  sha256: string;
}

export interface SupportBundleSource {
  label: string;
  aliasPath: string;
  byteLength: number;
  sha256: string | null;
  mode: string | null;
  opaque: boolean;
  preview: RedactedExcerpt | null;
  missing: boolean;
}

export interface SupportBundlePlan {
  schemaVersion: 1;
  destination: string;
  createdBy: string;
  network: "none";
  sources: SupportBundleSource[];
  planDigest: string;
}

// ---------------------------------------------------------------------------
// Phase 2: evidence-bound project planning
// ---------------------------------------------------------------------------

/**
 * One observation about a repository. `path` and `version` are recorded so an
 * explanation can name what selected a pack; a per-fact `hash` is deliberately
 * absent, so an unrelated edit to a file does not disturb the fact it carries.
 */
export interface EvidenceFact {
  id: string;
  kind: string;
  /** Negative observations are recorded, never omitted. */
  detected: boolean;
  path?: string;
  version?: string;
  /** Why a near-match failed. Present on negative evidence. */
  reason?: string;
}

/** Matches the sealed envelope in `schemas/evidence.schema.json`. */
export interface EvidenceEnvelope {
  schemaVersion: 1;
  projectId: string;
  producer: { name: string; version: string };
  /** Wall-clock context only. It must never reach a digest. */
  createdAt: string;
  /** Digest of the canonical repository state this evidence was derived from. */
  sourceHash: string;
  facts: EvidenceFact[];
}

/**
 * The predicate shape `catalog/packs/*.yaml` already uses. `all` and `any`
 * items are either a declared fact id or a nested node; nesting is bounded at
 * four levels by `schemas/pack-catalog.schema.json`, so a hostile document
 * cannot make validation cost unbounded.
 */
export interface EvidenceNode {
  all?: Array<string | EvidenceNode>;
  any?: Array<string | EvidenceNode>;
  anyFiles?: string[];
  anyDependencies?: string[];
  manifestOptIn?: string;
}

/**
 * The six bounded detector kinds. Kinds are code; instances are data, which is
 * what keeps adding a fact out of TypeScript.
 */
export type DetectorKind =
  | "dependency"
  | "file"
  | "directory"
  | "manifestKey"
  | "fileAbsent"
  | "fileContent";

/** One entry of `catalog/facts.yaml`. Matches `schemas/fact-vocabulary.schema.json`. */
export interface FactDeclaration {
  id: string;
  kind: DetectorKind;
  /** `dependency`: package names read from a declared manifest. */
  packages?: string[];
  /** `file` / `fileAbsent`, and the search set for `fileContent`. */
  files?: string[];
  /** `directory`: directory paths relative to the canonical root. */
  directories?: string[];
  /** `manifestKey`: the project-manifest key that carries this fact. */
  manifestKey?: string;
  /** `fileContent`: repository-owned match vocabulary, never read from the scanned project. */
  patterns?: string[];
  /** This fact also exists in repositories that are not this kind of project. */
  broad?: boolean;
  description?: string;
  /** The requirement id that owns a fact declared here but not implemented in this phase. */
  deferredTo?: string;
}

export interface FactVocabulary {
  schemaVersion: number;
  facts: FactDeclaration[];
}

export interface PackDeclaration {
  id: string;
  evidence: EvidenceNode;
  skills?: string[];
  lifecycle?: string;
  selectionPolicy?: string;
}

export interface PackCatalog {
  schemaVersion: number;
  packs: PackDeclaration[];
}

/** One leaf of a pack predicate, evaluated without short-circuiting. */
export interface LeafResult {
  factId: string;
  detected: boolean;
  path: string | null;
  reason: string | null;
  /** This fact also exists in repositories that are not this kind of project. */
  broad: boolean;
  /** The leaf rendered from the declared vocabulary, never from a per-pack string. */
  phrase: string;
}

/**
 * How a pack ended up where it did.
 *
 * `unimplemented` is deliberately distinct from `silent`: a pack naming a fact
 * the vocabulary declares with `deferredTo` can NEVER select, and reporting it
 * as an ordinary non-match would make a permanently unselectable pack
 * indistinguishable from an unqualified repository.
 */
export type PackStatus =
  | "selected"
  | "near-miss"
  | "silent"
  | "unimplemented"
  | "forced-on"
  | "forced-off";

/**
 * The two values a `packOverrides` entry may carry.
 *
 * Spelled `force-on` / `force-off` rather than `on` / `off` because YAML 1.1
 * resolves bare `on` and `off` as booleans, and a user who wrote the obvious
 * thing would have had their override silently refused by the enum.
 */
export type PackOverride = "force-on" | "force-off";

/** A fact declared but deliberately unimplemented, with the requirement that owns it. */
export interface DeferredFact {
  factId: string;
  deferredTo: string;
}

export interface PackEvaluation {
  packId: string;
  status: PackStatus;
  /** Every leaf that held. */
  satisfied: LeafResult[];
  /** Every leaf that did not, each with a reason. */
  failed: LeafResult[];
  /** Leaves whose fact is declared but has no detector in this phase. */
  deferred: DeferredFact[];
  /**
   * Leaves naming a fact `catalog/facts.yaml` does not declare at all.
   *
   * `loadPackCatalogStrict` refuses such a pack at load, so this is empty on
   * every supported route. It exists because the fail-closed answer for a
   * predicate that arrived some other way must be `unimplemented` naming the
   * offending fact, never an ordinary non-match.
   */
  undeclared: string[];
  /** The whole outcome as one line, rendered from the fact vocabulary. */
  explanation: string;
  /** Why the project manifest forced this pack, when it did. */
  overrideReason: string | null;
}

/** One discovered sub-project and the decision it reaches on its own evidence. */
export interface SubProjectDecision {
  /** Relative POSIX path from the canonical root. */
  path: string;
  /** The project-declaration file that proves it is a project. */
  declarationFile: string;
  selected: string[];
}

/**
 * How much is actually known about a harness surface.
 *
 * The vocabulary is the project's own, declared verbatim in
 * `.planning/research/ARCHITECTURE.md`: `supported` means a real probe passed,
 * NOT that an adapter contains a plausible filename. `unverified` is the
 * honest answer for a surface nothing has proven, and is deliberately the
 * fail-closed default — an over-claimed `supported` is the failure that costs
 * a user their opt-out guarantee.
 */
export type SurfaceSupport = "supported" | "unsupported" | "unverified";

/** Exact source version and hash for one pack skill, read from the stable lock. */
export interface PackSource {
  packId: string;
  skill: string;
  package: string;
  version: string;
  integrity: string;
  sourceSha256: string;
}

/** The render a pack skill passes through on its way to a target. */
export interface PlanRenderer {
  id: string;
  version: string;
  /** True when the rendered bytes equal the source bytes for every pack skill. */
  identity: boolean;
  note: string;
}

/** What is already at one target path, read and never written. */
export interface TargetPreState {
  packId: string;
  skill: string;
  harness: HarnessId;
  /** Relative POSIX path from the canonical root. */
  path: string;
  exists: boolean;
  currentHash: string | null;
  /** True when a receipt under the receipt directory claims this exact path. */
  ownedByReceipt: boolean;
  /** The hash the render would produce. Identity render, so the source hash. */
  expectedHash: string;
  action: "create" | "update" | "current";
}

/** One thing a reviewer must accept before an apply is honest. */
export interface PlanApproval {
  code: string;
  detail: string;
}

/** How to undo one planned target, and the hash that guards the undo. */
export interface SafeInverse {
  packId: string;
  operation: "remove" | "restore";
  guard: { path: string; expectedHash: string };
}

/** Who produced the plan. Mirrors the evidence envelope's `producer` shape. */
export interface PlanOwner {
  id: string;
  producer: { name: string; version: string };
}

/**
 * Why a DETC-05 noun is null rather than absent.
 *
 * Mirrors the `deferredTo` attribution the fact vocabulary already uses for
 * facts owned by a later requirement: a deliberately empty slot is declared
 * and attributed, so it can never be mistaken for one nobody considered.
 */
export interface DeferredSlot {
  deferredTo: string;
  reason: string;
}

/** One harness's project-scope classification and the evidence behind it. */
export interface AdapterSupportEntry {
  harness: HarnessId;
  support: SurfaceSupport;
  reason: string;
}

export interface ProjectCapabilityPlan {
  schemaVersion: 1;
  scope: {
    canonicalRoot: string;
    rootReason: RootReason;
    projectId: string;
    subProjectPath: string | null;
  };
  /** DETC-04: who produced this plan. */
  owner: PlanOwner;
  /** DETC-04: exact source version and hash, per selected pack skill. Sorted. */
  source: PackSource[];
  /** DETC-04: the render identity every pack skill passes through. */
  renderer: PlanRenderer;
  /** DETC-04: what is already at each target path. Sorted by path. */
  targetPreState: TargetPreState[];
  /** DETC-04: one classification per declared harness. */
  adapterSupport: Record<HarnessId, SurfaceSupport>;
  /** The recorded evidence behind each `adapterSupport` value. Sorted by harness. */
  adapterSupportEvidence: AdapterSupportEntry[];
  /** DETC-04: what a reviewer must accept. Sorted by code, then detail. */
  approvals: PlanApproval[];
  /** DETC-04: how to undo each planned target. Sorted by guard path. */
  safeInverse: SafeInverse[];
  /**
   * DETC-05's `executable` noun.
   *
   * Phase 2's `plan` and `approve` spawn nothing, so the honest value is
   * `null` — not a placeholder path, not an empty string, not an empty array.
   * The key is present and travels into the digestable view, so the slot Phase
   * 3 fills is already one the drift refusal watches.
   */
  executable: null;
  executableDisposition: DeferredSlot;
  /** Where Phase 3 writes a receipt and Phase 2 reads one. A Phase 2 decision. */
  receiptDirectory: string;
  /** Every declared pack, evaluated in full. Never short-circuited, never filtered. */
  evaluations: PackEvaluation[];
  /** Pack ids the evidence (or an explicit manifest force-on) selected, sorted. */
  selected: string[];
  /** Selected packs minus the ones a D-11 target conflict dropped. Sorted. */
  applicable: string[];
  /** Near-miss pack ids, ranked: descending satisfied-leaf count, then ascending id. */
  nearMissOrder: string[];
  /** Discovered sub-projects and their own decisions. Empty unless a workspace was found. */
  subProjects: SubProjectDecision[];
  /**
   * Every scan bound reached, sorted by bound name then by the path where the
   * bound was first reached.
   *
   * An EMPTY array means the scan was COMPLETE, not merely that nothing was
   * reported. That sentence is the point of the field: without it a reader
   * treats emptiness as an absence of information, and a truncated scan that
   * looks complete is a wrong answer that still looks like a decision. A
   * non-empty array means every conclusion in this plan was drawn over a tree
   * the walk did not finish reading (02-REVIEW CR-03).
   */
  scanBounds: ScanBound[];
  /**
   * Paths the walk could not DECIDE — unreadable, or governed by an ignore
   * rule set that could not be taken on. Sorted by path, then reason.
   *
   * An EMPTY array means every path was decided, not merely that nothing was
   * reported. An ordinary, intended exclusion — an ignored path, a `.git`
   * entry, a declared submodule, a vendored directory, an alias — is a
   * DECISION and belongs in `excludedBoundaries`; only a path the walk could
   * not answer for belongs here.
   */
  undecidableBoundaries: ExcludedBoundary[];
  /**
   * EVERY boundary the walk and the discovery refused, decided ones included,
   * sorted by path then reason. `undecidableBoundaries` is the subset of this
   * list the walk could not answer for.
   *
   * An EMPTY array means nothing was refused, not merely that nothing was
   * reported. Rendered under `--why` only: an ordinary repository excludes
   * many paths for ordinary reasons, and printing them by default would bury
   * the disclosure that actually changes how the answer should be read.
   */
  excludedBoundaries: ExcludedBoundary[];
  /**
   * Declared workspace members the discovery dropped, each carrying the entry
   * as the user wrote it, its ecosystem and why it was dropped. Sorted by
   * ecosystem then declared entry.
   *
   * An EMPTY array means every declared entry resolved, not merely that
   * nothing was reported. A typo'd entry, a member behind a boundary and a
   * traversal escape used to vanish identically and silently; naming all
   * three is what turns them back into three different reviewable facts
   * (02-REVIEW WR-08).
   */
  droppedMembers: DroppedMember[];
  /**
   * DETC-05's manifest noun: sha256 of `.alpha-aos/stack.yaml`'s bytes, or
   * `null` when the project declares none.
   *
   * Folding it into `inputsDigest` would have made it detectable but not
   * NAMEABLE: an approve could refuse, and could not say the manifest is what
   * moved. D-13 turns on exactly that distinction.
   */
  manifestDigest: string | null;
  /** Did anything we looked at change? Carries the evidence envelope's sourceHash. */
  inputsDigest: string;
  /** Did the selection-relevant observations change? */
  evidenceDigest: string;
  /** Digest of everything a reviewer would look at. */
  planDigest: string;
}
