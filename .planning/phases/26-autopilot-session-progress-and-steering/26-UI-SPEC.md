---
phase: "26"
slug: "autopilot-session-progress-and-steering"
status: draft
shadcn_initialized: false
preset: none
created: "2026-10-31"
---

# Phase 26 — UI Design Contract

Canonical contract for the Korean common progress panel. This is a read-only projection of GSD/runtime evidence; the initiating conversation retains questions and steering. Approval of this document does not prove native host delivery or authorize a task restart.

## Sources and Scope

| Source | Decisions used |
|--------|----------------|
| 26-CONTEXT.md, locked decisions | Common panel approved 2026-10-31; exact binding; observed progress; five hosts; optional verified alerts; existing conversation controls; detached compatibility; no model timers or paid canaries |
| 26-RESEARCH.md | Deterministic ordered projection; honest host capability differences; bounded evidence; safe-boundary steering; native UI proof distinct from protocol evidence |
| REQUIREMENTS.md SESSION-01 through SESSION-06 | Lifecycle, binding, delivery, steering, redaction, finite observation, and fixture/independent-review acceptance |
| AGENTS.md and package.json | Node >=24; TypeScript CLI with built-in Node APIs; no new frontend dependency; secrets excluded from artifacts |
| Existing src/core/task-runtime.ts and task-telemetry.ts | Dispatch/process evidence and actual model/effort fields; missing telemetry remains unknown, including cost |
| Researcher defaults | Tokens, layout, Korean copy, browser-only viewing controls, finite transport limits below |

No extra user questions are needed: essential product scope is locked. This phase does not initialize a frontend framework, change packages, install host plugins, or expose browser task mutations.

## Design System

| Property | Value |
|----------|-------|
| Tool | none |
| Preset | not applicable |
| Component library | none; semantic HTML and small owned CSS/JavaScript served by Node built-in HTTP |
| Icon library | none; text labels carry every status; optional decorative CSS markers are aria-hidden |
| Font | system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "Malgun Gothic", sans-serif; identifiers use ui-monospace, monospace |

Detection: `rg --files -g '*components.json' -g '*tailwind*' -g '*.css' -g 'package.json'` returned package.json only; package.json contains no React, Next, Vite, styling, or component framework. No project skill directories were present and `query agent-skills gsd-ui-researcher --skills-only` returned no configured skills. shadcn initialization and installed-component enumeration are not applicable. No component inventory is asserted.

## Spacing Scale

| Token | Value | Usage |
|-------|-------|-------|
| xs | 4px | Inline label gap |
| sm | 8px | Metadata and controls gap |
| md | 16px | Card padding; mobile outer gutter |
| lg | 24px | Desktop outer gutter; section gap |
| xl | 32px | Page top/bottom padding |
| 2xl | 48px | Header-to-main maximum separation |
| 3xl | 64px | Empty-state vertical padding |

Controls have a minimum 44px height and 44px touch target. Borders are 1px; focus outline is 2px with 4px offset. These are control/stroke dimensions, not extra spacing tokens. Card radius is 8px. No shadows, gradients, decorative illustrations, or animated loaders.

## Typography

Exactly four font sizes and two weights, including identifiers and status pills:

| Role | Size | Weight | Line Height |
|------|------|--------|-------------|
| Body | 16px | 400 | 1.5 |
| Label / metadata / identifier | 14px | 400 or 600 for label | 1.5 |
| Heading | 20px | 600 | 1.2 |
| Display / page title | 28px | 600 | 1.2 |

Use rem equivalents from a 16px root. Preserve browser zoom. The only weights are 400 and 600. Korean prose uses keep-all where practical and overflow-wrap:anywhere for identifiers. No status relies on capitalization, color, or a tooltip alone.

## Color

| Role | Value | Usage |
|------|-------|-------|
| Dominant (60%) | #F8FAFC | Page canvas and empty space |
| Secondary (30%) | #FFFFFF | Overview, timeline, capability and evidence cards |
| Accent (10% maximum) | #1D4ED8 | Primary copy button, reconnect button, keyboard focus, new-event indicator, needs-input emphasis |
| Destructive | #991B1B | Reserved for a future explicitly approved destructive action; unused in this read-only panel |
| Primary text | #1F2937 | All body/status text on light surfaces |
| Secondary text | #475569 | Timestamps, explanations, unavailable fields |
| Control border | #64748B | Interactive boundaries on white/light background |

