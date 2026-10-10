import type {
  CrashRepairPlan,
  CrashRepairResult,
  DoctorFinding,
  DriftDiagnostic,
  Inventory,
  IsolationLaunchSpec,
  IsolationPlan,
  OfflineStatus,
  PlanAction,
  ProjectCapabilityPlan,
  RecoveryReceipt,
  StackLock,
  TreePreviewReport,
  TreeRegistryEntry,
  TreeSurfaceInspection,
  UninstallPlan,
  UninstallResult,
} from "./types.js";
import { sortCapabilityReportRows, type CapabilityReportRow, type HandoffCanaryResult } from "./core/canary.js";
import {
  approvalCommand,
  describeLeaf,
  MAX_DISCLOSURE_LINES,
  MAX_NEAR_MISS_LINES,
  MAX_TARGET_ROWS,
  PROJECT_PLAN_ARTIFACT,
  type OneShotOffer,
  type ProjectApprovalResult,
  type ProjectReconciliation,
  type RemovalPlan,
} from "./core/project-plan.js";
import type { PackProvenance, ProjectPackSyncResult } from "./core/project-pack-sync.js";
import type { SupportMatrixReport, SupportTier } from "./core/support-matrix.js";
import type { TaskApprovalResult, TaskContractPreview } from "./core/task-contract.js";
import type { TaskRunRecord, TaskStartReadiness } from "./core/task-run.js";
import type { SupervisorResult, TaskResumeReadiness } from "./core/task-supervisor.js";
import type { TaskCheckpoint } from "./core/task-journal.js";
import type { TaskEffectLedger } from "./core/task-effects.js";
import { formatBlockedReport } from "./core/task-strategy.js";
import type { GsdLifecycleDiagnostics } from "./core/task-doctor.js";
import type { TaskCapabilityReport, TaskCapabilitySummary } from "./core/task-capability-inventory.js";
import type {
  FinalReviewReadiness,
  GateMilestoneFinalReviewResult,
} from "./core/task-final-review.js";
import type { GeneralTaskReportData } from "./core/task-connector.js";
import type { TaskReapprovalPreview } from "./adapters/coursepilot-task.js";

function table(headers: string[], rows: string[][]): string {
  const widths = headers.map((header, index) => Math.max(header.length, ...rows.map((row) => row[index]?.length ?? 0)));
  const render = (row: string[]) => row.map((cell, index) => cell.padEnd(widths[index] ?? cell.length)).join("  ").trimEnd();
  return [render(headers), render(widths.map((width) => "-".repeat(width))), ...rows.map(render)].join("\n");
}

export function formatInventory(inventory: Inventory): string {
  const rows = inventory.harnesses.map((harness) => [
    harness.id,
    harness.detected ? "yes" : "no",
    harness.version ?? "-",
    harness.configRoots.join(", ") || "-",
    harness.notes.join("; ") || "-",
  ]);
  const tools = Object.entries(inventory.tools).map(([name, value]) => `${name}=${value.version ?? "missing"}`).join(", ");
  return [`Platform: ${inventory.platform}/${inventory.architecture}`, `Tools: ${tools}`, "", table(["HARNESS", "FOUND", "VERSION", "CONFIG", "NOTES"], rows)].join("\n");
}

export function formatPlan(actions: PlanAction[]): string {
  const rows = actions.map((action) => [
    String(action.phase),
    action.id,
    action.operation,
    action.writes ? "write" : "read",
    action.approval ? "yes" : "no",
    action.command ?? action.note,
  ]);
  return `${table(["PHASE", "ACTION", "OP", "MODE", "APPROVAL", "COMMAND / NOTE"], rows)}\n\nDry-run only. No user or harness configuration was changed.`;
}

export function formatDoctor(findings: DoctorFinding[]): string {
  return table(["LEVEL", "CODE", "MESSAGE"], findings.map((finding) => [finding.level.toUpperCase(), finding.code, finding.message]));
}

const supportTierAnsi: Readonly<Record<SupportTier, string>> = {
  PROVEN: "\u001b[32m",
  RESIDUE: "\u001b[33m",
  UNVERIFIED: "\u001b[36m",
  UNSUPPORTED: "\u001b[31m",
};

export function formatSupportMatrixTable(
  report: SupportMatrixReport,
  options: { readonly color?: boolean } = {},
): string {
  const rows = report.cells.map((cell) => [
    cell.entry.harnessId,
    cell.entry.surface,
    cell.entry.platform,
    cell.tier,
    cell.receipt === null
      ? cell.evidenceSummary
      : `${cell.evidenceSummary}; ${cell.receipt.reference}`,
  ]);
  const rendered = [
    `alpha-AOS ${report.release} support matrix (${report.platform}, ${report.generatedAt})`,
    table(["HARNESS", "SURFACE", "PLATFORM", "STATUS", "EVIDENCE / NOTES"], rows),
  ].join("\n\n");
  const color = options.color ?? (process.stdout.isTTY === true && process.env.NO_COLOR === undefined);
  if (!color) return rendered;
  return (Object.keys(supportTierAnsi) as SupportTier[]).reduce(
    (text, tier) => text.replaceAll(tier, `${supportTierAnsi[tier]}${tier}\u001b[0m`),
    rendered,
  );
}

/**
 * One capped, deterministically ordered list plus the suppression line it owes.
 *
 * Shared by every scan-completeness list so a disclosure can never itself
 * become the flood that buries the rest of the rendering (T-02-54).
 */
function pushCapped<T>(lines: string[], items: readonly T[], render: (item: T) => string, noun: string): void {
  const shown = items.slice(0, MAX_DISCLOSURE_LINES);
  for (const item of shown) lines.push(render(item));
  const suppressed = items.length - shown.length;
  if (suppressed > 0) lines.push(`... ${suppressed} more ${noun} suppressed (use --json)`);
}

/**
 * C0 control characters rendered as their code point rather than emitted raw.
 *
 * A declaration entry is repository-authored text and may carry anything a
 * filesystem accepts. The VALUE stays verbatim in `droppedMembers.declared`;
 * only the rendering of it is made visible, so naming a hostile entry cannot
 * itself smuggle control bytes into a terminal.
 */
function visible(value: string): string {
  return value.replace(/\p{Cc}/gu, (character) => {
    const code = (character.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, "0");
    return `<U+${code}>`;
  });
}

/** What the scan could not finish reading, in the walk's own vocabulary. */
function emitDisclosure(lines: string[], plan: ProjectCapabilityPlan): void {
  pushCapped(
    lines,
    plan.scanBounds,
    (bound) =>
      `BOUNDED ${bound.bound}=${bound.limit} was reached at ${bound.at}; the scan is INCOMPLETE, so what follows is not a complete answer`,
    "scan bound(s)",
  );
  pushCapped(
    lines,
    plan.undecidableBoundaries,
    (entry) =>
      `UNDECIDABLE-PATH ${entry.path} — ${entry.detail ?? entry.reason}; nothing under it was read, so its absence below is not evidence of absence`,
    "undecidable path(s)",
  );
  // WR-08: a typo'd entry, a member behind a boundary and a traversal escape
  // used to vanish identically. Both renderings carry these, because a
  // declared member the tool silently ignored is a fact about the user's own
  // declaration rather than a diagnostic detail.
  pushCapped(
    lines,
    plan.droppedMembers,
    (member) => `DROPPED-MEMBER ${member.ecosystem} ${visible(member.declared)} — ${member.reason}`,
    "dropped workspace member(s)",
  );
}

/**
 * D-09's default output contract, rendered.
 *
 * Full reasoning for every selected pack; one line for every pack that
 * satisfied part of its conditions and failed the rest, bounded by
 * `MAX_NEAR_MISS_LINES` and deterministically ordered; an honest line for a
 * pack whose facts are declared but deliberately unimplemented; and silence
 * for packs that matched nothing. `--why` drops the cap and prints every
 * declared pack with full leaf detail.
 *
 * Every phrase below comes from `PackEvaluation.explanation` or from a leaf's
 * `phrase`, both of which the evaluator renders out of `catalog/facts.yaml`.
 * Nothing here is a per-pack string, so all 15 packs explain uniformly.
 */
