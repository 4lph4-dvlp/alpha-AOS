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
import { rejectRawCredentials, validateManagedDocument, type ValidationIssue } from "./validation.js";

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

export function harnessMinorKey(_raw: string): HarnessVersion {
  throw new Error("harnessMinorKey is not implemented");
}

export function resolveNativeUse(_proof: CapabilityProof, _current: CurrentInputs): NativeUseResolution {
  throw new Error("resolveNativeUse is not implemented");
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

export function resolveCapabilityStatus(_options: ResolveCapabilityStatusOptions): CapabilityStatus {
  throw new Error("resolveCapabilityStatus is not implemented");
}

export function capabilityStatusJson(_status: CapabilityStatus): {
  readonly capability: string;
  readonly harness: LedgerHarness;
  readonly axes: CapabilityAxes;
  readonly demoted: boolean;
  readonly demotionReasons: readonly DemotionReason[];
  readonly provenHarnessVersion: HarnessVersion;
  readonly blocked: boolean;
  readonly blockedReason: BlockedReason | null;
} {
  throw new Error("capabilityStatusJson is not implemented");
}
