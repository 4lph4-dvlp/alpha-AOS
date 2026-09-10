// The host capability ledger: the ONE record of what was proven about a
// capability on THIS machine.
//
// 03-CONTEXT.md D-03 puts it under `userStateRoot()` and never inside a
// project, because "this harness on this machine discovered this skill" is a
// host fact that becomes false on a colleague's machine the moment it is
// committed. D-11 models CAPA-07's eight states as orthogonal axes rather than
// one enum, and this module owns exactly one of those axes — the native-use
// axis. `PackState` (deployment) and `SurfaceSupport` (support) already exist
// and are deliberately untouched here.

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { SurfaceSupport } from "../types.js";
import { packageRoot, RootKeyedCache, userStateRoot } from "./paths.js";
// Type-only, and deliberately so: this module READS the deployment axis and
// never defines, widens or reimplements it (03-CONTEXT.md D-11). A type-only
// import is also erased at runtime, so the ledger does not drag the whole
// project-plan module into a status path that only needs three strings.
import type { PackState } from "./project-plan.js";
import { applyFileTransaction } from "./transaction.js";
import { rejectRawCredentials, validateManagedDocument, type ValidationIssue } from "./validation.js";
import type { MutationSession } from "./writer-lock.js";

/** Directory under the user state root that holds host-scoped capability evidence. */
export const CAPABILITY_LEDGER_DIRECTORY = "capabilities";
/** The single ledger document inside that directory. */
export const CAPABILITY_LEDGER_FILE = "ledger.json";
/** The schema version this module writes. */
export const CAPABILITY_LEDGER_SCHEMA_VERSION = 1;

/**
 * The harnesses a proof can name.
 *
 * Narrower than `HarnessId` on purpose, and narrowed in exactly the same place
 * the schema narrows it: `antigravity` has no non-interactive entrypoint
 * (03-RESEARCH.md Open Question 1), so no run could ever produce a proof for
 * it, and a record claiming one is unrepresentable rather than merely absent.
 */
export type LedgerHarness = "claude" | "codex" | "pi" | "hermes";

/**
 * The native-use axis, and ONLY that axis.
 *
 * `unverified` is the fail-closed value: not attempted, or attempted and not
 * comparable. It is distinct from a `blockedReason`, which is a KNOWN and
 * actionable cause (03-CONTEXT.md D-12).
 */
export type NativeUseState = "discovered" | "invoked" | "unverified";

/** Which half of a paired evidence unit a proof is (03-CONTEXT.md D-14). */
export type EvidencePolarity = "positive" | "negative";

/**
 * Why a run could not complete, when the cause is known and actionable.
 *
 * There is no value field, and there is deliberately no way to add one without
 * changing this type and the closed schema together. The SHAPE is what keeps a
 * credential out of the ledger — not a redaction pass over free text (T-03-22).
 */
export interface BlockedReason {
  /** Stable upper-snake code. Callers branch on this, never on the sentence. */
  readonly code: string;
  /** The NAME of the credential variable, e.g. `EXA_API_KEY`. Never its value. */
  readonly variable: string;
  /** One sentence the user can act on. */
  readonly nextAction: string;
}

/** The three nouns a proof binds to under 03-CONTEXT.md D-04. */
export interface BoundInputs {
  readonly skillSourceHash: string;
  /** Null when the capability involved no MCP server at all. */
  readonly mcpServerVersion: string | null;
  /** Null when no project evidence selected the capability. */
  readonly evidenceHash: string | null;
}

/**
 * A harness version in three parts: what the comparison reads (`minorKey`),
 * what an audit reads (`exact`), and what the harness actually printed (`raw`).
 */
export interface HarnessVersion {
  /** The extracted semantic version, or null when none could be extracted. */
  readonly exact: string | null;
  /** `MAJOR.MINOR` of `exact`. Null exactly when `exact` is null. */
  readonly minorKey: string | null;
  /** The whole printed line. Kept for audit and bound to by NOTHING. */
  readonly raw: string;
}