export function formatProjectPlan(plan: ProjectCapabilityPlan, options: { why?: boolean; trailer?: string } = {}): string {
  const lines = [`Project: ${plan.scope.canonicalRoot} (${plan.scope.rootReason})`, `Project id: ${plan.scope.projectId}`];
  if (plan.scope.subProjectPath !== null) lines.push(`Sub-project: ${plan.scope.subProjectPath}`);
  const byId = new Map(plan.evaluations.map((evaluation) => [evaluation.packId, evaluation]));

  // What the scan could not finish reading comes FIRST, before the branch that
  // chooses between listing sub-projects, reporting that no pack qualified,
  // and listing selections.
  //
  // The order is the point, not a preference. Each of those three is a
  // CONCLUSION, and a conclusion drawn over a tree the walk did not read is
  // exactly the shape 02-REVIEW CR-03 reproduced: a 351 KB `.gitignore` made
  // every path undecidable and the rendering printed a confident "No pack
  // qualified on the evidence found." Emitting the disclosure only under
  // `--why` would leave the default rendering just as untrustworthy, so both
  // renderings carry it.
  emitDisclosure(lines, plan);

  if (plan.subProjects.length > 0) {
    // D-01: the user names the target rather than the tool guessing which
    // member of a workspace they meant.
    lines.push(`${plan.subProjects.length} sub-project(s) discovered; none selected. Name one with --project <path>.`);
    for (const member of plan.subProjects) {
      lines.push(`  ${member.path} (${member.declarationFile}): ${member.selected.join(", ") || "no pack qualified"}`);
    }
  } else if (plan.selected.length === 0) {
    lines.push("No pack qualified on the evidence found.");
  } else {
    for (const packId of plan.selected) {
      const pack = byId.get(packId);
      if (pack !== undefined) lines.push(`SELECT ${pack.explanation}`);
    }
  }

  if (options.why === true) {
    // The `--why`-only half of the disclosure. An ordinary repository excludes
    // many paths for ordinary reasons, so printing every one by default would
    // bury the BOUNDED and UNDECIDABLE-PATH lines above — the ones that change
    // how the whole answer must be read. `--why` is the diagnostic surface a
    // user opts into, and it is the surface the boundary-walk module comment
    // in evidence.ts names.
    pushCapped(
      lines,
      plan.excludedBoundaries,
      (entry) =>
        `EXCLUDED-BOUNDARY ${entry.path} — ${entry.reason}${entry.detail === null ? "" : ` (${entry.detail})`}`,
      "boundary exclusion(s)",
    );
    for (const evaluation of plan.evaluations) {
      lines.push(`WHY ${evaluation.packId} [${evaluation.status}] ${evaluation.explanation}`);
      for (const leaf of evaluation.satisfied) lines.push(`  + ${describeLeaf(leaf)}`);
      for (const leaf of evaluation.failed) lines.push(`  - ${leaf.phrase}: ${leaf.reason ?? "no reason recorded"}`);
    }
  } else {
    // Deterministic order and a hard cap, mirroring `finalizeIssues` in
    // validation.ts, so a hostile or pathological catalog cannot flood output.
    const shown = plan.nearMissOrder.slice(0, MAX_NEAR_MISS_LINES);
    for (const packId of shown) {
      const pack = byId.get(packId);
      if (pack !== undefined) lines.push(`NEAR-MISS ${pack.explanation}`);
    }
    const suppressed = plan.nearMissOrder.length - shown.length;
    if (suppressed > 0) lines.push(`... ${suppressed} more near-miss pack(s) suppressed (use --why)`);
    // A pack that can NEVER select says so. Reporting it as an ordinary
    // non-match would make it indistinguishable from an unqualified repository.
    for (const evaluation of plan.evaluations) {
      if (evaluation.status === "unimplemented") lines.push(`UNIMPLEMENTED ${evaluation.explanation}`);
    }
  }

  // D-11, rendered from the pre-state rather than from the approval text: a
  // conflicting target is a fact about the filesystem, and naming the pack and
  // the path is what turns a dropped pack from an unexplained absence into a
  // reviewable decision.
  for (const target of plan.targetPreState) {
    if (!target.exists || target.ownedByReceipt) continue;
    lines.push(
      `CONFLICT ${target.packId} ${target.path} — a file alpha-AOS did not write; the pack is dropped, and nothing was overwritten or renamed`,
    );
  }

  if (plan.targetPreState.length > 0) {
    // Deterministic order plus a hard cap, the same discipline the near-miss
    // lines follow, so a catalog naming many skills cannot flood the output.
    const shown = plan.targetPreState.slice(0, MAX_TARGET_ROWS);
    const rows = shown.map((target) => [
      target.path,
      target.harness,
      target.exists ? (target.ownedByReceipt ? "ours" : "foreign") : "absent",
      target.action,
    ]);
    lines.push("", table(["TARGET", "HARNESS", "STATE", "ACTION"], rows));
    const suppressed = plan.targetPreState.length - shown.length;
    if (suppressed > 0) lines.push(`... ${suppressed} more target(s) suppressed (use --json)`);
  }

  if (plan.adapterSupportEvidence.length > 0) {
    // `supported` means a real probe passed. No probe runs on this path, so
    // the basis column carries what was actually recorded instead.
    lines.push(
      "",
      table(
        ["HARNESS", "SUPPORT", "BASIS"],
        plan.adapterSupportEvidence.map((entry) => [entry.harness, entry.support, entry.reason]),
      ),
      "",
    );
  }

  for (const approval of plan.approvals) lines.push(`APPROVAL ${approval.code} ${approval.detail}`);

  // Host-derived observations, rendered beside the approvals and deliberately
  // under a different prefix. An `APPROVAL` line is a fact about the
  // REPOSITORY that `planDigest` binds; a `SHADOWED` line is a fact about THIS
  // MACHINE that it deliberately does not (02-REVIEW WR-01), so a reader can
  // tell the two apart at a glance rather than by knowing the digest's inputs.
  //
  // This loop is the other half of the WR-01 fix and must not be dropped:
  // taking a host-dependent input out of the digest is only correct if the
  // report of it stays in the output. Every note carried today is a
  // personal-scope skill collision, which is what the prefix names.
  for (const note of plan.hostNotes) lines.push(`SHADOWED ${note}`);

  lines.push(
    `Manifest digest: ${plan.manifestDigest ?? "none"}`,
    `Inputs digest: ${plan.inputsDigest}`,
    `Evidence digest: ${plan.evidenceDigest}`,
    `Plan digest: ${plan.planDigest}`,
    options.trailer ?? "Preview only. Nothing was written: `project plan` persists nothing.",
  );
  return lines.join("\n");
}

/**
 * The approval preview: the same reviewable plan, with the trailer that names
 * the command which persists it.
 *
 * D-12 is why this is a different TRAILER rather than a different rendering — a
 * reviewer must look at exactly what an apply will recompute.
 */
export function formatProjectApprovalPreview(
  plan: ProjectCapabilityPlan,
  command: string,
  options: { why?: boolean } = {},
): string {
  return formatProjectPlan(plan, {
    ...options,
    trailer: [
      "Preview only. Nothing was written: approving is a separate act from looking (D-12).",
      `Pass this digest back to apply: ${command}`,
    ].join("\n"),
  });
}

/** What an approve did, or did not need to do. */
export function formatProjectApproval(result: ProjectApprovalResult): string {
  const approved = result.plan.applicable;
  return [
    `Project: ${result.plan.scope.canonicalRoot}`,
    `Approved packs: ${approved.join(", ") || "none"} (${approved.length})`,
    `Plan digest: ${result.plan.planDigest}`,
    `Artifact: ${result.artifactPath}`,
    `Transaction: ${result.operationId ?? "none"}`,
    result.status === "already-current"
      ? "Already current. No bytes were written and no transaction was opened."
      : "Approved. Only .alpha-aos/plan.json was written; project source, package manifests, tests and build configuration stay read-only inputs.",
  ].join("\n");
}

/**
 * What a `project sync --apply` wrote, or did not need to write.
 *
 * Every written path is named, because a user must be able to see exactly which
 * bytes entered their project, and the transaction id is named because it is
 * the handle `alpha-aos rollback` takes. The wording shape mirrors the removal
 * branch's apply-result rendering so the two halves of the lifecycle read alike.
 */
export function formatProjectPackSync(result: ProjectPackSyncResult): string {
  // A plan-time source-shape finding is printed FIRST, above whatever the sync
  // did. It was produced before any byte was written, and burying it under the
  // written-paths list would make a loud guard quiet again (T-03-92).
  const findings = result.findings.map((finding) => `${finding.code} ${finding.detail}`);
  // A receipts-only surface says so WITH its reason. Printing nothing would
  // leave a user comparing two skill directories and finding a provenance file
  // in one of them, with no way to tell a deliberate omission from a lost file.
  const surfaces = result.sidecarSurfaces
    .filter((entry) => !entry.enabled)
    .map((entry) => `RECEIPTS-ONLY ${entry.harness} — ${entry.reason}`);
  // A prompt a user did not expect reads as a failure. Where a surface gates
  // project-local skills behind a trust decision, the report says so BEFORE the
  // user meets it, and says it is an expected step (03-RESEARCH.md Pitfall 4).
  const firstUse = result.sidecarSurfaces
    .filter((entry) => entry.firstUseNote !== null)
    .map((entry) => `FIRST-USE ${entry.harness} — ${entry.firstUseNote ?? ""}`);
  if (result.status === "already-current") {
    return [
      ...findings,
      `Packs: ${result.packs.join(", ") || "none"} (${result.packs.length})`,
      ...result.current.map((path) => `  current ${path}`),
      ...surfaces,
      ...firstUse,
      "Already current. No bytes were written and no transaction was opened.",
    ].join("\n");
  }
  return [
    ...findings,
    `Materialized packs: ${result.packs.join(", ") || "none"} (${result.packs.length})`,
    ...result.written.map((path) => `  wrote ${path}`),
    ...result.sidecars.map((path) => `  provenance ${path}`),
    ...result.receipts.map((path) => `  receipt ${path}`),
    ...surfaces,
    ...firstUse,
    `Transaction: ${result.operationId ?? "none"}`,
    "The transaction snapshotted every replaced file before writing it, so this materialization is reversible with `alpha-aos rollback`.",
  ].join("\n");
}

export function formatUpdate(current: StackLock, candidate: StackLock): string {
  const rows: string[][] = [];
  const add = (id: string, currentVersion: string | undefined, candidateVersion: string | undefined): void => {
    rows.push([id, currentVersion ?? "-", candidateVersion ?? "-", currentVersion === candidateVersion ? "current" : "update"]);
  };
  add("gsd", current.components.gsd?.version, candidate.components.gsd?.version);
  add("ecc", current.components.ecc?.version, candidate.components.ecc?.version);
  for (const [id, entry] of Object.entries(candidate.components.mcp ?? {})) {
    add(`mcp:${id}`, current.components.mcp?.[id]?.version, entry.version);
  }
  for (const [id, entry] of Object.entries(candidate.components.mcpBridges ?? {})) {
    if (entry) add(`mcp-bridge:${id}`, current.components.mcpBridges?.[id as keyof NonNullable<StackLock["components"]["mcpBridges"]>]?.version, entry.version);
  }
  return table(["COMPONENT", "STABLE", "UPSTREAM", "STATUS"], rows);
}

export function formatIsolationPlan(plan: IsolationPlan): string {
  const rows = plan.launches.map((launch) => [
    launch.harness,
    plan.policy.allowedHarnesses.includes(launch.harness) ? "allowed" : "denied",
    launch.executable ?? "missing",
    launch.blockedReasons.join("; ") || "ready",
  ]);
  return [
    `Project: ${plan.projectRoot}`,
    `Project ID: ${plan.projectId}`,
    `Mode: ${plan.policy.mode}`,
    `Runtime: ${plan.runtimeRoot}`,
    `Allowed skills: ${plan.policy.allowedSkills.join(", ") || "none"}`,
    `Allowed MCP: ${plan.policy.allowedMcp.join(", ") || "none"}`,
    "",
    table(["HARNESS", "POLICY", "EXECUTABLE", "STATUS"], rows),
  ].join("\n");
}

export function formatIsolationLaunch(launch: IsolationLaunchSpec): string {
  const env = Object.entries(launch.env).map(([key, value]) => `${key}=${value}`).join("\n") || "none";
  return [
    `Harness: ${launch.harness}`,
    `Mode: ${launch.mode}`,
    `Executable: ${launch.executable ?? "missing"}`,
    `Arguments: ${launch.args.join(" ") || "none"}`,
    `Environment overrides:\n${env}`,
    `Guarantees: ${launch.guarantees.join("; ") || "none"}`,
    `Warnings: ${launch.warnings.join("; ") || "none"}`,
    `Blocked: ${launch.blockedReasons.join("; ") || "no"}`,
  ].join("\n");
}

/**
 * DETC-06's report: what is installed, what state it is in, which fact went
 * away, and the command a human would run to approve a removal.
 *
 * Rendered beside the plan formatter and in the same `rows: string[][]` table
 * style, so every byte leaves through the one `print()` redaction seam rather
 * than a direct write. Nothing here deletes anything or offers to delete
 * anything on its own: the removal is a value, and the command that approves
 * it is the SAME approve verb the plan artifact goes through, so the phase has
 * exactly one writer.
 */
