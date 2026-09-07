// `RootReason` is declared beside the ladder that produces it, so the reason
// vocabulary and the resolver can never drift apart.
import type { RootReason } from "./core/evidence.js";

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
}

export interface PackEvaluation {
  packId: string;
  status: "selected" | "silent";
  /** Every leaf that held. */
  satisfied: LeafResult[];
  /** Every leaf that did not, each with a reason. */
  failed: LeafResult[];
}

export interface ProjectCapabilityPlan {
  schemaVersion: 1;
  scope: {
    canonicalRoot: string;
    rootReason: RootReason;
    projectId: string;
    subProjectPath: string | null;
  };
  selected: PackEvaluation[];
  /** Did anything we looked at change? Carries the evidence envelope's sourceHash. */
  inputsDigest: string;
  /** Did the selection-relevant observations change? */
  evidenceDigest: string;
  /** Digest of everything a reviewer would look at. */
  planDigest: string;
}
