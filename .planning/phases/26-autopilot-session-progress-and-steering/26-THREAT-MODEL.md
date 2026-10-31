---
phase: "26"
status: draft
created: "2026-10-31"
scope: loopback-read-only-progress-panel
---

# Phase 26 — Progress Panel Threat Model

This document is an implementation/verification contract, not an assertion that controls exist. It accompanies 26-UI-SPEC.md. The feature projects existing GSD/runtime evidence and must not become a task controller, arbitrary file server, inference loop or replacement lifecycle owner.

## Assets and Trust Boundaries

| Asset / boundary | Required treatment |
|------------------|--------------------|
| Approved authority | Exact contract digest, revision, run ID, host and originating conversation key are mandatory; the key may be explicitly supplied logical identity, with native session ID separately unknown. Logical identity does not prove native delivery. Viewing confers no mutation/launch authority. |
| GSD lifecycle and steering | GSD remains sole lifecycle owner. Conversation/CLI controls keep existing scope, approval, writer and safe-boundary gates. Panel has no control endpoint. |
| Operational records | Events, evidence references, model/effort and reasons may contain sensitive or attacker-authored text; validate, minimize, redact, bound and escape. |
| Credentials | Provider credentials, host authentication, startup/session bearer, launch URLs and raw auth headers never enter event journals, diagnostics, screenshots, copied tuples or source repository. |
| Observer server | Local ephemeral process reads only explicit projected data for one exact tuple. No reads from arbitrary user paths, host auth stores, original-project source trees or browser-supplied paths. |
| Browser | Authenticated observer of one tuple, with local copy/details/scroll/reconnect controls. Data cannot execute HTML, scripts, command URIs or browser task actions. |
| Local hostile sites/processes | A hostile origin can reach localhost; loopback binding alone is insufficient. A same-user process may also call the server. Remote-address, authority, origin and bearer checks are distinct controls. |
| Native adapters | Delivery capability/visible acknowledgement/cost are separate facts. Source/protocol evidence alone does not prove display inside the originating UI. |

## Data Flow

1. An explicitly requested observer is created by the existing conversation/CLI path with the full exact tuple and a finite deadline. Do not discover the latest task or silently attach to a chat. Detached task behavior stays available.
2. Read existing bounded GSD/runtime receipts through an allowlisted projector. Persist ordered replayable nonsecret event evidence in the existing external task state, with contract/revision/run/session binding. The observer does not update task lifecycle state.
3. Bind built-in HTTP explicitly to `127.0.0.1`, port 0. Use the actual assigned port to form one canonical origin. No wildcard or LAN listen, reverse proxy, tunnel, remote hostname or localhost-name alias.
4. Return a launch URL containing a cryptographically random one-time bootstrap secret in the fragment. It is a sensitive local handoff, not durable progress evidence. Do not put it in command arguments, structured logs, task records or analytics. Any terminal handoff is explicitly treated as secret-bearing and excluded from retained diagnostics.
5. Static same-origin JavaScript removes the fragment with history.replaceState before any asynchronous work, retains the bootstrap in memory only, and exchanges it using Authorization on the fixed same-origin session endpoint. The server returns a separate session bearer bound to the tuple/deadline. Persist only that exchanged bearer, expected exact binding and expiry in sessionStorage, scoped to this origin including its assigned port. Raw tokens never return in errors. The bootstrap expires in 120 seconds and becomes unusable after successful exchange; it is never written to storage.
6. Fetch snapshot then authenticated fetch-stream SSE after its cursor, with the session bearer in Authorization. Routine reload restores the sessionStorage entry, validates its schema and the server-returned binding, and resumes within the same server TTL. Clear storage on authentication failure, binding mismatch or expiry; client time/storage cannot extend server expiry. No EventSource token query, cookie, localStorage, URL credentials, service worker or external asset is needed. If sessionStorage is denied, retain credentials in memory and visibly warn that reload will require a fresh observer URL. Expired/lost credentials require a fresh observer launch link; this never restarts or reapproves the task.
7. Dispose the observer at its finite deadline or explicit observer close. Final confirmed information remains in the loaded DOM and durable task evidence. Ending observation is not stopping the underlying task.