/**
 * The assertion that makes a negative control meaningful (03-RESEARCH.md
 * Pitfall 3): the control directory was CONSTRUCTED and proven free of an
 * ancestor project skill root, rather than assumed to be.
 */
export interface AncestorFreedom {
  readonly asserted: boolean;
  /** Every ancestor actually checked, so the assertion is auditable. */
  readonly checkedAncestors: readonly string[];
}

/** What was run and what it returned. Output is a fingerprint, never bytes. */
export interface OracleRecord {
  readonly command: string;
  /** Null when the process was terminated rather than exiting on its own terms. */
  readonly exitCode: number | null;
  readonly stdoutFingerprint: string;
  readonly stderrFingerprint: string;
}

/** One row of the ledger: what was proven, about what, bound to which inputs. */
export interface CapabilityProof {
  /** Null for a capability that is not project-scoped at all. */
  readonly projectId: string | null;
  readonly harness: LedgerHarness;
  readonly capability: string;
  readonly polarity: EvidencePolarity;
  readonly nativeUse: NativeUseState;
  readonly blockedReason: BlockedReason | null;
  readonly boundInputs: BoundInputs;
  readonly harnessVersion: HarnessVersion;
  /** Required on a negative half; null on a positive. */
  readonly ancestorFreedom: AncestorFreedom | null;
  readonly observedAt: string;
  readonly oracle: OracleRecord;
  /**
   * Exact harness versions this row's EARLIER proofs were taken on, oldest
   * first. Audit only, and bound to by nothing.
   *
   * 03-CONTEXT.md D-04 says the ledger always records the exact version that
   * was proven, so an audit can still see it. A row that is replaced in place
   * would otherwise silently drop that fact the first time a harness
   * auto-updated inside one minor.
   */
  readonly supersededHarnessVersions?: readonly string[];
}

export interface CapabilityLedger {
  readonly schemaVersion: number;
  readonly producer: { readonly name: string; readonly version: string };
  readonly updatedAt: string;
  readonly proofs: readonly CapabilityProof[];
}

/**
 * The tri-state a ledger read returns.
 *
 * The same shape `readApprovedProjectPlan` returns, for the same reason: a
 * document that exists but cannot be trusted must not be reported as one that
 * is absent. `absent` means "nothing has been proven on this host yet" and is a
 * legitimate starting state; `unreadable` means "something is there and this
 * tool refuses to read it", which is a fact a user has to be told.
 */
export type CapabilityLedgerRead =
  | { readonly state: "present"; readonly ledger: CapabilityLedger }
  | { readonly state: "absent" }
  | {
      readonly state: "unreadable";
      /** The path that failed, so a report never makes a user guess which file. */
      readonly path: string;
      /** The OS error code when the failure was I/O, null when it was validation. */
      readonly errno: string | null;
      readonly issues: readonly ValidationIssue[];
    };

/**
 * The directory the ledger lives in, under the supplied state root.
 *
 * `stateRoot` is REQUIRED here. This is the value that becomes a transaction's
 * `allowedRoots`, and a convenience default would let a caller write into the
 * developer's real state root without ever naming it.
 */
export function capabilityLedgerRoot(stateRoot: string): string {
  return join(stateRoot, CAPABILITY_LEDGER_DIRECTORY);
}

/**
 * The ledger file under a state root.
 *
 * The default is the READER's convenience — resolving a path performs no I/O
 * and takes no lock. Every WRITE path in this module requires an explicit
 * state root instead; see `writeCapabilityLedger`.
 */
export function capabilityLedgerPath(stateRoot: string = userStateRoot()): string {
  return join(capabilityLedgerRoot(stateRoot), CAPABILITY_LEDGER_FILE);
}

// Root-keyed under the rule this repository applies to every process-wide
// cache whose value depends on a package root (WR-09). The schema file is
// repository content that cannot change inside one process, so re-reading it
// per call would put a filesystem read on the status path's hot loop — but two
// package roots in one process must not share one answer.
const capabilityLedgerSchemas = new RootKeyedCache<Record<string, unknown>>();

