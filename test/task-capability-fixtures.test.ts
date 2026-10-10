import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTaskCapabilityInventory,
} from "../src/core/task-capability-inventory.js";
import {
  evaluateStepObligations,
} from "../src/core/task-capability-obligations.js";
import { inventorySummaryContract } from "./helpers/task-fixture.js";
import type { CapabilityKind, TaskCapabilityInventoryItem } from "../src/types.js";

interface CapabilityFixtureDefinition {
  readonly capabilityId: string;
  readonly kind: CapabilityKind;
  readonly positivePrompt: string;
  readonly negativePrompt: string;
  readonly positiveReasonPattern: RegExp | string;
  readonly negativeReasonPattern: RegExp | string;
}

/**
 * Data-driven positive and negative fixture manifest covering every single
 * capability declared across catalog, lock, pack catalog, commands, tools, and hooks.
 * Total: 78 declared capabilities.
 */
export const CAPABILITY_FIXTURE_MANIFEST: readonly CapabilityFixtureDefinition[] = [
  // 1. GSD Workflows (5)
  {
    capabilityId: "gsd:workflow:discuss",
    kind: "gsd-workflow",
    positivePrompt: "Initiate phase discussion and requirement refinement in discuss step.",
    negativePrompt: "Run standalone command without discussion step.",
    positiveReasonPattern: /Standard GSD lifecycle workflow spine/u,
    negativeReasonPattern: /does not exercise/u,
  },
  {
    capabilityId: "gsd:workflow:plan",
    kind: "gsd-workflow",
    positivePrompt: "Produce execution plan artifact in plan step.",
    negativePrompt: "Ad-hoc task execution bypassing plan step.",
    positiveReasonPattern: /Standard GSD lifecycle workflow spine/u,
    negativeReasonPattern: /does not exercise/u,
  },
  {
    capabilityId: "gsd:workflow:execute",
    kind: "gsd-workflow",
    positivePrompt: "Execute planned changes in execute step.",
    negativePrompt: "Read-only inspection without execute step.",
    positiveReasonPattern: /Standard GSD lifecycle workflow spine/u,
    negativeReasonPattern: /does not exercise/u,
  },
  {
    capabilityId: "gsd:workflow:verify",
    kind: "gsd-workflow",
    positivePrompt: "Verify test suite and acceptance criteria in verify step.",
    negativePrompt: "Unverified execution branch.",
    positiveReasonPattern: /Standard GSD lifecycle workflow spine/u,
    negativeReasonPattern: /does not exercise/u,
  },
  {
    capabilityId: "gsd:workflow:review",
    kind: "gsd-workflow",
    positivePrompt: "Perform independent review dispatch for review boundary audit.",
    negativePrompt: "Internal execute without independent review dispatch.",
    positiveReasonPattern: /Standard GSD lifecycle workflow spine/u,
    negativeReasonPattern: /does not exercise/u,
  },

  // 2. ECC Global Skills (3)
  {
    capabilityId: "ecc:global:documentation-lookup",
    kind: "ecc-global-skill",
    positivePrompt: "Consult documentation-lookup for version-specific library API documentation.",
    negativePrompt: "Implement pure local in-memory math sort with no external APIs.",
    positiveReasonPattern: /Required version-specific API documentation lookup|Globally configured/u,
    negativeReasonPattern: /does not require documentation-lookup/u,
  },
  {
    capabilityId: "ecc:global:deep-research",
    kind: "ecc-global-skill",
    positivePrompt: "Perform deep-research into industry patterns and academic literature.",
    negativePrompt: "Format JSON file according to existing local schema.",
    positiveReasonPattern: /Required deep research investigation|Globally configured/u,
    negativeReasonPattern: /does not require deep-research/u,
  },
  {
    capabilityId: "ecc:global:unified-memory",
    kind: "ecc-global-skill",
    positivePrompt: "Handoff context to subsequent agent using unified-memory vault.",
    negativePrompt: "Single agent ephemeral session without persistent memory handoff.",
    positiveReasonPattern: /Globally configured low-risk ECC skill/u,
    negativeReasonPattern: /does not require unified-memory/u,
  },

  // 3. Capability Packs (15)
  {
    capabilityId: "pack:AGENT_RUNTIME",
    kind: "capability-pack",
    positivePrompt: "Construct agent harness runtime integration pack AGENT_RUNTIME.",
    negativePrompt: "Generic static website without agent harness.",
    positiveReasonPattern: /Project evidence satisfies criteria for pack AGENT_RUNTIME/u,
    negativeReasonPattern: /not approved or selected/u,
  },
  {
    capabilityId: "pack:AI_EVAL",
    kind: "capability-pack",
    positivePrompt: "Set up AI evaluation and regression testing framework AI_EVAL.",
    negativePrompt: "Unrelated utility tool.",
    positiveReasonPattern: /Project evidence satisfies criteria for pack AI_EVAL/u,
    negativeReasonPattern: /not approved or selected/u,
  },
  {
    capabilityId: "pack:API",
    kind: "capability-pack",
    positivePrompt: "Build REST and GraphQL API services for API pack.",
    negativePrompt: "Offline desktop batch calculator.",
    positiveReasonPattern: /Project evidence satisfies criteria for pack API/u,
    negativeReasonPattern: /not approved or selected/u,
  },
  {
    capabilityId: "pack:BROWNFIELD_INIT",
    kind: "capability-pack",
    positivePrompt: "Inherit legacy codebase architecture and conventions in BROWNFIELD_INIT.",
    negativePrompt: "Greenfield repository initialization.",
    positiveReasonPattern: /Project evidence satisfies criteria for pack BROWNFIELD_INIT/u,
    negativeReasonPattern: /not approved or selected/u,
  },
  {
    capabilityId: "pack:CACHE_REDIS",
    kind: "capability-pack",
    positivePrompt: "Implement distributed caching using Redis patterns CACHE_REDIS.",
    negativePrompt: "Stateless command line tool.",
    positiveReasonPattern: /Project evidence satisfies criteria for pack CACHE_REDIS/u,
    negativeReasonPattern: /not approved or selected/u,
  },
  {
    capabilityId: "pack:CONTAINER",
    kind: "capability-pack",
    positivePrompt: "Containerize application services with Docker patterns CONTAINER.",
    negativePrompt: "Bare-metal script without containerization.",
    positiveReasonPattern: /Project evidence satisfies criteria for pack CONTAINER/u,
    negativeReasonPattern: /not approved or selected/u,
  },
  {
    capabilityId: "pack:DB_MIGRATION",
    kind: "capability-pack",
    positivePrompt: "Perform database schema migrations and validation DB_MIGRATION.",
    negativePrompt: "Ephemeral in-memory cache without persistent DB.",
    positiveReasonPattern: /Project evidence satisfies criteria for pack DB_MIGRATION/u,
    negativeReasonPattern: /not approved or selected/u,
  },
  {
    capabilityId: "pack:DB_POSTGRES",
    kind: "capability-pack",
    positivePrompt: "Configure PostgreSQL relational storage and pooling DB_POSTGRES.",
    negativePrompt: "Flat-file markdown documentation project.",
    positiveReasonPattern: /Project evidence satisfies criteria for pack DB_POSTGRES/u,
    negativeReasonPattern: /not approved or selected/u,
  },
  {
    capabilityId: "pack:DEPLOYMENT",
    kind: "capability-pack",
    positivePrompt: "Configure automated cloud deployment pipelines DEPLOYMENT.",
    negativePrompt: "Local development scratch script.",
    positiveReasonPattern: /Project evidence satisfies criteria for pack DEPLOYMENT/u,
    negativeReasonPattern: /not approved or selected/u,
  },
  {
    capabilityId: "pack:MCP_SERVER",
    kind: "capability-pack",
    positivePrompt: "Implement Model Context Protocol server endpoints MCP_SERVER.",
    negativePrompt: "Native CLI without MCP integrations.",
    positiveReasonPattern: /Project evidence satisfies criteria for pack MCP_SERVER/u,
    negativeReasonPattern: /not approved or selected/u,
  },
  {
    capabilityId: "pack:RESEARCH_SCIENTIFIC",
    kind: "capability-pack",
    positivePrompt: "Perform PubMed scientific literature queries RESEARCH_SCIENTIFIC.",
    negativePrompt: "Standard web design without biomedical research.",
    positiveReasonPattern: /Project evidence satisfies criteria for pack RESEARCH_SCIENTIFIC/u,
    negativeReasonPattern: /not approved or selected/u,
  },
  {
    capabilityId: "pack:SECURITY_REVIEW",
    kind: "capability-pack",
    positivePrompt: "Execute security audit and dependency vulnerability review SECURITY_REVIEW.",
    negativePrompt: "Rapid prototyping script ignoring security policies.",
    positiveReasonPattern: /Project evidence satisfies criteria for pack SECURITY_REVIEW/u,
    negativeReasonPattern: /not approved or selected/u,
  },
  {
    capabilityId: "pack:WEB_BASE",
    kind: "capability-pack",
    positivePrompt: "Audit web accessibility and browser QA testing WEB_BASE.",
    negativePrompt: "Console daemon without web frontend.",
    positiveReasonPattern: /Project evidence satisfies criteria for pack WEB_BASE/u,
    negativeReasonPattern: /not approved or selected/u,
  },
  {
    capabilityId: "pack:WEB_FLOW_AUDIT",
    kind: "capability-pack",
    positivePrompt: "Trace user click-path navigation workflows WEB_FLOW_AUDIT.",
    negativePrompt: "Backend database worker service.",
    positiveReasonPattern: /Project evidence satisfies criteria for pack WEB_FLOW_AUDIT/u,
    negativeReasonPattern: /not approved or selected/u,
  },
  {
    capabilityId: "pack:WEB_REACT",
    kind: "capability-pack",
    positivePrompt: "Build interactive React UI components WEB_REACT.",
    negativePrompt: "Terminal shell utility.",
    positiveReasonPattern: /Project evidence satisfies criteria for pack WEB_REACT/u,
    negativeReasonPattern: /not approved or selected/u,
  },

  // 4. ECC Project Skills (19)
  {
    capabilityId: "ecc:project:AGENT_RUNTIME:agent-harness-construction",
    kind: "ecc-project-skill",
    positivePrompt: "Construct harness agent with agent-harness-construction skill.",
    negativePrompt: "Standard bash pipeline without agent harness.",
    positiveReasonPattern: /Included in applicable project pack AGENT_RUNTIME/u,
    negativeReasonPattern: /Project pack AGENT_RUNTIME is unapproved or unselected/u,
  },
  {
    capabilityId: "ecc:project:AI_EVAL:ai-regression-testing",
    kind: "ecc-project-skill",
    positivePrompt: "Run AI benchmark regressions with ai-regression-testing.",
    negativePrompt: "Manual review without AI regression benchmarks.",
    positiveReasonPattern: /Included in applicable project pack AI_EVAL/u,
    negativeReasonPattern: /Project pack AI_EVAL is unapproved or unselected/u,
  },
  {
    capabilityId: "ecc:project:AI_EVAL:eval-harness",
    kind: "ecc-project-skill",
    positivePrompt: "Evaluate model scoring with eval-harness.",
    negativePrompt: "Simple boolean assert testing.",
    positiveReasonPattern: /Included in applicable project pack AI_EVAL/u,
    negativeReasonPattern: /Project pack AI_EVAL is unapproved or unselected/u,
  },
  {
    capabilityId: "ecc:project:BROWNFIELD_INIT:inherit-legacy-style",
    kind: "ecc-project-skill",
    positivePrompt: "Analyze legacy patterns with inherit-legacy-style.",
    negativePrompt: "New clean repository bootstrap.",
    positiveReasonPattern: /Included in applicable project pack BROWNFIELD_INIT/u,
    negativeReasonPattern: /Project pack BROWNFIELD_INIT is unapproved or unselected/u,
  },
  {
    capabilityId: "ecc:project:CACHE_REDIS:redis-patterns",
    kind: "ecc-project-skill",
    positivePrompt: "Use redis-patterns for cluster caching.",
    negativePrompt: "In-process memory dictionary.",
    positiveReasonPattern: /Included in applicable project pack CACHE_REDIS/u,
    negativeReasonPattern: /Project pack CACHE_REDIS is unapproved or unselected/u,
  },
  {
    capabilityId: "ecc:project:CONTAINER:docker-patterns",
    kind: "ecc-project-skill",
    positivePrompt: "Generate multi-stage docker-patterns build.",
    negativePrompt: "Local native node script.",
    positiveReasonPattern: /Included in applicable project pack CONTAINER/u,
    negativeReasonPattern: /Project pack CONTAINER is unapproved or unselected/u,
  },
  {
    capabilityId: "ecc:project:DB_MIGRATION:database-migrations",
    kind: "ecc-project-skill",
    positivePrompt: "Apply incremental database-migrations schema updates.",
    negativePrompt: "Static schema with no migrations.",
    positiveReasonPattern: /Included in applicable project pack DB_MIGRATION/u,
    negativeReasonPattern: /Project pack DB_MIGRATION is unapproved or unselected/u,
  },
  {
    capabilityId: "ecc:project:DB_POSTGRES:postgres-patterns",
    kind: "ecc-project-skill",
    positivePrompt: "Query postgres-patterns JSONB indexes.",
    negativePrompt: "SQLite flat table access.",
    positiveReasonPattern: /Included in applicable project pack DB_POSTGRES/u,
    negativeReasonPattern: /Project pack DB_POSTGRES is unapproved or unselected/u,
  },
  {
    capabilityId: "ecc:project:DEPLOYMENT:deployment-patterns",
    kind: "ecc-project-skill",
    positivePrompt: "Deploy service using deployment-patterns.",
    negativePrompt: "Local test execution only.",
    positiveReasonPattern: /Included in applicable project pack DEPLOYMENT/u,
    negativeReasonPattern: /Project pack DEPLOYMENT is unapproved or unselected/u,
  },
  {
    capabilityId: "ecc:project:MCP_SERVER:mcp-server-patterns",
    kind: "ecc-project-skill",
    positivePrompt: "Structure MCP transport with mcp-server-patterns.",
    negativePrompt: "HTTP REST handler without MCP.",
    positiveReasonPattern: /Included in applicable project pack MCP_SERVER/u,
    negativeReasonPattern: /Project pack MCP_SERVER is unapproved or unselected/u,
  },
  {
    capabilityId: "ecc:project:RESEARCH_SCIENTIFIC:scientific-db-pubmed-database",
    kind: "ecc-project-skill",
    positivePrompt: "Search biological citations using scientific-db-pubmed-database.",
    negativePrompt: "General web search without pubmed database.",
    positiveReasonPattern: /Included in applicable project pack RESEARCH_SCIENTIFIC/u,
    negativeReasonPattern: /Project pack RESEARCH_SCIENTIFIC is unapproved or unselected/u,
  },
  {
    capabilityId: "ecc:project:RESEARCH_SCIENTIFIC:scientific-db-uspto-database",
    kind: "ecc-project-skill",
    positivePrompt: "Inspect patent grants with scientific-db-uspto-database.",
    negativePrompt: "Local code refactor.",
    positiveReasonPattern: /Included in applicable project pack RESEARCH_SCIENTIFIC/u,
    negativeReasonPattern: /Project pack RESEARCH_SCIENTIFIC is unapproved or unselected/u,
  },
  {
    capabilityId: "ecc:project:RESEARCH_SCIENTIFIC:scientific-thinking-literature-review",
    kind: "ecc-project-skill",
    positivePrompt: "Perform systematic review with scientific-thinking-literature-review.",
    negativePrompt: "Quick bugfix without literature review.",
    positiveReasonPattern: /Included in applicable project pack RESEARCH_SCIENTIFIC/u,
    negativeReasonPattern: /Project pack RESEARCH_SCIENTIFIC is unapproved or unselected/u,
  },
  {
    capabilityId: "ecc:project:RESEARCH_SCIENTIFIC:scientific-thinking-scholar-evaluation",
    kind: "ecc-project-skill",
    positivePrompt: "Assess publication impact with scientific-thinking-scholar-evaluation.",
    negativePrompt: "Code linting run.",
    positiveReasonPattern: /Included in applicable project pack RESEARCH_SCIENTIFIC/u,
    negativeReasonPattern: /Project pack RESEARCH_SCIENTIFIC is unapproved or unselected/u,
  },
  {
    capabilityId: "ecc:project:SECURITY_REVIEW:security-review",
    kind: "ecc-project-skill",
    positivePrompt: "Audit auth tokens with security-review skill.",
    negativePrompt: "Style formatting cleanup.",
    positiveReasonPattern: /Included in applicable project pack SECURITY_REVIEW/u,
    negativeReasonPattern: /Project pack SECURITY_REVIEW is unapproved or unselected/u,
  },
  {
    capabilityId: "ecc:project:WEB_BASE:accessibility",
    kind: "ecc-project-skill",
    positivePrompt: "Verify WCAG guidelines using accessibility skill.",
    negativePrompt: "Backend SQL optimization.",
    positiveReasonPattern: /Included in applicable project pack WEB_BASE/u,
    negativeReasonPattern: /Project pack WEB_BASE is unapproved or unselected/u,
  },
  {
    capabilityId: "ecc:project:WEB_BASE:browser-qa",
    kind: "ecc-project-skill",
    positivePrompt: "Execute end-to-end browser-qa tests.",
    negativePrompt: "Unit tests in node without browser.",
    positiveReasonPattern: /Included in applicable project pack WEB_BASE/u,
    negativeReasonPattern: /Project pack WEB_BASE is unapproved or unselected/u,
  },
  {
    capabilityId: "ecc:project:WEB_FLOW_AUDIT:click-path-audit",
    kind: "ecc-project-skill",
    positivePrompt: "Analyze funnel conversion using click-path-audit.",
    negativePrompt: "Cron worker process.",
    positiveReasonPattern: /Included in applicable project pack WEB_FLOW_AUDIT/u,
    negativeReasonPattern: /Project pack WEB_FLOW_AUDIT is unapproved or unselected/u,
  },
  {
    capabilityId: "ecc:project:WEB_REACT:frontend-a11y",
    kind: "ecc-project-skill",
    positivePrompt: "Audit React JSX elements with frontend-a11y.",
    negativePrompt: "Backend microservice in Golang.",
    positiveReasonPattern: /Included in applicable project pack WEB_REACT/u,
    negativeReasonPattern: /Project pack WEB_REACT is unapproved or unselected/u,
  },

  // 5. Owned Skills (3)
  {
    capabilityId: "owned:alpha-aos-control",
    kind: "owned-skill",
    positivePrompt: "Execute alpha-AOS control plane operations and policy checks.",
    negativePrompt: "Standalone third-party utility without control commands.",
    positiveReasonPattern: /Owned skill configured in catalog/u,
    negativeReasonPattern: /unsupported/u,
  },
  {
    capabilityId: "owned:alpha-aos-task",
    kind: "owned-skill",
    positivePrompt: "Execute natural task intake and operator CLI workflows.",
    negativePrompt: "Standalone script without task lifecycle commands.",
    positiveReasonPattern: /Owned skill configured in catalog/u,
    negativeReasonPattern: /unsupported/u,
  },
  {
    capabilityId: "owned:alpha-aos-ship",
    kind: "owned-skill",
    positivePrompt: "Ship completed phase via GSD ship workflow on Claude harness.",
    negativePrompt: "Ship invocation on unsupported harness or non-GSD workflow.",
    positiveReasonPattern: /Owned skill configured in catalog/u,
    negativeReasonPattern: /Target harness .* is not in declared targets/u,
  },

  // 6. MCP Servers (3)
  {
    capabilityId: "mcp:server:context7",
    kind: "mcp-server",
    positivePrompt: "Connect Context7 MCP server for live library documentation.",
    negativePrompt: "Offline build without external MCP servers.",
    positiveReasonPattern: /Catalog-declared MCP server rollout/u,
    negativeReasonPattern: /not requested/u,
  },
  {
    capabilityId: "mcp:server:exa",
    kind: "mcp-server",
    positivePrompt: "Connect Exa MCP server for semantic search queries.",
    negativePrompt: "Offline compile without web search.",
    positiveReasonPattern: /Catalog-declared MCP server rollout/u,
    negativeReasonPattern: /not requested/u,
  },
  {
    capabilityId: "mcp:server:firecrawl",
    kind: "mcp-server",
    positivePrompt: "Connect Firecrawl MCP server for deep web crawling.",
    negativePrompt: "Static analysis with no web network requests.",
    positiveReasonPattern: /Catalog-declared MCP server rollout/u,
    negativeReasonPattern: /not requested/u,
  },

  // 7. MCP Tools (8)
  {
    capabilityId: "mcp:tool:context7:query-docs",
    kind: "mcp-tool",
    positivePrompt: "Invoke query-docs tool to retrieve version-specific framework documentation.",
    negativePrompt: "Local string concatenation.",
    positiveReasonPattern: /MCP tool provided by context7 server/u,
    negativeReasonPattern: /not requested/u,
  },
  {
    capabilityId: "mcp:tool:context7:resolve-library-id",
    kind: "mcp-tool",
    positivePrompt: "Resolve library package identifier using resolve-library-id.",
    negativePrompt: "Hardcoded package name lookup.",
    positiveReasonPattern: /MCP tool provided by context7 server/u,
    negativeReasonPattern: /not requested/u,
  },
  {
    capabilityId: "mcp:tool:exa:web_fetch_exa",
    kind: "mcp-tool",
    positivePrompt: "Fetch target URL contents using web_fetch_exa.",
    negativePrompt: "Read local workspace file.",
    positiveReasonPattern: /MCP tool provided by exa server/u,
    negativeReasonPattern: /not requested/u,
  },
  {
    capabilityId: "mcp:tool:exa:web_search_exa",
    kind: "mcp-tool",
    positivePrompt: "Search web index using web_search_exa.",
    negativePrompt: "Search local grep regex.",
    positiveReasonPattern: /MCP tool provided by exa server/u,
    negativeReasonPattern: /not requested/u,
  },
  {
    capabilityId: "mcp:tool:firecrawl:firecrawl_check_crawl_status",
    kind: "mcp-tool",
    positivePrompt: "Check asynchronous crawl job progress using firecrawl_check_crawl_status.",
    negativePrompt: "Synchronous local operation.",
    positiveReasonPattern: /MCP tool provided by firecrawl server/u,
    negativeReasonPattern: /not requested/u,
  },
  {
    capabilityId: "mcp:tool:firecrawl:firecrawl_crawl",
    kind: "mcp-tool",
    positivePrompt: "Start deep crawl session using firecrawl_crawl.",
    negativePrompt: "Single URL read.",
    positiveReasonPattern: /MCP tool provided by firecrawl server/u,
    negativeReasonPattern: /not requested/u,
  },
  {
    capabilityId: "mcp:tool:firecrawl:firecrawl_map",
    kind: "mcp-tool",
    positivePrompt: "Map website sitemap paths using firecrawl_map.",
    negativePrompt: "Local directory globbing.",
    positiveReasonPattern: /MCP tool provided by firecrawl server/u,
    negativeReasonPattern: /not requested/u,
  },
  {
    capabilityId: "mcp:tool:firecrawl:firecrawl_scrape",
    kind: "mcp-tool",
    positivePrompt: "Scrape single web page content using firecrawl_scrape.",
    negativePrompt: "Read disk file.",
    positiveReasonPattern: /MCP tool provided by firecrawl server/u,
    negativeReasonPattern: /not requested/u,
  },

  // 8. Control Commands (7)
  {
    capabilityId: "control:command:checkpoint",
    kind: "control-command",
    positivePrompt: "Record dependency state checkpoint using alpha-aos checkpoint.",
    negativePrompt: "Unmonitored manual npm install without checkpointing.",
    positiveReasonPattern: /alpha-AOS control plane CLI command/u,
    negativeReasonPattern: /unrecognized command/u,
  },
  {
    capabilityId: "control:command:doctor",
    kind: "control-command",
    positivePrompt: "Inspect system configuration integrity using alpha-aos doctor.",
    negativePrompt: "Silent execution without diagnostics.",
    positiveReasonPattern: /alpha-AOS control plane CLI command/u,
    negativeReasonPattern: /unrecognized command/u,
  },
  {
    capabilityId: "control:command:install",
    kind: "control-command",
    positivePrompt: "Install managed harness configurations with alpha-aos install.",
    negativePrompt: "Manual configuration editing.",
    positiveReasonPattern: /alpha-AOS control plane CLI command/u,
    negativeReasonPattern: /unrecognized command/u,
  },
  {
    capabilityId: "control:command:plan",
    kind: "control-command",
    positivePrompt: "Preview capability requirements and drift with alpha-aos plan.",
    negativePrompt: "Direct unverified execution without plan.",
    positiveReasonPattern: /alpha-AOS control plane CLI command/u,
    negativeReasonPattern: /unrecognized command/u,
  },
  {
    capabilityId: "control:command:rollback",
    kind: "control-command",
    positivePrompt: "Revert transactional filesystem mutations using alpha-aos rollback.",
    negativePrompt: "Irreversible in-place file mutation.",
    positiveReasonPattern: /alpha-AOS control plane CLI command/u,
    negativeReasonPattern: /unrecognized command/u,
  },
  {
    capabilityId: "control:command:status",
    kind: "control-command",
    positivePrompt: "Check runtime status and capability summaries with alpha-aos status.",
    negativePrompt: "Blind operation without status check.",
    positiveReasonPattern: /alpha-AOS control plane CLI command/u,
    negativeReasonPattern: /unrecognized command/u,
  },
  {
    capabilityId: "control:command:sync",
    kind: "control-command",
    positivePrompt: "Synchronize component configuration files with alpha-aos sync.",
    negativePrompt: "Drifted un-synchronized configuration files.",
    positiveReasonPattern: /alpha-AOS control plane CLI command/u,
    negativeReasonPattern: /unrecognized command/u,
  },

  // 9. Native Tools (6)
  {
    capabilityId: "native:tool:bash",
    kind: "native-tool",
    positivePrompt: "Execute shell command via harness native bash tool.",
    negativePrompt: "Pure LLM response without shell execution capability.",
    positiveReasonPattern: /Harness native tool execution capability/u,
    negativeReasonPattern: /tool unavailable/u,
  },
  {
    capabilityId: "native:tool:edit_file",
    kind: "native-tool",
    positivePrompt: "Apply targeted code modifications using edit_file tool.",
    negativePrompt: "Read-only inspection without file edit tool.",
    positiveReasonPattern: /Harness native tool execution capability/u,
    negativeReasonPattern: /tool unavailable/u,
  },
  {
    capabilityId: "native:tool:glob",
    kind: "native-tool",
    positivePrompt: "Enumerate file pattern matches using glob tool.",
    negativePrompt: "Exact path lookup only.",
    positiveReasonPattern: /Harness native tool execution capability/u,
    negativeReasonPattern: /tool unavailable/u,
  },
  {
    capabilityId: "native:tool:grep",
    kind: "native-tool",
    positivePrompt: "Search regular expressions across codebase with grep tool.",
    negativePrompt: "Filename search only.",
    positiveReasonPattern: /Harness native tool execution capability/u,
    negativeReasonPattern: /tool unavailable/u,
  },
  {
    capabilityId: "native:tool:read_file",
    kind: "native-tool",
    positivePrompt: "Inspect file contents using read_file tool.",
    negativePrompt: "Blind generation without reading existing code.",
    positiveReasonPattern: /Harness native tool execution capability/u,
    negativeReasonPattern: /tool unavailable/u,
  },
  {
    capabilityId: "native:tool:write_file",
    kind: "native-tool",
    positivePrompt: "Create new file artifact with write_file tool.",
    negativePrompt: "In-memory string generation without disk persistence.",
    positiveReasonPattern: /Harness native tool execution capability/u,
    negativeReasonPattern: /tool unavailable/u,
  },

  // 10. Mandatory Hooks (9)
  {
    capabilityId: "hook:discuss:pre",
    kind: "mandatory-hook",
    positivePrompt: "Execute pre-discuss policy gate hook.",
    negativePrompt: "Skip discuss phase.",
    positiveReasonPattern: /task-hook-receipt/u,
    negativeReasonPattern: /hook not triggered/u,
  },
  {
    capabilityId: "hook:discuss:post",
    kind: "mandatory-hook",
    positivePrompt: "Execute post-discuss validation hook.",
    negativePrompt: "Skip discuss phase.",
    positiveReasonPattern: /task-hook-receipt/u,
    negativeReasonPattern: /hook not triggered/u,
  },
  {
    capabilityId: "hook:plan:pre",
    kind: "mandatory-hook",
    positivePrompt: "Execute pre-plan initialization hook.",
    negativePrompt: "Skip plan phase.",
    positiveReasonPattern: /task-hook-receipt/u,
    negativeReasonPattern: /hook not triggered/u,
  },
  {
    capabilityId: "hook:plan:post",
    kind: "mandatory-hook",
    positivePrompt: "Execute post-plan structural verification hook.",
    negativePrompt: "Skip plan phase.",
    positiveReasonPattern: /task-hook-receipt/u,
    negativeReasonPattern: /hook not triggered/u,
  },
  {
    capabilityId: "hook:execute:pre",
    kind: "mandatory-hook",
    positivePrompt: "Execute pre-execute authority boundary hook.",
    negativePrompt: "Skip execute phase.",
    positiveReasonPattern: /task-hook-receipt/u,
    negativeReasonPattern: /hook not triggered/u,
  },
  {
    capabilityId: "hook:execute:post",
    kind: "mandatory-hook",
    positivePrompt: "Execute post-execute mutation audit hook.",
    negativePrompt: "Skip execute phase.",
    positiveReasonPattern: /task-hook-receipt/u,
    negativeReasonPattern: /hook not triggered/u,
  },
  {
    capabilityId: "hook:verify:pre",
    kind: "mandatory-hook",
    positivePrompt: "Execute pre-verify readiness check hook.",
    negativePrompt: "Skip verify phase.",
    positiveReasonPattern: /task-hook-receipt/u,
    negativeReasonPattern: /hook not triggered/u,
  },
  {
    capabilityId: "hook:verify:post",
    kind: "mandatory-hook",
    positivePrompt: "Execute post-verify acceptance gate hook.",
    negativePrompt: "Skip verify phase.",
    positiveReasonPattern: /task-hook-receipt/u,
    negativeReasonPattern: /hook not triggered/u,
  },
  {
    capabilityId: "hook:quality-gate:review",
    kind: "mandatory-hook",
    positivePrompt: "Execute quality-gate review certification hook.",
    negativePrompt: "Bypass quality gates.",
    positiveReasonPattern: /task-hook-receipt/u,
    negativeReasonPattern: /hook not triggered/u,
  },
];