The 60/30/10 allocation describes visual hierarchy; do not add blue decoration to fill a quota. Accent is reserved for the named elements only. Failed, complete, disconnected and unsupported states use explicit text and an outlined marker, not a red/green-only distinction. White text on the accent button is permitted; every text pair must measure >=4.5:1 and control/focus boundaries >=3:1. No dark-mode toggle in this phase.

## Layout and Information Hierarchy

Use `<html lang="ko">`, a skip link, one h1, header, main, labelled sections and footer. Page max-width is 1120px. At >=800px use a main timeline column and a 320px side column with 24px gap; below 800px use one column in this order: binding, current observation, action-required notice, timeline, native delivery, evidence, conversation guidance. At 320px and 200% zoom, text reflows without page-level horizontal scrolling.

1. Header: `오토파일럿 진행 상황`, textual connection badge and `실행 정보 복사` button.
2. Binding strip: task title, workflow kind (actual quick/full/dedicated/unknown), host, shortened contract digest and revision, run ID, and originating session. Native details/summary `실행 식별 정보` reveals the full exact tuple. Every field is selectable and wraps. The title is not an identifier.
3. Current observation card: recorded lifecycle state and step, role, actual model, actual effort, outcome, concise recorded reason, evidence IDs, last meaningful activity timestamp, independent process observation, and panel transport timestamp.
4. Action-required notice when applicable, placed before timeline. It states what is needed and routes the user to the initiating conversation; it cannot submit, approve, resume, cancel or steer.
5. Timeline: ordered list, oldest to newest, of meaningful observed events. Each row contains local timestamp with ISO datetime, sequence, step, role/model/effort, result, brief recorded reason and evidence IDs. Local timezone is named; ISO time is available in details.
6. Delivery card: shared panel connection and separate native capability/delivery facts for all five hosts. Only the bound host can be active; other rows describe supported/unknown capability, never another task's status.
7. Evidence card: sanitized bounded summaries keyed by approved evidence IDs. No arbitrary file browser, source-file links, full transcripts, rendered Markdown, executable commands or external URLs.
8. Footer: `질문과 조정 요청은 이 실행을 시작한 대화에서 보내세요.` and `패널 닫기는 작업 중단 요청이 아닙니다.`

## Observation and Interaction Contract

| Concern | Required behavior |
|---------|-------------------|
| Binding | Every snapshot/event has contract digest + revision + run ID + host + originating session ID; client and server reject mismatches and stop the stream. Originating session may be an explicitly supplied opaque logical conversation key; label that as `논리 대화 식별자` and show native session ID separately as unknown when unavailable. A logical key does not prove native delivery. Never select latest or fall through to another run. An absent required origin key cannot establish an authenticated observer. |
| Actual workflow | Render the observed lifecycle label/step. Do not manufacture milestones for quick mode or map every workflow into a full phase tree. |
| Model and effort | Actual receipt values only. If configured and observed values differ, show both with labels `설정` and `관측`; missing observed model/effort is `확인되지 않음`. Do not substitute a policy alias. |
| Meaningful progress | New lifecycle transitions, dispatch start/end, observed outcome, evidence receipt, recorded decision, needs-input, steering disposition and terminal state are eligible. Heartbeats, clock ticks, file mtime and repeated unchanged status are not progress events. No percentage, ETA or invented counters. |
| Reason | Show the short reason already recorded by the responsible process. Missing is `기록된 사유 없음`; do not synthesize an explanation or reveal hidden reasoning. |
| Last activity | Show last meaningful event time, separate from `연결 확인` and `프로세스 관측`. A heartbeat updates transport only. No recent activity does not establish a hung task. |
| Process truth | Render alive, terminated with confirmed close, possibly alive, or unknown with observation time. Alive is not advancing; lost connection is not task failure; terminal status without close proof retains `프로세스 종료 확인 안 됨`. |
| Steering | When recorded, show `접수됨`, `검토 중`, `보류됨`, `거절됨`, `적용됨` separately with receipt ID and recorded reason. Receipt cannot become applied without GSD safe-boundary evidence. Revised contract approval stays in conversation/CLI. |
| Unknown usage | Optional tokens/cost appear only if already available; unavailable is `측정되지 않음`, never zero. The panel adds no pricing estimator or model call. |
| Copy | Primary button copies only the nonsecret exact binding tuple for use in the initiating conversation. Feedback `실행 정보를 복사했습니다.` No startup URL, auth token, credential, private absolute root or raw transcript is copied. Clipboard denial exposes a labelled read-only selectable text field. |
| Timeline behavior | Append without taking focus. Auto-follow only while the reader is already at the bottom and no selection/expanded row would be disrupted; otherwise show `새 활동 {N}건` to scroll on explicit activation. N counts buffered actual events. Retain a maximum 200 rendered rows; show truncation notice and preserve focused/expanded rows until focus leaves. |
| Evidence details | Native details/summary `증거 요약 보기` reveals at most the server-projected bounded text; escaping applies to every field. Evidence IDs are inert strings. |
| Pause display | Optional `자동 따라가기 끄기` changes local scrolling only and clearly says collection continues. No task lifecycle command is exposed. |

