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

export interface ProjectDetection {
  root: string;
  evidence: string[];
  packs: string[];
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