/**
 * A status DETAIL cell is truncated here, the same discipline
 * `MAX_NEAR_MISS_LINES` and `MAX_TARGET_ROWS` already apply: a report whose
 * width is decided by the longest reason a detector happened to produce is one
 * a hostile or merely verbose catalog can flood.
 */
export const MAX_STATUS_DETAIL_CHARS = 180;

function detailCell(detail: string): string {
  return detail.length <= MAX_STATUS_DETAIL_CHARS ? detail : `${detail.slice(0, MAX_STATUS_DETAIL_CHARS - 1)}\u2026`;
}

/**
 * One target's provenance cell: where the record of who wrote it lives.
 *
 * A receipts-only surface renders its REASON rather than a blank. A blank reads
 * as a missing file, and the distinction between "not written here on purpose"
 * and "should be here and is not" is the whole point of this line. `missing`
 * and `modified` are likewise separate words: a file that is not there and a
 * file holding bytes alpha-AOS did not write call for opposite next actions.
 */
function provenanceCell(target: PackProvenance["targets"][number]): string {
  switch (target.sidecar) {
    case "present":
      return `sidecar=present ${target.sidecarPath ?? ""}`.trimEnd();
    case "modified":
      return `sidecar=MODIFIED ${target.sidecarPath ?? ""} — it is there and holds bytes alpha-AOS did not write`.trimEnd();
    case "missing":
      return `sidecar=MISSING ${target.sidecarPath ?? ""} — the receipt claims it and it is not on disk`.trimEnd();
    case "receipts-only":
      return `sidecar=receipts-only — ${detailCell(target.sidecarReason ?? "no reason was recorded")}`;
    default:
      return "sidecar=unrecorded — no receipt row claims one for this target";
  }
}

export function formatProjectStatus(
  reconciliation: ProjectReconciliation,
  removals: readonly RemovalPlan[],
  options: { path: string; subProject?: string | null },
  oneShotOffers: readonly OneShotOffer[] = [],
  provenance: readonly PackProvenance[] = [],
): string {
  const lines = [
    `Project: ${reconciliation.plan.scope.canonicalRoot} (${reconciliation.plan.scope.rootReason})`,
    `Project id: ${reconciliation.plan.scope.projectId}`,
  ];

  const git = reconciliation.git;
  lines.push(
    git.available
      ? `Branch: ${git.branch ?? "(detached HEAD)"} at commit ${git.commit?.slice(0, 12) ?? "unresolved"}`
      : `Branch: unavailable — ${git.reason ?? "no reason recorded"}`,
  );
  lines.push(
    `Approved plan: ${reconciliation.approved?.planDigest ?? "none"} (${reconciliation.artifactState})`,
    `Evidence digest: ${reconciliation.plan.evidenceDigest}`,
  );

  // D-15: both facts are present and neither replaces the other, so a user can
  // tell a checkout from a real removal.
  if (reconciliation.gitNote !== null) lines.push(`BRANCH-DIFFERS ${reconciliation.gitNote}`);

  // A rejected artifact and a superseded one are different facts about
  // different problems, so they get different lines. Reusing the `changed`
  // wording would tell a user their approval was overtaken by new evidence
  // when what actually happened is that the document itself was refused.
  if (reconciliation.artifactState === "unreadable") {
    const codes = reconciliation.artifactIssues.map((entry) => `${entry.code}@${entry.documentPath}`).join(", ");
    lines.push(
      `UNREADABLE-APPROVAL ${PROJECT_PLAN_ARTIFACT} exists and did not pass its closed schema, so it is refused rather than partly trusted: ${codes || "no issue code was recorded"}`,
    );
  }

  if (reconciliation.artifactState === "changed") {
    lines.push(
      `CHANGED ${PROJECT_PLAN_ARTIFACT} records an approval taken against different evidence, so it is read as a record of what was approved and never as an authority about what is true now`,
    );
  }
  for (const packId of reconciliation.unsupportedClaims) {
    lines.push(
      `UNSUPPORTED-CLAIM ${packId} is claimed by ${PROJECT_PLAN_ARTIFACT} and is not selected by freshly collected evidence`,
    );
  }

  if (reconciliation.packs.length === 0) {
    lines.push("No pack is installed: no receipt exists under the receipt directory.");
  } else {
    lines.push(
      "",
      table(
        ["STATE", "PACK", "TARGETS", "DETAIL"],
        reconciliation.packs.map((pack) => [
          pack.capability.deployment,
          pack.packId,
          `${pack.targets.filter((target) => target.matches).length}/${pack.targets.length} matching`,
          detailCell(pack.detail),
        ]),
      ),
      "",
    );
  }

  // 03-CONTEXT.md D-11: JSON exposes the axes, human output summarises to ONE
  // LINE. The line carries all THREE axes, because a single value cannot say
  // "deployed and discovered but not yet invoked" — precisely the misleading
  // single `installed` state CAPA-07 forbids.
  //
  // Where the native-use axis is blocked, the line carries the stable code and
  // the variable NAME. It never carries a value: the sentence was composed
  // from `BlockedReason`'s three named fields, which is the third layer of the
  // defence behind the type and the closed schema (D-12, T-03-84).
  for (const pack of reconciliation.packs) {
    const axes = pack.capability;
    lines.push(
      `CAPABILITY ${pack.packId} — deployment=${axes.deployment} native-use=${axes.nativeUse} ` +
        `support=${axes.support}; ${detailCell(axes.nativeUseReason)}`,
    );
    // The ceiling is quoted only where it actually bounds something. A
    // `supported` surface repeating its own product claim on every run is the
    // noise that stops the lines above being read.
    if (axes.support !== "supported") {
      lines.push(`SUPPORT-CEILING ${pack.packId} — ${detailCell(axes.supportReason)}`);
    }
  }

  // CAPA-05's project-local provenance: for each materialized pack, which
  // harness holds which file, who claims it, and where the record of that
  // claim lives. A user who is looking at their own `.claude/skills` should be
  // able to answer "did alpha-AOS put this here, and from which pack" without
  // reading a receipt by hand.
  for (const pack of provenance) {
    lines.push("", `PROVENANCE ${pack.packId} — receipt ${pack.receiptPath}`);
    for (const target of pack.targets) {
      lines.push(
        `  ${target.path}  harness=${target.harness}  ` +
          `receipt=${target.claimedBy === null ? "UNCLAIMED" : "claimed"}  ${provenanceCell(target)}`,
      );
    }
    // A target nobody claims gets a stable code on its own line rather than a
    // quiet omission from the rows above — the conflict discipline this report
    // already applies, on the new surface.
    for (const finding of pack.findings) lines.push(`${finding.code} ${detailCell(finding.detail)}`);
  }

  // One line per MISSING FACT, never a merged summary: two facts that
  // disappeared are two different things a user may want to put back.
  //
  // The prefixes are hyphenated codes rather than the bare state names on
  // purpose: a bare `STALE ` would also be the opening of the table row above,
  // so a reader — human or test — could not tell a per-fact line from a
  // per-pack one.
  for (const pack of reconciliation.packs) {
    for (const reason of pack.stale) lines.push(`STALE-FACT ${reason.sentence}`);
    for (const entry of pack.undecidable) {
      lines.push(
        `UNDECIDABLE-PATH ${pack.packId} — ${entry.path} exists but could not be read (errno=${entry.errno}); that is not evidence that anything is gone`,
      );
    }
  }

  // 03-CONTEXT.md D-13, in the register Phase 2 used for `STALE`: a STATE with
  // an OFFER. It names the pack, the lifecycle, the invocation date, that a
  // removal plan is READY, and the runnable command — and it says outright that
  // nothing has been removed, because a one-shot pack that reported itself
  // "spent" and read as though it had cleaned itself up would be the automatic
  // deletion Phase 2 D-14 and PROJECT.md's safety constraint both forbid.
  const oneShotPacks = new Set(oneShotOffers.map((offer) => offer.packId));
  for (const offer of oneShotOffers) {
    lines.push("", `ONE-SHOT ${offer.sentence}`);
    if (offer.invokedAt !== null) lines.push(`  Invoked on: ${offer.invokedAt}`);
    if (offer.corroboration !== null) {
      lines.push(
        `  Corroborating output ${offer.corroboration.path}: ${offer.corroboration.present ? "present" : "not observed"}`,
        `  ${detailCell(offer.corroboration.note)}`,
      );
    }
    if (offer.removalDigest !== null && offer.approveCommand !== null) {
      lines.push(`  Removal digest: ${offer.removalDigest}`, `  Approve this removal with: ${offer.approveCommand}`);
    }
  }

  for (const removal of removals) {
    // A one-shot offer already carried this pack's digest and command in the
    // register D-13 asks for. Printing the generic block beside it would give
    // one pack two offers and two ways to read them.
    if (oneShotPacks.has(removal.packId)) continue;
    lines.push("", `REMOVAL ${removal.packId} — ${removal.targets.length} target(s). Nothing has been removed.`);
    for (const target of removal.targets) {
      lines.push(`  ${target.exists ? (target.expectedHash ?? "unreadable").slice(0, 12) : "absent      "}  ${target.path}`);
    }
    lines.push(
      `  Removal digest: ${removal.removalDigest}`,
      `  Approve this removal with: ${approvalCommand({ path: options.path, subProject: options.subProject, planDigest: removal.removalDigest })}`,
    );
  }

  lines.push(
    "",
    "Read only. `project status` deletes nothing: a removal is a separate act a human approves by digest.",
  );
  return lines.join("\n");
}

/**
 * The doctor verbs' capability report: ONE line per capability, carrying the
 * three axes and, where an axis is blocked, its code and variable name.
 *
 * The human lines live here and the raw axes leave through the CLI's `--json`,
 * which is the split every other surface in this tool already follows.
 *
 * An INCOMPLETE unit renders the word INCOMPLETE and does NOT render a
 * native-use value. That is 03-CONTEXT.md D-14 at the rendering seam: an
 * unpaired positive is not the claim the unit exists to make, and a reader who
 * sees an axis on that line reads the whole line as a result.
 */
