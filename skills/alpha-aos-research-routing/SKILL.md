---
name: alpha-aos-research-routing
description: "Route open-web research across the alpha-AOS research stack: search the discovery server to find candidate sources, then extract only the page you already chose through the bounded extraction surface. Use whenever a task needs sources from the open web — finding them, or reading one of them in full."
allowed-tools:
  - Read
  - Glob
  - Grep
  - Bash
  - Skill
---

<objective>
State the alpha-AOS research routing contract in the tool identifiers the pinned MCP servers actually expose.

This instruction exists because the shipped third-party research instructions name tools that the pinned servers do not publish, and one that alpha-AOS policy denies. Those instructions are pinned by hash and must not be edited. This document is the alpha-AOS-owned statement of the same contract, written against measured tool surfaces rather than against inherited text. Where the two disagree, this one is the contract.
</objective>

<context>
Two servers, two different jobs. The routing contract is `docs/alpha-vibe-stack-codex.md` §4.2: start at discovery, and hand only the URLs that need their whole body to extraction.

| Job | Server | Tool identifier |
|---|---|---|
| Find candidate sources for a question | the discovery server (`exa`) | `web_search_exa` |
| Read one page you already have the URL for | the extraction server (`firecrawl`) | `firecrawl_scrape` |

The discovery server also publishes `web_fetch_exa`. Fetching a page it just returned, on the same server, is a correct single-server lookup and is not a routing error. The rule below is about how many servers one ordinary lookup touches, not about memorising one tool sequence.
</context>

<process>
1. **Start at discovery.** A question that needs open-web sources begins with `web_search_exa`. Do not begin by extracting: extraction takes a URL you already hold, and you do not hold one yet.

2. **Extract only what you chose.** Once discovery has returned candidates and you have picked one, pass that URL to `firecrawl_scrape`. Extraction is for the body of a page already in hand.

3. **Do not search on the extraction server.** alpha-AOS fronts the extraction server with a policy proxy that admits exactly four tools — scrape, map, crawl, and crawl-status — and refuses anything else with a stable refusal naming the tool. Searching there is not slower, it is denied. Discovery has its own search and that is where discovery belongs.

4. **An ordinary question is not research.** A single-fact lookup — a default port, a flag name, a version number — should touch at most one research server. Sweeping the whole research stack for a one-line answer is the fan-out this contract exists to prevent.
</process>

<constraints>
- These are UPSTREAM tool identifiers, exactly as each server publishes them. A harness may present the same tool under its own prefixed alias; the identifier above is the one that reaches the server.
- This instruction steers a model. It cannot widen what alpha-AOS permits: the proxy's tool allowlist is the only thing that decides what may be called, and it is unchanged by anything written here. A call this document discourages is still refused by policy, and a call it recommends still has to pass that allowlist.
- Do not treat a policy refusal as a reason to fall back to an unfronted web search. A refusal means the routing contract and the shipped third-party text disagree; that disagreement is recorded as a named finding and is worth reporting, not working around.
</constraints>
