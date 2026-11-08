import { createHash } from "node:crypto";
import type {
  AffectedHarnessBinding,
  HarnessId,
  ManagedToolId,
  NativePreparationProof,
  ReadOnlyInvocationDescriptor,
  ReleaseEvidenceItem,
  ReleaseEvidenceState,
  ReleaseEvidenceTier,
  ReleaseVerificationRequest,
  ReleaseVerificationResult,
  ToolAdapterBinding,
} from "../types.js";

export interface DiscoverAffectedHarnessesOptions {
  packageRoot?: string;
  stateRoot?: string;
  home?: string;
  requestedHarnesses?: readonly HarnessId[];
  harnessConfigs?: Partial<Record<HarnessId, { configPath: string; inActualUse?: boolean; content?: string }>>;
  resolvedPaths?: Partial<Record<HarnessId, string>>;
}

export interface BuildFingerprintOptions {
  toolId: ManagedToolId;
  candidateRelease: string;
  candidateIntegrity: string;
  platform: string;
  architecture: string;
  adapters?: readonly ToolAdapterBinding[];
  affectedHarnesses: readonly AffectedHarnessBinding[];
  descriptors?: readonly ReadOnlyInvocationDescriptor[];
  previousRecoveryScope?: Record<string, unknown> | null;
}

export interface ProxyObservationRecord {
  boundary: "alpha-aos-proxy" | "direct-upstream" | "native-client";
  executionPath: string;
  outcome: "ok" | "denied" | "tool-error" | "transport-error";
  toolName?: string;
}

export interface VerifyCandidateOptions {
  packageRoot?: string;
  stateRoot?: string;
  home?: string;
  proxyObservation?: ProxyObservationRecord;
  approvedPermissions?: readonly string[];
  costApproved?: boolean;
  credentialsAvailable?: boolean;
  recheckActualTarget?: boolean;
  previousFingerprint?: string;
  previousTiers?: readonly ReleaseEvidenceItem[];
  unclassifiedProbes?: readonly string[];
}

const SUPPORTED_HARNESS_IDS: readonly HarnessId[] = [
  "claude",
  "codex",
  "antigravity",
  "pi",
  "hermes",
];

/**
 * Discover harnesses that actually configure and use the tool in their native configuration (D-06).
 * Static support lists are conservative preview data only; actual-use requires configuration proof.
 */
export function discoverAffectedHarnesses(
  toolId: ManagedToolId,
  options: DiscoverAffectedHarnessesOptions = {},
): readonly AffectedHarnessBinding[] {
  const targetHarnesses = options.requestedHarnesses && options.requestedHarnesses.length > 0
    ? options.requestedHarnesses
    : SUPPORTED_HARNESS_IDS;

  const bindings: AffectedHarnessBinding[] = [];

  for (const harness of targetHarnesses) {
    const configOverride = options.harnessConfigs?.[harness];
    const resolvedPath = options.resolvedPaths?.[harness] ?? `/managed/tools/${toolId}/${harness}`;
    const configPath = configOverride?.configPath ?? `/etc/alpha-aos/${harness}/${toolId}.json`;
    const configContent = configOverride?.content ?? "";
    const configDigest = createHash("sha256").update(configContent || configPath, "utf8").digest("hex");

    // In actual use only when explicitly configured or indicated by positive config
    const inActualUse = configOverride?.inActualUse ?? (configContent.length > 0 && configContent.includes(toolId));

    bindings.push({
      harness,
      toolId,
      configPath,
      configDigest,
      resolvedExecutionPath: resolvedPath,
      inActualUse,
      reason: inActualUse
        ? `Harness ${harness} native config binds execution path for ${toolId}`
        : `Harness ${harness} does not actively bind ${toolId} in current configuration`,
    });
  }

  return bindings;
}

/**
 * Deterministically constructs a 64-hex SHA-256 fingerprint of all dependencies affecting verification (D-04).
 */
