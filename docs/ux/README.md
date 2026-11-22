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

## Wave 2 — mission prompts (unblocked: A1 and B merged)

| Mission | Issue | Prompt file | Branch | Audit items | Owns (files) |
| --- | --- | --- | --- | --- | --- |
| D — plain-language edit impact + confidence wording everywhere | **#30** | `wave2-D-edit-impact-confidence.md` | `feat/web-edit-impact-confidence` | UX US 4, 7 / F4, F6 | `apps/web/src/components/BuildingEditorPanel.tsx`, `apps/web/src/components/ElementPanel.tsx`, the « Synthèse » panel, new shared impact/confidence components, e2e `building-editor.spec.ts` + the ElementPanel assertions of `viewer.spec.ts` |
| E — work-first scenario creation | **#31** | `wave2-E-scenarios-work-first.md` | `feat/web-scenarios-work-first` | UX US 10 / F7 | `apps/web/src/components/ScenarioPanel.tsx` (comparison table untouched), new `apps/web/src/services/work-catalog.ts`, e2e `scenarios.spec.ts` |

**Merge order: D and E are parallel and independent.** Both branch from current `main`
after this PR is merged; rebase on `main` after any merge, and never merge yourself.

Wave 3 (not started): **#32** (editor level M presets + the L decision — needs the maintainer's
real-usage validation of level S first) and **#33** (3D geometry Class B — own mini-ADR, blocked
on the maintainer's judgment of the C visual pass).

## Shared guards (in every prompt)

1. **Read `AGENTS.md` first.** Repo rules apply: strict TS, no `any`, domain purity, conventional commits, ESLint boundaries.
2. **Frozen contracts — do not change**: element ids (`<kind>-<i+1>`, ADR-0003), command payloads `building.*.update.v1`, `meshHash`/geometry inputs, cache keys, simulation port. All wave-1/wave-2 work is presentation-only over these contracts. Exception: none until the wave-3 geometry mission lands its own ADR (#33).
3. **Engine boundary (ADR-0001)**: `@open3cl/engine` may only be imported inside `packages/open3cl-adapter`. Engine enum label tables are not exported by the published 1.11.6 entry point (measured in ADR-0001) — they are vendored as static data (mission B).
4. **User guide is checked at review**: `docs/user-guide.md` quotes UI labels literally. Each mission updates only the paragraphs whose visible labels it changes (wave 1: A1 §2–3, A2 §2, B §5, C §7; wave 2: D editor § + 3D side panel, E scenario section) in the same PR. Never edit another mission's section.
5. **E2E**: keep `data-testid` attributes stable; a wave-2 mission updates the e2e specs of exactly the components it owns, leaving every other assertion untouched. Visible-label changes must update the spec in the same PR.
6. **CI fully green (6 checks)** on the PR head: Lint, Typecheck, Tests + coverage gate, E2E, Open3CL benchmark, Geometry benchmark.
7. **One PR per mission branch, left open for review — never merge yourself.** PR body lists the audit US/findings closed, evidence (screenshots in `docs/audits/assets/`, referenced), and anything deliberately left out.

**Issue linkage rule:** each mission's PR body ends with `Closes #<issue>` (D → `Closes #30`, E → `Closes #31`). Issues #32–#33 are closed by their own future PRs — this docs PR closes nothing.