export function formatCapabilityReport(
  title: string,
  rows: readonly CapabilityReportRow[],
  notes: readonly string[] = [],
): string {
  const sortedRows = sortCapabilityReportRows(rows);
  const lines = [title];
  if (sortedRows.length === 0) {
    lines.push("", "No capability was reported: nothing was selected to run.");
  } else {
    lines.push(
      "",
      table(
        ["EVIDENCE", "CAPABILITY", "HARNESS", "DEPLOYMENT", "SUPPORT", "NATIVE USE", "DETAIL"],
        sortedRows.map((row) => [
          row.completeness ?? "-",
          row.capability,
          row.harness,
          row.axes.deployment ?? "not-measured",
          row.axes.support,
          // The axis is withheld on an INCOMPLETE unit rather than shown with a
          // caveat beside it.
          row.completeness === "INCOMPLETE" ? "withheld" : row.axes.nativeUse ?? "unverified",
          detailCell(capabilityRowDetail(row)),
        ]),
      ),
      "",
    );
  }

  // The upper-code-plus-reason convention `formatProjectStatus` already uses: a
  // blocked axis gets its own line naming the code and the variable, so it is
  // greppable and never merged into a table cell that a width bound can cut.
  for (const row of sortedRows) {
    const blocked = row.blockedReason;
    if (blocked !== null) {
      lines.push(`BLOCKED ${blocked.code} ${blocked.variable} — ${blocked.nextAction}`);
    }
    if (row.completeness === "INCOMPLETE") {
      for (const reason of row.incompleteReasons) {
        lines.push(`INCOMPLETE ${row.capability} on ${row.harness} — ${reason}`);
      }
    }
    for (const note of row.claimNotes) {
      const code = note.kind === "inference" ? "CLAIM-INFERENCE" : "CLAIM-SCOPE";
      lines.push(`${code} ${row.capability} on ${row.harness} — ${note.statement} Basis: ${note.basis}`);
    }
    if (row.notRunReason !== null) {
      lines.push(`NOT-RUN ${row.capability} on ${row.harness} — ${row.notRunReason}`);
    }
  }

  for (const note of notes) lines.push(note);
  return lines.join("\n");
}

/**
 * The transcribed evidence one handoff canary produced.
 *
 * Every number the plan asks to be transcribed is on its own line rather than in
 * a table cell, for the reason the BLOCKED convention already exists: a width
 * bound must not be able to cut the load-bearing words. The scope limit is the
 * LAST line so it is the thing a reader leaves with — what was proven, and just
 * as importantly what was not.
 */
export function formatHandoffEvidence(result: HandoffCanaryResult): string[] {
  const lines: string[] = [];
  const pair = result.pair;
  if (pair === null) {
    lines.push(
      `HANDOFF ${result.capability} — no pair of harnesses was available, so the run was not attempted. Considered: ` +
        result.pairResolution.considered
          .map(
            (entry) =>
              `${entry.pair.source}->${entry.pair.target} (source ${entry.sourceResolved ? "found" : "absent"}, ` +
              `target ${entry.targetResolved ? "found" : "absent"})`,
          )
          .join("; "),
    );
    lines.push(`HANDOFF SCOPE — ${result.scopeLimit}`);
    return lines;
  }

  lines.push(
    `HANDOFF PAIR — source ${pair.source}${versionSuffix(result.harnessVersions.source)}, target ` +
      `${pair.target}${versionSuffix(result.harnessVersions.target)}; ${pair.why}`,
  );
  lines.push(
    `HANDOFF VAULT — memories before ${describeCount(result.vaultBefore)}, after ${describeCount(result.vaultAfter)}; ` +
      `sentinel title ${result.sentinelTitle ?? "(none written)"}; written at ${result.writtenPath ?? "(nothing written)"}`,
  );
  lines.push(
    `HANDOFF RECALL — a filtered recall for ${pair.target} returned ${describeCount(result.recallCount)} entr(ies) and ` +
      `${result.recalled === true ? "DID" : result.recalled === false ? "did NOT" : "was not reached to"} include the sentinel`,
  );
  lines.push(
    `HANDOFF PLANNING — before ${describeDigest(result.planningBefore?.digest ?? null)}, after ` +
      `${describeDigest(result.planningAfter?.digest ?? null)} over ${result.planningBefore?.root ?? "(not hashed)"}; ` +
      (result.planningDifference?.equal === true
        ? "byte-for-byte identical"
        : `CHANGED: ${(result.planningDifference?.reasons ?? ["the digests were not comparable"]).join(", ")}`),
  );
  if (result.receivingSkippedReason !== null) {
    lines.push(`HANDOFF RECEIVING — ${result.receivingSkippedReason}`);
  } else if (result.receiving !== null) {
    lines.push(
      `HANDOFF RECEIVING — ${pair.target} ran the declared prompt: outcome ${result.receiving.outcome}, exit ` +
        `${String(result.receiving.exitCode)}. Whether it genuinely worked FROM the handed-off context is a human ` +
        "judgement; model output text is never evidence here.",
    );
  }
  lines.push(`HANDOFF UNIT — ${result.unit?.summary ?? "no evidence unit was assembled"}`);
  lines.push(`HANDOFF SCOPE — ${result.scopeLimit}`);
  return lines;
}

function versionSuffix(version: string | null): string {
  return version === null ? " (version unreadable)" : ` ${version}`;
}

function describeCount(value: number | null): string {
  return value === null ? "unread" : String(value);
}

function describeDigest(value: string | null): string {
  return value === null ? "withheld (the digest was incomplete)" : value.slice(0, 12);
}

/** The one-cell reason a row carries, chosen in the order a reader needs it. */
function capabilityRowDetail(row: CapabilityReportRow): string {
  if (row.blockedReason !== null) return `${row.blockedReason.code} ${row.blockedReason.variable}`;
  if (row.notRunReason !== null) return row.notRunReason;
  if (row.completeness === "INCOMPLETE") return row.incompleteReasons[0] ?? "the evidence unit is incomplete";
  return row.axisNotes.nativeUse ?? "";
}

export function formatTreeList(trees: readonly TreeRegistryEntry[]): string {
  if (trees.length === 0) {
    return "No directories registered. Use 'alpha-aos tree set <path> --mode <managed|off>' to register a policy.";
  }
  const headers = ["ID", "MODE", "PATH", "NOTES", "UPDATED"];
  const rows = trees.map((tree) => [
    tree.id,
    tree.mode.toUpperCase(),
    tree.path,
    tree.notes ?? "-",
    tree.updatedAt.slice(0, 19).replace("T", " "),
  ]);
  return table(headers, rows);
}

export function formatTreePreview(report: TreePreviewReport): string {
  const lines: string[] = [
    "alpha-AOS Directory Policy Preview",
    "==================================",
    `Target Path:           ${report.targetPath}`,
    `Canonical Path:        ${report.canonicalPath}`,
    `Enclosing Git Root:    ${report.gitRoot ?? "(none)"}`,
    `Effective Mode:        ${report.effectiveMode.toUpperCase()}`,
    `Inherited:             ${report.inherited ? "yes" : "no"}`,
    `Inheritance Depth:     ${report.depth}`,
    `Matched Ancestor:      ${report.matchedAncestor ?? "(none)"}`,
  ];

  if (report.effectiveMode === "off") {
    lines.push(
      `Isolated Config Root:  ${report.isolatedConfigRoot ?? "(none)"}`,
      `Launch Arguments:      ${report.launchFlags.length > 0 ? report.launchFlags.join(" ") : "(none)"}`,
    );
  } else {
    lines.push("Launch Arguments:      (passthrough — native arguments unaltered)");
  }

  return lines.join("\n");
}

export function formatTreeInspection(inspection: TreeSurfaceInspection): string {
  const lines: string[] = [
    "alpha-AOS Directory Tree Surface Inspection",
    "===========================================",
    "",
    "1. Policy & Hierarchy:",
    `   Target Path:          ${inspection.targetPath}`,
    `   Canonical Path:       ${inspection.canonicalPath}`,
    `   Effective Mode:       ${inspection.effectivePolicy.effectiveMode.toUpperCase()}`,
    `   Inherited:            ${inspection.effectivePolicy.inherited ? `yes (depth: ${inspection.effectivePolicy.depth})` : "no (direct)"}`,
    `   Matched Ancestor:     ${inspection.effectivePolicy.entry?.path ?? "(none)"}`,
    "",
    "2. Isolated Configuration Root:",
    `   Path:                 ${inspection.isolatedConfigRoot ?? "(none — not in off mode)"}`,
    "",
    "3. Excluded Global Resources (Preload Exclusion):",
    `   Skills:               ${inspection.excludedGlobalResources.skills ? "EXCLUDED" : "ACTIVE"}`,
    `   MCP Servers:          ${inspection.excludedGlobalResources.mcp ? "EXCLUDED" : "ACTIVE"}`,
    `   Hooks:                ${inspection.excludedGlobalResources.hooks ? "EXCLUDED" : "ACTIVE"}`,
    `   Instructions:         ${inspection.excludedGlobalResources.instructions ? "EXCLUDED" : "ACTIVE"}`,
    `   Unified Memory:       ${inspection.excludedGlobalResources.memory ? "EXCLUDED" : "ACTIVE"}`,
    "",
    "4. Discovered Project-Local Resources (Zero-Intervention Passthrough):",
  ];

  if (inspection.localResources.isVanilla) {
    lines.push("   Status:               Vanilla (no project-local resources discovered)");
  } else {
    lines.push(
      `   Skills (.agents/):    ${inspection.localResources.skills.length > 0 ? inspection.localResources.skills.join(", ") : "(none)"}`,
      `   MCP Config:           ${inspection.localResources.mcpConfig ?? "(none)"}`,
      `   Codex Config:         ${inspection.localResources.codexConfig ?? "(none)"}`,
      `   Instructions:         ${inspection.localResources.instructions.length > 0 ? inspection.localResources.instructions.join(", ") : "(none)"}`,
      `   Local Hooks:          ${inspection.localResources.hooks.length > 0 ? inspection.localResources.hooks.join(", ") : "(none)"}`,
    );
  }

  lines.push(
    "",
    "5. Environment Allowlist Status:",
    `   Passed AI Auth Keys:  ${inspection.environmentStatus.passedAiAuthKeys.length > 0 ? inspection.environmentStatus.passedAiAuthKeys.join(", ") : "(none detected)"}`,
    `   Passed Runtime Keys:  ${inspection.environmentStatus.passedRuntimeKeys.length} keys`,
    `   Scrubbed Ambient Keys: ${inspection.environmentStatus.scrubbedKeys.length} keys scrubbed`,
    "",
    "6. Harness Support & Isolation Proof:",
    `   Harness:              ${inspection.harnessSupport.harness}`,
    `   Provable Isolation:   ${inspection.harnessSupport.provable ? "YES (provable)" : "NO (unprovable / unsupported)"}`,
    `   Status:               ${inspection.harnessSupport.status.toUpperCase()}`,
  );

  if (inspection.harnessSupport.reason) {
    lines.push(`   Reason:               ${inspection.harnessSupport.reason}`);
  }

  lines.push(
    "",
    "7. Pre-Launch Enforcement:",
    `   Method:               ${inspection.preLaunchEnforcement.method}`,
    `   PATH Shim Precedence: ${inspection.preLaunchEnforcement.shimPrecedenceOk ? "OK (first on PATH)" : "WARNING (preceded by other directories)"}`,
    "",
    "8. Security Boundary Notice:",
    `   Notice:               ${inspection.boundaryNotice.description}`,
    `   Sealed Container:     ${inspection.boundaryNotice.sealedModeSupported ? "Supported" : "NOT SUPPORTED (sealed mode requires container boundary, fails closed)"}`,
  );

  return lines.join("\n");
}

