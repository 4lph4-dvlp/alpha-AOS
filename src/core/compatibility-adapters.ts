import { createHash } from "node:crypto";
import type {
  AdapterEvaluationResult,
  AdapterLifecycleStatus,
  AdapterResolution,
  AdapterRetirementRecord,
  CompatibilityAdapterDescriptor,
  CompatibilityAdapterId,
  CompatibilityAdapterKind,
  CompatibilityCorrectionId,
  HarnessId,
  ManagedToolId,
  PolicyInterfaceId,
  ThreeStageGuidanceProof,
  ToolAdapterBinding,
  ToolAdapterSummary,
} from "../types.js";
import type { ToolEvidence } from "./tool-records.js";
import { ComponentPlanError } from "./component-session.js";

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export const COMPATIBILITY_ADAPTER_REGISTRY: readonly CompatibilityAdapterDescriptor[] = Object.freeze(
  ([
    {
      id: "ecc:antigravity-doc-lookup",
      kind: "compatibility-correction",
      revision: "v2",
      toolId: "ecc",
      harnesses: ["antigravity"],
      platforms: ["windows", "macos", "linux"],
      status: "active",
      rationale:
        "Antigravity GUI(context7/resolve-library-id, context7/query-docs)와 IDE(call_mcp_tool 게이트웨이)의 표면별 Context7 MCP 호출 방식 차이로 인해, 명시적 표면 라우팅 안내가 없으면 모델이 JSON 도구 디스크립터만 읽거나 네이티브 웹 검색으로 대체함",
      applicability:
        "harness === 'antigravity'에서 documentation-lookup/SKILL.md를 동기화할 때, 업스트림 원문에 Antigravity GUI/IDE 표면별 Context7 호출 규칙 및 네이티브 웹 검색 대체 금지 규칙이 없는 경우",
      verificationMethod:
        "프론트매터 description과 본문에 Antigravity GUI(context7/resolve-library-id, context7/query-docs) 및 IDE(call_mcp_tool) 라우팅 계약 블록이 포함되었는지 확인",
      removalCondition:
        "업스트림 documentation-lookup/SKILL.md가 Antigravity 표면별 Context7 라우팅을 네이티브 지원하거나, 별도 alpha-AOS 소유 가이드 분리 후 Antigravity GUI/IDE에서 discovery + precedence + Context7 실제 호출(invocation receipt, 웹 검색 대체 없음)이 실증된 경우",
      retirement: null,
    },
    {
      id: "ecc:deep-research-routing",
      kind: "compatibility-correction",
      revision: "v2",
      toolId: "ecc",
      harnesses: ["claude", "codex", "antigravity", "pi", "hermes"],
      platforms: ["windows", "macos", "linux"],
      status: "active",
      rationale:
        "업스트림 ecc-universal의 deep-research/SKILL.md가 핀 고정된 MCP 서버들이 노출하지 않는 도구명(web_search_advanced_exa, crawling_exa)과 alpha-AOS 정책 프록시가 거부하는 도구명(firecrawl_search)을 호출하도록 안내함",
      applicability:
        "업스트림 deep-research/SKILL.md가 비공개/차단 도구 식별자를 포함하고 있으며, 대상 하네스에서 별도 alpha-aos-research-routing 가이드의 3단계 실증(discovery, precedence, invocation)으로 완전 대체되지 않은 경우",
      verificationMethod:
        "렌더링된 스킬 문서에 web_search_exa 및 firecrawl_scrape 라우팅 계약 블록이 존재하고, 차단/미존재 실행 예시(firecrawl_search, web_search_advanced_exa, crawling_exa)가 활성 호출 지시로 남아 있지 않음을 구조적으로 검증",
      removalCondition:
        "선택된 업스트림 ecc-universal 릴리스의 deep-research/SKILL.md 원문이 미존재·차단 도구명을 제거하고 실제 공개된 web_search_exa / firecrawl_scrape 계약과 일치하거나, 대상 하네스에서 별도 alpha-aos-research-routing 소유 스킬만으로 discovery + precedence + invocation receipt 3단계 증거가 모두 확보된 경우",
      retirement: null,
    },
    {
      id: "gsd:claude-ship-skill",
      kind: "compatibility-correction",
      revision: "v1",
      toolId: "gsd",
      harnesses: ["claude"],
      platforms: ["windows", "macos", "linux"],
      status: "active",
      rationale:
        "업스트림 GSD의 Claude 설치에서 ship 워크플로(gsd-core/workflows/ship.md)는 존재하지만 Claude 네이티브 슬래시 스킬로 직접 노출되지 않는 격차를 메우기 위해 alpha-AOS 소유 스킬 alpha-aos-ship이 ~/.claude/gsd-core/workflows/ship.md를 참조하여 노출함",
      applicability:
        "claude 하네스에서 업스트림 GSD가 gsd-core/workflows/ship.md를 포함하고 있으나 네이티브 gsd-ship 스킬을 직접 생성하지 않는 경우",
      verificationMethod:
        "planOwnedSkillSync에서 workflowFound(~/.claude/gsd-core/workflows/ship.md 존재) 사전조건과 렌더링된 alpha-aos-ship/SKILL.md의 SHA-256 해시 일치 확인",
      removalCondition:
        "선택된 업스트림 @opengsd/gsd-core의 Claude 설치본이 네이티브 gsd-ship 스킬(.claude/skills/gsd-ship/SKILL.md 또는 동등한 공식 커맨드)을 자체 설치하는 것이 픽스처에서 검증된 경우",
      retirement: null,
    },
    {
      id: "gsd:codex-stop-hook-helpers",
      kind: "compatibility-correction",
      revision: "v2",
      toolId: "gsd",
      harnesses: ["codex"],
      platforms: ["windows", "macos", "linux"],
      status: "active",
      rationale:
        "업스트림 @opengsd/gsd-core의 --codex --global 설치기가 ~/.codex/hooks/gsd-context-monitor.js를 설치하면서 상대 경로로 참조하는 ./lib/* 헬퍼 모듈들을 ~/.codex/hooks/lib/에 복사하지 않아 Codex Stop 훅 실행 시 모듈 로드 오류가 발생할 수 있음",
      applicability:
        "깨끗한 격리 픽스처(runGsdFixture)의 순수 업스트림 Codex 설치본에서 hooks/gsd-context-monitor.js가 ./lib/* 로컬 모듈을 참조하지만 해당 파일이 hooks/lib/에 누락되어 무보정 smokeTestCodexGsdStopHook이 실패하는 경우",
      verificationMethod:
        "모니터 엔트리포인트에서 시작하는 상대 참조 클로저가 모두 hooks/lib/ 내에 존재하고 smokeTestCodexGsdStopHook이 종료 코드 0 및 빈 stdout/stderr로 통과하는지 확인",
      removalCondition:
        "선택된 @opengsd/gsd-core 릴리스의 순수 격리 픽스처 설치본(runGsdFixture)이 alpha-AOS의 헬퍼 복사 없이 스스로 필요한 hooks/lib/* 파일들을 설치(또는 외부 헬퍼 불필요화)하여 무보정 smokeTestCodexGsdStopHook을 통과하는 경우",
      retirement: null,
    },
    {
      id: "mcp:firecrawl-policy-proxy",
      kind: "policy-interface",
      revision: "v1",
      toolId: "mcp:firecrawl",
      harnesses: ["claude", "codex", "antigravity", "pi", "hermes"],
      platforms: ["windows", "macos", "linux"],
      status: "active",
      rationale:
        "Firecrawl MCP 서버 앞단에서 허용된 4개 도구(firecrawl_scrape, firecrawl_map, firecrawl_crawl, firecrawl_check_crawl_status)만 통과시키고 firecrawl_search 등 비허용 도구를 차단하는 상시 보안 정책 프록시",
      applicability: "mcp:firecrawl 도구가 활성화된 모든 하네스 및 플랫폼",
      verificationMethod:
        "mcp-proxy가 허용 목록 외 도구 호출 시 안정적인 정책 거부 응답을 반환하는지 계약 검증",
      removalCondition: null,
      retirement: null,
    },
    {
      id: "mcp:native-config-renderers",
      kind: "policy-interface",
      revision: "v1",
      toolId: "mcp:context7",
      harnesses: ["claude", "codex", "antigravity", "pi", "hermes"],
      platforms: ["windows", "macos", "linux"],
      status: "active",
      rationale:
        "5개 하네스의 공식 MCP 설정 파일에 시크릿 값 없이 환경변수 참조(${NAME})와 표준 실행 인자를 렌더링하는 상시 정책 인터페이스",
      applicability: "관리형 MCP 서버가 배포되는 모든 하네스",
      verificationMethod:
        "각 하네스 MCP 설정 파일에 평문 시크릿이 포함되지 않고 환경변수 참조 및 격리 플래그가 정확히 렌더링되는지 확인",
      removalCondition: null,
      retirement: null,
    },
    {
      id: "mcp:pi-bridge",
      kind: "compatibility-correction",
      revision: "v1",
      toolId: "bridge:pi",
      harnesses: ["pi"],
      platforms: ["windows", "macos", "linux"],
      status: "active",
      rationale:
        "Pi 하네스에서 관리형 MCP 서버(context7, exa, firecrawl)를 lazy 수명주기, 서버 접두사(toolPrefix: 'server'), 출력 가드(outputGuard: true), 호스트 설정 탐색 차단(hostConfigDiscovery: 'off') 정책으로 연결하기 위해 pi-mcp-adapter 확장 브리지 패키지와 ~/.pi/agent/mcp.json 구성을 사용함",
      applicability:
        "pi 하네스가 대상에 포함되고, 설치된 Pi 버전에서 브리지 없이 내장 MCP만으로 동일 정책과 실제 읽기 전용 호출이 증명되지 않은 경우",
      verificationMethod:
        "planMcpSync('pi', lock) 및 runMcpFixture({ server: 'context7', harness: 'pi', ... })에서 ~/.pi/agent/mcp.json 설정 무결성과 pi-mcp-adapter 패키지 버전 설치 여부 확인",
      removalCondition:
        "설치된 Pi 버전에서 내장 MCP 설정만으로 lazy lifecycle, toolPrefix: 'server', outputGuard: true, hostConfigDiscovery: 'off' 정책 동등성과 실제 읽기 전용 MCP 도구 호출이 검증된 경우",
      retirement: null,
    },
    {
      id: "policy:claude-skill-overrides",
      kind: "policy-interface",
      revision: "v1",
      toolId: "ecc",
      harnesses: ["claude"],
      platforms: ["windows", "macos", "linux"],
      status: "active",
      rationale:
        "Claude settings.json의 공식 skillOverrides 인터페이스를 사용해 자율 호출 시 위험하거나 비용이 큰 스킬(unified-memory, documentation-lookup, deep-research)을 'user-invocable-only'로 설정하는 상시 거버넌스 정책",
      applicability: "claude 하네스에 ECC 또는 관리형 스킬이 배포될 때",
      verificationMethod:
        "Claude settings.json 내 skillOverrides 블록에 명시된 스킬들의 user-invocable-only 설정 일치 확인",
      removalCondition: null,
      retirement: null,
    },
    {
      id: "policy:codex-execution-guidance",
      kind: "policy-interface",
      revision: "v1",
      toolId: "gsd",
      harnesses: ["codex"],
      platforms: ["windows", "macos", "linux"],
      status: "active",
      rationale:
        "Codex ~/.codex/AGENTS.md의 마커 블록을 통해 alpha-AOS 자율 실행 규칙 및 복구 범위를 동기화하는 상시 거버넌스 정책",
      applicability: "codex 하네스가 사용될 때",
      verificationMethod: "AGENTS.md 내 마커 블록 경계와 내용 일치 확인",
      removalCondition: null,
      retirement: null,
    },
  ] as const satisfies readonly CompatibilityAdapterDescriptor[]).slice().sort((a, b) => a.id.localeCompare(b.id))
);

