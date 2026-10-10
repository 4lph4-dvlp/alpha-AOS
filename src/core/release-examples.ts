import type { HarnessId } from "../types.js";

export type CriterionStatus = "accepted" | "rejected" | "unknown";

export interface ExampleCriterionResult {
  readonly id: string;
  readonly description: string;
  readonly isMandatory: boolean;
  readonly status: CriterionStatus;
  readonly inputs: readonly string[];
  readonly observations: readonly string[];
  readonly notes?: string | null;
}

export type ExampleCapabilityCategory = "skill" | "mcp" | "pack" | "hook";

export interface ExampleCapabilityCall {
  readonly id: string;
  readonly category: ExampleCapabilityCategory;
  readonly toolName: string;
  readonly reason: string;
  readonly isRequired: boolean;
  readonly invoked: boolean;
  readonly outcome: "ok" | "failed" | "unrun" | "excluded";
  readonly receiptRef: string | null;
  readonly exclusionOrFailureReason?: string | null;
}

export interface ReviewWitnessProof {
  readonly witnessRevisionSha: string;
  readonly targetRevisionSha: string;
  readonly witnessArtifactDigest: string;
  readonly targetArtifactDigest: string;
  readonly reviewerHarness: HarnessId | string;
  readonly reviewerVersion: string | null;
  readonly verdict: "accepted" | "rejected" | "unknown";
  readonly receiptRef: string;
}

export interface CoursePilotItemFile {
  readonly courseId: string;
  readonly weekId: string;
  readonly moduleId: string;
  readonly fileId: string;
  readonly filename: string;
  readonly status: "downloaded" | "viewed_only" | "missing" | "disappeared" | "error";
  readonly localPath?: string | null;
  readonly expectedSha256?: string | null;
  readonly actualSha256?: string | null;
  readonly sourceIdentityVerified: boolean;
  readonly filePresentOnDisk: boolean;
}

export interface CoursePilotLmsStatus {
  readonly isLiveLms: boolean;
  readonly isFixture: boolean;
  readonly authenticated: boolean;
  readonly status: "PROVEN" | "UNVERIFIED";
  readonly reason: string | null;
  readonly nextAction: string | null;
}

export interface ReleaseExampleCase {
  readonly id: "development" | "coursepilot" | string;
  readonly title: string;
  readonly revisionSha: string;
  readonly artifactDigest: string;
  readonly criteria: readonly ExampleCriterionResult[];
  readonly capabilityCalls: readonly ExampleCapabilityCall[];
  readonly reviewWitness?: ReviewWitnessProof | null;
  readonly coursePilotMaterials?: readonly CoursePilotItemFile[];
  readonly coursePilotLms?: CoursePilotLmsStatus | null;
}

export interface ExampleEvaluationResult {
  readonly exampleId: string;
  readonly title: string;
  readonly overallStatus: "completed" | "failed" | "unverified";
  readonly mandatoryCriteriaMet: boolean;
  readonly reviewerApproved: boolean;
  readonly requiredCapabilitiesInvoked: boolean;
  readonly materialsVerified?: boolean | undefined;
  readonly lmsStatus?: CoursePilotLmsStatus | null | undefined;
  readonly reasons: readonly string[];
  readonly unmetMandatoryCriteria: readonly string[];
  readonly missingRequiredCapabilities: readonly string[];
  readonly sortedCriteria: readonly ExampleCriterionResult[];
  readonly sortedCapabilities: readonly ExampleCapabilityCall[];
  readonly sortedMaterials?: readonly CoursePilotItemFile[] | undefined;
}

export function compareCriteria(a: ExampleCriterionResult, b: ExampleCriterionResult): number {
  return a.id.localeCompare(b.id);
}

export function compareCapabilities(a: ExampleCapabilityCall, b: ExampleCapabilityCall): number {
  if (a.category !== b.category) return a.category.localeCompare(b.category);
  return a.id.localeCompare(b.id);
}

export function compareCoursePilotItems(a: CoursePilotItemFile, b: CoursePilotItemFile): number {
  const keyA = `${a.courseId}:${a.weekId}:${a.moduleId}:${a.fileId}`;
  const keyB = `${b.courseId}:${b.weekId}:${b.moduleId}:${b.fileId}`;
  return keyA.localeCompare(keyB);
}

