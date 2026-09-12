// This module is NOT a test. It lives under `test/helpers` because
// `run-tests.mjs` enumerates only files directly under `dist/test`, so helper
// modules in `dist/test/helpers` are never mistaken for suites.

export const UPSTREAM_REQUIRED_ENV_NAME = "ALPHA_AOS_REQUIRE_UPSTREAM_MCP";

/** npm's own vocabulary for "the registry was not reachable". */
export const REGISTRY_UNREACHABLE =
  /(ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ERR_SOCKET_TIMEOUT|network error|getaddrinfo|registry\.npmjs\.org)/iu;

export type UpstreamFailureClassification =
  | { readonly kind: "skip"; readonly reason: string }
  | { readonly kind: "fail"; readonly reason: string };

/**
 * Decides whether a failed pinned-server startup has enough evidence to skip.
 *
 * The required gate accepts exactly `1`: an empty value or an accidental
 * `false` must not look like an explicit opt-in to strict upstream checks.
 */
export function classifyUpstreamFailure(options: {
  readonly stderr: string;
  readonly packageName: string;
  readonly version: string;
  readonly env: Readonly<Record<string, string | undefined>>;
}): UpstreamFailureClassification {
  const identity = `${options.packageName}@${options.version}`;
  const registryUnreachable = REGISTRY_UNREACHABLE.test(options.stderr);
  const upstreamRequired = options.env[UPSTREAM_REQUIRED_ENV_NAME] === "1";

  if (registryUnreachable && !upstreamRequired) {
    return {
      kind: "skip",
      reason: `the npm registry could not be reached, so ${identity} could not be launched`,
    };
  }

  if (registryUnreachable) {
    return {
      kind: "fail",
      reason: `${identity} could not reach the npm registry while ${UPSTREAM_REQUIRED_ENV_NAME}=1 required the pinned upstream`,
    };
  }

  return {
    kind: "fail",
    reason: `${identity} failed without registry-unreachable evidence`,
  };
}