export function listCompatibilityAdapters(options?: {
  readonly kind?: CompatibilityAdapterKind | undefined;
  readonly toolId?: ManagedToolId | undefined;
  readonly harness?: HarnessId | undefined;
  readonly status?: AdapterLifecycleStatus | undefined;
}): readonly CompatibilityAdapterDescriptor[] {
  let list = COMPATIBILITY_ADAPTER_REGISTRY;
  if (options?.kind) {
    list = list.filter((a) => a.kind === options.kind);
  }
  if (options?.toolId) {
    list = list.filter((a) => a.toolId === options.toolId);
  }
  if (options?.harness) {
    list = list.filter((a) => a.harnesses.includes(options.harness!));
  }
  if (options?.status) {
    list = list.filter((a) => a.status === options.status);
  }
  return [...list].sort((a, b) => a.id.localeCompare(b.id));
}

export function getCompatibilityAdapter(
  id: CompatibilityAdapterId
): CompatibilityAdapterDescriptor | null {
  return COMPATIBILITY_ADAPTER_REGISTRY.find((a) => a.id === id) ?? null;
}

export function summarizeToolAdapters(
  toolId: ManagedToolId,
  options?: {
    readonly adapters?: readonly (ToolAdapterBinding | CompatibilityAdapterDescriptor)[] | undefined;
  }
): ToolAdapterSummary {
  const bindings = options?.adapters ?? listCompatibilityAdapters({ toolId });
  let activeCorrectionCount = 0;
  let retiredCorrectionCount = 0;
  let policyInterfaceCount = 0;
  const activeIds: CompatibilityAdapterId[] = [];
  const retiredIds: CompatibilityAdapterId[] = [];
  const policyIds: PolicyInterfaceId[] = [];

  for (const b of bindings) {
    const adapterId = "adapterId" in b ? b.adapterId : b.id;
    if (b.kind === "compatibility-correction") {
      if (b.status === "active") {
        activeCorrectionCount++;
        activeIds.push(adapterId);
      } else {
        retiredCorrectionCount++;
        retiredIds.push(adapterId);
      }
    } else if (b.kind === "policy-interface") {
      policyInterfaceCount++;
      policyIds.push(adapterId as PolicyInterfaceId);
    }
  }

  activeIds.sort((a, b) => a.localeCompare(b));
  retiredIds.sort((a, b) => a.localeCompare(b));
  policyIds.sort((a, b) => a.localeCompare(b));

  const idWithRev = (id: string) => {
    const match = bindings.find((b) => ("adapterId" in b ? b.adapterId : b.id) === id);
    return match ? `${id}@${match.revision}` : id;
  };

  const parts: string[] = [];
  if (activeCorrectionCount > 0 || retiredCorrectionCount > 0) {
    const activeDetails = activeIds.length > 0 ? ` (${activeIds.map(idWithRev).join(", ")})` : "";
    parts.push(
      `${activeCorrectionCount} active correction${activeCorrectionCount === 1 ? "" : "s"}${activeDetails}`
    );
    if (retiredCorrectionCount > 0) {
      const retiredDetails = retiredIds.length > 0 ? ` (${retiredIds.map(idWithRev).join(", ")})` : "";
      parts.push(`${retiredCorrectionCount} retired${retiredDetails}`);
    }
  } else {
    parts.push("0 active corrections");
  }
  if (policyInterfaceCount > 0) {
    const policyDetails = policyIds.length > 0 ? ` (${policyIds.map(idWithRev).join(", ")})` : "";
    parts.push(
      `${policyInterfaceCount} policy interface${policyInterfaceCount === 1 ? "" : "s"}${policyDetails}`
    );
  }

  return {
    activeCorrectionCount,
    retiredCorrectionCount,
    policyInterfaceCount,
    activeIds,
    retiredIds,
    policyIds,
    text: parts.join(", "),
  };
}