export function formatOfflineStatus(status: OfflineStatus): string {
  const lines: string[] = [
    `alpha-AOS offline status (${status.channel})`,
    `Generated at: ${status.generatedAt ?? "unknown"}`,
    `Writer lock: ${status.writerStatus}`,
    `Directory tree policies: ${status.treePoliciesCount}`,
    `Managed state present: ${status.managedStatePresent ? "yes" : "no"}`,
  ];
  if (status.needsRepair) {
    lines.push("");
    lines.push("STATUS: NEEDS-REPAIR (Run 'alpha-aos repair' to recover from interrupted operation)");
    if (status.incompleteTransactions.length > 0) {
      lines.push(`Incomplete transactions: ${status.incompleteTransactions.join(", ")}`);
    }
    if (status.corruptJournals.length > 0) {
      lines.push(`Corrupt journals: ${status.corruptJournals.join(", ")}`);
    }
  } else {
    lines.push("");
    lines.push("STATUS: OK");
  }
  return lines.join("\n");
}

export function formatRecoveryReceipt(receipt: RecoveryReceipt): string {
  const lines: string[] = [
    `alpha-AOS external package recovery receipt (${receipt.operationId})`,
    `Created at: ${receipt.createdAt}`,
    "",
    "External modifications require manual recovery commands:",
  ];
  for (const entry of receipt.entries) {
    lines.push("");
    lines.push(`Component: ${entry.component} (${entry.action} on ${entry.target})`);
    lines.push(`  Previous state: ${entry.previousState ?? "(none)"}`);
    lines.push(`  Applied state:  ${entry.appliedState}`);
    lines.push(`  Instructions:   ${entry.compensation.instructions}`);
    if (entry.compensation.commands.length > 0) {
      lines.push("  Compensation commands:");
      for (const cmd of entry.compensation.commands) {
        lines.push(`    $ ${cmd}`);
      }
    }
  }
  return lines.join("\n");
}

export function formatCrashRepairPlan(plan: CrashRepairPlan): string {
  const lines: string[] = [
    "alpha-AOS Crash Repair Plan",
    `Action:           ${plan.action}`,
    `Operation ID:     ${plan.operationId ?? "(none)"}`,
    `Writer PID:       ${plan.writerPid ?? "(none)"}`,
    `Writer alive:     ${plan.writerAlive ? "YES" : "no"}`,
    `Snapshots intact: ${plan.snapshotsIntact ? "YES" : "no"}`,
    `Affected files:   ${plan.affectedFiles.length > 0 ? plan.affectedFiles.join(", ") : "(none)"}`,
  ];
  if (plan.blockedReasons.length > 0) {
    lines.push("");
    lines.push(`BLOCKED: ${plan.blockedReasons.join("; ")}`);
  }
  return lines.join("\n");
}

export function formatCrashRepairResult(result: CrashRepairResult): string {
  const lines: string[] = [
    "alpha-AOS Crash Repair Completed",
    `Action executed:  ${result.plan.action}`,
    `Lock released:    ${result.lockReleased ? "yes" : "no"}`,
    `Restored files:   ${result.restoredFiles.length > 0 ? result.restoredFiles.join(", ") : "(none)"}`,
  ];
  if (result.quarantinedJournal) {
    lines.push(`Quarantined journal: ${result.quarantinedJournal}`);
  }
  return lines.join("\n");
}

