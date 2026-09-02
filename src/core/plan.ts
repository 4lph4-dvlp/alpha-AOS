import type { PlanAction, StackCatalog, StackLock } from "../types.js";

function quoteSkills(skills: string[]): string {
  return skills.join(",");
}

export function createInstallPlan(catalog: StackCatalog, lock: StackLock): PlanAction[] {
  const actions: PlanAction[] = [];
  const gsd = lock.components.gsd;
  const ecc = lock.components.ecc;
  const mcp = lock.components.mcp;
  if (!gsd || !ecc || !mcp) throw new Error("Stable lock is missing required components");

  actions.push({
    id: "preflight",
    phase: 0,
    component: "runtime",
    target: "machine",
    operation: "check",
    command: "node --version && npm --version && git --version",
    writes: false,
    approval: false,
    note: "Require Node >=24 and npm >=10 before any mutation",
  });

  actions.push({
    id: "gsd:shared-root-audit",
    phase: 1,
    component: "gsd",
    target: "machine",
    operation: "check",
    command: null,
    writes: false,
    approval: false,
    note: "snapshot and diff shared ~/.agents and ~/.gsd roots; GSD harness installs must run sequentially, never in parallel",
  });

  for (const target of catalog.components.gsd.targets) {
    const adapter = catalog.harnesses[target];
    if (!adapter.gsdTarget) continue;
    actions.push({
      id: `gsd:${target}`,
      phase: target === catalog.policy.canaryHarness ? 2 : 4,
      component: "gsd",
      target,
      operation: "install",
      command: `npx --yes ${gsd.package}@${gsd.version} --${adapter.gsdTarget} --global --profile=${gsd.profile} --no-legacy-cleanup`,
      writes: true,
      approval: true,
      note: target === catalog.policy.canaryHarness
        ? "canary first"
        : "apply sequentially only after canary and shared-root diff gates pass; legacy cleanup stays disabled",
    });
    if (target === "codex") {
      actions.push({
        id: "gsd:codex:hook-compat",
        phase: 4,
        component: "gsd-compat",
        target,
        operation: "install",
        command: "alpha-aos gsd compat codex --apply",
        writes: true,
        approval: true,
        note: "complete any helper files omitted by the upstream Codex installer from the integrity-verified GSD tarball, then smoke-test Stop hook output",
      });
    }
  }

  for (const skill of catalog.components.ownedSkills) {
    const locked = lock.components.ownedSkills?.[skill.id];
    if (!locked) throw new Error(`Owned skill lock missing ${skill.id}`);
    for (const target of skill.targets) {
      actions.push({
        id: `owned-skill:${skill.id}:${target}`,
        phase: 3,
        component: `owned-skill:${skill.id}`,
        target,
        operation: "install",
        command: `alpha-aos owned-skills sync ${skill.id} --target ${target} --apply`,
        writes: true,
        approval: true,
        note: `install repository-owned skill with source SHA-256 ${locked.sourceSha256}`,
      });
    }
  }

  actions.push({
    id: "ecc:runtime",
    phase: 6,
    component: "ecc-runtime",
    target: "machine",
    operation: "install",
    command: `npm install --global --ignore-scripts --no-audit --no-fund ${ecc.package}@${ecc.version}`,
    writes: true,
    approval: true,
    note: "installs the Memory Vault CLI runtime only with lifecycle scripts disabled; harness skill files are handled by the exact-file adapter",
  });

  for (const target of Object.keys(catalog.harnesses) as Array<keyof typeof catalog.harnesses>) {
    actions.push({
      id: `ecc:${target}`,
      phase: 6,
      component: "ecc",
      target,
      operation: "install",
      command: `alpha-aos ecc-skills sync --target ${target} --apply`,
      writes: true,
      approval: true,
      note: `exact-file adapter installs only ${quoteSkills(ecc.skills)}; upstream --skills is blocked`,
    });
  }

  for (const server of catalog.components.mcp.rolloutOrder) {
    const locked = mcp[server];
    if (!locked) throw new Error(`MCP lock missing ${server}`);
    for (const target of catalog.components.mcp.targets) {
      actions.push({
        id: `mcp:${server}:${target}`,
        phase: 5,
        component: `mcp:${server}`,
        target,
        operation: "register",
        command: `alpha-aos mcp sync --target ${target} --server ${server} --apply`,
        writes: true,
        approval: true,
        note: `adapter registers ${locked.package}@${locked.version}; secret material is never placed in the lock${server === "firecrawl" ? "; alpha-AOS filters the upstream 25-tool surface to four extraction/crawl tools" : ""}`,
      });
    }
  }

  const piBridge = lock.components.mcpBridges?.pi;
  if (catalog.components.mcp.targets.includes("pi")) {
    if (!piBridge) throw new Error("MCP bridge lock missing pi");
    actions.push({
      id: "mcp-bridge:pi",
      phase: 5,
      component: "mcp-bridge",
      target: "pi",
      operation: "bridge",
      command: `pi install npm:${piBridge.package}@${piBridge.version}`,
      writes: true,
      approval: true,
      note: "install only after the synthetic PI_CODING_AGENT_DIR fixture passes; use Pi's package manager for lifecycle and removal",
    });
  }

  return actions.sort((left, right) => left.phase - right.phase || left.id.localeCompare(right.id));
}