export function isSeparateGuidanceProvenForHarness(
  proof?: ThreeStageGuidanceProof | null
): boolean {
  if (!proof) return false;
  return (
    proof.discovery === true &&
    proof.precedence === true &&
    proof.invocationReceipt === true &&
    typeof proof.evidenceId === "string" &&
    proof.evidenceId.length > 0
  );
}

export function deriveAdaptedTargetDigest(
  adapterId: CompatibilityAdapterId,
  revision: string,
  status: AdapterLifecycleStatus,
  sourceSha256: string,
  targetSha256: string
): string {
  const payload = `${adapterId}:${revision}:${status}:${sourceSha256}:${targetSha256}`;
  return sha256(payload);
}

export function buildAdapterToolEvidence(
  toolId: ManagedToolId,
  evaluation: AdapterEvaluationResult,
  options?: {
    readonly platform?: string | undefined;
    readonly architecture?: string | undefined;
    readonly harness?: HarnessId | undefined;
  }
): ToolEvidence {
  const safeToolId = toolId.replace(/:/g, "-");
  const safeAdapterId = evaluation.adapterId.replace(/:/g, "-");

  const rawPlatform = options?.platform ?? process.platform;
  const platform =
    rawPlatform === "win32" || rawPlatform === "windows"
      ? "windows"
      : rawPlatform === "darwin" || rawPlatform === "macos"
      ? "macos"
      : "linux";

  const rawArch = options?.architecture ?? process.arch;
  const architecture =
    rawArch === "x64"
      ? "x64"
      : rawArch === "arm64"
      ? "arm64"
      : "universal";

  return {
    proofId: `${safeToolId}-${safeAdapterId}-adapter`,
    subject: `${safeToolId}-compatibility`,
    target: "integration",
    method: "sha256",
    result: evaluation.verificationResult === "pass" ? "pass" : "fail",
    platform,
    architecture,
    harness: options?.harness ?? null,
    fingerprint: evaluation.derivationDigest,
  };
}