## Copywriting Contract

Braces below identify escaped data slots, not executable markup.

| Element | Copy |
|---------|------|
| Primary CTA | 실행 정보 복사 |
| Initial loading | 실행 기록을 불러오는 중입니다. |
| Empty state heading | 아직 기록된 활동이 없습니다 |
| Empty state body | 이 실행의 첫 활동이 기록되면 여기에 표시됩니다. 질문은 시작한 대화에서 보내세요. |
| Unknown field | 확인되지 않음 |
| Recorded reason absent | 기록된 사유 없음 |
| Connected | 패널 연결됨 |
| Reconnecting | 패널 연결이 끊겼습니다. 마지막 기록을 유지하며 다시 연결합니다. |
| Reconnect exhausted | 자동 재연결을 멈췄습니다. 실행 상태는 확인되지 않았습니다. 다시 연결하거나 시작한 대화에서 상태를 확인하세요. |
| Reconnect CTA | 패널 다시 연결 |
| Load error | 실행 기록을 불러오지 못했습니다. 연결을 다시 시도하거나 시작한 대화에서 확인하세요. |
| Auth expiry / missing token | 패널 접근 시간이 만료되었거나 인증 정보가 없습니다. 시작한 대화에서 이 실행의 새 패널 주소를 요청하세요. |
| Session storage unavailable | 이 브라우저에서 패널 인증 정보를 유지할 수 없습니다. 현재 탭은 계속 사용할 수 있지만 새로고침하면 새 패널 주소가 필요합니다. |
| Binding mismatch | 실행 식별 정보가 일치하지 않아 표시를 중단했습니다. 시작한 대화에서 정확한 실행을 확인하세요. |
| Needs input | 입력이 필요합니다. {recorded request}. 이 실행을 시작한 대화에서 답해주세요. |
| Failed terminal | 실행이 실패로 종료되었습니다. {recorded reason or reason-absent copy}. 시작한 대화에서 다음 조치를 확인하세요. |
| Interrupted / unresolved process | 실행 종료가 확인되지 않았습니다. 시작한 대화에서 프로세스 상태를 확인한 뒤 다음 조치를 정하세요. |
| Complete terminal | 실행이 완료되었습니다. 기록된 결과와 증거를 확인하세요. |
| Cancelled terminal | 실행 중단이 기록되었습니다. 프로세스 종료 확인 상태를 함께 확인하세요. |
| Replay gap | 일부 이전 활동을 이 패널에서 복원할 수 없습니다. 마지막 확인 기록부터 표시합니다. 전체 증거는 시작한 대화에서 확인하세요. |
| DOM truncation | 최근 200건까지 표시합니다. 이전 기록은 시작한 대화에서 확인하세요. |
| Observation deadline | 패널 관찰 시간이 끝났습니다. 마지막 기록을 표시합니다. 작업 상태 확인은 시작한 대화에서 요청하세요. |
| Native unavailable | 이 호스트의 대화 내 알림은 사용할 수 없습니다. 공통 패널에서 진행 상황을 확인하세요. |
| Native unverified | 이 호스트의 대화 내 알림 표시가 검증되지 않았습니다. |
| Native delivery failure | 대화 내 알림 전달에 실패했습니다. 공통 패널의 기록은 유지됩니다. |
| Destructive confirmation | 해당 없음. 중단·재시작·승인·파일 변경은 이 패널에서 제공하지 않습니다. |

## Connection, Replay and Delivery States

Initial loading has text and aria-busy, never simulated progress. On disconnect retain the last confirmed snapshot with its observation time and stale label. A stream heartbeat every 15 seconds can confirm transport only. After 35 seconds without any frame mark disconnected; the browser may display this late after tab suspension and must revalidate before calling the snapshot current.