async function loadCapabilityLedgerSchema(): Promise<Record<string, unknown>> {
  const root = packageRoot();
  return capabilityLedgerSchemas.load(
    root,
    async () =>
      JSON.parse(await readFile(join(root, "schemas", "capability-ledger.schema.json"), "utf8")) as Record<
        string,
        unknown
      >,
  );
}

/**
 * The ledger at a path, read through the ONE managed document route.
 *
 * This is host state: a user, another tool, or a synced dotfiles repository can
 * have edited it. It therefore travels `validateManagedDocument` against the
 * closed schema exactly as a receipt does, with the raw-credential domain check
 * on top. A file that exists but fails that schema is `unreadable` WITH the
 * issues — never `absent`, and never partially trusted, because a partially
 * trusted ledger is a ledger that can claim a proof that never ran (T-03-20).
 */
export async function readCapabilityLedger(path: string): Promise<CapabilityLedgerRead> {
  if (!existsSync(path)) return { state: "absent" };

  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    // The errno is carried as a first-class field rather than buried in a
    // sentence, because "the ledger is a directory" and "the ledger is not
    // readable by this user" need different next actions.
    const errno = typeof (error as NodeJS.ErrnoException).code === "string" ? (error as NodeJS.ErrnoException).code! : null;
    return {
      state: "unreadable",
      path,
      errno,
      issues: [
        {
          code: "io.unreadable",
          documentPath: "/",
          expected: `${CAPABILITY_LEDGER_FILE} to be readable`,
          actualShape: `read error(name=${error instanceof Error ? error.name : "Error"}, errno=${errno ?? "unknown"})`,
        },
      ],
    };
  }

  const result = validateManagedDocument<CapabilityLedger>({
    text,
    format: "json",
    kind: "capability-ledger",
    schema: await loadCapabilityLedgerSchema(),
    domain: rejectRawCredentials,
  });
  if (!result.ok || result.value === null) {
    const issues =
      result.issues.length > 0
        ? result.issues
        : [
            {
              code: `status.${result.status}`,
              documentPath: "/",
              expected: "a current, valid capability-ledger document",
              actualShape: `document(status=${result.status})`,
            },
          ];
    return { state: "unreadable", path, errno: null, issues };
  }
  return { state: "present", ledger: result.value };
}

// ---------------------------------------------------------------------------
// The native-use axis: resolution, demotion, and version parsing
// ---------------------------------------------------------------------------

/** The values a stored proof is re-resolved against. Null means "not known now". */
export interface CurrentInputs {
  readonly skillSourceHash: string | null;
  readonly mcpServerVersion: string | null;
  readonly evidenceHash: string | null;
  /** The harness version line as the harness prints it now, unparsed. */
  readonly harnessVersion: string | null;
}

/** Which bound noun a demotion is about. Each one demotes on its own. */
export type DemotionNoun = "skillSourceHash" | "mcpServerVersion" | "evidenceHash" | "harnessVersion";

export interface DemotionReason {
  readonly code:
    | "SKILL_SOURCE_HASH_MOVED"
    | "MCP_SERVER_VERSION_MOVED"
    | "PACK_EVIDENCE_HASH_MOVED"
    | "HARNESS_MINOR_MOVED"
    | "HARNESS_VERSION_UNPARSEABLE"
    | "BOUND_INPUT_NOT_COMPARABLE";
  readonly noun: DemotionNoun;
  /** One sentence that NAMES its own noun, so two demotions never read alike. */
  readonly sentence: string;
}

export interface NativeUseResolution {
  readonly nativeUse: NativeUseState;
  readonly demoted: boolean;
  readonly reasons: readonly DemotionReason[];
  /** The exact version the proof was taken against, readable after a demotion. */
  readonly provenHarnessVersion: HarnessVersion;
  readonly blocked: boolean;
  readonly blockedReason: BlockedReason | null;
}