export function formatDriftDiagnostics(diagnostics: readonly DriftDiagnostic[]): string {
  const lines: string[] = [
    "alpha-AOS Rollback Drift Error: post-transaction drift detected",
    `Drifted files: ${diagnostics.length}`,
    "Zero file writes performed (all-or-nothing preflight refusal).",
    "",
  ];
  for (const diag of diagnostics) {
    lines.push(`Target:   ${diag.target}`);
    lines.push(`Expected: ${diag.expectedHash ?? "(none / unlinked)"}`);
    lines.push(`Actual:   ${diag.actualHash ?? "(missing)"}`);
    if (diag.unifiedDiff) {
      lines.push("Unified Diff snippet:");
      for (const diffLine of diag.unifiedDiff.split("\n")) {
        lines.push(`  ${diffLine}`);
      }
    }
    lines.push(`Remediation: ${diag.remediation}`);
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}

export function formatUninstallPlan(plan: UninstallPlan): string {
  const lines: string[] = [
    `alpha-AOS Uninstall Plan (scope: ${plan.scope})`,
    `Purge state directory: ${plan.purgeRequested ? "YES" : "no"}`,
  ];
  if (plan.targetHarness) lines.push(`Target harness:        ${plan.targetHarness}`);
  if (plan.projectPath) lines.push(`Project path:          ${plan.projectPath}`);
  lines.push(`State root:            ${plan.stateRoot}`);

  if (plan.prunePlans.length > 0) {
    lines.push("");
    lines.push("Configuration files to prune semantically:");
    for (const p of plan.prunePlans) {
      lines.push(`  - ${p.path} (${p.format}) [action: ${p.action}]`);
      if (p.injectedKeysRemoved.length > 0) {
        lines.push(`      injected keys to remove: ${p.injectedKeysRemoved.join(", ")}`);
      }
      if (p.userKeysPreserved.length > 0) {
        lines.push(`      user keys preserved:     ${p.userKeysPreserved.join(", ")}`);
      }
    }
  }

  if (plan.filesToRemove.length > 0) {
    lines.push("");
    lines.push("Files to remove:");
    for (const f of plan.filesToRemove) {
      lines.push(`  - ${f}`);
    }
  }

  if (plan.directoriesToSweep.length > 0) {
    lines.push("");
    lines.push("Directories to reverse sweep:");
    for (const d of plan.directoriesToSweep) {
      lines.push(`  - ${d}`);
    }
  }

  if (plan.externalCompensation.length > 0) {
    lines.push("");
    lines.push("External package compensation instructions will be recorded:");
    for (const c of plan.externalCompensation) {
      lines.push(`  - ${c.component}: ${c.compensation.instructions}`);
    }
  }

  lines.push("");
  lines.push("Dry-run only. Pass --apply [--yes] to execute uninstall.");
  return lines.join("\n");
}

export function formatUninstallResult(result: UninstallResult): string {
  const lines: string[] = [
    `alpha-AOS Uninstall Complete (scope: ${result.plan.scope})`,
    `Pruned configurations: ${result.prunedFiles.length}`,
    `Removed files:         ${result.removedFiles.length}`,
    `Swept directories:     ${result.sweptDirectories.length}`,
  ];
  if (result.preservedJournals.length > 0) {
    lines.push(`Preserved journals:    ${result.preservedJournals.length} (audit trail preserved)`);
  }
  if (result.plan.purgeRequested) {
    lines.push("State directory completely purged (--purge).");
  }
  if (result.recoveryReceipt) {
    lines.push(`Recovery receipt emitted (${result.recoveryReceipt.operationId}). Run manual commands for external packages.`);
  }
  return lines.join("\n");
}

/**
 * The reviewable task contract (CON-01, D-03): everything an approval binds,
 * with the allowed paths and effect kinds rather than a per-file list, and the
 * command that persists consent for exactly this digest.
 */
export function formatTaskContractPreview(preview: TaskContractPreview, command: string): string {
  const contract = preview.contract;
  const minutes = contract.resourcePolicy.maxWallTimeMinutes;
  const cycles = contract.resourcePolicy.maxCycles;
  const tokens = contract.resourcePolicy.maxTokens;
  const cost = contract.resourcePolicy.maxCostUsd;

  const lines: string[] = [];

  if (preview.blockedReasons && preview.blockedReasons.length > 0) {
    lines.push(
      "Blocked: task prerequisites not satisfied (cannot approve or start)",
      "Blocked reasons:",
      ...preview.blockedReasons.map((reason) => `  - ${reason}`),
    );
    if (preview.nextActions && preview.nextActions.length > 0) {
      lines.push("Next actions:", ...preview.nextActions.map((action) => `  - ${action}`));
    }
    lines.push("");
  }

  lines.push(
    `Task: ${contract.id} (revision ${contract.revision})`,
    `Contract digest: ${preview.digest}`,
    `Mode: ${contract.mode} — approving authorizes one single run of this revision only; autopilot stays off for every other task.`,
    `Goal: ${contract.goal}`,
    "Mandatory criteria:",
    ...contract.criterion.map((criterion) => {
      const measuredDesc =
        criterion.measurement.kind === "cli-json"
          ? `measured by ${criterion.measurement.entry}, expected exit ${criterion.measurement.expect.exitCode}`
          : `measured by item ${criterion.measurement.itemId}, expected status ${criterion.measurement.expect.status}`;
      return `  ${criterion.id}: ${criterion.title} — ${measuredDesc}`;
    }),
    `Allowed roots: ${contract.allowedRoots.join(", ")}`,
    `Allowed effect kinds: ${contract.allowedEffects.join(", ")}`,
    preview.gitAuthority.grant === "git-directory"
      ? `Git authority (local-commit): the controller may write ${preview.gitAuthority.gitDirectory ?? ""} for this run; its config, hooks and info stay read-only`
      : `Git authority (local-commit): none — ${preview.gitAuthority.reason ?? "no git directory is granted"}`,
    `Project root: ${contract.scope.projectRoot}`,
    `Workflow: ${contract.scope.workflow} — ${contract.scope.summary}`,
    `Agents: controller ${contract.agentPolicy.controller}, executor ${contract.agentPolicy.executor}, reviewer ${contract.agentPolicy.reviewer} (${contract.agentPolicy.reviewerSession})`,
    `Wall-time limit: ${minutes === null || minutes === undefined ? "no overall limit" : `${minutes} minutes`}`,
    `Cycles limit: ${cycles === null || cycles === undefined ? "no limit" : `${cycles} cycles`}`,
    `Tokens limit: ${tokens === null || tokens === undefined ? "no limit" : `${tokens} tokens`}`,
    `Cost limit: ${cost === null || cost === undefined ? "no limit" : `$${cost.toFixed(2)} USD`}`,
  );

  if (preview.telemetryStatus) {
    lines.push(
      preview.telemetryStatus.ready
        ? "Telemetry: all required meters available"
        : `Telemetry: unmetered (${preview.telemetryStatus.missingMeters.join("; ")})`,
    );
  }

  if (preview.changedFields && preview.changedFields.length > 0) {
    lines.push(
      "",
      "Changed contract fields from previous approved revision:",
      ...preview.changedFields.map((f) => `  - ${f}`),
    );
  }

  lines.push(
    `Approval: ${preview.approved ? "this digest is approved" : "not approved"}`,
    "",
    "Preview only. Nothing was written: approving is a separate act from looking (D-01).",
    `Approve exactly this digest: ${command}`,
  );

  if (preview.reapprovalPreview) {
    lines.push("", formatTaskReapprovalPreview(preview.reapprovalPreview));
  }

  return lines.join("\n");
}

/** What a task approve did, or did not need to do. */
export function formatTaskApproval(
  result: TaskApprovalResult,
  options?: {
    startCommand?: string;
    statusCommand?: string;
    stopCommand?: string;
    resumeCommand?: string;
  } | string,
): string {
  const startCmd = typeof options === "string" ? options : options?.startCommand;
  const statusCmd = typeof options === "object" ? options?.statusCommand : undefined;
  const stopCmd = typeof options === "object" ? options?.stopCommand : undefined;
  const resumeCmd = typeof options === "object" ? options?.resumeCommand : undefined;

  const lines = [
    `Task: ${result.contractId ?? "unknown"}`,
    `Contract file: ${result.contractPath ?? "unknown"}`,
    `Contract digest: ${result.contractDigest}`,
    `Reserved run ID: ${result.reservedRunId ?? "none"} (reserved for execution — not started yet)`,
    `Approval record: ${result.recordPath}`,
    `Transaction: ${result.transactionId ?? "none"}`,
    result.status === "already-approved"
      ? "Already approved. No bytes were written and no transaction was opened."
      : "Approved for a single run of this exact revision. Starting the run is a separate act.",
  ];

  if (startCmd !== undefined) {
    lines.push(`Preview readiness without --apply, then start it: ${startCmd}`);
  }

  if (statusCmd || stopCmd || resumeCmd) {
    lines.push("", "Operator control commands (durable across chat sessions):");
    if (statusCmd) lines.push(`  Status: ${statusCmd}`);
    if (stopCmd) lines.push(`  Stop:   ${stopCmd}`);
    if (resumeCmd) lines.push(`  Resume: ${resumeCmd}`);
  }

  return lines.join("\n");
}

/**
 * The first verdict screen (D-13): one row per mandatory criterion with its
 * verdict, measured outcome, review verdict, artifact digest and reason. The
 * executor claim is shown last and labelled, because it is never evidence.
 */
export function formatTaskRunReport(run: TaskRunRecord): string {
  if (run.generalReport) {
    return formatGeneralTaskReport(run.generalReport);
  }
  const artifact = run.artifact === null ? "none" : run.artifact.digest.slice(0, 12);
  const rows = (run.verdict?.rows ?? []).map((row) => [
    row.criterionId,
    row.verdict,
    `${row.measured.outcome} (exit ${row.measured.exitCode === null ? "none" : String(row.measured.exitCode)})`,
    row.review === null ? "none" : row.review.verdict,
    row.artifactDigest.slice(0, 12),
    row.reason,
  ]);
  const lines = [
    `Task: ${run.contractId} (revision ${run.revision})`,
    `Status: ${run.status.toUpperCase()}${run.verdict?.refusal ? ` (refused: ${run.verdict.refusal})` : ""}`,
    `Contract digest: ${run.contractDigest.slice(0, 12)}`,
    `Artifact digest: ${artifact}`,
    `Run: ${run.runId}`,
    "",
    rows.length === 0
      ? "No criterion was judged."
      : table(["Criterion", "Verdict", "Measured", "Review", "Artifact", "Reason"], rows),
    "",
    `Consent: autopilot, single run of revision ${run.revision}`,
    run.gitDirectory !== null && run.gitDirectory !== undefined
      ? `Git directory granted to the controller: ${run.gitDirectory} (config, hooks and info read-only)`
      : "Git directory granted to the controller: none",
  ];

  // What the controller chose and why (CON-02, D-06).
  if (run.decisions.length === 0) {
    lines.push(`Decisions: none recorded (log ${run.decisionLog?.status ?? "not read"}${run.decisionLog?.reason ? `: ${run.decisionLog.reason}` : ""})`);
  } else {
    lines.push("Decisions:", ...run.decisions.map((decision) => `  ${decision.category}: ${decision.choice} — ${decision.rationale}`));
  }

  // GSD quick's own evidence, as alpha-AOS read it (RUN-01).
  const gsd = run.gsd;
  if (gsd === null) {
    lines.push("GSD: not read");
  } else if (gsd.status === "verified") {
    lines.push(`GSD: verified (quick ${gsd.quickId ?? "unknown"})`);
    if (gsd.commits.length > 0) lines.push(`  commits: ${gsd.commits.map((commit) => commit.subject).join("; ")}`);
  } else {
    lines.push(`GSD: ${gsd.status}${gsd.missing.length > 0 ? ` — missing: ${gsd.missing.join("; ")}` : ""}`);
  }

  const effects = run.effects;
  if (effects === null) {
    lines.push("Changed paths: not read");
  } else {
    const list = (paths: readonly string[]) => (paths.length === 0 ? "none" : paths.join(", "));
    lines.push(
      "Changed paths:",
      `  implementation: ${list(effects.implementationPaths)}`,
      `  planning: ${list(effects.planningPaths)}`,
    );
    if (effects.violations.length > 0) {
      lines.push(
        "  violations:",
        ...effects.violations.map((violation) => `    ${violation.effect}: ${violation.path === "" ? "(no path)" : violation.path} — ${violation.detail}`),
      );
    }
    if (effects.packCheckpoint !== null) lines.push(`  pack checkpoint: ${effects.packCheckpoint.approveCommand}`);
  }

  // The claim is shown and labelled, never used: it is not evidence (D-11).
  const executor = run.executor;
  lines.push(
    executor === null
      ? "Executor claim (not evidence): none"
      : `Executor claim (not evidence): ${executor.claim?.status ?? "none"}, exit ${executor.exitCode ?? "none"}, terminal ${executor.terminal}, ${executor.harness} ${executor.version ?? "version unknown"}`,
  );
  const reviewer = run.reviewer;
  lines.push(
    reviewer === null
      ? "Reviewer: none"
      : `Reviewer: ${reviewer.harness} ${reviewer.version ?? "version unknown"}, requested session ${reviewer.requestedSessionId}, observed session ${reviewer.sessionId ?? "none"}`,
  );
  const suggestions = reviewer?.report?.suggestions ?? [];
  lines.push(suggestions.length === 0 ? "Out-of-scope suggestions: none" : "Out-of-scope suggestions:", ...suggestions.map((entry) => `  - ${entry}`));

  const deferred = run.reviewClassification?.suggestionsToDefer ?? [];
  if (deferred.length > 0) {
    lines.push(`Pending deferred proposals: ${deferred.length} held in external state`);
  }

  if (run.stopReason !== null) lines.push("", `Stop reason: ${run.stopReason}`);
  const actions = [
    ...(run.verdict?.rows ?? []).flatMap((row) => (row.nextAction === null ? [] : [`${row.criterionId}: ${row.nextAction}`])),
    ...(run.nextAction === null ? [] : [run.nextAction]),
  ];
  if (actions.length > 0) lines.push("", `Next action: ${Array.from(new Set(actions)).join("; ")}`);
  return lines.join("\n");
}

/**
 * What `task start` would launch, before anything is launched (D-02, AUTO-02):
 * each role with its exact installed version or the proof it lacks, GSD quick
 * readiness, the baseline, the approval state, the spend warning and the one
 * command that starts this approved digest.
 */
export function formatTaskStartReadiness(readiness: TaskStartReadiness, command: string): string {
  const role = (label: string, entry: TaskStartReadiness["controller"]) =>
    `${label}: ${entry.harness} ${entry.version === null ? "(not proven)" : `${entry.version} at ${entry.executable ?? "unknown executable"}`}`;
  const baseline = readiness.baseline;
  const baselineText =
    baseline.status === "clean"
      ? `clean at ${baseline.baseCommit.slice(0, 12)}`
      : baseline.status === "dirty"
        ? `dirty (${baseline.paths.length} uncommitted or untracked path${baseline.paths.length === 1 ? "" : "s"}: ${baseline.paths.slice(0, 10).join(", ")}${baseline.paths.length > 10 ? ", ..." : ""})`
        : `${baseline.status} (${baseline.reason})`;
  const approval = readiness.approval.consumedBy !== null
    ? `consumed by run ${readiness.approval.consumedBy}; approve a new contract revision to run again`
    : readiness.approval.approved
      ? "approved for a single run of this revision"
      : "not approved; the contract must still be approved before it can start";
  return [
    `Task: ${readiness.contractId} (revision ${readiness.revision})`,
    `Contract digest: ${readiness.contractDigest}`,
    `Project root: ${readiness.projectRoot}`,
    role("Controller", readiness.controller),
    role("Executor", readiness.executor),
    role("Reviewer", readiness.reviewer),
    ...(readiness.missingProof.length === 0 ? [] : ["Missing proof:", ...readiness.missingProof.map((entry) => `  ${entry}`)]),
    `GSD quick: ${readiness.gsd.ready ? "ready" : "not ready"} — ${readiness.gsd.reason}`,
    `Baseline: ${baselineText}`,
    `Approval: ${approval}`,
    "",
    `Readiness: ${readiness.ready ? "ready to start" : "not ready; start would be refused"}`,
    "Readiness preview only. Nothing was launched and nothing was written.",
    "Warning: --apply launches the controller and the reviewer, which spend model turns under your own harness accounts.",
    `Start exactly this approved digest: ${command}`,
  ].join("\n");
}

/**
 * Formats a supervisor run report into a human-readable summary.
 */
export function formatSupervisorReport(result: SupervisorResult): string {
  const { checkpoint, usage, ledger, blockedReport } = result;
  const lines: string[] = [
    `Task: ${checkpoint.contractId} (revision ${checkpoint.revision})`,
    `Contract digest: ${result.contractDigest}`,
    `Status: ${result.status}`,
    ...(result.stopCode !== null ? [`Stop code: ${result.stopCode}`] : []),
    "",
    "Usage Breakdown:",
    `  Cycles:      ${usage.cycles}`,
    `  Wall time:   ${Math.round(usage.wallTimeMs / 1000)}s`,
    `  Tokens:      ${usage.tokens !== null ? usage.tokens : "(unmetered)"}`,
    `  Cost (USD):  ${usage.costUsd !== null ? `$${usage.costUsd.toFixed(2)}` : "(unmetered)"}`,
    ...(usage.unmeteredFields.length > 0 ? [`  Unmetered:   ${usage.unmeteredFields.join(", ")}`] : []),
  ];

  const entries = Object.values(ledger.entries);
  if (entries.length > 0) {
    lines.push(
      "",
      "Effect Ledger:",
      ...entries.map(
        (e) => `  [${e.status}] ${e.effectType} (key: ${e.effectKey.slice(0, 12)}...)`,
      ),
    );
  }

  if (blockedReport !== null) {
    lines.push("", formatBlockedReport(blockedReport));
  } else if (usage.nextAction !== null) {
    lines.push("", `Next action: ${usage.nextAction}`);
  }

  return lines.join("\n");
}

/**
 * Formats a resume readiness preview.
 */
export function formatTaskResumeReadiness(readiness: TaskResumeReadiness, command?: string): string {
  const lines: string[] = [
    `Contract digest: ${readiness.contractDigest}`,
    `Checkpoint: ${readiness.checkpoint !== null ? `${readiness.checkpoint.status} (attempt ${readiness.checkpoint.attemptIndex})` : "none"}`,
    `GSD consistent: ${readiness.gsdConsistent ? "yes" : "no"}`,
    `Unapplied effects: ${readiness.unappliedEffectsCount}`,
    ...(readiness.reason !== undefined ? [`Notice: ${readiness.reason}`] : []),
    "",
    `Readiness: ${readiness.ready ? "ready to resume" : "not ready to resume"}`,
    "Readiness preview only. Nothing was launched and nothing was written.",
  ];

  if (command !== undefined && readiness.ready) {
    lines.push(`Resume task command: ${command}`);
  }

  return lines.join("\n");
}

/**
 * Formats a task status summary into human-readable text.
 */
export function formatTaskStatus(statusModel: {
  checkpoint: TaskCheckpoint;
  ledger: TaskEffectLedger | null;
  eventsCount: number;
  selectedRunId?: string | undefined;
  selectedStartedAt?: string | null | undefined;
  verdict?: string | undefined;
  status?: string | undefined;
  reasonCode?: string | undefined;
  reason?: string | undefined;
  nextAction?: string | undefined;
  gsdDiagnostics?: GsdLifecycleDiagnostics | null | undefined;
  capabilities?: TaskCapabilitySummary | undefined;
  capabilityReport?: TaskCapabilityReport | undefined;
  detail?: boolean | undefined;
  pendingSuggestionsCount?: number | undefined;
  suggestionsPath?: string | undefined;
}): string {
  const {
    checkpoint,
    ledger,
    eventsCount,
    selectedRunId,
    selectedStartedAt,
    verdict,
    status,
    reasonCode,
    reason,
    nextAction,
    gsdDiagnostics,
    capabilities,
    capabilityReport,
    detail,
    pendingSuggestionsCount,
    suggestionsPath,
  } = statusModel;
  const entries = ledger !== null ? Object.values(ledger.entries) : [];
  const appliedCount = entries.filter((e) => e.status === "applied").length;
  const pendingCount = entries.filter((e) => e.status !== "applied").length;

  const displayStatus = status ?? checkpoint.status;
  const lines: string[] = [
    `Task: ${checkpoint.contractId} (revision ${checkpoint.revision})`,
    ...(selectedRunId ? [`Run ID: ${selectedRunId}`] : []),
    ...(selectedStartedAt !== undefined ? [`Started at: ${selectedStartedAt ?? "not started yet"}`] : []),
    `Contract digest: ${checkpoint.contractDigest}`,
    `Verdict: ${(verdict ?? displayStatus).toUpperCase()}`,
    `Status: ${displayStatus}`,
    ...(reasonCode ? [`Reason code: ${reasonCode}`] : []),
    ...(reason ? [`Reason: ${reason}`] : checkpoint.stopReason ? [`Stop reason: ${checkpoint.stopReason}`] : []),
    ...(nextAction ? [`Next action: ${nextAction}`] : []),
    "",
    "Progress & Execution:",
    `  Cycle: ${checkpoint.usage.cycles}`,
    `  Attempt: ${checkpoint.attemptIndex}`,
    `  Wall time: ${Math.round(checkpoint.usage.wallTimeMs / 1000)}s`,
    `  Tokens: ${checkpoint.usage.tokens !== null ? checkpoint.usage.tokens : "(unmetered)"}`,
    `  Cost (USD): ${checkpoint.usage.costUsd !== null ? `$${checkpoint.usage.costUsd.toFixed(2)}` : "(unmetered)"}`,
    `  Last verified HEAD: ${checkpoint.lastVerifiedHead ?? "none"}`,
    `  Stop reason: ${checkpoint.stopReason ?? "none"}`,
    `  Effect summary: ${appliedCount} applied, ${pendingCount} pending`,
    `  Journal events: ${eventsCount}`,
    `  Last updated: ${checkpoint.updatedAt}`,
  ];

  if (pendingSuggestionsCount !== undefined && pendingSuggestionsCount > 0) {
    lines.push(`Pending deferred proposals: ${pendingSuggestionsCount} held in external state file: ${suggestionsPath ?? "external state"}`);
  }

  if (gsdDiagnostics) {
    lines.push(
      "",
      `GSD Phase: ${gsdDiagnostics.currentPhase ?? "none"} (${gsdDiagnostics.phaseStatus ?? "unknown"})`,
      `GSD Plans: ${gsdDiagnostics.completedPlansCount} completed, ${gsdDiagnostics.pendingPlansCount} pending (phase complete: ${gsdDiagnostics.isPhaseComplete ? "yes" : "no"})`,
      `Hook Receipts: ${gsdDiagnostics.hooks.passedCount} passed, ${gsdDiagnostics.hooks.failedCount} failed (${gsdDiagnostics.hooks.executedCount} total)`,
      `Review Witness: ${gsdDiagnostics.reviewWitness.recorded ? (gsdDiagnostics.reviewWitness.matchesHead ? "valid (matches HEAD)" : "stale (revision mismatch)") : "none recorded"}`,
    );
  }

  if (capabilities) {
    lines.push("", formatTaskCapabilitySummary(capabilities));
  }

  if (detail && capabilityReport) {
    lines.push(formatTaskCapabilityDetail(capabilityReport));
  }

  return lines.join("\n");
}

/**
 * Formats task capability summary into human-readable text (D-16).
 * Highlights selected, failed, blocked capabilities and primary omitted reasons.
 */
export function formatTaskCapabilitySummary(summary: TaskCapabilitySummary): string {
  const lines: string[] = ["Capabilities:"];

  if (summary.selected.length === 0) {
    lines.push("  Selected: none");
  } else {
    lines.push("  Selected:");
    for (const item of summary.selected) {
      const sourceVer = item.source && item.version ? ` (${item.source} v${item.version})` : "";
      lines.push(`    - ${item.capabilityId}${sourceVer}: ${item.reason ?? "selected"}`);
    }
  }

  if (summary.failed.length === 0) {
    lines.push("  Failed: none");
  } else {
    lines.push("  Failed:");
    for (const item of summary.failed) {
      const receipt = item.receiptId ? ` [${item.receiptId}]` : "";
      lines.push(`    - ${item.capabilityId}${receipt}: ${item.outcome} (${item.error})`);
    }
  }

  if (summary.blocked.length === 0) {
    lines.push("  Blocked: none");
  } else {
    lines.push("  Blocked:");
    for (const item of summary.blocked) {
      const action = item.nextAction ? ` — next action: ${item.nextAction}` : "";
      lines.push(`    - ${item.capabilityId}: ${item.reason}${action}`);
    }
  }

  if (summary.omitted.length === 0) {
    lines.push("  Omitted: none");
  } else {
    lines.push("  Omitted:");
    for (const item of summary.omitted) {
      const superseded = item.supersededBy ? ` (superseded by ${item.supersededBy})` : "";
      lines.push(`    - ${item.capabilityId}${superseded}: ${item.reason}`);
    }
  }

  return lines.join("\n");
}

/**
 * Formats full capability detail tables including inventory, drift guidance, and receipts (D-16, D-17).
 */
export function formatTaskCapabilityDetail(report: TaskCapabilityReport): string {
  const lines: string[] = [];

  if (report.obligations.length > 0) {
    lines.push("", `Step Obligations (${report.obligations.length} obligations for step ${report.step}):`);
    const obRows = report.obligations.map((o) => [
      o.id,
      o.capabilityId,
      o.required ? "required" : "optional",
      `${o.source} v${o.version}`,
      o.reusedFromReceiptId ? `reused (${o.reusedFromReceiptId})` : "fresh",
      o.question ? (o.question.length > 40 ? o.question.slice(0, 37) + "..." : o.question) : "-",
    ]);
    lines.push(table(["OBLIGATION ID", "CAPABILITY", "KIND", "SOURCE/VERSION", "RECEIPT", "QUESTION"], obRows));
  }

  lines.push("", `Capability Inventory (${report.inventory.items.length} items):`);
  const invRows = report.inventory.items.map((item) => [
    item.id,
    item.kind,
    item.version,
    item.scope,
    item.deployment,
    item.support,
    item.nativeUse,
    item.exclusionReason ?? item.unavailableReason ?? item.applicabilityReason ?? "-",
  ]);
  lines.push(table(["CAPABILITY ID", "KIND", "VERSION", "SCOPE", "DEPLOY", "SUPPORT", "NATIVE-USE", "REASON"], invRows));

  if (report.drift.hasDrift) {
    lines.push("", `Capability Drift Guidance (${report.drift.summary}):`);
    const driftRows = report.drift.entries.filter((e) => e.drifted).map((entry) => [
      entry.capabilityId,
      entry.changedFields.join(", ") || "-",
      entry.driftReasons.join(", ") || "-",
      entry.invalidatedReceiptIds.join(", ") || "none",
      entry.nextAction,
    ]);
    if (driftRows.length > 0) {
      lines.push(table(["CAPABILITY", "CHANGED FIELDS", "DRIFT REASONS", "INVALIDATED RECEIPTS", "NEXT ACTION"], driftRows));
    }
  }

  if (report.receipts.length > 0) {
    lines.push("", `Capability Receipts (${report.receipts.length} receipts):`);
    const rcRows = report.receipts.map((r) => [
      r.receiptId,
      r.capabilityId,
      r.step,
      r.harness,
      r.outcome,
      r.status,
      r.invocationEvidenceHash.slice(0, 12),
    ]);
    lines.push(table(["RECEIPT ID", "CAPABILITY", "STEP", "HARNESS", "OUTCOME", "PROOF STATUS", "EVIDENCE HASH"], rcRows));
  }

  return lines.join("\n");
}

/**
 * Formats a read-only task capability plan (D-16).
 */
export function formatTaskPlan(report: TaskCapabilityReport, options: { readonly detail?: boolean } = {}): string {
  const lines: string[] = [
    `Task Plan: ${report.contractId ?? "unknown"}${report.contractRevision !== undefined ? ` (revision ${report.contractRevision})` : ""}`,
    `Contract digest: ${report.contractDigest ?? "none"}`,
    `Step: ${report.step}`,
    "",
    formatTaskCapabilitySummary(report.summary),
  ];

  if (options.detail) {
    lines.push(formatTaskCapabilityDetail(report));
  }

  return lines.join("\n");
}

/**
 * Formats a final review readiness preview (D-16, T-19-09).
 */
export function formatFinalReviewPreview(readiness: FinalReviewReadiness, command: string): string {
  const lines: string[] = [
    `Task: ${readiness.contractId} (revision ${readiness.revision})`,
    `Contract digest: ${readiness.contractDigest}`,
    `Final Review Readiness: ${readiness.ready ? "READY" : "NOT READY"}`,
    `Approved: ${readiness.approved ? "yes" : "no"}`,
    `Reviewer: ${readiness.reviewerHarness} (fresh-read-only session)`,
    `Mandatory requirements: ${readiness.requirementsCount} to verify`,
    `Target revision SHA: ${readiness.targetRevisionSha ?? "none (working tree not clean)"}`,
    `Artifact digest: ${readiness.workingTreeDigest ?? "unavailable"}`,
    `Pending suggestions: ${readiness.pendingSuggestionsCount} held in external state`,
    "",
    "Readiness preview only. Nothing was launched and no review was executed.",
    "Warning: --apply launches an independent final review session under your approved reviewer policy.",
  ];

  if (!readiness.ready && readiness.reasons.length > 0) {
    lines.push("", "Blockers:");
    for (const reason of readiness.reasons) {
      lines.push(`  - ${reason}`);
    }
  }

  if (readiness.ready) {
    lines.push("", `Run final review: ${command}`);
  }

  return lines.join("\n");
}

/**
 * Formats an executed final review result with full criterion evidence, automated checks,
 * reviewer identity, cross-phase assessments, and next action (D-16, REV-03..05).
 */
export function formatFinalReviewReport(options: {
  readonly result: GateMilestoneFinalReviewResult;
  readonly contractId: string;
  readonly contractDigest: string;
  readonly pendingSuggestionsCount?: number | undefined;
  readonly suggestionsPath?: string | undefined;
}): string {
  const { result, contractId, contractDigest, pendingSuggestionsCount, suggestionsPath } = options;
  const report = result.report;

  const lines: string[] = [
    `Task: ${contractId}`,
    `Contract digest: ${contractDigest}`,
    `Milestone Final Review Status: ${result.status.toUpperCase()}`,
    `Reason: ${result.reason}`,
  ];

  if (report) {
    lines.push(
      `Reviewer: ${report.reviewerHarness} ${report.reviewerVersion}`,
      `Session ID: ${report.sessionId}`,
      `Evaluated at: ${report.evaluatedAt}`,
      `Target revision: ${report.targetRevisionSha}`,
      `Artifact digest: ${report.artifactDigest}`,
      "",
    );

    // D-16, Prohibitions: No missing evidence or implicit pass
    const reqRows = report.requirements.map((r) => {
      const loc = r.implementationLocation?.path
        ? `${r.implementationLocation.path}${r.implementationLocation.lineRange ? `:${r.implementationLocation.lineRange}` : ""}`
        : "none (missing)";
      const chk = r.checkReceiptRef?.status
        ? `${r.checkReceiptRef.status} (${r.checkReceiptRef.receiptId || "receipt"})`
        : "none (unverified)";
      const rev = r.reviewEvidenceRef?.reportDigest
        ? `${r.reviewEvidenceRef.reportDigest.slice(0, 8)}${r.reviewEvidenceRef.criterionId ? `:${r.reviewEvidenceRef.criterionId}` : ""}`
        : "none (unverified)";
      const next = r.status === "verified"
        ? "none"
        : r.notes || (r.status === "missing" ? "implement missing requirement" : "re-verify requirement evidence");

      return [
        r.requirementId,
        r.status,
        loc,
        chk,
        rev,
        next,
      ];
    });

    lines.push(
      "Mandatory Requirements Evaluation:",
      table(["Requirement", "Status", "Implementation", "Automated Check", "Review Evidence", "Next Action"], reqRows),
      "",
    );

    // Cross-Phase Assessment
    const cross = report.crossPhaseAssessment;
    const crossRows = [
      ["userFlow", cross.userFlow.status.toUpperCase(), cross.userFlow.summary],
      ["approvalBoundaries", cross.approvalBoundaries.status.toUpperCase(), cross.approvalBoundaries.summary],
      ["gsdStateOwnership", cross.gsdStateOwnership.status.toUpperCase(), cross.gsdStateOwnership.summary],
      ["reviewerIndependence", cross.reviewerIndependence.status.toUpperCase(), cross.reviewerIndependence.summary],
    ];
    lines.push(
      "Cross-Phase & Architectural Assessment:",
      table(["Assessment Item", "Status", "Summary"], crossRows),
      "",
    );

    // Findings (if any)
    if (report.findings.length > 0) {
      lines.push("Findings:");
      for (const finding of report.findings) {
        lines.push(`  [${finding.impact.toUpperCase()}] ${finding.category} (${finding.scope}): ${finding.summary}`);
      }
      lines.push("");
    }
  }

  // D-08: Pending suggestions
  if (pendingSuggestionsCount !== undefined && pendingSuggestionsCount > 0) {
    lines.push(`Pending deferred proposals: ${pendingSuggestionsCount} held in external state file: ${suggestionsPath ?? "external state"}`);
  }

  if (result.witnessReceipt) {
    lines.push(`Witness receipt: ${result.witnessReceipt.receiptDigest} (persisted)`);
  }

  if (result.status !== "accepted") {
    lines.push("", "Next action: Resolve blocking findings or unverified requirements and re-run final review with --apply.");
  }

  return lines.join("\n");
}

/**
 * Formats a CoursePilot / General Task reapproval preview (D-04).
 * Shows the full approved scope (with unchanged items) alongside added/removed/changed items,
 * and highlights changes clearly.
 */
export function formatTaskReapprovalPreview(preview: TaskReapprovalPreview): string {
  const lines: string[] = [
    `Reapproval Preview for Task: ${preview.contractId}`,
    `Approved Manifest Digest: ${preview.approvedDigest.slice(0, 16)}`,
    `Current Manifest Digest:  ${preview.currentDigest.slice(0, 16)}`,
    `Status: ${preview.isStale ? "STALE (Reapproval Required)" : "CURRENT (Approved)"}`,
    "",
    "--- Approved Scope & Changes ---",
  ];

  for (const item of preview.approvedScope) {
    let marker: string;
    if (item.status === "changed") {
      marker = "[* CHANGED] ";
    } else if (item.status === "removed") {
      marker = "[- REMOVED] ";
    } else {
      marker = "[UNCHANGED] ";
    }

    lines.push(`  ${marker}${item.courseId} / Week ${item.weekNumber} / ${item.title} (${item.moduleId})`);
    if (item.changeReason) {
      lines.push(`    Reason: ${item.changeReason}`);
    }
    for (const f of item.files) {
      lines.push(`      - file: ${f.filename} (${f.fileId})`);
    }
  }

  if (preview.added.length > 0) {
    lines.push("");
    lines.push("--- New Unapproved Materials (Pending Approval) ---");
    for (const item of preview.added) {
      lines.push(`  [+ ADDED]   ${item.courseId} / Week ${item.weekNumber} / ${item.title} (${item.moduleId})`);
      for (const f of item.files) {
        lines.push(`      - file: ${f.filename} (${f.fileId})`);
      }
    }
  }

  lines.push("");
  lines.push(
    `Summary: ${preview.unchanged.length} unchanged, ${preview.changed.length} changed, ${preview.removed.length} removed, ${preview.added.length} newly added`,
  );
  if (preview.isStale) {
    lines.push("Action Required: Reapproval needed before proceeding with modified items.");
  }

  return lines.join("\n");
}

/**
 * Formats a General Task / CoursePilot execution report (D-13, D-14, D-15, D-16).
 * Follows aggregate-first principle, followed by course/week/material details, and finally next actions.
 */
export function formatGeneralTaskReport(report: GeneralTaskReportData): string {
  const lines: string[] = [
    `General Task Report: ${report.contractId}`,
    `Run: ${report.runId}`,
    `Overall Status: ${report.overallStatus.toUpperCase()}`,
    "",
    "=== 1. Summary (Aggregate) ===",
    "Physical Files (Deduplicated):",
    `  Total Distinct Saved: ${report.summary.physicalFiles.totalDistinctSaved}`,
    `  Newly Downloaded:     ${report.summary.physicalFiles.newlyDownloaded}`,
    `  Previously Confirmed: ${report.summary.physicalFiles.previouslyConfirmed}`,
    "Materials Completion (Denominator: Approved Materials):",
    `  Approved Target Total:  ${report.summary.materials.approvedTotal}`,
    `  Verified Complete:      ${report.summary.materials.verifiedComplete}`,
    `  Partial Complete:       ${report.summary.materials.partialComplete}`,
    `  Failed / Unsaved:       ${report.summary.materials.failedOrUnsaved}`,
    `  Viewed Only (Unsaved):  ${report.summary.materials.viewedOnly}`,
    `  Pending Unapproved:     ${report.summary.materials.pendingUnapproved} (not counted in denominator)`,
    "",
    "=== 2. Materials & Files Details ===",
  ];

  const sanitize = (raw: string, maxLen = 120): string => {
    const cleaned = raw.replace(/[\x00-\x1F\x7F]/gu, "").replace(/\s+/gu, " ").trim();
    return cleaned.length <= maxLen ? cleaned : `${cleaned.slice(0, maxLen - 3)}...`;
  };

  for (const item of report.details) {
    const title = sanitize(item.title);
    lines.push(`- [${item.status.toUpperCase()}] ${item.courseId} Week ${item.weekNumber}: ${title} (${item.itemId})`);
    lines.push(`  Files: ${item.verifiedFilesCount}/${item.totalRequiredFilesCount} verified`);
    for (const f of item.files) {
      const filename = sanitize(f.filename);
      const bytesStr = f.bytes !== undefined ? `, ${f.bytes} bytes` : "";
      const shaStr = f.sha256 ? `, sha256: ${f.sha256.slice(0, 8)}...` : "";
      const errStr = f.error ? ` - error: ${sanitize(f.error, 150)}` : "";
      lines.push(`    * [${f.status}] ${filename} (${f.fileId}${bytesStr}${shaStr})${errStr}`);
    }
  }

  lines.push("");
  lines.push("=== 3. Next Actions for Unresolved Materials ===");
  if (report.nextActions.length === 0) {
    lines.push("  None: all approved materials are verified complete.");
  } else {
    for (const action of report.nextActions) {
      lines.push(`- [${action.actionType.toUpperCase()}] ${sanitize(action.title)} (${action.itemId})`);
      lines.push(`  Reason: ${action.reason}`);
      lines.push(`  Action: ${sanitize(action.description, 200)}`);
    }
  }

  return lines.join("\n");
}