// =============================================================================
// Tests: Completeness & Set Equality
// =============================================================================

test("CAP-05 completeness: fixture manifest matches exact inventory declaration set", async () => {
  const inventory = await buildTaskCapabilityInventory();
  const declaredIds = new Set(inventory.items.map((item) => item.id));
  const manifestIds = new Set(CAPABILITY_FIXTURE_MANIFEST.map((fixture) => fixture.capabilityId));

  const missingFromManifest = [...declaredIds].filter((id) => !manifestIds.has(id));
  const extraInManifest = [...manifestIds].filter((id) => !declaredIds.has(id));

  assert.equal(
    missingFromManifest.length,
    0,
    `Declared capabilities missing from fixture manifest: ${missingFromManifest.join(", ")}`,
  );
  assert.equal(
    extraInManifest.length,
    0,
    `Fixture manifest contains extra undeclared capabilities: ${extraInManifest.join(", ")}`,
  );
  assert.equal(manifestIds.size, declaredIds.size);
  assert.equal(manifestIds.size, 78, "Must cover all 78 declared capabilities");
});

test("CAP-05: every capability has non-empty positive and negative prompts and reason patterns", () => {
  for (const fixture of CAPABILITY_FIXTURE_MANIFEST) {
    assert.ok(fixture.capabilityId.length > 0, "Capability ID must not be empty");
    assert.ok(fixture.positivePrompt.length > 10, `${fixture.capabilityId} must have meaningful positive prompt`);
    assert.ok(fixture.negativePrompt.length > 10, `${fixture.capabilityId} must have meaningful negative prompt`);
    assert.ok(fixture.positiveReasonPattern, `${fixture.capabilityId} must have positive reason pattern`);
    assert.ok(fixture.negativeReasonPattern, `${fixture.capabilityId} must have negative reason pattern`);
  }
});