export function evaluateDeepResearchRoutingAdapter(
  source: string,
  options?: {
    readonly harness?: HarnessId | undefined;
    readonly guidanceProof?: ThreeStageGuidanceProof | null | undefined;
    readonly verifiedRelease?: string | undefined;
  }
): AdapterEvaluationResult {
  const adapter = getCompatibilityAdapter("ecc:deep-research-routing")!;
  const sourceSha = sha256(source);

  // 1. Check removalCondition first (D-13)
  const hasNoBlockedTools =
    !source.includes("firecrawl_search") &&
    !source.includes("web_search_advanced_exa") &&
    !source.includes("crawling_exa");
  const hasOfficialTools =
    source.includes("web_search_exa") && source.includes("firecrawl_scrape");
  const upstreamSelfResolved = hasNoBlockedTools && hasOfficialTools;
  const guidanceProven = isSeparateGuidanceProvenForHarness(options?.guidanceProof);

  if (upstreamSelfResolved || guidanceProven) {
    const resolution: AdapterResolution = guidanceProven
      ? "bypassed-by-proven-guidance"
      : "resolved-upstream";
    const retirementReason = guidanceProven
      ? `Separate alpha-AOS research routing guidance proven effective on ${options?.harness ?? "harness"}`
      : `Upstream ecc-universal deep-research/SKILL.md natively uses web_search_exa and firecrawl_scrape`;
    const targetSha = sourceSha;
    const derivationDigest = deriveAdaptedTargetDigest(
      adapter.id,
      adapter.revision,
      "retired",
      sourceSha,
      targetSha
    );
    return {
      adapterId: adapter.id,
      kind: adapter.kind,
      revision: adapter.revision,
      status: "retired",
      resolution,
      sourceSha256: sourceSha,
      targetSha256: targetSha,
      derivationDigest,
      verificationResult: "pass",
      retirementReason,
      verifiedRelease: options?.verifiedRelease ?? "unknown",
      evidenceSummary: guidanceProven
        ? `Guidance proof ${options?.guidanceProof?.evidenceId ?? "none"}`
        : "Clean upstream tool names verified",
      renderedContent: source,
    };
  }

  // 2. Preconditions check (D-08, D-13)
  if (
    !source.startsWith("---\n") ||
    !source.includes("name: deep-research")
  ) {
    throw new ComponentPlanError(
      "plan-incomplete",
      `[ecc:deep-research-routing] Precondition failed: deep-research source missing required YAML frontmatter or title`
    );
  }

  // Find end of YAML frontmatter
  const frontmatterEnd = source.indexOf("\n---\n", 4);
  if (frontmatterEnd === -1) {
    throw new ComponentPlanError(
      "plan-incomplete",
      `[ecc:deep-research-routing] Precondition failed: unclosed frontmatter in deep-research source`
    );
  }

  // 3. Minimal structural transform (D-08)
  const routingMarker = `\n<!-- alpha-aos-adapter:ecc:deep-research-routing:v2:start -->
## Alpha-AOS Research Routing Contract

Route open-web research across the alpha-AOS research stack:
- **Discovery:** Use \`web_search_exa\` on the Exa discovery server to search and identify candidate source URLs.
- **Extraction:** Use \`firecrawl_scrape\` on the Firecrawl server to extract the body of a chosen URL.
- **Policy Boundary:** The Firecrawl proxy allows exactly 4 tools (\`firecrawl_scrape\`, \`firecrawl_map\`, \`firecrawl_crawl\`, \`firecrawl_check_crawl_status\`). Never perform search queries or unfronted requests on the extraction server.
<!-- alpha-aos-adapter:ecc:deep-research-routing:v2:end -->\n`;

  const afterFrontmatterIndex = frontmatterEnd + 5;
  const headerPart = source.slice(0, afterFrontmatterIndex);
  let bodyPart = source.slice(afterFrontmatterIndex);

  // Neutralize blocked tools
  bodyPart = bodyPart.replaceAll("firecrawl_search", "web_search_exa");
  bodyPart = bodyPart.replaceAll("web_search_advanced_exa", "web_search_exa");
  bodyPart = bodyPart.replaceAll("crawling_exa", "firecrawl_scrape");

  const renderedContent = `${headerPart}${routingMarker}${bodyPart}`;

  // 4. Postcondition verification (D-16)
  if (
    renderedContent.includes("firecrawl_search") ||
    renderedContent.includes("web_search_advanced_exa") ||
    renderedContent.includes("crawling_exa")
  ) {
    throw new ComponentPlanError(
      "plan-incomplete",
      `[ecc:deep-research-routing] Postcondition failed: neutralized content still contains blocked tool identifiers`
    );
  }
  if (
    !renderedContent.includes("web_search_exa") ||
    !renderedContent.includes("firecrawl_scrape")
  ) {
    throw new ComponentPlanError(
      "plan-incomplete",
      `[ecc:deep-research-routing] Postcondition failed: required tool identifiers missing after transformation`
    );
  }

  const targetSha = sha256(renderedContent);
  const derivationDigest = deriveAdaptedTargetDigest(
    adapter.id,
    adapter.revision,
    "active",
    sourceSha,
    targetSha
  );

  return {
    adapterId: adapter.id,
    kind: adapter.kind,
    revision: adapter.revision,
    status: "active",
    resolution: "applied",
    sourceSha256: sourceSha,
    targetSha256: targetSha,
    derivationDigest,
    verificationResult: "pass",
    evidenceSummary: "Minimal structural adaptation applied with blocked tools neutralized",
    renderedContent,
  };
}