/** The three orthogonal axes, obtainable only together (03-CONTEXT.md D-11). */
export interface CapabilityAxes {
  readonly deployment: PackState;
  readonly support: SurfaceSupport;
  readonly nativeUse: NativeUseState;
}

export interface CapabilityStatus {
  readonly capability: string;
  readonly harness: LedgerHarness;
  readonly axes: CapabilityAxes;
  readonly resolution: NativeUseResolution;
}

export interface ResolveCapabilityStatusOptions {
  readonly capability: string;
  readonly harness: LedgerHarness;
  readonly deployment: PackState;
  readonly support: SurfaceSupport;
  readonly proof: CapabilityProof;
  readonly current: CurrentInputs;
}

/**
 * The leading semantic version inside a decorated line.
 *
 * Deliberately NOT anchored: three of the four harnesses decorate their
 * version output — a `codex-cli ` prefix, a ` (Claude Code)` suffix, and a
 * hermes line carrying a build date and two commit shas. Only the leading
 * version is bound, because 03-RESEARCH.md Pitfall 6 observed hermes's
 * `upstream <sha>` token moving twice inside one session with no install
 * change; fingerprinting the whole line would demote every hermes proof
 * whenever the remote head moved.
 */
const LEADING_SEMVER = /(\d+)\.(\d+)\.(\d+)/u;

/**
 * Splits a printed version line into the three parts a proof records.
 *
 * A line with no extractable version is `unverified`, never an error: the raw
 * string is kept so a human can see exactly what could not be parsed.
 */
export function harnessMinorKey(raw: string): HarnessVersion {
  const match = LEADING_SEMVER.exec(raw);
  const major = match?.[1];
  const minor = match?.[2];
  const patch = match?.[3];
  if (major === undefined || minor === undefined || patch === undefined) {
    return { exact: null, minorKey: null, raw };
  }
  return { exact: `${major}.${minor}.${patch}`, minorKey: `${major}.${minor}`, raw };
}

/**
 * The human phrase for each bound noun.
 *
 * Every demotion sentence opens with its own noun, so two demotions never read
 * alike. A reader who is told only "the proof was demoted" has to diff two
 * records to find out what moved; a reader told "the MCP server version moved"
 * already knows where to look.
 */
const NOUN_PHRASE: Record<DemotionNoun, string> = {
  skillSourceHash: "the skill source hash",
  mcpServerVersion: "the MCP server version",
  evidenceHash: "the pack evidence hash",
  harnessVersion: "the harness version",
};

/** Hashes are not secrets, but a full pair of them makes a sentence unreadable. */
function shortHash(value: string): string {
  return value.length > 12 ? `${value.slice(0, 12)}...` : value;
}

function notComparable(noun: DemotionNoun): DemotionReason {
  return {
    code: "BOUND_INPUT_NOT_COMPARABLE",
    noun,
    sentence: `${NOUN_PHRASE[noun]} could not be compared, because the current value is not known; absent information is not a match`,
  };
}

function compareBoundInput(
  reasons: DemotionReason[],
  noun: DemotionNoun,
  movedCode: DemotionReason["code"],
  proven: string,
  now: string | null,
  render: (value: string) => string,
): void {
  if (now === null) {
    reasons.push(notComparable(noun));
    return;
  }
  if (now === proven) return;
  reasons.push({
    code: movedCode,
    noun,
    sentence: `${NOUN_PHRASE[noun]} moved from ${render(proven)} to ${render(now)}`,
  });
}

/**
 * Copies a blocked reason down to exactly the three fields it may have.
 *
 * The type already has no value field, but this record is assembled from a
 * document a user can edit, so the copy is explicit rather than a spread: a
 * smuggled `value` reaches neither the resolved record nor anything rendered
 * from it, and the closed schema refuses the document besides (T-03-22).
 */
function normalizeBlockedReason(reason: BlockedReason | null): BlockedReason | null {
  if (reason === null || typeof reason !== "object") return null;
  return { code: reason.code, variable: reason.variable, nextAction: reason.nextAction };
}