// =============================================================================
// Tests: Positive and Negative Evaluation per Category
// =============================================================================

test("CAP-01..05: global skills positive matching selects obligation, negative matching omits obligation", async () => {
  const projectRoot = process.cwd();

  // 1. documentation-lookup
  const docFixture = CAPABILITY_FIXTURE_MANIFEST.find((f) => f.capabilityId === "ecc:global:documentation-lookup")!;
  const docPositiveContract = inventorySummaryContract(projectRoot, { goal: docFixture.positivePrompt });
  const docPosDecision = evaluateStepObligations({ contract: docPositiveContract, step: "execute", projectRoot });
  assert.equal(docPosDecision.status, "ready");
  assert.ok(docPosDecision.obligations.some((o) => o.capabilityId === "documentation-lookup" && o.required));

  const docNegativeContract = inventorySummaryContract(projectRoot, { goal: docFixture.negativePrompt });
  const docNegDecision = evaluateStepObligations({ contract: docNegativeContract, step: "execute", projectRoot });
  assert.equal(docNegDecision.status, "ready");
  assert.equal(docNegDecision.obligations.some((o) => o.capabilityId === "documentation-lookup"), false);

  // 2. deep-research
  const researchFixture = CAPABILITY_FIXTURE_MANIFEST.find((f) => f.capabilityId === "ecc:global:deep-research")!;
  const resPositiveContract = inventorySummaryContract(projectRoot, { goal: researchFixture.positivePrompt });
  const resPosDecision = evaluateStepObligations({ contract: resPositiveContract, step: "execute", projectRoot });
  assert.equal(resPosDecision.status, "ready");
  assert.ok(resPosDecision.obligations.some((o) => o.capabilityId === "deep-research" && o.required));

  const resNegativeContract = inventorySummaryContract(projectRoot, { goal: researchFixture.negativePrompt });
  const resNegDecision = evaluateStepObligations({ contract: resNegativeContract, step: "execute", projectRoot });
  assert.equal(resNegDecision.status, "ready");
  assert.equal(resNegDecision.obligations.some((o) => o.capabilityId === "deep-research"), false);
});