export function evaluateAntigravityDocLookupAdapter(
  source: string,
  options?: {
    readonly guidanceProof?: ThreeStageGuidanceProof | null | undefined;
    readonly verifiedRelease?: string | undefined;
  }
): AdapterEvaluationResult {
  const adapter = getCompatibilityAdapter("ecc:antigravity-doc-lookup")!;
  const sourceSha = sha256(source);

  // 1. Check removalCondition first (D-13)
  const hasAntigravityRouting =
    source.includes("context7/resolve-library-id") && source.includes("call_mcp_tool");
  const guidanceProven = isSeparateGuidanceProvenForHarness(options?.guidanceProof);

  if (hasAntigravityRouting || guidanceProven) {
    const resolution: AdapterResolution = guidanceProven
      ? "bypassed-by-proven-guidance"
      : "resolved-upstream";
    const retirementReason = guidanceProven
      ? "Separate documentation lookup guidance proven effective on Antigravity"
      : "Upstream documentation-lookup/SKILL.md natively supports Antigravity routing";
    const targetSha = sourceSha;
    const derivationDigest = deriveAdaptedTargetDigest(
      adapter.id,
      adapter.revision,
      "retired",
      sourceSha,
      targetSha
    );
    return {
      adapterId: adapter.id,
      kind: adapter.kind,
      revision: adapter.revision,
      status: "retired",
      resolution,
      sourceSha256: sourceSha,
      targetSha256: targetSha,
      derivationDigest,
      verificationResult: "pass",
      retirementReason,
      verifiedRelease: options?.verifiedRelease ?? "unknown",
      evidenceSummary: guidanceProven
        ? `Guidance proof ${options?.guidanceProof?.evidenceId ?? "none"}`
        : "Native Antigravity routing present",
      renderedContent: source,
    };
  }

  // 2. Preconditions check (D-08, D-13)
  if (!source.startsWith("---\n") || !/^description:.*$/mu.test(source)) {
    throw new ComponentPlanError(
      "plan-incomplete",
      `[ecc:antigravity-doc-lookup] Precondition failed: documentation-lookup source missing description in frontmatter`
    );
  }

  const frontmatterEnd = source.indexOf("\n---\n", 4);
  if (frontmatterEnd === -1) {
    throw new ComponentPlanError(
      "plan-incomplete",
      `[ecc:antigravity-doc-lookup] Precondition failed: unclosed frontmatter in documentation-lookup source`
    );
  }

  // 3. Minimal structural transform (D-08)
  const description =
    "description: Use up-to-date library and framework docs via Context7 MCP instead of training data. In Antigravity, use the surface's native Context7 MCP route and never substitute native web search. Activates for setup questions, API references, code examples, or named frameworks.";
  let rendered = source.replace(/^description:.*$/mu, description);

  const routingMarker = `\n<!-- alpha-aos-adapter:ecc:antigravity-doc-lookup:v2:start -->
## Antigravity GUI/IDE Routing

- In Antigravity GUI, call the namespaced MCP tools \`context7/resolve-library-id\` and, when documentation content is needed, \`context7/query-docs\`.
- In Antigravity IDE, invoke the generic \`call_mcp_tool\` gateway. Resolve with \`ServerName: "context7"\`, \`ToolName: "resolve-library-id"\`, and \`Arguments: { libraryName, query }\`. When documentation content is needed, invoke the same gateway with \`ToolName: "query-docs"\` and \`Arguments: { libraryId, query }\`. Reading a JSON tool descriptor does not execute the MCP tool.

Do not replace a required Context7 call with native web search. If the native Context7 route is unavailable, report that Context7 is unavailable and stop instead of searching the web for a guessed library ID.
<!-- alpha-aos-adapter:ecc:antigravity-doc-lookup:v2:end -->\n`;

  const updatedFrontmatterEnd = rendered.indexOf("\n---\n", 4);
  const insertIndex = updatedFrontmatterEnd + 5;
  rendered = `${rendered.slice(0, insertIndex)}${routingMarker}${rendered.slice(insertIndex)}`;

  // 4. Postcondition verification (D-16)
  if (
    !rendered.includes("In Antigravity, use the surface's native Context7 MCP route") ||
    !rendered.includes("## Antigravity GUI/IDE Routing") ||
    !rendered.includes("context7/resolve-library-id") ||
    !rendered.includes("call_mcp_tool")
  ) {
    throw new ComponentPlanError(
      "plan-incomplete",
      `[ecc:antigravity-doc-lookup] Postcondition failed: required Antigravity routing blocks missing after transformation`
    );
  }

  const targetSha = sha256(rendered);
  const derivationDigest = deriveAdaptedTargetDigest(
    adapter.id,
    adapter.revision,
    "active",
    sourceSha,
    targetSha
  );

  return {
    adapterId: adapter.id,
    kind: adapter.kind,
    revision: adapter.revision,
    status: "active",
    resolution: "applied",
    sourceSha256: sourceSha,
    targetSha256: targetSha,
    derivationDigest,
    verificationResult: "pass",
    evidenceSummary: "Antigravity Context7 routing contract block injected",
    renderedContent: rendered,
  };
}