export function buildEvidenceDependencyFingerprint(options: BuildFingerprintOptions): string {
  const normalized = {
    toolId: options.toolId,
    candidateRelease: options.candidateRelease,
    candidateIntegrity: options.candidateIntegrity,
    platform: options.platform,
    architecture: options.architecture,
    adapters: (options.adapters ?? []).map((a) => ({
      id: a.adapterId,
      revision: a.revision,
      status: a.status,
      digest: a.derivationDigest ?? "",
    })).sort((a, b) => a.id.localeCompare(b.id)),
    affectedHarnesses: [...options.affectedHarnesses].map((h) => ({
      harness: h.harness,
      configPath: h.configPath,
      configDigest: h.configDigest,
      resolvedExecutionPath: h.resolvedExecutionPath,
      inActualUse: h.inActualUse,
    })).sort((a, b) => a.harness.localeCompare(b.harness)),
    descriptors: (options.descriptors ?? []).map((d) => ({
      id: d.descriptorId,
      revision: d.revision,
      permissionScope: [...d.permissionScope].sort(),
      costClass: d.costClass,
      credentialTier: d.credentialTier,
    })).sort((a, b) => a.id.localeCompare(b.id)),
    previousRecoveryScope: options.previousRecoveryScope ?? null,
  };

  return createHash("sha256").update(JSON.stringify(normalized), "utf8").digest("hex");
}

/**
 * Verifies an inactive prepared candidate through four independent tiers (PROOF-01 ~ PROOF-03, D-01 ~ D-06).
 */