test("CAP-01..05: capability pack positive selection marks CURRENT, unapproved marks unselected/STALE", async () => {
  // Positive: Project plan with AGENT_RUNTIME selected
  const positiveInventory = await buildTaskCapabilityInventory({
    projectPlan: {
      planDigest: "dig-123",
      applicable: ["AGENT_RUNTIME"],
      selected: ["AGENT_RUNTIME"],
      targetPreState: [],
    } as unknown as import("../src/types.js").ProjectCapabilityPlan,
  });

  const agentPack = positiveInventory.items.find((item) => item.id === "pack:AGENT_RUNTIME");
  assert.ok(agentPack);
  assert.equal(agentPack.applicable, true);
  assert.equal(agentPack.selected, true);
  assert.equal(agentPack.deployment, "CURRENT");
  assert.equal(agentPack.exclusionReason, null);

  const agentSkill = positiveInventory.items.find((item) => item.id === "ecc:project:AGENT_RUNTIME:agent-harness-construction");
  assert.ok(agentSkill);
  assert.equal(agentSkill.selected, true);
  assert.equal(agentSkill.deployment, "CURRENT");

  // Negative: Project plan where pack is NOT selected
  const negativeInventory = await buildTaskCapabilityInventory({
    projectPlan: {
      planDigest: "dig-none",
      applicable: ["AGENT_RUNTIME"],
      selected: [], // unapproved / not selected
      targetPreState: [],
    } as unknown as import("../src/types.js").ProjectCapabilityPlan,
  });

  const unapprovedPack = negativeInventory.items.find((item) => item.id === "pack:AGENT_RUNTIME");
  assert.ok(unapprovedPack);
  assert.equal(unapprovedPack.selected, false);
  assert.equal(unapprovedPack.deployment, "STALE");
  assert.match(unapprovedPack.exclusionReason ?? "", /not approved or selected/u);

  const unapprovedSkill = negativeInventory.items.find((item) => item.id === "ecc:project:AGENT_RUNTIME:agent-harness-construction");
  assert.ok(unapprovedSkill);
  assert.equal(unapprovedSkill.selected, false);
  assert.equal(unapprovedSkill.deployment, "STALE");
  assert.match(unapprovedSkill.exclusionReason ?? "", /unapproved or unselected/u);
});