/**
 * Re-resolves a stored proof against the inputs as they are NOW.
 *
 * 03-CONTEXT.md D-04 in code: the three bound nouns demote on any change and
 * the harness demotes at a MINOR boundary only. The minor rule is not a
 * softening — harnesses auto-update, so a patch-level rebinding would leave the
 * ledger permanently red and a permanently red ledger is one nobody reads. The
 * comparison is therefore on minor keys, never on the exact version string.
 *
 * A demoted proof resolves `unverified` and keeps its reasons; the exact
 * version it was taken against stays readable, so an audit can still see what
 * was proven and when it stopped counting.
 */
export function resolveNativeUse(proof: CapabilityProof, current: CurrentInputs): NativeUseResolution {
  const reasons: DemotionReason[] = [];

  compareBoundInput(
    reasons,
    "skillSourceHash",
    "SKILL_SOURCE_HASH_MOVED",
    proof.boundInputs.skillSourceHash,
    current.skillSourceHash,
    shortHash,
  );
  // The MCP server version and the pack evidence hash are bound only when the
  // proof recorded one. A capability that involved no MCP server has nothing to
  // compare there, and inventing a mismatch would demote it forever.
  if (proof.boundInputs.mcpServerVersion !== null) {
    compareBoundInput(
      reasons,
      "mcpServerVersion",
      "MCP_SERVER_VERSION_MOVED",
      proof.boundInputs.mcpServerVersion,
      current.mcpServerVersion,
      (value) => value,
    );
  }
  if (proof.boundInputs.evidenceHash !== null) {
    compareBoundInput(
      reasons,
      "evidenceHash",
      "PACK_EVIDENCE_HASH_MOVED",
      proof.boundInputs.evidenceHash,
      current.evidenceHash,
      shortHash,
    );
  }

  const proven = proof.harnessVersion;
  if (current.harnessVersion === null) {
    reasons.push(notComparable("harnessVersion"));
  } else {
    const now = harnessMinorKey(current.harnessVersion);
    if (proven.minorKey === null || now.minorKey === null) {
      reasons.push({
        code: "HARNESS_VERSION_UNPARSEABLE",
        noun: "harnessVersion",
        sentence:
          `${NOUN_PHRASE.harnessVersion} could not be parsed to a minor key, so the proof is unverified rather ` +
          `than in error: proven "${proven.raw}", now "${now.raw}"`,
      });
    } else if (proven.minorKey !== now.minorKey) {
      reasons.push({
        code: "HARNESS_MINOR_MOVED",
        noun: "harnessVersion",
        sentence:
          `${NOUN_PHRASE.harnessVersion} crossed a minor boundary, from ${proven.minorKey} ` +
          `(proven at ${proven.exact ?? "an unparseable version"}) to ${now.minorKey} (now ${now.exact ?? "unknown"}); ` +
          `a patch bump inside one minor does not demote`,
      });
    }
  }

  const demoted = reasons.length > 0;
  const blockedReason = normalizeBlockedReason(proof.blockedReason);
  return {
    nativeUse: demoted ? "unverified" : proof.nativeUse,
    demoted,
    reasons,
    provenHarnessVersion: { exact: proven.exact, minorKey: proven.minorKey, raw: proven.raw },
    blocked: blockedReason !== null,
    blockedReason,
  };
}

// The two axes this module does NOT own, listed so a caller that supplies
// neither can be refused rather than defaulted. Both unions live elsewhere and
// are untouched here (03-CONTEXT.md D-11).
const PACK_STATES: readonly PackState[] = ["CURRENT", "STALE", "DRIFTED", "CHANGED", "CONFLICT", "UNDECIDABLE"];
const SURFACE_SUPPORTS: readonly SurfaceSupport[] = ["supported", "unsupported", "unverified"];

/** Shape-only description of a rejected value; never the value itself. */
function shapeOfAxis(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  return typeof value === "string" ? `string(length=${value.length})` : typeof value;
}