Use authenticated fetch streaming SSE, not a token-bearing EventSource URL. Each event has a strictly increasing sequence scoped to the exact tuple. Snapshot includes its cursor; replay starts after that cursor, so events during initial load are not lost. Deduplicate identical sequence+content; conflicting reuse or malformed/out-of-binding data fails closed. A missing sequence or evicted cursor requires an explicit gap/reset event and a fresh snapshot, never an invented continuous timeline.

Routine reload restores the exchanged session bearer, expected exact binding and expiry from sessionStorage, scoped by the browser to the exact origin including port. Validate the restored tuple against the authenticated server snapshot; storage never selects a different server run. Clear the stored value on auth failure, expiry or binding mismatch. Initial fragment bootstrap is exchanged only once and removed from browser history; it is never stored. No cookies or localStorage. Server expiry remains authoritative, so reload neither extends access nor requires a model/conversation request while the session remains valid. If sessionStorage is unavailable, use memory-only credentials and show the explicit storage-unavailable warning before reload; expired or lost credentials require a fresh observer URL without task restart.

One SSE response lasts at most 60 seconds; orderly rotation is transport upkeep, not a progress event. Failed connection retries occur after 1, 2 and 4 seconds, then stop with the reconnect CTA. Successful validated snapshot/stream establishment resets the retry budget. A click allows another bounded attempt set within the original observation deadline. Authentication/mismatch failures do not retry automatically. Observation deadline defaults to 30 minutes, cannot exceed an explicitly provided finite observer deadline, and is visible in binding details. Expiry does not stop or restart the underlying task. A terminal snapshot remains visible after transport closes; terminal status must come from actual evidence.

Native delivery status must show these independent facts: availability/verification; passive visible UI versus queued model context; whether delivery may wake a model; required plugin/flag and whether present; last delivery attempt/outcome; acknowledgement level (transport accepted, visible receipt, or unknown). Sending bytes is not visible acknowledgement. Inference-triggering or unknown-cost routes remain disabled unless separately authorized; a reporting timer never invokes a model.

Research baselines: Pi has source-supported extension rendering requiring enabled extension and UI validation; Hermes differs by classic CLI/TUI/Desktop/messaging adapter; Claude channels are preview/policy dependent and may feed model context; Codex has fixture/source command-item evidence but no originating-UI proof; Antigravity has no verified public idle display route. Display unverified until the exact installed route has evidence. These are capability statements, not automatic activation permission.

## Accessibility and Responsive Behavior

- Native buttons, details/summary, lists and labels; logical tab order follows DOM order. Every control is keyboard reachable with visible 2px focus. No keyboard trap, hover-only disclosure or focus stealing on events/reconnect.
- One polite live region announces meaningful state changes and aggregate new-event counts, deduplicated. It excludes heartbeat/timestamp churn and the entire growing timeline. A newly observed needs-input or terminal failure gets one concise announcement, not repeated interruptions. Status semantics follow [WCAG status-message guidance](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html).
- Verify contrast numerically against [WCAG minimum contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html); color never supplies the only cue. Honor forced colors and prefers-reduced-motion. No continuous animation.
- 320px viewport, landscape, 200% zoom, long Korean text and 128-character identifiers must remain usable. IDs wrap; detailed preformatted evidence may scroll inside its labelled container. No fixed-height clipping; no fixed overlay hides controls.
- Keep item identity stable across incremental updates. Empty/one/many lists have the same section heading; one event is a single list item, not a special celebratory layout.

## UI Considerations

Applicable state considerations resolved: 12 explicit covered rows, 0 backstop, 0 unresolved. These are design requirements, not claims that implementation tests have passed.