test("CAP-01..05: owned skill target harness selectivity", async () => {
  const inventoryClaude = await buildTaskCapabilityInventory({ harness: "claude" });
  const shipOnClaude = inventoryClaude.items.find((item) => item.id === "owned:alpha-aos-ship");
  assert.ok(shipOnClaude);
  assert.equal(shipOnClaude.support, "supported");

  const inventoryCodex = await buildTaskCapabilityInventory({ harness: "codex" });
  const shipOnCodex = inventoryCodex.items.find((item) => item.id === "owned:alpha-aos-ship");
  assert.ok(shipOnCodex);
  assert.equal(shipOnCodex.support, "unsupported");
  assert.match(shipOnCodex.supportReason, /not in declared targets/u);
});

test("CAP-01..05: MCP tools and servers are declared with exact version and hashes", async () => {
  const inventory = await buildTaskCapabilityInventory();
  const mcpServers = inventory.items.filter((i) => i.kind === "mcp-server");
  assert.equal(mcpServers.length, 3);
  for (const server of mcpServers) {
    assert.ok(server.version.length > 0);
    assert.ok(server.source.length > 0);
    assert.ok(server.sourceHash !== null);
  }

  const mcpTools = inventory.items.filter((i) => i.kind === "mcp-tool");
  assert.equal(mcpTools.length, 8);
  for (const tool of mcpTools) {
    assert.ok(tool.version.length > 0);
    assert.ok(tool.source.length > 0);
  }
});