Current acceptance deliberately uses sessionStorage so a normal F5 does not require a new model/conversation interaction. The exchanged bearer is script-readable within this exact origin; this is an accepted usability/security tradeoff, mitigated by fixed text-only rendering, strict CSP, no third-party assets and a short authoritative server TTL. Storage contents are untrusted input, not an authority source. Implementation may provide a reviewed cookie design later only after revising this threat model. Bearer-only fetch prevents browser ambient cookies from authorizing requests; do not add a cookie fallback silently.

## Route and Authentication Contract

| Route class | Allowed method / behavior |
|-------------|---------------------------|
| Fixed static document, script, stylesheet | GET/HEAD only; no operational data embedded; fixed in-memory/build-owned asset map, not a filesystem path join. |
| Session exchange | POST only; exact Origin plus bootstrap Authorization; body <=4KiB; single-use atomic exchange; session bearer returned in no-store JSON. It creates viewer credentials only, never task state. |
| Bound snapshot | GET only; valid session Authorization and bound session; fixed projected JSON schema <=256KiB. |
| Bound events | GET only; valid session Authorization; bounded integer cursor scoped to the binding; fetch SSE stream. No supplied digest/path may select a different record tree. |
| Any task mutation, exec, approval, restart, arbitrary file/evidence path | Absent; fail closed with 404/405. OPTIONS does not grant CORS access. |

All requests must have the exact canonical `Host: 127.0.0.1:<assigned port>`; reject missing, duplicate, alternate, forwarded or absolute-form authority rather than trusting proxy headers. Remote address must be loopback; no bind-address configuration accepts remote interfaces. Reject any supplied Origin other than the exact canonical origin and reject `null`. Session exchange always requires exact Origin. Same-origin GET fetch may omit Origin; those requests still require the nonambient bearer and must reject Sec-Fetch-Site cross-site where supplied. Fetch metadata is additional evidence, not authentication. Do not reflect Origin or enable Access-Control-Allow-Origin.

Use at least 256 random bits per bootstrap/session bearer from node:crypto; constant-time comparison of equal-length token digests; reject malformed headers before comparison. Session token expires no later than the observer deadline (30-minute default), and is never shared across observers, revisions or runs. Impose a small total session limit (4 active sessions) and do not extend expiry on heartbeats/reconnect. A new observer requires the existing explicit CLI/conversation path, not a browser endpoint.

Apply to every response: `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, and CSP `default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'none'; font-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'`. Also send `X-Frame-Options: DENY`. No inline handler/script, eval, dynamically loaded URL or external font. Do not embed operational JSON into executable script. Protocol errors use bounded generic messages without headers, tokens, state paths or raw record text.

## Threats, Controls and Verification