| Category | Element(s) | Status | Resolution / Reason |
|----------|------------|--------|---------------------|
| empty | Timeline list-collection | ✅ covered | Zero rows uses the empty heading/body above and no placeholder milestones. |
| loading | Snapshot list-collection and reconnect interactive-control | ✅ covered | Initial loading uses aria-busy and documented text; reconnection keeps last confirmed content with stale timestamp. |
| error | Snapshot list-collection and reconnect interactive-control | ✅ covered | Distinct load/auth/mismatch/disconnect copy; retry only for recoverable errors; no run fallback. |
| populated | Timeline list-collection | ✅ covered | Chronological observed events include sequence, time, step, model/effort, result, recorded reason and evidence. |
| partial | Overview static-content and timeline list-collection | ✅ covered | Missing fields show unknown/reason-absent labels; retained partial records cannot assert completion or continuous replay. |
| overflow | Timeline list-collection | ✅ covered | DOM limited to 200 with explicit truncation notice and stable focused row; no infinite unbounded append. |
| zero-one-many | Timeline list-collection | ✅ covered | Zero uses empty copy, one one item, many ordered rows; count labels reflect actual retained/new events. |
| long-text | Binding and evidence static-content | ✅ covered | Wrap long IDs and Korean text; use bounded evidence details and local preformatted scrolling only when essential. |
| loading | Copy interactive-control | ✅ covered | Copy is disabled until a validated tuple exists; feedback follows actual clipboard outcome, with selectable fallback. |
| error | Copy interactive-control | ✅ covered | Clipboard failure exposes labelled read-only text, never falsely claims success. |
| overflow | Delivery list-collection | ✅ covered | All five host capability rows stack on mobile; descriptions wrap and no horizontal host matrix is required. |
| long-text | Buttons interactive-control | ✅ covered | Labels wrap and controls grow above 44px; no ellipsis or hidden action label. |

Media/form/navigation-specific loading and empty states are dismissed: no media, data-entry form, route navigation or tabbed host selector exists. The skip link is static in-page navigation.

## Browser Boundary and Resource Contract

The normative threat model is [26-THREAT-MODEL.md](26-THREAT-MODEL.md). Default implementation: one ephemeral server per exact observer binding, listening on 127.0.0.1 at an OS-assigned port, fixed allowlisted routes/assets, no external assets or network calls. No wildcard listen or authentication in query strings. The startup fragment token is exchanged for a short-lived bearer retained in origin-and-port-scoped sessionStorage for normal reload; browser task mutations and ambient session cookies are absent. This explicitly accepts same-origin-script access to the session bearer; strict CSP, text-only rendering, short server TTL and no external assets reduce that risk.

Required finite limits: 4 concurrent authenticated SSE clients; event <=8KiB; snapshot <=256KiB; replay <=250 events and <=256KiB per response; replay ring <=1000 events and <=2MiB; pending output <=64KiB per client with <=5-second drain wait; retained DOM <=200 rows; session/observer deadline <=30 minutes by default. Larger finite policy-approved settings require explicit named configuration and tests; no unbounded setting. Terminal results have up to 60 seconds to reach clients within the observer deadline. Shutdown removes listeners/watchers/timers and ends or destroys SSE connections within 2 seconds. Closing the observer never claims to cancel the task.

Node transport grounding: [Node 24 HTTP](https://nodejs.org/docs/latest-v24.x/api/http.html) documents write backpressure, response close and HTTP connection cleanup; [Node 24 net](https://nodejs.org/docs/latest-v24.x/api/net.html#serverlisten) documents explicit host binding. This contract sets its own limits rather than relying on defaults.

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| none | none | Not applicable: no shadcn, third-party blocks, CDN assets or frontend package installation |

## Fixture and Visual QA Acceptance

Paid-call-free deterministic fixtures must cover: zero/one/200/>200 events; Korean and long IDs; absent model/effort/reason/usage; real quick versus full/dedicated labels; needs-input/failure/interrupted/cancelled/complete; alive without new activity; lost panel stream while task continues; routine reload with an unexpired sessionStorage bearer; denied storage fallback; auth expiry clearing storage; origin/port and binding isolation; replay gap/duplicate/conflict; two concurrent exact bindings; every native capability/acknowledgement state; steering receipt versus application; clipboard denial; and HTML/script/ANSI/control-character strings displayed inertly. Security fixtures are specified in the threat model.

Visual acceptance uses a credential-free local fixture only. Record screenshots/evidence at 1280x800 and 390x844, plus reflow at 320px and 200% zoom; verify keyboard-only traversal, focus preservation during event append, readable contrast, copied nonsecret tuple, reconnect messaging, and no invented progress during heartbeat-only intervals. Use an authorized verified GUI runtime or explicit manual verification checkpoint; source inspection and protocol tests cannot substitute for visual QA. Record actual tool/evidence IDs and outcomes. If GUI verification is unavailable, leave visual acceptance unverified and hand it to the parent GSD verifier; do not add a paid host canary.

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS
- [ ] Dimension 2 Visuals: PASS
- [ ] Dimension 3 Color: PASS
- [ ] Dimension 4 Typography: PASS
- [ ] Dimension 5 Spacing: PASS
- [ ] Dimension 6 Registry Safety: PASS
- [ ] Dimension 7 Inventory Provenance: PASS (not applicable: Tool none)

**Approval:** pending