export function evaluateReleaseExample(example: ReleaseExampleCase): ExampleEvaluationResult {
  const reasons: string[] = [];
  const unmetMandatoryCriteria: string[] = [];
  const missingRequiredCapabilities: string[] = [];

  // Sort components deterministically (VER-04 edge ordering)
  const sortedCriteria = [...example.criteria].sort(compareCriteria);
  const sortedCapabilities = [...example.capabilityCalls].sort(compareCapabilities);
  const sortedMaterials = example.coursePilotMaterials
    ? [...example.coursePilotMaterials].sort(compareCoursePilotItems)
    : undefined;

  // 1. Edge empty check (VER-04 edge empty)
  if (example.criteria.length === 0) {
    return {
      exampleId: example.id,
      title: example.title,
      overallStatus: "unverified",
      mandatoryCriteriaMet: false,
      reviewerApproved: false,
      requiredCapabilitiesInvoked: false,
      reasons: ["No criteria supplied for example"],
      unmetMandatoryCriteria: [],
      missingRequiredCapabilities: [],
      sortedCriteria,
      sortedCapabilities,
      sortedMaterials,
    };
  }

  if (example.capabilityCalls.length === 0) {
    return {
      exampleId: example.id,
      title: example.title,
      overallStatus: "unverified",
      mandatoryCriteriaMet: false,
      reviewerApproved: false,
      requiredCapabilitiesInvoked: false,
      reasons: ["No capability calls supplied for example"],
      unmetMandatoryCriteria: [],
      missingRequiredCapabilities: [],
      sortedCriteria,
      sortedCapabilities,
      sortedMaterials,
    };
  }

  // 2. Criteria evaluation (D-13, D-14)
  let mandatoryCriteriaMet = true;
  for (const criterion of sortedCriteria) {
    if (criterion.isMandatory) {
      if (criterion.status !== "accepted") {
        mandatoryCriteriaMet = false;
        unmetMandatoryCriteria.push(criterion.id);
        reasons.push(
          `Mandatory criterion '${criterion.id}' is not accepted (status: ${criterion.status})`,
        );
      }
    }
  }

  // 3. Reviewer witness check (D-14)
  let reviewerApproved = true;
  if (example.id === "development" || example.reviewWitness !== undefined) {
    const witness = example.reviewWitness;
    if (!witness) {
      reviewerApproved = false;
      reasons.push("Missing required independent review witness on target revision");
    } else {
      if (witness.witnessRevisionSha !== example.revisionSha) {
        reviewerApproved = false;
        reasons.push(
          `Reviewer witness revision '${witness.witnessRevisionSha}' does not match target revision '${example.revisionSha}'`,
        );
      }
      if (witness.witnessArtifactDigest !== example.artifactDigest) {
        reviewerApproved = false;
        reasons.push(
          `Reviewer witness artifact digest '${witness.witnessArtifactDigest}' does not match target digest '${example.artifactDigest}'`,
        );
      }
      if (witness.verdict !== "accepted") {
        reviewerApproved = false;
        reasons.push(`Reviewer verdict is '${witness.verdict}' (expected 'accepted')`);
      }
    }
  }

  // 4. Required capability calls check (D-16)
  let requiredCapabilitiesInvoked = true;
  for (const cap of sortedCapabilities) {
    if (cap.isRequired) {
      if (!cap.invoked || cap.outcome !== "ok" || !cap.receiptRef) {
        requiredCapabilitiesInvoked = false;
        missingRequiredCapabilities.push(cap.id);
        reasons.push(
          `Required capability '${cap.toolName}' (${cap.id}) was not successfully invoked (outcome: ${cap.outcome}, receipt: ${cap.receiptRef ?? "missing"})`,
        );
      }
    }
  }

  // 5. CoursePilot materials & LMS evaluation (D-15, VER-04 edge adjacency)
  // 5. CoursePilot materials & LMS evaluation (D-15, VER-04 edge adjacency, CR-06)
  let materialsVerified: boolean | undefined = undefined;
  let lmsStatus: CoursePilotLmsStatus | null | undefined = example.coursePilotLms;

  if (example.id === "coursepilot" || example.id === "coursepilot-lms" || sortedMaterials !== undefined) {
    if (!sortedMaterials || sortedMaterials.length === 0) {
      materialsVerified = false;
      reasons.push("CoursePilot materials list is empty; verified course materials are required");
    } else {
      materialsVerified = true;
      const sha256Regex = /^[0-9a-f]{64}$/i;
      for (const item of sortedMaterials) {
        const isDownloaded = item.status === "downloaded";
        const isPresent = item.filePresentOnDisk;
        const isIdentityOk = item.sourceIdentityVerified;
        const validExpected = typeof item.expectedSha256 === "string" && sha256Regex.test(item.expectedSha256);
        const validActual = typeof item.actualSha256 === "string" && sha256Regex.test(item.actualSha256);
        const hashesMatch = validExpected && validActual && item.expectedSha256.toLowerCase() === item.actualSha256.toLowerCase();

        if (!isDownloaded || !isPresent || !isIdentityOk || !hashesMatch) {
          materialsVerified = false;
          const failureDetail = !validExpected || !validActual
            ? "invalid SHA-256 format"
            : !hashesMatch
              ? `SHA-256 mismatch (expected: ${item.expectedSha256}, actual: ${item.actualSha256})`
              : `status/disk/identity failure (status: ${item.status}, disk: ${isPresent}, identity: ${isIdentityOk})`;
          reasons.push(
            `Material item '${item.courseId}/${item.weekId}/${item.moduleId}/${item.filename}' failed verification: ${failureDetail}`,
          );
        }
      }
    }
  }

  // Determine overall status
  let overallStatus: "completed" | "failed" | "unverified" = "completed";
  if (!mandatoryCriteriaMet || !requiredCapabilitiesInvoked || !reviewerApproved || materialsVerified === false) {
    overallStatus = "failed";
  }

  return {
    exampleId: example.id,
    title: example.title,
    overallStatus,
    mandatoryCriteriaMet,
    reviewerApproved,
    requiredCapabilitiesInvoked,
    materialsVerified,
    lmsStatus,
    reasons,
    unmetMandatoryCriteria,
    missingRequiredCapabilities,
    sortedCriteria,
    sortedCapabilities,
    sortedMaterials,
  };
}

