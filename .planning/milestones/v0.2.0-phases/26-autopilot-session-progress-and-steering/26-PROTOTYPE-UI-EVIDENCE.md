# Phase 26: Prototype browser evidence (not final acceptance)

Source checkpoint: 4712a8b. Date: 2026-10-31. Fixture data only.

The parent launched installed Chrome 156.0.8078.74 in headless mode with an
isolated fixture profile. The browser used the actual local panel and DevTools
API; no user browser profile, credentials, original project or native agent
conversation was used. The transient panel capability stayed in process memory,
not browser argv. The owned browser was closed through its own Browser.close.

Actual checks passed: initial authenticated snapshot; bootstrap fragment removed;
new failed-dispatch event appeared without reloading; normal reload restored
access; 390px viewport had no horizontal overflow; Tab focused the skip link.
No JavaScript exceptions were captured. Desktop and mobile captures were viewed.

Evidence retained under `.planning/tmp/phase26-visual/`: `result.json`,
`desktop.png`, `mobile.png`; harness `.planning/tmp/phase26-browser-qa.mjs`.
These local fixture artifacts are not packaged product files or final-source
acceptance evidence. Repeat relevant UI checks after implementation settles.

Observed presentation issues to resolve during the existing UI task: raw event
and role codes dominate activity text; UTC ISO times are shown beside an
Asia/Seoul label; repeated unknown-model/effort phrases make mobile activity hard
to scan; an always-visible “선택 가능한 실행 정보” placeholder follows the copy
button. Keep precise evidence accessible in details while making actual stage,
model, outcome and recorded reason readable. Full phase/milestone labels must
come from actual GSD evidence, not invented quick workflow stages. The fixture
does not prove remaining auth/backpressure/security cases or native chat delivery.