export function evaluateClaudeShipSkillAdapter(options: {
  readonly hasNativeGsdShip: boolean;
  readonly hasUpstreamWorkflow: boolean;
  readonly verifiedRelease?: string | undefined;
}): AdapterEvaluationResult {
  const adapter = getCompatibilityAdapter("gsd:claude-ship-skill")!;
  const dummySha = sha256("gsd:claude-ship-skill");

  if (options.hasNativeGsdShip) {
    const derivationDigest = deriveAdaptedTargetDigest(
      adapter.id,
      adapter.revision,
      "retired",
      dummySha,
      dummySha
    );
    return {
      adapterId: adapter.id,
      kind: adapter.kind,
      revision: adapter.revision,
      status: "retired",
      resolution: "resolved-upstream",
      sourceSha256: dummySha,
      targetSha256: dummySha,
      derivationDigest,
      verificationResult: "pass",
      retirementReason: "Upstream @opengsd/gsd-core provides native gsd-ship skill for Claude",
      verifiedRelease: options.verifiedRelease ?? "unknown",
      evidenceSummary: "Native gsd-ship skill detected in upstream Claude installation",
    };
  }

  if (!options.hasUpstreamWorkflow) {
    throw new ComponentPlanError(
      "plan-incomplete",
      `[gsd:claude-ship-skill] Precondition failed: upstream workflow gsd-core/workflows/ship.md is missing`
    );
  }

  const derivationDigest = deriveAdaptedTargetDigest(
    adapter.id,
    adapter.revision,
    "active",
    dummySha,
    dummySha
  );
  return {
    adapterId: adapter.id,
    kind: adapter.kind,
    revision: adapter.revision,
    status: "active",
    resolution: "applied",
    sourceSha256: dummySha,
    targetSha256: dummySha,
    derivationDigest,
    verificationResult: "pass",
    evidenceSummary: "alpha-AOS owned skill alpha-aos-ship active to expose ship workflow",
  };
}