/**
 * The one way to obtain a capability's state.
 *
 * All three axes are required, and a caller that omits one is REFUSED rather
 * than given a default. That refusal is the whole mechanism behind D-11: a
 * status assembled from two axes and a silent default is exactly the single
 * misleading `installed` state CAPA-07 forbids, and it would be indistinguishable
 * from a complete one at the call site that renders it.
 */
export function resolveCapabilityStatus(options: ResolveCapabilityStatusOptions): CapabilityStatus {
  if (!PACK_STATES.includes(options?.deployment as PackState)) {
    throw new Error(
      `resolveCapabilityStatus requires a deployment axis (PackState); received ${shapeOfAxis(options?.deployment)}`,
    );
  }
  if (!SURFACE_SUPPORTS.includes(options?.support as SurfaceSupport)) {
    throw new Error(
      `resolveCapabilityStatus requires a support axis (SurfaceSupport); received ${shapeOfAxis(options?.support)}`,
    );
  }

  const resolution = resolveNativeUse(options.proof, options.current);
  return {
    capability: options.capability,
    harness: options.harness,
    axes: {
      deployment: options.deployment,
      support: options.support,
      nativeUse: resolution.nativeUse,
    },
    resolution,
  };
}

/**
 * The JSON projection: axes stay separate, and the human summary that collapses
 * them to one line is a rendering concern, never this record.
 */
export function capabilityStatusJson(status: CapabilityStatus): {
  readonly capability: string;
  readonly harness: LedgerHarness;
  readonly axes: CapabilityAxes;
  readonly demoted: boolean;
  readonly demotionReasons: readonly DemotionReason[];
  readonly provenHarnessVersion: HarnessVersion;
  readonly blocked: boolean;
  readonly blockedReason: BlockedReason | null;
} {
  return {
    capability: status.capability,
    harness: status.harness,
    axes: {
      deployment: status.axes.deployment,
      support: status.axes.support,
      nativeUse: status.axes.nativeUse,
    },
    demoted: status.resolution.demoted,
    demotionReasons: status.resolution.reasons.map((reason) => ({
      code: reason.code,
      noun: reason.noun,
      sentence: reason.sentence,
    })),
    provenHarnessVersion: status.resolution.provenHarnessVersion,
    blocked: status.resolution.blocked,
    blockedReason: status.resolution.blockedReason,
  };
}

// ---------------------------------------------------------------------------
// The paired evidence unit and the single write path
// ---------------------------------------------------------------------------

/**
 * Whether an evidence unit is a claim anyone may act on.
 *
 * A string-literal union rather than a boolean, because INCOMPLETE is NOT a
 * failed negative: a missing control and a control that ran and disagreed are
 * different facts, and a boolean would render them alike.
 */
export type EvidenceCompleteness = "COMPLETE" | "INCOMPLETE";

export interface EvidenceUnit {
  readonly capability: string;
  readonly harness: LedgerHarness;
  readonly completeness: EvidenceCompleteness;
  readonly positive: CapabilityProof | null;
  readonly negative: CapabilityProof | null;
  /** Which half is missing, or null when both halves are present. */
  readonly missingHalf: "positive" | "negative" | null;
  readonly incompleteReasons: readonly string[];
  /** The axis this unit reports. Null on INCOMPLETE, always. */
  readonly nativeUse: NativeUseState | null;
  readonly summary: string;
}

export interface WriteCapabilityLedgerOptions {
  /** REQUIRED. There is no default, and that is the point. */
  readonly stateRoot: string;
  readonly ledger: CapabilityLedger;
  readonly session?: MutationSession;
}

export interface CapabilityLedgerWrite {
  readonly status: "written" | "already-current";
  /** The journal id, or null when nothing was written. */
  readonly operationId: string | null;
  readonly path: string;
}