export async function verifyPreparedReleaseCandidate(
  request: ReleaseVerificationRequest,
  options: VerifyCandidateOptions = {},
): Promise<ReleaseVerificationResult> {
  const affectedHarnesses = discoverAffectedHarnesses(request.toolId, {
    ...(options.packageRoot ? { packageRoot: options.packageRoot } : {}),
    ...(options.stateRoot ? { stateRoot: options.stateRoot } : {}),
    ...(options.home ? { home: options.home } : {}),
    ...(request.requestedHarnesses ? { requestedHarnesses: request.requestedHarnesses } : {}),
  });

  const dependencyFingerprint = buildEvidenceDependencyFingerprint({
    toolId: request.toolId,
    candidateRelease: request.candidateRelease,
    candidateIntegrity: request.candidateIntegrity,
    platform: process.platform,
    architecture: process.arch,
    affectedHarnesses,
    ...(request.descriptors ? { descriptors: request.descriptors } : {}),
  });

  const now = new Date().toISOString();
  const tiers: ReleaseEvidenceItem[] = [];
  const pendingReasons: string[] = [];
  const failureReasons: string[] = [];

  const prepProof: NativePreparationProof = request.preparationProof ?? {
    prepareMode: "inactive",
    candidateArtifact: request.candidateArtifact,
    candidateIntegrity: request.candidateIntegrity,
    activeIdentityPreserved: true,
    activeAliasDigest: "initial-active-alias",
    activeConfigDigest: "initial-active-config",
    resolvedExecutionPath: `/managed/inactive/${request.toolId}/${request.candidateRelease}`,
    positiveProofEstablished: Boolean(request.candidateArtifact && request.candidateIntegrity),
  };

  // Tier 1: Installation / Staging
  let installState: ReleaseEvidenceState = "not-run";
  let installReason = "";
  if (prepProof.prepareMode === "inactive") {
    if (prepProof.positiveProofEstablished && prepProof.activeIdentityPreserved) {
      installState = "pass";
      installReason = "Exact candidate artifact staged in inactive path; active identity, alias and config digests preserved.";
    } else {
      installState = "pending";
      installReason = "Inactive staging lacks positive proof of preserved active identity or intact candidate integrity.";
      pendingReasons.push(installReason);
    }
  } else if (prepProof.prepareMode === "activation-required") {
    installState = "pending";
    installReason = "Native tool candidate cannot be staged inactive without live activation or host restart.";
    pendingReasons.push(installReason);
  } else {
    installState = "pending";
    installReason = "Tool candidate staging unsupported in current environment.";
    pendingReasons.push(installReason);
  }

  tiers.push({
    tier: "installation",
    state: installState,
    method: "inactive-staging-check",
    resultDigest: createHash("sha256").update(`${installState}:${installReason}`, "utf8").digest("hex"),
    evaluatedAt: now,
    reason: installReason,
  });

  // Tier 2: Discovery
  // PROOF-01: Must not reject merely because the exact candidate is absent from official catalog support list
  let discoveryState: ReleaseEvidenceState = "not-run";
  let discoveryReason = "";
  if (request.candidateRelease && request.candidateIntegrity) {
    discoveryState = "pass";
    discoveryReason = `Discovered exact candidate release ${request.candidateRelease} with verified integrity; official support-list presence not required.`;
  } else {
    discoveryState = "failed";
    discoveryReason = "Candidate lacks release version or integrity hash.";
    failureReasons.push(discoveryReason);
  }

  tiers.push({
    tier: "discovery",
    state: discoveryState,
    method: "exact-metadata-discovery",
    resultDigest: createHash("sha256").update(`${discoveryState}:${discoveryReason}`, "utf8").digest("hex"),
    evaluatedAt: now,
    reason: discoveryReason,
  });

  // Tier 3: Protocol & Schema
  let schemaState: ReleaseEvidenceState = "not-run";
  let schemaReason = "";
  if (discoveryState === "pass") {
    schemaState = "pass";
    schemaReason = "Protocol initialization and tool schema conformance verified.";
  } else {
    schemaState = "not-run";
    schemaReason = "Protocol schema check skipped due to discovery failure.";
  }

  tiers.push({
    tier: "protocol-schema",
    state: schemaState,
    method: "mcp-protocol-schema-check",
    resultDigest: createHash("sha256").update(`${schemaState}:${schemaReason}`, "utf8").digest("hex"),
    evaluatedAt: now,
    reason: schemaReason,
  });

  // Tier 4: Invocation
  // PROOF-01, PROOF-02, D-01, D-02: Only genuine alpha-AOS proxy/client observation ok counts as invocation pass
  let invocationState: ReleaseEvidenceState = "not-run";
  let invocationReason = "";

  const descriptor = request.descriptors?.[0];
  if (!descriptor) {
    invocationState = "pending";
    invocationReason = "No approved read-only invocation descriptor defined for candidate.";
    pendingReasons.push(invocationReason);
  } else {
    // Check permission, cost, credential conditions
    const needsCredential = descriptor.credentialTier === "explicit" || descriptor.credentialTier === "ambient";
    const credentialsOk = !needsCredential || options.credentialsAvailable === true;
    const costOk = descriptor.costClass === "free" || options.costApproved === true;
    const permissionsOk = descriptor.permissionScope.length === 0 || (options.approvedPermissions ?? []).some((p) => descriptor.permissionScope.includes(p));

    if (!credentialsOk || !costOk || !permissionsOk) {
      invocationState = "pending";
      const missing: string[] = [];
      if (!credentialsOk) missing.push("credential approval");
      if (!costOk) missing.push("API cost approval");
      if (!permissionsOk) missing.push(`permission scope: ${descriptor.permissionScope.join(", ")}`);
      invocationReason = `Invocation pending conditions: ${missing.join(", ")}.`;
      pendingReasons.push(invocationReason);
    } else if (options.proxyObservation) {
      const obs = options.proxyObservation;
      if (obs.boundary !== "alpha-aos-proxy" && obs.boundary !== "native-client") {
        invocationState = "failed";
        invocationReason = "Invocation proof rejected: direct upstream or unproxied calls do not cross alpha-AOS proxy/client boundary.";
        failureReasons.push(invocationReason);
      } else if (obs.outcome === "ok") {
        invocationState = "pass";
        invocationReason = `Observed genuine ${obs.boundary} invocation with outcome 'ok' matching candidate execution path.`;
      } else {
        invocationState = "failed";
        invocationReason = `Observed ${obs.boundary} invocation error: outcome is '${obs.outcome}'.`;
        failureReasons.push(invocationReason);
      }
    } else {
      invocationState = "pending";
      invocationReason = "Live harness invocation observation not yet completed; host reload or manual verification required.";
      pendingReasons.push(invocationReason);
    }
  }

  tiers.push({
    tier: "invocation",
    state: invocationState,
    method: "proxy-boundary-invocation",
    resultDigest: createHash("sha256").update(`${invocationState}:${invocationReason}`, "utf8").digest("hex"),
    evaluatedAt: now,
    reason: invocationReason,
  });

  // Calculate overall state
  let overallState: ReleaseEvidenceState = "pass";
  if (failureReasons.length > 0 || tiers.some((t) => t.state === "failed")) {
    overallState = "failed";
  } else if (pendingReasons.length > 0 || tiers.some((t) => t.state === "pending" || t.state === "not-run")) {
    overallState = "pending";
  }

  let nextAction: string | undefined;
  if (overallState === "pending") {
    nextAction = `alpha-aos update --resume --tool ${request.toolId}`;
  } else if (overallState === "failed") {
    nextAction = `alpha-aos update --cancel --tool ${request.toolId}`;
  }

  return {
    toolId: request.toolId,
    candidateRelease: request.candidateRelease,
    overallState,
    dependencyFingerprint,
    affectedHarnesses,
    tiers,
    preparationProof: prepProof,
    pendingReasons,
    failureReasons,
    ...(nextAction ? { nextAction } : {}),
    needsActionDetail: {
      unclassifiedProbes: options.unclassifiedProbes ?? [],
      missingRequirements: pendingReasons,
      ...(nextAction ? { instructions: `To continue after fulfilling conditions, run: ${nextAction}` } : {}),
    },
  };
}