export function evaluatePiBridgeAdapter(options: {
  readonly nativeMcpProven: boolean;
  readonly verifiedRelease?: string | undefined;
}): AdapterEvaluationResult {
  const adapter = getCompatibilityAdapter("mcp:pi-bridge")!;
  const dummySha = sha256("mcp:pi-bridge");

  if (options.nativeMcpProven) {
    const derivationDigest = deriveAdaptedTargetDigest(
      adapter.id,
      adapter.revision,
      "retired",
      dummySha,
      dummySha
    );
    return {
      adapterId: adapter.id,
      kind: adapter.kind,
      revision: adapter.revision,
      status: "retired",
      resolution: "resolved-upstream",
      sourceSha256: dummySha,
      targetSha256: dummySha,
      derivationDigest,
      verificationResult: "pass",
      retirementReason: "Pi native MCP settings proven to satisfy alpha-AOS policy without bridge",
      verifiedRelease: options.verifiedRelease ?? "unknown",
      evidenceSummary: "Native Pi MCP configuration and invocation verified",
    };
  }

  const derivationDigest = deriveAdaptedTargetDigest(
    adapter.id,
    adapter.revision,
    "active",
    dummySha,
    dummySha
  );
  return {
    adapterId: adapter.id,
    kind: adapter.kind,
    revision: adapter.revision,
    status: "active",
    resolution: "applied",
    sourceSha256: dummySha,
    targetSha256: dummySha,
    derivationDigest,
    verificationResult: "pass",
    evidenceSummary: "pi-mcp-adapter bridge active with lazy lifecycle and toolPrefix",
  };
}