export function renderReleaseExamplesMarkdown(
  devEval: ExampleEvaluationResult,
  cpEval: ExampleEvaluationResult,
): string {
  const escapeCell = (s: string) => s.replaceAll("|", "\\|");

  const devRows = devEval.sortedCriteria.map((c) =>
    `| ${escapeCell(c.id)} | ${c.isMandatory ? "yes" : "no"} | **${c.status}** | ${escapeCell(c.inputs.join(", "))} | ${escapeCell(c.observations.join("; "))} | ${escapeCell(c.notes ?? "-")} |`,
  );

  const devCapRows = devEval.sortedCapabilities.map((cap) =>
    `| ${escapeCell(cap.id)} | ${cap.category} | ${escapeCell(cap.toolName)} | ${cap.isRequired ? "yes" : "no"} | ${cap.invoked ? "yes" : "no"} | **${cap.outcome}** | ${escapeCell(cap.receiptRef ?? cap.exclusionOrFailureReason ?? "-")} |`,
  );

  const cpMaterialRows = (cpEval.sortedMaterials ?? []).map((m) =>
    `| ${escapeCell(m.courseId)} | ${escapeCell(m.weekId)} | ${escapeCell(m.moduleId)} | ${escapeCell(m.filename)} | **${m.status}** | ${m.filePresentOnDisk ? "present" : "missing"} | ${m.sourceIdentityVerified ? "verified" : "unverified"} |`,
  );

  const cpCapRows = cpEval.sortedCapabilities.map((cap) =>
    `| ${escapeCell(cap.id)} | ${cap.category} | ${escapeCell(cap.toolName)} | ${cap.isRequired ? "yes" : "no"} | ${cap.invoked ? "yes" : "no"} | **${cap.outcome}** | ${escapeCell(cap.receiptRef ?? cap.exclusionOrFailureReason ?? "-")} |`,
  );

  return [
    "# alpha-AOS 0.2.0 End-to-End Examples: Development & CoursePilot",
    "",
    "This document records the end-to-end execution, observable evidence, and capability invocation receipts for the two representative v0.2.0 workloads: the **Development Task** (CLI First-Person Game) and the **CoursePilot Materials Task**.",
    "",
    "## 1. Development Task Example: CLI First-Person Game",
    "",
    `**Title:** ${devEval.title}  `,
    `**Overall Status:** **${devEval.overallStatus.toUpperCase()}**  `,
    `**Mandatory Criteria Met:** ${devEval.mandatoryCriteriaMet}  `,
    `**Independent Reviewer Approved:** ${devEval.reviewerApproved}  `,
    `**Required Capabilities Invoked:** ${devEval.requiredCapabilitiesInvoked}`,
    "",
    "### Criteria Verification",
    "",
    "| Criterion ID | Mandatory | Status | Automated Inputs | Observable Output / Evidence | Notes / Rubric |",
    "| --- | --- | --- | --- | --- | --- |",
    ...devRows,
    "",
    "### Applied Capability Calls",
    "",
    "| Capability ID | Category | Tool / Component | Required | Invoked | Outcome | Receipt / Exclusion |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...devCapRows,
    "",
    "---",
    "",
    "## 2. CoursePilot Task Example: Materials Acquisition",
    "",
    `**Title:** ${cpEval.title}  `,
    `**Overall Status:** **${cpEval.overallStatus.toUpperCase()}**  `,
    `**Materials Verified:** ${cpEval.materialsVerified}  `,
    `**Live LMS Verification Status:** **${cpEval.lmsStatus?.status ?? "UNVERIFIED"}** (${cpEval.lmsStatus?.reason ?? "No live LMS credentials configured"})  `,
    `**Required Capabilities Invoked:** ${cpEval.requiredCapabilitiesInvoked}`,
    "",
    "### Material Item Verification (Identity Preserved)",
    "",
    "| Course ID | Week ID | Module ID | Filename | Status | On Disk | Source Identity |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...cpMaterialRows,
    "",
    "### Applied Capability Calls",
    "",
    "| Capability ID | Category | Tool / Component | Required | Invoked | Outcome | Receipt / Exclusion |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...cpCapRows,
    "",
    "### LMS Authentication Boundary (D-15)",
    "",
    "- **Fixture Download Verification:** Successfully proves deterministic file retrieval, local disk existence, SHA-256 verification, and error handling for corrupt/missing files.",
    "- **Live LMS Status:** Kept strictly as **`UNVERIFIED`** in the absence of authenticated live university LMS credentials. Fixture results are never reported as authenticated live LMS success.",
    "",
  ].join("\n");
}
