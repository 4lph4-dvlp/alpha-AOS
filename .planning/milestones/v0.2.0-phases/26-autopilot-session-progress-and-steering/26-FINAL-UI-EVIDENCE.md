# Phase 26 final browser evidence

Source: `f06872a` (subsequent changes before this record are planning artifacts only).
Date: 2026-11-01 Asia/Seoul. The isolated fixture used installed Chrome
156.0.8078.74 headless through CDP, a new private browser profile, synthetic
noncredential data and the actual compiled local panel. No existing browser
session, native provider, original project or authentication store was used.

## Observed results

- Initial authenticated snapshot, removal of bootstrap fragment, actual live SSE
  update, ordinary reload and stored session restoration passed.
- Desktop 1280x800, mobile 390x844 and narrow 320px screenshots were captured.
  Horizontal overflow checks passed at all these widths. The desktop, narrow and
  enlarged screenshots were visually inspected for Korean text and reflow.
- Needs-input remained the current work and retained its action banner after a
  live steering receipt. Receipt appeared separately in the activity history.
- Denied clipboard access exposed the selectable fallback. Copied content was
  only the exact nonsecret binding, with no bearer, URL or private root.
- Hostile HTML-shaped reason was visible as inert text; no inserted image,
  inline script, executed fixture marker or browser exception was observed.
- After 205 additional live events, there were exactly 200 rendered rows. The
  focused old row remained connected and focused. Reload restored retained
  latest history. Keyboard Tab reached the skip-to-main link.
- 200% CSS zoom reflow passed without horizontal overflow. A CDP keyboard
  attempt did **not** change native browser zoom (viewport/DPR unchanged).
  Native browser-chrome 200% zoom is therefore **unverified**, not passed.
- Browser exception collection remained empty. Owned browsers and observers
  were closed by the fixture after capture.

## Evidence and limits

Local, untracked artifacts are versioned under
`.planning/tmp/phase26-visual/f06872a-final/` and
`.planning/tmp/phase26-visual/f06872a-interactions-v2/`; each has screenshots and
`result.json`. The interaction result records 17 passing boolean checks,
`rowCount: 200`, and the native zoom attempt. These paths are review evidence,
not packaged application assets. The fixture scripts and logs are under
`.planning/tmp/phase26-final-*-qa*`.

The first interaction run's reload assertion looked for an old event that had
correctly left the bounded history. Its other checks passed. The fixture
assertion was changed to the latest retained event and the interaction run
repeated successfully; production source was unchanged.

Real browser evidence complements the deterministic protocol/DOM fixtures; it
does not prove native host chat delivery, every possible UI state, or native
browser zoom. All five native chat delivery routes remain disabled/unverified.
The full test suite and GSD goal verification are separate final gates.