/**
 * Joins a positive proof to its negative control and reports whether the pair
 * is a claim anyone may act on.
 *
 * 03-CONTEXT.md D-14: a positive and its negative are ONE evidence unit, and an
 * unpaired positive does not satisfy CAPA-06. Completeness is therefore a
 * first-class FIELD rather than an inference a caller may skip, and the axis is
 * null whenever the unit is INCOMPLETE — a consumer cannot obtain the axis
 * without also obtaining the verdict that says the axis is not reportable
 * (T-03-24).
 *
 * INCOMPLETE is not a failed negative. A control that ran and disagreed is a
 * fact; a control that was never taken is the absence of one, and the summary
 * says which.
 *
 * The demotion binding is deliberately NOT applied here: `resolveNativeUse` is
 * what re-resolves a proof against the inputs as they are now, and a caller
 * that wants the demotion-aware axis composes the two. Fusing them would give
 * this function two reasons to return `unverified` that no reader could tell
 * apart.
 */
export function pairEvidence(positive: CapabilityProof, negative: CapabilityProof | null): EvidenceUnit {
  const capability = positive.capability;
  const harness = positive.harness;
  const reasons: string[] = [];
  let missingHalf: "positive" | "negative" | null = null;

  if (positive.polarity !== "positive") {
    reasons.push("the half offered as the positive is not recorded with positive polarity");
    missingHalf = "positive";
  }

  if (negative === null) {
    reasons.push(
      "the negative control was never taken, so nothing shows the capability was unreachable outside the project",
    );
    missingHalf = missingHalf ?? "negative";
  } else {
    if (negative.polarity !== "negative") {
      reasons.push("the half offered as the negative control is not recorded with negative polarity");
    }
    if (negative.capability !== capability) {
      reasons.push(`the negative control is for capability ${negative.capability}, not ${capability}`);
    }
    if (negative.harness !== harness) {
      reasons.push(`the negative control was taken on ${negative.harness}, not ${harness}`);
    }
    // 03-RESEARCH.md Pitfall 3: pi walks `.agents/skills` up through ancestors
    // and, outside a repository, does not stop at a repo root but continues to
    // the filesystem root. A control directory that was assumed rather than
    // constructed can therefore still see the pack, and a negative taken in one
    // proves nothing at all.
    const freedom = negative.ancestorFreedom;
    if (freedom === null || freedom.asserted !== true) {
      reasons.push(
        "the negative control directory was not asserted free of an ancestor project skill root, so it may have seen the pack anyway",
      );
    }
  }

  const completeness: EvidenceCompleteness = reasons.length === 0 ? "COMPLETE" : "INCOMPLETE";
  const summary =
    completeness === "COMPLETE"
      ? `COMPLETE — ${capability} on ${harness}: the positive and its negative control are one unit; native use is ${positive.nativeUse}.`
      : // The axis is deliberately absent from this sentence. Printing it is
        // precisely the unpaired-positive-as-pass failure D-14 forbids, and a
        // reader who sees it here will read the whole line as a result.
        `INCOMPLETE — ${capability} on ${harness}: ${reasons.join("; ")}. No native-use state is reported, ` +
        `because a positive on its own is not the claim this unit exists to make.`;

  return {
    capability,
    harness,
    completeness,
    positive,
    negative,
    missingHalf,
    incompleteReasons: reasons,
    nativeUse: completeness === "COMPLETE" ? positive.nativeUse : null,
    summary,
  };
}

/**
 * The ledger's canonical bytes: two-space JSON with a trailing newline.
 *
 * Declared once so a re-write of unchanged content is byte-identical by
 * construction rather than by luck, which is what makes the already-current
 * check below a real idempotency guarantee instead of a formatting race.
 */
/**
 * The identity of one ledger row.
 *
 * Project, harness and capability are the triple 03-CONTEXT.md D-03 keys
 * evidence by. Polarity is the fourth part and is not optional: a positive and
 * its negative control are two ROWS of one evidence unit (D-14), so a key
 * without polarity would let a negative control evict its own positive and the
 * unit could then never be assembled.
 */
