# alpha-AOS 0.1.0 Release Controls

Deterministic verification timestamp: `2026-09-18T00:00:00.000Z`

Each domain has an explicit positive control and a near-miss or exclusion control. Receipt hashes are SHA-256 digests over canonical, credential-free evidence objects produced by the test suite.

| Domain | Polarity | Assertion | Result | Evidence SHA-256 |
| --- | --- | --- | --- | --- |
| Optional Capability Invocation | Positive | documentation intent invokes Context7 lookup | **PASS** | `e36866d6953543248d064e282d3bdce030c44b73383e394502a6394acff0fd71` |
| Optional Capability Invocation | Negative | general algorithm task does not invoke Context7 | **PASS** | `26a9d0388171acb4dceb351e120924d6895586e92a905b465eafe6a829f3639d` |
| Project Pack Scope | Positive | matching project exposes its evidence-selected pack targets | **PASS** | `7a9038d616c2c7d38e9e921d4c3154f3f6e962e0521be5d9cbbd6dd50b2ead1f` |
| Project Pack Scope | Negative | sibling outside the canonical project exposes no pack target | **PASS** | `bdd032234d0479811033a7b66f7222177ca902770de0ce80d6db1379ae18ff17` |
| Mandatory Gate Blocking | Positive | authentication boundary blocks on security review | **PASS** | `1799b4a01b23144e82961d56fa706c18b229460842859ea87cdda416070c20f2` |
| Mandatory Gate Blocking | Negative | documentation-only change passes silently | **PASS** | `6ddb30ac68c6dfa59d5c4b82cb3558d96cc58aae93d29e73f079f13b7abcba6a` |
| Tree-Off Opt-Out | Positive | managed tree retains alpha-AOS global surfaces | **PASS** | `2d3ba7ffd577402def46ae8f565e4d240f59c573a256d3ae666bb9a79a84db7d` |
| Tree-Off Opt-Out | Negative | off tree suppresses every global customization class | **PASS** | `32138ea6b1e141e7889e3db98e76de7a44117582e0ea9ac8332d89cd41d30fdd` |

## Verification method

- Optional invocation passes only when the declared Context7 lookup sequence is observed; the ordinary-task twin records zero Context7 calls.
- Project scope passes only when repository evidence selects the API/Web pack and produces project targets; a sibling repository has neither selection nor targets.
- Mandatory gates pass the control only when an auth change blocks on `security-review`; a documentation-only change is a silent pass.
- Tree opt-out passes only when a managed tree keeps global surfaces and an `off` tree suppresses skills, MCP, hooks, instructions, and memory.

Normal test runs never write this file. Regeneration requires `UPDATE_RELEASE_CONTROLS=1` and always uses the fixed release timestamp above.