| ID | Threat / consequence | Required control | Credential-free fixture evidence |
|----|----------------------|------------------|----------------------------------|
| TM-01 | DNS rebinding or hostile site reads localhost task data | Explicit IPv4 loopback bind; exact Host/Origin; bearer auth; no CORS; no proxy trust | Foreign/missing/duplicate Host, foreign/null Origin, cross-site metadata and absent bearer are rejected; valid same-origin read succeeds. |
| TM-02 | Startup/session secret leaks through URL logs, history, referrer, copied text or cache | Fragment startup only; immediate history replacement; origin-and-port-scoped sessionStorage for exchanged bearer only; no-store/referrer policy; redacted logs; copy tuple excludes auth | Inspect request URL, SSE payloads, diagnostics, task records and clipboard for fixture secret; fragment removed before first fetch; used/expired bootstrap rejected; normal reload works until server TTL; auth failure/expiry clears storage; a different origin/port cannot read the entry. |
| TM-03 | CSRF or read panel accidentally controls execution | No browser mutation routes; nonambient Authorization; POST exchange exact Origin; allowlisted methods/paths | Requests for cancel/resume/approve/steer/exec/file and unrecognized methods cannot reach task APIs; no task writes occur. |
| TM-04 | Stored/reflected XSS through task title, model, reason, evidence or terminal escapes | Validate schema; render with textContent/createTextNode; no innerHTML/Markdown/ANSI rendering; control-character sanitization; strict CSP | Payloads containing tags, event handlers, SVG, closing-script text, javascript/file URIs and ANSI/bidi controls render inertly or visibly escaped; no external request or execution. |
| TM-05 | Cross-run data or authority confusion | Server frozen to full tuple; per-event validation; explicit run cursor; no latest fallback; fail closed before rendering mismatch | Two runs/revisions/sessions concurrent; swapped bearer, record and cursor cannot expose the other binding; mismatch shows explicit error. |
| TM-06 | Arbitrary file disclosure / traversal / symlink escape | Fixed asset map; allowlisted projected evidence IDs; existing root/symlink/bounded-read helpers; no path from browser | Encoded traversal, absolute Windows/UNC/POSIX paths, symlink/reparse escape, evidence ID pretending to be a path and oversized record all fail closed. |
| TM-07 | Event replay gaps, duplicates or reordering create false claims | Monotone tuple-scoped sequence; initial snapshot cursor; bounded replay; duplicate identity check; explicit reset/gap; evidence preserved | Same event replayed once in DOM; concurrent snapshot/event not lost; conflicting sequence fails; evicted cursor displays gap and snapshot, not continuous invented history. |
| TM-08 | Unbounded SSE/client buffering drains memory or pins runtime | Client/session/byte/event limits; write backpressure; finite drain and response lifetime; bounded ring/DOM; no model timers | Slow reader and client flood hit limits; queue never grows beyond budget; expired/disconnected clients remove listeners; no runner blockage. |
| TM-09 | Liveness/heartbeat is misrepresented as work or completion | Separate lifecycle, last meaningful activity, process observation and panel transport; terminal close proof remains explicit | Alive child with heartbeat-only stream produces no progress event/percent; disconnect does not claim task failed; unresolved process stays unresolved. |
| TM-10 | Native alert silently wakes inference, bills, or claims universal delivery | Capability negotiation; route-specific source/fixture/UI proof; inference/unknown routes disabled; transport receipt distinct from visible receipt | Native host fixtures cover supported/unverified/unsupported/unavailable/failure and receipt levels without provider requests; unknown does not turn into success. |
| TM-11 | Forged steering becomes applied or bypasses contract approval | Browser read-only; only project existing durable dispositions; GSD safe-boundary receipt required; new scope/model/root/budget requires revision | Received/deferred/rejected events cannot render applied; application requires matching safe-boundary evidence; browser cannot create steering. |
| TM-12 | Observer shutdown leaks sockets/watchers/timers or kills the task | Track all clients/subscriptions; bounded idempotent dispose; close listener then end clients and force cleanup within deadline; no process-kill authority | Disconnect, terminal result, deadline, AbortSignal and injected server error dispose exactly once; runner remains unaffected; no open handles. |
| TM-13 | Raw evidence leaks secrets, private roots or hidden reasoning | Project minimal allowlisted fields; existing redaction plus token/header protection; bounded summaries; recorded brief reason only | Fixture credentials, auth headers, observer tokens and private absolute paths do not appear in panel/JSON/errors/logs; unknown values remain unknown. |

## Finite Resource Defaults