export function evaluateCodexStopHookAdapter(options: {
  readonly pureUpstreamPassed: boolean;
  readonly missingHelpers: readonly string[];
  readonly verifiedRelease?: string | undefined;
  readonly evidenceSummary?: string | undefined;
}): AdapterEvaluationResult {
  const adapter = getCompatibilityAdapter("gsd:codex-stop-hook-helpers")!;
  const dummySha = sha256("gsd:codex-stop-hook-helpers");

  if (options.pureUpstreamPassed && options.missingHelpers.length === 0) {
    const derivationDigest = deriveAdaptedTargetDigest(
      adapter.id,
      adapter.revision,
      "retired",
      dummySha,
      dummySha
    );
    return {
      adapterId: adapter.id,
      kind: adapter.kind,
      revision: adapter.revision,
      status: "retired",
      resolution: "resolved-upstream",
      sourceSha256: dummySha,
      targetSha256: dummySha,
      derivationDigest,
      verificationResult: "pass",
      retirementReason: "Pure upstream Codex GSD Stop hook passed smoke test without alpha-AOS helpers",
      verifiedRelease: options.verifiedRelease ?? "unknown",
      evidenceSummary: options.evidenceSummary ?? "Pure upstream fixture smoke test passed",
    };
  }

  if (options.missingHelpers.length > 0) {
    const derivationDigest = deriveAdaptedTargetDigest(
      adapter.id,
      adapter.revision,
      "active",
      dummySha,
      dummySha
    );
    return {
      adapterId: adapter.id,
      kind: adapter.kind,
      revision: adapter.revision,
      status: "active",
      resolution: "applied",
      sourceSha256: dummySha,
      targetSha256: dummySha,
      derivationDigest,
      verificationResult: "pass",
      evidenceSummary: `Active: ${options.missingHelpers.length} missing helper(s) require copying to hooks/lib/`,
    };
  }

  throw new ComponentPlanError(
    "plan-incomplete",
    `[gsd:codex-stop-hook-helpers] Precondition failed: pure upstream smoke failed and helpers cannot resolve`
  );
}
