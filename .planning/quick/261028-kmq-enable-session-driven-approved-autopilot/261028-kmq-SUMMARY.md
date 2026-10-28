---
quick: 261028-kmq
status: incomplete
---

# Session-driven autopilot launch

Product commit: `791f833`.

The initiating conversation can now invoke existing preview/approve/start tools after explicit authorization of the displayed exact contract. Approve and start remain sequential commands. Approval alone never implies start; failed approval prevents start. Roles preserve explicit controller/executor/reviewer harness/model assignments. Inline task implementation, UI model switching and silent model fallback remain prohibited. Missing process support is an explicit host limitation, not an unconditional manual handoff.

Updated task skill, five-target stable hashes, project governance and English/Korean README. Delivered the owned skill using journaled CLI sync to Antigravity, Codex, Claude, Pi and Hermes; Pi shares Codex's destination. Antigravity and Codex subsequent plans report `current`, hash `e1ff8c10a852eded09b4829ed2a6ed4b0f7a985de756b27f867b07311d405b36`.

Verification: `npm run check`, `npm run build:check`, and `git diff --check` passed. Focused five-file run: 27 tests, 26 passed, 1 failed. Task skill contract/ordering/consent tracer, governance, five-target delivery canary and cross-harness exact model dispatch all passed. The failure requires package version 0.4.5 but the unchanged repository package/version lock is 0.4.6. Computer-use policy failed in the concurrent full run but passed in the focused run; root cause is unconfirmed. No product runtime, package version, or failing test was changed.

Full suite: started via `npm test`, log `full-suite.log` (ignored), process session `87002`; not yet complete at this checkpoint. Focused log `focused.log` (ignored), completed exit 1 due solely to the version assertion. Do not claim the full suite green. Resume with the retained process handle and record final totals/failures before closing verification.

No paid live autopilot task or actual new worker-model invocation was performed; fixture/native canary results are not proof of a live multi-model AGY task. Existing sessions may retain old loaded instructions; reload or use a fresh session. No publish, release or push performed.