function proofKey(proof: CapabilityProof): string {
  return [proof.projectId ?? "", proof.harness, proof.capability, proof.polarity].join(" ");
}

export interface CapabilityProofUpsert {
  readonly proofs: readonly CapabilityProof[];
  /** The row this write displaced, or null when it was the first of its key. */
  readonly replaced: CapabilityProof | null;
}

/**
 * Writes one proof into a proof list, REPLACING the row of the same identity.
 *
 * A ledger that appended would grow one row per run, and "what is proven about
 * this capability on this harness" would become a question about which of
 * several rows to read — a question no consumer has a rule for. One row per
 * identity keeps `resolveNativeUse` looking at the proof that was actually
 * taken last.
 *
 * The replaced row's EXACT harness version is carried forward rather than
 * dropped. D-04 makes the exact version an audit fact precisely because the
 * comparison reads the minor key: two proofs a patch apart replace each other
 * silently, and without this an audit could no longer see which patch versions
 * had been proven. An unparsed version contributes nothing — a trail padded
 * with nulls says less than an empty one (03-RESEARCH.md Pitfall 6).
 */
export function upsertProof(
  proofs: readonly CapabilityProof[],
  proof: CapabilityProof,
): CapabilityProofUpsert {
  const key = proofKey(proof);
  const index = proofs.findIndex((candidate) => proofKey(candidate) === key);
  if (index < 0) return { proofs: [...proofs, proof], replaced: null };

  const replaced = proofs[index] as CapabilityProof;
  const carried = [...(replaced.supersededHarnessVersions ?? [])];
  const exact = replaced.harnessVersion.exact;
  if (exact !== null && !carried.includes(exact)) carried.push(exact);

  const next: CapabilityProof = {
    ...proof,
    // Spread rather than assigned: under exactOptionalPropertyTypes an explicit
    // `undefined` is not the same as an absent property, and a first proof must
    // not carry an empty audit array.
    ...(carried.length === 0 ? {} : { supersededHarnessVersions: carried }),
  };
  const updated = [...proofs];
  updated[index] = next;
  return { proofs: updated, replaced };
}

export function capabilityLedgerBytes(ledger: CapabilityLedger): string {
  return `${JSON.stringify(ledger, null, 2)}\n`;
}

/**
 * Writes the ledger through the one journaled, snapshotted transaction.
 *
 * `stateRoot` is REQUIRED and this function resolves NOTHING without it. Plan
 * 02-09 recorded why: a convenience default lets a module-level test take the
 * exclusive writer lock on the developer's real state root, which is the
 * ambient-write class plan 01-21 spent a whole plan closing. `allowedRoots`
 * holds the ledger root alone, so a target anywhere else under the state root
 * refuses inside the transaction rather than being trusted here.
 *
 * Identical content is not rewritten. Writing the same bytes would still churn
 * the file's mtime and add a journal entry that undoes nothing — the same
 * idempotency `approveProjectPlan` applies to the approved plan artifact.
 */
export async function writeCapabilityLedger(
  options: WriteCapabilityLedgerOptions,
): Promise<CapabilityLedgerWrite> {
  const ledgerRoot = capabilityLedgerRoot(options.stateRoot);
  const path = capabilityLedgerPath(options.stateRoot);
  const content = capabilityLedgerBytes(options.ledger);

  if (existsSync(path)) {
    const existing = await readFile(path, "utf8").catch(() => null);
    if (existing === content) {
      return { status: "already-current", operationId: null, path };
    }
  }

  const journal = await applyFileTransaction({
    stateRoot: options.stateRoot,
    allowedRoots: [ledgerRoot],
    operations: [{ target: path, content }],
    // Spread rather than assigned: under exactOptionalPropertyTypes an explicit
    // `undefined` is not the same as an absent property, and a standalone write
    // must take its own session rather than be handed a missing one.
    ...(options.session === undefined ? {} : { session: options.session }),
  });

  return { status: "written", operationId: journal.id, path };
}
