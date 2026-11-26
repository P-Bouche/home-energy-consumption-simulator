# UX mission prompts

Source: UX audit `docs/audits/2026-11-21-ux-audit.md` (11 user stories, backlog §"Prioritized backlog") and UI/3D visual audit `docs/audits/2026-11-21-ui-3d-audit.md` (PR #24). Both audits are merged; read them before starting any mission.

## Wave 1 — merged 2026-11-22

| Mission | Issue | Prompt file | Branch | Audit items | Owns (files) |
| --- | --- | --- | --- | --- | --- |
| A1 — workspace shell (tabs, primary action, Synthèse) | #26 (closed) | `wave1-A1-workspace-tabs.md` | `feat/web-workspace-shell` | UX US 2, 3 | `apps/web/src/App.tsx`, `apps/web/src/pages/UploadPage.tsx` (layout only — the success-alert line stays byte-identical, A2 owns its text), `apps/web/src/components/SimulationPanel.tsx`, new workspace component, new `apps/web/src/services/confidence-words.ts` |
| A2 — collapsed report, copy hygiene, theme | #27 (closed) | `wave1-A2-report-theme.md` | `feat/web-report-and-theme` | UX US 6, 11 + UI F1, F2 | new `apps/web/src/theme.ts`, `apps/web/src/components/ImportReportView.tsx`, the alert line in `UploadPage.tsx`, the « (P5) » title in `apps/web/src/components/ScenarioPanel.tsx`, new `BuildingLabel` component |
| B — plain-language editor, level S | #28 (closed) | `wave1-B-editor-plain-language.md` | `feat/web-editor-plain-language` | UX US 1 (level S), 8, 9 | `packages/open3cl-adapter/src/enum-labels.ts` (new, data-only) + additive export + one additive API endpoint, `apps/web` editor/catalog/enum service, e2e `building-editor.spec.ts` |
| C — 3D visual pass | #29 (closed) | `wave1-C-3d-visual-pass.md` | `feat/web-3d-visual-pass` | UX US 5 (visual part) + UI F8–F12 | `packages/geometry/src/three-adapter.ts`, `apps/web` viewer files (`ViewerPage`, `BuildingModel`, `ViewerOverlays`, `heat-loss.ts`, `view-colors.ts`, `viewer-store.ts`), e2e `viewer.spec.ts` |

**Executed merge order: A1 → A2 → B → C** (all four merged; issues #26–#29 closed).

## Wave 2 — merged 2026-11-23

| Mission | Issue | Prompt file | Branch | Audit items | Owns (files) |
| --- | --- | --- | --- | --- | --- |
| D — plain-language edit impact + confidence wording everywhere | #30 (closed) | `wave2-D-edit-impact-confidence.md` | `feat/web-edit-impact-confidence` | UX US 4, 7 / F4, F6 | `apps/web/src/components/BuildingEditorPanel.tsx`, `apps/web/src/components/ElementPanel.tsx`, the « Synthèse » panel, new shared impact/confidence components, e2e `building-editor.spec.ts` + the ElementPanel assertions of `viewer.spec.ts` |
| E — work-first scenario creation | #31 (closed) | `wave2-E-scenarios-work-first.md` | `feat/web-scenarios-work-first` | UX US 10 / F7 | `apps/web/src/components/ScenarioPanel.tsx` (comparison table untouched), new `apps/web/src/services/work-catalog.ts`, e2e `scenarios.spec.ts` |

D and E were parallel and independent; both merged 2026-11-23 (issues #30 and #31 closed).

Wave 3 — status 2026-11-26: **#32 closed 2026-11-25** (level M presets landed via PR #60; level L
**deferred** as a standing product decision — cost-band data provenance unsettled, see #32).
**#33 closed 2026-11-26** as decision-recorded (approved 2026-11-25, ADR-0005 via PR #58); its
implementation is tracked solely by **#66 (open, ready-for-agent)** — 3D geometry Class B.
Also closed outside the waves: #42 (mobile viewer/tabs), #47/#48 (level-M prerequisites),
#61, #62.

## Audit coverage status (2026-11-26)

Both audits are fully triaged: every finding maps to an issue, and all presentation-layer work is merged.

| Audit item | Issue(s) | State |
| --- | --- | --- |
| UX US 1 (blocker) — plain-language editor | #28 (level S), #32 (level M) | closed; level L deferred (product decision, #32) |
| UX US 2+3 — workspace tabs, Synthèse, primary sim action | #26 | closed 2026-11-22 |
| UX US 4+7 — edit impact, confidence wording | #30 | closed 2026-11-23 |
| UX US 5 — 3D reads as a house | #29 (visual part) + **#66** (geometry Class B) | visual merged 2026-11-22; geometry open |
| UX US 6+11 + UI F1, F2, F4, F7 — report, theme, copy | #27 | closed 2026-11-22 |
| UX US 8+9 — labeled enums, French validation | #28, #48 | closed |
| UX US 10 / F7 — work-first scenarios | #31 | closed 2026-11-23 |
| UI F3 — one long page | #26 | closed 2026-11-22 |
| UI F5 — editor row overload | #28, #30 | closed |
| UI F6 — scenario row action overload (minor) | #67 | open (needs-triage: implement or wontfix) |
| UI F8–F12 — viewer axis, void, heat-loss scale, picking, chrome | #29 | closed 2026-11-22 |
| Mobile — viewer canvas + tabs on small screens | #42 | closed 2026-11-23 |

Remaining audit-derived work as of 2026-11-26: **#66** (3D geometry Class B) plus the minor UI F6 decision (#67).

## Shared guards (in every prompt)

1. **Read `AGENTS.md` first.** Repo rules apply: strict TS, no `any`, domain purity, conventional commits, ESLint boundaries.
2. **Frozen contracts — do not change**: element ids (`<kind>-<i+1>`, ADR-0003), command payloads `building.*.update.v1`, `meshHash`/geometry inputs, cache keys, simulation port. All wave-1/wave-2 work is presentation-only over these contracts. Exception: none until the wave-3 geometry mission lands its own ADR (#33).
3. **Engine boundary (ADR-0001)**: `@open3cl/engine` may only be imported inside `packages/open3cl-adapter`. Engine enum label tables are not exported by the published 1.11.6 entry point (measured in ADR-0001) — they are vendored as static data (mission B).
4. **User guide is checked at review**: `docs/user-guide.md` quotes UI labels literally. Each mission updates only the paragraphs whose visible labels it changes (wave 1: A1 §2–3, A2 §2, B §5, C §7; wave 2: D editor § + 3D side panel, E scenario section) in the same PR. Never edit another mission's section.
5. **E2E**: keep `data-testid` attributes stable; a wave-2 mission updates the e2e specs of exactly the components it owns, leaving every other assertion untouched. Visible-label changes must update the spec in the same PR.
6. **CI fully green (6 checks)** on the PR head: Lint, Typecheck, Tests + coverage gate, E2E, Open3CL benchmark, Geometry benchmark.
7. **One PR per mission branch, left open for review — never merge yourself.** PR body lists the audit US/findings closed, evidence (screenshots in `docs/audits/assets/`, referenced), and anything deliberately left out.

**Issue linkage rule:** each mission's PR body ends with `Closes #<issue>`. All mission issues #26–#33 are closed; #66 carries the remaining Class B implementation, #67 the minor UI F6 decision.