| Resource | Bound |
|----------|-------|
| Observer/session lifetime | 30 minutes by default; must be finite and cannot exceed explicitly supplied observer deadline |
| Bootstrap | 120 seconds, single-use; 4 active session credentials maximum |
| Header parsing | maxHeaderSize 8KiB, maxHeadersCount 32; headersTimeout 5 seconds; requestTimeout 10 seconds; connectionsCheckingInterval 1 second |
| Accepted sockets | 8 simultaneous sockets; reject excess; no upgrades, WebSocket or HTTP/2 |
| Session exchange body | 4KiB maximum; reject content length and streaming overflow; finite read deadline |
| SSE clients | 4 authenticated clients maximum per observer |
| Event payload | 8KiB UTF-8 serialized maximum; bounded reason/evidence fields; truncate with explicit marker before delivery |
| Snapshot | 256KiB serialized maximum; reject or project bounded subset with explicit truncation |
| Replay | <=250 records and <=256KiB per response; ring <=1000 records and <=2MiB |
| Client pending output | <=64KiB application pending bytes; stop producing to that client after response.write false; drain wait <=5 seconds, then disconnect and require replay |
| Heartbeat / frame timeout | 15-second non-progress heartbeat; 35-second no-frame disconnection threshold |
| SSE response lifetime | 60 seconds maximum; controlled rotation only while session/observer remains valid |
| Browser failure retry | 3 retries at 1, 2 and 4 seconds; authentication/mismatch never auto-retry; explicit click can begin another bounded set within deadline |
| Invalid auth flood | At most 10 rejected auth/exchange attempts per 60 seconds per observer before bounded 429 response; no unbounded per-origin/IP map |
| Browser DOM | 200 recent rows maximum, with visible truncation and focus-safe eviction |
| Terminal / cleanup | Terminal delivery grace <=60 seconds within observer deadline; cleanup <=2 seconds |

These are required finite defaults. Implementation may choose stricter bounds. Any larger bound must be finite, named, justified and tested. Record retention is governed by existing task policy; an SSE ring is not the durable audit store. Do not rewrite or silently truncate source evidence when projecting a panel summary.

HTTP request timeouts cover request receipt, not lifetime of an active SSE response; use an explicit stream/observer deadline. Track response close and AbortSignal paths. After response.write returns false, stop client production until drain or timeout; a kernel write callback is not proof of browser display. On disposal call server.close before forcefully closing active HTTP connections, clear timers and remove filesystem/event subscriptions. Node 24 API grounding: [HTTP response/write and close behavior](https://nodejs.org/docs/latest-v24.x/api/http.html), [explicit bind host behavior](https://nodejs.org/docs/latest-v24.x/api/net.html#serverlisten), queried via Context7 on 2026-10-31.

## Residual Risks and Release Disposition

- A compromised same-user machine/browser extension/debugger can steal memory/sessionStorage tokens or task records; any successful same-origin XSS could read the stored session bearer. Origin-and-port-scoped storage improves reload UX but is not a secrets vault. Loopback authentication does not replace OS isolation. Do not advertise the observer as a multi-user or remote security boundary. Session restoration by the browser cannot extend authoritative server expiry.
- A fragment launch link can remain in the initiating terminal/chat before removal in the browser. Limit lifetime and one-time exchange; never include it in durable task diagnostics. Anyone possessing a fresh link during its validity may observe that one run.
- Background-tab suspension can delay heartbeat detection and rendering. Show last observed time and revalidate on focus; do not infer current task state from elapsed time alone.
- Browser delivery/rendering and native host display require actual UI evidence. Node source/protocol fixtures prove only their documented layer. Missing authorized visual verification remains a release checkpoint, not a pass.
- This research changes only planning artifacts. No paid inference canary, host installation, global install, credentials inspection, original Oh-My-Circuit mutation or automatic resume is authorized or required.

## Verification Gate

Implementation must provide deterministic isolated server/projector/renderer fixtures for TM-01 through TM-13, targeted type/runtime checks, final full regression and independent review. Visual QA is specified in 26-UI-SPEC.md and must record real evidence or remain unverified. The parent GSD planner assigns tests and file ownership; this document neither runs execution nor marks SESSION requirements complete.
